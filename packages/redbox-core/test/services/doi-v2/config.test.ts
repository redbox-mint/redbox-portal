let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { brandingConfigurationDefaults } from '../../../src/config/brandingConfigurationDefaults.config';
import { DoiPublishing } from '../../../src/configmodels/DoiPublishing';
import { resolveDoiPublishingConfig } from '../../../src/services/doi-v2/config';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from '../testHelper';

describe('doi-v2 config', function () {
  beforeEach(function () {
    setupServiceTestGlobals(createMockSails({
      config: {
        appPath: '/app',
        environment: 'development'
      }
    }));
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).AppConfigService;
    sinon.restore();
  });

  it('returns null when doiPublishing is disabled', function () {
    (global as any).AppConfigService = {
      getAppConfigurationForBrand: sinon.stub().returns({ doiPublishing: new DoiPublishing() })
    };

    const config = resolveDoiPublishingConfig({ metaMetadata: { brandId: 'default' }, metadata: {} });

    expect(config).to.equal(null);
  });

  it('treats the branding default doiPublishing config as the runtime baseline', function () {
    (global as any).sails.config.brandingConfigurationDefaults = {
      doiPublishing: brandingConfigurationDefaults.doiPublishing
    };
    (global as any).AppConfigService = {
      getAppConfigurationForBrand: sinon.stub().returns({ doiPublishing: brandingConfigurationDefaults.doiPublishing })
    };

    const config = resolveDoiPublishingConfig({ metaMetadata: { brandId: 'default' }, metadata: {} });

    expect(config).to.not.equal(null);
    expect(config?.enabled).to.equal(true);
    expect(config?.runtime.source).to.equal('appConfig');
    expect(config?.defaultProfile).to.equal('dataPublication');
  });
});
