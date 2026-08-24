import assert from 'node:assert/strict';
import type { StorageMutationResponse } from '../StorageServiceResponse';
import type { StorageService } from '../StorageService';
import type { RecordStorageMutationOptions } from '../RecordStorageConcurrency';

/**
 * The subset of {@link StorageService} a storage adapter must implement before
 * it can advertise the record-concurrency capability.
 */
export type RecordConcurrencyAdapter = Required<
  Pick<
    StorageService,
    | 'getCapabilities'
    | 'getTombstone'
    | 'getLifecycleTombstones'
    | 'create'
    | 'updateMeta'
    | 'removeActiveRecord'
    | 'createTombstone'
    | 'updateTombstone'
    | 'removeTombstone'
    | 'createActiveRecordFromTombstone'
  >
>;

/**
 * Bindings a storage adapter provides so the shared conformance checks can
 * seed and observe its real datastore.
 */
export interface StorageConcurrencyConformanceHarness {
  adapter: RecordConcurrencyAdapter;
  /** Brand the seeded records belong to; passed verbatim to the adapter. */
  brand: unknown;
  /** A distinct brand used to prove cross-brand no-match classification. */
  otherBrand: unknown;
  seedActive(record: Record<string, unknown>): Promise<void>;
  seedTombstone(record: Record<string, unknown>): Promise<void>;
  readActive(oid: string): Promise<Record<string, unknown> | null>;
  readTombstone(oid: string): Promise<Record<string, unknown> | null>;
  /**
   * Dispatch an update whose outcome the driver cannot certify, for example by
   * making the underlying operation throw after it was sent.
   */
  dispatchAmbiguousUpdate(options: RecordStorageMutationOptions): Promise<StorageMutationResponse>;
}

export interface StorageConcurrencyConformanceCheck {
  readonly name: string;
  run(harness: StorageConcurrencyConformanceHarness): Promise<void>;
}

const exact = (revision: number): RecordStorageMutationOptions => ({
  precondition: { expectedRevision: revision, requireRevision: true },
});

const lifecycleExact = (
  revision: number,
  expectedState: 'delete-pending' | 'deleted' | 'restore-pending' | 'purge-pending' | 'recovery-required',
  operationId: string
): RecordStorageMutationOptions => ({
  ...exact(revision),
  lifecycle: { expectedState, operationId },
});

/**
 * Behavioural contract every storage adapter must satisfy before a record type
 * may run in strict concurrent-modification mode.
 *
 * The checks are deliberately free of any test framework: adapters register
 * them with whichever runner they already use, for example
 * `for (const check of STORAGE_CONCURRENCY_CONFORMANCE_CHECKS) it(check.name,
 * () => check.run(harness))`. Declaring the capability without passing these
 * against the adapter's real dialect is not sufficient.
 */
