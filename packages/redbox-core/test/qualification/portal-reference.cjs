// Reference-domain qualification, not a production HTTP entrypoint. Requires disposable real services.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { MongoClient } = require('mongodb');
const { firstValueFrom } = require('rxjs');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { ApplicationRuntime, runApplicationMigrations } = require('../../dist/application');
const { portalReferencePlan } = require('../../dist/application/portal/reference');
const { loadPortalConfiguration } = require('../../dist/configuration/portal');
const { ConfigModelRegistry } = require('../../dist/configuration/ConfigModelRegistry');
const { resolveExtensions } = require('../../dist/extensions');
const { prepareSelectedPersistenceIndexes } = require('../../dist/persistence/maintenance');
const runtime = {
  ...require('../../dist/persistence/runtime'),
  ...require('../../dist/persistence/cache/runtime'),
  ...require('../../dist/persistence/storage/runtime'),
};
const { Services: Disks } = require('../../dist/storage/StorageManager');
const { Services: Solr } = require('../../dist/queries/Solr');
const { Services: Records } = require('../../dist/records/Records');
const { Services: Datastreams } = require('../../dist/storage/StandardDatastream');
const { FigshareSourceIntents } = require('../../dist/records/FigshareSourceIntents');
const { AuthenticationAccounts } = require('../../dist/authentication/Accounts');
const { AgendaQueue } = require('../../dist/queues');
const { Services: Branding } = require('../../dist/branding/Branding');
const hook = require('@researchdatabox/sails-hook-redbox-storage-mongo/extension');
const dev = require('redbox-hook-dev/extension').registerRedboxExtension();

