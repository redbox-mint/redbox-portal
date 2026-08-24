import { expect } from 'chai';

import {
  compileRecordJsonSchemaArtifact,
  RecordJsonSchemaArtifactCompiler,
  RecordJsonSchemaCompilationError,
  RecordJsonSchemaIdentityError,
} from '../../../src/record-contract/record-json-schema-artifact';
import {
  renderRecordJsonSchema,
  type RecordJsonSchemaDocument,
} from '../../../src/record-contract/json-schema-renderer';
import type { ContractNode, RecordContractPublicContext } from '../../../src/record-contract/types';

const context: RecordContractPublicContext = {
  brand: 'default',
  portal: 'main',
  kind: 'create',
  recordType: 'dataset',
  workflowStep: 'draft',
  form: 'dataset-1.0-draft',
  operation: 'submit',
  unknownProperties: 'declared',
  enforcement: 'shadow',
};

function document(): RecordJsonSchemaDocument {
  const properties: Readonly<Record<string, ContractNode>> = {
    count: {
      kind: 'scalar',
      nullable: false,
      scalarType: 'integer',
      annotations: { default: 7, extensions: { 'x-example-note': 'annotation only' } },
    },
    mode: {
      kind: 'scalar',
      nullable: false,
      scalarType: 'string',
      enum: ['closed', 'open'],
    },
    unsupported: {
      kind: 'any',
      nullable: true,
      reason: 'unsupported-component',
      annotations: { extensions: { 'x-redbox-unsupported-component': 'CustomField' } },
    },
  };
  return renderRecordJsonSchema({
    root: { kind: 'object', nullable: false, properties, unknownProperties: 'declared' },
    definitions: {},
    fieldOwners: {},
    validatorSummaries: [],
    diagnostics: [],
    completeness: 'partial',
    context,
  });
}

describe('AJV 2020 record JSON Schema compilation', function () {
  it('meta-validates and compiles annotation keywords using pinned AJV 2020 semantics', function () {
    const compiler = new RecordJsonSchemaArtifactCompiler({
      maxDocumentBytes: 1_000_000,
      maxValidationErrors: 10,
    });
    const first = compiler.compile(document());
    const second = compiler.compile(document());

    expect(first.digest).to.equal(second.digest);
    expect(first.validator.validate({ count: 1, mode: 'open', unsupported: { custom: true } })).to.deep.equal({
      valid: true,
      issues: [],
      truncated: false,
    });
  });

  it('does not mistake metadata property names or annotation data for schema keywords', function () {
    const base = document();
    const propertyDocument: RecordJsonSchemaDocument = {
      ...base,
      properties: {
        ...base.properties,
        'x.invalid-property-name': {
          type: 'string',
          default: { 'x.invalid-data-key': true },
        },
      },
    };
    const artifact = compileRecordJsonSchemaArtifact(propertyDocument, {
      maxDocumentBytes: 1_000_000,
      maxValidationErrors: 10,
    });

    expect(artifact.validator.validate({ 'x.invalid-property-name': 'valid' }).valid).to.equal(true);
  });

  it('does not apply defaults, coerce types, or remove additional properties', function () {
    const artifact = compileRecordJsonSchemaArtifact(document(), {
      maxDocumentBytes: 1_000_000,
      maxValidationErrors: 10,
    });

    const noDefault: Record<string, unknown> = {};
    const stringNumber: Record<string, unknown> = { count: '7' };
    const additional: Record<string, unknown> = { extra: 'preserved' };
    const noDefaultBefore = structuredClone(noDefault);
    const stringNumberBefore = structuredClone(stringNumber);
    const additionalBefore = structuredClone(additional);

    expect(artifact.validator.validate(noDefault).valid).to.equal(true);
    expect(artifact.validator.validate(stringNumber).valid).to.equal(false);
    expect(artifact.validator.validate(additional).valid).to.equal(false);
    expect(noDefault).to.deep.equal(noDefaultBefore).and.not.to.have.property('count');
    expect(stringNumber).to.deep.equal(stringNumberBefore);
    expect(additional).to.deep.equal(additionalBefore).and.to.have.property('extra', 'preserved');
  });

  it('collects all errors and returns a bounded immutable snapshot', function () {
    const artifact = compileRecordJsonSchemaArtifact(document(), {
      maxDocumentBytes: 1_000_000,
      maxValidationErrors: 2,
    });
    const input: Record<string, unknown> = { count: 'wrong', mode: 'invalid', extra: true };
    const before = structuredClone(input);
    const result = artifact.validator.validate(input);

    expect(result.valid).to.equal(false);
    if (result.valid) {
      throw new Error('The invalid AJV fixture unexpectedly passed validation.');
    }
    expect(result.issues).to.have.length(2);
    expect(result.truncated).to.equal(true);
    expect(Object.isFrozen(result)).to.equal(true);
    expect(Object.isFrozen(result.issues)).to.equal(true);
    expect(Object.isFrozen(result.issues[0])).to.equal(true);
    expect(Object.isFrozen(result.issues[0].parameters)).to.equal(true);
    expect(input).to.deep.equal(before);
  });

  it('rejects malformed generated schemas at the metaschema gate before compilation', function () {
    const malformed = { ...document(), type: 'not-a-json-schema-type' } as unknown as RecordJsonSchemaDocument;
    try {
      compileRecordJsonSchemaArtifact(malformed, {
        maxDocumentBytes: 1_000_000,
        maxValidationErrors: 10,
      });
      expect.fail('Expected the malformed schema to fail metaschema validation.');
    } catch (error) {
      expect(error).to.be.instanceOf(RecordJsonSchemaCompilationError);
      const compilationError = error as RecordJsonSchemaCompilationError;
      expect(compilationError.reason).to.equal('metaschema');
      expect(compilationError.issues).not.to.be.empty;
      expect(Object.isFrozen(compilationError.issues)).to.equal(true);
    }
  });

  it('rejects invalid compiler limits without silently disabling bounds', function () {
    expect(() => new RecordJsonSchemaArtifactCompiler({ maxDocumentBytes: 0, maxValidationErrors: 10 })).to.throw(
      RecordJsonSchemaIdentityError,
      'positive integer'
    );
    expect(
      () => new RecordJsonSchemaArtifactCompiler({ maxDocumentBytes: 1_000_000, maxValidationErrors: 0 })
    ).to.throw(RecordJsonSchemaIdentityError, 'positive integer');
  });
});
