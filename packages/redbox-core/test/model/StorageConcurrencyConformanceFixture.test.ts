import {
  FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
  STORAGE_CONCURRENCY_CONFORMANCE_CHECKS,
  StorageMutationResponse,
  type RecordStorageMutationOptions,
  type StorageConcurrencyConformanceHarness,
} from '../../src';

type Store = Map<string, Record<string, unknown>>;

function response(oid: string): StorageMutationResponse {
  const result = new StorageMutationResponse();
  result.oid = oid;
  return result;
}

function notApplied(
  result: StorageMutationResponse,
  reason: StorageMutationResponse['nonApplicationReason']
): StorageMutationResponse {
  result.applicationState = 'not-applied';
  result.nonApplicationReason = reason;
  return result;
}

/**
 * Minimal in-memory adapter that satisfies the published contract. It keeps the
 * conformance checks honest: a change to the contract has to be expressible by
 * something other than the bundled Mongo implementation.
 */
function createReferenceHarness(): StorageConcurrencyConformanceHarness {
  const active: Store = new Map();
  const tombstones: Store = new Map();
  const expected = (options?: RecordStorageMutationOptions) => options?.precondition?.expectedRevision;
  const brandId = (brand: unknown) =>
    String(brand && typeof brand === 'object' ? ((brand as Record<string, unknown>).id ?? '') : '');
  const storedBrandId = (record: Record<string, unknown>) =>
    String(
      record.brandId ??
        (record.metaMetadata as Record<string, unknown> | undefined)?.brandId ??
        (
          (record.deletedRecordMetadata as Record<string, unknown> | undefined)?.metaMetadata as
            | Record<string, unknown>
            | undefined
        )?.brandId ??
        ''
    );
  const lifecycleKindMatchesState = (state: unknown, kind: unknown) =>
    (state === 'delete-pending' && kind === 'delete') ||
    (state === 'deleted' && kind === 'delete') ||
    (state === 'restore-pending' && kind === 'restore') ||
    (state === 'purge-pending' && kind === 'purge') ||
    (state === 'recovery-required' && ['delete', 'restore', 'purge'].includes(String(kind)));

  const conditionalWrite = (
    store: Store,
    oid: string,
    brand: unknown,
    options: RecordStorageMutationOptions | undefined,
    apply: (current: Record<string, unknown>) => StorageMutationResponse
  ): StorageMutationResponse => {
    const current = store.get(oid);
    if (!current) {
      if (store === active && tombstones.has(oid)) return notApplied(response(oid), 'deleted');
      if (store === tombstones && active.has(oid)) return notApplied(response(oid), 'lifecycle-conflict');
      return notApplied(response(oid), 'not-found');
    }
    if (storedBrandId(current) !== brandId(brand)) {
      return notApplied(response(oid), 'brand-mismatch');
    }
    const expectedRevision = expected(options);
    if (
      expectedRevision !== undefined &&
      current.revision !== expectedRevision &&
      !(expectedRevision === 0 && current.revision === undefined)
    ) {
      return notApplied(response(oid), 'stale-revision');
    }
    if (options?.lifecycle?.expectedState !== undefined && current.lifecycleState !== options.lifecycle.expectedState) {
      return notApplied(response(oid), 'lifecycle-conflict');
    }
    if (
      options?.lifecycle?.operationId !== undefined &&
      (current.lifecycleOperation as Record<string, unknown> | undefined)?.operationId !== options.lifecycle.operationId
    ) {
      return notApplied(response(oid), 'lifecycle-conflict');
    }
    return apply(current);
  };

  const update = (store: Store, oid: string, candidate: Record<string, unknown>, current: Record<string, unknown>) => {
    const result = response(oid);
    const revision = current.revision === undefined ? 1 : Number(current.revision) + 1;
    // The storage boundary owns the revision, whatever the candidate carries.
    const committed = { ...current, ...candidate, revision };
    store.set(oid, committed);
    result.success = true;
    result.applicationState = 'applied';
    result.committedRevision = revision;
    result.committedRecord = committed;
    return result;
  };

  const remove = (store: Store, oid: string, current: Record<string, unknown>) => {
    const result = response(oid);
    store.delete(oid);
    result.success = true;
    result.applicationState = 'applied';
    result.committedRevision = current.revision as number;
    result.removedRecord = current;
    return result;
  };

  return {
    adapter: {
      getCapabilities: () => ({ recordConcurrency: { ...FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES } }),
      getTombstone: async (brand, oid) => {
        const current = tombstones.get(String(oid));
        return current && storedBrandId(current) === brandId(brand) ? (current as any) : null;
      },
      getLifecycleTombstones: async (states, limit) =>
        [...tombstones.values()].filter(record => states.includes(record.lifecycleState as any)).slice(0, limit) as any,
      create: async (brand, candidate) => {
        const record = candidate as Record<string, unknown>;
        const oid = String(record.redboxOid);
        if (active.has(oid) || tombstones.has(oid)) return notApplied(response(oid), 'lifecycle-conflict');
        const committed = {
          ...record,
          metaMetadata: {
            ...((record.metaMetadata as Record<string, unknown> | undefined) ?? {}),
            brandId: brandId(brand),
          },
          revision: 0,
        };
        active.set(oid, committed);
        const result = response(oid);
        result.success = true;
        result.applicationState = 'applied';
        result.committedRevision = 0;
        result.committedRecord = committed;
        return result;
      },
      updateMeta: async (brand, oid, candidate, _user, options) =>
        conditionalWrite(active, String(oid), brand, options, current =>
          update(active, String(oid), candidate as Record<string, unknown>, current)
        ),
      removeActiveRecord: async (brand, oid, options) =>
        conditionalWrite(active, String(oid), brand, options, current => remove(active, String(oid), current)),
      createTombstone: async (brand, oid, candidate, options) => {
        const key = String(oid);
        const record = candidate as Record<string, unknown>;
        const operation = record.lifecycleOperation as Record<string, unknown> | undefined;
        const current = tombstones.get(key);
        if (current) {
          if (
            storedBrandId(current) !== brandId(brand) ||
            (current.lifecycleOperation as Record<string, unknown> | undefined)?.operationId !==
              options?.lifecycle?.operationId
          ) {
            return notApplied(response(key), 'lifecycle-conflict');
          }
          const result = response(key);
          result.success = true;
          result.applicationState = 'applied';
          result.committedRevision = current.revision as number;
          result.committedRecord = current;
          return result;
        }
        const expectedRevision = expected(options);
        if (
          expectedRevision === undefined ||
          record.revision !== expectedRevision + 1 ||
          operation?.operationId !== options?.lifecycle?.operationId ||
          operation?.sourceRevision !== expectedRevision ||
          operation?.targetRevision !== expectedRevision + 1 ||
          storedBrandId(record) !== brandId(brand)
        ) {
          return notApplied(response(key), 'lifecycle-conflict');
        }
        const snapshot = { ...(record.deletedRecordMetadata as Record<string, unknown>) };
        delete snapshot.revision;
        const committed: Record<string, unknown> = { ...record, deletedRecordMetadata: snapshot };
        tombstones.set(key, committed);
        const result = response(key);
        result.success = true;
        result.applicationState = 'applied';
        result.committedRevision = committed.revision as number;
        result.committedRecord = committed;
        return result;
      },
      updateTombstone: async (brand, oid, candidate, options) => {
        const key = String(oid);
        const record = candidate as Record<string, unknown>;
        const operation = record.lifecycleOperation as Record<string, unknown> | undefined;
        const expectedRevision = expected(options);
        if (
          expectedRevision === undefined ||
          options?.lifecycle?.expectedState === undefined ||
          !operation ||
          !lifecycleKindMatchesState(record.lifecycleState, operation.kind) ||
          Number(operation.sourceRevision) > expectedRevision ||
          operation.targetRevision !== expectedRevision + 1 ||
          (options.lifecycle.operationId !== undefined && operation.operationId !== options.lifecycle.operationId)
        ) {
          return notApplied(response(key), 'lifecycle-conflict');
        }
        return conditionalWrite(tombstones, key, brand, options, current => update(tombstones, key, record, current));
      },
      removeTombstone: async (brand, oid, options) => {
        const key = String(oid);
        if (
          expected(options) === undefined ||
          options?.lifecycle?.expectedState === undefined ||
          options.lifecycle.operationId === undefined
        ) {
          return notApplied(response(key), 'lifecycle-conflict');
        }
        return conditionalWrite(tombstones, key, brand, options, current => remove(tombstones, key, current));
      },
      createActiveRecordFromTombstone: async (brand, oid, candidate, options) => {
        const key = String(oid);
        const operationId = options?.lifecycle?.operationId;
        const currentActive = active.get(key);
        if (currentActive) {
          if (currentActive.lifecycleOperationId !== operationId || storedBrandId(currentActive) !== brandId(brand)) {
            return notApplied(response(key), 'lifecycle-conflict');
          }
          const result = response(key);
          result.success = true;
          result.applicationState = 'applied';
          result.committedRevision = currentActive.revision as number;
          result.committedRecord = currentActive;
          return result;
        }
        const claim = conditionalWrite(tombstones, key, brand, options, current => {
          const result = response(key);
          const expectedRevision = expected(options) as number;
          const input = candidate as Record<string, unknown>;
          const operation = current.lifecycleOperation as Record<string, unknown> | undefined;
          const snapshot = current.deletedRecordMetadata as Record<string, unknown> | undefined;
          if (
            current.lifecycleState !== 'restore-pending' ||
            operation?.kind !== 'restore' ||
            operation.operationId !== operationId ||
            operation.targetRevision !== expectedRevision ||
            !snapshot ||
            input.redboxOid !== key ||
            storedBrandId(input) !== brandId(brand)
          ) {
            return notApplied(result, 'lifecycle-conflict');
          }
          const committed = {
            ...snapshot,
            revision: expectedRevision + 1,
            lifecycleOperationId: operationId,
            metaMetadata: {
              ...((snapshot.metaMetadata as Record<string, unknown> | undefined) ?? {}),
              brandId: brandId(brand),
            },
          };
          active.set(key, committed);
          result.success = true;
          result.applicationState = 'applied';
          result.committedRevision = committed.revision;
          result.committedRecord = committed;
          return result;
        });
        return claim;
      },
    },
    brand: { id: 'brand-1' },
    otherBrand: { id: 'brand-2' },
    seedActive: async record => {
      active.set(String(record.redboxOid), {
        ...record,
        metaMetadata: {
          ...((record.metaMetadata as Record<string, unknown> | undefined) ?? {}),
          brandId: 'brand-1',
        },
      });
    },
    seedTombstone: async record => {
      tombstones.set(String(record.redboxOid), { ...record, brandId: 'brand-1' });
    },
    readActive: async oid => active.get(oid) ?? null,
    readTombstone: async oid => tombstones.get(oid) ?? null,
    dispatchAmbiguousUpdate: async () => {
      const result = response('ambiguous');
      result.applicationState = 'unknown';
      return result;
    },
  };
}

describe('reference custom adapter storage concurrency conformance', function () {
  for (const check of STORAGE_CONCURRENCY_CONFORMANCE_CHECKS) {
    it(check.name, async function () {
      await check.run(createReferenceHarness());
    });
  }
});
