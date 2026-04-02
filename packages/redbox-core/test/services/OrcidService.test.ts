let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('OrcidService', function() {
  let mockSails: any;
  let OrcidService: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        orcid: {
          url: 'https://pub.orcid.org'
        },
        record: {
          api: {
            search: { method: 'GET' }
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

    const { Services } = require('../../src/services/OrcidService');
    OrcidService = new Services.Orcids();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    sinon.restore();
  });

  describe('getOptions (protected)', function() {
    it('should return correct options object', function() {
      const url = 'https://api.orcid.org/search';
      const method = 'GET';
      
      const result = (OrcidService as any).getOptions(url, method);
      
      expect(result).to.deep.equal({
        method: 'GET',
        url: 'https://api.orcid.org/search',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        }
      });
    });

    it('should allow overriding content type', function() {
      const url = 'https://api.orcid.org/search';
      const method = 'POST';
      const contentType = 'application/xml';
      
      const result = (OrcidService as any).getOptions(url, method, contentType);
      
      expect(result.headers['Content-Type']).to.equal('application/xml');
    });
  });

  describe('getExtendedAttributeObject (private)', function() {
    it('should return formatted attribute object', function() {
      const label = 'test-label';
      const value = 'test-value';
      
      const result = (OrcidService as any).getExtendedAttributeObject(label, value);
      
      expect(result).to.deep.equal({
        label: 'test-label',
        value: 'test-value'
      });
    });
  });

  describe('mapToPeopleSearchResult (protected)', function() {
    it('should map basic profile fields', function() {
      const searchResult = {
        "orcid-profile": {
          "orcid-identifier": {
            "uri": "https://orcid.org/0000-0001-2345-6789"
          },
          "orcid-bio": {
            "personal-details": {
              "given-names": { "value": "John" },
              "family-name": { "value": "Doe" },
              "other-names": null
            },
            "biography": null,
            "researcher-urls": null,
            "keywords": null
          }
        }
      };
      
      const result = (OrcidService as any).mapToPeopleSearchResult(searchResult);
      
      expect(result.givenNames).to.equal('John');
      expect(result.familyName).to.equal('Doe');
      expect(result.identifier).to.equal('https://orcid.org/0000-0001-2345-6789');
      expect(result.extendedAttributes).to.be.an('array').that.is.empty;
    });

    it('should map extended attributes when present', function() {
      const searchResult = {
        "orcid-profile": {
          "orcid-identifier": {
            "uri": "https://orcid.org/0000-0001-2345-6789"
          },
          "orcid-bio": {
            "personal-details": {
              "given-names": { "value": "John" },
              "family-name": { "value": "Doe" },
              "other-names": {
                "other-name": ["Johnny"]
              }
            },
            "biography": "A researcher",
            "researcher-urls": {
              "researcher-url": [
                { "url-name": { "value": "Website" }, "url": { "value": "http://example.com" } }
              ]
            },
            "keywords": {
              "keyword": ["science", "data"]
            }
          }
        }
      };
      
      const result = (OrcidService as any).mapToPeopleSearchResult(searchResult);
      
      expect(result.extendedAttributes).to.have.length(4);
      
      const otherNames = result.extendedAttributes.find((a: any) => a.label === 'orcid-other-names');
      expect(otherNames.value).to.deep.equal(["Johnny"]);
      
      const biography = result.extendedAttributes.find((a: any) => a.label === 'orcid-biography');
      expect(biography.value).to.equal("A researcher");
      
      const urls = result.extendedAttributes.find((a: any) => a.label === 'orcid-researcher-urls');
      expect(urls.value).to.have.length(1);
      expect(urls.value[0].value).to.equal("Website");
      expect(urls.value[0].url).to.equal("http://example.com");
      expect(urls.displayAsLinks).to.be.true;
      
      const keywords = result.extendedAttributes.find((a: any) => a.label === 'orcid-keywords');
      expect(keywords.value).to.deep.equal(["science", "data"]);
    });
  });

  describe('exports', function() {
    it('should export searchOrcid method', function() {
      const exported = OrcidService.exports();
      expect(exported).to.have.property('searchOrcid');
    });
  });
});
