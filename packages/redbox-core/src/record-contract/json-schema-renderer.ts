import {
  escapeRecordContractPointerToken,
  recordContractPointerFromTokens,
  recordContractPointerTokens,
} from './json-pointer';
import {
  RECORD_CONTRACT_FORMAT_V1,
  type ContractCondition,
  type ContractJsonValue,
  type ContractNode,
  type ContractNodeAnnotations,
  type ContractObjectNode,
  type RecordContract,
  type RecordContractContributorIdentity,
  type RecordContractDiagnostic,
  type RecordContractPointer,
  type RecordContractPublicContext,
  type RecordContractValidationSummary,
} from './types';
import { snapshotRecordContractPublicContext } from './record-contract-context';

export const JSON_SCHEMA_DRAFT_2020_12 = 'https://json-schema.org/draft/2020-12/schema' as const;

export type RecordJsonSchemaType = 'array' | 'boolean' | 'integer' | 'null' | 'number' | 'object' | 'string';

/** The JSON Schema vocabulary emitted by the record-contract renderer. */
export interface RecordJsonSchema {
  readonly $ref?: `#/$defs/${string}`;
  readonly type?: RecordJsonSchemaType | readonly RecordJsonSchemaType[];
  readonly properties?: Readonly<Record<string, RecordJsonSchema>>;
  readonly items?: RecordJsonSchema;
  readonly additionalProperties?: boolean;
  readonly unevaluatedProperties?: boolean;
  readonly enum?: readonly (string | number | boolean | null)[];
  readonly const?: string | number | boolean | null;
  readonly required?: readonly string[];
  readonly allOf?: readonly RecordJsonSchema[];
  readonly anyOf?: readonly RecordJsonSchema[];
  readonly not?: RecordJsonSchema;
  readonly if?: RecordJsonSchema;
  readonly then?: RecordJsonSchema;
  readonly else?: RecordJsonSchema;
  readonly description?: string;
  readonly default?: ContractJsonValue;
  readonly examples?: readonly ContractJsonValue[];
  /** Contributor annotation keywords are validated before being copied here. */
  readonly [keyword: string]: unknown;
}

export interface RenderedRecordContractContext extends RecordContractPublicContext {}

export interface RenderedRecordContractValidation extends RecordContractValidationSummary {}

export interface RenderedRecordContractDiagnostic extends RecordContractDiagnostic {
  readonly contributor?: RecordContractContributorIdentity;
}

export interface RecordJsonSchemaDocument extends RecordJsonSchema {
  readonly $schema: typeof JSON_SCHEMA_DRAFT_2020_12;
  readonly type: 'object';
  readonly $defs?: Readonly<Record<string, RecordJsonSchema>>;
  readonly 'x-redbox-contract-format': typeof RECORD_CONTRACT_FORMAT_V1;
  readonly 'x-redbox-context': RenderedRecordContractContext;
  readonly 'x-redbox-completeness': RecordContract['completeness'];
  readonly 'x-redbox-validation': readonly RenderedRecordContractValidation[];
  readonly 'x-redbox-diagnostics': readonly RenderedRecordContractDiagnostic[];
}

export class RecordJsonSchemaRendererError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RecordJsonSchemaRendererError';
  }
}

interface PendingConditional {
  readonly target: RecordContractPointer;
  readonly condition: ContractCondition;
  readonly thenSchema: RecordJsonSchema;
  readonly elseSchema?: RecordJsonSchema;
}

interface ConditionalScope {
  readonly pointer: RecordContractPointer;
  readonly node: ContractObjectNode;
  readonly conditionals: PendingConditional[];
}

interface RenderState {
  readonly definitionKeys: ReadonlySet<string>;
  readonly conditionalScopes: ConditionalScope[];
  definitionBeingRendered?: string;
}

type MutableSchema = { -readonly [Key in keyof RecordJsonSchema]: RecordJsonSchema[Key] } & Record<string, unknown>;

const STANDARD_SCHEMA_KEYWORDS = new Set([
  '$anchor',
  '$comment',
  '$defs',
  '$dynamicAnchor',
  '$dynamicRef',
  '$id',
  '$ref',
  '$schema',
  '$vocabulary',
  'additionalProperties',
  'allOf',
  'anyOf',
  'const',
  'contains',
  'contentEncoding',
  'contentMediaType',
  'contentSchema',
  'default',
  'dependentRequired',
  'dependentSchemas',
  'deprecated',
  'description',
  'else',
  'enum',
  'examples',
  'exclusiveMaximum',
  'exclusiveMinimum',
  'format',
  'if',
  'items',
  'maxContains',
  'maximum',
  'maxItems',
  'maxLength',
  'maxProperties',
  'minContains',
  'minimum',
  'minItems',
  'minLength',
  'minProperties',
  'multipleOf',
  'not',
  'oneOf',
  'pattern',
  'patternProperties',
  'prefixItems',
  'properties',
  'propertyNames',
  'readOnly',
  'required',
  'then',
  'title',
  'type',
  'unevaluatedItems',
  'unevaluatedProperties',
  'uniqueItems',
  'writeOnly',
]);

