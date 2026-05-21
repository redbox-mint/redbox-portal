import type { DashboardTableConfig } from './workflow.config';

export type DashboardViewFetchMode = 'allForRecordType' | 'workflowStage';

export interface DashboardViewStepDefinition {
    name: string;
    sourceRecordType: string;
    sourceWorkflowStage?: string;
    fetchMode: DashboardViewFetchMode;
    dashboardTable: DashboardTableConfig;
    baseRecordType?: string;
}

export interface DashboardViewDefinition {
    name: string;
    titleLabelKey: string;
    showAdminSideBar?: boolean;
    dashboardType: string;
    sourceRecordType: string;
    formatRulesOverride?: Record<string, unknown>;
    steps: DashboardViewStepDefinition[];
}

export interface DashboardViewConfig {
    [dashboardViewName: string]: DashboardViewDefinition;
}

export const dashboardview: DashboardViewConfig = {
    consolidated: {
        name: 'consolidated',
        titleLabelKey: 'consolidated',
        showAdminSideBar: true,
        dashboardType: 'consolidated',
        sourceRecordType: 'rdmp',
        steps: [
            {
                name: 'consolidated',
                sourceRecordType: 'rdmp',
                fetchMode: 'allForRecordType',
                baseRecordType: 'rdmp',
                dashboardTable: {
                    rowConfig: [
                        {
                            title: 'header-record-type',
                            variable: 'metaMetadata.type',
                            template: '{{metaMetadata.type}}',

                        },
                        {
                            title: 'Record Title',
                            variable: 'metadata.title',
                            template: `<a href='{{urlEncode rootContext}}/{{urlEncode branding}}/{{urlEncode portal}}/record/view/{{urlEncode oid}}'>{{metadata.title}}</a>
                              <span class="dashboard-controls">
                                {{#if hasEditAccess}}
                                                                    <a href='{{urlEncode rootContext}}/{{urlEncode branding}}/{{urlEncode portal}}/record/edit/{{urlEncode oid}}' aria-label='{{t "edit-link-label"}} {{metadata.title}}'><i class="fa fa-pencil" aria-hidden="true"></i></a>
                                {{/if}}
                              </span>
                            `
                        },
                        {
                            title: 'header-ci',
                            variable: 'metadata.contributor_ci.text_full_name',
                            template: '{{#if metadata.contributor_ci}}{{metadata.contributor_ci.text_full_name}}{{/if}}',

                        },
                        {
                            title: 'header-created',
                            variable: 'metaMetadata.createdOn',
                            template: '{{dateCreated}}',

                        },
                        {
                            title: 'header-modified',
                            variable: 'metaMetadata.lastSaveDate',
                            template: '{{dateModified}}'
                        },
                        {
                            title: 'Actions',
                            variable: '',
                            template: `{{evaluateRowLevelRules rulesConfig metadata metaMetadata workflow oid "dashboardActionsPerRow"}}`
                        }
                    ],
                    formatRules: {
                        filterBy: { filterBase: 'user', filterBaseFieldOrValue: 'user.email', filterField: 'metadata.contributor_ci.email', filterMode: 'equal' },
                        sortBy: '',
                        groupBy: 'groupedByRecordType',
                        sortGroupBy: [{ rowLevel: 0, compareFieldValue: 'rdmp' },
                        { rowLevel: 1, compareFieldValue: 'dataRecord' },
                        { rowLevel: 2, compareFieldValue: 'dataPublication' }]
                    },
                    rowRulesConfig: [
                        {
                            ruleSetName: 'dashboardActionsPerRow',
                            applyRuleSet: true,
                            type: 'multi-item-rendering',
                            separator: ' | ',
                            rules: [
                                {
                                    name: 'Edit',
                                    action: 'show',
                                    renderItemTemplate: `<a href='{{urlEncode rootContext}}/{{urlEncode branding}}/{{urlEncode portal}}/record/edit/{{urlEncode oid}}'>{{name}}</a>`,
                                    evaluateRulesTemplate: `{{eq (get workflow "stage") "draft"}}`
                                },
                                {
                                    name: 'Create dataset from this plan',
                                    action: 'show',
                                    renderItemTemplate: `<span class='dashboard-action-label'>{{name}}</span>`,
                                    evaluateRulesTemplate: `{{and (eq (get workflow "stage") "draft") (eq (get metaMetadata "type") "rdmp")}}`
                                },
                                {
                                    name: 'Close data plan',
                                    action: 'show',
                                    renderItemTemplate: `<span class='dashboard-action-label'>{{name}}</span>`,
                                    evaluateRulesTemplate: `{{and (eq (get workflow "stage") "draft") (eq (get metaMetadata "type") "rdmp")}}`
                                },
                                {
                                    name: 'Create a publication record from this dataset',
                                    action: 'show',
                                    renderItemTemplate: `<span class='dashboard-action-label'>{{name}}</span>`,
                                    evaluateRulesTemplate: `{{and (eq (get workflow "stage") "draft") (eq (get metaMetadata "type") "dataRecord")}}`
                                },
                                {
                                    name: 'Close dataset info',
                                    action: 'show',
                                    renderItemTemplate: `<span class='dashboard-action-label'>{{name}}</span>`,
                                    evaluateRulesTemplate: `{{and (eq (get workflow "stage") "draft") (eq (get metaMetadata "type") "dataRecord")}}`
                                },
                                {
                                    name: 'Submit for library review',
                                    action: 'show',
                                    renderItemTemplate: `<span class='dashboard-action-label'>{{name}}</span>`,
                                    evaluateRulesTemplate: `{{and (eq (get workflow "stage") "draft") (eq (get metaMetadata "type") "dataPublication")}}`
                                }
                            ]
                        }
                    ],
                    groupRowConfig: [
                        {
                            title: 'Actions',
                            variable: '',
                            template: `{{evaluateGroupRowRules groupRulesConfig groupedItems "dashboardActionsPerGroupRow"}}`
                        }
                    ],
                    groupRowRulesConfig: [
                        {
                            ruleSetName: 'dashboardActionsPerGroupRow',
                            applyRuleSet: true,
                            rules: [
                                {
                                    name: 'Send for Conferral',
                                    action: 'show',
                                    mode: 'alo',
                                    renderItemTemplate: `<span class='dashboard-action-label'>{{name}}</span>`,
                                    evaluateRulesTemplate: `{{eq (get workflow "stage") "draft"}}`
                                }
                            ]
                        }
                    ]
                }
            }
        ]
    }
};
