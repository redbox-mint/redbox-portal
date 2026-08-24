import { createHash } from 'crypto';
import { expect } from 'chai';

import { RedboxCanonicalJsonError, serializeRedboxCanonicalJsonV1 } from '../../../src/record-contract/canonical-json';
import {
  compileRecordJsonSchemaArtifact,
  identifyRecordJsonSchema,
  normalizeRecordJsonSchemaDocument,
  RecordJsonSchemaDocumentLimitError,
  RecordJsonSchemaIdentityError,
} from '../../../src/record-contract/record-json-schema-artifact';
import { recordSchema } from '../../../src/config/recordSchema.config';
import { createCoreRecordContractContributors } from '../../../src/record-contract/core-contributors';
import { RecordContractContributorRegistry } from '../../../src/record-contract/contributor-registry';
import { RecordContractCompiler } from '../../../src/record-contract/record-contract-compiler';
import {
  renderRecordJsonSchema,
  type RecordJsonSchemaDocument,
} from '../../../src/record-contract/json-schema-renderer';
import { recordContractPointer } from '../../../src/record-contract/json-pointer';
import type {
  ContractNode,
  ContractNodeAnnotations,
  RecordContract,
  RecordContractDiagnostic,
  RecordContractPublicContext,
  RecordContractValidationSummary,
} from '../../../src/record-contract/types';
import { createRecordContractFixture } from '../../fixtures/record-contract.fixtures';

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

interface DocumentOptions {
  readonly propertyOrder?: readonly string[];
  readonly enumOrder?: readonly string[];
  readonly annotations?: ContractNodeAnnotations;
  readonly validatorSummaries?: readonly RecordContractValidationSummary[];
  readonly diagnostics?: readonly RecordContractDiagnostic[];
  readonly completeness?: RecordContract['completeness'];
  readonly context?: RecordContractPublicContext;
}

function document(options: DocumentOptions = {}): RecordJsonSchemaDocument {
  const nodes: Readonly<Record<string, ContractNode>> = {
    alpha: { kind: 'scalar', nullable: false, scalarType: 'boolean' },
    count: { kind: 'scalar', nullable: false, scalarType: 'integer' },
    status: {
      kind: 'scalar',
      nullable: true,
      scalarType: 'string',
      enum: options.enumOrder ?? ['alpha', 'zeta'],
      ...(options.annotations ? { annotations: options.annotations } : {}),
    },
  };
  const properties = Object.fromEntries(
    (options.propertyOrder ?? ['alpha', 'count', 'status']).map(key => [key, nodes[key]])
  );
  return renderRecordJsonSchema({
    root: {
      kind: 'object',
      nullable: false,
      properties,
      unknownProperties: 'declared',
    },
    definitions: {},
    fieldOwners: {},
    validatorSummaries: options.validatorSummaries ?? [],
    diagnostics: options.diagnostics ?? [],
    completeness: options.completeness ?? 'complete',
    context: options.context ?? context,
  });
}

