'use strict';
const { protocol: p } = require('./protocol.cjs');
const proxy = process.env.FM007_PROFILE === 'proxy';
const tls = process.env.FM007_TLS === 'true';
const url = `mongodb://127.0.0.1:${p.mongoPort}/fm007_core`;
module.exports = {
  server: {
    hostname: '127.0.0.1',
    port: p.portalPort,
    rootContext: proxy ? '/research' : '',
    publicUrl: `${tls ? 'https' : 'http'}://127.0.0.1:${tls ? p.tlsPort : proxy ? p.proxyPort : p.portalPort}${proxy ? '/research' : ''}`,
    trustProxy: ['loopback'],
    stopDeadlineMs: 55000,
  },
  logging: { level: 'warn' },
  bootstrap: { bootstrapDataPath: '/opt/redbox-portal/bootstrap-data' },
  i18n: { next: { init: { debug: false } } },
  datastores: { mongodb: { url }, redboxStorage: { url: url.replace('fm007_core', 'fm007_storage') } },
  redboxSession: { mongoUrl: url.replace('fm007_core', 'fm007_sessions'), cookie: { secure: tls } },
  agendaQueue: {
    options: { db: url.replace('fm007_core', 'fm007_agenda'), processEvery: '0.1 seconds' },
    jobs: { 'SolrSearchService-CreateOrUpdateIndex': { options: { concurrency: 4, lockLimit: 4 } } },
  },
  storage: {
    disks: Object.fromEntries(
      ['staging', 'primary', 'figshare-staging'].map(name => [
        name,
        { driver: 'fs', config: { root: `/fm007-state/${name}` } },
      ])
    ),
  },
  vocab: { bootstrapRvaImports: false },
  companion: { enabled: false },
  recordSchema: { enabled: true, unknownProperties: 'allow' },
  recordtype: { dataRecord: { concurrentModification: { mode: 'strict' }, searchable: true } },
  solr: {
    clientSleepTimeMillis: 0,
    cores: { default: { options: { host: '127.0.0.1', port: p.solrPort, core: 'redbox' } } },
  },
};
