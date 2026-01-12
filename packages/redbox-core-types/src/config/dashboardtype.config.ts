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

// Note: Default values contain complex formatting rules.
// The original config/dashboardtype.js file should be kept.