const CONTRACT_ANNOTATION_KEYWORDS = new Set([
  'x-redbox-completeness',
  'x-redbox-context',
  'x-redbox-contract-format',
  'x-redbox-diagnostics',
  'x-redbox-validation',
]);

// AJV accepts extension keywords only in this identifier grammar. Keeping the
// renderer aligned avoids a document that meta-validates but cannot compile.
const CONTRIBUTOR_ANNOTATION_KEY = /^(?:x-[A-Za-z0-9_$:-]+|[A-Za-z_$][A-Za-z0-9_$:-]*:[A-Za-z0-9_$:-]+)$/;

function compareJsonPrimitive(left: string | number | boolean | null, right: string | number | boolean | null): number {
  const leftKey = `${left === null ? 'null' : typeof left}:${JSON.stringify(left)}`;
  const rightKey = `${right === null ? 'null' : typeof right}:${JSON.stringify(right)}`;
  return leftKey.localeCompare(rightKey);
}

function uniqueSortedPrimitives(
  values: readonly (string | number | boolean | null)[]
): Array<string | number | boolean | null> {
  const byIdentity = new Map<string, string | number | boolean | null>();
  for (const value of values) {
    byIdentity.set(`${value === null ? 'null' : typeof value}:${JSON.stringify(value)}`, value);
  }
  return [...byIdentity.values()].sort(compareJsonPrimitive);
}

function cloneJsonPrimitive(value: unknown): string | number | boolean | null {
  const cloned = cloneJsonValue(value);
  if (cloned !== null && typeof cloned === 'object') {
    throw new RecordJsonSchemaRendererError('Record-contract conditions must contain only JSON primitive values.');
  }
  return cloned;
}

function localDefinitionReference(key: string): `#/$defs/${string}` {
  return `#/$defs/${encodeURIComponent(escapeRecordContractPointerToken(key))}`;
}

function sortedUniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function cloneJsonValue(value: unknown, ancestors = new Set<object>()): ContractJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new RecordJsonSchemaRendererError('Record-contract annotations must contain finite numbers.');
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw new RecordJsonSchemaRendererError('Record-contract annotations must contain only JSON values.');
  }
  if (ancestors.has(value)) {
    throw new RecordJsonSchemaRendererError('Record-contract annotations must not contain cycles.');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map(item => cloneJsonValue(item, ancestors));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new RecordJsonSchemaRendererError('Record-contract annotations must be plain JSON objects.');
    }
    const objectValue = value as Readonly<Record<string, unknown>>;
    return Object.fromEntries(
      Object.keys(objectValue)
        .sort((left, right) => left.localeCompare(right))
        .map(key => [key, cloneJsonValue(objectValue[key], ancestors)])
    );
  } finally {
    ancestors.delete(value);
  }
}

function addAnnotations(schema: MutableSchema, annotations: ContractNodeAnnotations | undefined): MutableSchema {
  if (!annotations) {
    return schema;
  }
  if (annotations.description !== undefined) {
    if (typeof annotations.description !== 'string') {
      throw new RecordJsonSchemaRendererError('Record-contract descriptions must be strings.');
    }
    schema.description = annotations.description;
  }
  if (annotations.default !== undefined) {
    schema.default = cloneJsonValue(annotations.default);
  }
  if (annotations.examples && annotations.examples.length > 0) {
    schema.examples = annotations.examples.map(example => cloneJsonValue(example));
  }
  for (const key of Object.keys(annotations.extensions ?? {}).sort((left, right) => left.localeCompare(right))) {
    if (
      STANDARD_SCHEMA_KEYWORDS.has(key) ||
      CONTRACT_ANNOTATION_KEYWORDS.has(key) ||
      !CONTRIBUTOR_ANNOTATION_KEY.test(key)
    ) {
      throw new RecordJsonSchemaRendererError(`Contributor annotation keyword ${JSON.stringify(key)} is reserved.`);
    }
    const value = annotations.extensions?.[key];
    if (value !== undefined) {
      schema[key] = cloneJsonValue(value);
    }
  }
  return schema;
}

