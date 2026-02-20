let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Services } from '../../src/services/WorkspaceAsyncService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { of } from 'rxjs';

describe('WorkspaceAsyncService', function() {
  let service: Services.WorkspaceAsyncService;
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails();
    setupServiceTestGlobals(mockSails);
    
    const mockDeferred = (result: unknown) => ({
      exec: sinon.stub().yields(null, result)
    });

    (global as any).WorkspaceAsync = {
      find: sinon.stub().returns(mockDeferred([])),
      create: sinon.stub().returns(mockDeferred({})),
      update: sinon.stub().returns(mockDeferred([]))
    };
    
    service = new Services.WorkspaceAsyncService();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).WorkspaceAsync;
    sinon.restore();
  });

  describe('start', function() {
    it('should create workspace async record', async function() {
      const input = {
        name: 'test',
        recordType: 'rt',
        username: 'user',
        service: 'svc',
        method: 'meth',
        args: []
      };
      const expected = { id: 1, ...input, status: 'started' };
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).WorkspaceAsync.create.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.start(input).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expected);
      expect((global as any).WorkspaceAsync.create.calledWith(sinon.match({
        name: 'test',
        started_by: 'user',
        status: 'started'
      }))).to.be.true;
    });
  });

  describe('update', function() {
    it('should update record', async function() {
      const id = '1';
      const obj = { status: 'running' };
      const expected = [{ id: 1, status: 'running' }];
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).WorkspaceAsync.update.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.update(id, obj).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expected);
    });

    it('should set date_completed if finished', async function() {
      const id = '1';
      const obj = { status: 'finished' };
      const expected = [{ id: 1, status: 'finished' }];
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).WorkspaceAsync.update.returns({ exec: execStub });
      
      await new Promise((resolve, reject) => {
        service.update(id, obj).subscribe(resolve, reject);
      });
      
      expect((global as any).WorkspaceAsync.update.calledWith(
        sinon.match({ id: '1' }),
        sinon.match({ status: 'finished', date_completed: sinon.match.string })
      )).to.be.true;
    });
  });

  describe('pending', function() {
    it('should find pending records', async function() {
      const expected = [{ id: 1, status: 'pending' }];
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).WorkspaceAsync.find.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.pending().subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expected);
      expect((global as any).WorkspaceAsync.find.calledWith({ status: 'pending' })).to.be.true;
    });
  });

  describe('status', function() {
    it('should find records by status and recordType', async function() {
      const status = 'error';
      const recordType = 'rt';
      const expected = [{ id: 1, status: 'error' }];
      
      const execStub = sinon.stub().yields(null, expected);
      (global as any).WorkspaceAsync.find.returns({ exec: execStub });
      
      const result = await new Promise((resolve, reject) => {
        service.status({ status, recordType }).subscribe(resolve, reject);
      });
      
      expect(result).to.deep.equal(expected);
      expect((global as any).WorkspaceAsync.find.calledWith({ status: 'error', recordType: 'rt' })).to.be.true;
    });
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = service.exports();
      expect(exported).to.have.property('start');
      expect(exported).to.have.property('update');
      expect(exported).to.have.property('pending');
      expect(exported).to.have.property('status');
      expect(exported).to.have.property('loop');
    });
  });
});
