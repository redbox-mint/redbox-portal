let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { of, from } from 'rxjs';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('TriggerService', function() {
  let mockSails: any;
  let TriggerService: any;

  beforeEach(function() {
    mockSails = createMockSails({
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      }
    });

    setupServiceTestGlobals(mockSails);

    (global as any).RecordsService = {
      getMeta: sinon.stub(),
      updateMeta: sinon.stub()
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((key) => key)
    };
    (global as any).BrandingService = {
      getBrandById: sinon.stub().returns({})
    };

    const { Services } = require('../../src/services/TriggerService');
    TriggerService = new Services.Trigger();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).RecordsService;
    delete (global as any).TranslationService;
    delete (global as any).BrandingService;
    sinon.restore();
  });

  describe('transitionWorkflow', function() {
    it('should transition workflow if condition met', async function() {
      const record = { 
        metaMetadata: { form: 'old-form' },
        workflow: { stage: 'draft', stageLabel: 'Draft' } 
      };
      const options = {
        triggerCondition: 'true',
        targetWorkflowStageName: 'published',
        targetWorkflowStageLabel: 'Published',
        targetForm: 'new-form'
      };
      
      const result = await TriggerService.transitionWorkflow('oid', record, options).toPromise();
      
      expect(result.workflow.stage).to.equal('published');
      expect(result.workflow.stageLabel).to.equal('Published');
      expect(result.metaMetadata.form).to.equal('new-form');
    });

    it('should not transition if condition not met', async function() {
      const record = { 
        workflow: { stage: 'draft' } 
      };
      const options = {
        triggerCondition: 'false',
        targetWorkflowStageName: 'published'
      };
      
      const result = await TriggerService.transitionWorkflow('oid', record, options).toPromise();
      
      expect(result.workflow.stage).to.equal('draft');
    });
  });

  describe('validateFieldUsingRegex', function() {
    it('should validate field matching regex', async function() {
      const record = { metadata: { field: 'test value' } };
      const options = {
        fieldDBName: 'metadata.field',
        regexPattern: '^test',
        errorLanguageCode: 'error'
      };
      
      await TriggerService.validateFieldUsingRegex('oid', record, options);
      // Should not throw
    });

    it('should throw error if validation fails', async function() {
      const record = { metadata: { field: 'invalid' } };
      const options = {
        fieldDBName: 'metadata.field',
        regexPattern: '^test',
        errorLanguageCode: 'error'
      };
      
      try {
        await TriggerService.validateFieldUsingRegex('oid', record, options);
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).to.include('Failed validating field');
      }
    });

    it('should handle null values if allowed', async function() {
      const record = { metadata: { field: null } };
      const options = {
        fieldDBName: 'metadata.field',
        allowNulls: true,
        regexPattern: '^test'
      };
      
      await TriggerService.validateFieldUsingRegex('oid', record, options);
    });

    it('should throw if null not allowed', async function() {
      const record = { metadata: { field: null } };
      const options = {
        fieldDBName: 'metadata.field',
        allowNulls: false,
        regexPattern: '^test',
        errorLanguageCode: 'error'
      };
      
      try {
        await TriggerService.validateFieldUsingRegex('oid', record, options);
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).to.include('Failed validating field');
      }
    });

    it('should handle array fields', async function() {
      const record = { metadata: { list: [{ val: 'test1' }, { val: 'test2' }] } };
      const options = {
        fieldDBName: 'metadata.list',
        arrayObjFieldDBName: 'val',
        regexPattern: '^test',
        errorLanguageCode: 'error'
      };
      
      await TriggerService.validateFieldUsingRegex('oid', record, options);
    });

    it('should fail if any array item fails', async function() {
      const record = { metadata: { list: [{ val: 'test1' }, { val: 'invalid' }] } };
      const options = {
        fieldDBName: 'metadata.list',
        arrayObjFieldDBName: 'val',
        regexPattern: '^test',
        errorLanguageCode: 'error'
      };
      
      try {
        await TriggerService.validateFieldUsingRegex('oid', record, options);
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).to.include('Failed validating field');
      }
    });
  });

  describe('validateFieldMapUsingRegex', function() {
    it('should validate multiple fields', async function() {
      const record = { 
        metadata: { 
          field1: 'test',
          field2: 'valid'
        }
      };
      const options = {
        fieldObjectList: [
          { name: 'field1', regexPattern: '^test', label: 'Field 1', errorLabel: 'Error 1' },
          { name: 'field2', regexPattern: '^valid', label: 'Field 2', errorLabel: 'Error 2' }
        ],
        triggerCondition: 'true'
      };
      sinon.stub(TriggerService, 'metTriggerCondition').returns('true');
      
      await TriggerService.validateFieldMapUsingRegex('oid', record, options);
    });

    it('should throw if any field invalid', async function() {
      const record = { 
        metadata: { 
          field1: 'invalid',
          field2: 'valid'
        }
      };
      const options = {
        fieldObjectList: [
          { name: 'field1', regexPattern: '^test', label: 'Field 1', errorLabel: 'Error 1' }
        ],
        triggerCondition: 'true'
      };
      sinon.stub(TriggerService, 'metTriggerCondition').returns('true');
      
      try {
        await TriggerService.validateFieldMapUsingRegex('oid', record, options);
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).to.include('Field map validation using regex failed');
      }
    });
  });

  describe('validateFieldsUsingTemplate', function() {
    it.skip('should validate using template', async function() {
      const record = { metadata: { field: 'value' } };
      const options = {
        template: '<% var errorFieldList = []; if (record.metadata.field !== "value") { addError(errorFieldList, "field", "Label", "Error"); } %>',
        triggerCondition: 'true'
      };
      sinon.stub(TriggerService, 'metTriggerCondition').returns('true');
      
      await TriggerService.validateFieldsUsingTemplate('oid', record, options);
    });

    it.skip('should throw if template returns errors', async function() {
      const record = { metadata: { field: 'invalid' } };
      const options = {
        template: '<% var errorFieldList = []; if (record.metadata.field !== "value") { addError(errorFieldList, "field", "Label", "Error"); } %>',
        triggerCondition: 'true'
      };
      sinon.stub(TriggerService, 'metTriggerCondition').returns('true');
      
      try {
        await TriggerService.validateFieldsUsingTemplate('oid', record, options);
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.message).to.include('Field validation using template failed');
      }
    });
  });

  describe('runTemplatesOnRelatedRecord', function() {
    it('should update related record', async function() {
      const relatedRecord = { metadata: { relatedOid: 'related-oid' } };
      const relatedMeta = { metaMetadata: { brandId: 'brand-1' }, metadata: {} };
      
      const options = {
        pathToRelatedOid: 'metadata.relatedOid',
        templates: [
          { field: 'metadata.updated', template: 'true' }
        ],
        triggerCondition: 'true'
      };
      
      sinon.stub(TriggerService, 'metTriggerCondition').returns('true');
      (global as any).RecordsService.getMeta.resolves(relatedMeta);
      
      await TriggerService.runTemplatesOnRelatedRecord('oid', relatedRecord, options, {});
      
      expect((global as any).RecordsService.updateMeta.called).to.be.true;
      const updateArgs = (global as any).RecordsService.updateMeta.firstCall.args;
      expect(updateArgs[1]).to.equal('related-oid');
      expect(updateArgs[2].metadata.updated).to.equal('true');
    });
  });
});
