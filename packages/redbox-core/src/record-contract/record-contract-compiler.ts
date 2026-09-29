import type {
  AvailableFormComponentDefinitionFrames,
  FormComponentDefinitionFrame,
  FormConfigFrame,
  FormValidatorConfig,
  FormValidatorTargetFieldConfig,
  ILogger,
  ReusableFormDefinitions,
} from '@researchdatabox/sails-ng-common';
import { FormOverride } from '@researchdatabox/sails-ng-common';
import { performance } from 'perf_hooks';

import type { RecordSchemaLimitsConfig } from '../config/recordSchema.config';
import { RECORD_SCHEMA_PROBLEM_CODES } from './codes';
import { freezeDeep } from './deep-freeze';
import type {
  ContractCondition,
  ContractNode,
  ContractObjectNode,
  ContractOwner,
  RecordContract,
  RecordContractCompileResult,
  RecordContractContributorIdentity,
  RecordContractDiagnostic,
  RecordContractPointer,
  RecordContractPublicContext,
  RecordContractValidationSummary,
} from './types';
import type {
  RecordContractComponentContribution,
  RecordContractContributorRegistration,
} from './contributor-registry';
import { RecordContractContributorRegistry } from './contributor-registry';
import {
  appendRecordContractPointer,
  joinRecordContractPointer,
  recordContractPointer,
  recordContractPointerFromTokens,
} from './json-pointer';
import { CORE_RECORD_CONTRACT_COMPONENT_INVENTORY } from './core-contributors';
import { snapshotRecordContractPublicContext, type RecordContractEffectiveForm } from './record-contract-context';

type UnknownRecord = Readonly<Record<string, unknown>>;

const noopFormOverrideLog = (): void => undefined;
const FORM_OVERRIDE_LOGGER: ILogger = Object.freeze({
  silly: noopFormOverrideLog,
  verbose: noopFormOverrideLog,
  trace: noopFormOverrideLog,
  debug: noopFormOverrideLog,
  log: noopFormOverrideLog,
  info: noopFormOverrideLog,
  warn: noopFormOverrideLog,
  error: noopFormOverrideLog,
  crit: noopFormOverrideLog,
  fatal: noopFormOverrideLog,
  silent: noopFormOverrideLog,
  blank: noopFormOverrideLog,
});

export interface RecordContractCompileRequest {
  readonly form: RecordContractEffectiveForm;
  readonly context: RecordContractPublicContext;
  readonly reusableFormDefinitions?: Readonly<Record<string, readonly FormComponentDefinitionFrame[]>>;
}

class CompilerFailure extends Error {
  public constructor(
    public readonly failureKind: 'invalid-contract' | 'limit-exceeded' | 'contributor-failed',
    public readonly code: (typeof RECORD_SCHEMA_PROBLEM_CODES)[keyof typeof RECORD_SCHEMA_PROBLEM_CODES],
    public readonly diagnostic: RecordContractDiagnostic
  ) {
    super(diagnostic.message);
    this.name = 'RecordContractCompilerFailure';
  }
}

class ContractNodeLimitError extends Error {
  public constructor(public readonly limit: 'depth' | 'properties') {
    super(`Contract node exceeded its ${limit} limit.`);
    this.name = 'ContractNodeLimitError';
  }
}

class CloneDepthLimitError extends Error {
  public constructor() {
    super('Contributor output exceeds the configured nesting-depth limit.');
    this.name = 'CloneDepthLimitError';
  }
}

interface CompilerState {
  readonly definitions: Record<string, ContractNode>;
  readonly diagnostics: RecordContractDiagnostic[];
  readonly fieldOwners: Record<string, ContractOwner>;
  readonly validatorSummaries: RecordContractValidationSummary[];
  readonly activeDefinitions: Set<string>;
  propertyCount: number;
  partial: boolean;
}

function forkCompilerState(state: CompilerState): CompilerState {
  return {
    definitions: { ...state.definitions },
    diagnostics: [...state.diagnostics],
    fieldOwners: { ...state.fieldOwners },
    validatorSummaries: [...state.validatorSummaries],
    activeDefinitions: new Set(state.activeDefinitions),
    propertyCount: state.propertyCount,
    partial: state.partial,
  };
}

function replaceRecord<T>(target: Record<string, T>, source: Readonly<Record<string, T>>): void {
  for (const key of Object.keys(target)) {
    delete target[key];
  }
  Object.assign(target, source);
}

