import { expect } from 'chai';
import * as sinon from 'sinon';
import * as lodash from 'lodash';
import { ResourcesApi } from '@researchdatabox/rva-registry-openapi-generated-node';
import { Services as RvaImportServiceModule } from '../../src/services/RvaImportService';

describe('RvaImportService', () => {
  let service: any;

  beforeEach(() => {
    (global as any)._ = lodash;
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
      findOne: sinon.stub().resolves({ id: 'v1', source: 'rva', sourceId: '1', name: 'Existing' }),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves() })
    };

    const getVocabularyByIdStub = sinon.stub(ResourcesApi.prototype, 'getVocabularyById');
    getVocabularyByIdStub.onCall(0).resolves({
      data: { id: 1, title: 'RVA Vocab', version: [{ id: 101, status: 'current' }] }
    } as unknown as Awaited<ReturnType<ResourcesApi['getVocabularyById']>>);
    getVocabularyByIdStub.onCall(1).resolves({
      data: { id: 1, title: 'RVA Vocab', version: [{ id: 101, status: 'current' }] }
    } as unknown as Awaited<ReturnType<ResourcesApi['getVocabularyById']>>);

    sinon.stub(ResourcesApi.prototype, 'getVersionArtefactConceptTree')
      .onCall(0)
      .resolves({
        data: JSON.stringify([{ id: 'c1', label: 'A', notation: 'a' }])
      } as unknown as Awaited<ReturnType<ResourcesApi['getVersionArtefactConceptTree']>>)
      .onCall(1)
      .resolves({
        data: JSON.stringify([{ id: 'c1', label: 'A', notation: 'a' }])
      } as unknown as Awaited<ReturnType<ResourcesApi['getVersionArtefactConceptTree']>>);

    service = new RvaImportServiceModule.RvaImport();
  });

  afterEach(() => {
    sinon.restore();
    delete (global as any).Vocabulary;
    delete (global as any).sails;
  });

  it('imports an RVA vocabulary', async () => {
    const created = await service.importRvaVocabulary('1');
    expect(created.id).to.equal('v1');
  });

  it('syncs an RVA vocabulary', async () => {
    const result = await service.syncRvaVocabulary('v1');
    expect(result.updated).to.equal(2);
    expect(result.created).to.equal(1);
  });
});
