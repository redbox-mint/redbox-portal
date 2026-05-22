let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('FormVocabularyService', function () {
  let mockSails: any;
  let FormVocabularyService: any;

  beforeEach(function () {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        vocab: {
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
            },
            dataciteDois: {
              serviceName: 'DoiService',
              methodName: 'lookupDataciteDois',
              options: {
                baseUrl: 'https://api.datacite.org',
                timeoutMs: 10000,
                maxRows: 25,
                defaultParams: {
                  'disable-facets': true,
                  state: 'findable',
                  sort: 'relevance'
                },
                fields: ['doi', 'titles', 'publisher', 'publicationYear', 'types', 'url'],
                valueField: 'doi',
                includeRaw: true,
                allowEmptySearch: false
              }
            }
          },
          queries: {
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
        },
        doiservice: {
          lookupDataciteDois: sinon.stub().resolves({
            data: [
              { label: 'Example DOI', value: '10.1000/example', raw: { id: '10.1000/example' } }
            ],
            meta: { total: 1, source: 'datacite' }
          })
        }
      }
    });

    setupServiceTestGlobals(mockSails);

    (global as any).NamedQueryService = {
      getNamedQueryConfig: sinon.stub().resolves({}),
      performNamedQueryFromConfig: sinon.stub().resolves({ records: [] })
    };

    delete require.cache[require.resolve('../../src/services/FormVocabularyService')];
    const { Services } = require('../../src/services/FormVocabularyService');
    FormVocabularyService = new Services.FormVocabulary();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).NamedQueryService;
    sinon.restore();
  });

  describe('buildNamedQueryParamMap', function () {
    it('should build param map from config and user', function () {
      const config = mockSails.config.vocab.queries['db-source'];
      const user = { username: 'testuser' };

      const params = FormVocabularyService.buildNamedQueryParamMap(config, 'search text', user);

      expect(params.text_field).to.equal('search text');
      expect(params.user_field).to.equal('testuser');
    });
  });

  describe('buildSolrParams (private)', function () {
    it('should build solr query string', function () {
      const brand = { id: 'brand-1' };
      const config = mockSails.config.vocab.queries['solr-source'];
      const user = { username: 'testuser' };

      const query = (FormVocabularyService as any).buildSolrParams(brand, 'search text', config, 0, 10, 'json', user);

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

      await FormVocabularyService.findRecords('db-source', brand, 'query', 0, 10, user);

      expect((global as any).NamedQueryService.getNamedQueryConfig.called).to.be.true;
      expect((global as any).NamedQueryService.performNamedQueryFromConfig.called).to.be.true;
    });

    it('should query solr source', async function () {
      const brand = { id: 'brand-1' };
      const user = { username: 'testuser' };

      await FormVocabularyService.findRecords('solr-source', brand, 'query', 0, 10, user);

      expect(mockSails.services.solrsearchservice.searchAdvanced.called).to.be.true;
    });

    it('rejects unknown query vocabularies', async function () {
      const brand = { id: 'brand-1' };
      const user = { username: 'testuser' };

      try {
        await FormVocabularyService.findRecords('missing-source', brand, 'query', 0, 10, user);
        throw new Error('Expected missing query vocabulary to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('query-vocab-not-configured');
      }
    });
  });

  describe('findInExternalService', function () {
    it('interpolates simple property paths without executing code', function () {
      const interpolate = (FormVocabularyService as any).getTemplateStringFunction(
        'https://external.example.com/search?q=${query}&dept=${user.department}&id=${results.0.id}',
        'testProvider'
      );

      const actual = interpolate({
        query: 'smith',
        user: { department: 'science' },
        results: [{ id: 42 }]
      });

      expect(actual).to.equal('https://external.example.com/search?q=smith&dept=science&id=42');
    });

    it('rejects unknown external providers', async function () {
      try {
        await FormVocabularyService.findInExternalService('missingProvider', { options: { query: 'smith' } });
        throw new Error('Expected missing external provider to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('external-vocab-not-configured');
      }
    });

    it('rejects unsafe external template expressions', async function () {
      mockSails.config.vocab.external.badTemplate = {
        url: 'https://external.example.com/search?q=${query.toUpperCase()}',
        method: 'get',
        options: {}
      };

      try {
        await FormVocabularyService.findInExternalService('badTemplate', { options: { query: 'smith' } });
        throw new Error('Expected unsafe template to throw');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('external-vocab-invalid-config');
      }
    });
  });

  describe('findInServiceLookup', function () {
    it('returns normalized service lookup response', async function () {
      const brand = { id: 'brand-1', name: 'Default', css: '', roles: [] };
      const response = await FormVocabularyService.findInServiceLookup('testLookup', {
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
        await FormVocabularyService.findInServiceLookup('missingLookup', {
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
        await FormVocabularyService.findInServiceLookup('badTarget', {
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
        await FormVocabularyService.findInServiceLookup('testLookup', {
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
        await FormVocabularyService.findInServiceLookup('testLookup', {
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

    it('resolves the default dataciteDois provider to DoiService.lookupDataciteDois', async function () {
      const brand = { id: 'brand-1', name: 'Default', css: '', roles: [] };

      const response = await FormVocabularyService.findInServiceLookup('dataciteDois', {
        search: 'climate data',
        start: 0,
        rows: 25,
        branding: 'default',
        portal: 'rdmp',
        brand,
        user: { username: 'user1' }
      });

      expect(response).to.deep.equal({
        data: [
          { label: 'Example DOI', value: '10.1000/example', sourceType: 'service', raw: { id: '10.1000/example' } }
        ],
        meta: { total: 1, source: 'datacite' }
      });
      expect(mockSails.services.doiservice.lookupDataciteDois.calledOnce).to.be.true;
      expect(mockSails.services.doiservice.lookupDataciteDois.firstCall.args[0]).to.include({
        serviceId: 'dataciteDois',
        search: 'climate data',
        start: 0,
        rows: 25,
        branding: 'default',
        portal: 'rdmp'
      });
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

      const mapped = FormVocabularyService.getResultObjectMappings(results, config);

      expect(mapped).to.have.length(1);
      expect(mapped[0].mappedTitle).to.equal('Title 1');
    });
  });

  describe('exports', function () {
    it('should export all public methods', function () {
      const exported = FormVocabularyService.exports();

      expect(exported).to.have.property('findInExternalService');
      expect(exported).to.have.property('findInServiceLookup');
      expect(exported).to.have.property('findRecords');
      expect(exported).to.have.property('buildNamedQueryParamMap');
      expect(exported).to.have.property('getResultObjectMappings');
    });
  });
});
