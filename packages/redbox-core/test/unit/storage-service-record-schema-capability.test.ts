import { expect } from 'chai';

import { RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS, getMissingRecordSchemaStorageCapabilities } from '../../src';
import type { RecordSchemaStorageCapabilityMethod, StorageService } from '../../src';

type LegacyStorageService = Omit<StorageService, RecordSchemaStorageCapabilityMethod>;

// Compile-only compatibility proof: a provider with the pre-feature shape is
// still assignable because every record-schema capability is optional.
function acceptLegacyStorageProvider(provider: LegacyStorageService): StorageService {
  return provider;
}

describe('record-schema storage capability inspection', function () {
  it('returns all missing methods in deterministic contract order', function () {
    expect(getMissingRecordSchemaStorageCapabilities(undefined)).to.deep.equal(
      RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS
    );
    expect(
      getMissingRecordSchemaStorageCapabilities({
        getRecordSchemaArtifact: async () => null,
        putRecordSchemaArtifact: async () => ({ success: true }),
      })
    ).to.deep.equal([
      'touchRecordSchemaArtifact',
      'putRecordSchemaReference',
      'listRecordSchemaGrants',
      'listRecordSchemaReferences',
      'deleteRecordSchemaArtifactIfUnreferenced',
    ]);
  });

  it('detects a complete provider without requiring any legacy implementation details', function () {
    const provider = Object.fromEntries(
      RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS.map(method => [method, () => undefined])
    );

    expect(getMissingRecordSchemaStorageCapabilities(provider)).to.deep.equal([]);
  });

  it('keeps the old-shaped provider assignment as a compile-time contract', function () {
    expect(acceptLegacyStorageProvider).to.be.a('function');
  });
});
