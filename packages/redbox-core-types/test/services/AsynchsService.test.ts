let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Services } from '../../src/services/AsynchsService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { of } from 'rxjs';
import { DateTime } from 'luxon';

describe('AsynchsService', function() {
  let service: Services.Asynchs;
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails();
    setupServiceTestGlobals(mockSails);
    
    (global as any).AsynchProgress = {
      create: sinon.stub(),
      update: sinon.stub(),
      find: sinon.stub()
    };
    
    service = new Services.Asynchs();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).AsynchProgress;
    sinon.restore();
  });

  describe('start', function() {
    it('should create a progress object with date_started if missing', async function() {
      const progressObj = { some: 'data' };
      const expectedResult = { ...progressObj, id: 1 };
      
      const execStub = sinon.stub().yields(null, expectedResult);
      (global as any).AsynchProgress.create.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.start(progressObj).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expectedResult);
      expect((global as any).AsynchProgress.create.calledOnce).to.be.true;
      const args = (global as any).AsynchProgress.create.firstCall.args[0];
      expect(args).to.have.property('date_started');
    });

    it('should use provided date_started if present and date_completed is set', async function() {
      const dateStarted = '2023-01-01T12:00:00';
      const progressObj = { date_started: dateStarted, date_completed: '2023-01-01T13:00:00' };
      const expectedResult = { ...progressObj, id: 1 };
      
      const execStub = sinon.stub().yields(null, expectedResult);
      (global as any).AsynchProgress.create.withArgs(sinon.match({ date_started: dateStarted })).returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.start(progressObj).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expectedResult);
    });
  });

  describe('update', function() {
    it('should update progress object', async function() {
      const criteria = { id: 1 };
      const progressObj = { status: 'running' };
      const expectedResult = [{ id: 1, status: 'running' }];
      
      const execStub = sinon.stub().yields(null, expectedResult);
      (global as any).AsynchProgress.update.withArgs(criteria, progressObj).returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.update(criteria, progressObj).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expectedResult);
    });
  });

  describe('finish', function() {
    it('should mark progress as finished with current date', async function() {
      const progressId = '1';
      const expectedResult = [{ id: 1, status: 'finished' }];
      
      const execStub = sinon.stub().yields(null, expectedResult);
      (global as any).AsynchProgress.update.withArgs(
        { id: progressId }, 
        sinon.match({ status: 'finished', date_completed: sinon.match.string })
      ).returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.finish(progressId).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expectedResult);
    });

    it('should merge with provided progress object', async function() {
      const progressId = '1';
      const progressObj = { other: 'field' };
      const expectedResult = [{ id: 1, status: 'finished', other: 'field' }];
      
      const execStub = sinon.stub().yields(null, expectedResult);
      (global as any).AsynchProgress.update.withArgs(
        { id: progressId }, 
        sinon.match({ status: 'finished', other: 'field' })
      ).returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.finish(progressId, progressObj).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expectedResult);
    });
  });

  describe('get', function() {
    it('should find progress objects', async function() {
      const criteria = { status: 'running' };
      const expectedResult = [{ id: 1, status: 'running' }];
      
      const execStub = sinon.stub().yields(null, expectedResult);
      (global as any).AsynchProgress.find.withArgs(criteria).returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.get(criteria).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expectedResult);
    });
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = service.exports();
      expect(exported).to.have.property('start');
      expect(exported).to.have.property('update');
      expect(exported).to.have.property('finish');
      expect(exported).to.have.property('get');
    });
  });
});
