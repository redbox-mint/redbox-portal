/*
 Integration tests for I18nEntriesService covering its public API.
 Follows the style of existing tests in internal/test/unit/services.
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
        await I18nTranslation.destroy({ branding: branding.id }).fetch();
      }
    } catch (e) { /* ignore */ }
    try {
      if (branding?.id) {
        await I18nBundle.destroy({ branding: branding.id }).fetch();
      }
    } catch (e) { /* ignore */ }
    try {
      if (branding?.id) {
        await BrandingConfig.destroy({ id: branding.id }).fetch();
      }
    } catch (e) { /* ignore */ }
  }

  before(async function () {
    await cleanup();
    // Create a branding config to reference. Use random unique name to avoid clashes.
    const name = `testbrand-i18n-${Date.now()}`;
    const created = await BrandingConfig.create({ name }).fetch();
    branding = { id: created.id, name: created.name };
  });

  after(async function () {
    await cleanup();
  });

  it('setBundle creates bundle and splits to entries', async function () {
    const bundle = await I18nEntriesService.setBundle(branding, locale, ns, dataV1, undefined, { overwriteEntries: true });
  expect(bundle).to.be.ok;
  expect(bundle).to.have.property('data');
  expect(bundle?.data?.section?.title).to.equal('Hello');

    const got = await I18nEntriesService.getBundle(branding, locale, ns);
    expect(got).to.be.ok;
    expect(got).to.have.property('id');

    const entries = await I18nEntriesService.listEntries(branding, locale, ns);
    const flatKeys = entries.map(e => e.key);
    expect(flatKeys).to.include('section.title');
    expect(flatKeys).to.include('section.note');

    const titleEntry = entries.find(e => e.key === 'section.title');
    expect(titleEntry).to.have.property('value', 'Hello');
    expect(titleEntry).to.have.property('category', 'General');
    expect(titleEntry).to.have.property('description', 'Title text');
  });

  it('getEntry retrieves a specific key', async function () {
    const e = await I18nEntriesService.getEntry(branding, locale, ns, 'section.title');
    expect(e).to.be.ok;
    expect(e).to.have.property('key', 'section.title');
    expect(e).to.have.property('value', 'Hello');
  });

  it('setEntry updates an entry and syncs bundle JSON', async function () {
    const saved = await I18nEntriesService.setEntry(branding, locale, ns, 'section.title', 'World', { category: 'Changed', description: 'Changed desc' });
    expect(saved).to.be.ok;

    const e = await I18nEntriesService.getEntry(branding, locale, ns, 'section.title');
    expect(e).to.have.property('value', 'World');
    expect(e).to.have.property('category', 'Changed');
    expect(e).to.have.property('description', 'Changed desc');

  const b = await I18nEntriesService.getBundle(branding, locale, ns);
  expect(b).to.be.ok;
  expect(b?.data?.section?.title).to.equal('World');
  });

  it('listEntries supports keyPrefix filtering', async function () {
    // Add an extra entry with different prefix
    await I18nEntriesService.setEntry(branding, locale, ns, 'other.test', 'X');

    const prefixed = await I18nEntriesService.listEntries(branding, locale, ns, 'section.');
    expect(prefixed.length).to.be.greaterThan(0);
    const keys = prefixed.map(e => e.key);
    expect(keys.every(k => k.startsWith('section.'))).to.equal(true);
  });

  it('composeNamespace builds nested object from flat entries', function () {
    const composed = I18nEntriesService.composeNamespace([
      { key: 'a.b', value: 'x' },
      { key: 'a.c', value: 'y' },
      { key: 'd', value: 'z' }
    ]);
    expect(composed).to.deep.equal({ a: { b: 'x', c: 'y' }, d: 'z' });
  });

  it('syncEntriesFromBundle respects overwrite=false, then true', async function () {
    // First ensure baseline from V1 already in place from earlier test
    const e1 = await I18nEntriesService.getEntry(branding, locale, ns, 'section.title');
    expect(e1.value).to.equal('World');

  // Try to sync V2 without overwrite; should not change existing entry value
  const existingBundle = await I18nEntriesService.getBundle(branding, locale, ns);
  await I18nEntriesService.syncEntriesFromBundle({ branding, locale, namespace: ns, id: existingBundle.id, data: dataV2 }, false);
    const eNoOverwrite = await I18nEntriesService.getEntry(branding, locale, ns, 'section.title');
    expect(eNoOverwrite.value).to.equal('World');

  // Now overwrite = true
  await I18nEntriesService.syncEntriesFromBundle({ branding, locale, namespace: ns, id: existingBundle.id, data: dataV2 }, true);
    const eOverwrite = await I18nEntriesService.getEntry(branding, locale, ns, 'section.title');
    expect(eOverwrite.value).to.equal('World'); // value was already World from setEntry
    // But ensure another key is updated/created appropriately
    const note = await I18nEntriesService.getEntry(branding, locale, ns, 'section.note');
    expect(note).to.have.property('value', 'Second');
    expect(note).to.have.property('category', 'General');
  });

  it('syncEntriesFromBundle accepts bundle-like objects and defaults empty values', async function () {
    const objectNs = `${ns}-object-sync`;
    const data = { section: { title: 'FromObject', empty: '', nullish: null } };

    await I18nEntriesService.syncEntriesFromBundle({ branding: branding.id, locale, namespace: objectNs, data }, true);

    const title = await I18nEntriesService.getEntry(branding, locale, objectNs, 'section.title');
    expect(title).to.have.property('value', 'FromObject');

    const empty = await I18nEntriesService.getEntry({ _id: branding.id } as any, locale, objectNs, 'section.empty');
    expect(empty).to.have.property('value', 'section.empty');

    const nullish = await I18nEntriesService.getEntry(branding.id as any, locale, objectNs, 'section.nullish');
    expect(nullish).to.have.property('value', 'section.nullish');

    const bundle = await I18nEntriesService.getBundle(branding.id as any, locale, objectNs);
    expect(bundle).to.be.ok;
  });

  it('deleteEntry removes an entry', async function () {
  // Re-create the key (it may have been pruned during syncEntriesFromBundle overwrite phase)
  await I18nEntriesService.setEntry(branding, locale, ns, 'other.test', 'X');
  const ok = await I18nEntriesService.deleteEntry(branding, locale, ns, 'other.test');
    expect(ok).to.equal(true);
    const gone = await I18nEntriesService.getEntry(branding, locale, ns, 'other.test');
  expect(gone == null).to.equal(true); // allow null or undefined
  });

  it('getBundle returns the bundle by uid fields', async function () {
    const b = await I18nEntriesService.getBundle(branding, locale, ns);
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
    const localesDir = path.join(sails.config.appPath, 'language-defaults');
    const localeDir = path.join(localesDir, testLocale);
    const defaults = { section: { title: 'Default Title', extra: 'Added' } };
    const filePath = path.join(localeDir, `${testNamespace}.json`);
    const originalGetBrand = BrandingService.getBrand;

    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(defaults));

    try {
      // Point bootstrap at the test branding so we can assert against the same DB rows.
      BrandingService.getBrand = (name) => (name === 'default' ? branding : originalGetBrand?.call(BrandingService, name));

      await I18nEntriesService.setBundle(
        branding,
        testLocale,
        testNamespace,
        { section: { title: 'Existing Title' } },
        undefined,
        { overwriteEntries: true }
      );

      await I18nEntriesService.bootstrap([testLocale]);

      const merged = await I18nEntriesService.getBundle(branding, testLocale, testNamespace);
      expect(merged).to.be.ok;
      expect(merged?.data?.section?.title).to.equal('Existing Title');
      expect(merged?.data?.section?.extra).to.equal('Added');
    } finally {
      BrandingService.getBrand = originalGetBrand;
      try { fs.rmSync(localeDir, { recursive: true, force: true }); } catch (_e) { /* ignore */ }
    }
  });

  it('updateBundleEnabled enables and disables bundles correctly', async function () {
    // First create a bundle to test with
    const testBundle = await I18nEntriesService.setBundle(branding, locale, ns + '-enabled-test', dataV1);
    expect(testBundle).to.be.ok;
    expect(testBundle).to.have.property('enabled', true); // Bundles are enabled by default

    // Disable the bundle
    const disabledBundle = await I18nEntriesService.updateBundleEnabled(branding, locale, ns + '-enabled-test', false);
    expect(disabledBundle).to.be.ok;
    expect(disabledBundle).to.have.property('enabled', false);
    expect(disabledBundle).to.have.property('locale', locale);
    expect(disabledBundle).to.have.property('namespace', ns + '-enabled-test');

    // Verify the change persisted by fetching the bundle again
    const fetchedDisabled = await I18nEntriesService.getBundle(branding, locale, ns + '-enabled-test');
    expect(fetchedDisabled).to.have.property('enabled', false);

    // Re-enable the bundle
    const enabledBundle = await I18nEntriesService.updateBundleEnabled(branding, locale, ns + '-enabled-test', true);
    expect(enabledBundle).to.be.ok;
    expect(enabledBundle).to.have.property('enabled', true);

    // Verify the change persisted
    const fetchedEnabled = await I18nEntriesService.getBundle(branding, locale, ns + '-enabled-test');
    expect(fetchedEnabled).to.have.property('enabled', true);
  });

  it('updateBundleEnabled throws error for non-existent bundle', async function () {
    try {
      await I18nEntriesService.updateBundleEnabled(branding, 'nonexistent', 'locale', true);
      expect.fail('Should have thrown an error for non-existent bundle');
    } catch (error) {
      expect(error).to.be.an('error');
      expect(error.message).to.include('Bundle not found');
      expect(error.message).to.include('nonexistent');
      expect(error.message).to.include('locale');
    }
  });

  
});
