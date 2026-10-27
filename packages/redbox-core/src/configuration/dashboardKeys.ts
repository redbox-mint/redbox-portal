/** AppConfig key holding the immutable pre-migration recovery snapshot. */
export const DASHBOARD_LEGACY_SNAPSHOT_KEY = 'dashboardConfigLegacySnapshot';
/** Retired AppConfig key; readable by the migration only. */
export const DASHBOARD_LEGACY_OVERRIDE_KEY = 'dashboardTableConfig';
/** AppConfig keys that generic configuration writes must not touch. */
export const RESERVED_DASHBOARD_APP_CONFIG_KEYS = [DASHBOARD_LEGACY_OVERRIDE_KEY, DASHBOARD_LEGACY_SNAPSHOT_KEY];
