/* eslint-disable no-unused-expressions */
const { expect } = require('chai');

describe('BrandingThemeCssService', () => {
  it('generates defaults when variables are empty', async () => {
    const { css, hash } = await BrandingThemeCssService.generate({});
    expect(css).to.be.a('string');
    expect(css).to.include(':root {');
    expect(css).to.include('--rb-site-branding-area-background-color: #b1101a;');
    expect(css).to.include('--mu-panel-bg: var(--rb-panel-branding-background-color, #b1101a);');
    expect(hash).to.match(/^[0-9a-f]{32}$/);
  });

  it('normalizes 3-digit and uppercase hex values', async () => {
    const { css } = await BrandingThemeCssService.generate({ 'site-branding-area-background-color': '#ABC' });
    expect(css).to.include('--rb-site-branding-area-background-color: #aabbcc;');
  });

  it('ignores unknown keys and falls back to defaults for non-hex values during generation', async () => {
    const keyResult = await BrandingThemeCssService.generate({ 'not-allowed': '#fff' });
    expect(keyResult.css).to.include('--rb-site-branding-area-background-color: #b1101a;');
    expect(keyResult.css).to.not.include('not-allowed');

    const valueResult = await BrandingThemeCssService.generate({ 'site-branding-area-background-color': 'rgb(0,0,0)' });
    expect(valueResult.css).to.include('--rb-site-branding-area-background-color: #b1101a;');
    expect(valueResult.css).to.not.include('--rb-site-branding-area-background-color: rgb(0,0,0);');
  });

  it('rejects unknown keys and non-hex values during strict validation', async () => {
    let keyErr;
    try { await BrandingThemeCssService.validateVariables({ 'not-allowed': '#fff' }); } catch (e) { keyErr = e; }
    expect(keyErr).to.exist;
    expect(String(keyErr.message)).to.match(/Invalid variable key/);

    let valueErr;
    try { await BrandingThemeCssService.validateVariables({ 'site-branding-area-background-color': 'rgb(0,0,0)' }); } catch (e) { valueErr = e; }
    expect(valueErr).to.exist;
    expect(String(valueErr.message)).to.match(/Invalid variable value/);
  });

  it('supports explicit aliases only where configured', async () => {
    const { css } = await BrandingThemeCssService.generate({ 'site-branding-area-background-colour': '#123456' });
    expect(css).to.include('--rb-site-branding-area-background-color: #123456;');
  });

  it('hash is deterministic regardless of object key order', async () => {
    const first = await BrandingThemeCssService.generate({
      'anchor-color': '#112233',
      'body-text-color': '#445566',
    });
    const second = await BrandingThemeCssService.generate({
      'body-text-color': '#445566',
      'anchor-color': '#112233',
    });
    expect(first.hash).to.equal(second.hash);
    expect(first.css).to.equal(second.css);
  });

  it('generates compatibility tokens for micro apps and print bridge', async () => {
    const { css } = await BrandingThemeCssService.generate({});
    expect(css).to.include('--mu-panel-bg: var(--rb-panel-branding-background-color, #b1101a);');
    expect(css).to.include('--rb-print-brand-accent: var(--rb-site-branding-area-background-color, #b1101a);');
    expect(css).to.include('--rb-print-cell-border: var(--rb-panel-branding-border-color, #dddddd);');
    expect(css).to.include('.btn-primary');
  });
});
