const { expect } = require('chai');
const sinon = require('sinon');
const { RECORD_CONTRACT_FORMAT_V1, RECORD_SCHEMA_PROBLEM_CODES } = require('@researchdatabox/redbox-core');
const {
  RECORD_SCHEMA_ARTIFACT_INDEXES,
  RECORD_SCHEMA_REFERENCE_INDEXES,
  Services,
} = require('../../src/services/MongoStorageService');
const {
  RECORD_SCHEMA_REFERENCE_QUERY_LIMIT_MAX,
  RECORD_SCHEMA_STORAGE_CODES,
} = require('../../src/services/recordSchemaPersistence');

type ContractJsonValue = import('@researchdatabox/redbox-core').ContractJsonValue;
type RecordSchemaArtifactInput = import('@researchdatabox/redbox-core').RecordSchemaArtifactInput;
type RecordSchemaArtifactSummary = import('@researchdatabox/redbox-core').RecordSchemaArtifactSummary;
type RecordSchemaReferenceInput = import('@researchdatabox/redbox-core').RecordSchemaReferenceInput;
type MongoStorageService = import('../../src/services/MongoStorageService').Services.MongoStorageService;

type FakeDocument = { [key: string]: unknown };
type TestContractJsonObject = { readonly [key: string]: ContractJsonValue };
type FakeIndexDescription = {
  readonly name?: string;
  readonly key: Readonly<Record<string, unknown>>;
  readonly unique?: boolean;
  readonly sparse?: boolean;
  readonly partialFilterExpression?: FakeDocument;
};

function valueAtPath(document: FakeDocument, path: string): unknown {
  let value: unknown = document;
  for (const segment of path.split('.')) {
    if (value === null || typeof value !== 'object') {
      return undefined;
    }
    value = Reflect.get(value, segment);
  }
  return value;
}

function comparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

function compareComparable(left: unknown, right: unknown): number {
  const comparableLeft = comparable(left);
  const comparableRight = comparable(right);
  if (typeof comparableLeft === 'string' && typeof comparableRight === 'string') {
    return comparableLeft < comparableRight ? -1 : comparableLeft > comparableRight ? 1 : 0;
  }
  const numericLeft = Number(comparableLeft);
  const numericRight = Number(comparableRight);
  return numericLeft < numericRight ? -1 : numericLeft > numericRight ? 1 : 0;
}

function matchesCondition(actual: unknown, condition: unknown): boolean {
  if (
    condition !== null &&
    typeof condition === 'object' &&
    !Array.isArray(condition) &&
    !(condition instanceof Date)
  ) {
    for (const [operator, expected] of Object.entries(condition)) {
      if (operator === '$exists' && (actual !== undefined) !== expected) {
        return false;
      }
      if (operator === '$ne' && comparable(actual) === comparable(expected)) {
        return false;
      }
      if (operator === '$lte' && compareComparable(actual, expected) > 0) {
        return false;
      }
      if (operator === '$gt' && compareComparable(actual, expected) <= 0) {
        return false;
      }
    }
    return true;
  }
  return comparable(actual) === comparable(condition);
}

function matches(document: FakeDocument, criteria: FakeDocument): boolean {
  for (const [field, expected] of Object.entries(criteria)) {
    if (field === '$or') {
      if (!Array.isArray(expected) || !expected.some(entry => matches(document, entry))) {
        return false;
      }
      continue;
    }
    if (field === '$and') {
      if (!Array.isArray(expected) || !expected.every(entry => matches(document, entry))) {
        return false;
      }
      continue;
    }
    if (!matchesCondition(valueAtPath(document, field), expected)) {
      return false;
    }
  }
  return true;
}

