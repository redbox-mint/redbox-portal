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
  find: (...args: unknown[]) => { sort: (...args: unknown[]) => { sort: (...args: unknown[]) => Promise<Array<Record<string, unknown>>> } };
  destroy: (...args: unknown[]) => Promise<void>;
  findOne: (...args: unknown[]) => Promise<null>;
  create: (...args: unknown[]) => { fetch: (...args: unknown[]) => Promise<{ id: string }> };
  updateOne: (...args: unknown[]) => { set: (...args: unknown[]) => Promise<{ id: string }> };
};

type TestGlobals = typeof globalThis & {
  sails: StubbedSails;
  Vocabulary: VocabularyModelStub;
  VocabularyEntry: VocabularyEntryModelStub;
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
      find: sinon.stub().returns({ sort: sinon.stub().returnsThis(), limit: sinon.stub().returnsThis(), skip: sinon.stub().returnsThis(), then: undefined, }),
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
        sort: sinon.stub().resolves(entries)
      }))
    });

    service = new VocabularyServiceModule.VocabularyService();
  });

  afterEach(() => {
    sinon.restore();
    Reflect.deleteProperty(globalThis, 'Vocabulary');
    Reflect.deleteProperty(globalThis, 'VocabularyEntry');
    Reflect.deleteProperty(globalThis, 'sails');
    Reflect.deleteProperty(globalThis, '_');
  });

  it('lists vocabularies with pagination metadata', async () => {
    const result = await service.list({ limit: 10, offset: 0 });
    expect(result.meta.limit).to.equal(10);
    expect(result.data).to.have.length(1);
  });

  it('normalizes entries', () => {
    const normalized = service.normalizeEntry({ label: '  Science ', value: ' SCI ' });
    expect(normalized.label).to.equal('Science');
    expect(normalized.value).to.equal('SCI');
  });

  it('builds a tree response', async () => {
    const tree = await service.getTree('v1');
    expect(tree).to.have.length(1);
    expect(tree[0].children).to.have.length(1);
  });
});
