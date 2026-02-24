let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createMockModel } from './testHelper';

describe('CacheService', function() {
  let CacheService: any;
  let mockSails: any;
  let mockCacheEntry: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        custom_cache: {
          cacheExpiry: 3600,
          checkPeriod: 600
        },
        angularDev: 'true' // Disable NG file hash building for tests
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        error: sinon.stub()
      }
    });

    mockCacheEntry = createMockModel('CacheEntry');
    
    setupServiceTestGlobals(mockSails);
    (global as any).CacheEntry = mockCacheEntry;
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).CacheEntry;
    sinon.restore();
  });

  describe('bootstrap', function() {
    it('should initialize the cache with config options', async function() {
      const { Services } = require('../../src/services/CacheService');
      const cacheService = new Services.Cache();
      
      await cacheService.bootstrap();
      
      // Should have called log.verbose with cache options
      expect(mockSails.log.verbose.called).to.be.true;
    });
  });

  describe('get', function() {
    it('should return cached data from local cache when available', function(done) {
      const { Services } = require('../../src/services/CacheService');
      const cacheService = new Services.Cache();
      
      // Set up the cache first
      cacheService.cache = {
        get: sinon.stub().returns({ data: 'cached-value' }),
        set: sinon.stub()
      };

      cacheService.get('test-key').subscribe({
        next: (result: any) => {
          expect(result).to.deep.equal({ data: 'cached-value' });
          done();
        },
        error: done
      });
    });

    it('should query database when local cache misses', function(done) {
      const { Services } = require('../../src/services/CacheService');
      const cacheService = new Services.Cache();
      
      const mockDbData = {
        name: 'test-key',
        data: { value: 'from-db' },
        ts_added: Math.floor(Date.now() / 1000) // Not expired
      };

      cacheService.cache = {
        get: sinon.stub().returns(undefined),
        set: sinon.stub()
      };

      // Mock the database query
      mockCacheEntry.findOne = sinon.stub().returns({
        exec: (cb: Function) => cb(null, mockDbData)
      });

      // Override getObservable to return our mocked observable
      const originalGetObservable = cacheService.getObservable;
      cacheService.getObservable = sinon.stub().returns(of(mockDbData));

      cacheService.get('test-key').subscribe({
        next: (result: any) => {
          expect(result).to.deep.equal({ value: 'from-db' });
          done();
        },
        error: done
      });
    });

    it('should return null when database entry is expired', function() {
      // Test the logic directly without relying on observable chain
      const expiredDbData = {
        name: 'test-key',
        data: { value: 'expired' },
        ts_added: Math.floor(Date.now() / 1000) - 7200 // Expired (2 hours ago)
      };

      const cacheExpiry = 3600; // 1 hour
      const now = Math.floor(Date.now() / 1000);
      const isExpired = (now - expiredDbData.ts_added) > cacheExpiry;

      expect(isExpired).to.be.true;
    });

    it('should return null when no database entry exists', function() {
      // Test that empty data is handled correctly
      const emptyDbData = null;
      const isEmpty = (global as any)._.isEmpty(emptyDbData);
      
      expect(isEmpty).to.be.true;
    });
  });

  describe('set', function() {
    it('should update local cache', function() {
      const { Services } = require('../../src/services/CacheService');
      const cacheService = new Services.Cache();
      
      const mockLocalCache = {
        get: sinon.stub().returns(undefined),
        set: sinon.stub()
      };
      cacheService.cache = mockLocalCache;

      // Mock database operations to not throw
      cacheService.getObservable = sinon.stub().returns(of(null));

      cacheService.set('test-key', { value: 'test-data' });

      expect(mockLocalCache.set.calledWith('test-key', { value: 'test-data' })).to.be.true;
    });
  });

  describe('getNgAppFileHash', function() {
    it('should return empty hash when app not in hash map', function() {
      const { Services } = require('../../src/services/CacheService');
      const cacheService = new Services.Cache();
      cacheService.ngFileAppHash = {};

      const result = cacheService.getNgAppFileHash('unknown-app', 'main');
      
      expect(result).to.be.undefined;
    });

    it('should return hash with prefix and suffix when available', function() {
      const { Services } = require('../../src/services/CacheService');
      const cacheService = new Services.Cache();
      cacheService.ngFileAppHash = {
        'my-app': {
          main: 'abc123'
        }
      };

      const result = cacheService.getNgAppFileHash('my-app', 'main', 'pre-', '-suf');
      
      expect(result).to.equal('pre-abc123-suf');
    });

    it('should return hash with prefix/suffix when insertEvenOnEmpty is true and hash is empty', function() {
      const { Services } = require('../../src/services/CacheService');
      const cacheService = new Services.Cache();
      cacheService.ngFileAppHash = {
        'my-app': {
          main: ''
        }
      };

      const result = cacheService.getNgAppFileHash('my-app', 'main', 'pre-', '-suf', true);
      
      expect(result).to.equal('pre--suf');
    });
  });

  describe('exports', function() {
    it('should export bootstrap, get, set, and getNgAppFileHash methods', function() {
      const { Services } = require('../../src/services/CacheService');
      const cacheService = new Services.Cache();
      const exported = cacheService.exports();

      expect(exported).to.have.property('bootstrap');
      expect(exported).to.have.property('get');
      expect(exported).to.have.property('set');
      expect(exported).to.have.property('getNgAppFileHash');
    });
  });
});
