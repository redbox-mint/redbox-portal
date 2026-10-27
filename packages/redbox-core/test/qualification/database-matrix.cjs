// Run only against the disposable Docker qualification databases, never a deployment.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Readable } = require('node:stream');
const { MongoClient } = require('mongodb');
const { firstValueFrom } = require('rxjs');
const { ApplicationRuntime } = require('../../dist/application');
const { ExpressHost } = require('../../dist/http/express');
const { RecordTypes } = require('../../dist/recordTypes');
const runtime = require('../../dist/extensions/storage');
const { prepareSelectedPersistenceIndexes } = require('../../dist/persistence/maintenance');
const { runApplicationMigrations } = require('../../dist/application/migrations');
const hook = require('@researchdatabox/sails-hook-redbox-storage-mongo/extension');

test(
  'separate servers: maintenance, ledger, HTTP, failover, GridFS, drain and restart',
  { timeout: 180000 },
  async () => {
    assert.equal(process.version, 'v26.12.1');
    assert.equal(global.sails, undefined);
    const coreUrl = process.env.SR_MATRIX_CORE_URL;
    const storageUrl = process.env.SR_MATRIX_STORAGE_URL;
    for (const value of [coreUrl, storageUrl]) {
      assert(value, 'Both disposable matrix connections are required');
      assert.equal(new URL(value).pathname, '/sr_p7_matrix');
    }
    assert.notEqual(new URL(coreUrl).host, new URL(storageUrl).host);
    const core = await new MongoClient(coreUrl).connect();
    const bytes = await new MongoClient(storageUrl).connect();
    const config = { datastores: { mongodb: { url: coreUrl }, redboxStorage: { url: storageUrl } } };
    const brand = { id: '000000000000000000000001' };
    const owner = { config, log: console };
    let host, restart, releaseWork;
    try {
      const metadata = [];
      for (const client of [core, bytes]) {
        const hello = await client.db().command({ hello: 1 });
        const build = await client.db().command({ buildInfo: 1 });
        const fcv = await client.db('admin').command({ getParameter: 1, featureCompatibilityVersion: 1 });
        assert.equal(build.version, process.env.SR_MATRIX_VERSION);
        assert.equal(fcv.featureCompatibilityVersion.version, process.env.SR_MATRIX_FCV);
        if (process.env.SR_MATRIX_REPLICA === 'true') assert.equal(hello.hosts.length, 3);
        metadata.push({ version: build.version, fcv: fcv.featureCompatibilityVersion.version, hosts: hello.hosts });
      }
      await runtime.initializePersistence(owner);
      const selected = { storage: hook };
      assert.equal((await prepareSelectedPersistenceIndexes(owner, 'inspect', selected)).ready, false);
      assert.equal((await prepareSelectedPersistenceIndexes(owner, 'ensure', selected)).ready, true);
      assert.equal((await prepareSelectedPersistenceIndexes(owner, 'inspect', selected)).ready, true);
      let storage, types;
      const collaborators = {
        log: { error() {}, verbose() {} },
        recordTypes: { get: (...args) => types.get(...args) },
        forms: {
          getFormByName() {
            throw Error('not used by GridFS qualification');
          },
        },
        disks: {
          disk() {
            throw Error('not used');
          },
          stagingDisk() {
            throw Error('not used');
          },
        },
        translate: key => key,
        exportMaxRecords: () => 100,
      };
      let migrations = 0;
      const app = new ApplicationRuntime(
        owner,
        [
          {
            name: 'storage',
            create: () => {
              const module = hook.createMongoStorageModule({ owner, collaborators });
              storage = module.storage;
              return module;
            },
          },
          {
            name: 'definitions',
            create: () => ({
              initialize: async () => {
                await runtime.initializeReferencePersistence(owner);
                await runtime.initializeMigrationPersistence(owner);
                types = new RecordTypes({
                  repository: runtime.getReferenceRepositories(owner).recordTypes,
                  config: {
                    appmode: {},
                    recordtype: { dataset: { packageType: 'dataset', concurrentModification: { mode: 'strict' } } },
                  },
                  log: { debug() {}, verbose() {} },
                  storageCapability: () => storage,
                });
                await types.initialize(brand);
              },
              close: async () => types.close(),
            }),
          },
        ],
        {
          migrations: async () => {
            const input = { ledger: runtime.getMigrationLedgerRepository(owner), context: {}, log: console };
            const definitions = [
              {
                name: 'sr-p7-qualified',
                up: async () => {
                  migrations++;
                },
              },
            ];
            await runApplicationMigrations(definitions, input);
            await runApplicationMigrations(definitions, input);
            assert.equal(migrations, 1);
          },
        }
      );
      host = new ExpressHost(app, {
        owner,
        hostname: '0.0.0.0',
        port: 0,
        prepare: async router => {
          router.get('/types', async (_req, res) => res.json(await firstValueFrom(types.get(brand, 'dataset'))));
        },
      });
      await host.initialize();
      const base = 'http://127.0.0.1:' + host.address().port;
      assert.equal((await fetch(base + '/readyz')).status, 503);
      await host.activate();
      assert.equal((await fetch(base + '/readyz')).status, 200);
      assert.equal((await (await fetch(base + '/types')).json()).name, 'dataset');
      const created = await storage.create(
        brand,
        { metaMetadata: { brandId: brand.id, type: 'dataset' }, metadata: { title: 'before failover' } },
        {}
      );
      assert.equal(created.success, true);
      const elections = [];
      if (process.env.SR_MATRIX_REPLICA === 'true') {
        for (const client of [core, bytes]) {
          const before = await client.db().command({ hello: 1 });
          const status = await client.db('admin').command({ replSetGetStatus: 1 });
          assert.equal(status.members.length, 3);
          assert(status.members.every(member => member.health === 1 && [1, 2].includes(member.state)));
          try {
            await client.db('admin').command({ replSetStepDown: 15, force: true });
          } catch (error) {
            assert(/network|connection|stepped down|not primary/i.test(String(error)), String(error));
          }
          const deadline = Date.now() + 45000;
          let after;
          while (Date.now() < deadline) {
            try {
              after = await client.db().command({ hello: 1 });
              if (after.isWritablePrimary && after.me !== before.me) break;
            } catch {
              /* Elections temporarily refuse operations; the deadline is the assertion. */
            }
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          assert(after?.isWritablePrimary && after.me !== before.me, 'A different member must become primary');
          elections.push({ set: before.setName, before: before.me, after: after.me });
        }
        assert.equal((await firstValueFrom(types.get(brand, 'dataset'))).name, 'dataset');
        assert.equal((await storage.getMeta(created.oid)).metadata.title, 'before failover');
      }
      await storage.addDatastream(
        created.oid,
        new runtime.Datastream({ fileId: 'qualified.txt', mimeType: 'text/plain' }),
        { getStream: async () => Readable.from(Buffer.from('after election bytes')) }
      );
      const download = await storage.getDatastream(created.oid, 'qualified.txt');
      const chunks = [];
      for await (const chunk of download.readstream) chunks.push(chunk);
      assert.equal(Buffer.concat(chunks).toString(), 'after election bytes');
      assert((await core.db().collection('recordtype').countDocuments()) > 0);
      assert.equal(await core.db().collection('record').countDocuments(), 0);
      assert((await bytes.db().collection('record').countDocuments()) > 0);
      assert.equal(await bytes.db().collection('recordtype').countDocuments(), 0);
      const entered = Promise.withResolvers(),
        release = Promise.withResolvers();
      releaseWork = release.resolve;
      const accepted = runtime.runAcceptedPersistenceWork(owner, async () => {
        entered.resolve();
        await release.promise;
        const completion = await storage.create(
          brand,
          { metaMetadata: { brandId: brand.id, type: 'dataset' }, metadata: { title: 'drained completion' } },
          {}
        );
        assert.equal(completion.success, true);
      });
      await entered.promise;
      await assert.rejects(host.stop({ deadlineMs: 30 }), /deadline|drain/i);
      assert(runtime.persistenceStatus(owner).pools > 0);
      assert.equal(host.status().ready, false);
      release.resolve();
      await accepted;
      await host.stop({ deadlineMs: 10000 });
      assert.equal(runtime.persistenceStatus(owner).pools, 0);
      assert.equal(runtime.persistenceStatus(owner).prismaClients, 0);
      const fresh = { config, log: console };
      let reopened;
      restart = new ApplicationRuntime(fresh, [
        {
          name: 'storage',
          create: () => {
            const module = hook.createMongoStorageModule({ owner: fresh, collaborators });
            reopened = module.storage;
            return module;
          },
        },
      ]);
      await restart.initialize();
      await restart.activate();
      assert.equal((await reopened.getMeta(created.oid)).metadata.title, 'before failover');
      await assert.rejects(storage.getMeta(created.oid), /unavailable|drain/i);
      await restart.stop();
      assert.equal(await bytes.db().collection('record').countDocuments({ 'metadata.title': 'drained completion' }), 1);
      assert.equal(runtime.persistenceStatus(fresh).pools, 0);
      assert.equal(
        Object.keys(require.cache).some(file =>
          /\/node_modules\/sails\/|\/redbox-core\/dist\/(index|CoreBase)\.js$|\/compat\//.test(file)
        ),
        false
      );
      console.log(
        JSON.stringify({ node: process.version, metadata, elections, separatePlacement: true, cleanStop: true })
      );
    } finally {
      releaseWork?.();
      try {
        await host?.stop({ deadlineMs: 10000 });
        await restart?.stop();
        await runtime.cleanupPersistence(owner);
        await core.db().dropDatabase();
        await bytes.db().dropDatabase();
      } finally {
        await core.close();
        await bytes.close();
      }
    }
  }
);
