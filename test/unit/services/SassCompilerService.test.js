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

  it('accepts semantic variable override', async () => {
    const { css } = await SassCompilerService.compile({ 'site-branding-area-background': '#abc' });
    // Expect resulting CSS to contain compiled hex color #aabbcc (#abc expanded)
    expect(css).to.match(/#aabbcc/i);
  });
});
