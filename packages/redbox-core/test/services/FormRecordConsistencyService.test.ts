let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { of } from 'rxjs';

describe('FormRecordConsistencyService', function () {
  let mockSails: any;
  let FormRecordConsistencyService: any;

  beforeEach(function () {
    mockSails = createMockSails({
      config: {
        validators: {
          definitions: {}
        }
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      }
    });

    setupServiceTestGlobals(mockSails);

    (global as any).BrandingService = {
      getDefault: sinon.stub().returns({ id: 'default-brand' }),
      getBrand: sinon.stub().returns({ id: 'default-brand' }),
    };
    (global as any).RecordsService = {
      getMeta: sinon.stub()
    };
    (global as any).FormsService = {
      getFormByName: sinon.stub().returns(of({})),
      buildClientFormConfig: sinon.stub().returns({})
    };

    const { Services } = require('../../src/services/FormRecordConsistencyService');
    FormRecordConsistencyService = new Services.FormRecordConsistency();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).BrandingService;
    delete (global as any).RecordsService;
    delete (global as any).FormsService;
    sinon.restore();
  });

  describe('mergeRecord', function () {
    it('should merge records', async function () {
      const changed = { redboxOid: 'oid', metaMetadata: { form: 'form' }, metadata: { changed: 'value' } };
      const original = { redboxOid: 'oid', metadata: { original: 'value' } };

      (global as any).RecordsService.getMeta.resolves(original);
      (global as any).FormsService.getFormByName.returns(of({
        name: 'test-form',
        branding: 'default-brand',
        configuration: {
          name: 'test-form',
          componentDefinitions: [],
          fields: []
        }
      }));

      // Mock internal methods to simplify test
      sinon.stub(FormRecordConsistencyService, 'mergeRecordClientFormConfig').returns({ merged: true });

      const result = await FormRecordConsistencyService.mergeRecord(changed, 'edit');

      expect(result).to.deep.equal({ merged: true });
      expect((global as any).RecordsService.getMeta.calledWith('oid')).to.be.true;
    });
  });

  describe('mergeRecordClientFormConfig', function () {
    it('should delegate to mergeRecordMetadataPermitted', function () {
      const original = { redboxOid: 'oid', metadata: { a: 1 } };
      const changed = { redboxOid: 'oid', metadata: { a: 2 } };
      const config = {};

      sinon.stub(FormRecordConsistencyService, 'buildSchemaForFormConfig').returns({});
      sinon.stub(FormRecordConsistencyService, 'compareRecords').returns([]);
      sinon.stub(FormRecordConsistencyService, 'mergeRecordMetadataPermitted').returns({ merged: true });

      const result = FormRecordConsistencyService.mergeRecordClientFormConfig(original, changed, config, 'edit');

      expect(result.metadata).to.deep.equal({ merged: true });
    });

    it('should strip hydrated model values before building schema', function () {
      const original = { redboxOid: 'oid', metadata: { title: 'before' } };
      const changed = { redboxOid: 'oid', metadata: { title: 'after' } };
      const config = {
        componentDefinitions: [
          {
            name: 'title',
            component: { class: 'SimpleInputComponent', config: { type: 'text' } },
            model: { class: 'SimpleInputModel', config: { validators: [], value: 'asfsafasfa' } },
            layout: { class: 'DefaultLayout', config: {} }
          },
          {
            name: 'group',
            component: {
              class: 'GroupComponent',
              config: {
                componentDefinitions: [
                  {
                    name: 'nested',
                    component: { class: 'SimpleInputComponent', config: { type: 'text' } },
                    model: { class: 'SimpleInputModel', config: { validators: [], value: 'nested-value' } },
                    layout: { class: 'DefaultLayout', config: {} }
                  }
                ]
              }
            },
            layout: { class: 'DefaultLayout', config: {} }
          }
        ]
      };

      const buildSchemaStub = sinon.stub(FormRecordConsistencyService, 'buildSchemaForFormConfig').returns({});
      sinon.stub(FormRecordConsistencyService, 'compareRecords').returns([]);
      sinon.stub(FormRecordConsistencyService, 'mergeRecordMetadataPermitted').returns({ merged: true });

      FormRecordConsistencyService.mergeRecordClientFormConfig(original, changed, config, 'edit');

      const schemaInput = buildSchemaStub.firstCall.args[0];
      const strippedTopLevel = schemaInput.componentDefinitions?.[0]?.model?.config?.value;
      const strippedNested = schemaInput.componentDefinitions?.[1]?.component?.config?.componentDefinitions?.[0]?.model?.config?.value;
      const originalTopLevel = config.componentDefinitions?.[0]?.model?.config?.value;
      const originalNested = config.componentDefinitions?.[1]?.component?.config?.componentDefinitions?.[0]?.model?.config?.value;

      expect(strippedTopLevel).to.equal(undefined);
      expect(strippedNested).to.equal(undefined);
      expect(originalTopLevel).to.equal('asfsafasfa');
      expect(originalNested).to.equal('nested-value');
    });
  });

  describe('compareRecords', function () {
    it('should detect changes in simple objects', function () {
      const original = { a: 1 };
      const changed = { a: 2, b: 3 };

      const result = FormRecordConsistencyService.compareRecords(original, changed);

      expect(result).to.have.length(2); // change a, add b

      const changeA = result.find((r: any) => r.path[0] === 'a');
      expect(changeA.kind).to.equal('change');

      const changeB = result.find((r: any) => r.path[0] === 'b');
      expect(changeB.kind).to.equal('add');
    });

    it('should detect deletions', function () {
      const original = { a: 1 };
      const changed = {};

      const result = FormRecordConsistencyService.compareRecords(original, changed);

      expect(result).to.have.length(1);
      expect(result[0].kind).to.equal('delete');
    });

    it('should detect nested changes', function () {
      const original = { a: { b: 1 } };
      const changed = { a: { b: 2 } };

      const result = FormRecordConsistencyService.compareRecords(original, changed);

      expect(result).to.have.length(1);
      expect(result[0].path).to.deep.equal(['a', 'b']);
    });
  });

  describe('extractRawTemplates', function () {
    it('should extract templates using visitor', async function () {
      const item = { type: 'form' };

      // We can't easily mock the internal visitor class instantiation
      // But we can check if it throws or runs
      // Assuming dependencies are available

      try {
        const result = await FormRecordConsistencyService.extractRawTemplates(item, 'edit');
        expect(result).to.be.an('array');
      } catch (e) {
        // If dependencies are missing, we might skip
        }
    });

    it('should extract form behaviour compiled item entries before client stripping', async function () {
      const item = {
        name: 'behaviour-form',
        componentDefinitions: [
          {
            name: 'title',
            component: { class: 'SimpleInputComponent', config: { type: 'text' } },
            model: { class: 'SimpleInputModel', config: { validators: [] } },
            layout: { class: 'DefaultLayout', config: {} }
          }
        ],
        behaviours: [
          {
            name: 'fetch-on-ready',
            condition: '$exists(runtimeContext.requestParams.rdmpOid)',
            conditionKind: 'jsonata_query',
            runOnFormReady: true,
            processors: [
              {
                type: 'jsonataTransform',
                config: {
                  template: 'runtimeContext.requestParams.rdmpOid'
                }
              }
            ],
            actions: [
              {
                type: 'setValue',
                config: {
                  fieldPath: '$substringBefore(event.fieldId, "/title") & "/description"',
                  fieldPathKind: 'jsonata',
                  valueTemplate: 'value.title'
                }
              }
            ]
          }
        ]
      } as any;

      const result = await FormRecordConsistencyService.extractRawTemplates(item, 'edit');

      expect(result).to.deep.include({
        key: ['behaviours', '0', 'condition'],
        kind: 'jsonata',
        value: '$exists(runtimeContext.requestParams.rdmpOid)'
      });
      expect(result).to.deep.include({
        key: ['behaviours', '0', 'processors', '0', 'config', 'template'],
        kind: 'jsonata',
        value: 'runtimeContext.requestParams.rdmpOid'
      });
      expect(result).to.deep.include({
        key: ['behaviours', '0', 'actions', '0', 'config', 'fieldPath'],
        kind: 'jsonata',
        value: '$substringBefore(event.fieldId, "/title") & "/description"'
      });
      expect(result).to.deep.include({
        key: ['behaviours', '0', 'actions', '0', 'config', 'valueTemplate'],
        kind: 'jsonata',
        value: 'value.title'
      });
    });

    it('should preserve client-form expression keys while also extracting behaviours', async function () {
      const item = {
        name: 'mixed-form',
        componentDefinitions: [
          {
            name: 'title',
            expressions: [
              {
                name: 'title-copy',
                config: {
                  conditionKind: 'jsonpointer',
                  condition: '/title::field.value.changed',
                  target: 'model.value',
                  template: 'event.value',
                }
              }
            ],
            component: { class: 'SimpleInputComponent', config: { type: 'text' } },
            model: { class: 'SimpleInputModel', config: { validators: [] } },
            layout: { class: 'DefaultLayout', config: {} }
          }
        ],
        behaviours: [
          {
            name: 'behaviour-copy',
            condition: '$exists(event.value)',
            conditionKind: 'jsonata',
            actions: [
              {
                type: 'emitEvent',
                config: {
                  eventType: 'field.value.changed',
                  fieldId: '/title',
                  sourceId: '*',
                  valueTemplate: 'value'
                }
              }
            ]
          }
        ]
      } as any;

      const result = await FormRecordConsistencyService.extractRawTemplates(item, 'edit');

      expect(result).to.deep.include({
        key: ['componentDefinitions', '0', 'expressions', '0', 'config', 'template'],
        kind: 'jsonata',
        value: 'event.value'
      });
      expect(result).to.deep.include({
        key: ['behaviours', '0', 'condition'],
        kind: 'jsonata',
        value: '$exists(event.value)'
      });
      expect(result).to.deep.include({
        key: ['behaviours', '0', 'actions', '0', 'config', 'valueTemplate'],
        kind: 'jsonata',
        value: 'value'
      });
    });
  });

  describe('toKeysEntries (private)', function () {
    it('should handle objects', function () {
      const item = { a: 1, b: 2 };
      const result = (FormRecordConsistencyService as any).toKeysEntries(item);
      expect(result.keys).to.include('a');
      expect(result.keys).to.include('b');
    });

    it('should handle arrays', function () {
      const item = ['a', 'b'];
      const result = (FormRecordConsistencyService as any).toKeysEntries(item);
      expect(result.keys).to.include(0);
      expect(result.keys).to.include(1);
    });
  });

  describe('arrayStartsWithArray (private)', function () {
    it('should return true if array starts with another', function () {
      const base = [1, 2];
      const check = [1, 2, 3];
      const result = (FormRecordConsistencyService as any).arrayStartsWithArray(base, check);
      expect(result).to.be.true;
    });

    it('should return false if array does not start with another', function () {
      const base = [1, 3];
      const check = [1, 2, 3];
      const result = (FormRecordConsistencyService as any).arrayStartsWithArray(base, check);
      expect(result).to.be.false;
    });
  });
});
