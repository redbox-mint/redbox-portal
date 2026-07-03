/**
 * Dashboard Type Config Interface
 * (sails.config.dashboardtype)
 * 
 * Dashboard type definitions with filtering and grouping rules.
 */

import type { DashboardTableConfig } from './workflow.config';

export interface DashboardFilterField {
    name: string;
    path: string;
    template?: string;
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
    tableConfig?: DashboardTableConfig;
    description?: string;
    searchable?: boolean;
    system?: boolean;
}

export interface DashboardTypeConfig {
    [dashboardTypeName: string]: DashboardTypeDefinition;
}

/**
 * Default dashboard types are no longer shipped in core.
 *
 * The demo dashboard types (standard, workspace, consolidated) now live in the
 * redbox-hook-dev package and are merged into sails.config.dashboardtype by the
 * loader when that hook is installed. Core ships pristine.
 */
export const dashboardtype: DashboardTypeConfig = {};
