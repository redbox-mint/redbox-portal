import { expect } from 'chai';

import {
  createRecordSaveContext,
  createRecordSaveSchemaOutcomeMetadata,
  RecordSaveResponse,
  RECORD_CONTRACT_FORMAT_V1,
  RECORD_SCHEMA_PROBLEM_CODES,
} from '../../src';
import type {
  ContractNode,
  NormalizedRecordSchemaOperation,
  RecordContractPointer,
  RecordSaveContext,
  RecordSaveSchemaOutcomeMetadata,
  RecordSchemaArtifactInput,
  RecordSchemaArtifactModel,
  RecordSchemaCreateGrantReferenceInput,
  RecordSchemaDeleteResult,
  RecordSchemaPinReferenceInput,
  RecordSchemaProblem,
  RecordSchemaReferenceInput,
  RecordSchemaReferenceModel,
  RecordSchemaSaveReferenceInput,
  RecordSchemaUpdateGrantReferenceInput,
  ResolveRecordSchemaResult,
} from '../../src';

const commonReference = {
  referenceKey: 'reference-key-1',
  digest: 'a'.repeat(64),
  brand: 'default',
  portal: 'default',
  recordType: 'dataset',
  operation: 'strict-all',
} as const;

function pointer(value: string): RecordContractPointer {
  return value as RecordContractPointer;
}

function visitContractNode(node: ContractNode): string {
  switch (node.kind) {
    case 'scalar':
      return node.scalarType;
    case 'object':
      return `object:${Object.keys(node.properties).length}`;
    case 'array':
      return `array:${visitContractNode(node.items)}`;
    case 'any':
      return `any:${node.reason ?? 'unspecified'}`;
    case 'conditional':
      return `conditional:${visitContractNode(node.thenNode)}`;
    default: {
      const exhaustive: never = node;
      return exhaustive;
    }
  }
}

function resultOutcome(result: ResolveRecordSchemaResult): number | 'not-modified' {
  switch (result.kind) {
    case 'resolved':
      return 200;
    case 'not-modified':
      return 'not-modified';
    case 'invalid-request':
    case 'not-found':
    case 'forbidden':
    case 'not-resolvable':
    case 'limit-exceeded':
    case 'invalid-contract':
    case 'unavailable':
      return result.problem.status;
    default: {
      const exhaustive: never = result;
      return exhaustive;
    }
  }
}

function assertInvalidReferenceShapesDoNotTypeCheck(): void {
  const createGrantWithOid = {
    ...commonReference,
    kind: 'grant' as const,
    schemaKind: 'create' as const,
    oid: 'record-1',
  };
  // @ts-expect-error Create grants cannot carry a record OID.
  const invalidCreateGrant: RecordSchemaReferenceInput = createGrantWithOid;

  const updateGrantWithoutOid = {
    ...commonReference,
    kind: 'grant' as const,
    schemaKind: 'update' as const,
  };
  // @ts-expect-error Update grants require the authoritative record OID.
  const invalidUpdateGrant: RecordSchemaReferenceInput = updateGrantWithoutOid;

  const saveWithoutOid = {
    ...commonReference,
    kind: 'save' as const,
    schemaKind: 'update' as const,
  };
  // @ts-expect-error Save references require the saved record OID.
  const invalidSave: RecordSchemaReferenceInput = saveWithoutOid;

  const pinWithoutPurpose = {
    ...commonReference,
    kind: 'pin' as const,
    schemaKind: 'create' as const,
    owner: 'integration-tests',
  };
  // @ts-expect-error Pins require both an owner and a purpose.
  const invalidPin: RecordSchemaReferenceInput = pinWithoutPurpose;

  const grantWithPinOwner = {
    ...commonReference,
    kind: 'grant' as const,
    schemaKind: 'create' as const,
    owner: 'not-allowed',
  };
  // @ts-expect-error Grant references cannot carry pin-only fields.
  const invalidGrant: RecordSchemaReferenceInput = grantWithPinOwner;

  void [invalidCreateGrant, invalidUpdateGrant, invalidSave, invalidPin, invalidGrant];
}

