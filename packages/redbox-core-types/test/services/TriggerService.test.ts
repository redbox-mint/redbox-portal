import { expect } from 'chai';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('TriggerService', function() {
  let mockSails: any;
  let TriggerService: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app'
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
    (global as any).RecordsService = {
      getMeta: sinon.stub().resolves({})
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((key: string) => key)
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' })
    };
    (global as any).User = {
      findOne: sinon.stub()
    };
    (global as any).RecordType = {
      findOne: sinon.stub()
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/TriggerService');
    TriggerService = new Services.Trigger();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).RecordsService;
    delete (global as any).TranslationService;
    delete (global as any).BrandingService;
    delete (global as any).User;
    delete (global as any).RecordType;
    sinon.restore();
  });

  describe('transitionWorkflow', function() {
    it('should transition workflow when condition evaluates to true', function(done) {
      const oid = 'record-123';
      const record = {
        metadata: { status: 'complete' },
        workflow: { stage: 'draft', stageLabel: 'Draft' },
        metaMetadata: { form: 'draft-form' }
      };
      // Use a condition that will evaluate to "true" string
      const options = {
        triggerCondition: 'true',
        targetWorkflowStageName: 'published',
        targetWorkflowStageLabel: 'Published',
        targetForm: 'published-form'
      };
      
      TriggerService.transitionWorkflow(oid, record, options).subscribe({
        next: (result: any) => {
          expect(result.workflow.stage).to.equal('published');
          expect(result.workflow.stageLabel).to.equal('Published');
          expect(result.metaMetadata.form).to.equal('published-form');
          done();
        },
        error: done
      });
    });

    it('should not transition when condition evaluates to false', function(done) {
      const oid = 'record-123';
      const record = {
        metadata: { status: 'draft' },
        workflow: { stage: 'draft', stageLabel: 'Draft' },
        metaMetadata: { form: 'draft-form' }
      };
      const options = {
        triggerCondition: 'false',
        targetWorkflowStageName: 'published',
        targetWorkflowStageLabel: 'Published'
      };
      
      TriggerService.transitionWorkflow(oid, record, options).subscribe({
        next: (result: any) => {
          expect(result.workflow.stage).to.equal('draft');
          expect(result.workflow.stageLabel).to.equal('Draft');
          done();
        },
        error: done
      });
    });

    it('should handle empty trigger condition', function(done) {
      const oid = 'record-123';
      const record = {
        workflow: { stage: 'draft', stageLabel: 'Draft' }
      };
      const options = {};
      
      TriggerService.transitionWorkflow(oid, record, options).subscribe({
        next: (result: any) => {
          expect(result.workflow.stage).to.equal('draft');
          done();
        },
        error: done
      });
    });
  });

  describe('runHooksSync', function() {
    it('should return record when no hooks provided', function(done) {
      const oid = 'record-123';
      const record = { metadata: { name: 'Test' } };
      const options = { hooks: [] };
      const user = { username: 'testuser' };
      
      TriggerService.runHooksSync(oid, record, options, user).subscribe({
        next: (result: any) => {
          expect(result).to.deep.equal(record);
          done();
        },
        error: done
      });
    });
  });

  describe('applyFieldLevelPermissions', function() {
    it('should allow user with permission to edit fields', async function() {
      const oid = 'record-123';
      const record = { metadata: { protectedField: 'new value' } };
      const options = {
        fieldDBNames: ['metadata.protectedField'],
        userWithPermissionToEdit: 'admin'
      };
      const user = { username: 'admin', roles: [] };
      
      const result = await TriggerService.applyFieldLevelPermissions(oid, record, options, user);
      
      expect(result.metadata.protectedField).to.equal('new value');
    });

    it('should revert field changes for unauthorized user', async function() {
      const oid = 'record-123';
      const record = { metadata: { protectedField: 'new value' } };
      const previousRecord = { metadata: { protectedField: 'old value' } };
      (global as any).RecordsService.getMeta.resolves(previousRecord);
      
      const options = {
        fieldDBNames: ['metadata.protectedField'],
        userWithPermissionToEdit: 'admin'
      };
      const user = { username: 'regularuser', roles: [] };
      
      const result = await TriggerService.applyFieldLevelPermissions(oid, record, options, user);
      
      expect(result.metadata.protectedField).to.equal('old value');
    });

    it('should allow user with role permission to edit', async function() {
      const oid = 'record-123';
      const record = { metadata: { protectedField: 'new value' } };
      const options = {
        fieldDBNames: ['metadata.protectedField'],
        userWithPermissionToEdit: 'admin',
        roleEditPermission: 'Admin'
      };
      const user = { username: 'otheradmin', roles: [{ name: 'Admin' }] };
      
      const result = await TriggerService.applyFieldLevelPermissions(oid, record, options, user);
      
      expect(result.metadata.protectedField).to.equal('new value');
    });
  });

  describe('validateFieldUsingRegex', function() {
    it('should pass validation for valid field', async function() {
      const oid = 'record-123';
      const record = { metadata: { email: 'test@example.com' } };
      const options = {
        fieldDBName: 'metadata.email',
        errorLanguageCode: 'error.invalid.email',
        regexPattern: '^[^@]+@[^@]+\\.[^@]+$'
      };
      
      const result = await TriggerService.validateFieldUsingRegex(oid, record, options);
      
      expect(result).to.deep.equal(record);
    });

    it('should throw validation error for invalid field', async function() {
      const oid = 'record-123';
      const record = { metadata: { email: 'invalid-email' } };
      const options = {
        fieldDBName: 'metadata.email',
        errorLanguageCode: 'error.invalid.email',
        regexPattern: '^[^@]+@[^@]+\\.[^@]+$'
      };
      
      try {
        await TriggerService.validateFieldUsingRegex(oid, record, options);
        expect.fail('Should have thrown validation error');
      } catch (error: any) {
        expect(error).to.have.property('displayErrors');
      }
    });
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = TriggerService.exports();

      expect(exported).to.have.property('transitionWorkflow');
      expect(exported).to.have.property('runHooksSync');
      expect(exported).to.have.property('applyFieldLevelPermissions');
      expect(exported).to.have.property('validateFieldUsingRegex');
    });
  });
});