function commitCompilerState(target: CompilerState, source: CompilerState): void {
  replaceRecord(target.definitions, source.definitions);
  replaceRecord(target.fieldOwners, source.fieldOwners);
  target.diagnostics.splice(0, target.diagnostics.length, ...source.diagnostics);
  target.validatorSummaries.splice(0, target.validatorSummaries.length, ...source.validatorSummaries);
  target.activeDefinitions.clear();
  source.activeDefinitions.forEach(definition => target.activeDefinitions.add(definition));
  target.propertyCount = source.propertyCount;
  target.partial = source.partial;
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function contributorIdentity(registration: RecordContractContributorRegistration): RecordContractContributorIdentity {
  const contributor = registration.contributor;
  return {
    key: contributor.key,
    version: contributor.version,
    source: registration.source,
  };
}

function diagnosticSortKey(diagnostic: RecordContractDiagnostic): string {
  return [
    diagnostic.code,
    diagnostic.pointer ?? '',
    diagnostic.componentType ?? '',
    diagnostic.contributor?.key ?? '',
    diagnostic.message,
  ].join('\u0000');
}

function summarySortKey(summary: RecordContractValidationSummary): string {
  return [summary.code, summary.pointers.join(','), summary.groups.join(','), summary.operations.join(',')].join(
    '\u0000'
  );
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNativeRegExp(value: object): value is RegExp {
  return Object.getPrototypeOf(value) === RegExp.prototype;
}

function isNonPersistingContribution(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || !isPlainObject(value)) {
    return false;
  }
  const kind = Object.getOwnPropertyDescriptor(value, 'kind');
  return kind?.enumerable === true && 'value' in kind && kind.value === 'non-persisting';
}

/** Clone without invoking accessors or accepting values JSON would silently rewrite. */
function cloneJsonSafe<T>(
  value: T,
  path = '$',
  ancestors = new Set<object>(),
  depth = 0,
  maxDepth = Number.MAX_SAFE_INTEGER,
  allowUndefined = false,
  allowRuntimeFormObjects = false
): T {
  if (depth > maxDepth) {
    throw new CloneDepthLimitError();
  }
  if (value === undefined && allowUndefined) {
    return value;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} contains a non-finite number.`);
    }
    return value;
  }
  if (typeof value !== 'object') {
    throw new Error(`${path} contains a non-JSON ${typeof value} value.`);
  }
  if (ancestors.has(value)) {
    throw new Error(`${path} contains a cycle.`);
  }
  ancestors.add(value);
  try {
    if (allowRuntimeFormObjects && isNativeRegExp(value)) {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (
        Object.getOwnPropertySymbols(value).length > 0 ||
        Object.keys(descriptors).some(key => key !== 'lastIndex') ||
        !descriptors.lastIndex ||
        !('value' in descriptors.lastIndex) ||
        descriptors.lastIndex.enumerable
      ) {
        throw new Error(`${path} contains an extended RegExp.`);
      }
      // Form validator configuration permits RegExp values. Preserve their
      // deterministic semantics without carrying the mutable lastIndex or
      // RegExp prototype across the compiler boundary.
      return { source: value.source, flags: value.flags } as T;
    }
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length > 0 || Object.keys(value).length !== value.length) {
        throw new Error(`${path} contains a sparse or extended array.`);
      }
      return value.map((item, index) =>
        cloneJsonSafe(
          item,
          `${path}[${index}]`,
          ancestors,
          depth + 1,
          maxDepth,
          allowUndefined,
          allowRuntimeFormObjects
        )
      ) as T;
    }
    if (!allowRuntimeFormObjects && !isPlainObject(value)) {
      throw new Error(`${path} is not a plain JSON object.`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error(`${path} contains symbol properties.`);
    }
    const clone: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (!descriptor.enumerable || !('value' in descriptor)) {
        throw new Error(`${path}.${key} is not an enumerable data property.`);
      }
      clone[key] = cloneJsonSafe(
        descriptor.value,
        `${path}.${key}`,
        ancestors,
        depth + 1,
        maxDepth,
        allowUndefined,
        allowRuntimeFormObjects
      );
    }
    return clone as T;
  } finally {
    ancestors.delete(value);
  }
}

function cloneCompilerInput<T>(value: T, path: string, allowRuntimeFormObjects = false): T {
  return freezeDeep(
    cloneJsonSafe(value, path, new Set<object>(), 0, Number.MAX_SAFE_INTEGER, true, allowRuntimeFormObjects)
  );
}

function snapshotCompileRequest(request: RecordContractCompileRequest): RecordContractCompileRequest {
  return Object.freeze({
    // FormsService returns visitor-aware class instances. Snapshot only their
    // enumerable data; prototype methods never cross the compiler boundary.
    form: cloneCompilerInput(request.form, '$request.form', true),
    context: snapshotRecordContractPublicContext(request.context),
    ...(request.reusableFormDefinitions === undefined
      ? {}
      : {
          reusableFormDefinitions: cloneCompilerInput(
            request.reusableFormDefinitions,
            '$request.reusableFormDefinitions'
          ),
        }),
  });
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function validateCondition(condition: ContractCondition, maximumDepth: number): void {
  const pending: Array<{ condition: ContractCondition; depth: number }> = [{ condition, depth: 0 }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }
    if (current.depth > maximumDepth) {
      throw new ContractNodeLimitError('depth');
    }
    const item = current.condition;
    if (item.kind === 'exists' || item.kind === 'equals') {
      recordContractPointer(item.pointer);
    } else if (item.kind === 'in') {
      recordContractPointer(item.pointer);
      if (!Array.isArray(item.values)) {
        throw new Error('Condition values must be an array.');
      }
    } else if (item.kind === 'not') {
      pending.push({ condition: item.condition, depth: current.depth + 1 });
    } else {
      if (!Array.isArray(item.conditions) || item.conditions.length === 0) {
        throw new Error('Combined conditions require at least one condition.');
      }
      for (const child of item.conditions) {
        pending.push({ condition: child, depth: current.depth + 1 });
      }
    }
  }
}

function validateContractNode(node: ContractNode, baseDepth: number, maxDepth: number, maxProperties: number): void {
  const pending: Array<{ node: ContractNode; depth: number }> = [{ node, depth: baseDepth }];
  let propertyCount = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }
    if (current.depth > maxDepth) {
      throw new ContractNodeLimitError('depth');
    }
    const currentNode = current.node;
    if (!isBoolean(currentNode.nullable)) {
      throw new Error('Contract nodes require an explicit boolean nullability declaration.');
    }
    switch (currentNode.kind) {
      case 'scalar':
        if (!['string', 'number', 'integer', 'boolean'].includes(currentNode.scalarType)) {
          throw new Error('Scalar node type is invalid.');
        }
        break;
      case 'object': {
        if (!['allow', 'declared'].includes(currentNode.unknownProperties)) {
          throw new Error('Object node unknown-property policy is invalid.');
        }
        if (
          currentNode.properties === null ||
          typeof currentNode.properties !== 'object' ||
          Array.isArray(currentNode.properties)
        ) {
          throw new Error('Object node properties must be a plain object.');
        }
        const children = Object.values(currentNode.properties);
        propertyCount += children.length;
        if (propertyCount > maxProperties) {
          throw new ContractNodeLimitError('properties');
        }
        for (const child of children) {
          pending.push({ node: child, depth: current.depth + 1 });
        }
        break;
      }
      case 'array':
        pending.push({ node: currentNode.items, depth: current.depth + 1 });
        break;
      case 'any':
        break;
      case 'conditional':
        validateCondition(currentNode.condition, maxDepth - current.depth);
        pending.push({ node: currentNode.thenNode, depth: current.depth + 1 });
        if (currentNode.elseNode) {
          pending.push({ node: currentNode.elseNode, depth: current.depth + 1 });
        }
        break;
      default: {
        const exhaustive: never = currentNode;
        throw new Error(`Unknown contract node ${String(exhaustive)}.`);
      }
    }
  }
}

function estimatedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function safeNames(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return [
    ...new Set(
      values.filter((value): value is string => typeof value === 'string' && /^[A-Za-z0-9._:-]+$/.test(value))
    ),
  ].sort();
}

function safeValidatorCode(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]+$/.test(value)) {
    return 'form.custom';
  }
  const safeBuiltIns = new Set([
    'any-of',
    'different-values',
    'doi',
    'email',
    'integer',
    'max',
    'maxLength',
    'min',
    'minLength',
    'orcid',
    'pattern',
    'required',
    'requiredTrue',
    'url',
  ]);
  return safeBuiltIns.has(value) ? `form.${value}` : 'form.custom';
}

function validatorPointer(
  validator: Readonly<FormValidatorConfig | FormValidatorTargetFieldConfig>,
  fallback: RecordContractPointer
): RecordContractPointer {
  const target = asRecord(validator).targetField;
  const dataModel = asRecord(target).dataModel;
  return Array.isArray(dataModel)
    ? recordContractPointerFromTokens(
        dataModel.filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
      )
    : fallback;
}

export class RecordContractCompiler {
  public constructor(
    private readonly registry: RecordContractContributorRegistry,
    private readonly limits: Readonly<RecordSchemaLimitsConfig>
  ) {}

  public async compile(request: RecordContractCompileRequest): Promise<RecordContractCompileResult> {
    const state: CompilerState = {
      definitions: {},
      diagnostics: [],
      fieldOwners: {},
      validatorSummaries: [],
      activeDefinitions: new Set<string>(),
      propertyCount: 0,
      partial: false,
    };

    try {
      const snapshot = snapshotCompileRequest(request);
      this.assertDepth(0, recordContractPointer(''));
      const root = await this.compileChildren(
        snapshot.form.componentDefinitions ?? [],
        recordContractPointer(''),
        0,
        snapshot,
        state
      );
      this.collectValidators(snapshot.form.validators, recordContractPointer(''), snapshot.form, state);
      this.validateNodeBounds(root, 0, recordContractPointer(''));

      const contract = freezeDeep<RecordContract>({
        root,
        definitions: Object.fromEntries(
          Object.entries(state.definitions).sort(([left], [right]) => left.localeCompare(right))
        ),
        fieldOwners: Object.fromEntries(
          Object.entries(state.fieldOwners).sort(([left], [right]) => left.localeCompare(right))
        ),
        validatorSummaries: [...state.validatorSummaries].sort((left, right) =>
          summarySortKey(left).localeCompare(summarySortKey(right))
        ),
        diagnostics: [...state.diagnostics].sort((left, right) =>
          diagnosticSortKey(left).localeCompare(diagnosticSortKey(right))
        ),
        completeness: state.partial ? 'partial' : 'complete',
        context: snapshot.context,
      });
      if (estimatedBytes(contract) > this.limits.maxDocumentBytes) {
        throw this.limitFailure(
          RECORD_SCHEMA_PROBLEM_CODES.LIMIT_DOCUMENT_BYTES,
          'The estimated record-contract output exceeds the configured document-byte limit.',
          recordContractPointer('')
        );
      }
      return Object.freeze({ kind: 'compiled', contract });
    } catch (error) {
      const failure =
        error instanceof CompilerFailure
          ? error
          : new CompilerFailure('invalid-contract', RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT, {
              code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
              severity: 'error',
              message: error instanceof Error ? error.message : 'Record contract compilation failed.',
            });
      const diagnostics = [...state.diagnostics, failure.diagnostic].sort((left, right) =>
        diagnosticSortKey(left).localeCompare(diagnosticSortKey(right))
      );
      return Object.freeze({
        kind: 'failed',
        failureKind: failure.failureKind,
        code: failure.code,
        diagnostics: freezeDeep(diagnostics),
      });
    }
  }

  private async compileChildren(
    components: readonly FormComponentDefinitionFrame[],
    parent: RecordContractPointer,
    depth: number,
    request: RecordContractCompileRequest,
    state: CompilerState,
    definitionKey?: string
  ): Promise<ContractObjectNode> {
    this.assertDepth(depth, parent);
    const properties: Record<string, ContractNode> = {};
    const roleFilteredComponents = new Map<string, FormComponentDefinitionFrame[]>();
    for (const component of components) {
      if (this.isRoleFilteredDuplicate(component, roleFilteredComponents)) {
        continue;
      }
      const contributions = await this.compileComponent(component, parent, depth + 1, request, state);
      for (const [name, node] of contributions) {
        if (Object.hasOwn(properties, name)) {
          throw this.invalidFailure(
            'record-contract.path-ownership-collision',
            `Multiple components attempted to own ${joinRecordContractPointer(parent, name)}.`,
            joinRecordContractPointer(parent, name)
          );
        }
        properties[name] = node;
      }
    }
    return {
      kind: 'object',
      nullable: false,
      properties: Object.fromEntries(Object.entries(properties).sort(([left], [right]) => left.localeCompare(right))),
      unknownProperties: request.context.unknownProperties,
      ...(definitionKey ? { definitionKey } : {}),
    };
  }

  private async compileComponent(
    component: FormComponentDefinitionFrame,
    parent: RecordContractPointer,
    depth: number,
    request: RecordContractCompileRequest,
    state: CompilerState
  ): Promise<Array<readonly [string, ContractNode]>> {
    this.assertDepth(depth, parent);
    if (!this.isAvailableInEditMode(component)) {
      return [];
    }
    const reusableName = component.overrides?.reusableFormName;
    if (typeof reusableName === 'string' && reusableName !== '') {
      return this.compileReusable(component, reusableName, parent, depth, request, state);
    }

    component = this.applyEditModeName(component);

    const componentType = component.component?.class;
    if (typeof componentType !== 'string' || componentType.trim() === '') {
      throw this.invalidFailure(
        RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
        'A form component has no stable component class.',
        parent
      );
    }
    const registration = this.registry.component(componentType);
    if (!registration || registration.contributor.kind !== 'component') {
      if (Object.hasOwn(CORE_RECORD_CONTRACT_COMPONENT_INVENTORY, componentType)) {
        throw this.invalidFailure(
          'record-contract.uncovered-core-component',
          `Core component ${componentType} has no record-contract contributor.`,
          parent,
          componentType
        );
      }
      return this.unsupportedComponent(component, parent, componentType, state);
    }

    const contributor = registration.contributor;
    const identity = contributorIdentity(registration);
    const fieldName = component.name;
    const pointer = fieldName ? joinRecordContractPointer(parent, fieldName) : parent;
    const contributionState = forkCompilerState(state);
    this.collectValidators(component.model?.config?.validators, pointer, request.form, contributionState);
    this.collectUnrepresentableExpressions(component, pointer, contributionState);

    let contribution: RecordContractComponentContribution;
    try {
      const compileContext = Object.freeze({
        component,
        pointer,
        publicContext: request.context,
        compileChildren: async (
          children: readonly FormComponentDefinitionFrame[],
          childParent: RecordContractPointer,
          options?: { readonly definitionKey?: string }
        ): Promise<ContractObjectNode> =>
          freezeDeep(
            await this.compileChildren(
              cloneCompilerInput(children, `$contributor[${contributor.key}].children`),
              childParent,
              depth + 1,
              request,
              contributionState,
              options?.definitionKey
            )
          ),
      });
      contribution = await this.withTimeout(() => contributor.compile(compileContext), contributor.key, pointer);
      const allowRuntimeChildren = isNonPersistingContribution(contribution);
      contribution = cloneJsonSafe(
        contribution,
        `$contributor[${contributor.key}]`,
        new Set<object>(),
        0,
        this.limits.maxDepth + 8,
        allowRuntimeChildren
      );
      if (estimatedBytes(contribution) > this.limits.maxDocumentBytes) {
        throw this.limitFailure(
          RECORD_SCHEMA_PROBLEM_CODES.LIMIT_DOCUMENT_BYTES,
          `Contributor ${contributor.key} output exceeds the configured output estimate.`,
          pointer,
          componentType
        );
      }
    } catch (error) {
      if (error instanceof CompilerFailure) {
        throw error;
      }
      if (error instanceof CloneDepthLimitError) {
        throw this.limitFailure(
          RECORD_SCHEMA_PROBLEM_CODES.LIMIT_DEPTH,
          `Record-contract contributor ${contributor.key} output exceeds the configured nesting-depth limit.`,
          pointer,
          componentType
        );
      }
      throw new CompilerFailure('contributor-failed', RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_FAILED, {
        code: RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_FAILED,
        severity: 'error',
        message: `Record-contract contributor ${contributor.key} returned invalid output.`,
        pointer,
        componentType,
        contributor: identity,
      });
    }

    if (contribution.kind === 'non-persisting') {
      if (!contribution.children || contribution.children.length === 0) {
        commitCompilerState(state, contributionState);
        return [];
      }
      const childNode = await this.compileChildren(
        contribution.children,
        parent,
        depth + 1,
        request,
        contributionState
      );
      commitCompilerState(state, contributionState);
      return Object.entries(childNode.properties);
    }

    if (!fieldName) {
      throw this.invalidFailure(
        RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
        `Persisting component ${componentType} has no metadata field name.`,
        parent,
        componentType
      );
    }
    try {
      this.validateNodeBounds(contribution.node, depth, pointer);
      this.assertNullability(contributor.nullability, contribution.node, contributor.key, pointer);
    } catch (error) {
      if (error instanceof CompilerFailure && error.failureKind === 'limit-exceeded') {
        throw error;
      }
      throw new CompilerFailure('contributor-failed', RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_FAILED, {
        code: RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_FAILED,
        severity: 'error',
        message: `Record-contract contributor ${contributor.key} returned invalid output.`,
        pointer,
        componentType,
        contributor: identity,
      });
    }
    this.claimProperty(pointer, componentType, identity, contributionState);
    for (const owned of contributor.ownedPointers) {
      const ownedPointer = owned === '' ? pointer : appendRecordContractPointer(pointer, recordContractPointer(owned));
      this.claimOwnedPointer(ownedPointer, componentType, identity, contributionState);
    }
    for (const diagnostic of contribution.diagnostics ?? []) {
      this.addDiagnostic({ ...diagnostic, contributor: identity }, contributionState);
    }
    if (containsPermissiveNode(contribution.node)) {
      contributionState.partial = true;
    }
    commitCompilerState(state, contributionState);
    return [[fieldName, contribution.node]];
  }

  private async compileReusable(
    component: FormComponentDefinitionFrame,
    name: string,
    parent: RecordContractPointer,
    depth: number,
    request: RecordContractCompileRequest,
    state: CompilerState
  ): Promise<Array<readonly [string, ContractNode]>> {
    const definition = request.reusableFormDefinitions?.[name];
    if (!definition) {
      throw this.invalidFailure(
        RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
        `Reusable form definition ${name} does not exist.`,
        parent
      );
    }
    if (state.activeDefinitions.has(name)) {
      throw this.invalidFailure(
        RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
        `Reusable form definition cycle detected at ${name}.`,
        parent
      );
    }
    state.activeDefinitions.add(name);
    try {
      const reusableFormDefinitions: ReusableFormDefinitions = {};
      for (const [definitionName, components] of Object.entries(request.reusableFormDefinitions ?? {})) {
        // Reusable definitions are hook-extensible at the compiler boundary,
        // while the shared form expander exposes the closed core component
        // union. The runtime shape is the common FormComponentDefinitionFrame.
        reusableFormDefinitions[definitionName] = [...components] as AvailableFormComponentDefinitionFrames[];
      }
      const expanded = new FormOverride(FORM_OVERRIDE_LOGGER).applyOverridesReusable(
        [component as AvailableFormComponentDefinitionFrames],
        reusableFormDefinitions
      );
      const effectiveComponents = expanded.map(expandedComponent => {
        if (expandedComponent.name || !component.name) {
          return expandedComponent;
        }
        const overrides = { ...expandedComponent.overrides };
        delete overrides.replaceName;
        return {
          ...expandedComponent,
          name: component.name,
          ...(Object.keys(overrides).length > 0 ? { overrides } : { overrides: undefined }),
        };
      });
      const compiled = await this.compileChildren(effectiveComponents, parent, depth + 1, request, state);
      return Object.entries(compiled.properties).map(([propertyName, node]) => {
        if (node.definitionKey) {
          return [propertyName, node] as const;
        }
        const definitionKey = `reusable:${JSON.stringify(name)}:property:${JSON.stringify(propertyName)}`;
        const referencedNode: ContractNode = { ...node, definitionKey };
        const prior = state.definitions[definitionKey];
        if (prior && JSON.stringify(prior) !== JSON.stringify(referencedNode)) {
          throw this.invalidFailure(
            RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
            `Reusable form definition ${name} property ${propertyName} compiled inconsistently.`,
            parent
          );
        }
        state.definitions[definitionKey] = referencedNode;
        return [propertyName, referencedNode] as const;
      });
    } finally {
      state.activeDefinitions.delete(name);
    }
  }

  private isAvailableInEditMode(component: FormComponentDefinitionFrame): boolean {
    const allowModes = component.constraints?.allowModes;
    return !Array.isArray(allowModes) || allowModes.length === 0 || allowModes.includes('edit');
  }

  /**
   * Role-specific form variants can describe the same persisted field more
   * than once. The record schema is role-independent, so retain the first
   * variant when the role scopes are disjoint and let the client visitor pick
   * the variant for the current user. Overlapping or unrestricted variants
   * remain a contract error because they may represent a real collision.
   */
  private isRoleFilteredDuplicate(
    component: FormComponentDefinitionFrame,
    roleFilteredComponents: Map<string, FormComponentDefinitionFrame[]>
  ): boolean {
    if (!component.model || !this.isAvailableInEditMode(component)) {
      return false;
    }

    const fieldName = this.applyEditModeName(component).name;
    const allowRoles = component.constraints?.authorization?.allowRoles;
    if (!fieldName || !Array.isArray(allowRoles) || allowRoles.length === 0) {
      return false;
    }

    const priorComponents = roleFilteredComponents.get(fieldName) ?? [];
    const isDuplicate = priorComponents.some(priorComponent => {
      const priorRoles = priorComponent.constraints?.authorization?.allowRoles;
      return (
        Array.isArray(priorRoles) &&
        priorRoles.length > 0 &&
        allowRoles.every(role => !priorRoles.includes(role))
      );
    });
    priorComponents.push(component);
    roleFilteredComponents.set(fieldName, priorComponents);
    return isDuplicate;
  }

  private applyEditModeName(component: FormComponentDefinitionFrame): FormComponentDefinitionFrame {
    const replaceName = component.overrides?.replaceName;
    return replaceName === undefined || replaceName === component.name
      ? component
      : { ...component, name: replaceName };
  }

  private unsupportedComponent(
    component: FormComponentDefinitionFrame,
    parent: RecordContractPointer,
    componentType: string,
    state: CompilerState
  ): Array<readonly [string, ContractNode]> {
    if (!component.name) {
      throw this.invalidFailure(
        RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
        `Unsupported component ${componentType} has no field name.`,
        parent,
        componentType
      );
    }
    const pointer = joinRecordContractPointer(parent, component.name);
    const node: ContractNode = {
      kind: 'any',
      nullable: true,
      reason: 'unsupported-component',
      annotations: {
        extensions: { 'x-redbox-unsupported-component': componentType },
      },
    };
    this.claimProperty(pointer, componentType, undefined, state);
    this.addDiagnostic(
      {
        code: 'x-redbox-unsupported-component',
        severity: 'warning',
        message: 'A custom component has no registered record-contract contributor and remains permissive.',
        pointer,
        componentType,
      },
      state
    );
    state.partial = true;
    return [[component.name, node]];
  }

  private collectValidators(
    configured: readonly FormValidatorConfig[] | readonly FormValidatorTargetFieldConfig[] | undefined,
    fallbackPointer: RecordContractPointer,
    form: Readonly<Pick<FormConfigFrame, 'validationOperations'>>,
    state: CompilerState
  ): void {
    for (const validator of configured ?? []) {
      const groups = safeNames(validator.groups?.include);
      const operations = Object.entries(form.validationOperations ?? {})
        .filter(([, operation]) => {
          const operationGroups = safeNames(operation.enabledValidationGroups);
          return groups.length === 0 || operationGroups.some(group => groups.includes(group));
        })
        .map(([name]) => name)
        .filter(name => /^[A-Za-z0-9._:-]+$/.test(name))
        .sort();
      state.validatorSummaries.push({
        code: safeValidatorCode(validator.class),
        pointers: [validatorPointer(validator, fallbackPointer)],
        groups,
        operations,
        blocking: true,
      });
    }
  }

  private collectUnrepresentableExpressions(
    component: FormComponentDefinitionFrame,
    pointer: RecordContractPointer,
    state: CompilerState
  ): void {
    const expressions = component.expressions ?? [];
    if (expressions.length === 0) {
      return;
    }
    this.addDiagnostic(
      {
        code: 'record-contract.unrepresentable-condition',
        severity: 'warning',
        message: 'Runtime component expressions are annotation-only and do not remove the field from the contract.',
        pointer,
        componentType: component.component.class,
      },
      state
    );
    state.partial = true;
  }

  private claimProperty(
    pointer: RecordContractPointer,
    key: string,
    contributor: RecordContractContributorIdentity | undefined,
    state: CompilerState,
    kind: ContractOwner['kind'] = 'component'
  ): void {
    if (state.fieldOwners[pointer]) {
      throw this.invalidFailure(
        'record-contract.path-ownership-collision',
        `Metadata path ${pointer} already has an owner.`,
        pointer
      );
    }
    state.propertyCount += 1;
    if (state.propertyCount > this.limits.maxProperties) {
      throw this.limitFailure(
        RECORD_SCHEMA_PROBLEM_CODES.LIMIT_PROPERTIES,
        'The record contract exceeds the configured property limit.',
        pointer
      );
    }
    state.fieldOwners[pointer] = { kind, key, ...(contributor ? { contributor } : {}) };
  }

  private claimOwnedPointer(
    pointer: RecordContractPointer,
    key: string,
    contributor: RecordContractContributorIdentity,
    state: CompilerState
  ): void {
    const existing = state.fieldOwners[pointer];
    if (existing && existing.contributor?.key !== contributor.key) {
      throw this.invalidFailure(
        'record-contract.path-ownership-collision',
        `Contributor ${contributor.key} attempted to overwrite ${pointer}.`,
        pointer
      );
    }
    if (!existing) {
      state.fieldOwners[pointer] = { kind: 'component', key, contributor };
    }
  }

  private addDiagnostic(diagnostic: RecordContractDiagnostic, state: CompilerState): void {
    if (state.diagnostics.length >= this.limits.maxDiagnostics) {
      throw this.limitFailure(
        RECORD_SCHEMA_PROBLEM_CODES.LIMIT_DIAGNOSTICS,
        'The record contract exceeds the configured diagnostic limit.',
        diagnostic.pointer ?? recordContractPointer('')
      );
    }
    state.diagnostics.push(diagnostic);
    if (
      diagnostic.code === 'x-redbox-unsupported-component' ||
      diagnostic.code === 'record-contract.unrepresentable-condition' ||
      diagnostic.code === 'record-contract.core-permissive-shape'
    ) {
      state.partial = true;
    }
  }

  private assertDepth(depth: number, pointer: RecordContractPointer): void {
    if (depth > this.limits.maxDepth) {
      throw this.limitFailure(
        RECORD_SCHEMA_PROBLEM_CODES.LIMIT_DEPTH,
        'The record contract exceeds the configured nesting-depth limit.',
        pointer
      );
    }
  }

  private assertNullability(
    policy: RecordContractContributorRegistration['contributor']['nullability'],
    node: ContractNode,
    key: string,
    pointer: RecordContractPointer
  ): void {
    if ((policy === 'non-null' && node.nullable) || (policy === 'nullable' && !node.nullable)) {
      throw this.invalidFailure(
        RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_INVALID,
        `Contributor ${key} output contradicts its declared nullability policy.`,
        pointer
      );
    }
  }

  private validateNodeBounds(node: ContractNode, baseDepth: number, pointer: RecordContractPointer): void {
    try {
      validateContractNode(node, baseDepth, this.limits.maxDepth, this.limits.maxProperties);
    } catch (error) {
      if (error instanceof ContractNodeLimitError) {
        if (error.limit === 'depth') {
          throw this.limitFailure(
            RECORD_SCHEMA_PROBLEM_CODES.LIMIT_DEPTH,
            'Contributor output exceeds the configured nesting-depth limit.',
            pointer
          );
        }
        throw this.limitFailure(
          RECORD_SCHEMA_PROBLEM_CODES.LIMIT_PROPERTIES,
          'Contributor output exceeds the configured property limit.',
          pointer
        );
      }
      throw error;
    }
  }

  private async withTimeout<T>(invoke: () => T | Promise<T>, key: string, pointer: RecordContractPointer): Promise<T> {
    // JavaScript cannot pre-empt a synchronous callback. Charge its measured
    // elapsed time immediately, then give asynchronous completion only the
    // remaining budget and verify total elapsed time again after settlement.
    const startedAt = performance.now();
    const timeoutFailure = (): CompilerFailure =>
      this.limitFailure(
        RECORD_SCHEMA_PROBLEM_CODES.LIMIT_CONTRIBUTOR_TIMEOUT,
        `Record-contract contributor ${key} exceeded its configured timeout.`,
        pointer
      );

    const pending = invoke();
    const synchronousElapsedMs = performance.now() - startedAt;
    if (synchronousElapsedMs > this.limits.contributorTimeoutMs) {
      throw timeoutFailure();
    }

    let timeout: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => reject(timeoutFailure()), this.limits.contributorTimeoutMs - synchronousElapsedMs);
    });
    try {
      const result = await Promise.race([Promise.resolve(pending), timeoutPromise]);
      if (performance.now() - startedAt > this.limits.contributorTimeoutMs) {
        throw timeoutFailure();
      }
      return result;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private invalidFailure(
    code: string,
    message: string,
    pointer: RecordContractPointer,
    componentType?: string
  ): CompilerFailure {
    return new CompilerFailure('invalid-contract', RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT, {
      code,
      severity: 'error',
      message,
      pointer,
      ...(componentType ? { componentType } : {}),
    });
  }

  private limitFailure(
    code: (typeof RECORD_SCHEMA_PROBLEM_CODES)[keyof typeof RECORD_SCHEMA_PROBLEM_CODES],
    message: string,
    pointer: RecordContractPointer,
    componentType?: string
  ): CompilerFailure {
    return new CompilerFailure('limit-exceeded', code, {
      code,
      severity: 'error',
      message,
      pointer,
      ...(componentType ? { componentType } : {}),
    });
  }
}

function containsPermissiveNode(node: ContractNode): boolean {
  switch (node.kind) {
    case 'any':
      return node.reason !== undefined;
    case 'array':
      return containsPermissiveNode(node.items);
    case 'object':
      return Object.values(node.properties).some(containsPermissiveNode);
    case 'conditional':
      return containsPermissiveNode(node.thenNode) || (node.elseNode ? containsPermissiveNode(node.elseNode) : false);
    case 'scalar':
      return false;
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}
