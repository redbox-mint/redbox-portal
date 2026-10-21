import { AdversarialPublicationAdapter } from '../fixtures/adversarialPublication';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MongoClient } from 'mongodb';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import {
  PublicationPublishing,
  IntegrationAuditParams,
  PublicationProviderRegistry,
  PublicationSyncStore,
  PublicationResourceStore,
  PublicationStaging,
  PublicationExecution,
  PublicationStoreConflict,
  PublicationLeaseLost,
  PublicationStopped,
  publicationContentRecord,
  publicationDigest,
  publicationOperationEvidence,
  publicationRecordDigest,
  byteDigest,
  sealPublicationSource,
  runPublicationWorker,
  importPublicationIntents,
  dispatchPublications,
  verifyPublicationInputs,
  type PublicationObject,
  type PublicationProvider,
  type PublicationProviderExecution,
  type PublicationProviderOutcome,
  type PublicationOperation,
  type PublicationApproval,
  type PublicationWorkKey,
  type PublicationDispatcherRuntime,
  type PublicationProviderSourceInputs,
  type PublicationSnapshot,
} from '@researchdatabox/redbox-core';
import { isPublicationObject } from '@researchdatabox/redbox-core/dist/services/publication/builtins.js';
import { Services } from '../../src/services/MongoStorageService';
import { Services as AuditServices } from '@researchdatabox/redbox-core/dist/services/IntegrationAuditService.js';
import { Services as PublicationServices } from '@researchdatabox/redbox-core/dist/services/PublicationService.js';
import {
  publicationLiveSummaries,
  publicationOperationalSignals,
} from '@researchdatabox/redbox-core/dist/services/publication/status.js';
import { publicationAuditEntries } from '@researchdatabox/redbox-core/dist/services/publication/audit.js';
import { publicationSource } from '../../src/services/publicationSourcePersistence';
import { storage } from '../../src/config/storage';

if (process.env.CI && !process.env.MONGO_TEST_URL)
  throw new Error('CI requires MONGO_TEST_URL for PUB-08 worker acceptance');
