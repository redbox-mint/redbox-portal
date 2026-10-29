/** Data-only editor contracts. Derived fields are not immutable record-schema documents or identities. */
export type FieldPrecision = 'record-schema' | 'form-config' | 'none';
export type FieldCompleteness = 'complete' | 'partial' | 'unavailable';
export interface SchemaSelection {
  recordType: string;
  stage: string;
}
export interface ContextSchemaField {
  /** Presentation path, with bracket literals and [] for array items. Use context adapters for runtime paths. */
  path: string;
  type: string;
  title?: string;
  description?: string;
  required: boolean;
  isArray: boolean;
  format?: string;
  itemType?: string;
  enum?: unknown[];
  source?: FieldPrecision | 'runtime';
}
export interface FieldDescription extends SchemaSelection {
  precision: FieldPrecision;
  completeness: FieldCompleteness;
  fields: ContextSchemaField[];
}
/** Safe identifiers and locations only; no server source excerpts or raw exception messages. */
export interface EditorDiagnostic {
  code: string;
  /** Omitted by older email servers; omission remains an error in those clients. */
  severity?: 'error' | 'warning';
  /** A safe field/property identifier, never an excerpt of server source. */
  suggestion?: string;
  /** Zero-based AST path-part index for template fixes, excluding scope prefixes. */
  segmentIndex?: number;
  field: string;
  reason: string;
  line: number;
  column: number;
}

/** JSON Schema draft 2020-12 subset used by authoring assistance. */
export interface EditorContextSchema {
  [keyword: string]: unknown;
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, EditorContextSchema>;
  required?: string[];
  additionalProperties?: boolean | EditorContextSchema;
  items?: EditorContextSchema;
  title?: string;
  description?: string;
  enum?: unknown[];
  examples?: unknown[];
  default?: unknown;
  allOf?: EditorContextSchema[];
  anyOf?: EditorContextSchema[];
  oneOf?: EditorContextSchema[];
}
export interface SchemaTarget {
  id: string;
  label: string;
  stages: Array<{ id: string; label: string; starting: boolean }>;
}
