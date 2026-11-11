import type { SolrCoreConfig, SolrFieldDefinition } from '../config/solr.config';
import type { ReadCaller } from './read-record';

export const COLLECTION_ROW = Symbol('record-grid-row');

export const GRID_LIMITS = Object.freeze({
  pageSize: 50,
  defaultPageSize: 25,
  filters: 10,
  sorts: 3,
  values: 20,
  valueBytes: 256,
  stages: 20,
  catalogueFields: 1_000,
  fieldIds: 50,
  candidates: 200,
  batchSize: 50,
  cursorBytes: 8_192,
  cursorAgeMs: 3_600_000,
});
export type GridScalar = 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'DATETIME' | 'OBJECT' | 'JSON' | 'MIXED';
export type GridOperator = 'EQ' | 'CONTAINS' | 'IPREFIX' | 'IN' | 'GT' | 'LT' | 'BETWEEN' | 'EXISTS';
export interface GridValue {
  text?: string;
  number?: number;
  boolean?: boolean;
  dateTime?: string;
}
export interface GridFilter {
  field: string;
  eq?: GridValue;
  contains?: string;
  iprefix?: string;
  in?: GridValue[];
  gt?: GridValue;
  lt?: GridValue;
  between?: { from: GridValue; to: GridValue };
  exists?: boolean;
}
export interface GridSort {
  field: string;
  direction: 'ASC' | 'DESC';
}
export interface GridQuery {
  recordType: string;
  workflowStages?: string[];
  filters?: GridFilter[];
  sort?: GridSort[];
  first?: number;
  after?: string;
}
export interface GridSelection {
  variant: string;
  workflowStage: string;
  form: string;
  selection: string;
  responsePath: string[];
}
export interface GridField {
  id: string;
  path: string;
  label: string;
  labelKey: string | null;
  /** Additive presentation hints; existing label/path/selection semantics remain. */
  displayLabel?: string;
  displayLabelKey?: string | null;
  group?: string;
  groupKey?: string | null;
  groupPath?: string[];
  repeatingSubfield?: boolean;
  repeatingGroupId?: string | null;
  scalarType: GridScalar;
  selectable: boolean;
  availableInAllVariants: boolean;
  nullable: boolean;
  nested: boolean;
  repeating: boolean;
  filterable: boolean;
  operators: GridOperator[];
  sortable: boolean;
  choices: Array<{ label: string; value: string | number | boolean }>;
  selections: GridSelection[];
  unavailableReason: string | null;
}
export interface GridVariant {
  typeName: string;
  workflowStage: string;
  form: string;
}
export interface GridCatalogue {
  recordType: string;
  recordTypeLabel?: string;
  recordTypeLabelKey?: string | null;
  revision: string;
  fields: GridField[];
  variants: GridVariant[];
}
export interface GridIndexSchema {
  copyFields?: Array<{ source: string; dest: string }>;
  uniqueKey: string;
  fields: SolrFieldDefinition[];
  fieldTypes: Array<{ name: string; class: string }>;
  dynamicFields: SolrFieldDefinition[];
}
export interface GridIndexPage {
  oids: string[];
  nextCursor: string;
  exhausted: boolean;
}
export interface GridEnvironment {
  recordTypeLabel?: string;
  coreId: string;
  config: SolrCoreConfig;
  schema: GridIndexSchema;
  search: (params: URLSearchParams, deadline: number) => Promise<GridIndexPage>;
  cursorSecret?: string;
}
export interface GridPorts {
  getGridEnvironment: (caller: ReadCaller, recordType: string, deadline: number) => Promise<GridEnvironment>;
}
