import {
  FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
  INITIAL_RECORD_REVISION,
  RecordConcurrencyCapabilityError,
  assertStorageConcurrencyCapabilityForMode,
  hasFullRecordStorageConcurrencyCapability,
  nextRecordRevision,
  normalizeRecordStorageMutationOptions,
} from '../../src/RecordStorageConcurrency';

let expect: Chai.ExpectStatic;

describe('record storage concurrency contract', function () {
  before(async function () {
    expect = (await import('chai')).expect;
  });

  it('treats absent and partial declarations as unsupported', function () {
    expect(hasFullRecordStorageConcurrencyCapability(undefined)).to.equal(false);
    expect(hasFullRecordStorageConcurrencyCapability({})).to.equal(false);
    expect(
      hasFullRecordStorageConcurrencyCapability({
        getCapabilities: () => ({
          recordConcurrency: {
            ...FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
            conditionalTombstoneCreate: false,
          } as any,
        }),
      })
    ).to.equal(false);
  });

  it('accepts the complete versioned declaration', function () {
    expect(
      hasFullRecordStorageConcurrencyCapability({
        getCapabilities: () => ({
          recordConcurrency: { ...FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES },
        }),
      })
    ).to.equal(true);
  });

  it('fails strict startup/runtime checks closed with a safe code', function () {
    for (const mode of ['last-write-wins', 'observe'] as const) {
      expect(() => assertStorageConcurrencyCapabilityForMode(mode, undefined)).to.not.throw();
    }
    expect(() => assertStorageConcurrencyCapabilityForMode('strict', undefined))
      .to.throw(RecordConcurrencyCapabilityError)
      .with.property('code', 'record-concurrency-capability-unavailable');
  });

  it('advances lifecycle lineage monotonically and rejects overflow', function () {
    expect(nextRecordRevision(INITIAL_RECORD_REVISION)).to.equal(INITIAL_RECORD_REVISION + 1);
    expect(nextRecordRevision(41)).to.equal(42);
    expect(() => nextRecordRevision(Number.MAX_SAFE_INTEGER)).to.throw(RangeError);
  });

  it('cannot reuse an active token across delete and restore lineage', function () {
    const activeRevision = 7;
    const tombstoneRevision = nextRecordRevision(activeRevision);
    const restoredRevision = nextRecordRevision(tombstoneRevision);

    expect(tombstoneRevision).to.be.greaterThan(activeRevision);
    expect(restoredRevision).to.be.greaterThan(tombstoneRevision);
    expect(new Set([activeRevision, tombstoneRevision, restoredRevision]).size).to.equal(3);
  });

  it('retains only bounded request linkage and valid revision preconditions', function () {
    expect(
      normalizeRecordStorageMutationOptions({
        precondition: { expectedRevision: 3, requireRevision: true },
        requestId: '123e4567-e89b-42d3-a456-426614174000',
        resolution: 'internal',
        lifecycle: {
          expectedState: 'restore-pending',
          operationId: '00000000-0000-4000-8000-000000000000',
        },
      })
    ).to.deep.equal({
      precondition: { expectedRevision: 3, requireRevision: true },
      requestId: '123e4567-e89b-42d3-a456-426614174000',
      resolution: 'internal',
      lifecycle: {
        expectedState: 'restore-pending',
        operationId: '00000000-0000-4000-8000-000000000000',
      },
    });
    expect(
      normalizeRecordStorageMutationOptions({
        precondition: { requireRevision: false },
        requestId: 'unbounded-client-value',
      })
    ).to.deep.equal({ precondition: { requireRevision: false } });
    expect(() =>
      normalizeRecordStorageMutationOptions({
        precondition: { expectedRevision: -1, requireRevision: true },
      })
    ).to.throw(TypeError);
    expect(() => normalizeRecordStorageMutationOptions({ precondition: { expectedRevision: 1 } } as any)).to.throw(
      TypeError
    );
    expect(() => normalizeRecordStorageMutationOptions({ precondition: 'invalid' } as any)).to.throw(TypeError);
    expect(() => normalizeRecordStorageMutationOptions({ lifecycle: { expectedState: 'active' } } as any)).to.throw(
      TypeError
    );
    expect(() =>
      normalizeRecordStorageMutationOptions({ lifecycle: { operationId: 'client-operation' } } as any)
    ).to.throw(TypeError);
  });
});
