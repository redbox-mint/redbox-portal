// Exercises the production application composition, not a test-domain replacement.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, writeFile, symlink, mkdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { MongoClient } = require('mongodb');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { createPortalApplication } = require('../../dist/application/portal/application');
const { prepareSelectedPersistenceIndexes } = require('../../dist/persistence/maintenance');
const runtime = require('../../dist/persistence/runtime');

test(
  'production application selects bundled domains, bootstraps, activates jobs, drains and restarts',
  { timeout: 120000 },
  async () => {
    assert.equal(process.version, 'v26.11.1');
    const url = process.env.SR_PORTAL_MONGO_URL;
    assert(url, 'SR_PORTAL_MONGO_URL is required');
    assert.equal(new URL(url).pathname, '/sr_p7_portal');
    assert(process.env.SR_PORTAL_SOLR_PORT, 'SR_PORTAL_SOLR_PORT is required');
    const native = await new MongoClient(url).connect();
    const directory = await mkdtemp(join(tmpdir(), 'sr-p7-portal-'));
    let portal;
    try {
      assert.equal((await native.db().listCollections().toArray()).length, 0, 'use a disposable empty database');
      const dependencies = {
        '@researchdatabox/sails-hook-redbox-storage-mongo': 'sails-hook-redbox-storage-mongo',
        '@researchdatabox/sails-hook-redbox-pdfgen': 'sails-hook-redbox-pdfgen',
        'redbox-hook-dev': 'redbox-hook-dev',
      };
      await mkdir(join(directory, 'node_modules', '@researchdatabox'), { recursive: true });
      for (const [name, folder] of Object.entries(dependencies))
        await symlink(resolve('packages', folder), join(directory, 'node_modules', name));
      await writeFile(
        join(directory, 'package.json'),
        JSON.stringify({
          name: 'sr-p7-portal-qualification',
          version: '1.0.0',
          dependencies: Object.fromEntries(Object.keys(dependencies).map(name => [name, '1.0.0'])),
        })
      );
      const applicationFile = join(directory, 'application.cjs');
      await writeFile(
        applicationFile,
        'module.exports = ' +
          JSON.stringify({
            datastores: {
              mongodb: { url },
              redboxStorage: { url: url.replace('/sr_p7_portal', '/sr_p7_portal_storage') },
            },
            agendaQueue: { options: { db: url.replace('/sr_p7_portal', '/sr_p7_portal_agenda') } },
            redboxSession: { mongoUrl: url.replace('/sr_p7_portal', '/sr_p7_portal_sessions') },
            storage: {
              disks: {
                staging: { driver: 'fs', config: { root: join(directory, 'staging') } },
                primary: { driver: 'fs', config: { root: join(directory, 'primary') } },
                'figshare-staging': { driver: 'fs', config: { root: join(directory, 'figshare') } },
              },
            },
            vocab: { bootstrapRvaImports: false },
            solr: {
              clientSleepTimeMillis: 0,
              cores: {
                default: {
                  options: { host: '127.0.0.1', port: Number(process.env.SR_PORTAL_SOLR_PORT), core: 'redbox' },
                },
              },
            },
          }) +
          ';'
      );
      const options = {
        appPath: directory,
        log,
        files: { application: applicationFile },
        localesDirectory: resolve('config/locales'),
        env: { REDBOX_SESSION_SECRET: 'portal-qualification-only-at-least-32-characters' },
      };
      portal = await createPortalApplication(options);
      const maintenance = { config: portal.config, log };
      try {
        assert.equal(
          (
            await prepareSelectedPersistenceIndexes(maintenance, 'ensure', {
              storage: portal.preflight,
              agenda: portal.config.agendaQueue.options,
              session: portal.config.redboxSession,
            })
          ).ready,
          true
        );
      } finally {
        await runtime.cleanupPersistence(maintenance);
      }
      await portal.application.initialize();
      assert.equal(portal.application.status().state, 'initialized');
      assert.equal(portal.application.status().ready, false);
      const brand = portal.data.reference.branding.get().getDefault();
      const admin = await runtime
        .getIdentityRepositories(portal.owner)
        .one('user', { username: 'admin' }, { populate: ['roles'] });
      assert(admin.roles.some(role => role.name === 'Admin'));
      const types = await runtime.getReferenceRepositories(portal.owner).recordTypes.listForBrand(brand.id);
      assert.equal(types.length, Object.keys(portal.config.recordtype).length);
      const formCount = await native.db().collection('form').countDocuments();
      assert(formCount > 0);
      assert.equal((await runtime.getMigrationLedgerRepository(portal.owner).executedNames()).length, 6);
      assert.equal(Object.keys(portal.config.agendaQueue.jobs).length, 17);
      assert.throws(() => portal.resolveHook('sails.services.recordsservice.create'), /Unregistered/);
      assert.equal(typeof portal.resolveHook('record.runTemplates'), 'function');
      await portal.application.activate();
      assert.equal(portal.application.status().ready, true);
      await portal.data.queue
        .get()
        .now('SecurityEventService-StoreSecurityEvent', {
          event: {
            brandId: brand.id,
            eventId: 'production-composition-proof',
            eventType: 'qualification',
            category: 'record',
            severity: 'info',
            deliveryState: 'pending',
            source: 'qualification',
            occurredAt: new Date().toISOString(),
          },
        });
      const deadline = Date.now() + 20000;
      while (!(await native.db().collection('securityevent').findOne({ eventId: 'production-composition-proof' }))) {
        assert(Date.now() < deadline, 'actual configured worker must persist its job');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const agenda = native.db('sr_p7_portal_agenda');
      const historyId = 'separate-history-proof';
      await agenda
        .collection('agendaJobs')
        .insertOne({
          _id: historyId,
          name: 'qualified-history',
          nextRunAt: null,
          lockedAt: null,
          lastFinishedAt: new Date(),
        });
      await portal.data.queue.get().moveCompletedJobsToHistory({ attrs: {} });
      assert.equal(await agenda.collection('agendaJobs').countDocuments({ _id: historyId }), 0);
      assert.equal(await agenda.collection('agendaJobsHistory').countDocuments({ _id: historyId }), 1);
      assert.equal(await native.db().collection('agendaJobsHistory').countDocuments(), 0);
      await portal.application.stop();
      assert.equal(runtime.persistenceStatus(portal.owner).pools, 0);
      const firstBrand = brand.id;
      portal = await createPortalApplication(options);
      await portal.application.initialize();
      assert.equal(portal.data.reference.branding.get().getDefault().id, firstBrand);
      assert.equal(await native.db().collection('form').countDocuments(), formCount);
      await portal.application.activate();
      await portal.application.stop();
      assert.equal(global.sails, undefined);
      assert(
        !Object.keys(require.cache).some(file => /[/\\](CoreBase|CoreService|services[/\\]index)\.js$/.test(file)),
        'production graph must not load comparison modules'
      );
      console.log(
        JSON.stringify({
          domains: portal.resolved.modules.length,
          jobs: 17,
          migrations: 6,
          types: types.length,
          forms: formCount,
          workerWrites: 1,
          restart: true,
          pools: 0,
        })
      );
    } finally {
      await portal?.application.stop();
      for (const suffix of ['', '_storage', '_agenda', '_sessions'])
        await native.db('sr_p7_portal' + suffix).dropDatabase();
      await native.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
);
