import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import {
  PublicationExecution,
  PublicationProviderRegistry,
  PublicationResourceStore,
  PublicationSyncStore,
  PublicationPublishing,
  publicationOperationEvidence,
  currentPublicationCompletion,
  type PublicationOperation,
  type PublicationWorkKey,
  type PublicationObject,
  type PublicationProvider,
} from '@researchdatabox/redbox-core';
import { corruptPublicationEvidence, publicationEvidenceFields } from '../fixtures/publicationEvidence';

if (process.env.CI && !process.env.MONGO_TEST_URL) throw new Error('evidence acceptance requires real Mongo');
const suite = process.env.MONGO_TEST_URL ? describe : describe.skip;
suite('shared operation evidence boundaries (real Mongo)', function () {
  this.timeout(20000);
  const database = `publication_evidence_${randomUUID().replaceAll('-', '')}`;
  const key: PublicationWorkKey = { brandId: 'brand', oid: 'record', destinationId: 'archive' };
  const remote = { namespace: 'provider://repository', objectId: 'object-1' };
  let client: MongoClient,
    store: PublicationSyncStore,
    resources: PublicationResourceStore,
    registry: PublicationProviderRegistry,
    execution: PublicationExecution;
  let operation: PublicationOperation;
  before(async () => {
    client = await new MongoClient(process.env.MONGO_TEST_URL!).connect();
  });
  after(async () => {
    await client.db(database).dropDatabase();
    await client.close();
  });
  beforeEach(async () => {
    await client.db(database).dropDatabase();
    store = new PublicationSyncStore(client.db(database));
    resources = new PublicationResourceStore(client.db(database));
    await store.ensureIndexes();
    await resources.ensureIndexes();
    await store.initialise(key, 'fixture', 'fixed-target');
    await store.importRequest(
      key,
      {
        sourceGeneration: 1,
        sourceRevision: 1,
        approvalId: 'approval',
        approvalEpoch: 1,
        sourceDigest: 'source',
        configurationDigest: 'configuration',
        source: { encodingVersion: 1, disk: 'durable', key: 'brand/source', digest: 'a'.repeat(64) },
      },
      Date.now()
    );
    const claimed = await store.claim(key, 'worker', 30000);
    assert.ok(claimed?.lease);
    registry = new PublicationProviderRegistry();
    const provider: PublicationProvider<PublicationObject, PublicationObject, PublicationObject> = {
      id: 'fixture',
      contractVersion: 2,
      stateVersion: 1,
      configurationSchema: {},
      secretPaths: [],
      mutationRecovery: { mode: 'idempotency-key' },
      capabilities: { synchronise: true, observe: true, reconcile: true, resourceLeases: true },
      validateConfiguration: () => ({ valid: true, value: {} }),
      targetFingerprint: () => 'fixed-target',
      decodeState: value => ({ valid: true, value: Object.assign({}, value) }),
      upgradeState: () => ({ valid: true, value: {} }),
      decodePreparedSource: () => ({ valid: true, value: {} }),
      prepareSource: async () => ({ valid: true, value: {} }),
      synchronise: async ctx => ({ kind: 'waiting', state: ctx.state, reason: 'test' }),
      observe: async ctx => ({ kind: 'waiting', state: ctx.state, reason: 'test' }),
      reconcile: async ctx => ({ kind: 'waiting', state: ctx.state, reason: 'test' }),
      repairs: [],
    };
    registry.register(provider);
    registry.freeze();
    execution = new PublicationExecution(
      claimed,
      store,
      resources,
      registry,
      new PublicationPublishing().processing,
      async () => {}
    );
    await execution.bind({ ...remote, targetFingerprint: 'fixed-target', evidence: { verified: true } });
    operation = {
      id: randomUUID(),
      kind: 'deposit',
      approvalId: 'approval',
      approvalEpoch: 1,
      sourceGeneration: 1,
      intendedDigest: 'approved-mutation',
      submittedAt: new Date().toISOString(),
      outcome: 'submitted',
      evidence: { priorHead: 'v1' },
    };
  });
  afterEach(async () => {
    await execution.close();
  });
  for (const outcome of ['confirmed', 'not_applied', 'rejected'] as const)
    for (const field of publicationEvidenceFields) {
      it(`settlement ${outcome} rejects ${field} without replacing durable intent`, async () => {
        await execution.mutate(operation, async () => {});
        const original = execution.state.operations[0];
        const proof = publicationOperationEvidence(execution.state, original, remote);
        const reported = {
          ...original,
          outcome,
          confirmation: corruptPublicationEvidence(proof, field),
          evidence: { receipt: 'mismatched-receipt' },
        };
        await assert.rejects(execution.journal(reported), /publication_operation_evidence_mismatch/);
        const saved = await store.get(key);
        assert.ok(saved);
        assert.equal(saved.status, 'repair_required');
        assert.deepEqual(saved.operations, [original]);
        assert.deepEqual(
          saved.operationEvidenceFailures?.[0].reported,
          JSON.parse(JSON.stringify(reported, (_key, value) => (value === undefined ? null : value)))
        );
        assert.equal(saved.completion, undefined);
        await assert.rejects(
          execution.mutate({ ...operation, id: randomUUID() }, async () => assert.fail('No second send')),
          /publication_operation_evidence_mismatch/
        );
      });
    }
  for (const field of publicationEvidenceFields) {
    it(`acknowledgement rechecks retained ${field} proof`, async () => {
      await execution.mutate(operation, async () => {});
      const original = execution.state.operations[0];
      const confirmation = publicationOperationEvidence(execution.state, original, remote);
      await execution.journal({ ...original, outcome: 'confirmed', confirmation });
      // An old worker/imported snapshot may have checkpointed a receipt without the new contract.
      const corrupted = corruptPublicationEvidence(confirmation, field);
      if (corrupted) await store.collection.updateOne(key, { $set: { 'operations.0.confirmation': corrupted } });
      else await store.collection.updateOne(key, { $unset: { 'operations.0.confirmation': '' } });
      await assert.rejects(
        execution.checkpoint({ accepted: true }, false, [operation.id]),
        /publication_operation_evidence_mismatch/
      );
      const saved = await store.get(key);
      assert.ok(saved);
      assert.equal(saved.status, 'repair_required');
      assert.deepEqual(saved.providerState, {});
      assert.notEqual(saved.operations[0].checkpointed, true);
      assert.ok(saved.operationEvidenceFailures?.length);
    });
  }
  for (const originalPresent of [true, false])
    for (const field of publicationEvidenceFields) {
      it(`shared-resource recovery rejects ${field} using ${originalPresent ? 'original row' : 'frozen identity'}`, async () => {
        const resourceKey = { providerId: 'fixture', namespace: 'repository', resourceKey: 'index' };
        await execution.withResourceLease(resourceKey.namespace, resourceKey.resourceKey, () =>
          execution.mutate(operation, async () => {})
        );
        const original = execution.state.operations[0];
        const proof = publicationOperationEvidence(execution.state, original, remote);
        const before = await resources.get(resourceKey);
        assert.ok(before);
        if (!originalPresent) await store.collection.deleteOne(key);
        const successor = { ...key, oid: 'successor', destinationId: 'other-archive' };
        const row = await store.initialise(successor, 'fixture', 'different-target');
        await store.request(successor, 'synchronise', row.revision);
        const claimed = await store.claim(successor, 'successor-worker', 30000);
        assert.ok(claimed);
        const next = new PublicationExecution(
          claimed,
          store,
          resources,
          registry,
          new PublicationPublishing().processing,
          async () => {}
        );
        try {
          await assert.rejects(
            next.withResourceLease(resourceKey.namespace, resourceKey.resourceKey, async context => {
              await context.journal({
                ...original,
                outcome: 'confirmed',
                confirmation: corruptPublicationEvidence(proof, field),
              });
            }),
            /publication_operation_evidence_mismatch/
          );
          const saved = await store.get(successor);
          assert.ok(saved);
          assert.equal(saved.status, 'repair_required');
          assert.equal(saved.operationEvidenceFailures?.[0].operationId, original.id);
          assert.equal(saved.operationEvidenceFailures?.[0].field, field.startsWith('remote.') ? 'remote' : field);
          assert.equal(saved.completion, undefined);
          assert.deepEqual((await resources.get(resourceKey))?.operations, before.operations);
          if (originalPresent) assert.deepEqual((await store.get(key))?.operations, [original]);
        } finally {
          await next.close();
        }
      });
    }
  it('refuses a legacy resource receipt whose original work and frozen identity are unavailable', async () => {
    const resourceKey = { providerId: 'fixture', namespace: 'repository', resourceKey: 'index' };
    await execution.withResourceLease(resourceKey.namespace, resourceKey.resourceKey, () =>
      execution.mutate(operation, async () => {})
    );
    const original = execution.state.operations[0];
    const confirmation = publicationOperationEvidence(execution.state, original, remote);
    await resources.collection.updateOne(resourceKey, {
      $unset: { 'operations.0.operation.identity': '', 'operations.0.operation.idempotencyKey': '' },
    });
    await store.collection.deleteOne(key);
    const successor = { ...key, oid: 'successor', destinationId: 'other-archive' };
    const row = await store.initialise(successor, 'fixture', 'different-target');
    await store.request(successor, 'synchronise', row.revision);
    const claimed = await store.claim(successor, 'successor-worker', 30000);
    assert.ok(claimed);
    const next = new PublicationExecution(
      claimed,
      store,
      resources,
      registry,
      new PublicationPublishing().processing,
      async () => {}
    );
    try {
      const before = await resources.get(resourceKey);
      assert.ok(before);
      await assert.rejects(
        next.withResourceLease(resourceKey.namespace, resourceKey.resourceKey, context =>
          context.journal({ ...before.operations[0].operation, outcome: 'confirmed', confirmation })
        ),
        /legacy_identity_incomplete/
      );
      const saved = await store.get(successor);
      assert.ok(saved);
      assert.equal(saved.status, 'repair_required');
      assert.equal(saved.operationEvidenceFailures?.[0].field, 'legacy_identity_incomplete');
      assert.deepEqual((await resources.get(resourceKey))?.operations, before.operations);
      assert.equal(saved.completion, undefined);
    } finally {
      await next.close();
    }
  });
  for (const shape of ['missing', 'duplicate', 'unrelated', 'missing-envelope'] as const) {
    it(`completion refuses ${shape} operation proof sets`, async () => {
      await execution.mutate(operation, async () => {});
      const proof = publicationOperationEvidence(execution.state, operation, remote);
      await execution.journal({ ...operation, outcome: 'confirmed', confirmation: proof });
      await execution.checkpoint({}, false, [operation.id]);
      const original = execution.state.operations;
      const operations =
        shape === 'missing'
          ? []
          : shape === 'duplicate'
            ? [proof, proof]
            : [proof, { ...proof, operationId: 'unrelated' }];
      const outcome: Parameters<PublicationExecution['acceptOutcome']>[0] = {
        kind: 'completed',
        state: {},
        links: {},
        evidence: {
          approvalId: 'approval',
          approvalEpoch: 1,
          sourceGeneration: 1,
          sourceDigest: 'source',
          confirmedAt: new Date().toISOString(),
          remote,
          deposit: {},
          operations,
          ingestion: { state: 'not_required', evidence: {} },
          visibility: 'unverified',
        },
      };
      if (shape === 'missing-envelope') Reflect.deleteProperty(outcome, 'evidence');
      await assert.rejects(execution.acceptOutcome(outcome), /publication_operation_evidence_mismatch/);
      const saved = await store.get(key);
      assert.ok(saved);
      assert.equal(saved.status, 'repair_required');
      assert.deepEqual(saved.operations, original);
      assert.equal(saved.completion, undefined);
      assert.ok(saved.operationEvidenceFailures?.length);
      await assert.rejects(
        execution.acceptOutcome({ kind: 'waiting', state: {}, reason: 'ignored-refusal' }),
        /publication_operation_evidence_mismatch/
      );
      await assert.rejects(execution.assertAuthority(), /publication_operation_evidence_mismatch/);
    });
  }
  it('unverified legacy confirmation cannot override the bound remote identity', async () => {
    const legacy = {
      ...operation,
      outcome: 'uncertain' as const,
      confirmation: publicationOperationEvidence(execution.state, operation, {
        ...remote,
        objectId: 'different-object',
      }),
    };
    await store.collection.updateOne(key, { $set: { operations: [legacy] } });
    await assert.rejects(
      execution.journal({ ...legacy, outcome: 'confirmed' }),
      /publication_operation_evidence_mismatch:remote/
    );
    const saved = await store.get(key);
    assert.ok(saved);
    assert.equal(saved.status, 'repair_required');
    assert.deepEqual(saved.operations, [legacy]);
    assert.equal(saved.completion, undefined);
  });
  it('stops acceptance even when the rejection persistence response is lost', async () => {
    await execution.mutate(operation, async () => {});
    const original = execution.state.operations[0];
    const proof = publicationOperationEvidence(execution.state, original, remote);
    await execution.journal({ ...original, outcome: 'confirmed', confirmation: proof });
    await execution.checkpoint({}, false, [operation.id]);
    const checkpoint = store.checkpoint;
    let lost = false;
    store.checkpoint = async (...args: Parameters<PublicationSyncStore['checkpoint']>) => {
      const saved = await checkpoint.apply(store, args);
      if (!lost && args[3].operationEvidenceFailures?.length) {
        lost = true;
        throw new Error('Lost rejection persistence response');
      }
      return saved;
    };
    try {
      await assert.rejects(
        execution.journal({
          ...original,
          outcome: 'confirmed',
          confirmation: { ...proof, intendedDigest: 'different' },
        }),
        /Lost rejection persistence response/
      );
      assert.equal(lost, true);
      const saved = await store.get(key);
      assert.ok(saved);
      assert.equal(saved.status, 'repair_required');
      assert.equal(saved.operationEvidenceFailures?.[0].field, 'intendedDigest');
      assert.deepEqual(saved.operations, execution.state.operations);
      await assert.rejects(
        execution.acceptOutcome({
          kind: 'completed',
          state: {},
          links: {},
          evidence: {
            approvalId: 'approval',
            approvalEpoch: 1,
            sourceGeneration: 1,
            sourceDigest: 'source',
            confirmedAt: new Date().toISOString(),
            remote,
            deposit: {},
            operations: [proof],
            ingestion: { state: 'not_required', evidence: {} },
            visibility: 'unverified',
          },
        }),
        /publication_operation_evidence_mismatch:intended_digest/
      );
      await assert.rejects(execution.assertAuthority(), /publication_operation_evidence_mismatch:intended_digest/);
    } finally {
      store.checkpoint = checkpoint;
    }
  });
  for (const missing of [
    'id',
    'approvalId',
    'approvalEpoch',
    'sourceGeneration',
    'intendedDigest',
    'submittedAt',
    'kind',
  ] as const) {
    it(`refuses legacy operation missing ${missing} rather than borrowing current authority`, async () => {
      const legacy = {
        ...operation,
        approvalId: '',
        approvalEpoch: 0,
        sourceGeneration: 40,
        outcome: 'uncertain' as const,
      };
      const confirmation = publicationOperationEvidence(execution.state, legacy, remote);
      Reflect.deleteProperty(legacy, missing);
      await store.collection.updateOne(key, { $set: { operations: [legacy] } });
      await assert.rejects(
        execution.journal({ ...legacy, outcome: 'confirmed', confirmation }),
        /legacy_identity_incomplete/
      );
      const saved = await store.get(key);
      assert.ok(saved);
      assert.deepEqual(saved.operations, [legacy]);
      assert.equal(saved.status, 'repair_required');
      assert.equal(saved.completion, undefined);
    });
  }
  it('explicitly matches complete historical coordinates without a stored host key or submission identity', async () => {
    const legacy = {
      ...operation,
      approvalId: '',
      approvalEpoch: 0,
      sourceGeneration: 40,
      outcome: 'uncertain' as const,
    };
    await store.collection.updateOne(key, { $set: { operations: [legacy] } });
    const confirmation = publicationOperationEvidence(execution.state, legacy, remote);
    await execution.journal({ ...legacy, outcome: 'confirmed', confirmation });
    await execution.checkpoint({}, false, [legacy.id]);
    const saved = await store.get(key);
    assert.ok(saved);
    assert.equal(saved.operations[0].checkpointed, true);
    assert.equal(saved.operations[0].approvalId, '');
    assert.equal(saved.operations[0].sourceGeneration, 40);
    assert.equal(saved.operations[0].idempotencyKey, undefined);
    assert.equal(saved.operations[0].identity, undefined);
    assert.equal(saved.approvalId, 'approval');
    assert.equal(saved.completion, undefined);
  });
  it('refuses stored pre-contract completion until exact operation evidence is supplied', async () => {
    await execution.mutate(operation, async () => {});
    const proof = publicationOperationEvidence(execution.state, operation, remote);
    await execution.journal({ ...operation, outcome: 'confirmed', confirmation: proof });
    await execution.checkpoint({}, false, [operation.id]);
    const completion = {
      approvalId: 'approval',
      approvalEpoch: 1,
      sourceGeneration: 1,
      sourceDigest: 'source',
      confirmedAt: new Date().toISOString(),
      remote,
      deposit: {},
      ingestion: { state: 'not_required' as const, evidence: {} },
      visibility: 'unverified' as const,
    };
    const work = structuredClone(execution.state.work);
    work.synchronise.processed = work.synchronise.requested;
    work.synchronise.dueAt = null;
    await store.collection.updateOne(key, { $set: { status: 'completed', completion, work } });
    const record = {
      publicationSource: {
        schemaVersion: 1,
        revision: 1,
        pending: false,
        initialising: false,
        approvals: [],
        saves: [],
        intents: {
          archive: {
            destinationId: 'archive',
            generation: 1,
            approvalId: 'approval',
            approvalEpoch: 1,
            sourceRevision: 1,
            pending: false,
            requestedAt: new Date().toISOString(),
          },
        },
      },
    };
    await client.db(database).collection('record').insertOne(record);
    const savedRecord = await client.db(database).collection('record').findOne({});
    assert.ok(savedRecord);
    const historical = await store.get(key);
    assert.ok(historical);
    assert.equal(currentPublicationCompletion(savedRecord, historical), false);
    await store.collection.updateOne(key, { $set: { 'completion.operations': [proof] } });
    const verified = await store.get(key);
    assert.ok(verified);
    assert.equal(currentPublicationCompletion(savedRecord, verified), true);
    assert.deepEqual(verified.operations, historical.operations);
  });
});
