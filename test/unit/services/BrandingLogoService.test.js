/* eslint-disable no-unused-expressions */
const { expect } = require('chai');
const { createHash } = require('node:crypto');

describe('BrandingLogoService (Task 6)', () => {


  it('accepts and stores a PNG logo', async () => {
    const pngBuf = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000a49444154789c636000000200015c0d0a2db40000000049454e44ae426082', 'hex');
    const expectedHash = createHash('sha256').update(pngBuf).digest('hex');
    const res = await BrandingLogoService.putLogo({ branding: 'default', portal: 'default', fileBuffer: pngBuf, contentType: 'image/png' });
    expect(res.hash).to.match(/^[0-9a-f]{64}$/);
    expect(res.hash).to.equal(expectedHash);
    const brand = await BrandingConfig.findOne({ name: 'default' });
    expect(brand.logo).to.have.property('sha256', res.hash);
  });

  it('rejects unsupported content type', async () => {
    let err; try { await BrandingLogoService.putLogo({ branding: 'default', portal: 'default', fileBuffer: Buffer.from('test'), contentType: 'text/plain'}); } catch(e){ err = e; }
    expect(err).to.exist;
    expect(err.message).to.match(/logo-invalid/);
  });

  it('rejects oversized file', async () => {
    const big = Buffer.alloc(sails.config.branding.logoMaxBytes + 10, 0);
    let err; try { await BrandingLogoService.putLogo({ branding: 'default', portal: 'default', fileBuffer: big, contentType: 'image/png' }); } catch(e){ err = e; }
    expect(err).to.exist;
    expect(err.message).to.match(/logo-invalid: .*too-large/);
  });

  it('sanitizes unsafe SVG', async () => {
    const unsafe = Buffer.from('<svg><script>alert(1)</script></svg>');
    let err; try { await BrandingLogoService.putLogo({ branding: 'default', portal: 'default', fileBuffer: unsafe, contentType: 'image/svg+xml'}); } catch(e){ err = e; }
    expect(err).to.exist;
    expect(err.message).to.match(/svg-script-element/);
  });

  it('accepts safe minimal SVG', async () => {
    const safe = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000"/></svg>');
    const res = await BrandingLogoService.putLogo({ branding: 'default', portal: 'default', fileBuffer: safe, contentType: 'image/svg+xml'});
    expect(res.hash).to.match(/^[0-9a-f]{64}$/);
    expect(res.contentType).to.equal('image/svg+xml');
  const stored = await BrandingLogoService.getBinaryAsync(res.gridFsId);
  expect(stored).to.be.instanceOf(Buffer);
  const expectedHash = createHash('sha256').update(stored).digest('hex');
    expect(res.hash).to.equal(expectedHash);
  });

  it('overwrites existing logo and updates hash', async () => {
    const buf1 = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000a49444154789c636000000200015c0d0a2db40000000049454e44ae426082', 'hex');
    const first = await BrandingLogoService.putLogo({ branding: 'default', portal: 'default', fileBuffer: buf1, contentType: 'image/png' });
    const buf2 = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000005c72a8660000000a49444154789c636000000200015c0d0a2db40000000049454e44ae426082', 'hex');
    const second = await BrandingLogoService.putLogo({ branding: 'default', portal: 'default', fileBuffer: buf2, contentType: 'image/png' });
    expect(second.hash).to.not.equal(first.hash);
  });
});
