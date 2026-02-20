let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Services } from '../../src/services/AgendaQueueService';
import { cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('AgendaQueueService', function() {
  let originalSails: any;

  before(function() {
    originalSails = (global as any).sails;
    delete (global as any).sails;
  });

  after(function() {
    if (originalSails) {
      (global as any).sails = originalSails;
    } else {
      delete (global as any).sails;
    }
  });

  describe('Constructor', function() {
    it('should instantiate without throwing error when sails is undefined', function() {
      // Ensure sails is undefined
      delete (global as any).sails;
      
      let service: Services.AgendaQueue;
      try {
        service = new Services.AgendaQueue();
      } catch (e: unknown) {
        throw new Error(`Constructor threw error: ${e instanceof Error ? e.message : String(e)}`);
      }
      
      expect(service).to.be.an.instanceOf(Services.AgendaQueue);
    });

    it('should have a public init method', function() {
      const mockSails = createMockSails();
      (global as any).sails = mockSails;
      
      const service = new Services.AgendaQueue();
      
      expect(service.init).to.be.a('function');
      
      cleanupServiceTestGlobals();
    });
  });
  
  describe('exports', function() {
    it('should export all public methods without sails defined', function() {
      // Ensure sails is undefined
      if ((global as any).sails) {
        delete (global as any).sails;
      }
      
      const service = new Services.AgendaQueue();
      const exported = service.exports();
      
      expect(exported).to.have.property('every');
      expect(exported).to.have.property('schedule');
      expect(exported).to.have.property('now');
      expect(exported).to.have.property('jobs');
      expect(exported).to.have.property('sampleFunctionToDemonstrateHowToDefineAJobFunction');
      expect(exported).to.have.property('defineJob');
      expect(exported).to.have.property('moveCompletedJobsToHistory');
    });
  });
});
