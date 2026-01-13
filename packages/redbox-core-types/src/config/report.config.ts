/**
 * Reports Config Interface
 * (sails.config.reports)
 * 
 * Report definition configuration.
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

export interface ReportsConfig {
    [reportName: string]: ReportDefinition;
}

/**
 * Default reports configuration
 * Contains the standard report definitions
 */
export const reports: ReportsConfig = {
    rdmpRecords: {
        title: 'List RDMP records',
        reportSource: 'database',
        databaseQuery: { queryName: 'listRDMPRecords' },
        filter: [
            {
                paramName: 'dateObjectModifiedRange',
                type: 'date-range',
                message: 'Filter by date modified',
                database: {
                    fromProperty: 'dateModifiedAfter',
                    toProperty: 'dateModifiedBefore'
                }
            },
            {
                paramName: 'dateObjectCreatedRange',
                type: 'date-range',
                message: 'Filter by date created',
                database: {
                    fromProperty: 'dateCreatedAfter',
                    toProperty: 'dateCreatedBefore'
                }
            },
            {
                paramName: 'title',
                type: 'text',
                property: 'title',
                message: 'Filter by title'
            }
        ],
        columns: [
            { label: 'Id', property: 'oid', hide: true },
            { label: 'Title', property: 'title', template: "<a href='{{optTemplateData.brandingAndPortalUrl}}/record/view/{{oid}}'>{{title}}</a>", exportTemplate: '{{title}}' },
            { label: 'External URL', property: 'reportExternalURL', exportTemplate: '{{optTemplateData.brandingAndPortalUrl}}/record/view/{{oid}}', hide: true },
            { label: 'Date Modified', property: 'dateModified' },
            { label: 'Date Created', property: 'dateCreated' }
        ]
    }
};

