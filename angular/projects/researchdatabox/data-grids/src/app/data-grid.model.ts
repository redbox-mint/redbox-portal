import {
  recordGridFilterValue,
  RECORD_GRID_FILTER_LIMITS,
  type RecordGridScalar,
  type RecordGridScalarType,
  type RecordGridOperator,
} from '@researchdatabox/sails-ng-common/dist/src/record-grid-filter';
export { normalizeTimestamp } from '@researchdatabox/sails-ng-common/dist/src/record-grid-filter';

/** UI contracts, independent of AG Grid state and of the HTTP/GraphQL schema. */
export type Scalar = RecordGridScalar;
export type FieldType = 'text' | 'number' | 'datetime' | 'boolean' | 'choice' | 'structured' | 'unavailable';
export type Operator = RecordGridOperator;
export interface GridField {
  group?: string;
  groupPath?: string[];
  repeatingSubfield?: boolean;
  repeatingGroupId?: string;
  selections?: { variant: string; selection: string; responsePath: string[] }[];
  id: string;
  label: string;
  path?: string;
  type: FieldType;
  selectable: boolean;
  repeating?: boolean;
  integer?: boolean;
  partial?: boolean;
  operators: Operator[];
  sortable: boolean;
  choices?: { value: string; label: string }[];
}
export interface GridScope {
  id: string;
  label: string;
  recordType: string;
  recordTypeLabel?: string;
  workflowStage?: string;
  fields: GridField[];
  revision?: string;
}
export type GridScalarType = RecordGridScalarType;
export function scalarTypeFor(field: GridField): GridScalarType | undefined {
  if (field.type === 'text' || field.type === 'choice') return 'STRING';
  if (field.type === 'number') return field.integer ? 'INTEGER' : 'NUMBER';
  if (field.type === 'boolean') return 'BOOLEAN';
  if (field.type === 'datetime') return 'DATETIME';
  return undefined;
}
export interface GridFilter {
  /** Missing only for pre-type-binding saved definitions, which require explicit repair. */
  expectedScalarType?: GridScalarType;
  fieldId: string;
  operator: Operator;
  values: string[];
}
export interface SavedQueryPresentation {
  publishedAs?: import('@researchdatabox/sails-ng-common').PublishedExplorerQuery[];
  updatedAt?: string | null;
  updatedBy?: import('@researchdatabox/sails-ng-common').ExplorerQueryAuthor | null;
}
export interface GridDefinition extends SavedQueryPresentation {
  mode?: 'visual';
  version: 1;
  id?: string;
  revision?: number;
  name: string;
  recordType: string;
  workflowStage?: string;
  columns: string[];
  filters: GridFilter[];
  sort: { fieldId: string; direction: 'asc' | 'desc'; expectedScalarType?: GridScalarType } | null;
  pageSize: number;
}
export type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
export interface RawDefinition extends SavedQueryPresentation {
  version: 1;
  mode: 'graphql';
  id?: string;
  revision?: number;
  name: string;
  document: string;
  variables: { [key: string]: JsonValue };
  resultPath: string[];
}
export type SavedQuery = GridDefinition | RawDefinition;
export interface GridListPage {
  grids: SavedQuery[];
  next: string | null;
}
export interface GridCatalogue {
  scopes: GridScope[];
  /** False means list/save are unsupported, not that no saved grids exist. */
  persistence: boolean;
}
export interface GridRow {
  recordOid?: string;
  oid: string;
  values: Record<string, JsonValue>;
}
export interface GridPage {
  rows: GridRow[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
}
export interface GridQuery {
  definition: GridDefinition;
  filters: { fieldId: string; operator: Operator; value?: Scalar | Scalar[] }[];
  after: string | null;
  revision?: string;
}
export interface GridIssue {
  key: string;
  field?: string;
}
export const PAGE_SIZES = [25, 50];
export const LIMITS = { columns: 30, filters: 10, ...RECORD_GRID_FILTER_LIMITS };

export function emptyGrid(): GridDefinition {
  return { version: 1, mode: 'visual', name: '', recordType: '', columns: [], filters: [], sort: null, pageSize: 25 };
}
export function scopeFor(grid: GridDefinition, scopes: GridScope[]): GridScope | undefined {
  return scopes.find(scope => scope.recordType === grid.recordType && scope.workflowStage === grid.workflowStage);
}
export function copyGrid(grid: GridDefinition): GridDefinition {
  return structuredClone(grid);
}

/** Choice membership is a local catalogue constraint; scalar conversion is shared. */
export function filterValue(filter: GridFilter, field: GridField): Scalar | Scalar[] {
  if (
    field.type === 'choice' &&
    filter.operator !== 'exists' &&
    filter.values.some(value => !field.choices?.some(choice => choice.value === value))
  )
    throw new Error('invalid-choice');
  return recordGridFilterValue(scalarTypeFor(field) ?? '', filter.operator, filter.values);
}

export function validateGrid(grid: GridDefinition, scope?: GridScope): GridIssue[] {
  const issues: GridIssue[] = [];
  if (!grid.name.trim() || grid.name.length > 120) issues.push({ key: 'name-required' });
  if (!scope || scope.recordType !== grid.recordType || scope.workflowStage !== grid.workflowStage)
    return [...issues, { key: 'scope-required' }];
  if (!grid.columns.length || grid.columns.length > LIMITS.columns) issues.push({ key: 'columns-required' });
  if (new Set(grid.columns).size !== grid.columns.length) issues.push({ key: 'duplicate-columns' });
  for (const id of grid.columns) {
    const field = scope.fields.find(item => item.id === id);
    if (!field?.selectable) issues.push({ key: 'unavailable-column', field: field?.label ?? id });
  }
  if (!PAGE_SIZES.includes(grid.pageSize)) issues.push({ key: 'invalid-page-size' });
  if (grid.filters.length > LIMITS.filters) issues.push({ key: 'too-many-filters' });
  for (const filter of grid.filters) {
    const field = scope.fields.find(item => item.id === filter.fieldId);
    if (!field || field.repeating || field.partial || !field.operators.includes(filter.operator)) {
      issues.push({ key: 'unavailable-filter', field: field?.label ?? filter.fieldId });
      continue;
    }
    if (!filter.expectedScalarType || filter.expectedScalarType !== scalarTypeFor(field)) {
      issues.push({ key: 'filter-type-changed', field: field.label });
      continue;
    }
    try {
      filterValue(filter, field);
    } catch {
      issues.push({ key: 'invalid-filter-value', field: field.label });
    }
  }
  if (grid.sort && !scope.fields.some(field => field.id === grid.sort?.fieldId && field.sortable && !field.repeating))
    issues.push({ key: 'unavailable-sort', field: grid.sort.fieldId });
  if (grid.sort) {
    const field = scope.fields.find(field => field.id === grid.sort?.fieldId);
    if (field && (!grid.sort.expectedScalarType || grid.sort.expectedScalarType !== scalarTypeFor(field)))
      issues.push({ key: 'sort-type-changed', field: field.label });
  }
  return issues;
}

export function queryFor(grid: GridDefinition, scope: GridScope, after: string | null): GridQuery {
  if (validateGrid(grid, scope).length) throw new Error('Invalid grid configuration');
  return {
    definition: copyGrid(grid),
    after,
    revision: scope.revision,
    filters: grid.filters.map(filter => ({
      fieldId: filter.fieldId,
      operator: filter.operator,
      value: filterValue(filter, scope.fields.find(field => field.id === filter.fieldId)!),
    })),
  };
}

/** Bound provider results; never silently show a malformed continuation or duplicate record. */
export function validatePage(page: GridPage, size: number, after: string | null): void {
  if (
    !Array.isArray(page.rows) ||
    page.rows.length > size ||
    page.rows.some(
      row =>
        !row ||
        typeof row.oid !== 'string' ||
        !row.oid ||
        !row.values ||
        Object.values(row.values).some(value => !validCellValue(value))
    ) ||
    new Set(page.rows.map(row => row.oid)).size !== page.rows.length ||
    typeof page.pageInfo?.hasNextPage !== 'boolean' ||
    (page.pageInfo.hasNextPage &&
      (!page.rows.length ||
        typeof page.pageInfo.endCursor !== 'string' ||
        !page.pageInfo.endCursor ||
        page.pageInfo.endCursor === after))
  ) {
    throw new Error('Invalid grid page');
  }
}

/** Bounded JSON cells retain list/group structure without manufacturing record rows. */
export function validCellValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 30) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(item => validCellValue(item, depth + 1));
  return !!value && typeof value === 'object' && Object.values(value).every(item => validCellValue(item, depth + 1));
}

/** Prefer common record columns, retaining the catalogue order only as a last resort. */
export function defaultColumns(fields: GridField[]): string[] {
  const available = fields.filter(field => field.selectable && !field.repeating && !field.repeatingSubfield);
  const title =
    available.find(field => field.id === 'metadata:/title') ??
    available.find(field => /(^|[:/])title$/i.test(field.id));
  const ids = [title?.id, 'record:workflowStep', 'record:lastModified', 'record:oid'].filter(
    (id): id is string => !!id && available.some(f => f.id === id)
  );
  return ids.length ? [...new Set(ids)] : available.slice(0, 4).map(field => field.id);
}
export function editableQuery(query: SavedQuery): SavedQuery {
  const { publishedAs, updatedAt, updatedBy, ...definition } = query;
  return definition;
}
