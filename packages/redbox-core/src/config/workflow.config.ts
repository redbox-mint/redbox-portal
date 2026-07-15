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
    defaultSort?: boolean;
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
    mode?: 'all' | 'alo';
    renderItemTemplate: string;
    evaluateRulesTemplate?: string;
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
}

export interface WorkflowRecordType {
    [stageName: string]: WorkflowStageDefinition;
}

export interface WorkflowConfig {
    [recordTypeName: string]: WorkflowRecordType;
}

/**
 * Default workflows are no longer shipped in core.
 *
 * The demo workflow stage definitions now live in the redbox-hook-dev package
 * and are merged into sails.config.workflow by the loader when that hook is
 * installed. Core ships pristine.
 */
export const workflow: WorkflowConfig = {};
