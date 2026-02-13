export class ReportConfig {
    title: string = '';
  reportSource?: ReportSource = ReportSource.solr;
    databaseQuery: ReportDatabaseQueryConfig | null = null;
    solrQuery: ReportSolrQueryConfig | null = null;
    filter: ReportFilterConfig[] = [];
    columns: ReportColumnConfig[] = [];
  }

  export enum ReportSource {
    solr = "solr",
    database = "database"
  }
  
  export enum ReportFilterType {
    dateRange = 'date-range',
    text = "text"
  }
  
  export class ReportDatabaseQueryConfig {
    queryName: string = '';
  }
  
  export class ReportSolrQueryConfig {
    baseQuery: string = '';
    searchCore: string = "default";
  }
  
  
  
  
  class ReportFilterDatabaseDateConfig {
    fromProperty: string = '';
    toProperty: string = '';
  }
  class ReportFilterConfig {
    paramName: string = '';
    type: ReportFilterType = ReportFilterType.text;
    property: string = '';
    messsage: string = '';
    database: ReportFilterDatabaseDateConfig | null = null;
  }
  
  class ReportColumnConfig {
    label: string = '';
    property: string = '';
    hide: boolean = false;
    exportTemplate: string = '';
    template: string = '';
  }
  
  export class ReportResult {
    total: number = 0;
    pageNum: number = 0;
    recordPerPage: number = 0;
    records: Record<string, unknown>[] = [];
    success: boolean = false;
  
  }
