import * as fs from 'fs';
import * as path from 'path';
import { static_assets } from '../src/config/static_assets.config';
const ejs = require('ejs');
let expect: Chai.ExpectStatic;

// The logo is shared by all portal pages; protect the non-admin branch explicitly.
describe('Portal logo heading scope', () => {
  before(async () => { expect = (await import('chai')).expect; });
  const template = fs.readFileSync(path.resolve(__dirname, '../../../views/default/default/layout/logo.ejs'), 'utf8');
  const render = (route: string, heading = '', adminParties = false, portalPath = '/default/rdmp',
    image: { logo?: object; logoName?: string } = {}) => ejs.render(template, {
    req: { path: portalPath + route }, adminParties,
    sails: { config: { static_assets: { logoName: image.logoName || static_assets.logoName } } },
    BrandingService: { getBrandAndPortalPath: () => portalPath,
      getBrandNameFromReq: () => 'default', getBrand: () => ({ logo: image.logo }) },
    TranslationService: { t: (key: string) => key === 'logo-heading-text' ? heading : 'ReDBox Logo' }
  });

  it('reserves the default artwork ratio without imposing it on uploaded or replacement logos', () => {
    for (const route of ['/admin', '/researcher/home']) {
      expect(render(route)).to.contain('width="171" height="100"');
      expect(render(route, '', false, '/default/rdmp', { logoName: 'logo.png' }))
        .to.contain('width="171" height="100"');
    }
    for (const image of [{ logo: { storageKey: 'uploaded.svg' } }, { logoName: 'institution.png' }]) {
      const html = render('/admin', '', false, '/default/rdmp', image);
      expect(html).to.contain('src="/default/rdmp/images/logo"');
      expect(html).not.to.contain('width="171"');
    }
  });

  it('ships outlined default artwork while keeping the legacy PNG available', () => {
    expect(static_assets.logoName).to.equal('logo.svg');
    expect(static_assets.imageType).to.equal('image/svg+xml');
    const svg = fs.readFileSync(path.resolve(__dirname, '../../../assets/images', static_assets.logoName), 'utf8');
    expect(svg).to.contain('width="171" height="100"').and.contain('viewBox="0 0 614 359"');
    expect(svg).to.contain('<path');
    expect(svg).not.to.match(/<(?:image|text|script|foreignObject)\b|(?:href|url\()\s*["']?(?:https?:|data:)/i);
    expect(fs.existsSync(path.resolve(__dirname, '../../../assets/images/logo.png'))).to.equal(true);
  });

  it('leaves the single page H1 to admin content and legacy admin Parties', () => {
    for (const route of ['/admin', '/admin/branding', '/admin/roles']) {
      expect(render(route)).not.to.contain('<h1');
      expect(render(route)).to.contain('<div class="rb-admin-site-logo">');
    }
    expect(render('/dashboard/party', '', true)).not.to.contain('<h1');
  });

  it('retains the original heading markup on ordinary portal pages', () => {
    for (const route of ['/researcher/home', '/dashboard/rdmp', '/record/edit/123', '/user/login']) {
      expect(render(route)).to.contain('<h1>');
      expect(render(route)).not.to.contain('rb-admin-site-logo');
      expect(render(route, 'Institution')).to.contain('<h1 class="logo-with-heading">');
    }
  });

  it('does not treat brand names, portal names or record identifiers as admin routes', () => {
    for (const portalPath of ['/admin/rdmp', '/default/admin', '/mount/default/rdmp']) {
      expect(render('/record/view/admin', '', false, portalPath)).to.contain('<h1>');
      expect(render('/researcher/home', '', false, portalPath)).to.contain('<h1>');
      expect(render('/admin/users', '', false, portalPath)).not.to.contain('<h1');
    }
  });

  it('escapes optional heading text in both branches and ignores untranslated keys', () => {
    for (const route of ['/admin', '/researcher/home']) {
      expect(render(route, '<script>alert(1)</script>')).to.contain('&lt;script&gt;');
      expect(render(route, 'logo-heading-text')).not.to.contain('logo-with-heading');
    }
  });
});
