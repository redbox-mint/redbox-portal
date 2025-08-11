export class ReportConfig {
    title: string
    reportSource: ReportSource = ReportSource.solr
    databaseQuery: ReportDatabaseQueryConfig
    solrQuery: ReportSolrQueryConfig
    filter: ReportFilterConfig[]
    columns: ReportColumnConfig[]
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
    queryName: string
  }
  
  export class ReportSolrQueryConfig {
    baseQuery: string
    searchCore: string = "default";
  }
  
  
  
  
  class ReportFilterDatabaseDateConfig {
    fromProperty:string
    toProperty:string
  }
  class ReportFilterConfig {
    paramName: string
    type: ReportFilterType
    property: string
    messsage: string
    database: ReportFilterDatabaseDateConfig
  }
  
  class ReportColumnConfig {
    label: string
    property: string
    hide: boolean
    exportTemplate: string
    template: string
  }
  
  export class ReportResult {
    total: number;
    pageNum: number;
    recordPerPage: number;
    records: any[];
    success: boolean;
  
  }