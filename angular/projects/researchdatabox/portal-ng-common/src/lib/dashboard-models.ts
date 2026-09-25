export class PlanTable {
  totalItems: number = 0;
  currentPage: number = 0;
  noItems: number = 0;
  items: any[] = [];
}

export class RecordResponseTable {
  totalItems: number = 0;
  currentPage: number = 0;
  noItems: number = 0;
  items: any[] = [];
}

export class Plan {
  oid: string = '';
  title: string = '';
  dateCreated: string = '';
  dateModified: string = '';
  hasEditAccess: boolean = false;
  metadata: object = {};
  dashboardTitle: string = '';
}

export declare class FilterField {
  name: string;
  path: string;
  template?: string;
}

export declare class QueryFilter {
  filterType: string;
  filterFields: FilterField[];
}

export declare class SortGroupBy {
  rowLevel: number;
  compareFieldValue: string;
  compareField: string;
  relatedTo: string;
}

export declare class FormatRules {
  filterBy: any;
  filterWorkflowStepsBy: string[];
  recordTypeFilterBy: string;
  queryFilters: { [key: string]: QueryFilter[] };
  sortBy: string;
  groupBy: string;
  sortGroupBy: SortGroupBy[];
  hideWorkflowStepTitleForRecordType: string[];
}

export declare class DashboardConfig {
  [key: string]: {
    formatRules: FormatRules;
  }
}
/**
 * Independent dashboard settings for one workflow stage or dashboard-view step.
 * Mirrors DashboardSettings in @researchdatabox/redbox-core.
 */
export interface DashboardSettingsRowConfig {
  title: string;
  variable: string;
  template: string;
  initialSort?: 'asc' | 'desc';
  defaultSort?: boolean;
  secondarySort?: string;
  [extra: string]: unknown;
}

export interface DashboardSettingsRule {
  name: string;
  action: 'show' | 'hide';
  mode?: 'all' | 'alo';
  renderItemTemplate: string;
  evaluateRulesTemplate?: string;
  [extra: string]: unknown;
}

export interface DashboardSettingsRuleSet {
  ruleSetName: string;
  applyRuleSet: boolean;
  type?: string;
  separator?: string;
  mode?: 'all' | 'alo';
  rules: DashboardSettingsRule[];
  [extra: string]: unknown;
}

export interface DashboardSettingsFormatRules {
  filterBy?: { filterBase?: 'user' | 'record'; filterBaseFieldOrValue?: string; filterField?: string; filterMode?: string; [extra: string]: unknown };
  queryFilters?: { [recordType: string]: QueryFilter[] };
  sortBy?: string;
  groupBy?: string;
  sortGroupBy?: SortGroupBy[];
  [extra: string]: unknown;
}

export interface DashboardSettings {
  searchable: boolean;
  showStageTitle: boolean;
  tableConfig: {
    rowConfig: DashboardSettingsRowConfig[];
    rowRulesConfig: DashboardSettingsRuleSet[];
    groupRowConfig: DashboardSettingsRowConfig[];
    groupRowRulesConfig: DashboardSettingsRuleSet[];
    formatRules: DashboardSettingsFormatRules;
    [extra: string]: unknown;
  };
  [extra: string]: unknown;
}

/** Settings for every stage of a record type (or step of a view) from one saved revision. */
export interface DashboardRuntimeSettings {
  revision: number;
  targets: { [step: string]: { settings: DashboardSettings; fingerprint: string } };
}

/** Structural context for a dashboard mode, e.g. which record type the workspace page lists. */
export interface DashboardModeContext {
  recordTypeFilterBy?: string;
  filterWorkflowStepsBy?: string[];
}
