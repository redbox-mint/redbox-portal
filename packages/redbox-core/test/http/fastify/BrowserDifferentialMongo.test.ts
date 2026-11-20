import { authorizationWitness } from './authorizationRequests';
import { goldenControls } from './goldenContracts';
import { assertProductionContract } from './productionContracts';
import assert from 'node:assert/strict';
import { assertNoObservedEffects, observeNoSideEffects } from './noSideEffects';
import { mutationWitnessCases } from './mutationWitnessSelection';
import { request } from 'node:http';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pageRoutes } from '../../../src/http/pageRoutes';
import { coreRouteName } from '../../../src/http/fastify/routes';
import { getReferenceRepositories } from '../../../src/persistence/reference/runtime';
import { referenceProductionFixture } from './referenceProductionFixture';

import { oidcFixture } from './oidcFixture';
import { aafAssertion, availablePort } from './authenticationFixture';
import type { ResolvedPortalInstallation } from '../../../src/application/portal/installation';
import type { ApiRouteSource } from '../../../src/http/fastify/routes';

import type { OidcAuthConfig } from '../../../src/authentication/Accounts';
const audit = require('../../../../../support/specs/fastify-migration/evidence/reconcile-FM-030.cjs') as {
  declarations: readonly ApiRouteSource[];
  reconcile(installation: ResolvedPortalInstallation, runtime: unknown): unknown;
};
type Wire = {
  status: number;
  headers: Record<string, unknown>;
  text: string;
};
async function wire(
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
        ...(target ? { path: target } : {}),
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
function normalized(value: Wire, port: number, issuer: string) {
  const headers = { ...value.headers };
  for (const key of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[key];
  if (headers.expires && headers.expires !== '0') headers.expires = '<time>';
  if (headers['set-cookie'])
    headers['set-cookie'] = (headers['set-cookie'] as string[]).map(value =>
      value.replace(/^([^=]+)=[^;]+/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')
    );
  for (const key of ['content-security-policy', 'content-security-policy-report-only'])
    if (typeof headers[key] === 'string') headers[key] = headers[key].replace(/nonce-[^' ;]+/g, 'nonce-<nonce>');
  const redact = (text: string) =>
    text
      .replaceAll(issuer, 'http://provider.invalid')
      .replaceAll(String(port), '<port>')
      .replace(/(nonce|ngCspNonce)="[^"]+"/gi, '$1="<nonce>"')
      .replace(/[a-f0-9]{64}/g, '<csrf>');
  // Normalize only independent protocol values and query ordering. Keep the raw
  // URL prefix (including brackets/percent-escape spelling) and every header.
  if (typeof headers.location === 'string' && headers.location.includes('code_challenge=')) {
    const split = headers.location.indexOf('?');
    const params = headers.location
      .slice(split + 1)
      .split('&')
      .map(pair => {
        const [key, value] = pair.split('=');
        if (!['state', 'code_challenge', 'nonce'].includes(key)) return pair;
        assert(value, 'provider initiation supplies ' + key);
        return key + '=<' + key + '>';
      });
    headers.location = headers.location.slice(0, split) + '?' + params.sort().join('&');
  }
  const text = redact(value.text)
    .replace(/[a-f0-9]{24}/g, '<id>')
    .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, '<timestamp>');
  for (const [key, value] of Object.entries(headers)) if (typeof value === 'string') headers[key] = redact(value);
  return { status: value.status, headers, text };
}
const providerUrls = [
  {
    name: 'ipv6',
    authorization: 'https://[2001:db8::1]/authorize',
    logout: 'https://[2001:db8::1]/logout',
    local: '/portal/default/rdmp/home?provider=[2001:db8::1]',
    expectedLocal: '/portal/default/rdmp/home?provider=[2001:db8::1]',
  },
  {
    name: 'encoded',
    authorization: 'https://provider.example.invalid/a%2fb/%252F/authorize?tenant=a%2Fb',
    logout: 'https://provider.example.invalid/a%2fb/%252F/logout?tenant=a%2Fb',
    local: '/portal/default/rdmp/a%2fb/%252F?tenant=a%2fb',
    expectedLocal: '/portal/default/rdmp/a%2fb/%252F?tenant=a%2fb',
  },
  {
    name: 'unicode',
    authorization: 'https://münich.example.invalid/entrée/authorize?tenant=été',
    logout: 'https://münich.example.invalid/entrée/logout?tenant=été',
    local: '/portal/default/rdmp/été?tenant=認可',
    expectedLocal: '/portal/default/rdmp/%C3%A9t%C3%A9?tenant=%E8%AA%8D%E5%8F%AF',
  },
] as const;
const cookie = (value: Wire) => String((value.headers['set-cookie'] as string[] | undefined)?.[0] ?? '').split(';')[0]!;
type Scenario = {
  name: string;
  path: string;
  auth?: string;
  method?: string;
  csrf?: boolean;
  session?: boolean;
  body?: string;
  absolute?: boolean;
  headers?: Record<string, string>;
  expectedStatus?: number;
};
const params: Record<string, string> = {
  branding: 'default',
  portal: 'rdmp',
  recordType: 'dataRecord',
  oid: 'reference-record',
  dashboardView: 'referenceView',
  name: 'records',
  appConfigId: 'systemMessage',
};
const scenarios: Scenario[] = pageRoutes.flatMap<Scenario>(route => {
  const target = route.path.replace(/:([A-Za-z]+)/g, (_, name: string) => params[name]);
  const writes: Scenario[] =
    route.method === 'all'
      ? [
          { name: route.path + ' missing csrf', path: target, method: 'POST', session: true },
          { name: route.path + ' bodyless csrf', path: target, method: 'POST', session: true, csrf: true },
          {
            name: route.path + ' empty body csrf',
            path: target,
            method: 'POST',
            session: true,
            csrf: true,
            body: '{}',
            headers: { 'Content-Type': 'application/json' },
          },
          {
            name: route.path + ' cross origin',
            path: target,
            method: 'POST',
            session: true,
            csrf: true,
            headers: { Origin: 'https://hostile.invalid' },
          },
        ]
      : [];
  return [
    { name: route.path + ' anonymous', path: target },
    { name: route.path + ' admin', path: target, auth: 'pilot-api-token' },
    { name: route.path + ' reader', path: target, auth: 'reader-token' },
    { name: route.path + ' foreign', path: target, auth: 'foreign-token' },
    { name: route.path + ' session', path: target, session: true },
    { name: route.path + ' HEAD', path: target, auth: 'pilot-api-token', method: 'HEAD' },
    {
      name: route.path + ' absolute',
      path: target + '?rdmp=absolute%2Fvalue',
      auth: 'pilot-api-token',
      absolute: true,
    },
    { name: route.path + ' absolute HEAD', path: target, auth: 'pilot-api-token', absolute: true, method: 'HEAD' },
    ...writes,
  ];
});
scenarios.push(
  ...[
    '/record/edit/absent',
    '/record/edit/foreign-record',
    '/record/view/absent',
    '/record/view/foreign-record',
    '/dashboard-view/absent',
    '/admin/appconfig/edit/absent',
  ].flatMap(path =>
    ['GET', 'HEAD'].map(method => ({
      name: 'not found ' + method + path,
      path: '/default/rdmp' + path,
      method,
      auth: 'pilot-api-token',
    }))
  ),
  ...[
    '/missing/rdmp/home',
    '/default/missing/home',
    '/other/rdmp/home',
    '/default/rdmp/record/edit/%20',
    '/default/rdmp/home?lng[toString]=bad',
    '/default/rdmp/dashboard/dataRecord?dashboardType[]=bad',
  ].map(path => ({ name: 'invalid ' + path, path, auth: 'pilot-api-token' })),
  {
    name: 'fresh conditional dashboard',
    path: '/default/rdmp/dashboard/dataRecord',
    auth: 'pilot-api-token',
    headers: { 'If-None-Match': '*', 'If-Modified-Since': 'Wed, 01 Jan 2100 00:00:00 GMT' },
  },
  {
    name: 'live replacement record',
    path: '/default/rdmp/record/edit/absent',
    session: true,
    headers: { 'X-FM030-Live': 'yes' },
  },
  {
    name: 'live replacement dashboard',
    path: '/default/rdmp/dashboard/dataRecord',
    session: true,
    headers: { 'X-FM030-Live': 'yes' },
  },
  ...[
    '/user/info',
    '/default/rdmp/user/info',
    '/other/rdmp/user/info',
    '/missing/rdmp/user/info',
    '/default/missing/user/info',
  ].flatMap(path =>
    ['GET', 'HEAD'].map(method => ({
      name: 'session identity ' + method + path,
      path,
      method,
      session: true,
      expectedStatus: path === '/user/info' || path === '/default/rdmp/user/info' ? 200 : 403,
    }))
  ),
  { name: 'typed validation 400', path: '/default/rdmp/record/edit/%20', auth: 'pilot-api-token', expectedStatus: 400 },
  {
    name: 'typed authorization 403',
    path: '/default/rdmp/record/edit/reference-record',
    auth: 'reader-token',
    expectedStatus: 403,
  },
  { name: 'typed missing 404', path: '/default/rdmp/record/edit/absent', auth: 'pilot-api-token', expectedStatus: 404 },
  { name: 'browser operation missing actor', path: '/default/rdmp/record/metadata/reference-record' }
);
const profiles = ['default', 'reduced', 'hooks'] as const;
const selected = profiles.filter(
  profile => !process.env.FM030_PROFILES || process.env.FM030_PROFILES.split(',').includes(profile)
);
const captures = new Map<string, ReturnType<typeof normalized>[]>();
const flowCaptures = new Map<string, unknown[]>();
const prohibitedEffects = new Map<string, string[]>();
const modes = ['fastify'] as const;
const flowNames = [
  'local session transition',
  'protected return URL',
  'local failure',
  'local missing csrf',
  'local origin denial',
  'local bodyless',
  'local empty',
  'local invalid context',
  'local invalid portal',
  'local foreign brand',
  'local absolute target',
  'local javascript response',
  'logout missing csrf',
  'logout origin denial',
  'logout GET',
  'logout HEAD',
  'logout session transition',
  'AAF initiation link',
  'AAF success',
  'AAF rejection',
  'AAF invalid assertion',
  'OIDC begin HEAD',
  'OIDC callback no session',
  'OIDC callback HEAD no session',
  'OIDC success',
  'OIDC success initiation',
  'OIDC invalid state initiation',
  'OIDC denied initiation',
  ...providerUrls.flatMap(({ name }) => [
    'OIDC begin ' + name,
    'OIDC logout setup initiation ' + name,
    'OIDC provider logout ' + name,
    'AAF return ' + name,
  ]),
  'OIDC invalid state',
  'OIDC denied',
  'OIDC provider logout',
  ...[
    'https://evil.invalid/',
    '//evil.invalid/',
    '/outside',
    '/portal\\evil',
    '/portal/default/rdmp/home\r\nX: value',
    '/portal/default/rdmp/researcher/home',
  ].map(value => 'return ' + JSON.stringify(value)),
];
const browserSuiteTitle = 'FM-030 production browser declaration/runtime and retained Express raw HTTP differential';
describe(browserSuiteTitle, function () {
  this.timeout(1800000);
  before(async () => {
    try {
      for (const profile of selected.filter(
        profile =>
          mutationWitnessCases(
            browserSuiteTitle,
            [...scenarios.map(scenario => scenario.name), ...flowNames],
            name => `${profile} ${name}`
          ).length
      ))
        for (const mode of modes) {
          const provider = await oidcFixture();
          let f: Awaited<ReturnType<typeof referenceProductionFixture>> | undefined;
          try {
            const port = await availablePort();
            const origin = 'http://127.0.0.1:' + port;
            const providerAuth = provider.config(port);
            const configuredProvider = (
              identifier: string,
              endpoints: Partial<import('openid-client').ServerMetadata>
            ) => {
              const config = provider.config(port, 'allowed', identifier).oidc as OidcAuthConfig;
              return { ...config, opts: { ...config.opts, issuer: provider.metadata(endpoints) } };
            };
            const auth = {
              ...providerAuth,
              aaf: { ...providerAuth.aaf, loginUrl: providerUrls[profiles.indexOf(profile)].authorization },
              local: { ...providerAuth.local, postLoginRedir: 'home' },
              oidc: [
                providerAuth.oidc as OidcAuthConfig,
                ...providerUrls.flatMap(url => [
                  configuredProvider(url.name, {
                    authorization_endpoint: url.authorization,
                    end_session_endpoint: url.logout,
                  }),
                  configuredProvider('logout-' + url.name, { end_session_endpoint: url.logout }),
                ]),
              ],
            };
            f = await referenceProductionFixture(
              mode === 'fastify',
              profile === 'reduced' ? { '*': ['noCache', 'brandingAndPortal'] } : undefined,
              undefined,
              {
                declarations: audit.declarations,
                pages: {},
                configuration: {
                  i18n: { next: { init: { debug: false } } },
                  server: {
                    hostname: '127.0.0.1',
                    port,
                    rootContext: '/portal',
                    trustProxy: true,
                    publicUrl: origin,
                    stopDeadlineMs: 30000,
                  },
                  auth: {
                    roles: [{ name: 'Admin' }, { name: 'Researcher' }, { name: 'Guest' }],
                    rules: [{ path: '/:branding/:portal(/*)', role: 'Admin', can_update: true }],
                    logoutOrigins: [provider.issuer, ...providerUrls.map(url => new URL(url.logout).origin)],
                  },
                  brandingConfigurationDefaults: { auth },
                },
                artifacts: async directory => {
                  // Expose page locals without Angular delivery (FM-031).
                  for (const view of ['record/edit', 'dashboard']) {
                    const file = path.join(directory, 'views/default/rdmp', view + '.ejs');
                    await mkdir(path.dirname(file), { recursive: true });
                    await writeFile(
                      file,
                      '<pre><%= JSON.stringify({oid,recordType,formName,rdmp,titleLabel:displayValue("titleLabel"),dashboardType:displayValue("dashboardType"),dashboardView:displayValue("dashboardView"),fixture:page.param("fixture")}) %></pre>'
                    );
                  }
                  if (profile !== 'hooks') return;
                  const pkg = path.join(directory, 'package.json'),
                    manifest = JSON.parse(await readFile(pkg, 'utf8'));
                  manifest.dependencies['fm030-live'] = '1.0.0';
                  await writeFile(pkg, JSON.stringify(manifest));
                  const root = path.join(directory, 'node_modules/fm030-live');
                  await mkdir(root, { recursive: true });
                  await writeFile(
                    path.join(root, 'package.json'),
                    JSON.stringify({
                      name: 'fm030-live',
                      version: '1.0.0',
                      main: 'index.cjs',
                      redbox: { extension: './index.cjs' },
                    })
                  );
                  const live =
                    "if(request.headers['x-fm030-live']==='yes'){request.body={fixture:'body'};request.params={...request.params,oid:request.params.oid?'reference-record':undefined};REPLACE_QUERY}";
                  const contribution = `hooks:[{name:'fm030-live',stage:'beforeAction',scope:{kind:'routes',names:${JSON.stringify(pageRoutes.map(route => coreRouteName(route.method, route.path)))}},run:async request=>{${live.replace('REPLACE_QUERY', "request.query={rdmp:'hook',titleLabel:'live'};")}}}]`;
                  await writeFile(
                    path.join(root, 'index.cjs'),
                    `exports.registerRedboxExtension=()=>({apiVersion:${2},${contribution}});`
                  );
                },
              }
            );
            const fixture = f;
            await getReferenceRepositories(fixture.owner).forms.createDefinition({
              id: '000000000000000000000024',
              name: 'default-1.0-draft',
              branding: fixture.brand.id,
              configuration: { name: 'default-1.0-draft', type: 'dataRecord', componentDefinitions: [] },
            });
            if ('installation' in fixture.portal) {
              const report = audit.reconcile(
                fixture.portal.installation,
                fixture.portal.installation.registry.snapshot()
              );
              if (process.env.FM030_RUNTIME_REPORT)
                await writeFile(
                  process.env.FM030_RUNTIME_REPORT,
                  JSON.stringify({ report, actual: fixture.portal.installation.registry.snapshot() }, null, 2)
                );
            }
            const capture = (name: string, value: Wire) => {
              const key = profile + ':' + name;
              captures.set(key, [...(captures.get(key) ?? []), normalized(value, port, provider.issuer)]);
            };
            const captureDeniedMutation = async (name: string, send: () => Promise<Wire>, account?: string) => {
              const effects = await observeNoSideEffects(fixture, { expectedCredentialTimestamp: account });
              try {
                capture(name, await authorizationWitness(`${browserSuiteTitle} ${profile} ${name}`, send));
                prohibitedEffects.set(`${profile}:${name}`, await effects.differences());
              } finally {
                effects.restore();
              }
            };
            const flow = (name: string, value: unknown) => {
              const key = profile + ':' + name;
              flowCaptures.set(key, [...(flowCaptures.get(key) ?? []), value]);
            };
            const getToken = async (active = '') => {
              const value = await wire(fixture.url + '/csrfToken', 'GET', { Cookie: active });
              assert.equal(value.status, 200);
              return { cookie: cookie(value) || active, csrf: JSON.parse(value.text)._csrf as string };
            };
            const postLocal = async (
              extra: Record<string, string> = {},
              redir = '',
              active?: Awaited<ReturnType<typeof getToken>>,
              body?: string
            ) => {
              const state = active ?? (await getToken());
              return wire(
                fixture.url + '/user/login_local' + (redir ? '?redirUrl=' + encodeURIComponent(redir) : ''),
                'POST',
                {
                  Cookie: state.cookie,
                  Origin: origin,
                  'X-CSRF-Token': state.csrf,
                  'Content-Type': 'application/x-www-form-urlencoded',
                  ...extra,
                },
                body ?? 'username=pilot-admin&password=pilot-password'
              );
            };
            const token = await getToken();
            const originalSessions = await fixture.client.db().collection('referenceSessions').find().toArray();
            const logged = await postLocal({}, '', token);
            assert.equal(logged.status, 302);
            const active = cookie(logged);
            const sessionDocuments = await fixture.client.db().collection('referenceSessions').find().toArray();
            const persistedDocument = sessionDocuments.find(
              document => JSON.parse(document.session).passport?.user === '000000000000000000000015'
            );
            assert(persistedDocument);
            const persisted = JSON.parse(persistedDocument.session);
            assert(persisted);
            assert.equal(persisted.authenticationVersion, 6);
            assert.equal(persisted.branding, 'default');
            assert.equal(persisted.portal, 'rdmp');
            for (const document of originalSessions)
              assert.equal(
                await fixture.client.db().collection('referenceSessions').countDocuments({ _id: document._id }),
                0,
                'login removes the preceding session'
              );
            assert(active && active !== token.cookie, 'login rotates session cookie');
            const old = await wire(fixture.url + '/user/info', 'GET', { Cookie: token.cookie });
            assert.equal(old.status, 403);
            const info = await wire(fixture.url + '/user/info', 'GET', { Cookie: active });
            assert.equal(info.status, 200);
            assert.equal(JSON.parse(info.text).user.id, '000000000000000000000015');
            capture('local session transition', logged);
            flow('local session transition', { old: old.status, info: info.status, rotated: true });
            const state = await getToken(active);
            for (const scenario of scenarios) {
              const response = await authorizationWitness(`${browserSuiteTitle} ${profile} ${scenario.name}`, () =>
                wire(
                  fixture.url + scenario.path,
                  scenario.method,
                  {
                    Accept: 'text/html',
                    ...(scenario.auth ? { Authorization: 'Bearer ' + scenario.auth } : {}),
                    ...(scenario.session ? { Cookie: active } : {}),
                    ...(scenario.csrf ? { Cookie: active, Origin: origin, 'X-CSRF-Token': state.csrf } : {}),
                    ...scenario.headers,
                  },
                  scenario.body,
                  scenario.absolute ? 'http://request.invalid/portal' + scenario.path : undefined
                )
              );
              capture(scenario.name, response);
            }
            for (const [name, extra, body] of [
              ['local failure', {}, 'username=pilot-admin&password=wrong'],
              ['local missing csrf', { 'X-CSRF-Token': '' }, undefined],
              ['local origin denial', { Origin: 'https://evil.invalid' }, undefined],
              ['local bodyless', { 'Content-Type': '' }, ''],
              ['local empty', { 'Content-Type': 'application/json' }, '{}'],
              ['local invalid context', {}, 'username=pilot-admin&password=pilot-password&branding=missing'],
              ['local invalid portal', {}, 'username=pilot-admin&password=pilot-password&portal=missing'],
              ['local foreign brand', {}, 'username=pilot-admin&password=pilot-password&branding=other'],
              ['local javascript response', { 'X-Source': 'jsclient' }, undefined],
            ] as const) {
              if (name === 'local foreign brand') {
                const credentials = await getToken();
                const users = fixture.client.db().collection('user');
                const account = { username: 'pilot-admin' };
                const before = await users.findOne(account);
                assert(before);
                // Valid local credentials refresh the timestamp before brand
                // admission. The refusal cannot issue a session or business audit.
                await captureDeniedMutation(name, () => postLocal(extra, '', credentials, body), account.username);
                const after = await users.findOne(account);
                assert(after);
                assert(new Date(after.lastLogin).getTime() > new Date(before.lastLogin).getTime());
              } else capture(name, await postLocal(extra, '', undefined, body));
            }
            const absoluteState = await getToken();
            capture(
              'local absolute target',
              await wire(
                fixture.url + '/user/login_local',
                'POST',
                {
                  Cookie: absoluteState.cookie,
                  Origin: origin,
                  'X-CSRF-Token': absoluteState.csrf,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                'username=pilot-admin&password=pilot-password',
                'http://request.invalid/portal/user/login_local'
              )
            );
            for (const redir of [
              'https://evil.invalid/',
              '//evil.invalid/',
              '/outside',
              '/portal\\evil',
              '/portal/default/rdmp/home\r\nX: value',
              '/portal/default/rdmp/researcher/home',
            ]) {
              const response = await postLocal({}, redir);
              assert.equal(
                response.headers.location,
                redir === '/portal/default/rdmp/researcher/home' ? redir : '/portal/default/rdmp/home'
              );
              capture('return ' + JSON.stringify(redir), response);
            }
            const protectedPage = await wire(fixture.url + '/default/rdmp/researcher/home');
            assert.equal(protectedPage.status, 302);
            const returning = await getToken(cookie(protectedPage));
            const returned = await postLocal({}, 'https://evil.invalid/', returning);
            assert.equal(returned.headers.location, '/portal/default/rdmp/researcher/home');
            capture('protected return URL', returned);
            for (const [name, method, headers] of [
              ['logout missing csrf', 'POST', { Cookie: active }],
              [
                'logout origin denial',
                'POST',
                { Cookie: active, Origin: 'https://evil.invalid', 'X-CSRF-Token': state.csrf },
              ],
              ['logout GET', 'GET', { Cookie: active }],
              ['logout HEAD', 'HEAD', { Cookie: active }],
            ] as const)
              capture(name, await wire(fixture.url + '/default/rdmp/user/logout', method, headers));
            const logout = await wire(fixture.url + '/default/rdmp/user/logout', 'POST', {
              Cookie: active,
              Origin: origin,
              'X-CSRF-Token': state.csrf,
            });
            assert.equal(logout.status, 302);
            assert.match(cookie(logout), /=$/);
            capture('logout session transition', logout);
            assert.equal((await wire(fixture.url + '/user/info', 'GET', { Cookie: active })).status, 403);
            assert.equal(
              await fixture.client.db().collection('referenceSessions').countDocuments({ _id: persistedDocument._id }),
              0,
              'logout removes the authenticated session'
            );
            flow('logout session transition', { destroyed: true, oldCookieStatus: 403 });
            capture(
              'AAF initiation link',
              await wire(fixture.url + '/default/rdmp/user/login', 'GET', {
                Authorization: 'Bearer pilot-api-token',
              })
            );
            for (const [name, assertion] of [
              [
                'AAF success',
                aafAssertion({
                  sub: 'aaf-subject',
                  'https://aaf.edu.au/attributes': {
                    mail: 'AAF@EXAMPLE.INVALID',
                    displayname: 'AAF Fixture',
                    givenname: 'AAF',
                    surname: 'Test',
                  },
                }),
              ],
              ['AAF rejection', 'invalid'],
              ['AAF invalid assertion', ''],
            ] as const) {
              const send = () =>
                wire(
                  fixture.url + '/user/login_aaf',
                  'POST',
                  { 'Content-Type': 'application/json' },
                  JSON.stringify({ assertion })
                );
              if (name === 'AAF invalid assertion') await captureDeniedMutation(name, send);
              else capture(name, await send());
            }
            capture('OIDC begin HEAD', await wire(fixture.url + '/user/begin_oidc', 'HEAD'));
            capture(
              'OIDC callback no session',
              await wire(fixture.url + '/user/login_oidc?code=invalid&state=invalid')
            );
            capture(
              'OIDC callback HEAD no session',
              await wire(fixture.url + '/user/login_oidc?code=invalid&state=invalid', 'HEAD')
            );
            for (const [name, providerMode] of [
              ['OIDC success', 'good'],
              ['OIDC invalid state', 'good'],
              ['OIDC denied', 'access-denied'],
            ] as const) {
              provider.setMode(providerMode);
              const begin = await wire(
                fixture.url + '/user/begin_oidc?redirUrl=' + encodeURIComponent('/portal/default/rdmp/researcher/home')
              );
              assert.equal(begin.status, 302);
              capture(name + ' initiation', begin);
              const authorized = await wire(String(begin.headers.location));
              assert.equal(authorized.status, 302);
              const callback = new URL(String(authorized.headers.location));
              if (name === 'OIDC invalid state') callback.searchParams.set('state', 'invalid');
              const result = await wire(callback.href, 'GET', { Cookie: cookie(begin) });
              capture(name, result);
              if (name === 'OIDC success') {
                assert.equal(result.status, 302);
                assert.equal(result.headers.location, '/portal/default/rdmp/researcher/home');
                assert.notEqual(cookie(begin), cookie(result));
                const oidcState = await getToken(cookie(result));
                const end = await wire(fixture.url + '/default/rdmp/user/logout', 'POST', {
                  Cookie: oidcState.cookie,
                  Origin: origin,
                  'X-CSRF-Token': oidcState.csrf,
                });
                capture('OIDC provider logout', end);
                assert(String(end.headers.location).startsWith(provider.issuer + '/logout'));
                assert.equal((await wire(String(end.headers.location))).status, 302);
              }
            }
            // Configured external endpoints are inspected on the wire and never
            // contacted. Logout setup uses the real local PKCE/token protocol.
            provider.setMode('good');
            for (const url of providerUrls) {
              const begin = await wire(fixture.url + '/user/begin_oidc?id=' + url.name);
              capture('OIDC begin ' + url.name, begin);
              const setup = await wire(fixture.url + '/user/begin_oidc?id=logout-' + url.name);
              capture('OIDC logout setup initiation ' + url.name, setup);
              assert.equal(setup.status, 302);
              const authorized = await wire(String(setup.headers.location));
              assert.equal(authorized.status, 302);
              const logged = await wire(String(authorized.headers.location), 'GET', { Cookie: cookie(setup) });
              assert.equal(logged.status, 302);
              const state = await getToken(cookie(logged));
              capture(
                'OIDC provider logout ' + url.name,
                await wire(fixture.url + '/default/rdmp/user/logout', 'POST', {
                  Cookie: state.cookie,
                  Origin: origin,
                  'X-CSRF-Token': state.csrf,
                })
              );
              // AAF initiation is a rendered provider link, not an HTTP redirect
              // route. Its supported assertion exchange returns a local redirect.
              capture(
                'AAF return ' + url.name,
                await wire(
                  fixture.url + '/user/login_aaf?redirUrl=' + encodeURIComponent(url.local),
                  'POST',
                  { 'Content-Type': 'application/json' },
                  JSON.stringify({
                    assertion: aafAssertion({
                      sub: 'aaf-subject',
                      'https://aaf.edu.au/attributes': {
                        mail: 'AAF@EXAMPLE.INVALID',
                        displayname: 'AAF Fixture',
                        givenname: 'AAF',
                        surname: 'Test',
                      },
                    }),
                  })
                )
              );
            }
            assert(provider.calls.pkce >= 1 && provider.calls.userinfo >= 1 && provider.calls.logout >= 1);
            process.stdout.write('Captured browser ' + profile + '/' + mode + '\n');
          } finally {
            await f?.close();
            await provider.close();
          }
        }
    } finally {
    }
    if (process.env.FM030_HTTP_REPORT)
      await writeFile(
        process.env.FM030_HTTP_REPORT,
        JSON.stringify({ wire: Object.fromEntries(captures), flows: Object.fromEntries(flowCaptures) }, null, 2)
      );
  });
  for (const profile of selected)
    for (const scenario of [...scenarios, ...flowNames.map((name): Scenario => ({ name, path: '' }))])
      it(profile + ' ' + scenario.name, () => {
        const effects = prohibitedEffects.get(`${profile}:${scenario.name}`);
        if (effects) assertNoObservedEffects(effects);
        const values = captures.get(profile + ':' + scenario.name)!;
        assert.equal(values.length, 1);
        assertProductionContract('browser', profile + ':' + scenario.name, values[0]);

        if (scenario.expectedStatus) assert.equal(values[0].status, scenario.expectedStatus);
        if (scenario.name === 'AAF initiation link') {
          assert.equal(values[0].status, 200);
          assert.equal(values[0].headers.location, undefined);
          assert(values[0].text.includes(providerUrls[profiles.indexOf(profile)].authorization));
        }
        const providerUrl = providerUrls.find(url => scenario.name.endsWith(' ' + url.name));
        if (providerUrl && scenario.name.startsWith('AAF return ')) {
          assert.equal(values[0].status, 302);
          assert.equal(values[0].headers.location, providerUrl.expectedLocal);
        }
        if (providerUrl && scenario.name.startsWith('OIDC ')) {
          assert.equal(values[0].status, 302);
          const target = new URL(String(values[0].headers.location));
          if (!scenario.name.startsWith('OIDC logout setup ')) {
            const expected = new URL(
              scenario.name.startsWith('OIDC provider logout ') ? providerUrl.logout : providerUrl.authorization
            );
            assert.equal(target.origin + target.pathname, expected.origin + expected.pathname);
          }
        }
        if (
          (scenario.name.startsWith('OIDC ') && scenario.name.includes('initiation')) ||
          (scenario.name.startsWith('OIDC begin ') && scenario.name !== 'OIDC begin HEAD')
        ) {
          assert.equal(values[0].status, 302);
          assert.equal(values[0].headers['content-length'], '0');
          assert.equal(values[0].headers['content-type'], undefined);
          assert.equal(values[0].headers.vary, undefined);
          assert.equal(values[0].text, '');
        }
        if (scenario.name === 'browser operation missing actor') assert.equal(values[0].status, 401);
        const transitions = flowCaptures.get(profile + ':' + scenario.name);
        if (transitions) {
          assert.equal(transitions.length, 1);
          assertProductionContract('browser-flow', profile + ':' + scenario.name, transitions[0]);
        }
        if (scenario.name.endsWith(' admin'))
          assert.equal(values[0].status, scenario.name.includes('/dashboard/consolidated') ? 302 : 200);
        if (scenario.name.includes('missing csrf') || scenario.name.includes('cross origin'))
          assert.equal(values[0].status, 403);
        if (
          scenario.name.includes('record/edit/%20') ||
          scenario.name.includes('lng[toString]') ||
          scenario.name.includes('dashboardType[]')
        )
          assert.equal(values[0].status, 400);
        if (scenario.name.startsWith('not found ')) assert.equal(values[0].status, 404);
        if (scenario.name.endsWith('HEAD')) assert.equal(values[0].text, '');
        if (profile === 'hooks' && scenario.name.startsWith('live replacement')) {
          assert.equal(values[0].status, 200);
          assert.match(values[0].text, /hook/);
          assert.match(values[0].text, /body/);
        }
        assert(!values[0].text.includes('private-provider'));
      });
});

goldenControls('browser');
goldenControls('browser-flow');
