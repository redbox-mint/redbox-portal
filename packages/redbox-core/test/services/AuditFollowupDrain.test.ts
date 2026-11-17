import {
  hasActiveHttpRequest,
  drainHttpRequests,
  retainHttpRequestFollowup,
} from '../../src/middleware/requestLifetime';
import { repositoryFixtures } from '../helpers/repositoryFixtures';
import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { AgendaQueue } from '../../src/queues/AgendaQueue';
import { Services as Records } from '../../src/services/RecordsService';
import { Services as Capture } from '../../src/services/SecurityEventService';
import { Services as Prisma } from '../../src/persistence/storage/PrismaAttachmentRepository';
import { StorageServiceResponse } from '../../src/StorageServiceResponse';
import * as runtime from '../../src/persistence/runtime';
import { createDomainFixture } from './testHelper';
import { createServer, get } from 'node:http';
import { runHttpRequestHandler } from '../../src/middleware/requestLifetime';

describe('Audit security follow-ups during drain', () => {
  afterEach(() => sinon.restore());
  function compose(owner: any, lookup: () => Promise<any>) {
    const queue = new AgendaQueue({
      owner,
      config: owner.config.agendaQueue,
      log: owner.log,
      handler: () => undefined,
      runAcceptedWork: operation => runtime.runAcceptedPersistenceWork(owner, operation),
      drainRequests: () => drainHttpRequests(owner),
      hasAcceptedRequest: () => hasActiveHttpRequest(owner),
    });
    const capture = new Capture.SecurityEventService({
      repository: {} as any,
      log: owner.log,
      brand: () => ({ id: 'brand', name: 'brand' }),
      configuration: () => ({ enabled: true }),
      enqueue: (name, data) => queue.now(name, data),
      record: lookup,
    });
    runtime.registerPersistenceResource(owner, 'queue', queue);
    runtime.registerPersistenceResource(owner, 'capture', capture);
    return { queue, capture };
  }
  function records(owner: any, capture: Capture.SecurityEventService, write: () => Promise<StorageServiceResponse>) {
    return new Records.Records({
      log: owner.log,
      config: {},
      storageService: { createRecordAudit: write },
      emitSecurityEvent: entry => capture.emitFromRecordAudit(entry),
      retainFollowup: work => retainHttpRequestFollowup(owner, work),
    } as any);
  }
  function stop(owner: any) {
    runtime.quiescePersistence(owner);
    return runtime.cleanupPersistence(owner);
  }
  function inspectIndexes() {
    sinon.stub(runtime, 'mongoDatabase').resolves({
      listCollections: () => ({ next: async () => ({ name: 'agendaJobs' }) }),
      collection: () => ({
        listIndexes: () => ({
          toArray: async () => [
            { name: 'findAndLockNextJobIndex', key: { name: 1, nextRunAt: 1, priority: -1, lockedAt: 1, disabled: 1 } },
            {
              name: 'name_1_disabled_1_lockedAt_1_nextRunAt_1',
              key: { name: 1, disabled: 1, lockedAt: 1, nextRunAt: 1 },
            },
            {
              name: 'name_-1_disabled_-1_lockedAt_-1_nextRunAt_-1',
              key: { name: -1, disabled: -1, lockedAt: -1, nextRunAt: -1 },
            },
          ],
        }),
      }),
    } as any);
  }
  for (const producer of ['record', 'attachment-prisma']) {

    for (const lookupFailure of [false, true]) {
      it(`retains the ${producer} producer through ${lookupFailure ? 'failed' : 'successful'} asynchronous security follow-up`, async () => {
        const app = createDomainFixture();
        app.config.agendaQueue = { options: { backend: 'mongodb' }, jobs: {} };
        let release!: () => void, enter!: () => void;
        const held = new Promise<void>(resolve => {
          release = resolve;
        });
        const started = new Promise<void>(resolve => {
          enter = resolve;
        });
        let primaryWrites = 0;
        const { queue, capture } = compose(app, async () => {
          enter();
          await held;
          if (lookupFailure) throw new Error('Synthetic brand lookup failure.');
          return { metaMetadata: { brandId: 'brand' } };
        });
        await runtime.initializePersistence(app);
        let worker: Promise<void>;
        const handlers = new Map<string, (job: unknown) => Promise<void>>();
        const agenda = {
          define: (name: string, handler: (job: unknown) => Promise<void>) => handlers.set(name, handler),
          on() {},
          start: async () => {},
          stop: sinon.stub().resolves(),
          drain: async () => {
            await worker;
            return { timedOut: false };
          },
          now: sinon.stub().resolves(),
        };
        inspectIndexes();
        sinon.stub(queue as any, 'createAgendaForBackend').resolves(agenda);
        await queue.initialize();
        await queue.activate();
        queue.defineJob('SecurityEventService-StoreSecurityEvent', {}, async () => {});
        const response = new StorageServiceResponse();
        response.success = true;
        const recordDomain = records(app, capture, async () => {
          primaryWrites++;
          return response;
        });
        const client = {
          orm: {
            attachmentaccessaudit: {
              create: async () => {
                primaryWrites++;
                return {};
              },
            },
          },
        } as unknown as import('../../src/persistence/prisma/client').CorePrismaClient;
        const attachments = new Prisma.PrismaAttachmentRepository(client, {
          log: app.log,
          emitAccessEvent: entry => capture.emitFromAttachmentAudit({ ...entry }),
          retainFollowup: work => retainHttpRequestFollowup(app, work),
        });
        queue.defineJob('producer', {}, async () => {
          if (producer === 'record')
            await recordDomain.storeRecordAudit({ attrs: { data: { redboxOid: 'record', action: 'updated' } } });
          else await attachments.recordAccess({ oid: 'record', action: 'list' });
        });
        worker = handlers.get('producer')!({ attrs: { name: 'producer' } });
        await started;
        let finished = false;
        const shutdown = stop(app).then(() => {
          finished = true;
        });
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
