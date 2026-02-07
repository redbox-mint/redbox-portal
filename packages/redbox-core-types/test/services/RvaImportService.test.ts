import { expect } from 'chai';
import * as sinon from 'sinon';
import axios from 'axios';

describe('RvaImportService', () => {
  let service: any;

  beforeEach(() => {
    (global as any)._ = require('lodash');
    (global as any).sails = {
      config: { vocab: { rva: { baseUrl: 'https://example.org/rva' } }, auth: { defaultBrand: 'default' } },
      services: {
        vocabularyservice: {
          create: sinon.stub().resolves({ id: 'v1', name: 'Imported' }),
          upsertEntries: sinon.stub().resolves({ created: 1, updated: 2, skipped: 0 })
        }
      },
      log: { error: sinon.stub(), verbose: sinon.stub(), debug: sinon.stub() }
    };

    (global as any).Vocabulary = {
      findOne: sinon.stub().resolves({ id: 'v1', source: 'rva', sourceId: 'rva-1', name: 'Existing' }),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves() })
    };

    const mockClient = {
      get: sinon.stub()
    };

    mockClient.get.onCall(0).resolves({ data: [{ id: 'v-1', title: 'Vocabulary' }] });
    mockClient.get.onCall(1).resolves({ data: { id: 'rva-1', title: 'RVA Vocab', version: [{ id: 'ver-1', status: 'current' }] } });
    mockClient.get.onCall(2).resolves({ data: { items: [{ id: 'c1', label: 'A', notation: 'a' }] } });
    mockClient.get.onCall(3).resolves({ data: { id: 'rva-1', title: 'RVA Vocab', version: [{ id: 'ver-1', status: 'current' }] } });
    mockClient.get.onCall(4).resolves({ data: { items: [{ id: 'c1', label: 'A', notation: 'a' }] } });

    sinon.stub(axios, 'create').returns(mockClient as any);

    const mod = require('../../src/services/RvaImportService');
    service = new mod.Services.RvaImport();
  });

  afterEach(() => {
    sinon.restore();
    delete (global as any).Vocabulary;
    delete (global as any).sails;
  });

  it('imports an RVA vocabulary', async () => {
    const created = await service.importRvaVocabulary('rva-1');
    expect(created.id).to.equal('v1');
  });

  it('syncs an RVA vocabulary', async () => {
    const result = await service.syncRvaVocabulary('v1');
    expect(result.updated).to.equal(2);
    expect(result.created).to.equal(1);
  });
});
