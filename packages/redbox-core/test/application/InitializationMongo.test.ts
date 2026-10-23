import assert from 'node:assert/strict';
import { MongoClient, ObjectId } from 'mongodb';
import { ApplicationRuntime } from '../../src/application';
import {
  composeExtensionApplication,
  bindExtensionFactory,
  bindExtensionWork,
  resolveExtensions,
} from '../../src/extensions';
import { initializePersistence, persistenceStatus } from '../../src/persistence/runtime';
import { ensureMigrationPersistenceIndex } from '../../src/persistence/migration/preflight';
import { getMigrationLedgerRepository } from '../../src/persistence/migration/runtime';
import { ensureReferencePersistenceIndexes } from '../../src/persistence/reference/preflight';
import { initializeReferencePersistence, getReferenceRepositories } from '../../src/persistence/reference/runtime';

const quiet = { warn() {} };
const signalNames: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGUSR2'];
const signalListeners = signalNames.map(name => process.listeners(name));
describe('ordered startup with the real migration ledger', function () {
  this.timeout(30000);
  let native: MongoClient;
  let base: URL;
  const databases: string[] = [];
  const apps: ApplicationRuntime[] = [];
  before(async () => {
    assert.equal(Reflect.get(globalThis, 'sails'), undefined, 'Use the standalone Mongo command, without test/setup');
    assert(process.env.LIFECYCLE_TEST_MONGO_URL, 'LIFECYCLE_TEST_MONGO_URL is required; no skip');
    base = new URL(process.env.LIFECYCLE_TEST_MONGO_URL);
    assert.equal(base.pathname, '/sr_p3_lifecycle');
    native = await new MongoClient(base.href).connect();
    assert(Number.parseInt((await native.db().command({ buildInfo: 1 })).version, 10) >= 8);
  });
  afterEach(async () => {
    for (const app of apps.splice(0)) await app.stop();
  });
  after(async () => {
    if (native) {
      for (const name of databases) await native.db(name).dropDatabase();
      await native.close();
    }
  });
  async function owner() {
    const name = 'sr_p3_lifecycle_' + process.pid + '_' + databases.length;
    databases.push(name);
    const url = new URL(base);
    url.pathname = '/' + name;
    const owner = { config: { datastores: { mongodb: { url: url.href } } }, log: quiet };
    await initializePersistence(owner);
    await ensureMigrationPersistenceIndex(owner);
    await ensureReferencePersistenceIndexes(owner);
    return owner;
  }
  function graph(selectedOwner: Awaited<ReturnType<typeof owner>>, failMigration: boolean, events: string[]) {
    const brand = new ObjectId().toHexString();
    const write = async (name: string) => {
      await getReferenceRepositories(selectedOwner).recordTypes.createDefinition({
        branding: brand,
        name,
        packageType: 'dataset',
      });
      events.push(name);
    };
    const resolved = resolveExtensions(
      [
        {
          name: 'core',
          root: '.',
          declaration: {
            apiVersion: 1,
            modules: [
              {
                name: 'reference',
                create: () => ({
                  initialize: () => initializeReferencePersistence(selectedOwner),
                  close: async () => {},
                }),
              },
            ],
            bootstrap: [{ name: 'recordtypes', requires: ['reference'], run: async () => write('core') }],
          },
        },
        {
          name: 'high',
          root: '.',
          declaration: {
            apiVersion: 1,
            migrations: [
              {
                name: '002-second',
                requires: ['reference'],
                run: async () => {
                  await write('partial');
                  if (failMigration) throw Error('migration body failed');
                },
              },
            ],
            bootstrap: [{ name: 'high-bootstrap', requires: ['reference'], run: async () => write('high') }],
          },
        },
        {
          name: 'low',
          root: '.',
          declaration: {
            apiVersion: 1,
            migrations: [{ name: '001-first', requires: ['reference'], run: async () => write('first') }],
            bootstrap: [{ name: 'low-bootstrap', requires: ['reference'], run: async () => write('low') }],
          },
        },
      ],
      ['high']
    );
    const { application } = composeExtensionApplication(
      selectedOwner,
      resolved,
      {
        module: registration => () => bindExtensionFactory(registration.declaration, undefined)(),
        work: registration => bindExtensionWork(registration.declaration, undefined),
      },
      {
        appVersion: 'p3-test',
        postBootstrap: [{ name: 'dashboard-schema', requires: ['reference'], run: async () => write('post') }],
      }
    );
    apps.push(application);
    return { application, brand };
  }
  it('persists migrations lexically before core/ordered hooks/post-bootstrap and skips completed bodies on a fresh owner', async () => {
    const selectedOwner = await owner();
    const events: string[] = [];
    const { application } = graph(selectedOwner, false, events);
    const init = application.initialize();
    assert.equal(application.initialize(), init);
    await init;
    assert.deepEqual(events, ['first', 'partial', 'core', 'low', 'high', 'post']);
    assert.deepEqual(await getMigrationLedgerRepository(selectedOwner).executedNames(), ['001-first', '002-second']);
    assert.equal(application.status().ready, false);
    await application.stop();
    assert.equal(persistenceStatus(selectedOwner).pools, 0);
    const fresh = { config: selectedOwner.config, log: quiet };
    const restarted: string[] = [];
    const next = graph(fresh, false, restarted);
    await next.application.initialize();
    assert.deepEqual(restarted, ['core', 'low', 'high', 'post']);
  });
  it('keeps partial body writes without recording failure as success, closes clients and blocks all bootstrap/activation', async () => {
    const selectedOwner = await owner();
    const events: string[] = [];
    const { application, brand } = graph(selectedOwner, true, events);
    await assert.rejects(application.initialize(), /002-second/);
    assert.deepEqual(events, ['first', 'partial']);
    assert.equal(application.status().failure?.stage, 'migrations');
    assert.equal(application.status().ready, false);
    await assert.rejects(application.activate());
    assert.equal(persistenceStatus(selectedOwner).pools, 0);
    const database = native.db(new URL(selectedOwner.config.datastores.mongodb.url).pathname.slice(1));
    assert.equal(await database.collection('recordtype').countDocuments({ branding: new ObjectId(brand) }), 2);
    assert.deepEqual(
      (await database.collection('migration').find().toArray()).map(row => row.name),
      ['001-first']
    );
  });
  it('keeps the orchestration graph free of Sails, compatibility modules or process handlers', async () => {
    assert.equal(Reflect.get(globalThis, 'sails'), undefined);
    assert.deepEqual(
      signalNames.map(name => process.listeners(name)),
      signalListeners
    );
    assert(!Object.keys(require.cache).some(file => /\/node_modules\/sails\/|\/compat\//.test(file)));
  });
});
