import { expect } from 'chai';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ejs from 'ejs';
import { JSDOM } from 'jsdom';
import { isImmutableAssetPath } from '../../src/config/http.config';

const filename = path.resolve(__dirname, '../../../../views/default/default/layout.ejs');
const layout = fs.readFileSync(filename, 'utf8');
const fragment = layout.slice(layout.indexOf('<!-- Custom CSS -->'), layout.indexOf('<% if (req.query'));
const stylesheet = 'admin-initial.012345abcdef.min.css';
const locals = (root: string) => ({
  req: {}, adminInitialStyles: true, contentSecurityPolicyNonce: 'style-nonce',
  CacheService: { getAdminInitialStylesheet: () => stylesheet },
  BrandingService: { getRootContext: () => root, getBrandAndPortalPath: () => root + '/brand/portal' }
});

describe('Opt-in admin initial styles', () => {
  for (const root of ['', '/redbox']) {
    it(`delivers external versioned CSS with deferred complete styles under ${root || '/'}`, () => {
      const dom = new JSDOM(ejs.render(fragment, locals(root)));
      try {
        const document = dom.window.document;
        expect(document.querySelector('style')).to.equal(null);
        expect(document.querySelector('link')!.getAttribute('href'))
          .to.equal(`${root}/default/default/styles/${stylesheet}`);
        const extra = document.querySelector<HTMLLinkElement>('#rb-portal-extra-styles')!;
        expect(extra.media).to.equal('print');
        expect(extra.getAttribute('href')).to.equal(root + '/brand/portal/styles/style.min.css');
        expect(document.querySelector('noscript link')!.getAttribute('href'))
          .to.equal(root + '/brand/portal/styles/style.min.css');
        expect(document.querySelector('script')!.nonce).to.equal('style-nonce');
      } finally { dom.window.close(); }
    });
  }

  it('uses immutable caching only for the versioned initial stylesheet', () => {
    expect(isImmutableAssetPath(`/default/default/styles/${stylesheet}`)).to.equal(true);
    for (const file of ['admin-initial.min.css', 'admin-initial.latest.min.css', 'style.min.css']) {
      expect(isImmutableAssetPath(`/default/default/styles/${file}`)).to.equal(false);
    }
  });

  it('keeps complete blocking CSS without opt-in or when initial assets are unavailable', () => {
    for (const overrides of [
      { adminInitialStyles: false }, { adminInitialStyles: undefined },
      { CacheService: { getAdminInitialStylesheet: () => '' } }
    ]) {
      const html = ejs.render(fragment, { ...locals(''), ...overrides });
      expect(html).to.contain('rel="stylesheet" href="/brand/portal/styles/style.min.css"');
      expect(html).not.to.contain('<style').and.not.to.contain('media="print"');
    }
  });
});
