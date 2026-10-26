const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
import { fixtureRow, fixtureCreate, fixtureRemove } from '../../helpers/persistenceFixtures';
import assert from 'node:assert/strict';

// Durable preview behavior after the full portal lift.
describe('P5 portal cache selection and preview compatibility', function () {
  this.timeout(30_000);
  const core = () => require('@researchdatabox/redbox-core');
  const repository = () => core().getCacheEntryRepository(fixture.owner);
  let draftRevision: number;
  before(async () => {
    assert.equal(repository().constructor.name, 'PrismaCacheEntryRepository');
    const brand = await fixtureRow("BrandingConfig", { name: 'default' });
    draftRevision = brand.draftRevision || 0;
  });

  it('awaits draft persistence, returns scoped content, deletes a valid token and preserves the missing-token error', async () => {
    const preview = await fixture.services.BrandingService.preview('default', 'rdmp', draftRevision);
    const name = `branding-preview:${preview.token}`;
    const row = await repository().findByName(name);
    assert(row);
    assert.equal(row.data.branding, 'default');
    assert.equal(row.data.portal, 'rdmp');
    const data = await fixture.services.BrandingService.fetchPreview(preview.token);
    assert.equal(data.hash, preview.hash);
    assert.equal(data.branding, 'default');
    assert.equal(await repository().findByName(name), null);
    await assert.rejects(fixture.services.BrandingService.fetchPreview(preview.token), /^Error: preview-not-found$/);
    await assert.rejects(fixture.services.BrandingService.fetchPreview('missing-p5-token'), /^Error: preview-not-found$/);
  });

  it('deletes an expired preview before returning the unchanged expiry error', async () => {
    const preview = await fixture.services.BrandingService.preview('default', 'rdmp', draftRevision);
    const name = `branding-preview:${preview.token}`;
    const row = await repository().findByName(name);
    await repository().updateByName(name, {
      name,
      data: row.data,
      ts_added: Math.floor(Date.now() / 1000) - (fixture.config.branding.previewTtlSeconds ?? 300) - 10,
    });
    await assert.rejects(fixture.services.BrandingService.fetchPreview(preview.token), /^Error: preview-expired$/);
    assert.equal(await repository().findByName(name), null);
  });

  it('preserves HTTP CSS responses and 404 bodies for valid, consumed, expired and missing tokens', async () => {
    const preview = await fixture.services.BrandingService.preview('default', 'rdmp', draftRevision);
    const base = `http://127.0.0.1:${fixture.config.port}/default/rdmp/preview/`;
    const valid = await fetch(`${base}${preview.token}.css`);
    assert.equal(valid.status, 200);
    assert.match(valid.headers.get('content-type')!, /text\/css/);
    assert.equal(valid.headers.get('cache-control'), 'no-cache, no-store');
    assert((await valid.text()).length > 0);
    const conditionalPreview = await fixture.services.BrandingService.preview('default', 'rdmp', draftRevision);
    const conditional = await fetch(`${base}${conditionalPreview.token}.css`, {
      headers: { 'If-None-Match': valid.headers.get('etag')! },
    });
    assert.equal(conditional.status, 304);
    assert.equal(await repository().findByName(`branding-preview:${conditionalPreview.token}`), null);
    assert.equal((await fetch(`${base}${conditionalPreview.token}.css`)).status, 404);
    for (const token of [preview.token, 'p5missingtokencss']) {
      const missing = await fetch(`${base}${token}.css`);
      assert.equal(missing.status, 404);
      assert.equal(await missing.text(), '/* preview not found */');
    }
    const expired = await fixture.services.BrandingService.preview('default', 'rdmp', draftRevision);
    const name = `branding-preview:${expired.token}`;
    const row = await repository().findByName(name);
    await repository().updateByName(name, { name, data: row.data, ts_added: 1 });
    const response = await fetch(`${base}${expired.token}.css`);
    assert.equal(response.status, 404);
    assert.equal(await response.text(), '/* preview not found */');
    assert.equal(await repository().findByName(name), null);
  });

  it('previews retained versions without changing the draft and rejects versions belonging to another brand', async () => {
    const brand = await fixtureRow("BrandingConfig", { name: 'default' });
    const foreignBrand = await fixtureCreate("BrandingConfig", {
      name: 'p5-foreign-brand',
      css: '',
      hash: '',
      version: 0,
    });
    const own = await fixtureCreate("BrandingConfigHistory", {
      branding: brand.id,
      version: 501,
      css: '',
      hash: 'p5',
      variables: { 'site-branding-area-background-color': '#123456' },
    });
    const other = await fixtureCreate("BrandingConfigHistory", {
      branding: foreignBrand.id,
      version: 1,
      css: '',
      hash: 'p5-other',
      variables: {},
    });
    try {
      const preview = await fixture.services.BrandingService.previewVersion({ branding: 'default', portal: 'rdmp', versionId: own.id });
      const data = await fixture.services.BrandingService.fetchPreview(preview.token);
      assert.equal(data.versionId, own.id);
      assert.equal(data.branding, 'default');
      assert(data.css.includes('#123456'));
      assert.equal(await repository().findByName(`branding-preview:${preview.token}`), null);
      await assert.rejects(
        fixture.services.BrandingService.previewVersion({ branding: 'default', portal: 'rdmp', versionId: other.id }),
        error => error.code === 'history-not-found'
      );
      await assert.rejects(
        fixture.services.BrandingService.previewVersion({ branding: 'default', portal: 'rdmp', versionId: 'missing' }),
        error => error.code === 'history-not-found'
      );
      await assert.rejects(
        fixture.services.BrandingService.preview('p5-missing-brand', 'rdmp', 0),
        error => error.code === 'branding-not-found'
      );
      const after = await fixtureRow("BrandingConfig", { id: brand.id });
      assert.deepEqual(after.variables, brand.variables);
      assert.equal(after.draftRevision, brand.draftRevision);
    } finally {
      await fixtureRemove("BrandingConfigHistory", { id: [own.id, other.id] });
      await fixtureRemove("BrandingConfig", { id: foreignBrand.id });
    }
  });
});
