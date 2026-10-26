const assert = require('node:assert/strict');
const { test } = require('node:test');
const { firstValueFrom } = require('rxjs');
const { MongoClient } = require('mongodb');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { RecordTriggers } = require('../../dist/records/RecordTriggers');
const { ApplicationRuntime } = require('../../dist/application');
const { AgendaQueue, prepareAgendaIndexes } = require('../../dist/queues');
const runtime = require('../../dist/persistence/runtime');
const { initializeStoragePersistence, getStorageRepositories } = require('../../dist/persistence/storage/runtime');
const { ensureStoragePersistenceIndexes } = require('../../dist/persistence/storage/preflight');
const { ensureBrandingPersistenceIndexes } = require('../../dist/persistence/branding/preflight');

test(
  'owned record triggers await durable queueing and drain accepted work on real Mongo',
  { timeout: 30000 },
  async () => {
    assert.equal(global.sails, undefined);
    const url = process.env.SR_RECORD_TRIGGERS_MONGO_URL;
    assert(url, 'SR_RECORD_TRIGGERS_MONGO_URL is required; this qualification cannot skip');
    assert.equal(new URL(url).pathname, '/sr_p7_record_triggers');
    const native = await new MongoClient(url).connect();
    const owner = { config: { datastores: { mongodb: { url }, redboxStorage: { url } } }, log };
    const workerEntered = Promise.withResolvers();
    const releaseWorker = Promise.withResolvers();
    const submitted = Promise.withResolvers();
    const releaseSubmission = Promise.withResolvers();
    let app;
    try {
      assert.equal((await native.db().listCollections().toArray()).length, 0, 'use an empty disposable database');
      await runtime.initializePersistence(owner);
      await ensureBrandingPersistenceIndexes(owner);
      await runtime.initializeBrandingPersistence(owner);
      const brand = await runtime.getBrandingRepository(owner).createBrand({ name: 'default' });
      await ensureStoragePersistenceIndexes(owner);
      await initializeStoragePersistence(owner);
      await runtime.initializeIdentityPersistence(owner);
      const identities = runtime.getIdentityRepositories(owner);
      const storage = getStorageRepositories(owner);
      const user = await identities.create('user', {
        username: 'trigger-owner',
        name: 'Trigger Owner',
        email: 'trigger@example.invalid',
        type: 'local',
      });
      const config = {
        options: { processEvery: '0.02 seconds', defaultLockLifetime: 10000 },
        jobs: { trigger: { fnName: 'record-trigger' } },
      };
      await prepareAgendaIndexes(owner, config.options, 'ensure');
      const hooks = {
        persist: async (_oid, record) => {
          workerEntered.resolve();
          await releaseWorker.promise;
          await native.db().collection('trigger_results').insertOne({ value: record.metadata.title });
          return record;
        },
      };
      let triggers;
      const queue = new AgendaQueue({
        owner,
        config,
        log,
        handler: () => job => triggers.queuedTriggerSubscriptionHandler(job),
      });
      const input = {
        config: { maxUploadSize: 100 },
        log,
        identities,
        counters: storage.counters,
        queue: {
          now: async (...args) => {
            const result = await queue.now(...args);
            submitted.resolve();
            await releaseSubmission.promise;
            return result;
          },
        },
        effectiveUser: async user => user,
        translate: value => value,
        interpolate: value => value,
        resolveHook: name => {
          if (!Object.hasOwn(hooks, name)) throw new Error('Unknown configured trigger');
          return hooks[name];
        },
        workspaces: {}, // No workspace operation is configured in this qualification.
      };
      triggers = new RecordTriggers(input);
      app = new ApplicationRuntime(owner, [{ name: 'queue', create: () => queue }]);
      await app.initialize();
      await app.activate();
      const record = {
        metaMetadata: { brandId: brand.id, createdBy: user.username },
        metadata: { title: 'Qualified record' },
        authorization: {},
      };
      const templates = Object.freeze({
        templates: Object.freeze([
          Object.freeze({ field: 'metadata.copy', template: '<%= record.metadata.title %>' }),
          Object.freeze({ field: 'metadata.inputVisibility', template: '<%= typeof input %>' }),
        ]),
      });
      await firstValueFrom(triggers.runTemplates('record', record, templates, user));
      await firstValueFrom(triggers.runTemplates('record', record, templates, user));
      assert.equal(record.metadata.copy, record.metadata.title);
      assert.equal(record.metadata.inputVisibility, 'undefined', 'private collaborators are not template imports');
      assert.equal(typeof templates.templates[0].template, 'string');
      const counters = Object.freeze({
        counters: Object.freeze([
          Object.freeze({ field_name: 'number', strategy: 'global', template: '<%= numeral(newVal).format("000") %>' }),
        ]),
      });
      await triggers.processRecordCounters('record', record, counters, user);
      assert.equal(record.metadata.number, '001');
      await triggers.processRecordCounters('record', record, counters, user);
      assert.equal(record.metadata.number, '002');
      assert.equal(await native.db().collection('counter').countDocuments(), 1);
      await firstValueFrom(
        triggers.assignPermissions('record', record, { editContributorProperties: ['metadata.people'] }, user)
      );
      record.metadata.people = [{ email: user.email }, { email: 'pending@example.invalid' }];
      await firstValueFrom(
        triggers.assignPermissions('record', record, { editContributorProperties: ['metadata.people'] }, user)
      );
      assert.deepEqual(record.authorization.edit, [user.username]);
      assert.deepEqual(record.authorization.editPending, ['pending@example.invalid']);
      let completed = false;
      const queued = triggers.queueTriggerCall(
        'record',
        record,
        { jobName: 'trigger', triggerConfiguration: { function: 'persist' } },
        user
      );
      assert.equal(await native.db().collection('agendaJobs').countDocuments(), 0, 'queue submission is cold');
      const pending = firstValueFrom(queued).then(result => {
        completed = true;
        return result;
      });
      await submitted.promise;
      assert.equal(completed, false, 'record completion waits for actual queue submission completion');
      assert.equal(await native.db().collection('agendaJobs').countDocuments({ name: 'trigger' }), 1);
      releaseSubmission.resolve();
      assert.equal(await pending, record);
      assert.equal(await firstValueFrom(queued), record, 'resubscription retains the same durable submission');
      assert.equal(await native.db().collection('agendaJobs').countDocuments({ name: 'trigger' }), 1);
      await workerEntered.promise;
      let stopped = false;
      const stopping = app.stop().then(() => {
        stopped = true;
      });
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(stopped, false, 'shutdown retains the accepted trigger');
      assert.equal(app.status().ready, false);
      releaseWorker.resolve();
      await stopping;
      assert.equal(await native.db().collection('trigger_results').countDocuments({ value: record.metadata.title }), 1);
      assert.equal(app.status().persistence.pools, 0);
      assert.equal(app.status().persistence.prismaClients, 0);
      await assert.rejects(
        firstValueFrom(triggers.queueTriggerCall('record', record, { jobName: 'trigger' }, user)),
        /draining|closed|active/
      );
      const rejecting = new RecordTriggers({
        ...input,
        queue: {
          now: async () => {
            throw new Error('submission failed');
          },
        },
      });
      await assert.rejects(
        firstValueFrom(rejecting.queueTriggerCall('record', record, { jobName: 'trigger' }, user)),
        /submission failed/
      );
      assert.throws(
        () =>
          triggers.queuedTriggerSubscriptionHandler({
            attrs: { data: { triggerConfiguration: { function: 'process.exit()' } } },
          }),
        /Unknown configured trigger/
      );
      assert.deepEqual(
        Object.keys(require.cache).filter(file =>
          /[/\\](compat[/\\]sails|CoreService\.js|CoreBase\.js|node_modules[/\\]sails[/\\])/.test(file)
        ),
        []
      );
    } finally {
      releaseWorker.resolve();
      releaseSubmission.resolve();
      try {
        await app?.stop();
        await runtime.cleanupPersistence(owner);
      } finally {
        try {
          await native.db().dropDatabase();
        } finally {
          await native.close();
        }
      }
    }
  }
);
