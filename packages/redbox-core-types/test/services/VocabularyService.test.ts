import { expect } from 'chai';
import * as sinon from 'sinon';
import * as lodash from 'lodash';
import { Services as VocabularyServiceModule } from '../../src/services/VocabularyService';

type StubbedLogger = {
  error: (...args: unknown[]) => void;
  verbose: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
};

type StubbedSails = {
  log: StubbedLogger;
  config: { auth: { defaultBrand: string } };
  services: Record<string, unknown>;
};

type VocabularyFindChain = {
  sort: (...args: unknown[]) => VocabularyFindChain;
  skip: (...args: unknown[]) => VocabularyFindChain;
  limit: (...args: unknown[]) => Promise<Array<{ id: string; name: string }>>;
};

type VocabularyModelStub = {
  count: (...args: unknown[]) => Promise<number>;
  find: (...args: unknown[]) => VocabularyFindChain;
  findOne: (...args: unknown[]) => Promise<{ id: string; name: string; type: 'flat' } | null>;
  create: (...args: unknown[]) => { fetch: (...args: unknown[]) => Promise<{ id: string }> };
  updateOne: (...args: unknown[]) => { set: (...args: unknown[]) => Promise<{ id: string }> };
  destroyOne: (...args: unknown[]) => Promise<void>;
};

type VocabularyEntryModelStub = {
  count: (...args: unknown[]) => Promise<number>;
  find: (...args: unknown[]) => {
    sort: (...args: unknown[]) => {
      sort: (...args: unknown[]) => {
        skip: (...args: unknown[]) => {
          limit: (...args: unknown[]) => Promise<Array<Record<string, unknown>>>
        }
      }
    }
  };
  destroy: (...args: unknown[]) => Promise<void>;
  findOne: (...args: unknown[]) => Promise<null>;
  create: (...args: unknown[]) => { fetch: (...args: unknown[]) => Promise<{ id: string }> };
  updateOne: (...args: unknown[]) => { set: (...args: unknown[]) => Promise<{ id: string }> };
};

type TestGlobals = typeof globalThis & {
  sails: StubbedSails;
  Vocabulary: VocabularyModelStub;
  VocabularyEntry: VocabularyEntryModelStub;
  BrandingService: { getBrand?: (nameOrId: string) => { id?: string } | null };
};

