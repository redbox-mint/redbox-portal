let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('FormPayloadPrehydrateService', function () {
  let service: any;

  beforeEach(function () {
    const mockSails = createMockSails({
      config: {
        appPath: '/app',
        form: {
          prehydrate: {
            enabled: true,
            maxTypeaheadValues: 50,
            maxVocabSelections: 50,
          }
        }
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
      }
    });
    setupServiceTestGlobals(mockSails);
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'default', name: 'default' })
    };
    (global as any).VocabularyService = {
      getChildren: sinon.stub().resolves({
        entries: [{ id: 'e1', label: 'Root', value: '01', identifier: '01', hasChildren: true }],
        meta: { vocabularyId: 'v1', parentId: null, total: 1 }
      }),
      getEntryByNotation: sinon.stub().callsFake(async (_branding: string, _vocabRef: string, notation: string) => {
        const entries: Record<string, any> = {
          '01': { id: 'e1', vocabulary: 'v1', label: 'Root', value: '01', identifier: '01', parent: null },
          '0101': { id: 'e2', vocabulary: 'v1', label: 'Child', value: '0101', identifier: '0101', parent: 'e1' },
        };
        return entries[notation] ?? null;
      }),
      getAncestorChain: sinon.stub().resolves([
        { id: 'e1', vocabulary: 'v1', label: 'Root', value: '01', identifier: '01', parent: null },
        { id: 'e2', vocabulary: 'v1', label: 'Child', value: '0101', identifier: '0101', parent: 'e1' },
      ]),
      getByIdOrSlug: sinon.stub().resolves({ id: 'v1' })
    };
    (global as any).VocabService = {
      findRecords: sinon.stub().resolves({
        records: [
          { person: { display: { label: 'Jane Doe' }, id: 'user-1' } }
        ]
      })
    };
    (global as any).VocabularyEntry = {
      findOne: sinon.stub().resolves({ label: 'Open', value: 'open', identifier: 'open', historical: false })
    };

    const { Services } = require('../../src/services/FormPayloadPrehydrateService');
    service = new Services.FormPayloadPrehydrateService();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).BrandingService;
    delete (global as any).VocabularyService;
    delete (global as any).VocabService;
    delete (global as any).VocabularyEntry;
    sinon.restore();
  });

  it('extracts checkbox tree and typeahead targets from nested component definitions', function () {
    const extracted = service.extractTargets({
      name: 'test-form',
      componentDefinitions: [
        {
          name: 'group',
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'tree',
                  component: { class: 'CheckboxTreeComponent', config: { vocabRef: 'anzsrc' } },
                  model: { config: { value: [{ notation: '0101', genealogy: ['01'] }] } }
                },
                {
                  name: 'typeahead',
                  component: { class: 'TypeaheadInputComponent', config: { sourceType: 'namedQuery', queryId: 'party', labelField: 'person.display.label', valueField: 'person.id' } },
                  model: { config: { value: 'user-1' } }
                }
              ]
            }
          }
        }
      ]
    });

    expect(extracted.checkboxTrees).to.have.length(1);
    expect(extracted.checkboxTrees[0].vocabRef).to.equal('anzsrc');
    expect(extracted.typeaheads).to.have.length(1);
    expect(extracted.typeaheads[0].sourceRef).to.equal('party');
  });

  it('builds vocab tree and typeahead payloads', async function () {
    const payload = await service.build({
      branding: { id: 'default', name: 'default' },
      formConfig: {
        name: 'test-form',
        componentDefinitions: [
          {
            name: 'tree',
            component: { class: 'CheckboxTreeComponent', config: { vocabRef: 'anzsrc' } },
            model: { config: { value: [{ notation: '0101', genealogy: ['01'] }] } }
          },
          {
            name: 'typeahead',
            component: { class: 'TypeaheadInputComponent', config: { sourceType: 'namedQuery', queryId: 'party', labelField: 'person.display.label', valueField: 'person.id' } },
            model: { config: { value: 'user-1' } }
          }
        ]
      },
      user: {}
    });

    expect(payload?.vocabTrees?.anzsrc?.selectedNotations).to.deep.equal(['0101']);
    expect(payload?.vocabTrees?.anzsrc?.childrenByParentId.__root__).to.exist;
    expect(payload?.typeaheadLabels?.['namedQuery:party:person.display.label:person.id:user-1']?.label).to.equal('Jane Doe');
  });
});
