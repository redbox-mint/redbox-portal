let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Buffer } from 'buffer';
import _ from 'lodash';
import { brandingConfigurationDefaults } from '../../src/config/brandingConfigurationDefaults.config';
import { createDefaultBinding, type DoiProfile } from '../../src/configmodels/DoiPublishing';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';

describe('DoiService', function() {
  let service: any;
  let mockSails: any;
  let runtime: typeof import('../../src/services/doi-v2/runtime');
  let originalEnv: NodeJS.ProcessEnv;
  let axios: typeof import('axios');
  let axiosGetStub: sinon.SinonStub;
  const testDoiProfile: DoiProfile = {
    enabled: true,
    label: 'Data Publication',
    metadata: {
      prefix: createDefaultBinding('', '10.1234'),
      url: {
        kind: 'jsonata',
        expression: `'https://redboxresearchdata.com.au/published/' & oid`
      },
      publicationYear: {
        kind: 'jsonata',
        expression: `record.metadata.citation_publication_date ? $substring(record.metadata.citation_publication_date, 0, 4) : $substring(now, 0, 4)`
      },
      publisher: createDefaultBinding('record.metadata.citation_publisher'),
      creators: [
        {
          sourcePath: 'metadata.creators',
          itemMode: 'array',
          name: {
            kind: 'jsonata',
            expression: `item.text_full_name ? item.text_full_name : item.family_name & ', ' & item.given_name`
          },
          nameType: createDefaultBinding('', 'Personal'),
          givenName: createDefaultBinding('item.given_name'),
          familyName: createDefaultBinding('item.family_name')
        }
      ],
      titles: [
        {
          title: createDefaultBinding('record.metadata.citation_title')
        }
      ],
      types: {
        resourceTypeGeneral: createDefaultBinding('', 'Dataset'),
        resourceType: createDefaultBinding('', 'Dataset')
      }
    },
    writeBack: {
      citationUrlPath: 'metadata.citation_url',
      citationDoiPath: 'metadata.citation_doi',
      generatedCitationPath: 'metadata.citation_generated',
      citationString: {
        kind: 'jsonata',
        expression: `record.metadata.citation_title & ". " & record.metadata.citation_publisher & ". https://doi.org/" & record.metadata.citation_doi`
      }
    },
    validation: {
      requireUrl: true,
      requirePublisher: true,
      requirePublicationYear: true,
      requireCreators: true,
      requireTitles: false
    }
  };
  const baseDoiPublishing = {
    ..._.cloneDeep(brandingConfigurationDefaults.doiPublishing)!,
    defaultProfile: 'dataPublication',
    profiles: {
      dataPublication: testDoiProfile
    }
  };

  function withBrand<T extends Record<string, unknown>>(record: T): T & { metaMetadata: { brandId: string } } {
    return {
      ...record,
      metaMetadata: { brandId: 'default' }
    };
  }

  function brandRecord(): { metaMetadata: { brandId: string }, metadata: Record<string, unknown> } {
    return withBrand({ metadata: {} });
  }

  beforeEach(function() {
    originalEnv = { ...process.env };
    mockSails = createMockSails({
      config: {
        auth: {
          defaultBrand: 'default',
          defaultPortal: 'portal',
          roles: [{ name: 'Admin' }, { name: 'Maintainer' }, { name: 'Researcher' }, { name: 'Guest' }],
        },
        brandingAware: sinon.stub(),
        brandingConfigurationDefaults: {
          doiPublishing: {
            ..._.cloneDeep(baseDoiPublishing),
            connection: {
              ..._.cloneDeep(baseDoiPublishing.connection),
              username: 'user',
              password: 'pwd'
            },
            profiles: _.cloneDeep(baseDoiPublishing.profiles)
          }
        }
      }
    });
    setupServiceTestGlobals(mockSails);
    mockSails.config.brandingAware.withArgs('default').returns(mockSails.config.brandingConfigurationDefaults);

    (global as any).TranslationService = {
      t: sinon.stub().returnsArg(0)
    };
    (global as any).RecordsService = {
      updateMeta: sinon.stub().resolves()
    };
    (global as any).IntegrationAuditService = {
      startAudit: sinon.stub().returns({}),
      completeAudit: sinon.stub(),
      failAudit: sinon.stub()
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({}),
      getBrandById: sinon.stub().returns({ id: 'brand-1', name: 'default' })
    };

    runtime = require('../../src/services/doi-v2/runtime');
    axios = require('axios').default;
    axiosGetStub = sinon.stub(axios, 'get');
    sinon.stub(runtime, 'runCreateDoiProgram').resolves({
      doi: '10.1234/5678',
      statusCode: 201,
      responseSummary: { id: '10.1234/5678' }
    });
    sinon.stub(runtime, 'runUpdateDoiProgram').resolves({
      doi: '10.1234/5678',
      statusCode: 200,
      responseSummary: { id: '10.1234/5678' }
    });
    sinon.stub(runtime, 'runDeleteDoiProgram').resolves({
      statusCode: 204,
      responseSummary: {}
    });

    const { Services } = require('../../src/services/DoiService');
    service = new Services.Doi();
  });

  afterEach(function() {
    process.env = originalEnv;
    cleanupServiceTestGlobals();
    delete (global as any).TranslationService;
    delete (global as any).RecordsService;
    delete (global as any).IntegrationAuditService;
    delete (global as any).BrandingService;
    sinon.restore();
  });

  describe('publishDoi', function() {
    it('should create DOI through the v2 runtime', async function() {
      const record = withBrand({
        metadata: {
          creators: [{ given_name: 'First', family_name: 'Last' }],
          citation_title: 'My Title',
          citation_publisher: 'My Publisher',
          citation_publication_date: '2023-04-01'
        }
      });

      const result = await service.publishDoi('oid1', record);

      expect(result).to.equal('10.1234/5678');
      expect((runtime.runCreateDoiProgram as sinon.SinonStub).calledOnce).to.be.true;
      const runtimeOptions = (runtime.runCreateDoiProgram as sinon.SinonStub).firstCall.args[3];
      expect(runtimeOptions.auditContext).to.exist;
      expect(runtimeOptions.requestSummary.action).to.equal('create');
      expect((global as any).IntegrationAuditService.completeAudit.calledOnce).to.be.true;
      const auditDetails = (global as any).IntegrationAuditService.completeAudit.firstCall.args[1];
      expect(auditDetails.requestSummary.event).to.equal('publish');
      expect(auditDetails.requestSummary.action).to.equal('create');
      expect(auditDetails.requestSummary.profile).to.equal('dataPublication');
      expect(auditDetails.requestSummary.requestBody.data.type).to.equal('dois');
      expect(auditDetails.requestSummary.requestBody.data.attributes.titles[0].title).to.equal('My Title');
    });

    it('should skip DOI update when the stored DOI prefix does not match the configured profile prefix', async function() {
      const record = withBrand({
        metadata: {
          creators: [{ given_name: 'First', family_name: 'Last' }],
          citation_doi: 'xxxxx/5678',
          citation_title: 'My Title',
          citation_publisher: 'My Publisher',
          citation_publication_date: '2023-04-01'
        }
      });

      const result = await service.publishDoi('oid1', record, 'publish', 'update');

      expect(result).to.equal(null);
      expect((runtime.runUpdateDoiProgram as sinon.SinonStub).called).to.be.false;
    });

    it('should include the DOI request body in failure audits when the downstream create call fails', async function() {
      (runtime.runCreateDoiProgram as sinon.SinonStub).rejects({
        statusCode: 422,
        responseBody: {
          errors: [{ title: 'Bad request' }]
        }
      });

      const record = withBrand({
        metadata: {
          creators: [{ given_name: 'First', family_name: 'Last' }],
          citation_title: 'My Title',
          citation_publisher: 'My Publisher',
          citation_publication_date: '2023-04-01'
        }
      });

      let thrown: unknown;
      try {
        await service.publishDoi('oid1', record);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).to.exist;
      expect((global as any).IntegrationAuditService.failAudit.calledOnce).to.be.true;
      const auditDetails = (global as any).IntegrationAuditService.failAudit.firstCall.args[2];
      expect(auditDetails.requestSummary.requestBody.data.type).to.equal('dois');
      expect(auditDetails.requestSummary.requestBody.data.attributes.titles[0].title).to.equal('My Title');
      expect(auditDetails.responseSummary.errors[0].title).to.equal('Bad request');
    });

    it('should include the partial DOI request body in failure audits when payload validation fails', async function() {
      // Required-field validation only runs for findable ('publish') events, and the
      // require* flags default to off, so enable the title check explicitly here.
      mockSails.config.brandingConfigurationDefaults.doiPublishing.profiles.dataPublication.validation.requireTitles = true;
      const record = withBrand({
        metadata: {
          creators: [{ given_name: 'First', family_name: 'Last' }],
          citation_publisher: 'My Publisher',
          citation_publication_date: '2023-04-01'
        }
      });

      let thrown: unknown;
      try {
        await service.publishDoi('oid1', record, 'publish');
      } catch (error) {
        thrown = error;
      }

      expect(thrown).to.exist;
      expect((runtime.runCreateDoiProgram as sinon.SinonStub).called).to.be.false;
      expect((global as any).IntegrationAuditService.failAudit.calledOnce).to.be.true;
      const auditDetails = (global as any).IntegrationAuditService.failAudit.firstCall.args[2];
      expect(auditDetails.requestSummary.event).to.equal('publish');
      expect(auditDetails.requestSummary.action).to.equal('create');
      expect(auditDetails.requestSummary.requestBody.data.type).to.equal('dois');
      expect(auditDetails.requestSummary.requestBody.data.attributes.publisher).to.equal('My Publisher');
      expect(auditDetails.requestSummary.requestBody.data.attributes.publicationYear).to.equal('2023');
      expect(auditDetails.requestSummary.requestBody.data.attributes.creators[0].name).to.equal('Last, First');
      expect(auditDetails.requestSummary.requestBody.data.attributes.titles).to.equal(undefined);
      expect(auditDetails.responseSummary.displayErrors[0].code).to.equal('title-required');
    });

    it('should include a technical response summary when the DOI HTTP error has no response body', async function() {
      const transportError = new Error('socket hang up');
      (transportError as Error & { code?: string }).code = 'ECONNRESET';
      const doiHttpError = new Error('DOI HTTP request failed for post /dois');
      doiHttpError.name = 'DoiHttpError';
      Object.assign(doiHttpError, {
        statusCode: 502,
        cause: transportError
      });
      (runtime.runCreateDoiProgram as sinon.SinonStub).rejects(doiHttpError);

      const record = withBrand({
        metadata: {
          creators: [{ given_name: 'First', family_name: 'Last' }],
          citation_title: 'My Title',
          citation_publisher: 'My Publisher',
          citation_publication_date: '2023-04-01'
        }
      });

      let thrown: unknown;
      try {
        await service.publishDoi('oid1', record, 'draft');
      } catch (error) {
        thrown = error;
      }

      expect(thrown).to.exist;
      expect((global as any).IntegrationAuditService.failAudit.calledOnce).to.be.true;
      const auditDetails = (global as any).IntegrationAuditService.failAudit.firstCall.args[2];
      expect(auditDetails.requestSummary.requestBody.data.type).to.equal('dois');
      expect(auditDetails.responseSummary.errorType).to.equal('DoiHttpError');
      expect(auditDetails.responseSummary.message).to.equal('DOI HTTP request failed for post /dois');
      expect(auditDetails.responseSummary.statusCode).to.equal(502);
      expect(auditDetails.responseSummary.causeCode).to.equal('ECONNRESET');
      expect(auditDetails.responseSummary.causeMessage).to.equal('socket hang up');
    });
  });

  describe('lookupDataciteDois', function() {
    const request = {
      serviceId: 'dataciteDois',
      search: 'climate data',
      start: 0,
      rows: 25,
      branding: 'default',
      portal: 'rdmp',
      brand: { id: 'brand-1', name: 'default' },
      user: {},
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
    };

    it('sends expected DataCite request', async function() {
      axiosGetStub.resolves({ data: { data: [], meta: { total: 0, page: 1, totalPages: 0 } } });

      await service.lookupDataciteDois(request);

      expect(axiosGetStub.calledOnce).to.be.true;
      expect(axiosGetStub.firstCall.args[0]).to.equal('https://api.datacite.org/dois');
      const config = axiosGetStub.firstCall.args[1];
      expect(config.timeout).to.equal(10000);
      expect(config.headers).to.deep.equal({ Accept: 'application/vnd.api+json' });
      expect(config.params.get('query')).to.equal('climate data');
      expect(config.params.get('page[number]')).to.equal('1');
      expect(config.params.get('page[size]')).to.equal('25');
      expect(config.params.get('disable-facets')).to.equal('true');
      expect(config.params.get('state')).to.equal('findable');
      expect(config.params.get('sort')).to.equal('relevance');
      expect(config.params.get('fields[dois]')).to.equal('doi,titles,publisher,publicationYear,types,url');
    });

    it('maps DataCite DOI response to typeahead options', async function() {
      axiosGetStub.resolves({
        data: {
          data: [{
            id: '10.5438/0014',
            attributes: {
              doi: '10.5438/0014',
              titles: [{ title: 'DataCite Metadata Schema Documentation for the Publication and Citation of Research Data v4.1' }],
              publisher: 'DataCite',
              publicationYear: 2017,
              url: 'https://schema.datacite.org/meta/kernel-4.1/'
            }
          }],
          meta: { total: 1, page: 1, totalPages: 1 },
          links: { self: 'https://api.datacite.org/dois?page[number]=1' }
        }
      });

      const result = await service.lookupDataciteDois(request);

      expect(result).to.deep.equal({
        data: [{
          label: 'DataCite Metadata Schema Documentation for the Publication and Citation of Research Data v4.1 (10.5438/0014) - DataCite, 2017',
          value: '10.5438/0014',
          sourceType: 'service',
          raw: {
            id: '10.5438/0014',
            attributes: {
              doi: '10.5438/0014',
              titles: [{ title: 'DataCite Metadata Schema Documentation for the Publication and Citation of Research Data v4.1' }],
              publisher: 'DataCite',
              publicationYear: 2017,
              url: 'https://schema.datacite.org/meta/kernel-4.1/'
            }
          }
        }],
        meta: {
          total: 1,
          totalPages: 1,
          page: 1,
          start: 0,
          rows: 25,
          source: 'datacite',
          links: { self: 'https://api.datacite.org/dois?page[number]=1' }
        }
      });
    });

    it('uses DOI fallback label when title is missing', async function() {
      axiosGetStub.resolves({
        data: {
          data: [{
            id: '10.1000/test',
            attributes: {
              doi: '10.1000/test'
            }
          }]
        }
      });

      const result = await service.lookupDataciteDois(request);

      expect(result.data[0].label).to.equal('10.1000/test');
      expect(result.data[0].value).to.equal('10.1000/test');
    });

    it('skips invalid DOI items', async function() {
      axiosGetStub.resolves({
        data: {
          data: [
            { attributes: { titles: [{ title: 'Missing identifier' }] } },
            { id: '10.1000/valid', attributes: { doi: '10.1000/valid' } }
          ]
        }
      });

      const result = await service.lookupDataciteDois(request);

      expect(result.data).to.have.length(1);
      expect(result.data[0].value).to.equal('10.1000/valid');
    });

    it('returns empty result for empty search by default', async function() {
      const result = await service.lookupDataciteDois({
        ...request,
        search: '   '
      });

      expect(result).to.deep.equal({
        data: [],
        meta: {
          total: 0,
          start: 0,
          rows: 25,
          source: 'datacite'
        }
      });
      expect(axiosGetStub.called).to.be.false;
    });

    it('allows empty search when configured', async function() {
      axiosGetStub.resolves({ data: { data: [] } });

      await service.lookupDataciteDois({
        ...request,
        search: '   ',
        options: {
          ...request.options,
          allowEmptySearch: true
        }
      });

      expect(axiosGetStub.calledOnce).to.be.true;
      expect(axiosGetStub.firstCall.args[1].params.has('query')).to.equal(false);
    });

    it('caps rows to maxRows', async function() {
      axiosGetStub.resolves({ data: { data: [] } });

      await service.lookupDataciteDois({
        ...request,
        rows: 100
      });

      expect(axiosGetStub.firstCall.args[1].params.get('page[size]')).to.equal('25');
    });

    it('converts start to DataCite page number', async function() {
      axiosGetStub.resolves({ data: { data: [] } });

      await service.lookupDataciteDois({
        ...request,
        start: 50
      });

      expect(axiosGetStub.firstCall.args[1].params.get('page[number]')).to.equal('3');
    });

    it('supports custom filters', async function() {
      axiosGetStub.resolves({ data: { data: [] } });

      await service.lookupDataciteDois({
        ...request,
        options: {
          ...request.options,
          defaultParams: {
            'client-id': 'datacite.datacite',
            'resource-type-id': 'dataset'
          }
        }
      });

      expect(axiosGetStub.firstCall.args[1].params.get('client-id')).to.equal('datacite.datacite');
      expect(axiosGetStub.firstCall.args[1].params.get('resource-type-id')).to.equal('dataset');
    });

    it('wraps DataCite HTTP failures', async function() {
      axiosGetStub.rejects({
        isAxiosError: true,
        response: { status: 429 }
      });

      try {
        await service.lookupDataciteDois(request);
        throw new Error('Expected lookup to fail');
      } catch (error) {
        expect((error as { code?: string }).code).to.equal('datacite-lookup-failed');
        expect((error as { statusCode?: number }).statusCode).to.equal(429);
      }
    });

    it('exports lookupDataciteDois', function() {
      const exported = service.exports();
      expect(exported).to.have.property('lookupDataciteDois');
    });
  });

  describe('trigger audit nesting', function() {
    it('should keep trigger and publish spans inside the same trace', async function() {
      (global as any).IntegrationAuditService.startAudit.onFirstCall().returns({
        traceId: 'trace-1',
        spanId: 'span-parent',
      });
      (global as any).IntegrationAuditService.startAudit.onSecondCall().returns({
        traceId: 'trace-1',
        spanId: 'span-child',
        parentSpanId: 'span-parent',
      });

      const record = withBrand({
        metadata: {
          creators: [{ given_name: 'First', family_name: 'Last' }],
          citation_title: 'My Title',
          citation_publisher: 'My Publisher',
          citation_publication_date: '2023-04-01'
        }
      });

      await service.publishDoiTriggerSync('oid1', record, { forceRun: true });

      expect((global as any).IntegrationAuditService.startAudit.calledTwice).to.be.true;
      const childAuditOptions = (global as any).IntegrationAuditService.startAudit.secondCall.args[2];
      expect(childAuditOptions.traceId).to.equal('trace-1');
      expect(childAuditOptions.parentSpanId).to.equal('span-parent');
      expect(childAuditOptions.traceId).to.equal((global as any).IntegrationAuditService.startAudit.firstCall.returnValue.traceId);
      const runtimeOptions = (runtime.runCreateDoiProgram as sinon.SinonStub).firstCall.args[3];
      expect(runtimeOptions.auditContext).to.equal((global as any).IntegrationAuditService.startAudit.secondCall.returnValue);
    });
  });

  describe('deleteDoi', function() {
    it('should delete DOI through the v2 runtime for the provided brand', async function() {
      const result = await service.deleteDoi({ id: 'brand-1', name: 'default' }, '10.1234/5678');

      expect(result).to.be.true;
      expect((runtime.runDeleteDoiProgram as sinon.SinonStub).calledOnce).to.be.true;
    });
  });

  describe('changeDoiState', function() {
    it('should change DOI state through the v2 runtime for the provided brand', async function() {
      sinon.stub(runtime, 'runChangeDoiStateProgram').resolves({
        statusCode: 200,
        responseSummary: { changed: true, doi: '10.1234/5678', event: 'publish' }
      });

      const result = await service.changeDoiState({ id: 'brand-1', name: 'default' }, '10.1234/5678', 'publish');

      expect(result).to.be.true;
      expect((runtime.runChangeDoiStateProgram as sinon.SinonStub).calledOnce).to.be.true;
    });
  });

  describe('getAuthenticationString', function() {
    it('should return base64 encoded doiPublishing credentials', function() {
      const result = service.getAuthenticationString(brandRecord());
      const expected = Buffer.from('user:pwd').toString('base64');
      expect(result).to.equal(expected);
    });

    it('should respect the stored doiPublishing password when env fallbacks are set', function() {
      process.env.DOI_CONNECTION_PASSWORD = 'env-pwd';
      process.env.DATACITE_PASSWORD = 'legacy-env-pwd';

      const result = service.getAuthenticationString(brandRecord());
      const expected = Buffer.from('user:pwd').toString('base64');

      expect(result).to.equal(expected);
    });

    it('should resolve the doiPublishing password from an env var when no password is stored', function() {
      mockSails.config.brandingConfigurationDefaults.doiPublishing.connection.password = '';
      process.env.DOI_CONNECTION_PASSWORD = 'env-pwd';

      const result = service.getAuthenticationString(brandRecord());
      const expected = Buffer.from('user:env-pwd').toString('base64');

      expect(result).to.equal(expected);
    });

    it('should resolve the doiPublishing password from an explicit env var reference', function() {
      mockSails.config.brandingConfigurationDefaults.doiPublishing.connection.password = '$DOI_PASSWORD_FROM_ENV';
      process.env.DOI_PASSWORD_FROM_ENV = 'referenced-pwd';
      process.env.DOI_CONNECTION_PASSWORD = 'fallback-pwd';

      const result = service.getAuthenticationString(brandRecord());
      const expected = Buffer.from('user:referenced-pwd').toString('base64');

      expect(result).to.equal(expected);
    });

    it('should throw when no record brand is provided', function() {
      expect(() => service.getAuthenticationString()).to.throw('Cannot resolve DOI publishing config: record does not have a brand');
    });
  });

  describe('addDoiDataToRecord', function() {
    it('should add DOI data using doiPublishing write-back bindings', async function() {
      const record = withBrand({
        metadata: {
          creators: [{ family_name: 'Last', given_name: 'First' }],
          citation_title: 'Test Title',
          citation_publisher: 'Test Publisher',
          citation_publication_date: '2024-01-01'
        }
      });
      const doi = '10.1234/5678';
      const oid = 'oid-1';

      const result = await service.addDoiDataToRecord(oid, record, doi);

      expect(result.metadata.citation_doi).to.equal(doi);
      expect(result.metadata.citation_url).to.equal('https://redboxresearchdata.com.au/published/oid-1');
      expect(result.metadata.citation_generated).to.include('Test Title');
    });
  });

  describe('doiResponseToRBValidationError (private)', function() {
    it('should map status codes to error messages', function() {
      const check = (status: number, code: string) => {
        const err = (service as any).doiResponseToRBValidationError(status);
        expect(err.displayErrors[0].code).to.equal(code);
      };

      check(403, 'not-authorised');
      check(404, 'not-found');
      check(422, 'invalid-format');
      check(500, 'server-error');
      check(418, 'unknown-error');
    });
  });
});
