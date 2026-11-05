import { expect } from 'chai';
import * as path from 'path';
import * as ejs from 'ejs';
import { JSDOM } from 'jsdom';

const views = path.resolve(__dirname, '../../../../views/default/default/admin');
const locals = {
  req: { path: '/brand/portal/admin' },
  BrandingService: { getBrandAndPortalPath: () => '/brand/portal' },
  TranslationService: { t: (key: string) => key },
  contentSecurityPolicyNonce: 'test-nonce',
  adminSidebar: {
    sections: [
      { id: 'people', title: 'People & access', items: [{ label: 'Users', href: '/brand/portal/admin/users' }] },
      { id: 'site', title: 'Site & content', items: [{ label: 'Menu', href: '/brand/portal/admin/appconfig/edit/menu' }] }
    ],
    footerLinks: [{ label: 'Custom footer', href: 'https://example.org', external: true }]
  }
};

describe('Admin foundation views', function () {
  it('filters by translated item and section labels, hides empty sections and restores navigation', async function () {
    const html = await ejs.renderFile(path.join(views, 'layout/sidebar.ejs'), locals);
    const dom = new JSDOM(html, { runScripts: 'dangerously' });
    try {
      const document = dom.window.document;
      const input = document.querySelector('input')!;
      const filter = (value: string) => {
        input.value = value;
        input.dispatchEvent(new dom.window.Event('input'));
      };
      const visible = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-admin-filter-item]'))
        .filter(item => !item.hidden).map(item => item.textContent!.trim());
      expect(document.querySelector('script')!.nonce).to.equal('test-nonce');
      expect(document.querySelector('[aria-current="page"]')!.getAttribute('href')).to.equal('/brand/portal/admin');
      filter('  PEOPLE  ');
      expect(visible()).to.deep.equal(['Users']);
      expect(document.querySelectorAll('section[hidden]')).to.have.lengthOf(1);
      filter('menu');
      expect(visible()).to.deep.equal(['Menu']);
      filter('nothing matches');
      expect(visible()).to.deep.equal([]);
      expect(document.querySelector<HTMLElement>('[role="status"]')!.hidden).to.equal(false);
      filter('');
      expect(visible()).to.have.lengthOf(4);
      expect(document.querySelectorAll('section[hidden]')).to.have.lengthOf(0);
      expect(document.querySelector<HTMLElement>('[role="status"]')!.hidden).to.equal(true);
    } finally { dom.window.close(); }
  });

  it('builds overview tiles from the same resolved links, retaining custom external footer links', async function () {
    const html = await ejs.renderFile(path.join(views, 'home.ejs'), locals);
    const dom = new JSDOM(html);
    try {
      const document = dom.window.document;
      expect(document.querySelectorAll('main')).to.have.lengthOf(1);
      expect(document.querySelectorAll('h1')).to.have.lengthOf(1);
      expect(Array.from(document.querySelectorAll('.rb-admin-tile a')).map(link => link.getAttribute('href')))
        .to.deep.equal(locals.adminSidebar.sections.flatMap(section => section.items.map(item => item.href)));
      const footer = document.querySelector('main a[href="https://example.org"]')!;
      expect(footer.getAttribute('rel')).to.equal('noopener noreferrer');
    } finally { dom.window.close(); }
  });

  it('wraps Export and the admin-only dashboard branch without changing ordinary dashboards', async function () {
    const pageLocals = {
      ...locals,
      BrandingService: { ...locals.BrandingService, getRootContext: () => '',
        hasActiveCustomTypeface: () => true, getBrandNameFromReq: () => 'brand' },
      CacheService: { getNgAppFileHash: () => '' },
      recordType: 'party', packageType: 'party', titleLabel: 'Parties'
    };
    const exportHtml = await ejs.renderFile(path.join(views, '../export/index.ejs'), pageLocals);
    const dashboardPath = path.resolve(views, '../../rdmp/dashboard.ejs');
    const adminHtml = await ejs.renderFile(dashboardPath, { ...pageLocals, showAdminSideBar: true });
    const ordinaryHtml = await ejs.renderFile(dashboardPath, { ...pageLocals, showAdminSideBar: false });
    for (const html of [exportHtml, adminHtml]) {
      const dom = new JSDOM(html);
      try {
        expect(dom.window.document.querySelectorAll('.rb-admin.admin-layout main')).to.have.lengthOf(1);
        expect(dom.window.document.querySelector('main script[type="module"]')).to.equal(null);
      } finally { dom.window.close(); }
    }
    expect(ordinaryHtml).not.to.include('rb-admin');
  });

  it('escapes header labels and URLs and translates optional actions', async function () {
    const html = await ejs.renderFile(path.join(views, 'layout/page-header.ejs'), {
      ...locals, titleKey: '<script>title</script>', descriptionKey: 'description',
      breadcrumbs: [{ labelKey: 'menu-admin', href: '/admin?x="' }, { labelKey: 'current' }],
      actions: [{ labelKey: 'save', href: '/save', primary: true }]
    });
    const dom = new JSDOM(html);
    try {
      const document = dom.window.document;
      expect(document.querySelector('script')).to.equal(null);
      expect(document.querySelector('h1')!.textContent).to.equal('<script>title</script>');
      expect(document.querySelector('.btn-primary')!.textContent).to.equal('save');
      expect(document.querySelector('[aria-current="page"]')!.textContent).to.equal('current');
    } finally { dom.window.close(); }
  });
});
