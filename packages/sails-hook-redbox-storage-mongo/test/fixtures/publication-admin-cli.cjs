// Process-level CLI harness: isolate the Sails boot boundary; use real production services and Mongo below it.
'use strict';
const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const { MongoClient } = require('mongodb');
const { of } = require('rxjs');
global._ = require('lodash');
const logger = Object.fromEntries(['info', 'warn', 'error', 'verbose', 'debug', 'trace'].map(name => [name, () => {}]));
global.sails = {
  config: { log: { createNamespaceLogger: () => logger, customLogger: logger } },
  log: logger,
  services: {},
  on() {},
  emit() {},
};
require('ts-node').register({ project: resolve(__dirname, '../tsconfig.json'), transpileOnly: true });
const core = require(resolve(__dirname, '../../../redbox-core/dist'));
const { Services } = require('../../src/services/MongoStorageService');
const { storage } = require('../../src/config/storage');
const configuration = JSON.parse(process.env.PUB15_CLI_CONFIGURATION);
const originalLoad = Module._load;
let connection;
const objectResult = value => ({ valid: true, value });
const provider = {
  id: 'ledger',
  contractVersion: 2,
  stateVersion: 1,
  configurationSchema: {},
  secretPaths: ['connection.token'],
  mutationRecovery: { mode: 'idempotency-key' },
  capabilities: { synchronise: true, reconcile: true, observe: true, resourceLeases: false },
  validateConfiguration: objectResult,
  targetFingerprint: () => 'verified-target',
  decodeState: objectResult,
  upgradeState: objectResult,
  decodePreparedSource: objectResult,
  prepareSource: async () => ({ valid: true, value: {} }),
  synchronise: async () => {
    throw new Error('CLI must never synchronise');
  },
  observe: async () => {
    throw new Error('CLI must never observe');
  },
  reconcile: async context => ({ kind: 'waiting', state: context.state, reason: 'read-only' }),
  repairs: [],
};
class Application {
  load(options, callback) {
    (async () => {
      assert.equal(process.env.REDBOX_PUBLICATION_ADMIN, 'true');
      assert.equal(process.env.REDBOX_FIGSHARE_ADMIN, 'true');
      assert.deepEqual(options.hooks, { http: false, views: false, sockets: false, grunt: false });
      assert.equal(options.appPath, process.cwd());
      connection = new MongoClient(process.env.MONGO_TEST_URL);
      await connection.connect();
      const db = connection.db(process.env.PUB15_CLI_DATABASE);
      for (const name of [
        'Record',
        'DeletedRecord',
        'RecordAudit',
        'IntegrationAudit',
        'RecordSchemaArtifact',
        'RecordSchemaReference',
        'PublicationSync',
      ])
        global[name] = {
          tableName: name.toLowerCase(),
          getDatastore: () => ({ manager: db }),
          findOne: criteria => db.collection(name.toLowerCase()).findOne(criteria),
        };
      sails.config.storage = storage;
      const mongo = new Services.MongoStorageService();
      await mongo.init();
      const brand = { id: 'brand', name: 'brand', roles: [] };
      let brandsLoaded = false;
      let configLoaded = false;
      let recordsPrepared = false;
      global.BrandingService = {
        getBrandById: id => (brandsLoaded && id === 'brand' ? brand : undefined),
        loadAvailableBrands: () => {
          brandsLoaded = true;
          return of(brand);
        },
      };
      global.AppConfigService = {
        bootstrap: async () => {
          configLoaded = true;
        },
        getAppConfigurationForBrand: () => {
          assert.equal(configLoaded, true, 'CLI must load stored configuration');
          return { publicationPublishing: configuration };
        },
      };
      global.StorageManagerService = { bootstrap: async () => {} };
      global.UsersService = {
        getUserWithUsername: username =>
          of({
            username,
            type: 'local',
            roles: [{ name: 'Admin', branding: username === 'admin' ? 'brand' : 'elsewhere' }],
          }),
      };
      global.RolesService = { getAdminFromRoles: roles => roles.find(role => role.name === 'Admin') };
      global.RecordsService = {
        preparePublicationAdministration: async () => {
          recordsPrepared = true;
        },
        getPublicationStorage: () => {
          assert.equal(recordsPrepared, true, 'CLI must prepare configured record storage');
          return mongo;
        },
        hasEditAccess: (_brand, user, _roles, record) => record.authorization.edit.includes(user.username),
      };
      class Publication extends core.PublicationService.Services.Publication {
        configureProviders() {
          super.configureProviders();
          this.registerProvider(provider);
        }
        async sourceConfigurationContext(_brand, adapter) {
          return {
            publicationStorage: adapter,
            authority: 'shared',
            verifiedTargets: { archive: 'verified-target', repository: 'verified-target' },
          };
        }
      }
      global.PublicationService = new Publication().exports();
    })().then(() => callback(), callback);
  }
  lower(callback) {
    Promise.resolve(connection?.close()).then(() => {
      writeFileSync(process.env.PUB15_CLI_CLOSED, 'closed');
      callback();
    }, callback);
  }
}
Module._load = function (name, parent, isMain) {
  if (name === 'sails') return { Sails: Application };
  if (name === '@researchdatabox/redbox-core') return { ...core, generateAllShims: async () => {} };
  return originalLoad.call(this, name, parent, isMain);
};
