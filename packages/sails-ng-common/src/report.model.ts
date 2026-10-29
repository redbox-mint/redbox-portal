import { RecordPageDto, RecordPropViewMetaDto } from './record.model';
import type { FieldDescription, EditorDiagnostic } from './schema-assist.model';
import type { NamedQueryDescription } from './named-query-assist.model';

export interface ReportFilterDto {
  type: string;
  paramName: string;
  message: string;
  property: string;
}

export class ReportDto {
  title: string;
  name: string;
  solrQuery: string;
  filter: ReportFilterDto[];
  columns: RecordPropViewMetaDto[];
  constructor() {
    this.title = '';
    this.name = '';
    this.solrQuery = '';
    this.filter = [];
    this.columns = [];
  }
}

export interface ReportConfigFilterDatabaseDto {
  fromProperty: string;
  toProperty: string;
}

export interface ReportConfigFilterDto {
  type: string;
  paramName: string;
  message: string;
  property: string;
  database?: ReportConfigFilterDatabaseDto | null;
}

export interface ReportConfigColumnDto {
  label: string;
  property: string;
  hide?: boolean;
  exportTemplate?: string;
  template?: string;
  multivalue?: boolean;
}

export interface ReportConfigDatabaseQueryDto {
  queryName: string;
}

export interface ReportConfigSolrQueryDto {
  baseQuery: string;
  searchCore: string;
}

export interface ReportConfigDto {
  name: string;
  title: string;
  reportSource: 'database' | 'solr';
  databaseQuery: ReportConfigDatabaseQueryDto | null;
  solrQuery: ReportConfigSolrQueryDto | null;
  filter: ReportConfigFilterDto[];
  columns: ReportConfigColumnDto[];
  readOnly: boolean;
  readOnlyReason?: string;
  canEdit: boolean;
  canDelete: boolean;
  canPreview: boolean;
}

export interface ReportConfigPreviewDto extends ReportResultDto {
  records: Record<string, unknown>[];
  success: boolean;
  valid: boolean;
  diagnostics: EditorDiagnostic[];
  /** Same order as records and configured columns, including hidden/export columns. */
  renderedRows: Array<{ cells: Array<{ display: string; export: unknown }> }>;
  truncated: boolean;
  truncationReasons: Array<'rows' | 'bytes'>;
  limits: { rows: number; responseBytes: number; inputBytes: number; timeMs: number };
}

export interface ReportConfigValidation {
  valid: boolean;
  diagnostics: EditorDiagnostic[];
}

/** Extends the saved-query DTO; property/multivalue select an ephemeral column context. */
export interface ReportNamedQueryDescription extends NamedQueryDescription {
  templateContexts: { display: FieldDescription; csv: FieldDescription };
}
/**
 * Users of Record Table must extend RecordPage model
 */
export interface ReportResultDto extends RecordPageDto {
  recordsPerPage: number;
}
