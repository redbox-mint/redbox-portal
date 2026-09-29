/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const supertest = require('supertest');

const FONTS_DIR = path.join('test', 'resources', 'fonts');
const REGULAR_FONT = path.join(FONTS_DIR, 'test-font-regular.woff2');
const BOLD_FONT = path.join(FONTS_DIR, 'test-font-bold.woff2');
const VARIABLE_FONT = path.join(FONTS_DIR, 'test-font-variable.woff2');
const TRUNCATED_FONT = path.join(FONTS_DIR, 'test-font-truncated.woff2');

describe('Branding typeface lifecycle (mounted)', function () {
  this.timeout(180000);
  const admin = { id: 'admin', displayName: 'Admin' };
  let agent;

  before(async function () {
    const app = sails.hooks.http.app;
    agent = supertest.agent(app);
    await agent
      .post('/user/login_local')
      .set('X-Source', 'jsclient')
      .send({ username: 'admin', password: 'rbadmin', branding: 'default', portal: 'rdmp' })
      .expect(200);
  });

  beforeEach(async function () {
    const brand = await BrandingConfig.findOne({ name: 'default' });
    if (!brand) {
      throw new Error('Default brand not found');
    }
    await BrandingConfig.update({ id: brand.id }).set({
      css: '',
      hash: '',
      version: 0,
      variables: {},
      typeface: null,
      draftTypeface: null,
      draftRevision: 0,
    });
    await BrandingConfigHistory.destroy({ branding: brand.id });
  });

  async function counters() {
    const brand = await BrandingConfig.findOne({ name: 'default' });
    return { expectedVersion: brand.version || 0, expectedDraftRevision: brand.draftRevision || 0 };
  }

  it('runs the typeface backfill migration idempotently against legacy-shaped data', async function () {
    const loaded = require('../../../api/migrations/20260904000000-branding-typeface-backfill.js');
    const backfill = Array.isArray(loaded) ? loaded[0] : loaded;
    const brand = await BrandingConfig.findOne({ name: 'default' });
    // Realistic legacy state: active version/hash/css matching history v2,
    // with typeface fields absent everywhere.
    await BrandingConfig.update({ id: brand.id }).set({ version: 2, hash: 'h2', css: 'c2', variables: {} });
    await BrandingConfigHistory.create({ branding: brand.id, version: 1, hash: 'h1', css: 'c1', variables: {} });
    await BrandingConfigHistory.create({ branding: brand.id, version: 2, hash: 'h2', css: 'c2', variables: {} });
    await backfill.up({ context: sails });
    const histories = await BrandingConfigHistory.find({ branding: brand.id }).sort('version ASC');
    expect(histories.map(h => h.version)).to.deep.equal([1, 2]);
    expect(histories.every(h => h.typeface === null)).to.equal(true);
    const before = JSON.stringify(histories.map(h => ({ version: h.version, typeface: h.typeface })));
    await backfill.up({ context: sails });
    const after = await BrandingConfigHistory.find({ branding: brand.id }).sort('version ASC');
    expect(JSON.stringify(after.map(h => ({ version: h.version, typeface: h.typeface })))).to.equal(before);
  });

  it('covers a complete service lifecycle from upload through restore and default', async function () {
    const regularBytes = fs.readFileSync(REGULAR_FONT);
    const boldBytes = fs.readFileSync(BOLD_FONT);
    const face = await BrandingTypefaceService.inspectAndStoreFace({
      brandingId: (await BrandingConfig.findOne({ name: 'default' })).id,
      slot: 'regular',
      bytes: regularBytes,
      originalFilename: 'regular.woff2',
      existingFaces: [],
    });
    expect(face.sha256).to.match(/^[0-9a-f]{64}$/);

    await BrandingService.uploadTypefaceFace({
      branding: 'default',
      slot: 'regular',
      bytes: regularBytes,
      originalFilename: 'regular.woff2',
      expectedDraftRevision: 0,
      actor: admin,
    });
    await BrandingService.uploadTypefaceFace({
      branding: 'default',
      slot: 'bold',
      bytes: boldBytes,
      originalFilename: 'bold.woff2',
      expectedDraftRevision: 1,
      actor: admin,
    });

    let rejected;
    try {
      await BrandingService.uploadTypefaceFace({
        branding: 'default',
        slot: 'italic',
        bytes: fs.readFileSync(VARIABLE_FONT),
        expectedDraftRevision: 2,
        actor: admin,
      });
    } catch (e) {
      rejected = e;
    }
    expect(rejected).to.exist;
    expect(rejected.code).to.equal('typeface-variable-font');

    try {
      await BrandingService.uploadTypefaceFace({
        branding: 'default',
        slot: 'italic',
        bytes: fs.readFileSync(TRUNCATED_FONT),
        expectedDraftRevision: 2,
        actor: admin,
      });
      throw new Error('expected truncation rejection');
    } catch (e) {
      expect(e.code).to.equal('typeface-invalid-font');
    }

    const preview = await BrandingService.preview('default', 'rdmp', 2);
    expect(preview.token).to.match(/^[0-9a-f]{32}$/);
    const fetched = await BrandingService.fetchPreview(preview.token);
    expect(fetched.css).to.contain('ReDBox Brand Typeface');

    const published = await BrandingService.publish('default', 'rdmp', admin, await counters());
    expect(published.version).to.equal(1);

    const brand = await BrandingConfig.findOne({ name: 'default' });
    const stored = await BrandingTypefaceService.readFace(brand.id, face.sha256);
    expect(Buffer.from(stored).equals(regularBytes)).to.equal(true);

    // Shared draft conflict across sessions.
    let conflict;
    try {
      await BrandingService.saveDraft({
        branding: 'default',
        variables: { primary: '#ffffff' },
        expectedDraftRevision: 2,
        actor: admin,
      });
    } catch (e) {
      conflict = e;
    }
    expect(conflict).to.exist;
    expect(conflict.code).to.equal('branding-conflict');

    const versions = await BrandingService.listVersions('default');
    expect(versions).to.have.length(1);
    const restored = await BrandingService.restore({
      branding: 'default',
      versionId: versions[0].id,
      ...(await counters()),
      actor: admin,
    });
    expect(restored.version).to.equal(2);

    // Deprecated rollback alias keeps restore semantics.
    const rolled = await BrandingService.rollback(versions[0].id, admin, {
      branding: 'default',
      ...(await counters()),
    });
    expect(rolled.version).to.equal(3);

    await BrandingService.useDefaultTypography({
      branding: 'default',
      expectedDraftRevision: (await counters()).expectedDraftRevision,
      actor: admin,
    });
    const republished = await BrandingService.publish('default', 'rdmp', admin, await counters());
    const state = await BrandingService.getAdminState('default');
    expect(state.active.typeface.mode).to.equal('default');
    expect(republished.version).to.be.greaterThan(3);
  });

  it('serves the published face over public GET and HEAD without a session', async function () {
    const regularBytes = fs.readFileSync(REGULAR_FONT);
    await BrandingService.uploadTypefaceFace({
      branding: 'default',
      slot: 'regular',
      bytes: regularBytes,
      originalFilename: 'regular.woff2',
      expectedDraftRevision: 0,
      actor: admin,
    });
    await BrandingService.publish('default', 'rdmp', admin, await counters());
    const state = await BrandingService.getAdminState('default');
    const sha = state.active.typeface.faces.regular.sha256;

    const getRes = await supertest(sails.hooks.http.app).get(`/fonts/branding/default/${sha}.woff2`);
    expect(getRes.status, `public font GET body: ${getRes.text}`).to.equal(200);
    expect(getRes.headers['content-type']).to.contain('font/woff2');
    expect(getRes.headers['cache-control']).to.contain('immutable');
    expect(getRes.headers.etag).to.equal(`"${sha}"`);

    const headRes = await supertest(sails.hooks.http.app).head(`/fonts/branding/default/${sha}.woff2`).expect(200);
    expect(headRes.headers.etag).to.equal(`"${sha}"`);
    expect(headRes.text ?? '').to.equal('');

    await supertest(sails.hooks.http.app)
      .get(`/fonts/branding/default/${'0'.repeat(64)}.woff2`)
      .expect(404);
  });

  it('drives the AJAX journey from config through restore with conflicts and policy denial', async function () {
    const config = await agent.get('/default/rdmp/app/branding/config').expect(200);
    expect(config.body.draft, `AJAX config body: ${JSON.stringify(config.body).slice(0, 500)}`).to.exist;
    expect(config.body.draft.revision).to.equal(0);
    expect(config.body.versions).to.be.an('array');

    await agent
      .post('/default/rdmp/app/branding/draft')
      .send({ variables: { primary: '#123123' }, expectedDraftRevision: 99 })
      .expect(409);
    const saved = await agent
      .post('/default/rdmp/app/branding/draft')
      .send({ variables: { primary: '#123123' }, expectedDraftRevision: 0 })
      .expect(200);
    expect(saved.body.draft.revision).to.equal(1);

    const uploaded = await agent
      .put('/default/rdmp/app/branding/draft/typeface/faces/regular')
      .field('expectedDraftRevision', '1')
      .attach('face', REGULAR_FONT)
      .expect(200);
    expect(uploaded.body.draft.typeface.faces.regular.sha256).to.match(/^[0-9a-f]{64}$/);

    const published = await agent
      .post('/default/rdmp/app/branding/publish')
      .send({ expectedVersion: 0, expectedDraftRevision: 2 })
      .expect(200);
    expect(published.body.active.version).to.equal(1);

    const versions = await agent.get('/default/rdmp/app/branding/versions').expect(200);
    expect(versions.body).to.have.length(1);

    const versionPreview = await agent
      .post(`/default/rdmp/app/branding/versions/${versions.body[0].id}/preview`)
      .send({})
      .expect(200);
    expect(versionPreview.body.token).to.exist;

    const restored = await agent
      .post(`/default/rdmp/app/branding/restore/${versions.body[0].id}`)
      .send({ expectedVersion: 1, expectedDraftRevision: 3 })
      .expect(200);
    expect(restored.body.active.version).to.equal(2);

    const rolled = await agent
      .post(`/default/rdmp/app/branding/rollback/${versions.body[0].id}`)
      .send({ expectedVersion: 2, expectedDraftRevision: 4 })
      .expect(200);
    expect(rolled.headers.deprecation).to.equal('true');
    expect(rolled.body.active.version).to.equal(3);

    // Non-admin policy denial (JSON content type yields 403, not a login redirect).
    await supertest(sails.hooks.http.app)
      .get('/default/rdmp/app/branding/config')
      .set('Content-Type', 'application/json')
      .expect(403);
  });
});
