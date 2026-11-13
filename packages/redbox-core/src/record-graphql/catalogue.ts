import { GraphQLError } from 'graphql';
import type { ContractNode, RecordContract } from '../record-contract';
import type { SolrFieldDefinition } from '../config/solr.config';
import { SOLR_RECORD_GRID_FIELDS } from '../config/solr.config';
import { fromTree, fieldName, hash, metadataTypeName, type ReadShape } from './renderer';
import {
  GRID_LIMITS,
  type GridCatalogue,
  type GridField,
  type GridScalar,
  type GridEnvironment,
  type GridOperator,
  type GridSelection,
} from './grid-types';
import { gridIndexBindings } from './index-bindings';
import { formatRecordFormFingerprint } from '../RecordFormFingerprint';

export function gridError(code: string, message: string): never {
  throw new GraphQLError(message, { extensions: { code } });
}
const fieldPattern = /^[A-Za-z_][A-Za-z0-9_.-]{0,199}$/;
export function safeIndexField(name: string): boolean {
  return fieldPattern.test(name);
}
export function indexField(environment: GridEnvironment, name: string): SolrFieldDefinition | undefined {
  const explicit = environment.schema.fields.find(field => field.name === name);
  if (explicit) return explicit;
  const matches = environment.schema.dynamicFields
    .filter(field => {
      if (field.name === '*') return true;
      if (field.name.startsWith('*')) return name.endsWith(field.name.slice(1));
      return field.name.endsWith('*') && name.startsWith(field.name.slice(0, -1));
    })
    .sort((a, b) => b.name.length - a.name.length);
  return matches[0] && { ...matches[0], name };
}
export function indexClass(environment: GridEnvironment, field: SolrFieldDefinition): string {
  return (
    environment.schema.fieldTypes
      .find(type => type.name === field.type)
      ?.class.split('.')
      .at(-1) ?? ''
  );
}
const recordFields = [
  ['oid', 'OID', 'STRING', 'redbox_grid_oid'],
  ['recordType', 'Record type', 'STRING', 'redbox_grid_type'],
  ['workflowStep', 'Workflow stage', 'STRING', 'redbox_grid_stage'],
  ['form', 'Form', 'STRING', 'redbox_grid_form'],
  ['createdOn', 'Created on', 'DATETIME', 'redbox_grid_created'],
  ['lastModified', 'Last modified', 'DATETIME', 'redbox_grid_modified'],
] as const;
export interface CatalogueSnapshot {
  catalogue: GridCatalogue;
  bindings: Map<string, SolrFieldDefinition>;
}

export function scopedContracts(
  contracts: readonly RecordContract[],
  recordType: string,
  stages: readonly string[] = []
): readonly RecordContract[] {
  if (typeof recordType !== 'string' || !recordType || recordType.length > 200)
    gridError('INVALID_SCOPE', 'Choose a registered record type.');
  if (
    !Array.isArray(stages) ||
    stages.length > GRID_LIMITS.stages ||
    stages.some(stage => typeof stage !== 'string' || !stage || stage.length > 200) ||
    new Set(stages).size !== stages.length
  )
    gridError('INVALID_SCOPE', 'Workflow scope is invalid or exceeds its bound.');
  const types = contracts.filter(contract => contract.context.recordType === recordType);
  if (!types.length) gridError('UNKNOWN_RECORD_TYPE', 'No readable contracts are registered for this record type.');
  for (const stage of stages)
    if (!types.some(contract => contract.context.workflowStep === stage))
      gridError('UNKNOWN_WORKFLOW_STAGE', 'Workflow stage has no registered read contract.');
  return types.filter(contract => !stages.length || stages.includes(contract.context.workflowStep));
}

