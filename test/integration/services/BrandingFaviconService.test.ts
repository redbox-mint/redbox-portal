/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const { createHash } = require('node:crypto');

describe('BrandingLogoService favicon', () => {

  it('accepts and stores a PNG favicon', async () => {
    const pngBuf = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000a49444154789c636000000200015c0d0a2db40000000049454e44ae426082', 'hex');
    const expectedHash = createHash('sha256').update(pngBuf).digest('hex');
    const res = await BrandingLogoService.putFavicon({ branding: 'default', portal: 'default', fileBuffer: pngBuf, contentType: 'image/png' });
    expect(res.hash).to.match(/^[0-9a-f]{64}$/);
    expect(res.hash).to.equal(expectedHash);
    expect(res.storageKey).to.equal(`default/default/images/favicon-${expectedHash}.png`);
    const brand = await BrandingConfig.findOne({ name: 'default' });
    expect(brand.favicon).to.have.property('sha256', res.hash);
  });

  it('accepts an ICO favicon', async () => {
    const icoBuf = Buffer.from('00000100010010101000010004002806000016000000', 'hex');
    const expectedHash = createHash('sha256').update(icoBuf).digest('hex');
    const res = await BrandingLogoService.putFavicon({ branding: 'default', portal: 'default', fileBuffer: icoBuf, contentType: 'image/x-icon' });
    expect(res.contentType).to.equal('image/x-icon');
    expect(res.storageKey).to.equal(`default/default/images/favicon-${expectedHash}.ico`);
  });

  it('rejects unsupported content type', async () => {
    let err; try { await BrandingLogoService.putFavicon({ branding: 'default', portal: 'default', fileBuffer: Buffer.from('test'), contentType: 'image/jpeg' }); } catch (e) { err = e; }
    expect(err).to.exist;
    expect(err.message).to.match(/favicon-invalid: .*unsupported-type/);
  });

  it('rejects oversized file', async () => {
    const originalLimit = sails.config.branding.faviconMaxBytes;
    sails.config.branding.faviconMaxBytes = 100;
    const big = Buffer.alloc(110, 0);
    let err; try { await BrandingLogoService.putFavicon({ branding: 'default', portal: 'default', fileBuffer: big, contentType: 'image/png' }); } catch (e) { err = e; }
    sails.config.branding.faviconMaxBytes = originalLimit;
    expect(err).to.exist;
    expect(err.message).to.match(/favicon-invalid: .*too-large/);
  });

  it('sanitizes unsafe SVG', async () => {
    const unsafe = Buffer.from('<svg><script>alert(1)</script></svg>');
    let err; try { await BrandingLogoService.putFavicon({ branding: 'default', portal: 'default', fileBuffer: unsafe, contentType: 'image/svg+xml' }); } catch (e) { err = e; }
    expect(err).to.exist;
    expect(err.message).to.match(/svg-script-element/);
  });

  it('accepts safe minimal SVG', async () => {
    const safe = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000"/></svg>');
    const expectedHash = createHash('sha256').update(safe).digest('hex');
    const res = await BrandingLogoService.putFavicon({ branding: 'default', portal: 'default', fileBuffer: safe, contentType: 'image/svg+xml' });
    expect(res.hash).to.match(/^[0-9a-f]{64}$/);
    expect(res.contentType).to.equal('image/svg+xml');
    expect(res.storageKey).to.equal(`default/default/images/favicon-${expectedHash}.svg`);
    const stored = await BrandingLogoService.getBinaryAsync(res.gridFsId);
    expect(stored).to.be.instanceOf(Buffer);
  });
});
