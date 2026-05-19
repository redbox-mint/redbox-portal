let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

describe('BrandingThemeCssService', function () {
  beforeEach(function () {
    setupServiceTestGlobals();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
  });

  it('generates default runtime css and hash', function () {
    const { Services } = require('../../src/services/BrandingThemeCssService');
    const service = new Services.BrandingThemeCss();

    const result = service.generate({});

    expect(result.css).to.contain(':root {');
    expect(result.css).to.contain(':host {');
    expect(result.css).to.contain('--rb-site-branding-area-background-color: #b1101a;');
    expect(result.css).to.contain('--mu-panel-bg: var(--rb-panel-branding-background-color, #b1101a);');
    expect(result.css).to.contain('--bs-btn-hover-bg: var(--rb-primary);');
    expect(result.css).to.not.contain('background-color: var(--rb-primary) !important;\n  border-color: var(--rb-primary) !important;');
    expect(result.hash).to.match(/^[0-9a-f]{32}$/);
  });

  it('normalizes and validates hex values', function () {
    const { Services } = require('../../src/services/BrandingThemeCssService');
    const service = new Services.BrandingThemeCss();

    expect(service.normalizeHex('#ABC')).to.equal('#aabbcc');
    expect(service.normalizeHex('#AABBCC')).to.equal('#aabbcc');
    expect(() => service.validateVariables({ 'not-allowed': '#fff' })).to.throw(/Invalid variable key/);
    expect(() => service.validateVariables({ 'site-branding-area-background-color': 'rgb(0,0,0)' })).to.throw(/Invalid variable value/);
  });

  it('accepts explicit aliases and deterministic ordering', function () {
    const { Services } = require('../../src/services/BrandingThemeCssService');
    const service = new Services.BrandingThemeCss();

    const first = service.generate({
      'anchor-color': '#112233',
      'body-text-color': '#445566',
    });
    const second = service.generate({
      'body-text-color': '#445566',
      'anchor-color': '#112233',
    });
    const alias = service.generate({ 'site-branding-area-background-colour': '#123456' });

    expect(first.hash).to.equal(second.hash);
    expect(alias.css).to.contain('--rb-site-branding-area-background-color: #123456;');
    expect(first.css).to.contain('--mu-submit-btn-bg: var(--rb-submit-button-background-color, #428bca);');
  });

  it('ignores unknown legacy variables when generating css from stored branding data', function () {
    const { Services } = require('../../src/services/BrandingThemeCssService');
    const service = new Services.BrandingThemeCss();

    const result = service.generate({
      'site-branding-area-background-color': '#123456',
      'branding-font-family': 'Arial, sans-serif',
      'input-btn-font-size': '14px',
    });

    expect(result.css).to.contain('--rb-site-branding-area-background-color: #123456;');
    expect(result.css).to.not.contain('branding-font-family');
    expect(result.hash).to.match(/^[0-9a-f]{32}$/);
  });
});