export const STORAGE_CONCURRENCY_CONFORMANCE_CHECKS: readonly StorageConcurrencyConformanceCheck[] = [
  {
    name: 'declares every required concurrency primitive',
    async run(harness) {
      const capability = harness.adapter.getCapabilities?.().recordConcurrency;
      assert.equal(capability?.conditionalActiveCreate, true);
      assert.equal(capability?.conditionalActiveUpdate, true);
      assert.equal(capability?.conditionalActiveRemove, true);
      assert.equal(capability?.conditionalTombstoneCreate, true);
      assert.equal(capability?.conditionalTombstoneUpdate, true);
      assert.equal(capability?.conditionalTombstoneRemove, true);
      assert.equal(capability?.certifiedNonApplicationReasons, true);
      assert.equal(capability?.revisionLineage, true);
    },
  },
  {
    name: 'creates a server-revisioned record and strips a supplied revision',
    async run(harness) {
      const created = await harness.adapter.create(
        harness.brand,
        { redboxOid: 'active-create', revision: 77, metadata: { title: 'created' } },
        undefined
      );
      assert.equal(created.applicationState, 'applied');
      assert.equal(created.committedRevision, 0);
      assert.equal((await harness.readActive('active-create'))?.revision, 0);
    },
  },
  {
    name: 'applies one matching update and certifies a stale replay',
    async run(harness) {
      await harness.seedActive({ redboxOid: 'active-update', revision: 2, metadata: { title: 'base' } });
      const applied = await harness.adapter.updateMeta(
        harness.brand,
        'active-update',
        { metadata: { title: 'winner' }, revision: 100 },
        undefined,
        exact(2)
      );
      const stale = await harness.adapter.updateMeta(
        harness.brand,
        'active-update',
        { metadata: { title: 'loser' } },
        undefined,
        exact(2)
      );
      assert.equal(applied.applicationState, 'applied');
      assert.equal(applied.committedRevision, 3);
      assert.equal(stale.applicationState, 'not-applied');
      assert.equal(stale.nonApplicationReason, 'stale-revision');
      assert.equal((await harness.readActive('active-update'))?.revision, 3);
    },
  },
  {
    name: 'never persists a client-supplied revision',
    async run(harness) {
      await harness.seedActive({ redboxOid: 'client-revision', revision: 1, metadata: {} });
      const applied = await harness.adapter.updateMeta(
        harness.brand,
        'client-revision',
        { metadata: { title: 'ok' }, revision: 900 },
        undefined,
        exact(1)
      );
      assert.equal(applied.committedRevision, 2);
      assert.equal((await harness.readActive('client-revision'))?.revision, 2);
    },
  },
  {
    name: 'keeps tokenless compatibility while atomically initializing one legacy winner',
    async run(harness) {
      await harness.seedActive({ redboxOid: 'tokenless', revision: 4, metadata: {} });
      const tokenless = await harness.adapter.updateMeta(harness.brand, 'tokenless', {
        metadata: { title: 'compatible' },
      });
      assert.equal(tokenless.applicationState, 'applied');
      assert.equal(tokenless.committedRevision, 5);

      await harness.seedActive({ redboxOid: 'legacy-missing-revision', metadata: {} });
      const exactInitial = exact(0);
      const contenders = await Promise.all([
        harness.adapter.updateMeta(
          harness.brand,
          'legacy-missing-revision',
          { metadata: { title: 'first' } },
          undefined,
          exactInitial
        ),
        harness.adapter.updateMeta(
          harness.brand,
          'legacy-missing-revision',
          { metadata: { title: 'second' } },
          undefined,
          exactInitial
        ),
      ]);
      assert.equal(contenders.filter(result => result.applicationState === 'applied').length, 1);
      assert.equal(contenders.filter(result => result.nonApplicationReason === 'stale-revision').length, 1);
      assert.equal((await harness.readActive('legacy-missing-revision'))?.revision, 1);
    },
  },
  {
    name: 'conditionally removes active state and classifies a deleted record',
    async run(harness) {
      await harness.seedActive({ redboxOid: 'active-remove', revision: 4, metadata: {} });
      const removed = await harness.adapter.removeActiveRecord?.(harness.brand, 'active-remove', exact(4));
      assert.equal(removed?.applicationState, 'applied');
      assert.equal(removed?.removedRecord?.revision, 4);
      assert.equal(await harness.readActive('active-remove'), null);

      await harness.seedTombstone({ redboxOid: 'active-remove', revision: 5, lifecycleState: 'deleted' });
      const deleted = await harness.adapter.updateMeta(
        harness.brand,
        'active-remove',
        { metadata: {} },
        undefined,
        exact(4)
      );
      assert.equal(deleted.applicationState, 'not-applied');
      assert.equal(deleted.nonApplicationReason, 'deleted');
    },
  },
  {
    name: 'classifies a mutation against an unknown record as not-found',
    async run(harness) {
      const missing = await harness.adapter.updateMeta(
        harness.brand,
        'never-existed',
        { metadata: {} },
        undefined,
        exact(0)
      );
      assert.equal(missing.applicationState, 'not-applied');
      assert.equal(missing.nonApplicationReason, 'not-found');
    },
  },
  {
    name: 'classifies a cross-brand match without returning its state',
    async run(harness) {
      await harness.seedActive({ redboxOid: 'other-brand', revision: 1, metadata: { secret: true } });
      const mismatch = await harness.adapter.updateMeta(
        harness.otherBrand,
        'other-brand',
        { metadata: {} },
        undefined,
        exact(1)
      );
      assert.equal(mismatch.applicationState, 'not-applied');
      assert.equal(mismatch.nonApplicationReason, 'brand-mismatch');
      assert.equal(mismatch.committedRecord, undefined);
      assert.equal(mismatch.metadata, null);
    },
  },
  {
    name: 'creates one owned tombstone intent and certifies same-operation retries',
    async run(harness) {
      const operationId = '11111111-1111-4111-8111-111111111111';
      const tombstone = {
        redboxOid: 'tombstone-create',
        revision: 5,
        brandId: 'brand-1',
        lifecycleState: 'delete-pending' as const,
        lifecycleOperation: {
          operationId,
          kind: 'delete' as const,
          requestId: '22222222-2222-4222-8222-222222222222',
          sourceRevision: 4,
          targetRevision: 5,
          startedAt: '2026-08-24T00:00:00.000Z',
          updatedAt: '2026-08-24T00:00:00.000Z',
          attempts: 1,
          resolution: 'direct' as const,
        },
        deletedRecordMetadata: {
          redboxOid: 'tombstone-create',
          revision: 4,
          metaMetadata: { brandId: 'brand-1' },
          metadata: {},
        },
        dateDeleted: '2026-08-24T00:00:00.000Z',
      };
      const options = lifecycleExact(4, 'delete-pending', operationId);
      const first = await harness.adapter.createTombstone(harness.brand, tombstone.redboxOid, tombstone, options);
      const retry = await harness.adapter.createTombstone(harness.brand, tombstone.redboxOid, tombstone, options);
      const competingOperationId = '33333333-3333-4333-8333-333333333333';
      const competitor = await harness.adapter.createTombstone(
        harness.brand,
        tombstone.redboxOid,
        {
          ...tombstone,
          lifecycleOperation: { ...tombstone.lifecycleOperation, operationId: competingOperationId },
        },
        lifecycleExact(4, 'delete-pending', competingOperationId)
      );

      assert.equal(first.applicationState, 'applied');
      assert.equal(first.committedRevision, 5);
      assert.equal(retry.applicationState, 'applied');
      assert.equal(competitor.applicationState, 'not-applied');
      assert.equal(competitor.nonApplicationReason, 'lifecycle-conflict');
      assert.equal(
        ((await harness.readTombstone(tombstone.redboxOid))?.deletedRecordMetadata as Record<string, unknown>)
          ?.revision,
        undefined
      );
    },
  },
  {
    name: 'creates one restored active record and makes recovery delivery idempotent',
    async run(harness) {
      const operationId = '44444444-4444-4444-8444-444444444444';
      const operation = {
        operationId,
        kind: 'restore' as const,
        requestId: '55555555-5555-4555-8555-555555555555',
        sourceRevision: 5,
        targetRevision: 6,
        startedAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:00.000Z',
        attempts: 1,
        resolution: 'direct' as const,
      };
      await harness.seedTombstone({
        redboxOid: 'restore-create',
        revision: 6,
        lifecycleState: 'restore-pending',
        lifecycleOperation: operation,
        deletedRecordMetadata: {
          redboxOid: 'restore-create',
          dateCreated: '2026-08-01T00:00:00.000Z',
          metaMetadata: { brandId: 'brand-1' },
          metadata: { title: 'authoritative snapshot' },
        },
      });
      const candidate = {
        redboxOid: 'restore-create',
        revision: 999,
        lifecycleOperationId: 'client-owned',
        metaMetadata: { brandId: 'brand-1' },
        metadata: {},
      };
      const options = lifecycleExact(6, 'restore-pending', operationId);
      const first = await harness.adapter.createActiveRecordFromTombstone(
        harness.brand,
        candidate.redboxOid,
        candidate,
        options
      );
      const retry = await harness.adapter.createActiveRecordFromTombstone(
        harness.brand,
        candidate.redboxOid,
        candidate,
        options
      );

      assert.equal(first.applicationState, 'applied');
      assert.equal(first.committedRevision, 7);
      assert.equal(retry.applicationState, 'applied');
      assert.equal((await harness.readActive(candidate.redboxOid))?.revision, 7);
      assert.equal((await harness.readActive(candidate.redboxOid))?.lifecycleOperationId, operationId);
      assert.equal((await harness.readActive(candidate.redboxOid))?.dateCreated, '2026-08-01T00:00:00.000Z');
      assert.deepEqual((await harness.readActive(candidate.redboxOid))?.metadata, {
        title: 'authoritative snapshot',
      });
    },
  },
  {
    name: 'conditionally claims restore state and purges the exact tombstone',
    async run(harness) {
      const restoreOperationId = '66666666-6666-4666-8666-666666666666';
      const restoreOperation = {
        operationId: restoreOperationId,
        kind: 'restore' as const,
        requestId: '77777777-7777-4777-8777-777777777777',
        sourceRevision: 5,
        targetRevision: 6,
        startedAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:00.000Z',
        attempts: 1,
        resolution: 'direct' as const,
      };
      await harness.seedTombstone({
        redboxOid: 'tombstone',
        revision: 5,
        lifecycleState: 'deleted',
        lifecycleOperation: {
          ...restoreOperation,
          kind: 'delete',
          operationId: '88888888-8888-4888-8888-888888888888',
          sourceRevision: 3,
          targetRevision: 5,
        },
        deletedRecordMetadata: {
          redboxOid: 'tombstone',
          metaMetadata: { brandId: 'brand-1' },
          metadata: {},
        },
      });
      const malformed = await harness.adapter.updateTombstone?.(
        harness.brand,
        'tombstone',
        { lifecycleState: 'restore-pending' },
        { ...exact(5), lifecycle: { expectedState: 'deleted' } }
      );
      assert.equal(malformed?.applicationState, 'not-applied');
      assert.equal(malformed?.nonApplicationReason, 'lifecycle-conflict');

      const claimed = await harness.adapter.updateTombstone?.(
        harness.brand,
        'tombstone',
        { lifecycleState: 'restore-pending', lifecycleOperation: restoreOperation },
        { ...exact(5), lifecycle: { expectedState: 'deleted' } }
      );
      assert.equal(claimed?.applicationState, 'applied');
      assert.equal(claimed?.committedRevision, 6);

      const staleClaim = await harness.adapter.updateTombstone?.(
        harness.brand,
        'tombstone',
        {
          lifecycleState: 'purge-pending',
          lifecycleOperation: {
            ...restoreOperation,
            kind: 'purge',
            operationId: '99999999-9999-4999-8999-999999999999',
          },
        },
        { ...exact(5), lifecycle: { expectedState: 'deleted' } }
      );
      assert.equal(staleClaim?.applicationState, 'not-applied');
      assert.equal(staleClaim?.nonApplicationReason, 'stale-revision');

      const purged = await harness.adapter.removeTombstone?.(
        harness.brand,
        'tombstone',
        lifecycleExact(6, 'restore-pending', restoreOperationId)
      );
      assert.equal(purged?.applicationState, 'applied');
      assert.equal(purged?.removedRecord?.revision, 6);
      assert.equal(await harness.readTombstone('tombstone'), null);
    },
  },
  {
    name: 'keeps an ambiguous dispatched error unknown',
    async run(harness) {
      const response = await harness.dispatchAmbiguousUpdate(exact(1));
      assert.equal(response.applicationState, 'unknown');
      assert.equal(response.nonApplicationReason, undefined);
    },
  },
];
