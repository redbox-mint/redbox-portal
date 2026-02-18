import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createQueryObject } from './testHelper';
import { of } from 'rxjs';
import {FormConfigFrame, FormModesConfig, TemplateFormConfigVisitor} from "@researchdatabox/sails-ng-common";
import {
  formConfigExample1,
  reusableFormDefinitionsExample1
} from '@researchdatabox/sails-ng-common/dist/test/unit/example-data';

describe('FormsService', function() {
  let mockSails: any;
  let FormsService: any;
  let mockForm: any;
  let mockWorkflowStep: any;
  let mockRecordType: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        appmode: {
          bootstrapAlways: false
        },
        form: {
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
      create: sinon.stub().resolves({ id: 'created-form', workflowStep: 'step-1' }),
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
    (global as any).Form = mockForm;
    (global as any).WorkflowStep = mockWorkflowStep;
    (global as any).RecordType = mockRecordType;

    const { Services } = require('../../src/services/FormsService');
    FormsService = new Services.Forms();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).Form;
    delete (global as any).WorkflowStep;
    delete (global as any).RecordType;
    sinon.restore();
  });

  describe('flattenFields', function() {
    it('should flatten fields recursively', function() {
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

  describe('filterFieldsHasEditAccess', function() {
    it('should remove fields requiring edit access if user lacks it', function() {
      const fields = [
        { definition: { name: 'field1' } },
        { definition: { name: 'field2' }, needsEditAccess: true }
      ];
      
      FormsService.filterFieldsHasEditAccess(fields, false);
      
      expect(fields).to.have.length(1);
      expect(fields[0].definition.name).to.equal('field1');
    });

    it('should keep fields requiring edit access if user has it', function() {
      const fields = [
        { definition: { name: 'field1' } },
        { definition: { name: 'field2' }, needsEditAccess: true }
      ];
      
      FormsService.filterFieldsHasEditAccess(fields, true);
      
      expect(fields).to.have.length(2);
    });

    it('should filter nested fields', function() {
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

  describe('listForms', function() {
    it('should return list of forms', async function() {
      const forms = [{ name: 'form1' }];
      mockForm.find.returns(createQueryObject(forms));
      
      const result = await FormsService.listForms().toPromise();
      
      expect(mockForm.find.called).to.be.true;
      expect(result).to.deep.equal(forms);
    });
  });

  describe('getFormByName', function() {
    it('should return form by name', async function() {
      const form = { name: 'form1', fields: [] };
      mockForm.findOne.returns(createQueryObject(form));
      
      const result = await FormsService.getFormByName('form1', false).toPromise();
      
      expect(mockForm.findOne.calledWith({ name: 'form1' })).to.be.true;
      expect(result).to.deep.equal(form);
    });

    it('should return null if form not found', async function() {
      mockForm.findOne.returns(createQueryObject(null));
      
      const result = await FormsService.getFormByName('form1', false).toPromise();
      
      expect(result).to.be.null;
    });
  });

  describe('getForm', function() {
    it('should get form using name from record', async function() {
      const record = { metaMetadata: { form: 'form1' } };
      sinon.stub(FormsService, 'getFormByName').returns(of({ name: 'form1' }));
      
      const result = await FormsService.getForm({}, undefined, false, 'type', record);
      
      expect(FormsService.getFormByName.calledWith('form1', false)).to.be.true;
      expect(result).to.deep.equal({ name: 'form1' });
    });

    it('should generate form from schema if form name is generated-view-only', async function() {
      const record = { metaMetadata: { form: 'generated-view-only' } };
      sinon.stub(FormsService, 'generateFormFromSchema').resolves({ generated: true });
      
      const result = await FormsService.getForm({}, undefined, false, 'type', record);
      
      expect(FormsService.generateFormFromSchema.called).to.be.true;
      expect(result).to.deep.equal({ generated: true });
    });
  });

  describe('bootstrap', function() {
    it('should create form if not exists', async function() {
      const workflowStep = { id: 'step-1', config: { form: 'default-form' } };
      mockForm.find.resolves([]); // not found initially
      mockForm.create.resolves({ id: 'form-1', workflowStep: 'step-1' });
      
      await FormsService.bootstrap(workflowStep);
      
      expect(mockForm.create.called).to.be.true;
      expect(mockWorkflowStep.update.calledWith({ id: 'step-1' })).to.be.true;
    });

    it('should skip if form exists', async function() {
      const workflowStep = { id: 'step-1', config: { form: 'default-form' } };
      mockForm.find.onFirstCall().resolves([]); // nothing linked to step
      mockForm.find.onSecondCall().resolves([{ id: 'existing-form', name: 'default-form' }]); // form def exists
      
      await FormsService.bootstrap(workflowStep);
      
      expect(mockForm.create.called).to.be.false;
    });

    it('should destroy and recreate if bootstrapAlways is true', async function() {
      mockSails.config.appmode.bootstrapAlways = true;
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
      mockForm.find.onFirstCall().resolves([{ id: 'existing-linked' }]); // found linked
      mockForm.find.onSecondCall().resolves([]); // not found by name (so we create)
      
      mockForm.destroyOne.resolves({});
      mockForm.create.resolves({ id: 'form-1', workflowStep: 'step-1' });
      
      await FormsService.bootstrap(workflowStep);
      
      expect(mockForm.destroyOne.called).to.be.true;
      expect(mockForm.create.called).to.be.true;
    });
  });

  describe('inferSchemaFromMetadata', function() {
    it('should create schema from metadata', function() {
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

  describe('buildClientFormConfig', async function() {
    it('should build the client form config for a basic form', async function() {
      const item: FormConfigFrame = formConfigExample1;
      const formMode: FormModesConfig = "edit";
      const userRoles: string[] = [];
      const recordMetadata: Record<string, unknown> = {};
      const reusableFormDefs = reusableFormDefinitionsExample1;

      // see: Services.FormRecordConsistency.extractRawTemplates
      const form = await FormsService.buildClientFormConfig(item, formMode, userRoles, recordMetadata, reusableFormDefs);
      const visitor = new TemplateFormConfigVisitor(mockSails.log);

      expect(form).to.have.property('name');
      expect(form.name).to.eql(item.name);

      const templates = visitor.start({form});

      expect(templates).to.have.length(6);
      expect(templates.map(t => t.kind)).to.eql(["handlebars", "jsonata", "jsonata", "jsonata", "jsonata", "jsonata"]);
    });
  });
});