describe('VocabularyService', () => {
  let service: VocabularyServiceModule.VocabularyService;
  let g: TestGlobals;

  beforeEach(() => {
    g = globalThis as TestGlobals;
    Reflect.set(globalThis, '_', lodash);
    g.sails = {
      log: { error: sinon.stub(), verbose: sinon.stub(), debug: sinon.stub() },
      config: { auth: { defaultBrand: 'default' } },
      services: {}
    };

    g.Vocabulary = {
      count: sinon.stub().resolves(1),
      find: sinon.stub().returns({ sort: sinon.stub().returnsThis(), skip: sinon.stub().returnsThis(), limit: sinon.stub().resolves([{ id: 'v1', name: 'V1' }]) }),
      findOne: sinon.stub().resolves({ id: 'v1', name: 'V1', type: 'flat' }),
      create: sinon.stub().returns({ fetch: sinon.stub().resolves({ id: 'v1' }) }),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves({ id: 'v1' }) }),
      destroyOne: sinon.stub().resolves()
    };

    g.VocabularyEntry = {
      count: sinon.stub().resolves(2),
      find: sinon.stub().returns({
        sort: sinon.stub().returns({
          sort: sinon.stub().returns({
            skip: sinon.stub().returns({
              limit: sinon.stub().resolves([])
            })
          })
        })
      }),
      destroy: sinon.stub().resolves(),
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().returns({ fetch: sinon.stub().resolves({ id: 'e1' }) }),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves({ id: 'e1' }) })
    };

    const entries = [
      { id: 'e1', vocabulary: 'v1', label: 'Parent', value: 'parent', order: 0 },
      { id: 'e2', vocabulary: 'v1', label: 'Child', value: 'child', parent: 'e1', order: 1 }
    ];
    g.VocabularyEntry.find = sinon.stub().returns({
      sort: sinon.stub().callsFake(() => ({
        sort: sinon.stub().callsFake(() => ({
          skip: sinon.stub().returns({
            limit: sinon.stub().resolves(entries)
          })
        }))
      }))
    });

    service = new VocabularyServiceModule.VocabularyService();
    g.BrandingService = {
      getBrand: sinon.stub().returns({ id: 'default' })
    };
  });

  afterEach(() => {
    sinon.restore();
    Reflect.deleteProperty(globalThis, 'Vocabulary');
    Reflect.deleteProperty(globalThis, 'VocabularyEntry');
    Reflect.deleteProperty(globalThis, 'BrandingService');
    Reflect.deleteProperty(globalThis, 'sails');
    Reflect.deleteProperty(globalThis, '_');
  });

  it('lists vocabularies with pagination metadata', async () => {
    const result = await service.list({ limit: 10, offset: 0 });
    expect(result.meta.limit).to.equal(10);
    expect(result.data).to.have.length(1);
  });

  it('normalizes entries', () => {
    const normalized = service.normalizeEntry({
      id: 'e-normalize',
      label: '  Science ',
      value: ' SCI ',
      identifier: 'science',
      order: 0,
      historical: true
    });
    expect(normalized.label).to.equal('Science');
    expect(normalized.value).to.equal('SCI');
    expect(normalized.historical).to.equal(true);
  });

  it('builds a tree response', async () => {
    g.VocabularyEntry.find = sinon.stub().returns({
      sort: sinon.stub().callsFake(() => ({
        sort: sinon.stub().resolves([
          { id: 'e1', vocabulary: 'v1', label: 'Parent', value: 'parent', order: 0 },
          { id: 'e2', vocabulary: 'v1', label: 'Child', value: 'child', parent: 'e1', order: 1 }
        ])
      }))
    }) as unknown as VocabularyEntryModelStub['find'];
    const tree = await service.getTree('v1');
    expect(tree).to.have.length(1);
    expect(tree[0].children).to.have.length(1);
  });

  it('gets vocabulary by id first then slug fallback', async () => {
    const findOne = sinon.stub();
    findOne.onFirstCall().resolves(null);
    findOne.onSecondCall().resolves({ id: 'v1', name: 'Access rights', type: 'flat', slug: 'access-rights' });
    g.Vocabulary.findOne = findOne as unknown as VocabularyModelStub['findOne'];

    const result = await service.getByIdOrSlug('default', 'access-rights');

    expect(result?.id).to.equal('v1');
    expect(findOne.callCount).to.equal(2);
  });

  it('returns null when getByIdOrSlug has no branding or value', async () => {
    const result = await service.getByIdOrSlug('', '');
    expect(result).to.equal(null);
  });

  it('gets entries with metadata and search filter', async () => {
    g.Vocabulary.findOne = sinon.stub().onFirstCall().resolves({ id: 'v1', name: 'Access rights', type: 'flat', slug: 'access-rights', branding: 'default' }) as unknown as VocabularyModelStub['findOne'];
    const countStub = sinon.stub().resolves(2);
    g.VocabularyEntry.count = countStub as unknown as VocabularyEntryModelStub['count'];
    g.VocabularyEntry.find = sinon.stub().returns({
      sort: sinon.stub().returns({
        sort: sinon.stub().returns({
          skip: sinon.stub().returns({
            limit: sinon.stub().resolves([
              { id: 'e1', label: 'Open', value: 'open' },
              { id: 'e2', label: 'Closed', value: 'closed' }
            ])
          })
        })
      })
    }) as unknown as VocabularyEntryModelStub['find'];

    const result = await service.getEntries('default', 'access-rights', { search: 'op', limit: 5000, offset: 1 });

    expect(result?.meta.total).to.equal(2);
    expect(result?.meta.limit).to.equal(1000);
    expect(result?.meta.offset).to.equal(1);
    expect(result?.meta.vocabularyId).to.equal('v1');
    expect(countStub.calledOnce).to.equal(true);
  });

  it('returns null from getEntries when vocabulary does not exist', async () => {
    g.Vocabulary.findOne = sinon.stub().resolves(null) as unknown as VocabularyModelStub['findOne'];
    const result = await service.getEntries('default', 'missing');
    expect(result).to.equal(null);
  });

  it('upserts entries with synthetic parent ids by remapping parents after create', async () => {
    const updateSetStub = sinon.stub().resolves({ id: 'ok' });
    const updateOneStub = sinon.stub().callsFake(() => ({ set: updateSetStub }));
    g.VocabularyEntry.updateOne = updateOneStub as unknown as VocabularyEntryModelStub['updateOne'];

    const createFetchParent = sinon.stub().resolves({ id: 'db-parent' });
    const createFetchChild = sinon.stub().resolves({ id: 'db-child' });
    g.VocabularyEntry.create = sinon.stub()
      .onFirstCall().returns({ fetch: createFetchParent })
      .onSecondCall().returns({ fetch: createFetchChild }) as unknown as VocabularyEntryModelStub['create'];

    g.VocabularyEntry.findOne = sinon.stub().callsFake(async (criteria: Record<string, unknown>) => {
      if (criteria.id === 'db-parent') {
        return { id: 'db-parent', vocabulary: 'v1', parent: null };
      }
      if (criteria.id === 'db-child') {
        return { id: 'db-child', vocabulary: 'v1', parent: 'db-parent' };
      }
      return null;
    }) as unknown as VocabularyEntryModelStub['findOne'];

    const result = await service.upsertEntries('v1', [
      { id: 'root-0', label: 'Parent', value: 'parent', identifier: 'p', order: 0 },
      { id: 'root-0-0', parent: 'root-0', label: 'Child', value: 'child', identifier: 'c', order: 1 }
    ]);

    expect(result.created).to.equal(2);
    expect(result.updated).to.equal(0);
    const setPayloads = updateSetStub.getCalls().map((call) => call.args[0]);
    expect(setPayloads.some((payload) => payload?.parent === 'db-parent')).to.equal(true);
  });
});
