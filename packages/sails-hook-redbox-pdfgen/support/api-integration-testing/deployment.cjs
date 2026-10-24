'use strict';
// Disposable PDF integration inputs; no generated core files are overwritten.
module.exports = {
  server: { publicUrl: 'http://redboxportal:1500' },
  datastores: {
    mongodb: { url: 'mongodb://mongodb:27017/redbox-portal' },
    redboxStorage: { url: 'mongodb://mongodb:27017/redbox-storage' },
  },
  agendaQueue: { options: { db: 'mongodb://mongodb:27017/redbox-agenda' } },
  redboxSession: { mongoUrl: 'mongodb://mongodb:27017/redbox-sessions', cookie: { secure: false } },
  storage: {
    disks: {
      staging: { driver: 'fs', config: { root: '/attachments/staging' } },
      primary: { driver: 'fs', config: { root: '/attachments/primary' } },
      'figshare-staging': { driver: 'fs', config: { root: '/attachments/figshare' } },
    },
  },
  brandingConfigurationDefaults: {
    // The native browser uses this brand's disposable authenticated API actor.
    pdfgen: { token: '6b088b4d-d54c-470c-8568-2f2695fcdab9' },
    auth: { active: ['local'], local: { default: { token: '6b088b4d-d54c-470c-8568-2f2695fcdab9' } } },
  },
  recordtype: require('./recordtype.config.js').recordtype,
  bootstrap: { bootstrapDataPath: 'bootstrap-data' },
  vocab: { bootstrapRvaImports: false, bootstrapFigshareImports: false },
  solr: { cores: { default: { options: { host: 'solr', port: 8983, core: 'redbox' } } } },
  i18n: { next: { init: { debug: false } } },
  csp: { extras: [] },
};
