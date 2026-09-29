let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import fs from 'fs';
import path from 'path';
import { setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';
import type { BrandingTypefaceFace, BrandingTypefaceState } from '../../src/model/BrandingTypeface';

const FACE_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function testFace(slot: BrandingTypefaceFace['slot'], sha: string = FACE_SHA): BrandingTypefaceFace {
  return {
    slot,
    sha256: sha,
    originalFilename: `${slot} <evil>.woff2`,
    sizeBytes: 1024,
    uploadedAt: '2026-01-01T00:00:00.000Z',
    inspection: { family: 'Embedded Family', subfamily: 'Bold' },
    warnings: [],
  };
}

function customState(
  slots: Array<BrandingTypefaceFace['slot']> = ['regular', 'bold', 'italic', 'boldItalic']
): BrandingTypefaceState {
  const faces: BrandingTypefaceState['faces'] = {};
  slots.forEach((slot, index) => {
    faces[slot] = testFace(slot, `${index}`.repeat(64));
  });
  return { mode: 'custom', faces };
}

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
    expect(result.css).to.contain('--rb-logo-heading-text-color: #ffffff;');
    expect(result.css).to.contain('--mu-panel-bg: var(--rb-panel-branding-background-color, #b1101a);');
    expect(result.css).to.contain('--bs-btn-hover-bg: var(--rb-primary);');
    expect(result.css).to.not.contain(
      'background-color: var(--rb-primary) !important;\n  border-color: var(--rb-primary) !important;'
    );
    expect(result.hash).to.match(/^[0-9a-f]{32}$/);
  });

  it('normalizes and validates hex values', function () {
    const { Services } = require('../../src/services/BrandingThemeCssService');
    const service = new Services.BrandingThemeCss();

    expect(service.normalizeHex('#ABC')).to.equal('#aabbcc');
    expect(service.normalizeHex('#AABBCC')).to.equal('#aabbcc');
    expect(() => service.validateVariables({ 'not-allowed': '#fff' })).to.throw(/Invalid variable key/);
    expect(() => service.validateVariables({ 'site-branding-area-background-color': 'rgb(0,0,0)' })).to.throw(
      /Invalid variable value/
    );
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
    const logoHeading = service.generate({ 'logo-heading-text-colour': '#abcdef' });

    expect(first.hash).to.equal(second.hash);
    expect(alias.css).to.contain('--rb-site-branding-area-background-color: #123456;');
    expect(logoHeading.css).to.contain('--rb-logo-heading-text-color: #abcdef;');
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

  it('falls back to the default when a stored known token has a non-hex value', function () {
    const { Services } = require('../../src/services/BrandingThemeCssService');
    const service = new Services.BrandingThemeCss();

    const result = service.generate({
      'anchor-color': 'blue',
    });

    expect(result.css).to.contain('--rb-anchor-color: #337ab7;');
    expect(result.css).to.not.contain('--rb-anchor-color: blue;');
    expect(result.hash).to.match(/^[0-9a-f]{32}$/);
  });

  it('emits no typeface CSS for Default Typography', function () {
    const { Services } = require('../../src/services/BrandingThemeCssService');
    const service = new Services.BrandingThemeCss();

    const plain = service.generate({});
    const explicit = service.generate({}, { typeface: null });
    const normalized = service.generate({}, { typeface: { mode: 'default', faces: {} } });
    expect(plain.css).to.equal(explicit.css);
    expect(plain.css).to.equal(normalized.css);
    expect(plain.css).to.not.contain('@font-face');
    expect(plain.css).to.not.contain('--rb-brand-font-family');
    expect(plain.css).to.not.contain('ReDBox Brand Typeface');
  });

  it('emits ordered @font-face rules and the brand variable for a custom typeface', function () {
    const { Services } = require('../../src/services/BrandingThemeCssService');
    const service = new Services.BrandingThemeCss();

    const result = service.generate({}, { typeface: customState(), brandName: 'default' });
    const faces = result.css.split('@font-face');
    expect(faces.length - 1).to.equal(4);
    const order = ['0'.repeat(64), '1'.repeat(64), '2'.repeat(64), '3'.repeat(64)].map(sha => result.css.indexOf(sha));
    expect(order.every(index => index >= 0)).to.equal(true);
    expect([...order].sort((a, b) => a - b)).to.deep.equal(order);
    expect(result.css).to.contain('font-style: normal;\n  font-weight: 400;');
    expect(result.css).to.contain('font-style: normal;\n  font-weight: 700;');
    expect(result.css).to.contain('font-style: italic;\n  font-weight: 400;');
    expect(result.css).to.contain('font-style: italic;\n  font-weight: 700;');
    expect(result.css).to.contain(`font-family: 'ReDBox Brand Typeface';`);
    expect(result.css).to.contain(
      `--rb-brand-font-family: 'ReDBox Brand Typeface', 'Helvetica Neue', Arial, sans-serif;`
    );
    expect(result.css).to.contain(':root,');
    expect(result.css).to.contain(':host {');
    expect(result.css).to.contain(`../../../fonts/branding/default/${'0'.repeat(64)}.woff2') format('woff2')`);
    const swaps = result.css.match(/font-display: swap;/g) || [];
    expect(swaps.length).to.equal(4);
  });

  it('omits missing optional faces and encodes brand names in URLs', function () {
    const { Services } = require('../../src/services/BrandingThemeCssService');
    const service = new Services.BrandingThemeCss();

    const result = service.generate({}, { typeface: customState(['regular']), brandName: 'my brand' });
    expect(result.css.split('@font-face').length - 1).to.equal(1);
    expect(result.css).to.contain(`../../../fonts/branding/my%20brand/`);
    expect(result.css).to.contain('--rb-brand-font-family');
  });

  it('never interpolates filenames or embedded family names into CSS', function () {
    const { Services } = require('../../src/services/BrandingThemeCssService');
    const service = new Services.BrandingThemeCss();

    const result = service.generate({}, { typeface: customState(['regular']), brandName: 'default' });
    expect(result.css).to.not.contain('<evil>');
    expect(result.css).to.not.contain('Embedded Family');
  });

  it('requires a brand name for custom snapshots and hashes face order', function () {
    const { Services } = require('../../src/services/BrandingThemeCssService');
    const service = new Services.BrandingThemeCss();

    expect(() => service.generate({}, { typeface: customState(['regular']) })).to.throw(/Brand name/);
    const first = service.generate({}, { typeface: customState(), brandName: 'default' });
    const second = service.generate({}, { typeface: customState(), brandName: 'default' });
    expect(first.hash).to.equal(second.hash);
    const changed = service.generate(
      {},
      { typeface: { mode: 'custom', faces: { regular: testFace('regular', 'f'.repeat(64)) } }, brandName: 'default' }
    );
    expect(changed.hash).to.not.equal(first.hash);
    expect(changed.hash).to.match(/^[0-9a-f]{32}$/);
  });

  it('keeps legacy font-family variables out of generated CSS', function () {
    const { Services } = require('../../src/services/BrandingThemeCssService');
    const service = new Services.BrandingThemeCss();

    const result = service.generate({ 'branding-font-family': 'Evil Family, sans-serif' } as Record<string, string>);
    expect(result.css).to.not.contain('Evil Family');
    expect(result.css).to.not.contain('--rb-brand-font-family');
  });

  it('wires text roles through the brand variable while keeping icon and code families', function () {
    const themePath = path.join(__dirname, '..', '..', '..', '..', 'assets', 'styles', 'default-theme.scss');
    const theme = fs.readFileSync(themePath, 'utf8');
    expect(theme).to.contain('font-family: var(--rb-brand-font-family, $body-font-family)');
    expect(theme).to.contain('font-family: var(--rb-brand-font-family, $main-menu-branding-font-family)');
    expect(theme).to.contain('font-family: var(--rb-brand-font-family, $branding-footer-font-family)');
    expect(theme).to.contain('font-family: var(--rb-brand-font-family, $main-content-heading-font-family)');
    expect(theme).to.contain('font-family: "Glyphicons Halflings"');
    expect(theme).to.contain('font-family: monospace,monospace;');
    expect(theme).to.contain(`font-family: Menlo,Monaco,Consolas,"Courier New",monospace`);
    const iconPath = path.join(__dirname, '..', '..', '..', '..', 'assets', 'styles', 'redbox-font.scss');
    const icon = fs.readFileSync(iconPath, 'utf8');
    expect(icon).to.contain(`font-family: 'redboxresearchdata'`);
    expect(icon).to.not.contain('--rb-brand-font-family');
  });

  it('routes print output through the brand variable', function () {
    const printPath = path.join(__dirname, '..', '..', '..', '..', 'assets', 'styles', 'print.scss');
    const print = fs.readFileSync(printPath, 'utf8');
    expect(print).to.contain('--rb-print-font-family: var(--rb-brand-font-family,');
  });
});
