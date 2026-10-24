import assert from 'node:assert/strict';
import * as persistenceRuntime from '../../src/persistence/runtime';
let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { AgendaQueueUnsupportedFeatureError, AgendaQueue } from '../../src/services/AgendaQueueService';
import { parseAgendaHistoryRetentionHours, parseAgendaQueueBackend } from '../../src/config/agendaQueue.config';
import { restoreRepositoryFixtures, createDomainFixture } from './testHelper';
import express from 'express';
import { createServer } from 'node:http';
import { composeHttpSession } from '../../src/http/express/session';
import { runHttpRequestHandler, registerHttpRequestDrain, beginHttpRequest, runHttpRequestContext } from '../../src/middleware/requestLifetime';
import { EventEmitter } from 'node:events';
import { toJobId } from 'agenda';

describe('AgendaQueueService', function () {
  let environment: any;
  const collaborators: any = {};
  beforeEach(function () {
    sinon.stub(persistenceRuntime, 'mongoDatabase').callsFake(async () => ({
      listCollections: () => ({ next: async () => ({ name: 'agendaJobs' }) }),
      collection: () => ({ listIndexes: () => ({ toArray: async () => [
        { name: 'findAndLockNextJobIndex', key: { name: 1, nextRunAt: 1, priority: -1, lockedAt: 1, disabled: 1 } },
        { name: 'name_1_disabled_1_lockedAt_1_nextRunAt_1', key: { name: 1, disabled: 1, lockedAt: 1, nextRunAt: 1 } },
        { name: 'name_-1_disabled_-1_lockedAt_-1_nextRunAt_-1', key: { name: -1, disabled: -1, lockedAt: -1, nextRunAt: -1 } },
      ] }) }),
    }) as unknown as import('mongodb').Db);
    environment = createDomainFixture();
  });

  afterEach(function () {
    sinon.restore();
    restoreRepositoryFixtures();
  });

  let queueNumber = 0;
  function createQueue(owner = environment) {
    const handlers = {
      'fixture.noop': (...args) => owner.collaborators.fixture?.noop(...args),
      'fixture.work': (...args) => owner.collaborators.fixture?.work(...args),
      'completionFixture.handler': (...args) => owner.collaborators.completionFixture?.handler(...args),
      'testservice.defaultJob': (...args) => owner.collaborators.testservice?.defaultJob(...args),
      'testservice.overrideJob': (...args) => owner.collaborators.testservice?.overrideJob(...args),
      'testservice.process': (...args) => owner.collaborators.testservice?.process(...args),
    };
    const service = new AgendaQueue({ owner, get config() { return owner.config.agendaQueue ?? { options: {}, jobs: {} }; }, log: owner.log,
      handler: name => handlers[name],
      hasAcceptedRequest: () => require('../../src/middleware/requestLifetime').hasActiveHttpRequest(owner),
      drainRequests: () => require('../../src/middleware/requestLifetime').drainHttpRequests(owner),
      runAcceptedWork: operation => persistenceRuntime.runAcceptedPersistenceWork(owner, operation) });
    persistenceRuntime.registerPersistenceResource(owner, 'queue-' + queueNumber++, service);
    return service;
  }
  function stopOwner(owner = environment) {
    persistenceRuntime.quiescePersistence(owner);
    return persistenceRuntime.cleanupPersistence(owner);
  }
  function auditInput() {
    return { log: environment.log, environment: environment.config.environment,
      storage: environment.collaborators.auditstorage ?? {},
      enqueue: (name, data) => collaborators.AgendaQueueService.now(name, data) };
  }
  function createAgendaStub(overrides: any = {}) {
    return {
      attrs: { backend: 'mongodb' },
      define: sinon.stub(),
      every: sinon.stub().resolves(undefined),
      schedule: sinon.stub().resolves(undefined),
      now: sinon.stub().resolves(undefined),
      queryJobs: sinon.stub().resolves({ jobs: [], total: 0 }),
      create: sinon.stub().callsFake((name: string) => ({
        attrs: { name, nextRunAt: new Date() },
        schedule: sinon.stub().returnsThis()
      })),
      start: sinon.stub().resolves(undefined),
      on: sinon.stub(),
      ...overrides
    };
  }

  function selectFixture(mockSails: any) {
    environment = mockSails;
  }

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
  }

  async function until(check: () => boolean | Promise<boolean>) {
    for (let i = 0; i < 200; i++) {
      if (await check()) return;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    throw new Error('Queue regression condition was not reached.');
  }

  async function realQueue(overrides: Partial<import('agenda').JobRepository> = {}, backendName: 'mongodb' | 'sqs' = 'mongodb') {
    await persistenceRuntime.initializePersistence(environment);
    environment.config.agendaQueue = { options: { backend: 'mongodb', processEvery: '0.01 seconds' }, jobs: {} };
    const service = createQueue();
    const repository: import('agenda').JobRepository = {
      connect: async () => {}, queryJobs: async () => ({ jobs: [], total: 0 }),
      getJobsOverview: async () => [], getDistinctJobNames: async () => [],
      getJobById: async () => null, getQueueSize: async () => 0,
      removeJobs: async () => 0, saveJob: async job => job,
      saveJobState: async () => {}, lockJob: async () => undefined,
      unlockJob: async () => {}, unlockJobs: async () => {}, getNextJobToRun: async () => undefined,
      disableJobs: async () => 0, enableJobs: async () => 0, purgeAllJobs: async () => 0,
      ...overrides,
    };
    // Use the real processor and Job.run, controlling only repository I/O.
    const own = Reflect.get(service, 'ownAgendaRepository');
    const backend = {
      name: 'fixture', ownsConnection: false, connect: async () => {}, disconnect: sinon.stub().resolves(),
      repository: own ? own.call(service, repository, backendName === 'mongodb'
        ? (claim: import('agenda').JobParameters) => repository.unlockJobs(claim._id ? [claim._id] : [])
        : (claim: import('agenda').JobParameters) => repository.unlockJob(claim)) : repository,
    };
    const { Agenda } = await import('agenda');
    const agenda = new Agenda({ backend, processEvery: '0.01 seconds', defaultLockLifetime: 200 });
    Reflect.get(service, 'backendResources').add(backend);
    sinon.stub(service as any, 'createAgendaForBackend').resolves(agenda);
    await (service as any).handleReady();
    await service.activate();
    return { service, agenda, backend, repository };
  }

  it('defines scheduled jobs without logging their configured payloads', function () {
    const service = createQueue();
    const agenda = createAgendaStub();
    Reflect.set(service, 'agendas', { mongodb: agenda });
    const secret = 'private-scheduled-provider-token';
    const job = {
      name: 'scheduled-fixture',
      fnName: 'fixture.noop',
      schedule: {
        method: 'every' as const,
        intervalOrSchedule: '1 minute',
        data: { authorization: secret, record: { privateTitle: 'private-scheduled-record' } },
      },
    };
    service.defineJobs([job]);
    assert.equal(agenda.define.firstCall.args[0], job.name);
    assert.equal(typeof agenda.define.firstCall.args[1], 'function');
    assert.equal(job.schedule.data.authorization, secret);
    const diagnostics = JSON.stringify(environment.log.verbose.args);
    assert(diagnostics.includes(job.name));
    assert.equal(diagnostics.includes(secret), false);
    assert.equal(diagnostics.includes('private-scheduled-record'), false);
  });

  it('serializes SQS renewal before release and refuses a later touch of that delivery', async function () {
    const entered = deferred(), reply = deferred();
    const events: string[] = [];
    const { service, agenda } = await realQueue({
      getNextJobToRun: async name => ({ _id: toJobId('ordered-receipt'), name, type: 'normal', priority: 0, lockedAt: new Date(), nextRunAt: new Date(), data: {} }),
      saveJobState: async () => { events.push('touch'); entered.resolve(); await reply.promise; },
      unlockJob: async () => { events.push('release'); },
    }, 'sqs');
    try {
      const { Job } = await import('agenda');
      const attrs = await agenda.db.getNextJobToRun('ordered-receipt', new Date(), new Date(), undefined, undefined);
      assert(attrs);
      const job = new Job(agenda, attrs, true);
      const touch = job.touch(); await entered.promise;
      const release = agenda.db.unlockJob(job.attrs);
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.deepEqual(events, ['touch'], 'Release must follow the submitted visibility renewal');
      reply.resolve(); await touch; await release;
      await assert.rejects(job.touch(), /claim.*no longer owned/i);
      assert.deepEqual(events, ['touch', 'release'], 'An ended delivery must not renew visibility again');
    } finally {
      reply.resolve(); await persistenceRuntime.cleanupPersistence(environment);
    }
  });

  for (const errorName of ['MessageNotInflight', 'ReceiptHandleIsInvalid']) {
    it(`finishes shutdown when an SQS prefetch receipt is already expired (${errorName})`, async function () {
      const { createHash } = await import('node:crypto');
      const names = ['AWS_ENDPOINT_URL_SQS', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'];
      const saved = new Map(names.map(name => [name, process.env[name]]));
      let expired = true, releases = 0, received = false;
      const body = JSON.stringify({ backend: 'sqs', id: 'expired-prefetch', name: 'prefetch', priority: 0,
        type: 'normal', data: {}, queuedAt: new Date().toISOString(), scheduledAt: null });
      const server = createServer(async (req, res) => {
        for await (const _chunk of req) { /* consume SDK request */ }
        const command = String(req.headers['x-amz-target']).split('.').pop();
        res.setHeader('content-type', 'application/x-amz-json-1.0');
        if (command === 'ChangeMessageVisibility') {
          releases++;
          if (expired) {
            res.statusCode = 400;
            res.setHeader('x-amzn-errortype', errorName);
            res.end(JSON.stringify({ __type: errorName, message: 'Synthetic expired receipt.' }));
            return;
          }
        }
        const result = command === 'GetQueueAttributes' ? { Attributes: { QueueArn: 'arn:aws:sqs:us-east-1:000000000000:fixture' } }
          : command === 'ReceiveMessage' && !received ? { Messages: [{ MessageId: 'prefetch', ReceiptHandle: 'expired-receipt',
            Body: body, MD5OfBody: createHash('md5').update(body).digest('hex') }] } : {};
        if (command === 'ReceiveMessage') received = true;
        res.end(JSON.stringify(result));
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw Error('Missing fixture listener');
      const endpoint = `http://127.0.0.1:${address.port}`;
      Object.assign(process.env, { AWS_ENDPOINT_URL_SQS: endpoint, AWS_ACCESS_KEY_ID: 'fixture', AWS_SECRET_ACCESS_KEY: 'fixture', AWS_REGION: 'us-east-1' });
      try {
            await persistenceRuntime.initializePersistence(environment);
        environment.config.agendaQueue = { options: { backend: 'sqs', sqs: { queueUrl: endpoint + '/000000000000/fixture', region: 'us-east-1', waitTimeSeconds: 0 } }, jobs: {} };
        const service = createQueue();
        await (service as any).handleReady();
    await service.activate();
        const agenda = Reflect.get(service, 'agendas').sqs as import('agenda').Agenda;
        const claim = await agenda.db.getNextJobToRun('prefetch', new Date(), new Date(), undefined, undefined);
        assert.equal(String(claim?._id), 'expired-prefetch');
        // The real SDK rejects this receipt exactly as SQS does after visibility expiry.
        await stopOwner(environment);
        assert.equal(releases, 1);
        await persistenceRuntime.cleanupPersistence(environment);
        assert.equal(releases, 1, 'Cleanup must not retry a relinquished receipt');
      } finally {
        expired = false;
        await persistenceRuntime.cleanupPersistence(environment);
        await new Promise<void>(resolve => server.close(() => resolve()));
        for (const [name, value] of saved) {
          if (value === undefined) delete process.env[name]; else process.env[name] = value;
        }
      }
    });
  }

  for (const oldAction of ['unlock', 'complete']) {
    it(`retains a newer SQS receipt when an older delivery with the same job id ${oldAction}s`, async function () {
      const { createHash } = await import('node:crypto');
      const { Job } = await import('agenda');
      const names = ['AWS_ENDPOINT_URL_SQS', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'];
      const saved = new Map(names.map(name => [name, process.env[name]]));
      const held = deferred(), entered = deferred();
      let receives = 0, refuseCurrent = true;
      const releases: string[] = [];
      const body = JSON.stringify({ backend: 'sqs', id: 'redelivered-job', name: 'redelivery', priority: 0,
        type: 'normal', data: {}, queuedAt: new Date().toISOString(), scheduledAt: null });
      const server = createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const input = JSON.parse(raw);
        const command = String(req.headers['x-amz-target']).split('.').pop();
        res.setHeader('content-type', 'application/x-amz-json-1.0');
        if (command === 'ChangeMessageVisibility' && input.VisibilityTimeout === 0) {
          releases.push(input.ReceiptHandle);
          const errorName = input.ReceiptHandle === 'older-receipt' ? 'ReceiptHandleIsInvalid'
            : refuseCurrent ? 'AccessDenied' : undefined;
          if (errorName) {
            res.statusCode = 400;
            res.setHeader('x-amzn-errortype', errorName);
            res.end(JSON.stringify({ __type: errorName, message: 'Synthetic release refusal.' }));
            return;
          }
        }
        // SQS can acknowledge DeleteMessage with an old receipt without deleting
        // the newer delivery. Only that delivery's receipt can release its lease.
        const result = command === 'GetQueueAttributes' ? { Attributes: { QueueArn: 'arn:aws:sqs:us-east-1:000000000000:fixture' } }
          : command === 'ReceiveMessage' ? { Messages: [{ MessageId: 'same-message',
            ReceiptHandle: ++receives === 1 ? 'older-receipt' : 'newer-receipt', Body: body,
            MD5OfBody: createHash('md5').update(body).digest('hex') }] } : {};
        res.end(JSON.stringify(result));
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw Error('Missing fixture listener');
      const endpoint = `http://127.0.0.1:${address.port}`;
      Object.assign(process.env, { AWS_ENDPOINT_URL_SQS: endpoint, AWS_ACCESS_KEY_ID: 'fixture', AWS_SECRET_ACCESS_KEY: 'fixture', AWS_REGION: 'us-east-1' });
      let running: Promise<unknown> | undefined;
      try {
            await persistenceRuntime.initializePersistence(environment);
        environment.config.agendaQueue = { options: { backend: 'sqs', sqs: { queueUrl: endpoint + '/000000000000/fixture', region: 'us-east-1', waitTimeSeconds: 0 } }, jobs: {} };
        const service = createQueue();
        await (service as any).handleReady();
    await service.activate();
        service.defineJob('redelivery', {}, async () => { entered.resolve(); await held.promise; });
        const agenda = Reflect.get(service, 'agendas').sqs as import('agenda').Agenda;
        const receive = () => agenda.db.getNextJobToRun('redelivery', new Date(), new Date(), undefined, undefined);
        const oldClaim = await receive();
        assert(oldClaim);
        const older = new Job(agenda, oldClaim, true);
        if (oldAction === 'complete') { running = older.run(); await entered.promise; }
        const newer = await receive();
        assert.equal(String(newer?._id), String(oldClaim._id));
        if (oldAction === 'unlock') await agenda.db.unlockJob(older.attrs);
        else { held.resolve(); await running; }
        assert(!releases.includes('newer-receipt'), 'An old delivery must not release the newer receipt');
        const shutdown = () => stopOwner(environment);
        await assert.rejects(shutdown(), { name: 'PersistenceError', code: 'cleanup' });
        assert.equal(releases.filter(value => value === 'newer-receipt').length, 1, 'A newer claim must remain owned after the old delivery settles');
        refuseCurrent = false;
        await shutdown();
        assert.equal(releases.filter(value => value === 'newer-receipt').length, 2, 'A still-owned receipt release must remain retryable');
        assert.equal(releases.filter(value => value === 'older-receipt').length, oldAction === 'unlock' ? 1 : 0);
      } finally {
        held.resolve(); refuseCurrent = false;
        await running;
        await persistenceRuntime.cleanupPersistence(environment);
        await new Promise<void>(resolve => server.close(() => resolve()));
        for (const [name, value] of saved) {
          if (value === undefined) delete process.env[name]; else process.env[name] = value;
        }
      }
    });
  }

  for (const [phase, errorName] of [
    ['initial', 'MessageNotInflight'], ['initial', 'ReceiptHandleIsInvalid'], ['final', 'ReceiptHandleIsInvalid'], ['initial', 'AccessDenied']
  ]) {
    it(`${errorName === 'AccessDenied' ? 'retains owned' : 'forgets ended'} SQS receipts after ${phase} state-save failures (${errorName})`, async function () {
      const { createHash } = await import('node:crypto');
      const { Job } = await import('agenda');
      const names = ['AWS_ENDPOINT_URL_SQS', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'];
      const saved = new Map(names.map(name => [name, process.env[name]]));
      const releases: string[] = [];
      let receives = 0, handlers = 0;
      const deliveries = 16;
      const body = JSON.stringify({ backend: 'sqs', id: 'repeated-message', name: 'expired-save', priority: 0,
        type: 'normal', data: { payload: 'x'.repeat(15000) }, queuedAt: new Date().toISOString(), scheduledAt: null });
      const server = createServer(async (req, res) => {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const input = JSON.parse(raw);
        const command = String(req.headers['x-amz-target']).split('.').pop();
        res.setHeader('content-type', 'application/x-amz-json-1.0');
        if (command === 'ChangeMessageVisibility' && input.VisibilityTimeout === 0) releases.push(input.ReceiptHandle);
        const endedSave = String(input.ReceiptHandle).startsWith('ended-') &&
          (phase === 'initial' ? command === 'ChangeMessageVisibility' && input.VisibilityTimeout !== 0 : command === 'DeleteMessage');
        if (endedSave) {
          res.statusCode = 400;
          res.setHeader('x-amzn-errortype', errorName);
          res.end(JSON.stringify({ __type: errorName, message: 'Synthetic ended receipt.' }));
          return;
        }
        const result = command === 'GetQueueAttributes' ? { Attributes: { QueueArn: 'arn:aws:sqs:us-east-1:000000000000:fixture' } }
          : command === 'ReceiveMessage' ? { Messages: [{ MessageId: 'same-message',
            ReceiptHandle: receives++ < deliveries ? `ended-${receives}` : 'current-receipt', Body: body,
            MD5OfBody: createHash('md5').update(body).digest('hex') }] } : {};
        res.end(JSON.stringify(result));
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw Error('Missing fixture listener');
      const endpoint = `http://127.0.0.1:${address.port}`;
      Object.assign(process.env, { AWS_ENDPOINT_URL_SQS: endpoint, AWS_ACCESS_KEY_ID: 'fixture', AWS_SECRET_ACCESS_KEY: 'fixture', AWS_REGION: 'us-east-1' });
      try {
            await persistenceRuntime.initializePersistence(environment);
        environment.config.agendaQueue = { options: { backend: 'sqs', sqs: { queueUrl: endpoint + '/000000000000/fixture', region: 'us-east-1', waitTimeSeconds: 0 } }, jobs: {} };
        const service = createQueue();
        await (service as any).handleReady();
    await service.activate();
        service.defineJob('expired-save', {}, async () => { handlers++; });
        const agenda = Reflect.get(service, 'agendas').sqs as import('agenda').Agenda;
        const receive = () => agenda.db.getNextJobToRun('expired-save', new Date(), new Date(), undefined, undefined);
        for (let i = 0; i < deliveries; i++) {
          const claim = await receive();
          assert(claim);
          const run = new Job(agenda, claim, true).run();
          if (phase === 'initial') await assert.rejects(run, error => error instanceof Error && error.name === errorName);
          else await run;
        }
        assert.equal(handlers, phase === 'initial' ? 0 : deliveries);
        assert.deepEqual(releases, [], 'An ended save must not require a release API request');
        assert(await receive(), 'Keep a newer live delivery of the same job owned');
        await stopOwner(environment);
        // Every extra release here is a stale claim/payload retained for the
        // entire worker lifetime. Redeliveries must not grow that retained set.
        assert.deepEqual(releases, errorName === 'AccessDenied'
          ? [...Array.from({ length: deliveries }, (_, i) => `ended-${i + 1}`), 'current-receipt']
          : ['current-receipt']);
      } finally {
        await persistenceRuntime.cleanupPersistence(environment);
        await new Promise<void>(resolve => server.close(() => resolve()));
        for (const [name, value] of saved) {
          if (value === undefined) delete process.env[name]; else process.env[name] = value;
        }
      }
    });
  }

  it('owns automatic removal while the final request and Agenda completion interleave', async function () {
    for (let phase = 0; phase < 16; phase++) {
      const request = deferred(), handler = deferred(), entered = deferred(), removing = deferred(), removed = deferred();
      let claimed = false;
      const { service, backend } = await realQueue({
        getNextJobToRun: async name => {
          if (claimed) return undefined;
          claimed = true;
          return { _id: toJobId('auto-remove'), name, data: {}, type: 'normal', priority: 0, lockedAt: new Date(), nextRunAt: new Date() };
        },
        removeJobs: async () => { removing.resolve(); await removed.promise; return 1; },
      });
      registerHttpRequestDrain(environment, () => request.promise);
      service.defineJob('auto-remove', { removeOnComplete: true }, async () => { entered.resolve(); await handler.promise; });
      await entered.promise;
      const cleanup = persistenceRuntime.cleanupPersistence(environment);
      try {
        await new Promise<void>(resolve => setImmediate(resolve));
        handler.resolve();
        for (let turn = 0; turn < phase; turn++) await Promise.resolve();
        request.resolve();
        await removing.promise;
        await new Promise<void>(resolve => setImmediate(resolve));
        expect(backend.disconnect.called, `interleaving ${phase}`).to.equal(false);
      } finally {
        handler.resolve(); request.resolve(); removed.resolve();
        await cleanup;
      }
      expect(backend.disconnect.calledOnce).to.equal(true);
    }
  });

  it('owns final Agenda acknowledgement after its watchdog has released the handler', async function () {
    const releaseHandler = deferred(), entered = deferred(), finalWrite = deferred(), releaseWrite = deferred();
    let claimed = false;
    const { service, agenda, backend } = await realQueue({
      getNextJobToRun: async name => {
        if (claimed) return undefined;
        claimed = true;
        return { _id: toJobId('expired-fixture'), name, data: {}, type: 'normal', priority: 0, lockedAt: new Date(), nextRunAt: new Date() };
      },
      saveJobState: async job => {
        if (!job.lockedAt && job.lastRunAt) { finalWrite.resolve(); await releaseWrite.promise; }
      },
    });
    service.defineJob('expired-fixture', { lockLifetime: 40 }, async () => { entered.resolve(); await releaseHandler.promise; });
    await entered.promise;
    await until(async () => (await agenda.getRunningStats()).runningJobs === 0);
    let finished = false;
    const cleanup = persistenceRuntime.cleanupPersistence(environment).then(() => { finished = true; });
    try {
      releaseHandler.resolve();
      await finalWrite.promise;
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(finished).to.equal(false);
      expect(backend.disconnect.called).to.equal(false);
    } finally {
      releaseHandler.resolve(); releaseWrite.resolve();
      await cleanup;
    }
    expect(backend.disconnect.calledOnce).to.equal(true);
  });

  for (const backendName of ['sqs', 'mongodb'] as const) {
  it(`releases prefetched ${backendName} claims before waiting for an active handler`, async function () {
    const releaseHandler = deferred(), entered = deferred();
    let claimed = 0, executions = 0, activeId = '';
    const unlock = sinon.stub().resolves();
    const { service, agenda, backend } = await realQueue({
      getNextJobToRun: async name => claimed < 2
        ? { _id: toJobId(String(++claimed)), name, data: {}, type: 'normal', priority: 0, lockedAt: new Date(), nextRunAt: null }
        : undefined,
      // Match the pinned adapters: Mongo single unlock ignores recovered jobs
      // with null nextRunAt; SQS bulk unlock misses already-returned receipts.
      unlockJob: async job => { if (backendName === 'sqs' || job.nextRunAt !== null) await unlock(job); },
      unlockJobs: async ids => { if (backendName === 'mongodb') for (const id of ids) await unlock({ _id: id }); },
    }, backendName);
    service.defineJob('prefetch-fixture', { concurrency: 1 }, async job => { executions++; activeId = String(job.attrs._id); entered.resolve(); await releaseHandler.promise; });
    await entered.promise;
    await until(async () => (await agenda.getRunningStats()).lockedJobs === 2);
    const cleanup = persistenceRuntime.cleanupPersistence(environment);
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(unlock.calledOnce).to.equal(true);
      expect(unlock.firstCall.args[0]._id).to.equal(activeId === '1' ? '2' : '1');
      expect(backend.disconnect.called).to.equal(false);
    } finally {
      releaseHandler.resolve();
      await cleanup;
    }
    expect(executions).to.equal(1);
  });
  }

  it('routes processor single-unlock calls through the owned claim release exactly once', async function () {
    const bulk = sinon.stub().resolves(), single = sinon.stub().resolves();
    const { agenda } = await realQueue({
      getNextJobToRun: async name => ({ _id: toJobId('recovered'), name, data: {}, type: 'normal', priority: 0, lockedAt: new Date(), nextRunAt: null }),
      unlockJobs: bulk, unlockJob: single,
    });
    try {
      const claim = await agenda.db.getNextJobToRun('recovered', new Date(), new Date(), undefined, undefined);
      assert(claim);
      await agenda.db.unlockJob(claim);
      await agenda.db.unlockJob(claim);
      expect(bulk.calledOnceWith([claim._id])).to.equal(true);
      expect(single.called).to.equal(false);
    } finally {
      await persistenceRuntime.cleanupPersistence(environment);
    }
  });

  it('does not unlock a successfully released claim again after another worker takes it', async function () {
    const releaseHandler = deferred(), entered = deferred();
    let claimed = 0, refuseThird = true, otherOwnsSecond = false, duplicateUnlock = false;
    const release = async (ids: Parameters<import('agenda').JobRepository['unlockJobs']>[0]) => {
      for (const id of ids) {
        if (String(id) === '2' && otherOwnsSecond) duplicateUnlock = true;
        if (String(id) === '3' && refuseThird) throw new Error('Synthetic partial unlock failure.');
      }
    };
    const { service, agenda, backend } = await realQueue({
      getNextJobToRun: async name => claimed < 3
        ? { _id: toJobId(String(++claimed)), name, data: {}, type: 'normal', priority: 0, lockedAt: new Date(), nextRunAt: new Date() }
        : undefined,
      unlockJobs: release, unlockJob: async job => release(job._id ? [job._id] : []),
    });
    service.defineJob('partial-release', { concurrency: 1 }, async () => { entered.resolve(); await releaseHandler.promise; });
    await entered.promise;
    await until(async () => (await agenda.getRunningStats()).lockedJobs === 3);
    try {
      await assert.rejects(persistenceRuntime.cleanupPersistence(environment), (error: unknown) => Reflect.get(error as object, 'code') === 'cleanup');
      expect(backend.disconnect.called).to.equal(false);
      otherOwnsSecond = true; refuseThird = false; releaseHandler.resolve();
      await persistenceRuntime.cleanupPersistence(environment);
      expect(duplicateUnlock).to.equal(false);
    } finally {
      refuseThird = false; releaseHandler.resolve();
      await persistenceRuntime.cleanupPersistence(environment);
    }
  });

  it('retains a same-ID late claim when the older release finishes after its failed unlock', async function () {
    const lateEntered = deferred(), lateReply = deferred(), oldReleaseEntered = deferred(), oldReleaseReply = deferred(), lateReleaseFailed = deferred();
    let calls = 0, releases = 0, refuse = true, executions = 0;
    const { service, backend } = await realQueue({
      getNextJobToRun: async name => {
        const n = ++calls;
        if (n > 2) return undefined;
        if (n === 2) { lateEntered.resolve(); await lateReply.promise; }
        return { _id: toJobId('same-id'), name, data: {}, type: 'normal', priority: 0,
          lockedAt: new Date(Date.now() + n), nextRunAt: new Date() };
      },
      unlockJobs: async () => {
        const n = ++releases;
        if (n === 1) {
          // The old fenced unlock applies, but its acknowledgement is held.
          // An already-admitted find-and-lock can now return the same job ID.
          oldReleaseEntered.resolve(); await oldReleaseReply.promise; return;
        }
        if (refuse) { lateReleaseFailed.resolve(); throw new Error('Synthetic late claim release refusal.'); }
      },
    });
    service.defineJob('same-id-late-claim', {}, async () => { executions++; });
    await lateEntered.promise;
    const cleanup = persistenceRuntime.cleanupPersistence(environment);
    try {
      await oldReleaseEntered.promise;
      lateReply.resolve(); await lateReleaseFailed.promise; oldReleaseReply.resolve();
      await assert.rejects(cleanup, (error: unknown) => Reflect.get(error as object, 'code') === 'cleanup');
      assert.equal(backend.disconnect.called, false, 'The newer failed release must retain backend ownership');
      refuse = false;
      await persistenceRuntime.cleanupPersistence(environment);
      assert.equal(backend.disconnect.calledOnce, true);
      assert.equal(releases, 4, 'Old release, failed late release, refused drain, then successful retry');
      assert.equal(executions, 0);
    } finally {
      refuse = false; lateReply.resolve(); oldReleaseReply.resolve();
      await cleanup.catch(() => {});
      await persistenceRuntime.cleanupPersistence(environment);
    }
  });

  it('keeps accepted completion admission after early unlock failure and the original deadline', async function () {
    const releaseFirst = deferred(), firstDone = deferred(), releaseSecond = deferred(), secondDone = deferred();
    let claimed = 0, refuseUnlock = true, firstError: unknown, secondError: unknown;
    const { service, agenda } = await realQueue({
      getNextJobToRun: async name => claimed < 2
        ? { _id: toJobId(String(++claimed)), name, data: {}, type: 'normal', priority: 0, lockedAt: new Date(), nextRunAt: new Date() }
        : undefined,
      unlockJobs: async () => { if (refuseUnlock) throw new Error('Synthetic unlock failure.'); },
      unlockJob: async () => { if (refuseUnlock) throw new Error('Synthetic unlock failure.'); },
    });
    Reflect.set(service, 'drainTimeoutMs', 200);
    service.defineJob('failure-completion', { concurrency: 1 }, async () => {
      await releaseFirst.promise;
      try { await service.now('failure-completion'); } catch (error) { firstError = error; }
      firstDone.resolve();
      await releaseSecond.promise;
      try { await service.now('failure-completion'); } catch (error) { secondError = error; }
      secondDone.resolve();
    });
    await until(async () => (await agenda.getRunningStats()).lockedJobs === 2);
    const shutdown = stopOwner(environment);
    try {
      await assert.rejects(shutdown, { name: 'PersistenceError', code: 'cleanup' });
      expect(persistenceRuntime.persistenceStatus(environment).resources.length).to.be.greaterThan(0);
      expect(persistenceRuntime.persistenceReady(environment)).to.equal(false);
      releaseFirst.resolve(); await firstDone.promise;
      expect(firstError).to.equal(undefined);
      await new Promise(resolve => setTimeout(resolve, 240));
      releaseSecond.resolve();
      await secondDone.promise;
      expect(secondError).to.equal(undefined);
      await assert.rejects(service.now('failure-completion'), /draining/);
    } finally {
      refuseUnlock = false; releaseFirst.resolve(); releaseSecond.resolve();
      await shutdown.catch(() => {});
      await persistenceRuntime.cleanupPersistence(environment);
    }
  });

  it('settles a late claim and its unlock before closing the backend', async function () {
    const entered = deferred(), releaseClaim = deferred(), unlockEntered = deferred(), releaseUnlock = deferred();
    let executions = 0, claimed = false;
    const { service, backend } = await realQueue({
      getNextJobToRun: async name => {
        if (claimed) return undefined;
        claimed = true;
        entered.resolve(); await releaseClaim.promise;
        return { _id: toJobId('late-claim'), name, data: {}, type: 'normal', priority: 0, lockedAt: new Date(), nextRunAt: new Date() };
      },
      unlockJobs: async () => { unlockEntered.resolve(); await releaseUnlock.promise; },
    });
    service.defineJob('late-fixture', {}, async () => { executions++; });
    await entered.promise;
    const cleanup = persistenceRuntime.cleanupPersistence(environment);
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(backend.disconnect.called).to.equal(false);
      releaseClaim.resolve();
      await Promise.race([unlockEntered.promise, new Promise<void>((_, reject) => setTimeout(() => reject(new Error('Late claim was not released.')), 200))]);
      expect(backend.disconnect.called).to.equal(false);
    } finally {
      releaseClaim.resolve(); releaseUnlock.resolve();
      await cleanup;
    }
    expect(executions).to.equal(0);
  });

  it('retains failed late-claim unlocks for cleanup retry', async function () {
    const entered = deferred(), releaseClaim = deferred();
    let claimed = false, refuseUnlock = true;
    const { service, backend } = await realQueue({
      getNextJobToRun: async name => {
        if (claimed) return undefined;
        claimed = true; entered.resolve(); await releaseClaim.promise;
        return { _id: toJobId('failed-unlock'), name, data: {}, type: 'normal', priority: 0, lockedAt: new Date(), nextRunAt: new Date() };
      },
      unlockJobs: async () => { if (refuseUnlock) throw new Error('Synthetic unlock refusal.'); },
    });
    service.defineJob('failed-unlock', {}, async () => { throw new Error('A stopped processor must not start this job.'); });
    await entered.promise;
    const cleanup = assert.rejects(persistenceRuntime.cleanupPersistence(environment), (error: unknown) => Reflect.get(error as object, 'code') === 'cleanup');
    try {
      releaseClaim.resolve();
      await cleanup;
      expect(backend.disconnect.called).to.equal(false);
    } finally {
      refuseUnlock = false; releaseClaim.resolve();
      await cleanup;
      await persistenceRuntime.cleanupPersistence(environment);
    }
    expect(backend.disconnect.calledOnce).to.equal(true);
  });

  it('quiesces only its captured HTTP owner when the selected fixture changes', async function () {
    const app = environment;
    await persistenceRuntime.initializePersistence(app);
    app.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: {} };
    const firstDrain = sinon.stub().resolves(), secondDrain = sinon.stub().resolves();
    registerHttpRequestDrain(app, firstDrain);
    const other = createDomainFixture();
    registerHttpRequestDrain(other, secondDrain);
    const agenda = createAgendaStub({ drain: sinon.stub().resolves({ timedOut: false }), stop: sinon.stub().resolves() });
    const service = createQueue();
    sinon.stub(service as any, 'createAgendaForBackend').resolves(agenda);
    await (service as any).handleReady();
    await service.activate();
    environment = other;
    await persistenceRuntime.cleanupPersistence(app);
    expect(firstDrain.calledOnce).to.equal(true);
    expect(secondDrain.called).to.equal(false);
  });

  it('refuses another application HTTP context as completion enqueue admission', async function () {
    const app = environment;
    await persistenceRuntime.initializePersistence(app);
    app.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: {} };
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const agenda = createAgendaStub({ drain: async () => { await held; return { timedOut: false }; }, stop: sinon.stub().resolves() });
    const service = createQueue();
    sinon.stub(service as any, 'createAgendaForBackend').resolves(agenda);
    await (service as any).handleReady();
    await service.activate();
    service.defineJob('completion', {}, async () => {});
    const other = createDomainFixture();
    const request = {};
    const response = Object.assign(new EventEmitter(), { end() {} });
    beginHttpRequest(request, response as unknown as import('express').Response, () => {}, other);
    const shutdown = stopOwner(app);
    environment = other;
    try {
      await assert.rejects(runHttpRequestContext(request, () => service.now('completion')), /draining/);
      expect(agenda.now.called).to.equal(false);
    } finally {
      response.emit('close');
      release();
      await shutdown;
      await persistenceRuntime.cleanupPersistence(app);
    }
  });

  it('keeps processors stopped while startup index validation is pending', async function () {
    await persistenceRuntime.initializePersistence(environment);
    environment.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: {} };
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const agenda = createAgendaStub({ drain: sinon.stub().resolves({ timedOut: false }), stop: sinon.stub().resolves() });
    const service = createQueue();
    sinon.stub(service as any, 'createAgendaForBackend').resolves(agenda);
    sinon.stub(service as any, 'createMongoIndexes').callsFake(async () => { enter(); await held; });
    const starting = (service as any).handleReady();
    await entered;
    const shutdown = stopOwner(environment);
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(agenda.start.called).to.equal(false);
    } finally {
      release();
      await starting.catch(() => {});
      await shutdown;
    }
  });

  it('retains a pending backend start when another concurrent start fails', async function () {
    await persistenceRuntime.initializePersistence(environment);
    environment.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: {
      first: { fnName: 'fixture.noop' }, second: { fnName: 'fixture.noop', backend: 'sqs' },
    } };
    Reflect.set(environment.collaborators, 'fixture', { noop: async () => {} });
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const first = createAgendaStub({ start: sinon.stub().rejects(new Error('First backend start failed.')), drain: sinon.stub().resolves({ timedOut: false }), stop: sinon.stub().resolves() });
    const second = createAgendaStub({ start: async () => { enter(); await held; }, drain: sinon.stub().resolves({ timedOut: false }), stop: sinon.stub().resolves() });
    const service = createQueue();
    sinon.stub(service as any, 'createAgendaForBackend').callsFake(async (backend: unknown) => backend === 'mongodb' ? first : second);
    let failureObserved = false;
    await service.initialize();
    const starting = assert.rejects(service.activate(), /First backend start failed/)
      .then(() => { failureObserved = true; });
    await entered;
    await new Promise<void>(resolve => setImmediate(resolve));
    let finished = false;
    const cleanup = persistenceRuntime.cleanupPersistence(environment).then(() => { finished = true; });
    try {
      expect(failureObserved).to.equal(true);
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(finished).to.equal(false);
      expect(second.stop.called).to.equal(false);
    } finally {
      release();
      await starting;
      await cleanup;
    }
    expect(second.stop.calledOnceWith(false)).to.equal(true);
  });

  it('refuses processors and completion submissions when startup index validation fails', async function () {
    await persistenceRuntime.initializePersistence(environment);
    environment.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: { completion: { fnName: 'fixture.noop' } } };
    const agenda = createAgendaStub({ stop: sinon.stub().resolves() });
    const service = createQueue();
    sinon.stub(service as any, 'createAgendaForBackend').resolves(agenda);
    sinon.stub(service as any, 'createMongoIndexes').rejects(new Error('Synthetic startup index failure.'));
    await assert.rejects(service.initialize(), /startup index failure/);
    await assert.rejects(service.now('completion'), /active application admission/);
    expect(agenda.start.called).to.equal(false);
    expect(agenda.now.called).to.equal(false);
    await persistenceRuntime.cleanupPersistence(environment);
  });

  it('honours the drain deadline through prior producer hooks and calls shutdown back once', async function () {
    await persistenceRuntime.initializePersistence(environment);
    let resume!: () => void;
    const priorProducer = new Promise<void>(resolve => { resume = resolve; });
    registerHttpRequestDrain(environment, () => priorProducer);
    environment.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: {} };
    Reflect.set(environment.config.agendaQueue.options!, 'drainTimeoutMs', 25);
    const agenda = createAgendaStub({ drain: sinon.stub().resolves({ timedOut: false }), stop: sinon.stub().resolves() });
    const service = createQueue();
    sinon.stub(service as any, 'createAgendaForBackend').resolves(agenda);
    await (service as any).handleReady();
    await service.activate();
    let callbacks = 0;
    const shutdown = stopOwner(environment).then(() => { callbacks++; }, error => { callbacks++; return error; });
    try {
      const result = await Promise.race([shutdown, new Promise(resolve => setTimeout(() => resolve('unbounded'), 150))]);
      expect(result).to.be.instanceOf(Error);
      expect(result).to.have.property('code', 'cleanup');
      expect(persistenceRuntime.persistenceStatus(environment).resources.length).to.be.greaterThan(0);
      expect(persistenceRuntime.persistenceReady(environment)).to.equal(false);
      expect(agenda.stop.calledOnceWith(false)).to.equal(true);
    } finally {
      resume();
      await shutdown;
      await persistenceRuntime.cleanupPersistence(environment);
      await new Promise<void>(resolve => setImmediate(resolve));
    }
    expect(callbacks).to.equal(1);
  });

  it('owns completion enqueues from accepted HTTP requests while refusing unrelated and detached callers', async function () {
    await persistenceRuntime.initializePersistence(environment);
    environment.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: {} };
    const web = express();
    // The real application creates HTTP middleware before Agenda's ready hook.
    web.use(composeHttpSession({ secret: 'fixture', cookie: { secure: false } }, environment).middleware);
    const agenda = createAgendaStub({ drain: sinon.stub().resolves({ timedOut: false }), stop: sinon.stub().resolves() });
    const service = createQueue();
    sinon.stub(service as any, 'createAgendaForBackend').resolves(agenda);
    await (service as any).handleReady();
    await service.activate();
    service.defineJob('completion', {}, async () => {});
    let enter!: () => void, release!: () => void, detach!: () => void;
    const started = new Promise<void>(resolve => { enter = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    const detachedGate = new Promise<void>(resolve => { detach = resolve; });
    let detached!: Promise<unknown>;
    web.get('/', (req, res) => {
      void runHttpRequestHandler(req, async () => {
        enter();
        await held;
        detached = detachedGate.then(() => service.now('completion'));
        void detached.catch(() => {});
        try { await service.now('completion'); res.end('queued'); }
        catch { res.status(500).end('refused'); }
      });
    });
    const server = createServer(web);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    const request = fetch(`http://127.0.0.1:${address.port}/`);
    await started;
    const shutdown = stopOwner(environment);
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      await assert.rejects(service.now('completion'), /draining/);
      release();
      const response = await request;
      expect(await response.text()).to.equal('queued');
      expect(response.status).to.equal(200);
      await shutdown;
      expect(agenda.now.calledOnce).to.equal(true);
      detach();
      await assert.rejects(detached, /draining/);
    } finally {
      release();
      detach();
      await request.catch(() => {});
      await shutdown.catch(() => {});
      await new Promise<void>(resolve => server.close(() => resolve()));
      await persistenceRuntime.cleanupPersistence(environment);
    }
  });

  it('stops processors before waiting for held enqueue writes during drain', async function () {
    await persistenceRuntime.initializePersistence(environment);
    environment.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: {} };
    let release!: () => void;
    const write = new Promise<void>(resolve => { release = resolve; });
    const agenda = createAgendaStub({
      drain: sinon.stub().resolves({ timedOut: false }), stop: sinon.stub().resolves(),
      now: sinon.stub().returns(write),
    });
    const service = createQueue();
    sinon.stub(service as any, 'createAgendaForBackend').resolves(agenda);
    await (service as any).handleReady();
    await service.activate();
    service.defineJob('held-write', {}, async () => {});
    const queued = service.now('held-write');
    const shutdown = stopOwner(environment);
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(agenda.stop.calledOnceWith(false)).to.equal(true);
    } finally {
      release();
      await queued;
      await shutdown;
    }
  });

  for (const processorState of ['waiting', 'watchdog-completed']) {
  it(`bounds worker drain with ${processorState} processor and retains actual handlers for cleanup retry`, async function () {
    await persistenceRuntime.initializePersistence(environment);
    environment.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: {} };
    Reflect.set(environment.config.agendaQueue.options!, 'drainTimeoutMs', 25);
    let release!: () => void;
    let resume!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const afterDeadline = new Promise<void>(resolve => { resume = resolve; });
    let attempted!: Promise<void>;
    let reportAttempt!: () => void;
    const attempt = new Promise<void>(resolve => { reportAttempt = resolve; });
    // Agenda can report no running jobs after its lock watchdog expires while
    // the actual handler is still awaiting remote I/O.
    let worker: Promise<void>;
    const agenda = createAgendaStub({
      drain: sinon.stub().callsFake(async () => {
        if (processorState === 'waiting') await worker;
        return { timedOut: false };
      }),
      stop: sinon.stub().resolves(),
    });
    const service = createQueue();
    sinon.stub(service as any, 'createAgendaForBackend').resolves(agenda);
    await (service as any).handleReady();
    await service.activate();
    service.defineJob('held-handler', {}, async () => {
      await afterDeadline;
      attempted = service.now('held-handler').then(() => {});
      reportAttempt();
      await attempted;
      await held;
    });
    worker = agenda.define.firstCall.args[1]({ attrs: { name: 'held-handler' } });
    void worker.catch(() => {});
    const shutdown = stopOwner(environment).then(() => undefined, error => error);
    const result = await Promise.race([shutdown, new Promise(resolve => setTimeout(() => resolve('unbounded'), 150))]);
    try {
      expect(result).to.be.instanceOf(Error);
      expect(result).to.have.property('code', 'cleanup');
      expect(agenda.stop.calledOnceWith(false)).to.equal(true);
      expect(persistenceRuntime.persistenceStatus(environment).resources.length).to.be.greaterThan(0);
      expect(persistenceRuntime.persistenceReady(environment)).to.equal(false);
      await assert.rejects(service.now('held-handler'), /draining/);
      resume();
      await attempt;
      await attempted;
      expect(agenda.now.calledOnceWith('held-handler')).to.equal(true);
      let cleaned = false;
      const retry = persistenceRuntime.cleanupPersistence(environment).then(() => { cleaned = true; });
      void retry.catch(() => {});
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(cleaned).to.equal(false);
      expect(agenda.stop.calledOnceWith(false)).to.equal(true);
      release();
      await worker;
      await retry;
      expect(agenda.stop.calledOnce).to.equal(true);
    } finally {
      resume();
      release();
      await worker;
      await shutdown;
      await persistenceRuntime.cleanupPersistence(environment);
    }
  });
  }

  it('drains accepted Agenda completion writes before persistence refuses operations', async function () {
    await persistenceRuntime.initializePersistence(environment);
    environment.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: {} };
    let release!: () => void;
    let written = false;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const agenda = createAgendaStub({ stop: sinon.stub().resolves() });
    const service = createQueue();
    sinon.stub(service as any, 'createAgendaForBackend').resolves(agenda);
    await (service as any).handleReady();
    await service.activate();
    service.defineJob('checkpoint', {}, async () => {
      await pending;
      await persistenceRuntime.persistenceOperation(environment, async () => { written = true; });
    });
    const worker = agenda.define.firstCall.args[1]({ attrs: { name: 'checkpoint' } });
    const shutdown = stopOwner(environment);
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(persistenceRuntime.persistenceStatus(environment).resources.length).to.be.greaterThan(0);
      expect(persistenceRuntime.persistenceReady(environment)).to.equal(false);
      release();
      await worker;
      await shutdown;
      expect(written).to.equal(true);
      expect(persistenceRuntime.persistenceReady(environment)).to.equal(false);
    } finally {
      release();
      await shutdown.catch(() => {});
    }
  });

  for (const registration of ['configured', 'dynamic']) {
  it(`durably queues completion audits from accepted ${registration} jobs while refusing new and detached submissions`, async function () {
    await persistenceRuntime.initializePersistence(environment);
    environment.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: {} };
    environment.config.environment = 'production';
    let releaseWorker!: () => void;
    let releaseEnqueue!: () => void;
    let releaseDetached!: () => void;
    const heldWorker = new Promise<void>(resolve => { releaseWorker = resolve; });
    const heldEnqueue = new Promise<void>(resolve => { releaseEnqueue = resolve; });
    const heldDetached = new Promise<void>(resolve => { releaseDetached = resolve; });
    let worker: Promise<void>;
    let detached: Promise<unknown>;
    const agenda = createAgendaStub({
      stop: sinon.stub().resolves(),
      drain: async () => { await worker; return { timedOut: false }; },
      now: sinon.stub().returns(heldEnqueue),
    });
    const service = createQueue();
    sinon.stub(service as any, 'createAgendaForBackend').resolves(agenda);
    await (service as any).handleReady();
    await service.activate();
    service.defineJob('IntegrationAuditService-StoreIntegrationAudit', {}, async () => {});
    const handler = async () => {
      await heldWorker;
      const { Services: Audit } = require('../../src/services/IntegrationAuditService');
      new Audit.IntegrationAuditService(auditInput()).completeAudit({
        redboxOid: 'audit-oid', integrationName: 'figshare', integrationAction: 'syncRecordWithFigshare',
        traceId: 'trace', spanId: 'span', startedAt: new Date().toISOString(),
      }, { message: 'Accepted Figshare work completed.' });
      // A descendant that outlives the accepted handler has no admission right.
      detached = heldDetached.then(() => service.now('IntegrationAuditService-StoreIntegrationAudit', {}));
      void detached.catch(() => {});
    };
    if (registration === 'dynamic') service.defineJob('completion-producer', {}, handler);
    else {
      Reflect.set(environment.collaborators, 'completionFixture', { handler });
      service.defineJobs([{ name: 'completion-producer', fnName: 'completionFixture.handler' }]);
    }
    Reflect.set(collaborators, 'AgendaQueueService', service);
    worker = agenda.define.secondCall.args[1]({ attrs: { name: 'completion-producer' } });
    let finished = false;
    const shutdown = stopOwner(environment)
      .then(() => { finished = true; });
    try {
      await assert.rejects(service.now('IntegrationAuditService-StoreIntegrationAudit', {}), /draining/);
      releaseWorker();
      await worker;
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(agenda.now.calledOnce).to.equal(true);
      expect(agenda.now.firstCall.args[0]).to.equal('IntegrationAuditService-StoreIntegrationAudit');
      expect(agenda.now.firstCall.args[1]).to.include({ redboxOid: 'audit-oid', status: 'success' });
      expect(finished).to.equal(false);
      expect(persistenceRuntime.persistenceStatus(environment).resources.length).to.be.greaterThan(0);
      expect(persistenceRuntime.persistenceReady(environment)).to.equal(false);
      releaseDetached();
      await assert.rejects(detached!, /draining/);
      releaseEnqueue();
      await shutdown;
      expect(finished).to.equal(true);
    } finally {
      releaseWorker();
      releaseEnqueue();
      releaseDetached();
      await shutdown.catch(() => {});
      Reflect.deleteProperty(collaborators, 'AgendaQueueService');
    }
  });

  }

  it('drains the real audit storage handler through its notification enqueue', async function () {
    await persistenceRuntime.initializePersistence(environment);
    environment.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: {} };
    environment.config.environment = 'production';
    environment.config.storage = { serviceName: 'auditstorage' };
    let releaseStorage!: () => void;
    let releaseEnqueue!: () => void;
    const heldStorage = new Promise<void>(resolve => { releaseStorage = resolve; });
    const heldEnqueue = new Promise<void>(resolve => { releaseEnqueue = resolve; });
    Reflect.set(environment.collaborators, 'auditstorage', {
      createIntegrationAudit: async () => { await heldStorage; return { success: true }; },
    });
    const { Services: Audit } = require('../../src/services/IntegrationAuditService');
    const audit = new Audit.IntegrationAuditService(auditInput());
    let worker: Promise<void>;
    const agenda = createAgendaStub({
      stop: sinon.stub().resolves(),
      drain: async () => { await worker; return { timedOut: false }; },
      now: sinon.stub().returns(heldEnqueue),
    });
    const queue = createQueue();
    sinon.stub(queue as any, 'createAgendaForBackend').resolves(agenda);
    await (queue as any).handleReady();
    await queue.activate();
    queue.defineJob('IntegrationAuditService-StoreIntegrationAudit', {}, audit.storeIntegrationAudit.bind(audit));
    queue.defineJob('IntegrationNotificationService-Dispatch', {}, async () => {});
    Reflect.set(collaborators, 'AgendaQueueService', queue);
    worker = agenda.define.firstCall.args[1]({ attrs: { data: {
      redboxOid: 'audit-oid', integrationName: 'figshare', integrationAction: 'syncRecordWithFigshare',
      status: 'success', traceId: 'trace', spanId: 'span', startedAt: new Date().toISOString(),
    } } });
    let finished = false;
    const shutdown = stopOwner(environment)
      .then(() => { finished = true; });
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(finished).to.equal(false);
      expect(persistenceRuntime.persistenceStatus(environment).resources.length).to.be.greaterThan(0);
      expect(persistenceRuntime.persistenceReady(environment)).to.equal(false);
      releaseStorage();
      await until(() => agenda.now.calledOnceWith('IntegrationNotificationService-Dispatch'));
      expect(agenda.now.calledOnceWith('IntegrationNotificationService-Dispatch')).to.equal(true);
      expect(finished).to.equal(false);
      releaseEnqueue();
      await worker;
      await shutdown;
    } finally {
      releaseStorage();
      releaseEnqueue();
      await shutdown.catch(() => {});
      Reflect.deleteProperty(collaborators, 'AgendaQueueService');
    }
  });

  it('persists delayed retries from accepted workers while refusing external and detached schedules', async function () {
    await persistenceRuntime.initializePersistence(environment);
    environment.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: {} };
    let releaseWorker!: () => void, releaseSchedule!: () => void, releaseDetached!: () => void;
    const heldWorker = new Promise<void>(resolve => { releaseWorker = resolve; });
    const heldSchedule = new Promise<void>(resolve => { releaseSchedule = resolve; });
    const heldDetached = new Promise<void>(resolve => { releaseDetached = resolve; });
    let worker: Promise<void>, detached: Promise<unknown>;
    const agenda = createAgendaStub({
      stop: sinon.stub().resolves(),
      drain: async () => { await worker; return { timedOut: false }; },
      schedule: sinon.stub().returns(heldSchedule),
    });
    const queue = createQueue();
    sinon.stub(queue as any, 'createAgendaForBackend').resolves(agenda);
    await (queue as any).handleReady();
    await queue.activate();
    queue.defineJob('RaidMintRetryJob', {}, async () => {
      await heldWorker;
      await queue.schedule('RaidMintRetryJob', 'in 5 minutes', { oid: 'retry-oid', attemptCount: 2 });
      detached = heldDetached.then(() => queue.schedule('RaidMintRetryJob', 'in 5 minutes', {}));
      void detached.catch(() => {});
    });
    worker = agenda.define.firstCall.args[1]({ attrs: { name: 'RaidMintRetryJob' } });
    void worker.catch(() => {});
    let finished = false;
    const shutdown = stopOwner(environment)
      .then(() => { finished = true; });
    void shutdown.catch(() => {});
    try {
      assert.throws(() => queue.schedule('RaidMintRetryJob', 'in 5 minutes', {}), /draining/);
      releaseWorker();
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(agenda.schedule.calledOnceWith('in 5 minutes', 'RaidMintRetryJob', { oid: 'retry-oid', attemptCount: 2 })).to.equal(true);
      expect(finished).to.equal(false);
      releaseSchedule();
      await worker;
      releaseDetached();
      await assert.rejects(detached!, /draining/);
      await shutdown;
    } finally {
      releaseWorker(); releaseSchedule(); releaseDetached();
      await shutdown.catch(() => {});
    }
  });

  describe('Constructor', function () {
    it('should instantiate without throwing error with explicit inputs', function () {
      environment = createDomainFixture();

      let service: AgendaQueue;
      try {
        service = createQueue();
      } catch (e: unknown) {
        throw new Error(`Constructor threw error: ${e instanceof Error ? e.message : String(e)}`);
      }

      expect(service).to.be.an.instanceOf(AgendaQueue);
    });

    it('should have a public initialize method', function () {
      const mockSails = createDomainFixture();
      environment = mockSails;

      const service = createQueue();

      expect(service.initialize).to.be.a('function');
    });
  });

  describe('exports', function () {
    it('should export all public methods with explicit inputs', function () {
      environment = createDomainFixture();

      const service = createQueue();
      const exported = service;

      expect(exported).to.have.property('every');
      expect(exported).to.have.property('schedule');
      expect(exported).to.have.property('now');
      expect(exported).to.have.property('jobs');
      expect(exported).to.have.property('sampleFunctionToDemonstrateHowToDefineAJobFunction');
      expect(exported).to.have.property('defineJob');
      expect(exported).to.have.property('moveCompletedJobsToHistory');
    });
  });

  describe('config parsing', function () {
    it('accepts supported backend values', function () {
      expect(parseAgendaQueueBackend('mongodb', 'test-env')).to.equal('mongodb');
      expect(parseAgendaQueueBackend('sqs', 'test-env')).to.equal('sqs');
      expect(parseAgendaQueueBackend(undefined, 'test-env')).to.equal(undefined);
    });

    it('rejects unsupported backend values', function () {
      expect(() => parseAgendaQueueBackend('redis', 'test-env')).to.throw("Invalid test-env value 'redis'. Expected one of: mongodb, sqs.");
    });

    it('parses non-negative history retention hours', function () {
      expect(parseAgendaHistoryRetentionHours('36', 'test-env')).to.equal(36);
      expect(parseAgendaHistoryRetentionHours('0', 'test-env')).to.equal(0);
      expect(parseAgendaHistoryRetentionHours(undefined, 'test-env')).to.equal(undefined);
    });

    it('rejects invalid history retention hours', function () {
      expect(() => parseAgendaHistoryRetentionHours('-1', 'test-env')).to.throw("Invalid test-env value '-1'. Expected a non-negative number of hours.");
      expect(() => parseAgendaHistoryRetentionHours('invalid', 'test-env')).to.throw("Invalid test-env value 'invalid'. Expected a non-negative number of hours.");
    });
  });

  describe('every', function () {
    it('allows recurring schedules for Mongo-backed jobs', function () {
      const service = createQueue();
      const agendaEvery = sinon.stub().resolves();

      (service as any).agendas = { mongodb: { every: agendaEvery } };
      (service as any).active = true;
      (service as any).jobBackendByName = new Map([['mongo-job', 'mongodb']]);

      service.every('mongo-job', '5 minutes', { sample: true }, { timezone: 'UTC' });

      expect(agendaEvery.calledOnceWithExactly('5 minutes', 'mongo-job', { sample: true }, { timezone: 'UTC' })).to.equal(true);
    });

    it('defaults unknown jobs to Mongo recurring schedules', function () {
      const service = createQueue();
      (service as any).active = true;
      expect(() => service.every('default-job', '5 minutes')).to.throw("AgendaQueue:: Unknown job 'default-job'. Define it in agendaQueue.jobs before queuing it.");
    });

    it('rejects recurring schedules for SQS-backed jobs', function () {
      const service = createQueue();
      const agendaEvery = sinon.stub();

      (service as any).agendas = { sqs: { every: agendaEvery } };
      (service as any).active = true;
      (service as any).jobBackendByName = new Map([['sqs-job', 'sqs']]);

      expect(() => service.every('sqs-job', '5 minutes')).to.throw("AgendaQueue:: every() is not supported for SQS-backed job 'sqs-job'. Use an external scheduler for SQS-backed recurring jobs.");
      expect(agendaEvery.called).to.equal(false);
    });
  });

  describe('routing', function () {
    it('routes now() to the job backend', function () {
      const service = createQueue();
      const sqsAgenda = createAgendaStub({ attrs: { backend: 'sqs' } });

      (service as any).agendas = { sqs: sqsAgenda };
      (service as any).active = true;
      (service as any).jobBackendByName = new Map([['sqs-job', 'sqs']]);

      describe('createAgendaForBackend', function () {
        it('preserves explicit zero lock lifetime and processEvery values in agenda options', function () {
          const service = createQueue();
          const agendaOptions = { backend: undefined };

          (service as any).applyCommonAgendaOptions(agendaOptions, {
            defaultLockLifetime: 0,
            processEvery: '5 seconds'
          });

          expect(agendaOptions).to.deep.equal({
            backend: undefined,
            defaultLockLifetime: 0,
            processEvery: '5 seconds'
          });
        });
      });

      service.now('sqs-job', { sample: true });

      expect(sqsAgenda.now.calledOnceWithExactly('sqs-job', { sample: true })).to.equal(true);
    });

    it('routes schedule() to the Mongo backend', function () {
      const service = createQueue();
      const mongoAgenda = createAgendaStub({ attrs: { backend: 'mongodb' } });

      (service as any).agendas = { mongodb: mongoAgenda };
      (service as any).active = true;
      (service as any).jobBackendByName = new Map([['mongo-job', 'mongodb']]);

      service.schedule('mongo-job', 'in 5 minutes', { sample: true });

      expect(mongoAgenda.schedule.calledOnceWithExactly('in 5 minutes', 'mongo-job', { sample: true })).to.equal(true);
    });

    it('rejects SQS schedules over 15 minutes', function () {
      const service = createQueue();
      const sqsAgenda = createAgendaStub({
        attrs: { backend: 'sqs' },
        create: sinon.stub().returns({
          attrs: { nextRunAt: new Date(Date.now() + (16 * 60 * 1000)) },
          schedule: sinon.stub().returnsThis()
        })
      });

      (service as any).agendas = { sqs: sqsAgenda };
      (service as any).active = true;
      (service as any).jobBackendByName = new Map([['sqs-job', 'sqs']]);

      expect(() => service.schedule('sqs-job', 'in 16 minutes')).to.throw(AgendaQueueUnsupportedFeatureError, "AgendaQueue:: schedule() only supports delays up to 15 minutes for SQS-backed job 'sqs-job'.");
      expect(sqsAgenda.schedule.called).to.equal(false);
    });

    it('rejects invalid SQS schedules', function () {
      const service = createQueue();
      const sqsAgenda = createAgendaStub({
        attrs: { backend: 'sqs' },
        create: sinon.stub().returns({
          attrs: { nextRunAt: new Date('invalid') },
          schedule: sinon.stub().returnsThis()
        })
      });

      (service as any).agendas = { sqs: sqsAgenda };
      (service as any).active = true;
      (service as any).jobBackendByName = new Map([['sqs-job', 'sqs']]);

      expect(() => service.schedule('sqs-job', 'not a date')).to.throw("AgendaQueue:: schedule() received an invalid schedule for SQS-backed job 'sqs-job'.");
      expect(sqsAgenda.schedule.called).to.equal(false);
    });

    it('rejects jobs() when only SQS is configured', async function () {
      const service = createQueue();

      (service as any).agendas = { sqs: createAgendaStub({ attrs: { backend: 'sqs' } }) };

      try {
        await service.jobs();
        throw new Error('Expected jobs() to throw');
      } catch (error) {
        expect(error).to.be.instanceOf(AgendaQueueUnsupportedFeatureError);
        expect((error as Error).message).to.equal('AgendaQueue:: jobs() is only supported when a MongoDB-backed agenda is configured.');
      }
    });

    it('maps exact-name jobs() queries to Agenda v6 queryJobs()', async function () {
      const service = createQueue();
      const mongoAgenda = createAgendaStub({ attrs: { backend: 'mongodb' } });

      (service as any).agendas = { mongodb: mongoAgenda };
      (service as any).active = true;
      (service as any).jobBackendByName = new Map([['mongo-job', 'mongodb']]);

      await service.jobs({ name: 'mongo-job' });

      expect(mongoAgenda.queryJobs.calledOnceWithExactly({ name: 'mongo-job' })).to.equal(true);
    });

    it('maps $in jobs() queries to Agenda v6 queryJobs() names', async function () {
      const service = createQueue();
      const mongoAgenda = createAgendaStub({ attrs: { backend: 'mongodb' } });

      (service as any).agendas = { mongodb: mongoAgenda };
      (service as any).active = true;
      (service as any).jobBackendByName = new Map([
        ['mongo-a', 'mongodb'],
        ['mongo-b', 'mongodb']
      ]);

      await service.jobs({ name: { $in: ['mongo-a', 'mongo-b'] } });

      expect(mongoAgenda.queryJobs.calledOnceWithExactly({ names: ['mongo-a', 'mongo-b'] })).to.equal(true);
    });

    it('rejects jobs() queries that target SQS-backed jobs', async function () {
      const service = createQueue();
      const mongoAgenda = createAgendaStub({ attrs: { backend: 'mongodb' } });

      (service as any).agendas = { mongodb: mongoAgenda };
      (service as any).active = true;
      (service as any).jobBackendByName = new Map([
        ['mongo-job', 'mongodb'],
        ['sqs-job', 'sqs']
      ]);

      try {
        await service.jobs({ name: 'sqs-job' } as any);
        throw new Error('Expected jobs() to throw');
      } catch (error) {
        expect(error).to.be.instanceOf(AgendaQueueUnsupportedFeatureError);
        expect((error as Error).message).to.equal('AgendaQueue:: jobs() is not supported for SQS-backed jobs.');
      }
      expect(mongoAgenda.queryJobs.called).to.equal(false);
    });

    it('rejects unsupported name query operators when SQS-backed jobs are configured', async function () {
      const service = createQueue();
      const mongoAgenda = createAgendaStub({ attrs: { backend: 'mongodb' } });

      (service as any).agendas = { mongodb: mongoAgenda };
      (service as any).active = true;
      (service as any).jobBackendByName = new Map([
        ['mongo-job', 'mongodb'],
        ['sqs-job', 'sqs']
      ]);

      try {
        await service.jobs({ name: { $regex: '^sqs-' } } as any);
        throw new Error('Expected jobs() to throw');
      } catch (error) {
        expect(error).to.be.instanceOf(AgendaQueueUnsupportedFeatureError);
        expect((error as Error).message).to.equal('AgendaQueue:: jobs() only supports name queries using an exact string or $in when SQS-backed jobs are configured.');
      }
      expect(mongoAgenda.queryJobs.called).to.equal(false);
    });

    it('moves completed jobs to history idempotently', async function () {
      const clock = sinon.useFakeTimers(new Date('2026-07-16T12:00:00.000Z'));
      const service = createQueue();
      const completedJob = { _id: 'job-id', name: 'completed-job', nextRunAt: null, lockedAt: null, lastFinishedAt: new Date('2026-07-16T10:00:00Z') };
      const jobsCollection = {
        find: sinon.stub().withArgs({ nextRunAt: null, lockedAt: null, lastFinishedAt: { $type: 'date' } }).returns({
          toArray: sinon.stub().resolves([completedJob])
        }),
        deleteOne: sinon.stub().resolves(undefined)
      };
      const historyCollection = {
        replaceOne: sinon.stub().resolves(undefined),
        deleteMany: sinon.stub().resolves(undefined)
      };
      const collection = sinon.stub();
      collection.withArgs('agendaJobs').returns(jobsCollection);
      collection.withArgs('agendaJobsHistory').returns(historyCollection);
      (persistenceRuntime.mongoDatabase as sinon.SinonStub).resolves({ collection });
      environment.config.agendaQueue = {
        options: { collection: 'agendaJobs', historyRetentionHours: 36 },
        jobs: {}
      };

      await service.moveCompletedJobsToHistory({} as any);

      expect(historyCollection.replaceOne.calledOnceWithExactly({ _id: 'job-id' }, completedJob, { upsert: true })).to.equal(true);
      expect(jobsCollection.find.calledOnceWithExactly({ nextRunAt: null, lockedAt: null, lastFinishedAt: { $type: 'date' } })).to.equal(true);
      expect(jobsCollection.deleteOne.calledOnceWithExactly({ _id: 'job-id', nextRunAt: null, lockedAt: null, lastFinishedAt: completedJob.lastFinishedAt })).to.equal(true);
      expect(historyCollection.deleteMany.calledOnceWithExactly({
        lastFinishedAt: { $lt: new Date('2026-07-15T00:00:00.000Z') }
      })).to.equal(true);
      clock.restore();
    });
  });

  describe('startup configuration', function () {
    it('applies the default backend and per-job overrides', async function () {
      const mockSails = createDomainFixture({
        config: {
          agendaQueue: {
            options: {
              backend: 'sqs',
              sqs: {
                queueUrl: 'http://localstack:4566/queue/jobs',
                region: 'ap-southeast-2'
              }
            },
            jobs: {
              'default-job': { fnName: 'testservice.defaultJob' },
              'override-job': { fnName: 'testservice.overrideJob', backend: 'mongodb' }
            }
          }
        },
        collaborators: {
          testservice: {
            defaultJob: sinon.stub().resolves(undefined),
            overrideJob: sinon.stub().resolves(undefined)
          }
        }
      });
      selectFixture(mockSails);

      const service = createQueue();
      const mongoAgenda = createAgendaStub({ attrs: { backend: 'mongodb' } });
      const sqsAgenda = createAgendaStub({ attrs: { backend: 'sqs' } });
      const createAgendaForBackend = sinon.stub(service as any, 'createAgendaForBackend');
      createAgendaForBackend.withArgs('mongodb', sinon.match.any, sinon.match.any).resolves(mongoAgenda);
      createAgendaForBackend.withArgs('sqs', sinon.match.any, sinon.match.any).resolves(sqsAgenda);

      await (service as any).handleReady();
    await service.activate();

      expect((service as any).defaultBackend).to.equal('sqs');
      expect((service as any).jobBackendByName.get('default-job')).to.equal('sqs');
      expect((service as any).jobBackendByName.get('override-job')).to.equal('mongodb');
      expect(createAgendaForBackend.calledTwice).to.equal(true);
      expect(sqsAgenda.define.calledOnceWithExactly('default-job', sinon.match.func)).to.equal(true);
      expect(mongoAgenda.define.calledOnceWithExactly('override-job', sinon.match.func)).to.equal(true);
    });

    it('starts only the required backends', async function () {
      const mockSails = createDomainFixture({
        config: {
          agendaQueue: {
            options: {
              backend: 'sqs',
              sqs: {
                queueUrl: 'http://localstack:4566/queue/jobs',
                region: 'ap-southeast-2'
              }
            },
            jobs: {
              'sqs-job': { fnName: 'testservice.process' }
            }
          }
        },
        collaborators: {
          testservice: {
            process: sinon.stub().resolves(undefined)
          }
        }
      });
      selectFixture(mockSails);

      const service = createQueue();
      const sqsAgenda = createAgendaStub({ attrs: { backend: 'sqs' } });
      const createAgendaForBackend = sinon.stub(service as any, 'createAgendaForBackend');
      createAgendaForBackend.withArgs('sqs', sinon.match.any, sinon.match.any).resolves(sqsAgenda);

      await (service as any).handleReady();
    await service.activate();

      expect(createAgendaForBackend.calledOnceWithExactly('sqs', sinon.match.object, sinon.match.any)).to.equal(true);
      expect((service as any).agendas.mongodb).to.equal(undefined);
      expect(sqsAgenda.start.calledOnce).to.equal(true);
      expect((persistenceRuntime.mongoDatabase as sinon.SinonStub).called).to.equal(false);
    });

    it('allows inline startup every schedules for Mongo-backed jobs', async function () {
      const mockSails = createDomainFixture({
        config: {
          agendaQueue: {
            options: {
              backend: 'mongodb',
              collection: 'agendaJobs'
            },
            jobs: {
              'history-job': {
                fnName: 'testservice.process',
                backend: 'mongodb',
                schedule: {
                  method: 'every',
                  intervalOrSchedule: '5 minutes'
                }
              }
            }
          }
        },
        collaborators: {
          testservice: {
            process: sinon.stub().resolves(undefined)
          }
        }
      });
      selectFixture(mockSails);

      const service = createQueue();
      const mongoAgenda = createAgendaStub({ attrs: { backend: 'mongodb' } });
      sinon.stub(service as any, 'createAgendaForBackend').withArgs('mongodb', sinon.match.any, sinon.match.any).resolves(mongoAgenda);

      await (service as any).handleReady();
    await service.activate();

      expect(mongoAgenda.every.calledOnceWithExactly('5 minutes', 'history-job', undefined, undefined)).to.equal(true);
    });

    it('rejects inline startup every schedules for SQS-backed jobs', async function () {
      const mockSails = createDomainFixture({
        config: {
          agendaQueue: {
            options: {
              backend: 'sqs',
              sqs: {
                queueUrl: 'http://localstack:4566/queue/jobs',
                region: 'ap-southeast-2'
              }
            },
            jobs: {
              'sqs-recurring-job': {
                fnName: 'testservice.process',
                schedule: {
                  method: 'every',
                  intervalOrSchedule: '5 minutes'
                }
              }
            }
          }
        },
        collaborators: {
          testservice: {
            process: sinon.stub().resolves(undefined)
          }
        }
      });
      selectFixture(mockSails);

      const service = createQueue();
      const sqsAgenda = createAgendaStub({ attrs: { backend: 'sqs' } });
      sinon.stub(service as any, 'createAgendaForBackend').withArgs('sqs', sinon.match.any, sinon.match.any).resolves(sqsAgenda);

      try {
        await (service as any).handleReady();
    await service.activate();
        throw new Error('Expected startup schedule validation to throw');
      } catch (error) {
        expect(error).to.be.instanceOf(AgendaQueueUnsupportedFeatureError);
        expect((error as Error).message).to.equal("AgendaQueue:: every() is not supported for SQS-backed job 'sqs-recurring-job'. Use an external scheduler for SQS-backed recurring jobs.");
      }
    });
  });
});
