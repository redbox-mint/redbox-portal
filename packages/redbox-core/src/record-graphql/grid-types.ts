import type { RecordContract } from '../record-contract';
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
  storageTimeoutMs: 5_000,
  storageBytes: 262_144,
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
  /** Explicit authoring hints; clients must still check selectable and variant availability. */
  identity?: boolean;
  defaultColumn?: number;
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
  /** Internal presentation reference, never exposed as a selectable metadata path. */
  vocabulary?: string;
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
/** Normalized scalar keys in requested sort order, including deterministic OID ordering. */
export type GridKey = string | number | boolean | null;
export interface GridPosition {
  keys: GridKey[];
}
export interface GridCandidate extends GridPosition {
  oid: string;
}
export interface GridStoragePage {
  candidates: GridCandidate[];
  exhausted: boolean;
}
/** Trusted server context and contracts only. No Mongo paths, operators or pipelines cross this boundary. */
export interface GridStorageRequest {
  caller: ReadCaller;
  contracts: readonly RecordContract[];
  query: GridQuery;
  after?: GridPosition;
  deadline: number;
}
export interface RecordCollectionStorage {
  executeRecordCollection(request: GridStorageRequest): Promise<GridStoragePage>;
}
export interface GridEnvironment {
  recordTypeLabel?: string;
  workflowLabels?: Array<{ value: string; label: string }>;
  execute: RecordCollectionStorage['executeRecordCollection'];
  cursorSecret?: string;
}
export interface GridPorts {
  getGridEnvironment: (caller: ReadCaller, recordType: string, deadline: number) => Promise<GridEnvironment>;
  getChoiceLabels?: (caller: ReadCaller, reference: string, deadline: number) => Promise<GridField['choices']>;
}
