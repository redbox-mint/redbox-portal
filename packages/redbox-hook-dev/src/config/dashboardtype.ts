import type { DashboardTypeConfig } from '@researchdatabox/redbox-core';

/**
 * Demo dashboard type definitions tied to the demo record types.
 * Moved out of @researchdatabox/redbox-core; supplied via redbox-hook-dev.
 *
 * Dashboard table settings declared here (and in workflow.ts `config.dashboard.table`)
 * are one-time starting values: each stage/view step gets an independent copy the first
 * time it is initialised, and later edits here do not change saved settings.
 */
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
