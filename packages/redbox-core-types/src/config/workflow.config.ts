/**
 * Workflow Config Interface
 * (sails.config.workflow)
 * 
 * Workflow stage definitions for record types.
 */

export interface WorkflowStageAuthorization {
    viewRoles: string[];
    editRoles: string[];
}

export interface DashboardRowConfig {
    title: string;
    variable: string;
    template: string;
    initialSort?: 'asc' | 'desc';
}

export interface DashboardFormatRules {
    filterBy?: Record<string, unknown>;
    sortBy?: string;
    groupBy?: string;
    sortGroupBy?: Array<{ rowLevel: number; compareFieldValue: string }>;
}

export interface DashboardRowRule {
    name: string;
    action: 'show' | 'hide';
    renderItemTemplate: string;
    evaluateRulesTemplate: string;
}

export interface DashboardRulesConfig {
    ruleSetName: string;
    applyRuleSet: boolean;
    type?: string;
    separator?: string;
    rules: DashboardRowRule[];
    mode?: 'all' | 'alo';
}

export interface DashboardTableConfig {
    rowConfig: DashboardRowConfig[];
    formatRules?: DashboardFormatRules;
    rowRulesConfig?: DashboardRulesConfig[];
    groupRowConfig?: DashboardRowConfig[];
    groupRowRulesConfig?: DashboardRulesConfig[];
}

export interface DashboardConfig {
    table?: DashboardTableConfig;
    showAdminSideBar?: boolean;
}

export interface WorkflowStageConfig {
    workflow: {
        stage: string;
        stageLabel: string;
    };
    authorization: WorkflowStageAuthorization;
    form: string;
    displayIndex?: number;
    baseRecordType?: string;
    dashboard?: DashboardConfig;
}

export interface WorkflowStageDefinition {
    config: WorkflowStageConfig;
    starting?: boolean;
    consolidated?: boolean;
}

export interface WorkflowRecordType {
    [stageName: string]: WorkflowStageDefinition;
}

export interface WorkflowConfig {
    [recordTypeName: string]: WorkflowRecordType;
}

// Note: Default values contain workflow stage definitions.
// The original config/workflow.js file should be kept.