function scalarTypes(type: Exclude<RecordJsonSchemaType, 'array' | 'null' | 'object'>, nullable: boolean) {
  return nullable ? ([type, 'null'] as const) : type;
}

function structuredTypes(type: 'array' | 'object', nullable: boolean) {
  return nullable ? ([type, 'null'] as const) : type;
}

function withAdditionalNull(schema: RecordJsonSchema, nullable: boolean): RecordJsonSchema {
  return nullable ? { anyOf: [schema, { type: 'null' }] } : schema;
}

function conditionAtPointer(
  pointer: RecordContractPointer,
  leaf: RecordJsonSchema,
  requireLeaf: boolean,
  rootNode: ContractNode
): RecordJsonSchema {
  const tokens = recordContractPointerTokens(pointer);
  const visit = (node: ContractNode | undefined, index: number): RecordJsonSchema => {
    if (index === tokens.length) {
      return leaf;
    }
    if (node?.kind === 'array') {
      return { type: 'array', items: visit(node.items, index) };
    }
    const token = tokens[index];
    const child = node?.kind === 'object' ? node.properties[token] : undefined;
    return {
      type: 'object',
      properties: { [token]: visit(child, index + 1) },
      ...(requireLeaf || index < tokens.length - 1 ? { required: [token] } : {}),
    };
  };
  return visit(rootNode, 0);
}

function relativePointer(pointer: RecordContractPointer, base: RecordContractPointer): RecordContractPointer {
  const pointerTokens = recordContractPointerTokens(pointer);
  const baseTokens = recordContractPointerTokens(base);
  if (baseTokens.some((token, index) => pointerTokens[index] !== token)) {
    throw new RecordJsonSchemaRendererError(
      `Conditional pointer ${JSON.stringify(pointer)} is outside its rendering scope ${JSON.stringify(base)}.`
    );
  }
  return recordContractPointerFromTokens(pointerTokens.slice(baseTokens.length));
}

function conditionPointers(condition: ContractCondition): RecordContractPointer[] {
  switch (condition.kind) {
    case 'exists':
    case 'equals':
    case 'in':
      return [condition.pointer];
    case 'all':
    case 'any':
      return condition.conditions.flatMap(child => conditionPointers(child));
    case 'not':
      return conditionPointers(condition.condition);
    default: {
      const exhaustive: never = condition;
      return exhaustive;
    }
  }
}

function pointerIsWithin(pointer: RecordContractPointer, base: RecordContractPointer): boolean {
  const pointerTokens = recordContractPointerTokens(pointer);
  const baseTokens = recordContractPointerTokens(base);
  return baseTokens.every((token, index) => pointerTokens[index] === token);
}

function renderCondition(
  condition: ContractCondition,
  base: RecordContractPointer,
  rootNode: ContractNode
): RecordJsonSchema {
  switch (condition.kind) {
    case 'exists':
      return conditionAtPointer(relativePointer(condition.pointer, base), {}, true, rootNode);
    case 'equals':
      return conditionAtPointer(
        relativePointer(condition.pointer, base),
        { const: cloneJsonPrimitive(condition.value) },
        true,
        rootNode
      );
    case 'in': {
      const values = uniqueSortedPrimitives(condition.values.map(value => cloneJsonPrimitive(value)));
      return values.length === 0
        ? { not: {} }
        : conditionAtPointer(relativePointer(condition.pointer, base), { enum: values }, true, rootNode);
    }
    case 'all':
      return condition.conditions.length === 0
        ? {}
        : { allOf: condition.conditions.map(child => renderCondition(child, base, rootNode)) };
    case 'any':
      return condition.conditions.length === 0
        ? { not: {} }
        : { anyOf: condition.conditions.map(child => renderCondition(child, base, rootNode)) };
    case 'not':
      return { not: renderCondition(condition.condition, base, rootNode) };
    default: {
      const exhaustive: never = condition;
      return exhaustive;
    }
  }
}

function schemaAtPointer(
  pointer: RecordContractPointer,
  leaf: RecordJsonSchema,
  rootNode: ContractNode
): RecordJsonSchema {
  const tokens = recordContractPointerTokens(pointer);
  const visit = (node: ContractNode | undefined, index: number): RecordJsonSchema => {
    if (index === tokens.length) {
      return leaf;
    }
    if (node?.kind === 'array') {
      return { items: visit(node.items, index) };
    }
    const token = tokens[index];
    const child = node?.kind === 'object' ? node.properties[token] : undefined;
    return { properties: { [token]: visit(child, index + 1) } };
  };
  return visit(rootNode, 0);
}