function setAtPath(document: FakeDocument, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor = document;
  for (const segment of segments.slice(0, -1)) {
    const existing = cursor[segment];
    if (existing === null || typeof existing !== 'object' || Array.isArray(existing)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as FakeDocument;
  }
  cursor[segments[segments.length - 1]] = structuredClone(value);
}

function unsetAtPath(document: FakeDocument, path: string): void {
  const segments = path.split('.');
  let cursor = document;
  for (const segment of segments.slice(0, -1)) {
    const existing = cursor[segment];
    if (existing === null || typeof existing !== 'object' || Array.isArray(existing)) {
      return;
    }
    cursor = existing as FakeDocument;
  }
  delete cursor[segments[segments.length - 1]];
}

class FakeCursor {
  private offset = 0;
  private maximum = Number.POSITIVE_INFINITY;
  private sortFields: FakeDocument = {};
  private readonly source: FakeDocument[];

  public constructor(source: FakeDocument[]) {
    this.source = source;
  }

  public sort(fields: FakeDocument): this {
    this.sortFields = fields;
    return this;
  }

  public skip(offset: number): this {
    this.offset = offset;
    return this;
  }

  public limit(maximum: number): this {
    this.maximum = maximum;
    return this;
  }

  public async toArray(): Promise<FakeDocument[]> {
    const sorted = [...this.source].sort((left, right) => {
      for (const [field, direction] of Object.entries(this.sortFields)) {
        const leftValue = comparable(valueAtPath(left, field));
        const rightValue = comparable(valueAtPath(right, field));
        if (leftValue === rightValue) {
          continue;
        }
        return (leftValue < rightValue ? -1 : 1) * Number(direction);
      }
      return 0;
    });
    return structuredClone(sorted.slice(this.offset, this.offset + this.maximum));
  }
}

class FakeCollection {
  public readonly createIndexes: Sinon.SinonStub;
  public afterFindOneAndUpdate?: () => void;
  public readonly documents: FakeDocument[];
  private readonly indexDefinitions: FakeIndexDescription[] = [{ name: '_id_', key: { _id: 1 } }];
  private readonly uniqueField?: string;

  public constructor(documents: FakeDocument[] = [], uniqueField?: string) {
    this.documents = documents;
    this.uniqueField = uniqueField;
    this.createIndexes = sinon.stub().callsFake(async (indexes: readonly FakeIndexDescription[]) => {
      this.indexDefinitions.push(...structuredClone(indexes));
      return indexes.map((index, position) => index.name ?? `index-${position}`);
    });
  }

  public async indexes(): Promise<FakeIndexDescription[]> {
    return structuredClone(this.indexDefinitions);
  }

  public async findOne(criteria: FakeDocument): Promise<FakeDocument | null> {
    const found = this.documents.find(document => matches(document, criteria));
    return found ? structuredClone(found) : null;
  }

  public find(criteria: FakeDocument): FakeCursor {
    return new FakeCursor(this.documents.filter(document => matches(document, criteria)));
  }

  public async insertOne(document: FakeDocument): Promise<{ insertedId: string }> {
    if (
      this.uniqueField &&
      this.documents.some(existing => existing[this.uniqueField] === document[this.uniqueField])
    ) {
      throw Object.assign(new Error('duplicate key'), { code: 11000 });
    }
    this.documents.push(structuredClone(document));
    return { insertedId: String(this.documents.length) };
  }

  public async updateOne(
    criteria: FakeDocument,
    update: { $set?: FakeDocument; $unset?: FakeDocument }
  ): Promise<{ matchedCount: number; modifiedCount: number }> {
    const document = this.documents.find(candidate => matches(candidate, criteria));
    if (!document) {
      return { matchedCount: 0, modifiedCount: 0 };
    }
    for (const [path, value] of Object.entries(update.$set ?? {})) {
      setAtPath(document, path, value);
    }
    for (const path of Object.keys(update.$unset ?? {})) {
      unsetAtPath(document, path);
    }
    return { matchedCount: 1, modifiedCount: 1 };
  }

  public async findOneAndUpdate(
    criteria: FakeDocument,
    update: { $set?: FakeDocument; $unset?: FakeDocument }
  ): Promise<FakeDocument | null> {
    const document = this.documents.find(candidate => matches(candidate, criteria));
    if (!document) {
      return null;
    }
    await this.updateOne(criteria, update);
    this.afterFindOneAndUpdate?.();
    return structuredClone(document);
  }

  public async deleteOne(criteria: FakeDocument): Promise<{ deletedCount: number }> {
    const index = this.documents.findIndex(document => matches(document, criteria));
    if (index < 0) {
      return { deletedCount: 0 };
    }
    this.documents.splice(index, 1);
    return { deletedCount: 1 };
  }

  public async deleteMany(criteria: FakeDocument): Promise<{ deletedCount: number }> {
    const retained = this.documents.filter(document => !matches(document, criteria));
    const deletedCount = this.documents.length - retained.length;
    this.documents.splice(0, this.documents.length, ...retained);
    return { deletedCount };
  }
}

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const NOW = new Date('2026-08-24T00:00:00.000Z');
const DEFAULT_DOCUMENT = { type: 'object' } as const;

function artifactInput(digest?: string, document?: TestContractJsonObject): RecordSchemaArtifactInput {
  const resolvedDigest = digest ?? DIGEST_A;
  const resolvedDocument = document ?? { type: 'object' };
  return {
    digest: resolvedDigest,
    document: resolvedDocument,
    contractFormat: RECORD_CONTRACT_FORMAT_V1,
    completeness: 'complete',
    byteLength: Buffer.byteLength(JSON.stringify(resolvedDocument), 'utf8'),
  };
}

function commonReference(referenceKey: string, digest = DIGEST_A) {
  return {
    referenceKey,
    digest,
    brand: 'default',
    portal: 'default',
    recordType: 'dataset',
    operation: 'strict-all',
  } as const;
}

describe('MongoStorageService record-schema persistence', function () {
  let service: MongoStorageService;
  let artifacts: FakeCollection;
  let references: FakeCollection;

  beforeEach(function () {
    const logger = {
      verbose: sinon.stub(),
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
      trace: sinon.stub(),
    };
    Reflect.set(global, 'sails', {
      log: logger,
      on: sinon.stub(),
      emit: sinon.stub(),
      config: {
        log: {
          createNamespaceLogger: () => logger,
          customLogger: logger,
        },
      },
    });
    artifacts = new FakeCollection([], 'digest');
    references = new FakeCollection([], 'referenceKey');
    service = new Services.MongoStorageService();
    service.recordSchemaArtifactCol = artifacts;
    service.recordSchemaReferenceCol = references;
  });

  it('creates required indexes idempotently with stable names and keys', async function () {
    const initializeIndexes = Reflect.get(service, 'createRecordSchemaIndices').bind(service);

    await initializeIndexes();
    await initializeIndexes();

    expect(artifacts.createIndexes.calledOnceWith(RECORD_SCHEMA_ARTIFACT_INDEXES)).to.equal(true);
    expect(references.createIndexes.calledOnceWith(RECORD_SCHEMA_REFERENCE_INDEXES)).to.equal(true);
  });

  it('inserts artifacts once and treats equivalent object-key order as an idempotent retry', async function () {
    const first = artifactInput(DIGEST_A, { b: 2, a: 1 });
    const retry = artifactInput(DIGEST_A, { a: 1, b: 2 });

    expect((await service.putRecordSchemaArtifact(first)).success).to.equal(true);
    expect((await service.putRecordSchemaArtifact(retry)).success).to.equal(true);
    expect(artifacts.documents).to.have.length(1);
    expect(artifacts.documents[0].document).to.deep.equal({ a: 1, b: 2 });
  });

  it('resolves concurrent duplicate artifact inserts through the same integrity comparison', async function () {
    const candidate = artifactInput(DIGEST_A, DEFAULT_DOCUMENT);

    const responses = await Promise.all([
      service.putRecordSchemaArtifact(candidate),
      service.putRecordSchemaArtifact(candidate),
    ]);

    expect(responses.map(response => response.success)).to.deep.equal([true, true]);
    expect(artifacts.documents).to.have.length(1);
  });

  it('rejects a digest collision without replacing content or leaking it in the error', async function () {
    await service.putRecordSchemaArtifact(artifactInput(DIGEST_A, { title: 'original' }));

    const response = await service.putRecordSchemaArtifact(
      artifactInput(DIGEST_A, { title: 'confidential replacement' })
    );

    expect(response.success).to.equal(false);
    expect(response.details).to.deep.equal({ code: RECORD_SCHEMA_PROBLEM_CODES.DIGEST_COLLISION });
    expect(response.message).not.to.include('confidential replacement');
    expect(artifacts.documents[0].document).to.deep.equal({ title: 'original' });
  });

  it('rejects malformed digest, byte length, cycles, and non-JSON values before persistence', async function () {
    const wrongLength = { ...artifactInput(DIGEST_A, DEFAULT_DOCUMENT), byteLength: 1 };
    const cyclic: FakeDocument = {};
    Object.defineProperty(cyclic, 'self', { value: cyclic, enumerable: true });
    const invalidInputs = [
      { ...artifactInput(DIGEST_A, DEFAULT_DOCUMENT), digest: 'ABC' },
      wrongLength,
      { ...artifactInput(DIGEST_A, DEFAULT_DOCUMENT), document: cyclic },
      { ...artifactInput(DIGEST_A, DEFAULT_DOCUMENT), document: { value: Number.NaN } },
      { ...artifactInput(DIGEST_A, DEFAULT_DOCUMENT), document: { value: () => undefined } },
    ];

    for (const input of invalidInputs) {
      const response = await Reflect.get(service, 'putRecordSchemaArtifact').call(service, input);
      expect(response.success).to.equal(false);
      expect(response.details).to.deep.equal({ code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT });
    }
    expect(artifacts.documents).to.have.length(0);
  });

  it('reads, touches, and reports missing artifacts without changing immutable identity fields', async function () {
    const clock = sinon.useFakeTimers({ now: NOW });
    try {
      await service.putRecordSchemaArtifact(artifactInput(DIGEST_A, DEFAULT_DOCUMENT));
      const before = await service.getRecordSchemaArtifact(DIGEST_A);
      clock.tick(1_000);

      const touch = await service.touchRecordSchemaArtifact(DIGEST_A);
      const after = await service.getRecordSchemaArtifact(DIGEST_A);

      expect(touch.success).to.equal(true);
      expect(after).to.deep.include({
        digest: before?.digest,
        document: before?.document,
        contractFormat: before?.contractFormat,
        completeness: before?.completeness,
        byteLength: before?.byteLength,
        createdAt: before?.createdAt,
        updatedAt: before?.updatedAt,
      });
      expect(after?.lastAccessedAt?.toISOString()).to.equal('2026-08-24T00:00:01.000Z');
      expect(await service.getRecordSchemaArtifact(DIGEST_B)).to.equal(null);
      expect((await service.touchRecordSchemaArtifact(DIGEST_B)).success).to.equal(false);
    } finally {
      clock.restore();
    }
  });

  it('lists redacted artifact metadata in stable bounded digest pages', async function () {
    await service.putRecordSchemaArtifact(artifactInput(DIGEST_B, { title: 'private-b' }));
    await service.putRecordSchemaArtifact(artifactInput(DIGEST_A, { title: 'private-a' }));
    artifacts.documents.find(document => document.digest === DIGEST_A)!.createdAt = new Date(
      '2026-01-01T00:00:00.000Z'
    );
    artifacts.documents.find(document => document.digest === DIGEST_B)!.createdAt = new Date(
      '2026-02-01T00:00:00.000Z'
    );

    const first = await service.listRecordSchemaArtifacts({ limit: 1 });
    const repeated = await service.listRecordSchemaArtifacts({ limit: 1 });
    const second = await service.listRecordSchemaArtifacts({ afterDigest: DIGEST_A, limit: 1 });

    const expectedFirst: RecordSchemaArtifactSummary[] = [
      { digest: DIGEST_A, createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ];
    const expectedSecond: RecordSchemaArtifactSummary[] = [
      { digest: DIGEST_B, createdAt: new Date('2026-02-01T00:00:00.000Z') },
    ];
    expect(first).to.deep.equal(expectedFirst);
    expect(repeated).to.deep.equal(first);
    expect(second).to.deep.equal(expectedSecond);
    expect(JSON.stringify([...first, ...second])).not.to.include('private-a');
    expect(JSON.stringify([...first, ...second])).not.to.include('private-b');
    expect(first[0]).not.to.have.property('document');

    for (const limit of [0, RECORD_SCHEMA_REFERENCE_QUERY_LIMIT_MAX + 1]) {
      let error: unknown;
      try {
        await service.listRecordSchemaArtifacts({ limit });
      } catch (caught) {
        error = caught;
      }
      expect(error).to.be.instanceOf(Error);
    }
  });

  it('persists all valid reference variants and only their allowlisted semantic fields', async function () {
    await service.putRecordSchemaArtifact(artifactInput(DIGEST_A, DEFAULT_DOCUMENT));
    const inputs: Array<RecordSchemaReferenceInput & { userId?: string }> = [
      {
        ...commonReference('grant-create'),
        kind: 'grant',
        schemaKind: 'create',
        userId: 'must-not-persist',
      },
      {
        ...commonReference('grant-update'),
        kind: 'grant',
        schemaKind: 'update',
        oid: 'record-1',
      },
      {
        ...commonReference('save-update'),
        kind: 'save',
        schemaKind: 'update',
        oid: 'record-1',
      },
      {
        ...commonReference('pin-create'),
        kind: 'pin',
        schemaKind: 'create',
        owner: 'integration',
        purpose: 'Keep the integration contract',
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      },
    ];

    for (const input of inputs) {
      expect((await service.putRecordSchemaReference(input)).success).to.equal(true);
    }

    expect(references.documents.map(reference => reference.kind)).to.deep.equal(['grant', 'grant', 'save', 'pin']);
    expect(references.documents[0]).not.to.have.property('userId');
    expect(references.documents[0]).not.to.have.property('oid');
    expect(references.documents[1]).to.include({ oid: 'record-1' });
    expect(references.documents[3]).to.include({
      owner: 'integration',
      purpose: 'Keep the integration contract',
    });
  });

  it('rejects every invalid reference-kind combination before persistence', async function () {
    await service.putRecordSchemaArtifact(artifactInput(DIGEST_A, DEFAULT_DOCUMENT));
    const invalid = [
      { ...commonReference('bad-create'), kind: 'grant', schemaKind: 'create', oid: 'record-1' },
      { ...commonReference('bad-update'), kind: 'grant', schemaKind: 'update' },
      { ...commonReference('bad-save'), kind: 'save', schemaKind: 'create' },
      {
        ...commonReference('bad-pin'),
        kind: 'pin',
        schemaKind: 'create',
        owner: 'integration',
      },
      {
        ...commonReference('bad-grant-owner'),
        kind: 'grant',
        schemaKind: 'create',
        owner: 'integration',
      },
      { ...commonReference(' bad-key'), kind: 'grant', schemaKind: 'create' },
    ];

    for (const input of invalid) {
      const response = await Reflect.get(service, 'putRecordSchemaReference').call(service, input);
      expect(response.success).to.equal(false);
      expect(response.details).to.deep.equal({ code: RECORD_SCHEMA_STORAGE_CODES.INVALID_REFERENCE });
    }
    expect(references.documents).to.have.length(0);
  });

  it('updates only updatedAt for an idempotent reference retry and rejects key collisions', async function () {
    const clock = sinon.useFakeTimers({ now: NOW });
    try {
      await service.putRecordSchemaArtifact(artifactInput(DIGEST_A, DEFAULT_DOCUMENT));
      const pin: RecordSchemaReferenceInput = {
        ...commonReference('stable-pin'),
        kind: 'pin',
        schemaKind: 'create',
        owner: 'integration',
        purpose: 'Stable purpose',
      };
      await service.putRecordSchemaReference(pin);
      const createdAt = references.documents[0].createdAt;
      clock.tick(1_000);

      expect((await service.putRecordSchemaReference(pin)).success).to.equal(true);
      expect(references.documents).to.have.length(1);
      expect(references.documents[0].createdAt).to.deep.equal(createdAt);
      expect((references.documents[0].updatedAt as Date).toISOString()).to.equal('2026-08-24T00:00:01.000Z');

      const collision = await service.putRecordSchemaReference({
        ...pin,
        purpose: 'Different purpose',
      });
      expect(collision.success).to.equal(false);
      expect(collision.details).to.deep.equal({
        code: RECORD_SCHEMA_STORAGE_CODES.REFERENCE_KEY_COLLISION,
      });
      expect(references.documents[0].purpose).to.equal('Stable purpose');
    } finally {
      clock.restore();
    }
  });

  it('refuses orphan references when the target artifact is absent', async function () {
    const response = await service.putRecordSchemaReference({
      ...commonReference('missing-artifact'),
      kind: 'grant',
      schemaKind: 'create',
    });

    expect(response.success).to.equal(false);
    expect(response.details).to.deep.equal({ code: RECORD_SCHEMA_STORAGE_CODES.ARTIFACT_NOT_FOUND });
    expect(references.documents).to.have.length(0);
  });

  it('never bypasses a retention lock while a reference write is in flight', async function () {
    await service.putRecordSchemaArtifact(artifactInput(DIGEST_A, DEFAULT_DOCUMENT));
    const findArtifact = artifacts.findOne.bind(artifacts);
    let artifactReads = 0;
    sinon.stub(artifacts, 'findOne').callsFake(async criteria => {
      const result = await findArtifact(criteria);
      artifactReads += 1;
      if (artifactReads === 1) {
        artifacts.documents[0]._retentionDeleteLock = {
          token: 'delete-in-progress',
          // Lock age cannot prove that the deleting worker will not resume.
          acquiredAt: new Date(0),
        };
      }
      return result;
    });

    const response = await service.putRecordSchemaReference({
      ...commonReference('racing-reference'),
      kind: 'grant',
      schemaKind: 'create',
    });

    expect(response.success).to.equal(false);
    expect(response.details).to.deep.equal({ code: RECORD_SCHEMA_STORAGE_CODES.ARTIFACT_NOT_FOUND });
    expect(references.documents).to.have.length(0);
  });

  it('lists grants and bounded filtered references without cross-digest or expired-pin results', async function () {
    const clock = sinon.useFakeTimers({ now: NOW });
    try {
      await service.putRecordSchemaArtifact(artifactInput(DIGEST_A, DEFAULT_DOCUMENT));
      await service.putRecordSchemaArtifact(artifactInput(DIGEST_B, DEFAULT_DOCUMENT));
      const values: RecordSchemaReferenceInput[] = [
        { ...commonReference('grant-a'), kind: 'grant', schemaKind: 'create' },
        { ...commonReference('save-a'), kind: 'save', schemaKind: 'update', oid: 'record-a' },
        { ...commonReference('grant-b', DIGEST_B), kind: 'grant', schemaKind: 'create' },
        {
          ...commonReference('expired-pin'),
          kind: 'pin',
          schemaKind: 'create',
          owner: 'integration',
          purpose: 'Expired',
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ];
      for (const value of values) {
        await service.putRecordSchemaReference(value);
      }

      const grants = await service.listRecordSchemaGrants({
        digest: DIGEST_A,
        brand: 'default',
        portal: 'default',
        limit: 10,
      });
      expect(grants.map(reference => reference.referenceKey)).to.deep.equal(['grant-a']);

      const live = await service.listRecordSchemaReferences({ digest: DIGEST_A, limit: 10 });
      expect(live.map(reference => reference.referenceKey)).to.deep.equal(['grant-a', 'save-a']);
      const withExpired = await service.listRecordSchemaReferences({
        digest: DIGEST_A,
        includeExpiredPins: true,
        limit: 10,
      });
      expect(withExpired.map(reference => reference.referenceKey)).to.deep.equal(['expired-pin', 'grant-a', 'save-a']);

      let limitError: unknown;
      try {
        await service.listRecordSchemaReferences({
          limit: RECORD_SCHEMA_REFERENCE_QUERY_LIMIT_MAX + 1,
        });
      } catch (error) {
        limitError = error;
      }
      expect(limitError).to.be.instanceOf(Error);
    } finally {
      clock.restore();
    }
  });

  it('lists a bounded reference page strictly after an exclusive reference-key cursor', async function () {
    await service.putRecordSchemaArtifact(artifactInput(DIGEST_A, DEFAULT_DOCUMENT));
    for (const referenceKey of ['grant-b', 'grant-a', 'grant-c']) {
      await service.putRecordSchemaReference({
        ...commonReference(referenceKey),
        kind: 'grant',
        schemaKind: 'create',
      });
    }
    const query = {
      digest: DIGEST_A,
      kind: 'grant' as const,
      brand: 'default',
      portal: 'default',
      afterReferenceKey: 'grant-b',
      limit: 1,
    };

    const page = await service.listRecordSchemaReferences(query);

    expect(page.map(reference => reference.referenceKey)).to.deep.equal(['grant-c']);
  });

  function ageArtifact(days: number): void {
    artifacts.documents[0].createdAt = new Date(NOW.getTime() - days * 24 * 60 * 60 * 1_000);
    artifacts.documents[0].updatedAt = artifacts.documents[0].createdAt;
  }

  it('protects artifacts younger than the requested minimum age', async function () {
    await service.putRecordSchemaArtifact(artifactInput(DIGEST_A, DEFAULT_DOCUMENT));

    const response = await service.deleteRecordSchemaArtifactIfUnreferenced({
      digest: DIGEST_A,
      now: NOW,
      minimumAgeDays: 365,
    });

    expect(response.success).to.equal(true);
    expect(response.data).to.deep.equal({
      kind: 'retained',
      digest: DIGEST_A,
      reasons: ['minimum-age'],
    });
    expect(artifacts.documents).to.have.length(1);
  });

  for (const [kind, expectedReason] of [
    ['grant', 'grant-reference'],
    ['save', 'save-reference'],
    ['pin', 'active-pin'],
  ] as const) {
    it(`protects an old artifact with a live ${kind} reference`, async function () {
      await service.putRecordSchemaArtifact(artifactInput(DIGEST_A, DEFAULT_DOCUMENT));
      ageArtifact(400);
      const reference: RecordSchemaReferenceInput =
        kind === 'grant'
          ? { ...commonReference('retention-grant'), kind, schemaKind: 'create' }
          : kind === 'save'
            ? {
                ...commonReference('retention-save'),
                kind,
                schemaKind: 'update',
                oid: 'record-1',
              }
            : {
                ...commonReference('retention-pin'),
                kind,
                schemaKind: 'create',
                owner: 'integration',
                purpose: 'Active pin',
                expiresAt: new Date('2027-01-01T00:00:00.000Z'),
              };
      await service.putRecordSchemaReference(reference);

      const response = await service.deleteRecordSchemaArtifactIfUnreferenced({
        digest: DIGEST_A,
        now: NOW,
        minimumAgeDays: 365,
      });

      expect(response.data).to.deep.equal({
        kind: 'retained',
        digest: DIGEST_A,
        reasons: [expectedReason],
      });
      expect(artifacts.documents).to.have.length(1);
    });
  }

  it('deletes an eligible artifact and its expired pin references', async function () {
    await service.putRecordSchemaArtifact(artifactInput(DIGEST_A, DEFAULT_DOCUMENT));
    ageArtifact(400);
    await service.putRecordSchemaReference({
      ...commonReference('expired-retention-pin'),
      kind: 'pin',
      schemaKind: 'create',
      owner: 'integration',
      purpose: 'Expired pin',
      expiresAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await service.deleteRecordSchemaArtifactIfUnreferenced({
      digest: DIGEST_A,
      now: NOW,
      minimumAgeDays: 365,
    });

    expect(response.data).to.deep.equal({ kind: 'deleted', digest: DIGEST_A });
    expect(artifacts.documents).to.have.length(0);
    expect(references.documents).to.have.length(0);
  });

  it('rechecks after acquiring the delete lock and retains a newly-created reference', async function () {
    await service.putRecordSchemaArtifact(artifactInput(DIGEST_A, DEFAULT_DOCUMENT));
    ageArtifact(400);
    artifacts.afterFindOneAndUpdate = () => {
      references.documents.push({
        ...commonReference('racing-grant'),
        kind: 'grant',
        schemaKind: 'create',
        createdAt: NOW,
        updatedAt: NOW,
      });
    };

    const response = await service.deleteRecordSchemaArtifactIfUnreferenced({
      digest: DIGEST_A,
      now: NOW,
      minimumAgeDays: 365,
    });

    expect(response.data).to.deep.equal({
      kind: 'retained',
      digest: DIGEST_A,
      reasons: ['grant-reference'],
    });
    expect(artifacts.documents).to.have.length(1);
    expect(artifacts.documents[0]).not.to.have.property('_retentionDeleteLock');
    expect(references.documents).to.have.length(1);
  });

  it('reports a missing artifact as a successful typed non-deletion outcome', async function () {
    const response = await service.deleteRecordSchemaArtifactIfUnreferenced({
      digest: DIGEST_A,
      now: NOW,
      minimumAgeDays: 365,
    });

    expect(response.success).to.equal(true);
    expect(response.data).to.deep.equal({ kind: 'not-found', digest: DIGEST_A });
  });
});
