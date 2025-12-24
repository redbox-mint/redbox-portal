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
    const admin = { isAdmin: true };

    // Ensure each test runs with a clean branding state to avoid version/history interference
    beforeEach(async () => {
      const brand = await BrandingConfig.findOne({ name: 'default' });
      if (!brand) {
        throw new Error('Default brand not found - tests require a default brand to exist');
      }
      await BrandingConfig.update({ id: brand.id }).set({ css: '', hash: '', version: 0 });
      await BrandingConfigHistory.destroy({ branding: brand.id });
    });

    it('saveDraft accepts valid variables', async () => {
      const updated = await BrandingService.saveDraft({ branding: 'default', variables: { 'site-branding-area-background-color': '#ffffff' }, actor: admin });
      expect(updated.variables).to.have.property('site-branding-area-background-color', '#ffffff');
    });

    it('saveDraft rejects invalid variable key', async () => {
      let err; try { await BrandingService.saveDraft({ branding: 'default', variables: { 'not-allowed-var': '#fff' }, actor: admin }); } catch (e) { err = e; }
      expect(err).to.exist;
      expect(err.message).to.match(/Invalid variable key/);
    });

    it('saveDraft rejects contrast violations', async () => {
      // Provide two very similar colors for a validated pair
      let err; try {
        await BrandingService.saveDraft({ branding: 'default', variables: { 'primary-color': '#ffffff', 'primary-text-color': '#fefefe' }, actor: admin });
      } catch (e) { err = e; }
      expect(err).to.exist;
      expect(err.message).to.match(/contrast-violation/);
    });

    it('preview issues token and stores CSS', async () => {
      await BrandingService.saveDraft({ branding: 'default', variables: { 'site-branding-area-background-color': '#abcabc' }, actor: admin });
      const { token, url, hash } = await BrandingService.preview('default', 'default', admin);
      expect(token).to.match(/^[0-9a-f]{32}$/);
      expect(url).to.include(token);
      expect(hash).to.match(/^[0-9a-f]{32}$/);
      const data = await BrandingService.fetchPreview(token);
      expect(data.css).to.be.a('string');
    });

    it('preview token expires after TTL', async () => {
      await BrandingService.saveDraft({ branding: 'default', variables: { 'site-branding-area-background-color': '#123123' }, actor: admin });
      const { token } = await BrandingService.preview('default', 'default', admin);
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

    it('publish bumps version, changes hash, creates history + rollback works', async () => {
      // Capture starting version in case other suites have already published
      const starting = await BrandingConfig.findOne({ name: 'default' });
      const baseVersion = (starting && starting.version) || 0;
      // First draft & publish
      await BrandingService.saveDraft({ branding: 'default', variables: { 'site-branding-area-background-color': '#aabbcc' }, actor: admin });
      const pub1 = await BrandingService.publish('default', 'default', admin);
      expect(pub1.version).to.equal(baseVersion + 1);
      const brandAfterFirst = await BrandingConfig.findOne({ name: 'default' });
      const firstHash = brandAfterFirst.hash;
      const histories1 = await BrandingConfigHistory.find({ branding: brandAfterFirst.id });
      expect(histories1).to.have.length(1 + baseVersion); // include any pre-existing history entries

      // Second draft & publish with different value
      await BrandingService.saveDraft({ branding: 'default', variables: { 'site-branding-area-background-color': '#112233' }, actor: admin });
      const pub2 = await BrandingService.publish('default', 'default', admin);
      expect(pub2.version).to.equal(baseVersion + 2);
      const brandAfterSecond = await BrandingConfig.findOne({ name: 'default' });
      expect(brandAfterSecond.hash).to.not.equal(firstHash);
      const histories2 = await BrandingConfigHistory.find({ branding: brandAfterSecond.id }).sort('version ASC');
      // histories may include earlier versions; find the first version we created in this test
      const firstHistory = histories2.find(h => h.version === baseVersion + 1);

      // Rollback to first version
      const rollbackRes = await BrandingService.rollback(firstHistory.id, admin);
      expect(rollbackRes.version).to.equal(baseVersion + 1);
      const brandAfterRollback = await BrandingConfig.findOne({ name: 'default' });
      expect(brandAfterRollback.variables['site-branding-area-background-color']).to.equal('#aabbcc');
      expect(brandAfterRollback.hash).to.equal(firstHash);
    });
  });
});
