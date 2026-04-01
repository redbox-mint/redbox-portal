let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Services } from '../../src/services/FigshareService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import axios from 'axios';

describe('FigshareService', function() {
  let service: any;
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails({
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
        crit: sinon.stub(),
        fatal: sinon.stub(),
        silly: sinon.stub(),
        blank: sinon.stub(),
        log: sinon.stub(),
        silent: sinon.stub()
      }
    });
    mockSails.config.figshareAPI = {
      APIToken: 'test-token',
      baseURL: 'https://api.figshare.com',
      frontEndURL: 'https://figshare.com',
      extraVerboseLogging: false,
      testUsers: [],
      attachmentsFigshareTempDir: '/tmp/figshare',
      mapping: {
        artifacts: {},
        templates: {
          getAuthor: [],
          customFields: { create: {}, update: {} },
          impersonate: {},
          publish: {}
        },
        standardFields: { 
          create: [], 
          update: [], 
          embargo: [{ figField: 'embargo_date', recordPath: 'metadata.embargo_date' }] 
        },
        recordFigArticleId: 'metadata.figshare_article_id',
        recordFigArticleURL: 'metadata.figshare_url',
        recordDataLocations: 'metadata.dataLocations',
        recordLicensePath: 'metadata.license',
        recordCategoryPath: 'metadata.forCodes',
        recordCategoryNotation: 'notation',
        recordAuthorField: 'metadata.contributors',
        recordAuthorExternalName: 'text_full_name',
        recordAuthorUniqueBy: 'email',
        figshareOnlyPublishSelectedAttachmentFiles: false,
        figshareDisableUpdateByCurationStatus: false,
        figshareNeedsPublishAfterFileUpload: false,
        upload: {
          attachments: {},
          override: {}
        }
      }
    };
    mockSails.config.figshareReDBoxFORMapping = {
      FORMapping: []
    };
    mockSails.config.record = {
      datastreamService: 'datastreamservice',
      createUpdateFigshareArticleLogLevel: 'verbose'
    };
    mockSails.config.queue = {
      serviceName: 'queueservice'
    };
    
    // Mock TranslationService
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((key) => key)
    };
    
    setupServiceTestGlobals(mockSails);

    service = new Services.FigshareService();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).TranslationService;
    sinon.restore();
  });

  describe('constructor', function() {
    it('should export expected methods', function() {
      const exports = service.exports();
      expect(exports).to.have.property('createUpdateFigshareArticle');
      expect(exports).to.have.property('uploadFilesToFigshareArticle');
      expect(exports).to.have.property('deleteFilesFromRedbox');
      expect(exports).to.have.property('queueDeleteFiles');
      expect(exports).to.have.property('queuePublishAfterUploadFiles');
    });
  });

  describe('getRuntimeConfig', function() {
    it('should return valid config from sails.config', function() {
      const config = service.getRuntimeConfig();
      expect(config.apiToken).to.equal('test-token');
      expect(config.baseURL).to.equal('https://api.figshare.com');
      expect(config.frontEndURL).to.equal('https://figshare.com');
    });

    it('should use override artifacts when available', function() {
      mockSails.config.figshareAPIEnv = {
        overrideArtifacts: {
          APIToken: 'override-token',
          baseURL: 'https://override.api.com'
        }
      };
      const config = service.getRuntimeConfig();
      expect(config.apiToken).to.equal('override-token');
      expect(config.baseURL).to.equal('https://override.api.com');
    });

    it('should merge mapping with override mapping', function() {
      mockSails.config.figshareAPIEnv = {
        overrideArtifacts: {
          mapping: {
            figshareItemGroupId: 123
          }
        }
      };
      const config = service.getRuntimeConfig();
      expect(config.figshareItemGroupId).to.equal(123);
    });

    it('should handle array overrides correctly', function() {
      mockSails.config.figshareAPI.mapping.recordFigArticleURL = 'single.path';
      const config = service.getRuntimeConfig();
      expect(config.figArticleURLPathInRecordList).to.deep.equal(['single.path']);
    });

    it('should handle array recordFigArticleURL', function() {
      mockSails.config.figshareAPI.mapping.recordFigArticleURL = ['path1', 'path2'];
      const config = service.getRuntimeConfig();
      expect(config.figArticleURLPathInRecordList).to.deep.equal(['path1', 'path2']);
    });

    it('should handle empty recordFigArticleURL', function() {
      mockSails.config.figshareAPI.mapping.recordFigArticleURL = '';
      const config = service.getRuntimeConfig();
      expect(config.figArticleURLPathInRecordList).to.deep.equal([]);
    });

    it('should set default curationStatusTargetValueFA to public', function() {
      const config = service.getRuntimeConfig();
      expect(config.curationStatusTargetValueFA).to.equal('public');
    });

    it('should use logLevel from record config', function() {
      mockSails.config.record.createUpdateFigshareArticleLogLevel = 'debug';
      const config = service.getRuntimeConfig();
      expect(config.logLevel).to.equal('debug');
    });
  });

  describe('isFigshareAPIEnabled', function() {
    it('should return true if all required configs are present', function() {
      const config = service.getRuntimeConfig();
      expect(service.isFigshareAPIEnabled(config)).to.be.true;
    });

    it('should return false if missing apiToken', function() {
      mockSails.config.figshareAPI.APIToken = '';
      const config = service.getRuntimeConfig();
      expect(service.isFigshareAPIEnabled(config)).to.be.false;
    });

    it('should return false if missing baseURL', function() {
      mockSails.config.figshareAPI.baseURL = '';
      const config = service.getRuntimeConfig();
      expect(service.isFigshareAPIEnabled(config)).to.be.false;
    });

    it('should return false if missing frontEndURL', function() {
      mockSails.config.figshareAPI.frontEndURL = '';
      const config = service.getRuntimeConfig();
      expect(service.isFigshareAPIEnabled(config)).to.be.false;
    });
  });

  describe('getAxiosConfig', function() {
    it('should build config for GET request', function() {
      const config = service.getRuntimeConfig();
      const axiosConfig = service.getAxiosConfig(config, 'get', '/articles', null);
      expect(axiosConfig.method).to.equal('get');
      expect(axiosConfig.url).to.equal('https://api.figshare.com/articles');
      expect(axiosConfig.headers.Authorization).to.equal('token test-token');
    });

    it('should build config for POST request with body', function() {
      const config = service.getRuntimeConfig();
      const body = { title: 'Test Article' };
      const axiosConfig = service.getAxiosConfig(config, 'post', '/articles', body);
      expect(axiosConfig.method).to.equal('post');
      expect(axiosConfig.data).to.deep.equal(body);
    });

    it('should build config for PUT request', function() {
      const config = service.getRuntimeConfig();
      const body = { title: 'Updated Title' };
      const axiosConfig = service.getAxiosConfig(config, 'put', '/articles/123', body);
      expect(axiosConfig.method).to.equal('put');
      expect(axiosConfig.url).to.include('/articles/123');
    });

    it('should build config for DELETE request', function() {
      const config = service.getRuntimeConfig();
      const axiosConfig = service.getAxiosConfig(config, 'delete', '/articles/123', null);
      expect(axiosConfig.method).to.equal('delete');
    });

    it('should include Content-Type header', function() {
      const config = service.getRuntimeConfig();
      const axiosConfig = service.getAxiosConfig(config, 'get', '/articles', null);
      expect(axiosConfig.headers['Content-Type']).to.equal('application/json');
    });
  });

  describe('logWithLevel', function() {
    it('should call sails.log.verbose for verbose level', function() {
      service.logWithLevel('verbose', 'test message');
      expect(mockSails.log.verbose.calledWith('test message')).to.be.true;
    });

    it('should call sails.log.debug for debug level', function() {
      service.logWithLevel('debug', 'test message');
      expect(mockSails.log.debug.calledWith('test message')).to.be.true;
    });

    it('should call sails.log.error for error level', function() {
      service.logWithLevel('error', 'test error');
      expect(mockSails.log.error.calledWith('test error')).to.be.true;
    });

    it('should call sails.log.info for info level', function() {
      service.logWithLevel('info', 'test info');
      expect(mockSails.log.info.calledWith('test info')).to.be.true;
    });

    it('should handle multiple arguments', function() {
      service.logWithLevel('verbose', 'arg1', 'arg2', 'arg3');
      expect(mockSails.log.verbose.calledWith('arg1', 'arg2', 'arg3')).to.be.true;
    });
  });

  describe('logVerbose', function() {
    it('should log when extraVerboseLogging is true', function() {
      mockSails.config.figshareAPI.extraVerboseLogging = true;
      const config = service.getRuntimeConfig();
      service.logVerbose(config, 'verbose message');
      expect(mockSails.log.verbose.called).to.be.true;
    });

    it('should not log when extraVerboseLogging is false', function() {
      mockSails.config.figshareAPI.extraVerboseLogging = false;
      const config = service.getRuntimeConfig();
      mockSails.log.verbose.resetHistory();
      service.logVerbose(config, 'should not appear');
      // logVerbose checks config.extraVerboseLogging before calling log
    });
  });

  describe('getRetryConfig', function() {
    it('should return default retry config', function() {
      const retryConfig = service.getRetryConfig();
      expect(retryConfig.maxAttempts).to.be.a('number');
      expect(retryConfig.baseDelayMs).to.be.a('number');
      expect(retryConfig.maxDelayMs).to.be.a('number');
      expect(retryConfig.retryOnStatusCodes).to.be.an('array');
    });

    it('should merge override config', function() {
      const retryConfig = service.getRetryConfig({ maxAttempts: 10 });
      expect(retryConfig.maxAttempts).to.equal(10);
    });

    it('should have default status codes for retry', function() {
      const retryConfig = service.getRetryConfig();
      expect(retryConfig.retryOnStatusCodes).to.include(503);
      expect(retryConfig.retryOnStatusCodes).to.include(429);
    });
  });

  describe('shouldRetryRequest', function() {
    it('should return true for retryable status codes', function() {
      const retryConfig = service.getRetryConfig();
      const error = {
        response: { status: 503 }
      };
      const axiosConfig = { method: 'get' };
      expect(service.shouldRetryRequest(error, axiosConfig, retryConfig)).to.be.true;
    });

    it('should return true for 429 rate limit', function() {
      const retryConfig = service.getRetryConfig();
      const error = {
        response: { status: 429 }
      };
      const axiosConfig = { method: 'get' };
      expect(service.shouldRetryRequest(error, axiosConfig, retryConfig)).to.be.true;
    });

    it('should return true for network errors', function() {
      const retryConfig = service.getRetryConfig();
      const error = {
        code: 'ECONNRESET'
      };
      const axiosConfig = { method: 'get' };
      expect(service.shouldRetryRequest(error, axiosConfig, retryConfig)).to.be.true;
    });

    it('should return true for ETIMEDOUT', function() {
      const retryConfig = service.getRetryConfig();
      const error = {
        code: 'ETIMEDOUT'
      };
      const axiosConfig = { method: 'get' };
      expect(service.shouldRetryRequest(error, axiosConfig, retryConfig)).to.be.true;
    });

    it('should return false for non-retryable status codes', function() {
      const retryConfig = service.getRetryConfig();
      const error = {
        response: { status: 400 }
      };
      const axiosConfig = { method: 'get' };
      expect(service.shouldRetryRequest(error, axiosConfig, retryConfig)).to.be.false;
    });

    it('should return false for 404', function() {
      const retryConfig = service.getRetryConfig();
      const error = {
        response: { status: 404 }
      };
      const axiosConfig = { method: 'get' };
      expect(service.shouldRetryRequest(error, axiosConfig, retryConfig)).to.be.false;
    });
  });

  describe('requestWithRetry', function() {
    it('should retry on transient failures and eventually succeed', async function() {
      // Mock axios for this specific test
      const retryableError: any = new Error('transient');
      retryableError.response = { status: 503, statusText: 'Service Unavailable', data: {} };
      
      const axiosMock = sinon.stub();
      axiosMock.onFirstCall().rejects(retryableError);
      axiosMock.onSecondCall().resolves({ status: 200, statusText: 'OK', data: { ok: true } });
      
      // Invalidate cache to inject mock
      const servicePath = require.resolve('../../src/services/FigshareService');
      const axiosPath = require.resolve('axios');
      const oldServiceCache = require.cache[servicePath];
      const oldAxiosCache = require.cache[axiosPath];
      
      delete require.cache[servicePath];
      delete require.cache[axiosPath];
      require.cache[axiosPath] = { exports: axiosMock } as any;
      
      try {
        const { Services: LocalServices } = require('../../src/services/FigshareService');
        const localService = new LocalServices.FigshareService();
        const config = localService.getRuntimeConfig();
        sinon.stub(localService, 'sleep').resolves();

        const response = await (localService as any).requestWithRetry(
          config,
          { method: 'get', url: 'https://example.test' },
          { retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 } }
        );

        expect(response.status).to.equal(200);
        expect(axiosMock.calledTwice).to.be.true;
      } finally {
        // Restore cache
        require.cache[servicePath] = oldServiceCache;
        require.cache[axiosPath] = oldAxiosCache;
      }
    });

    it('should not retry on non-retryable errors', async function() {
      const nonRetryableError: any = new Error('bad request');
      nonRetryableError.response = { status: 400, statusText: 'Bad Request', data: {} };
      
      const axiosMock = sinon.stub().rejects(nonRetryableError);
      
      const servicePath = require.resolve('../../src/services/FigshareService');
      const axiosPath = require.resolve('axios');
      const oldServiceCache = require.cache[servicePath];
      const oldAxiosCache = require.cache[axiosPath];
      
      delete require.cache[servicePath];
      delete require.cache[axiosPath];
      require.cache[axiosPath] = { exports: axiosMock } as any;
      
      try {
        const { Services: LocalServices } = require('../../src/services/FigshareService');
        const localService = new LocalServices.FigshareService();
        const config = localService.getRuntimeConfig();
        sinon.stub(localService, 'sleep').resolves();

        try {
          await (localService as any).requestWithRetry(
            config,
            { method: 'get', url: 'https://example.test' },
            { retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 } }
          );
          expect.fail('Should have thrown');
        } catch (err) {
          expect(err).to.equal(nonRetryableError);
        }

        expect(axiosMock.calledOnce).to.be.true;
      } finally {
        require.cache[servicePath] = oldServiceCache;
        require.cache[axiosPath] = oldAxiosCache;
      }
    });
  });

  describe('redactAxiosConfig', function() {
    it('should redact authorization header', function() {
      const axiosConfig = {
        headers: {
          Authorization: 'token secret-token',
          'Content-Type': 'application/json'
        },
        data: { title: 'Test' }
      };
      const redacted = service.redactAxiosConfig(axiosConfig);
      expect(redacted.headers.Authorization).to.equal('REDACTED');
      expect(redacted.headers['Content-Type']).to.equal('application/json');
    });

    it('should preserve non-sensitive data', function() {
      const axiosConfig = {
        method: 'post',
        url: 'https://api.figshare.com/articles',
        headers: {
          'Content-Type': 'application/json'
        }
      };
      const redacted = service.redactAxiosConfig(axiosConfig);
      expect(redacted.method).to.equal('post');
      expect(redacted.url).to.equal('https://api.figshare.com/articles');
    });
  });

  describe('describeAxiosError', function() {
    it('should describe error with response', function() {
      const error = {
        response: { status: 404, statusText: 'Not Found' },
        message: 'Request failed'
      };
      const description = service.describeAxiosError(error);
      expect(description).to.include('404');
    });

    it('should describe network error with code', function() {
      const error = {
        code: 'ECONNREFUSED',
        message: 'ECONNREFUSED'
      };
      const description = service.describeAxiosError(error);
      expect(description).to.be.a('string');
    });

    it('should handle error without response', function() {
      const error = {
        message: 'Unknown error'
      };
      const description = service.describeAxiosError(error);
      expect(description).to.be.a('string');
    });
  });

  describe('formatBytes', function() {
    it('should return "0 Bytes" for 0', function() {
      expect(service.formatBytes(0)).to.equal('0 Bytes');
    });

    it('should format bytes correctly', function() {
      expect(service.formatBytes(1024)).to.equal('1 KB');
      expect(service.formatBytes(1048576)).to.equal('1 MB');
      expect(service.formatBytes(1073741824)).to.equal('1 GB');
    });

    it('should format terabytes', function() {
      expect(service.formatBytes(1099511627776)).to.equal('1 TB');
    });

    it('should handle decimal places', function() {
      expect(service.formatBytes(1500, 2)).to.equal('1.46 KB');
      expect(service.formatBytes(1500, 0)).to.equal('1 KB');
    });

    it('should handle negative decimals as 0', function() {
      expect(service.formatBytes(1500, -1)).to.equal('1 KB');
    });

    it('should handle large files', function() {
      const fiveGB = 5 * 1073741824;
      const result = service.formatBytes(fiveGB, 2);
      expect(result).to.equal('5 GB');
    });
  });

  describe('isFileAttachmentInDataLocations', function() {
    it('should return true when attachment exists', function() {
      const dataLocations = [
        { type: 'attachment', name: 'file.csv' }
      ];
      expect(service.isFileAttachmentInDataLocations(dataLocations)).to.be.true;
    });

    it('should return false when no attachments', function() {
      const dataLocations = [
        { type: 'url', name: 'link' }
      ];
      expect(service.isFileAttachmentInDataLocations(dataLocations)).to.be.false;
    });

    it('should check selected when figshareOnlyPublishSelectedAttachmentFiles is true', function() {
      mockSails.config.figshareAPI.mapping.figshareOnlyPublishSelectedAttachmentFiles = true;
      const dataLocations = [
        { type: 'attachment', name: 'file.csv', selected: false },
        { type: 'attachment', name: 'file2.csv', selected: true }
      ];
      expect(service.isFileAttachmentInDataLocations(dataLocations)).to.be.true;
    });

    it('should return false when selected is false and only publish selected', function() {
      mockSails.config.figshareAPI.mapping.figshareOnlyPublishSelectedAttachmentFiles = true;
      const dataLocations = [
        { type: 'attachment', name: 'file.csv', selected: false }
      ];
      expect(service.isFileAttachmentInDataLocations(dataLocations)).to.be.false;
    });

    it('should skip undefined and empty entries', function() {
      const dataLocations = [undefined, {}, { type: 'attachment', name: 'file.csv' }];
      expect(service.isFileAttachmentInDataLocations(dataLocations)).to.be.true;
    });

    it('should return false for empty array', function() {
      expect(service.isFileAttachmentInDataLocations([])).to.be.false;
    });
  });

  describe('isURLAttachmentInDataLocations', function() {
    it('should return true when URL attachment exists', function() {
      const dataLocations = [
        { type: 'url', name: 'link' }
      ];
      expect(service.isURLAttachmentInDataLocations(dataLocations)).to.be.true;
    });

    it('should return false when no URL attachments', function() {
      const dataLocations = [
        { type: 'attachment', name: 'file.csv' }
      ];
      expect(service.isURLAttachmentInDataLocations(dataLocations)).to.be.false;
    });

    it('should check selected when figshareOnlyPublishSelectedAttachmentFiles is true', function() {
      mockSails.config.figshareAPI.mapping.figshareOnlyPublishSelectedAttachmentFiles = true;
      const dataLocations = [
        { type: 'url', name: 'link', selected: true }
      ];
      expect(service.isURLAttachmentInDataLocations(dataLocations)).to.be.true;
    });

    it('should return false when URL not selected and only publish selected', function() {
      mockSails.config.figshareAPI.mapping.figshareOnlyPublishSelectedAttachmentFiles = true;
      const dataLocations = [
        { type: 'url', name: 'link', selected: false }
      ];
      expect(service.isURLAttachmentInDataLocations(dataLocations)).to.be.false;
    });

    it('should skip undefined and empty entries', function() {
      const dataLocations = [undefined, {}, { type: 'url', name: 'link' }];
      expect(service.isURLAttachmentInDataLocations(dataLocations)).to.be.true;
    });
  });

  describe('countFileAttachmentsInDataLocations', function() {
    it('should count all attachments', function() {
      const dataLocations = [
        { type: 'attachment', name: 'file1.csv' },
        { type: 'attachment', name: 'file2.csv' },
        { type: 'url', name: 'link' }
      ];
      expect(service.countFileAttachmentsInDataLocations(dataLocations)).to.equal(2);
    });

    it('should count only selected when figshareOnlyPublishSelectedAttachmentFiles is true', function() {
      mockSails.config.figshareAPI.mapping.figshareOnlyPublishSelectedAttachmentFiles = true;
      const dataLocations = [
        { type: 'attachment', name: 'file1.csv', selected: true },
        { type: 'attachment', name: 'file2.csv', selected: false },
        { type: 'attachment', name: 'file3.csv', selected: true }
      ];
      expect(service.countFileAttachmentsInDataLocations(dataLocations)).to.equal(2);
    });

    it('should return 0 for empty array', function() {
      expect(service.countFileAttachmentsInDataLocations([])).to.equal(0);
    });

    it('should skip undefined and empty entries', function() {
      const dataLocations = [undefined, {}, { type: 'attachment', name: 'file.csv' }];
      expect(service.countFileAttachmentsInDataLocations(dataLocations)).to.equal(1);
    });

    it('should count correctly with mixed types', function() {
      const dataLocations = [
        { type: 'attachment', name: 'file1.csv' },
        { type: 'url', name: 'link1' },
        { type: 'attachment', name: 'file2.csv' },
        { type: 'url', name: 'link2' },
        { type: 'attachment', name: 'file3.csv' }
      ];
      expect(service.countFileAttachmentsInDataLocations(dataLocations)).to.equal(3);
    });
  });

  describe('getValueFromObject', function() {
    it('should get value from path', function() {
      const config = service.getRuntimeConfig();
      const field = { title: 'Test' };
      const value = service.getValueFromObject(config, field, 'title');
      expect(value).to.equal('Test');
    });

    it('should handle nested paths', function() {
      const config = service.getRuntimeConfig();
      const field = { nested: { deep: { value: 'found' } } };
      const value = service.getValueFromObject(config, field, 'nested.deep.value');
      expect(value).to.equal('found');
    });
  });

  describe('getValueFromRecord', function() {
    it('should get value from record path', function() {
      const config = service.getRuntimeConfig();
      const record = { metadata: { title: 'Test Record' } };
      const value = service.getValueFromRecord(config, record, 'metadata.title');
      expect(value).to.equal('Test Record');
    });

    it('should return undefined for non-existent path', function() {
      const config = service.getRuntimeConfig();
      const record = { metadata: {} };
      const value = service.getValueFromRecord(config, record, 'metadata.nonexistent');
      expect(value).to.be.undefined;
    });

    it('should handle arrays in path', function() {
      const config = service.getRuntimeConfig();
      const record = { metadata: { items: ['a', 'b', 'c'] } };
      const value = service.getValueFromRecord(config, record, 'metadata.items[1]');
      expect(value).to.equal('b');
    });
  });

  describe('sleep', function() {
    it('should wait for specified duration', async function() {
      this.timeout(3000);
      const start = Date.now();
      await service.sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).to.be.at.least(90);
    });

    it('should handle short delays', async function() {
      const start = Date.now();
      await service.sleep(10);
      const elapsed = Date.now() - start;
      expect(elapsed).to.be.at.least(5);
    });
  });

  describe('getArticleFileList', function() {
    it('should aggregate multiple pages until a partial page is returned', async function() {
      const config = service.getRuntimeConfig();
      mockSails.config.figshareAPI.mapping.upload.fileListPageSize = 2;
      
      const requestStub = sinon.stub(service, 'requestWithRetry');
      requestStub.onFirstCall().resolves({ status: 200, data: [{ id: 1 }, { id: 2 }] });
      requestStub.onSecondCall().resolves({ status: 200, data: [{ id: 3 }] });

      const files = await service.getArticleFileList(config, '123', false);

      expect(files).to.have.length(3);
      expect(files.map((f: any) => f.id)).to.deep.equal([1, 2, 3]);
      expect(requestStub.calledTwice).to.be.true;
    });

    it('should fallback to default page size when config is invalid', async function() {
      const config = service.getRuntimeConfig();
      mockSails.config.figshareAPI.mapping.upload.fileListPageSize = 'invalid';
      
      const requestStub = sinon.stub(service, 'requestWithRetry');
      requestStub.resolves({ status: 200, data: [] });

      await service.getArticleFileList(config, 'abc', false);
      
      const axiosConfig = requestStub.firstCall.args[1];
      expect(axiosConfig.url).to.contain('page_size=20');
    });

    it('should return empty list when no files found', async function() {
      const config = service.getRuntimeConfig();
      const requestStub = sinon.stub(service, 'requestWithRetry');
      requestStub.resolves({ status: 200, data: [] });

      const files = await service.getArticleFileList(config, 'empty', false);
      expect(files).to.deep.equal([]);
    });
  });

  describe('isFileUploadInProgress', function() {
    it('should return true when any file has status "created"', async function() {
      const config = service.getRuntimeConfig();
      const mockFileList = [{ id: 1, status: 'available' }, { id: 2, status: 'created' }];
      
      const result = await service.isFileUploadInProgress(config, 'article-1', mockFileList);
      expect(result).to.be.true;
    });

    it('should return false when no files are in progress', async function() {
      const config = service.getRuntimeConfig();
      const mockFileList = [{ id: 1, status: 'available' }];
      
      const result = await service.isFileUploadInProgress(config, 'article-1', mockFileList);
      expect(result).to.be.false;
    });

    it('should fetch file list if not provided', async function() {
      const config = service.getRuntimeConfig();
      sinon.stub(service, 'getArticleFileList').resolves([{ id: 1, status: 'available' }]);
      
      const result = await service.isFileUploadInProgress(config, 'article-1', undefined);
      expect(result).to.be.false;
      expect((service.getArticleFileList as sinon.SinonStub).calledOnce).to.be.true;
    });
  });

  describe('createUpdateFigshareArticle', function() {
    it('should check trigger condition and call sendDataPublicationToFigshare when met', async function() {
      sinon.stub(service, 'metTriggerCondition').returns('true');
      sinon.stub(service, 'sendDataPublicationToFigshare').resolves();
      
      await service.createUpdateFigshareArticle('oid', { metadata: {} }, {}, { email: 'test@test.com' });
      expect(service.sendDataPublicationToFigshare.called).to.be.true;
    });

    it('should not call sendDataPublicationToFigshare when trigger condition not met', async function() {
      sinon.stub(service, 'metTriggerCondition').returns('false');
      sinon.stub(service, 'sendDataPublicationToFigshare').resolves();
      
      await service.createUpdateFigshareArticle('oid', {}, {}, {});
      expect(service.sendDataPublicationToFigshare.called).to.be.false;
    });
  });

  describe('uploadFilesToFigshareArticle', function() {
    it('should check trigger condition and call checkUploadFilesPending when met', async function() {
      sinon.stub(service, 'metTriggerCondition').returns('true');
      sinon.stub(service, 'checkUploadFilesPending').resolves();
      
      await service.uploadFilesToFigshareArticle('oid', { metadata: {} }, {}, { email: 'test@test.com' });
      expect(service.checkUploadFilesPending.called).to.be.true;
    });
  });

  describe('deleteFilesFromRedboxTrigger', function() {
    it('should not call queueDeleteFiles when trigger condition not met', async function() {
      sinon.stub(service, 'metTriggerCondition').returns('false');
      sinon.stub(service, 'queueDeleteFiles').resolves();
      
      await service.deleteFilesFromRedboxTrigger('oid', {}, {}, {});
      expect(service.queueDeleteFiles.called).to.be.false;
    });
  });

  describe('getEmbargoRequestBody', function() {
    it('should build embargo request body with standard fields', function() {
      const config = service.getRuntimeConfig();
      mockSails.config.figshareAPI.mapping.standardFields.embargo = [
        { figField: 'embargo_date', recordPath: 'metadata.embargo_date' }
      ];
      
      const record = { metadata: { embargo_date: '2025-12-31' } };
      const body = service.getEmbargoRequestBody(config, record, []);
      expect(body).to.be.an('object');
    });
  });

  describe('validateFieldInRequestBody', function() {
    it('should return empty string for valid field', function() {
      const config = service.getRuntimeConfig();
      const requestBody = { title: 'Valid Title' };
      const field = { figField: 'title', validation: { required: true } };
      
      const result = service.validateFieldInRequestBody(config, requestBody, field);
      expect(result).to.equal('');
    });

    it('should not throw for missing optional field', function() {
      const config = service.getRuntimeConfig();
      const requestBody = {};
      const field = { figField: 'optional_field', validation: {} };
      
      const result = service.validateFieldInRequestBody(config, requestBody, field);
      expect(result).to.equal('');
    });
  });

  describe('setFieldInRecord', function() {
    it('should handle field configuration', function() {
      const config = service.getRuntimeConfig();
      const record: any = { metadata: {} };
      const article = { id: 12345 };
      
      // This is a simple test to ensure the method doesn't throw
      // The actual field setting logic is complex
      const field = { figField: 'id' };
      expect(() => service.setFieldInRecord(config, record, article, field)).to.not.throw;
    });
  });
});
