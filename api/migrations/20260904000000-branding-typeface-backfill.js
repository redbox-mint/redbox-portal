'use strict';
const { getBrandingRepository } = require('@researchdatabox/redbox-core/dist/persistence/branding/runtime');
const {
  BRANDING_TYPEFACE_MIGRATION_NAME,
  migrateBrandingTypefaces,
} = require('@researchdatabox/redbox-core/dist/branding/typefaceMigration');

// Historical migration entry; the v6 application binds this same conversion directly.
module.exports = {
  name: BRANDING_TYPEFACE_MIGRATION_NAME,
  up: async ({ context: owner } = {}) => {
    if (!owner) throw new Error('branding-typeface-backfill-models-unavailable');
    await migrateBrandingTypefaces({
      repository: getBrandingRepository(owner),
      historyMaxVersions: owner.config?.branding?.historyMaxVersions,
      log: owner.log,
    });
  },
};