function assertRecordSaveSchemaContextCannotBeForged(): void {
  // @ts-expect-error Record save contexts carry a factory-owned nominal brand.
  const forgedContext: RecordSaveContext = {
    requestId: '11111111-1111-4111-8111-111111111111',
  };
  // @ts-expect-error Normalized operations can be produced only at the factory boundary.
  const forgedOperation: NormalizedRecordSchemaOperation = 'publish';

  // @ts-expect-error The normalized schema operation is derived by the factory.
  createRecordSaveContext({ schemaOperation: 'publish' });
  // @ts-expect-error If-Match must use the explicitly trusted factory input.
  createRecordSaveContext({ ifMatch: `"sha256:${'a'.repeat(64)}"` });
  createRecordSaveContext({
    // @ts-expect-error Schema outcomes belong to the result tracker, not request context input.
    schemaOutcome: {
      digest: 'a'.repeat(64),
      immutableUrl: `/default/default/api/records/schemas/${'a'.repeat(64)}`,
      completeness: 'complete',
      enforcement: 'enforce',
    },
  });

  const context = createRecordSaveContext({ validationOperation: ' publish ' });
  const operation: NormalizedRecordSchemaOperation | undefined = context.schemaOperation;
  const rawSchemaOutcome = {
    digest: 'a'.repeat(64),
    immutableUrl: `/default/default/api/records/schemas/${'a'.repeat(64)}`,
    completeness: 'complete' as const,
    enforcement: 'enforce' as const,
  };
  // @ts-expect-error Schema outcome identity exists only after factory validation.
  const forgedSchemaOutcome: RecordSaveSchemaOutcomeMetadata = rawSchemaOutcome;
  const schemaOutcome: RecordSaveSchemaOutcomeMetadata = createRecordSaveSchemaOutcomeMetadata(rawSchemaOutcome);
  const response = new RecordSaveResponse();
  // @ts-expect-error Save response schema outcome is exposed read-only.
  response.schemaOutcome = schemaOutcome;
  void [forgedContext, forgedOperation, operation, forgedSchemaOutcome];
}

