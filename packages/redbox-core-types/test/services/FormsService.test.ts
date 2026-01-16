import { expect } from 'chai';
import * as sinon from 'sinon';
import { Services } from '../../src/services/FormsService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { of } from 'rxjs';

describe('FormsService', function() {
  let service: Services.Forms;
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails();
    mockSails.config.form = { forms: {} };
    mockSails.config.appmode = { bootstrapAlways: false };
    setupServiceTestGlobals(mockSails);

    const mockDeferred = (result) => {
      const p: any = Promise.resolve(result);
      p.exec = sinon.stub().yields(null, result);
      return p;
    };

    (global as any).Form = {
      find: sinon.stub().callsFake(() => mockDeferred([])),
      findOne: sinon.stub().callsFake(() => mockDeferred(null)),
      create: sinon.stub().callsFake((data) => mockDeferred(data)),
      destroyOne: sinon.stub().callsFake(() => mockDeferred(null)),
      update: sinon.stub().returns({ set: sinon.stub().callsFake(() => mockDeferred({})) })
    };

    (global as any).WorkflowStep = {
      update: sinon.stub().returns({ set: sinon.stub().callsFake(() => mockDeferred({})) })
    };

    service = new Services.Forms();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).Form;
    delete (global as any).WorkflowStep;
    sinon.restore();
  });

  describe('generateFormFromSchema', function() {
    it('should generate form from metadata', async function() {
      const record = {
        metadata: {
          title: 'My Title',
          description: 'Desc'
        }
      };
      
      const form: any = await service.generateFormFromSchema({ id: 'brand' } as any, 'dataset', record);
      expect(form).to.have.property('name', 'generated-view-only');
      expect(form.fields).to.be.an('array');
    });
  });
});
