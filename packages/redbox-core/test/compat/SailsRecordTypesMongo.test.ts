import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MongoClient, ObjectId } from 'mongodb';
import { firstValueFrom, isObservable } from 'rxjs';
import * as sinon from 'sinon';
// Execute the built artifact while checking against source types, avoiding duplicate
// ambient Sails declarations from loading both source and dist type graphs.
const { RecordTypes }: typeof import('../../src/recordTypes') = require('../../dist/recordTypes');
const {
  sailsRecordTypes,
}: typeof import('../../src/compat/sails/recordTypes') = require('../../dist/compat/sails/recordTypes');
const {
  getSailsApplication,
}: typeof import('../../src/compat/sails/application') = require('../../dist/compat/sails/application');
const {
  attachSailsPersistenceLifecycle,
}: typeof import('../../src/compat/sails/persistenceLifecycle') = require('../../dist/compat/sails/persistenceLifecycle');
const {
  initializeReferencePersistence,
  getReferenceRepositories,
}: typeof import('../../src/persistence/reference/runtime') = require('../../dist/persistence/reference/runtime');
const {
  referenceIndexes,
}: typeof import('../../src/persistence/reference/preflight') = require('../../dist/persistence/reference/preflight');
const {
  createGeneratedBootstrap,
}: typeof import('../../src/loader/bootstrapShimRuntime') = require('../../dist/loader/bootstrapShimRuntime');
import { pilotConfiguration, capturePilotResult } from '../recordTypes/pilotFixture';

interface LegacyHost extends Sails.Application {
  lift(config: Record<string, unknown>, callback: (error?: unknown) => void): void;
  lower(callback: (error?: unknown) => void): void;
}
const Host: new () => LegacyHost = require('sails').Sails;

