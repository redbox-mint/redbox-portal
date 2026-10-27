const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
import { fixtureRemove, fixtureCreate } from '../../helpers/persistenceFixtures';
import { I18nEntries } from '@researchdatabox/redbox-core/translations';
/*
 Integration tests for I18nEntriesService covering its public API.
 Follows the style of existing tests in test/integration/services.
*/

/* global sails, I18nEntriesService, I18nTranslation, I18nBundle, BrandingService, expect */

describe('I18nEntriesService', function () {
  this.timeout(10000);

  // Will be initialised in before() as a real BrandingConfig record so that
  // foreign key constraints (branding relation) are satisfied when creating
  // I18nBundle / I18nTranslation records.
  let branding; // { id, name }
  const locale = 'en';
  const ns = 'itest';

  const dataV1 = {
    section: { title: 'Hello', note: 'First' },
    _meta: {
      'section.title': { category: 'General', description: 'Title text' },
      'section.note': { category: 'General', description: 'Note text' }
    }
  };

  const dataV2 = {
    section: { title: 'World', note: 'Second' },
    _meta: {
      'section.title': { category: 'Changed', description: 'Changed desc' },
      'section.note': { category: 'General', description: 'Note text' }
    }
  };

  async function cleanup() {
    try {
      if (branding?.id) {
        await fixtureRemove("I18nTranslation", { branding: branding.id });
      }
    } catch (e) { /* ignore */ }
    try {
      if (branding?.id) {
        await fixtureRemove("I18nBundle", { branding: branding.id });
      }
    } catch (e) { /* ignore */ }
    try {
      if (branding?.id) {
        await fixtureRemove("BrandingConfig", { id: branding.id });
      }
    } catch (e) { /* ignore */ }
  }

  before(async function () {
    await cleanup();
    // Create a branding config to reference. Use random unique name to avoid clashes.
    const name = `testbrand-i18n-${Date.now()}`;
    const created = await fixtureCreate("BrandingConfig", { name });
    branding = { id: created.id, name: created.name };
  });

  after(async function () {
    await cleanup();
  });

  it('setBundle creates bundle and splits to entries', async function () {
    const bundle = await fixture.services.I18nEntriesService.setBundle(branding, locale, ns, dataV1, undefined, { overwriteEntries: true });
  expect(bundle).to.be.ok;
  expect(bundle).to.have.property('data');
  expect(bundle?.data?.section?.title).to.equal('Hello');

    const got = await fixture.services.I18nEntriesService.getBundle(branding, locale, ns);
    expect(got).to.be.ok;
    expect(got).to.have.property('id');

    const entries = await fixture.services.I18nEntriesService.listEntries(branding, locale, ns);
    const flatKeys = entries.map(e => e.key);
    expect(flatKeys).to.include('section.title');
    expect(flatKeys).to.include('section.note');

    const titleEntry = entries.find(e => e.key === 'section.title');
    expect(titleEntry).to.have.property('value', 'Hello');
    expect(titleEntry).to.have.property('category', 'General');
    expect(titleEntry).to.have.property('description', 'Title text');
  });

  it('getEntry retrieves a specific key', async function () {
    const e = await fixture.services.I18nEntriesService.getEntry(branding, locale, ns, 'section.title');
    expect(e).to.be.ok;
    expect(e).to.have.property('key', 'section.title');
    expect(e).to.have.property('value', 'Hello');
  });

  it('setEntry updates an entry and syncs bundle JSON', async function () {
    const saved = await fixture.services.I18nEntriesService.setEntry(branding, locale, ns, 'section.title', 'World', { category: 'Changed', description: 'Changed desc' });
    expect(saved).to.be.ok;

    const e = await fixture.services.I18nEntriesService.getEntry(branding, locale, ns, 'section.title');
    expect(e).to.have.property('value', 'World');
    expect(e).to.have.property('category', 'Changed');
    expect(e).to.have.property('description', 'Changed desc');

  const b = await fixture.services.I18nEntriesService.getBundle(branding, locale, ns);
  expect(b).to.be.ok;
  expect(b?.data?.section?.title).to.equal('World');
  });

  it('listEntries supports keyPrefix filtering', async function () {
    // Add an extra entry with different prefix
    await fixture.services.I18nEntriesService.setEntry(branding, locale, ns, 'other.test', 'X');

    const prefixed = await fixture.services.I18nEntriesService.listEntries(branding, locale, ns, 'section.');
    expect(prefixed.length).to.be.greaterThan(0);
    const keys = prefixed.map(e => e.key);
    expect(keys.every(k => k.startsWith('section.'))).to.equal(true);
  });

  it('composeNamespace builds nested object from flat entries', function () {
    const composed = fixture.services.I18nEntriesService.composeNamespace([
      { key: 'a.b', value: 'x' },
      { key: 'a.c', value: 'y' },
      { key: 'd', value: 'z' }
    ]);
    expect(composed).to.deep.equal({ a: { b: 'x', c: 'y' }, d: 'z' });
  });

  it('syncEntriesFromBundle respects overwrite=false, then true', async function () {
    // First ensure baseline from V1 already in place from earlier test
    const e1 = await fixture.services.I18nEntriesService.getEntry(branding, locale, ns, 'section.title');
    expect(e1.value).to.equal('World');

  // Try to sync V2 without overwrite; should not change existing entry value
  const existingBundle = await fixture.services.I18nEntriesService.getBundle(branding, locale, ns);
  await fixture.services.I18nEntriesService.syncEntriesFromBundle({ branding, locale, namespace: ns, id: existingBundle.id, data: dataV2 }, false);
    const eNoOverwrite = await fixture.services.I18nEntriesService.getEntry(branding, locale, ns, 'section.title');
    expect(eNoOverwrite.value).to.equal('World');

  // Now overwrite = true
  await fixture.services.I18nEntriesService.syncEntriesFromBundle({ branding, locale, namespace: ns, id: existingBundle.id, data: dataV2 }, true);
    const eOverwrite = await fixture.services.I18nEntriesService.getEntry(branding, locale, ns, 'section.title');
    expect(eOverwrite.value).to.equal('World'); // value was already World from setEntry
    // But ensure another key is updated/created appropriately
    const note = await fixture.services.I18nEntriesService.getEntry(branding, locale, ns, 'section.note');
    expect(note).to.have.property('value', 'Second');
    expect(note).to.have.property('category', 'General');
  });

  it('syncEntriesFromBundle accepts bundle-like objects, preserves empty strings, and defaults nullish values', async function () {
    const objectNs = `${ns}-object-sync`;
    const data = { section: { title: 'FromObject', empty: '', nullish: null } };

    await fixture.services.I18nEntriesService.syncEntriesFromBundle({ branding: branding.id, locale, namespace: objectNs, data }, true);

    const title = await fixture.services.I18nEntriesService.getEntry(branding, locale, objectNs, 'section.title');
    expect(title).to.have.property('value', 'FromObject');

    const empty = await fixture.services.I18nEntriesService.getEntry({ _id: branding.id } as any, locale, objectNs, 'section.empty');
    expect(empty).to.have.property('value', '');

    const nullish = await fixture.services.I18nEntriesService.getEntry(branding.id as any, locale, objectNs, 'section.nullish');
    expect(nullish).to.have.property('value', 'section.nullish');

    const bundle = await fixture.services.I18nEntriesService.getBundle(branding.id as any, locale, objectNs);
    expect(bundle).to.be.ok;
  });

  for (const normalise of [false, true]) {
    it(`non-overwriting object sync merges missing keys into stored data (normalise=${normalise})`, async function () {
      const objectNs = `${ns}-merge-${normalise}`;
      const stored = await fixture.services.I18nEntriesService.setBundle(
        branding, locale, objectNs,
        { section: { title: 'Custom', storedOnly: 'Retained' } },
        undefined, { splitToEntries: false }
      );
      await fixture.services.I18nEntriesService.setEntry(branding, locale, objectNs, 'section.title', 'Custom');
      const data = {
        section: { title: 'Default', added: normalise ? null : 'Added' },
        ...(normalise ? {
          html: '<p onclick="bad()">Safe</p>',
          _meta: { html: { contentFormat: 'html' } },
        } : {}),
      };

      await fixture.services.I18nEntriesService.syncEntriesFromBundle({
        id: stored.id, branding, locale, namespace: objectNs, data,
      }, false);

      const bundle = await fixture.services.I18nEntriesService.getBundle(branding, locale, objectNs);
      expect(bundle.data.section).to.deep.equal({
        title: 'Custom', storedOnly: 'Retained', added: normalise ? 'section.added' : 'Added',
      });
      const added = await fixture.services.I18nEntriesService.getEntry(branding, locale, objectNs, 'section.added');
      expect(added.value).to.equal(bundle.data.section.added);
      expect(String(added.bundle)).to.equal(String(stored.id));
      if (normalise) {
        expect(bundle.data.html).to.equal('<p>Safe</p>');
        const html = await fixture.services.I18nEntriesService.getEntry(branding, locale, objectNs, 'html');
        expect(html.value).to.equal('<p>Safe</p>');
        expect(html.contentFormat).to.equal('html');
      }
    });
  }

  it('non-overwriting sync creates a missing bundle and links all entries without a supplied id', async function () {
    const objectNs = `${ns}-new-object`;
    await fixture.services.I18nEntriesService.syncEntriesFromBundle({
      branding, locale, namespace: objectNs, data: { title: 'New', empty: '', nullish: null },
    }, false);

    const bundle = await fixture.services.I18nEntriesService.getBundle(branding, locale, objectNs);
    expect(bundle.data).to.deep.equal({ title: 'New', empty: '', nullish: 'nullish' });
    const entries = await fixture.services.I18nEntriesService.listEntries(branding, locale, objectNs);
    expect(entries).to.have.length(3);
    expect(entries.every(entry => String(entry.bundle) === String(bundle.id))).to.equal(true);
    expect(entries.every(entry => entry.uid === `${branding.id}:${locale}:${objectNs}:${entry.key}`)).to.equal(true);
  });

  it('deleteEntry removes an entry', async function () {
  // Re-create the key (it may have been pruned during syncEntriesFromBundle overwrite phase)
  await fixture.services.I18nEntriesService.setEntry(branding, locale, ns, 'other.test', 'X');
  const ok = await fixture.services.I18nEntriesService.deleteEntry(branding, locale, ns, 'other.test');
    expect(ok).to.equal(true);
    const gone = await fixture.services.I18nEntriesService.getEntry(branding, locale, ns, 'other.test');
  expect(gone == null).to.equal(true); // allow null or undefined
  });

  it('getBundle returns the bundle by uid fields', async function () {
    const b = await fixture.services.I18nEntriesService.getBundle(branding, locale, ns);
    expect(b).to.be.ok;
    expect(b).to.have.property('locale', locale);
    expect(b).to.have.property('namespace', ns);
    expect(b).to.have.property('branding', branding.id);
  });

  it('bootstrap merges defaults into existing bundles', async function () {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const testLocale = `zz-i18n-${Date.now()}`;
    const testNamespace = 'translation';
    const os = await import('node:os');
    const localesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-i18n-defaults-'));
    const localeDir = path.join(localesDir, testLocale);
    const defaults = { section: { title: 'Default Title', extra: 'Added' } };
    const filePath = path.join(localeDir, `${testNamespace}.json`);
    const input = Reflect.get(fixture.services.I18nEntriesService, 'input');
    const entries = new I18nEntries({
      ...input,
      localesDirectory: localesDir,
      getBrand: name => name === 'default' ? branding : input.getBrand(name),
    });

    try {
      fs.mkdirSync(localeDir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(defaults));

      await entries.setBundle(
        branding,
        testLocale,
        testNamespace,
        { section: { title: 'Existing Title' } },
        undefined,
        { overwriteEntries: true }
      );

      await entries.bootstrap([testLocale]);

      const merged = await entries.getBundle(branding, testLocale, testNamespace);
      expect(merged).to.be.ok;
      expect(merged?.data?.section?.title).to.equal('Existing Title');
      expect(merged?.data?.section?.extra).to.equal('Added');
    } finally {
      fs.rmSync(localesDir, { recursive: true, force: true });
    }
  });

  it('updateBundleEnabled enables and disables bundles correctly', async function () {
    // First create a bundle to test with
    const testBundle = await fixture.services.I18nEntriesService.setBundle(branding, locale, ns + '-enabled-test', dataV1);
    expect(testBundle).to.be.ok;
    expect(testBundle).to.have.property('enabled', true); // Bundles are enabled by default

    // Disable the bundle
    const disabledBundle = await fixture.services.I18nEntriesService.updateBundleEnabled(branding, locale, ns + '-enabled-test', false);
    expect(disabledBundle).to.be.ok;
    expect(disabledBundle).to.have.property('enabled', false);
    expect(disabledBundle).to.have.property('locale', locale);
    expect(disabledBundle).to.have.property('namespace', ns + '-enabled-test');

    // Verify the change persisted by fetching the bundle again
    const fetchedDisabled = await fixture.services.I18nEntriesService.getBundle(branding, locale, ns + '-enabled-test');
    expect(fetchedDisabled).to.have.property('enabled', false);

    // Re-enable the bundle
    const enabledBundle = await fixture.services.I18nEntriesService.updateBundleEnabled(branding, locale, ns + '-enabled-test', true);
    expect(enabledBundle).to.be.ok;
    expect(enabledBundle).to.have.property('enabled', true);

    // Verify the change persisted
    const fetchedEnabled = await fixture.services.I18nEntriesService.getBundle(branding, locale, ns + '-enabled-test');
    expect(fetchedEnabled).to.have.property('enabled', true);
  });

  it('updateBundleEnabled throws error for non-existent bundle', async function () {
    try {
      await fixture.services.I18nEntriesService.updateBundleEnabled(branding, 'nonexistent', 'locale', true);
      expect.fail('Should have thrown an error for non-existent bundle');
    } catch (error) {
      expect(error).to.be.an('error');
      expect(error.message).to.include('Bundle not found');
      expect(error.message).to.include('nonexistent');
      expect(error.message).to.include('locale');
    }
  });


});
