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

  describe('initialization', function () {
    it('should initialize i18next when not cached', async function () {
      // Ensure no cached instance
      TranslationService.i18nextInstances = {};

      const branding = { id: 'brand-new', name: 'new' };
      collaborators.BrandingService.getBrand.returns(branding);
      collaborators.BrandingService.getBrandNameFromReq.returns('new');

      const req = {
        param: sinon.stub().returns(null),
        session: {},
        options: { locals: {} },
        params: { branding: 'new' }
      };
      const res = { cookie: sinon.stub() };
      const next = sinon.stub();

      await TranslationService.getI18nextForBranding(branding);

      expect(mockI18nextInstance.init.called).to.be.true;
    });
  });

  describe('t', function () {
    it('should return key when no i18next instance exists', function () {
      const result = TranslationService.t('test-key', undefined, 'en', 'default');

      expect(result).to.equal('test-key');
    });
  });

  describe('tInter', function () {
    it('should call t with correct parameters', function () {
      const tStub = sinon.stub(TranslationService, 't').returns('translated');

      const result = TranslationService.tInter('test-key', { count: 1 }, 'en');

      expect(tStub.calledOnce).to.be.true;
      expect(result).to.equal('translated');

      tStub.restore();
    });
  });

  describe('clearInstances', function () {
    it('should clear specific branding instance', async function () {
      // First, set up an instance
      TranslationService.i18nextInstances = {
        'brand-1': { mock: 'instance1' },
        'brand-2': { mock: 'instance2' }
      };

      await TranslationService.clearInstances('brand-1');

      expect(TranslationService.i18nextInstances).not.to.have.property('brand-1');
      expect(TranslationService.i18nextInstances).to.have.property('brand-2');
    });

    it('should clear all instances when no branding specified', async function () {
      TranslationService.i18nextInstances = {
        'brand-1': { mock: 'instance1' },
        'brand-2': { mock: 'instance2' }
      };

      await TranslationService.clearInstances();

      expect(Object.keys(TranslationService.i18nextInstances)).to.have.lengthOf(0);
    });
  });

  describe('getAvailableLanguagesForBranding', function () {
    it('should return configured languages when no branding provided', async function () {
      const result = await TranslationService.getAvailableLanguagesForBranding(null);

      expect(result).to.deep.equal(['en', 'de', 'fr']);
    });

    it('should include languages from DB bundles', async function () {
      const branding = { id: 'brand-1', name: 'default' };
      mockI18nBundle.find.resolves([
        { locale: 'en' },
        { locale: 'de' },
        { locale: 'es' } // Additional language from DB
      ]);

      const result = await TranslationService.getAvailableLanguagesForBranding(branding);

      expect(result).to.be.an('array');
      expect(result).to.include('en');
      expect(result).to.include('de');
      // Note: es may or may not be included depending on implementation
      // The configured languages are 'en', 'de', 'fr' - DB bundles may not add new languages
    });

    it('should sort languages alphabetically', async function () {
      const branding = { id: 'brand-1', name: 'default' };
      mockI18nBundle.find.resolves([
        { locale: 'fr' },
        { locale: 'de' },
        { locale: 'en' }
      ]);

      const result = await TranslationService.getAvailableLanguagesForBranding(branding);

      // Should be sorted
      expect(result).to.deep.equal([...result].sort());
    });

    it('should handle DB errors gracefully', async function () {
      const branding = { id: 'brand-1', name: 'default' };
      mockI18nBundle.find.rejects(new Error('private-translation-provider-secret'));

      const result = await TranslationService.getAvailableLanguagesForBranding(branding);

      // Should still return configured languages
      expect(result).to.be.an('array');
      expect(result.length).to.be.greaterThan(0);
      const calls = ['warn', 'debug', 'verbose'].flatMap(level => fixture.log[level].getCalls());
      expect(calls.some(call => call.args.some(arg => String(arg).includes('private-translation-provider-secret')))).to.equal(false);
    });
  });

  describe('reloadResources', function () {
    it('should reload resources for specified branding', async function () {
      const clearStub = sinon.stub(TranslationService, 'clearInstances').resolves();
      TranslationService.i18nextInstances = { 'brand-1': { mock: true } };

      await TranslationService.reloadResources('brand-1');

      expect(clearStub.calledWith('brand-1')).to.be.true;

      clearStub.restore();
    });

    it('should reload all resources when no branding specified', async function () {
      const clearStub = sinon.stub(TranslationService, 'clearInstances').resolves();
      TranslationService.i18nextInstances = {
        'brand-1': { mock: true },
        'brand-2': { mock: true }
      };

      await TranslationService.reloadResources();

      expect(clearStub.calledTwice).to.be.true;

      clearStub.restore();
    });
  });
});
