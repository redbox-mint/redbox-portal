import assert from 'node:assert/strict';
import { MongoClient, ObjectId } from 'mongodb';
import { firstValueFrom, isObservable } from 'rxjs';
import * as sinon from 'sinon';
import { createSinonStubLogger } from '../logger.test';
import { pilotConfiguration, capturePilotResult } from './pilotFixture';
const { RecordTypes }: typeof import('../../src/recordTypes') = require('../../dist/recordTypes');
const { ApplicationRuntime }: typeof import('../../src/application') = require('../../dist/application');
const { ExpressHost }: typeof import('../../src/http/express') = require('../../dist/http/express');
const { initializeReferencePersistence, getReferenceRepositories }: typeof import('../../src/persistence/reference/runtime') = require('../../dist/persistence/reference/runtime');
const { referenceIndexes }: typeof import('../../src/persistence/reference/preflight') = require('../../dist/persistence/reference/preflight');

describe('compiled owned record types on real MongoDB', function () {
  this.timeout(30000);
  let native: MongoClient;
  let base: URL;
  const databases: string[] = [];
  const hosts: InstanceType<typeof ExpressHost>[] = [];
  const brand = { id: new ObjectId().toHexString() };
  before(async () => {
    assert(process.env.COMPILED_RECORD_TYPES_TEST_MONGO_URL, 'COMPILED_RECORD_TYPES_TEST_MONGO_URL is required; no skip');
    base = new URL(process.env.COMPILED_RECORD_TYPES_TEST_MONGO_URL);
    assert.equal(base.pathname, '/sr_p8_compiled');
    native = await new MongoClient(base.toString()).connect();
  });
  afterEach(async () => {
    sinon.restore();
    for (const host of hosts.splice(0)) await host.stop();
  });
  after(async () => {
    if (native) {
      try { for (const name of databases) await native.db(name).dropDatabase(); }
      finally { await native.close(); }
    }
  });
  async function fixture(hookFailure?: Error) {
    const name = `sr_p8_compiled_${process.pid}_${databases.length}`;
    databases.push(name);
    const url = new URL(base); url.pathname = '/' + name;
    for (const index of referenceIndexes) await native.db(name).collection(index.collection).createIndex(index.keys, { name: index.name, unique: index.unique });
    const owner = { config: { ...pilotConfiguration(), datastores: { mongodb: { url: url.toString(), maxPoolSize: 2 } } }, log: createSinonStubLogger(sinon) };
    const stages: string[] = [];
    let instance!: InstanceType<typeof RecordTypes>;
    const application = new ApplicationRuntime(owner, [{
      name: 'recordTypes', create: () => {
        instance = new RecordTypes({ repository: getReferenceRepositories(owner).recordTypes, config: owner.config, log: owner.log, storageCapability: () => ({ getCapabilities: () => ({ recordConcurrency: 1 }) }) });
        return { initialize: async () => {}, close: () => instance.close() };
      },
    }], {
      preparePersistence: async () => { await initializeReferencePersistence(owner); stages.push('prepare'); },
      coreBootstrap: [{ name: 'record-types', run: async () => {
        const values = await instance.bootstrap(brand);
        assert(Array.isArray(values)); assert.equal(values.length, 1);
        assert.equal(application.status().ready, false);
        stages.push('core');
      } }],
      extensionBootstrap: [{ name: 'extension', run: async () => {
        stages.push('extension'); assert.equal(application.status().ready, false);
        if (hookFailure) throw hookFailure;
      } }],
      postBootstrap: [{ name: 'post', run: async () => { stages.push('post'); assert.equal(application.status().ready, false); } }],
    });
    const host = new ExpressHost(application, { owner, port: 0, hostname: '127.0.0.1', prepare: router => {
      router.get('/test/record-types', async (_req, res) => { res.json({ count: (await firstValueFrom(instance.getAll(brand))).length }); });
    } });
    hosts.push(host);
    return { host, application, owner, stages, name, instance: () => instance };
  }
  it('uses one compiled instance/client/pool through bootstrap, HTTP and owned stop', async () => {
    const bootstrap = sinon.spy(RecordTypes.prototype, 'bootstrap');
    const close = sinon.spy(RecordTypes.prototype, 'close');
    const f = await fixture();
    await Promise.all([f.host.initialize(), f.host.initialize()]);
    await f.host.initialize();
    await Promise.all([f.host.activate(), f.host.activate()]);
    assert.deepEqual(f.stages, ['prepare', 'core', 'extension', 'post']);
    assert.equal(f.application.status().state, 'active');
    assert.equal(f.application.status().persistence.pools, 1);
    assert.equal(f.application.status().persistence.prismaClients, 1);
    assert.equal(bootstrap.callCount, 1);
    const instance = f.instance();
    assert.equal(bootstrap.firstCall.thisValue, instance);
    assert.equal(f.instance(), instance, 'Repeated host initialization retains its owned domain');
    assert.equal(await native.db(f.name).collection('recordtype').countDocuments(), 1);
    await capturePilotResult(instance, brand);
    const repository = getReferenceRepositories(f.owner).recordTypes;
    const row = await repository.findByName(brand.id, 'dataset'); assert(row);
    await repository.reviseDefinition(row.id, { concurrentModification: { mode: 'strict' } });
    const mode = instance.resolveConcurrentModificationMode(brand, 'dataset');
    assert(isObservable(mode)); assert.equal(await firstValueFrom(mode), 'strict');
    const address = f.host.address(); assert(address);
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${address.port}/test/record-types`)).json(), { count: 1 });
    await f.host.stop();
    assert.equal(close.callCount, 1); assert.equal(f.application.status().state, 'stopped');
    assert.equal(f.application.status().persistence.pools, 0); assert.equal(f.application.status().persistence.prismaClients, 0);
    assert.equal(instance.getAllCache(), undefined);
    await assert.rejects(repository.listForBrand(brand.id), /active reference repository/);
  });
  it('retains a failed cleanup instance and pool until explicit stop retry', async () => {
    const f = await fixture(); await f.host.initialize(); await f.host.activate();
    const instance = f.instance(), original = instance.close.bind(instance);
    const close = sinon.stub(instance, 'close');
    close.onFirstCall().rejects(new Error('synthetic converted cleanup failure')); close.onSecondCall().callsFake(original);
    await assert.rejects(f.host.stop());
    const state = f.application.status();
    assert.equal(state.stopFailed, true); assert.equal(state.cleanupPending, true);
    assert.equal(state.persistence.pools, 1); assert(state.persistence.resources.includes('module:recordTypes'));
    assert.equal(f.instance(), instance); assert.equal(instance.getAllCache()?.length, 1);
    await f.host.stop();
    assert.equal(close.callCount, 2); assert.equal(f.application.status().persistence.pools, 0);
    assert.equal(f.application.status().cleanupPending, false); assert.equal(instance.getAllCache(), undefined);
  });
  it('cleans the same instance when a later extension fails before activation', async () => {
    const failure = new Error('extension bootstrap failed');
    const bootstrap = sinon.spy(RecordTypes.prototype, 'bootstrap'), close = sinon.spy(RecordTypes.prototype, 'close');
    const f = await fixture(failure);
    await assert.rejects(f.host.initialize(), error => error === failure);
    assert.equal(bootstrap.callCount, 1); assert.equal(close.callCount, 1);
    assert.equal(f.application.status().ready, false); assert.equal(f.application.status().persistence.pools, 0);
    assert.equal(f.instance().getAllCache(), undefined);
    assert.equal(await native.db(f.name).collection('recordtype').countDocuments(), 1, 'No rollback of completed bootstrap writes');
  });
});
