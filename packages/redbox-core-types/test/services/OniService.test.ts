import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('OniService', function() {
  let mockSails: any;
  let OniService: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        oni: {
          enabled: true,
          url: 'https://oni.example.com',
          apiKey: 'test-api-key'
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
    (global as any).UsersService = {
      hasRole: sinon.stub().returns(true)
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/OniService');
    OniService = new Services.OniService();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).RecordsService;
    delete (global as any).UsersService;
    sinon.restore();
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = OniService.exports();

      expect(exported).to.have.property('exportDataset');
    });
  });
});
