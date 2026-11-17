// Explicit retained Express adapter cases, removed with FM-043.
import { preparePage } from '../../src/http/express/pages';
import { createHttpPolicies } from '../../src/http/express/policies';
import { PageArtifacts } from '../../src/pages/Artifacts';
import { configurationFixtures } from '../helpers/serviceRepositories';
const collaborators: any = {};
import { repositoryFixtures } from '../helpers/repositoryFixtures';
import {createSinonStubLogger} from "../logger.test";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { installRepositoryFixtures, restoreRepositoryFixtures, createDomainFixture } from './testHelper';

describe('TranslationService', function () {
  let fixture: any;
  let TranslationService: any;
  let mockI18nBundle: any;
  let mockI18nextInstance: any;

  beforeEach(function () {
    fixture = createDomainFixture({
      config: {
        appPath: '/app',
        i18n: {
          next: {
            init: {
              fallbackLng: ['en'],
              supportedLngs: ['en', 'de', 'fr'],
              ns: ['translation'],
              defaultNS: 'translation'
            }
          }
        }
      },
      log: createSinonStubLogger(sinon),
    });

    mockI18nBundle = {
      findOne: sinon.stub().resolves(null),
      find: sinon.stub().resolves([])
    };

    mockI18nextInstance = {
      init: sinon.stub().resolves(),
      changeLanguage: sinon.stub().resolves(),
      getFixedT: sinon.stub().returns((key: string) => key),
      languages: ['en'],
      options: {
        supportedLngs: ['en'],
        preload: ['en']
      }
    };

    installRepositoryFixtures();
    repositoryFixtures.I18nBundle = mockI18nBundle;
    collaborators.BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrandNameFromReq: sinon.stub().returns('default'),
      getAvailable: sinon.stub().returns(['default'])
    };

    // Mock i18next module
    const i18next = require('i18next');
    if (i18next.createInstance.restore) {
      i18next.createInstance.restore();
    }
    sinon.stub(i18next, 'createInstance').returns(mockI18nextInstance);

    // Import after mocks are set up
    const { Services } = require('../../src/services/TranslationService');
    TranslationService = new Services.Translation({ repository: configurationFixtures(), log: fixture.log, config: fixture.config, getBrand: name => collaborators.BrandingService.getBrand(name), availableBrands: () => collaborators.BrandingService.getAvailable() });
  });

  afterEach(function () {
    restoreRepositoryFixtures();
    delete repositoryFixtures.I18nBundle;
    delete collaborators.BrandingService;
    const i18next = require('i18next');
    if (i18next.createInstance.restore) {
      i18next.createInstance.restore();
    }
    sinon.restore();
  });

  async function prepareLanguage(req: any, res: any, next: sinon.SinonStub) {
    res.set = sinon.stub().returns(res);
    req.query = { lng: req.param('lng') };
    req.originalUrl = '/default/rdmp'; req.path = req.originalUrl;
    req.params.portal = 'rdmp';
    const policies = createHttpPolicies({ branding: { getBrand: async name => collaborators.BrandingService.getBrand(name) }, portals: ['rdmp'], pathRules: {} as any, authenticate: async () => false, defaultUnauthenticatedRole: () => undefined, emitRequestFailure: async () => {} });
    await policies.brandingandportal(req, res, error => { if (error) throw error; });
    const page = await preparePage(req, res, {
      settings: async () => ({}), languages: async brand => (await TranslationService.getAvailableLanguagesForBranding(brand)).map(code => ({ code, displayName: code })),
      translate: (brand, language, key) => TranslationService.t(key, undefined, language, brand),
      csrf: { generateToken: () => 'fixture-csrf' }, rootContext: '', origin: 'http://localhost', templateConfig: {}, typeface: () => null,
      artifacts: new PageArtifacts(['/tmp'], ['/tmp']), log: fixture.log,
    } as any);
    req.options.locals = page.locals;
    next();
  }

  describe('handle', function () {
    it('should set language in session and locals', async function () {
      const req = {
        param: sinon.stub().returns(null),
        session: {},
        options: { locals: {} },
        params: { branding: 'default' }
      };
      const res = {
        cookie: sinon.stub()
      };
      const next = sinon.stub();

      // Set up a mock i18next instance
      TranslationService.i18nextInstances = {
        'brand-1': {
          getFixedT: sinon.stub().returns((key: string) => key)
        }
      };

      await prepareLanguage(req, res, next);

      expect(req.session).to.have.property('langCode');
      expect(req.options.locals).to.have.property('lang');
      expect(req.options.locals.lang).to.equal(req.session.langCode);
      expect(next.calledOnce).to.be.true;
    });

    it('should use session language when param not provided', async function () {
      const req: any = {
        param: sinon.stub().returns(null),
        session: { langCode: 'de' },
        options: { locals: {} },
        params: { branding: 'default' }
      };
      const res = {
        cookie: sinon.stub()
      };
      const next = sinon.stub();

      TranslationService.i18nextInstances = {
        'brand-1': {
          getFixedT: sinon.stub().returns((key: string) => key)
        }
      };

      await prepareLanguage(req, res, next);

      expect(req.session.langCode).to.equal('de');
    });

    it('should fall back to default for unsupported language', async function () {
      const req: any = {
        param: sinon.stub().returns('xx'), // Unsupported language
        session: {},
        options: { locals: {} },
        params: { branding: 'default' }
      };
      const res = {
        cookie: sinon.stub()
      };
      const next = sinon.stub();

      TranslationService.i18nextInstances = {
        'brand-1': {
          getFixedT: sinon.stub().returns((key: string) => key)
        }
      };

      await prepareLanguage(req, res, next);

      expect(req.session.langCode).to.equal('en'); // Default language
    });
  });

});
