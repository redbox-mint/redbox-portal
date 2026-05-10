import { AppConfig } from './AppConfig.interface';
import type { DashboardTableConfig, DashboardFormatRules } from '../config/workflow.config';

/**
 * Dashboard table override configuration for a specific record type step
 */
export interface RecordTypeStepOverride {
  [stepName: string]: DashboardTableConfig;
}

/**
 * Dashboard table override configuration for a record type
 */
export interface RecordTypeOverride {
  default?: DashboardTableConfig;
  steps?: RecordTypeStepOverride;
}

/**
 * Dashboard table override configuration for record types map
 */
export interface RecordTypesOverrideMap {
  [recordTypeName: string]: RecordTypeOverride;
}

/**
 * Dashboard table override configuration for a dashboard view step
 */
export interface ViewStepOverride {
  [stepName: string]: DashboardTableConfig;
}

/**
 * Dashboard table override configuration for a dashboard view
 */
export interface ViewOverride {
  steps?: ViewStepOverride;
}

/**
 * Dashboard table override configuration for views map
 */
export interface ViewsOverrideMap {
  [viewName: string]: ViewOverride;
}

/**
 * Dashboard type format rules override
 */
export interface DashboardTypeFormatRules {
  formatRules?: DashboardFormatRules;
}

/**
 * Dashboard type format rules override map
 */
export interface DashboardTypesOverrideMap {
  [dashboardTypeName: string]: DashboardTypeFormatRules;
}

/**
 * Dashboard table override configuration data interface
 */
export interface DashboardTableOverrideConfigData {
  recordTypes?: RecordTypesOverrideMap;
  views?: ViewsOverrideMap;
  dashboardTypes?: DashboardTypesOverrideMap;
}

/**
 * Dashboard table override configuration model.
 * Allows administrators to override dashboard table configurations
 * for record types, workflow steps, dashboard views, and dashboard types.
 */
export class DashboardTableOverrideConfig extends AppConfig {
  recordTypes?: RecordTypesOverrideMap;
  views?: ViewsOverrideMap;
  dashboardTypes?: DashboardTypesOverrideMap;

  public static getFieldOrder(): string[] {
    return ['recordTypes', 'views', 'dashboardTypes'];
  }
}

/**
 * Default empty dashboard table override configuration
 */
export const DEFAULT_DASHBOARD_TABLE_OVERRIDE_CONFIG: DashboardTableOverrideConfigData = {
  recordTypes: {},
  views: {},
  dashboardTypes: {}
};

/**
 * Custom JSON Schema for DashboardTableOverrideConfig.
 * Uses additionalProperties to allow dynamic keys for record types, views, and dashboard types.
 */
