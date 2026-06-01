import {RecordPageDto, RecordPropViewMetaDto} from "./record.model";

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
    this.title = "";
    this.name = "";
    this.solrQuery = "";
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
  success: boolean;
}
/**
 * Users of Record Table must extend RecordPage model
 */
export interface ReportResultDto extends RecordPageDto {
  recordsPerPage: number;
}
