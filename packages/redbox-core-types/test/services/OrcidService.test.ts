import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('OrcidService', function() {
  let mockSails: any;
  let OrcidService: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        orcid: {
          url: 'https://pub.orcid.org'
        },
        record: {
          api: {
            search: {
              method: 'GET'
            }
          }
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

    // Import after mocks are set up
    const { Services } = require('../../src/services/OrcidService');
    OrcidService = new Services.Orcids();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    sinon.restore();
  });

  describe('bootstrap', function() {
    it('should be callable without errors', function() {
      const defBrand = { id: 'brand-1', name: 'default' };
      
      // bootstrap should not throw
      expect(() => OrcidService.bootstrap(defBrand)).not.to.throw();
    });
  });

  describe('exports', function() {
    it('should export searchOrcid method', function() {
      const exported = OrcidService.exports();
      
      expect(exported).to.have.property('searchOrcid');
      expect(typeof exported.searchOrcid).to.equal('function');
    });
  });
});
