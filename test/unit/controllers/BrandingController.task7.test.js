/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const supertest = require('supertest');

// These tests exercise new Task 7 endpoints: themed CSS + preview + logo
// We run against the running sails app exposed in test environment (assumed localhost:1500)
// NOTE: Integration harness sets appUrl; we directly hit controller via sails.hooks.http.app if available.

describe('BrandingController Task 7 endpoints', () => {
  let request;
  before(() => {
    // Prefer in-memory express via sails if available; fallback to http://localhost:1500
    if (global.sails && sails.hooks && sails.hooks.http && sails.hooks.http.app) {
      request = supertest(sails.hooks.http.app);
    } else {
      request = supertest('http://localhost:1500');
    }
  });

  it('serves theme.css with ETag and 304 on replay', async () => {
    const branding = await BrandingConfig.findOne({ name: 'default' });
    if (!branding.css) {
      // publish once to ensure css present
      await BrandingService.publish('default', 'rdmp', { isAdmin: true });
    }
    const res1 = await request.get('/default/rdmp/styles/theme.css').expect(200);
    expect(res1.headers).to.have.property('etag');
    const etag = res1.headers.etag;
    await request.get('/default/rdmp/styles/theme.css').set('If-None-Match', etag).expect(304);
  });

  it('returns preview css and then 404 after ttl expiry simulation', async () => {
    const { token, url } = await BrandingService.preview('default', 'rdmp', { isAdmin: true });
    const res = await request.get(url).expect(200);
    expect(res.text).to.match(/\{\s*\/\* Using the default theme \*\//).to.be.false; // should be compiled
    // Force expire cache entry
    const name = `branding-preview:${token}`;
    await CacheEntry.update({ name }).set({ ts_added: 0 });
    await request.get(url).expect(404);
  });

  it('serves logo with ETag after upload', async () => {
    const pngBuf = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000a49444154789c636000000200015c0d0a2db40000000049454e44ae426082', 'hex');
    await BrandingLogoService.putLogo({ branding: 'default', portal: 'rdmp', fileBuffer: pngBuf, contentType: 'image/png', actor: { isAdmin: true } });
    const res1 = await request.get('/default/rdmp/images/logo').expect(200);
    expect(res1.headers).to.have.property('etag');
    const etag = res1.headers.etag;
    await request.get('/default/rdmp/images/logo').set('If-None-Match', etag).expect(304);
  });
});