function shuffled<T>(values: readonly T[], seed: number): T[] {
  const result = [...values];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    const swapIndex = state % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function randomizedDocument(seed: number): RecordJsonSchemaDocument {
  const summaries: readonly RecordContractValidationSummary[] = [
    {
      code: 'form.required',
      pointers: shuffled([recordContractPointer('/status'), recordContractPointer('/alpha')], seed + 1),
      groups: shuffled(['submit', 'draft'], seed + 2),
      operations: shuffled(['update', 'create'], seed + 3),
      blocking: true,
    },
    {
      code: 'form.custom',
      pointers: [recordContractPointer('/count')],
      groups: ['submit'],
      operations: ['create'],
      blocking: false,
    },
  ];
  const diagnostics: readonly RecordContractDiagnostic[] = [
    { code: 'z-code', severity: 'warning', message: 'Last' },
    { code: 'a-code', severity: 'info', message: 'First' },
  ];
  return document({
    propertyOrder: shuffled(['alpha', 'count', 'status'], seed + 4),
    enumOrder: shuffled(['zeta', 'alpha'], seed + 5),
    validatorSummaries: shuffled(summaries, seed + 6),
    diagnostics: shuffled(diagnostics, seed + 7),
  });
}

describe('record JSON Schema identity', function () {
  it('meta-validates deterministic create/update snapshots for the shared representative fixture', async function () {
    const fixture = createRecordContractFixture();
    const registry = new RecordContractContributorRegistry(
      createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' as const }))
    );
    const compiler = new RecordContractCompiler(registry, {
      ...recordSchema.limits,
      contributorTimeoutMs: 100,
    });
    const expectedDigests = {
      create: 'af3936ab43780b82b6bb4907c1a67cb78902a4482e7c527f10a0d92e8ca4e48a',
      update: '01144561d6dae1ad17ebb3513d19f82aebe8bb2d712a934898bd5baa1ab0c582',
    } as const;

    for (const kind of ['create', 'update'] as const) {
      const result = await compiler.compile({
        form: fixture.form,
        reusableFormDefinitions: fixture.reusableFormDefinitions,
        extensionMetadata: fixture.namespacedExtensionMetadata,
        context: {
          ...context,
          kind,
          recordType: 'record-contract-fixture',
          form: fixture.form.name,
        },
      });
      if (result.kind !== 'compiled') {
        throw new Error(`The shared ${kind} fixture failed record-contract compilation.`);
      }
      const artifact = compileRecordJsonSchemaArtifact(renderRecordJsonSchema(result.contract), {
        maxDocumentBytes: recordSchema.limits.maxDocumentBytes,
        maxValidationErrors: recordSchema.limits.maxDiagnostics,
      });
      expect(artifact.digest).to.equal(expectedDigests[kind]);
      expect(artifact.document['x-redbox-completeness']).to.equal('partial');
    }
  });

  it('normalizes compiler-owned unordered arrays but preserves example order', function () {
    const base = document({
      annotations: { examples: ['first', 'second'] },
      validatorSummaries: [
        {
          code: 'form.required',
          pointers: [recordContractPointer('/alpha'), recordContractPointer('/status')],
          groups: ['draft', 'submit'],
          operations: ['create', 'update'],
          blocking: true,
        },
      ],
      diagnostics: [
        { code: 'a-code', severity: 'info', message: 'First' },
        { code: 'z-code', severity: 'warning', message: 'Last' },
      ],
    });
    const status = base.properties?.status;
    if (!status) {
      throw new Error('The identity fixture did not render its status property.');
    }
    const reversed: RecordJsonSchemaDocument = {
      ...base,
      required: ['status', 'alpha'],
      properties: {
        ...base.properties,
        status: {
          ...status,
          type: Array.isArray(status.type) ? [...status.type].reverse() : status.type,
          enum: status.enum ? [...status.enum].reverse() : undefined,
        },
      },
      'x-redbox-validation': [...base['x-redbox-validation']].reverse().map(summary => ({
        ...summary,
        pointers: [...summary.pointers].reverse(),
        groups: [...summary.groups].reverse(),
        operations: [...summary.operations].reverse(),
      })),
      'x-redbox-diagnostics': [...base['x-redbox-diagnostics']].reverse(),
    };
    const ordered: RecordJsonSchemaDocument = { ...base, required: ['alpha', 'status'] };

    expect(normalizeRecordJsonSchemaDocument(reversed)).to.deep.equal(normalizeRecordJsonSchemaDocument(ordered));
    expect(identifyRecordJsonSchema(reversed, 1_000_000).digest).to.equal(
      identifyRecordJsonSchema(ordered, 1_000_000).digest
    );

    const reorderedExamples = document({ annotations: { examples: ['second', 'first'] } });
    expect(identifyRecordJsonSchema(reorderedExamples, 1_000_000).digest).not.to.equal(
      identifyRecordJsonSchema(document({ annotations: { examples: ['first', 'second'] } }), 1_000_000).digest
    );
  });

  it('preserves arrays nested in defaults, examples, and contributor annotation payloads', function () {
    const annotations: ContractNodeAnnotations = {
      default: {
        enum: ['second', 'first'],
        required: ['later', 'earlier'],
        type: ['secondary', 'primary'],
      },
      examples: [{ type: ['example-second', 'example-first'] }],
      extensions: {
        'x-example-payload': {
          enum: ['extension-second', 'extension-first'],
        },
      },
    };
    const identified = identifyRecordJsonSchema(document({ annotations }), 1_000_000);

    expect(identified.document.properties?.status?.default).to.deep.equal(annotations.default);
    expect(identified.document.properties?.status?.examples).to.deep.equal(annotations.examples);
    expect(identified.document.properties?.status?.['x-example-payload']).to.deep.equal(
      annotations.extensions?.['x-example-payload']
    );

    const reorderedData = document({
      annotations: {
        ...annotations,
        default: {
          enum: ['first', 'second'],
          required: ['earlier', 'later'],
          type: ['primary', 'secondary'],
        },
      },
    });
    expect(identifyRecordJsonSchema(reorderedData, 1_000_000).digest).not.to.equal(identified.digest);
  });

  it('produces one digest across 100 deterministic randomized property and annotation orders', function () {
    const expected = identifyRecordJsonSchema(randomizedDocument(0), 1_000_000).digest;
    for (let seed = 1; seed <= 100; seed += 1) {
      expect(identifyRecordJsonSchema(randomizedDocument(seed), 1_000_000).digest).to.equal(expected);
    }
  });

  it('changes identity for descriptions, defaults, examples, diagnostics, completeness, and enforcement', function () {
    const diagnostics: readonly RecordContractDiagnostic[] = [
      { code: 'partial', severity: 'warning', message: 'A safe diagnostic' },
    ];
    const variants = [
      document(),
      document({ annotations: { description: 'Status description' } }),
      document({ annotations: { default: 'alpha' } }),
      document({ annotations: { examples: ['alpha'] } }),
      document({ diagnostics }),
      document({ completeness: 'partial' }),
      document({ context: { ...context, enforcement: 'enforce' } }),
    ].map(value => identifyRecordJsonSchema(value, 1_000_000).digest);

    expect(new Set(variants).size).to.equal(variants.length);
  });

  it('hashes without $id, injects the protected origin-relative route, and emits a strong ETag', function () {
    const rendered = document({ context: { ...context, brand: 'brand name', portal: 'portal/subpath' } });
    const first = identifyRecordJsonSchema({ ...rendered, $id: 'https://ignored.example/one' }, 1_000_000);
    const second = identifyRecordJsonSchema({ ...rendered, $id: 'https://ignored.example/two' }, 1_000_000);

    expect(first.digest)
      .to.equal(second.digest)
      .and.to.match(/^[0-9a-f]{64}$/);
    expect(first.document.$id).to.equal(`/brand%20name/portal%2Fsubpath/api/records/schemas/${first.digest}`);
    expect(first.etag).to.equal(`"sha256:${first.digest}"`);
    expect(first.canonicalJson).to.equal(serializeRedboxCanonicalJsonV1(first.document));
    expect(first.byteLength).to.equal(Buffer.byteLength(first.canonicalJson, 'utf8'));
    expect(Object.isFrozen(first)).to.equal(true);
    expect(Object.isFrozen(first.document)).to.equal(true);
    expect(Object.isFrozen(first.document.properties)).to.equal(true);

    const identityDocument = Object.fromEntries(
      Object.entries(normalizeRecordJsonSchemaDocument(rendered)).filter(([key]) => key !== '$id')
    );
    const expectedDigest = createHash('sha256')
      .update(
        // This fixture has renderer-sorted keys; identity correctness for numeric keys is covered by canonical-json.test.ts.
        serializeRedboxCanonicalJsonV1(identityDocument),
        'utf8'
      )
      .digest('hex');
    expect(first.digest).to.equal(expectedDigest);
  });

  it('rejects relative-path and malformed-Unicode route context segments with typed errors', function () {
    expect(() => identifyRecordJsonSchema(document({ context: { ...context, brand: '..' } }), 1_000_000)).to.throw(
      RecordJsonSchemaIdentityError,
      'relative-path segment'
    );
    expect(() => identifyRecordJsonSchema(document({ context: { ...context, portal: '\ud800' } }), 1_000_000)).to.throw(
      RecordJsonSchemaIdentityError,
      'valid Unicode route segments'
    );
  });

  it('enforces the final canonical UTF-8 byte boundary exactly', function () {
    const rendered = document({ annotations: { description: 'Byte boundary' } });
    const measured = identifyRecordJsonSchema(rendered, 1_000_000);

    expect(identifyRecordJsonSchema(rendered, measured.byteLength).byteLength).to.equal(measured.byteLength);
    expect(() => identifyRecordJsonSchema(rendered, measured.byteLength - 1))
      .to.throw(RecordJsonSchemaDocumentLimitError)
      .with.property('code', 'record-schema.limit-document-bytes');
    expect(() => identifyRecordJsonSchema(rendered, 0)).to.throw(RecordJsonSchemaIdentityError, 'positive integer');
    expect(() => identifyRecordJsonSchema(rendered, Number.POSITIVE_INFINITY)).to.throw(
      RecordJsonSchemaIdentityError,
      'positive integer'
    );
  });

  it('rejects non-JSON values before hashing rather than silently omitting them', function () {
    const unsafe = { ...document(), 'x-unsafe': undefined } as unknown as RecordJsonSchemaDocument;
    expect(() => identifyRecordJsonSchema(unsafe, 1_000_000)).to.throw(RedboxCanonicalJsonError);
  });
});
