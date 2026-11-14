'use strict';
const { Config } = require('@researchdatabox/redbox-core');
module.exports = {
  ...require('redbox-hook-reporting-demo').registerRedboxConfig(),
  http: { rootContext: '', trustProxy: true },
  log: { level: 'info', customLogger: Config.log.createPinoLogger('info') },
  webpack: { _hookTimeout: 480000 },
  bootstrapTimeout: 480000,
  csp: { extras: [] },
  services: { email: { disabled: true } },
  datastores: {
    mongodb: { url: 'mongodb://mongodb:27017/reporting-demo-portal' },
    redboxStorage: { url: 'mongodb://mongodb:27017/reporting-demo-storage' },
  },
  vocab: { bootstrapRvaImports: false, bootstrapFigshareImports: false },
  redboxSession: { name: 'redbox.reporting-demo.sid', cookie: { secure: true, httpOnly: true, sameSite: 'lax' } },
};
