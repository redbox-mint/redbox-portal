let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import * as lodash from 'lodash';
import { ResourcesApi, ServicesApi } from '@researchdatabox/rva-registry-openapi-generated-node';
import { Services as RvaImportServiceModule } from '../../src/services/RvaImportService';

describe('RvaImportService', () => {
  let service: any;
  let createStub: sinon.SinonStub;
  let conceptTreeStub: sinon.SinonStub;
  let getVocabularyByIdStub: sinon.SinonStub;

  beforeEach(() => {
    (global as any)._ = lodash;
    createStub = sinon.stub().resolves({ id: 'v1', name: 'Imported' });
    (global as any).sails = {
      config: { vocab: { rva: { baseUrl: 'https://example.org/rva' } }, auth: { defaultBrand: 'default' } },
      services: {
        vocabularyservice: {
          create: createStub,
          upsertEntries: sinon.stub().resolves({ created: 1, updated: 2, skipped: 0 })
        }
      },
      log: { error: sinon.stub(), verbose: sinon.stub(), debug: sinon.stub() }
    };

    (global as any).Vocabulary = {
      findOne: sinon.stub().resolves({ id: 'v1', source: 'rva', sourceId: '1', name: 'Existing' }),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves() }),
      getDatastore: sinon.stub().returns(null)
    };
    (global as any).VocabularyService = (global as any).sails.services.vocabularyservice;

    getVocabularyByIdStub = sinon.stub(ResourcesApi.prototype, 'getVocabularyById');
    getVocabularyByIdStub.onCall(0).resolves({
      data: { id: 1, title: 'RVA Vocab', version: [{ id: 101, status: 'current' }] }
    } as unknown as Awaited<ReturnType<ResourcesApi['getVocabularyById']>>);
    getVocabularyByIdStub.onCall(1).resolves({
      data: { id: 1, title: 'RVA Vocab', version: [{ id: 101, status: 'current' }] }
    } as unknown as Awaited<ReturnType<ResourcesApi['getVocabularyById']>>);

    conceptTreeStub = sinon.stub(ResourcesApi.prototype, 'getVersionArtefactConceptTree').resolves({
      data: JSON.stringify([{ id: 'c1', label: 'A', notation: 'a' }])
    } as unknown as Awaited<ReturnType<ResourcesApi['getVersionArtefactConceptTree']>>);
    sinon.stub(ServicesApi.prototype, 'search').resolves({
      data: {
        response: {
          docs: [{ id: '1', title: 'RVA Vocab', slug: 'anzsrc-for' }]
        }
      }
    } as unknown as Awaited<ReturnType<ServicesApi['search']>>);

    service = new RvaImportServiceModule.RvaImport();
  });

  afterEach(() => {
    sinon.restore();
    delete (global as any).Vocabulary;
    delete (global as any).VocabularyService;
    delete (global as any).sails;
    delete (global as any)._;
  });

  it('imports an RVA vocabulary', async () => {
    const created = await service.importRvaVocabulary('1');
    expect(created.id).to.equal('v1');
  });

  it('imports RVA concept trees that use narrower links', async () => {
    conceptTreeStub.resolves({
      data: JSON.stringify({
        forest: [
          {
            iri: 'https://example.org/root',
            prefLabel: 'Root',
            narrower: [
              {
                iri: 'https://example.org/child',
                prefLabel: 'Child'
              }
            ]
          }
        ]
      })
    } as unknown as Awaited<ReturnType<ResourcesApi['getVersionArtefactConceptTree']>>);

    await service.importRvaVocabulary('1');

    expect(createStub.calledOnce).to.equal(true);
    const payload = createStub.firstCall.args[0];
    expect(payload.type).to.equal('tree');
    expect(payload.entries).to.be.an('array');
    expect(payload.entries).to.have.length(2);
    expect(payload.entries[0].label).to.equal('Root');
    expect(payload.entries[1].label).to.equal('Child');
    expect(payload.entries[1].parent).to.equal(payload.entries[0].id);
  });

  it('syncs an RVA vocabulary', async () => {
    const result = await service.syncRvaVocabulary('v1');
    expect(result.updated).to.equal(2);
    expect(result.created).to.equal(1);
  });

  it('imports an RVA vocabulary from an RVA URL', async () => {
    await service.importRvaVocabulary('https://vocabs.ardc.edu.au/repository/api/lda/anzsrc-for/2020');
    expect(getVocabularyByIdStub.firstCall.args[0]).to.equal(1);
  });

  it('prioritises importable versions when selecting a version automatically', async () => {
    getVocabularyByIdStub.onCall(0).resolves({
      data: {
        id: 1,
        title: 'RVA Vocab',
        version: [
          { id: 101, status: 'current', 'do-import': false, 'release-date': '2025-01-01' },
          { id: 102, status: 'superseded', 'do-import': true, 'release-date': '2024-01-01' }
        ]
      }
    } as unknown as Awaited<ReturnType<ResourcesApi['getVocabularyById']>>);

    await service.importRvaVocabulary('1');

    expect(conceptTreeStub.firstCall.args[0]).to.equal(102);
  });

  it('throws a clear error when RVA has no current concept tree for the selected version', async () => {
    conceptTreeStub.rejects({
      isAxiosError: true,
      response: {
        status: 400,
        data: 'No current concept tree for that version.'
      }
    });

    try {
      await service.importRvaVocabulary('1');
      expect.fail('Expected importRvaVocabulary to throw');
    } catch (error) {
      expect(String(error)).to.contain('has no current concept tree artefact');
    }
  });

  it('deduplicates repeated RVA identifiers to satisfy unique entry constraints', async () => {
    conceptTreeStub.resolves({
      data: JSON.stringify({
        forest: [
          {
            iri: 'https://example.org/root-a',
            label: 'Root A',
            children: [
              {
                iri: 'https://example.org/shared-concept',
                label: 'Shared'
              }
            ]
          },
          {
            iri: 'https://example.org/root-b',
            label: 'Root B',
            children: [
              {
                iri: 'https://example.org/shared-concept',
                label: 'Shared'
              }
            ]
          }
        ]
      })
    } as unknown as Awaited<ReturnType<ResourcesApi['getVersionArtefactConceptTree']>>);

    await service.importRvaVocabulary('1');

    expect(createStub.calledOnce).to.equal(true);
    const payload = createStub.firstCall.args[0];
    const sharedEntries = payload.entries.filter((entry: { label: string }) => entry.label === 'Shared');
    expect(sharedEntries).to.have.length(2);
    expect(sharedEntries[0].identifier).to.equal('https://example.org/shared-concept');
    expect(sharedEntries[1].identifier).to.equal('https://example.org/shared-concept#2');
  });
});
