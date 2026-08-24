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
      updateTombstone: async (brand, oid, candidate, options) =>
        conditionalWrite(tombstones, String(oid), brand, options, current =>
          update(tombstones, String(oid), candidate as Record<string, unknown>, current)
        ),
      removeTombstone: async (brand, oid, options) =>
        conditionalWrite(tombstones, String(oid), brand, options, current => remove(tombstones, String(oid), current)),
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
