/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const supertest = require('supertest');
const { csrfToken, loginSession } = require('../helpers/admin-session');

// Uses throwaway brands exclusively: never reset, publish or restore default.
describe('Branding image drafts (mounted)', function () {
  this.timeout(60000);
  let brand;
  let other;
  let admin;
  let csrf;
  let prefix;
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS/8AAAAASUVORK5CYII=',
    'base64'
  );

  before(async function () {
    const suffix = Date.now();
    brand = await BrandingConfig.create({ name: `branding-draft-test-${suffix}` });
    other = await BrandingConfig.create({ name: `branding-other-test-${suffix}` });
    await BrandingService.refreshBrandingCache(brand.id);
    await BrandingService.refreshBrandingCache(other.id);
    prefix = `/${brand.name}/rdmp/app/branding`;
    admin = await loginSession();
    csrf = await csrfToken(admin);
    // Grant the logged-in admin the test brand Admin role using the same brand
    // association as production authorization, and refresh the session below.
    const role = await Role.create({ name: 'Admin', branding: brand.id });
    await BrandingService.refreshBrandingCache(brand.id);
    const user = await User.findOne({ username: 'admin' });
    await User.addToCollection(user.id, 'roles').members([role.id]);
    admin = await loginSession();
    csrf = await csrfToken(admin);
  });

  after(async function () {
    for (const item of [brand, other].filter(Boolean)) {
      const current = await BrandingConfig.findOne({ id: item.id });
      const versions = await BrandingConfigHistory.find({ branding: item.id });
      const keys = new Set(
        [
          current?.logo,
          current?.favicon,
          ...Object.values(current?.draftImages ?? {}),
          ...versions.flatMap(version => Object.values(version.images ?? {})),
        ]
          .map((asset: any) => asset?.storageKey)
          .filter(Boolean)
      );
      for (const key of keys) await StorageManagerService.primaryDisk().delete(String(key));
      await BrandingConfigHistory.destroy({ branding: item.id });
      const roles = await Role.find({ branding: item.id });
      for (const role of roles) await Role.destroy({ id: role.id });
      await BrandingConfig.destroy({ id: item.id });
    }
    await BrandingService.loadAvailableBrands(null).toPromise();
  });

  it('isolates uploads, promotes and versions images, restores and atomically resets', async function () {
    const live = await supertest(sails.hooks.http.app).get(`/${brand.name}/rdmp/images/logo`).expect(200);
    const response = await admin
      .post(`${prefix}/logo`)
      .set('X-CSRF-Token', csrf)
      .field('expectedDraftRevision', '0')
      .attach('logo', image, { filename: 'draft.png', contentType: 'image/png' })
      .expect(200);
    expect(response.body.draft.dirty.logo).to.equal(true);
    const unchanged = await supertest(sails.hooks.http.app).get(`/${brand.name}/rdmp/images/logo`).expect(200);
    expect(unchanged.body).to.deep.equal(live.body);
    const preview = await BrandingService.preview(brand.name, 'rdmp', 1);
    await admin.get(preview.images.logo).expect(200);
    await admin.get(`/${other.name}/rdmp/app/branding/draft/images/logo?preview=${preview.token}`).expect(403);
    const published = await BrandingService.publish(
      brand.name,
      'rdmp',
      {},
      { expectedVersion: 0, expectedDraftRevision: 1 }
    );
    expect(published.state.versions[0].images).to.deep.equal(published.state.active.images);
    await BrandingService.uploadImage({
      branding: brand.name,
      kind: 'favicon',
      fileBuffer: image,
      contentType: 'image/png',
      expectedDraftRevision: 2,
    });
    await BrandingService.publish(brand.name, 'rdmp', {}, { expectedVersion: 1, expectedDraftRevision: 3 });
    const restored = await BrandingService.restore({
      branding: brand.name,
      versionId: published.state.versions[0].id,
      expectedVersion: 2,
      expectedDraftRevision: 4,
    });
    expect(restored.state.active.images).to.deep.equal(published.state.active.images);
    await BrandingService.saveDraft({
      branding: brand.name,
      variables: { primary: '#123456' },
      expectedDraftRevision: 5,
    });
    const reset = await admin
      .post(`${prefix}/draft/reset`)
      .set('X-CSRF-Token', csrf)
      .send({ expectedVersion: 3, expectedDraftRevision: 6 })
      .expect(200);
    expect(Object.values(reset.body.draft.dirty).every(value => value === false)).to.equal(true);
    await admin.get(preview.images.logo).expect(200);
    expect((await BrandingConfig.findOne({ id: other.id })).draftRevision).to.equal(0);
  });

  it('rejects unauthenticated, wrong-brand Admin, missing-CSRF and stale resets', async function () {
    await admin.get(`/${other.name}/rdmp/app/branding/draft/images/logo`).expect(403);
    await admin
      .post(`/${other.name}/rdmp/app/branding/draft/reset`)
      .set('X-CSRF-Token', csrf)
      .send({ expectedVersion: 0, expectedDraftRevision: 0 })
      .expect(403);
    await supertest(sails.hooks.http.app)
      .post(`${prefix}/draft/reset`)
      .send({ expectedVersion: 0, expectedDraftRevision: 0 })
      .expect(403);
    await admin.post(`${prefix}/draft/reset`).send({ expectedVersion: 0, expectedDraftRevision: 0 }).expect(403);
    await admin
      .post(`${prefix}/draft/reset`)
      .set('X-CSRF-Token', csrf)
      .send({ expectedVersion: 0, expectedDraftRevision: 0 })
      .expect(409);
  });
});
