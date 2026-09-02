let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createQueryObject } from './testHelper';
import { of } from 'rxjs';
import { FormConfigFrame, FormModesConfig } from '@researchdatabox/sails-ng-common';
import type { AvailableFormComponentDefinitionOutlines } from '@researchdatabox/sails-ng-common';
import { formConfigExample1 } from '../unit/example-data';
import { reusableFormDefinitions, TemplateFormConfigVisitor } from '../../src';
import type { RecordContractContext } from '../../src/record-contract/record-contract-context';

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
          bootstrapAlways: false,
        },
        form: {
          formConfigRegistry: {
            'default-form': {
              type: 'rdmp',
              fields: [],
              messages: {},
              attachmentFields: [],
            },
          },
          forms: {
            'default-form': {
              type: 'rdmp',
              fields: [],
              messages: {},
              attachmentFields: [],
            },
          },
        },
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
      },
    });

    mockForm = {
      find: sinon.stub().resolves([]),
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().resolves({ id: 'created-form' }),
      destroyOne: sinon.stub().resolves({}),
      update: sinon.stub().returns({ set: sinon.stub().resolves({}) }),
    };

    mockWorkflowStep = {
      findOne: sinon.stub().returns(createQueryObject(null)),
      update: sinon.stub().returns({ set: sinon.stub().resolves({}) }),
    };

    mockRecordType = {
      findOne: sinon.stub().returns(createQueryObject(null)),
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
    delete (global as any).RecordTypesService;
    delete (global as any).WorkflowStepsService;
    sinon.restore();
  });

  describe('flattenFields', function () {
    it('should flatten fields recursively', function () {
      const fields = [{ name: 'field1' }, { name: 'group1', fields: [{ name: 'field2' }] }];
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
      const fields = [{ definition: { name: 'field1' } }, { definition: { name: 'field2' }, needsEditAccess: true }];

      FormsService.filterFieldsHasEditAccess(fields, false);

      expect(fields).to.have.length(1);
      expect(fields[0].definition.name).to.equal('field1');
    });

    it('should keep fields requiring edit access if user has it', function () {
      const fields = [{ definition: { name: 'field1' } }, { definition: { name: 'field2' }, needsEditAccess: true }];

      FormsService.filterFieldsHasEditAccess(fields, true);

      expect(fields).to.have.length(2);
    });

    it('should filter nested fields', function () {
      const fields = [
        {
          definition: {
            name: 'group1',
            fields: [{ definition: { name: 'field1' } }, { definition: { name: 'field2' }, needsEditAccess: true }],
          },
        },
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

    it('should fall back to the default branding when none is provided', async function () {
      const form = { name: 'form1', fields: [] };
      mockForm.findOne.returns(createQueryObject(form));

      const result = await FormsService.getFormByName('form1', false).toPromise();

      expect(mockForm.findOne.calledWith({ name: 'form1', branding: 'default-brand' })).to.be.true;
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
        configuration: { type: '', componentDefinitions: [] },
      };
      sinon.stub(FormsService, 'getFormByName').returns(of(mockFormResult));

      const result = await FormsService.getForm(brand, undefined, false, '', record);

      expect(result?.configuration?.type).to.equal('party');
      expect(mockFormResult.configuration.type).to.equal('');
    });
  });

  describe('validation operation discovery', function () {
    it('removes internal operation policy and transports only safe discovery fields', function () {
      const form = {
        id: 'form-1',
        name: 'dataset-draft',
        branding: 'brand-1',
        configuration: {
          name: 'dataset-draft',
          validationOperations: {
            submit: {
              enabledValidationGroups: ['secret-group'],
              roles: ['SecretRole'],
              allowedTargetSteps: ['private-stage'],
            },
          },
          componentDefinitions: [],
        },
      };

      const publicForm = FormsService.toPublicForm(form, [
        {
          name: 'submit',
          label: 'Submit',
          description: 'Send for review',
          allowedTargetSteps: ['review'],
        },
      ]);

      expect(publicForm.configuration).not.to.have.property('validationOperations');
      expect(publicForm.validationOperations).to.deep.equal([
        {
          name: 'submit',
          label: 'Submit',
          description: 'Send for review',
          allowedTargetSteps: ['review'],
        },
      ]);
      expect(form.configuration.validationOperations.submit.roles).to.deep.equal(['SecretRole']);
      const metadata = JSON.stringify(publicForm.validationOperations);
      expect(metadata).not.to.include('SecretRole');
      expect(metadata).not.to.include('secret-group');
      expect(metadata).not.to.include('private-stage');
    });

    it('uses one discovery call for the actor-authorized target set and sanitizes the result', async function () {
      const discoverOperations = sinon.stub();
      discoverOperations.resolves([
        { name: 'draft', label: 'Save draft', roles: ['SecretRole'] },
        {
          name: 'submit',
          label: ' Submit ',
          allowedTargetSteps: ['review', 'private'],
          roles: ['SecretRole'],
          enabledValidationGroups: ['secret-group'],
          exceptionText: 'database password',
        },
      ]);
      mockSails.services = {
        recordsservice: {
          hasEditAccess: sinon.stub().returns(true),
          hasTransitionRoleAuthorization: sinon.stub().callsFake((step: any) => step.name !== 'private'),
        },
        recordvalidationservice: { discoverOperations },
      };
      (global as any).RecordTypesService = {
        get: sinon.stub().returns(of({ id: 'record-type-1', name: 'dataset' })),
      };
      (global as any).WorkflowStepsService = {
        getAllForRecordType: sinon.stub().returns(
          of([
            { name: 'review', config: { authorization: { transitionRoles: ['Researcher'] } } },
            { name: 'private', config: { authorization: { transitionRoles: ['Admin'] } } },
          ])
        ),
      };
      const operations = await FormsService.discoverValidationOperations({
        brand: { id: 'brand-1' },
        form: { name: 'dataset-draft', branding: 'brand-1', configuration: { type: 'dataset' } },
        recordType: 'dataset',
        record: {
          redboxOid: 'record-1',
          metadata: { title: 'Record' },
          metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
          workflow: { stage: 'draft' },
          authorization: { edit: ['alice'] },
        },
        user: { username: 'alice', roles: [{ name: 'Researcher' }] },
        editable: true,
      });

      expect(operations).to.deep.equal([
        { name: 'draft', label: 'Save draft' },
        { name: 'submit', label: 'Submit', allowedTargetSteps: ['review'] },
      ]);
      expect(discoverOperations.callCount).to.equal(1);
      expect(discoverOperations.firstCall.args[0]).to.deep.include({
        writeKind: 'update',
        authorizedTargetSteps: ['review'],
      });
      expect(discoverOperations.firstCall.args[0].candidate.metaMetadata).to.deep.include({
        type: 'dataset',
        form: 'dataset-draft',
      });
      expect((global as any).RecordTypesService.get.firstCall.args[1]).to.equal('dataset');
      expect((global as any).WorkflowStepsService.getAllForRecordType.calledOnce).to.equal(true);
      expect(JSON.stringify(discoverOperations.args)).not.to.include('private-stage');
      expect(JSON.stringify(operations)).not.to.include('SecretRole');
      expect(JSON.stringify(operations)).not.to.include('secret-group');
      expect(JSON.stringify(operations)).not.to.include('database password');
      expect(JSON.stringify(operations)).not.to.include('private');
    });

    it('fails closed when a record form is attached to a different requested form payload', async function () {
      const discoverOperations = sinon.stub().resolves([{ name: 'submit' }]);
      mockSails.services = {
        recordsservice: {
          hasEditAccess: sinon.stub().returns(true),
          hasTransitionRoleAuthorization: sinon.stub().returns(true),
        },
        recordvalidationservice: { discoverOperations },
      };

      const operations = await FormsService.discoverValidationOperations({
        brand: { id: 'brand-1' },
        form: { name: 'forged-form', branding: 'brand-1', configuration: { type: 'dataset' } },
        record: {
          redboxOid: 'record-1',
          metadata: {},
          metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
        },
        user: { username: 'alice', roles: [] },
        editable: true,
      });

      expect(operations).to.deep.equal([]);
      expect(discoverOperations.called).to.equal(false);
    });

    it('omits discovery when the actor lacks edit access or context is missing', async function () {
      const discoverOperations = sinon.stub().resolves([{ name: 'submit' }]);
      mockSails.services = {
        recordsservice: {
          hasEditAccess: sinon.stub().returns(false),
          hasTransitionRoleAuthorization: sinon.stub().returns(true),
        },
        recordvalidationservice: { discoverOperations },
      };
      const form = { name: 'dataset-draft', branding: 'brand-1', configuration: { type: 'dataset' } };
      const record = {
        metadata: {},
        metaMetadata: { brandId: 'brand-1', type: 'dataset', form: 'dataset-draft' },
      };

      expect(
        await FormsService.discoverValidationOperations({
          brand: { id: 'brand-1' },
          form,
          record,
          user: { username: 'alice', roles: [] },
          editable: true,
        })
      ).to.deep.equal([]);
      expect(
        await FormsService.discoverValidationOperations({
          brand: { id: 'brand-1' },
          form,
          record: null,
          user: null,
          editable: true,
        })
      ).to.deep.equal([]);
      expect(discoverOperations.called).to.equal(false);
    });

    it('does not mix a caller-supplied record type or unrelated form into create discovery', async function () {
      const discoverOperations = sinon.stub().resolves([{ name: 'submit' }]);
      mockSails.services = {
        recordsservice: {
          hasEditAccess: sinon.stub().returns(true),
          hasTransitionRoleAuthorization: sinon.stub().returns(true),
        },
        recordvalidationservice: { discoverOperations },
      };
      const getRecordType = sinon.stub().returns(of({ id: 'record-type-1', name: 'dataset' }));
      (global as any).RecordTypesService = { get: getRecordType };
      (global as any).WorkflowStepsService = {
        getAllForRecordType: sinon.stub().returns(
          of([
            { name: 'draft', starting: true, config: { form: 'dataset-draft' } },
            { name: 'review', config: { form: 'dataset-review' } },
          ])
        ),
      };
      const user = { username: 'alice', roles: [{ name: 'Researcher' }] };

      expect(
        await FormsService.discoverValidationOperations({
          brand: { id: 'brand-1' },
          form: { name: 'dataset-draft', branding: 'brand-1', configuration: { type: 'dataset' } },
          recordType: 'unrelated-type',
          user,
          editable: true,
        })
      ).to.deep.equal([]);
      expect(getRecordType.called).to.equal(false);

      expect(
        await FormsService.discoverValidationOperations({
          brand: { id: 'brand-1' },
          form: { name: 'unrelated-form', branding: 'brand-1', configuration: { type: 'dataset' } },
          recordType: 'dataset',
          user,
          editable: true,
        })
      ).to.deep.equal([]);
      expect(discoverOperations.called).to.equal(false);
    });
  });

  describe('bootstrap', function () {
    it('should create form if not exists', async function () {
      const workflowStep = { id: 'step-1', config: { form: 'default-form' } };
      sinon.stub(FormsService, 'getFormConfigRegistry').returns({
        'default-form': { type: 'rdmp', fields: [], messages: {}, attachmentFields: [] },
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
                    sourceId: '*',
                  },
                },
              ],
            },
          ],
        },
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
                sourceId: '*',
              },
            },
          ],
        },
      ]);
    });

    it('should preserve validation operations when bootstrapping form config from the registry', async function () {
      const workflowStep = { id: 'step-1', config: { form: 'default-form' } };
      const validationOperations = {
        submit: {
          enabledValidationGroups: ['all', 'submission'],
          label: '@submit',
          description: '@submit-description',
          roles: ['Researcher'],
          allowedTargetSteps: ['review'],
        },
      };
      sinon.stub(FormsService, 'getFormConfigRegistry').returns({
        'default-form': {
          type: 'rdmp',
          attachmentFields: [],
          componentDefinitions: [],
          validationOperations,
        },
      });
      mockForm.find.resolves([]);
      mockForm.create.resolves({ id: 'form-1' });

      await FormsService.bootstrap(workflowStep, 'brand-1');

      expect(mockForm.create.calledOnce).to.be.true;
      expect(mockForm.create.firstCall.args[0].configuration.validationOperations).to.deep.equal(validationOperations);
    });

    it('should prefer formConfigRegistry over legacy forms', async function () {
      sinon.stub(FormsService, 'getFormConfigRegistry').returns({
        'default-form': { type: 'rdmp', fields: [], messages: {}, attachmentFields: [] },
      });
      const workflowStep = { id: 'step-1', config: { form: 'default-form' } };
      mockForm.find.resolves([]);
      mockForm.create.resolves({ id: 'form-1' });

      await FormsService.bootstrap(workflowStep, 'brand-1');

      expect(mockForm.create.called).to.be.true;
    });

    it('should skip if form exists', async function () {
      sinon.stub(FormsService, 'getFormConfigRegistry').returns({
        'default-form': { type: 'rdmp', fields: [], messages: {}, attachmentFields: [] },
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
        'default-form': { type: 'rdmp', fields: [], messages: {}, attachmentFields: [] },
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

  describe('record contract startup candidates', function () {
    it('returns every configured form in stable order with detached reusable definitions', function () {
      const firstForm = { name: 'a-form', componentDefinitions: [{ name: 'title' }] };
      const secondForm = { name: 'z-form', componentDefinitions: [{ name: 'description' }] };
      const reusable = { common: [{ name: 'shared' }] };
      mockSails.config.reusableFormDefinitions = reusable;
      sinon.stub(FormsService, 'getFormConfigRegistry').returns({
        'z-form': secondForm,
        'a-form': firstForm,
      });

      const candidates = FormsService.listConfiguredRecordContractForms();

      expect(candidates.map((candidate: { name: string }) => candidate.name)).to.deep.equal(['a-form', 'z-form']);
      expect(candidates[0].form).to.deep.equal(firstForm);
      expect(candidates[0].form).not.to.equal(firstForm);
      expect(candidates[0].reusableFormDefinitions).to.deep.equal(reusable);
      expect(candidates[0].reusableFormDefinitions).not.to.equal(reusable);
      expect(candidates[0].reusableFormDefinitions).not.to.equal(candidates[1].reusableFormDefinitions);
    });
  });

  describe('inferSchemaFromMetadata', function () {
    it('should create schema from metadata', function () {
      const record = {
        metadata: {
          title: 'Test',
          count: 10,
        },
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
      const formMode: FormModesConfig = 'edit';
      const userRoles: string[] = [];
      const recordMetadata: Record<string, unknown> = {};
      const reusableFormDefs = reusableFormDefinitions;

      // see: Services.FormRecordConsistency.extractRawTemplates
      const form = await FormsService.buildClientFormConfig(
        item,
        formMode,
        userRoles,
        recordMetadata,
        reusableFormDefs
      );
      const visitor = new TemplateFormConfigVisitor(mockSails.log);

      expect(form).to.have.property('name');
      expect(form.name).to.eql(item.name);

      const templates = await visitor.start({ form });

      const expected = [
        { kind: 'handlebars' },
        { kind: 'jsonata' },
        { kind: 'jsonata' },
        { kind: 'jsonata' },
        { kind: 'jsonata' },
        { kind: 'jsonata' },
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
                content: 'Welcome @user_name',
              },
            },
          },
          {
            name: 'title',
            component: {
              class: 'SimpleInputComponent',
              config: {},
            },
            model: {
              class: 'SimpleInputModel',
              config: {
                defaultValue: 'Title for @user_name',
              },
            },
          },
        ],
      };

      const contextVariablesMap = {
        '@user_name': 'Alice',
      };
      const form = await FormsService.buildClientFormConfig(item, 'edit', [], null, {}, 'default', contextVariablesMap);

      const contentConfig = form.componentDefinitions?.[0]?.component?.config as { content?: string };
      const titleConfig = form.componentDefinitions?.[1]?.model?.config as { defaultValue?: string; value?: string };

      expect(contentConfig.content).to.equal('Welcome Alice');
      expect(titleConfig.defaultValue).to.be.undefined;
      expect(titleConfig.value).to.equal('Title for Alice');
    });

    it('should populate generated view-only metadata display content from the record metadata', async function () {
      const form = await FormsService.buildClientFormConfig(
        {
          name: 'generated-view-only',
          componentDefinitions: [
            {
              name: 'generated_view_only_metadata',
              overrides: {
                reusableFormName: 'generated-view-only-metadata-display',
              },
              component: {
                class: 'ReusableComponent',
                config: {
                  componentDefinitions: [],
                },
              },
            },
          ],
        },
        'view',
        [],
        {
          title: 'Lecturer, Field Education',
          nested: { school: 'JCU' },
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
        nested: { school: 'JCU' },
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
                reusableFormName: 'generated-view-only-metadata-display',
              },
              component: {
                class: 'ReusableComponent',
                config: {
                  componentDefinitions: [],
                },
              },
            },
          ],
        },
        'view',
        [],
        {
          title: 'Should inject',
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
        title: 'Should inject',
      });
    });
  });

  describe('buildContractFormConfig', function () {
    it('should delegate authoritative context through the client form construction path', async function () {
      const sourceForm: FormConfigFrame = {
        name: 'contract-form',
        componentDefinitions: [
          {
            name: 'title',
            component: { class: 'SimpleInputComponent', config: {} },
            model: { class: 'SimpleInputModel', config: {} },
          },
        ],
      };
      const context: RecordContractContext = {
        publicContext: {
          brand: 'brand-1',
          portal: 'portal-1',
          kind: 'update',
          recordType: 'dataset',
          workflowStep: 'draft',
          form: 'contract-form',
          operation: 'update',
          unknownProperties: 'allow',
          enforcement: 'shadow',
        },
        resolution: {
          sourceFormFingerprint: 'fingerprint',
          sourceForm,
          reusableFormDefinitions: {
            common: sourceForm.componentDefinitions,
          },
          actor: { authenticated: true, roles: ['researcher'] },
          formMode: 'view',
          contextVariables: { '@user_name': 'Alice' },
          oid: 'record-1',
          existingRecord: {
            redboxOid: 'record-1',
            metadata: { title: 'Existing title' },
            metaMetadata: { type: 'dataset', form: 'contract-form' },
          },
        },
      };
      const effectiveForm = {
        name: 'contract-form',
        componentDefinitions: [
          {
            name: 'title',
            component: { class: 'SimpleInputComponent', config: {} },
            model: { class: 'SimpleInputModel', config: {} },
          },
        ],
      };
      const recordAccessContext = {
        user: { id: 'user-1' },
        brand: { id: 'brand-1' },
      };
      const buildClientFormConfig = sinon.stub(FormsService, 'buildClientFormConfig').resolves(effectiveForm);

      const result = await FormsService.buildContractFormConfig(context, recordAccessContext);

      expect(result).to.deep.equal({ ok: true, effectiveForm });
      expect(buildClientFormConfig.calledOnce).to.be.true;
      const [
        delegatedSourceForm,
        formMode,
        roles,
        recordMetadata,
        delegatedReusableDefinitions,
        branding,
        contextVariables,
        delegatedAccessContext,
      ] = buildClientFormConfig.firstCall.args;
      expect(delegatedSourceForm).to.deep.equal(sourceForm);
      expect(delegatedSourceForm).to.not.equal(sourceForm);
      expect(formMode).to.equal('view');
      expect(roles).to.deep.equal(['researcher']);
      expect(recordMetadata).to.deep.equal({ title: 'Existing title' });
      expect(delegatedReusableDefinitions).to.deep.equal(context.resolution.reusableFormDefinitions);
      expect(branding).to.equal('brand-1');
      expect(contextVariables).to.deep.equal({ '@user_name': 'Alice' });
      expect(delegatedAccessContext).to.equal(recordAccessContext);
    });

    it('uses metadata from the complete stored update record when resolving question-tree visibility', async function () {
      const context: RecordContractContext = {
        publicContext: {
          brand: 'default',
          portal: 'portal-1',
          kind: 'update',
          recordType: 'dataset',
          workflowStep: 'draft',
          form: 'question-tree-contract-form',
          operation: 'update',
          unknownProperties: 'allow',
          enforcement: 'enforce',
        },
        resolution: {
          sourceFormFingerprint: 'fingerprint',
          sourceForm: {
            name: 'question-tree-contract-form',
            componentDefinitions: [
              {
                name: 'access_questions',
                component: {
                  class: 'QuestionTreeComponent',
                  config: {
                    availableOutcomes: [{ value: 'restricted', label: 'Restricted' }],
                    questions: [
                      {
                        id: 'sensitive',
                        answersMin: 1,
                        answersMax: 1,
                        answers: [{ value: 'yes', label: 'Yes', outcome: 'restricted' }],
                        rules: { op: 'true' },
                      },
                      {
                        id: 'consent',
                        answersMin: 1,
                        answersMax: 1,
                        answers: [{ value: 'yes', label: 'Yes', outcome: 'restricted' }],
                        rules: { op: 'in', q: 'sensitive', a: ['yes'] },
                      },
                    ],
                    componentDefinitions: [],
                  },
                },
                model: { class: 'QuestionTreeModel', config: {} },
              },
            ],
          },
          reusableFormDefinitions,
          actor: { authenticated: true, roles: [] },
          formMode: 'edit',
          contextVariables: {},
          oid: 'record-1',
          existingRecord: {
            redboxOid: 'record-1',
            metadata: {
              access_questions: {
                sensitive: ['yes'],
                consent: ['yes'],
              },
            },
            metaMetadata: { type: 'dataset', form: 'question-tree-contract-form' },
          },
        },
      };

      const result = await FormsService.buildContractFormConfig(context);

      expect(result.ok).to.equal(true);
      if (!result.ok) throw new Error(result.reason);
      const consent = findComponentDefinitionByName(result.effectiveForm.componentDefinitions as unknown[], 'consent');
      expect(consent.component.config.visible).to.equal(true);
      expect(consent.layout.config.visible).to.equal(true);
      expect(consent.model.config.value).to.deep.equal(['yes']);
    });

    it('should retain candidate-dependent component branches for create contracts', async function () {
      const context: RecordContractContext = {
        publicContext: {
          brand: 'default',
          portal: 'portal-1',
          kind: 'create',
          recordType: 'dataset',
          workflowStep: 'draft',
          form: 'conditional-contract-form',
          operation: 'create',
          unknownProperties: 'allow',
          enforcement: 'shadow',
        },
        resolution: {
          sourceFormFingerprint: 'fingerprint',
          sourceForm: {
            name: 'conditional-contract-form',
            componentDefinitions: [
              {
                name: 'branch-a',
                expressions: [
                  {
                    name: 'show-branch-a',
                    config: { template: 'kind = "a"' },
                  },
                ],
                component: { class: 'SimpleInputComponent', config: {} },
                model: { class: 'SimpleInputModel', config: {} },
              },
              {
                name: 'branch-b',
                expressions: [
                  {
                    name: 'show-branch-b',
                    config: { template: 'kind = "b"' },
                  },
                ],
                component: { class: 'SimpleInputComponent', config: {} },
                model: { class: 'SimpleInputModel', config: {} },
              },
            ],
          },
          reusableFormDefinitions: {},
          actor: { authenticated: true, roles: [] },
          formMode: 'edit',
          contextVariables: {},
        },
      };
      const buildClientFormConfig = sinon.spy(FormsService, 'buildClientFormConfig');

      const result = await FormsService.buildContractFormConfig(context);

      expect(result.ok).to.be.true;
      if (!result.ok) {
        throw new Error(result.reason);
      }
      expect(buildClientFormConfig.firstCall.args[3]).to.equal(null);
      expect(
        result.effectiveForm.componentDefinitions.map(
          (component: AvailableFormComponentDefinitionOutlines) => component.name
        )
      ).to.deep.equal(['branch-a', 'branch-b']);
      expect(
        result.effectiveForm.componentDefinitions.map(
          (component: AvailableFormComponentDefinitionOutlines) => component.expressions?.[0]?.config.hasTemplate
        )
      ).to.deep.equal([true, true]);
    });

    it('should remove components the caller cannot submit while retaining submittable nested fields', async function () {
      const context: RecordContractContext = {
        publicContext: {
          brand: 'default',
          portal: 'portal-1',
          kind: 'create',
          recordType: 'dataset',
          workflowStep: 'draft',
          form: 'mixed-contract-form',
          operation: 'create',
          unknownProperties: 'allow',
          enforcement: 'shadow',
        },
        resolution: {
          sourceFormFingerprint: 'fingerprint',
          sourceForm: {
            name: 'mixed-contract-form',
            componentDefinitions: [
              {
                name: 'guidance',
                component: { class: 'ContentComponent', config: { content: 'Guidance only' } },
              },
              {
                name: 'admin-only',
                constraints: { authorization: { allowRoles: ['admin'] } },
                component: { class: 'SimpleInputComponent', config: {} },
                model: { class: 'SimpleInputModel', config: {} },
              },
              {
                name: 'details',
                component: {
                  class: 'TabComponent',
                  config: {
                    tabs: [
                      {
                        name: 'details-tab',
                        component: {
                          class: 'TabContentComponent',
                          config: {
                            componentDefinitions: [
                              {
                                name: 'nested-guidance',
                                component: { class: 'ContentComponent', config: { content: 'Nested guidance' } },
                              },
                              {
                                name: 'title',
                                component: { class: 'SimpleInputComponent', config: {} },
                                model: {
                                  class: 'SimpleInputModel',
                                  config: { defaultValue: 'Title for @user_name' },
                                },
                              },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
          reusableFormDefinitions: {},
          actor: { authenticated: true, roles: ['researcher'] },
          formMode: 'edit',
          contextVariables: { '@user_name': 'Alice' },
        },
      };

      const result = await FormsService.buildContractFormConfig(context);

      expect(result.ok).to.be.true;
      if (!result.ok) {
        throw new Error(result.reason);
      }
      expect(result.effectiveForm.componentDefinitions).to.have.length(1);
      const tab = result.effectiveForm.componentDefinitions[0];
      expect(tab.component.class).to.equal('TabComponent');
      if (tab.component.class !== 'TabComponent') {
        throw new Error(`Unexpected contract component: ${tab.component.class}`);
      }
      expect(tab.component.config?.tabs).to.have.length(1);
      const tabContent = tab.component.config?.tabs[0];
      expect(tabContent?.component.config?.componentDefinitions).to.have.length(1);
      expect(tabContent?.component.config?.componentDefinitions[0].name).to.equal('title');
      expect(tabContent?.component.config?.componentDefinitions[0].model?.config?.value).to.equal('Title for Alice');
    });

    it('should return a typed failure when no submittable components remain', async function () {
      const context: RecordContractContext = {
        publicContext: {
          brand: 'default',
          portal: 'portal-1',
          kind: 'create',
          recordType: 'dataset',
          workflowStep: 'draft',
          form: 'empty-contract-form',
          operation: 'create',
          unknownProperties: 'allow',
          enforcement: 'shadow',
        },
        resolution: {
          sourceFormFingerprint: 'fingerprint',
          sourceForm: {
            name: 'empty-contract-form',
            componentDefinitions: [
              {
                name: 'guidance',
                component: { class: 'ContentComponent', config: { content: 'Guidance only' } },
              },
              {
                name: 'empty-tabs',
                component: {
                  class: 'TabComponent',
                  config: {
                    tabs: [
                      {
                        name: 'display-tab',
                        component: {
                          class: 'TabContentComponent',
                          config: {
                            componentDefinitions: [
                              {
                                name: 'nested-guidance',
                                component: { class: 'ContentComponent', config: { content: 'Nested guidance' } },
                              },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
          reusableFormDefinitions: {},
          actor: { authenticated: true, roles: [] },
          formMode: 'edit',
          contextVariables: {},
        },
      };

      const result = await FormsService.buildContractFormConfig(context);

      expect(result).to.deep.equal({ ok: false, reason: 'empty-effective-form' });
      expect(result).to.not.deep.equal({});
      expect('effectiveForm' in result).to.be.false;
    });
  });
});
