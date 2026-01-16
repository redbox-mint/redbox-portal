import { expect } from 'chai';
import * as sinon from 'sinon';
import { Services } from '../../src/services/FigshareService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('FigshareService', function() {
  let service: Services.FigshareService;
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails();
    mockSails.config.figshareAPI = {
      APIToken: 'token',
      baseURL: 'http://api.figshare.com',
      frontEndURL: 'http://figshare.com',
      mapping: {
        artifacts: {},
        templates: {
          getAuthor: [],
          customFields: { create: {}, update: {} },
          impersonate: {}
        },
        standardFields: { create: [], update: [], embargo: [] }
      }
    };
    setupServiceTestGlobals(mockSails);

    service = new Services.FigshareService();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    sinon.restore();
  });

  describe('getRuntimeConfig', function() {
    it('should return valid config', function() {
      const config = (service as any).getRuntimeConfig();
      expect(config.apiToken).to.equal('token');
      expect(config.baseURL).to.equal('http://api.figshare.com');
    });
  });

  describe('isFigshareAPIEnabled', function() {
    it('should return true if configured', function() {
      const config = (service as any).getRuntimeConfig();
      expect((service as any).isFigshareAPIEnabled(config)).to.be.true;
    });

    it('should return false if missing token', function() {
      mockSails.config.figshareAPI.APIToken = '';
      const config = (service as any).getRuntimeConfig();
      expect((service as any).isFigshareAPIEnabled(config)).to.be.false;
    });
  });
});
