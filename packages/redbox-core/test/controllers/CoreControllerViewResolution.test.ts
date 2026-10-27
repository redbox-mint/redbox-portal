import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ejs from 'ejs';
import * as sinon from 'sinon';
import { mountConfigurationReadRoutes } from '../../src/http/express/configuration';
import { PageArtifacts } from '../../src/pages/Artifacts';
import { preparePage, mountPageNotFound } from '../../src/http/express/pages';
import { pageInputFixture } from '../helpers/pageInputFixture';
import { httpRouteFixture } from '../helpers/httpRouteFixture';

describe('Declared extension view resolution', function () {
  let directory: string, core: string, hook: string;
  let f: Awaited<ReturnType<typeof pageInputFixture>>;
  let artifacts: PageArtifacts;
  function write(file: string, content: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  async function page() {
    await artifacts.initialize();
    return preparePage(f.req, f.res, f.input);
  }
  beforeEach(async function () {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-view-resolution-'));
    core = path.join(directory, 'core');
    hook = path.join(directory, 'extension');
    fs.mkdirSync(core);
    fs.mkdirSync(hook);
    artifacts = new PageArtifacts([hook, core], [core]);
    f = await pageInputFixture();
    f.brand.name = 'brand';
    f.req.params.branding = 'brand';
    await f.run('brandingandportal', 'browseractor');
    Object.assign(f.input, { artifacts });
    Object.assign(f.req, { accepts: () => 'html' });
    Object.assign(f.response, { headersSent: false, writableEnded: false, send: sinon.stub() });
  });
  afterEach(async function () {
    await artifacts.close();
    fs.rmSync(directory, { recursive: true, force: true });
    sinon.restore();
  });

  it('resolves extension views without copying them into application views', async function () {
    const file = path.join(hook, 'default/default/homepage.ejs');
    write(file, 'extension homepage');
    const p = await page();
    assert.equal(artifacts.view('homepage', 'brand', 'portal'), file);
    assert.equal(p.render('homepage'), 'extension homepage');
    assert.equal(fs.existsSync(path.join(core, 'default/default/homepage.ejs')), false);
  });
  it('uses an extension view ahead of a core view for the same candidate path', async function () {
    write(path.join(core, 'default/default/homepage.ejs'), 'core homepage');
    write(path.join(hook, 'default/default/homepage.ejs'), 'extension homepage');
    assert.equal((await page()).render('homepage'), 'extension homepage');
  });
  it('uses a core brand-specific view before an extension default/default view', async function () {
    write(path.join(core, 'brand/portal/homepage.ejs'), 'core branded homepage');
    write(path.join(hook, 'default/default/homepage.ejs'), 'extension default homepage');
    assert.equal((await page()).render('homepage'), 'core branded homepage');
  });
  it('allows an extension view to use a core layout', async function () {
    write(path.join(hook, 'default/default/homepage.ejs'), 'extension homepage');
    write(path.join(core, 'default/default/layout.ejs'), '<main><%- body %></main>');
    const p = await page();
    assert.equal(artifacts.layout('brand', 'portal'), path.join(core, 'default/default/layout.ejs'));
    assert.equal(p.render('layout', { body: p.render('homepage') }), '<main>extension homepage</main>');
  });
  it('lets extension layouts include core-level files from the prepared roots', async function () {
    write(path.join(hook, 'default/default/layout.ejs'), '<%- include("../../functions") %><%- body %>');
    write(path.join(core, 'functions.ejs'), 'core helper:');
    const p = await page();
    assert.equal(p.render('layout', { body: 'extension page' }), 'core helper:extension page');
  });
  it('resolves extension partials from core layouts using the actual selected roots', async function () {
    write(path.join(core, 'default/default/researcher/home.ejs'), 'core homepage');
    write(
      path.join(core, 'default/default/layout.ejs'),
      '<%- superPartial("/layout/footer.ejs", branding, portal, true) %><%- body %>'
    );
    write(path.join(hook, 'default/default/layout/footer.ejs'), 'extension footer:');
    const p = await page();
    assert.equal(p.render('layout', { body: p.render('researcher/home') }), 'extension footer:core homepage');
  });
  it('guards optional branding locals in the core layout head extension point', function () {
    const viewsRoot = path.resolve(__dirname, '../../../../views');
    const layout = fs.readFileSync(path.join(viewsRoot, 'default/default/layout.ejs'), 'utf8');
    const functions = fs.readFileSync(path.join(viewsRoot, 'functions.ejs'), 'utf8');
    assert.ok(layout.includes("typeof branding !== 'undefined' && branding != null ? branding : page.brand.name"));
    assert.ok(layout.includes("typeof portal !== 'undefined' && portal != null ? portal : page.portal"));
    assert.ok(!functions.includes('sails.'));
    const extension = layout.match(/<%- superPartial\("\/layout\/head-extra.ejs",[\s\S]*?%>/)![0];
    const partial = sinon.spy(() => '');
    ejs.render(extension, { page: { brand: { name: 'brand' }, portal: 'portal' }, superPartial: partial });
    sinon.assert.calledWithExactly(partial, '/layout/head-extra.ejs', 'brand', 'portal', true);
  });
  it('renders a root error view with the extension layout', async function () {
    write(path.join(core, '404.ejs'), 'not found');
    write(path.join(hook, 'default/default/layout.ejs'), '<main><%- body %></main>');
    (await page()).error(404);
    sinon.assert.calledWithExactly(f.response.status, 404);
    sinon.assert.calledWithExactly(Reflect.get(f.response, 'send'), '<main>not found</main>');
  });
  it('preserves automatic API OPTIONS when the production page fallback is mounted', async () => {
    await artifacts.initialize();
    const http = await httpRouteFixture((router, input) => {
      router.use((req, _res, next) => {
        req.session = {} as typeof req.session;
        next();
      });
      mountConfigurationReadRoutes(router, { ...input, forms: {} } as any);
      mountPageNotFound(router, { ...f.input, ...input, csrf: { ...f.input.csrf, ...input.csrf }, artifacts });
    });
    try {
      for (const suffix of ['', '/']) {
        const response = await http.request('/default/portal/api/forms' + suffix, { method: 'OPTIONS' });
        assert.equal(response.status, 200);
        assert.deepEqual(response.headers.get('Allow')?.split(/,\s*/).sort(), ['GET', 'HEAD']);
      }
      const unknown = await http.request('/default/portal/api/unknown', { method: 'OPTIONS' });
      assert.equal(unknown.status, 404);
      assert.equal(unknown.headers.get('Allow'), null);
    } finally {
      await http.close();
    }
  });

  it('recovers branding and portal from an unmatched branded URL', async function () {
    write(path.join(core, '404.ejs'), '<%= branding %>/<%= portal %>:not found');
    write(path.join(hook, 'brand/portal/layout/layout.ejs'), '<main><%- body %></main>');
    await artifacts.initialize();
    const http = await httpRouteFixture((router, input) => {
      router.use((req, _res, next) => {
        req.session = {} as typeof req.session;
        next();
      });
      mountPageNotFound(router, { ...f.input, ...input, csrf: { ...f.input.csrf, ...input.csrf }, artifacts });
    });
    try {
      http.getBrand.resolves({ id: 'brand-1', name: 'brand' });
      const response = await http.request('/brand/portal/page-that-does-not-exist', {
        headers: { Accept: 'text/html' },
      });
      assert.equal(response.status, 404);
      assert.equal(response.text, '<main>brand/portal:not found</main>');
    } finally {
      await http.close();
    }
  });
  it('terminates with a 404 when the requested view and 404 template are unavailable', async function () {
    const p = await page();
    assert.throws(() => p.render('missing-view'), /Required page artifact missing/);
    p.error(404);
    sinon.assert.calledWithExactly(f.response.status, 404);
    sinon.assert.calledWithExactly(f.response.type, 'text/plain');
    sinon.assert.calledWithExactly(Reflect.get(f.response, 'send'), '404 Not Found');
  });
  it('preserves an assigned error status when the error view is unavailable', async function () {
    (await page()).error(500);
    sinon.assert.calledWithExactly(f.response.status, 500);
    sinon.assert.calledWithExactly(Reflect.get(f.response, 'send'), '500 Internal Server Error');
  });
});
