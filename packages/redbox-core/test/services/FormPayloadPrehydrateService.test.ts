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
    };

    const { Services } = require('../../src/services/FormPayloadPrehydrateService');
    service = new Services.FormPayloadPrehydrateService();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).VocabularyService;
    sinon.restore();
  });

  it('extracts checkbox tree targets from nested component definitions', function () {
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
                }
              ]
            }
          }
        }
      ]
    });

    expect(extracted).to.have.length(1);
    expect(extracted[0].vocabRef).to.equal('anzsrc');
  });

  it('builds checkbox tree payloads', async function () {
    const payload = await service.build({
      branding: { id: 'default', name: 'default' },
      formConfig: {
        name: 'test-form',
        componentDefinitions: [
          {
            name: 'tree',
            component: { class: 'CheckboxTreeComponent', config: { vocabRef: 'anzsrc' } },
            model: { config: { value: [{ notation: '0101', genealogy: ['01'] }] } }
          }
        ]
      },
    });

    expect(payload?.vocabTrees?.anzsrc?.selectedNotations).to.deep.equal(['0101']);
    expect(payload?.vocabTrees?.anzsrc?.childrenByParentId.__root__).to.exist;
    expect(payload).to.not.have.property('typeaheadLabels');
  });
});
