import { createSinonStubLogger } from '../logger.test';

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
      log: createSinonStubLogger(sinon),
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
    (global as any).WorkflowStepsService = { getFirst: sinon.stub().returns(of({ name: 'draft' })) };

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
    it('suppresses inline source reads only for explicit projection builds', async function () {
      const visitor = require('../../src/visitor/related-object-data-inline.visitor').RelatedObjectDataInlineFormConfigVisitor;
      const resolve = sinon.stub(visitor.prototype, 'resolve').resolves();
      try {
        const item = { name: 'projection', componentDefinitions: [
          { name: 'title', component: { class: 'SimpleInputComponent' } },
        ] };
        const access = { user: { roles: [] }, brand: { id: 'brand-1' } };
        await FormsService.buildClientFormConfig(item, 'edit', [], {}, {}, 'default', {}, access, false, true);
        expect(resolve.callCount).to.equal(0);
        await FormsService.buildClientFormConfig(item, 'edit', [], {}, {}, 'default', {}, access);
        expect(resolve.callCount).to.equal(1);
      } finally { resolve.restore(); }
    });

    it('delivers canonical descriptors before role pruning, including hidden source and target', async function () {
      (global as any).RecordTypesService = { get: sinon.stub().returns(of({ relatedTo: [{ id: 'activities',
        recordType: 'activity', localField: 'metadata.activities', foreignField: 'redboxOid',
        resolution: { metadataFields: ['/title'] } }] })) };
      const item: FormConfigFrame = { name: 'plan', type: 'plan', componentDefinitions: [
        { name: 'notes', component: { class: 'SimpleInputComponent' } },
        { name: 'title', relatedDisplay: { relationId: 'activities' }, component: { class: 'SimpleInputComponent' },
          constraints: { authorization: { allowRoles: ['editor'] } } },
        { name: 'source', component: { class: 'RelatedObjectDataComponent', config: { relationId: 'activities', required: true } },
          constraints: { authorization: { allowRoles: ['editor'] } } },
      ] };
      const compile = sinon.spy(require('../../src/related-records/display-descriptors'), 'compileRelatedDisplayContract');
      let result: any;
      try {
        result = await FormsService.buildClientFormConfig(item, 'edit', ['reader'], {}, {}, 'default', {},
          { user: { roles: [] }, brand: { id: 'brand-1' } });
        expect(compile.callCount).to.equal(1);
      } finally { compile.restore(); }
      expect(result.componentDefinitions.map((field: any) => field.name)).to.deep.equal(['notes']);
      expect(result.relatedRecords.displayTargets).to.deep.equal([{ metadataPointer: '/title', relationId: 'activities' }]);
      expect(result.relatedRecords.sources[0]).to.deep.equal({ componentPointer: '/source', relationId: 'activities', required: true,
        referenceTokens: ['activities'] });
      expect(item).not.to.have.property('relatedRecords');
    });

    it('prunes denied group and repeatable snapshots from related view forms', async function () {
      const input = (name: string, denied = false): any => ({ name,
        component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' },
        ...(denied ? { constraints: { authorization: { allowRoles: ['Admin'] } } } : {}),
      });
      const group = (name: string): any => ({ name, model: { class: 'GroupModel' }, component: {
        class: 'GroupComponent', config: { componentDefinitions: [input('reference'), input('secret', true),
          { ...input('editOnly'), constraints: { allowModes: ['edit'] } }] },
      } });
      const item: any = { name: 'secure-view', type: 'plan', componentDefinitions: [group('group'),
        { name: 'rows', relatedDisplay: { relationId: 'activity' }, model: { class: 'RepeatableModel' }, component: { class: 'RepeatableComponent',
          config: { allowZeroRows: true, elementTemplate: group('') } } },
        { name: 'source', component: { class: 'RelatedObjectDataComponent', config: { relationId: 'activity' } } },
      ] };
      (global as any).RecordTypesService = { get: sinon.stub().returns(of({ relatedTo: [{ id: 'activity',
        recordType: 'activity', localField: 'metadata.group.reference', foreignField: 'redboxOid',
        resolution: { metadataFields: ['/title'] } }] })) };
      const visitor = require('../../src/visitor/related-object-data-inline.visitor').RelatedObjectDataInlineFormConfigVisitor;
      const resolve = sinon.stub(visitor.prototype, 'resolve').resolves();
      try {
        const result = await FormsService.buildClientFormConfig(item, 'view', ['Librarians'], {
          group: { reference: 'A', secret: 'SECRET', editOnly: 'EDIT_ONLY' },
          rows: [{ reference: 'B', secret: 'ROW_SECRET', editOnly: 'ROW_EDIT_ONLY' }],
        }, {}, 'default', {}, { user: { username: 'librarian' }, brand: { id: 'brand-1' } });
        const serialized = JSON.stringify(result);
        // Sweep all client carriers, not only the surviving child component list.
        for (const removed of ['secret', 'SECRET', 'editOnly', 'EDIT_ONLY', 'ROW_SECRET', 'ROW_EDIT_ONLY']) {
          expect(serialized, removed).not.to.contain(removed);
        }
        const container: any = result.componentDefinitions.find(field => field.name === 'group');
        expect(container.component.class).to.equal('ContentComponent');
        expect(container.model).not.to.exist;
        expect(container.component.config.content).to.deep.equal({ reference: 'A' });
        const rows: any = result.componentDefinitions.find(field => field.name === 'rows');
        expect(rows.component.class).to.equal('ContentComponent');
        expect(rows.component.config.content).to.deep.equal([]);
      } finally { resolve.restore(); }
    });

    it('filters nested related view carriers using exact literal model keys for both roles', async function () {
      const input = (name: string, denied = false): any => ({ name,
        component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' },
        ...(denied ? { constraints: { authorization: { allowRoles: ['Admin'] } } } : {}),
      });
      const snapshot = { reference: 'A', secret: 'DENIED_VALUE', secretPublic: 'PUBLIC',
        'literal/key~name': 'LITERAL', 'literal/key~nameDenied': 'DENIED_LITERAL' };
      const group = (name: string): any => ({ name, model: { class: 'GroupModel', config: {
        ...(name ? { defaultValue: snapshot } : { newEntryValue: snapshot }),
      } }, component: { class: 'GroupComponent', config: { componentDefinitions: [
        input('reference'), input('secret', true), input('secretPublic'),
        input('literal/key~name'), input('literal/key~nameDenied', true),
      ] } } });
      const item: any = { name: 'nested-secure-view', type: 'plan', componentDefinitions: [
        { name: 'outer', model: { class: 'GroupModel' }, component: { class: 'GroupComponent',
          config: { componentDefinitions: [group('nested'),
            { name: 'rows', relatedDisplay: { relationId: 'activity' }, model: { class: 'RepeatableModel',
              config: { defaultValue: [snapshot] } }, component: { class: 'RepeatableComponent',
              config: { allowZeroRows: true, elementTemplate: group('') } } },
          ] } } },
        { name: 'source', component: { class: 'RelatedObjectDataComponent', config: { relationId: 'activity' } } },
      ] };
      (global as any).RecordTypesService = { get: sinon.stub().returns(of({ relatedTo: [{ id: 'activity',
        recordType: 'activity', localField: 'metadata.outer.nested.reference', foreignField: 'redboxOid',
        resolution: { metadataFields: ['/title'] } }] })) };
      const visitor = require('../../src/visitor/related-object-data-inline.visitor').RelatedObjectDataInlineFormConfigVisitor;
      const resolve = sinon.stub(visitor.prototype, 'resolve').resolves();
      try {
        for (const role of ['Librarians', 'Admin']) {
          const result = await FormsService.buildClientFormConfig(item, 'view', [role], {
            outer: { nested: snapshot, rows: [snapshot] },
          }, {}, 'default', {}, { user: { username: role }, brand: { id: 'brand-1' } }, true);
          const serialized = JSON.stringify(result);
          if (role === 'Librarians') {
            for (const denied of ['DENIED_VALUE', 'DENIED_LITERAL', '"secret"', 'literal/key~nameDenied']) {
              expect(serialized, denied).not.to.contain(denied);
            }
          }
          const outer: any = result.componentDefinitions.find(field => field.name === 'outer');
          const expected = role === 'Admin' ? snapshot : { reference: 'A', secretPublic: 'PUBLIC', 'literal/key~name': 'LITERAL' };
          expect(outer.component.class).to.equal('ContentComponent');
          expect(outer.model).not.to.exist;
          expect(outer.component.config.content).to.deep.equal({ nested: expected });

        }
      } finally { resolve.restore(); }
    });

    it('renders related references and targets as content in view mode for both dev-plan roles', async function () {
      const plan = require('../../../redbox-hook-dev/src/form-config/related-plan-1.0-draft').default;
      const snapshot = JSON.stringify(plan);
      const relations = require('../../../redbox-hook-dev/src/config/recordtype').recordtype['related-plan'].relatedTo;
      (global as any).RecordTypesService = { get: sinon.stub().returns(of({ relatedTo: relations })) };
      const visitor = require('../../src/visitor/related-object-data-inline.visitor').RelatedObjectDataInlineFormConfigVisitor;
      const resolve = sinon.stub(visitor.prototype, 'resolve').resolves();
      const savedForms = (global as any).FormsService;
      (global as any).FormsService = FormsService;
      try {
        for (const role of ['Admin', 'Librarians']) {
          const metadata = { title: 'Local title', primaryActivity: 'A',
            activities: [{ oid: 'A', secret: 'DENIED_ROW_A' }, { oid: 'B', secret: 'DENIED_ROW_B' }] };
          const access = { user: { username: role === 'Admin' ? 'related-admin' : 'related-librarian' }, brand: { id: 'brand-1' } };
          const built = await FormsService.buildClientFormConfig(plan, 'view', [role], metadata, {}, 'default', {}, access);
          const serialized = JSON.stringify(built);
          expect(serialized).not.to.contain('DENIED_ROW');
          expect(serialized).not.to.contain('\"secret\"');
          const result = JSON.parse(serialized);
          const { Services } = require('../../src/services/FormRecordConsistencyService');
          const consistency = new Services.FormRecordConsistency();
          const compiled = await consistency.extractRawTemplates(plan, 'view', [role], metadata, {}, access);
          const expected = await new TemplateFormConfigVisitor(mockSails.log).start({ form: built });
          expect(compiled.map((entry: any) => entry.key)).to.deep.equal(expected.map((entry: any) => entry.key));
          const withBehaviour = { ...plan, behaviours: [{ name: 'view-ready',
            conditionKind: 'jsonata_query', condition: 'true', actions: [] }] };
          const behaviourTemplates = await consistency.extractRawTemplates(withBehaviour, 'view', [role], metadata, {}, access);
          expect(behaviourTemplates).to.deep.include({ key: ['behaviours', '0', 'condition'], kind: 'jsonata', value: 'true' });
          const field = (name: string): any => result.componentDefinitions.find(item => item.name === name);
          expect(field('title').component.class).to.equal('ContentComponent');
          expect(field('title').component.config.relatedViewPreserved).not.to.equal(true);
          expect(field('primaryActivity').component.class).to.equal('ContentComponent');
          expect(field('primaryActivity').component.config.content).to.equal('A');
          for (const name of ['primaryActivity', 'activities', 'activityTitle', 'activityDates', 'activitySummaries']) {
            expect(field(name).model, name).not.to.exist;
            expect(field(name).component.class, name).to.equal('ContentComponent');
            expect(field(name).component.config.relatedViewPreserved, name).not.to.equal(true);
            expect(field(name).expressions ?? [], name).to.have.length(0);
          }
          expect(field('primarySource').component.class).to.equal('RelatedObjectDataComponent');
        }
        expect(JSON.stringify(plan)).to.equal(snapshot);
      } finally { resolve.restore(); (global as any).FormsService = savedForms; }
    });

    it('preserves allowed nested content siblings and prunes their denied descendants under a retained ancestor', async function () {
      const input = (name: string, denied = false): any => ({ name, component: { class: 'SimpleInputComponent' },
        model: { class: 'SimpleInputModel' }, ...(denied ? { constraints: { authorization: { allowRoles: ['Admin'] } } } : {}) });
      const group = (name: string): any => ({ name, model: { class: 'GroupModel' }, component: { class: 'GroupComponent',
        config: { componentDefinitions: [input('public'), input('secret', true)] } } });
      const item: any = { name: 'nested-content-siblings', type: 'plan', componentDefinitions: [{ name: 'outer',
        model: { class: 'GroupModel' }, component: { class: 'GroupComponent', config: { componentDefinitions: [
          input('reference'), group('unrelated'),
          { name: 'deniedOnly', model: { class: 'GroupModel' }, component: { class: 'GroupComponent',
            config: { componentDefinitions: [input('secret', true)] } } },
          { name: 'deniedRows', model: { class: 'RepeatableModel' }, component: { class: 'RepeatableComponent',
            config: { elementTemplate: { name: '', model: { class: 'GroupModel' }, component: { class: 'GroupComponent',
              config: { componentDefinitions: [input('secret', true)] } } } } } },
          { name: 'rows', model: { class: 'RepeatableModel' },
            component: { class: 'RepeatableComponent', config: { elementTemplate: group('') } } },
        ] } } }, { name: 'source', component: { class: 'RelatedObjectDataComponent', config: { relationId: 'activity' } } }] };
      (global as any).RecordTypesService = { get: sinon.stub().returns(of({ relatedTo: [{ id: 'activity',
        recordType: 'activity', localField: 'metadata.outer.reference', foreignField: 'redboxOid',
        resolution: { metadataFields: ['/title'] } }] })) };
      const visitor = require('../../src/visitor/related-object-data-inline.visitor').RelatedObjectDataInlineFormConfigVisitor;
      const resolve = sinon.stub(visitor.prototype, 'resolve').resolves();
      try {
        const metadata = { outer: { reference: 'A', unrelated: { public: 'PUBLIC_GROUP', secret: 'DENIED_GROUP' },
          rows: [{ public: 'PUBLIC_ROW', secret: 'DENIED_ROW' }],
          deniedOnly: { secret: 'DENIED_ONLY_GROUP' }, deniedRows: [{ secret: 'DENIED_ONLY_ROW' }] } };
        const result = await FormsService.buildClientFormConfig(item, 'view', ['Librarians'], metadata, {}, 'default', {},
          { user: { username: 'reader' }, brand: { id: 'brand-1' } });
        const outer = result.componentDefinitions.find((field: any) => field.name === 'outer');
        expect(outer.component.class).to.equal('ContentComponent');
        expect(outer.component.config.content).to.deep.equal({ reference: 'A',
          unrelated: { public: 'PUBLIC_GROUP' }, rows: [{ public: 'PUBLIC_ROW' }] });
        const serialized = JSON.stringify(result);
        expect(serialized).to.contain('PUBLIC_GROUP').and.to.contain('PUBLIC_ROW');
        expect(serialized).not.to.contain('DENIED_');
      } finally { resolve.restore(); }
    });

    it('keeps authored hidden title carriers and PDF widgets while hydrating inline vocabulary displays', async function () {
      const binding = (name: string): any => ({ name: 'populate', config: { conditionKind: 'jsonpointer',
        condition: '/source::field.value.changed', target: 'model.value',
        template: `event.value.status = "resolved" ? event.value.records[0].metadata.${name} : ""` } });
      const item: any = { name: 'custom-related-view', type: 'plan', componentDefinitions: [
        { name: 'heading', component: { class: 'ContentComponent', config: {
          template: '<h1>{{get formData content ""}}</h1>', content: 'title' } } },
        { name: 'title', relatedDisplay: { relationId: 'activity' }, constraints: { allowModes: ['view'] },
          overrides: { formModeClasses: { view: { component: 'SimpleInputComponent' } } },
          component: { class: 'SimpleInputComponent', config: { type: 'hidden', visible: false } },
          layout: { class: 'DefaultLayout', config: { visible: false } }, model: { class: 'SimpleInputModel' } },
        { name: 'toolbar', overrides: { formModeClasses: { view: { component: 'GroupComponent' } } },
          component: { class: 'GroupComponent', config: { componentDefinitions: [
            { name: 'pdf', overrides: { formModeClasses: { view: { component: 'PDFListComponent' } } },
              component: { class: 'PDFListComponent', config: { downloadBtnLabel: 'Download a PDF of this plan' } },
              model: { class: 'PDFListModel' } },
          ] } } },
        { name: 'reference', component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' } },
        { name: '', overrides: { formModeClasses: { view: { component: 'GroupComponent' } } },
          component: { class: 'GroupComponent', config: { componentDefinitions: [
            { name: 'title', relatedDisplay: { relationId: 'activity' }, component: { class: 'SimpleInputComponent' },
              model: { class: 'SimpleInputModel' }, expressions: [binding('title')] },
            { name: 'option', relatedDisplay: { relationId: 'activity' }, component: { class: 'DropdownInputComponent',
              config: { inlineVocab: true, vocabRef: 'activity-type' } }, model: { class: 'DropdownInputModel' },
              expressions: [binding('option')] },
          ] } } },
        { name: 'source', component: { class: 'RelatedObjectDataComponent', config: { relationId: 'activity' } } },
      ] };
      (global as any).RecordTypesService = { get: sinon.stub().returns(of({ relatedTo: [{ id: 'activity',
        recordType: 'activity', localField: 'metadata.reference', foreignField: 'redboxOid',
        resolution: { metadataFields: ['/title', '/option'] } }] })) };
      const savedVocabulary = (global as any).VocabularyService;
      (global as any).VocabularyService = { getEntries: sinon.stub().resolves({ entries: [
        { value: 'Applied research', label: 'Applied research label' },
        { value: 'Strategic research', label: 'Strategic research label' },
      ] }) };
      mockSails.services.recordsservice = { resolveRelatedMetadata: sinon.stub().resolves({ activity: {
        status: 'resolved', records: [{ redboxOid: 'A', metadata: { title: 'Current linked title', option: 'Applied research' } }], issues: [],
      } }) };
      const metadata = { reference: 'A', title: 'STALE_TITLE', option: 'Strategic research' };
      const snapshot = JSON.stringify(metadata);
      try {
        const result = await FormsService.buildClientFormConfig(item, 'view', ['Librarians'], metadata, {}, 'default', {},
          { user: { username: 'reader' }, brand: { id: 'brand-1' }, record: { redboxOid: 'plan', workflow: { stage: 'submitted' } } });
        const title = result.componentDefinitions.find((field: any) => field.name === 'title');
        expect(title.component.class).to.equal('SimpleInputComponent');
        expect(title.component.config.visible).to.equal(false);
        expect(title.model.config.value).to.equal('Current linked title');
        const pdf = findComponentDefinitionByName(result.componentDefinitions, 'pdf');
        expect(pdf.component.class).to.equal('PDFListComponent');
        expect(pdf.component.config.downloadBtnLabel).to.equal('Download a PDF of this plan');
        const details = result.componentDefinitions.find((field: any) => field.name === '').component.config.componentDefinitions;
        expect(details.find((field: any) => field.name === 'title').component.config.content).to.equal('Current linked title');
        expect(details.find((field: any) => field.name === 'option').component.config.content)
          .to.deep.equal({ value: 'Applied research', label: 'Applied research label' });
        expect(details.every((field: any) => field.component.class === 'ContentComponent' && !field.model)).to.equal(true);
        // Compiled assets must use the hydrated selection too. An unresolved
        // linked dropdown chooses the empty-value template (<span></span>).
        const savedForms = (global as any).FormsService;
        (global as any).FormsService = FormsService;
        try {
          const { Services } = require('../../src/services/FormRecordConsistencyService');
          const consistency = new Services.FormRecordConsistency();
          const compiled = await consistency.extractRawTemplates(item, 'view', ['Librarians'], metadata, {},
            { user: { username: 'reader' }, brand: { id: 'brand-1' }, record: { redboxOid: 'plan', workflow: { stage: 'submitted' } } });
          const expected = await new TemplateFormConfigVisitor(mockSails.log).start({ form: result });
          expect(compiled).to.deep.equal(expected);
        } finally { (global as any).FormsService = savedForms; }
        expect(JSON.stringify(result)).not.to.contain('STALE_TITLE');
        expect(JSON.stringify(result)).not.to.contain('__relatedViewOriginal');
        expect(JSON.stringify(metadata)).to.equal(snapshot);
      } finally { (global as any).VocabularyService = savedVocabulary; }
    });

    it('hydrates authorized current scalar, option, date, group and repeatable content before view conversion', async function () {
      const input = (name: string, denied = false): any => ({ name, component: { class: 'SimpleInputComponent' },
        model: { class: 'SimpleInputModel' }, ...(denied ? { constraints: { authorization: { allowRoles: ['Admin'] } } } : {}) });
      const target = (name: string, component: any, template: string): any => ({ name,
        relatedDisplay: { relationId: 'activity' }, component,
        expressions: [{ name: 'populate', config: { conditionKind: 'jsonpointer',
          condition: '/source::field.value.changed', target: 'model.value', template } }] });
      const item: any = { name: 'current-view', type: 'plan', componentDefinitions: [input('reference'),
        target('title', { class: 'SimpleInputComponent' }, 'event.value.status = "resolved" ? event.value.records[0].metadata.title : ""'),
        target('option', { class: 'DropdownInputComponent', config: { options: [{ value: 'selected', label: 'Selected label' },
          { value: 'other', label: 'Unselected label' }] } }, 'event.value.records[0].metadata.option'),
        target('end', { class: 'DateInputComponent' }, 'event.value.records[0].metadata.end'),
        { ...target('person', { class: 'GroupComponent', config: { componentDefinitions: [input('name'), input('secret', true)] } },
          'event.value.records[0].metadata.person'), model: { class: 'GroupModel' } },
        { ...target('rows', { class: 'RepeatableComponent', config: { allowZeroRows: true, elementTemplate: {
          name: '', model: { class: 'GroupModel' }, component: { class: 'GroupComponent', config: {
            componentDefinitions: [input('name'), input('secret', true)] } } } } }, 'event.value.records[0].metadata.rows'),
          model: { class: 'RepeatableModel' } },
        { name: 'source', component: { class: 'RelatedObjectDataComponent', config: { relationId: 'activity', required: true } } },
      ] };
      (global as any).RecordTypesService = { get: sinon.stub().returns(of({ relatedTo: [{ id: 'activity',
        recordType: 'activity', localField: 'metadata.reference', foreignField: 'redboxOid',
        resolution: { metadataFields: ['/title', '/option', '/end', '/person', '/rows'] } }] })) };
      const resultEntry = { status: 'resolved', records: [{ redboxOid: 'A', metadata: { title: 'Current title',
        option: 'selected', end: '2028-12-31', person: { name: 'Current person', secret: 'DENIED_PERSON' },
        rows: [{ name: 'Current row', secret: 'DENIED_ROW' }] } }], issues: [] };
      const resolver = sinon.stub().resolves({ activity: resultEntry });
      mockSails.services.recordsservice = { resolveRelatedMetadata: resolver };
      const metadata = { reference: 'A', title: 'STALE_TITLE', person: { name: 'STALE_PERSON' }, rows: [{ name: 'STALE_ROW' }] };
      const snapshot = JSON.stringify(metadata);
      const access = { user: { username: 'reader', roles: [{ name: 'Librarians' }] }, brand: { id: 'brand-1' },
        record: { redboxOid: 'plan', workflow: { stage: 'draft' } } };
      const result = await FormsService.buildClientFormConfig(item, 'view', ['Librarians'], metadata, {}, 'default', {}, access);
      const field = (name: string): any => result.componentDefinitions.find((entry: any) => entry.name === name);
      for (const name of ['reference', 'title', 'option', 'end', 'person', 'rows']) {
        expect(field(name).component.class, name).to.equal('ContentComponent');
        expect(field(name).model, name).not.to.exist;
      }
      expect(field('title').component.config.content).to.equal('Current title');
      expect(field('option').component.config.content).to.deep.equal({ value: 'selected', label: 'Selected label' });
      expect(field('end').component.config.content).to.equal('2028-12-31');
      expect(field('person').component.config.content).to.deep.equal({ name: 'Current person' });
      expect(field('rows').component.config.content).to.deep.equal([{ name: 'Current row' }]);
      expect(JSON.stringify(result.componentDefinitions)).not.to.contain('DENIED_');
      expect(JSON.stringify(result.componentDefinitions)).not.to.contain('STALE_');
      expect(JSON.stringify(metadata)).to.equal(snapshot);
      expect(resolver.callCount).to.equal(1);
      const expected = await new TemplateFormConfigVisitor(mockSails.log).start({ form: result });
      const rebuilt = await FormsService.buildClientFormConfig(item, 'view', ['Librarians'], metadata, {}, 'default', {}, access);
      expect(await new TemplateFormConfigVisitor(mockSails.log).start({ form: rebuilt })).to.deep.equal(expected);
      resolver.resolves({ activity: { status: 'unavailable', records: [], issues: [] } });
      const unavailable = await FormsService.buildClientFormConfig(item, 'view', ['Librarians'], metadata, {}, 'default', {}, access);
      expect(unavailable.componentDefinitions.find((entry: any) => entry.name === 'title').component.config.content).to.equal('');
      expect(JSON.stringify(unavailable.componentDefinitions)).not.to.contain('STALE_');
      expect(unavailable.relatedRecords.sources[0].initialResult.status).to.equal('unavailable');
    });

    it('builds distinct dev-plan role presentations with identical persistence descriptors', async function () {
      const plan = require('../../../redbox-hook-dev/src/form-config/related-plan-1.0-draft').default;
      const relations = require('../../../redbox-hook-dev/src/config/recordtype').recordtype['related-plan'].relatedTo;
      (global as any).RecordTypesService = { get: sinon.stub().returns(of({ relatedTo: relations })) };
      const visitor = require('../../src/visitor/related-object-data-inline.visitor').RelatedObjectDataInlineFormConfigVisitor;
      // Resolve tests cover source access separately; this test exercises real construction and role pruning.
      const resolve = sinon.stub(visitor.prototype, 'resolve').resolves();
      try {
        const build = (roles: string[]) => FormsService.buildClientFormConfig(
          plan, 'edit', roles, {}, {}, 'default', {},
          { user: { username: roles.join('-'), roles: roles.map(name => ({ name, branding: 'brand-1' })) }, brand: { id: 'brand-1' } }
        );
        const admin = await build(['Admin']);
        const librarian = await build(['Librarians']);
        const combined = await build(['Admin', 'Librarians']);
        const title = (form: any) => form.componentDefinitions.filter((field: any) => field.name === 'activityTitle');
        expect(title(admin)).to.have.length(1);
        expect(title(librarian)).to.have.length(1);
        expect(title(combined)).to.have.length(1);
        expect(title(admin)[0].component.class).to.equal('SimpleInputComponent');
        expect(title(librarian)[0].component.class).to.equal('TextAreaComponent');
        expect(title(librarian)[0].component.config.readonly).to.equal(true);
        expect(title(librarian)[0].layout.config.label).to.equal('Primary activity summary (read only)');
        expect(title(combined)[0].component.class).to.equal('SimpleInputComponent');
        expect(title(admin)[0].relatedDisplay).to.deep.equal({ relationId: 'primaryActivity' });
        expect(title(librarian)[0].relatedDisplay).to.deep.equal(title(admin)[0].relatedDisplay);
        expect(librarian.relatedRecords.displayTargets).to.deep.equal(admin.relatedRecords.displayTargets);
        expect(combined.relatedRecords.displayTargets).to.deep.equal(admin.relatedRecords.displayTargets);
        expect(admin.relatedRecords.displayTargets).to.deep.equal([
          { metadataPointer: '/activityTitle', relationId: 'primaryActivity' },
          { metadataPointer: '/activityDates', relationId: 'primaryActivity' },
          { metadataPointer: '/activitySummaries', relationId: 'activities' },
        ]);
        for (const form of [admin, librarian, combined]) {
          expect(form.componentDefinitions.map((field: any) => field.name)).to.include.members(['primarySource', 'activitiesSource']);
        }
      } finally { resolve.restore(); }
    });

    describe('production related-record authorization', function () {
      const item: FormConfigFrame = { name: 'plan', type: 'plan', componentDefinitions: [
        { name: 'source', component: { class: 'RelatedObjectDataComponent', config: { relationId: 'activities' } } },
      ] };
      let records: any;
      let root: any;
      let getMeta: sinon.SinonStub;
      let savedRoles: any;
      let savedForms: any;
      beforeEach(function () {
        const { Services } = require('../../src/services/RecordsService');
        const type = { name: 'plan', relatedTo: [{ id: 'activities', recordType: 'activity',
          localField: 'metadata.activities', foreignField: 'redboxOid', cardinality: 'many',
          resolution: { metadataFields: ['/title'] } }] };
        (global as any).RecordTypesService = { get: sinon.stub().returns(of(type)) };
        (global as any).WorkflowStepsService = { getFirst: sinon.stub().returns(of({ name: 'draft',
          config: { form: 'plan', authorization: { editRoles: ['creator'] } } })) };
        savedRoles = (global as any).RolesService;
        (global as any).RolesService = { getRole: (_brand: unknown, name: string) => ({ id: name, name }) };
        mockSails.config.record = {};
        root = { redboxOid: 'root', metaMetadata: { type: 'plan', brandId: 'brand-1', form: 'plan' },
          workflow: { stage: 'review' }, metadata: { activities: 'activity' },
          authorization: { view: ['reader'] } };
        const source = { redboxOid: 'activity', metaMetadata: { type: 'activity', brandId: 'brand-1' },
          metadata: { title: 'Current', secret: 'private' }, authorization: { view: ['reader'] } };
        records = new Services.Records();
        getMeta = sinon.stub().callsFake(async (oid: string) => oid === 'root' ? root : source);
        records.storageService = { getMeta };
        mockSails.services.recordsservice = records;
        savedForms = (global as any).FormsService;
        (global as any).FormsService = FormsService;
        sinon.stub(FormsService, 'getFormByName').returns(of({ configuration: item }));
      });
      afterEach(function () {
        (global as any).RolesService = savedRoles;
        (global as any).FormsService = savedForms;
      });
      const user = (authorised: boolean) => ({ username: 'reader',
        roles: authorised ? [{ id: 'creator', name: 'creator' }] : [] });
      for (const selected of [false, true]) {
        for (const authorised of [false, true]) {
          it(`${authorised ? 'allows' : 'rejects'} a new form with ${selected ? 'selected' : 'empty'} references for ${authorised ? 'a creator' : 'an unauthorized user'}`, async function () {
            const metadata = { activities: selected ? 'activity' : [] };
            let result: any;
            let error: unknown;
            try {
              result = await FormsService.buildClientFormConfig(item, 'edit', [], metadata, {}, 'default', {},
                { user: user(authorised), brand: { id: 'brand-1' } });
            } catch (caught) { error = caught; }
            if (authorised) {
              expect(error).to.equal(undefined);
              expect(result.relatedRecords.sources[0].initialResult.status).to.equal(selected ? 'resolved' : 'empty');
              expect(result.relatedRecords.sources[0].initialResult.records.map((record: any) => record.metadata))
                .to.deep.equal(selected ? [{ title: 'Current' }] : []);
            } else {
              expect(String(error)).to.contain('Record unavailable');
              expect(getMeta.callCount).to.equal(0);
            }
            expect((global as any).WorkflowStepsService.getFirst.called).to.equal(true);
          });
        }
      }
      for (const mode of ['view', 'edit']) {
        it(`preserves stored root identity in the effective-form ${mode} path for a reader without create permission`, async function () {
          const { getEffectiveRelatedClientForm } = require('../../src/related-records/effective-form');
          const req = { user: user(false), session: {}, headers: {}, param: () => undefined };
          const result = await getEffectiveRelatedClientForm(req, { id: 'brand-1' }, root, 'plan', mode === 'edit', mode);
          expect(result.relatedRecords.sources[0].initialResult.status).to.equal('resolved');
          expect(getMeta.calledWith('root')).to.equal(true);
          expect((global as any).WorkflowStepsService.getFirst.called).to.equal(false);
          root.authorization.view = [];
          let error: unknown;
          try { await getEffectiveRelatedClientForm(req, { id: 'brand-1' }, root, 'plan', mode === 'edit', mode); }
          catch (caught) { error = caught; }
          expect(String(error)).to.contain('Record unavailable');
        });
      }
      it('preserves the authoritative root through update contract construction', async function () {
        const contractForm = { ...item, componentDefinitions: [
          ...item.componentDefinitions,
          { name: 'notes', component: { class: 'SimpleInputComponent' } },
        ] };
        const context = { publicContext: { kind: 'update', brand: 'brand-1' }, resolution: {
          sourceForm: contractForm, formMode: 'edit', actor: { roles: [] }, reusableFormDefinitions: {},
          contextVariables: {}, existingRecord: root,
        } };
        const createAccess = sinon.spy(records, 'hasCreateAccess');
        const result = await FormsService.buildContractFormConfig(context,
          { user: user(false), brand: { id: 'brand-1' } });
        expect(result.ok).to.equal(true);
        expect(getMeta.calledWith('root')).to.equal(true);
        expect(createAccess.called).to.equal(false);
      });

      it('keeps source projection builds free of recursive resolution and create authorization', async function () {
        const { getEffectiveRelatedClientForm } = require('../../src/related-records/effective-form');
        const req = { user: user(false), session: {}, headers: {}, param: () => undefined };
        const result = await getEffectiveRelatedClientForm(req, { id: 'brand-1' }, root, 'plan', false, 'view', true);
        expect(result.relatedRecords.sources[0]).not.to.have.property('initialResult');
        expect(getMeta.callCount).to.equal(0);
        expect((global as any).WorkflowStepsService.getFirst.called).to.equal(false);
      });
    });

    it('delivers safe initial results for a visually hidden source and skips them for projection builds', async function () {
      (global as any).RecordTypesService = { get: sinon.stub().returns(of({ relatedTo: [{ id: 'activities',
        recordType: 'activity', localField: 'metadata.activities', foreignField: 'redboxOid',
        resolution: { metadataFields: ['/title'] } }] })) };
      const entry = { status: 'resolved', records: [{ redboxOid: 'activity',
        metaMetadata: { type: 'activity', brandId: 'brand-1' }, metadata: { title: 'Current' } }], issues: [] };
      const resolve = sinon.stub().resolves({ activities: entry });
      mockSails.services.recordsservice = { resolveRelatedMetadata: resolve };
      const item: FormConfigFrame = { name: 'plan', type: 'plan', componentDefinitions: [
        { name: 'source', component: { class: 'RelatedObjectDataComponent', config: { relationId: 'activities' } },
          layout: { class: 'DefaultLayout', config: { visible: false } } },
      ] };
      const metadata = { activities: 'activity', answer: 'local' };
      const access = { user: { username: 'reader', roles: [] }, brand: { id: 'brand-1' },
        record: { redboxOid: 'root', metaMetadata: { type: 'plan', brandId: 'brand-1' }, metadata } };
      const result = await FormsService.buildClientFormConfig(item, 'edit', [], metadata, {}, 'default', {}, access);
      expect(resolve.callCount).to.equal(1);
      expect(resolve.firstCall.args[0].redboxOid).to.equal('root');
      expect(resolve.firstCall.args[1].audience).to.equal('browser');
      expect(result.relatedRecords.sources[0].initialResult).to.deep.equal(entry);
      expect(result.relatedRecords.sources[0].referenceFingerprint).to.equal(JSON.stringify({ values: ['activity'], invalidIndices: [] }));
      expect(metadata).to.deep.equal({ activities: 'activity', answer: 'local' });
      expect(item).not.to.have.property('relatedRecords');
      const projection = await FormsService.buildClientFormConfig(item, 'edit', [], metadata, {}, 'default', {}, access, false, true);
      expect(resolve.callCount).to.equal(1);
      expect(projection.relatedRecords.sources[0]).not.to.have.property('initialResult');
      const unsaved = await FormsService.buildClientFormConfig(item, 'edit', [], null, {}, 'default', {},
        { user: access.user, brand: access.brand });
      expect(resolve.callCount).to.equal(2);
      expect(resolve.lastCall.args[0].metadata).to.deep.equal({});
      expect(unsaved.relatedRecords.sources[0].initialResult).to.deep.equal(entry);
    });

    it('leaves the legacy bootstrap payload without a descriptor carrier', async function () {
      const result = await FormsService.buildClientFormConfig({ name: 'legacy', componentDefinitions: [
        { name: 'notes', component: { class: 'SimpleInputComponent' } },
      ] }, 'edit');
      expect(result).not.to.have.property('relatedRecords');
    });

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
      expect(delegatedAccessContext).to.deep.equal({
        ...recordAccessContext, record: context.resolution.existingRecord,
      });
      expect(delegatedAccessContext.record).to.equal(context.resolution.existingRecord);
      expect(buildClientFormConfig.firstCall.args[8]).to.equal(true);
    });

    it('preserves authored model defaults for contract compilation', async function () {
      const context: RecordContractContext = {
        publicContext: {
          brand: 'default',
          portal: 'portal-1',
          kind: 'create',
          recordType: 'dataset',
          workflowStep: 'draft',
          form: 'contract-defaults-form',
          operation: 'create',
          unknownProperties: 'allow',
          enforcement: 'shadow',
        },
        resolution: {
          sourceFormFingerprint: 'fingerprint',
          sourceForm: {
            name: 'contract-defaults-form',
            componentDefinitions: [
              {
                name: 'configured',
                component: { class: 'SimpleInputComponent', config: {} },
                model: { class: 'SimpleInputModel', config: { defaultValue: 'Configured value' } },
              },
              {
                name: 'unconfigured',
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

      const result = await FormsService.buildContractFormConfig(context);

      expect(result.ok).to.equal(true);
      if (!result.ok) throw new Error(result.reason);
      const configured = findComponentDefinitionByName(
        result.effectiveForm.componentDefinitions as unknown[],
        'configured'
      );
      const unconfigured = findComponentDefinitionByName(
        result.effectiveForm.componentDefinitions as unknown[],
        'unconfigured'
      );
      expect(configured.model.config.defaultValue).to.equal('Configured value');
      expect(configured.model.config.value).to.equal('Configured value');
      expect(unconfigured.model.config).not.to.have.property('defaultValue');
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
