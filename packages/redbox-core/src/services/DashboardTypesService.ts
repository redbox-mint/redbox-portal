import { Services as Domain } from '../dashboards/DashboardTypes';
import { LegacyDashboardTypes } from '../compat/sails/dashboardTypes';
export namespace Services {
  export type DashboardRowConfig = Domain.DashboardRowConfig;
  export type DashboardTableConfig = Domain.DashboardTableConfig;
  export type RecordTypeDashboardConfig = Domain.RecordTypeDashboardConfig;
  export type DashboardRule = Domain.DashboardRule;
  export type DashboardRuleSet = Domain.DashboardRuleSet;
  export type DashboardViewConfig = Domain.DashboardViewConfig;
  export type DashboardViewStepConfig = Domain.DashboardViewStepConfig;
  export type DashboardTypeConfig = Domain.DashboardTypeConfig;
  export class DashboardTypes extends LegacyDashboardTypes {}
}
declare global {
  let DashboardTypesService: Services.DashboardTypes;
}
