import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { pageFixture } from './pageFixture';
import { pageRoutes } from '../../src/http/express/pages';

describe('owned EJS pages on Mongo Express', function () {
  this.timeout(45000);
  let f: Awaited<ReturnType<typeof pageFixture>>;
  let failErrorArtifact = false;
  before(async () => {
    f = await pageFixture({
      pageBindings: pages => {
        const load = pages.loadRecord;
        pages.loadRecord = oid =>
          oid === 'provider-failure' ? Promise.reject(new Error('private backend details')) : load(oid);
        const render = pages.artifacts.render.bind(pages.artifacts);
        pages.artifacts.render = (file, locals) => {
          if (failErrorArtifact && path.basename(file) === '500.ejs') throw new Error('error artifact failed');
          return render(file, locals);
        };
      },
    });
  });
  after(async () => {
    await f?.close();
  });
  const get = (url: string, headers: Record<string, string> = {}) =>
    fetch(f.url + url, { headers, redirect: 'manual' });
  it('redirects every protected page anonymously and denies foreign brands and wrong roles', async () => {
    for (const route of pageRoutes) {
      const url = route.path.replace('/:branding/:portal', '/default/rdmp').replace(/:[A-Za-z]+/g, 'sample');
      const response = await get(url);
      if (route.access !== 'public') {
        assert.equal(response.status, 302, url);
        assert.equal(response.headers.get('location'), '/portal/default/rdmp/user/login', url);
      }
      assert.equal((await get(url.replace('/default/', '/other/'), f.headers)).status, 403, url);
    }
    const user = await f.identities.create('user', {
      username: 'reader',
      type: 'local',
      name: 'Reader',
      email: 'reader@example.invalid',
      password: 'reader-password',
      roles: [f.reader.id],
    });
    const login = await fetch(f.url + '/__test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user.username, password: 'reader-password' }),
    });
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    for (const route of pageRoutes.filter(route => route.path.includes('/admin'))) {
      const url = route.path.replace('/:branding/:portal', '/default/rdmp').replace(/:[A-Za-z]+/g, 'sample');
      assert.equal((await get(url, { Cookie: cookie })).status, 403, url);
    }
    assert.equal((await get('/default/rdmp/record/dataRecord/edit', { Cookie: cookie })).status, 403);
  });
  it('renders public login and persisted create/edit pages with per-request CSP and canonical links', async () => {
    const login = await get('/default/rdmp/user/login');
    assert.equal(login.status, 200, await login.clone().text());
    assert.match(await login.text(), /local-auth/);
    const create = await get('/default/rdmp/record/dataRecord/edit', f.headers);
    assert.equal(create.status, 200, await create.clone().text());
    assert.match(await create.text(), /<redbox-form/);
    const result = await fetch(f.url + '/default/rdmp/api/records/metadata/dataRecord', {
      method: 'POST',
      headers: { ...f.headers, 'Content-Type': 'application/json', 'X-ReDBox-Api-Version': '2.0' },
      body: JSON.stringify({ metadata: { title: 'Persisted page' } }),
    });
    assert.equal(result.status, 201, await result.clone().text());
    const oid = (await result.json()).data.oid;
    assert.equal((await get('/default/rdmp/record/view-orig/' + oid, f.headers)).status, 500);
    const edit = await get('/default/rdmp/record/edit/' + oid, f.headers);
    assert.equal(edit.status, 200, await edit.clone().text());
    assert.match(await edit.text(), /Persisted page \| Portal/);
    assert.match(edit.headers.get('content-security-policy')!, /nonce-/);
    assert.notEqual(edit.headers.get('content-security-policy'), create.headers.get('content-security-policy'));
    const french = await get('/default/rdmp/home?lng=fr&x=safe', { 'X-Forwarded-Host': 'untrusted.invalid' });
    assert.match(await french.text(), /Portail/);
    assert.match(french.headers.get('cache-control')!, /no-store/);
  });
  it('renders each installed page shell and preserves missing resources and redirect outcomes', async () => {
    for (const route of pageRoutes.filter(
      route => !route.path.includes(':oid') && route.action !== 'renderDashboardView'
    )) {
      const url = route.path
        .replace('/:branding/:portal', '/default/rdmp')
        .replace(':recordType', 'dataRecord')
        .replace(':name', 'example')
        .replace(':appConfigId', 'menu');
      const response = await get(url, f.headers);
      const expected = route.action === 'redirectLegacyConsolidatedDashboard' ? 302 : 200;
      assert.equal(response.status, expected, url + ' ' + (await response.clone().text()));
      if (expected === 200) assert.match(response.headers.get('content-type')!, /html/);
    }
    assert.equal((await get('/default/rdmp/admin/appconfig/edit/absent', f.headers)).status, 404);
    assert.equal((await get('/default/rdmp/dashboard-view/absent', f.headers)).status, 404);
    assert.equal((await get('/default/rdmp/record/edit/absent', f.headers)).status, 404);
    const failed = await get('/default/rdmp/record/view/provider-failure', f.headers);
    assert.equal(failed.status, 500);
    assert.doesNotMatch(await failed.text(), /private backend details/);
    assert.equal((await get('/default/rdmp/dashboard-view/example', f.headers)).status, 200);
    assert.equal((await get('/default/rdmp/home?lng[]=en', f.headers)).status, 400);
    assert.equal((await get('/')).headers.get('location'), '/portal/default/rdmp/home');
  });
  it('retains deployment paths and private cache headers through a real trusted proxy', async () => {
    const proxy = createServer((req, res) => {
      const upstream = request(
        new URL(req.url!, f.url),
        {
          method: req.method,
          headers: { ...req.headers, 'x-forwarded-host': 'institution.example.invalid', 'x-forwarded-proto': 'https' },
        },
        response => {
          res.writeHead(response.statusCode!, response.headers);
          response.pipe(res);
        }
      );
      upstream.on('error', error => res.destroy(error));
      req.pipe(upstream);
    });
    proxy.listen(0, '127.0.0.1');
    await once(proxy, 'listening');
    try {
      const url = 'http://127.0.0.1:' + (proxy.address() as { port: number }).port;
      const page = await fetch(url + '/portal/default/rdmp/user/login');
      assert.equal(page.status, 200);
      const body = await page.text();
      assert.match(body, /src="\/portal\/default\/rdmp\/js\/index.bundle.js"/);
      assert.match(body, /href="\/portal\/user\/begin_oidc"|local-auth/);
      assert.match(page.headers.get('cache-control')!, /no-store/);
      assert.equal((await fetch(url + '/portal/default/rdmp/styles/theme.css')).status, 200);
    } finally {
      await new Promise<void>(resolve => proxy.close(() => resolve()));
    }
  });
  it('renders themed HTML errors for missing pages, denied records and backend failures', async () => {
    const missing = await get('/default/rdmp/unknown-page', { Accept: 'text/html' });
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get('content-type')!, /html/);
    assert.match(await missing.text(), /Page Not Found!/);
    assert.match(missing.headers.get('cache-control')!, /no-store/);
    const known = await get('/default/rdmp/record/edit/absent', { ...f.headers, Accept: 'text/html' });
    assert.equal(known.status, 404);
    assert.match(await known.text(), /Page Not Found!/);
    const created = await fetch(f.url + '/default/rdmp/api/records/metadata/dataRecord', {
      method: 'POST',
      headers: { ...f.headers, 'Content-Type': 'application/json', 'X-ReDBox-Api-Version': '2.0' },
      body: JSON.stringify({ metadata: { title: 'Private error page record' } }),
    });
    assert.equal(created.status, 201);
    const oid = (await created.json()).data.oid;
    await f.identities.create('user', {
      username: 'error-reader',
      type: 'local',
      name: 'Error reader',
      email: 'error-reader@example.invalid',
      password: 'reader-password',
      roles: [f.reader.id],
    });
    const login = await fetch(f.url + '/__test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'error-reader', password: 'reader-password' }),
    });
    const denied = await get('/default/rdmp/record/view/' + oid, {
      Cookie: login.headers.get('set-cookie')!.split(';')[0],
      Accept: 'text/html',
    });
    assert.equal(denied.status, 403);
    const deniedHtml = await denied.text();
    assert.match(deniedHtml, /error-403-heading/);
    assert.match(deniedHtml, /href="\/portal\/default\/rdmp\/home"/);
    assert.doesNotMatch(deniedHtml, /Private error page record/);
    const failed = await get('/default/rdmp/record/view/provider-failure', { ...f.headers, Accept: 'text/html' });
    assert.equal(failed.status, 500);
    const html = await failed.text();
    assert.match(html, /error-500-heading/);
    assert.doesNotMatch(html, /private backend details/);
    assert.match(failed.headers.get('content-security-policy')!, /nonce-/);
    const json = await get('/default/rdmp/record/view/provider-failure', { ...f.headers, Accept: 'application/json' });
    assert.equal(json.status, 500);
    assert.equal(await json.text(), '');
  });
  it('terminates an error response safely when the error artifact also fails', async () => {
    failErrorArtifact = true;
    try {
      const failed = await get('/default/rdmp/record/view/provider-failure', { ...f.headers, Accept: 'text/html' });
      assert.equal(failed.status, 500);
      assert.match(failed.headers.get('content-type')!, /text\/plain/);
      assert.equal(await failed.text(), '500 Internal Server Error');
    } finally {
      failErrorArtifact = false;
    }
  });
  it('requires the owning session CSRF token for legacy any-method page routes', async () => {
    const csrf = await get('/csrfToken');
    const cookie = csrf.headers.get('set-cookie')!.split(';')[0];
    const { _csrf } = await csrf.json();
    const headers = { Cookie: cookie };
    const url = f.url + '/default/rdmp/home';
    assert.equal((await fetch(url, { method: 'POST', headers })).status, 403);
    assert.equal(
      (await fetch(url, { method: 'POST', headers: { ...headers, 'X-CSRF-Token': 'invalid' } })).status,
      403
    );
    assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, 'X-CSRF-Token': _csrf } })).status, 200);
  });

  it('serves branded assets, cache validators, MIME types, HEAD, and denies private paths', async () => {
    const css = await get('/default/rdmp/styles/theme.css');
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type')!, /text\/css/);
    assert.match(css.headers.get('cache-control')!, /max-age=300/);
    assert.equal(
      (await get('/default/rdmp/styles/theme.css', { 'If-None-Match': css.headers.get('etag')! })).status,
      304
    );
    const js = await get('/default/rdmp/js/index.bundle.js');
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type')!, /javascript/);
    const head = await fetch(f.url + '/default/rdmp/js/index.bundle.js', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    for (const suffix of [
      '/.env',
      '/default/rdmp/.secret',
      '/angular/%2eprivate',
      '/default/rdmp/js/%2e%2e/%2e%2e/.env',
    ])
      assert.equal((await get(suffix)).status, 404, suffix);
    assert.equal((await get('/fonts/branding/unknown/' + 'a'.repeat(64) + '.woff2')).status, 404);
  });
  it('delivers persisted brand logo, favicon, immutable font and single-use preview bytes', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>'
    );
    await f.logos.putLogo({ branding: 'default', portal: 'rdmp', fileBuffer: svg, contentType: 'image/svg+xml' });
    await f.logos.putFavicon({ branding: 'default', portal: 'rdmp', fileBuffer: svg, contentType: 'image/svg+xml' });
    for (const name of ['logo', 'favicon']) {
      const response = await get('/default/rdmp/images/' + name);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type')!, /image\/svg/);
      assert.match(await response.text(), /<svg/);
      assert.equal(
        (await get('/default/rdmp/images/' + name, { 'If-None-Match': response.headers.get('etag')! })).status,
        304
      );
    }
    const face = await f.typeface.inspectAndStoreFace({
      brandingId: f.brand.id,
      slot: 'regular',
      bytes: await readFile(path.resolve(__dirname, '../../../../test/resources/fonts/test-font-regular.woff2')),
    });
    const font = await get('/fonts/branding/default/' + face.sha256 + '.woff2');
    assert.equal(font.status, 200);
    assert.match(font.headers.get('content-type')!, /font\/woff2/);
    assert.match(font.headers.get('cache-control')!, /immutable/);
    assert.equal((await get('/fonts/branding/other/' + face.sha256 + '.woff2')).status, 404);
    const row = await f.branding.getBrand({ id: f.brand.id });
    const preview = await f.pageBranding.preview('default', 'rdmp', row!.draftRevision ?? 0);
    const response = await get('/default/rdmp/preview/' + preview.token + '.css');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control')!, /no-store/);
    assert.equal((await get('/default/rdmp/preview/' + preview.token + '.css')).status, 404);
  });
  it('delivers safe client settings and authorized compiled expressions without a view hook', async () => {
    const response = await get('/dynamic/apiClientConfig');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).baseUrl, new URL(f.url).origin);
    assert.equal((await get('/dynamic/unknown')).status, 404);
    const expressions = await get('/default/rdmp/dynamicAsset/formCompiledItems/dataRecord?edit=true', f.headers);
    assert.equal(expressions.status, 200, await expressions.clone().text());
    assert.match(expressions.headers.get('content-type')!, /javascript/);
    assert.match(await expressions.text(), /export function evaluate/);
    const post = await fetch(f.url + '/default/rdmp/home', { method: 'POST' });
    assert.equal(post.status, 403);
  });
});
