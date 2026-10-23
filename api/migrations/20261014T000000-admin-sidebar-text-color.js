'use strict';
module.exports = {
  name: '20261014T000000-admin-sidebar-text-color',
  up: async ({context:sails}) => {
    const {getBrandingRepository}=require('@researchdatabox/redbox-core');
    const updated=await getBrandingRepository(sails).migrateAdminSidebarTextColor();
    sails.log.info(`Admin sidebar text colour: migrated ${updated} branding and history settings.`);
  },
};
