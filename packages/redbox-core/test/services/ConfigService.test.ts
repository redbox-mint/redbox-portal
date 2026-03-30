let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('ConfigService', function() {
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        auth: {
          defaultBrand: 'default'
        },
        brandingConfigurationDefaults: {
          feature: {
            enabled: true
          }
        },
        brandingAware: sinon.stub()
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        error: sinon.stub()
      }
    });

    setupServiceTestGlobals(mockSails);
    (global as any).AppConfigService = {
      createConfig: sinon.stub().resolves({}),
      createOrUpdateConfig: sinon.stub().resolves({})
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: '1', name: 'default' })
    };
    (global as any).CacheEntry = {};
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).AppConfigService;
    delete (global as any).BrandingService;
    delete (global as any).CacheEntry;
    sinon.restore();
  });

  describe('getBrand', function() {
    it('should return config from brandingAware function when available', function() {
      mockSails.config.brandingAware = sinon.stub().returns({
        feature: { customValue: true }
      });

      const { Services } = require('../../src/services/ConfigService');
      const configService = new Services.Config();

      const result = configService.getBrand('mybrand', 'feature');
      
      expect(result).to.deep.equal({ customValue: true });
      expect(mockSails.config.brandingAware.calledWith('mybrand')).to.be.true;
    });

    it('should fallback to default brand when specific brand config not found', function() {
      mockSails.config.brandingAware = sinon.stub().callsFake((brandName: string) => {
        if (brandName === 'default') {
          return { feature: { defaultValue: true } };
        }
        return {};
      });

      const { Services } = require('../../src/services/ConfigService');
      const configService = new Services.Config();

      const result = configService.getBrand('mybrand', 'feature');
      
      expect(result).to.deep.equal({ defaultValue: true });
    });

    it('should fallback to brandingConfigurationDefaults when no brand-specific config', function() {
      mockSails.config.brandingAware = sinon.stub().returns({});

      const { Services } = require('../../src/services/ConfigService');
      const configService = new Services.Config();

      const result = configService.getBrand('mybrand', 'feature');
      
      expect(result).to.deep.equal({ enabled: true });
    });

    it('should return undefined when no config found anywhere', function() {
      mockSails.config.brandingAware = sinon.stub().returns({});
      mockSails.config.brandingConfigurationDefaults = {};

      const { Services } = require('../../src/services/ConfigService');
      const configService = new Services.Config();

      const result = configService.getBrand('mybrand', 'nonexistent');
      
      expect(result).to.be.undefined;
    });

    it('should handle legacy config structure', function() {
      mockSails.config.brandingAware = sinon.stub().returns({});
      mockSails.config.brandingConfigurationDefaults = {};
      mockSails.config.feature = {
        mybrand: { legacyValue: true },
        default: { defaultLegacy: true }
      };

      const { Services } = require('../../src/services/ConfigService');
      const configService = new Services.Config();

      const result = configService.getBrand('mybrand', 'feature');
      
      expect(result).to.deep.equal({ legacyValue: true });
    });

    it('should fallback to default brand in legacy config', function() {
      mockSails.config.brandingAware = sinon.stub().returns({});
      mockSails.config.brandingConfigurationDefaults = {};
      mockSails.config.feature = {
        default: { defaultLegacy: true }
      };

      const { Services } = require('../../src/services/ConfigService');
      const configService = new Services.Config();

      const result = configService.getBrand('mybrand', 'feature');
      
      expect(result).to.deep.equal({ defaultLegacy: true });
    });
  });

  describe('exports', function() {
    it('should export getBrand and mergeHookConfig methods', function() {
      const { Services } = require('../../src/services/ConfigService');
      const configService = new Services.Config();
      const exported = configService.exports();

      expect(exported).to.have.property('getBrand');
      expect(exported).to.have.property('mergeHookConfig');
      expect(exported.getBrand).to.be.a('function');
      expect(exported.mergeHookConfig).to.be.a('function');
    });
  });
});
