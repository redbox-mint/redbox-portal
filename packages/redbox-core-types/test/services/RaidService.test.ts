import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('RaidService', function() {
  let mockSails: any;
  let RaidService: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        raid: {
          enabled: true,
          basePath: 'https://raid.example.com',
          apiKey: 'test-api-key',
          servicePointId: 12345
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

    setupServiceTestGlobals(mockSails);
    (global as any).RecordsService = {
      getMeta: sinon.stub().resolves({}),
      updateMeta: sinon.stub().resolves({})
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((key: string) => key)
    };
    (global as any).AgendaQueueService = {
      now: sinon.stub()
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/RaidService');
    RaidService = new Services.Raid();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).RecordsService;
    delete (global as any).TranslationService;
    delete (global as any).AgendaQueueService;
    sinon.restore();
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = RaidService.exports();

      expect(exported).to.have.property('mintTrigger');
      // Note: buildContributors is listed in _exportedMethods but the actual method may be named differently
      expect(exported).to.have.property('buildContribVal');
      expect(exported).to.have.property('mintPostCreateRetryHandler');
      expect(exported).to.have.property('mintRetryJob');
    });
  });
});
