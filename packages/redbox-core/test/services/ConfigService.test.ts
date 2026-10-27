import {createSinonStubLogger} from "../logger.test";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { createDomainFixture } from './testHelper';
import { resolveBrandConfiguration } from '../../src/configuration/brand';
const createFixture = createDomainFixture;
function configuration(config: any) { return { getBrand: (brand: string, block: string) => resolveBrandConfiguration(brand, block, { defaultBrand: config.auth.defaultBrand, readBrand: name => config.brandingAware(name), defaults: config.brandingConfigurationDefaults, legacy: config }) }; }

describe('ConfigService', function() {
  let domainFixture: any;

  beforeEach(function() {
    domainFixture = createFixture({
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
      log: createSinonStubLogger(sinon),
    });


  });

  afterEach(function() {
    sinon.restore();
  });

  describe('getBrand', function() {
    it('should return config from brandingAware function when available', function() {
      domainFixture.config.brandingAware = sinon.stub().returns({
        feature: { customValue: true }
      });

      const configService = configuration(domainFixture.config);

      const result = configService.getBrand('mybrand', 'feature');

      expect(result).to.deep.equal({ customValue: true });
      expect(domainFixture.config.brandingAware.calledWith('mybrand')).to.be.true;
    });

    it('should fallback to default brand when specific brand config not found', function() {
      domainFixture.config.brandingAware = sinon.stub().callsFake((brandName: string) => {
        if (brandName === 'default') {
          return { feature: { defaultValue: true } };
        }
        return {};
      });

      const configService = configuration(domainFixture.config);

      const result = configService.getBrand('mybrand', 'feature');

      expect(result).to.deep.equal({ defaultValue: true });
    });

    it('should fallback to brandingConfigurationDefaults when no brand-specific config', function() {
      domainFixture.config.brandingAware = sinon.stub().returns({});

      const configService = configuration(domainFixture.config);

      const result = configService.getBrand('mybrand', 'feature');

      expect(result).to.deep.equal({ enabled: true });
    });

    it('should return undefined when no config found anywhere', function() {
      domainFixture.config.brandingAware = sinon.stub().returns({});
      domainFixture.config.brandingConfigurationDefaults = {};

      const configService = configuration(domainFixture.config);

      const result = configService.getBrand('mybrand', 'nonexistent');

      expect(result).to.be.undefined;
    });

    it('should handle legacy config structure', function() {
      domainFixture.config.brandingAware = sinon.stub().returns({});
      domainFixture.config.brandingConfigurationDefaults = {};
      domainFixture.config.feature = {
        mybrand: { legacyValue: true },
        default: { defaultLegacy: true }
      };

      const configService = configuration(domainFixture.config);

      const result = configService.getBrand('mybrand', 'feature');

      expect(result).to.deep.equal({ legacyValue: true });
    });

    it('should fallback to default brand in legacy config', function() {
      domainFixture.config.brandingAware = sinon.stub().returns({});
      domainFixture.config.brandingConfigurationDefaults = {};
      domainFixture.config.feature = {
        default: { defaultLegacy: true }
      };

      const configService = configuration(domainFixture.config);

      const result = configService.getBrand('mybrand', 'feature');

      expect(result).to.deep.equal({ defaultLegacy: true });
    });
  });

  describe('public configuration boundary', function() {
    it('exports the pure resolver and omits the retired imperative hook merger', function() {
      expect(resolveBrandConfiguration).to.be.a('function');
      const publicApi = require('../../src/configuration');
      expect(publicApi).not.to.have.property('mergeHookConfig');
      expect(publicApi).not.to.have.property('ServiceExports');
    });
  });
});
