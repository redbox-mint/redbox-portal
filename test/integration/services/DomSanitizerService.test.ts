/* eslint-disable no-unused-expressions */
const { expect } = require('chai');

describe('DomSanitizerService', () => {
  it('accepts a minimal safe SVG', async () => {
    const input = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#000"/></svg>';
    const res = await DomSanitizerService.sanitize(input);
    expect(res.safe).to.be.true;
    expect(res.errors).to.be.empty;
    expect(res.sanitized).to.include('<svg');
  });

  it('rejects SVG with script tag', async () => {
    const input = '<svg><script>alert(1)</script></svg>';
    const res = await DomSanitizerService.sanitize(input);
    expect(res.safe).to.be.false;
    expect(res.errors).to.include('script-element');
  });

  it('rejects SVG with foreignObject', async () => {
    const input = '<svg><foreignObject><div>Hi</div></foreignObject></svg>';
    const res = await DomSanitizerService.sanitize(input);
    expect(res.safe).to.be.false;
    expect(res.errors).to.include('foreign-object');
  });

  it('rejects external href references', async () => {
    const input = '<svg><image href="https://evil.example/x.png"/></svg>';
    const res = await DomSanitizerService.sanitize(input);
    expect(res.safe).to.be.false;
    expect(res.errors).to.include('external-ref');
  });

  it('rejects embedded data URL image', async () => {
    const input = '<svg><image href="data:image/png;base64,AAAA"/></svg>';
    const res = await DomSanitizerService.sanitize(input);
    expect(res.safe).to.be.false;
    expect(res.errors).to.include('data-url-embed');
  });

  it('flags and strips event handlers', async () => {
    const input = '<svg><rect width="10" height="10" onclick="alert(1)"/></svg>';
    const res = await DomSanitizerService.sanitize(input);
    // Event handlers are stripped and reported as a warning only; sanitized output should be considered safe
    expect(res.safe).to.be.true;
    expect(res.warnings).to.include('event-handlers-removed');
    expect(res.errors).to.not.include('event-handlers-removed');
    expect(res.sanitized).to.not.include('onclick=');
  });

});