export const DASHBOARD_TABLE_OVERRIDE_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    recordTypes: {
      type: 'object',
      title: 'Record Types',
      description: 'Dashboard table overrides per record type',
      additionalProperties: {
        type: 'object',
        properties: {
          default: {
            type: 'object',
            title: 'Default Override',
            description: 'Default dashboard table configuration for this record type',
            properties: {
              rowConfig: {
                type: 'array',
                title: 'Row Configuration',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', title: 'Title' },
                    variable: { type: 'string', title: 'Variable' },
                    template: { type: 'string', title: 'Template' },
                    initialSort: { type: 'string', enum: ['asc', 'desc'], title: 'Initial Sort' },
                    defaultSort: { type: 'boolean', title: 'Default Sort' },
                    secondarySort: { type: 'string', title: 'Secondary Sort' }
                  },
                  required: ['title', 'variable', 'template']
                }
              },
              formatRules: {
                type: 'object',
                title: 'Format Rules',
                properties: {
                  filterBy: { type: 'object', title: 'Filter By' },
                  sortBy: { type: 'string', title: 'Sort By' },
                  groupBy: { type: 'string', title: 'Group By' },
                  sortGroupBy: {
                    type: 'array',
                    title: 'Sort Group By',
                    items: {
                      type: 'object',
                      properties: {
                        rowLevel: { type: 'number', title: 'Row Level' },
                        compareFieldValue: { type: 'string', title: 'Compare Field Value' }
                      }
                    }
                  }
                }
              },
              rowRulesConfig: {
                type: 'array',
                title: 'Row Rules Configuration',
                items: {
                  type: 'object',
                  properties: {
                    ruleSetName: { type: 'string', title: 'Rule Set Name' },
                    applyRuleSet: { type: 'boolean', title: 'Apply Rule Set' },
                    type: { type: 'string', title: 'Type' },
                    separator: { type: 'string', title: 'Separator' },
                    mode: { type: 'string', enum: ['all', 'alo'], title: 'Mode' },
                    rules: {
                      type: 'array',
                      title: 'Rules',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string', title: 'Name' },
                          action: { type: 'string', enum: ['show', 'hide'], title: 'Action' },
                          mode: { type: 'string', enum: ['all', 'alo'], title: 'Mode' },
                          renderItemTemplate: { type: 'string', title: 'Render Item Template' },
                          evaluateRulesTemplate: { type: 'string', title: 'Evaluate Rules Template' }
                        },
                        required: ['name', 'action', 'renderItemTemplate']
                      }
                    }
                  },
                  required: ['ruleSetName', 'applyRuleSet', 'rules']
                }
              },
              groupRowConfig: {
                type: 'array',
                title: 'Group Row Configuration',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', title: 'Title' },
                    variable: { type: 'string', title: 'Variable' },
                    template: { type: 'string', title: 'Template' },
                    initialSort: { type: 'string', enum: ['asc', 'desc'], title: 'Initial Sort' },
                    defaultSort: { type: 'boolean', title: 'Default Sort' },
                    secondarySort: { type: 'string', title: 'Secondary Sort' }
                  },
                  required: ['title', 'variable', 'template']
                }
              },
              groupRowRulesConfig: {
                type: 'array',
                title: 'Group Row Rules Configuration',
                items: {
                  type: 'object',
                  properties: {
                    ruleSetName: { type: 'string', title: 'Rule Set Name' },
                    applyRuleSet: { type: 'boolean', title: 'Apply Rule Set' },
                    type: { type: 'string', title: 'Type' },
                    separator: { type: 'string', title: 'Separator' },
                    mode: { type: 'string', enum: ['all', 'alo'], title: 'Mode' },
                    rules: {
                      type: 'array',
                      title: 'Rules',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string', title: 'Name' },
                          action: { type: 'string', enum: ['show', 'hide'], title: 'Action' },
                          mode: { type: 'string', enum: ['all', 'alo'], title: 'Mode' },
                          renderItemTemplate: { type: 'string', title: 'Render Item Template' },
                          evaluateRulesTemplate: { type: 'string', title: 'Evaluate Rules Template' }
                        },
                        required: ['name', 'action', 'renderItemTemplate']
                      }
                    }
                  },
                  required: ['ruleSetName', 'applyRuleSet', 'rules']
                }
              }
            }
          },
          steps: {
            type: 'object',
            title: 'Step Overrides',
            description: 'Per-step dashboard table overrides',
            additionalProperties: {
              $ref: '#/definitions/dashboardTableConfig'
            }
          }
        }
      }
    },
    views: {
      type: 'object',
      title: 'Views',
      description: 'Dashboard table overrides per dashboard view',
      additionalProperties: {
        type: 'object',
        properties: {
          steps: {
            type: 'object',
            title: 'Step Overrides',
            description: 'Per-step dashboard table overrides for this view',
            additionalProperties: {
              $ref: '#/definitions/dashboardTableConfig'
            }
          }
        }
      }
    },
    dashboardTypes: {
      type: 'object',
      title: 'Dashboard Types',
      description: 'Format rules overrides per dashboard type',
      additionalProperties: {
        type: 'object',
        properties: {
          formatRules: {
            type: 'object',
            title: 'Format Rules',
            properties: {
              filterBy: { type: 'object', title: 'Filter By' },
              sortBy: { type: 'string', title: 'Sort By' },
              groupBy: { type: 'string', title: 'Group By' },
              sortGroupBy: {
                type: 'array',
                title: 'Sort Group By',
                items: {
                  type: 'object',
                  properties: {
                    rowLevel: { type: 'number', title: 'Row Level' },
                    compareFieldValue: { type: 'string', title: 'Compare Field Value' }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  definitions: {
    dashboardTableConfig: {
      type: 'object',
      title: 'Dashboard Table Configuration',
      properties: {
        rowConfig: {
          type: 'array',
          title: 'Row Configuration',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', title: 'Title' },
              variable: { type: 'string', title: 'Variable' },
              template: { type: 'string', title: 'Template' },
              initialSort: { type: 'string', enum: ['asc', 'desc'], title: 'Initial Sort' },
              defaultSort: { type: 'boolean', title: 'Default Sort' },
              secondarySort: { type: 'string', title: 'Secondary Sort' }
            },
            required: ['title', 'variable', 'template']
          }
        },
        formatRules: {
          type: 'object',
          title: 'Format Rules',
          properties: {
            filterBy: { type: 'object', title: 'Filter By' },
            sortBy: { type: 'string', title: 'Sort By' },
            groupBy: { type: 'string', title: 'Group By' },
            sortGroupBy: {
              type: 'array',
              title: 'Sort Group By',
              items: {
                type: 'object',
                properties: {
                  rowLevel: { type: 'number', title: 'Row Level' },
                  compareFieldValue: { type: 'string', title: 'Compare Field Value' }
                }
              }
            }
          }
        },
        rowRulesConfig: {
          type: 'array',
          title: 'Row Rules Configuration',
          items: {
            type: 'object',
            properties: {
              ruleSetName: { type: 'string', title: 'Rule Set Name' },
              applyRuleSet: { type: 'boolean', title: 'Apply Rule Set' },
              type: { type: 'string', title: 'Type' },
              separator: { type: 'string', title: 'Separator' },
              mode: { type: 'string', enum: ['all', 'alo'], title: 'Mode' },
              rules: {
                type: 'array',
                title: 'Rules',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', title: 'Name' },
                    action: { type: 'string', enum: ['show', 'hide'], title: 'Action' },
                    mode: { type: 'string', enum: ['all', 'alo'], title: 'Mode' },
                    renderItemTemplate: { type: 'string', title: 'Render Item Template' },
                    evaluateRulesTemplate: { type: 'string', title: 'Evaluate Rules Template' }
                  },
                  required: ['name', 'action', 'renderItemTemplate']
                }
              }
            },
            required: ['ruleSetName', 'applyRuleSet', 'rules']
          }
        },
        groupRowConfig: {
          type: 'array',
          title: 'Group Row Configuration',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', title: 'Title' },
              variable: { type: 'string', title: 'Variable' },
              template: { type: 'string', title: 'Template' },
              initialSort: { type: 'string', enum: ['asc', 'desc'], title: 'Initial Sort' },
              defaultSort: { type: 'boolean', title: 'Default Sort' },
              secondarySort: { type: 'string', title: 'Secondary Sort' }
            },
            required: ['title', 'variable', 'template']
          }
        },
        groupRowRulesConfig: {
          type: 'array',
          title: 'Group Row Rules Configuration',
          items: {
            type: 'object',
            properties: {
              ruleSetName: { type: 'string', title: 'Rule Set Name' },
              applyRuleSet: { type: 'boolean', title: 'Apply Rule Set' },
              type: { type: 'string', title: 'Type' },
              separator: { type: 'string', title: 'Separator' },
              mode: { type: 'string', enum: ['all', 'alo'], title: 'Mode' },
              rules: {
                type: 'array',
                title: 'Rules',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', title: 'Name' },
                    action: { type: 'string', enum: ['show', 'hide'], title: 'Action' },
                    mode: { type: 'string', enum: ['all', 'alo'], title: 'Mode' },
                    renderItemTemplate: { type: 'string', title: 'Render Item Template' },
                    evaluateRulesTemplate: { type: 'string', title: 'Evaluate Rules Template' }
                  },
                  required: ['name', 'action', 'renderItemTemplate']
                }
              }
            },
            required: ['ruleSetName', 'applyRuleSet', 'rules']
          }
        }
      }
    }
  }
};
