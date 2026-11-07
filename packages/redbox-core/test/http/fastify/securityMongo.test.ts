import assert from 'node:assert/strict';
import { securityFixture, route, canonical } from './securityFixture';
import { requestContext } from '../../../src/http';

if (!process.env.HTTP_PILOT_TEST_MONGO_URL)
  throw new Error('FM-016 security Mongo qualification requires HTTP_PILOT_TEST_MONGO_URL (/sr_p4_http).');
const target = '/default/rdmp/api/probe';
const credential = (response: Response) => response.headers.get('set-cookie')?.split(';')[0] ?? '';
async function token(f: Awaited<ReturnType<typeof securityFixture>>, cookie = '') {
  const response = await fetch(f.url + '/csrfToken', { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { _csrf: string };
  assert.match(body._csrf, /^[a-f0-9]{64}$/);
  return { token: body._csrf, cookie: credential(response) || cookie };
}
async function authenticated(f: Awaited<ReturnType<typeof securityFixture>>) {
  const csrf = await token(f);
  const response = await fetch(f.url + '/__session', { headers: { Cookie: csrf.cookie } });
  await response.text();
  return { ...csrf, cookie: credential(response) || csrf.cookie };
}

describe('FM-016 native/Express real Mongo session-aware CSRF differential', function () {
  this.timeout(30000);
  const tests: {
    name: string;
    mode?: string;
    path?: string;
    method?: string;
    bearer?: string;
    cookie?: boolean;
    header?: (token: string) => string;
    body?: (token: string) => unknown;
    extra?: Record<string, string>;
    status: number;
    diagnostic?: string;
  }[] = [
    { name: 'browser header token', mode: 'protect', cookie: true, header: t => t, status: 200 },
    { name: 'browser body token', mode: 'protect', cookie: true, body: t => ({ _csrf: t }), status: 200 },
    {
      name: 'bad header beats good body',
      mode: 'protect',
      cookie: true,
      header: () => 'bad',
      body: t => ({ _csrf: t }),
      status: 403,
      diagnostic: 'Invalid CSRF token',
    },
    {
      name: 'query token is ignored',
      mode: 'protect',
      cookie: true,
      path: target + '?_csrf=TOKEN',
      status: 403,
      diagnostic: 'Invalid CSRF token',
    },
    { name: 'structured body token denied', mode: 'protect', cookie: true, body: t => ({ _csrf: [t] }), status: 403 },
    { name: 'overlength token denied', mode: 'protect', cookie: true, header: () => 'x'.repeat(257), status: 403 },
    {
      name: 'AJAX browser request still needs token',
      mode: 'protect',
      cookie: true,
      extra: { 'X-Requested-With': 'XMLHttpRequest' },
      status: 403,
    },
    { name: 'browser bearer still needs token', mode: 'protect', bearer: 'pilot-api-token', status: 403 },
    { name: 'API verified header bearer exemption', mode: 'apiProtect', bearer: 'pilot-api-token', status: 200 },
    { name: 'API cookie requires token', mode: 'apiProtect', cookie: true, status: 403 },
    { name: 'API cookie with token', mode: 'apiProtect', cookie: true, header: t => t, status: 200 },
    {
      name: 'body bearer cannot exempt synchronizer',
      mode: 'apiProtect',
      body: () => ({ access_token: 'pilot-api-token' }),
      status: 403,
    },
    {
      name: 'query bearer cannot exempt synchronizer',
      mode: 'apiProtect',
      path: target + '?access_token=pilot-api-token',
      status: 403,
    },
    {
      name: 'invalid explicit bearer outranks valid cookie and token',
      mode: 'apiProtect',
      cookie: true,
      bearer: 'invalid',
      header: t => t,
      status: 401,
    },
    {
      name: 'valid token cannot grant a foreign brand',
      mode: 'protect',
      cookie: true,
      path: '/other/rdmp/api/probe',
      header: t => t,
      status: 403,
    },
    {
      name: 'origin beats valid token',
      mode: 'protect',
      cookie: true,
      header: t => t,
      extra: { Origin: 'https://evil.invalid' },
      status: 403,
      diagnostic: 'Cross-origin request denied',
    },
    {
      name: 'origin beats valid bearer',
      mode: 'apiProtect',
      bearer: 'pilot-api-token',
      extra: { Origin: 'https://evil.invalid' },
      status: 403,
      diagnostic: 'Cross-origin request denied',
    },
    {
      name: 'canonical origin accepted',
      mode: 'protect',
      cookie: true,
      header: t => t,
      extra: { Origin: canonical, 'Sec-Fetch-Site': 'same-origin' },
      status: 200,
    },
    {
      name: 'same-site rejected despite token',
      mode: 'protect',
      cookie: true,
      header: t => t,
      extra: { Origin: canonical, 'Sec-Fetch-Site': 'same-site' },
      status: 403,
    },
    {
      name: 'forwarded host cannot authorize origin',
      mode: 'protect',
      cookie: true,
      header: t => t,
      extra: { Origin: 'https://evil.invalid', 'X-Forwarded-Host': 'evil.invalid', 'X-Forwarded-Proto': 'https' },
      status: 403,
    },
  ];
  for (const c of tests)
    it(c.name, async () => {
      const results = [];
      for (const native of [false, true]) {
        const r = route();
        const f = await securityFixture(native, { mongo: true, routes: [{ ...r, effectiveCsrf: c.mode }] });
        try {
          const auth = c.cookie ? await authenticated(f) : { token: 'no-token', cookie: '' };
          const body = c.body?.(auth.token);
          const response = await fetch(f.url + (c.path ?? target).replace('TOKEN', auth.token), {
            method: c.method ?? 'POST',
            redirect: 'manual',
            headers: {
              Cookie: auth.cookie,
              ...(c.bearer ? { Authorization: 'Bearer ' + c.bearer } : {}),
              ...(c.header ? { 'X-CSRF-Token': c.header(auth.token) } : {}),
              ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
              ...c.extra,
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          });
          const text = await response.text();
          assert.equal(response.status, c.status, text);
          if (c.diagnostic) assert.match(text, new RegExp(c.diagnostic));
          results.push({ status: response.status, denial: response.status === 200 ? undefined : text });
        } finally {
          await f.close();
        }
      }
      assert.deepEqual(results[1], results[0]);
    });

  it('token acquisition saves once before response, reuses token, and remains unbranded', async () => {
    for (const native of [false, true]) {
      const f = await securityFixture(native, { mongo: true });
      try {
        const first = await token(f);
        const second = await token(f, first.cookie);
        assert.equal(second.token, first.token);
        const collections = (await f.mongo!.native.db().listCollections().toArray()).filter(c =>
          c.name.includes('fm016Sessions')
        );
        assert.equal(collections.length, 1);
        const rows = await f.mongo!.native.db().collection(collections[0].name).find().toArray();
        assert.equal(rows.length, 1);
        assert.equal(JSON.parse(rows[0].session).csrfToken, first.token);
        const denied = await fetch(f.url + '/csrfToken', {
          headers: { Cookie: first.cookie, Origin: 'https://evil.invalid' },
        });
        assert.equal(denied.status, 403);
        await denied.text();
        const third = await token(f, first.cookie);
        assert.equal(third.token, first.token);
      } finally {
        await f.close();
      }
    }
  });

  it('guards raw hijack first and awaits explicit session persistence before raw bytes', async () => {
    let actions = 0;
    const f = await securityFixture(true, {
      mongo: true,
      routes: [{ ...route(), effectiveCsrf: 'protect' }],
      action: async (req, reply) => {
        actions++;
        assert.equal(requestContext(req).brand.name, 'default');
        req.session.set('csrfToken', 'b'.repeat(64));
        await req.session.save();
        reply.hijack();
        reply.raw.writeHead(200, { 'Content-Type': 'text/plain' });
        reply.raw.end('raw');
      },
    });
    try {
      const auth = await authenticated(f);
      const denied = await fetch(f.url + target, { method: 'POST', headers: { Cookie: auth.cookie } });
      assert.equal(denied.status, 403);
      await denied.text();
      assert.equal(actions, 0);
      const allowed = await fetch(f.url + target, {
        method: 'POST',
        headers: { Cookie: auth.cookie, 'X-CSRF-Token': auth.token },
      });
      assert.equal(await allowed.text(), 'raw');
      assert.equal(actions, 1);
      assert.equal((await token(f, auth.cookie)).token, 'b'.repeat(64));
    } finally {
      await f.close();
    }
  });
});

// Retain the remaining action-local FM-004 ordering probes with genuine browser
// sessions/tokens. Only the small native preludes below are probes; complete
// controller migration remains assigned to later tasks.
import { inventory, inventoryRegistration } from './inventory-fixture';
import { mountBrandingOperationRoutes } from '../../../src/http/express/brandingOperations';
import { mountConfigurationWriteRoutes } from '../../../src/http/express/configurationWrites';
import { mountIdentityAdministrationRoutes } from '../../../src/http/express/identityAdministration';
import type { ApiRouteDefinition } from '../../../src/api-routes/types';
import { validateApiRouteRequest } from '../../../src/api-routes/validation';
import { sendApiErrors, sendApiValidationErrors } from '../../../src/http/fastify/responses';
import { of } from 'rxjs';
import { Services as Dashboard } from '../../../src/dashboards/DashboardConfig';
import { retiredDashboardOperation } from '../../../src/http/express/dashboardResponses';

const browserCases = [
  {
    kind: 'preview',
    label: 'CSRF before administrator and draft read',
    admin: false,
    csrf: false,
    body: { expectedDraftRevision: [] },
    status: 403,
    diagnostic: 'Invalid CSRF token',
    trace: [],
  },
  {
    kind: 'preview',
    label: 'administrator before draft read and Zod',
    admin: false,
    csrf: true,
    body: { expectedDraftRevision: [] },
    status: 403,
    diagnostic: 'Access Denied',
    trace: [],
  },
  {
    kind: 'preview',
    label: 'authorized legacy draft read before revision Zod',
    admin: true,
    csrf: true,
    body: { expectedDraftRevision: [] },
    status: 400,
    diagnostic: 'expectedDraftRevision',
    trace: ['draft'],
  },
  {
    kind: 'preview',
    label: 'legacy draft failure before revision Zod',
    admin: true,
    csrf: true,
    body: { expectedDraftRevision: [] },
    fault: true,
    status: 500,
    diagnostic: 'Internal server error',
    trace: ['draft'],
  },
  {
    kind: 'preview',
    label: 'array body skips legacy draft prelude',
    admin: true,
    csrf: true,
    body: [],
    status: 400,
    diagnostic: '',
    trace: [],
  },
  {
    kind: 'identity',
    label: 'malformed browser details before target lookup',
    admin: true,
    csrf: true,
    body: { userid: '0123456789abcdef01234567', details: [] },
    status: 400,
    diagnostic: 'Request body must be an object',
    trace: ['roles'],
  },
  {
    kind: 'retired',
    label: 'retired configuration before malformed body',
    admin: true,
    csrf: true,
    body: [],
    status: 410,
    diagnostic: 'legacy-operation-retired',
    trace: [],
  },
] as const;

describe('FM-016 real Mongo browser action-prelude ordering differential', function () {
  this.timeout(30000);
  for (const c of browserCases)
    it(c.label, async () => {
      const row = inventory.routes.find(r =>
        c.kind === 'preview'
          ? r.action === 'createPreview' && r.path.endsWith('/preview')
          : c.kind === 'identity'
            ? r.action === 'updateUserDetails'
            : r.action === 'retiredOperation' && r.method === 'put'
      )!;
      assert(row, c.label);
      const registration = inventoryRegistration(row),
        source = registration.declaration.api ?? {
          ...registration.declaration,
          request: registration.declaration.validation,
        };
      const results = [];
      for (const native of [false, true]) {
        const trace: string[] = [];
        const branding = {
          getAdminState: async () => {
            trace.push('draft');
            if ('fault' in c && c.fault) throw new Error('domain-secret mongodb://credential@host');
            return { draft: { revision: 1 } };
          },
        };
        const roles = {
          getRolesWithBrand: () => {
            trace.push('roles');
            return of([]);
          },
        };
        const f = await securityFixture(native, {
          mongo: true,
          routes: [registration],
          mount: (router, input) => {
            const mount =
              c.kind === 'preview'
                ? mountBrandingOperationRoutes
                : c.kind === 'identity'
                  ? mountIdentityAdministrationRoutes
                  : mountConfigurationWriteRoutes;
            mount(router, {
              ...input,
              branding,
              roles,
              users: {
                requireUserInBrand: async () => {
                  trace.push('target');
                  throw new Error('unexpected target read');
                },
              },
            } as never);
          },
          action: async (req, reply) => {
            const { actor, brand } = requestContext(req);
            if (c.kind === 'retired') {
              try {
                retiredDashboardOperation();
              } catch (error) {
                assert(error instanceof Dashboard.DashboardConfigError);
                return reply.code(error.status).send({ message: error.code, details: error.message });
              }
            }
            if (!actor?.roles.some(r => r.brandId === brand.id && r.name === 'Admin'))
              return sendApiErrors(req, reply, 403, [{ detail: 'Access Denied' }]);
            if (c.kind === 'identity') {
              roles.getRolesWithBrand();
              return sendApiErrors(req, reply, 400, [{ detail: 'Request body must be an object' }]);
            }
            const body = req.body;
            const legacy = body === undefined || (body !== null && typeof body === 'object' && !Array.isArray(body));
            const validated = validateApiRouteRequest(
              {
                params: req.params as Record<string, unknown>,
                query: req.query as Record<string, unknown>,
                headers: req.headers,
                body: legacy
                  ? { expectedDraftRevision: (await branding.getAdminState()).draft.revision, ...(body as object) }
                  : body,
              },
              source as ApiRouteDefinition
            );
            if (!validated.valid) return sendApiValidationErrors(req, reply, validated.issues);
            assert.fail('Unexpected preview domain operation');
          },
        });
        try {
          const auth = await authenticated(f);
          if (!c.admin) {
            const session = f.mongo!.identity.session.bind(f.mongo!.identity);
            f.mongo!.identity.session = async id => {
              const actor = await session(id);
              return actor ? { ...actor, roles: actor.roles.map(r => ({ ...r, name: 'Reader' })) } : false;
            };
          }
          const path = row.path.replace(':branding', 'default').replace(':portal', 'rdmp');
          const response = await fetch(f.url + path, {
            method: row.method.toUpperCase(),
            headers: {
              Cookie: auth.cookie,
              'Content-Type': 'application/json',
              ...(c.csrf ? { 'X-CSRF-Token': auth.token } : {}),
              ...(c.kind === 'retired' ? { Authorization: 'Bearer pilot-api-token' } : {}),
            },
            body: JSON.stringify(c.body),
          });
          const text = await response.text();
          assert.equal(response.status, c.status, text);
          assert(text.includes(c.diagnostic), text);
          assert.deepEqual(trace, c.trace);
          assert(!text.includes('domain-secret'));
          results.push({ status: response.status, text, trace });
        } finally {
          await f.close();
        }
      }
      assert.deepEqual(results[1], results[0]);
    });
});

import { authenticationFixture } from './authenticationFixture';
describe('FM-016 native login observation failure isolation', function () {
  this.timeout(30000);
  for (const malformed of [false, true])
    it(`retains ${malformed ? 'malformed' : 'invalid'} credential denial when failure-event delivery rejects`, async () => {
      const f = await authenticationFixture(true, {
        loginFailure: async () => {
          throw new Error('observer-secret password=credential-secret');
        },
      });
      try {
        const response = await fetch(f.url + '/user/login_local', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Source': 'jsclient' },
          body: JSON.stringify({ username: malformed ? [] : 'pilot-admin', password: 'credential-secret' }),
        });
        assert.equal(response.status, malformed ? 400 : 200);
        const body = (await response.json()) as any;
        assert.equal(body.message, malformed ? 'Invalid login parameters' : 'Incorrect username/password');
        assert(!JSON.stringify(body).includes('credential-secret'));
      } finally {
        await f.close();
      }
    });
});
