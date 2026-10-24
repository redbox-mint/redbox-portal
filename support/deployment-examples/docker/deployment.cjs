'use strict';
// Mount institution-specific v6 configuration instead of implicit environment keys.
module.exports = {
  datastores: {
    mongodb: { url: 'mongodb://mongodb:27017/redbox-portal' },
    redboxStorage: { url: 'mongodb://mongodb:27017/redbox-storage' },
  },
  agendaQueue: { options: { db: 'mongodb://mongodb:27017/redbox-agenda' } },
  redboxSession: { mongoUrl: 'mongodb://mongodb:27017/redbox-sessions' },
  solr: { cores: { default: { options: { host: 'solr', port: 8983, core: 'redbox' } } } },
};