function pointer(tokens: readonly (string | null)[]): string {
  return '/' + tokens.map(token => (token === null ? '*' : token.replace(/~/g, '~0').replace(/\//g, '~1'))).join('/');
}
export function metadataFieldId(tokens: readonly (string | null)[]): string {
  return tokens.includes(null) ? `metadata-list:${JSON.stringify(tokens)}` : `metadata:${pointer(tokens)}`;
}
function nodeHints(
  node: ContractNode,
  shape: ReadShape,
  tokens: readonly (string | null)[] = [],
  output = new Map<string, { label?: string; choices: Array<string | number | boolean> }>()
) {
  if (node.annotations?.writeOnly || (shape.kind === 'json' && shape.reason === 'restricted-shape')) return output;
  const id = metadataFieldId(tokens);
  const hint = output.get(id) ?? { choices: [] };
  const label = node.annotations?.extensions?.['x-redbox-label'] ?? node.annotations?.description;
  if (typeof label === 'string' && !hint.label) hint.label = label;
  if (node.kind === 'scalar') hint.choices.push(...(node.enum ?? []));
  output.set(id, hint);
  if (node.kind === 'object' && shape.kind === 'object')
    for (const [key, child] of Object.entries(node.properties))
      if (Object.hasOwn(shape.properties, key)) nodeHints(child, shape.properties[key], [...tokens, key], output);
  if (node.kind === 'array' && shape.kind === 'array') nodeHints(node.items, shape.items, [...tokens, null], output);
  if (node.kind === 'conditional') {
    nodeHints(node.thenNode, shape, tokens, output);
    if (node.elseNode) nodeHints(node.elseNode, shape, tokens, output);
  }
  return output;
}
// Only declared shapes can be projected in collection reads; opaque JSON remains unavailable.
function declaredSelection(shape: ReadShape): string | null {
  if (shape.kind === 'json') return null;
  if (shape.kind === 'array') return declaredSelection(shape.items);
  if (shape.kind !== 'object') return '';
  const children = Object.entries(shape.properties).map(([name, child]) => {
    const nested = declaredSelection(child);
    return nested === null ? null : `${fieldName(name)}${nested ? ` { ${nested} }` : ''}`;
  });
  return children.some(child => child === null) ? null : children.join(' ');
}
function selection(contract: RecordContract, tokens: readonly (string | null)[], shape: ReadShape): GridSelection {
  const names = tokens.filter((token): token is string => token !== null);
  const aliases = names.map((_, index) => `g_${hash(JSON.stringify([contract.context, names.slice(0, index + 1)]))}`);
  // Keep whole-object results separate from aliases used by selected child columns.
  if (shape.kind === 'object') aliases[aliases.length - 1] += '_object';
  let result = shape.kind === 'array' || shape.kind === 'object' ? (declaredSelection(shape) ?? '') : '';
  for (let index = names.length - 1; index >= 0; index--)
    result = `${aliases[index]}: ${fieldName(names[index])}${result ? ` { ${result} }` : ''}`;
  return {
    variant: metadataTypeName(contract),
    workflowStage: contract.context.workflowStep,
    form: contract.context.form,
    selection: `... on ${metadataTypeName(contract)} { ${result} }`,
    responsePath: ['metadata', ...aliases],
  };
}
function scalarType(shape: ReadShape): GridScalar {
  switch (shape.kind) {
    case 'string':
      return 'STRING';
    case 'number':
      return 'NUMBER';
    case 'integer':
      return 'INTEGER';
    case 'boolean':
      return 'BOOLEAN';
    case 'object':
      return 'OBJECT';
    default:
      return 'JSON';
  }
}
function verifiedBinding(environment: GridEnvironment, field: GridField): string | undefined {
  const record = recordFields.find(entry => `record:${entry[0]}` === field.id);
  if (record) return record[3];
  const target = gridIndexBindings(environment.config).get(field.id)?.field;
  // Solr copy rules run after preIndex and can add unrelated or duplicate values.
  return target && !environment.schema.copyFields?.some(copy => matchesField(copy.dest, target)) ? target : undefined;
}
function matchesField(pattern: string, name: string): boolean {
  if (pattern === name || pattern === '*') return true;
  if (pattern.startsWith('*')) return name.endsWith(pattern.slice(1));
  return pattern.endsWith('*') && name.startsWith(pattern.slice(0, -1));
}
export function validateGridIndex(environment: GridEnvironment): void {
  if (
    environment.schema.copyFields?.some(copy =>
      [...SOLR_RECORD_GRID_FIELDS.map(field => field.name), environment.schema.uniqueKey].some(name =>
        matchesField(copy.dest, name)
      )
    )
  )
    gridError('UNSUPPORTED_SEARCH_INDEX', 'Search copy rules must not overwrite protected collection identifiers.');
  const unique = indexField(environment, environment.schema.uniqueKey);
  if (
    !safeIndexField(environment.schema.uniqueKey) ||
    !unique ||
    !unique.indexed ||
    !unique.stored ||
    unique.multiValued === true ||
    unique.docValues !== true ||
    indexClass(environment, unique) !== 'StrField'
  )
    gridError(
      'UNSUPPORTED_SEARCH_INDEX',
      'The search unique key must be a stored, single-valued exact string with DocValues.'
    );
  for (const expected of SOLR_RECORD_GRID_FIELDS) {
    const actual = environment.schema.fields.find(field => field.name === expected.name);
    const expectedClass = expected.type === 'pdate' ? 'DatePointField' : 'StrField';
    if (
      !actual ||
      !actual.indexed ||
      !actual.stored ||
      actual.multiValued === true ||
      actual.docValues !== true ||
      indexClass(environment, actual) !== expectedClass
    )
      gridError(
        'REINDEX_REQUIRED',
        'Record-grid index fields are unavailable. Reconcile the schema and reindex records before collection reads.'
      );
  }
}
export function buildCatalogue(
  contracts: readonly RecordContract[],
  recordType: string,
  stages: readonly string[],
  environment: GridEnvironment
): CatalogueSnapshot {
  const scoped = scopedContracts(contracts, recordType, stages);
  validateGridIndex(environment);
  const fields = new Map<string, GridField>();
  for (const [name, label, type] of recordFields)
    fields.set(`record:${name}`, {
      id: `record:${name}`,
      path: name,
      label,
      labelKey: null,
      scalarType: type,
      selectable: true,
      availableInAllVariants: true,
      nullable: name !== 'oid',
      nested: false,
      repeating: false,
      filterable: false,
      operators: [],
      sortable: false,
      choices: [],
      selections: [{ variant: '', workflowStage: '', form: '', selection: name, responsePath: [name] }],
      unavailableReason: null,
    });
  for (const contract of scoped) {
    const readShape = fromTree(contract.root);
    const hints = nodeHints(contract.root, readShape);
    const visit = (shape: ReadShape, tokens: readonly (string | null)[], repeating: boolean): void => {
      if (shape.kind === 'json' && shape.reason === 'restricted-shape') return;
      repeating ||= shape.kind === 'array';
      if (tokens.length) {
        const id = metadataFieldId(tokens);
        const hint = hints.get(id);
        const rawLabel = hint?.label;
        const label =
          rawLabel && !rawLabel.startsWith('@')
            ? rawLabel
            : String(tokens.at(-1) ?? tokens.at(-2))
                .replace(/[_-]/g, ' ')
                .replace(/([a-z])([A-Z])/g, '$1 $2');
        const type = scalarType(shape);
        const existing = fields.get(id);
        if (existing) {
          existing.repeating ||= repeating;
          existing.selectable &&=
            !tokens.includes(null) &&
            (shape.kind === 'array' || shape.kind === 'object'
              ? declaredSelection(shape) !== null
              : !['OBJECT', 'JSON'].includes(type));
          if (existing.scalarType !== type) existing.scalarType = 'MIXED';
          existing.selections.push(selection(contract, tokens, shape));
          existing.choices.push(...(hint?.choices ?? []).map(value => ({ label: String(value), value })));
        } else
          fields.set(id, {
            id,
            path: pointer(tokens),
            label,
            labelKey: rawLabel?.startsWith('@') ? rawLabel : null,
            scalarType: type,
            availableInAllVariants: false,
            selectable:
              !tokens.includes(null) &&
              (shape.kind === 'array' || shape.kind === 'object'
                ? declaredSelection(shape) !== null
                : !['OBJECT', 'JSON'].includes(type)),
            nullable: true,
            nested: tokens.length > 1,
            repeating,
            filterable: false,
            operators: [],
            sortable: false,
            choices: (hint?.choices ?? []).map(value => ({ label: String(value), value })),
            selections: [selection(contract, tokens, shape)],
            unavailableReason: null,
          });
        if (fields.size > GRID_LIMITS.catalogueFields)
          gridError('CATALOGUE_LIMIT', 'Field catalogue exceeds its bound; narrow the workflow scope.');
      }
      if (shape.kind === 'object')
        for (const [key, child] of Object.entries(shape.properties)) visit(child, [...tokens, key], repeating);
      if (shape.kind === 'array') visit(shape.items, [...tokens, null], true);
    };
    visit(readShape, [], false);
  }
  const bindings = new Map<string, SolrFieldDefinition>();
  for (const field of fields.values()) {
    field.availableInAllVariants =
      field.id.startsWith('record:') || new Set(field.selections.map(item => item.variant)).size === scoped.length;
    field.choices = [...new Map(field.choices.map(choice => [JSON.stringify(choice.value), choice])).values()];
    if (field.scalarType === 'MIXED') field.selectable = false;
    if (!field.selectable || field.repeating || field.scalarType === 'OBJECT') {
      field.unavailableReason = field.repeating ? 'REPEATING_FIELD' : 'NON_SCALAR_FIELD';
      continue;
    }
    if (!field.availableInAllVariants) {
      field.unavailableReason = 'VARIANT_SCOPE_REQUIRED';
      continue;
    }
    const target = verifiedBinding(environment, field);
    const indexed = target ? indexField(environment, target) : undefined;
    if (!indexed?.indexed) {
      field.unavailableReason = 'NO_VERIFIED_INDEX_MAPPING';
      continue;
    }
    const kind = indexClass(environment, indexed);
    let ops: GridOperator[] = [];
    if (kind === 'StrField' && field.scalarType === 'STRING') ops = ['EQ', 'CONTAINS', 'IN', 'EXISTS'];
    if (kind === 'BoolField' && field.scalarType === 'BOOLEAN') ops = ['EQ', 'IN', 'EXISTS'];
    if (
      ['IntPointField', 'LongPointField', 'DoublePointField', 'FloatPointField'].includes(kind) &&
      ['NUMBER', 'INTEGER'].includes(field.scalarType)
    )
      ops = ['EQ', 'IN', 'GT', 'LT', 'BETWEEN', 'EXISTS'];
    if (kind === 'DatePointField' && ['STRING', 'DATETIME'].includes(field.scalarType)) {
      field.scalarType = 'DATETIME';
      ops = ['EQ', 'IN', 'GT', 'LT', 'BETWEEN', 'EXISTS'];
    }
    if (kind === 'TextField' && field.scalarType === 'STRING') ops = ['EXISTS'];
    field.operators = ops;
    field.filterable = ops.length > 0;
    field.sortable =
      ops.length > 0 && kind !== 'TextField' && indexed.multiValued !== true && indexed.docValues === true;
    field.unavailableReason = ops.length ? null : 'UNSUPPORTED_INDEX_TYPE';
    if (ops.length) bindings.set(field.id, indexed);
  }
  const catalogue: GridCatalogue = {
    recordType,
    fields: [...fields.values()].sort((a, b) => a.id.localeCompare(b.id)),
    variants: scoped.map(contract => ({
      typeName: metadataTypeName(contract),
      workflowStage: contract.context.workflowStep,
      form: contract.context.form,
    })),
    revision: '',
  };
  const revision = formatRecordFormFingerprint({
    catalogue,
    index: environment.schema,
    config: environment.config,
    contracts: scoped,
  });
  if (!revision) gridError('CATALOGUE_LIMIT', 'Field catalogue fingerprint exceeds its bound.');
  catalogue.revision = revision;
  return { catalogue, bindings };
}
