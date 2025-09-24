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
/**
 * Users of Record Table must extend RecordPage model
 */
export interface ReportResultDto extends RecordPageDto {
  recordsPerPage: number;
}
