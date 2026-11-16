import { expect } from 'chai';
import * as sinon from 'sinon';
import { createSinonStubLogger } from '../logger.test';
import { generation } from '../../src/config/generation.config';
import { canonicalHash } from '../../src/model/generation';
import { KnowledgeCollectionVersionWLDef } from '../../src/waterline-models/KnowledgeCollectionVersion';
import { Services, GenerationKnowledgeDocumentInput } from '../../src/services/GenerationKnowledgeService';

const brandId = 'brand-a';
const collectionId = 'collection-a';
const inputs: GenerationKnowledgeDocumentInput[] = [
  {
    documentKey: 'policy-a',
    title: 'Policy A',
    authority: 'institutionPolicy',
    classification: 'public',
    content: 'Alpha policy',
    tags: ['policy'],
  },
  {
    documentKey: 'policy-b',
    title: 'Policy B',
    authority: 'approvedGuidance',
    classification: 'public',
    content: 'Beta guidance',
    tags: ['policy'],
  },
];

describe('Generation knowledge publication lifecycle', () => {
  const globals = ['sails', 'KnowledgeCollection', 'KnowledgeCollectionVersion', 'KnowledgeDocument', 'KnowledgeChunk'];
  let originals: Map<string, unknown>;
  let service: Services.GenerationKnowledgeService;
  let versions: Array<Record<string, any>>;
  let documents: Array<Record<string, any>>;
  let chunks: Array<Record<string, any>>;
  let failDocumentAt: number;
  let failChunkAt: number;
  let documentWrites: number;
  let chunkWrites: number;
  let beforePublish: (() => void) | undefined;
  let failCollectionPointer: boolean;
  let collection: Record<string, any>;

  const matches = (row: Record<string, any>, criteria: Record<string, any>) =>
    Object.entries(criteria).every(([key, value]) => row[key] === value);

  beforeEach(() => {
    originals = new Map(globals.map(name => [name, Reflect.get(globalThis, name)]));
    collection = { id: collectionId, brandId };
    versions = [];
    documents = [];
    chunks = [];
    failDocumentAt = 0;
    failChunkAt = 0;
    documentWrites = 0;
    chunkWrites = 0;
    beforePublish = undefined;
    failCollectionPointer = false;
    const logger = createSinonStubLogger(sinon);
    Reflect.set(globalThis, 'sails', {
      config: {
        generation: structuredClone(generation),
        log: { createNamespaceLogger: () => logger, customLogger: logger },
      },
      log: logger,
    });
    let nextId = 0;
    function model(rows: Array<Record<string, any>>, unique: string[][], kind: string) {
      return {
        create: (values: Record<string, any>) => ({
          fetch: async () => {
            if (kind === 'document' && ++documentWrites === failDocumentAt)
              throw new Error('injected document failure');
            if (kind === 'chunk' && ++chunkWrites === failChunkAt) throw new Error('injected chunk failure');
            if (kind === 'version') {
              await new Promise<void>((resolve, reject) =>
                (KnowledgeCollectionVersionWLDef as any).beforeCreate(values, (error?: Error) =>
                  error ? reject(error) : resolve()
                )
              );
            }
            if (unique.some(keys => rows.some(row => keys.every(key => row[key] === values[key])))) {
              throw new Error('unique key collision');
            }
            const row = { id: `${kind}-${++nextId}`, ...structuredClone(values) };
            rows.push(row);
            return structuredClone(row);
          },
        }),
        find: async (criteria: Record<string, any>) => structuredClone(rows.filter(row => matches(row, criteria))),
        findOne: async (criteria: Record<string, any>) =>
          structuredClone(rows.find(row => matches(row, criteria)) ?? null),
        updateOne: (criteria: Record<string, any>) => ({
          set: async (values: Record<string, any>) => {
            if (kind === 'version' && values.status === 'published') beforePublish?.();
            const row = rows.find(row => matches(row, criteria));
            if (!row) return null;
            const next = { ...row, ...values };
            if (
              unique.some(keys =>
                rows.some(candidate => candidate !== row && keys.every(key => candidate[key] === next[key]))
              )
            ) {
              throw new Error('unique key collision');
            }
            Object.assign(row, structuredClone(values));
            return structuredClone(row);
          },
        }),
        destroyOne: async (criteria: Record<string, any>) => {
          const index = rows.findIndex(row => matches(row, criteria));
          return index < 0 ? null : rows.splice(index, 1)[0];
        },
      };
    }
    Reflect.set(globalThis, 'KnowledgeCollection', {
      findOne: async () => structuredClone(collection),
      updateOne: () => ({
        set: async (values: Record<string, any>) => {
          if (failCollectionPointer) throw new Error('injected collection pointer failure');
          Object.assign(collection, structuredClone(values));
          return structuredClone(collection);
        },
      }),
    });
    Reflect.set(
      globalThis,
      'KnowledgeCollectionVersion',
      model(
        versions,
        [
          ['brandId', 'collectionId', 'version'],
          ['brandId', 'collectionId', 'contentHash'],
        ],
        'version'
      )
    );
    Reflect.set(
      globalThis,
      'KnowledgeDocument',
      model(documents, [['brandId', 'collectionVersionId', 'documentKey']], 'document')
    );
    Reflect.set(globalThis, 'KnowledgeChunk', model(chunks, [['brandId', 'collectionVersionId', 'chunkKey']], 'chunk'));
    service = new Services.GenerationKnowledgeService();
  });

  afterEach(() => {
    sinon.restore();
    for (const [name, value] of originals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name);
      else Reflect.set(globalThis, name, value);
    }
  });

  async function draft() {
    return service.createVersion(brandId, collectionId, { scope: 'demo' }, 'author');
  }
  async function rejection(promise: Promise<unknown>) {
    let error: unknown;
    try {
      await promise;
    } catch (caught) {
      error = caught;
    }
    expect(error).to.be.instanceOf(Error);
  }

  it('reuses the matching draft when bootstrap retries after a failed publication', async () => {
    const first = await draft();
    expect((await draft()).id).to.equal(first.id);
    expect(versions).to.have.length(1);
  });

  for (const fault of ['document', 'chunk']) {
    it(`rolls back only created rows after a partial ${fault} write and allows bootstrap-style retry`, async () => {
      const version = await draft();
      const unrelatedDocument = {
        id: 'other-document',
        brandId: 'brand-b',
        collectionVersionId: 'another-version',
        documentKey: 'policy-a',
      };
      const unrelatedChunk = {
        id: 'other-chunk',
        brandId: 'brand-b',
        collectionVersionId: 'another-version',
        chunkKey: 'policy-a:001',
      };
      documents.push(unrelatedDocument);
      chunks.push(unrelatedChunk);
      if (fault === 'document') failDocumentAt = 2;
      else failChunkAt = 2;
      await rejection(service.publish(brandId, version.id, inputs, 'author'));
      expect(documents).to.deep.equal([unrelatedDocument]);
      expect(chunks).to.deep.equal([unrelatedChunk]);
      expect(versions[0].status).to.equal('draft');
      failDocumentAt = 0;
      failChunkAt = 0;
      expect((await draft()).id).to.equal(version.id);
      expect((await service.publish(brandId, version.id, inputs, 'author')).status).to.equal('published');
      expect(documents).to.have.length(3);
      expect(chunks).to.have.length(3);
    });
  }

  for (const invalid of ['authority', 'content', 'effective-dates']) {
    it(`validates every document before writing when a later document has invalid ${invalid}`, async () => {
      const version = await draft();
      const invalidInputs = structuredClone(inputs);
      if (invalid === 'authority') invalidInputs[1].authority = 'unknown';
      if (invalid === 'content') invalidInputs[1].content = '';
      if (invalid === 'effective-dates')
        Object.assign(invalidInputs[1], { effectiveFrom: '2030-01-01', effectiveTo: '2020-01-01' });
      await rejection(service.publish(brandId, version.id, invalidInputs, 'author'));
      expect(documentWrites).to.equal(0);
      expect(chunkWrites).to.equal(0);
      expect(documents).to.have.length(0);
    });
  }

  it('reclaims attempt rows after a failed publication write and permits retrying the same version', async () => {
    const version = await draft();
    beforePublish = () => {
      throw new Error('injected publication failure');
    };
    await rejection(service.publish(brandId, version.id, inputs, 'author'));
    expect(documents).to.have.length(0);
    expect(chunks).to.have.length(0);
    beforePublish = undefined;
    expect((await service.publish(brandId, version.id, inputs, 'author')).status).to.equal('published');
    expect(documents).to.have.length(2);
    expect(chunks).to.have.length(2);
  });

  it('preserves a concurrent published winner and its documents when the publication CAS loses', async () => {
    const version = await draft();
    beforePublish = () => {
      versions[0].status = 'published';
      documents.push({ id: 'winner-document', brandId, collectionVersionId: version.id, documentKey: 'winner' });
      chunks.push({
        id: 'winner-chunk',
        brandId,
        collectionVersionId: version.id,
        documentId: 'winner-document',
        chunkKey: 'winner:001',
      });
    };
    await rejection(service.publish(brandId, version.id, inputs, 'author'));
    expect(versions[0].status).to.equal('published');
    expect(documents.some(row => row.id === 'winner-document')).to.equal(true);
    expect(chunks.some(row => row.id === 'winner-chunk')).to.equal(true);
  });

  it('never reuses matching published hashes from another brand or collection', async () => {
    const version = await draft();
    const contentHash = canonicalHash({ manifest: version.manifest, documents: inputs });
    versions.push(
      { id: 'other-brand', brandId: 'brand-b', collectionId, status: 'published', contentHash },
      { id: 'other-collection', brandId, collectionId: 'collection-b', status: 'published', contentHash }
    );
    expect((await service.publish(brandId, version.id, inputs, 'author')).id).to.equal(version.id);
    expect(collection.publishedVersionId).to.equal(version.id);
    expect(documents).to.have.length(2);
  });

  it('preserves published content if updating the collection pointer fails after publication', async () => {
    const version = await draft();
    failCollectionPointer = true;
    await rejection(service.publish(brandId, version.id, inputs, 'author'));
    expect(versions[0].status).to.equal('published');
    expect(documents).to.have.length(2);
    expect(chunks).to.have.length(2);
    failCollectionPointer = false;
    const retryDraft = await draft();
    const recovered = await service.publish(brandId, retryDraft.id, inputs, 'author');
    expect(recovered.id).to.equal(version.id);
    expect(collection.publishedVersionId).to.equal(version.id);
    expect(documents).to.have.length(2);
    expect(chunks).to.have.length(2);
    expect((await service.publish(brandId, version.id, inputs, 'author')).id).to.equal(version.id);
    expect(documents).to.have.length(2);
  });
});
