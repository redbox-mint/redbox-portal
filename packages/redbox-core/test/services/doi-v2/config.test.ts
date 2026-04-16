let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { brandingConfigurationDefaults } from '../../../src/config/brandingConfigurationDefaults.config';
import { DoiPublishing } from '../../../src/configmodels/DoiPublishing';
import { resolveDoiPublishingConfig, resolveDoiPublishingConfigAsync } from '../../../src/services/doi-v2/config';
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
    delete (global as any).BrandingService;
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
    const doiPublishing = {
      ...brandingConfigurationDefaults.doiPublishing,
      connection: {
        ...brandingConfigurationDefaults.doiPublishing?.connection,
        password: 'pwd'
      }
    };
    (global as any).sails.config.brandingConfigurationDefaults = {
      doiPublishing
    };
    (global as any).AppConfigService = {
      getAppConfigurationForBrand: sinon.stub().returns({ doiPublishing })
    };

    const config = resolveDoiPublishingConfig({ metaMetadata: { brandId: 'default' }, metadata: {} });

    expect(config).to.not.equal(null);
    expect(config?.enabled).to.equal(true);
    expect(config?.runtime.source).to.equal('appConfig');
    expect(config?.defaultProfile).to.equal('dataPublication');
  });

  it('prefers a fresh DB-backed doiPublishing config over stale cached values', async function () {
    (global as any).sails.config.brandingConfigurationDefaults = {
      doiPublishing: brandingConfigurationDefaults.doiPublishing
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().withArgs('default').returns({ id: 'brand-1', name: 'default' })
    };
    (global as any).AppConfigService = {
      getAppConfigurationForBrand: sinon.stub().returns({
        doiPublishing: {
          ...brandingConfigurationDefaults.doiPublishing,
          connection: {
            ...brandingConfigurationDefaults.doiPublishing?.connection,
            username: 'cached-user',
            password: null
          }
        }
      }),
      loadAppConfigurationModel: sinon.stub().resolves({
        doiPublishing: {
          ...brandingConfigurationDefaults.doiPublishing,
          connection: {
            ...brandingConfigurationDefaults.doiPublishing?.connection,
            username: 'fresh-user',
            password: 'fresh-password'
          }
        }
      })
    };

    const config = await resolveDoiPublishingConfigAsync({ metaMetadata: { brandId: 'default' }, metadata: {} });

    expect(config).to.not.equal(null);
    expect(config?.connection.username).to.equal('fresh-user');
    expect(config?.connection.password).to.equal('fresh-password');
    expect(config?.runtime.source).to.equal('appConfig');
  });
});
