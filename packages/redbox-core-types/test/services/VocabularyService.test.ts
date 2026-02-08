import { expect } from 'chai';
import * as sinon from 'sinon';

describe('VocabularyService', () => {
  let service: any;

  beforeEach(() => {
    (global as any)._ = require('lodash');
    (global as any).sails = {
      log: { error: sinon.stub(), verbose: sinon.stub(), debug: sinon.stub() },
      config: { auth: { defaultBrand: 'default' } },
      services: {}
    };

    (global as any).Vocabulary = {
      count: sinon.stub().resolves(1),
      find: sinon.stub().returns({ sort: sinon.stub().returnsThis(), skip: sinon.stub().returnsThis(), limit: sinon.stub().resolves([{ id: 'v1', name: 'V1' }]) }),
      findOne: sinon.stub().resolves({ id: 'v1', name: 'V1', type: 'flat' }),
      create: sinon.stub().returns({ fetch: sinon.stub().resolves({ id: 'v1' }) }),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves({ id: 'v1' }) }),
      destroyOne: sinon.stub().resolves()
    };

    (global as any).VocabularyEntry = {
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
    (global as any).VocabularyEntry.find = sinon.stub().returns({
      sort: sinon.stub().callsFake(() => ({
        sort: sinon.stub().resolves(entries)
      }))
    });

    const mod = require('../../src/services/VocabularyService');
    service = new mod.Services.Vocabulary();
  });

  afterEach(() => {
    sinon.restore();
    delete (global as any).Vocabulary;
    delete (global as any).VocabularyEntry;
    delete (global as any).sails;
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
