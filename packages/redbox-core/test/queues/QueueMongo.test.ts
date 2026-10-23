import assert from 'node:assert/strict';
import { MongoClient } from 'mongodb';
import { ApplicationRuntime } from '../../src/application';
import { AgendaQueue, prepareAgendaIndexes } from '../../src/queues';
import { initializePersistence, persistenceStatus } from '../../src/persistence/runtime';
import type { AgendaQueueConfig } from '../../src/config/agendaQueue.config';

const log = { warn() {}, verbose() {}, error() {}, info() {} };
async function until(check: () => boolean | Promise<boolean>) {
  const end = Date.now() + 5000;
  while (!(await check())) {
    assert(Date.now() < end, 'Queue condition did not settle');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
describe('standalone Agenda lifecycle on MongoDB', function () {
  this.timeout(30000);
  let native: MongoClient;
  let base: URL;
  const names: string[] = [];
  const apps: ApplicationRuntime[] = [];
  before(async () => {
    assert.equal(Reflect.get(globalThis, 'sails'), undefined);
    assert(process.env.LIFECYCLE_TEST_MONGO_URL, 'Real Mongo is required; no skips');
    base = new URL(process.env.LIFECYCLE_TEST_MONGO_URL);
    assert.equal(base.pathname, '/sr_p3_lifecycle');
    native = await new MongoClient(base.href).connect();
  });
  afterEach(async () => {
    for (const app of apps.splice(0)) await app.stop();
  });
  after(async () => {
    if (!native) return;
    for (const name of names) await native.db(name).dropDatabase();
    await native.close();
  });
  async function fixture(
    jobs: AgendaQueueConfig['jobs'],
    handler: ConstructorParameters<typeof AgendaQueue>[0]['handler']
  ) {
    const name = `sr_p3_lifecycle_queue_${process.pid}_${names.length}`;
    names.push(name);
    const url = new URL(base);
    url.pathname = '/' + name;
    const owner = { config: { datastores: { mongodb: { url: url.href } } }, log };
    await initializePersistence(owner);
    const config = { options: { processEvery: '0.02 seconds', defaultLockLifetime: 200, drainTimeoutMs: 1000 }, jobs };
    await prepareAgendaIndexes(owner, config.options, 'ensure');
    const queue = new AgendaQueue({ owner, config, log, handler });
    return { owner, queue, db: native.db(name) };
  }
  it('defines without claims, schedules or submissions, then activates and schedules once', async () => {
    let calls = 0;
    const { owner, queue, db } = await fixture(
      {
        work: { fnName: 'bound', schedule: { method: 'now' } },
        repeat: {
          fnName: 'bound',
          schedule: { method: 'every', intervalOrSchedule: '1 hour', opts: { skipImmediate: true } },
        },
      },
      () => async () => {
        calls++;
      }
    );
    const app = new ApplicationRuntime(owner, [{ name: 'queue', create: () => queue }]);
    apps.push(app);
    await db
      .collection('agendaJobs')
      .insertOne({ name: 'work', type: 'normal', priority: 0, nextRunAt: new Date(), lockedAt: null });
    const indexes = await db.collection('agendaJobs').listIndexes().toArray();
    await app.initialize();
    await assert.rejects(queue.now('work'), /active application/);
    assert.throws(() => queue.every('repeat', '1 hour'), /active application/);
    assert.throws(() => queue.schedule('work', 'in 1 hour'), /active application/);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(calls, 0);
    assert.equal(await db.collection('agendaJobs').countDocuments(), 1);
    assert.deepEqual(await db.collection('agendaJobs').listIndexes().toArray(), indexes, 'startup performs no DDL');
    assert.equal(await db.listCollections({ name: 'agenda_logs' }).hasNext(), false);
    const first = app.activate();
    assert.equal(app.activate(), first);
    await first;
    await until(() => calls === 2);
    assert.equal(await db.collection('agendaJobs').countDocuments({ name: 'repeat' }), 1);
    await app.activate();
    assert.equal(await db.collection('agendaJobs').countDocuments(), 3);
    await app.stop();
    assert.equal(persistenceStatus(owner).pools, 0);
  });
  for (const stage of ['migrations', 'coreBootstrap'] as const) {
    it(`does not start processing after ${stage} failure`, async () => {
      let calls = 0;
      const { owner, queue, db } = await fixture(
        { work: { fnName: 'bound', schedule: { method: 'now' } } },
        () => async () => {
          calls++;
        }
      );
      const fail = async () => {
        throw new Error('Required startup failed');
      };
      const app = new ApplicationRuntime(
        owner,
        [{ name: 'queue', create: () => queue }],
        stage === 'migrations' ? { migrations: fail } : { coreBootstrap: [{ name: 'remote-import', run: fail }] }
      );
      apps.push(app);
      await assert.rejects(app.initialize(), /Required startup/);
      assert.equal(calls, 0);
      assert.equal(await db.collection('agendaJobs').countDocuments(), 0);
      assert.equal(persistenceStatus(owner).pools, 0);
      await assert.rejects(app.activate());
    });
  }
  it('cleans an activated processor when a later participant fails, retaining emitted effects', async () => {
    let calls = 0;
    const { owner, queue, db } = await fixture(
      { work: { fnName: 'bound', schedule: { method: 'now' } } },
      () => async () => {
        calls++;
      }
    );
    const app = new ApplicationRuntime(owner, [
      { name: 'queue', create: () => queue },
      {
        name: 'later',
        create: () => ({
          initialize: async () => {},
          activate: async () => {
            await until(() => calls === 1);
            throw Error('Later activation failed');
          },
          close: async () => {},
        }),
      },
    ]);
    apps.push(app);
    await app.initialize();
    await assert.rejects(app.activate(), /Later activation failed/);
    assert.equal(app.status().ready, false);
    assert.equal(app.status().cleanupPending, false);
    assert.equal(persistenceStatus(owner).pools, 0);
    assert.equal(await db.collection('agendaJobs').countDocuments({ lastFinishedAt: { $type: 'date' } }), 1);
    await db.collection('agendaJobs').insertOne({ name: 'work', type: 'normal', priority: 0, nextRunAt: new Date() });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(calls, 1);
  });
  it('fails initialization on missing handlers without creating jobs or acquiring a processor', async () => {
    const { owner, queue, db } = await fixture({ missing: { fnName: 'unbound' } }, () => undefined);
    const app = new ApplicationRuntime(owner, [{ name: 'queue', create: () => queue }]);
    apps.push(app);
    await assert.rejects(app.initialize(), /requires a bound handler/);
    assert.equal(await db.collection('agendaJobs').countDocuments(), 0);
    assert.equal(persistenceStatus(owner).pools, 0);
  });
  after(() => {
    assert.equal(Reflect.get(globalThis, 'sails'), undefined);
    assert.equal(
      Object.keys(require.cache).some(file =>
        /\/node_modules\/sails\/|\/redbox-core\/(?:dist|src)\/(?:index|CoreBase|CoreService)\.[jt]s$|\/compat\//.test(
          file
        )
      ),
      false
    );
  });
});
