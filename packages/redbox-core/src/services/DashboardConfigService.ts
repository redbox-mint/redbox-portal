import { Services as Domain } from '../dashboards/DashboardConfig';
import { LegacyDashboardConfig } from '../compat/sails/dashboardConfig';
export {
  DASHBOARD_CONFIGURATION_MIGRATION_NAME,
  DASHBOARD_LEGACY_SNAPSHOT_KEY,
  DASHBOARD_LEGACY_OVERRIDE_KEY,
  RESERVED_DASHBOARD_APP_CONFIG_KEYS,
} from '../dashboards/DashboardConfig';
export namespace Services {
  export type DashboardConfigErrorCode = Domain.DashboardConfigErrorCode;
  export type DashboardConfigError = Domain.DashboardConfigError;
  export type DashboardTargetInfo = Domain.DashboardTargetInfo;
  export type DashboardTargetCatalogue = Domain.DashboardTargetCatalogue;
  export type DashboardTargetSettingsResult = Domain.DashboardTargetSettingsResult;
  export type DashboardValidationResult = Domain.DashboardValidationResult;
  export type DashboardSaveRequest = Domain.DashboardSaveRequest;
  export type DashboardCopyRequest = Domain.DashboardCopyRequest;
  export type DashboardCopyApplyRequest = Domain.DashboardCopyApplyRequest;
  export type DashboardCopyPreview = Domain.DashboardCopyPreview;
  export type DashboardRuntimeSettings = Domain.DashboardRuntimeSettings;
  export type LegacyPreflightReport = Domain.LegacyPreflightReport;
  export type DashboardCallerOptions = Domain.DashboardCallerOptions;
  export const DashboardConfigError = Domain.DashboardConfigError;
  export class DashboardConfig extends LegacyDashboardConfig {}
}
declare global {
  let DashboardConfigService: Services.DashboardConfig;
}
