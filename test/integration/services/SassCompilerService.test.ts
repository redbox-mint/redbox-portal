/* eslint-disable no-unused-expressions */
const { expect } = require('chai');

describe('SassCompilerService', () => {
  it('compiles with no overrides', async () => {
    const { css, hash } = await SassCompilerService.compile({});
    expect(css).to.be.a('string');
    expect(hash).to.match(/^[0-9a-f]{32}$/);
  });

  it('rejects invalid variable key', async () => {
    let err;
    try { await SassCompilerService.compile({ 'non-existent-var': '#fff' }); } catch (e) { err = e; }
    expect(err).to.exist;
    expect(String(err.message)).to.match(/Invalid variable/);
  });

  it('accepts semantic variable override', async function () {
    const { css } = await SassCompilerService.compile({ 'site-branding-area-background-color': '#abc' });

    // Test should check for the actual color value that SCSS outputs
    // SCSS preserves 3-digit hex format when it's valid, so we check for #abc not #aabbcc
    css.should.match(/#abc/i);
  });
});
