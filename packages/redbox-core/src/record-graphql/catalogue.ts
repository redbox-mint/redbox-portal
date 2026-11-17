import { GraphQLError } from 'graphql';
import type { ContractNode, RecordContract } from '../record-contract';
import { fromTree, fieldName, hash, metadataTypeName, type ReadShape } from './renderer';
import {
  GRID_LIMITS,
  type GridCatalogue,
  type GridField,
  type GridScalar,
  type GridEnvironment,
  type GridSelection,
} from './grid-types';
import { applyReadPresentationHints } from './read-contract';
import { formatRecordGridFingerprint } from '../RecordFormFingerprint';

export function gridError(code: string, message: string): never {
  throw new GraphQLError(message, { extensions: { code } });
}
const recordFields = [
  ['oid', 'OID', 'STRING', 'redboxOid'],
  ['recordType', 'Record type', 'STRING', 'metaMetadata.type'],
  ['workflowStep', 'Workflow stage', 'STRING', 'workflow.stage'],
  ['form', 'Form', 'STRING', 'metaMetadata.form'],
  ['createdOn', 'Created on', 'DATETIME', 'createdOn'],
  ['lastModified', 'Last modified', 'DATETIME', 'lastSaveDate'],
] as const;
export interface CatalogueSnapshot {
  catalogue: GridCatalogue;
  bindings: Map<string, { tokens: string[]; type: GridScalar }>;
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
  output = new Map<
    string,
    {
      label?: string;
      shortLabel?: string;
      groups?: string[];
      vocabulary?: string;
      scalarTypes: Set<GridScalar | 'DATE'>;
      choices: GridField['choices'];
    }
  >(),
  groups: string[] = []
) {
  if (node.annotations?.writeOnly || (shape.kind === 'json' && shape.reason === 'restricted-shape')) return output;
  const id = metadataFieldId(tokens);
  const hint = output.get(id) ?? { choices: [], scalarTypes: new Set<GridScalar | 'DATE'>() };
  const configuredGroups = node.annotations?.extensions?.['x-redbox-group-path'];
  const currentGroups = [
    ...groups,
    ...(Array.isArray(configuredGroups)
      ? configuredGroups.filter((group): group is string => typeof group === 'string')
      : []),
  ];
  hint.groups ??= [...new Set(currentGroups)];
  const shortLabel = node.annotations?.extensions?.['x-redbox-short-label'];
  if (typeof shortLabel === 'string') hint.shortLabel ??= shortLabel;
  if (node.kind === 'scalar') {
    const format = node.annotations?.extensions?.['x-redbox-format'];
    hint.scalarTypes.add(
      node.annotations?.extensions?.['x-redbox-format-conflict'] === true
        ? 'MIXED'
        : node.scalarType === 'string' && format === 'date'
          ? 'DATE'
          : node.scalarType === 'string' && format === 'date-time'
            ? 'DATETIME'
            : scalarType(fromTree(node))
    );
  }
  const label = node.annotations?.extensions?.['x-redbox-label'] ?? node.annotations?.description;
  if (typeof label === 'string' && !hint.label) hint.label = label;
  const vocabulary = node.annotations?.extensions?.['x-redbox-vocabulary'];
  if (typeof vocabulary === 'string') hint.vocabulary ??= vocabulary;
  if (node.kind === 'scalar')
    hint.choices.push(
      ...(node.enum ?? []).filter(value => value !== null).map(value => ({ label: String(value), value }))
    );
  const choices = node.annotations?.extensions?.['x-redbox-choice-labels'];
  if (Array.isArray(choices))
    for (const choice of choices)
      if (
        choice &&
        typeof choice === 'object' &&
        !Array.isArray(choice) &&
        typeof choice.label === 'string' &&
        ['string', 'number', 'boolean'].includes(typeof choice.value)
      )
        hint.choices.push({ label: choice.label, value: choice.value as string | number | boolean });
  output.set(id, hint);
  if (node.kind === 'object' && shape.kind === 'object')
    for (const [key, child] of Object.entries(node.properties))
      if (Object.hasOwn(shape.properties, key))
        nodeHints(
          child,
          shape.properties[key],
          [...tokens, key],
          output,
          typeof label === 'string' && tokens.length ? [...currentGroups, label] : currentGroups
        );
  if (node.kind === 'array' && shape.kind === 'array')
    nodeHints(
      node.items,
      shape.items,
      [...tokens, null],
      output,
      typeof label === 'string' ? [...currentGroups, label] : currentGroups
    );
  if (node.kind === 'conditional') {
    nodeHints(node.thenNode, shape, tokens, output, groups);
    if (node.elseNode) nodeHints(node.elseNode, shape, tokens, output, groups);
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
  if (shape.kind === 'array' && ['string', 'number', 'integer', 'boolean'].includes(shape.items.kind))
    return scalarType(shape.items);
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
export function buildCatalogue(
  contracts: readonly RecordContract[],
  recordType: string,
  stages: readonly string[],
  environment: Pick<GridEnvironment, 'recordTypeLabel' | 'workflowLabels'> = {}
): CatalogueSnapshot {
  const scoped = scopedContracts(contracts, recordType, stages);
  const fields = new Map<string, GridField>();
  const dateFormats = new Map<string, GridScalar | 'DATE'>();
  for (const [name, label, type] of recordFields)
    fields.set(`record:${name}`, {
      id: `record:${name}`,
      path: name,
      label,
      labelKey: null,
      displayLabel: label,
      displayLabelKey: null,
      group: 'Record',
      groupKey: '@data-grids-field-group-record',
      groupPath: ['@data-grids-field-group-record'],
      repeatingSubfield: false,
      repeatingGroupId: null,
      scalarType: type,
      selectable: true,
      availableInAllVariants: true,
      nullable: name !== 'oid',
      nested: false,
      repeating: false,
      filterable: false,
      operators: [],
      sortable: false,
      choices: name === 'workflowStep' ? (environment.workflowLabels ?? []) : [],
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
        const fallbackLabel = String(tokens.at(-1) ?? tokens.at(-2))
          .split(':')
          .at(-1)!
          .replace(/^dmpt[-_]/i, '')
          .replace(/[_-]/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2');
        const property = String(tokens.at(-1) ?? tokens.at(-2));
        const short =
          hint?.shortLabel ??
          (rawLabel?.startsWith('@') ||
          (rawLabel && rawLabel !== property && rawLabel.length <= 80 && !/[?\n<>]/.test(rawLabel))
            ? rawLabel
            : undefined);
        const displayLabel =
          short && !short.startsWith('@')
            ? short
            : fallbackLabel.charAt(0).toUpperCase() + fallbackLabel.slice(1).toLowerCase();
        const groupPath = hint?.groups?.length ? hint.groups : ['@data-grids-field-group-metadata'];
        const rawGroup = groupPath.at(-1)!;
        const group = rawGroup.startsWith('@')
          ? rawGroup === '@data-grids-field-group-metadata'
            ? 'Metadata'
            : rawGroup.slice(1)
          : rawGroup;
        const type =
          hint && (hint.scalarTypes.size > 1 || hint.scalarTypes.has('MIXED'))
            ? 'MIXED'
            : shape.kind === 'string' && (hint?.scalarTypes.has('DATE') || hint?.scalarTypes.has('DATETIME'))
              ? 'DATETIME'
              : scalarType(shape);
        const existing = fields.get(id);
        if (existing) {
          if (existing.repeating !== repeating) existing.scalarType = 'MIXED';
          existing.repeating ||= repeating;
          existing.selectable &&=
            !tokens.includes(null) &&
            (shape.kind === 'array' || shape.kind === 'object'
              ? declaredSelection(shape) !== null
              : !['OBJECT', 'JSON'].includes(type));
          if (existing.scalarType !== type) existing.scalarType = 'MIXED';
          // Calendar dates and instants use the same query input, but distinct
          // persisted meanings must not silently replace one another across forms.
          if (type === 'DATETIME' && dateFormats.get(id) !== [...hint!.scalarTypes][0]) existing.scalarType = 'MIXED';
          existing.selections.push(selection(contract, tokens, shape));
          existing.choices.push(...(hint?.choices ?? []));
        } else {
          if (type === 'DATETIME') dateFormats.set(id, [...hint!.scalarTypes][0]);
          fields.set(id, {
            id,
            path: pointer(tokens),
            label,
            displayLabel,
            displayLabelKey: short?.startsWith('@') ? short : null,
            group,
            groupKey: rawGroup.startsWith('@') ? rawGroup : null,
            groupPath,
            repeatingSubfield: tokens.includes(null),
            repeatingGroupId: tokens.includes(null) ? metadataFieldId(tokens.slice(0, tokens.indexOf(null))) : null,
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
            choices: hint?.choices ?? [],
            ...(hint?.vocabulary ? { vocabulary: hint.vocabulary } : {}),
            selections: [selection(contract, tokens, shape)],
            unavailableReason: null,
          });
        }
        if (fields.size > GRID_LIMITS.catalogueFields)
          gridError('CATALOGUE_LIMIT', 'Field catalogue exceeds its bound; narrow the workflow scope.');
      }
      if (shape.kind === 'object')
        for (const [key, child] of Object.entries(shape.properties)) visit(child, [...tokens, key], repeating);
      if (shape.kind === 'array') visit(shape.items, [...tokens, null], true);
    };
    visit(readShape, [], false);
  }
  const bindings: CatalogueSnapshot['bindings'] = new Map();
  for (const field of fields.values()) {
    field.availableInAllVariants =
      field.id.startsWith('record:') || new Set(field.selections.map(item => item.variant)).size === scoped.length;
    field.choices = [...new Map(field.choices.map(choice => [JSON.stringify(choice.value), choice])).values()];
    if (field.scalarType === 'MIXED') field.selectable = false;
    if (!field.selectable || field.repeating || ['OBJECT', 'JSON'].includes(field.scalarType)) {
      field.unavailableReason = field.repeating ? 'REPEATING_FIELD' : 'NON_SCALAR_FIELD';
      continue;
    }
    if (!field.availableInAllVariants) {
      field.unavailableReason = 'VARIANT_SCOPE_REQUIRED';
      continue;
    }
    const record = recordFields.find(entry => `record:${entry[0]}` === field.id);
    const tokens = record
      ? record[3].split('.')
      : [
          'metadata',
          ...field.path
            .slice(1)
            .split('/')
            .map(token => token.replace(/~1/g, '/').replace(/~0/g, '~')),
        ];
    field.operators =
      field.scalarType === 'STRING'
        ? ['EQ', 'CONTAINS', 'IPREFIX', 'IN', 'EXISTS']
        : field.scalarType === 'BOOLEAN'
          ? ['EQ', 'IN', 'EXISTS']
          : ['EQ', 'IN', 'GT', 'LT', 'BETWEEN', 'EXISTS'];
    field.filterable = true;
    field.sortable = true;
    bindings.set(field.id, { tokens, type: field.scalarType });
  }
  const catalogue: GridCatalogue = {
    recordType,
    recordTypeLabel: environment.recordTypeLabel?.startsWith('@')
      ? recordType
      : environment.recordTypeLabel || recordType,
    recordTypeLabelKey: environment.recordTypeLabel?.startsWith('@') ? environment.recordTypeLabel : null,
    fields: [...fields.values()].sort((a, b) => a.id.localeCompare(b.id)),
    variants: scoped.map(contract => ({
      typeName: metadataTypeName(contract),
      workflowStage: contract.context.workflowStep,
      form: contract.context.form,
    })),
    revision: '',
  };
  applyReadPresentationHints(catalogue, scoped);
  const revision = formatRecordGridFingerprint([
    { ...catalogue, fields: undefined },
    { semantics: 'mongo-record-collection/1' },
    ...catalogue.fields,
    ...scoped,
  ]);
  if (!revision) gridError('CATALOGUE_LIMIT', 'Field catalogue fingerprint exceeds its bound.');
  catalogue.revision = revision;
  return { catalogue, bindings };
}
