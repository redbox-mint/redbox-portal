import { createSinonStubLogger } from '../logger.test';

let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createQueryObject } from './testHelper';

describe('I18nEntriesService', function () {
  let mockSails: any;
  let I18nEntriesService: any;
  let mockI18nTranslation: any;
  let mockI18nBundle: any;
  let testLocalesDir: string;

  beforeEach(function () {
    mockSails = createMockSails({
      config: {
        appPath: '/tmp/test-app',
        i18n: {
          next: {
            init: {
              supportedLngs: ['en', 'fr'],
              ns: ['translation'],
            },
          },
        },
      },
      log: createSinonStubLogger(sinon),
    });

    mockI18nTranslation = {
      findOne: sinon.stub().resolves(null),
      find: sinon.stub().returns({
        sort: sinon.stub().resolves([]),
      }),
      create: sinon.stub().resolves({ id: 'new-id' }),
      createEach: sinon.stub().resolves([]),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves({}) }),
      destroyOne: sinon.stub().resolves({}),
    };

    mockI18nBundle = {
      findOne: sinon.stub().resolves(null),
      find: sinon.stub().resolves([]),
      create: sinon.stub().resolves({ id: 'new-bundle' }),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves({}) }),
    };

    setupServiceTestGlobals(mockSails);
    (global as any).I18nTranslation = mockI18nTranslation;
    (global as any).I18nBundle = mockI18nBundle;
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1' }),
      getBrandById: sinon.stub().returns({ id: 'brand-1' }),
    };
    (global as any).TranslationService = {
      reloadResources: sinon.stub(),
    };
    (global as any).DomSanitizerService = {
      sanitizeWithProfile: sinon.stub().callsFake((value: string) => value),
    };

    const { Services } = require('../../src/services/I18nEntriesService');
    I18nEntriesService = new Services.I18nEntries();
    testLocalesDir = path.join(mockSails.config.appPath, 'language-defaults');
    fs.rmSync(mockSails.config.appPath, { recursive: true, force: true });
  });

  afterEach(function () {
    fs.rmSync(mockSails.config.appPath, { recursive: true, force: true });
    cleanupServiceTestGlobals();
    delete (global as any).I18nTranslation;
    delete (global as any).I18nBundle;
    delete (global as any).BrandingService;
    delete (global as any).TranslationService;
    delete (global as any).DomSanitizerService;
    sinon.restore();
  });

  describe('resolveBrandingId (private)', function () {
    it('should resolve branding id from object', function () {
      const result = I18nEntriesService.resolveBrandingId({ id: 'brand-1' });
      expect(result).to.equal('brand-1');
    });

    it('should resolve branding id from string', function () {
      const result = I18nEntriesService.resolveBrandingId('brand-2');
      expect(result).to.equal('brand-2');
    });

    it('should return global for null/undefined', function () {
      expect(I18nEntriesService.resolveBrandingId(null)).to.equal('global');
      expect(I18nEntriesService.resolveBrandingId(undefined)).to.equal('global');
    });
  });

  describe('buildUid (private)', function () {
    it('should build correct uid', function () {
      const result = I18nEntriesService.buildUid({ id: 'brand-1' }, 'en', 'common', 'welcome');
      expect(result).to.equal('brand-1:en:common:welcome');
    });

    it('should default namespace to translation', function () {
      const result = I18nEntriesService.buildUid({ id: 'brand-1' }, 'en', null, 'welcome');
      expect(result).to.equal('brand-1:en:translation:welcome');
    });
  });

  describe('flatten (private)', function () {
    it('should flatten nested object', function () {
      const obj = {
        a: {
          b: {
            c: 'value',
          },
          d: 'value2',
        },
        e: 'value3',
      };
      const result = I18nEntriesService.flatten(obj);
      expect(result).to.deep.equal({
        'a.b.c': 'value',
        'a.d': 'value2',
        e: 'value3',
      });
    });
  });

  describe('unflatten (private)', function () {
    it('should unflatten object', function () {
      const flat = {
        'a.b.c': 'value',
        'a.d': 'value2',
        e: 'value3',
      };
      const result = I18nEntriesService.unflatten(flat);
      expect(result).to.deep.equal({
        a: {
          b: { c: 'value' },
          d: 'value2',
        },
        e: 'value3',
      });
    });

    for (const poisonedPart of ['__proto__', 'constructor', 'prototype']) {
      it(`should ignore paths containing ${poisonedPart}`, function () {
        const result = I18nEntriesService.unflatten({
          safe: 'kept',
          [`nested.${poisonedPart}.polluted`]: 'blocked',
        });

        expect(result).to.deep.equal({ safe: 'kept' });
        expect(({} as Record<string, unknown>)['polluted']).to.equal(undefined);
      });
    }
  });

  describe('setNested (private)', function () {
    it('should set nested property', function () {
      const obj = {};
      I18nEntriesService.setNested(obj, 'a.b.c', 'value');
      expect(obj).to.deep.equal({ a: { b: { c: 'value' } } });
    });

    for (const poisonedPart of ['__proto__', 'constructor', 'prototype']) {
      it(`should ignore paths containing ${poisonedPart}`, function () {
        const obj = { safe: 'kept' };

        I18nEntriesService.setNested(obj, `nested.${poisonedPart}.polluted`, 'blocked');

        expect(obj).to.deep.equal({ safe: 'kept' });
        expect(({} as Record<string, unknown>)['polluted']).to.equal(undefined);
      });
    }
  });

  describe('removeNested (private)', function () {
    it('should remove nested property', function () {
      const obj = { a: { b: { c: 'value', d: 'keep' } } };
      I18nEntriesService.removeNested(obj, 'a.b.c');
      expect(obj).to.deep.equal({ a: { b: { d: 'keep' } } });
    });

    for (const poisonedPart of ['__proto__', 'constructor', 'prototype']) {
      it(`should ignore paths containing ${poisonedPart}`, function () {
        const obj = { safe: 'kept' };

        I18nEntriesService.removeNested(obj, `nested.${poisonedPart}.safe`);

        expect(obj).to.deep.equal({ safe: 'kept' });
      });
    }
  });

  describe('getEntry', function () {
    it('should call findOne with correct uid', async function () {
      await I18nEntriesService.getEntry('brand-1', 'en', 'ns', 'key');
      expect(mockI18nTranslation.findOne.calledWith({ uid: 'brand-1:en:ns:key' })).to.be.true;
    });
  });

  describe('setEntry', function () {
    it('should create new entry if not exists', async function () {
      mockI18nTranslation.findOne.resolves(null);
      mockI18nTranslation.create.resolves({ id: 'new-id' });
      // mock getBundle to return null so it creates a bundle too
      mockI18nBundle.findOne.resolves(null);

      await I18nEntriesService.setEntry('brand-1', 'en', 'ns', 'key', 'value');

      expect(mockI18nTranslation.create.called).to.be.true;
      expect(mockI18nBundle.create.called).to.be.true;
    });

    it('should update existing entry', async function () {
      mockI18nTranslation.findOne.resolves({ id: 'existing-id' });
      mockI18nBundle.findOne.resolves({ id: 'bundle-1', data: {} });

      await I18nEntriesService.setEntry('brand-1', 'en', 'ns', 'key', 'value');

      expect(mockI18nTranslation.updateOne.calledWith({ id: 'existing-id' })).to.be.true;
      expect(mockI18nBundle.updateOne.calledWith({ id: 'bundle-1' })).to.be.true;
    });

    it('should persist valid contentFormat', async function () {
      mockI18nTranslation.findOne.resolves(null);
      mockI18nBundle.findOne.resolves(null);

      await I18nEntriesService.setEntry('brand-1', 'en', 'ns', 'key', 'value', { contentFormat: 'html' });

      expect(mockI18nTranslation.create.firstCall.args[0].contentFormat).to.equal('html');
    });

    it('should ignore invalid contentFormat values', async function () {
      mockI18nTranslation.findOne.resolves(null);
      mockI18nBundle.findOne.resolves(null);

      await I18nEntriesService.setEntry('brand-1', 'en', 'ns', 'key', 'value', { contentFormat: 'xml' });

      expect(mockI18nTranslation.create.firstCall.args[0]).not.to.have.property('contentFormat');
    });

    it('should enforce the configured HTML class policy on entry and bundle writes', async function () {
      mockSails.config.i18n.editor = { allowedClasses: { th: ['classification-public'] } };
      const html =
        '<table class="table arbitrary" style="color:red"><tbody><tr>' +
        '<th class="classification-public arbitrary" onclick="alert(1)">Updated wording</th></tr></tbody></table>';
      await I18nEntriesService.setEntry('brand-1', 'en', 'ns', 'key', html, { contentFormat: 'html' });
      const saved = mockI18nTranslation.create.firstCall.args[0].value;
      expect(saved).to.contain('class="table"');
      expect(saved).to.contain('class="classification-public"');
      expect(saved).to.contain('Updated wording');
      expect(saved).not.to.match(/arbitrary|style=|onclick=/);
      expect(mockI18nBundle.create.firstCall.args[0].data.key).to.equal(saved);
    });

    it('should apply the stored HTML format when an API update omits contentFormat', async function () {
      mockI18nTranslation.findOne.resolves({ id: 'entry-1', contentFormat: 'html' });
      await I18nEntriesService.setEntry(
        'brand-1',
        'en',
        'ns',
        'key',
        '<p class="alert alert-info" style="color:red">Updated</p>'
      );
      expect(mockI18nTranslation.updateOne.firstCall.returnValue.set.firstCall.args[0].value).to.equal(
        '<p class="alert alert-info">Updated</p>'
      );
    });

    it('should leave plain text translations unchanged', async function () {
      const value = 'Example: <p style="color:red">literal markup</p>';
      await I18nEntriesService.setEntry('brand-1', 'en', 'ns', 'key', value, { contentFormat: 'plain' });
      expect(mockI18nTranslation.create.firstCall.args[0].value).to.equal(value);
    });
  });

  describe('deleteEntry', function () {
    it('should destroy entry and update bundle', async function () {
      mockI18nTranslation.destroyOne.resolves({ id: 'deleted' });
      mockI18nBundle.findOne.resolves({ id: 'bundle-1', data: { key: 'value' } });

      await I18nEntriesService.deleteEntry('brand-1', 'en', 'ns', 'key');

      expect(mockI18nTranslation.destroyOne.called).to.be.true;
      expect(mockI18nBundle.updateOne.called).to.be.true;
    });
  });

  describe('listEntries', function () {
    it('should find entries with correct query', async function () {
      await I18nEntriesService.listEntries('brand-1', 'en', 'ns');
      expect(mockI18nTranslation.find.called).to.be.true;
      const args = mockI18nTranslation.find.firstCall.args[0];
      expect(args.where).to.deep.include({ branding: 'brand-1', locale: 'en', namespace: 'ns' });
    });

    it('should add prefix filter if provided', async function () {
      await I18nEntriesService.listEntries('brand-1', 'en', 'ns', 'prefix');
      const args = mockI18nTranslation.find.firstCall.args[0];
      expect(args.where.key).to.have.property('startsWith', 'prefix');
    });
  });

  describe('getBundle', function () {
    it('should find bundle by uid', async function () {
      await I18nEntriesService.getBundle('brand-1', 'en', 'ns');
      expect(mockI18nBundle.findOne.calledWith({ uid: 'brand-1:en:ns' })).to.be.true;
    });
  });

  describe('listBundles', function () {
    it('should find bundles by branding', async function () {
      await I18nEntriesService.listBundles('brand-1');
      expect(mockI18nBundle.find.calledWith({ branding: 'brand-1' })).to.be.true;
    });
  });

  describe('setBundle', function () {
    for (const options of [{ splitToEntries: false }, { overwriteEntries: false }]) {
      for (const metadataSource of ['centralized', 'imported']) {
        it(`should use retained entry formats despite conflicting ${metadataSource} metadata (${JSON.stringify(options)})`, async function () {
          sinon.stub(I18nEntriesService, 'getLanguageDisplayName').resolves('English');
          sinon.stub(I18nEntriesService, 'syncEntriesFromBundle').resolves();
          sinon.stub(I18nEntriesService, 'loadCentralizedMeta').resolves({
            intro: { contentFormat: 'plain' },
            literal: { contentFormat: 'html' },
          });
          mockI18nTranslation.find.returns({
            sort: sinon.stub().resolves([
              { key: 'intro', contentFormat: 'html' },
              { key: 'literal', contentFormat: 'plain' },
            ]),
          });
          const literal = '<p style="color:red">Literal markup</p>';
          const data: Record<string, unknown> = {
            intro: '<p class="alert alert-info evil" style="color:red" onclick="alert(1)">Intro</p>',
            literal,
          };
          if (metadataSource === 'imported') {
            data._meta = { intro: { contentFormat: 'plain' }, literal: { contentFormat: 'html' } };
          }

          await I18nEntriesService.setBundle('brand-1', 'en', 'ns', data, undefined, options);

          const saved = mockI18nBundle.create.firstCall.args[0].data;
          expect(saved.intro).to.equal('<p class="alert alert-info">Intro</p>');
          expect(saved.literal).to.equal(literal);
          expect(data.intro).to.contain('onclick=');
        });
      }
    }

    it('should use imported formats when existing entries will be overwritten', async function () {
      sinon.stub(I18nEntriesService, 'getLanguageDisplayName').resolves('English');
      sinon.stub(I18nEntriesService, 'syncEntriesFromBundle').resolves();
      mockI18nTranslation.find.returns({
        sort: sinon.stub().resolves([
          { key: 'intro', contentFormat: 'plain' },
          { key: 'literal', contentFormat: 'html' },
        ]),
      });
      const literal = '<p style="color:red">Literal markup</p>';

      await I18nEntriesService.setBundle('brand-1', 'en', 'ns', {
        intro: '<p onclick="alert(1)">Intro</p>',
        literal,
        _meta: { intro: { contentFormat: 'html' }, literal: { contentFormat: 'plain' } },
      });

      const saved = mockI18nBundle.create.firstCall.args[0].data;
      expect(saved.intro).to.equal('<p>Intro</p>');
      expect(saved.literal).to.equal(literal);
      expect(I18nEntriesService.syncEntriesFromBundle.calledWith(sinon.match.any, true)).to.be.true;
    });

    it('should sanitise HTML imports even when splitting into entries is disabled', async function () {
      sinon.stub(I18nEntriesService, 'getLanguageDisplayName').resolves('English');
      mockI18nTranslation.find.returns({ sort: sinon.stub().resolves([{ key: 'intro', contentFormat: 'html' }]) });
      const data = { intro: '<p class="alert alert-warning evil" style="color:red">Intro</p>', plain: '<literal>' };
      await I18nEntriesService.setBundle('brand-1', 'en', 'ns', data, undefined, { splitToEntries: false });
      expect(mockI18nBundle.create.firstCall.args[0].data).to.deep.equal({
        intro: '<p class="alert alert-warning">Intro</p>',
        plain: '<literal>',
      });
      expect(data.intro).to.contain('style='); // Do not mutate the caller's data.
    });

    it('should use HTML format metadata for newly imported entries', async function () {
      sinon.stub(I18nEntriesService, 'getLanguageDisplayName').resolves('English');
      const data = {
        intro: '<p class="alert alert-info" onclick="alert(1)">Intro</p>',
        _meta: { intro: { contentFormat: 'html' } },
      };
      await I18nEntriesService.setBundle('brand-1', 'en', 'ns', data, undefined, { splitToEntries: false });
      expect(mockI18nBundle.create.firstCall.args[0].data.intro).to.equal('<p class="alert alert-info">Intro</p>');
    });

    it('should preserve flat dotted keys and nested bundle structure during sanitisation', async function () {
      sinon.stub(I18nEntriesService, 'getLanguageDisplayName').resolves('English');
      const data = {
        'flat.intro': '<p style="color:red">Flat</p>',
        nested: { intro: '<p style="color:red">Nested</p>' },
        _meta: { 'flat.intro': { contentFormat: 'html' }, 'nested.intro': { contentFormat: 'html' } },
      };
      await I18nEntriesService.setBundle('brand-1', 'en', 'ns', data, undefined, { splitToEntries: false });
      const saved = mockI18nBundle.create.firstCall.args[0].data;
      expect(saved['flat.intro']).to.equal('<p>Flat</p>');
      expect(saved).not.to.have.property('flat');
      expect(saved.nested).to.deep.equal({ intro: '<p>Nested</p>' });
    });

    it('should create bundle if not exists', async function () {
      mockI18nBundle.findOne.resolves(null);
      sinon.stub(I18nEntriesService, 'getLanguageDisplayName').resolves('English');
      sinon.stub(I18nEntriesService, 'syncEntriesFromBundle').resolves();

      await I18nEntriesService.setBundle('brand-1', 'en', 'ns', { key: 'val' });

      expect(mockI18nBundle.create.called).to.be.true;
      expect(I18nEntriesService.syncEntriesFromBundle.called).to.be.true;
    });

    it('should update bundle if exists', async function () {
      mockI18nBundle.findOne.resolves({ id: 'bundle-1' });
      sinon.stub(I18nEntriesService, 'getLanguageDisplayName').resolves('English');
      sinon.stub(I18nEntriesService, 'syncEntriesFromBundle').resolves();

      await I18nEntriesService.setBundle('brand-1', 'en', 'ns', { key: 'val' });

      expect(mockI18nBundle.updateOne.calledWith({ id: 'bundle-1' })).to.be.true;
    });

    it('should honour overwriteEntries=false when syncing entries', async function () {
      mockI18nBundle.findOne.resolves(null);
      sinon.stub(I18nEntriesService, 'getLanguageDisplayName').resolves('English');
      sinon.stub(I18nEntriesService, 'syncEntriesFromBundle').resolves();

      await I18nEntriesService.setBundle('brand-1', 'en', 'ns', { key: 'val' }, undefined, { overwriteEntries: false });

      expect(I18nEntriesService.syncEntriesFromBundle.calledWith(sinon.match.any, false)).to.be.true;
    });

    it('should sanitize nested bundle values before persisting them', async function () {
      const sanitizer = (global as any).DomSanitizerService.sanitizeWithProfile;
      const unsafeHeading = '<strong>Welcome</strong><script>unsafe()</script>';
      sanitizer.callsFake((value: string) => (value === unsafeHeading ? '<strong>Welcome</strong>' : value));
      mockI18nBundle.findOne.resolves(null);
      sinon.stub(I18nEntriesService, 'getLanguageDisplayName').resolves('English');
      sinon.stub(I18nEntriesService, 'syncEntriesFromBundle').resolves();

      await I18nEntriesService.setBundle('brand-1', 'en', 'ns', {
        heading: unsafeHeading,
        nested: { body: '<p>Safe body</p>' },
        count: 2,
        _meta: { heading: { contentFormat: 'html' }, 'nested.body': { contentFormat: 'html' } },
      });

      expect(mockI18nBundle.create.firstCall.args[0].data).to.deep.equal({
        heading: '<strong>Welcome</strong>',
        nested: { body: '<p>Safe body</p>' },
        count: 2,
        _meta: { heading: { contentFormat: 'html' }, 'nested.body': { contentFormat: 'html' } },
      });
    });
  });

  describe('updateBundleEnabled', function () {
    it('should update enabled status', async function () {
      mockI18nBundle.updateOne.returns({ set: sinon.stub().resolves({ id: 'bundle-1' }) });

      await I18nEntriesService.updateBundleEnabled('brand-1', 'en', 'ns', true);

      expect(mockI18nBundle.updateOne.called).to.be.true;
    });

    it('should throw if bundle not found', async function () {
      mockI18nBundle.updateOne.returns({ set: sinon.stub().resolves(null) });

      try {
        await I18nEntriesService.updateBundleEnabled('brand-1', 'en', 'ns', true);
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).to.exist;
      }
    });
  });

  describe('composeNamespace', function () {
    it('should compose namespace from entries', function () {
      const entries = [
        { key: 'a.b', value: 'v1' },
        { key: 'c', value: 'v2' },
      ];
      const result = I18nEntriesService.composeNamespace(entries);
      expect(result).to.deep.equal({ a: { b: 'v1' }, c: 'v2' });
    });
  });

  describe('syncEntriesFromBundle', function () {
    for (const suppliedId of [undefined, 'stale-bundle-id']) {
      it(`should merge missing keys into the stored bundle when the supplied id is ${suppliedId}`, async function () {
        const stored = {
          id: 'stored-bundle',
          data: { section: { title: 'Custom', storedOnly: 'Keep' }, unrelated: 'Retained' },
        };
        const data = {
          section: { title: 'Default', added: 'New', html: '<p onclick="bad()">Safe</p>', nullish: null },
          _meta: { 'section.html': { contentFormat: 'html' } },
        };
        sinon.stub(I18nEntriesService, 'loadCentralizedMeta').resolves({});
        mockI18nTranslation.find.resolves([{ key: 'section.title', value: 'Custom' }]);
        mockI18nBundle.findOne.resolves(stored);

        await I18nEntriesService.syncEntriesFromBundle({
          id: suppliedId,
          branding: 'brand-1',
          locale: 'en',
          namespace: 'ns',
          data,
        });

        expect(mockI18nBundle.findOne.calledOnceWithExactly({ uid: 'brand-1:en:ns' })).to.be.true;
        expect(mockI18nBundle.updateOne.calledOnceWithExactly({ id: 'stored-bundle' })).to.be.true;
        expect(mockI18nBundle.updateOne.firstCall.returnValue.set.firstCall.args[0].data).to.deep.equal({
          section: { title: 'Custom', storedOnly: 'Keep', added: 'New', html: '<p>Safe</p>', nullish: 'section.nullish' },
          unrelated: 'Retained',
        });
        const records = mockI18nTranslation.createEach.firstCall.args[0];
        expect(records.map(record => record.key)).to.deep.equal(['section.added', 'section.html', 'section.nullish']);
        expect(records.every(record => record.bundle === 'stored-bundle')).to.be.true;
        expect(records.find(record => record.key === 'section.html').value).to.equal('<p>Safe</p>');
        expect(stored.data.section).to.deep.equal({ title: 'Custom', storedOnly: 'Keep' });
        expect(data.section.html).to.contain('onclick=');
      });
    }

    it('should create a missing bundle before seeding a bundle-like object without an id', async function () {
      sinon.stub(I18nEntriesService, 'loadCentralizedMeta').resolves({});
      mockI18nTranslation.find.resolves([]);

      await I18nEntriesService.syncEntriesFromBundle({
        branding: 'brand-1', locale: 'en', namespace: 'ns', data: { key: 'Value', empty: '' },
      });

      expect(mockI18nBundle.create.calledOnceWithExactly({
        branding: 'brand-1', locale: 'en', namespace: 'ns', data: { key: 'Value', empty: '' },
      })).to.be.true;
      expect(mockI18nBundle.create.calledBefore(mockI18nTranslation.createEach)).to.be.true;
      expect(mockI18nTranslation.createEach.firstCall.args[0].every(record => record.bundle === 'new-bundle')).to.be.true;
      expect(mockI18nBundle.updateOne.called).to.be.false;
    });

    it('should persist normalised bundle data before a partial entry failure and recover on retry', async function () {
      const stored = {
        id: 'bundle-1',
        branding: 'brand-1',
        locale: 'en',
        namespace: 'ns',
        data: { html: '<p onclick="bad()">Safe</p>', nullish: null as unknown },
      };
      sinon.stub(I18nEntriesService, 'loadCentralizedMeta').resolves({ html: { contentFormat: 'html' } });
      mockI18nBundle.findOne.resolves(stored);
      mockI18nBundle.updateOne.returns({ set: sinon.stub().callsFake(async ({ data }) => {
        stored.data = data;
        return stored;
      }) });
      mockI18nTranslation.find.onFirstCall().resolves([]).onSecondCall().resolves([
        { key: 'html', value: '<p>Safe</p>', contentFormat: 'html' },
      ]);
      const failure = new Error('partial insert');
      mockI18nTranslation.createEach.onFirstCall().rejects(failure).onSecondCall().resolves([]);
      let rejected: unknown;
      try {
        await I18nEntriesService.syncEntriesFromBundle(stored);
      } catch (error) {
        rejected = error;
      }
      expect(rejected).to.equal(failure);
      expect(stored.data).to.deep.equal({ html: '<p>Safe</p>', nullish: 'nullish' });

      await I18nEntriesService.syncEntriesFromBundle(stored);

      expect(mockI18nTranslation.createEach.secondCall.args[0].map(record => record.key)).to.deep.equal(['nullish']);
      expect(mockI18nBundle.updateOne.calledOnce).to.be.true;
      expect(stored.data.html).to.equal('<p>Safe</p>');
    });

    for (const existingBundle of [false, true]) {
      it(`should reject without seeding or pruning entries if the bundle write fails (existing=${existingBundle})`, async function () {
        sinon.stub(I18nEntriesService, 'loadCentralizedMeta').resolves({});
        mockI18nTranslation.find.resolves([{ key: 'obsolete' }]);
        const prune = sinon.stub(I18nEntriesService, 'deleteEntry').resolves(true);
        const failure = new Error('bundle write failed');
        if (existingBundle) {
          mockI18nBundle.findOne.resolves({ id: 'bundle-1', data: {} });
          mockI18nBundle.updateOne.returns({ set: sinon.stub().rejects(failure) });
        } else {
          mockI18nBundle.create.rejects(failure);
        }
        let rejected: unknown;
        try {
          await I18nEntriesService.syncEntriesFromBundle({
            branding: 'brand-1', locale: 'en', namespace: 'ns', data: { added: 'New' },
          });
        } catch (error) {
          rejected = error;
        }
        expect(rejected).to.equal(failure);
        expect(mockI18nTranslation.createEach.called).to.be.false;
        expect(prune.called).to.be.false;
      });
    }

    it('should persist the same imported format used to sanitize an overwrite', async function () {
      const bundle = {
        id: 'bundle-1',
        branding: 'brand-1',
        locale: 'en',
        namespace: 'ns',
        data: { intro: '<p onclick="alert(1)">Intro</p>', _meta: { intro: { contentFormat: 'html' } } },
      };
      sinon.stub(I18nEntriesService, 'loadCentralizedMeta').resolves({ intro: { contentFormat: 'plain' } });
      mockI18nTranslation.find.resolves([{ key: 'intro', contentFormat: 'plain' }]);
      mockI18nTranslation.findOne.resolves({ id: 'entry-1', contentFormat: 'plain' });

      await I18nEntriesService.syncEntriesFromBundle(bundle, true);

      const saved = mockI18nTranslation.updateOne.firstCall.returnValue.set.firstCall.args[0];
      expect(saved.contentFormat).to.equal('html');
      expect(saved.value).to.equal('<p>Intro</p>');
      expect(mockI18nBundle.create.firstCall.args[0].data.intro).to.equal(saved.value);
    });

    it('should seed missing entries without overwriting custom translations and prune removed keys', async function () {
      const bundle = {
        id: 'bundle-1',
        branding: 'brand-1',
        locale: 'en',
        namespace: 'ns',
        data: { existing: 'Default', nested: { added: 'Added' } },
      };
      mockI18nBundle.findOne.resolves(bundle);
      sinon.stub(I18nEntriesService, 'loadCentralizedMeta').resolves({
        'nested.added': { category: 'General', description: 'New default' },
      });
      mockI18nTranslation.find.resolves([
        { id: 'custom-1', key: 'existing', value: 'Custom', contentFormat: 'plain' },
        { id: 'removed-1', key: 'removed', value: 'Old default' },
      ]);
      const prune = sinon.stub(I18nEntriesService, 'deleteEntry').resolves(true);

      await I18nEntriesService.syncEntriesFromBundle(bundle);

      expect(mockI18nTranslation.createEach.firstCall.args[0]).to.deep.equal([
        {
          branding: 'brand-1',
          bundle: 'bundle-1',
          key: 'nested.added',
          locale: 'en',
          namespace: 'ns',
          value: 'Added',
          category: 'General',
          contentFormat: undefined,
          description: 'New default',
        },
      ]);
      expect(mockI18nTranslation.findOne.called).to.be.false;
      expect(mockI18nTranslation.updateOne.called).to.be.false;
      expect(prune.calledOnceWithExactly(sinon.match.any, 'en', 'ns', 'removed')).to.be.true;
      expect((global as any).TranslationService.reloadResources.calledOnceWithExactly('brand-1')).to.be.true;
    });

    it('should leave existing entries untouched when there are no missing keys', async function () {
      sinon.stub(I18nEntriesService, 'loadCentralizedMeta').resolves({});
      mockI18nTranslation.find.resolves([{ key: 'key', value: 'Custom' }]);
      await I18nEntriesService.syncEntriesFromBundle({
        id: 'bundle-1',
        branding: 'brand-1',
        locale: 'en',
        namespace: 'ns',
        data: { key: 'Default' },
      });
      expect(mockI18nTranslation.createEach.called).to.be.false;
      expect(mockI18nTranslation.findOne.called).to.be.false;
      expect(mockI18nBundle.updateOne.called).to.be.false;
    });

    it('should normalize nullish values in both the entries and the bundle', async function () {
      sinon.stub(I18nEntriesService, 'loadCentralizedMeta').resolves({});
      mockI18nTranslation.find.resolves([]);
      const bundle = {
        id: 'bundle-1',
        branding: 'brand-1',
        locale: 'en',
        namespace: 'ns',
        data: { nested: { key: null } },
      };
      mockI18nBundle.findOne.resolves(bundle);
      await I18nEntriesService.syncEntriesFromBundle(bundle);
      expect(mockI18nTranslation.createEach.firstCall.args[0][0].value).to.equal('nested.key');
      expect(mockI18nBundle.updateOne.firstCall.returnValue.set.firstCall.args[0].data).to.deep.equal({
        nested: { key: 'nested.key' },
      });
    });

    it('should preserve empty-string translations', async function () {
      const bundle = {
        id: 'bundle-1',
        branding: 'brand-1',
        locale: 'en',
        namespace: 'ns',
        data: { key: '' },
      };

      sinon.stub(I18nEntriesService, 'loadCentralizedMeta').resolves({});
      mockI18nTranslation.find.resolves([]);
      mockI18nTranslation.findOne.resolves(null);
      mockI18nTranslation.create.resolves({});

      await I18nEntriesService.syncEntriesFromBundle(bundle);

      expect(mockI18nTranslation.createEach.called).to.be.true;
      expect(mockI18nTranslation.createEach.firstCall.args[0][0].value).to.equal('');
    });

    it('should copy contentFormat from bundle metadata', async function () {
      const bundle = {
        id: 'bundle-1',
        branding: 'brand-1',
        locale: 'en',
        namespace: 'ns',
        data: {
          key: '<p onclick="alert(1)">value</p>',
          _meta: {
            key: {
              contentFormat: 'html',
            },
          },
        },
      };

      mockI18nBundle.findOne.resolves(bundle);
      sinon.stub(I18nEntriesService, 'loadCentralizedMeta').resolves({});
      mockI18nTranslation.find.resolves([]);
      mockI18nTranslation.findOne.resolves(null);
      mockI18nTranslation.create.resolves({});

      await I18nEntriesService.syncEntriesFromBundle(bundle);

      expect(mockI18nTranslation.createEach.called).to.be.true;
      expect(mockI18nTranslation.createEach.firstCall.args[0][0].contentFormat).to.equal('html');
      expect(mockI18nTranslation.createEach.firstCall.args[0][0].value).to.equal('<p>value</p>');
      expect(mockI18nBundle.updateOne.firstCall.returnValue.set.firstCall.args[0].data.key).to.equal('<p>value</p>');
    });
  });

  describe('bootstrap additive defaults', function () {
    function writeDefaults(locale: string, namespace: string, data: Record<string, unknown>): void {
      const localeDir = path.join(testLocalesDir, locale);
      fs.mkdirSync(localeDir, { recursive: true });
      fs.writeFileSync(path.join(localeDir, `${namespace}.json`), JSON.stringify(data));
    }

    it('should skip bundle update and translation create when no defaults are missing', async function () {
      writeDefaults('en', 'translation', { existing: 'default' });
      mockI18nBundle.findOne.resolves({
        id: 'bundle-1',
        branding: 'brand-1',
        locale: 'en',
        namespace: 'translation',
        data: { existing: 'custom' },
      });
      mockI18nTranslation.find.resolves([{ key: 'existing' }]);

      await I18nEntriesService.bootstrap(['en']);

      expect(mockI18nBundle.updateOne.called).to.be.false;
      expect(mockI18nTranslation.createEach.called).to.be.false;
      expect(mockI18nTranslation.create.called).to.be.false;
    });

    it('should add only missing default keys for existing bundles', async function () {
      writeDefaults('en', 'translation', { existing: 'default', added: 'new' });
      mockI18nBundle.findOne.resolves({
        id: 'bundle-1',
        branding: 'brand-1',
        locale: 'en',
        namespace: 'translation',
        data: { existing: 'custom' },
      });
      mockI18nBundle.updateOne.returns({
        set: sinon.stub().resolves({
          id: 'bundle-1',
          branding: 'brand-1',
          locale: 'en',
          namespace: 'translation',
          data: { existing: 'custom', added: 'new' },
        }),
      });
      mockI18nTranslation.find.resolves([{ key: 'existing' }, { key: 'custom.only' }]);
      sinon.stub(I18nEntriesService, 'loadCentralizedMeta').resolves({
        added: {
          category: 'General',
          description: 'Added key',
          contentFormat: 'html',
        },
      });

      await I18nEntriesService.bootstrap(['en']);

      expect(mockI18nBundle.updateOne.calledWith({ id: 'bundle-1' })).to.be.true;
      expect(mockI18nTranslation.createEach.calledOnce).to.be.true;
      expect(mockI18nTranslation.destroyOne.called).to.be.false;

      const updatedData = mockI18nBundle.updateOne.firstCall.returnValue.set.firstCall.args[0].data;
      expect(updatedData).to.deep.equal({ existing: 'custom', added: 'new' });

      const createdRecords = mockI18nTranslation.createEach.firstCall.args[0];
      expect(createdRecords).to.have.length(1);
      expect(createdRecords[0]).to.deep.include({
        branding: 'brand-1',
        bundle: 'bundle-1',
        locale: 'en',
        namespace: 'translation',
        key: 'added',
        value: 'new',
        category: 'General',
        description: 'Added key',
        contentFormat: 'html',
      });
    });

    it('should preserve empty strings and file metadata for new defaults', async function () {
      writeDefaults('en', 'translation', {
        existing: 'default',
        empty: '',
        _meta: {
          empty: {
            category: 'Formatting',
            description: 'May be blank',
            contentFormat: 'plain',
          },
        },
      });
      mockI18nBundle.findOne.resolves({
        id: 'bundle-1',
        branding: 'brand-1',
        locale: 'en',
        namespace: 'translation',
        data: { existing: 'custom' },
      });
      mockI18nBundle.updateOne.returns({
        set: sinon.stub().resolves({
          id: 'bundle-1',
          branding: 'brand-1',
          locale: 'en',
          namespace: 'translation',
          data: {
            existing: 'custom',
            empty: '',
            _meta: { empty: { category: 'Formatting', description: 'May be blank', contentFormat: 'plain' } },
          },
        }),
      });
      mockI18nTranslation.find.resolves([{ key: 'existing' }]);
      sinon.stub(I18nEntriesService, 'loadCentralizedMeta').resolves({});

      await I18nEntriesService.bootstrap(['en']);

      expect(mockI18nTranslation.createEach.calledOnce).to.be.true;
      const createdRecords = mockI18nTranslation.createEach.firstCall.args[0];
      expect(createdRecords).to.have.length(1);
      expect(createdRecords[0]).to.deep.include({
        key: 'empty',
        value: '',
        category: 'Formatting',
        description: 'May be blank',
        contentFormat: 'plain',
      });
    });

    it('should seed first-time bundles without forcing overwrite mode', async function () {
      writeDefaults('en', 'translation', { added: 'new' });
      mockI18nBundle.findOne.resolves(null);
      const setBundleStub = sinon.stub(I18nEntriesService, 'setBundle').resolves({ id: 'bundle-1' } as any);

      await I18nEntriesService.bootstrap(['en']);

      expect(setBundleStub.calledOnce).to.be.true;
      expect(setBundleStub.firstCall.args[5]).to.deep.equal({ splitToEntries: true, overwriteEntries: false });
    });

    it('should ignore nested demo locale folders when discovering defaults', async function () {
      writeDefaults('en', 'translation', { greeting: 'Hello' });
      writeDefaults('demo/es', 'translation', { greeting: 'Hola' });
      const setBundleStub = sinon.stub(I18nEntriesService, 'setBundle').resolves({ id: 'bundle-1' } as any);

      await I18nEntriesService.bootstrap();

      expect(setBundleStub.calledOnce).to.be.true;
      expect(setBundleStub.firstCall.args[1]).to.equal('en');
    });
  });
});
