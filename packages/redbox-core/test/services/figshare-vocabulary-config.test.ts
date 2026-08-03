import * as sinon from 'sinon';
import { createRequire } from 'node:module';

const testRequire = createRequire(import.meta.url);
const { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } = testRequire('./testHelper');
const { resolveFigshareVocabularyConfig } = testRequire('../../src/services/figshare-v2/config');
const { createBindingContext, resolveBrandId } = testRequire('../../src/services/figshare-v2/context');

let expect!: Chai.ExpectStatic;

describe('figshare-v2 vocabulary configuration', function () {
  let ServiceExports: typeof import('../../src/services').ServiceExports;
  let appConfigStub: sinon.SinonStub;

  before(async function () {
    ({ expect } = await import('chai'));
  });

  /** Only the vocabulary workflow reads this config, so `enabled` is deliberately left off. */
  function brandConfig(overrides: Record<string, unknown> = {}) {
    return {
      figsharePublishing: {
        connection: { baseUrl: 'https://api.figshare.com', token: 'plain-token' },
        ...overrides,
      },
    };
  }

  beforeEach(function () {
    const mockSails = createMockSails();
    mockSails.config.figshareDev = { enabled: false, mode: 'live' };
    setupServiceTestGlobals(mockSails);
    ({ ServiceExports } = testRequire('../../src/services'));

    appConfigStub = sinon.stub().callsFake((brand: string) => (brand === 'unknown-brand' ? undefined : brandConfig()));
    sinon.stub(ServiceExports, 'AppConfigService').get(() => ({ getAppConfigurationForBrand: appConfigStub }));
  });

  afterEach(function () {
    sinon.restore();
    cleanupServiceTestGlobals();
    delete (global as any).BrandingService;
  });

  describe('resolveFigshareVocabularyConfig', function () {
    it('resolves the brand connection without requiring publishing to be enabled', function () {
      const config = resolveFigshareVocabularyConfig('default');

      expect(config).to.not.equal(null);
      expect(config.enabled).to.equal(false);
      expect(config.connection.baseUrl).to.equal('https://api.figshare.com');
      expect(config.connection.token).to.equal('plain-token');
      expect(config.runtime).to.deep.equal({ mode: 'live', fixtures: undefined });
    });

    it('falls back to the default brand configuration for an unknown brand', function () {
      const config = resolveFigshareVocabularyConfig('unknown-brand');

      expect(appConfigStub.secondCall.args[0]).to.equal('default');
      expect(config.connection.baseUrl).to.equal('https://api.figshare.com');
    });

    it('returns null when the brand has no figsharePublishing block', function () {
      appConfigStub.returns({});

      expect(resolveFigshareVocabularyConfig('default')).to.equal(null);
    });

    it('returns null when figsharePublishing is not an object', function () {
      appConfigStub.returns({ figsharePublishing: 'nope' });

      expect(resolveFigshareVocabularyConfig('default')).to.equal(null);
    });

    it('returns null when no app config service is available', function () {
      sinon.restore();
      sinon.stub(ServiceExports, 'AppConfigService').get(() => undefined);

      expect(resolveFigshareVocabularyConfig('default')).to.equal(null);
    });

    it('leaves the token empty rather than throwing when none is configured', function () {
      appConfigStub.returns(brandConfig({ connection: { baseUrl: 'https://api.figshare.com', token: '' } }));

      const config = resolveFigshareVocabularyConfig('default');

      expect(config.connection.token).to.equal('');
    });

    it('substitutes a defaulted connection when the brand supplies none', function () {
      appConfigStub.returns({ figsharePublishing: { article: { itemType: 'dataset' } } });

      const config = resolveFigshareVocabularyConfig('default');

      expect(config.connection).to.be.an('object');
      expect(config.connection.token).to.equal('');
    });

    it('resolves an environment-variable token reference', function () {
      process.env.FIGSHARE_TEST_TOKEN = 'from-env';
      appConfigStub.returns(
        brandConfig({ connection: { baseUrl: 'https://api.figshare.com', token: '$FIGSHARE_TEST_TOKEN' } })
      );

      try {
        expect(resolveFigshareVocabularyConfig('default').connection.token).to.equal('from-env');
      } finally {
        delete process.env.FIGSHARE_TEST_TOKEN;
      }
    });

    it('tolerates an unset environment-variable token reference', function () {
      delete process.env.FIGSHARE_MISSING_TOKEN;
      appConfigStub.returns(
        brandConfig({ connection: { baseUrl: 'https://api.figshare.com', token: '$FIGSHARE_MISSING_TOKEN' } })
      );

      expect(resolveFigshareVocabularyConfig('default').connection.token).to.equal('');
    });

    it('switches to the fixture runtime when figshareDev is in fixture mode', function () {
      (global as any).sails.config.figshareDev = {
        enabled: true,
        mode: 'fixture',
        fixtures: { categories: [{ id: 1 }] },
      };

      const config = resolveFigshareVocabularyConfig('default');

      expect(config.runtime.mode).to.equal('fixture');
      expect(config.runtime.fixtures).to.deep.equal({ categories: [{ id: 1 }] });
    });

    it('never uses the fixture runtime in production', function () {
      (global as any).sails.config.environment = 'production';
      (global as any).sails.config.figshareDev = { enabled: true, mode: 'fixture', fixtures: { categories: [] } };

      const config = resolveFigshareVocabularyConfig('default');

      expect(config.runtime.mode).to.equal('live');
      expect(config.runtime.fixtures).to.equal(undefined);
    });

    it('treats a missing figshareDev block as live', function () {
      delete (global as any).sails.config.figshareDev;

      expect(resolveFigshareVocabularyConfig('default').runtime.mode).to.equal('live');
    });
  });

  describe('resolveBrandId', function () {
    it('returns an empty string when the record carries no brand', function () {
      expect(resolveBrandId({})).to.equal('');
      expect(resolveBrandId({ metaMetadata: { brandId: '   ' } })).to.equal('');
    });

    it('returns the raw value when BrandingService is unavailable', function () {
      expect(resolveBrandId({ metaMetadata: { brandId: 'brand-1' } })).to.equal('brand-1');
    });

    it('keeps a value that already resolves as a brand id', function () {
      (global as any).BrandingService = {
        getBrandById: sinon.stub().withArgs('brand-1').returns({ id: 'brand-1' }),
        getBrand: sinon.stub().returns(undefined),
      };

      expect(resolveBrandId({ metaMetadata: { brandId: 'brand-1' } })).to.equal('brand-1');
    });

    it('translates a brand name to its id', function () {
      (global as any).BrandingService = {
        getBrandById: sinon.stub().returns(undefined),
        getBrand: sinon.stub().returns({ id: 'brand-1' }),
      };

      expect(resolveBrandId({ metaMetadata: { brandId: 'default' } })).to.equal('brand-1');
    });

    it('falls back to the branding field and returns the raw value for an unknown brand', function () {
      (global as any).BrandingService = {
        getBrandById: sinon.stub().returns(undefined),
        getBrand: sinon.stub().returns(undefined),
      };

      expect(resolveBrandId({ branding: 'ghost' })).to.equal('ghost');
    });
  });

  describe('createBindingContext', function () {
    it('carries the resolved brand alongside the record', function () {
      const record = { metaMetadata: { brandId: 'brand-1' }, metadata: { title: 'A' } };

      const context = createBindingContext(record);

      expect(context.brandId).to.equal('brand-1');
      expect(context.record).to.equal(record);
    });
  });
});
