let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createQueryObject } from './testHelper';

describe('I18nEntriesService', function() {
  let mockSails: any;
  let I18nEntriesService: any;
  let mockI18nTranslation: any;
  let mockI18nBundle: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/tmp/test-app',
        i18n: {
          next: {
            init: {
              supportedLngs: ['en', 'fr'],
              ns: ['translation']
            }
          }
        }
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      }
    });

    mockI18nTranslation = {
      findOne: sinon.stub().resolves(null),
      find: sinon.stub().returns({
        sort: sinon.stub().resolves([])
      }),
      create: sinon.stub().resolves({ id: 'new-id' }),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves({}) }),
      destroyOne: sinon.stub().resolves({})
    };

    mockI18nBundle = {
      findOne: sinon.stub().resolves(null),
      find: sinon.stub().resolves([]),
      create: sinon.stub().resolves({ id: 'new-bundle' }),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves({}) })
    };

    setupServiceTestGlobals(mockSails);
    (global as any).I18nTranslation = mockI18nTranslation;
    (global as any).I18nBundle = mockI18nBundle;
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1' }),
      getBrandById: sinon.stub().returns({ id: 'brand-1' })
    };
    (global as any).TranslationService = {
      reloadResources: sinon.stub()
    };

    const { Services } = require('../../src/services/I18nEntriesService');
    I18nEntriesService = new Services.I18nEntries();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).I18nTranslation;
    delete (global as any).I18nBundle;
    delete (global as any).BrandingService;
    delete (global as any).TranslationService;
    sinon.restore();
  });

  describe('resolveBrandingId (private)', function() {
    it('should resolve branding id from object', function() {
      const result = I18nEntriesService.resolveBrandingId({ id: 'brand-1' });
      expect(result).to.equal('brand-1');
    });

    it('should resolve branding id from string', function() {
      const result = I18nEntriesService.resolveBrandingId('brand-2');
      expect(result).to.equal('brand-2');
    });

    it('should return global for null/undefined', function() {
      expect(I18nEntriesService.resolveBrandingId(null)).to.equal('global');
      expect(I18nEntriesService.resolveBrandingId(undefined)).to.equal('global');
    });
  });

  describe('buildUid (private)', function() {
    it('should build correct uid', function() {
      const result = I18nEntriesService.buildUid({ id: 'brand-1' }, 'en', 'common', 'welcome');
      expect(result).to.equal('brand-1:en:common:welcome');
    });

    it('should default namespace to translation', function() {
      const result = I18nEntriesService.buildUid({ id: 'brand-1' }, 'en', null, 'welcome');
      expect(result).to.equal('brand-1:en:translation:welcome');
    });
  });

  describe('flatten (private)', function() {
    it('should flatten nested object', function() {
      const obj = {
        a: {
          b: {
            c: 'value'
          },
          d: 'value2'
        },
        e: 'value3'
      };
      const result = I18nEntriesService.flatten(obj);
      expect(result).to.deep.equal({
        'a.b.c': 'value',
        'a.d': 'value2',
        'e': 'value3'
      });
    });
  });

  describe('unflatten (private)', function() {
    it('should unflatten object', function() {
      const flat = {
        'a.b.c': 'value',
        'a.d': 'value2',
        'e': 'value3'
      };
      const result = I18nEntriesService.unflatten(flat);
      expect(result).to.deep.equal({
        a: {
          b: { c: 'value' },
          d: 'value2'
        },
        e: 'value3'
      });
    });
  });

  describe('setNested (private)', function() {
    it('should set nested property', function() {
      const obj = {};
      I18nEntriesService.setNested(obj, 'a.b.c', 'value');
      expect(obj).to.deep.equal({ a: { b: { c: 'value' } } });
    });
  });

  describe('removeNested (private)', function() {
    it('should remove nested property', function() {
      const obj = { a: { b: { c: 'value', d: 'keep' } } };
      I18nEntriesService.removeNested(obj, 'a.b.c');
      expect(obj).to.deep.equal({ a: { b: { d: 'keep' } } });
    });
  });

  describe('getEntry', function() {
    it('should call findOne with correct uid', async function() {
      await I18nEntriesService.getEntry('brand-1', 'en', 'ns', 'key');
      expect(mockI18nTranslation.findOne.calledWith({ uid: 'brand-1:en:ns:key' })).to.be.true;
    });
  });

  describe('setEntry', function() {
    it('should create new entry if not exists', async function() {
      mockI18nTranslation.findOne.resolves(null);
      mockI18nTranslation.create.resolves({ id: 'new-id' });
      // mock getBundle to return null so it creates a bundle too
      mockI18nBundle.findOne.resolves(null);
      
      await I18nEntriesService.setEntry('brand-1', 'en', 'ns', 'key', 'value');
      
      expect(mockI18nTranslation.create.called).to.be.true;
      expect(mockI18nBundle.create.called).to.be.true;
    });

    it('should update existing entry', async function() {
      mockI18nTranslation.findOne.resolves({ id: 'existing-id' });
      mockI18nBundle.findOne.resolves({ id: 'bundle-1', data: {} });
      
      await I18nEntriesService.setEntry('brand-1', 'en', 'ns', 'key', 'value');
      
      expect(mockI18nTranslation.updateOne.calledWith({ id: 'existing-id' })).to.be.true;
      expect(mockI18nBundle.updateOne.calledWith({ id: 'bundle-1' })).to.be.true;
    });
  });

  describe('deleteEntry', function() {
    it('should destroy entry and update bundle', async function() {
      mockI18nTranslation.destroyOne.resolves({ id: 'deleted' });
      mockI18nBundle.findOne.resolves({ id: 'bundle-1', data: { key: 'value' } });
      
      await I18nEntriesService.deleteEntry('brand-1', 'en', 'ns', 'key');
      
      expect(mockI18nTranslation.destroyOne.called).to.be.true;
      expect(mockI18nBundle.updateOne.called).to.be.true;
    });
  });

  describe('listEntries', function() {
    it('should find entries with correct query', async function() {
      await I18nEntriesService.listEntries('brand-1', 'en', 'ns');
      expect(mockI18nTranslation.find.called).to.be.true;
      const args = mockI18nTranslation.find.firstCall.args[0];
      expect(args.where).to.deep.include({ branding: 'brand-1', locale: 'en', namespace: 'ns' });
    });

    it('should add prefix filter if provided', async function() {
      await I18nEntriesService.listEntries('brand-1', 'en', 'ns', 'prefix');
      const args = mockI18nTranslation.find.firstCall.args[0];
      expect(args.where.key).to.have.property('startsWith', 'prefix');
    });
  });

  describe('getBundle', function() {
    it('should find bundle by uid', async function() {
      await I18nEntriesService.getBundle('brand-1', 'en', 'ns');
      expect(mockI18nBundle.findOne.calledWith({ uid: 'brand-1:en:ns' })).to.be.true;
    });
  });

  describe('listBundles', function() {
    it('should find bundles by branding', async function() {
      await I18nEntriesService.listBundles('brand-1');
      expect(mockI18nBundle.find.calledWith({ branding: 'brand-1' })).to.be.true;
    });
  });

  describe('setBundle', function() {
    it('should create bundle if not exists', async function() {
      mockI18nBundle.findOne.resolves(null);
      sinon.stub(I18nEntriesService, 'getLanguageDisplayName').resolves('English');
      sinon.stub(I18nEntriesService, 'syncEntriesFromBundle').resolves();
      
      await I18nEntriesService.setBundle('brand-1', 'en', 'ns', { key: 'val' });
      
      expect(mockI18nBundle.create.called).to.be.true;
      expect(I18nEntriesService.syncEntriesFromBundle.called).to.be.true;
    });

    it('should update bundle if exists', async function() {
      mockI18nBundle.findOne.resolves({ id: 'bundle-1' });
      sinon.stub(I18nEntriesService, 'getLanguageDisplayName').resolves('English');
      sinon.stub(I18nEntriesService, 'syncEntriesFromBundle').resolves();
      
      await I18nEntriesService.setBundle('brand-1', 'en', 'ns', { key: 'val' });
      
      expect(mockI18nBundle.updateOne.calledWith({ id: 'bundle-1' })).to.be.true;
    });
  });

  describe('updateBundleEnabled', function() {
    it('should update enabled status', async function() {
      mockI18nBundle.updateOne.returns({ set: sinon.stub().resolves({ id: 'bundle-1' }) });
      
      await I18nEntriesService.updateBundleEnabled('brand-1', 'en', 'ns', true);
      
      expect(mockI18nBundle.updateOne.called).to.be.true;
    });

    it('should throw if bundle not found', async function() {
      mockI18nBundle.updateOne.returns({ set: sinon.stub().resolves(null) });
      
      try {
        await I18nEntriesService.updateBundleEnabled('brand-1', 'en', 'ns', true);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).to.exist;
      }
    });
  });

  describe('composeNamespace', function() {
    it('should compose namespace from entries', function() {
      const entries = [
        { key: 'a.b', value: 'v1' },
        { key: 'c', value: 'v2' }
      ];
      const result = I18nEntriesService.composeNamespace(entries);
      expect(result).to.deep.equal({ a: { b: 'v1' }, c: 'v2' });
    });
  });

  describe('syncEntriesFromBundle', function() {
    it('should sync entries', async function() {
      const bundle = { 
        id: 'bundle-1', 
        branding: 'brand-1', 
        locale: 'en', 
        namespace: 'ns',
        data: { key: 'value' } 
      };
      
      sinon.stub(I18nEntriesService, 'loadCentralizedMeta').resolves({});
      mockI18nTranslation.find.returns({
        sort: sinon.stub().resolves([])
      });
      // Actually find in syncEntriesFromBundle is simple find?
      // const existingEntries = await I18nTranslation.find({ branding: brandingId, locale, namespace });
      // It returns a promise. My mockI18nTranslation.find default returns { sort: ... }
      // If the code awaits it, it gets the object with sort.
      // But map() expects array.
      
      // I need to check how find is used in syncEntriesFromBundle.
      // line 423: const existingEntries = await I18nTranslation.find({ branding: brandingId, locale, namespace });
      // It DOES NOT chain sort here.
      // So await returns the mock return value.
      // If mock returns { sort: ... }, then existingEntries is { sort: ... }.
      // Then existingEntries.map(...) fails.
      
      // I need to handle this.
      // If I want find to be flexible, I can make it return a thenable that also has sort?
      // Or I can stub it specifically for this test.
      
      mockI18nTranslation.find.resolves([]);
      
      mockI18nTranslation.findOne.resolves(null); // no existing key
      mockI18nTranslation.create.resolves({});
      
      await I18nEntriesService.syncEntriesFromBundle(bundle);
      
      expect(mockI18nTranslation.create.called).to.be.true;
    });
  });
});
