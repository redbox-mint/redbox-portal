// Explicit retained Express adapter cases, removed with FM-043.
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

});
