let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('VocabService', function () {
  let mockSails: any;
  let VocabService: any;
  let axiosStub: any;

  beforeEach(function () {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        vocab: {
          rootUrl: 'https://vocabs.example.com/',
          conceptUri: 'concepts.json',
          bootStrapVocabs: [],
          nonAnds: {},
          collection: {},
          external: {
            testProvider: {
              url: 'https://external.example.com/search?q=${query}',
              method: 'get',
              options: {}
            }
          },
          services: {
            testLookup: {
              serviceName: 'LookupTestService',
              methodName: 'lookupPeople',
              options: { includeInactive: true }
            }
          },
          queries: {
            testQuery: {
              querySource: 'database',
              databaseQuery: { queryName: 'testQuery' },
              queryField: { type: 'text', property: 'search' }
            },
            'db-source': {
              querySource: 'database',
              databaseQuery: { queryName: 'test-query' },
              queryField: { type: 'text', property: 'text_field' },
              userQueryFields: [{ property: 'user_field', userValueProperty: 'username' }]
            },
            'solr-source': {
              querySource: 'solr',
              searchQuery: { baseQuery: 'q=*:*', searchCore: 'core1' },
              queryField: { type: 'text', property: 'text_field' },
              userQueryFields: [{ property: 'user_field', userValueProperty: 'username' }]
            }
          }
        },
        record: {
          baseUrl: {
            mint: 'https://mint.example.com'
          },
          api: {
            search: { method: 'GET' }
          }
        },
        mint: {
          api: { search: { url: '/api/search' } },
          apiKey: 'test-api-key'
        },
        search: {
          serviceName: 'solrsearchservice'
        }
      },
      log: Object.assign(
        sinon.stub(),
        {
          verbose: sinon.stub(),
          debug: sinon.stub(),
          info: sinon.stub(),
          warn: sinon.stub(),
          error: sinon.stub()
        }
      ),
      services: {
        solrsearchservice: {
          searchAdvanced: sinon.stub().resolves({ response: { docs: [] } })
        },
        lookuptestservice: {
          lookupPeople: sinon.stub().resolves({
            data: [
              { label: 'Jane Doe', value: 'party-1', raw: { id: 'party-1' } }
            ],
            meta: { total: 1 }
          })
        }
      }
    });

    setupServiceTestGlobals(mockSails);

    // Mock dependent services
    (global as any).CacheService = {
      get: sinon.stub().resolves(null),
      set: sinon.stub().resolves()
    };
    (global as any).AsynchsService = {
      update: sinon.stub().resolves({}),
      finish: sinon.stub().resolves({})
    };
    (global as any).NamedQueryService = {
      getNamedQueryConfig: sinon.stub().resolves({}),
      performNamedQueryFromConfig: sinon.stub().resolves({ records: [] })
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/VocabService');
    VocabService = new Services.Vocab();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).CacheService;
    delete (global as any).AsynchsService;
    delete (global as any).NamedQueryService;
    delete (global as any).Vocabulary;
    delete (global as any).VocabularyEntry;
    sinon.restore();
  });

  describe('bootstrap', function () {
    it('should return null when no bootstrap vocabs configured', function (done) {
      VocabService.bootstrap().subscribe({
        next: (result: any) => {
          expect(result).to.be.null;
          done();
        },
        error: done
      });
    });
  });

  describe('getVocab', function () {
    it('returns managed vocabulary entries and preserves historical flag', function (done) {
      (global as any).Vocabulary = {
        findOne: sinon.stub().resolves({ id: 'v1' })
      };
      (global as any).VocabularyEntry = {
        find: sinon.stub().returns({
          sort: sinon.stub().resolves([
            { label: 'Legacy value', value: 'legacy-value', historical: true }
          ])
        })
      };

      VocabService.getVocab('managed-vocab').subscribe({
        next: (result: any) => {
          expect(result).to.deep.equal([
            {
              uri: 'legacy-value',
              notation: 'legacy-value',
              label: 'Legacy value',
              historical: true
            }
          ]);
          expect((global as any).CacheService.set.calledOnce).to.be.true;
          done();
        },
        error: done
      });
    });
  });

  describe('findInMintTriggerWrapper', function () {
    it('should map fields from Mint response to user object', async function () {
      const mockMintResponse = {
        response: {
          docs: [
            { name: 'John Doe', email: 'john@example.com' }
          ]
        }
      };
      sinon.stub(VocabService, 'findInMint').resolves(mockMintResponse);

      const user = { name: 'testuser' };
      const options = {
        sourceType: 'party',
        queryString: 'email:<%= user.email %>',
        fieldsToMap: ['name', 'email']
      };

      const result = await VocabService.findInMintTriggerWrapper(user, options, 'continue');

      expect(result).to.have.property('additionalInfoFound');
      expect(result.additionalInfoFound).to.be.an('array');
    });

    it('should handle no results found with continue mode', async function () {
      sinon.stub(VocabService, 'findInMint').resolves({
        response: { docs: [] }
      });

      const user = { name: 'testuser' };
      const options = {
        sourceType: 'party',
        queryString: 'email:notfound@example.com',
        fieldsToMap: ['name']
      };

      const result = await VocabService.findInMintTriggerWrapper(user, options, 'continue');

      expect(result.additionalInfoFound[0].isSuccess).to.be.true;
    });

    it('should handle errors gracefully', async function () {
      sinon.stub(VocabService, 'findInMint').rejects(new Error('API Error'));

      const user = { name: 'testuser' };
      const options = {
        sourceType: 'party',
        queryString: 'email:test@example.com',
        fieldsToMap: ['name']
      };

      const result = await VocabService.findInMintTriggerWrapper(user, options, 'fail');

      expect(result.additionalInfoFound).to.be.an('array');
      expect(result.additionalInfoFound[0].isSuccess).to.be.false;
    });
  });

  describe('buildNamedQueryParamMap', function () {
    it('should build param map from config and user', function () {
      const config = mockSails.config.vocab.queries['db-source'];
      const user = { username: 'testuser' };

      const params = VocabService.buildNamedQueryParamMap(config, 'search text', user);

      expect(params.text_field).to.equal('search text');
      expect(params.user_field).to.equal('testuser');
    });
  });

  describe('buildSolrParams (private)', function () {
    it('should build solr query string', function () {
      const brand = { id: 'brand-1' };
      const config = mockSails.config.vocab.queries['solr-source'];
      const user = { username: 'testuser' };

      const query = (VocabService as any).buildSolrParams(brand, 'search text', config, 0, 10, 'json', user);

      expect(query).to.include('q=*:*');
      expect(query).to.include('metaMetadata_brandId:brand-1');
      expect(query).to.include('text_field:search text*');
      expect(query).to.include('user_field:testuser');
    });
  });

  describe('findRecords', function () {
    it('should query database source', async function () {
      const brand = { id: 'brand-1' };
      const user = { username: 'testuser' };

      await VocabService.findRecords('db-source', brand, 'query', 0, 10, user);

      expect((global as any).NamedQueryService.getNamedQueryConfig.called).to.be.true;
      expect((global as any).NamedQueryService.performNamedQueryFromConfig.called).to.be.true;
    });

    it('should query solr source', async function () {
      const brand = { id: 'brand-1' };
      const user = { username: 'testuser' };

      await VocabService.findRecords('solr-source', brand, 'query', 0, 10, user);

      expect(mockSails.services.solrsearchservice.searchAdvanced.called).to.be.true;
    });
  });

  describe('findInServiceLookup', function () {
    it('returns normalized service lookup response', async function () {
      const brand = { id: 'brand-1', name: 'Default', css: '', roles: [], supportAgreementInformation: { getYear: () => ({ agreedSupportDays: 0, usedSupportDays: 0 }) } };
      const response = await VocabService.findInServiceLookup('testLookup', {
        search: 'jan',
        start: 0,
        rows: 25,
        branding: 'default',
        portal: 'rdmp',
        brand,
        user: { username: 'user1' }
      });

      expect(response).to.deep.equal({
        data: [
          { label: 'Jane Doe', value: 'party-1', sourceType: 'service', raw: { id: 'party-1' } }
        ],
        meta: { total: 1 }
      });
      expect(mockSails.services.lookuptestservice.lookupPeople.calledOnce).to.be.true;
      const requestArg = mockSails.services.lookuptestservice.lookupPeople.firstCall.args[0];
      expect(requestArg).to.include({
        serviceId: 'testLookup',
        search: 'jan',
        start: 0,
        rows: 25,
        branding: 'default',
        portal: 'rdmp'
      });
      expect(requestArg.options).to.deep.equal({ includeInactive: true });
    });

    it('rejects unknown service lookup ids', async function () {
      try {
        await VocabService.findInServiceLookup('missingLookup', {
          search: '',
          start: 0,
          rows: 25,
          branding: 'default',
          portal: 'rdmp',
          brand: { id: 'brand-1' },
          user: {}
        });
        throw new Error('Expected missing lookup to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('service-lookup-not-configured');
      }
    });

    it('rejects missing target service methods', async function () {
      mockSails.config.vocab.services.badTarget = {
        serviceName: 'LookupTestService',
        methodName: 'missingMethod'
      };

      try {
        await VocabService.findInServiceLookup('badTarget', {
          search: '',
          start: 0,
          rows: 25,
          branding: 'default',
          portal: 'rdmp',
          brand: { id: 'brand-1' },
          user: {}
        });
        throw new Error('Expected invalid target to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('service-lookup-invalid-target');
      }
    });

    it('rejects invalid service lookup responses', async function () {
      mockSails.services.lookuptestservice.lookupPeople.resolves({ meta: { total: 0 } });

      try {
        await VocabService.findInServiceLookup('testLookup', {
          search: '',
          start: 0,
          rows: 25,
          branding: 'default',
          portal: 'rdmp',
          brand: { id: 'brand-1' },
          user: {}
        });
        throw new Error('Expected invalid response to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('service-lookup-invalid-response');
      }
    });

    it('rejects invalid service lookup options', async function () {
      mockSails.services.lookuptestservice.lookupPeople.resolves({
        data: [{ label: '', value: 'party-1' }]
      });

      try {
        await VocabService.findInServiceLookup('testLookup', {
          search: '',
          start: 0,
          rows: 25,
          branding: 'default',
          portal: 'rdmp',
          brand: { id: 'brand-1' },
          user: {}
        });
        throw new Error('Expected invalid option to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('service-lookup-invalid-response');
      }
    });
  });

  describe('getResultObjectMappings', function () {
    it('should map results using template', function () {
      const results = { records: [{ title: 'Title 1' }] };
      const config = {
        resultObjectMapping: {
          mappedTitle: '<% return record.title %>'
        }
      };

      const mapped = VocabService.getResultObjectMappings(results, config);

      expect(mapped).to.have.length(1);
      expect(mapped[0].mappedTitle).to.equal('Title 1');
    });
  });

  describe('exports', function () {
    it('should export all public methods', function () {
      const exported = VocabService.exports();

      expect(exported).to.have.property('bootstrap');
      expect(exported).to.have.property('getVocab');
      expect(exported).to.have.property('loadCollection');
      expect(exported).to.have.property('findCollection');
      expect(exported).to.have.property('findInMint');
      expect(exported).to.have.property('findInExternalService');
      expect(exported).to.have.property('findInServiceLookup');
      expect(exported).to.have.property('rvaGetResourceDetails');
      expect(exported).to.have.property('findInMintTriggerWrapper');
      expect(exported).to.have.property('findRecords');
    });
  });
});
