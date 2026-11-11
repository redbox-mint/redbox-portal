import type { EditorDiagnostic } from './schema-assist.model';

/** Source-independent, data-only named-query contracts shared by server and browser. */
export type NamedQuerySource = 'database' | 'graphql';
export type NamedQueryJson = null | boolean | number | string | NamedQueryJson[] | { [key: string]: NamedQueryJson };

/** Legacy database coercion, template and default semantics are intentionally unchanged. */
export interface NamedQueryParam {
  type: 'string' | 'date' | 'number' | 'boolean' | 'array' | 'object';
  path: string;
  required?: boolean;
  queryType?: string;
  whenUndefined: 'defaultValue' | 'ignore';
  defaultValue?: unknown;
  format?: 'days' | 'ISODate';
  template?: string;
}

export interface RelatedRecordFilterDefinition {
  rootRecordType?: string;
  relationId?: string;
  collectionName?: string;
  mongoQuery: Record<string, unknown>;
  localField?: string;
  foreignField?: string;
}

export interface DatabaseNamedQueryDefinition {
  /** Omission selects the legacy database source; readers must not add a default. */
  source?: 'database';
  name?: string;
  description?: string;
  collectionName: string;
  brandIdFieldPath?: string;
  resultObjectMapping: Record<string, string>;
  mongoQuery: Record<string, unknown>;
  sort?: Array<Record<string, 'ASC' | 'DESC'>>;
  expandRelations?: boolean;
  relatedRecordFilters?: RelatedRecordFilterDefinition[];
  queryParams: Record<string, NamedQueryParam>;
  graphql?: never;
}

/** Property segments relative to data (resultPath) or the selected item (mappings).
 * Aliases and punctuation are literal property names; no templates or flattening.
 * Runtime resolution uses own properties and rejects prototype-related segments.
 */
export type NamedQueryPath = string[];
export interface GraphqlNamedQueryMappings {
  oid?: NamedQueryPath;
  title?: NamedQueryPath;
  metadata?: NamedQueryPath;
  dateCreated?: NamedQueryPath;
  lastSaveDate?: NamedQueryPath;
}

/** Consumer defaults apply only on omission, never on explicit null/false/0/empty text.
 * inputType is GraphQL type notation, restricted to scalars/enums and lists by
 * schema-aware validation. Nested input objects are supported only by fixed values.
 */
export interface GraphqlNamedQueryBinding {
  ownership: 'consumer';
  parameter: string;
  inputType: string;
  required: boolean;
  defaultValue?: NamedQueryJson;
}
export type GraphqlNamedQueryVariable =
  | { ownership: 'fixed'; value: NamedQueryJson }
  | GraphqlNamedQueryBinding
  | { ownership: 'omitted' };

/** Paths are relative to data, including aliased collection/continuation fields.
 * firstVariable and afterVariable are exclusively server-owned, absent from variables.
 * The current RecordGraphql collection exposes hasNextPage/endCursor directly.
 */
export interface GraphqlNamedQueryLookupPage {
  mode: 'firstPage';
  collectionPath: NamedQueryPath;
  hasNextPagePath: NamedQueryPath;
  endCursorPath?: NamedQueryPath;
  firstVariable: string;
  afterVariable: string;
  searchParameter: string;
}

export interface GraphqlNamedQueryOperation {
  document: string;
  operationName?: string;
  /** Keys are target operation variable names, without '$'. */
  variables: Record<string, GraphqlNamedQueryVariable>;
  resultPath: NamedQueryPath;
  mappings?: GraphqlNamedQueryMappings;
  lookup?: GraphqlNamedQueryLookupPage;
  /** Informational only. Execution never loads or follows this reference. */
  provenance?: { explorerId?: string; explorerRevision?: number; explorerPortal?: string };
}

export interface GraphqlNamedQueryDefinition {
  source: 'graphql';
  name?: string;
  description?: string;
  graphql: GraphqlNamedQueryOperation;
  /** Read-only admin metadata. Never used to execute a named query. */
  sourceSavedQuery?: NamedQueryExplorerSource | null;
  collectionName?: never;
  brandIdFieldPath?: never;
  resultObjectMapping?: never;
  mongoQuery?: never;
  sort?: never;
  expandRelations?: never;
  relatedRecordFilters?: never;
  queryParams?: never;
}
export type NamedQueryDefinition = DatabaseNamedQueryDefinition | GraphqlNamedQueryDefinition;

export interface ExplorerQueryAuthor {
  username: string;
  displayName: string;
}
export interface PublishedExplorerQuery {
  name: string;
  publishedRevision: number;
  changedSincePublished: boolean;
}
/** Response-only catalogue for the named-query saved-source picker. */
export interface SavedExplorerQuerySummary {
  id: string;
  revision: number;
  name: string;
  mode: 'visual' | 'graphql';
  recordType: string | null;
  recordTypeLabel: string | null;
  updatedAt: string | null;
  updatedBy: ExplorerQueryAuthor | null;
  publishedAs: PublishedExplorerQuery[];
}
export interface SavedExplorerQueryPage {
  grids: SavedExplorerQuerySummary[];
  next: string | null;
}
/** Null current details mean that the source was deleted. A reference from another
 * portal is never resolved or returned. Unlinked/legacy definitions return null. */
export interface NamedQueryExplorerSource {
  id: string;
  publishedRevision: number;
  revision: number | null;
  name: string | null;
  recordType: string | null;
  recordTypeLabel: string | null;
  mode: 'visual' | 'graphql' | null;
  updatedAt: string | null;
  updatedBy: ExplorerQueryAuthor | null;
  missing: boolean;
  changedSincePublished: boolean | null;
}

/** Read-only catalogue recovery entry, never an executable definition. The raw
 * stored source is intentionally unknown rather than defaulted to database.
 */
export interface InvalidNamedQueryCatalogueEntry {
  name: string;
  source: unknown;
  valid: false;
  diagnostics: EditorDiagnostic[];
}
/** Check valid:false before interpreting the source or offering execution/editing. */
export type NamedQueryCatalogueEntry = (NamedQueryDefinition & { valid?: true }) | InvalidNamedQueryCatalogueEntry;

/** Numeric database summaries remain compatible with ListAPIResponse. */
export interface DatabaseNamedQueryResult<T = unknown> {
  source?: 'database';
  records: T[];
  summary: { numFound: number; start: number; page: number };
}
export interface NamedQueryFirstPage {
  mode: 'firstPage';
  hasNextPage: boolean;
}
export interface GraphqlNamedQueryResult<T = unknown> {
  source: 'graphql';
  records: T[];
  /** Exact total is unknown, including when the returned page is empty. */
  summary: { numFound: null; start: 0; page: 1 };
  pagination: NamedQueryFirstPage;
}
export type NamedQueryExecutionResult<T = unknown> = DatabaseNamedQueryResult<T> | GraphqlNamedQueryResult<T>;

/** Metadata-aware lookup adapter; legacy array methods may return only options. */
export type NamedQueryLookupResult<T = unknown> =
  | { options: T[]; source?: 'database'; pagination?: never }
  | { options: T[]; source: 'graphql'; summary: GraphqlNamedQueryResult['summary']; pagination: NamedQueryFirstPage };

/** Ephemeral explorer handoff. Values are candidates, not fixed values or defaults.
 * Ownership remains absent until explicitly chosen in the detached editor. */
export interface NamedQueryPromotionDraft {
  definition: GraphqlNamedQueryDefinition;
  variableValues: Record<string, NamedQueryJson>;
}
