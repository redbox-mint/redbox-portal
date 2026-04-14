let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Buffer } from 'buffer';
import _ from 'lodash';
import { brandingConfigurationDefaults } from '../../src/config/brandingConfigurationDefaults.config';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';

describe('DoiService', function() {
  let service: any;
  let mockSails: any;
  let runtime: typeof import('../../src/services/doi-v2/runtime');
  const baseDoiPublishing = _.cloneDeep(brandingConfigurationDefaults.doiPublishing)!;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        brandingConfigurationDefaults: {
          doiPublishing: {
            ..._.cloneDeep(baseDoiPublishing),
            connection: {
              ..._.cloneDeep(baseDoiPublishing.connection),
              username: 'user',
              password: 'pwd'
            },
            profiles: {
              ..._.cloneDeep(baseDoiPublishing.profiles),
              dataPublication: {
                ..._.cloneDeep(baseDoiPublishing.profiles.dataPublication),
                metadata: {
                  ..._.cloneDeep(baseDoiPublishing.profiles.dataPublication.metadata),
                  prefix: {
                    ..._.cloneDeep(baseDoiPublishing.profiles.dataPublication.metadata.prefix),
                    defaultValue: '10.1234'
                  }
                }
              }
            }
          }
        }
      }
    });
    setupServiceTestGlobals(mockSails);

    (global as any).AppConfigService = {
      getAppConfigurationForBrand: sinon.stub().returns(mockSails.config.brandingConfigurationDefaults)
    };
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
      getBrand: sinon.stub().returns({})
    };

    runtime = require('../../src/services/doi-v2/runtime');
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
    cleanupServiceTestGlobals();
    delete (global as any).AppConfigService;
    delete (global as any).TranslationService;
    delete (global as any).RecordsService;
    delete (global as any).IntegrationAuditService;
    delete (global as any).BrandingService;
    sinon.restore();
  });

  describe('publishDoi', function() {
    it('should create DOI through the v2 runtime', async function() {
      const record = {
        metadata: {
          creators: [{ given_name: 'First', family_name: 'Last' }],
          citation_title: 'My Title',
          citation_publisher: 'My Publisher',
          citation_publication_date: '2023-04-01'
        }
      };

      const result = await service.publishDoi('oid1', record);

      expect(result).to.equal('10.1234/5678');
      expect((runtime.runCreateDoiProgram as sinon.SinonStub).calledOnce).to.be.true;
    });

    it('should skip DOI update when the stored DOI prefix does not match the configured profile prefix', async function() {
      const record = {
        metadata: {
          creators: [{ given_name: 'First', family_name: 'Last' }],
          citation_doi: 'xxxxx/5678',
          citation_title: 'My Title',
          citation_publisher: 'My Publisher',
          citation_publication_date: '2023-04-01'
        }
      };

      const result = await service.publishDoi('oid1', record, 'publish', 'update');

      expect(result).to.equal(null);
      expect((runtime.runUpdateDoiProgram as sinon.SinonStub).called).to.be.false;
    });
  });

  describe('deleteDoi', function() {
    it('should delete DOI through the v2 runtime', async function() {
      const result = await service.deleteDoi('10.1234/5678');

      expect(result).to.be.true;
      expect((runtime.runDeleteDoiProgram as sinon.SinonStub).calledOnce).to.be.true;
    });
  });

  describe('getAuthenticationString', function() {
    it('should return base64 encoded doiPublishing credentials', function() {
      const result = service.getAuthenticationString();
      const expected = Buffer.from('user:pwd').toString('base64');
      expect(result).to.equal(expected);
    });
  });

  describe('addDoiDataToRecord', function() {
    it('should add DOI data using doiPublishing write-back bindings', async function() {
      const record = {
        metadata: {
          creators: [{ family_name: 'Last', given_name: 'First' }],
          citation_title: 'Test Title',
          citation_publisher: 'Test Publisher',
          citation_publication_date: '2024-01-01'
        }
      };
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
