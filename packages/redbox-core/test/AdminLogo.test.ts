import * as fs from 'fs';
import * as path from 'path';
const ejs = require('ejs');
let expect: Chai.ExpectStatic;

// The logo is shared by all portal pages; protect the non-admin branch explicitly.
describe('Portal logo heading scope', () => {
  before(async () => { expect = (await import('chai')).expect; });
  const template = fs.readFileSync(path.resolve(__dirname, '../../../views/default/default/layout/logo.ejs'), 'utf8');
  const render = (route: string, heading = '', adminParties = false) => ejs.render(template, {
    req: { path: '/default/rdmp' + route }, adminParties,
    BrandingService: { getBrandAndPortalPath: () => '/default/rdmp' },
    TranslationService: { t: (key: string) => key === 'logo-heading-text' ? heading : 'ReDBox Logo' }
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

  it('escapes optional heading text in both branches and ignores untranslated keys', () => {
    for (const route of ['/admin', '/researcher/home']) {
      expect(render(route, '<script>alert(1)</script>')).to.contain('&lt;script&gt;');
      expect(render(route, 'logo-heading-text')).not.to.contain('logo-with-heading');
    }
  });
});
