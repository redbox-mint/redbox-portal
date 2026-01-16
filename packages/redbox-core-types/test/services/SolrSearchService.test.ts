import { expect } from 'chai';
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('SolrSearchService', function() {
  let mockSails: any;
  let SolrSearchService: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        solr: {
          cores: {
            records: {
              options: {
                host: 'localhost',
                port: 8983,
                core: 'records',
                https: false
              },
              schema: {}
            }
          }
        },
        queue: {
          serviceName: 'agendaqueueservice'
        }
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      },
      services: {
        agendaqueueservice: {
          now: sinon.stub()
        }
      },
      on: sinon.stub()
    });

    setupServiceTestGlobals(mockSails);
    (global as any).RecordsService = {
      getMeta: sinon.stub().resolves({})
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/SolrSearchService');
    SolrSearchService = new Services.SolrSearchService();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).RecordsService;
    sinon.restore();
  });

  describe('constructor', function() {
    it('should create instance with logHeader', function() {
      expect(SolrSearchService.logHeader).to.equal('SolrIndexer::');
    });
  });

  describe('exports', function() {
    it('should export all public methods', function() {
      const exported = SolrSearchService.exports();

      expect(exported).to.have.property('index');
      expect(exported).to.have.property('remove');
      expect(exported).to.have.property('searchFuzzy');
      expect(exported).to.have.property('solrAddOrUpdate');
      expect(exported).to.have.property('solrDelete');
      expect(exported).to.have.property('searchAdvanced');
      expect(exported).to.have.property('preIndex');
    });
  });

  describe('SolrClient', function() {
    // SolrClient is an internal class, testing its behavior through the service
    it('should have clients object', function() {
      expect(SolrSearchService.clients).to.be.an('object');
    });
  });
});
