import assert from 'node:assert/strict';
import { MongoClient, ObjectId } from 'mongodb';
import { ApplicationRuntime } from '../../src/application';
import { AgendaQueue, prepareAgendaIndexes } from '../../src/queues';
import { migrateQueuedRecordHooks, convertQueuedRecordHookData } from '../../src/queues/migrateRecordHooks';
import { RecordTriggers, type RecordTriggersInput } from '../../src/records/RecordTriggers';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { initializePersistence, persistenceStatus } from '../../src/persistence/runtime';
import { initializeReferencePersistence, getReferenceRepositories } from '../../src/persistence/reference/runtime';
import { ensureReferencePersistenceIndexes } from '../../src/persistence/reference/preflight';
import { GridFSDriver } from '../../src/storage/GridFSDriver';
import { ExpressHost } from '../../src/http/express';
import { trackHttpRequestWork } from '../../src/middleware/requestLifetime';
import { persistenceOperation } from '../../src/persistence/runtime';
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
    handler: ConstructorParameters<typeof AgendaQueue>[0]['handler'],
    createQueue = (input: ConstructorParameters<typeof AgendaQueue>[0]) => new AgendaQueue(input)
  ) {
    const name = `sr_p3_lifecycle_queue_${process.pid}_${names.length}`;
    names.push(name);
    const url = new URL(base);
    url.pathname = '/' + name;
    const owner = { config: { datastores: { mongodb: { url: url.href } } }, log };
    await initializePersistence(owner);
    const config = { options: { processEvery: '0.02 seconds', defaultLockLifetime: 200, drainTimeoutMs: 1000 }, jobs };
    await prepareAgendaIndexes(owner, config.options, 'ensure');
    const queue = createQueue({ owner, config, log, handler });
    return { owner, queue, db: native.db(name) };
  }
  it('converts pre-existing v5 PDF jobs before claims and executes once across restart', async () => {
    const jobs = { pdf: { fnName: 'rdmpservice.queuedTriggerSubscriptionHandler' } };
    let calls = 0;
    const triggers = new RecordTriggers({
      config: { maxUploadSize: 100 },
      log: nothingLogger,
      translate: value => value,
      resolveHook: name => {
        assert.equal(name, 'pdf.create');
        return async () => {
          calls++;
        };
      },
    } as RecordTriggersInput);
    const { owner, queue, db } = await fixture(jobs, () => async job => {
      await triggers.queuedTriggerSubscriptionHandler(job);
    });
    const config = { jobs, options: { collection: 'agendaJobs' } };
    const data = {
      oid: 'existing-record',
      record: { metadata: { template: 'sails.services.opaque.template' } },
      triggerConfiguration: { function: 'sails.services.pdfservice.createPDF', options: { filename: 'preserved.pdf' } },
    };
    const valid = await db
      .collection('agendaJobs')
      .insertOne({ name: 'pdf', type: 'normal', priority: 0, nextRunAt: new Date(), lockedAt: null, data });
    const invalid = await db.collection('agendaJobs').insertOne({
      name: 'pdf',
      data: { ...data, triggerConfiguration: { function: 'sails.services.private.unsupported' } },
    });
    await assert.rejects(migrateQueuedRecordHooks(owner, config), /conversion failed/);
    assert.equal(
      (await db.collection('agendaJobs').findOne({ _id: valid.insertedId }))!.data.triggerConfiguration.function,
      'sails.services.pdfservice.createPDF'
    );
    assert.equal(calls, 0);
    await db.collection('agendaJobs').deleteOne({ _id: invalid.insertedId });
    const app = new ApplicationRuntime(owner, [{ name: 'queue', create: () => queue }], {
      migrations: async () => {
        assert.equal(await migrateQueuedRecordHooks(owner, config), 1);
      },
    });
    apps.push(app);
    await app.initialize();
    const converted = (await db.collection('agendaJobs').findOne({ _id: valid.insertedId }))!.data;
    assert.equal(converted.triggerConfiguration.function, 'pdf.create');
    assert.deepEqual(converted.record, data.record);
    assert.equal(calls, 0);
    await app.activate();
    await until(async () => !!(await db.collection('agendaJobs').findOne({ _id: valid.insertedId }))!.lastFinishedAt);
    await app.stop();
    assert.equal(calls, 1);
    const restartedOwner = { config: owner.config, log };
    const restartedQueue = new AgendaQueue({
      owner: restartedOwner,
      config: { jobs, options: { processEvery: '0.02 seconds' } },
      log,
      handler: () => async job => {
        await triggers.queuedTriggerSubscriptionHandler(job);
      },
    });
    const restarted = new ApplicationRuntime(restartedOwner, [{ name: 'queue', create: () => restartedQueue }], {
      migrations: async () => {
        assert.equal(await migrateQueuedRecordHooks(restartedOwner, config), 0);
      },
    });
    apps.push(restarted);
    await restarted.initialize();
    await restarted.activate();
    await new Promise(resolve => setTimeout(resolve, 100));
    await restarted.stop();
    assert.equal(calls, 1);
    // External queue deliveries use the same finite, idempotent conversion without acknowledging early.
    assert.deepEqual(convertQueuedRecordHookData(data), converted);
    assert.equal(data.triggerConfiguration.function, 'sails.services.pdfservice.createPDF');
    assert.throws(() =>
      convertQueuedRecordHookData({ ...data, triggerConfiguration: { function: 'sails.services.unknown' } })
    );
  });

  it('bounds backend and worker failure logs without forwarding provider secrets', async () => {
    const errors: unknown[][] = [];
    class LoggingQueue extends AgendaQueue {
      backend() {
        return this.agendas.mongodb!;
      }
    }
    const secret = 'private-queue-password-and-token';
    const { owner, queue, db } = await fixture(
      { fail: { fnName: 'test.fail' } },
      () => async () => {
        throw new Error('mongodb://operator:' + secret + '@private-host/queue');
      },
      input =>
        new LoggingQueue({
          ...input,
          log: {
            ...log,
            error: (...args: unknown[]) => {
              errors.push(args);
            },
          },
        })
    );
    const app = new ApplicationRuntime(owner, [{ name: 'queue', create: () => queue }]);
    apps.push(app);
    await app.initialize();
    (queue as LoggingQueue).backend().emit('error', new Error('Provider token=' + secret));
    await app.activate();
    await queue.now('fail', {});
    await until(async () => !!(await db.collection('agendaJobs').findOne({ name: 'fail' }))?.failedAt);
    const backend = (queue as LoggingQueue).backend();
    const now = backend.now;
    const failure = new Error('Provider token=' + secret);
    backend.now = async () => {
      throw failure;
    };
    try {
      await assert.rejects(queue.now('fail', {}), error => error === failure);
    } finally {
      backend.now = now;
    }
    await app.stop();
    assert(errors.some(args => String(args[0]).includes('Failed to start job now')));
    assert(errors.some(args => String(args[0]).includes('backend error')));
    assert(errors.some(args => String(args[0]).includes('Job fail failed')));
    assert.equal(JSON.stringify(errors).includes(secret), false);
    assert.equal(
      errors.flat().some(value => value instanceof Error),
      false
    );
  });

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
  it('persists startup schedules before claiming an existing due recurring job', async () => {
    const saving = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    let calls = 0;
    class HeldScheduleQueue extends AgendaQueue {
      protected override async createMongoBackend(...args: Parameters<AgendaQueue['createMongoBackend']>) {
        const backend = await super.createMongoBackend(...args);
        const save = backend.repository.saveJob.bind(backend.repository);
        backend.repository.saveJob = async (...values) => {
          if (values[0].name === 'repeat') {
            saving.resolve();
            await release.promise;
          }
          return save(...values);
        };
        return backend;
      }
    }
    const { owner, queue, db } = await fixture(
      {
        repeat: {
          fnName: 'bound',
          schedule: { method: 'every', intervalOrSchedule: '1 hour' },
        },
      },
      () => async () => {
        calls++;
      },
      input => new HeldScheduleQueue(input)
    );
    const app = new ApplicationRuntime(owner, [{ name: 'queue', create: () => queue }]);
    apps.push(app);
    await db.collection('agendaJobs').insertOne({
      name: 'repeat',
      type: 'single',
      priority: 0,
      nextRunAt: new Date(),
      lockedAt: null,
      repeatInterval: '1 hour',
    });
    await app.initialize();
    const activating = app.activate();
    try {
      await saving.promise;
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(calls, 0, 'No due job may run before the startup schedule write settles');
      assert.equal((await db.collection('agendaJobs').findOne({ name: 'repeat' }))!.lockedAt, null);
    } finally {
      release.resolve();
      await activating;
    }
    await until(() => calls === 1);
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
  for (const ownDeadline of [false, true])
  it(`preserves real handler completion through ${ownDeadline ? 'queue and host' : 'host'} deadline/retry`, async () => {
    const { promise: held, resolve: release } = Promise.withResolvers<void>();
    const { promise: entered, resolve: enter } = Promise.withResolvers<void>();
    const { promise: detachedGate, resolve: detach } = Promise.withResolvers<void>();
    let detached!: Promise<void>;
    let queue!: AgendaQueue;
    const fixtureInput = await fixture(
      {
        work: { fnName: 'work', options: { lockLifetime: 2000 } },
        audit: { fnName: 'audit' },
      },
      name =>
        name === 'audit'
          ? async () => {}
          : async () => {
              detached = (async () => {
                await detachedGate;
                await persistenceOperation(owner, async () => {});
              })();
              void detached.catch(() => {});
              enter();
              await held;
              await getReferenceRepositories(owner).recordTypes.createDefinition({
                branding: brand,
                name: 'completion',
                packageType: 'dataset',
              });
              await bytes.put('audit.txt', 'completed');
              await queue.now('audit', { result: 'completed' });
            }
    );
    const { owner, db } = fixtureInput;
    queue = fixtureInput.queue;
    const brand = new ObjectId().toHexString();
    const bytes = new GridFSDriver({ bucketName: 'completion-bytes' }, undefined, undefined, owner);
    await ensureReferencePersistenceIndexes(owner);
    const app = new ApplicationRuntime(owner, [
      {
        name: 'reference',
        create: () => ({ initialize: () => initializeReferencePersistence(owner), close: async () => {} }),
      },
      { name: 'queue', create: () => queue },
    ]);
    apps.push(app);
    await app.initialize();
    await app.activate();
    if (ownDeadline) Reflect.set(queue, 'drainTimeoutMs', 25);
    await queue.now('work');
    await entered;
    const stopping = app.stop({ deadlineMs: 10 });
    const failedStop = assert.rejects(stopping, /deadline/);
    assert.equal(app.status().ready, false);
    await assert.rejects(queue.now('audit'), /draining/);
    assert.throws(() => getReferenceRepositories(owner), /not been initialized/);
    await failedStop;
    if (ownDeadline) await assert.rejects(queue.drain(), /deadline/);
    assert.equal(app.status().cleanupPending, true);
    assert.equal(app.status().stopFailed, true);
    assert(persistenceStatus(owner).pools > 0);
    assert(persistenceStatus(owner).prismaClients > 0);
    release();
    try {
      await app.stop({ deadlineMs: 5000 });
      assert.equal(await db.collection('recordtype').countDocuments({ name: 'completion' }), 1);
      assert.equal(await db.collection('completion-bytes.files').countDocuments({ filename: 'audit.txt' }), 1);
      assert.equal(
        await db.collection('agendaJobs').countDocuments({ name: 'audit' }),
        1,
        'accepted completion enqueue is durable'
      );
      assert.equal(
        await db.collection('agendaJobs').countDocuments({ name: 'work', lastFinishedAt: { $type: 'date' } }),
        1
      );
      assert.equal(persistenceStatus(owner).pools, 0);
      assert.equal(persistenceStatus(owner).prismaClients, 0);
      detach();
      await assert.rejects(detached, /draining/);
    } finally {
      release();
      detach();
    }
  });

  for (const aborted of [false, true]) {
    it(`retains actual HTTP completion after ${aborted ? 'transport abort' : 'response finish'} and closes pools only after a retry`, async () => {
      const { owner, db } = await fixture({}, () => undefined);
      await ensureReferencePersistenceIndexes(owner);
      const { promise: held, resolve: release } = Promise.withResolvers<void>();
      const { promise: entered, resolve: enter } = Promise.withResolvers<void>();
      const brand = new ObjectId().toHexString();
      const app = new ApplicationRuntime(owner, [
        {
          name: 'reference',
          create: () => ({ initialize: () => initializeReferencePersistence(owner), close: async () => {} }),
        },
      ]);
      apps.push(app);
      const host = new ExpressHost(app, {
        owner,
        hostname: '127.0.0.1',
        port: 0,
        prepare: async router => {
          router.get('/write', (req, res) => {
            const work = (async () => {
              enter();
              await held;
              await getReferenceRepositories(owner).recordTypes.createDefinition({
                branding: brand,
                name: 'http-completion',
                packageType: 'dataset',
              });
            })();
            trackHttpRequestWork(req, work);
            if (aborted) res.destroy();
            else res.end('accepted');
          });
        },
      });
      await host.initialize();
      await host.activate();
      const url = `http://127.0.0.1:${host.address()!.port}/write`;
      const response = fetch(url).then(result => result.text());
      void response.catch(() => {});
      await entered;
      if (aborted) await assert.rejects(response);
      else assert.equal(await response, 'accepted');
      try {
        await assert.rejects(host.stop({ deadlineMs: 10 }), /deadline/);
        assert.equal(host.status().ready, false);
        assert.equal(app.status().ready, false);
        assert(persistenceStatus(owner).pools > 0);
        assert(persistenceStatus(owner).prismaClients > 0);
        await assert.rejects(
          persistenceOperation(owner, async () => {}),
          /draining/
        );
        release();
        await host.stop({ deadlineMs: 5000 });
        assert.equal(await db.collection('recordtype').countDocuments({ name: 'http-completion' }), 1);
        assert.equal(persistenceStatus(owner).pools, 0);
      } finally {
        release();
        await host.stop();
      }
    });
  }

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
