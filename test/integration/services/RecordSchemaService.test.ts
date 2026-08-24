import {
  RECORD_CONTRACT_FORMAT_V1,
  Services,
  recordSchema,
  type RecordSchemaArtifactInput,
} from '@researchdatabox/redbox-core';

const DIGEST = 'e'.repeat(64);
const DOCUMENT = { type: 'object', title: 'Integration schema' } as const;

describe('RecordSchemaService storage-backed orchestration', function () {
  const storage = () => sails.services.mongostorageservice;

  afterEach(async function () {
    await sails.models.recordschemareference.destroy({ digest: DIGEST });
    await sails.models.recordschemaartifact.destroy({ digest: DIGEST });
  });

  it('materializes pins and maintains idempotent save usage against durable storage', async function () {
    const artifact: RecordSchemaArtifactInput = {
      digest: DIGEST,
      document: DOCUMENT,
      contractFormat: RECORD_CONTRACT_FORMAT_V1,
      completeness: 'complete',
      byteLength: Buffer.byteLength(JSON.stringify(DOCUMENT), 'utf8'),
    };
    expect((await storage().putRecordSchemaArtifact(artifact)).success).to.equal(true);

    const config = {
      ...structuredClone(recordSchema),
      enabled: true,
      retention: { minimumAgeDays: 1 },
      integrationPins: [
        {
          digest: DIGEST,
          brand: 'default',
          portal: 'rdmp',
          schemaKind: 'update',
          recordType: 'dataset',
          operation: 'strict-all',
          owner: 'integration-test',
          purpose: 'Verify durable task 5.10 orchestration.',
          expiresAt: '2030-01-01T00:00:00.000Z',
          rawSecret: 'must-not-persist',
        },
      ],
    };
    const service = new Services.RecordSchema({
      getConfig: () => config,
      getStorageProvider: storage,
    });
    const request = {
      digest: DIGEST,
      brand: 'default',
      portal: 'rdmp',
      schemaKind: 'update',
      recordType: 'dataset',
      oid: 'integration-oid',
      operation: 'publish',
      saveIdentity: 'integration-save-identity',
      rawSecret: 'must-not-persist',
    };

    const pins = await service.materializeIntegrationPins();
    const firstSave = await service.persistSaveUsageReference(request);
    const retrySave = await service.persistSaveUsageReference(request);
    const references = await storage().listRecordSchemaReferences({
      digest: DIGEST,
      includeExpiredPins: true,
      limit: 10,
      offset: 0,
    });
    const report = await service.reportRetention({
      digests: [DIGEST],
      now: new Date('2026-08-24T00:00:00.000Z'),
    });

    expect(pins.kind).to.equal('materialized');
    expect(firstSave.kind).to.equal('recorded');
    expect(retrySave).to.deep.equal(firstSave);
    expect(references.map(reference => reference.kind).sort()).to.deep.equal(['pin', 'save']);
    expect(JSON.stringify(references)).not.to.include('integration-save-identity');
    expect(JSON.stringify(references)).not.to.include('must-not-persist');
    expect(report.kind).to.equal('reported');
    if (report.kind !== 'reported') throw new Error('Expected durable retention report.');
    expect(report.entries).to.have.length(1);
    expect(report.entries[0]).to.deep.include({ saveCount: 1, activePinCount: 1, eligibleForDeletion: false });
  });
});