describe('record-schema core contracts', function () {
  void assertRecordSaveSchemaContextCannotBeForged;
  it('models every dialect-neutral IR node through an exhaustive visitor', function () {
    const scalar: ContractNode = { kind: 'scalar', nullable: false, scalarType: 'string' };
    const object: ContractNode = {
      kind: 'object',
      nullable: false,
      properties: { title: scalar },
      unknownProperties: 'allow',
    };
    const array: ContractNode = { kind: 'array', nullable: false, items: scalar };
    const anyNode: ContractNode = {
      kind: 'any',
      nullable: true,
      reason: 'unsupported-component',
    };
    const conditional: ContractNode = {
      kind: 'conditional',
      nullable: false,
      condition: { kind: 'exists', pointer: pointer('/access') },
      thenNode: scalar,
      elseNode: anyNode,
    };

    expect([scalar, object, array, anyNode, conditional].map(visitContractNode)).to.deep.equal([
      'string',
      'object:1',
      'array:string',
      'any:unsupported-component',
      'conditional:string',
    ]);
  });

  it('constructs each valid reference variant and retains its discriminator fields', function () {
    const createGrant: RecordSchemaCreateGrantReferenceInput = {
      ...commonReference,
      kind: 'grant',
      schemaKind: 'create',
    };
    const updateGrant: RecordSchemaUpdateGrantReferenceInput = {
      ...commonReference,
      referenceKey: 'reference-key-2',
      kind: 'grant',
      schemaKind: 'update',
      oid: 'record-1',
    };
    const save: RecordSchemaSaveReferenceInput = {
      ...commonReference,
      referenceKey: 'reference-key-3',
      kind: 'save',
      schemaKind: 'update',
      oid: 'record-1',
    };
    const pin: RecordSchemaPinReferenceInput = {
      ...commonReference,
      referenceKey: 'reference-key-4',
      kind: 'pin',
      schemaKind: 'create',
      owner: 'integration-tests',
      purpose: 'Retain a published integration contract',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    };

    const references: RecordSchemaReferenceInput[] = [createGrant, updateGrant, save, pin];
    expect(references.map(reference => reference.kind)).to.deep.equal(['grant', 'grant', 'save', 'pin']);
    expect(updateGrant.oid).to.equal('record-1');
    expect(save.oid).to.equal('record-1');
    expect(pin.owner).to.equal('integration-tests');
  });

  it('keeps invalid reference combinations out of typed core callers', function () {
    assertInvalidReferenceShapesDoNotTypeCheck();
  });

  it('models immutable artifacts, persisted references, and atomic delete outcomes', function () {
    const artifactInput: RecordSchemaArtifactInput = {
      digest: commonReference.digest,
      document: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
      },
      contractFormat: RECORD_CONTRACT_FORMAT_V1,
      completeness: 'complete',
      byteLength: 112,
    };
    const artifact: RecordSchemaArtifactModel = {
      ...artifactInput,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const reference: RecordSchemaReferenceModel = {
      ...commonReference,
      kind: 'grant',
      schemaKind: 'create',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    const deleteResults: RecordSchemaDeleteResult[] = [
      { kind: 'deleted', digest: artifact.digest },
      { kind: 'not-found', digest: artifact.digest },
      { kind: 'retained', digest: artifact.digest, reasons: ['grant-reference'] },
    ];

    expect(artifact.contractFormat).to.equal('redbox-record-contract/1');
    expect(reference.kind).to.equal('grant');
    expect(deleteResults.map(result => result.kind)).to.deep.equal(['deleted', 'not-found', 'retained']);
  });

  it('exposes stable unique codes and result variants with status-bearing safe problems', function () {
    expect(RECORD_SCHEMA_PROBLEM_CODES).to.include({
      INVALID_REQUEST: 'record-schema.invalid-request',
      LIMIT_EXCEEDED: 'record-schema.limit-exceeded',
      INVALID_CONTRACT: 'record-schema.invalid-contract',
      UNAVAILABLE: 'record-schema.unavailable',
      STORAGE_UNAVAILABLE: 'record-schema.storage-unavailable',
      LIMIT_DOCUMENT_BYTES: 'record-schema.limit-document-bytes',
      CONTRIBUTOR_INVALID: 'record-schema.contributor-invalid',
      PRECONDITION_FAILED: 'record-schema.precondition-failed',
      ADDITIONAL_PROPERTY: 'record-schema.additional-property',
    });
    const codes = Object.values(RECORD_SCHEMA_PROBLEM_CODES);
    expect(new Set(codes).size).to.equal(codes.length);

    const problem: RecordSchemaProblem = {
      type: 'https://redboxresearchdata.com/problems/record-schema-not-resolvable',
      title: 'Record schema could not be resolved',
      status: 409,
      detail: 'The authoritative form context is unavailable.',
      instance: '/default/default/api/records/schemas/create/dataset',
      code: RECORD_SCHEMA_PROBLEM_CODES.NOT_RESOLVABLE,
    };
    const artifact: RecordSchemaArtifactModel = {
      digest: commonReference.digest,
      document: { type: 'object' },
      contractFormat: RECORD_CONTRACT_FORMAT_V1,
      completeness: 'partial',
      byteLength: 17,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const results: ResolveRecordSchemaResult[] = [
      { kind: 'resolved', artifact },
      { kind: 'not-modified', artifact },
      { kind: 'invalid-request', problem: { ...problem, status: 400 } },
      { kind: 'not-found', problem: { ...problem, status: 404 } },
      { kind: 'forbidden', problem: { ...problem, status: 403 } },
      { kind: 'not-resolvable', problem },
      { kind: 'limit-exceeded', problem: { ...problem, status: 413 } },
      { kind: 'invalid-contract', problem: { ...problem, status: 422 } },
      { kind: 'unavailable', problem: { ...problem, status: 503 } },
    ];

    expect(results.map(resultOutcome)).to.deep.equal([200, 'not-modified', 400, 404, 403, 409, 413, 422, 503]);
  });
});
