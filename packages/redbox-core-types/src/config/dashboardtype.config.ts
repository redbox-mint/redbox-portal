/**
 * Dashboard Type Config Interface
 * (sails.config.dashboardtype)
 * 
 * Dashboard type definitions with filtering and grouping rules.
 */

export interface DashboardFilterField {
    name: string;
    path: string;
}

export interface DashboardQueryFilter {
    filterType: 'text' | 'date' | 'select';
    filterFields: DashboardFilterField[];
}

export interface DashboardFormatFilter {
    filterBase?: 'user' | 'record';
    filterBaseFieldOrValue?: string;
    filterField?: string;
    filterMode?: 'equal' | 'contains';
}

export interface DashboardSortGroupConfig {
    rowLevel: number;
    compareFieldValue: string;
    compareField?: string;
    relatedTo?: string;
}

export interface DashboardFormatRulesConfig {
    filterBy: DashboardFormatFilter;
    filterWorkflowStepsBy?: string[];
    recordTypeFilterBy?: string;
    queryFilters?: Record<string, DashboardQueryFilter[]>;
    sortBy?: string;
    groupBy?: string;
    sortGroupBy?: DashboardSortGroupConfig[];
    hideWorkflowStepTitleForRecordType?: string[];
}

export interface DashboardTypeDefinition {
    formatRules: DashboardFormatRulesConfig;
}

export interface DashboardTypeConfig {
    [dashboardTypeName: string]: DashboardTypeDefinition;
}

export const dashboardtype: DashboardTypeConfig = {
    'standard': {
        formatRules: {
            filterBy: {},
            filterWorkflowStepsBy: [],
            queryFilters: {
                party: [
                    {
                        filterType: 'text',
                        filterFields: [
                            { name: 'Title', path: 'metadata.title' },
                            { name: 'Contributor', path: 'metadata.contributor_ci.text_full_name' }
                        ]
                    }
                ],
                rdmp: [
                    {
                        filterType: 'text',
                        filterFields: [
                            { name: 'Title', path: 'metadata.title' },
                            { name: 'Contributor', path: 'metadata.contributor_ci.text_full_name' }
                        ]
                    }
                ],
                dataRecord: [
                    {
                        filterType: 'text',
                        filterFields: [
                            { name: 'Title', path: 'metadata.title' },
                            { name: 'Contributor', path: 'metadata.contributor_ci.text_full_name' }
                        ]
                    }
                ],
                dataPublication: [
                    {
                        filterType: 'text',
                        filterFields: [
                            { name: 'Title', path: 'metadata.title' },
                            { name: 'Contributor', path: 'metadata.contributor_ci.text_full_name' }
                        ]
                    }
                ]
            },
            groupBy: '',
            sortGroupBy: [],
            hideWorkflowStepTitleForRecordType: ['party']
        }
    },
    'workspace': {
        formatRules: {
            filterBy: {},
            recordTypeFilterBy: 'existing-locations',
            filterWorkflowStepsBy: ['existing-locations-draft'],
            queryFilters: {
                'workspace': [
                    {
                        filterType: 'text',
                        filterFields: [
                            { name: 'Title', path: 'metadata.title' }
                        ]
                    }
                ]
            },
            groupBy: '',
            sortGroupBy: [],
            hideWorkflowStepTitleForRecordType: []
        }
    },
    'consolidated': {
        formatRules: {
            filterBy: {
                filterBase: 'record',
                filterBaseFieldOrValue: 'rdmp',
                filterField: 'metaMetadata.type',
                filterMode: 'equal'
            },
            filterWorkflowStepsBy: ['consolidated'],
            sortBy: '',
            groupBy: 'groupedByRelationships',
            sortGroupBy: [
                { rowLevel: 0, compareFieldValue: 'rdmp', compareField: 'metadata.metaMetadata.type', relatedTo: '' },
                { rowLevel: 1, compareFieldValue: 'dataRecord', compareField: 'metadata.metaMetadata.type', relatedTo: 'metadata.metadata.rdmp.oid' },
                { rowLevel: 2, compareFieldValue: 'dataPublication', compareField: 'metadata.metaMetadata.type', relatedTo: 'metadata.metadata.dataRecord.oid' }
            ],
            hideWorkflowStepTitleForRecordType: []
        }
    }
};
