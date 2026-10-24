const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { MongoClient } = require('mongodb');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { ApplicationRuntime } = require('../../dist/application');
const { createFigshareProvider } = require('../../dist/integrations/figshare/provider');
const { FigshareSourceIntents } = require('../../dist/records/FigshareSourceIntents');
const { hasEditAccess } = require('../../dist/records/access');
const { FigsharePublishing } = require('../../dist/configmodels/FigsharePublishing');
const { Services: Disks } = require('../../dist/storage/StorageManager');
const { Services: Audits } = require('../../dist/queries/IntegrationAudits');
const { AgendaQueue } = require('../../dist/queues');
const { prepareAgendaIndexes } = require('../../dist/queues/indexes');
const { agendaQueueDefaultJobs } = require('../../dist/config/agendaQueueJobs');
const runtime = require('../../dist/persistence/runtime');
const hook = require('@researchdatabox/sails-hook-redbox-storage-mongo/extension');

test(
  'selected Figshare provider executes durable Agenda work through actual storage and drains held HTTP',
  { timeout: 45000 },
  async () => {
    assert.equal(process.version, 'v26.11.1');
    assert.equal(global.sails, undefined);
    const url = process.env.SR_FIGSHARE_MONGO_URL;
    assert(url, 'SR_FIGSHARE_MONGO_URL is required; qualification cannot skip');
    assert.equal(new URL(url).pathname, '/sr_p7_figshare_provider');
    const native = await new MongoClient(url).connect();
    const directory = await mkdtemp(join(tmpdir(), 'sr-p7-figshare-provider-'));
    const owner = { config: { datastores: { mongodb: { url }, redboxStorage: { url } } }, log };
    const entered = Promise.withResolvers(),
      release = Promise.withResolvers(),
      completed = Promise.withResolvers();
    let app, provider, article;
    let creates = 0,
      metadataWrites = 0,
      publishes = 0,
      providerErrors = [];
    const server = createServer(async (req, res) => {
      try {
        assert.equal(req.headers.authorization, 'token qualification-only');
        const request = new URL(req.url, 'http://localhost');
        const chunks = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
        const send = (value, status = 200) => {
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(value));
        };
        if (request.pathname === '/account') return send({ id: 1, user_id: 999 });
        if (request.pathname === '/account/articles' && req.method === 'POST') {
          creates++;
          article = { ...body, id: 51, account_id: 1, files: [], version: 1, is_public: false };
          return send({ entity_id: 51 }, 201);
        }
        if (request.pathname === '/account/articles')
          return send(request.searchParams.get('page') === '1' && article ? [article] : []);
        if (request.pathname === '/account/articles/51' && req.method === 'PUT') {
          metadataWrites++;
          entered.resolve();
          await release.promise;
          Object.assign(article, body);
          return send(article);
        }
        if (request.pathname === '/account/articles/51') return send(article);
        if (request.pathname === '/account/articles/51/files') return send([]);
        if (request.pathname === '/account/articles/51/publish') {
          publishes++;
          Object.assign(article, { is_public: true, published_date: '2026-10-24', version: 2 });
          return send({});
        }
        if (request.pathname === '/account/licenses') return send([]);
        throw new Error('Unexpected Figshare qualification route: ' + request.pathname);
      } catch (error) {
        providerErrors.push(String(error));
        res.writeHead(500);
        res.end(String(error));
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      assert.equal((await native.db().listCollections().toArray()).length, 0);
      await runtime.initializePersistence(owner);
      await runtime.ensureFigsharePersistenceIndexes(owner);
      await runtime.initializeFigsharePersistence(owner);
      await hook.ensurePrismaStagedStorageIndexes(owner);
      const unexpected = () => {
        throw new Error('Unexpected unused collaborator');
      };
      const storageModule = hook.createMongoStorageModule({
        owner,
        collaborators: {
          log,
          recordTypes: { get: unexpected },
          forms: { getFormByName: unexpected },
          disks: {},
          translate: key => key,
          exportMaxRecords: () => 100,
        },
      });
      await storageModule.initialize();
      const storage = storageModule.storage;
      const disks = new Disks.StorageManager({
        owner,
        log,
        config: {
          stagingDisk: 'figshare-staging',
          primaryDisk: 'figshare-staging',
          disks: { 'figshare-staging': { driver: 'fs', config: { root: directory } } },
        },
      });
      await disks.initialize();
      const config = new FigsharePublishing();
      config.enabled = true;
      config.connection.baseUrl = 'http://127.0.0.1:' + server.address().port;
      config.connection.token = 'qualification-only';
      config.connection.retry.maxAttempts = 1;
      config.metadata.license.required = false;
      config.categories.allowUnmapped = true;
      config.authors.contributorPaths = [];
      config.embargo.mode = 'none';
      Object.assign(config.processing, {
        enabled: true,
        serviceUsername: 'qualified-service',
        serviceUserType: 'local',
      });
      const brand = { id: 'qualified-brand', name: 'qualified', roles: [{ id: 'qualified-admin', name: 'Admin' }] };
      const actor = { username: 'qualified-service', type: 'local', roles: brand.roles };
      const recordType = {
        id: 'qualified-type',
        name: 'publication',
        hooks: {
          onUpdate: {
            pre: [
              {
                function: 'figshare.validateFigshareRecord',
                options: { executionCondition: '<%= record.workflow.stage === "queued" %>' },
              },
            ],
          },
        },
      };
      const source = new FigshareSourceIntents({ config: () => config, log });
      const record = {
        redboxOid: 'qualified-record',
        metadata: { title: 'Qualified publication', description: 'Qualified description', dataLocations: [] },
        metaMetadata: { brandId: brand.id, type: recordType.name },
        workflow: { stage: 'queued' },
        authorization: { edit: [actor.username] },
      };
      const intent = source.prepareSourceIntent(record, recordType, ['onUpdate'], actor, false);
      assert(intent, 'named bundled-style hook must prepare durable intent');
      const created = await storage.create(brand, record, recordType, actor, { figshareIntent: intent });
      assert.equal(created.success, true, created.message);
      const audits = new Audits.IntegrationAuditService({
        storage,
        log,
        environment: 'integrationtest',
        enqueue: async () => {},
      });
      const queueConfig = {
        options: { processEvery: '1 second' },
        jobs: { 'Figshare-SyncRecord': { ...agendaQueueDefaultJobs['Figshare-SyncRecord'], fnName: 'figshare.sync' } },
      };
      await prepareAgendaIndexes(owner, queueConfig.options, 'ensure');
      const queue = new AgendaQueue({
        owner,
        config: queueConfig,
        log,
        runAcceptedWork: operation => runtime.runAcceptedPersistenceWork(owner, operation),
        handler: name =>
          name === 'figshare.sync'
            ? async job => {
                try {
                  await provider.service.syncRecordJob(job);
                  completed.resolve();
                } catch (error) {
                  completed.reject(error);
                  throw error;
                }
              }
            : undefined,
      });
      provider = createFigshareProvider({
        configuration: {
          configuration: name => (name === brand.name ? { figsharePublishing: config } : undefined),
          brandById: id => (id === brand.id ? brand : undefined),
          brandByName: name => (name === brand.name ? brand : undefined),
          development: { enabled: false, mode: 'live' },
          environment: 'production',
          log,
        },
        records: {
          getMeta: oid => storage.getMeta(oid),
          getFigshareIntentStorage: () => storage,
          hasEditAccess,
          setRecordFields: (...args) => storage.setRecordFields(...args),
          updateMetaInternal: unexpected,
        },
        user: async name => (name === actor.username ? actor : undefined),
        recordType: async () => recordType,
        workflowStep: unexpected,
        eligible: (...args) => source.currentExecutionEligible(...args),
        store: () => runtime.getFigshareSyncRepository(owner),
        datastream: unexpected,
        disks,
        crosswalk: {},
        audit: audits,
        queue,
        administrator: roles => roles.find(role => role.name === 'Admin'),
        log,
        translate: key => key,
        runWork: operation => runtime.runAcceptedPersistenceWork(owner, operation),
      });
      app = new ApplicationRuntime(owner, [
        {
          name: 'audits',
          create: () => ({ initialize: async () => {}, drain: () => audits.drain(), close: () => audits.close() }),
        },
        {
          name: 'figshare',
          create: () => ({
            initialize: async () => {},
            quiesce: () => provider.quiesce(),
            drain: () => provider.drain(),
            close: () => provider.close(),
          }),
        },
        { name: 'queue', create: () => queue },
      ]);
      await app.initialize();
      await app.activate();
      const status = await provider.administration.figshareAdmin({
        action: 'inspect',
        oid: record.redboxOid,
        username: actor.username,
      });
      assert.equal(status.oid, record.redboxOid);
      await provider.service.dispatchSyncJob();
      assert.equal(
        await Promise.race([entered.promise.then(() => 'entered'), completed.promise.then(() => 'finished')]),
        'entered',
        'the actual queued worker must reach metadata HTTP before completing'
      );
      const stateBefore = await runtime.getFigshareSyncRepository(owner).get(record.redboxOid);
      assert.equal(stateBefore.work.sync.processed, 0);
      assert.equal((await storage.getMeta(record.redboxOid)).figshareSyncIntent.pending, false);
      let stopped = false;
      const stopping = app.stop().then(() => {
        stopped = true;
      });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(stopped, false);
      release.resolve();
      await completed.promise;
      await stopping;
      assert.equal(creates, 1);
      assert.equal(metadataWrites, 1);
      assert.equal(publishes, 1);
      assert.deepEqual(providerErrors, []);
      // Native read after owned pools close proves the final checkpoint and projection survived.
      const states = await native.db().collection('figsharesync').find().toArray();
      assert.equal(states.length, 1);
      assert.equal(states[0].work.sync.processed, 1);
      assert.equal(states[0].status, 'synced');
      const projected = await native.db().collection('record').findOne({ redboxOid: record.redboxOid });
      assert.equal(projected.metadata.figshare_article_id, '51');
      assert.equal(projected.metadata.figshareStatus, 'synced');
      assert.equal(projected.metadata.title, record.metadata.title);
      assert.deepEqual(projected.authorization, record.authorization);
      assert(projected.recordVersion > 1);
      assert(projected.revision > 1);
      const jobs = await native.db().collection('agendaJobs').find({ name: 'Figshare-SyncRecord' }).toArray();
      assert.equal(jobs.length, 1);
      assert(jobs[0].lastFinishedAt);
      const auditRows = await native.db().collection('integrationaudit').countDocuments();
      assert(auditRows >= 2);
      assert.equal(app.status().persistence.ready, false);
      await assert.rejects(provider.service.dispatchSyncJob(), /draining/);
      assert.equal(global.sails, undefined);
      assert(!Object.keys(require.cache).some(file => /[/\\](CoreBase|CoreService|compat[/\\]sails[/\\])/.test(file)));
      console.log(
        JSON.stringify({
          creates,
          metadataWrites,
          publishes,
          durableJobs: jobs.length,
          auditRows,
          finalStatus: states[0].status,
          drainWaited: true,
        })
      );
    } finally {
      release.resolve();
      await app?.stop();
      await runtime.cleanupPersistence(owner);
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await native.db().dropDatabase();
      await native.close();
      await rm(directory, { recursive: true, force: true });
    }
  }
);