test(
  'selected real reference domains: migration, bundled bootstrap, restart and failed cleanup',
  { timeout: 120000 },
  async () => {
    assert.equal(process.version, 'v26.11.1');
    assert.equal(global.sails, undefined);
    const url = process.env.SR_REFERENCE_MONGO_URL;
    assert(url, 'SR_REFERENCE_MONGO_URL is required; no missing-service skip');
    assert.equal(new URL(url).pathname, '/sr_p7_reference');
    assert(process.env.SR_REFERENCE_SOLR_PORT, 'SR_REFERENCE_SOLR_PORT is required');
    const native = await new MongoClient(url).connect();
    const directory = await mkdtemp(join(tmpdir(), 'sr-p7-reference-'));
    let app;
    try {
      assert.equal((await native.db().listCollections().toArray()).length, 0, 'use an empty disposable database');
      const application = join(directory, 'application.cjs');
      await writeFile(
        application,
        'module.exports = ' +
          JSON.stringify({
            datastores: {
              mongodb: { url },
              redboxStorage: { url: url.replace('/sr_p7_reference', '/sr_p7_reference_storage') },
            },
            storage: {
              disks: {
                staging: { driver: 'fs', config: { root: join(directory, 'staging') } },
                primary: { driver: 'fs', config: { root: join(directory, 'primary') } },
                'figshare-staging': { driver: 'fs', config: { root: join(directory, 'figshare') } },
              },
            },
            // Remote RVA imports are a separate provider qualification. Local vocabulary data still runs.
            vocab: { bootstrapRvaImports: false },
            solr: {
              clientSleepTimeMillis: 0,
              cores: {
                default: {
                  options: {
                    host: '127.0.0.1',
                    port: Number(process.env.SR_REFERENCE_SOLR_PORT),
                    core: 'redbox',
                  },
                },
              },
            },
          }) +
          ';'
      );
      const config = await loadPortalConfiguration({
        extensions: {
          providers: [
            { name: 'storage', root: __dirname, declaration: hook.registerRedboxExtension() },
            { name: 'development', root: __dirname, declaration: dev },
          ],
        },
        files: { application },
        env: { REDBOX_SESSION_SECRET: 'reference-qualification-only-secret-at-least-32' },
      });
      const maintenance = { config, log };
      const report = await prepareSelectedPersistenceIndexes(maintenance, 'ensure', { storage: hook });
      assert.equal(report.ready, true);
      await runtime.cleanupPersistence(maintenance);
      const indexesBefore = await native
        .db()
        .listCollections()
        .toArray()
        .then(async collections =>
          Promise.all(collections.map(async c => [c.name, await native.db().collection(c.name).indexes()]))
        );

      let defaults = 0,
        selected = 0;
      async function compose({ fail = false } = {}) {
        const owner = { config, log };
        let storage, disks, search, records;
        const plan = portalReferencePlan(owner, config, log, {
          storage: () => storage,
          disks: () => disks,
          search: () => search,
          records: () => records,
          models: new ConfigModelRegistry(),
          localesDirectory: resolve('language-defaults'),
          formRegistry: dev.forms,
        });
        const registry = new Map();
        // This qualification does not execute configured record writes/jobs. Actual
        // Records/Agenda objects supply the collaborators; there is no synthetic provider.
        const resolveHook = name => {
          if (!registry.has(name)) throw new Error('Unregistered qualification operation: ' + name);
          return registry.get(name);
        };
        const accounts = new AuthenticationAccounts({
          repository: { one: (...args) => runtime.getIdentityRepositories(owner).one(...args) },
          log,
          resolveHook,
          event() {},
          defaultBrand: () => plan.branding.get().getDefault(),
          getBrand: name => plan.branding.get().getBrand(name),
          authConfig: name => plan.appConfigs.get().getAppConfigurationForBrand(name).auth,
          defaultAuthenticatedRole: brand => plan.roles.get().getDefAuthenticatedRole(brand),
          nestedRoles: name => config.brandingConfigurationDefaults.auth.roles?.[name] ?? [],
          authorizedEmails: name => plan.appConfigs.get().getAppConfigurationForBrand(name).authorizedDomainsEmails,
        });
        const queue = new AgendaQueue({ owner, config: config.agendaQueue, log, handler: name => registry.get(name) });
        const original = plan.branding.declaration;
        const core = {
          apiVersion: 1,
          modules: [
            {
              name: 'storageDisks',
              create: () => {
                disks = new Disks.StorageManager({ owner, config: config.storage, log });
                return { initialize: () => disks.initialize(), close: async () => {} };
              },
            },
            {
              name: 'storage',
              requires: ['storageDisks'],
              create: () => {
                const module = hook.createMongoStorageModule({
                  owner,
                  collaborators: {
                    log,
                    recordTypes: { get: (...args) => plan.types.get().get(...args) },
                    forms: { getFormByName: (...args) => plan.forms.get().getFormByName(...args) },
                    disks,
                    translate: key => plan.translation.get().t(key),
                    exportMaxRecords: () => config.record.export.maxRecords,
                  },
                });
                storage = module.storage;
                return module;
              },
            },
            {
              name: 'search',
              create: () => {
                search = new Solr.SolrSearchService({ config: config.solr, log, retainFollowup: work => work });
                return { initialize: () => search.initialize(), close: async () => {} };
              },
            },
            ...plan.modules.map(item =>
              item === plan.branding
                ? {
                    ...original,
                    create: input => {
                      defaults++;
                      return original.create(input);
                    },
                  }
                : item.declaration
            ),
            {
              name: 'records',
              requires: ['forms', 'recordSchema', 'search'],
              create: () => {
                const datastream = new Datastreams.StandardDatastream({
                  disks,
                  forms: plan.forms.get(),
                  log,
                  attachments: runtime.getStorageRepositories(owner).attachments,
                });
                const intents = new FigshareSourceIntents({
                  config: brand => plan.appConfigs.get().getAppConfigurationForBrand(brand).figsharePublishing,
                  log,
                });
                records = new Records.Records({
                  config,
                  log,
                  storageService: storage,
                  datastreamService: datastream,
                  searchService: search,
                  queueService: queue,
                  repository: runtime.getStorageRepositories(owner),
                  branding: plan.branding.get(),
                  recordTypes: plan.types.get(),
                  workflows: plan.workflows.get(),
                  forms: plan.forms.get(),
                  users: accounts,
                  roles: plan.roles.get(),
                  schema: plan.schema.get(),
                  validation: plan.validation.get(),
                  translation: plan.translation.get(),
                  attachments: runtime.getStorageRepositories(owner).attachments,
                  stagingDisk: () => disks.stagingDisk(),
                  resolveHook,
                  prepareSourceIntent: intents.prepareSourceIntent.bind(intents),
                  wakeFigshareRecord: oid => queue.now('Figshare-SyncRecord', { oid }),
                });
                return { initialize: async () => {}, close: async () => records.close() };
              },
            },
          ],
        };
        let cleanupFailed = false;
        const extension = {
          apiVersion: 1,
          modules: [
            {
              name: 'branding',
              replaces: true,
              requires: original.requires,
              create: input => {
                selected++;
                const value = new Branding.Branding(input);
                return {
                  value,
                  initialize: async () => {},
                  close: async () => {
                    if (fail && !cleanupFailed) {
                      cleanupFailed = true;
                      throw new Error('qualified cleanup failure');
                    }
                  },
                };
              },
            },
          ],
        };
        const resolved = resolveExtensions(
          [
            { name: 'core', root: __dirname, declaration: core },
            { name: 'selected', root: __dirname, declaration: extension },
          ],
          []
        );
        const byName = new Map(plan.modules.map(item => [item.declaration.name, item]));
        const factories = resolved.modules.map(item => ({
          name: item.declaration.name,
          create: byName.has(item.declaration.name)
            ? byName.get(item.declaration.name).bind(item)
            : item.declaration.create,
        }));
        app = new ApplicationRuntime(owner, factories, {
          preparePersistence: async () => {
            assert.equal((await prepareSelectedPersistenceIndexes(owner, 'inspect', { storage: hook })).ready, true);
            for (const initialize of [
              runtime.initializeCachePersistence,
              runtime.initializeBrandingPersistence,
              runtime.initializeIdentityPersistence,
              runtime.initializeReferencePersistence,
              runtime.initializeConfigurationPersistence,
              runtime.initializeMigrationPersistence,
              runtime.initializeVocabularyPersistence,
              runtime.initializeStoragePersistence,
            ])
              await initialize(owner);
          },
          migrations: () =>
            runApplicationMigrations(plan.migrations, {
              ledger: runtime.getMigrationLedgerRepository(owner),
              context: {},
              log,
            }),
          coreBootstrap: plan.bootstrap,
          postBootstrap: [
            ...plan.postBootstrap,
            ...(fail
              ? [
                  {
                    name: 'failure-probe',
                    run: async () => {
                      throw new Error('qualified bootstrap failure');
                    },
                  },
                ]
              : []),
          ],
        });
        return { plan, owner, application: app };
      }

      let first = await compose();
      await first.application.initialize();
      assert.equal(defaults, 0, 'unselected core branding factory must never run');
      assert.equal(selected, 1);
      const brand = first.plan.branding.get().getDefault();
      const types = await runtime.getReferenceRepositories(first.owner).recordTypes.listForBrand(brand.id);
      assert.equal(types.length, Object.keys(config.recordtype).length);
      const forms = await native.db().collection('form').countDocuments();
      assert(forms > 0, 'bundled forms must persist');
      const admin = await runtime.getIdentityRepositories(first.owner).one(
        'user',
        {
          username: config.brandingConfigurationDefaults.auth.local.default.adminUser,
        },
        { populate: ['roles'] }
      );
      assert(admin?.roles.some(role => role.name === 'Admin'));
      assert.equal((await runtime.getMigrationLedgerRepository(first.owner).executedNames()).length, 5);
      await first.application.activate();
      assert.equal(first.application.status().ready, true);
      await first.application.stop();
      assert.throws(() => first.plan.branding.get(), /unavailable/);
      const restarted = await compose();
      await restarted.application.initialize();
      assert.equal(restarted.plan.branding.get().getDefault().id, brand.id);
      assert.equal(await native.db().collection('form').countDocuments(), forms);
      assert.equal(defaults, 0);
      await restarted.application.stop();
      const failed = await compose({ fail: true });
      await assert.rejects(failed.application.initialize(), /qualified bootstrap failure/);
      assert.equal(failed.application.status().stopFailed, true);
      assert.equal(failed.plan.branding.get().getDefault().id, brand.id, 'failed cleanup retains the domain');
      await failed.application.stop();
      assert.throws(() => failed.plan.branding.get(), /unavailable/);
      const indexesAfter = await Promise.all(
        indexesBefore.map(async ([name]) => [name, await native.db().collection(name).indexes()])
      );
      assert.deepEqual(indexesAfter, indexesBefore, 'startup must not change prepared indexes');
      assert.equal(global.sails, undefined);
      assert(
        !Object.keys(require.cache).some(file => /[/\\](CoreBase|CoreService|services[/\\]index)\.js$/.test(file))
      );
      console.log(
        JSON.stringify({ referenceDomains: 18, types: types.length, forms, selected, defaults, migrations: 5 })
      );
    } finally {
      await app?.stop();
      await native.db('sr_p7_reference_storage').dropDatabase();
      await native.db().dropDatabase();
      await native.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
);
