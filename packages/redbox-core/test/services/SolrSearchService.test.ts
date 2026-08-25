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

  describe('addAuthParams', function() {
    it('should append the authorization filter as an fq param', function() {
      const params = new URLSearchParams();
      const roles = [{ name: 'Admin', branding: 'brand-1' }];
      const brand = { id: 'brand-1', name: 'default' };

      (SolrSearchService as any).addAuthParams(params, 'testuser', roles, brand);

      const authFilters = params.getAll('fq');
      expect(authFilters).to.have.lengthOf(1);
      expect(authFilters[0]).to.include('authorization_edit:testuser');
      expect(authFilters[0]).to.include('authorization_viewRoles:(Admin)');
    });

    it('should not overwrite filters already collected', function() {
      const params = new URLSearchParams();
      params.append('fq', 'existing:filter');
      const brand = { id: 'brand-1', name: 'default' };

      (SolrSearchService as any).addAuthParams(params, 'testuser', [], brand);

      expect(params.getAll('fq')).to.have.lengthOf(2);
      expect(params.getAll('fq')[0]).to.equal('existing:filter');
    });
  });

  describe('parseQueryFragment', function() {
    it('should treat a bare expression as the q param', function() {
      const params = (SolrSearchService as any).parseQueryFragment('metaMetadata_type:rdmp&rows=10');

      expect(params.get('q')).to.equal('metaMetadata_type:rdmp');
      expect(params.get('rows')).to.equal('10');
    });

    it('should strip a redundant q= prefix', function() {
      const params = (SolrSearchService as any).parseQueryFragment('q=*:*&wt=json');

      expect(params.get('q')).to.equal('*:*');
      expect(params.get('wt')).to.equal('json');
    });

    it('should preserve repeated filter params', function() {
      const params = (SolrSearchService as any).parseQueryFragment('*:*&fq=title:test*&fq=userEmail:a@b.com');

      expect(params.getAll('fq')).to.deep.equal(['title:test*', 'userEmail:a@b.com']);
    });

    it('should keep values that contain an equals sign intact', function() {
      const params = (SolrSearchService as any).parseQueryFragment('*:*&fq=note:a=b');

      expect(params.get('fq')).to.equal('note:a=b');
    });
  });

  describe('searchFuzzy', function() {
    const brand = { id: 'brand-1', name: 'default' };
    const user = { username: 'testuser' };

    function stubAxiosGet() {
      return sinon.stub(require('axios'), 'get').resolves({
        data: { response: { numFound: 0, docs: [] } }
      });
    }

    it('should send every filter and facet field to solr', async function() {
      const axiosGet = stubAxiosGet();

      await SolrSearchService.searchFuzzy(
        'default', 'rdmp', '', 'search terms',
        [{ name: 'title', value: 'first' }, { name: 'owner', value: 'second' }],
        [{ name: 'workflow_stage', value: '' }, { name: 'metaMetadata_type', value: 'rdmp' }],
        brand, user, [], ['title'], 0, 10
      );

      const params: URLSearchParams = axiosGet.firstCall.args[1].params;
      expect(params).to.be.instanceOf(URLSearchParams);
      expect(params.getAll('facet.field')).to.deep.equal(['workflow_stage', 'metaMetadata_type']);
      // Two exact searches, one facet value and the authorization filter.
      expect(params.getAll('fq')).to.have.lengthOf(4);
      expect(params.getAll('fq')[0]).to.equal('title:first');
      expect(params.getAll('fq')[1]).to.equal('owner:second');
      expect(params.getAll('fq')[3]).to.include('authorization_edit:testuser');
    });

    it('should build the q param from brand, type and search query', async function() {
      const axiosGet = stubAxiosGet();

      await SolrSearchService.searchFuzzy(
        'default', 'rdmp', 'draft', 'search terms', [], [], brand, user, [], ['title'], 0, 10
      );

      const params: URLSearchParams = axiosGet.firstCall.args[1].params;
      expect(params.get('q')).to.equal(
        'metaMetadata_brandId:brand-1 AND metaMetadata_type:rdmp AND workflow_stage:draft AND full_text:search terms'
      );
    });
  });

  describe('searchAdvanced', function() {
    it('should pass the parsed query fragment to solr', async function() {
      const axiosGet = sinon.stub(require('axios'), 'get').resolves({ data: {} });

      await SolrSearchService.searchAdvanced('default', '', 'metaMetadata_type:rdmp&fq=title:a&fq=title:b');

      expect(axiosGet.firstCall.args[0]).to.equal('http://localhost:8983/solr/redbox/select');
      const params: URLSearchParams = axiosGet.firstCall.args[1].params;
      expect(params.get('q')).to.equal('metaMetadata_type:rdmp');
      expect(params.getAll('fq')).to.deep.equal(['title:a', 'title:b']);
    });

    it('should accept URLSearchParams directly', async function() {
      const axiosGet = sinon.stub(require('axios'), 'get').resolves({ data: {} });
      const query = new URLSearchParams([['q', '*:*'], ['fq', 'title:a']]);

      await SolrSearchService.searchAdvanced('default', '', query);

      expect(axiosGet.firstCall.args[1].params).to.equal(query);
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
    it('should acknowledge a queued indexing job', async function() {
      const data: any = {
        metadata: { title: 'Test Record' },
        metaMetadata: { brandId: 'brand-1' }
      };
      
      expect(await SolrSearchService.index('record-123', data)).to.equal(true);
      
      expect(mockQueueService.now.called).to.be.true;
      expect(mockQueueService.now.firstCall.args[0]).to.equal('SolrAddOrUpdate');
    });

    it('should set id on data before queueing', async function() {
      const data: any = {
        metadata: { title: 'Test' }
      };
      
      await SolrSearchService.index('my-oid', data);
      
      expect(data.id).to.equal('my-oid');
    });

    it('should run inline when queue service is unavailable', async function() {
      const solrAddOrUpdateStub = sinon.stub(SolrSearchService, 'solrAddOrUpdate').resolves();
      SolrSearchService.queueService = undefined;
      const data: any = {
        metadata: { title: 'Inline Test' }
      };

      expect(await SolrSearchService.index('inline-oid', data)).to.equal(true);

      expect(solrAddOrUpdateStub.calledOnce).to.be.true;
      expect(solrAddOrUpdateStub.firstCall.args[0].attrs.data.id).to.equal('inline-oid');
    });

    it('does not acknowledge a failed queue submission', async function() {
      mockQueueService.now.rejects(new Error('queue unavailable'));

      expect(await SolrSearchService.index('record-123', { metadata: {} })).to.equal(false);
      expect(mockSails.log.error.called).to.equal(true);
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

    it('should run delete inline when queue service is unavailable', function() {
      const solrDeleteStub = sinon.stub(SolrSearchService, 'solrDelete').resolves();
      SolrSearchService.queueService = undefined;

      SolrSearchService.remove('record-inline-delete');

      expect(solrDeleteStub.calledOnce).to.be.true;
      expect(solrDeleteStub.firstCall.args[0].attrs.data.id).to.equal('record-inline-delete');
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

  describe('buildSchema', function() {
    const configuredSchema = {
      'add-field': [{ name: 'title', type: 'string', indexed: true, stored: true, multiValued: false }],
      'add-dynamic-field': [{ name: 'date_*', type: 'pdate', indexed: true, stored: true }, { name: '*', type: 'string', indexed: true, stored: true, multiValued: true }],
      'add-copy-field': [{ source: '*', dest: 'title' }]
    };

    function prepareSchemaReconciliation(liveSchema: Record<string, unknown>) {
      mockSails.config.solr.cores.default.schema = configuredSchema;
      mockSails.config.solr.cores.default.initSchemaFlag = { name: 'schema_initialised', type: 'string', indexed: false, stored: false };
      sinon.stub(SolrSearchService, 'waitForSolr').resolves();
      const axios = require('axios');
      sinon.stub(axios, 'get').resolves({ data: { schema: liveSchema } });
      return sinon.stub(axios, 'post').resolves({ data: { responseHeader: { status: 0 } } });
    }

    it('adds all configured definitions to an empty schema', async function() {
      const post = prepareSchemaReconciliation({ fields: [], dynamicFields: [], copyFields: [] });

      await SolrSearchService.buildSchema();

      expect(post.calledOnce).to.equal(true);
      const payload = post.firstCall.args[1];
      expect(payload['add-field'].map((field: { name: string }) => field.name)).to.deep.equal(['title', 'schema_initialised']);
      expect(payload['add-dynamic-field'].map((field: { name: string }) => field.name)).to.deep.equal(['date_*', '*']);
      expect(payload['add-copy-field']).to.deep.equal([{ source: '*', dest: 'title' }]);
    });

    it('adds the catch-all field when the legacy initialization flag is present', async function() {
      const post = prepareSchemaReconciliation({
        fields: [{ name: 'schema_initialised', type: 'string', indexed: false, stored: false }],
        dynamicFields: [{ name: 'date_*', type: 'pdate', indexed: true, stored: true }],
        copyFields: []
      });

      await SolrSearchService.buildSchema();

      expect(post.calledOnce).to.equal(true);
      expect(post.firstCall.args[1]['add-dynamic-field']).to.deep.equal([configuredSchema['add-dynamic-field'][1]]);
    });

    it('does not post when all definitions already exist', async function() {
      const post = prepareSchemaReconciliation({
        fields: [configuredSchema['add-field'][0], { name: 'schema_initialised', type: 'string', indexed: false, stored: false }],
        dynamicFields: configuredSchema['add-dynamic-field'],
        copyFields: configuredSchema['add-copy-field']
      });

      await SolrSearchService.buildSchema();

      expect(post.called).to.equal(false);
    });

    it('reports conflicts without replacing existing fields', async function() {
      const post = prepareSchemaReconciliation({
        fields: [{ name: 'title', type: 'pdate', indexed: true, stored: true, multiValued: false }],
        dynamicFields: configuredSchema['add-dynamic-field'],
        copyFields: configuredSchema['add-copy-field']
      });

      await SolrSearchService.buildSchema();

      expect(post.calledOnce).to.equal(true);
      expect(post.firstCall.args[1]['add-field']).to.deep.equal([{ name: 'schema_initialised', type: 'string', indexed: false, stored: false }]);
      expect(mockSails.log.error.calledWithMatch('Solr schema definition conflict')).to.equal(true);
    });

    it('does not duplicate initialization fields across reconciliations', async function() {
      const post = prepareSchemaReconciliation({ fields: [], dynamicFields: [], copyFields: [] });

      await SolrSearchService.buildSchema();
      await SolrSearchService.buildSchema();

      expect(post.firstCall.args[1]['add-field'].filter((field: { name: string }) => field.name === 'schema_initialised')).to.have.length(1);
      expect(mockSails.config.solr.cores.default.schema['add-field']).to.have.length(1);
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
