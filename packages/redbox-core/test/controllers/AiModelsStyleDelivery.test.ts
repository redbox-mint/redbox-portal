import { expect } from 'chai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ejs from 'ejs';
import { JSDOM } from 'jsdom';

const filename = path.resolve(__dirname, '../../../../views/default/default/layout.ejs');
const layout = fs.readFileSync(filename, 'utf8');
const fragment = layout.slice(layout.indexOf('<!-- Custom CSS -->'), layout.indexOf('<% if (req.query'));
// Development webpack retains the public-path slash; production normalises it.
const css = '@font-face{src:url(../../..//fonts/heading.woff2)}.icon{background:url(../../../icons/check.svg)}';

describe('AI models initial styles', () => {
  for (const root of ['', '/redbox']) {
    it(`keeps inline font and image URLs under the deployment root ${root || '/'}`, () => {
      const html = ejs.render(fragment, {
        __modernAdmin: true, body: '<admin-ai-models></admin-ai-models>', req: {},
        contentSecurityPolicyNonce: 'style-nonce',
        BrandingService: { getRootContext: () => root, getBrandAndPortalPath: () => root + '/brand/portal' }
      }, { filename, includer: () => ({ template: css }) });
      const dom = new JSDOM(html);
      try {
        const document = dom.window.document;
        const style = document.querySelector('style')!;
        expect(style.nonce).to.equal('style-nonce');
        expect(style.textContent).to.contain(`url(${root}/fonts/heading.woff2)`);
        expect(style.textContent).to.contain(`url(${root}/icons/check.svg)`);
        const extra = document.querySelector<HTMLLinkElement>('#rb-portal-extra-styles')!;
        expect(extra.media).to.equal('print');
        expect(extra.getAttribute('href')).to.equal(root + '/brand/portal/styles/style.min.css');
        expect(document.querySelector('noscript link')!.getAttribute('href'))
          .to.equal(root + '/brand/portal/styles/style.min.css');
      } finally { dom.window.close(); }
    });
  }

  it('retains the complete blocking stylesheet for other screens', () => {
    const html = ejs.render(fragment, {
      __modernAdmin: true, body: '<other-admin-app></other-admin-app>', req: {},
      BrandingService: { getBrandAndPortalPath: () => '/brand/portal' }
    });
    expect(html).to.contain('rel="stylesheet" href="/brand/portal/styles/style.min.css"');
    expect(html).not.to.contain('<style').and.not.to.contain('media="print"');
  });
});
