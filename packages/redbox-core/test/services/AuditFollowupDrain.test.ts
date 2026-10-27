import { repositoryFixtures } from '../helpers/repositoryFixtures';
import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { Services as Queues } from '../../src/services/AgendaQueueService';
import { Services as Records } from '../../src/services/RecordsService';
import { Services as Capture } from '../../src/services/SecurityEventService';
import { Services as Prisma } from '../../src/persistence/storage/PrismaAttachmentRepository';
import { StorageServiceResponse } from '../../src/StorageServiceResponse';
import * as runtime from '../../src/persistence/runtime';
import { createMockSails } from './testHelper';
import express from 'express';
import { createServer, get } from 'node:http';
import { redboxSession } from '../../src/middleware/redboxSession';
import { runHttpRequestHandler } from '../../src/middleware/requestLifetime';

describe('Audit security follow-ups during drain', () => {
  const globals = ['sails', '_', 'AgendaQueueService', 'SecurityEventService', 'RecordsService', 'BrandingService', 'AppConfigService'];
  const originals = new Map<string, unknown>();
  beforeEach(() => { for (const name of globals) originals.set(name, Reflect.get(globalThis, name)); });
  afterEach(() => {
    for (const [name, value] of originals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name);
      else Reflect.set(globalThis, name, value);
    }
    sinon.restore();
  });
  for (const producer of ['record', 'attachment-prisma']) {
    for (const failure of ['none', 'lookup', 'enqueue']) {
    it(`returns the ${producer} HTTP response while retaining its optional security follow-up (${failure})`, async () => {
      const app = createMockSails();
      app.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: {} };
      let release!: () => void, enter!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const entered = new Promise<void>(resolve => { enter = resolve; });
      const capture = new Capture.SecurityEventService();
      const queue = new Queues.AgendaQueue();
      let primaryWrites = 0, primaryFinished = false;
      (Object.assign(repositoryFixtures, {AttachmentAccessAudit: { create: () => { primaryWrites++; return { fetch: async () => ({}) }; } }}), Object.assign(globalThis, {sails: app,_: require('lodash'),AgendaQueueService: queue,SecurityEventService: capture,RecordsService: { getMeta: async () => {
          enter(); await held;
          if (failure === 'lookup') throw new Error('Synthetic brand lookup failure.');
          return { metaMetadata: { brandId: 'brand' } };
        } },BrandingService: { getBrandById: () => ({ id: 'brand', name: 'brand' }), getBrand: () => undefined },AppConfigService: { getAppConfigurationForBrand: () => ({ siem: { enabled: true } }) }}));
      await runtime.initializePersistence(app);
      await capture.init();
      const web = express();
      web.use(redboxSession({ secret: 'audit-followup-fixture', cookie: { secure: false } }));
      const agenda = { define() {}, on() {}, start: async () => {}, stop: async () => {}, now: sinon.stub().resolves() };
      if (failure === 'enqueue') agenda.now.rejects(new Error('Synthetic enqueue failure.'));
      sinon.stub(runtime, 'mongoDatabase').resolves({ collection: () => ({ createIndex: async () => {} }) } as unknown as import('mongodb').Db);
      sinon.stub(queue as any, 'createAgendaForBackend').resolves(agenda);
      await (queue as any).handleReady();
      queue.defineJob('SecurityEventService-StoreSecurityEvent', {}, async () => {});
      const response = new StorageServiceResponse(); response.success = true;
      const records = new Records.Records();
      Reflect.set(records, 'storageService', { createRecordAudit: async () => { primaryWrites++; return response; } });
      const client = { orm: { attachmentaccessaudit: { create: async () => { primaryWrites++; return {}; } } } } as unknown as import('../../src/persistence/prisma/client').CorePrismaClient;
      const attachments = new Prisma.PrismaAttachmentRepository(client);
      sinon.stub(attachments as any, 'logger').get(() => app.log);
      web.get('/', async (req, res, next) => {
        try {
          await runHttpRequestHandler(req, () => producer === 'record'
            ? records.createRecordAudit({ redboxOid: 'record', action: 'updated' })
            : attachments.recordAccess({ oid: 'record', action: 'list' }));
          primaryFinished = true;
          res.end('ok');
        } catch (error) { next(error); }
      });
      const server = createServer(web);
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw Error('Missing fixture listener');
      const body = new Promise<string>((resolve, reject) => {
        get(`http://127.0.0.1:${address.port}/`, { agent: false }, incoming => {
          let text = ''; incoming.on('data', chunk => { text += chunk; });
          incoming.on('end', () => resolve(text)); incoming.on('error', reject);
        }).on('error', reject);
      });
      void body.catch(() => {});
      let shutdown: Promise<void> | undefined;
      try {
        await entered;
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.equal(primaryWrites, 1);
        assert.equal(primaryFinished, true, 'An optional SIEM lookup must not delay the HTTP response');
        assert.equal(await body, 'ok');
        let stopped = false;
        shutdown = new Promise<void>((resolve, reject) => app.config.beforeShutdown!((error?: unknown) => error ? reject(error) : resolve()))
          .then(() => { stopped = true; });
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.equal(stopped, false, 'Shutdown must retain the detached security follow-up');
        await assert.rejects(queue.now('SecurityEventService-StoreSecurityEvent'), /draining/);
        release();
        await shutdown;
        assert.equal(agenda.now.callCount, failure === 'lookup' ? 0 : 1, 'Only the accepted request may finish its enqueue');
        const diagnostic = failure === 'enqueue' ? 'Failed to enqueue security event'
          : producer === 'record' ? 'Failed to emit record audit security event' : 'SIEM attachment audit emit failed';
        const diagnostics = app.log.error.args.filter((args: unknown[]) => String(args[0]).includes(diagnostic));
        assert.equal(diagnostics.length, failure === 'none' ? 0 : 1, 'Optional failures must produce their bounded diagnostic');
        if (failure !== 'none') assert(!JSON.stringify(diagnostics).includes('Synthetic'), 'Optional diagnostics must not contain native messages');
      } finally {
        release();
        await body;
        if (shutdown) await shutdown;
        await runtime.cleanupPersistence(app);
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
    });
    }
    for (const lookupFailure of [false, true]) {
    it(`retains the ${producer} producer through ${lookupFailure ? 'failed' : 'successful'} asynchronous security follow-up`, async () => {
      const app = createMockSails();
      app.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: {} };
      let release!: () => void, enter!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const started = new Promise<void>(resolve => { enter = resolve; });
      const capture = new Capture.SecurityEventService();
      const queue = new Queues.AgendaQueue();
      let primaryWrites = 0;
      (Object.assign(repositoryFixtures, {AttachmentAccessAudit: { create: () => { primaryWrites++; return { fetch: async () => ({}) }; } }}), Object.assign(globalThis, {sails: app,_: require('lodash'),AgendaQueueService: queue,SecurityEventService: capture,RecordsService: { getMeta: async () => {
          enter(); await held;
          if (lookupFailure) throw new Error('Fixture brand lookup failed.');
          return { metaMetadata: { brandId: 'brand' } };
        } },BrandingService: { getBrandById: () => ({ id: 'brand', name: 'brand' }), getBrand: () => undefined },AppConfigService: { getAppConfigurationForBrand: () => ({ siem: { enabled: true } }) }}));
      await runtime.initializePersistence(app);
      await capture.init();
      let worker: Promise<void>;
      const handlers = new Map<string, (job: unknown) => Promise<void>>();
      const agenda = {
        define: (name: string, handler: (job: unknown) => Promise<void>) => handlers.set(name, handler),
        on() {}, start: async () => {}, stop: sinon.stub().resolves(),
        drain: async () => { await worker; return { timedOut: false }; },
        now: sinon.stub().resolves(),
      };
      sinon.stub(runtime, 'mongoDatabase').resolves({ collection: () => ({ createIndex: async () => {} }) } as unknown as import('mongodb').Db);
      sinon.stub(queue as any, 'createAgendaForBackend').resolves(agenda);
      await (queue as any).handleReady();
      queue.defineJob('SecurityEventService-StoreSecurityEvent', {}, async () => {});
      const response = new StorageServiceResponse(); response.success = true;
      const records = new Records.Records();
      Reflect.set(records, 'storageService', { createRecordAudit: async () => { primaryWrites++; return response; } });
      const client = { orm: { attachmentaccessaudit: { create: async () => { primaryWrites++; return {}; } } } } as unknown as import('../../src/persistence/prisma/client').CorePrismaClient;
      const attachments = new Prisma.PrismaAttachmentRepository(client);
      queue.defineJob('producer', {}, async () => {
        if (producer === 'record') await records.storeRecordAudit({ attrs: { data: { redboxOid: 'record', action: 'updated' } } });
        else await attachments.recordAccess({ oid: 'record', action: 'list' });
      });
      worker = handlers.get('producer')!({ attrs: { name: 'producer' } });
      await started;
      let finished = false;
      const shutdown = new Promise<void>((resolve, reject) => app.config.beforeShutdown!((error?: unknown) => error ? reject(error) : resolve()))
        .then(() => { finished = true; });
      try {
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.equal(finished, false, 'The accepted audit must own its security follow-up');
        release();
        await worker;
        await shutdown;
        assert.equal(primaryWrites, 1);
        assert.equal(agenda.now.callCount, lookupFailure ? 0 : 1);
        if (!lookupFailure) assert.equal(agenda.now.firstCall.args[0], 'SecurityEventService-StoreSecurityEvent');
      } finally {
        release();
        await worker;
        await shutdown;
        await runtime.cleanupPersistence(app);
      }
    });
    }
  }
});
