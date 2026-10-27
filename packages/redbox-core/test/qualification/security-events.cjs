const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createServer } = require('node:http');
const { MongoClient } = require('mongodb');
const { nothingLogger: log } = require('@researchdatabox/sails-ng-common');
const { Services: Capture } = require('../../dist/integrations/SecurityEvents');
const { Services: Forward } = require('../../dist/integrations/SiemForwarding');
const { ApplicationRuntime } = require('../../dist/application');
const { AgendaQueue, prepareAgendaIndexes } = require('../../dist/queues');
const { agendaQueueDefaultJobs } = require('../../dist/config/agendaQueueJobs');
const runtime = require('../../dist/persistence/runtime');

test('owned security capture and delivery persist, redact and drain real queued work', { timeout: 45000 }, async () => {
  assert.equal(process.version, 'v26.12.1');
  assert.equal(global.sails, undefined);
  const url = process.env.SR_SECURITY_EVENTS_MONGO_URL;
  assert(url, 'SR_SECURITY_EVENTS_MONGO_URL is required; this qualification cannot skip');
  assert.equal(new URL(url).pathname, '/sr_p7_security_events');
  const native = await new MongoClient(url).connect();
  const owner = { config: { datastores: { mongodb: { url }, redboxStorage: { url } } }, log };
  let app;
  const received = Promise.withResolvers();
  const release = Promise.withResolvers();
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received.resolve(Buffer.concat(chunks).toString());
    await release.promise;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"code":0}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    assert.equal((await native.db().listCollections().toArray()).length, 0);
    await runtime.initializePersistence(owner);
    await runtime.ensureSiemPersistenceIndexes(owner);
    await runtime.ensureBrandingPersistenceIndexes(owner);
    await runtime.initializeSiemPersistence(owner);
    await runtime.initializeBrandingPersistence(owner);
    const brand = await runtime.getBrandingRepository(owner).createBrand({ name: 'qualified' });
    const repository = runtime.getSiemRepository(owner);
    const configuration = {
      enabled: true,
      destinations: [
        {
          id: 'local',
          name: 'local',
          enabled: true,
          adapterType: 'splunk-hec-json',
          endpointUrl: `http://127.0.0.1:${server.address().port}/hec`,
          timeoutMs: 10000,
        },
      ],
    };
    const queueConfig = {
      options: { processEvery: '0.02 seconds' },
      jobs: {
        'SecurityEventService-StoreSecurityEvent': {
          ...agendaQueueDefaultJobs['SecurityEventService-StoreSecurityEvent'],
          fnName: 'security.capture',
        },
        'SiemForwardingService-ForwardSecurityEvents': {
          ...agendaQueueDefaultJobs['SiemForwardingService-ForwardSecurityEvents'],
          fnName: 'security.forward',
        },
      },
    };
    await prepareAgendaIndexes(owner, queueConfig.options, 'ensure');
    let capture, forwarding;
    const queue = new AgendaQueue({
      owner,
      config: queueConfig,
      log,
      handler: name =>
        ({
          'security.capture': job => capture.storeSecurityEvent(job),
          'security.forward': job => forwarding.forwardSecurityEvents(job),
        })[name],
    });
    capture = new Capture.SecurityEventService({
      repository,
      log,
      brand: value => (value === brand.id || value === brand.name ? brand : undefined),
      configuration: name => (name === brand.name ? configuration : undefined),
      enqueue: (name, data) => queue.now(name, data),
      record: oid => native.db().collection('capture_record').findOne({ oid }),
    });
    forwarding = new Forward.SiemForwardingService({
      repository,
      configuration: id => (id === brand.id ? configuration : undefined),
      brandIds: () => [brand.id],
    });
    app = new ApplicationRuntime(owner, [
      {
        name: 'capture',
        create: () => ({
          initialize: async () => {},
          quiesce: () => capture.quiesce(),
          drain: () => capture.drain(),
          close: () => capture.close(),
        }),
      },
      {
        name: 'forwarding',
        create: () => ({
          initialize: () => forwarding.bootstrap(),
          quiesce: () => forwarding.quiesce(),
          drain: () => forwarding.drain(),
          close: () => forwarding.drain(),
        }),
      },
      { name: 'queue', create: () => queue },
    ]);
    await app.initialize();
    await app.activate();
    await capture.emitFromUserAudit(
      {
        id: 'qualified-user',
        additionalAttributes: {
          emails: ['private@example.invalid'],
          token: 'private-token',
          safe: 'retained',
        },
      },
      'login',
      { brandId: brand.id }
    );
    const body = await received.promise;
    assert(!body.includes('private@example.invalid'));
    assert(!body.includes('private-token'));
    assert(body.includes('retained'));
    const before = await repository.listEvents({ brandId: brand.id }, 0, 10);
    assert.equal(before.length, 1);
    assert.equal(before[0].eventType, 'authentication.login.success');
    assert(!JSON.stringify(before).includes('private-token'));
    const stopping = app.stop();
    let stopped = false;
    void stopping.then(() => {
      stopped = true;
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(stopped, false, 'accepted receiver I/O must retain persistence ownership');
    release.resolve();
    await stopping;
    const stored = await native.db().collection('securityevent').findOne({ eventId: before[0].eventId });
    assert.equal(stored.deliveryState, 'delivered');
    const attempts = await native.db().collection('siemdeliveryattempt').countDocuments();
    assert.equal(attempts, 1);
    await assert.rejects(capture.storeSecurityEvent({ attrs: { data: {} } }), /draining/);
    assert.equal(app.status().persistence.ready, false);
    assert.equal(global.sails, undefined);
    assert(!Object.keys(require.cache).some(file => /[/\\](CoreBase|CoreService|compat[/\\]sails[/\\])/.test(file)));
    console.log(JSON.stringify({ events: before.length, attempts, delivery: stored.deliveryState, redacted: true }));
  } finally {
    release.resolve();
    await app?.stop();
    await runtime.cleanupPersistence(owner);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await native.db().dropDatabase();
    await native.close();
  }
});