function conditionalScopeFor(
  target: RecordContractPointer,
  condition: ContractCondition,
  state: RenderState
): ConditionalScope {
  const referencedPointers = [target, ...conditionPointers(condition)];
  for (let index = state.conditionalScopes.length - 1; index >= 0; index -= 1) {
    const scope = state.conditionalScopes[index];
    if (referencedPointers.every(pointer => pointerIsWithin(pointer, scope.pointer))) {
      return scope;
    }
  }
  throw new RecordJsonSchemaRendererError(
    'A conditional node has no object scope containing its target and condition.'
  );
}

function renderNode(node: ContractNode, pointer: RecordContractPointer, state: RenderState): RecordJsonSchema {
  if (node.definitionKey && node.definitionKey !== state.definitionBeingRendered) {
    if (!state.definitionKeys.has(node.definitionKey)) {
      throw new RecordJsonSchemaRendererError(
        `Record-contract node references missing local definition ${JSON.stringify(node.definitionKey)}.`
      );
    }
    return addAnnotations({ $ref: localDefinitionReference(node.definitionKey) }, node.annotations);
  }

  switch (node.kind) {
    case 'scalar': {
      const values = node.enum ? uniqueSortedPrimitives(node.nullable ? [...node.enum, null] : node.enum) : undefined;
      return addAnnotations(
        {
          type: scalarTypes(node.scalarType, node.nullable),
          ...(values ? { enum: values } : {}),
        },
        node.annotations
      );
    }
    case 'array':
      return addAnnotations(
        {
          type: structuredTypes('array', node.nullable),
          items: renderNode(node.items, pointer, state),
        },
        node.annotations
      );
    case 'object': {
      const conditionalScope: ConditionalScope = { pointer, node, conditionals: [] };
      state.conditionalScopes.push(conditionalScope);
      const properties = Object.fromEntries(
        Object.keys(node.properties)
          .sort((left, right) => left.localeCompare(right))
          .map(key => [
            key,
            renderNode(
              node.properties[key],
              `${pointer}/${escapeRecordContractPointerToken(key)}` as RecordContractPointer,
              state
            ),
          ])
      );
      state.conditionalScopes.pop();
      const schema = addAnnotations(
        {
          type: structuredTypes('object', node.nullable),
          properties,
          additionalProperties: node.unknownProperties === 'allow',
        },
        node.annotations
      );
      applyConditionals(schema, conditionalScope);
      return schema;
    }
    case 'any':
      return addAnnotations(node.nullable ? {} : { not: { type: 'null' } }, node.annotations);
    case 'conditional': {
      const thenSchema = withAdditionalNull(renderNode(node.thenNode, pointer, state), node.nullable);
      const elseSchema = node.elseNode
        ? withAdditionalNull(renderNode(node.elseNode, pointer, state), node.nullable)
        : undefined;
      conditionalScopeFor(pointer, node.condition, state).conditionals.push({
        target: pointer,
        condition: node.condition,
        thenSchema,
        ...(elseSchema ? { elseSchema } : {}),
      });
      return addAnnotations({}, node.annotations);
    }
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

/** Render only the immutable, allowlisted portion of a resolved contract context. */
export function renderRecordContractPublicContext(context: RecordContractPublicContext): RenderedRecordContractContext {
  return snapshotRecordContractPublicContext(context);
}

function validationSortKey(summary: RecordContractValidationSummary): string {
  return [
    summary.code,
    summary.pointers.join(','),
    summary.groups.join(','),
    summary.operations.join(','),
    summary.blocking,
  ].join('\u0000');
}

function renderedValidation(summaries: readonly RecordContractValidationSummary[]): RenderedRecordContractValidation[] {
  return summaries
    .map(summary => ({
      code: summary.code,
      pointers: [...summary.pointers].sort((left, right) => left.localeCompare(right)),
      groups: sortedUniqueStrings(summary.groups),
      operations: sortedUniqueStrings(summary.operations),
      blocking: summary.blocking,
    }))
    .sort((left, right) => validationSortKey(left).localeCompare(validationSortKey(right)));
}

function renderedContributor(contributor: RecordContractContributorIdentity): RecordContractContributorIdentity {
  return {
    key: contributor.key,
    version: contributor.version,
    source: contributor.source,
    ...(contributor.namespace === undefined ? {} : { namespace: contributor.namespace }),
  };
}

function diagnosticSortKey(diagnostic: RecordContractDiagnostic): string {
  return [
    diagnostic.code,
    diagnostic.pointer ?? '',
    diagnostic.componentType ?? '',
    diagnostic.contributor?.key ?? '',
    diagnostic.message,
    diagnostic.severity,
  ].join('\u0000');
}

function renderedDiagnostics(diagnostics: readonly RecordContractDiagnostic[]): RenderedRecordContractDiagnostic[] {
  return diagnostics
    .map(diagnostic => ({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      ...(diagnostic.pointer === undefined ? {} : { pointer: diagnostic.pointer }),
      ...(diagnostic.componentType === undefined ? {} : { componentType: diagnostic.componentType }),
      ...(diagnostic.contributor === undefined ? {} : { contributor: renderedContributor(diagnostic.contributor) }),
    }))
    .sort((left, right) => diagnosticSortKey(left).localeCompare(diagnosticSortKey(right)));
}

function assertOnlyLocalReferences(
  value: unknown,
  allowedReferences: ReadonlySet<string>,
  ancestors = new Set<object>()
): void {
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (ancestors.has(value)) {
    throw new RecordJsonSchemaRendererError('Rendered JSON Schema must not contain cycles.');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach(item => assertOnlyLocalReferences(item, allowedReferences, ancestors));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === '$ref') {
        if (typeof child !== 'string' || !child.startsWith('#/$defs/')) {
          throw new RecordJsonSchemaRendererError('Rendered JSON Schema must not contain remote references.');
        }
        if (!allowedReferences.has(child)) {
          throw new RecordJsonSchemaRendererError(
            'Rendered JSON Schema references must resolve to a declared local definition.'
          );
        }
      }
      assertOnlyLocalReferences(child, allowedReferences, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function freezeDeep<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const pending: object[] = [value];
  const visited = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    Object.values(current).forEach(child => {
      if (child !== null && typeof child === 'object') {
        pending.push(child);
      }
    });
    Object.freeze(current);
  }
  return value;
}

function applyConditionals(schema: MutableSchema, scope: ConditionalScope): void {
  if (scope.conditionals.length === 0) {
    return;
  }
  schema.allOf = scope.conditionals.map(conditional => ({
    if: renderCondition(conditional.condition, scope.pointer, scope.node),
    then: schemaAtPointer(relativePointer(conditional.target, scope.pointer), conditional.thenSchema, scope.node),
    ...(conditional.elseSchema
      ? {
          else: schemaAtPointer(relativePointer(conditional.target, scope.pointer), conditional.elseSchema, scope.node),
        }
      : {}),
  }));
  if (schema.additionalProperties === false) {
    delete schema.additionalProperties;
    schema.unevaluatedProperties = false;
  }
}

/** Render a dialect-neutral record contract as a self-contained JSON Schema draft 2020-12 document. */
export class RecordJsonSchemaRenderer {
  public render(contract: RecordContract): RecordJsonSchemaDocument {
    const definitionKeys = new Set(Object.keys(contract.definitions));
    const rootState: RenderState = { definitionKeys, conditionalScopes: [] };
    const root = renderNode(contract.root, '' as RecordContractPointer, rootState) as MutableSchema;

    const definitions: Record<string, RecordJsonSchema> = {};
    for (const key of [...definitionKeys].sort((left, right) => left.localeCompare(right))) {
      const definition = contract.definitions[key];
      const definitionState: RenderState = {
        definitionKeys,
        conditionalScopes: [],
        definitionBeingRendered: key,
      };
      const renderedDefinition = renderNode(definition, '' as RecordContractPointer, definitionState) as MutableSchema;
      definitions[key] = renderedDefinition;
    }

    const document: RecordJsonSchemaDocument = {
      $schema: JSON_SCHEMA_DRAFT_2020_12,
      ...(Object.keys(definitions).length === 0 ? {} : { $defs: definitions }),
      ...root,
      type: 'object',
      'x-redbox-contract-format': RECORD_CONTRACT_FORMAT_V1,
      'x-redbox-context': renderRecordContractPublicContext(contract.context),
      'x-redbox-completeness': contract.completeness,
      'x-redbox-validation': renderedValidation(contract.validatorSummaries),
      'x-redbox-diagnostics': renderedDiagnostics(contract.diagnostics),
    };
    const allowedReferences = new Set([...definitionKeys].map(key => localDefinitionReference(key)));
    assertOnlyLocalReferences(document, allowedReferences);
    return freezeDeep(document);
  }
}

export function renderRecordJsonSchema(contract: RecordContract): RecordJsonSchemaDocument {
  return new RecordJsonSchemaRenderer().render(contract);
}
