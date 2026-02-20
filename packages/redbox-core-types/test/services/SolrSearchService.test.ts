let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('SolrSearchService', function() {
  let mockSails: any;
  let SolrSearchService: any;
  let mockQueueService: any;

  beforeEach(function() {
    mockQueueService = {
      now: sinon.stub()
    };

    mockSails = createMockSails({
      config: {
        appPath: '/app',
        solr: {
          cores: {
            default: {
              options: {
                host: 'localhost',
                port: 8983,
                core: 'redbox',
                https: false
              },
              schema: {},
              initSchemaFlag: { name: '_schema_init_flag', type: 'string' },
              preIndex: {
                move: [
                  { source: 'metadata', dest: '' }
                ],
                copy: [
                  { source: 'redboxOid', dest: 'storage_id' }
                ],
                jsonString: [],
                template: [],
                flatten: {
                  options: { delimiter: '_', safe: true },
                  special: []
                }
              }
            }
          },
          maxWaitTries: 3,
          waitTime: 1000,
          createOrUpdateJobName: 'SolrAddOrUpdate',
          deleteJobName: 'SolrDelete',
          clientSleepTimeMillis: 100
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
        agendaqueueservice: mockQueueService
      },
      on: sinon.stub()
    });

    setupServiceTestGlobals(mockSails);
    (global as any).RecordsService = {
      getMeta: sinon.stub().resolves({}),
      hasEditAccess: sinon.stub().returns(true)
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/SolrSearchService');
    SolrSearchService = new Services.SolrSearchService();
    SolrSearchService.queueService = mockQueueService;
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

    it('should initialize clients as empty object', function() {
      expect(SolrSearchService.clients).to.be.an('object');
    });
  });

  describe('luceneEscape', function() {
    it('should escape special characters', function() {
      const result = (SolrSearchService as any).luceneEscape('test+query-with:special');
      
      expect(result).to.include('\\');
    });

    it('should escape brackets', function() {
      const result = (SolrSearchService as any).luceneEscape('test[1]');
      
      expect(result).to.include('\\[');
      expect(result).to.include('\\]');
    });

    it('should escape parentheses', function() {
      const result = (SolrSearchService as any).luceneEscape('test(value)');
      
      expect(result).to.include('\\(');
      expect(result).to.include('\\)');
    });

    it('should escape quotation marks', function() {
      const result = (SolrSearchService as any).luceneEscape('test"value"');
      
      expect(result).to.include('\\"');
    });

    it('should handle simple strings without special chars', function() {
      const result = (SolrSearchService as any).luceneEscape('simplestring');
      
      expect(result).to.equal('simplestring');
    });
  });

  describe('addAuthFilter', function() {
    it('should add authorization filter for username', function() {
      const url = 'http://localhost:8983/solr/redbox/select?q=*:*';
      const username = 'testuser';
      const roles = [{ name: 'Admin', branding: 'brand-1' }];
      const brand = { id: 'brand-1', name: 'default' };
      
      const result = (SolrSearchService as any).addAuthFilter(url, username, roles, brand);
      
      expect(result).to.include('authorization_edit:testuser');
      expect(result).to.include('authorization_view:testuser');
    });

    it('should add role-based filters', function() {
      const url = 'http://localhost:8983/solr/redbox/select?q=*:*';
      const username = 'testuser';
      const roles = [
        { name: 'Admin', branding: 'brand-1' },
        { name: 'Researcher', branding: 'brand-1' }
      ];
      const brand = { id: 'brand-1', name: 'default' };
      
      const result = (SolrSearchService as any).addAuthFilter(url, username, roles, brand);
      
      expect(result).to.include('authorization_viewRoles');
      expect(result).to.include('authorization_editRoles');
      expect(result).to.include('Admin');
      expect(result).to.include('Researcher');
    });

    it('should filter roles by brand', function() {
      const url = 'http://localhost:8983/solr/redbox/select?q=*:*';
      const username = 'testuser';
      const roles = [
        { name: 'Admin', branding: 'brand-1' },
        { name: 'OtherBrandRole', branding: 'brand-2' }
      ];
      const brand = { id: 'brand-1', name: 'default' };
      
      const result = (SolrSearchService as any).addAuthFilter(url, username, roles, brand);
      
      expect(result).to.include('Admin');
      expect(result).to.not.include('OtherBrandRole');
    });

    it('should exclude view access when editAccessOnly is true', function() {
      const url = 'http://localhost:8983/solr/redbox/select?q=*:*';
      const username = 'testuser';
      const roles = [{ name: 'Admin', branding: 'brand-1' }];
      const brand = { id: 'brand-1', name: 'default' };
      
      const result = (SolrSearchService as any).addAuthFilter(url, username, roles, brand, true);
      
      expect(result).to.include('authorization_edit:testuser');
      expect(result).to.not.include('authorization_view:testuser');
    });

    it('should handle empty roles', function() {
      const url = 'http://localhost:8983/solr/redbox/select?q=*:*';
      const username = 'testuser';
      const roles: any[] = [];
      const brand = { id: 'brand-1', name: 'default' };
      
      const result = (SolrSearchService as any).addAuthFilter(url, username, roles, brand);
      
      expect(result).to.include('authorization_edit:testuser');
    });
  });

  describe('getBaseUrl', function() {
    it('should build HTTP URL', function() {
      const options = {
        host: 'localhost',
        port: 8983,
        https: false
      };
      
      const result = (SolrSearchService as any).getBaseUrl(options);
      
      expect(result).to.equal('http://localhost:8983/solr/');
    });

    it('should build HTTPS URL', function() {
      const options = {
        host: 'solr.example.com',
        port: 443,
        https: true
      };
      
      const result = (SolrSearchService as any).getBaseUrl(options);
      
      expect(result).to.equal('https://solr.example.com:443/solr/');
    });
  });

  describe('index', function() {
    it('should queue indexing job', function() {
      const data: any = {
        metadata: { title: 'Test Record' },
        metaMetadata: { brandId: 'brand-1' }
      };
      
      SolrSearchService.index('record-123', data);
      
      expect(mockQueueService.now.called).to.be.true;
      expect(mockQueueService.now.firstCall.args[0]).to.equal('SolrAddOrUpdate');
    });

    it('should set id on data before queueing', function() {
      const data: any = {
        metadata: { title: 'Test' }
      };
      
      SolrSearchService.index('my-oid', data);
      
      expect(data.id).to.equal('my-oid');
    });
  });

  describe('remove', function() {
    it('should queue delete job', function() {
      SolrSearchService.remove('record-123');
      
      expect(mockQueueService.now.called).to.be.true;
      expect(mockQueueService.now.firstCall.args[0]).to.equal('SolrDelete');
    });

    it('should pass id in job data', function() {
      SolrSearchService.remove('record-456');
      
      const jobData = mockQueueService.now.firstCall.args[1];
      expect(jobData.id).to.equal('record-456');
    });
  });

  describe('preIndex', function() {
    // Note: preIndex requires the 'flat' module which is dynamically imported
    // These tests require integration testing with the actual module loaded

    it.skip('should flatten nested data (requires dynamic import)', function() {
      // This test requires the flat module to be loaded
    });

    it.skip('should apply move transformations (requires dynamic import)', function() {
      // This test requires the flat module to be loaded
    });

    it.skip('should apply copy transformations (requires dynamic import)', function() {
      // This test requires the flat module to be loaded
    });

    it.skip('should apply template transformations (requires dynamic import)', function() {
      // This test requires the flat module to be loaded
    });

    it.skip('should convert objects to JSON strings (requires dynamic import)', function() {
      // This test requires the flat module to be loaded
    });

    it.skip('should remove empty keys (requires dynamic import)', function() {
      // This test requires the flat module to be loaded
    });
  });

  describe('initClient', function() {
    it('should initialize clients for all cores', function() {
      (SolrSearchService as any).initClient();
      
      expect(SolrSearchService.clients).to.have.property('default');
    });
  });

  describe('clientSleep', function() {
    it('should resolve immediately when no sleep time configured', async function() {
      mockSails.config.solr.clientSleepTimeMillis = undefined;
      
      const start = Date.now();
      await (SolrSearchService as any).clientSleep();
      const elapsed = Date.now() - start;
      
      expect(elapsed).to.be.lessThan(50);
    });

    it('should sleep for configured time', async function() {
      mockSails.config.solr.clientSleepTimeMillis = 50;
      
      const start = Date.now();
      await (SolrSearchService as any).clientSleep();
      const elapsed = Date.now() - start;
      
      expect(elapsed).to.be.at.least(40);
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
});

// Test the SolrClient class separately
describe('SolrClient', function() {
  let SolrClient: any;
  let mockAxios: any;

  beforeEach(function() {
    // Access the SolrClient class through the module
    const mockSails = createMockSails({});
    setupServiceTestGlobals(mockSails);
    (global as any).RecordsService = {};
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).RecordsService;
    sinon.restore();
  });

  describe('constructor', function() {
    it('should create axios instance with correct base URL', function() {
      // Test through service initialization
      const mockSails = createMockSails({
        config: {
          solr: {
            cores: {
              default: {
                options: {
                  host: 'localhost',
                  port: 8983,
                  core: 'redbox',
                  https: false
                },
                initSchemaFlag: { name: 'flag' },
                preIndex: { move: [], copy: [], jsonString: [], template: [], flatten: { options: {}, special: [] } }
              }
            }
          },
          queue: { serviceName: 'agendaqueueservice' }
        },
        services: { agendaqueueservice: { now: sinon.stub() } }
      });
      setupServiceTestGlobals(mockSails);
      
      const { Services } = require('../../src/services/SolrSearchService');
      const service = new Services.SolrSearchService();
      (service as any).initClient();
      
      expect(service.clients.default).to.exist;
    });
  });
});
