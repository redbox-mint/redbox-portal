let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
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
            maxRecordMetadataOids: 50,
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
      ]),
    };
    (global as any).RecordsService = {
      getMeta: sinon.stub().callsFake(async (oid: string) => ({
        redboxOid: oid,
        metadata: { title: `Title ${oid}` },
        metaMetadata: {},
      })),
      hasViewAccess: sinon.stub().returns(true),
    };
    (global as any).FormsService = {
      getFormByName: sinon.stub(),
      buildClientFormConfig: sinon.stub(),
    };
    (global as any).FormRecordConsistencyService = {
      mergeRecordClientFormConfig: sinon.stub(),
    };

    const { Services } = require('../../src/services/FormPayloadPrehydrateService');
    service = new Services.FormPayloadPrehydrateService();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).VocabularyService;
    delete (global as any).RecordsService;
    delete (global as any).FormsService;
    delete (global as any).FormRecordConsistencyService;
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

  it('extracts checkbox tree targets from tab component definitions', function () {
    const extracted = service.extractTargets({
      name: 'test-form',
      componentDefinitions: [
        {
          name: 'tabs',
          component: {
            class: 'TabComponent',
            config: {
              tabs: [
                {
                  name: 'project',
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      componentDefinitions: [
                        {
                          name: 'for',
                          component: { class: 'CheckboxTreeComponent', config: { vocabRef: 'anzsrc-2020-for' } },
                          model: { config: { value: [{ notation: '320101', genealogy: ['32', '3201'] }] } }
                        }
                      ]
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    });

    expect(extracted).to.have.length(1);
    expect(extracted[0].vocabRef).to.equal('anzsrc-2020-for');
    expect(extracted[0].selectedValues[0]).to.deep.equal({ notation: '320101', genealogy: ['32', '3201'] });
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

  it('extracts record metadata targets from nested groups, tabs and panels', function () {
    const extracted = service.extractRecordMetadataTargets({
      name: 'test-form',
      componentDefinitions: [
        {
          name: 'group',
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'display-1',
                  component: { class: 'RecordMetadataDisplayComponent', config: {} },
                  model: { config: { value: 'oid-1' } }
                }
              ]
            }
          }
        },
        {
          name: 'tabs',
          component: {
            class: 'TabComponent',
            config: {
              tabs: [
                {
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      componentDefinitions: [
                        {
                          name: 'display-2',
                          component: { class: 'RecordMetadataDisplayComponent', config: {} },
                          model: { config: { value: ['oid-2', 'oid-1'] } }
                        }
                      ]
                    }
                  }
                }
              ]
            }
          }
        },
        {
          name: 'accordion',
          component: {
            class: 'AccordionComponent',
            config: {
              panels: [
                {
                  component: {
                    class: 'AccordionPanelComponent',
                    config: {
                      componentDefinitions: [
                        {
                          name: 'display-3',
                          component: { class: 'RecordMetadataDisplayComponent', config: {} },
                          model: { config: { value: ['oid-3', ''] } }
                        }
                      ]
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    });

    expect(extracted).to.deep.equal([
      { oid: 'oid-1' },
      { oid: 'oid-2' },
      { oid: 'oid-3' },
    ]);
  });

  it('builds record metadata payloads and tolerates partial lookup failures', async function () {
    (global as any).RecordsService.getMeta = sinon.stub().callsFake(async (oid: string) => {
      if (oid === 'oid-fail') {
        throw new Error('boom');
      }
      return {
        redboxOid: oid,
        metadata: { title: `Title ${oid}` },
        metaMetadata: {},
      };
    });

    const payload = await service.build({
      branding: { id: 'default', name: 'default' },
      user: { roles: [] },
      formConfig: {
        name: 'test-form',
        componentDefinitions: [
          {
            name: 'display',
            component: { class: 'RecordMetadataDisplayComponent', config: {} },
            model: { config: { value: ['oid-1', 'oid-fail', 'oid-1'] } }
          }
        ]
      },
    });

    expect((global as any).RecordsService.getMeta.calledTwice).to.be.true;
    expect(payload?.recordMetadata).to.deep.equal({
      'oid-1': { oid: 'oid-1', data: { title: 'Title oid-1' } },
      'oid-fail': { oid: 'oid-fail', error: true }
    });
  });

  it('omits inaccessible records from record metadata prehydrate', async function () {
    (global as any).RecordsService.hasViewAccess = sinon.stub().callsFake((_branding: unknown, _user: unknown, _roles: unknown, record: any) => {
      return record.redboxOid !== 'oid-hidden';
    });

    const payload = await service.build({
      branding: { id: 'default', name: 'default' },
      user: { roles: [] },
      formConfig: {
        name: 'test-form',
        componentDefinitions: [
          {
            name: 'display',
            component: { class: 'RecordMetadataDisplayComponent', config: {} },
            model: { config: { value: ['oid-visible', 'oid-hidden'] } }
          }
        ]
      },
    });

    expect(payload?.recordMetadata).to.deep.equal({
      'oid-visible': { oid: 'oid-visible', data: { title: 'Title oid-visible' } }
    });
  });
});
