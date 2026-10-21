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
const configuration = JSON.parse(process.env.PUB16_CLI_CONFIGURATION);
const { Services: Managers } = require('../../../redbox-core/dist/services/StorageManagerService');
// Release rehearsals interrupt the production converter after acknowledged durable writes.
if (process.env.PUB_RELEASE_FAULT) {
  const migration = require('../../../redbox-core/dist/services/publication/migration');
  const original = migration.migratePublication;
  migration.migratePublication = (runtime, options) =>
    original(
      {
        ...runtime,
        afterWrite: async step => {
          if (step === process.env.PUB_RELEASE_FAULT) throw new Error(`Rehearsal interruption: ${step}`);
        },
      },
      options
    );
}
if (process.env.PUB_RELEASE_VOCABULARY_FAULT) {
  const conversion = require('../../../redbox-core/dist/services/publication-vocabulary/conversion');
  const original = conversion.convertPublicationVocabulary;
  conversion.convertPublicationVocabulary = (db, options) =>
    original(db, options, async step => {
      if (step === process.env.PUB_RELEASE_VOCABULARY_FAULT) throw new Error(`Rehearsal interruption: ${step}`);
    });
}
const originalLoad = Module._load;
let connection;
class Application {
  load(options, callback) {
    (async () => {
      assert.equal(process.env.REDBOX_PUBLICATION_ADMIN, 'true');
      assert.equal(process.env.REDBOX_FIGSHARE_ADMIN, 'true');
      assert.deepEqual(options.hooks, { http: false, views: false, sockets: false, grunt: false });
      assert.equal(options.appPath, process.cwd());
      connection = new MongoClient(process.env.MONGO_TEST_URL);
      await connection.connect();
      const db = connection.db(process.env.PUB16_CLI_DATABASE);
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
      const saved = await db.collection('appconfig').findOne({ branding: 'brand', configKey: 'publicationPublishing' });
      const current = { ...configuration, ...(saved ? { publicationPublishing: saved.configData } : {}) };
      global.AppConfigService = {
        bootstrap: async () => {
          configLoaded = true;
        },
        getAppConfigurationForBrand: () => {
          assert.equal(configLoaded, true, 'CLI must load stored configuration');
          return current;
        },
        createOrUpdateConfig: async (_brand, key, value) => {
          await db
            .collection('appconfig')
            .updateOne({ branding: 'brand', configKey: key }, { $set: { configData: value } }, { upsert: true });
          current[key] = value;
        },
      };
      global.RecordTypesService = { getAll: () => of([]) };
      const diskConfig = process.env.PUB_RELEASE_DISK
        ? JSON.parse(process.env.PUB_RELEASE_DISK)
        : { driver: 'fs', config: { root: process.env.PUB16_CLI_DIRECTORY } };
      class Manager extends Managers.StorageManager {
        getMergedStorageConfig() {
          return {
            serviceName: 'manager',
            primaryDisk: 'durable',
            stagingDisk: 'durable',
            disks: { durable: diskConfig, repository: diskConfig },
          };
        }
        async ready() {
          await this.processDynamicImports();
          await this.bootstrap();
        }
      }
      const manager = new Manager();
      await manager.ready();
      global.StorageManagerService = manager;
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
      global.PublicationService = new core.PublicationService.Services.Publication().exports();
      global.PublicationVocabularyService =
        new core.PublicationVocabularyService.Services.PublicationVocabulary().exports();
    })().then(() => callback(), callback);
  }
  lower(callback) {
    Promise.resolve(connection?.close()).then(() => {
      writeFileSync(process.env.PUB16_CLI_CLOSED, 'closed');
      callback();
    }, callback);
  }
}
Module._load = function (name, parent, isMain) {
  if (name === 'sails') return { Sails: Application };
  if (name === '@researchdatabox/redbox-core') return { ...core, generateAllShims: async () => {} };
  return originalLoad.call(this, name, parent, isMain);
};
