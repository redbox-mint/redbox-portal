import assert from 'node:assert/strict';
import type { StorageMutationResponse } from '../StorageServiceResponse';
import type { StorageService } from '../StorageService';
import type { RecordStorageMutationOptions } from '../RecordStorageConcurrency';

/**
 * The subset of {@link StorageService} a storage adapter must implement before
 * it can advertise the record-concurrency capability.
 */
export type RecordConcurrencyAdapter = Pick<
  StorageService,
  'getCapabilities' | 'create' | 'updateMeta' | 'removeActiveRecord' | 'updateTombstone' | 'removeTombstone'
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
    name: 'conditionally claims restore state and purges the exact tombstone',
    async run(harness) {
      await harness.seedTombstone({ redboxOid: 'tombstone', revision: 5, lifecycleState: 'deleted' });
      const claimed = await harness.adapter.updateTombstone?.(
        harness.brand,
        'tombstone',
        { lifecycleState: 'restore-pending' },
        exact(5)
      );
      assert.equal(claimed?.applicationState, 'applied');
      assert.equal(claimed?.committedRevision, 6);

      const staleClaim = await harness.adapter.updateTombstone?.(
        harness.brand,
        'tombstone',
        { lifecycleState: 'purge-pending' },
        exact(5)
      );
      assert.equal(staleClaim?.applicationState, 'not-applied');
      assert.equal(staleClaim?.nonApplicationReason, 'stale-revision');

      const purged = await harness.adapter.removeTombstone?.(harness.brand, 'tombstone', exact(6));
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
