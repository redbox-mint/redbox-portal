/*
 Integration tests for I18nEntriesService covering its public API.
 Follows the style of existing tests in test/unit/services.
*/

/* global sails, I18nEntriesService, I18nTranslation, I18nBundle, BrandingService, expect */

describe('I18nEntriesService', function () {
  this.timeout(10000);

  const branding = { id: `testbrand-i18n-${Date.now()}` };
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
      await I18nTranslation.destroy({ branding: branding.id }).fetch();
    } catch (e) { /* ignore */ }
    try {
      await I18nBundle.destroy({ branding: branding.id }).fetch();
    } catch (e) { /* ignore */ }
  }

  before(async function () {
    await cleanup();
  });

  after(async function () {
    await cleanup();
  });

  it('setBundle creates bundle and (optionally) splits to entries', async function () {
    const bundle = await I18nEntriesService.setBundle(branding, locale, ns, dataV1, { splitToEntries: true, overwriteEntries: true });
  expect(bundle).to.be.ok;
  expect(bundle).to.have.property('data');
  expect(bundle && bundle.data && bundle.data.section && bundle.data.section.title).to.equal('Hello');

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
  expect(b && b.data && b.data.section && b.data.section.title).to.equal('World');
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

  it('deleteEntry removes an entry', async function () {
    const ok = await I18nEntriesService.deleteEntry(branding, locale, ns, 'other.test');
    expect(ok).to.equal(true);
    const gone = await I18nEntriesService.getEntry(branding, locale, ns, 'other.test');
    expect(gone).to.equal(null);
  });

  it('getBundle returns the bundle by uid fields', async function () {
    const b = await I18nEntriesService.getBundle(branding, locale, ns);
    expect(b).to.be.ok;
    expect(b).to.have.property('locale', locale);
    expect(b).to.have.property('namespace', ns);
    expect(b).to.have.property('branding', branding.id);
  });

  it('bootstrap runs without throwing (skips if defaults missing)', async function () {
    await I18nEntriesService.bootstrap();
  });
});