describe('compiled Sails comparison adapter on real MongoDB', function () {
  this.timeout(30_000);
  let native: MongoClient;
  let base: URL;
  const databases: string[] = [],
    directories: string[] = [];
  const hosts: LegacyHost[] = [];
  const brand = { id: new ObjectId().toHexString() };
  before(async () => {
    assert.equal(Reflect.get(globalThis, 'sails'), undefined, 'Use the dedicated comparison command');
    // This is exactly the service getter used by generated shims, before Sails exists.
    assert.equal(typeof require('../../dist/services').ServiceExports.RecordTypesService.bootstrap, 'function');
    assert.equal(Reflect.get(globalThis, 'sails'), undefined);
    assert(process.env.LEGACY_RECORD_TYPES_TEST_MONGO_URL, 'LEGACY_RECORD_TYPES_TEST_MONGO_URL is required; no skip');
    base = new URL(process.env.LEGACY_RECORD_TYPES_TEST_MONGO_URL);
    assert.equal(base.pathname, '/sr_p1_legacy');
    native = await new MongoClient(base.toString()).connect();
  });
  afterEach(async () => {
    sinon.restore();
    for (const host of hosts.splice(0))
      await new Promise<void>((done, fail) => host.lower(error => (error ? fail(error) : done())));
    Reflect.deleteProperty(globalThis, 'sails');
  });
  after(async () => {
    if (native) {
      try {
        for (const name of databases) await native.db(name).dropDatabase();
      } finally {
        await native.close();
      }
    }
    for (const directory of directories) await rm(directory, { recursive: true, force: true });
  });
  async function fixture(hookFailure?: Error) {
    const appPath = await mkdtemp(join(tmpdir(), 'sr-p1-legacy-'));
    directories.push(appPath);
    await mkdir(join(appPath, 'api/services'), { recursive: true });
    await writeFile(
      join(appPath, 'api/services/RecordTypesService.js'),
      `module.exports = require(${JSON.stringify(resolve('dist/services'))}).ServiceExports.RecordTypesService;\n`
    );
    await writeFile(
      join(appPath, 'api/services/TestStorageService.js'),
      'module.exports = { getCapabilities() { return { recordConcurrency: 1 }; } };\n'
    );
    const name = `sr_p1_legacy_${process.pid}_${databases.length}`;
    databases.push(name);
    const url = new URL(base);
    url.pathname = '/' + name;
    for (const index of referenceIndexes)
      await native
        .db(name)
        .collection(index.collection)
        .createIndex(index.keys, { name: index.name, unique: index.unique });
    const app = new Host();
    hosts.push(app);
    const stages: string[] = [];
    const bootstrap = createGeneratedBootstrap(
      async () => {
        attachSailsPersistenceLifecycle(app);
        await initializeReferencePersistence(app);
        // This callback is deliberately still legacy; only RecordTypes is converted.
        app.services.dashboardconfigservice = {
          initialiseAfterBootstrap: async () => {
            assert.equal(getSailsApplication(app)?.status().ready, false);
            stages.push('post');
          },
        };
        stages.push('preLift');
      },
      async () => {
        const values = await app.services.recordtypesservice.bootstrap(brand);
        assert(Array.isArray(values));
        assert.equal(values.length, 1);
        assert.equal(getSailsApplication(app)?.status().state, 'initialized');
        stages.push('core');
      },
      [
        {
          name: 'comparison',
          bootstrap: async () => {
            stages.push('hook');
            assert.equal(getSailsApplication(app)?.status().ready, false);
            if (hookFailure) throw hookFailure;
          },
        },
      ]
    );
    const config = {
      ...pilotConfiguration(),
      appPath,
      environment: 'test',
      port: 0,
      host: '127.0.0.1',
      log: { level: 'error' },
      globals: { sails: true, _: false, async: false, models: false },
      hooks: { orm: false, grunt: false, sockets: false, pubsub: false, session: false, views: false },
      datastores: { mongodb: { url: url.toString(), maxPoolSize: 2 } },
      storage: { serviceName: 'teststorageservice' },
      bootstrap,
      routes: {
        'GET /test/record-types': async (_req: Sails.Req, res: Sails.Res) => {
          const values = await firstValueFrom(sailsRecordTypes(app).getAll(brand));
          res.json({ count: values.length });
        },
      },
    };
    return { app, config, stages, name };
  }

  it('uses one converted instance/bootstrap/client/pool through shims, hooks, HTTP and guarded lower', async () => {
    const bootstrap = sinon.spy(RecordTypes.prototype, 'bootstrap');
    const close = sinon.spy(RecordTypes.prototype, 'close');
    const { app, config, stages } = await fixture();
    await new Promise<void>((done, fail) => app.lift(config, error => (error ? fail(error) : done())));
    assert.deepEqual(stages, ['preLift', 'core', 'hook', 'post']);
    const application = getSailsApplication(app);
    assert(application);
    assert.equal(application.status().state, 'active');
    assert.equal(application.status().persistence.pools, 1);
    assert.equal(application.status().persistence.prismaClients, 1);
    assert.equal(bootstrap.callCount, 1);
    const instance = sailsRecordTypes(app);
    assert.equal(bootstrap.firstCall.thisValue, instance);
    const service = app.services.recordtypesservice;
    assert.equal(service.getAllCache(), instance.getAllCache());
    const [first, second] = await Promise.all([service.bootstrap(brand), service.bootstrap(brand)]);
    assert.equal(first, instance.getAllCache());
    assert.equal(second, first);
    assert.equal(bootstrap.callCount, 1);
    await capturePilotResult(instance, brand);
    const repository = getReferenceRepositories(app).recordTypes;
    const row = await repository.findByName(brand.id, 'dataset');
    assert(row);
    await repository.reviseDefinition(row.id, { concurrentModification: { mode: 'strict' } });
    assert.equal(await firstValueFrom(instance.resolveConcurrentModificationMode(brand, 'dataset')), 'strict');
    const mode = service.resolveConcurrentModificationMode(brand, 'dataset');
    assert(isObservable(mode));
    assert.equal(await firstValueFrom(mode), 'strict');
    const server = app.hooks.http?.server;
    assert(server);
    const addressFunction = server.address;
    assert(typeof addressFunction === 'function');
    const address: unknown = Reflect.apply(addressFunction, server, []);
    assert(address && typeof address === 'object' && 'port' in address && typeof address.port === 'number');
    assert.deepEqual(await (await fetch(`http://127.0.0.1:${address.port}/test/record-types`)).json(), { count: 1 });
    await new Promise<void>((done, fail) => app.lower(error => (error ? fail(error) : done())));
    hosts.splice(hosts.indexOf(app), 1);
    assert.equal(close.callCount, 1);
    assert.equal(application.status().state, 'stopped');
    assert.equal(application.status().persistence.pools, 0);
    assert.equal(application.status().persistence.prismaClients, 0);
    assert.equal(service.getAllCache(), undefined);
    await assert.rejects(repository.listForBrand(brand.id), /active reference repository/);
  });

  it('refuses legacy lower on converted cleanup failure and retries the retained instance before closing its pool', async () => {
    const { app, config } = await fixture();
    await new Promise<void>((done, fail) => app.lift(config, error => (error ? fail(error) : done())));
    const instance = sailsRecordTypes(app);
    const originalClose = instance.close.bind(instance);
    const close = sinon.stub(instance, 'close');
    close.onFirstCall().rejects(new Error('synthetic converted cleanup failure'));
    close.onSecondCall().callsFake(originalClose);
    const lower = () => new Promise<void>((done, fail) => app.lower(error => (error ? fail(error) : done())));
    await assert.rejects(lower());
    const application = getSailsApplication(app);
    assert(application);
    assert.equal(application.status().stopFailed, true);
    assert.equal(application.status().cleanupPending, true);
    assert.equal(application.status().persistence.pools, 1);
    assert(application.status().persistence.resources.includes('module:recordTypes'));
    assert.equal(sailsRecordTypes(app), instance);
    assert.equal(instance.getAllCache()?.length, 1);
    await lower();
    hosts.splice(hosts.indexOf(app), 1);
    assert.equal(close.callCount, 2);
    assert.equal(application.status().persistence.pools, 0);
    assert.equal(application.status().cleanupPending, false);
    assert.equal(instance.getAllCache(), undefined);
  });

  it('cleans the same converted instance when a later legacy hook fails before activation', async () => {
    const failure = new Error('comparison hook failed');
    const bootstrap = sinon.spy(RecordTypes.prototype, 'bootstrap');
    const close = sinon.spy(RecordTypes.prototype, 'close');
    const { app, config, name } = await fixture(failure);
    await assert.rejects(
      new Promise<void>((done, fail) => app.lift(config, error => (error ? fail(error) : done()))),
      error => error === failure
    );
    const application = getSailsApplication(app);
    assert(application);
    assert.equal(bootstrap.callCount, 1);
    assert.equal(close.callCount, 1);
    assert.equal(application.status().ready, false);
    assert.equal(application.status().persistence.pools, 0);
    assert.equal(sailsRecordTypes(app).getAllCache(), undefined);
    assert.equal(
      await native.db(name).collection('recordtype').countDocuments(),
      1,
      'No rollback of completed bootstrap writes'
    );
  });
});
