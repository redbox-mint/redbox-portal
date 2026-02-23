let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import axios from 'axios';
import { Buffer } from 'buffer';

describe('DoiService', function() {
  let service: any;
  let mockSails: any;
  let axiosMock: any;

  beforeEach(function() {
    mockSails = createMockSails();
    mockSails.config.datacite = {
      baseUrl: 'http://api.datacite.org',
      username: 'user',
      password: 'pwd',
      doiPrefix: '10.1234',
      citationUrlProperty: 'metadata.citation_url',
      citationDoiProperty: 'metadata.citation_doi',
      generatedCitationStringProperty: 'metadata.citation_string',
      citationStringTemplate: 'Citation: <%= data.metadata.title %>',
      mappings: {
        url: 'record.metadata.url',
        publicationYear: 'record.metadata.year',
        publisher: 'record.metadata.publisher',
        title: 'record.metadata.title',
        creatorGivenName: 'creator.given',
        creatorFamilyName: 'creator.family',
        creatorIdentifier: 'creator.id',
        dates: [],
        subjects: [],
        rightsList: [],
        fundingReferences: [],
        descriptions: [],
        sizes: '[]',
        identifiers: '[]'
      },
      creatorsProperty: 'creators'
    };
    setupServiceTestGlobals(mockSails);

    (global as any).TranslationService = {
      t: sinon.stub().returnsArg(0)
    };
    (global as any).RecordsService = {
      updateMeta: sinon.stub().resolves()
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({})
    };
    (global as any).moment = require('moment');

    axiosMock = {
      post: sinon.stub(),
      put: sinon.stub(),
      delete: sinon.stub(),
      patch: sinon.stub()
    };
    sinon.stub(axios, 'create').returns(axiosMock);

    const { Services } = require('../../src/services/DoiService');
    service = new Services.Doi();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).TranslationService;
    delete (global as any).RecordsService;
    delete (global as any).BrandingService;
    delete (global as any).moment;
    sinon.restore();
  });

  describe('publishDoi', function() {
    it('should create DOI', async function() {
      const record = {
        metadata: {
          creators: [{ given: 'First', family: 'Last', id: '123' }],
          title: 'My Title',
          publisher: 'My Publisher',
          year: '2023',
          url: 'http://example.com'
        }
      };
      
      axiosMock.post.resolves({
        status: 201,
        data: { data: { id: '10.1234/5678' } }
      });

      const result = await service.publishDoi('oid1', record);
      
      expect(result).to.equal('10.1234/5678');
      expect(axiosMock.post.calledOnce).to.be.true;
    });

    it('should update DOI if action is update', async function() {
      const record = {
        metadata: {
          creators: [{ given: 'First', family: 'Last', id: '123' }],
          citation_doi: '10.1234/5678',
          title: 'My Title',
          publisher: 'My Publisher',
          year: '2023',
          url: 'http://example.com'
        }
      };
      
      axiosMock.patch.resolves({
        status: 200,
        data: { data: { id: '10.1234/5678' } }
      });

      const result = await service.publishDoi('oid1', record, 'publish', 'update');
      
      expect(result).to.equal('10.1234/5678');
      expect(axiosMock.patch.calledOnce).to.be.true;
    });
  });

  describe('deleteDoi', function() {
    it('should delete DOI', async function() {
      axiosMock.delete.resolves({ status: 204 });
      
      const result = await service.deleteDoi('10.1234/5678');
      
      expect(result).to.be.true;
      expect(axiosMock.delete.calledOnce).to.be.true;
    });
  });

  describe('getAuthenticationString', function() {
    it('should return base64 encoded credentials', function() {
      const result = service.getAuthenticationString();
      const expected = Buffer.from('user:pwd').toString('base64');
      expect(result).to.equal(expected);
    });
  });

  describe('runTemplate (protected)', function() {
    it('should run lodash template', function() {
      const template = 'Hello <%= name %>';
      const variables = { name: 'World' };
      
      const result = (service as any).runTemplate(template, variables);
      
      expect(result).to.equal('Hello World');
    });

    it('should return value from path if not template', function() {
      const path = 'user.name';
      const variables = { user: { name: 'John' } };
      
      const result = (service as any).runTemplate(path, variables);
      
      expect(result).to.equal('John');
    });
  });

  describe('processForCodes (private)', function() {
    it('should process ANZSRC codes', function() {
      const codes = [
        { name: 'Code 1', notation: '01' },
        { name: 'Code 2', notation: '02' }
      ];
      
      const result = (service as any).processForCodes(codes);
      
      expect(result).to.have.length(2);
      expect(result[0].subject).to.equal('Code 1');
      expect(result[0].classificationCode).to.equal('01');
      expect(result[0].schemeUri).to.include('abs.gov.au');
    });

    it('should return empty array if undefined', function() {
      const result = (service as any).processForCodes(undefined);
      expect(result).to.be.an('array').that.is.empty;
    });
  });

  describe('addDoiDataToRecord', function() {
    it('should add DOI data to record', function() {
      const record = {
        metadata: {
          title: 'Test Record',
          url: 'http://example.com'
        }
      };
      const doi = '10.1234/5678';
      const oid = 'oid-1';
      
      const result = service.addDoiDataToRecord(oid, record, doi);
      
      expect(result.metadata.citation_doi).to.equal(doi);
      expect(result.metadata.citation_url).to.equal('http://example.com'); // From record.metadata.url
      expect(result.metadata.citation_string).to.include('Citation: Test Record');
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
