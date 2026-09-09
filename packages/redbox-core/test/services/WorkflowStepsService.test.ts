let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Services } from '../../src/services/WorkflowStepsService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { of } from 'rxjs';

describe('WorkflowStepsService', function() {
  let service: Services.WorkflowSteps;
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails();
    mockSails.config.workflow = {
      'dataset': {
        'draft': {
          config: { form: 'form1' },
          starting: true,
          hidden: false
        }
      }
    };
    mockSails.config.appmode = { bootstrapAlways: false };
    
    setupServiceTestGlobals(mockSails);
    
    const mockDeferred = (result: unknown) => ({
      exec: sinon.stub().yields(null, result)
    });

    (global as any).WorkflowStep = {
      find: sinon.stub().returns(mockDeferred([])),
      create: sinon.stub().returns(mockDeferred({})),
      destroy: sinon.stub().returns(mockDeferred([])),
      findOne: sinon.stub().returns(mockDeferred({}))
    };
    
    (global as any).RecordType = { findOne: sinon.stub().returns(mockDeferred({ id: 'rt1', name: 'dataset', branding: 'brand1' })) };
    service = new Services.WorkflowSteps();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).WorkflowStep;
    delete (global as any).RecordType;
    sinon.restore();
  });

  describe('bootstrap', function() {
    it('reads only the supplied identities even with bootstrapAlways enabled', async function() {
      mockSails.config.appmode.bootstrapAlways = true;
      const steps = [{ name: 'edited', recordType: 'rt1' }];
      (global as any).WorkflowStep.find.returns({ exec: sinon.stub().yields(null, steps) });
      expect(await service.bootstrap([{ id: 'rt1', name: 'dataset' }])).to.deep.equal(steps);
      expect((global as any).WorkflowStep.find.firstCall.args[0].recordType).to.equal('rt1');
      expect((global as any).WorkflowStep.destroy.called).to.be.false;
      expect((global as any).WorkflowStep.create.called).to.be.false;
    });

    it('does not fill missing steps on an existing definition from legacy config', async function() {
      expect(await service.bootstrap([{ id: 'rt1', name: 'dataset' }])).to.deep.equal([]);
      expect((global as any).WorkflowStep.create.called).to.be.false;
    });

    it('does not read another brand when no identities are supplied', async function() {
      expect(await service.bootstrap([])).to.deep.equal([]);
      expect((global as any).WorkflowStep.find.called).to.be.false;
    });
  });

  describe('create', function() {
    it('should create workflow step', async function() {
      const recordType = { id: 'rt1' };
      const config = { form: 'form1' };
      const expected = { name: 'draft' };
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).WorkflowStep.create.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.create(recordType, 'draft', config, true, false).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expected);
      expect((global as any).WorkflowStep.create.calledWith(sinon.match({ 
        name: 'draft',
        recordType: 'rt1',
        starting: true
      }))).to.be.true;
    });
  });

  describe('get', function() {
    it('should find one step', async function() {
      const recordType = { id: 'rt1' };
      const expected = { name: 'draft' };
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).WorkflowStep.findOne.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.get(recordType, 'draft').subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expected);
      expect((global as any).WorkflowStep.findOne.calledWith(sinon.match({ 
        recordType: 'rt1',
        name: 'draft'
      }))).to.be.true;
    });
  });

  describe('getAllForRecordType', function() {
    it('should find all steps for record type', async function() {
      const recordType = { id: 'rt1' };
      const expected = [{ name: 'draft' }];
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).WorkflowStep.find.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.getAllForRecordType(recordType).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expected);
      expect((global as any).WorkflowStep.find.calledWith(sinon.match({ 
        recordType: 'rt1',
        hidden: { '!=': true }
      }))).to.be.true;
    });

    it('should return empty array when record type is missing', async function() {
      const result = await new Promise((resolve, reject) => {
        service.getAllForRecordType(undefined).subscribe(resolve, reject);
      });

      expect(result).to.deep.equal([]);
      expect((global as any).WorkflowStep.find.called).to.be.false;
    });
  });

  describe('getFirst', function() {
    it('should find starting step', async function() {
      const recordType = { id: 'rt1' };
      const expected = { name: 'draft', starting: true };
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).WorkflowStep.findOne.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.getFirst(recordType).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expected);
      expect((global as any).WorkflowStep.findOne.calledWith(sinon.match({ 
        recordType: 'rt1',
        starting: true
      }))).to.be.true;
    });
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = service.exports();
      expect(exported).to.have.property('bootstrap');
      expect(exported).to.have.property('create');
      expect(exported).to.have.property('get');
      expect(exported).to.have.property('getFirst');
      expect(exported).to.have.property('getAllForRecordType');
    });
  });
});
