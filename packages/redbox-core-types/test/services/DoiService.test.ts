import { expect } from 'chai';
import * as sinon from 'sinon';
import { Services } from '../../src/services/DoiService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import axios from 'axios';

describe('DoiService', function() {
  let service: Services.Doi;
  let mockSails: any;
  let axiosMock: any;

  beforeEach(function() {
    mockSails = createMockSails();
    mockSails.config.datacite = {
      baseUrl: 'http://api.datacite.org',
      username: 'user',
      password: 'pwd',
      doiPrefix: '10.1234',
      mappings: {
        url: 'http://example.com/<%= oid %>',
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
    (global as any).moment = require('moment');

    axiosMock = {
      post: sinon.stub(),
      put: sinon.stub(),
      delete: sinon.stub(),
      patch: sinon.stub()
    };
    sinon.stub(axios, 'create').returns(axiosMock);

    service = new Services.Doi();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).TranslationService;
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
          year: '2023'
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
          year: '2023'
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
});
