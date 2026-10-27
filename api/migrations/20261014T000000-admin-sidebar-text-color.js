'use strict';
module.exports = {
  name: '20261014T000000-admin-sidebar-text-color',
  up: async ({context:owner}) => {
    const {getBrandingRepository}=require('@researchdatabox/redbox-core');
    const updated=await getBrandingRepository(owner).migrateAdminSidebarTextColor();
    owner.log.info(`Admin sidebar text colour: migrated ${updated} branding and history settings.`);
  },
};
