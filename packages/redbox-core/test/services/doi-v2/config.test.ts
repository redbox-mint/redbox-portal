let expect: Chai.ExpectStatic;
import * as sinon from 'sinon';
import { brandingConfigurationDefaults } from '../../../src/config/brandingConfigurationDefaults.config';
import { DoiPublishing } from '../../../src/configmodels/DoiPublishing';
import { resolveDoiPublishingConfig, resolveDoiPublishingConfigAsync, resolveDoiPublishingConfigForBrand } from '../../../src/integrations/doi/config';
import type { DoiConfigurationInput } from '../../../src/integrations/doi/config';

describe('doi-v2 config', function () {
  let input: DoiConfigurationInput;
  let configuration: sinon.SinonStub;
  let originalEnv: NodeJS.ProcessEnv;

  before(async function () {
    ({ expect } = await import('chai'));
  });

  beforeEach(function () {
    originalEnv = { ...process.env };
    configuration = sinon.stub().returns({ doiPublishing: null });
    input = { configuration: name => configuration(name).doiPublishing,
      brandById: sinon.stub().returns({ id: 'brand-1', name: 'default' }), env: process.env };

  });

  afterEach(function () {
    process.env = originalEnv;
    sinon.restore();
  });

  it('returns null when doiPublishing is disabled', function () {
    configuration.returns({ doiPublishing: new DoiPublishing() });

    const config = resolveDoiPublishingConfig(input, { metaMetadata: { brandId: 'default' }, metadata: {} });

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
    configuration.withArgs('default').returns({ doiPublishing });

    const config = resolveDoiPublishingConfig(input, { metaMetadata: { brandId: 'default' }, metadata: {} });

    expect(config).to.not.equal(null);
    expect(config?.enabled).to.equal(true);
    expect(config?.defaultProfile).to.equal('');
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
    configuration.withArgs('default').returns({ doiPublishing });

    const config = await resolveDoiPublishingConfigAsync(input, { metaMetadata: { brandId: 'default' }, metadata: {} });

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
    configuration.withArgs('default').returns({ doiPublishing });

    const config = resolveDoiPublishingConfig(input, { metaMetadata: { brandId: 'default' }, metadata: {} });

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
    configuration.withArgs('default').returns({ doiPublishing });

    const config = resolveDoiPublishingConfigForBrand(input, { id: 'brand-1', name: 'default' } as any);

    expect(config).to.not.equal(null);
    expect(config?.connection.username).to.equal('brand-user');
    expect(config?.connection.password).to.equal('brand-password');
  });
});
