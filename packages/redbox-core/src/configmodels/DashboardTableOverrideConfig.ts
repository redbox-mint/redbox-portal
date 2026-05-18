import { AppConfig } from './AppConfig.interface';
import type { DashboardFormatRules, DashboardTableConfig } from '../config/workflow.config';

export interface WorkflowStateDashboardConfig {
  dashboardType: string;
  tableConfig?: DashboardTableConfig;
}

export interface RecordTypeOverride {
  default?: WorkflowStateDashboardConfig;
  steps?: Record<string, WorkflowStateDashboardConfig>;
}

export interface RecordTypesOverrideMap {
  [recordTypeName: string]: RecordTypeOverride;
}

export interface ViewOverride {
  default?: WorkflowStateDashboardConfig;
  steps?: Record<string, WorkflowStateDashboardConfig>;
}

export interface ViewsOverrideMap {
  [viewName: string]: ViewOverride;
}

export interface DashboardTypeConfigData {
  description?: string;
  searchable?: boolean;
  formatRules?: DashboardFormatRules;
  tableConfig?: DashboardTableConfig;
}

export interface DashboardTableOverrideConfigData {
  recordTypes?: RecordTypesOverrideMap;
  views?: ViewsOverrideMap;
}

export class DashboardTableOverrideConfig extends AppConfig {
  recordTypes: RecordTypesOverrideMap = {};
  views: ViewsOverrideMap = {};

  public static getFieldOrder(): string[] {
    return ['recordTypes', 'views'];
  }
}

export const DEFAULT_DASHBOARD_TABLE_OVERRIDE_CONFIG: DashboardTableOverrideConfigData = {
  recordTypes: {},
  views: {}
};

const dashboardRowConfigSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    variable: { type: 'string' },
    template: { type: 'string' },
    initialSort: { type: 'string', enum: ['asc', 'desc'] },
    defaultSort: { type: 'boolean' },
    secondarySort: { type: 'string' }
  },
  required: ['title', 'variable', 'template'],
  additionalProperties: true
};

const dashboardRowRuleSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    action: { type: 'string', enum: ['show', 'hide'] },
    mode: { type: 'string', enum: ['all', 'alo'] },
    renderItemTemplate: { type: 'string' },
    evaluateRulesTemplate: { type: 'string' }
  },
  required: ['name', 'action', 'renderItemTemplate'],
  additionalProperties: true
};

const dashboardRuleSetSchema = {
  type: 'object',
  properties: {
    ruleSetName: { type: 'string' },
    applyRuleSet: { type: 'boolean' },
    type: { type: 'string' },
    separator: { type: 'string' },
    mode: { type: 'string', enum: ['all', 'alo'] },
    rules: {
      type: 'array',
      items: dashboardRowRuleSchema
    }
  },
  required: ['ruleSetName', 'applyRuleSet', 'rules'],
  additionalProperties: true
};

const dashboardFormatRulesSchema = {
  type: 'object',
  properties: {
    filterBy: { type: 'object', additionalProperties: true },
    filterWorkflowStepsBy: { type: 'array', items: { type: 'string' } },
    recordTypeFilterBy: { type: 'string' },
    queryFilters: { type: 'object', additionalProperties: true },
    sortBy: { type: 'string' },
    groupBy: { type: 'string' },
    sortGroupBy: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rowLevel: { type: 'number' },
          compareFieldValue: { type: 'string' },
          compareField: { type: 'string' },
          relatedTo: { type: 'string' }
        },
        additionalProperties: true
      }
    },
    hideWorkflowStepTitleForRecordType: { type: 'array', items: { type: 'string' } }
  },
  additionalProperties: true
};

const dashboardTableConfigSchema = {
  type: 'object',
  properties: {
    rowConfig: { type: 'array', items: dashboardRowConfigSchema },
    formatRules: dashboardFormatRulesSchema,
    rowRulesConfig: { type: 'array', items: dashboardRuleSetSchema },
    groupRowConfig: { type: 'array', items: dashboardRowConfigSchema },
    groupRowRulesConfig: { type: 'array', items: dashboardRuleSetSchema }
  },
  additionalProperties: true
};

const workflowStateDashboardConfigSchema = {
  type: 'object',
  properties: {
    dashboardType: { type: 'string' },
    tableConfig: dashboardTableConfigSchema
  },
  required: ['dashboardType'],
  additionalProperties: false
};

export const DASHBOARD_TABLE_OVERRIDE_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    recordTypes: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          default: workflowStateDashboardConfigSchema,
          steps: {
            type: 'object',
            additionalProperties: workflowStateDashboardConfigSchema
          }
        },
        additionalProperties: false
      }
    },
    views: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          default: workflowStateDashboardConfigSchema,
          steps: {
            type: 'object',
            additionalProperties: workflowStateDashboardConfigSchema
          }
        },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};
