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

/**
 * Default dashboard views are no longer shipped in core.
 *
 * The demo "consolidated" dashboard view now lives in the redbox-hook-dev
 * package and is merged into sails.config.dashboardview by the loader when that
 * hook is installed. Core ships pristine.
 */
export const dashboardview: DashboardViewConfig = {};
