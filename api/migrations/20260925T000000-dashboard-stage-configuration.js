'use strict';

/**
 * Converts v5.0.1 dashboard profiles, defaults and overrides into independent
 * per-stage/per-view dashboard settings.
 *
 * The conversion is implemented and tested in @researchdatabox/redbox-core
 * (DashboardConfigService.migrateLegacyConfiguration). It is idempotent: it keeps
 * the first recovery snapshot, never recreates a published brand document and
 * stops before publishing a brand whose conversion has unresolved differences.
 * See support/wiki/Configuring-Dashboard-Tables.md for the upgrade procedure.
 */
module.exports = {
  name: '20260925T000000-dashboard-stage-configuration',
  up: async ({ context: sails } = {}) => {
    const service = sails && sails.services && sails.services.dashboardconfigservice;
    if (!service || typeof service.migrateLegacyConfiguration !== 'function') {
      throw new Error('DashboardConfigService is not available; regenerate shims before migrating.');
    }
    await service.migrateLegacyConfiguration();
  }
};
