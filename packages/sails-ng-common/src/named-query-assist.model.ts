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
  };
}
