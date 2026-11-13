import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import sinon from 'sinon';
import { PageArtifacts } from '../../../src/pages/Artifacts';
import { Services as Navigation } from '../../../src/navigation/Navigation';
import { referenceProductionFixture } from './referenceProductionFixture';
import { coreRouteName } from '../../../src/http/fastify/routes';
import type { RequestHandler } from 'express';
import { referenceReadDeclarations } from '../../../src/http/referenceRoutes';
import { retainedPageExpress } from './retainedPageExpress';

type Wire = { status: number; headers: Record<string, unknown>; text: string };
type Scenario = {
  name: string;
  path: string;
  method?: string;
  auth?: string;
  session?: boolean;
  headers?: Record<string, string>;
  fault?: 'page' | 'error' | 'settings' | 'languages' | 'typeface' | 'navigation';
  body?: string;
  csrf?: boolean;
  absolute?: boolean;
};
const scenarios: Scenario[] = [
  { name: 'anonymous home', path: '/default/rdmp/home' },
  { name: 'authenticated home', path: '/default/rdmp/home', auth: 'pilot-api-token' },
  { name: 'absolute anonymous home', path: '/default/rdmp/home?rdmp=absolute%2Fvalue', absolute: true },
  { name: 'absolute authenticated home', path: '/default/rdmp/home', absolute: true, auth: 'pilot-api-token' },
  { name: 'absolute 404 html', path: '/default/rdmp/absent', absolute: true, auth: 'pilot-api-token' },
  {
    name: 'absolute 404 json',
    path: '/default/rdmp/absent',
    absolute: true,
    auth: 'pilot-api-token',
    headers: { Accept: 'application/json' },
  },
  { name: 'absolute protected redirect', path: '/default/rdmp/researcher/home', absolute: true },
  { name: 'absolute root redirect', path: '/', absolute: true },
  { name: 'reader home', path: '/default/rdmp/home', auth: 'reader-token' },
  { name: 'foreign actor', path: '/default/rdmp/home', auth: 'foreign-token' },
  { name: 'invalid bearer', path: '/default/rdmp/home', auth: 'invalid' },
  { name: 'anonymous protected', path: '/default/rdmp/researcher/home' },
  { name: 'authenticated protected', path: '/default/rdmp/researcher/home', auth: 'pilot-api-token' },
  { name: 'protected reader', path: '/default/rdmp/researcher/home', auth: 'reader-token' },
  { name: 'session home', path: '/default/rdmp/home', session: true },
  { name: 'session protected', path: '/default/rdmp/researcher/home', session: true },
  { name: 'unknown brand', path: '/missing/rdmp/home' },
  { name: 'unknown portal', path: '/default/missing/home' },
  { name: 'foreign brand', path: '/other/rdmp/home', auth: 'pilot-api-token' },
  { name: 'case slash', path: '/default/rdmp/HOME/' },
  { name: 'nested language', path: '/default/rdmp/home?lng[toString]=bad' },
  { name: 'duplicate language', path: '/default/rdmp/home?lng=en&lng=fr' },
  { name: 'french language', path: '/default/rdmp/home?lng=fr' },
  { name: 'unsupported language', path: '/default/rdmp/home?lng=xx' },
  {
    name: 'malicious forwarded origin',
    path: '/default/rdmp/home',
    headers: { Host: 'hostile.invalid', 'X-Forwarded-Host': 'hostile.invalid', 'X-Forwarded-Proto': 'http' },
  },
  { name: 'gzip negotiation', path: '/default/rdmp/home', headers: { 'Accept-Encoding': 'gzip' } },
  { name: 'br negotiation', path: '/default/rdmp/home', headers: { 'Accept-Encoding': 'br, gzip, deflate' } },
  {
    name: 'forbidden identity negotiation',
    path: '/default/rdmp/home',
    headers: { 'Accept-Encoding': 'identity;q=0,*;q=0' },
  },
  { name: 'fresh wildcard no generated etag', path: '/default/rdmp/home', headers: { 'If-None-Match': '*' } },
  {
    name: 'future modified since no validator',
    path: '/default/rdmp/home',
    headers: { 'If-Modified-Since': 'Wed, 01 Jan 2100 00:00:00 GMT' },
  },
  { name: '404 html', path: '/default/rdmp/absent', auth: 'pilot-api-token' },
  { name: '404 json', path: '/default/rdmp/absent', headers: { Accept: 'application/json' }, auth: 'pilot-api-token' },
  { name: '404 anonymous', path: '/default/rdmp/absent' },
  { name: '500 html', path: '/default/rdmp/home', fault: 'page' },
  { name: '500 json', path: '/default/rdmp/home', fault: 'page', headers: { Accept: 'application/json' } },
  { name: '500 fallback text', path: '/default/rdmp/home', fault: 'error' },
  { name: 'settings fault', path: '/default/rdmp/home', fault: 'settings', auth: 'pilot-api-token' },
  { name: 'typeface preparation fault', path: '/default/rdmp/home', fault: 'typeface', auth: 'pilot-api-token' },
  { name: 'navigation preparation fault', path: '/default/rdmp/home', fault: 'navigation', auth: 'pilot-api-token' },
  { name: 'language load fallback', path: '/default/rdmp/home', fault: 'languages' },
  ...['GET', 'POST', 'PATCH', 'OPTIONS', 'PROPFIND'].map(method => ({ name: `root ${method}`, path: '/', method })),
  { name: 'root HTML', path: '/', headers: { Accept: 'text/html' } },
  { name: 'root unsupported accept', path: '/', headers: { Accept: 'application/json' } },
  { name: 'bodyless POST with csrf', path: '/default/rdmp/home', method: 'POST', csrf: true },
  {
    name: 'empty JSON POST with csrf',
    path: '/default/rdmp/home',
    method: 'POST',
    csrf: true,
    body: '{}',
    headers: { 'Content-Type': 'application/json' },
  },
  { name: 'live input replacement', path: '/default/rdmp/home', headers: { 'X-FM029-Live': 'yes' } },
  { name: 'public unsafe without csrf', path: '/default/rdmp/home', method: 'POST' },
  {
    name: 'public cross origin write',
    path: '/default/rdmp/home',
    method: 'POST',
    headers: { Origin: 'https://foreign.invalid' },
  },
];
const all = [
  ...scenarios,
  ...scenarios.filter(s => !s.method).map(s => ({ ...s, name: s.name + ' HEAD', method: 'HEAD' })),
];
const targetNegatives: Scenario[] = ['request.invalid:443', '*'].flatMap(target =>
  ['GET', 'HEAD'].map(method => ({ name: 'target negative ' + method + ' ' + target, path: target, method }))
);
const localsTemplate = `<pre><%= JSON.stringify({ brand: branding, portal, language: lang, languages: availableLanguages, admin: isAdmin, authenticated: req.isAuthenticated(), user: req.user?.username, url: req.url, originalUrl: req.originalUrl, pageBase: page.base, root: page.root, origin: page.origin, appUrl: page.config.appUrl, param: page.param('rdmp'), fixture: page.param('fixture'), display: displayValue('recordType'), oid, formName, recordType, rdmp, typeface: page.typeface, favicon: page.faviconUrl, bundle: page.bundleHash('form','main'), menu, homePanels, adminSidebar }) %></pre>`;
const profiles = [
  'default',
  'http-canonical',
  'no-root',
  'report-only',
  'disabled-csp',
  'hook-priority',
  'brand-specificity',
  'explicit-roots',
  'cookie-attributes',
  'reduced-policies',
] as const;
const selectedProfiles = profiles.filter(
  profile => !process.env.FM029_PROFILES || process.env.FM029_PROFILES.split(',').includes(profile)
);
const modes = ['retained', 'express', 'fastify'] as const;
const snapshots = new Map<string, Wire[]>();
export function pageWire(
  url: string,
  method = 'GET',
  headers: Record<string, string> = {},
  body = '',
  target?: string
): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method,
        ...(target === undefined ? {} : { path: target }),
        headers: { ...headers, ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}) },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: res.headers, text: Buffer.concat(chunks).toString() })
        );
      }
    );
    req.setTimeout(15000, () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
    req.end(body);
  });
}
function normalized(value: Wire): Wire {
  const headers = { ...value.headers };
  for (const key of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[key];
  if (headers.expires && headers.expires !== '0') headers.expires = '<time>';
  for (const key of ['content-security-policy', 'content-security-policy-report-only'])
    if (typeof headers[key] === 'string') headers[key] = headers[key].replace(/nonce-[^' ;]+/g, 'nonce-<nonce>');
  if (headers['set-cookie'])
    headers['set-cookie'] = (headers['set-cookie'] as string[]).map(c =>
      c.replace(/^([^=]+)=[^;]+/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')
    );
  return {
    ...value,
    headers,
    text: value.text.replace(/nonce="[^"]+"/g, 'nonce="<nonce>"').replace(/[a-f0-9]{64}/g, '<csrf>'),
  };
}
async function login(f: Awaited<ReturnType<typeof referenceProductionFixture>>, good = true) {
  const token = await pageWire(f.url + '/csrfToken', 'GET', { 'X-Forwarded-Proto': 'https' });
  const cookie = String((token.headers['set-cookie'] as string[])[0]).split(';')[0]!;
  const result = await pageWire(
    f.url + '/user/login_local',
    'POST',
    {
      'X-Forwarded-Proto': 'https',
      Cookie: cookie,
      Origin: new URL(f.portal.config.server.publicUrl).origin,
      Accept: 'text/html',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    new URLSearchParams({
      username: 'pilot-admin',
      password: good ? 'pilot-password' : 'wrong',
      _csrf: JSON.parse(token.text)._csrf,
    }).toString()
  );
  return {
    result,
    cookie: String((result.headers['set-cookie'] as string[] | undefined)?.[0] ?? cookie).split(';')[0]!,
  };
}

describe('FM-029 production pages: retained Express / shared Express / Fastify raw HTTP', function () {
  this.timeout(900000);
  before(async () => {
    const retained = await retainedPageExpress();
    try {
      for (const profile of selectedProfiles)
        for (const mode of modes) {
          const pageOptions: { viewRoots?: string[]; assetRoots?: string[] } = {};
          const f = await referenceProductionFixture(
            mode === 'fastify',
            profile === 'reduced-policies' ? { '*': ['noCache', 'brandingAndPortal'] } : undefined,
            mode === 'retained' ? retained.install : undefined,
            {
              declarations: [referenceReadDeclarations[0]],
              pages: pageOptions,
              rootContext: profile === 'no-root' ? '' : '/portal',
              bindings: { handler: registration => () => (registration.declaration.create as () => RequestHandler)() },
              env:
                profile === 'http-canonical'
                  ? { REDBOX_PUBLIC_URL: 'http://canonical.example.invalid:8123/prefix' }
                  : undefined,
              sessionCookie:
                profile === 'cookie-attributes'
                  ? {
                      secure: true,
                      domain: 'portal.example.invalid',
                      path: '/portal',
                      sameSite: 'strict',
                      httpOnly: true,
                      maxAge: 60000,
                    }
                  : undefined,
              configuration: {
                brandingConfigurationDefaults: {
                  auth: {
                    active: ['local', 'aaf'],
                    aaf: { opts: { secretOrKey: 'fm029-synthetic-aaf-key', algorithms: ['HS256'] } },
                  },
                },
                i18n: { next: { init: { debug: false, supportedLngs: ['en', 'fr'], preload: ['en', 'fr'] } } },
                ...(profile === 'report-only'
                  ? { csp: { reportOnly: true } }
                  : profile === 'disabled-csp'
                    ? { csp: { enabled: false } }
                    : {}),
                auth: {
                  roles: [{ name: 'Admin' }, { name: 'Researcher' }, { name: 'Guest' }],
                  rules: [{ path: '/:branding/:portal/researcher(/*)', role: 'Admin', can_update: true }],
                },
              },
              artifacts: async directory => {
                if (profile === 'hook-priority' || profile === 'brand-specificity' || profile === 'explicit-roots') {
                  const pkg = path.join(directory, 'package.json');
                  const manifest = JSON.parse(await readFile(pkg, 'utf8'));
                  manifest.dependencies['fm029-high'] = '1.0.0';
                  manifest.dependencies['fm029-low'] = '1.0.0';
                  manifest.hookLoadPriority = ['fm029-high', 'fm029-low'];
                  await writeFile(pkg, JSON.stringify(manifest));
                  for (const name of ['fm029-high', 'fm029-low']) {
                    const root = path.join(directory, 'node_modules', name);
                    for (const sub of ['views/default/default/layout', 'assets/angular/form/browser'])
                      await mkdir(path.join(root, sub), { recursive: true });
                    await writeFile(
                      path.join(root, 'package.json'),
                      JSON.stringify({
                        name,
                        version: '1.0.0',
                        main: 'index.cjs',
                        redbox: { extension: './index.cjs' },
                      })
                    );
                    const live =
                      name === 'fm029-high'
                        ? mode === 'fastify'
                          ? `,hooks:[{name:'fm029-live-input',stage:'beforeAction',scope:{kind:'routes',names:[${JSON.stringify(coreRouteName('all', '/:branding/:portal/home'))}]},run:async request=>{if(request.headers['x-fm029-live']==='yes'){request.query={lng:'fr',rdmp:'hook'};request.body={fixture:'body'};request.params={...request.params};}}}]`
                          : `,handlers:[{name:'fm029-live-input',create:()=>((request,response,next)=>{if(request.headers['x-fm029-live']==='yes'){Object.defineProperty(request,'query',{configurable:true,writable:true,value:{lng:'fr',rdmp:'hook'}});request.body={fixture:'body'};request.params={...request.params};}next();})}],middleware:[{name:'fm029-live-input',stage:'beforeRoutes',handler:'fm029-live-input'}]`
                        : '';
                    await writeFile(
                      path.join(root, 'index.cjs'),
                      `exports.registerRedboxExtension=()=>({apiVersion:${mode === 'fastify' ? 2 : 1},views:['views'],assets:['assets']${live}});`
                    );
                    await writeFile(
                      path.join(
                        root,
                        'assets/angular/form/browser/main-HOOK' + (name.endsWith('high') ? 'HIGH' : 'LOW') + '.js'
                      ),
                      'fixture'
                    );
                    await writeFile(
                      path.join(root, 'views/default/default/layout/head-extra.ejs'),
                      `<i>${name}-include</i>`
                    );
                    await writeFile(
                      path.join(root, 'views/default/default/homepage.ejs'),
                      '<b>' + name + '</b>' + localsTemplate
                    );
                  }
                  await mkdir(path.join(directory, '.tmp/public/angular/form/browser'), { recursive: true });
                  await writeFile(
                    path.join(directory, '.tmp/public/angular/form/browser/main-COMPILED.js'),
                    'compiled'
                  );
                  if (profile === 'explicit-roots') {
                    pageOptions.viewRoots = [path.join(directory, 'deployment-views')];
                    pageOptions.assetRoots = [path.join(directory, 'deployment-assets')];
                    await mkdir(path.join(pageOptions.viewRoots[0], 'default/default'), { recursive: true });
                    await mkdir(path.join(pageOptions.assetRoots[0], 'angular/form/browser'), { recursive: true });
                    await writeFile(
                      path.join(pageOptions.viewRoots[0], 'default/default/homepage.ejs'),
                      '<b>explicit-root</b>' + localsTemplate
                    );
                    await writeFile(
                      path.join(pageOptions.assetRoots[0], 'angular/form/browser/main-EXPLICIT.js'),
                      'explicit'
                    );
                  }
                  if (profile === 'brand-specificity') {
                    await mkdir(path.join(directory, 'views/default/rdmp'), { recursive: true });
                    await writeFile(
                      path.join(directory, 'views/default/rdmp/homepage.ejs'),
                      '<b>core-brand</b>' + localsTemplate
                    );
                  }
                }
                await mkdir(path.join(directory, 'locales/fr'), { recursive: true });
                await writeFile(
                  path.join(directory, 'locales/fr/translation.json'),
                  JSON.stringify({ 'default-title': 'Portail', 'welcome-title': 'Bienvenue' })
                );
                const en = path.join(directory, 'locales/en/translation.json');
                await writeFile(
                  en,
                  JSON.stringify({
                    ...JSON.parse(await readFile(en, 'utf8')),
                    'default-title': 'Portal',
                    'welcome-title': 'Welcome',
                  })
                );
              },
            }
          );
          try {
            if (mode === 'fastify') {
              // Page rendering must not reopen the reserved FM-018 namespaces
              // or treat a non-boundary root-context prefix as a portal URL.
              for (const pathname of [
                ...(f.portal.config.server.rootContext ? ['/portalx/default/rdmp/absent'] : []),
                f.portal.config.server.rootContext + '/js/missing.js',
                f.portal.config.server.rootContext + '/angular/missing.js',
              ]) {
                for (const method of ['GET', 'HEAD']) {
                  const denied = await pageWire(new URL(f.url).origin + pathname, method);
                  assert.equal(denied.status, 404);
                  if (method === 'GET') assert.deepEqual(JSON.parse(denied.text), { error: 'not-found' }, pathname);
                  else assert.equal(denied.text, '');
                  assert.equal(denied.headers['content-security-policy'], undefined);
                  const absolute = await pageWire(f.url, method, {}, '', 'http://request.invalid' + pathname);
                  assert.deepEqual(normalized(absolute), normalized(denied), pathname);
                }
              }
            }
            // Unsupported target forms retain their parser/host error boundaries,
            // including the retained no-root asterisk 500, without a landing redirect.
            for (const negative of targetNegatives) {
              const target = negative.path;
              const method = negative.method!;
              const denied = await pageWire(f.url, method, {}, '', target);
              assert.equal(denied.status, target !== '*' ? 400 : profile === 'no-root' ? 500 : 404);
              assert.equal(
                denied.headers['cross-origin-opener-policy'],
                target === '*' && profile === 'no-root' ? 'same-origin-allow-popups' : undefined
              );
              assert(!String(denied.headers['content-security-policy']).includes('nonce-'));
              if (method === 'HEAD') assert.equal(denied.text, '');
              const key = profile + ':target negative ' + method + ' ' + target;
              snapshots.set(key, [...(snapshots.get(key) ?? []), normalized(denied)]);
            }
            const session = await login(f);
            assert.equal(session.result.status, 302);
            const csrf = await pageWire(f.url + '/csrfToken', 'GET', {
              Cookie: session.cookie,
              'X-Forwarded-Proto': 'https',
            });
            const csrfToken = JSON.parse(csrf.text)._csrf;
            const invalid = await login(f, false);
            assert.equal(invalid.result.status, 200); // retained local-login failure contract
            const denied = await pageWire(
              f.url + '/user/login_aaf',
              'POST',
              {
                'X-Forwarded-Proto': 'https',
                Accept: 'text/html',
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              'assertion=invalid&branding=default&portal=rdmp'
            );
            snapshots.set(profile + ':403 authentication error', [
              ...(snapshots.get(profile + ':403 authentication error') ?? []),
              normalized(denied),
            ]);
            for (const scenario of all) {
              let restore = () => {};
              if (scenario.fault === 'page' || scenario.fault === 'error') {
                const render = PageArtifacts.prototype.render;
                const stub = sinon.stub(PageArtifacts.prototype, 'render').callsFake(function (
                  this: PageArtifacts,
                  file,
                  locals
                ) {
                  if (file.endsWith('homepage.ejs') || (scenario.fault === 'error' && file.endsWith('500.ejs')))
                    throw new Error('private template diagnostic');
                  return render.call(this, file, locals);
                });
                restore = () => stub.restore();
              } else if (scenario.fault) {
                const stub =
                  scenario.fault === 'typeface'
                    ? sinon
                        .stub(f.data.reference.branding.get(), 'getActiveTypefaceFontInfo')
                        .throws(new Error('private typeface diagnostic'))
                    : scenario.fault === 'navigation'
                      ? sinon
                          .stub(Navigation.Navigation.prototype, 'resolveMenu')
                          .rejects(new Error('private navigation diagnostic'))
                      : scenario.fault === 'settings'
                        ? sinon
                            .stub(f.data.reference.appConfigs.get(), 'getAppConfigurationForBrand')
                            .throws(new Error('private settings diagnostic'))
                        : sinon
                            .stub(f.data.reference.entries.get(), 'listLanguages')
                            .rejects(new Error('private languages diagnostic'));
                restore = () => stub.restore();
              }
              try {
                const response = await pageWire(
                  f.url + scenario.path,
                  scenario.method,
                  {
                    Accept: 'text/html',
                    'X-Forwarded-Proto': 'https',
                    ...(scenario.csrf
                      ? {
                          Cookie: session.cookie,
                          'X-CSRF-Token': csrfToken,
                          Origin: new URL(f.portal.config.server.publicUrl).origin,
                        }
                      : {}),
                    ...(scenario.auth ? { Authorization: 'Bearer ' + scenario.auth } : {}),
                    ...(scenario.session ? { Cookie: session.cookie } : {}),
                    ...scenario.headers,
                  },
                  scenario.body,
                  scenario.absolute
                    ? 'http://request.invalid' + f.portal.config.server.rootContext + scenario.path
                    : undefined
                );
                const csp =
                  response.headers['content-security-policy'] ??
                  response.headers['content-security-policy-report-only'];
                if (typeof csp === 'string' && scenario.method !== 'HEAD' && response.text.includes('<html')) {
                  const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
                  assert(nonce);
                  assert(response.text.includes('nonce="' + nonce + '"'));
                }
                const list = snapshots.get(profile + ':' + scenario.name) ?? [];
                list.push(normalized(response));
                snapshots.set(profile + ':' + scenario.name, list);
              } finally {
                restore();
              }
            }
          } finally {
            await f.close();
          }
          process.stdout.write('Captured pages ' + profile + '/' + mode + '\n');
        }
    } finally {
      await retained.close();
    }
    if (process.env.FM029_HTTP_REPORT)
      await writeFile(process.env.FM029_HTTP_REPORT, JSON.stringify(Object.fromEntries(snapshots), null, 2));
  });
  for (const profile of selectedProfiles)
    for (const scenario of [...all, { name: '403 authentication error', path: '' }, ...targetNegatives])
      it(profile + ' ' + scenario.name, () => {
        const values = snapshots.get(profile + ':' + scenario.name)!;
        assert.equal(values.length, 3);
        assert.deepEqual(values[1], values[0], 'shared Express');
        assert.deepEqual(values[2], values[0], 'native Fastify');
        assert(!values[2].text.includes('private '));
        assert.equal(values[2].headers['content-encoding'], undefined);
        assert(!String(values[2].headers.vary ?? '').includes('Accept-Encoding'));
        if (scenario.method === 'HEAD') assert.equal(values[2].text, '');
        if (scenario.name === 'anonymous home' || scenario.name === 'authenticated home') {
          assert.equal(values[2].status, 200);
          if (profile === 'hook-priority') assert.match(values[2].text, /fm029-high/);
          if (profile === 'brand-specificity') assert.match(values[2].text, /core-brand/);
          if (profile === 'explicit-roots') assert.match(values[2].text, /explicit-root/);
        }
        if (scenario.name.startsWith('404 html')) assert.equal(values[2].status, 404);
        if (
          scenario.name === 'live input replacement' &&
          ['hook-priority', 'brand-specificity', 'explicit-roots'].includes(profile)
        ) {
          assert.match(values[2].text, /body/);
          assert.match(values[2].text, /hook/);
        }
        if (scenario.name === 'bodyless POST with csrf' || scenario.name === 'empty JSON POST with csrf')
          assert.equal(values[2].status, 200);
        if (scenario.name.includes('preparation fault')) {
          for (const value of values) {
            assert.equal(value.status, 500);
            assert.equal(value.headers['cache-control'], 'no-cache, private');
            assert.equal(value.headers.expires, '0');
            assert.equal(value.headers.pragma, 'no-cache');
            assert.equal(value.headers['surrogate-control'], 'no-store');
            assert.equal(
              value.headers['cross-origin-opener-policy'],
              profile === 'http-canonical' ? undefined : 'same-origin-allow-popups'
            );
            for (const header of ['content-security-policy', 'content-security-policy-report-only']) {
              const enabled =
                profile !== 'disabled-csp' &&
                header ===
                  (profile === 'report-only' ? 'content-security-policy-report-only' : 'content-security-policy');
              if (enabled) assert.match(String(value.headers[header]), /'nonce-<nonce>'/);
              else assert.equal(value.headers[header], undefined);
            }
            assert.equal(value.headers['content-type'], 'application/json; charset=utf-8');
            if (scenario.method !== 'HEAD')
              assert.deepEqual(JSON.parse(value.text), { message: 'Internal server error', details: '' });
          }
        }
        if (scenario.absolute) {
          const https = profile !== 'http-canonical';
          for (const value of values)
            assert.equal(value.headers['cross-origin-opener-policy'], https ? 'same-origin-allow-popups' : undefined);
          if (scenario.name.includes('home')) {
            assert.equal(values[2].status, 200);
            if (
              scenario.method !== 'HEAD' &&
              ['hook-priority', 'brand-specificity', 'explicit-roots'].includes(profile)
            ) {
              assert(values[2].text.includes('&#34;url&#34;:&#34;http://request.invalid' + scenario.path + '&#34;'));
              assert(
                values[2].text.includes(
                  '&#34;originalUrl&#34;:&#34;http://request.invalid/portal' + scenario.path + '&#34;'
                )
              );
            }
          } else if (scenario.name.includes('404')) assert.equal(values[2].status, 404);
          else assert.equal(values[2].status, 302);
        }
        if (scenario.name === '500 html') assert.equal(values[2].status, 500);
        if (scenario.name === '403 authentication error') assert.equal(values[2].status, 403);
      });
});
