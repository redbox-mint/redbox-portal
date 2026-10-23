import { pilotConfiguration as defaults, capturePilotResult } from './pilotFixture';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { MongoClient, ObjectId } from 'mongodb';
import { firstValueFrom } from 'rxjs';
import * as sinon from 'sinon';
import { ExpressHost } from '../../src/http/express';
import { ApplicationRuntime } from '../../src/application';
import {
  RecordTypes,
  RecordTypeRecordSchemaConfigurationError,
  type RecordTypesConfiguration,
} from '../../src/recordTypes';
import type { PersistenceOwner } from '../../src/persistence/owner';
import { initializeReferencePersistence, getReferenceRepositories } from '../../src/persistence/reference/runtime';
import { referenceIndexes } from '../../src/persistence/reference/preflight';
import { RECORD_STORAGE_CONCURRENCY_CAPABILITY_VERSION } from '../../src/RecordStorageConcurrency';

const supportedStorage = {
  getCapabilities: () => ({ recordConcurrency: RECORD_STORAGE_CONCURRENCY_CAPABILITY_VERSION }),
};
const brand = { id: new ObjectId().toHexString() };
const otherBrand = { id: new ObjectId().toHexString() };

describe('standalone RecordTypes on real MongoDB', function () {
  this.timeout(30_000);
  let native: MongoClient;
  let base: URL;
  const databases: string[] = [];
  const applications: ApplicationRuntime[] = [];
  before(async () => {
    assert.equal(Reflect.get(globalThis, 'sails'), undefined, 'Run without legacy test setup');
    assert(
      process.env.RECORD_TYPES_TEST_MONGO_URL,
      'RECORD_TYPES_TEST_MONGO_URL is required; no missing-environment skip'
    );
    base = new URL(process.env.RECORD_TYPES_TEST_MONGO_URL);
    assert.equal(base.pathname, '/sr_p1_recordtypes');
    native = await new MongoClient(base.toString()).connect();
    assert(Number.parseInt((await native.db().command({ buildInfo: 1 })).version, 10) >= 8);
  });
  afterEach(async () => {
    sinon.restore();
    for (const app of applications.splice(0)) await app.stop();
    assert.equal(Reflect.get(globalThis, 'sails'), undefined);
    assert.equal(
      Object.keys(require.cache).some(path => /\/node_modules\/sails\/|\/src\/compat\//.test(path)),
      false
    );
  });
  after(async () => {
    if (!native) return;
    try {
      for (const name of databases) await native.db(name).dropDatabase();
    } finally {
      await native.close();
    }
  });
  async function owner(): Promise<PersistenceOwner> {
    const name = `sr_p1_recordtypes_${process.pid}_${databases.length}`;
    databases.push(name);
    const url = new URL(base);
    url.pathname = '/' + name;
    for (const index of referenceIndexes)
      await native
        .db(name)
        .collection(index.collection)
        .createIndex(index.keys, { name: index.name, unique: index.unique });
    return { config: { datastores: { mongodb: { url: url.toString(), maxPoolSize: 2 } } }, log: { warn() {} } };
  }
  function compose(selectedOwner: PersistenceOwner, config = defaults(), capable = true) {
    let recordTypes!: RecordTypes;
    const app = new ApplicationRuntime(selectedOwner, [
      {
        name: 'reference',
        create: () => ({ initialize: () => initializeReferencePersistence(selectedOwner), close: async () => {} }),
      },
      {
        name: 'recordTypes',
        create: () => {
          recordTypes = new RecordTypes({
            repository: getReferenceRepositories(selectedOwner).recordTypes,
            config: structuredClone(config),
            log: { debug() {}, verbose() {} },
            storageCapability: () => (capable ? supportedStorage : undefined),
          });
          return { initialize: () => recordTypes.initialize(brand), close: () => recordTypes.close() };
        },
      },
    ]);
    applications.push(app);
    return {
      app,
      get recordTypes() {
        return recordTypes;
      },
    };
  }
  async function seed(selectedOwner: PersistenceOwner, values: Record<string, unknown>) {
    await initializeReferencePersistence(selectedOwner);
    return getReferenceRepositories(selectedOwner).recordTypes.createDefinition({
      name: 'dataset',
      branding: brand.id,
      packageType: 'dataset',
      ...values,
    });
  }

  it('bootstraps, creates lazily, reloads cache, projects and isolates brands, and rereads current policy', async () => {
    const selectedOwner = await owner();
    const fixture = compose(selectedOwner);
    await Promise.all([fixture.app.initialize(), fixture.app.initialize()]);
    const module = fixture.recordTypes;
    await capturePilotResult(module, brand);
    assert.equal(fixture.app.status().ready, false);
    assert.equal(module.getAllCache()?.length, 1);
    const stored = await getReferenceRepositories(selectedOwner).recordTypes.findByName(brand.id, 'dataset');
    assert(stored);
    assert.deepEqual(stored.recordValidation, { mode: 'shadow' });
    assert.deepEqual(stored.recordSchema, { unknownProperties: 'declared' });
    assert.deepEqual(stored.dashboard, { title: 'Dataset' });
    assert.equal(stored.searchCore, 'records');
    const created = module.create(brand, 'publication', { packageType: 'publication' });
    assert.equal((await firstValueFrom(module.getAll(brand))).length, 1);
    const row = await firstValueFrom(created);
    assert.deepEqual(await firstValueFrom(created), row);
    assert.equal((await firstValueFrom(module.getAll(brand))).length, 2);
    assert.equal(module.getAllCache()?.length, 1);
    await module.bootstrap(brand);
    assert.equal(module.getAllCache()?.length, 2);
    await firstValueFrom(module.create(otherBrand, 'dataset', { packageType: 'private' }));
    assert.equal((await firstValueFrom(module.get(otherBrand, 'dataset'))).packageType, 'private');
    assert.equal((await firstValueFrom(module.get(brand, 'dataset'))).packageType, 'dataset');
    assert.equal(await firstValueFrom(module.get(otherBrand, 'publication')), null);
    assert.equal((await firstValueFrom(module.getAll(otherBrand))).length, 1);
    const projected = await firstValueFrom(module.get(brand, 'dataset', ['concurrentModification']));
    assert.deepEqual(projected.concurrentModification, { mode: 'observe' });
    assert.equal(projected.packageType, undefined);
    const repository = getReferenceRepositories(selectedOwner).recordTypes;
    await repository.reviseDefinition(stored.id, { concurrentModification: { mode: 'strict' } });
    assert.equal(await firstValueFrom(module.resolveConcurrentModificationMode(brand, 'dataset')), 'strict');
    await repository.reviseDefinition(stored.id, { concurrentModification: { mode: 'last-write-wins' } });
    assert.equal(await firstValueFrom(module.resolveConcurrentModificationMode(brand, 'dataset')), 'last-write-wins');
    await repository.reviseDefinition(stored.id, { concurrentModification: { mode: 'invalid' } });
    await assert.rejects(firstValueFrom(module.resolveConcurrentModificationPolicy(brand, 'dataset')), TypeError);
    await assert.rejects(
      firstValueFrom(module.resolveConcurrentModificationPolicy(brand, 'missing')),
      /could not be resolved/
    );
    await fixture.app.activate();
    assert.equal(fixture.app.status().ready, true);
  });

  it('validates all configured schemas before creating any definitions', async () => {
    const selectedOwner = await owner();
    const config = defaults();
    const fixture = compose(selectedOwner, {
      ...config,
      recordtype: {
        ...config.recordtype,
        // @ts-expect-error Deliberately malformed external configuration.
        invalid: { packageType: 'dataset', recordSchema: { unknownProperties: 'strip' } },
      },
    });
    await assert.rejects(fixture.app.initialize(), RecordTypeRecordSchemaConfigurationError);
    assert.equal(fixture.recordTypes.getAllCache(), undefined);
    assert.equal(await native.db(databases.at(-1)).collection('recordtype').countDocuments(), 0);
    assert.equal(fixture.app.status().persistence.pools, 0);
    assert.equal(fixture.app.status().persistence.prismaClients, 0);
    assert.equal(fixture.app.status().cleanupPending, false);
  });

  it('rejects malformed persisted schema and preserves completed storage effects', async () => {
    const selectedOwner = await owner();
    await seed(selectedOwner, { recordSchema: { unknownProperties: 'strip' } });
    const fixture = compose(selectedOwner);
    await assert.rejects(fixture.app.initialize(), RecordTypeRecordSchemaConfigurationError);
    assert.equal(fixture.recordTypes.getAllCache(), undefined);
    assert.equal(fixture.app.status().persistence.pools, 0);
    assert.equal(await native.db(databases.at(-1)).collection('recordtype').countDocuments(), 1);
  });

  it('rejects strict configured and stored policies without a storage capability declaration', async () => {
    for (const stored of [false, true]) {
      const selectedOwner = await owner();
      if (stored) await seed(selectedOwner, { concurrentModification: { mode: 'strict' } });
      const config = defaults();
      const fixture = compose(
        selectedOwner,
        {
          ...config,
          recordtype: { dataset: { ...config.recordtype.dataset, concurrentModification: { mode: 'strict' } } },
        },
        false
      );
      await assert.rejects(fixture.app.initialize(), { code: 'record-concurrency-capability-unavailable' });
      assert.equal(fixture.app.status().ready, false);
      assert.equal(fixture.app.status().persistence.pools, 0);
    }
  });

  it('checks storage capability again when stored policy changes after startup', async () => {
    const selectedOwner = await owner();
    const fixture = compose(selectedOwner, defaults(), false);
    await fixture.app.initialize();
    const repository = getReferenceRepositories(selectedOwner).recordTypes;
    const row = await repository.findByName(brand.id, 'dataset');
    assert(row);
    await repository.reviseDefinition(row.id, { concurrentModification: { mode: 'strict' } });
    await assert.rejects(firstValueFrom(fixture.recordTypes.resolveConcurrentModificationMode(brand, 'dataset')), {
      code: 'record-concurrency-capability-unavailable',
    });
  });

  it('replaces only the selected brand on disposable bootstrapAlways and reloads its cache', async () => {
    const selectedOwner = await owner();
    await seed(selectedOwner, { name: 'old' });
    await seed(selectedOwner, { branding: otherBrand.id, name: 'private' });
    const fixture = compose(selectedOwner, { ...defaults(), appmode: { bootstrapAlways: true } });
    await fixture.app.initialize();
    assert.equal(await firstValueFrom(fixture.recordTypes.get(brand, 'old')), null);
    assert.equal((await firstValueFrom(fixture.recordTypes.getAll(brand))).length, 1);
    assert.equal((await firstValueFrom(fixture.recordTypes.getAll(otherBrand))).length, 1);
    assert.deepEqual(fixture.recordTypes.getAllCache(), await firstValueFrom(fixture.recordTypes.getAll(brand)));
  });

  it('reports retained cleanup failure with the original startup error and retries on the same owner', async () => {
    const selectedOwner = await owner();
    await seed(selectedOwner, { recordSchema: { unknownProperties: 'strip' } });
    const close = sinon.stub(RecordTypes.prototype, 'close');
    close.onFirstCall().rejects(new Error('synthetic cache cleanup failure'));
    close.onSecondCall().callsFake(async function (this: RecordTypes) {
      this.getAllCache()?.splice(0);
    });
    const fixture = compose(selectedOwner);
    await assert.rejects(fixture.app.initialize(), RecordTypeRecordSchemaConfigurationError);
    const status = fixture.app.status();
    assert.equal(status.stopFailed, true);
    assert.equal(status.cleanupPending, true);
    assert(status.persistence.resources.includes('module:recordTypes'));
    assert.equal(status.persistence.pools, 1);
    await fixture.app.stop();
    assert.equal(close.callCount, 2);
    assert.equal(fixture.app.status().cleanupPending, false);
    assert.equal(fixture.app.status().persistence.pools, 0);
  });

  it('isolates actual module caches and rejects stale service/repository handles across a fresh-instance restart', async () => {
    const selectedOwner = await owner();
    const secondOwner = await owner();
    const config = defaults();
    const first = compose(selectedOwner, config);
    const second = compose(secondOwner, { ...config, recordtype: { private: { packageType: 'private' } } });
    await Promise.all([first.app.initialize(), second.app.initialize()]);
    assert.notEqual(first.recordTypes, second.recordTypes);
    assert.notEqual(first.recordTypes.getAllCache(), second.recordTypes.getAllCache());
    assert.equal(await firstValueFrom(second.recordTypes.get(brand, 'dataset')), null);
    const stale = getReferenceRepositories(selectedOwner).recordTypes;
    await first.app.stop();
    assert.equal(first.recordTypes.getAllCache(), undefined);
    await assert.rejects(stale.listForBrand(brand.id), /active reference repository/);
    await assert.rejects(firstValueFrom(first.recordTypes.getAll(brand)), /active reference repository/);
    assert.equal(second.recordTypes.getAllCache()?.length, 1);
    assert.equal(second.app.status().persistence.pools, 1);
    const fresh = compose({ config: selectedOwner.config, log: { warn() {} } });
    await fresh.app.initialize();
    assert.equal(fresh.recordTypes.getAllCache()?.length, 1);
    await assert.rejects(first.app.initialize(), /fresh application/);
  });

  it('hosts the real module behind explicit inactive/active admission and closes its Mongo resources', async () => {
    const selectedOwner = await owner();
    const fixture = compose(selectedOwner);
    const host = new ExpressHost(fixture.app, {
      hostname: '127.0.0.1',
      port: 0,
      prepare: async router => {
        // Deliberately test-only composition; public authenticated routes belong to P4.
        router.get('/test/cache-size', (_req, res) => {
          res.json({ count: fixture.recordTypes.getAllCache()?.length });
        });
      },
    });
    try {
      await host.initialize();
      const address = host.address();
      assert(address);
      const root = `http://127.0.0.1:${address.port}`;
      assert.equal((await fetch(root + '/test/cache-size')).status, 503);
      await host.activate();
      assert.deepEqual(await (await fetch(root + '/test/cache-size')).json(), { count: 1 });
      assert.equal((await fetch(root + '/default/rdmp/api/recordtypes/getAll')).status, 404);
    } finally {
      await host.stop();
    }
    assert.equal(host.address(), null);
    assert.equal(fixture.recordTypes.getAllCache(), undefined);
    assert.equal(fixture.app.status().persistence.pools, 0);
    assert.equal(fixture.app.status().persistence.prismaClients, 0);
  });

  it('loads the compiled narrow domain/runtime graph without legacy barrels, Sails or signals', () => {
    const result = execFileSync(
      process.execPath,
      [
        '-e',
        `
      const assert = require('node:assert/strict');
      const before = ['SIGINT', 'SIGTERM'].map(s => process.listenerCount(s));
      require('./dist/recordTypes'); require('./dist/application');
      assert.equal(globalThis.sails, undefined);
      assert.equal(Object.keys(require.cache).some(p => /node_modules\\/sails\\/|dist\\/(compat|services)\\/|dist\\/Core(Base|Service)\\.js$/.test(p)), false);
      assert.equal(require.cache[require.resolve('./dist/index.js')], undefined);
      assert.deepEqual(['SIGINT', 'SIGTERM'].map(s => process.listenerCount(s)), before);
      console.log('clean compiled import graph');
    `,
      ],
      { cwd: process.cwd(), encoding: 'utf8' }
    );
    assert.match(result, /clean compiled import graph/);
  });
});
