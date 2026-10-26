'use strict';
// Explicit v6 inputs for the existing integration profiles. These fixtures use
// the providers, databases and bundled development extension.
const fixtures = require('../../config/env/integrationtest.js');
const profile = process.env.RBPORTAL_EXPRESS_TEST_PROFILE || 'general';
if (!['general', 'oidc', 's3', 'mocha'].includes(profile)) throw new Error('Unknown integration profile: ' + profile);
const s3 = profile === 's3';
module.exports = {
  server: { hostname: '0.0.0.0', port: 1500, publicUrl: 'http://redboxportal:1500' },
  datastores: {
    mongodb: { url: 'mongodb://mongodb:27017/redbox-portal' },
    redboxStorage: { url: 'mongodb://mongodb:27017/redbox-storage' },
  },
  agendaQueue: { options: { db: 'mongodb://mongodb:27017/redbox-agenda' } },
  redboxSession: { mongoUrl: 'mongodb://mongodb:27017/redbox-sessions', cookie: { secure: false } },
  storage: {
    disks: {
      staging: { driver: 'fs', config: { root: '/attachments/staging' } },
      primary: s3
        ? {
            driver: 's3',
            config: {
              key: 's3mock',
              secret: 's3mock',
              bucket: 'test-aws-redbox-attachments',
              region: 'us-east-1',
              endpoint: 'http://s3mock:9090',
              forcePathStyle: true,
              visibility: 'private',
            },
          }
        : { driver: 'fs', config: { root: '/attachments/primary' } },
      'figshare-staging': { driver: 'fs', config: { root: '/attachments/figshare' } },
    },
  },
  bootstrap: { bootstrapDataPath: 'bootstrap-data' },
  brandingConfigurationDefaults: {
    auth: {
      ...fixtures.brandingConfigurationDefaults.auth,
      local: { default: { token: 'd077835a-696b-4728-85cf-3ffd57152b1e' } },
    },
  },
  companion: fixtures.companion,
  vocab: { bootstrapRvaImports: false },
  i18n: { next: { init: { debug: false } } },
  solr: { clientSleepTimeMillis: 0, cores: { default: { options: { host: 'solr', port: 8983, core: 'redbox' } } } },
  recordSchema: { enabled: ['general', 'mocha'].includes(profile), unknownProperties: 'allow' },
  recordValidation: { mode: 'shadow' },
  recordtype: { dataPublication: { recordValidation: { mode: 'enforce' } } },
  emailnotification: { settings: { serverOptions: { host: 'email', port: 1025 } } },
  csp: { extras: [] },
};
