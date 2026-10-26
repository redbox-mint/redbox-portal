import assert from 'node:assert/strict';
import { pageInputFixture } from '../helpers/pageInputFixture';
import { preparePage } from '../../src/http/express/pages';

describe('page-owned navigation resolution', () => {
  it('attaches resolved menu, home panels and sidebar to explicit page locals', async () => {
    const f = await pageInputFixture();
    f.settings.resolves({
      menu: { items: [{ id: 'home', labelKey: 'Home', href: '/home' }], showSearch: false },
      homePanels: { panels: [{ id: 'panel1', titleKey: 'Panel', items: [{ labelKey: 'Item', href: '/home' }] }] },
      adminSidebar: { header: { title: 'Admin', iconClass: 'fa fa-gear' }, sections: [], footerLinks: [] },
    });
    const page = await preparePage(f.req, f.res, f.input);
    assert.equal((page.locals.menu as any).items[0].label, 'Home');
    assert.equal((page.locals.menu as any).showSearch, false);
    assert.equal((page.locals.homePanels as any).panels[0].id, 'panel1');
    assert.deepEqual((page.locals.adminSidebar as any).sections, []);
    assert.equal(Reflect.get(f.req, 'options')?.locals?.menu, undefined);
  });
  it('provides empty structures when navigation resolution fails', async () => {
    const f = await pageInputFixture();
    f.settings.resolves({
      get menu() {
        throw new Error('Menu error');
      },
      get homePanels() {
        throw new Error('Panels error');
      },
      get adminSidebar() {
        throw new Error('Sidebar error');
      },
    });
    const page = await preparePage(f.req, f.res, f.input);
    assert.deepEqual(page.locals.menu, { items: [], showSearch: true });
    assert.deepEqual(page.locals.homePanels, { panels: [] });
    assert.deepEqual((page.locals.adminSidebar as any).sections, []);
    assert.deepEqual((page.locals.adminSidebar as any).footerLinks, []);
  });
  it('creates page locals without preexisting response locals', async () => {
    const f = await pageInputFixture();
    assert.equal(f.res.locals, undefined);
    const page = await preparePage(f.req, f.res, f.input);
    assert(page.locals.menu);
    assert(page.locals.homePanels);
    assert(page.locals.adminSidebar);
  });
  it('handles missing framework options while navigation falls back', async () => {
    const f = await pageInputFixture();
    f.settings.resolves({
      get menu() {
        throw new Error('fail');
      },
    });
    const page = await preparePage(f.req, f.res, f.input);
    assert.deepEqual((page.locals.menu as any).items, []);
    assert.equal(Reflect.get(f.req, 'options'), undefined);
  });
  it('records navigation resolution failures', async () => {
    const f = await pageInputFixture();
    f.settings.resolves({
      get menu() {
        throw new Error('Test error');
      },
    });
    await preparePage(f.req, f.res, f.input);
    assert(f.log.error.called);
  });
});
