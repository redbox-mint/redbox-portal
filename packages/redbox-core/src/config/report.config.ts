/**
 * Report Definition Interfaces
 *
 * Type definitions for report seed definitions and runtime configuration.
 */

export interface ReportFilterConfig {
    paramName: string;
    type: 'date-range' | 'text';
    property?: string;
    message: string;
    database?: {
        fromProperty: string;
        toProperty: string;
    };
}

export interface ReportColumnConfig {
    label: string;
    property: string;
    template?: string;
    exportTemplate?: string;
    hide?: boolean;
}

export interface ReportDatabaseQuery {
    queryName: string;
}

export interface ReportSolrQuery {
    baseQuery: string;
}

export interface ReportDefinition {
    title: string;
    reportSource?: 'database' | 'solr';
    databaseQuery?: ReportDatabaseQuery;
    solrQuery?: ReportSolrQuery;
    filter: ReportFilterConfig[];
    columns: ReportColumnConfig[];
}

