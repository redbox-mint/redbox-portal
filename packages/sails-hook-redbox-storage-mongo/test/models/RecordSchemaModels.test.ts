const { expect } = require('chai');
const { MongoModels, RecordSchemaArtifactWLDef, RecordSchemaReferenceWLDef } = require('../../src/models');
const {
  RECORD_SCHEMA_ARTIFACT_INDEXES,
  RECORD_SCHEMA_REFERENCE_INDEXES,
} = require('../../src/services/MongoStorageService');

describe('record-schema Mongo models', function () {
  it('defines and registers the immutable artifact model', function () {
    expect(MongoModels.RecordSchemaArtifact).to.equal(RecordSchemaArtifactWLDef);
    expect(RecordSchemaArtifactWLDef).to.include({
      identity: 'recordschemaartifact',
      tableName: 'recordschemaartifact',
      datastore: 'redboxStorage',
    });
    expect(RecordSchemaArtifactWLDef.attributes).to.deep.include({
      digest: {
        type: 'string',
        required: true,
        unique: true,
        validations: { regex: /^[a-f0-9]{64}$/ },
      },
      document: { type: 'json', required: true },
      contractFormat: {
        type: 'string',
        required: true,
        isIn: ['redbox-record-contract/1'],
      },
      completeness: {
        type: 'string',
        required: true,
        isIn: ['complete', 'partial'],
      },
      byteLength: { type: 'number', required: true, min: 1 },
      createdAt: { type: 'string', columnType: 'datetime', autoCreatedAt: true },
      updatedAt: { type: 'string', columnType: 'datetime', autoUpdatedAt: true },
      lastAccessedAt: { type: 'string', columnType: 'datetime' },
    });
  });

  it('defines and registers every reference field and discriminant constraint', function () {
    expect(MongoModels.RecordSchemaReference).to.equal(RecordSchemaReferenceWLDef);
    expect(RecordSchemaReferenceWLDef).to.include({
      identity: 'recordschemareference',
      tableName: 'recordschemareference',
      datastore: 'redboxStorage',
    });
    expect(RecordSchemaReferenceWLDef.attributes).to.deep.include({
      referenceKey: {
        type: 'string',
        required: true,
        unique: true,
        validations: { regex: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/ },
      },
      digest: {
        type: 'string',
        required: true,
        validations: { regex: /^[a-f0-9]{64}$/ },
      },
      kind: { type: 'string', required: true, isIn: ['grant', 'save', 'pin'] },
      brand: { type: 'string', required: true, validations: { maxLength: 512 } },
      portal: { type: 'string', required: true, validations: { maxLength: 512 } },
      schemaKind: { type: 'string', required: true, isIn: ['create', 'update'] },
      recordType: { type: 'string', required: true, validations: { maxLength: 512 } },
      oid: { type: 'string', validations: { maxLength: 512 } },
      operation: { type: 'string', required: true, validations: { maxLength: 512 } },
      owner: { type: 'string', validations: { maxLength: 512 } },
      purpose: { type: 'string', validations: { maxLength: 2_048 } },
      expiresAt: { type: 'string', columnType: 'datetime' },
      createdAt: { type: 'string', columnType: 'datetime', autoCreatedAt: true },
      updatedAt: { type: 'string', columnType: 'datetime', autoUpdatedAt: true },
    });
    expect(RecordSchemaReferenceWLDef.attributes.referenceKey).to.deep.include({
      type: 'string',
      required: true,
      unique: true,
    });
  });

  it('declares stable unique and query indexes for repeated initialization', function () {
    expect(RECORD_SCHEMA_ARTIFACT_INDEXES).to.deep.equal([
      {
        key: { digest: 1 },
        name: 'digest_1',
        unique: true,
      },
    ]);
    expect(RECORD_SCHEMA_REFERENCE_INDEXES).to.deep.equal([
      {
        key: { referenceKey: 1 },
        name: 'referenceKey_1',
        unique: true,
      },
      {
        key: { digest: 1, kind: 1 },
        name: 'record_schema_reference_digest_kind',
      },
      {
        key: { digest: 1, kind: 1, brand: 1, portal: 1, referenceKey: 1 },
        name: 'record_schema_reference_grant_lookup',
      },
      {
        key: { digest: 1, kind: 1, brand: 1, portal: 1, schemaKind: 1, recordType: 1, operation: 1, oid: 1 },
        name: 'record_schema_reference_authorization_lookup',
      },
      {
        key: {
          digest: 1,
          kind: 1,
          brand: 1,
          portal: 1,
          schemaKind: 1,
          recordType: 1,
          operation: 1,
          referenceKey: 1,
        },
        name: 'record_schema_reference_authorization_cursor_lookup',
      },
      {
        key: { oid: 1, kind: 1 },
        name: 'record_schema_reference_oid_kind',
        sparse: true,
      },
      {
        key: { kind: 1, expiresAt: 1 },
        name: 'record_schema_reference_pin_expiry',
        partialFilterExpression: { kind: 'pin' },
      },
    ]);
  });
});
