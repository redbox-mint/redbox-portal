import assert from 'node:assert/strict';
import {
  PUBLICATION_STORAGE_CAPABILITY_METHODS,
  assertFullPublicationStorageCapability,
  hasFullPublicationStorageCapability,
  PublicationStorageCapabilityError,
  normalizeRecordStorageMutationOptions,
} from '../../../src/RecordStorageConcurrency';
import { validatePublicationConfiguration } from '../../../src/services/publication/configuration';
import { PublicationPublishing } from '../../../src/configmodels/PublicationPublishing';
import { configuredDestination, reviewProvider, testRegistry } from '../../fixtures/publication/provider';

function adapter(version = 1) {
  return {
    ...Object.fromEntries(PUBLICATION_STORAGE_CAPABILITY_METHODS.map(method => [method, () => {}])),
    getCapabilities: () => ({ publication: version }),
  };
}
describe('Publication storage capability (PUB-06)', () => {
  it('requires the complete contract independent of strict record concurrency', () => {
    assert.equal(hasFullPublicationStorageCapability(adapter()), true);
    for (const method of PUBLICATION_STORAGE_CAPABILITY_METHODS) {
      const incomplete = adapter();
      Reflect.deleteProperty(incomplete, method);
      assert.equal(hasFullPublicationStorageCapability(incomplete), false, method);
    }
    assert.equal(hasFullPublicationStorageCapability({ getCapabilities: () => ({ recordConcurrency: 1 }) }), false);
  });
  it('fails closed for absent, future, throwing and method-only adapters', () => {
    for (const value of [
      undefined,
      null,
      {},
      adapter(2),
      { ...adapter(), getCapabilities: undefined },
      {
        ...adapter(),
        getCapabilities: () => {
          throw new Error('unavailable');
        },
      },
      { ...adapter(), getCapabilities: () => null },
    ]) {
      assert.equal(hasFullPublicationStorageCapability(value), false);
      assert.throws(() => assertFullPublicationStorageCapability(value), PublicationStorageCapabilityError);
    }
  });
  it('rejects incomplete or unknown declarations during configuration enablement', () => {
    const value = new PublicationPublishing();
    value.processing.enabled = true;
    value.processing.serviceUsername = 'publisher';
    value.destinations.archive = { ...configuredDestination(), enabled: true };
    const context = {
      authority: 'shared' as const,
      verifiedTargets: { archive: reviewProvider.targetFingerprint(value.destinations.archive) },
    };
    for (const publicationStorage of [undefined, {}, adapter(2), { getCapabilities: () => ({ publication: 1 }) }]) {
      const result = validatePublicationConfiguration(value, testRegistry(), { ...context, publicationStorage });
      assert.equal(result.valid, false);
      if (!result.valid) assert.ok(result.issues.some(issue => issue.code === 'storage-capability'));
    }
    assert.equal(
      validatePublicationConfiguration(value, testRegistry(), { ...context, publicationStorage: adapter() }).valid,
      true
    );
  });
  it('drops publication grants and maintenance from public mutation options while retaining exact preconditions', () => {
    const result = normalizeRecordStorageMutationOptions({
      publicationIntent: { kind: 'content', expectedSourceRevision: 0, saveToken: 'forged', approvals: [] },
      maintenance: true,
      precondition: { expectedRevision: 5, requireRevision: true },
    });
    assert.deepEqual(result, { precondition: { expectedRevision: 5, requireRevision: true } });
  });
});
