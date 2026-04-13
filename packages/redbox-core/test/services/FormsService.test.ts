let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createQueryObject } from './testHelper';
import { of } from 'rxjs';
import { FormConfigFrame, FormModesConfig } from "@researchdatabox/sails-ng-common";
import { formConfigExample1 } from "../unit/example-data";
import { reusableFormDefinitions, TemplateFormConfigVisitor } from "../../src";

function findComponentDefinitionByName(componentDefinitions: unknown[] | undefined, targetName: string): any {
  for (const componentDefinition of componentDefinitions ?? []) {
    const typedDefinition = componentDefinition as any;
    if (typedDefinition?.name === targetName) {
      return typedDefinition;
    }

    const nestedDefinitions = typedDefinition?.component?.config?.componentDefinitions as unknown[] | undefined;
    const nestedMatch = findComponentDefinitionByName(nestedDefinitions, targetName);
    if (nestedMatch) {
      return nestedMatch;
    }
  }

  return undefined;
}

describe('FormsService', function () {
  let mockSails: any;
  let FormsService: any;
  let mockForm: any;
  let mockWorkflowStep: any;
  let mockRecordType: any;

  beforeEach(function () {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        appmode: {
          bootstrapAlways: false
        },
        form: {
          formConfigRegistry: {
            'default-form': {
              type: 'rdmp',
              fields: [],
              messages: {},
              attachmentFields: []
            }
          },
          forms: {
            'default-form': {
              type: 'rdmp',
              fields: [],
              messages: {},
              attachmentFields: []
            }
          }
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

    mockForm = {
      find: sinon.stub().resolves([]),
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().resolves({ id: 'created-form' }),
      destroyOne: sinon.stub().resolves({}),
      update: sinon.stub().returns({ set: sinon.stub().resolves({}) })
    };

    mockWorkflowStep = {
      findOne: sinon.stub().returns(createQueryObject(null)),
      update: sinon.stub().returns({ set: sinon.stub().resolves({}) })
    };

    mockRecordType = {
      findOne: sinon.stub().returns(createQueryObject(null))
    };

    setupServiceTestGlobals(mockSails);
    (global as any).BrandingService = {
      getDefault: sinon.stub().returns({ id: 'default-brand' }),
      getBrand: sinon.stub().returns({ id: 'default-brand' }),
      getBrandFromReq: sinon.stub().returns('default'),
    };
    (global as any).Form = mockForm;
    (global as any).WorkflowStep = mockWorkflowStep;
    (global as any).RecordType = mockRecordType;

    const { Services } = require('../../src/services/FormsService');
    FormsService = new Services.Forms();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).BrandingService;
    delete (global as any).Form;
    delete (global as any).WorkflowStep;
    delete (global as any).RecordType;
    sinon.restore();
  });

  describe('flattenFields', function () {
    it('should flatten fields recursively', function () {
      const fields = [
        { name: 'field1' },
        { name: 'group1', fields: [{ name: 'field2' }] }
      ];
      const result: any[] = [];

      FormsService.flattenFields(fields, result);

      expect(result).to.have.length(3);
      expect(result[0].name).to.equal('field1');
      expect(result[1].name).to.equal('group1');
      expect(result[2].name).to.equal('field2');
    });
  });

  describe('filterFieldsHasEditAccess', function () {
    it('should remove fields requiring edit access if user lacks it', function () {
      const fields = [
        { definition: { name: 'field1' } },
        { definition: { name: 'field2' }, needsEditAccess: true }
      ];

      FormsService.filterFieldsHasEditAccess(fields, false);

      expect(fields).to.have.length(1);
      expect(fields[0].definition.name).to.equal('field1');
    });

    it('should keep fields requiring edit access if user has it', function () {
      const fields = [
        { definition: { name: 'field1' } },
        { definition: { name: 'field2' }, needsEditAccess: true }
      ];

      FormsService.filterFieldsHasEditAccess(fields, true);

      expect(fields).to.have.length(2);
    });

    it('should filter nested fields', function () {
      const fields = [
        {
          definition: {
            name: 'group1',
            fields: [
              { definition: { name: 'field1' } },
              { definition: { name: 'field2' }, needsEditAccess: true }
            ]
          }
        }
      ];

      FormsService.filterFieldsHasEditAccess(fields, false);

      expect(fields[0].definition.fields).to.have.length(1);
      expect(fields[0].definition.fields[0].definition.name).to.equal('field1');
    });
  });

  describe('listForms', function () {
    it('should return list of forms', async function () {
      const forms = [{ name: 'form1' }];
      mockForm.find.returns(createQueryObject(forms));

      const result = await FormsService.listForms('brand-1').toPromise();

      expect(mockForm.find.called).to.be.true;
      expect(mockForm.find.calledWith({ branding: 'brand-1' })).to.be.true;
      expect(result).to.deep.equal(forms);
    });
  });

  describe('getFormByName', function () {
    it('should return form by name', async function () {
      const form = { name: 'form1', fields: [] };
      mockForm.findOne.returns(createQueryObject(form));

      const result = await FormsService.getFormByName('form1', false, 'brand-1').toPromise();

      expect(mockForm.findOne.calledWith({ name: 'form1', branding: 'brand-1' })).to.be.true;
      expect(result).to.deep.equal(form);
    });

    it('should return null if form not found', async function () {
      mockForm.findOne.returns(createQueryObject(null));

      const result = await FormsService.getFormByName('form1', false).toPromise();

      expect(result).to.be.null;
    });
  });

  describe('getForm', function () {
    it('should get form using name from record', async function () {
      const record = { metaMetadata: { form: 'form1' } };
      const brand = { id: 'brand-1' };
      sinon.stub(FormsService, 'getFormByName').returns(of({ name: 'form1' }));

      const result = await FormsService.getForm(brand, undefined, false, 'type', record);

      expect(FormsService.getFormByName.calledWith('form1', false, 'brand-1')).to.be.true;
      expect(result).to.deep.equal({ name: 'form1' });
    });

    it('should look up generated-view-only form from the registry (no longer generates schema at runtime)', async function () {
      const record = { metaMetadata: { form: 'generated-view-only' } };
      const brand = { id: 'brand-1' };
      const mockFormResult = { name: 'generated-view-only', configuration: {} };
      sinon.stub(FormsService, 'getFormByName').returns(of(mockFormResult));

      const result = await FormsService.getForm(brand, undefined, false, '', record);

      expect(FormsService.getFormByName.calledWith('generated-view-only', false, 'brand-1')).to.be.true;
      expect(result).to.deep.equal(mockFormResult);
    });

    it('should backfill the returned form configuration type from the record type when the stored form type is blank', async function () {
      const record = { metaMetadata: { form: 'generated-view-only', type: 'party' } };
      const brand = { id: 'brand-1' };
      const mockFormResult = {
        name: 'generated-view-only',
        configuration: { type: '', componentDefinitions: [] }
      };
      sinon.stub(FormsService, 'getFormByName').returns(of(mockFormResult));

      const result = await FormsService.getForm(brand, undefined, false, '', record);

      expect(result?.configuration?.type).to.equal('party');
      expect(mockFormResult.configuration.type).to.equal('');
    });
  });

  describe('bootstrap', function () {
    it('should create form if not exists', async function () {
      const workflowStep = { id: 'step-1', config: { form: 'default-form' } };
      sinon.stub(FormsService, 'getFormConfigRegistry').returns({
        'default-form': { type: 'rdmp', fields: [], messages: {}, attachmentFields: [] }
      });
      mockForm.find.resolves([]); // not found initially
      mockForm.create.resolves({ id: 'form-1' });

      await FormsService.bootstrap(workflowStep, 'brand-1');

      expect(mockForm.create.called).to.be.true;
      expect(mockWorkflowStep.update.calledWith({ id: 'step-1' })).to.be.true;
    });

    it('should preserve top-level behaviours when bootstrapping form config from the registry', async function () {
      const workflowStep = { id: 'step-1', config: { form: 'default-form' } };
      sinon.stub(FormsService, 'getFormConfigRegistry').returns({
        'default-form': {
          type: 'rdmp',
          attachmentFields: [],
          componentDefinitions: [],
          behaviours: [
            {
              name: 'fetch-on-ready',
              condition: '$exists(runtimeContext.requestParams.rdmpOid)',
              conditionKind: 'jsonata_query',
              runOnFormReady: true,
              processors: [{ type: 'fetchMetadata' }],
              actions: [
                {
                  type: 'emitEvent',
                  config: {
                    eventType: 'field.value.changed',
                    fieldId: '/mainTab/aim/rdmpGetter',
                    sourceId: '*'
                  }
                }
              ]
            }
          ]
        }
      });
      mockForm.find.resolves([]);
      mockForm.create.resolves({ id: 'form-1' });

      await FormsService.bootstrap(workflowStep, 'brand-1');

      expect(mockForm.create.calledOnce).to.be.true;
      expect(mockForm.create.firstCall.args[0].configuration.behaviours).to.deep.equal([
        {
          name: 'fetch-on-ready',
          condition: '$exists(runtimeContext.requestParams.rdmpOid)',
          conditionKind: 'jsonata_query',
          runOnFormReady: true,
          processors: [{ type: 'fetchMetadata' }],
          actions: [
            {
              type: 'emitEvent',
              config: {
                eventType: 'field.value.changed',
                fieldId: '/mainTab/aim/rdmpGetter',
                sourceId: '*'
              }
            }
          ]
        }
      ]);
    });

    it('should prefer formConfigRegistry over legacy forms', async function () {
      sinon.stub(FormsService, 'getFormConfigRegistry').returns({
        'default-form': { type: 'rdmp', fields: [], messages: {}, attachmentFields: [] }
      });
      const workflowStep = { id: 'step-1', config: { form: 'default-form' } };
      mockForm.find.resolves([]);
      mockForm.create.resolves({ id: 'form-1' });

      await FormsService.bootstrap(workflowStep, 'brand-1');

      expect(mockForm.create.called).to.be.true;
    });

    it('should skip if form exists', async function () {
      sinon.stub(FormsService, 'getFormConfigRegistry').returns({
        'default-form': { type: 'rdmp', fields: [], messages: {}, attachmentFields: [] }
      });
      const workflowStep = { id: 'step-1', config: { form: 'default-form' } };
      // First find (by form name from workflow step config) returns existing form
      mockForm.find.onFirstCall().resolves([{ id: 'existing-form', name: 'default-form' }]);

      await FormsService.bootstrap(workflowStep, 'brand-1');

      expect(mockForm.create.called).to.be.false;
    });

    it('should destroy and recreate if bootstrapAlways is true', async function () {
      mockSails.config.appmode.bootstrapAlways = true;
      sinon.stub(FormsService, 'getFormConfigRegistry').returns({
        'default-form': { type: 'rdmp', fields: [], messages: {}, attachmentFields: [] }
      });
      const workflowStep = { id: 'step-1', config: { form: 'default-form' } };

      // first find returns something (existing linked form)
      mockForm.find.onFirstCall().resolves([{ id: 'existing-linked' }]);
      // second find (for formName) should return empty so we create new one?
      // Wait, logic says:
      // if bootstrapAlways: destroyOne. form = null.
      // then if !form (true), find formName from config.
      // then check existingFormDef.

      // so find calls:
      // 1. find linked form (returns something) -> destroy called. form set to null.
      // 2. find existing form def (by name).

      mockForm.find.resolves([]); // default
      mockForm.find.onFirstCall().resolves([{ id: 'existing-linked' }]);
      mockForm.find.onSecondCall().resolves([]); // not found by name after destroy (so we create)

      mockForm.destroyOne.resolves({});
      mockForm.create.resolves({ id: 'form-1' });

      await FormsService.bootstrap(workflowStep, 'brand-1');

      expect(mockForm.destroyOne.called).to.be.true;
      expect(mockForm.create.called).to.be.true;
    });
  });

  describe('inferSchemaFromMetadata', function () {
    it('should create schema from metadata', function () {
      const record = {
        metadata: {
          title: 'Test',
          count: 10
        }
      };

      const schema = FormsService.inferSchemaFromMetadata(record);

      expect(schema.properties).to.have.property('title');
      expect(schema.properties.title.type).to.equal('string');
      expect(schema.properties.count.type).to.equal('integer');
    });
  });

  describe('buildClientFormConfig', async function () {
    it('should build the client form config for a basic form', async function () {
      const item: FormConfigFrame = formConfigExample1;
      const formMode: FormModesConfig = "edit";
      const userRoles: string[] = [];
      const recordMetadata: Record<string, unknown> = {};
      const reusableFormDefs = reusableFormDefinitions;

      // see: Services.FormRecordConsistency.extractRawTemplates
      const form = await FormsService.buildClientFormConfig(item, formMode, userRoles, recordMetadata, reusableFormDefs);
      const visitor = new TemplateFormConfigVisitor(mockSails.log);

      expect(form).to.have.property('name');
      expect(form.name).to.eql(item.name);

      const templates = visitor.start({ form });

      const expected = [
        { kind: "handlebars" }, { kind: "jsonata" },
        { kind: "jsonata" }, { kind: "jsonata" },
        { kind: "jsonata" }, { kind: "jsonata" },
        { kind: "jsonata" }, { kind: "jsonata" },
        { kind: "jsonata" },
      ];
      expect(templates).to.containSubset(expected);
      expect(templates).to.have.length(expected.length);
    });

    it('should apply context variables in the returned form', async function () {
      const item: FormConfigFrame = {
        name: 'custom-fields-test',
        componentDefinitions: [
          {
            name: 'intro',
            component: {
              class: 'ContentComponent',
              config: {
                content: 'Welcome @user_name'
              }
            }
          },
          {
            name: 'title',
            component: {
              class: 'SimpleInputComponent',
              config: {}
            },
            model: {
              class: 'SimpleInputModel',
              config: {
                defaultValue: 'Title for @user_name'
              }
            }
          }
        ]
      };

      const contextVariablesMap = {
        '@user_name': 'Alice'
      };
      const form = await FormsService.buildClientFormConfig(
        item,
        'edit',
        [],
        {},
        {},
        'default',
        contextVariablesMap
      );

      const contentConfig = form.componentDefinitions?.[0]?.component?.config as { content?: string };
      const titleConfig = form.componentDefinitions?.[1]?.model?.config as { defaultValue?: string };

      expect(contentConfig.content).to.equal('Welcome Alice');
      expect(titleConfig.defaultValue).to.equal('Title for Alice');
    });

    it('should populate generated view-only metadata display content from the record metadata', async function () {
      const form = await FormsService.buildClientFormConfig(
        {
          name: 'generated-view-only',
          componentDefinitions: [
            {
              name: 'generated_view_only_metadata',
              overrides: {
                reusableFormName: 'generated-view-only-metadata-display'
              },
              component: {
                class: 'ReusableComponent',
                config: {
                  componentDefinitions: []
                }
              }
            }
          ]
        },
        'view',
        [],
        {
          title: 'Lecturer, Field Education',
          nested: { school: 'JCU' }
        },
        reusableFormDefinitions
      );

      const metadataDisplay = findComponentDefinitionByName(
        form.componentDefinitions as unknown[] | undefined,
        'generated_view_only_metadata_display'
      )?.component?.config as {
        content?: Record<string, unknown>;
      };

      expect(metadataDisplay.content).to.deep.equal({
        title: 'Lecturer, Field Education',
        nested: { school: 'JCU' }
      });
    });

    it('should populate generated view-only metadata content for any form that includes the metadata display component', async function () {
      const form = await FormsService.buildClientFormConfig(
        {
          name: 'other-form',
          componentDefinitions: [
            {
              name: 'generated_view_only_metadata',
              overrides: {
                reusableFormName: 'generated-view-only-metadata-display'
              },
              component: {
                class: 'ReusableComponent',
                config: {
                  componentDefinitions: []
                }
              }
            }
          ]
        },
        'view',
        [],
        {
          title: 'Should inject'
        },
        reusableFormDefinitions
      );

      const metadataDisplay = findComponentDefinitionByName(
        form.componentDefinitions as unknown[] | undefined,
        'generated_view_only_metadata_display'
      )?.component?.config as {
        content?: Record<string, unknown>;
      };

      expect(metadataDisplay.content).to.deep.equal({
        title: 'Should inject'
      });
    });
  });
});
