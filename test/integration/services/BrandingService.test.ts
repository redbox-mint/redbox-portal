/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const _ = require('lodash');

describe('The BrandingService', function () {

  before(function (done) {
    done();
  });

  it('should have one brand', function (done) {
    var brands = BrandingService.getAvailable();
    brands.should.have.length(1);
    done();
  });

  it('should return the default brand', function (done) {
    var defBrand = BrandingService.getDefault();
    defBrand.should.have.property('name', 'default');
    defBrand = BrandingService.getBrand('default');
    defBrand.should.have.property('name', 'default');
    done();
  });

  it('should resolve the correct brand and portal', function (done) {
    var req = { 'params': { 'branding': sails.config.auth.defaultBrand, 'portal': sails.config.auth.defaultPortal } };
    var rootContext = BrandingService.getRootContext();
    var path = BrandingService.getBrandAndPortalPath(req);
    path.should.equal(rootContext + '/' + req.params.branding + '/' + req.params.portal);
    path = BrandingService.getBrandAndPortalPath({ params: {} });
    path.should.equal(rootContext + '/' + req.params.branding + '/' + req.params.portal);
    done();
  });

  // Task 5 tests for branding configuration functionality
  describe('Branding Configuration (Task 5)', function () {
    this.timeout(180000);
    const admin = { id: 'admin', displayName: 'Admin' };

    // Ensure each test runs with a clean branding state to avoid version/history interference
    beforeEach(async () => {
      const brand = await BrandingConfig.findOne({ name: 'default' });
      if (!brand) {
        throw new Error('Default brand not found - tests require a default brand to exist');
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

    async function revision() {
      const brand = await BrandingConfig.findOne({ name: 'default' });
      return brand.draftRevision || 0;
    }

    async function counters() {
      const brand = await BrandingConfig.findOne({ name: 'default' });
      return { expectedVersion: brand.version || 0, expectedDraftRevision: brand.draftRevision || 0 };
    }

    it('saveDraft accepts valid variables and rejects invalid keys', async () => {
      const state = await BrandingService.saveDraft({ branding: 'default', variables: { 'site-branding-area-background-color': '#ffffff' }, expectedDraftRevision: await revision(), actor: admin });
      expect(state.draft.variables).to.have.property('site-branding-area-background-color', '#ffffff');

      let err;
      try { await BrandingService.saveDraft({ branding: 'default', variables: { 'branding-font-family': 'Arial, sans-serif' }, expectedDraftRevision: state.draft.revision, actor: admin }); } catch (e) { err = e; }
      expect(err).to.exist;
      expect(err.message).to.match(/Invalid variable key/);
    });

    it('preview issues token and stores CSS', async () => {
      await BrandingService.saveDraft({ branding: 'default', variables: { 'site-branding-area-background-color': '#abcabc' }, expectedDraftRevision: await revision(), actor: admin });
      const { token, url, hash } = await BrandingService.preview('default', 'default', await revision());
      expect(token).to.match(/^[0-9a-f]{32}$/);
      expect(url).to.include(token);
      expect(hash).to.match(/^[0-9a-f]{32}$/);
      const data = await BrandingService.fetchPreview(token);
      expect(data.css).to.be.a('string');
      expect(data.css).to.include('--rb-site-branding-area-background-color: #abcabc;');
      expect(data.css).to.include('--mu-panel-bg: var(--rb-panel-branding-background-color, #b1101a);');
    });

    it('preview token expires after TTL', async () => {
      await BrandingService.saveDraft({ branding: 'default', variables: { 'site-branding-area-background-color': '#123123' }, expectedDraftRevision: await revision(), actor: admin });
      const { token } = await BrandingService.preview('default', 'default', await revision());
      const name = 'branding-preview:' + token;
      const entry = await CacheEntry.findOne({ name });
      // Manually age the entry beyond TTL
      const ttlSeconds = Number.isFinite(_.get(sails, 'config.branding.previewTtlSeconds')) ? sails.config.branding.previewTtlSeconds : 300;
      const expiredTs = Math.floor(Date.now() / 1000) - (ttlSeconds + 10);
      await CacheEntry.update({ id: entry.id }).set({ ts_added: expiredTs });
      let err; try { await BrandingService.fetchPreview(token); } catch (e) { err = e; }
      expect(err).to.exist;
      expect(err.message).to.match(/preview-expired/);
    });

    it('publish bumps version, changes hash, creates history + restore works', async () => {
      // Capture starting version in case other suites have already published
      const starting = await BrandingConfig.findOne({ name: 'default' });
      const baseVersion = (starting && starting.version) || 0;
      // First draft & publish
      await BrandingService.saveDraft({ branding: 'default', variables: { 'site-branding-area-background-color': '#aabbcc' }, expectedDraftRevision: await revision(), actor: admin });
      const pub1 = await BrandingService.publish('default', 'default', admin, await counters());
      expect(pub1.version).to.equal(baseVersion + 1);
      const brandAfterFirst = await BrandingConfig.findOne({ name: 'default' });
      const firstHash = brandAfterFirst.hash;
      const histories1 = await BrandingConfigHistory.find({ branding: brandAfterFirst.id });
      expect(histories1).to.have.length(1 + baseVersion); // include any pre-existing history entries
      expect(brandAfterFirst.css).to.include('--rb-site-branding-area-background-color: #aabbcc;');

      // Second draft & publish with different value
      await BrandingService.saveDraft({ branding: 'default', variables: { 'site-branding-area-background-color': '#112233' }, expectedDraftRevision: await revision(), actor: admin });
      const pub2 = await BrandingService.publish('default', 'default', admin, await counters());
      expect(pub2.version).to.equal(baseVersion + 2);
      const brandAfterSecond = await BrandingConfig.findOne({ name: 'default' });
      expect(brandAfterSecond.hash).to.not.equal(firstHash);
      const histories2 = await BrandingConfigHistory.find({ branding: brandAfterSecond.id }).sort('version ASC');
      // histories may include earlier versions; find the first version we created in this test
      const firstHistory = histories2.find(h => h.version === baseVersion + 1);

      // Restore the first version creates a new version with restored content
      const restoreRes = await BrandingService.restore({ branding: 'default', versionId: firstHistory.id, ...(await counters()), actor: admin });
      expect(restoreRes.version).to.equal(baseVersion + 3);
      const brandAfterRestore = await BrandingConfig.findOne({ name: 'default' });
      expect(brandAfterRestore.variables['site-branding-area-background-color']).to.equal('#aabbcc');
      expect(brandAfterRestore.hash).to.equal(firstHash);
      expect(brandAfterRestore.css).to.include('--rb-site-branding-area-background-color: #aabbcc;');
    });
  });
});
