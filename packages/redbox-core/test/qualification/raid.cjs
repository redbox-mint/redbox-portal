const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { MongoClient } = require('mongodb');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { Services: Raid } = require('../../dist/integrations/Raid');
const { Services: Audits } = require('../../dist/queries/IntegrationAudits');
const { ApplicationRuntime } = require('../../dist/application');
const { AgendaQueue, prepareAgendaIndexes } = require('../../dist/queues');
const { agendaQueueDefaultJobs } = require('../../dist/config/agendaQueueJobs');
const storageHook = require('@researchdatabox/sails-hook-redbox-storage-mongo/extension');
const runtime = require('../../dist/persistence/runtime');

test(
  'owned RAiD uses isolated OAuth caches, actual HTTP and durable retry scheduling',
  { timeout: 30000 },
  async () => {
    assert.equal(process.version, 'v26.11.1');
    assert.equal(global.sails, undefined);
    const url = process.env.SR_RAID_MONGO_URL;
    assert(url, 'SR_RAID_MONGO_URL is required; qualification cannot skip');
    assert.equal(new URL(url).pathname, '/sr_p7_raid');
    const native = await new MongoClient(url).connect();
    const owner = { config: { datastores: { mongodb: { url }, redboxStorage: { url } } }, log };
    let app,
      failure = false,
      oauthRequests = 0,
      mintRequests = 0;
    const requests = [];
    const server = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      if (req.url === '/token') {
        oauthRequests++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: 'qualification-token', expires_in: 3600 }));
      } else {
        assert.equal(req.url, '/raid/');
        assert.equal(req.headers.authorization, 'Bearer qualification-token');
        requests.push(JSON.parse(Buffer.concat(chunks).toString()));
        mintRequests++;
        res.writeHead(failure ? 503 : 201, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify(
            failure
              ? { error: 'temporary fixture failure' }
              : { identifier: { id: 'https://raid.example.invalid/qualified' } }
          )
        );
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      assert.equal((await native.db().listCollections().toArray()).length, 0);
      await runtime.initializePersistence(owner);
      await storageHook.ensurePrismaStagedStorageIndexes(owner);
      const unexpected = () => {
        throw new Error('Unexpected unused collaborator');
      };
      const storage = storageHook.createMongoStorageModule({
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
      await storage.initialize();
      const config = {
        enabled: true,
        connection: {
          baseUrl: `http://127.0.0.1:${server.address().port}`,
          token: '',
          timeoutMs: 5000,
          oauth: {
            url: `http://127.0.0.1:${server.address().port}/token`,
            clientId: 'local',
            username: 'local',
            password: 'qualification-password',
            timeoutMs: 5000,
            expirySkewMs: 0,
          },
          retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, jitter: false, retryOnStatusCodes: [503] },
        },
        durableRetry: { jobName: 'RaidMintRetryJob', schedule: 'in 1 day', maxAttempts: 3 },
        saveBodyInMeta: true,
        raidFieldName: 'raidUrl',
        orcidBaseUrl: 'https://orcid.org/',
        types: {},
        mapping: { dmp: { title: { dest: 'title[0].text', engine: 'jsonata', expression: 'record.metadata.title' } } },
      };
      const queueConfig = {
        options: { processEvery: '1 second' },
        jobs: { RaidMintRetryJob: { ...agendaQueueDefaultJobs.RaidMintRetryJob, fnName: 'raid.retry' } },
      };
      await prepareAgendaIndexes(owner, queueConfig.options, 'ensure');
      let raid;
      const queue = new AgendaQueue({ owner, config: queueConfig, log, handler: () => job => raid.mintRetryJob(job) });
      const audits = new Audits.IntegrationAuditService({
        storage: storage.storage,
        log,
        environment: 'integrationtest',
        enqueue: async () => {},
      });
      const makeRaid = () =>
        new Raid.Raid({
          log,
          brand: value => (value === 'qualified-brand' ? { id: value, name: 'qualified' } : undefined),
          configuration: name => (name === 'qualified' ? config : undefined),
          defaultConfiguration: () => config,
          records: { getMeta: unexpected, appendToRecord: unexpected },
          queue,
          audit: {
            startAudit: (...args) => audits.startAudit(...args),
            completeAudit: (...args) => audits.completeAudit(...args),
            failAudit: (...args) => audits.failAudit(...args),
          },
        });
      raid = makeRaid();
      const other = makeRaid();
      app = new ApplicationRuntime(owner, [
        {
          name: 'audits',
          create: () => ({ initialize: async () => {}, drain: () => audits.drain(), close: () => audits.close() }),
        },
        {
          name: 'raid',
          create: () => ({
            initialize: async () => {},
            close: async () => {
              raid.close();
              other.close();
            },
          }),
        },
        { name: 'queue', create: () => queue },
      ]);
      await app.initialize();
      await app.activate();
      const record = () => ({ metadata: { title: 'Qualified record' }, metaMetadata: { brandId: 'qualified-brand' } });
      const first = record();
      await raid.mintTrigger('qualified-record', first, { forceRun: true });
      assert.equal(first.metadata.raidUrl, 'https://raid.example.invalid/qualified');
      await raid.mintTrigger('qualified-record', record(), { forceRun: true });
      assert.equal(oauthRequests, 1, 'same provider must reuse its cached token');
      await other.mintTrigger('qualified-other', record(), { forceRun: true });
      assert.equal(oauthRequests, 2, 'separate provider must not borrow another instance token');
      failure = true;
      const retrying = record();
      await raid.mintTrigger(
        'qualified-retry',
        retrying,
        { forceRun: true },
        { username: 'qualified-owner', roles: [{ id: 'role', name: 'Researcher' }] }
      );
      assert.equal(retrying.metaMetadata.raid.attemptCount, 1);
      const scheduled = await native.db().collection('agendaJobs').findOne({ name: 'RaidMintRetryJob' });
      assert.equal(scheduled.data.oid, 'qualified-retry');
      assert.equal(scheduled.data.attemptCount, 1);
      assert.equal(scheduled.data.initiatingActor.username, 'qualified-owner');
      assert(new Date(scheduled.nextRunAt).getTime() > Date.now() + 3600000);
      await audits.drain();
      const auditRows = await native.db().collection('integrationaudit').countDocuments();
      assert(auditRows > 30);
      assert.equal(
        await native
          .db()
          .collection('integrationaudit')
          .countDocuments({ brandId: { $ne: 'qualified-brand' } }),
        0
      );
      assert(
        !JSON.stringify(await native.db().collection('integrationaudit').find().toArray()).includes(
          'qualification-password'
        )
      );
      await app.stop();
      assert.equal(app.status().persistence.ready, false);
      assert.equal(global.sails, undefined);
      assert(!Object.keys(require.cache).some(file => /[/\\](CoreBase|CoreService|compat[/\\]sails[/\\])/.test(file)));
      console.log(JSON.stringify({ oauthRequests, mintRequests, auditRows, durableRetries: 1, actorRetained: true }));
    } finally {
      await app?.stop();
      await runtime.cleanupPersistence(owner);
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await native.db().dropDatabase();
      await native.close();
    }
  }
);
