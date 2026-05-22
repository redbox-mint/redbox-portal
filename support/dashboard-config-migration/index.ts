import type { DashboardTableConfig } from '../../packages/redbox-core/src/config/workflow.config';
import type {
  DashboardTableOverrideConfigData,
  WorkflowStateDashboardConfig
} from '../../packages/redbox-core/src/configmodels/DashboardTableOverrideConfig';

type LegacyWorkflowStateValue = DashboardTableConfig | WorkflowStateDashboardConfig | undefined;

type LegacyDashboardOverrides = {
  recordTypes?: Record<string, {
    default?: LegacyWorkflowStateValue;
    steps?: Record<string, LegacyWorkflowStateValue>;
  }>;
  views?: Record<string, {
    default?: LegacyWorkflowStateValue;
    steps?: Record<string, LegacyWorkflowStateValue>;
  }>;
  dashboardTypes?: Record<string, Record<string, unknown>>;
};

function toStrictStateConfig(value: LegacyWorkflowStateValue, fallbackDashboardType: string): WorkflowStateDashboardConfig | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === 'object' && 'dashboardType' in value) {
    const current = value as WorkflowStateDashboardConfig;
    return {
      dashboardType: current.dashboardType || fallbackDashboardType,
      tableConfig: current.tableConfig
    };
  }
  return {
    dashboardType: fallbackDashboardType,
    tableConfig: value as DashboardTableConfig
  };
}

export function migrateDashboardConfigOverrides(
  legacy: LegacyDashboardOverrides,
  options?: {
    fallbackDashboardType?: string;
  }
): {
  overrides: DashboardTableOverrideConfigData;
  legacyDashboardTypes: Record<string, Record<string, unknown>>;
} {
  const fallbackDashboardType = options?.fallbackDashboardType ?? 'standard';
  const overrides: DashboardTableOverrideConfigData = { recordTypes: {}, views: {} };

  for (const [recordType, recordTypeValue] of Object.entries(legacy.recordTypes ?? {})) {
    const steps: Record<string, WorkflowStateDashboardConfig> = {};
    for (const [stepName, stepValue] of Object.entries(recordTypeValue.steps ?? {})) {
      const migrated = toStrictStateConfig(stepValue, fallbackDashboardType);
      if (migrated) {
        steps[stepName] = migrated;
      }
    }
    const defaultState = toStrictStateConfig(recordTypeValue.default, fallbackDashboardType);
    if (defaultState || Object.keys(steps).length > 0) {
      overrides.recordTypes![recordType] = {
        ...(defaultState ? { default: defaultState } : {}),
        ...(Object.keys(steps).length > 0 ? { steps } : {})
      };
    }
  }

  for (const [viewName, viewValue] of Object.entries(legacy.views ?? {})) {
    const steps: Record<string, WorkflowStateDashboardConfig> = {};
    for (const [stepName, stepValue] of Object.entries(viewValue.steps ?? {})) {
      const migrated = toStrictStateConfig(stepValue, fallbackDashboardType);
      if (migrated) {
        steps[stepName] = migrated;
      }
    }
    const defaultState = toStrictStateConfig(viewValue.default, fallbackDashboardType);
    if (defaultState || Object.keys(steps).length > 0) {
      overrides.views![viewName] = {
        ...(defaultState ? { default: defaultState } : {}),
        ...(Object.keys(steps).length > 0 ? { steps } : {})
      };
    }
  }

  return {
    overrides,
    legacyDashboardTypes: legacy.dashboardTypes ?? {}
  };
}

if (require.main === module) {
  // This file is intentionally a library-style migration helper.
  // Wire it into your upgrade workflow or run it from a small wrapper script.
  // eslint-disable-next-line no-console
  console.log('Use migrateDashboardConfigOverrides() from a wrapper script to transform legacy dashboard config.');
}
