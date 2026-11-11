import {
  GridDefinition,
  SavedQuery,
  JsonValue,
  validCellValue,
  GridFilter,
  GridScalarType,
  GridField,
  GridPage,
  GridQuery,
  GridScope,
  Operator,
  queryFor,
  Scalar,
  validatePage,
  scalarTypeFor,
} from './data-grid.model';
import { GridRequestError } from './data-grid-source';

export interface FieldSelection {
  variant: string;
  selection: string;
  responsePath: string[];
}
export interface DiscoveredField extends GridField {
  selections: FieldSelection[];
}
export interface Discovery {
  revision: string;
  stages: string[];
  fields: DiscoveredField[];
}
const operators: Operator[] = ['eq', 'contains', 'in', 'gt', 'lt', 'between', 'exists'];
const invalid = (): never => {
  throw new GridRequestError('invalid-response');
};
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : invalid();
}
export function string(value: unknown): string {
  return typeof value === 'string' ? value : invalid();
}
function boolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : invalid();
}
export function scopeId(type: string, stage?: string): string {
  return JSON.stringify([type, stage ?? null]);
}

export const FIELD_PROPERTIES = `id path label labelKey scalarType repeating selectable availableInAllVariants
  filterable operators sortable choices { label value }`;
export function discoveryQuery(selections: boolean): string {
  return `query GridFields($type: String!, $stages: [String!], $ids: [ID!]) {
    recordFields(recordType: $type, workflowStages: $stages, ids: $ids) {
      revision variants { workflowStage }
      fields { ${FIELD_PROPERTIES} ${selections ? 'selections { variant selection responsePath }' : ''} }
    }
  }`;
}
export function parseDiscovery(value: unknown, translate: (key: string) => string): Discovery {
  const data = object(value);
  const fields = array(data['fields']).map(value => {
    const field = object(value);
    const scalar = string(field['scalarType']);
    const type: GridField['type'] =
      scalar === 'BOOLEAN'
        ? 'boolean'
        : scalar === 'DATETIME'
          ? 'datetime'
          : ['NUMBER', 'INTEGER'].includes(scalar)
            ? 'number'
            : scalar === 'STRING'
              ? 'text'
              : (boolean(field['repeating']) || scalar === 'OBJECT') && boolean(field['selectable'])
                ? 'structured'
                : 'unavailable';
    const label = string(field['label']);
    const key = field['labelKey'];
    const translated = typeof key === 'string' && key ? translate(key) : '';
    const allVariants = boolean(field['availableInAllVariants']);
    return {
      id: string(field['id']),
      path: typeof field['path'] === 'string' ? field['path'] : undefined,
      label: translated && translated !== key && translated !== String(key).replace(/^@/, '') ? translated : label,
      type,
      integer: scalar === 'INTEGER',
      partial: !allVariants,
      repeating: boolean(field['repeating']),
      selectable:
        boolean(field['selectable']) &&
        (boolean(field['repeating']) ||
          scalar === 'OBJECT' ||
          ['STRING', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATETIME'].includes(scalar)),
      operators: array(field['operators'])
        .map(value => string(value).toLowerCase())
        .filter(
          (value): value is Operator =>
            operators.includes(value as Operator) &&
            !boolean(field['repeating']) &&
            scalar !== 'OBJECT' &&
            allVariants &&
            boolean(field['filterable'])
        ),
      sortable: boolean(field['sortable']) && !boolean(field['repeating']) && scalar !== 'OBJECT' && allVariants,
      choices: array(field['choices']).map(value => {
        const choice = object(value);
        const choiceValue = choice['value'];
        if (!['string', 'number', 'boolean'].includes(typeof choiceValue)) return invalid();
        return { label: string(choice['label']), value: String(choiceValue) };
      }),
      selections:
        field['selections'] === undefined
          ? []
          : array(field['selections']).map(value => {
              const selection = object(value);
              const path = array(selection['responsePath']).map(string);
              if (!path.length || path.some(segment => !segment)) return invalid();
              return {
                variant: string(selection['variant']),
                selection: string(selection['selection']),
                responsePath: path,
              };
            }),
    };
  });
  if (new Set(fields.map(field => field.id)).size !== fields.length) return invalid();
  return {
    revision: string(data['revision']),
    fields,
    stages: [...new Set(array(data['variants']).map(value => string(object(value)['workflowStage'])))],
  };
}

/** Typed values and all user input stay in variables, never in executable query text. */
export function collectionRequest(request: GridQuery, scope: GridScope, discovery: Discovery) {
  if (request.revision !== discovery.revision) throw new GridRequestError('schema-changed');
  if (
    request.definition.filters.some(
      filter =>
        !filter.expectedScalarType ||
        discovery.fields.some(
          field => field.id === filter.fieldId && filter.expectedScalarType !== scalarTypeFor(field)
        )
    )
  )
    throw new GridRequestError('filter-type-changed');
  const sort = request.definition.sort;
  if (
    sort &&
    (!sort.expectedScalarType ||
      discovery.fields.some(field => field.id === sort.fieldId && sort.expectedScalarType !== scalarTypeFor(field)))
  )
    throw new GridRequestError('sort-type-changed');
  const current = queryFor(request.definition, { ...scope, fields: discovery.fields }, request.after);
  const typed = (value: Scalar, fieldId: string) => {
    const field = discovery.fields.find(field => field.id === fieldId)!;
    return {
      [field.type === 'datetime'
        ? 'dateTime'
        : field.type === 'number'
          ? 'number'
          : field.type === 'boolean'
            ? 'boolean'
            : 'text']: value,
    };
  };
  const filters = current.filters.map(filter => {
    const value = filter.value!;
    const operand =
      filter.operator === 'exists' || filter.operator === 'contains'
        ? value
        : filter.operator === 'in'
          ? (value as Scalar[]).map(value => typed(value, filter.fieldId))
          : filter.operator === 'between'
            ? { from: typed((value as Scalar[])[0], filter.fieldId), to: typed((value as Scalar[])[1], filter.fieldId) }
            : typed(value as Scalar, filter.fieldId);
    return { field: filter.fieldId, [filter.operator]: operand };
  });
  const fields = request.definition.columns.map(id => discovery.fields.find(field => field.id === id)!);
  if (fields.some(field => !field.selections.length)) return invalid();
  const selections = fields.flatMap(field => field.selections);
  const fragments = [
    ...new Set(selections.filter(item => item.responsePath[0] === 'metadata').map(item => item.selection)),
  ];
  const envelope = [
    ...new Set(selections.filter(item => item.responsePath[0] !== 'metadata').map(item => item.selection)),
  ];
  return {
    query: `query GridPage($type: String!, $stages: [String!], $filters: [RecordFilterInput!], $sort: [RecordSortInput!], $first: Int, $after: String) {
      records(recordType: $type, workflowStages: $stages, filters: $filters, sort: $sort, first: $first, after: $after) {
        nodes { oid ${envelope.join('\n')} metadata { __typename ${fragments.join('\n')} } }
        hasNextPage endCursor
      }
    }`,
    variables: {
      type: scope.recordType,
      stages: scope.workflowStage ? [scope.workflowStage] : undefined,
      filters,
      sort: request.definition.sort
        ? [{ field: request.definition.sort.fieldId, direction: request.definition.sort.direction.toUpperCase() }]
        : [],
      first: request.definition.pageSize,
      after: request.after,
    },
  };
}
export function parsePage(value: unknown, request: GridQuery, fields: DiscoveredField[]): GridPage {
  const data = object(value);
  const rows = array(data['nodes']).map(value => {
    const node = object(value);
    const values: Record<string, JsonValue> = Object.create(null);
    for (const id of request.definition.columns) {
      const field = fields.find(field => field.id === id)!;
      if (node['metadata'] !== null && node['metadata'] !== undefined) string(object(node['metadata'])['__typename']);
      const selection = field.selections.find(
        item =>
          item.responsePath[0] !== 'metadata' ||
          (node['metadata'] && object(node['metadata'])['__typename'] === item.variant)
      );
      let result: unknown = null;
      if (selection) {
        result = node;
        for (const segment of selection.responsePath) {
          if (result === null) break;
          const parent = object(result);
          if (!Object.prototype.hasOwnProperty.call(parent, segment)) return invalid();
          result = parent[segment];
        }
      }
      if (
        !field.repeating &&
        field.type !== 'structured' &&
        result !== null &&
        (typeof result !== (field.type === 'number' ? 'number' : field.type === 'boolean' ? 'boolean' : 'string') ||
          (typeof result === 'number' &&
            (!Number.isFinite(result) || (field.integer && !Number.isSafeInteger(result)))))
      )
        return invalid();
      if (
        !validCellValue(result) ||
        (field.repeating && result !== null && !Array.isArray(result)) ||
        (!field.repeating &&
          field.type === 'structured' &&
          result !== null &&
          (typeof result !== 'object' || Array.isArray(result)))
      )
        return invalid();
      values[id] = result;
    }
    return { oid: string(node['oid']), values };
  });
  const page = {
    rows,
    pageInfo: {
      hasNextPage: boolean(data['hasNextPage']),
      endCursor: data['endCursor'] === null ? null : string(data['endCursor']),
    },
  };
  validatePage(page, request.definition.pageSize, request.after);
  return page;
}

/** Parse the entire persisted transport shape before exposing it to editor bindings. */
export function parseSavedDefinition(value: unknown): GridDefinition {
  const grid = object(value);
  const keys = (object: Record<string, unknown>, allowed: string[]) => {
    if (Object.keys(object).some(key => !allowed.includes(key))) invalid();
  };
  keys(grid, [
    'mode',
    'version',
    'id',
    'revision',
    'name',
    'recordType',
    'workflowStage',
    'columns',
    'filters',
    'sort',
    'pageSize',
  ]);
  const boundedString = (value: unknown, max: number): string => {
    const result = string(value);
    return result.length > 0 && result.length <= max ? result : invalid();
  };
  const id = string(grid['id']);
  const revision = grid['revision'],
    pageSize = grid['pageSize'];
  if (
    !/^[a-f0-9]{24}$/.test(id) ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    grid['version'] !== 1 ||
    (pageSize !== 25 && pageSize !== 50)
  )
    return invalid();
  if (grid['mode'] !== undefined && grid['mode'] !== 'visual') return invalid();
  const name = boundedString(grid['name'], 120);
  if (!name.trim()) return invalid();
  const columns = array(grid['columns']).map(value => boundedString(value, 512));
  if (!columns.length || columns.length > 30 || new Set(columns).size !== columns.length) return invalid();
  const parseOperator = (value: unknown): Operator => {
    switch (value) {
      case 'eq':
      case 'contains':
      case 'in':
      case 'gt':
      case 'lt':
      case 'between':
      case 'exists':
        return value;
      default:
        return invalid();
    }
  };
  const parseScalar = (value: unknown): GridScalarType | undefined => {
    switch (value) {
      case undefined:
      case 'STRING':
      case 'NUMBER':
      case 'INTEGER':
      case 'BOOLEAN':
      case 'DATETIME':
        return value;
      default:
        return invalid();
    }
  };
  const filters: GridFilter[] = array(grid['filters']).map(value => {
    const filter = object(value);
    keys(filter, ['fieldId', 'operator', 'values', 'expectedScalarType']);
    const operator = parseOperator(filter['operator']);
    const values = array(filter['values']).map(string);
    if (
      !values.length ||
      values.length > 20 ||
      values.some(value => new TextEncoder().encode(value).length > 256) ||
      (operator !== 'in' && values.length !== (operator === 'between' ? 2 : 1)) ||
      (operator === 'exists' && !['true', 'false'].includes(values[0])) ||
      (operator === 'contains' && !values[0])
    )
      return invalid();
    return {
      fieldId: boundedString(filter['fieldId'], 512),
      operator,
      values,
      ...(filter['expectedScalarType'] === undefined
        ? {}
        : { expectedScalarType: parseScalar(filter['expectedScalarType']) }),
    };
  });
  if (filters.length > 10) return invalid();
  let sort: GridDefinition['sort'] = null;
  if (grid['sort'] !== null) {
    const value = object(grid['sort']);
    keys(value, ['fieldId', 'direction', 'expectedScalarType']);
    const direction = value['direction'];
    if (direction !== 'asc' && direction !== 'desc') return invalid();
    sort = {
      fieldId: boundedString(value['fieldId'], 512),
      direction,
      ...(value['expectedScalarType'] === undefined
        ? {}
        : { expectedScalarType: parseScalar(value['expectedScalarType']) }),
    };
  }
  return {
    ...(grid['mode'] === 'visual' ? { mode: 'visual' as const } : {}),
    version: 1,
    id,
    revision,
    name,
    recordType: boundedString(grid['recordType'], 120),
    ...(grid['workflowStage'] === undefined ? {} : { workflowStage: boundedString(grid['workflowStage'], 120) }),
    columns,
    filters,
    sort,
    pageSize,
  };
}

export function parseSavedQuery(value: unknown): SavedQuery {
  const grid = object(value);
  if (grid['mode'] !== 'graphql') return parseSavedDefinition(value);
  if (
    Object.keys(grid).some(
      key => !['version', 'mode', 'id', 'revision', 'name', 'document', 'variables', 'resultPath'].includes(key)
    )
  )
    return invalid();
  const id = string(grid['id']),
    revision = grid['revision'];
  const name = string(grid['name']),
    document = string(grid['document']);
  const variables = grid['variables'];
  const path = array(grid['resultPath']).map(string);
  if (
    grid['version'] !== 1 ||
    !/^[a-f0-9]{24}$/.test(id) ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    !name.trim() ||
    name.length > 120 ||
    !document ||
    path.length > 12 ||
    path.some(key => !/^[_A-Za-z][_0-9A-Za-z]*$/.test(key)) ||
    new TextEncoder().encode(JSON.stringify(grid)).length > 66000
  )
    return invalid();
  const parsed = parseQueryVariables(variables);
  return { version: 1, mode: 'graphql', id, revision, name, document, variables: parsed, resultPath: path };
}

/** Shared by the persisted transport parser and the editable JSON-variable validation. */
export function parseQueryVariables(value: unknown): { [key: string]: JsonValue } {
  const json = (value: unknown, depth = 0): JsonValue => {
    if (depth > 30) throw new GridRequestError('variables-depth');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : invalid();
    if (Array.isArray(value)) return value.map(item => json(item, depth + 1));
    const result: { [key: string]: JsonValue } = Object.create(null);
    for (const [key, entry] of Object.entries(object(value))) result[key] = json(entry, depth + 1);
    return result;
  };

  const result: { [key: string]: JsonValue } = Object.create(null);
  for (const [key, entry] of Object.entries(object(value))) result[key] = json(entry);
  return result;
}
