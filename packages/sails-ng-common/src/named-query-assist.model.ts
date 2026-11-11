import type { GraphqlNamedQueryBinding, GraphqlNamedQueryResult, NamedQuerySource } from './named-query.model';
import type { ContextSchemaField, EditorDiagnostic, FieldDescription, SchemaSelection } from './schema-assist.model';

/** Guidance is ephemeral: selecting a schema never adds a query constraint. */
export type NamedQuerySchemaSelection = Pick<SchemaSelection, 'recordType'> & Partial<Pick<SchemaSelection, 'stage'>>;

export interface NamedQueryGuidance {
  collectionName: string;
  recordType?: string;
  stage?: string;
}

export interface NamedQueryFieldDescription extends FieldDescription {
  collectionName: string;
  /** Stored paths, with envelope and metadata in separate trees. */
  envelopeFields: ContextSchemaField[];
  mappingFields: ContextSchemaField[];
}

/** The definition is the existing named-query configuration object, not a JSON string. */
export interface NamedQueryDraftRequest {
  definition: unknown;
  guidance?: NamedQuerySchemaSelection;
  /** A separate, explicitly selected foreign context for each related filter. */
  relatedGuidance?: Record<string, NamedQuerySchemaSelection>;
}

export interface NamedQueryValidation {
  source?: NamedQuerySource;
  capabilities?: { lookup: boolean; diagnostics: EditorDiagnostic[] };
  valid: boolean;
  diagnostics: EditorDiagnostic[];
}

export interface NamedQueryParameterDescription {
  key: string;
  path: string;
  type: string;
  required: boolean;
  queryType?: string;
  whenUndefined?: string;
  defaultValue?: unknown;
  format?: string;
  sourceField?: ContextSchemaField;
}

export interface NamedQueryDescription extends NamedQueryValidation {
  source?: 'database';
  name?: string;
  collectionName: string;
  parameters: NamedQueryParameterDescription[];
  result: FieldDescription;
}

export interface NamedQueryPreviewRequest extends NamedQueryDraftRequest {
  parameters?: Record<string, unknown>;
}

/** Data records use the existing NamedQueryResponseRecord wrapper, also consumed by reports. */
export interface NamedQueryPreview<T = unknown> extends NamedQueryValidation {
  source?: 'database';
  records: T[];
  summary: { numFound: number; start: number; page: number };
  truncated: boolean;
  truncationReasons: Array<'rows' | 'bytes'>;
  limits: {
    inputBytes: number;
    depth: number;
    nodes: number;
    timeMs: number;
    rows: number;
    responseBytes: number;
    scanRows: number;
    mappings: number;
  };
}

/** Existing description/preview names remain database DTOs for legacy consumers. */
/** Derived from the current schema and selected operation; never persisted. */
export interface NamedQueryOperationVariableDescription {
  variable: string;
  inputType: string;
  required: boolean;
  consumerSupported: boolean;
  hasOperationDefault: boolean;
  /** Omission is satisfied by nullable input or a valid operation default. */
  omissionSatisfied: boolean;
  enumValues?: string[];
}
export interface NamedQueryConsumer {
  type: 'report' | 'dashboard' | 'vocabulary' | 'form' | 'configuration';
  name: string;
  path: string;
}
export type NamedQueryBreakingChange = 'source' | 'parameters' | 'mappings' | 'lookup';
export interface NamedQueryUpdateReview {
  required: boolean;
  changes: NamedQueryBreakingChange[];
  usedBy: NamedQueryConsumer[];
  /** Dynamic hooks, direct API/config callers and opaque references cannot be enumerated. */
  usageComplete: false;
  confirmation?: string;
}
export interface GraphqlNamedQueryDescription extends NamedQueryValidation {
  source: 'graphql';
  name?: string;
  operationName?: string;
  parameters: Array<GraphqlNamedQueryBinding & { variable: string; hasOperationDefault?: boolean; omissionSatisfied?: boolean }>;
  operationVariables?: NamedQueryOperationVariableDescription[];
  result: FieldDescription;
}
export type NamedQuerySourceDescription = NamedQueryDescription | GraphqlNamedQueryDescription;

export type GraphqlNamedQueryPreview<T = unknown> = NamedQueryValidation &
  GraphqlNamedQueryResult<T> &
  Pick<NamedQueryPreview<T>, 'truncated' | 'truncationReasons' | 'limits'>;
export type NamedQuerySourcePreview<T = unknown> = NamedQueryPreview<T> | GraphqlNamedQueryPreview<T>;