const describeMongo = process.env.MONGO_TEST_URL ? describe : describe.skip;
type Context = PublicationProviderExecution<PublicationObject, PublicationObject, PublicationObject>;
type Outcome = PublicationProviderOutcome<PublicationObject>;
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
describeMongo('Shared publication dispatch and worker (PUB-08, real Mongo)', function () {
  this.timeout(30000);
  const database = `publication_worker_${randomUUID().replaceAll('-', '')}`;
  const key: PublicationWorkKey = { brandId: 'brand', oid: 'record', destinationId: 'archive' };
  const brand = { id: 'brand', name: 'brand', css: '', roles: [] };
  const globals = new Map<string, unknown>();
  let client: MongoClient;
  let mongo: Services.MongoStorageService;
  let config: PublicationPublishing;
  let runtime: PublicationDispatcherRuntime;
  let directory: string;
  let staging: PublicationStaging;
  let priorStorage: unknown;
  let clock: number;
  let access: boolean;
  let sends: number;
  let reconciles: number;
  let execute: (context: Context) => Promise<Outcome>;
  let reconcile: (context: Context) => Promise<Outcome>;
  let deliveries: Array<{ name: string; key: PublicationWorkKey }>;
  let failures: string[];
  let inputs: PublicationProviderSourceInputs;
  const objectResult = (value: unknown) =>
    isPublicationObject(value)
      ? { valid: true as const, value }
      : { valid: false as const, issues: [{ path: '', code: 'object', message: 'Object required' }] };
  let adversary: AdversarialPublicationAdapter;
  const provider: PublicationProvider<PublicationObject, PublicationObject, PublicationObject> = {
    id: 'ledger',
    contractVersion: 2,
    stateVersion: 1,
    configurationSchema: {},
    secretPaths: ['connection.token'],
    mutationRecovery: { mode: 'idempotency-key' },
    capabilities: { synchronise: true, observe: true, reconcile: true, resourceLeases: true },
    validateConfiguration: objectResult,
    targetFingerprint: () => 'verified-target',
    decodeState: value =>
      isPublicationObject(value) && value.invalidState === true
        ? { valid: false, issues: [{ path: '', code: 'invalid-state', message: 'Fixture rejected state' }] }
        : objectResult(value),
    upgradeState: objectResult,
    decodePreparedSource: objectResult,
    prepareSource: async input => ({ valid: true, value: { record: input.record, generated: input.generatedValues } }),
    describeSource: async () => inputs,
    synchronise: context => execute(context),
    observe: context => execute(context),
    reconcile: async context => {
      reconciles++;
      return reconcile(context);
    },
    repairs: [],
  };
  function operation(context: Context, id = randomUUID()): PublicationOperation {
    return {
      id,
      kind: 'deposit',
      approvalId: context.approval.id,
      approvalEpoch: context.approval.epoch,
      sourceGeneration: context.sourceGeneration,
      intendedDigest: 'desired',
      submittedAt: new Date(clock).toISOString(),
      outcome: 'submitted',
      evidence: { expectedHead: 'v1' },
    };
  }
  async function journalReceipt(context: Context | PublicationExecution, op: PublicationOperation) {
    const work = context instanceof PublicationExecution ? context.state : await runtime.store.get(context);
    assert.ok(work);
    return context.journal({
      ...op,
      ...(['confirmed', 'not_applied', 'rejected'].includes(op.outcome)
        ? { confirmation: publicationOperationEvidence(work, op, work.binding) }
        : {}),
    });
  }
  const waiting = (context: Context): Outcome => ({
    kind: 'waiting',
    state: context.state,
    reason: 'manual',
    nextCheckAt: clock + 50,
  });
  async function completed(context: Context): Promise<Outcome> {
    const remote = { namespace: 'ledger://actual', objectId: `${context.oid}-${context.destinationId}` };
    await context.bind({ ...remote, targetFingerprint: 'verified-target', evidence: { verified: true } });
    const row = await runtime.store.get(context);
    assert.ok(row);
    return {
      kind: 'completed',
      state: { deposited: true },
      evidence: {
        approvalId: context.approval.id,
        approvalEpoch: context.approval.epoch,
        sourceGeneration: context.sourceGeneration,
        sourceDigest: row.sourceDigest,
        operations: row.operations
          .filter(op => op.outcome === 'confirmed')
          .map(op => publicationOperationEvidence(row, op, remote)),
        confirmedAt: new Date(clock).toISOString(),
        remote,
        deposit: { version: 'v2' },
        ingestion: { state: 'not_required', evidence: {} },
        visibility: 'unverified',
      },
      links: { public: `https://ledger.example/${remote.objectId}` },
    };
  }
  async function deposit(context: Context): Promise<Outcome> {
    const op = operation(context);
    await context.mutate(op, async () => {
      sends++;
    });
    await journalReceipt(context, { ...op, outcome: 'confirmed', evidence: { actualHead: 'v2' } });
    await context.checkpoint({ deposited: true }, [op.id]);
    return completed(context);
  }
  before(async () => {
    client = new MongoClient(process.env.MONGO_TEST_URL!);
    await client.connect();
    const db = client.db(database);
    await db.createCollection('record');
    for (const name of [
      'Record',
      'DeletedRecord',
      'RecordAudit',
      'IntegrationAudit',
      'RecordSchemaArtifact',
      'RecordSchemaReference',
    ]) {
      globals.set(name, Reflect.get(globalThis, name));
      Reflect.set(globalThis, name, {
        tableName: name.toLowerCase(),
        getDatastore: () => ({ manager: db }),
        findOne: (criteria: Record<string, unknown>) => db.collection(name.toLowerCase()).findOne(criteria),
      });
    }
    const sails = Reflect.get(globalThis, 'sails');
    priorStorage = sails.config.storage;
    sails.config.storage = storage;
    mongo = new Services.MongoStorageService();
    await mongo.init();
    directory = await mkdtemp(join(tmpdir(), 'pub08-worker-'));
    staging = new PublicationStaging('durable', new Disk(new FSDriver({ location: directory, visibility: 'private' })));
  });
  after(async () => {
    for (const [name, value] of globals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name);
      else Reflect.set(globalThis, name, value);
    }
    Reflect.get(globalThis, 'sails').config.storage = priorStorage;
    await client.db(database).dropDatabase();
    await client.close();
    await rm(directory, { recursive: true, force: true });
  });
  beforeEach(async () => {
    for (const name of [
      'record',
      'recordidentity',
      'deletedrecord',
      'publicationsync',
      'publicationdestination',
      'publicationresourcelease',
      'integrationaudit',
    ])
      await client.db(database).collection(name).deleteMany({});
    clock = Date.now();
    access = true;
    sends = 0;
    reconciles = 0;
    deliveries = [];
    failures = [];
    inputs = {
      mappingContextVersion: 1,
      managedFields: [],
      relatedInputs: {},
      attachments: [],
      resolveCrosswalk: async () => {
        throw new Error('No crosswalk');
      },
    };
    config = new PublicationPublishing();
    config.processing = {
      ...config.processing,
      enabled: true,
      serviceUsername: 'worker',
      stagingDisk: 'durable',
      coalesceMs: 0,
      heartbeatMs: 10000,
      leaseMs: 30000,
      retryBaseMs: 10,
      observationMs: 50,
    };
    const destination = {
      provider: 'ledger',
      displayName: 'Ledger',
      enabled: true,
      archived: false,
      connection: { token: 'private' },
      mapping: {},
      attachments: {},
      writeBack: {},
      providerOptions: {},
    };
    config.destinations = { archive: structuredClone(destination), repository: structuredClone(destination) };
    config.sourcePolicies = [
      {
        id: 'approve',
        version: 1,
        mode: 'approval',
        recordType: 'dataPublication',
        event: 'onTransition',
        destinations: ['archive', 'repository'],
      },
    ];
    const registry = new PublicationProviderRegistry();
    adversary = new AdversarialPublicationAdapter(provider);
    registry.register(adversary.provider);
    registry.freeze();
    const store = new PublicationSyncStore(client.db(database), () => clock);
    const resources = new PublicationResourceStore(client.db(database), () => clock);
    await store.ensureIndexes();
    await resources.ensureIndexes();
    runtime = {
      storage: mongo,
      store,
      resources,
      registry,
      now: () => clock,
      random: () => 0,
      configuration: async () => config,
      brands: async () => ['brand'],
      staging: () => staging,
      assertAccess: async () => {
        if (!access) throw new PublicationStopped('revoked', 'service_access_denied');
      },
      verifyInputs: (work, record, source, approval, configuration) =>
        verifyPublicationInputs(runtime, work, record, source, approval, configuration),
      enqueue: async (name, work) => {
        deliveries.push({ name, key: work });
      },
      report: category => {
        failures.push(category);
      },
    };
    execute = deposit;
    reconcile = async context => {
      for (const op of context.operations.filter(op => ['submitted', 'uncertain'].includes(op.outcome)))
        await journalReceipt(context, { ...op, outcome: 'confirmed', evidence: { reconciled: true } });
      await context.checkpoint(
        context.state,
        context.operations.filter(op => ['submitted', 'uncertain', 'confirmed'].includes(op.outcome)).map(op => op.id)
      );
      return waiting(context);
    };
  });
  for (const action of ['synchronise', 'observe', 'reconcile'] as const)
    it(`honest ${action} awaits resource work and reuses local objects across checkpoints`, async () => {
      await imported();
      const resourceKey = { providerId: 'ledger', namespace: 'ledger://actual', resourceKey: 'honest-async' };
      if (action === 'reconcile') {
        execute = context =>
          context.withResourceLease(resourceKey.namespace, resourceKey.resourceKey, async () => {
            await context.mutate(operation(context), async () => {
              sends++;
            });
            return waiting(context);
          });
        await run();
      } else if (action === 'observe') {
        execute = async context => waiting(context);
        await run();
      }
      const before = await row();
      adversary.execute = async context => {
        assert.equal(context.recovery, action === 'reconcile');
        assert.equal(context.workKind, action === 'observe' ? 'observe' : 'synchronise');
        const state = { progress: { phase: 'read' } };
        await context.withResourceLease(resourceKey.namespace, resourceKey.resourceKey, async () => {
          // Yield to real async work while the invocation remains open.
          await new Promise<void>(resolve => setImmediate(resolve));
          await context.assertAuthority();
          await context.checkpoint(state);
          state.progress.phase = 'verified';
          assert.deepEqual((await row()).providerState, { progress: { phase: 'read' } });
          const operations = [...context.operations];
          if (action === 'synchronise') {
            const op = operation(context);
            await context.mutate(op, async () => {
              await new Promise<void>(resolve => setImmediate(resolve));
              sends++;
            });
            operations.push(op);
          }
          for (const op of operations)
            await journalReceipt(context, { ...op, outcome: 'confirmed', evidence: { verified: true } });
          await context.checkpoint(
            state,
            operations.map(op => op.id)
          );
          state.progress.phase = 'returned';
          assert.deepEqual((await row()).providerState, { progress: { phase: 'verified' } });
          await context.audit({ category: 'honest-async', message: 'Awaited work completed' });
        });
        return { ...waiting(context), state };
      };
      await runtime.store.request(key, action === 'observe' ? 'observe' : 'synchronise', before.revision, clock);
      await run();
      const saved = await row();
      assert.equal(saved.status, 'waiting');
      assert.equal(saved.waitingReason, 'manual');
      assert.deepEqual(saved.providerState, { progress: { phase: 'returned' } });
      assert.equal(sends, action === 'observe' ? 0 : 1);
      assert.equal(saved.operations.length, action === 'observe' ? 0 : 1);
      for (const op of saved.operations) {
        assert.equal(op.outcome, 'confirmed');
        assert.equal(op.checkpointed, true);
      }
      assert.equal(
        saved.audit?.summaries?.some(summary => summary.category === 'honest-async'),
        true
      );
      assert.equal(saved.completion, undefined);
      assert.equal(saved.lease, null);
      assert.equal((await runtime.resources.get(resourceKey))?.lease, null);
    });
  for (const action of ['synchronise', 'observe', 'reconcile'] as const) {
    it(`adversary cannot start callbacks while draining returned ${action}`, async () => {
      await imported();
      if (action === 'reconcile') {
        execute = async context => {
          await context.mutate(operation(context), async () => {
            sends++;
          });
          return waiting(context);
        };
        await run();
      }
      const before = await row();
      const release = deferred();
      const entered = deferred();
      adversary.execute = async context => {
        const outstanding = context.withResourceLease('ledger://actual', 'index', async () => {
          entered.resolve();
          await release.promise;
        });
        void outstanding.catch(() => {});
        await entered.promise;
        adversary.later(async () => {
          try {
            await adversary.callbacks(context, operation(context));
          } finally {
            release.resolve();
          }
        });
        return waiting(context);
      };
      await runtime.store.request(key, action === 'observe' ? 'observe' : 'synchronise', before.revision, clock);
      await run();
      await adversary.flush();
      const saved = await row();
      assert.deepEqual(adversary.accepted, [], 'No new callback may enter after the adapter returns');
      assert.equal(adversary.refused.length, 11);
      assert.deepEqual(saved.providerState, before.providerState);
      assert.deepEqual(saved.operations, before.operations);
      assert.equal(saved.completion, undefined);
      assert.equal(saved.work[action === 'observe' ? 'observe' : 'synchronise'].processed, 0);
      assert.equal(saved.lease, null);
      assert.equal(sends, action === 'reconcile' ? 1 : 0);
    });
    it(`adversary cannot rewrite a returned ${action} outcome during host validation`, async () => {
      await imported();
      if (action === 'reconcile') {
        execute = async context => {
          await context.mutate(operation(context), async () => {
            sends++;
          });
          return waiting(context);
        };
        await run();
      }
      const before = await row();
      let returned = false;
      const changed = deferred();
      const assertAccess = runtime.assertAccess;
      runtime.assertAccess = async (...args) => {
        await assertAccess(...args);
        if (returned) await changed.promise;
      };
      adversary.execute = async context => {
        const outcome = waiting(context);
        adversary.later(async () => {
          outcome.state.escaped = true;
          changed.resolve();
        });
        returned = true;
        return outcome;
      };
      await runtime.store.request(key, action === 'observe' ? 'observe' : 'synchronise', before.revision, clock);
      await run();
      await adversary.flush();
      const saved = await row();
      assert.deepEqual(saved.providerState, before.providerState, 'Returned JSON belongs to the host after return');
      assert.deepEqual(saved.operations, before.operations);
      assert.equal(saved.completion, undefined);
      assert.equal(saved.lease, null);
    });
  }

  it('preparation cannot alter host configuration, source, attribution or generated values by reference', async () => {
    await imported();
    const before = await row();
    const input = {
      ...key,
      configuration: config.destinations.archive,
      record: { metadata: { title: 'approved' } },
      requester: { username: 'requester', userType: 'local' },
      approver: { username: 'approver', userType: 'local' },
      generatedValues: { timestamp: 'approved' },
    };
    const original = structuredClone(input);
    adversary.prepare = async value => {
      value.configuration.mapping = { escaped: true };
      value.record.escaped = true;
      value.approver.username = 'foreign';
      value.requester.username = 'foreign';
      value.generatedValues.timestamp = 'foreign';
      return { valid: true, value: { safe: true } };
    };
    const registered = runtime.registry.get('ledger');
    assert.ok(registered?.prepareSource);
    await registered.prepareSource(input);
    await adversary.flush();
    assert.deepEqual(input, original);
    assert.deepEqual(await row(), before);
  });

  for (const action of ['synchronise', 'observe', 'reconcile'] as const)
    for (const field of ['operationId', 'oid', 'brandId', 'destinationId'] as const)
      it(`malicious ${action} swallows foreign ${field} evidence then attacks every callback`, async () => {
        await imported();
        execute = async context => {
          const op = operation(context);
          await context.mutate(op, async () => {
            sends++;
          });
          if (action !== 'reconcile') {
            await journalReceipt(context, { ...op, outcome: 'confirmed' });
            await context.checkpoint({ retained: true }, [op.id]);
          }
          return waiting(context);
        };
        await run();
        const before = await row();
        adversary.execute = async context => {
          const op = context.operations[0];
          const confirmation = publicationOperationEvidence(before, op);
          confirmation[field] += '-foreign';
          await adversary.swallow('foreign-evidence', () =>
            context.journal({ ...op, outcome: 'confirmed', confirmation })
          );
          await adversary.callbacks(context, op);
          context.state.escaped = true;
          context.approval.epoch++;
          context.source.brandId = 'foreign';
          context.operations[0].checkpointed = true;
          adversary.later(() => adversary.callbacks(context, op));
          return { kind: 'waiting', state: context.state, reason: 'ignored-refusal' };
        };
        await runtime.store.request(key, action === 'observe' ? 'observe' : 'synchronise', before.revision, clock);
        await run();
        await adversary.flush();
        const saved = await row();
        assert.deepEqual(adversary.accepted, []);
        assert.equal(adversary.refused.length, 23);
        assert.equal(saved.status, 'repair_required');
        assert.deepEqual(saved.providerState, before.providerState);
        assert.deepEqual(saved.operations, before.operations);
        assert.deepEqual(saved.binding, before.binding);
        assert.equal(saved.completion, undefined);
        assert.equal(saved.work[action === 'observe' ? 'observe' : 'synchronise'].processed, 0);
        assert.equal(saved.operationEvidenceFailures?.at(-1)?.field, field);
        assert.equal(
          saved.audit?.summaries?.some(summary => summary.category === 'escaped'),
          false
        );
        assert.equal(saved.lease, null);
        assert.equal(sends, 1);
      });

  for (const action of ['synchronise', 'observe', 'reconcile'] as const)
    it(`pending ${action} checkpoint is fenced by a retained-context refusal after return`, async () => {
      await imported();
      if (action === 'reconcile') {
        execute = async context => {
          await context.mutate(operation(context), async () => {
            sends++;
          });
          return waiting(context);
        };
        await run();
      }
      const before = await row();
      adversary.execute = async context => {
        const entered = deferred();
        const release = deferred();
        const assertAccess = runtime.assertAccess;
        let held = false;
        runtime.assertAccess = async (...args) => {
          await assertAccess(...args);
          if (!held) {
            held = true;
            entered.resolve();
            await release.promise;
          }
        };
        const checkpoint = context.checkpoint({ escaped: true });
        void checkpoint.catch(() => {});
        await entered.promise;
        adversary.later(async () => {
          await adversary.swallow('late-key', () => context.idempotencyKey(operation(context)));
          release.resolve();
          await adversary.swallow('checkpoint', () => checkpoint);
        });
        return waiting(context);
      };
      await runtime.store.request(key, action === 'observe' ? 'observe' : 'synchronise', before.revision, clock);
      await run();
      await adversary.flush();
      const saved = await row();
      assert.deepEqual(adversary.accepted, []);
      assert.equal(saved.status, 'repair_required');
      assert.deepEqual(saved.providerState, before.providerState);
      assert.deepEqual(saved.operations, before.operations);
      assert.equal(saved.completion, undefined);
      assert.equal(saved.lease, null);
      assert.equal(sends, action === 'reconcile' ? 1 : 0);
    });

  for (const action of ['synchronise', 'observe', 'reconcile'] as const)
    it(`pending ${action} checkpoint is fenced by a caught resource-busy refusal`, async () => {
      await imported();
      if (action === 'reconcile') {
        execute = async context => {
          await context.mutate(operation(context), async () => {
            sends++;
          });
          return waiting(context);
        };
        await run();
      }
      const before = await row();
      const resourceKey = { providerId: 'ledger', namespace: 'ledger://actual', resourceKey: 'index' };
      const busy = await runtime.resources.claim(resourceKey, 'brand', 'other-owner', 60000);
      assert.ok(busy?.lease);
      adversary.execute = async context => {
        const entered = deferred();
        const release = deferred();
        const assertAccess = runtime.assertAccess;
        let held = false;
        runtime.assertAccess = async (...args) => {
          await assertAccess(...args);
          if (!held) {
            held = true;
            entered.resolve();
            await release.promise;
          }
        };
        const checkpoint = context.checkpoint({ escaped: true });
        await entered.promise;
        await adversary.swallow('resource', () =>
          context.withResourceLease('ledger://actual', 'index', async () => {})
        );
        release.resolve();
        await adversary.swallow('checkpoint', () => checkpoint);
        return { kind: 'waiting', state: { escaped: true }, reason: 'swallowed-refusal' };
      };
      try {
        await runtime.store.request(key, action === 'observe' ? 'observe' : 'synchronise', before.revision, clock);
        await run();
      } finally {
        await runtime.resources.release(resourceKey, 'brand', busy.lease, busy.revision);
      }
      const saved = await row();
      assert.deepEqual(adversary.accepted, []);
      assert.equal(saved.status, 'waiting');
      assert.equal(saved.waitingReason, 'resource_busy');
      assert.deepEqual(saved.providerState, before.providerState);
      assert.deepEqual(saved.operations, before.operations);
      assert.equal(saved.work[action === 'observe' ? 'observe' : 'synchronise'].processed, 0);
      assert.equal(saved.completion, undefined);
      assert.equal(saved.lease, null);
      assert.equal(sends, action === 'reconcile' ? 1 : 0);
    });

  for (const action of ['synchronise', 'observe', 'reconcile'] as const)
    it(`host retries a failed ${action} datastore callback without accepting swallowed state`, async () => {
      await imported();
      if (action === 'reconcile') {
        execute = async context => {
          await context.mutate(operation(context), async () => {
            sends++;
          });
          return waiting(context);
        };
        await run();
      }
      const before = await row();
      adversary.execute = async context => {
        const checkpoint = runtime.store.checkpointProviderState;
        runtime.store.checkpointProviderState = async () => {
          throw new Error('Datastore unavailable before checkpoint');
        };
        try {
          await adversary.swallow('failed-checkpoint', () => context.checkpoint({ escaped: true }));
        } finally {
          runtime.store.checkpointProviderState = checkpoint;
        }
        await adversary.callbacks(context, operation(context));
        adversary.later(() => adversary.callbacks(context, operation(context)));
        return { kind: 'waiting', state: { escaped: true }, reason: 'swallowed-datastore-error' };
      };
      await runtime.store.request(key, action === 'observe' ? 'observe' : 'synchronise', before.revision, clock);
      await run();
      await adversary.flush();
      const saved = await row();
      assert.deepEqual(adversary.accepted, []);
      assert.equal(saved.status, 'retrying');
      assert.deepEqual(saved.providerState, before.providerState);
      assert.deepEqual(saved.operations, before.operations);
      assert.equal(saved.work[action === 'observe' ? 'observe' : 'synchronise'].processed, 0);
      assert.equal(saved.completion, undefined);
      assert.equal(saved.lease, null);
      assert.equal(sends, action === 'reconcile' ? 1 : 0);
    });

  for (const action of ['synchronise', 'observe', 'reconcile'] as const)
    it(`pending ${action} checkpoint and audit cannot persist after a concurrent refusal`, async () => {
      await imported();
      if (action === 'reconcile') {
        execute = async context => {
          await context.mutate(operation(context), async () => {
            sends++;
          });
          return waiting(context);
        };
        await run();
      }
      const before = await row();
      adversary.execute = async context => {
        const entered = deferred();
        const release = deferred();
        const assertAccess = runtime.assertAccess;
        let held = false;
        runtime.assertAccess = async (...args) => {
          await assertAccess(...args);
          if (!held) {
            held = true;
            entered.resolve();
            await release.promise;
          }
        };
        const checkpoint = context.checkpoint({ escaped: true });
        await entered.promise;
        const audit = context.audit({ category: 'escaped', message: 'Queued after pending checkpoint' });
        await adversary.swallow('refuse-key', () =>
          context.idempotencyKey({ ...operation(context), idempotencyKey: 'malformed' })
        );
        release.resolve();
        await adversary.swallow('checkpoint', () => checkpoint);
        await adversary.swallow('audit', () => audit);
        return waiting(context);
      };
      await runtime.store.request(key, action === 'observe' ? 'observe' : 'synchronise', before.revision, clock);
      await run();
      const saved = await row();
      assert.deepEqual(adversary.accepted, []);
      assert.equal(saved.status, 'repair_required');
      assert.deepEqual(saved.providerState, before.providerState);
      assert.deepEqual(saved.operations, before.operations);
      assert.equal(
        saved.audit?.summaries?.some(summary => summary.category === 'escaped'),
        false
      );
      assert.equal(saved.completion, undefined);
      assert.equal(saved.lease, null);
      assert.equal(sends, action === 'reconcile' ? 1 : 0);
    });

  it('snapshots binding and audit arguments before their asynchronous writes', async () => {
    await imported();
    adversary.execute = async context => {
      const binding = {
        namespace: 'ledger://actual',
        objectId: 'owned',
        targetFingerprint: 'verified-target',
        evidence: { receipt: 'owned' },
      };
      const bound = context.bind(binding);
      binding.objectId = 'foreign';
      binding.evidence.receipt = 'foreign';
      await bound;
      const summary = { category: 'owned', message: 'Original summary' };
      const audited = context.audit(summary);
      summary.category = 'escaped';
      await audited;
      return waiting(context);
    };
    await run();
    const saved = await row();
    assert.equal(saved.binding?.objectId, 'owned');
    assert.deepEqual(saved.binding?.evidence, { receipt: 'owned' });
    assert.equal(
      saved.audit?.summaries?.some(summary => summary.category === 'owned'),
      true
    );
    assert.equal(
      saved.audit?.summaries?.some(summary => summary.category === 'escaped'),
      false
    );
    assert.equal(saved.completion, undefined);
  });

  for (const refusal of [
    'proof',
    'identity',
    'immutable-evidence',
    'unknown-operation',
    'unknown-checkpoint',
    'binding',
    'authority',
    'idempotency-key',
    'projection',
    'attachment',
    'invalid-state',
    'resource-identity',
  ] as const)
    for (const action of ['synchronise', 'observe', 'reconcile'] as const)
      for (const checkpoint of [false, true])
        it(`fences a caught ${action} ${refusal} refusal before ${checkpoint ? 'checkpoint and outcome' : 'outcome'}`, async () => {
          await imported();
          execute = async context => {
            const op = operation(context);
            await context.mutate(op, async () => {
              sends++;
            });
            if (action !== 'reconcile') {
              await journalReceipt(context, { ...op, outcome: 'confirmed' });
              await context.checkpoint({ retained: true }, [op.id]);
            }
            return waiting(context);
          };
          await run();
          const before = await row();
          const fault = async (context: Context): Promise<Outcome> => {
            const op = context.operations[0];
            const errors = {
              proof: /publication_operation_evidence_mismatch/,
              identity: /identity cannot change/,
              'immutable-evidence': /evidence cannot be overwritten/,
              'unknown-operation': /Only mutate/,
              'unknown-checkpoint': /Only confirmed/,
              binding: /binding target mismatch/,
              authority: /service_access_denied/,
              'idempotency-key': /Invalid host publication idempotency key/,
              projection: action === 'reconcile' ? /reconciliation_is_read_only/ : /Unregistered publication output/,
              attachment: /outside the approved publication selection/,
              'invalid-state': /Invalid publication provider state/,
              'resource-identity': /Canonical publication resource identity/,
            };
            const rejected = async () => {
              if (refusal === 'resource-identity') return context.withResourceLease('', 'index', async () => {});
              if (refusal === 'invalid-state') return context.checkpoint({ invalidState: true });
              if (refusal === 'projection') return context.project({ 'metadata.unregistered': true });
              if (refusal === 'attachment') {
                await context.openAttachment('unapproved', 'file');
                return;
              }
              if (refusal === 'unknown-checkpoint') return context.checkpoint({ rejected: true }, ['unknown']);
              if (refusal === 'binding')
                return context.bind({
                  namespace: 'ledger://actual',
                  objectId: 'object',
                  targetFingerprint: 'other-target',
                  evidence: {},
                });
              if (refusal === 'authority') {
                access = false;
                try {
                  return await context.assertAuthority();
                } finally {
                  access = true;
                }
              }
              if (refusal === 'idempotency-key') {
                context.idempotencyKey({ ...op, idempotencyKey: 'invalid' });
                return;
              }
              return context.journal({
                ...op,
                ...(refusal === 'proof'
                  ? {
                      outcome: 'confirmed' as const,
                      confirmation: { ...publicationOperationEvidence(before, op), intendedDigest: 'wrong' },
                    }
                  : {}),
                ...(refusal === 'identity' ? { intendedDigest: 'rewritten' } : {}),
                ...(refusal === 'immutable-evidence'
                  ? { evidence: { ...op.evidence, expectedHead: 'rewritten' } }
                  : {}),
                ...(refusal === 'unknown-operation' ? { id: 'invented' } : {}),
              });
            };
            await assert.rejects(rejected(), errors[refusal]);
            if (checkpoint) await assert.rejects(context.checkpoint({ acceptedDespiteFailure: true }), errors[refusal]);
            return { kind: 'waiting', state: { acceptedDespiteFailure: true }, reason: 'ignored-refusal' };
          };
          execute = fault;
          reconcile = fault;
          await runtime.store.request(key, action === 'observe' ? 'observe' : 'synchronise', before.revision, clock);
          await run();
          const saved = await row();
          assert.deepEqual(saved.providerState, before.providerState);
          assert.deepEqual(saved.operations, before.operations);
          assert.equal(
            saved.status,
            refusal === 'authority' || (refusal === 'projection' && action === 'reconcile')
              ? 'revoked'
              : 'repair_required'
          );
          if (refusal === 'proof') {
            assert.match(saved.waitingReason!, /publication_operation_evidence_mismatch/);
            assert.equal(saved.operationEvidenceFailures?.length, 1);
          }
          assert.equal(saved.completion, undefined);
          assert.equal(sends, 1);
        });
  for (const awaited of [false, true])
    for (const action of ['synchronise', 'observe', 'reconcile'] as const)
      it(`retains a caught ${action} resource-owner refusal with ${awaited ? 'awaited' : 'pending'} callbacks`, async () => {
        await imported();
        execute = context =>
          context.withResourceLease('repository://verdict', 'index', async () => {
            const op = operation(context);
            await context.mutate(op, async () => {
              sends++;
            });
            if (action !== 'reconcile') {
              await journalReceipt(context, { ...op, outcome: 'confirmed' });
              await context.checkpoint(context.state, [op.id]);
            }
            return waiting(context);
          });
        await run();
        const before = await row();
        const fault = async (context: Context): Promise<Outcome> => {
          const pending = context.withResourceLease('repository://verdict', 'index', async resource => {
            const journal = runtime.resources.journal;
            runtime.resources.journal = async () => {
              throw new PublicationLeaseLost();
            };
            try {
              const op = context.operations[0];
              await assert.rejects(
                resource.journal({
                  ...op,
                  outcome: 'confirmed',
                  confirmation: publicationOperationEvidence(before, op),
                }),
                /ownership expired/
              );
            } finally {
              runtime.resources.journal = journal;
            }
            await assert.rejects(context.checkpoint({ acceptedDespiteFailure: true }), /ownership expired/);
          });
          if (awaited) await pending;
          else void pending.catch(() => {});
          return { kind: 'waiting', state: { acceptedDespiteFailure: true }, reason: 'ignored-refusal' };
        };
        execute = fault;
        reconcile = fault;
        await runtime.store.request(key, action === 'observe' ? 'observe' : 'synchronise', before.revision, clock);
        await run();
        const saved = await row();
        assert.deepEqual(saved.providerState, before.providerState);
        assert.deepEqual(saved.operations, before.operations);
        assert.equal(saved.completion, undefined);
        assert.equal(sends, 1);
      });
  for (const action of ['observe', 'reconcile'] as const)
    it(`retains a caught read-only ${action} mutation refusal`, async () => {
      await imported();
      execute = async context => {
        const op = operation(context);
        await context.mutate(op, async () => {
          sends++;
        });
        if (action === 'observe') {
          await journalReceipt(context, { ...op, outcome: 'confirmed' });
          await context.checkpoint(context.state, [op.id]);
        }
        return waiting(context);
      };
      await run();
      const before = await row();
      const refused = action === 'reconcile' ? /reconciliation_is_read_only/ : /observation_is_read_only/;
      const fault = async (context: Context): Promise<Outcome> => {
        await assert.rejects(
          async () =>
            context.mutate(operation(context), async () => {
              sends++;
            }),
          refused
        );
        await assert.rejects(context.checkpoint({ acceptedDespiteFailure: true }), refused);
        return { kind: 'waiting', state: { acceptedDespiteFailure: true }, reason: 'ignored-refusal' };
      };
      execute = fault;
      reconcile = fault;
      await runtime.store.request(key, action === 'observe' ? 'observe' : 'synchronise', before.revision, clock);
      await run();
      const saved = await row();
      assert.deepEqual(saved.providerState, before.providerState);
      assert.deepEqual(saved.operations, before.operations);
      assert.equal(saved.status, action === 'reconcile' ? 'revoked' : 'repair_required');
      assert.match(saved.waitingReason!, refused);
      assert.equal(saved.completion, undefined);
      assert.equal(sends, 1);
    });
  for (const action of ['synchronise', 'reconcile'] as const)
    it(`validates ${action} completion identity before saving returned state`, async () => {
      await imported();
      execute = async context => {
        const op = operation(context);
        await context.mutate(op, async () => {
          sends++;
        });
        return waiting(context);
      };
      if (action === 'reconcile') await run();
      const before = await row();
      const invalidCompletion = async (context: Context): Promise<Outcome> => {
        for (const op of context.operations) {
          await journalReceipt(context, { ...op, outcome: 'confirmed' });
          await context.checkpoint(context.state, [op.id]);
        }
        const result = await completed(context);
        assert.equal(result.kind, 'completed');
        if (result.kind !== 'completed') assert.fail('Completion required');
        return {
          ...result,
          state: { rejectedCompletion: true },
          evidence: { ...result.evidence, approvalId: 'other-approval' },
        };
      };
      execute = invalidCompletion;
      reconcile = invalidCompletion;
      await runtime.store.request(key, 'synchronise', before.revision, clock);
      await run();
      const saved = await row();
      assert.deepEqual(saved.providerState, before.providerState);
      assert.equal(saved.status, 'repair_required');
      assert.equal(saved.waitingReason, 'completion_identity_mismatch');
      assert.equal(saved.completion, undefined);
      assert.equal(sends, action === 'reconcile' ? 1 : 0);
    });
  it('requires fresh approval for version-1 content after the evidence-contract upgrade', async () => {
    await ready(key.oid, ['archive'], 1);
    await dispatchPublications(runtime);
    const previous = await row();
    await runPublicationWorker(runtime, { attrs: { data: key } });
    const stopped = await row();
    assert.equal(stopped.status, 'superseded');
    assert.equal(stopped.waitingReason, 'material_configuration_changed');
    assert.equal(stopped.approvalId, previous.approvalId);
    assert.deepEqual(stopped.source, previous.source);
    assert.deepEqual(stopped.operations, []);
    assert.equal(stopped.completion, undefined);
    assert.equal(sends, 0);
    await ready(key.oid, ['archive']);
    await dispatchPublications(runtime);
    await runPublicationWorker(runtime, { attrs: { data: key } });
    assert.equal((await row()).status, 'completed');
    assert.notEqual((await row()).approvalId, previous.approvalId);
    assert.equal(sends, 1);
  });
  for (const outcome of ['confirmed', 'uncertain'] as const) {
    it(`forces ${outcome} checkpoint gaps through reconciliation across a fresh approval`, async () => {
      await ready();
      await importPublicationIntents(runtime, (await mongo.getMeta(key.oid))!);
      let first = true;
      execute = async context => {
        if (first) {
          first = false;
          const op = operation(context);
          await context.mutate(op, async () => {
            sends++;
          });
          await journalReceipt(context, { ...op, outcome, evidence: { receipt: 'remote-1' } });
          throw new Error('lost adapter checkpoint');
        }
        return deposit(context); // A forgetful adapter would submit a duplicate here.
      };
      await runPublicationWorker(runtime, { attrs: { data: key } });
      const previous = await runtime.store.get(key);
      assert.ok(previous);
      assert.equal(previous.operations[0].outcome, outcome);
      reconcile = async context => {
        assert.equal(context.recovery, true);
        assert.equal(context.operations[0].evidence.receipt, 'remote-1');
        assert.ok(context.recoverySources.some(source => source.requestId !== context.source.requestId));
        return waiting(context); // Ignoring evidence must not release the mutation barrier.
      };
      await ready();
      await importPublicationIntents(runtime, (await mongo.getMeta(key.oid))!);
      await runPublicationWorker(runtime, { attrs: { data: key } });
      clock += 100;
      await runPublicationWorker(runtime, { attrs: { data: key } });
      assert.equal(sends, 1);
      assert.equal(reconciles, 2);
      assert.equal((await runtime.store.get(key))?.operations.length, 1);
    });
  }
  it('retains the original transport key when another work item recovers a shared resource', async () => {
    await imported();
    const claimed = await runtime.store.claim(key, 'first-worker', config.processing.leaseMs);
    assert.ok(claimed);
    const first = new PublicationExecution(
      claimed,
      runtime.store,
      runtime.resources,
      runtime.registry,
      config.processing,
      async () => {}
    );
    const op: PublicationOperation = {
      id: randomUUID(),
      kind: 'shared-rebuild',
      approvalId: claimed.approvalId,
      approvalEpoch: claimed.approvalEpoch,
      sourceGeneration: claimed.sourceGeneration,
      intendedDigest: 'one-rebuild',
      submittedAt: new Date(clock).toISOString(),
      outcome: 'submitted',
      evidence: {},
    };
    const remote = new Map<string, string>();
    let sentKey = '';
    const namespace = 'repository://shared-key-recovery';
    const forgedKey = `rbpub-v1-${'0'.repeat(64)}`;
    try {
      await first.withResourceLease(namespace, 'index', async () => {
        await assert.rejects(
          first.mutate({ ...op, idempotencyKey: forgedKey }, async transportKey => {
            sentKey = transportKey;
            assert.notEqual(sentKey, forgedKey, 'The host must ignore a supplied key for a new mutation');
            const record = await runtime.store.get(key);
            const resource = await runtime.resources.get({ providerId: 'ledger', namespace, resourceKey: 'index' });
            assert.equal(record?.operations[0].idempotencyKey, sentKey);
            assert.equal(resource?.operations[0].operation.idempotencyKey, sentKey);
            remote.set(transportKey, 'accepted-rebuild');
            sends++;
            throw new Error('Lost shared rebuild response');
          }),
          /Lost shared rebuild response/
        );
      });
    } finally {
      await first.close();
    }
    assert.match(sentKey, /^rbpub-v1-[a-f0-9]{64}$/);
    for (const work of [
      { ...key, oid: 'second-record' },
      { ...key, destinationId: 'other-destination' },
      { ...key, brandId: 'other-brand', oid: 'other-record', destinationId: 'other-destination' },
    ]) {
      const target =
        work.brandId === key.brandId && work.destinationId === key.destinationId
          ? claimed.targetFingerprint
          : 'different-fixed-target';
      const row = await runtime.store.initialise(work, 'ledger', target);
      await runtime.store.request(work, 'synchronise', row.revision);
      const nextClaim = await runtime.store.claim(work, 'next-worker', config.processing.leaseMs);
      assert.ok(nextClaim);
      let next = new PublicationExecution(
        nextClaim,
        runtime.store,
        runtime.resources,
        runtime.registry,
        config.processing,
        async () => {}
      );
      try {
        await next.withResourceLease(namespace, 'index', async resource => {
          const entry = resource.operations.find(entry => entry.operation.id === op.id);
          assert.ok(entry);
          await assert.rejects(
            resource.journal({ ...entry.operation, idempotencyKey: forgedKey }),
            /key cannot change/
          );
          await assert.rejects(resource.journal(entry.operation), /key cannot change/);
          assert.equal(
            (await runtime.resources.get({ providerId: 'ledger', namespace, resourceKey: 'index' }))?.operations[0]
              .operation.idempotencyKey,
            sentKey
          );
        });
        await next.close();
        const retry = await runtime.store.claim(work, 'next-proposal', config.processing.leaseMs);
        assert.ok(retry);
        next = new PublicationExecution(
          retry,
          runtime.store,
          runtime.resources,
          runtime.registry,
          config.processing,
          async () => {}
        );
        await next.withResourceLease(namespace, 'index', async resource => {
          const entry = resource.operations.find(entry => entry.operation.id === op.id);
          assert.ok(entry);
          assert.deepEqual(entry.work, key);
          const lookupKey = next.idempotencyKey(entry.operation);
          assert.equal(lookupKey, sentKey, 'A new resource owner must look up the original transport key');
          assert.equal(remote.get(lookupKey), 'accepted-rebuild');
          await resource.journal({
            ...entry.operation,
            idempotencyKey: undefined,
            outcome: 'confirmed',
            confirmation: publicationOperationEvidence(entry.operation.identity ?? next.state, entry.operation),
            evidence: { receipt: remote.get(lookupKey)! },
          });
          const durable = await runtime.resources.get({ providerId: 'ledger', namespace, resourceKey: 'index' });
          assert.equal(
            durable?.operations[0].operation.idempotencyKey,
            sentKey,
            'An omitted key must survive journal updates'
          );
        });
      } finally {
        await next.close();
      }
    }
    assert.equal(sends, 1);
    assert.equal((await runtime.store.get(key))?.operations[0].outcome, 'uncertain');
  });
  it('fences a forgetful adapter at mutate and forbids forged checkpoint acknowledgements', async () => {
    await imported();
    const claimed = await runtime.store.claim(key, 'worker', config.processing.leaseMs);
    assert.ok(claimed);
    let execution = new PublicationExecution(
      claimed,
      runtime.store,
      runtime.resources,
      runtime.registry,
      config.processing,
      async () => {}
    );
    const restart = async () => {
      await execution.close();
      const next = await runtime.store.claim(key, 'successor', config.processing.leaseMs);
      assert.ok(next);
      execution = new PublicationExecution(
        next,
        runtime.store,
        runtime.resources,
        runtime.registry,
        config.processing,
        async () => {}
      );
    };
    const op: PublicationOperation = {
      id: randomUUID(),
      kind: 'deposit',
      approvalId: claimed.approvalId,
      approvalEpoch: claimed.approvalEpoch,
      sourceGeneration: claimed.sourceGeneration,
      intendedDigest: 'desired',
      submittedAt: new Date(clock).toISOString(),
      outcome: 'submitted',
      evidence: {},
    };
    await execution.mutate(op, async () => {
      sends++;
    });
    await assert.rejects(execution.checkpoint({ invalid: true }, false, [op.id]), /Only confirmed/);
    await assert.rejects(execution.checkpoint({ invalid: true }, true), /Only confirmed/);
    await restart();
    await journalReceipt(execution, {
      ...op,
      outcome: 'confirmed',
      checkpointed: true,
      evidence: { receipt: 'remote' },
    });
    assert.notEqual(execution.state.operations[0].checkpointed, true);
    await assert.rejects(
      execution.mutate({ ...op, id: randomUUID() }, async () => {
        sends++;
      }),
      error => error instanceof PublicationStopped && error.reason === 'operation_requires_reconciliation'
    );
    await assert.rejects(execution.checkpoint({ ignored: true }), /operation_requires_reconciliation/);
    await restart();
    await execution.checkpoint({ ignored: true }); // A checkpoint without acknowledgement keeps the barrier.
    await assert.rejects(
      execution.mutate({ ...op, id: randomUUID() }, async () => {
        sends++;
      }),
      error => error instanceof PublicationStopped && error.reason === 'operation_requires_reconciliation'
    );
    await restart();
    await execution.checkpoint({ receipt: 'remote' }, false, [op.id]);
    assert.equal(execution.state.operations[0].checkpointed, true);
    // Replaying a copied journal entry cannot remove a host acknowledgement.
    await journalReceipt(execution, { ...op, outcome: 'confirmed', evidence: { receipt: 'remote' } });
    assert.equal(execution.state.operations[0].checkpointed, true);
    await execution.mutate({ ...op, id: randomUUID() }, async () => {
      sends++;
    });
    assert.equal(sends, 2);
    await execution.close();
  });
  it('restores only exact host-retained confirmations into a compacted resource journal', async () => {
    await imported();
    const claimed = await runtime.store.claim(key, 'worker', config.processing.leaseMs);
    assert.ok(claimed);
    let execution = new PublicationExecution(
      claimed,
      runtime.store,
      runtime.resources,
      runtime.registry,
      config.processing,
      async () => {}
    );
    const restart = async () => {
      await execution.close();
      const next = await runtime.store.claim(key, 'successor', config.processing.leaseMs);
      assert.ok(next);
      execution = new PublicationExecution(
        next,
        runtime.store,
        runtime.resources,
        runtime.registry,
        config.processing,
        async () => {}
      );
    };
    const op: PublicationOperation = {
      id: randomUUID(),
      kind: 'deposit',
      approvalId: claimed.approvalId,
      approvalEpoch: claimed.approvalEpoch,
      sourceGeneration: claimed.sourceGeneration,
      intendedDigest: 'desired',
      submittedAt: new Date(clock).toISOString(),
      outcome: 'submitted',
      evidence: {},
    };
    const confirmed: PublicationOperation = {
      ...op,
      outcome: 'confirmed',
      confirmation: publicationOperationEvidence(claimed, op),
      evidence: { receipt: 'remote' },
    };
    const resourceKey = { providerId: 'ledger', namespace: 'repository://one', resourceKey: 'index' };
    let transportKey = '';
    await execution.withResourceLease(resourceKey.namespace, resourceKey.resourceKey, async () => {
      await execution.mutate(op, async key => {
        transportKey = key;
        sends++;
      });
      await journalReceipt(execution, confirmed);
      await execution.checkpoint({ receipt: 'remote' }, false, [op.id]);
    });
    await runtime.resources.collection.updateOne(resourceKey, { $set: { operations: [] } });
    for (const invalid of [
      { operation: { ...confirmed, id: 'invented' }, error: /Only mutate/ },
      { operation: { ...confirmed, intendedDigest: 'other' }, error: /identity cannot change/ },
    ]) {
      await execution.withResourceLease(resourceKey.namespace, resourceKey.resourceKey, async resource => {
        await assert.rejects(resource.journal(invalid.operation), invalid.error);
        await assert.rejects(resource.journal(confirmed), invalid.error);
        assert.equal((await runtime.resources.get(resourceKey))?.operations.length, 0);
      });
      await restart();
    }
    await execution.withResourceLease(resourceKey.namespace, resourceKey.resourceKey, async resource => {
      const verified = {
        ...confirmed,
        confirmation: publicationOperationEvidence(claimed, op),
        evidence: { ...confirmed.evidence, verified: true },
      };
      await resource.journal(verified);
      const restored = (await runtime.resources.get(resourceKey))?.operations[0];
      assert.deepEqual(restored?.work, key);
      assert.equal(restored?.operation.evidence.receipt, 'remote');
      assert.equal(restored?.operation.idempotencyKey, transportKey);
      assert.equal(execution.idempotencyKey(restored.operation), transportKey);
      await journalReceipt(execution, verified);
      assert.notEqual(execution.state.operations[0].checkpointed, true);
      await execution.checkpoint({ receipt: 'remote', verified: true }, false, [op.id]);
      assert.equal(execution.state.operations[0].checkpointed, true);
    });
    await execution.close();
    assert.equal(sends, 1);
  });
  it('bounds resource work identities with large provider state and retains legacy copies in history', async () => {
    await imported();
    const privateSummary = 'PRIVATE_PROVIDER_STATE_'.repeat(36000);
    await runtime.store.collection.updateOne(key, { $set: { providerState: { privateSummary } } });
    const claimed = await runtime.store.claim(key, 'worker', config.processing.leaseMs);
    assert.ok(claimed);
    const execution = new PublicationExecution(
      claimed,
      runtime.store,
      runtime.resources,
      runtime.registry,
      config.processing,
      async () => {}
    );
    const resourceKey = { providerId: 'ledger', namespace: 'repository://one', resourceKey: 'index' };
    const operation = (id: string): PublicationOperation => ({
      id,
      kind: 'deposit',
      approvalId: claimed.approvalId,
      approvalEpoch: claimed.approvalEpoch,
      sourceGeneration: claimed.sourceGeneration,
      intendedDigest: 'desired',
      submittedAt: new Date(clock).toISOString(),
      outcome: 'submitted',
      evidence: {},
    });
    await execution.withResourceLease(resourceKey.namespace, resourceKey.resourceKey, async () => {
      // Older workers stored the whole row in this declared PublicationWorkKey field.
      const legacy = Array.from({ length: 3 }, (_, index) => ({
        work: claimed,
        operation: { ...operation(`old-${index}`), outcome: 'confirmed' as const },
      }));
      await runtime.resources.collection.updateOne(resourceKey, { $set: { operations: legacy } });
      for (let index = 0; index < 6; index++) {
        const op = operation(`new-${index}`);
        await execution.mutate(op, async () => {
          sends++;
        });
        await journalReceipt(execution, { ...op, outcome: 'confirmed' });
        await execution.checkpoint({ privateSummary }, false, [op.id]);
      }
    });
    await execution.close();
    const resource = await runtime.resources.get(resourceKey);
    assert.ok(resource);
    assert.equal(resource.operations.length, 9);
    for (const entry of resource.operations) assert.deepEqual(entry.work, key);
    assert.ok(
      Buffer.byteLength(JSON.stringify(resource)) < 16384,
      'Work coordinates cannot duplicate private provider checkpoints'
    );
    assert.equal(sends, 6);
    const archived = await client.db(database).collection('publicationhistory').findOne({
      'snapshot.operations.0.work.providerState.privateSummary': privateSummary,
    });
    assert.ok(archived, 'Narrowing legacy work coordinates must first preserve the original evidence');
  });
  it('measures journal capacity using work keys rather than a large provider checkpoint', async () => {
    await imported();
    await runtime.store.collection.updateOne(key, {
      $set: { providerState: { privateSummary: 'x'.repeat(4 * 1024 * 1024 + 1024) } },
    });
    const claimed = await runtime.store.claim(key, 'worker', config.processing.leaseMs);
    assert.ok(claimed);
    const execution = new PublicationExecution(
      claimed,
      runtime.store,
      runtime.resources,
      runtime.registry,
      config.processing,
      async () => {}
    );
    const op: PublicationOperation = {
      id: randomUUID(),
      kind: 'deposit',
      approvalId: claimed.approvalId,
      approvalEpoch: claimed.approvalEpoch,
      sourceGeneration: claimed.sourceGeneration,
      intendedDigest: 'desired',
      submittedAt: new Date(clock).toISOString(),
      outcome: 'submitted',
      evidence: {},
    };
    const resourceKey = { providerId: 'ledger', namespace: 'repository://one', resourceKey: 'index' };
    await execution.withResourceLease(resourceKey.namespace, resourceKey.resourceKey, async () => {
      await execution.mutate(op, async () => {
        sends++;
      });
      await journalReceipt(execution, { ...op, outcome: 'confirmed' });
    });
    await execution.close();
    const resource = await runtime.resources.get(resourceKey);
    assert.equal(sends, 1);
    assert.equal(resource?.operations.length, 1);
    assert.deepEqual(resource?.operations[0].work, key);
    assert.ok(Buffer.byteLength(JSON.stringify(resource)) < 16384);
  });
  it('recovers an acknowledged state-and-operation checkpoint after its response is lost', async () => {
    await imported();
    const save = runtime.store.checkpointProviderState.bind(runtime.store);
    let lost = false;
    runtime.store.checkpointProviderState = async (...args) => {
      const result = await save(...args);
      if (args[5]?.length && !lost) {
        lost = true;
        throw new Error('lost checkpoint response');
      }
      return result;
    };
    await run();
    assert.equal(lost, true);
    assert.equal((await row()).status, 'completed');
    assert.equal((await row()).operations[0].checkpointed, true);
    assert.equal(sends, 1);
  });
  async function ready(
    oid = key.oid,
    destinations = ['archive', 'repository'],
    contractVersion = provider.contractVersion
  ) {
    config.sourcePolicies[0] = { ...config.sourcePolicies[0], destinations };
    const old = await mongo.recordCol.findOne({ redboxOid: oid });
    const revision = old?.publicationSource ? publicationSource(old.publicationSource).revision : 0;
    const candidate = {
      redboxOid: oid,
      metadata: { title: `content-${revision + 1}` },
      metaMetadata: { brandId: 'brand', type: 'dataPublication' },
      workflow: { stage: 'queued' },
    };
    if (!old) await mongo.recordCol.insertOne({ ...candidate, revision: 0, recordVersion: 0 });
    const content = publicationContentRecord(candidate);
    assert.ok(isPublicationObject(content));
    const generated = { publicationTimestamp: '2026-10-19T00:00:00Z' };
    const relatedInputs: Record<string, PublicationSnapshot> = Object.fromEntries(
      destinations.map(id => {
        const value = { record: content, generated };
        return [`${id}:prepared`, { brandId: 'brand', id, version: publicationDigest(value), value }];
      })
    );
    for (const id of destinations) {
      const selection = { attachments: inputs.attachments.map(({ id, logicalPath }) => ({ id, logicalPath })) };
      relatedInputs[`${id}:selection`] = {
        brandId: 'brand',
        id,
        version: publicationDigest(selection),
        value: selection,
      };
      for (const [name, snapshot] of Object.entries(inputs.relatedInputs)) relatedInputs[`${id}:${name}`] = snapshot;
    }
    const sealed = await sealPublicationSource(
      {
        brandId: 'brand',
        oid,
        requestId: randomUUID(),
        sourceRevision: revision + 1,
        record: content,
        maintenancePaths: [],
        generatedValues: generated,
        relatedInputs,
        attachments: inputs.attachments,
        destinations: destinations.map(id => ({
          id,
          provider: { ...provider, contractVersion },
          configuration: config.destinations[id],
          targetFingerprint: 'verified-target',
          mappingContextVersion: 1,
          managedFields: [],
        })),
        resolveCrosswalk: async () => {
          throw new Error('No crosswalk');
        },
      },
      staging
    );
    const approval: PublicationApproval = {
      id: randomUUID(),
      epoch: 1,
      sourceRevision: revision + 1,
      policy: config.sourcePolicies[0],
      destinationIds: destinations,
      targetFingerprints: sealed.descriptor.targets,
      configurationDigests: sealed.configurationDigests,
      source: sealed.reference,
      requester: { username: 'requester', userType: 'local' },
      approver: { username: 'departed-approver', userType: 'local' },
      grantedAt: new Date(clock).toISOString(),
    };
    const saveToken = randomUUID();
    const result = await mongo.updateMeta(brand, oid, candidate, undefined, {
      publicationIntent: {
        kind: 'content',
        expectedSourceRevision: revision,
        saveToken,
        approvals: [approval],
        expectedRecordDigest: publicationRecordDigest(candidate),
      },
    });
    assert.equal(result.applicationState, 'applied');
    const record = await mongo.getMeta(oid);
    assert.equal(
      await mongo.recordPublicationSaveSuccess('brand', oid, saveToken, {
        evidenceId: randomUUID(),
        sourceRevision: revision + 1,
        recordDigest: publicationRecordDigest({ ...record }),
      }),
      true
    );
    assert.equal(await mongo.readyPublicationIntent('brand', oid, saveToken), true);
    return mongo.getMeta(oid);
  }
  const run = (work = key) => runPublicationWorker(runtime, { attrs: { data: work } });
  async function imported(destinations = ['archive']) {
    await importPublicationIntents(runtime, await ready(key.oid, destinations));
  }
  async function row(work = key) {
    const result = await runtime.store.get(work);
    assert.ok(result);
    return result;
  }
  async function due() {
    clock += 1000;
  }

  it('imports before exact acknowledgement and preserves a failed sibling for retry', async () => {
    const record = await ready();
    const original = runtime.store.importRequest.bind(runtime.store);
    runtime.store.importRequest = async (work, request, at) => {
      if (work.destinationId === 'archive') throw new Error('Unavailable row');
      return original(work, request, at);
    };
    await assert.rejects(importPublicationIntents(runtime, record), AggregateError);
    const state = publicationSource((await mongo.getMeta(key.oid)).publicationSource);
    assert.equal(state.intents.archive.pending, true);
    assert.equal(state.intents.repository.pending, false);
    assert.equal((await row({ ...key, destinationId: 'repository' })).sourceGeneration, 1);
    runtime.store.importRequest = original;
    await importPublicationIntents(runtime, await mongo.getMeta(key.oid));
    assert.equal(publicationSource((await mongo.getMeta(key.oid)).publicationSource).pending, false);
  });
  it('reimports idempotently after a crash between durable import and acknowledgement', async () => {
    const record = await ready(key.oid, ['archive']);
    const ack = mongo.acknowledgePublicationIntent.bind(mongo);
    mongo.acknowledgePublicationIntent = async () => {
      throw new Error('Process stopped');
    };
    await assert.rejects(importPublicationIntents(runtime, record));
    const importedRow = await row();
    mongo.acknowledgePublicationIntent = ack;
    await importPublicationIntents(runtime, await mongo.getMeta(key.oid));
    assert.equal((await row()).work.synchronise.requested, importedRow.work.synchronise.requested);
    assert.equal(publicationSource((await mongo.getMeta(key.oid)).publicationSource).pending, false);
  });
  it('recovers missed wakeups and queue loss using identifier-only durable dispatch', async () => {
    await ready();
    runtime.enqueue = async () => {
      throw new Error('Queue unavailable');
    };
    await dispatchPublications(runtime, 1);
    assert.ok(failures.includes('delivery_failed'));
    assert.equal((await row()).work.synchronise.processed, 0);
    clock += 30001;
    runtime.enqueue = async (name, work) => {
      deliveries.push({ name, key: work });
    };
    await dispatchPublications(runtime, 1);
    assert.equal(deliveries.length, 2);
    assert.deepEqual(Object.keys(deliveries[0].key).sort(), ['brandId', 'destinationId', 'oid']);
    assert.equal(deliveries[0].name, 'Publication-SyncRecord');
    await run();
    assert.equal(sends, 1);
    assert.equal((await row()).status, 'completed');
  });
  it('pages fairly past paused destinations without acknowledging their work as processed', async () => {
    await ready('a');
    await ready('z');
    config.destinations.archive.enabled = false;
    await dispatchPublications(runtime, 1);
    assert.deepEqual(
      deliveries.map(item => `${item.key.oid}/${item.key.destinationId}`),
      ['a/repository', 'z/repository']
    );
    assert.equal((await row({ ...key, oid: 'a' })).dispatchUntil, clock + 300000);
    assert.equal((await row({ ...key, oid: 'a' })).work.synchronise.processed, 0);
  });
  it('allows an enabled sibling to finish when another approved destination is disabled', async () => {
    await imported(['archive', 'repository']);
    config.destinations.repository.enabled = false;
    await run();
    assert.equal(sends, 1);
    assert.equal((await row()).status, 'completed');
  });
  it('duplicate jobs share one active lease and produce one remote mutation', async () => {
    await imported();
    const entered = deferred();
    const release = deferred();
    execute = async context => {
      entered.resolve();
      await release.promise;
      return deposit(context);
    };
    const first = run();
    await entered.promise;
    await Promise.all(Array.from({ length: 8 }, () => run()));
    release.resolve();
    await first;
    assert.equal(sends, 1);
    assert.equal((await row()).lease, null);
  });
  it('ignores payload authority and rejects cross-brand/malformed deliveries', async () => {
    await imported();
    await run({ ...key, brandId: 'other' });
    await runPublicationWorker(runtime, { attrs: { data: { oid: key.oid, approvalId: 'forged' } } });
    await runPublicationWorker(runtime, { attrs: { data: { ...key, user: 'administrator', payload: 'forged' } } });
    assert.equal(sends, 1);
  });
  it('reloads request() revision conflicts without losing its lease or erasing newly requested work', async () => {
    await imported();
    const checkpoint = runtime.store.checkpointProviderState.bind(runtime.store);
    let conflicts = 0;
    runtime.store.checkpointProviderState = async (...args) => {
      if (isPublicationObject(args[3]) && args[3].checkpoint === 'after-request' && conflicts === 0) {
        const current = await row();
        await runtime.store.request(key, 'synchronise', current.revision, clock);
      }
      // Import/request may advance revision after the worker's pre-write reload. Exercise that real CAS failure.
      try {
        return await checkpoint(...args);
      } catch (error) {
        if (error instanceof PublicationStoreConflict) conflicts++;
        throw error;
      }
    };
    execute = async context => {
      await context.checkpoint({ checkpoint: 'after-request' });
      return deposit(context);
    };
    await run();
    const state = await row();
    assert.equal(conflicts, 1);
    assert.equal(sends, 1);
    assert.equal(state.work.synchronise.requested, 2);
    assert.equal(state.work.synchronise.processed, 1);
    assert.equal(state.work.synchronise.dueAt, clock);
    assert.equal(state.providerState.deposited, true);
  });
  it('reloads a heartbeat revision conflict and revalidates the current source', async () => {
    await imported();
    const claimed = await runtime.store.claim(key, 'owner', 30000);
    assert.ok(claimed?.lease);
    let validations = 0;
    let conflicts = 0;
    const renewed = deferred();
    const renew = runtime.store.renew.bind(runtime.store);
    runtime.store.renew = async (...args) => {
      try {
        const result = await renew(...args);
        renewed.resolve();
        return result;
      } catch (error) {
        if (error instanceof PublicationStoreConflict) conflicts++;
        throw error;
      }
    };
    config.processing.heartbeatMs = 20;
    const execution = new PublicationExecution(
      claimed,
      runtime.store,
      runtime.resources,
      runtime.registry,
      config.processing,
      async () => {
        validations++;
      }
    );
    await runtime.store.request(key, 'observe', claimed.revision, clock);
    execution.startHeartbeat();
    await renewed.promise;
    await execution.checkpoint({ safe: true });
    assert.ok(validations >= 2);
    assert.ok(conflicts >= 1);
    assert.equal((await row()).lease?.token, claimed.lease.token);
    await execution.close();
  });
  it('a newer imported generation stops stale checkpoints while preserving the new obligation', async () => {
    await imported();
    execute = async context => {
      await importPublicationIntents(runtime, await ready());
      await context.checkpoint({ obsolete: true });
      throw new Error('Unreachable');
    };
    await run();
    assert.equal(sends, 0);
    const state = await row();
    assert.equal(state.sourceGeneration, 2);
    assert.equal(state.status, 'queued');
    assert.equal(state.work.synchronise.processed, 0);
    assert.equal(state.providerState.obsolete, undefined);
  });
  it('heartbeats keep a slow request owned across multiple lease periods', async () => {
    await imported();
    config.processing.heartbeatMs = 25;
    config.processing.leaseMs = 150;
    runtime.store = new PublicationSyncStore(client.db(database));
    runtime.resources = new PublicationResourceStore(client.db(database));
    let touches = 0;
    execute = async context => {
      const op = operation(context);
      await context.mutate(op, async () => {
        sends++;
        await new Promise(resolve => setTimeout(resolve, 450));
      });
      await journalReceipt(context, { ...op, outcome: 'confirmed' });
      await context.checkpoint({ deposited: true }, [op.id]);
      return completed(context);
    };
    await runPublicationWorker(runtime, {
      attrs: { data: key },
      touch: async () => {
        touches++;
      },
    });
    assert.equal(sends, 1);
    assert.ok(touches >= 3);
    assert.equal((await row()).status, 'completed');
  });
  it('a lost lease prevents a late checkpoint and next mutation; the successor reconciles', async () => {
    await imported();
    const entered = deferred();
    const release = deferred();
    execute = async context => {
      const op = operation(context);
      await context.mutate(op, async () => {
        sends++;
        entered.resolve();
        await release.promise;
      });
      await journalReceipt(context, { ...op, outcome: 'confirmed' });
      return deposit(context);
    };
    const old = run();
    await entered.promise;
    clock += 30001;
    const successor = await runtime.store.claim(key, 'successor', 30000);
    assert.ok(successor?.lease);
    release.resolve();
    await old;
    assert.equal(sends, 1);
    let state = await row();
    assert.equal(state.operations[0].outcome, 'submitted');
    assert.equal(state.lease?.token, successor.lease.token);
    await runtime.store.release(key, successor.lease, state.revision);
    execute = completed;
    await run();
    state = await row();
    assert.equal(reconciles, 1);
    assert.equal(sends, 1);
    assert.equal(state.operations[0].outcome, 'confirmed');
  });
  for (const fault of ['source', 'revocation', 'mapping', 'policy', 'deletion', 'brand', 'access'] as const) {
    it(`stops further mutations after ${fault} changes during a sent call and retains late evidence`, async () => {
      await imported();
      execute = async context => {
        const op = operation(context);
        await context.mutate(op, async () => {
          sends++;
          if (fault === 'source') await mongo.updateMeta(brand, key.oid, { metadata: { title: 'edited' } });
          if (fault === 'mapping') config.destinations.archive.mapping.changed = true;
          if (fault === 'policy') config.sourcePolicies[0] = { ...config.sourcePolicies[0], version: 2 };
          if (fault === 'deletion') await mongo.recordCol.deleteOne({ redboxOid: key.oid });
          if (fault === 'brand')
            await mongo.recordCol.updateOne({ redboxOid: key.oid }, { $set: { 'metaMetadata.brandId': 'other' } });
          if (fault === 'access') access = false;
          if (fault === 'revocation') {
            const current = await mongo.getMeta(key.oid);
            const state = publicationSource(current.publicationSource);
            await mongo.updateMeta(brand, key.oid, { ...current }, undefined, {
              publicationIntent: {
                kind: 'revoke',
                expectedSourceRevision: state.revision,
                saveToken: randomUUID(),
                approvals: [],
                revocations: [{ approvalId: context.approval.id, epoch: context.approval.epoch }],
              },
            });
          }
        });
        await journalReceipt(context, { ...op, outcome: 'confirmed', evidence: { late: true } });
        return deposit(context);
      };
      await run();
      const state = await row();
      assert.equal(sends, 1);
      assert.equal(state.operations[0].outcome, 'confirmed');
      assert.equal(state.operations[0].evidence.late, true);
      assert.equal(state.completion, undefined);
      assert.ok(['revoked', 'superseded'].includes(state.status));
      assert.equal(state.work.synchronise.processed, 0);
    });
  }
  it('cancels a slow transport when approval is revoked, retaining uncertainty for read-only recovery', async () => {
    await imported();
    config.processing.heartbeatMs = 20;
    config.processing.leaseMs = 200;
    runtime.store = new PublicationSyncStore(client.db(database));
    execute = async context => {
      await context.mutate(operation(context), async () => {
        sends++;
        await mongo.recordCol.updateOne(
          { redboxOid: key.oid },
          { $set: { 'publicationSource.approvals.0.revokedAt': new Date().toISOString() } }
        );
        await new Promise<void>((_resolve, reject) => {
          if (context.signal.aborted) reject(context.signal.reason);
          else context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true });
        });
      });
      return deposit(context);
    };
    await run();
    assert.equal(sends, 1);
    assert.equal((await row()).operations[0].outcome, 'uncertain');
    assert.equal((await row()).status, 'revoked');
  });
  it('reconciles uncertain outcomes after restart before another mutation', async () => {
    await imported();
    execute = async context => {
      await context.mutate(operation(context), async () => {
        sends++;
        throw new Error('Lost response after remote commit');
      });
      return completed(context);
    };
    await run();
    assert.equal((await row()).operations[0].outcome, 'uncertain');
    await due();
    runtime.store = new PublicationSyncStore(client.db(database), () => clock);
    execute = completed;
    await run();
    assert.equal(sends, 1);
    assert.equal(reconciles, 1);
    assert.equal((await row()).status, 'waiting');
    await due();
    await run();
    assert.equal(sends, 1);
    assert.equal((await row()).status, 'completed');
  });
  it('reconciles a real worker killed after remote commit and before its result checkpoint', async () => {
    await imported();
    const script = `
      const core = require('@researchdatabox/redbox-core');
      const { MongoClient } = require('mongodb');
      const { Disk } = require('flydrive');
      const { FSDriver } = require('flydrive/drivers/fs');
      const { Services } = require(${JSON.stringify(require.resolve('../../src/services/MongoStorageService'))});
      const { storage } = require(${JSON.stringify(require.resolve('../../src/config/storage'))});
      (async () => {
        const client = await new MongoClient(process.env.MONGO_TEST_URL).connect();
        const db = client.db(process.env.PUB08_DATABASE);
        const log = { verbose() {}, info() {}, warn() {}, error() {}, debug() {} };
        global.sails = Object.assign(new (require('node:events').EventEmitter)(), { config: { storage }, log });
        global._ = require('lodash');
        for (const name of ['Record', 'DeletedRecord', 'RecordAudit', 'IntegrationAudit', 'RecordSchemaArtifact', 'RecordSchemaReference'])
          global[name] = { tableName: name.toLowerCase(), getDatastore: () => ({ manager: db }),
            findOne: criteria => db.collection(name.toLowerCase()).findOne(criteria) };
        const mongo = new Services.MongoStorageService(); await mongo.init();
        const config = JSON.parse(process.env.PUB08_CONFIGURATION);
        const valid = value => ({ valid: true, value });
        const registry = new core.PublicationProviderRegistry();
        registry.register({ id: 'ledger', contractVersion: 2, stateVersion: 1, configurationSchema: {}, secretPaths: ['connection.token'],
          mutationRecovery: { mode: 'idempotency-key' },
          capabilities: { synchronise: true, reconcile: true, observe: true, resourceLeases: true },
          validateConfiguration: valid, targetFingerprint: () => 'verified-target', decodeState: valid, upgradeState: valid,
          decodePreparedSource: valid, prepareSource: async input => valid({ record: input.record, generated: input.generatedValues }),
          repairs: [], reconcile: async () => { throw new Error('Unexpected reconciliation'); },
          observe: async () => { throw new Error('Unexpected observation'); },
          synchronise: async context => {
            await context.mutate({ id: 'killed-deposit', kind: 'deposit', approvalId: context.approval.id,
              approvalEpoch: context.approval.epoch, sourceGeneration: context.sourceGeneration, intendedDigest: 'desired',
              submittedAt: new Date().toISOString(), outcome: 'submitted', evidence: {} }, async () => {
                await db.collection('remote_commits').insertOne({ operation: 'killed-deposit', applied: true });
                process.kill(process.pid, 'SIGKILL');
            });
            throw new Error('Unreachable');
          }
        }); registry.freeze();
        const now = () => Number(process.env.PUB08_NOW);
        const staging = new core.PublicationStaging('durable', new Disk(new FSDriver({ location: process.env.PUB08_DIRECTORY, visibility: 'private' })));
        const runtime = { storage: mongo, store: new core.PublicationSyncStore(db, now), resources: new core.PublicationResourceStore(db, now),
          registry, configuration: async () => config, staging: () => staging, assertAccess: async () => {}, now,
          verifyInputs: (...args) => core.verifyPublicationInputs(runtime, ...args) };
        await core.runPublicationWorker(runtime, { attrs: { data: { brandId: 'brand', oid: 'record', destinationId: 'archive' } } });
      })().catch(error => { console.error(error); process.exit(1); });
    `;
    const child = spawnSync(
      process.execPath,
      ['-r', require.resolve('ts-node/register/transpile-only'), '-e', script],
      {
        env: {
          ...process.env,
          PUB08_DATABASE: database,
          PUB08_DIRECTORY: directory,
          PUB08_CONFIGURATION: JSON.stringify(config),
          PUB08_NOW: String(clock),
        },
        timeout: 20000,
        encoding: 'utf8',
      }
    );
    assert.equal(child.signal, 'SIGKILL', child.stderr);
    assert.equal(
      await client.db(database).collection('remote_commits').countDocuments({ operation: 'killed-deposit' }),
      1
    );
    assert.equal((await row()).operations[0].outcome, 'submitted');
    clock += 30001;
    execute = completed;
    await run();
    assert.equal(reconciles, 1);
    assert.equal(sends, 0);
    assert.equal((await row()).operations[0].outcome, 'confirmed');
    await due();
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal(await client.db(database).collection('remote_commits').countDocuments({}), 1);
  });
  it('cannot blindly repeat a submitted operation even when an adapter returns completed', async () => {
    await imported();
    execute = async context => {
      await context.mutate(operation(context), async () => {
        sends++;
      });
      return completed(context);
    };
    await run();
    assert.equal((await row()).status, 'repair_required');
    assert.equal((await row()).completion, undefined);
    assert.equal(sends, 1);
  });
  it('read-only recovery under revoked approval records confirmation without completing the current request', async () => {
    await imported();
    execute = async context => {
      await context.mutate(operation(context), async () => {
        sends++;
        throw new Error('Lost response');
      });
      return completed(context);
    };
    await run();
    await due();
    await mongo.recordCol.updateOne(
      { redboxOid: key.oid },
      { $set: { 'publicationSource.approvals.0.revokedAt': new Date().toISOString() } }
    );
    await run();
    const state = await row();
    assert.equal(reconciles, 1);
    assert.equal(sends, 1);
    assert.equal(state.operations[0].outcome, 'confirmed');
    assert.equal(state.completion, undefined);
    assert.equal(state.status, 'revoked');
  });
  it('unresolved reconciliation never authorises synchronise or a new non-idempotent call', async () => {
    await imported();
    execute = async context => {
      await context.mutate(operation(context), async () => {
        sends++;
        throw new Error('Unknown');
      });
      return completed(context);
    };
    await run();
    await due();
    reconcile = async context => ({
      kind: 'repair_required',
      state: context.state,
      reason: 'unknown_head',
      evidence: { head: 'different' },
    });
    await run();
    assert.equal(reconciles, 1);
    assert.equal(sends, 1);
    assert.equal((await row()).status, 'repair_required');
  });
  it('waiting does not consume attempts and clears its recovered error episode', async () => {
    await imported();
    execute = async context => ({
      kind: 'retryable_failure',
      state: context.state,
      category: 'network',
      message: 'Unavailable',
    });
    await run();
    await due();
    assert.equal((await row()).retry?.attempts, 1);
    execute = async context => waiting(context);
    await run();
    assert.equal((await row()).status, 'waiting');
    assert.equal((await row()).retry, undefined);
  });
  it('bounds retry episodes and allows only a fresh source request to restart exhausted work', async () => {
    await imported();
    config.processing.maxAttempts = 2;
    execute = async context => ({
      kind: 'retryable_failure',
      state: context.state,
      category: 'network',
      message: 'Unavailable',
      retryAfterMs: 100,
    });
    await run();
    assert.equal((await row()).work.synchronise.dueAt, clock + 100);
    await due();
    await run();
    assert.equal((await row()).status, 'failed');
    assert.equal((await row()).retry?.attempts, 2);
    await due();
    await run();
    assert.equal((await row()).retry?.attempts, 2);
    await importPublicationIntents(runtime, await ready());
    execute = deposit;
    await run();
    assert.equal(sends, 1);
    assert.equal((await row()).status, 'completed');
    assert.equal((await row()).retry, undefined);
  });
  it('credential rotation keeps approved content while material changes require new authority', async () => {
    await imported();
    config.destinations.archive.connection.token = 'rotated';
    await run();
    assert.equal(sends, 1);
    await importPublicationIntents(runtime, await ready());
    config.destinations.archive.mapping.changed = true;
    await run();
    assert.equal(sends, 1);
    assert.equal((await row()).status, 'superseded');
  });
  it('fails closed on a missing publication storage capability', async () => {
    await imported();
    const capabilities = mongo.getCapabilities.bind(mongo);
    mongo.getCapabilities = () => ({});
    try {
      await assert.rejects(run(), /complete publication capability/);
      assert.equal(sends, 0);
    } finally {
      mongo.getCapabilities = capabilities;
    }
  });
  it('serialises shared resources and preserves resource-operation uncertainty across owners', async () => {
    await imported(['archive', 'repository']);
    const entered = deferred();
    const release = deferred();
    execute = context =>
      context.withResourceLease('repository://one', 'index', async () => {
        const op = operation(context);
        await context.mutate(op, async () => {
          sends++;
          entered.resolve();
          await release.promise;
        });
        await journalReceipt(context, { ...op, outcome: 'confirmed' });
        await context.checkpoint({ deposited: true }, [op.id]);
        return completed(context);
      });
    const first = run();
    await entered.promise;
    await run({ ...key, destinationId: 'repository' });
    assert.equal(sends, 1);
    assert.equal((await row({ ...key, destinationId: 'repository' })).waitingReason, 'resource_busy');
    release.resolve();
    await first;
    const resource = await runtime.resources.get({
      providerId: 'ledger',
      namespace: 'repository://one',
      resourceKey: 'index',
    });
    assert.equal(resource?.operations[0].operation.outcome, 'confirmed');
    assert.equal(resource?.lease, null);
  });
  it('retains an exhausted source-sync episode when readiness observation recovers', async () => {
    await imported();
    config.processing.maxAttempts = 1;
    execute = async context => ({
      kind: 'retryable_failure',
      state: context.state,
      category: 'source_failure',
      message: 'Source failed',
    });
    await run();
    let current = await row();
    await runtime.store.request(key, 'observe', current.revision, clock);
    execute = async context => ({
      kind: 'retryable_failure',
      state: context.state,
      category: 'observation_failure',
      message: 'Read failed',
    });
    await run();
    current = await row();
    assert.equal(current.retryEpisodes?.synchronise?.exhausted, true);
    assert.equal(current.retryEpisodes?.observe?.exhausted, true);
    await runtime.store.request(key, 'observe', current.revision, clock);
    execute = async context => waiting(context);
    await run();
    current = await row();
    assert.equal(current.retryEpisodes?.observe, undefined);
    assert.equal(current.retry?.category, 'source_failure');
    assert.equal(current.retryEpisodes?.synchronise?.attempts, 1);
    assert.equal(current.work.synchronise.processed, 0);
  });
  it('accepts a narrowed auto-sync scope without requiring its disabled configured sibling', async () => {
    config.sourcePolicies[0].mode = 'auto-sync';
    await imported();
    config.sourcePolicies[0].destinations = ['repository', 'archive'];
    config.destinations.repository.enabled = false;
    await run();
    assert.equal(sends, 1);
    assert.equal((await row()).status, 'completed');
  });
  it('pauses a brand without consuming due obligations or sending provider mutations', async () => {
    await imported();
    config.processing.enabled = false;
    await run();
    const current = await row();
    assert.equal(sends, 0);
    assert.equal(current.status, 'paused');
    assert.equal(current.work.synchronise.processed, 0);
    assert.equal(current.work.synchronise.dueAt, clock + 300000);
    config.processing.enabled = true;
    clock += 300001;
    await run();
    assert.equal(sends, 1);
  });
  it('detects changed related-record identity before mutation', async () => {
    inputs.relatedInputs.person = { brandId: 'brand', id: 'person', version: 'v1', value: { name: 'Original' } };
    await imported();
    inputs.relatedInputs.person = { brandId: 'brand', id: 'person', version: 'v2', value: { name: 'Changed' } };
    await run();
    assert.equal(sends, 0);
    assert.equal((await row()).waitingReason, 'related_inputs_changed');
  });
  it('detects selection removal and bytes changed outside the record-save path', async () => {
    let bytes = Buffer.from('original');
    const attachment = {
      id: 'file',
      logicalPath: 'file.txt',
      inspect: async () => ({ size: bytes.length, digest: byteDigest(bytes) }),
      open: async () => Readable.from([bytes]),
    };
    inputs.attachments = [attachment];
    await imported();
    inputs.attachments = [];
    await run();
    assert.equal(sends, 0);
    assert.equal((await row()).waitingReason, 'attachment_selection_changed');
    inputs.attachments = [attachment];
    await importPublicationIntents(runtime, await ready(key.oid, ['archive']));
    bytes = Buffer.from('replaced');
    await run();
    assert.equal(sends, 0);
    assert.equal((await row()).waitingReason, 'attachment_bytes_changed');
  });
  it('opens verified selected bytes and rejects files outside the approval', async () => {
    let bytes = Buffer.from('original');
    inputs.attachments = [
      {
        id: 'file',
        logicalPath: 'file.txt',
        inspect: async () => ({ size: bytes.length, digest: byteDigest(bytes) }),
        open: async () => Readable.from([bytes]),
      },
    ];
    await imported();
    execute = async context => {
      await assert.rejects(context.openAttachment('foreign', 'private.txt'), /outside the approved/);
      return waiting(context);
    };
    await run();
    assert.equal(sends, 0);
    assert.equal((await row()).status, 'repair_required');
    const refused = await row();
    await runtime.store.request(key, 'synchronise', refused.revision, clock);
    execute = async context => {
      const op = operation(context);
      await context.mutate(op, async () => {
        const stream = await context.openAttachment('file', 'file.txt');
        bytes = Buffer.from('replaced');
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        assert.equal(Buffer.concat(chunks).toString(), 'original');
        sends++;
      });
      await journalReceipt(context, { ...op, outcome: 'confirmed' });
      return deposit(context);
    };
    await run();
    assert.equal(sends, 1);
    assert.equal((await row()).status, 'superseded');
  });
  it('retains remote resource uncertainty and blocks a different record from mutating it', async () => {
    await imported();
    const resourceKey = { providerId: 'ledger', namespace: 'repository://one', resourceKey: 'index' };
    const owned = await runtime.resources.claim(resourceKey, 'other-brand', 'dead-owner', 1000);
    assert.ok(owned?.lease);
    await runtime.resources.journal(
      resourceKey,
      'other-brand',
      owned.lease,
      owned.revision,
      { brandId: 'other-brand', oid: 'other-record', destinationId: 'other' },
      {
        id: 'old-index',
        kind: 'index',
        approvalId: 'old-approval',
        approvalEpoch: 1,
        sourceGeneration: 1,
        intendedDigest: 'old-input',
        submittedAt: new Date(clock).toISOString(),
        outcome: 'submitted',
        evidence: { deposit: 'old' },
      }
    );
    clock += 1001;
    execute = context =>
      context.withResourceLease(resourceKey.namespace, resourceKey.resourceKey, () => deposit(context));
    await run();
    assert.equal(sends, 0);
    assert.equal((await row()).waitingReason, 'resource_requires_reconciliation');
    const recovered = await runtime.resources.get(resourceKey);
    assert.equal(recovered?.operations[0].operation.outcome, 'submitted');
    assert.equal(recovered?.operations[0].work.brandId, 'other-brand');
  });
  it('records an obsolete generation outcome only as historical evidence before executing a fresh request', async () => {
    await imported();
    execute = async context => {
      await context.mutate(operation(context), async () => {
        sends++;
        throw new Error('Unknown result');
      });
      return completed(context);
    };
    await run();
    const historical = (await row()).sourceDigest;
    await importPublicationIntents(runtime, await ready(key.oid, ['archive']));
    reconcile = async context => {
      assert.equal(context.recoverySources.length, 1);
      assert.equal(context.operations[0].sourceGeneration, 1);
      await journalReceipt(context, { ...context.operations[0], outcome: 'confirmed', evidence: { historical: true } });
      await assert.rejects(
        context.mutate(operation(context), async () => {
          sends++;
        }),
        /read_only/
      );
      return waiting(context);
    };
    await run();
    const current = await row();
    assert.equal(sends, 1);
    assert.equal(current.sourceGeneration, 2);
    assert.notEqual(current.sourceDigest, historical);
    assert.equal(current.completion, undefined);
    assert.equal(current.work.synchronise.processed, 0);
    assert.equal(current.operations[0].evidence.historical, true);
  });
  it('dispatch recovery promotes only durably proven successful interrupted saves', async () => {
    await ready('proven', ['archive']);
    await ready('ambiguous', ['archive']);
    const stale = new Date(clock - 7200000).toISOString();
    await mongo.recordCol.updateMany(
      {},
      {
        $set: {
          'publicationSource.saves.0.outcome': 'initialising',
          'publicationSource.saves.0.requestedAt': stale,
          'publicationSource.pending': false,
          'publicationSource.initialising': true,
        },
      }
    );
    await mongo.recordCol.updateOne(
      { redboxOid: 'ambiguous' },
      { $unset: { 'publicationSource.saves.0.successfulSaveEvidence': '' } }
    );
    await dispatchPublications(runtime, 1);
    assert.deepEqual(
      deliveries.map(item => item.key.oid),
      ['proven']
    );
    assert.equal(await runtime.store.get({ ...key, oid: 'ambiguous' }), null);
    const ambiguous = publicationSource((await mongo.getMeta('ambiguous')).publicationSource);
    assert.equal(ambiguous.saves[0].outcome, 'quarantined');
    assert.equal(sends, 0);
  });
  it('renews record and shared-resource leases while source validation exceeds the lease duration', async () => {
    await imported();
    config.processing.heartbeatMs = 20;
    config.processing.leaseMs = 150;
    let renewals = 0;
    let resourceRenewals = 0;
    let finishing = false;
    const waiting: Array<{ until: number; done: () => void }> = [];
    const renew = runtime.store.renew.bind(runtime.store);
    runtime.store.renew = async (...args) => {
      const result = await renew(...args);
      // Advance elapsed lease time only after a real Mongo renewal. Host GC or
      // scheduling pauses cannot manufacture an expired lease in this test.
      clock += 25;
      renewals++;
      for (const check of waiting) if (clock >= check.until) check.done();
      return result;
    };
    const renewResource = runtime.resources.renew.bind(runtime.resources);
    runtime.resources.renew = async (...args) => {
      const result = await renewResource(...args);
      resourceRenewals++;
      return result;
    };
    runtime.verifyInputs = async (...args) => {
      if (!finishing) {
        const gate = deferred();
        waiting.push({ until: clock + 250, done: gate.resolve });
        await gate.promise;
      }
      await verifyPublicationInputs(runtime, ...args);
    };
    execute = async context => {
      try {
        return await context.withResourceLease('repository://slow', 'index', () => deposit(context));
      } finally {
        finishing = true;
        for (const check of waiting) check.done();
      }
    };
    await run();
    assert.ok(renewals >= 10, 'source validation spans more than one record lease duration');
    assert.ok(resourceRenewals >= 10, 'source validation also spans more than one resource lease duration');
    assert.equal(sends, 1);
    assert.equal((await row()).status, 'completed');
    assert.equal(
      (await runtime.resources.get({ providerId: 'ledger', namespace: 'repository://slow', resourceKey: 'index' }))
        ?.lease,
      null
    );
  });
  it('honours provider rate-limit deadlines longer than the bounded exponential backoff', async () => {
    await imported();
    execute = async context => ({
      kind: 'retryable_failure',
      state: context.state,
      category: 'rate_limit',
      message: 'Wait',
      retryAfterMs: 172800000,
    });
    await run();
    assert.equal((await row()).work.synchronise.dueAt, clock + 172800000);
    assert.equal((await row()).retry?.attempts, 1);
  });
  it('certifies non-application when authority changes after intent persistence but before send', async () => {
    await imported();
    const journal = runtime.store.journal.bind(runtime.store);
    runtime.store.journal = async (...args) => {
      const saved = await journal(...args);
      if (args[3].outcome === 'submitted')
        await mongo.updateMeta(brand, key.oid, { metadata: { title: 'changed-before-send' } });
      return saved;
    };
    await run();
    assert.equal(sends, 0);
    assert.equal((await row()).operations[0].outcome, 'not_applied');
    assert.equal((await row()).completion, undefined);
  });
  it('fences a newer import arriving during the final slow authority check before send', async () => {
    await imported();
    let checks = 0;
    runtime.verifyInputs = async (...args) => {
      await verifyPublicationInputs(runtime, ...args);
      if (++checks === 3) await importPublicationIntents(runtime, await ready(key.oid, ['archive']));
    };
    await run();
    const state = await row();
    assert.equal(checks, 3);
    assert.equal(sends, 0);
    assert.equal(state.sourceGeneration, 2);
    assert.equal(state.status, 'queued');
    assert.equal(state.operations[0].outcome, 'not_applied');
    assert.equal(state.providerState.deposited, undefined);
    assert.equal(state.work.synchronise.processed, 0);
  });
  it('fences a committed source edit during the final slow input check before dispatcher import', async () => {
    await imported();
    let checks = 0;
    runtime.verifyInputs = async (...args) => {
      await verifyPublicationInputs(runtime, ...args);
      if (++checks === 3) await mongo.updateMeta(brand, key.oid, { metadata: { title: 'changed-during-check' } });
    };
    await run();
    const state = await row();
    assert.equal(checks, 3);
    assert.equal(sends, 0);
    assert.equal(state.sourceGeneration, 1);
    assert.equal(state.status, 'revoked');
    assert.equal(state.waitingReason, 'approval_revoked');
    assert.equal(state.operations[0].outcome, 'not_applied');
    assert.equal(state.completion, undefined);
  });
  it('observation jobs cannot authorise a remote mutation', async () => {
    await imported();
    await run();
    const current = await row();
    await runtime.store.request(key, 'observe', current.revision, clock);
    await run();
    assert.equal(sends, 1);
    assert.equal((await row()).waitingReason, 'observation_is_read_only');
    assert.equal((await row()).work.observe.processed, 0);
  });
  function publicationAuditing() {
    const service = new AuditServices.IntegrationAuditService();
    service.storageService = mongo;
    runtime.recordAudit = async row => {
      await service.recordPublicationAudit(row);
      await runtime.store.acknowledgeAudit(row);
    };
    return service;
  }
  it('PUB-13 keeps one durable episode through repeated polling waits, retries and one terminal event', async () => {
    publicationAuditing();
    await ready(key.oid, ['archive']);
    await dispatchPublications(runtime);
    execute = async context => {
      await context.audit({ category: 'private', message: 'secret payload', evidence: { payload: 'secret-payload' } });
      return waiting(context);
    };
    for (let index = 0; index < 4; index++) {
      await runPublicationWorker(runtime, { attrs: { data: key } });
      clock += 100;
    }
    const db = client.db(database);
    assert.equal(await db.collection('integrationaudit').countDocuments({}), 1);
    const before = await runtime.store.get(key);
    assert.ok(before?.audit);
    execute = async context => ({
      kind: 'retryable_failure',
      state: context.state,
      category: 'transport',
      message: 'secret error',
    });
    await runPublicationWorker(runtime, { attrs: { data: key } });
    assert.equal(await db.collection('integrationaudit').countDocuments({}), 1);
    clock += 100;
    execute = deposit;
    await runPublicationWorker(runtime, { attrs: { data: key } });
    const done = await runtime.store.get(key);
    assert.ok(done?.audit?.closed);
    assert.equal(done.audit.episodeId, before.audit.episodeId);
    assert.equal(await db.collection('integrationaudit').countDocuments({}), 2);
    const persisted = await db.collection('integrationaudit').find({}).toArray();
    assert.deepEqual(persisted.map(row => row.status).sort(), ['started', 'success']);
    assert.ok(
      persisted.every(
        row =>
          row.destinationId === 'archive' && row.sourceGeneration === 1 && row.providerId === 'ledger' && row.approvalId
      )
    );
    assert.ok(persisted.find(row => row.status === 'success')?.operationId);
    for (const text of ['secret', 'prepared', 'sourceDescriptor', 'credentials', 'private'])
      assert.ok(!JSON.stringify(persisted).includes(text), text);
    await Promise.all(Array.from({ length: 10 }, () => runtime.recordAudit!(done)));
    assert.equal(await db.collection('integrationaudit').countDocuments({}), 2);
  });
  it('PUB-13 repairs a lost terminal audit write on dispatch even when completed work is no longer due', async () => {
    const audit = publicationAuditing();
    await ready(key.oid, ['archive']);
    await dispatchPublications(runtime);
    let lost = false;
    runtime.recordAudit = async row => {
      if (row.audit?.closed && !lost) {
        lost = true;
        throw new Error('simulated audit outage');
      }
      await audit.recordPublicationAudit(row);
    };
    await assert.rejects(runPublicationWorker(runtime, { attrs: { data: key } }), /audit outage/);
    const row = await runtime.store.get(key);
    assert.equal(row?.status, 'completed');
    assert.equal(row?.nextActionAt, null);
    assert.equal(await client.db(database).collection('integrationaudit').countDocuments({}), 1);
    await dispatchPublications(runtime, 1);
    assert.equal(await client.db(database).collection('integrationaudit').countDocuments({}), 2);
    await dispatchPublications(runtime, 1);
    assert.equal(await client.db(database).collection('integrationaudit').countDocuments({}), 2);
    assert.equal(sends, 1);
  });
  it('PUB-13 preserves old episode events when importing a newer request and closes repair exactly once', async () => {
    publicationAuditing();
    await ready(key.oid, ['archive']);
    await dispatchPublications(runtime);
    execute = async context => ({
      kind: 'repair_required',
      state: context.state,
      reason: 'uncertain_commit',
      evidence: { payload: 'secret' },
    });
    await runPublicationWorker(runtime, { attrs: { data: key } });
    const db = client.db(database);
    const original = await db.collection('integrationaudit').find({}).sort({ _id: 1 }).toArray();
    assert.equal(original.length, 2);
    await dispatchPublications(runtime);
    assert.deepEqual(await db.collection('integrationaudit').find({}).sort({ _id: 1 }).toArray(), original);
    await ready(key.oid, ['archive']);
    await dispatchPublications(runtime);
    execute = deposit;
    await runPublicationWorker(runtime, { attrs: { data: key } });
    assert.equal(await db.collection('integrationaudit').countDocuments({}), 4);
    assert.deepEqual(
      await db.collection('integrationaudit').find({ sourceGeneration: 1 }).sort({ _id: 1 }).toArray(),
      original
    );
    assert.equal(
      new Set((await db.collection('integrationaudit').find({}).toArray()).map(row => row.episodeId)).size,
      2
    );
  });
  it('reports workflow settlement failures without logging private publication rows', async () => {
    await imported();
    await run();
    const privateState = { dossier: 'private prepared snapshot', receipt: 'private provider evidence' };
    await client
      .db(database)
      .collection('publicationsync')
      .updateOne(key, {
        $set: { workflowPending: true, providerState: privateState },
      });
    runtime.prepareWorkflowTransition = async () => {
      throw new Error('No transition should be attempted during the configuration outage');
    };
    let configurationReads = 0;
    runtime.configuration = async () => {
      if (++configurationReads > 1) throw new Error('private configuration error');
      return config;
    };
    const reports: Array<{ category: string; scope: { brandId: string; oid?: string; destinationId?: string } }> = [];
    runtime.report = (category, scope) => reports.push({ category, scope });
    await dispatchPublications(runtime);
    assert.deepEqual(reports, [{ category: 'workflow_evaluation_failed', scope: key }]);
    const retained = await row();
    assert.equal(retained.workflowPending, true);
    assert.deepEqual(retained.providerState, privateState);
    assert.equal(sends, 1);
  });
  it('PUB-13 reads pending source before import and independent same-provider completion from real storage', async () => {
    await ready();
    let record = await mongo.getMeta(key.oid);
    assert.ok(record);
    let summaries = publicationLiveSummaries(record.publicationSource, [], config);
    assert.deepEqual(
      summaries.map(item => item.waitingReason),
      ['source_import_pending', 'source_import_pending']
    );
    assert.equal(await client.db(database).collection('integrationaudit').countDocuments({}), 0);
    await dispatchPublications(runtime);
    await runPublicationWorker(runtime, { attrs: { data: key } });
    record = await mongo.getMeta(key.oid);
    assert.ok(record);
    const rows = await runtime.store.forRecord(key.brandId, key.oid);
    summaries = publicationLiveSummaries(record.publicationSource, rows, config);
    assert.deepEqual(
      summaries.map(item => [item.destinationId, item.status]),
      [
        ['archive', 'success'],
        ['repository', 'pending'],
      ]
    );
    assert.deepEqual(await runtime.store.forRecord('other-brand', key.oid), []);
    const signals = publicationOperationalSignals(record.publicationSource, rows, summaries, clock);
    assert.equal(signals.pendingDestinations, 1);
    assert.ok(!JSON.stringify(summaries).includes('departed-approver'));
    await ready();
    record = await mongo.getMeta(key.oid);
    assert.ok(record);
    const next = publicationLiveSummaries(record.publicationSource, rows, config)[0];
    assert.equal(next.status, 'pending');
    assert.equal(next.completion?.current, false);
  });
  it('PUB-13 exposes the service read boundary without importing work or trusting another brand', async () => {
    await ready();
    const names = ['RecordsService', 'BrandingService', 'PublicationSync', 'StorageManagerService'];
    const previous = names.map(name => Reflect.get(globalThis, name));
    Reflect.set(globalThis, 'RecordsService', { getPublicationStorage: () => mongo });
    Reflect.set(globalThis, 'BrandingService', { getBrandById: () => brand });
    Reflect.set(globalThis, 'PublicationSync', { getDatastore: () => ({ manager: client.db(database) }) });
    Reflect.set(globalThis, 'StorageManagerService', {
      disk: () => new Disk(new FSDriver({ location: directory, visibility: 'private' })),
    });
    let target = 'verified-target';
    class ReadPublication extends PublicationServices.Publication {
      protected override configureProviders() {
        this.registerProvider({ ...provider, targetFingerprint: () => target });
      }
      public override getConfiguration() {
        return config;
      }
      protected override async sourceConfigurationContext() {
        return { authority: 'shared' as const };
      }
    }
    try {
      const service = new ReadPublication();
      const result = await service.getRecordStatus('brand', key.oid, {
        destinationId: 'archive',
        includeSignals: true,
      });
      assert.equal(result.integrations.length, 1);
      assert.equal(result.integrations[0].destinationId, 'archive');
      assert.ok(result.signals && result.signals.sourceLagMs >= 0);
      assert.equal(await client.db(database).collection('publicationsync').countDocuments({}), 0);
      await assert.rejects(service.getRecordStatus('other', key.oid), /brand mismatch/);
      await dispatchPublications(runtime);
      await runPublicationWorker(runtime, { attrs: { data: key } });
      const read = async () =>
        (await service.getRecordStatus('brand', key.oid, { destinationId: 'archive' })).integrations[0];
      assert.equal((await read()).completion?.current, true);
      const sent = sends;
      config.destinations.archive.connection.token = 'rotated-secret';
      assert.equal((await read()).status, 'success');
      config.destinations.archive.mapping = { title: 'changed' };
      const changed = await read();
      assert.equal(changed.waitingReason, 'material_configuration_changed');
      assert.equal(changed.completion?.current, false);
      config.destinations.archive.mapping = {};
      target = 'other-target';
      assert.equal((await read()).waitingReason, 'target_identity_changed');
      assert.equal(sends, sent);
    } finally {
      names.forEach((name, index) => {
        if (previous[index] === undefined) Reflect.deleteProperty(globalThis, name);
        else Reflect.set(globalThis, name, previous[index]);
      });
    }
  });
  it('PUB-13 stores idempotent audit events using native Mongo without rewriting legacy history', async () => {
    const service = publicationAuditing();
    await ready(key.oid, ['archive']);
    await dispatchPublications(runtime);
    await client
      .db(database)
      .collection('integrationaudit')
      .insertOne({ redboxOid: key.oid, integrationName: 'doi', message: 'historical', traceId: 'legacy' });
    await runPublicationWorker(runtime, { attrs: { data: key } });
    const row = await runtime.store.get(key);
    assert.ok(row);
    const entries = publicationAuditEntries(row);
    assert.equal(entries.length, 2);
    await Promise.all(entries.flatMap(entry => Array.from({ length: 8 }, () => mongo.createIntegrationAudit(entry))));
    assert.equal(await client.db(database).collection('integrationaudit').countDocuments({}), 3);
    const old = await client.db(database).collection('integrationaudit').findOne({ traceId: 'legacy' });
    assert.equal(old?.message, 'historical');
    assert.equal(old?.destinationId, undefined);
    const restarted = new AuditServices.IntegrationAuditService();
    restarted.storageService = mongo;
    await restarted.recordPublicationAudit(row);
    await service.recordPublicationAudit(row);
    assert.equal(await client.db(database).collection('integrationaudit').countDocuments({}), 3);
  });
  it('PUB-13 filters stored audit history by brand/destination without excluding historical unbranded integrations', async () => {
    publicationAuditing();
    await ready();
    await dispatchPublications(runtime);
    await runPublicationWorker(runtime, { attrs: { data: key } });
    await runPublicationWorker(runtime, { attrs: { data: { ...key, destinationId: 'repository' } } });
    const db = client.db(database);
    await db.collection('integrationaudit').insertMany([
      {
        redboxOid: key.oid,
        integrationName: 'doi',
        traceId: 'legacy',
        spanId: 'old',
        status: 'success',
        startedAt: new Date(clock).toISOString(),
      },
      {
        redboxOid: key.oid,
        brandId: 'foreign',
        destinationId: 'foreign',
        integrationName: 'ledger',
        traceId: 'foreign',
        spanId: 'f',
        status: 'success',
        startedAt: new Date(clock).toISOString(),
      },
    ]);
    const previous = Reflect.get(globalThis, 'IntegrationAudit');
    const filter = (criteria: Record<string, unknown>) => {
      const { or, ...where } = criteria;
      return Array.isArray(or) ? { ...where, $or: or } : where;
    };
    Reflect.set(globalThis, 'IntegrationAudit', {
      getDatastore: () => ({ manager: db }),
      find: (criteria: Record<string, unknown>) => {
        const cursor = db.collection('integrationaudit').find(filter(criteria));
        const query = {
          sort: (values: Array<Record<string, string>>) => {
            cursor.sort(
              Object.fromEntries(
                values.flatMap(value => Object.entries(value).map(([name, order]) => [name, order === 'DESC' ? -1 : 1]))
              )
            );
            return query;
          },
          skip: (value: number) => {
            cursor.skip(value);
            return query;
          },
          limit: (value: number) => {
            cursor.limit(value);
            return query;
          },
          then: (resolve: (value: Record<string, unknown>[]) => unknown, reject: (error: unknown) => unknown) =>
            cursor.toArray().then(resolve, reject),
        };
        return query;
      },
      count: (criteria: Record<string, unknown>) => db.collection('integrationaudit').countDocuments(filter(criteria)),
    });
    try {
      const service = new AuditServices.IntegrationAuditService();
      service.storageService = mongo;
      const params = new IntegrationAuditParams();
      params.oid = key.oid;
      params.brandId = key.brandId;
      const summaries = await service.getStatusSummary(params);
      assert.equal(summaries.length, 3);
      assert.ok(summaries.some(item => item.integrationName === 'doi' && !item.destinationId));
      assert.deepEqual(
        summaries
          .filter(item => item.providerId === 'ledger')
          .map(item => item.destinationId)
          .sort(),
        ['archive', 'repository']
      );
      params.destinationId = 'repository';
      const selected = await service.getTraceAuditLog(params);
      assert.equal(selected.total, 1);
      assert.equal(selected.rows[0].destinationId, 'repository');
      assert.equal((await service.getAuditLog(params)).total, 2);
      params.brandId = 'foreign';
      assert.equal((await service.getTraceAuditLog(params)).total, 0);
    } finally {
      Reflect.set(globalThis, 'IntegrationAudit', previous);
    }
  });
});
