let expect: Chai.ExpectStatic;
import * as sinon from 'sinon';
import { brandingConfigurationDefaults } from '../../../src/config/brandingConfigurationDefaults.config';
import { DoiPublishing } from '../../../src/configmodels/DoiPublishing';
import { resolveDoiPublishingConfig, resolveDoiPublishingConfigAsync, resolveDoiPublishingConfigForBrand } from '../../../src/services/doi-v2/config';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from '../testHelper';

describe('doi-v2 config', function () {
  let originalEnv: NodeJS.ProcessEnv;

  before(async function () {
    ({ expect } = await import('chai'));
  });

  beforeEach(function () {
    originalEnv = { ...process.env };
    const mockSails = createMockSails({
      config: {
        appPath: '/app',
        environment: 'development',
        brandingAware: sinon.stub().returns({ doiPublishing: null }),
      }
    });
    setupServiceTestGlobals(mockSails);
    (global as any).BrandingService = {
      getBrandById: sinon.stub().returns({ id: 'brand-1', name: 'default' })
    };
  });

  afterEach(function () {
    process.env = originalEnv;
    cleanupServiceTestGlobals();
    delete (global as any).BrandingService;
    sinon.restore();
  });

  it('returns null when doiPublishing is disabled', function () {
    ((global as any).sails.config.brandingAware as sinon.SinonStub).returns({ doiPublishing: new DoiPublishing() });

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
    ((global as any).sails.config.brandingAware as sinon.SinonStub).withArgs('default').returns({ doiPublishing });

    const config = resolveDoiPublishingConfig({ metaMetadata: { brandId: 'default' }, metadata: {} });

    expect(config).to.not.equal(null);
    expect(config?.enabled).to.equal(true);
    expect(config?.defaultProfile).to.equal('dataPublication');
    expect(config?.connection.password).to.equal('pwd');
  });

  it('async resolution reuses the branding-aware runtime config', async function () {
    const doiPublishing = {
      ...brandingConfigurationDefaults.doiPublishing,
      connection: {
        ...brandingConfigurationDefaults.doiPublishing?.connection,
        username: 'runtime-user',
        password: 'runtime-password'
      }
    };
    ((global as any).sails.config.brandingAware as sinon.SinonStub).withArgs('default').returns({ doiPublishing });

    const config = await resolveDoiPublishingConfigAsync({ metaMetadata: { brandId: 'default' }, metadata: {} });

    expect(config).to.not.equal(null);
    expect(config?.connection.username).to.equal('runtime-user');
    expect(config?.connection.password).to.equal('runtime-password');
  });

  it('resolves an empty stored password from fallback environment variables', function () {
    const doiPublishing = {
      ...brandingConfigurationDefaults.doiPublishing,
      connection: {
        ...brandingConfigurationDefaults.doiPublishing?.connection,
        password: ''
      }
    };
    process.env.DOI_CONNECTION_PASSWORD = 'env-password';
    ((global as any).sails.config.brandingAware as sinon.SinonStub).withArgs('default').returns({ doiPublishing });

    const config = resolveDoiPublishingConfig({ metaMetadata: { brandId: 'default' }, metadata: {} });

    expect(config?.connection.password).to.equal('env-password');
  });

  it('resolves doiPublishing config directly from a provided brand', function () {
    const doiPublishing = {
      ...brandingConfigurationDefaults.doiPublishing,
      connection: {
        ...brandingConfigurationDefaults.doiPublishing?.connection,
        username: 'brand-user',
        password: 'brand-password'
      }
    };
    ((global as any).sails.config.brandingAware as sinon.SinonStub).withArgs('default').returns({ doiPublishing });

    const config = resolveDoiPublishingConfigForBrand({ id: 'brand-1', name: 'default' } as any);

    expect(config).to.not.equal(null);
    expect(config?.connection.username).to.equal('brand-user');
    expect(config?.connection.password).to.equal('brand-password');
  });
});
