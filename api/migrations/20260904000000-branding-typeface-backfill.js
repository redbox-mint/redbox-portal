'use strict';
const { getBrandingRepository } = require('@researchdatabox/redbox-core/dist/persistence/branding/runtime');
const {
  BRANDING_TYPEFACE_MIGRATION_NAME,
  migrateBrandingTypefaces,
} = require('@researchdatabox/redbox-core/dist/branding/typefaceMigration');

// Temporary comparison adapter; the standalone application binds the same conversion directly.
module.exports = {
  name: BRANDING_TYPEFACE_MIGRATION_NAME,
  up: async ({ context: sails } = {}) => {
    if (!sails) throw new Error('branding-typeface-backfill-models-unavailable');
    await migrateBrandingTypefaces({
      repository: getBrandingRepository(sails),
      historyMaxVersions: sails.config?.branding?.historyMaxVersions,
      log: sails.log,
    });
  },
};
