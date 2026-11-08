import assert from 'node:assert/strict';
import iconv from 'iconv-lite';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { securityFixture, route, observation, canonical, policyChain } from './securityFixture';
import { requestContext, resolveLanguage } from '../../../src/http';
import { createNativeCsrf } from '../../../src/http/fastify/csrf';
import { composeRoutes } from '../../../src/http/fastify/routes';
import { safeHttpErrorStatus } from '../../../src/http/fastify/responses';
import { bindNativeRouteSecurity } from '../../../src/http/fastify/policies';
import { createNativePolicies } from '../../../src/http/fastify/policies';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { resolveRequestBrand, resolveRequestActor } from '../../../src/http/context';

const target = '/default/rdmp/api/probe';
const get = (url: string, method = 'POST', headers: Record<string, string> = {}, body?: string | Buffer) =>
  fetch(url, { method, headers, body: Buffer.isBuffer(body) ? new Uint8Array(body).buffer : body, redirect: 'manual' });

describe('FM-016 native context, policy, CSRF and error boundary', function () {
  this.timeout(10000);
  for (const [token, status] of [
    ['good', 200],
    ['foreign', 403],
    ['bad', 401],
    ['', 401],
  ] as const)
    it('retains Express repeated explicit/configured policy chains for ' + (token || 'anonymous'), async () => {
      const results = [];
      for (const native of [false, true]) {
        const source = route();
        const f = await securityFixture(native, {
          routes: [{ ...source, effectivePolicies: [...policyChain, ...policyChain] }],
        });
        try {
          const result = await observation(
            await get(f.url + target, 'POST', token ? { Authorization: 'Bearer ' + token } : {})
          );
          assert.equal(result.status, status);
          results.push(result);
        } finally {
          await f.close();
        }
      }
      assert.deepEqual(results[1], results[0]);
    });
  it('repeated branding policies preserve the tenant snapshot, refresh actors and reject another tenant', async () => {
    const policies = createNativePolicies({
      branding: {
        getBrand: async query => {
          const name = 'name' in query ? query.name : query.id;
          return { id: 'brand-' + name, name };
        },
      },
      portals: ['rdmp', 'research'],
      pathRules: { getRulesFromPath: () => [], canRead: () => true },
      defaultUnauthenticatedRole: () => undefined,
      authenticate: async () => false,
      emitRequestFailure: async () => {},
    });
    const params = { branding: 'default', portal: 'rdmp' };
    const request = { params } as FastifyRequest;
    const reply = {} as FastifyReply;
    await policies.brandingandportal(request, reply);
    const selected = requestContext(request);
    await policies.brandingandportal(request, reply);
    assert.strictEqual(requestContext(request), selected);
    assert(Object.isFrozen(selected));
    resolveRequestActor(request, {
      id: 'user',
      username: 'actor',
      type: 'local',
      roles: [{ id: 'admin', brandId: selected.brand.id, name: 'Admin' }],
    });
    const authenticated = requestContext(request);
    await policies.brandingandportal(request, reply);
    const refreshed = requestContext(request);
    assert.strictEqual(refreshed.brand, authenticated.brand);
    assert.equal(refreshed.actor, undefined);
    assert.equal(authenticated.actor!.roles[0].name, 'Admin');
    assert.throws(() => resolveRequestBrand(request, selected.brand, 'rdmp'), /already been resolved/);
    params.branding = 'other';
    await assert.rejects(async () => policies.brandingandportal(request, reply), /already been resolved/);
    params.branding = 'default';
    params.portal = 'research';
    await assert.rejects(async () => policies.brandingandportal(request, reply), /already been resolved/);
    assert.strictEqual(requestContext(request), refreshed);
  });
  it('rechecks changed roles between explicit and configured branding/authorization chains over real HTTP', async () => {
    const results = [];
    for (const native of [false, true]) {
      let lookups = 0;
      let changeRoles = () => {};
      const source = route();
      const f = await securityFixture(native, {
        routes: [{ ...source, effectivePolicies: [...policyChain, 'brandingandportal', 'checkauth'] }],
        brandLookup: () => {
          if (++lookups === 2) changeRoles();
        },
        pathRules: {
          getRulesFromPath: () => [],
          canRead: (_rules, roles) => roles.some(role => role.id === 'admin'),
        },
      });
      changeRoles = () => {
        f.user.roles[0].id = 'reader';
        f.user.roles[0].name = 'Reader';
      };
      try {
        const result = await observation(await get(f.url + target, 'POST', { Authorization: 'Bearer good' }));
        assert.equal(result.status, 403);
        assert.equal(f.state.trace.filter(entry => entry === 'authenticate').length, 2);
        assert(!f.state.trace.includes('action'));
        results.push(result);
      } finally {
        await f.close();
      }
    }
    assert.deepEqual(results[1], results[0]);
  });
  for (const key of Object.getOwnPropertyNames(Object.prototype)) {
    it(`never resolves inherited policy/error/language/route names: ${key}`, async () => {
      const r = route('/' + key, 'get');
      const plan = await composeRoutes(
        [{ ...r, declaration: { ...r.declaration, name: 'fm016.' + key, access: { kind: 'policies', names: [key] } } }],
        { policyNames: [key] }
      );
      assert.throws(() => bindNativeRouteSecurity(plan, {}, {} as any), /unbound policy/);
      assert.equal(safeHttpErrorStatus(Object.assign(new Error('secret'), { code: key })), 500);
      const language = await resolveLanguage({
        query: key,
        languages: async () => [{ code: 'en', displayName: 'English' }],
      });
      assert.equal(language.language, 'en');
      assert.equal(
        (await resolveLanguage({ query: key, languages: async () => [{ code: key, displayName: key }] })).language,
        key
      );
      const publicPlan = await composeRoutes(
        [
          {
            ...r,
            declaration: { ...r.declaration, name: 'fm016.' + key, access: { kind: 'public' } },
            effectiveCsrf: key,
          },
        ],
        { policyNames: [] }
      );
      assert.throws(() => bindNativeRouteSecurity(publicPlan, {}, {} as any), /CSRF/);
      if (key.startsWith('_'))
        await assert.rejects(
          composeRoutes([{ ...r, declaration: { ...r.declaration, name: key, access: { kind: 'public' } } }], {
            policyNames: [],
          }),
          /stable name/
        );
      // An explicitly supplied table entry is legitimate even if named like a prototype key.
      const own = Object.create(null);
      own[key] = async () => {};
      const guard = bindNativeRouteSecurity(plan, own, {} as any);
      assert.equal(typeof guard, 'function');
      const f = await securityFixture(true, {
        routes: [{ ...r, declaration: { ...r.declaration, name: 'fm016.' + key, access: { kind: 'public' } } }],
      });
      try {
        assert.equal((await get(f.url + '/' + key, 'GET')).status, 200);
      } finally {
        await f.close();
      }
    });
  }
  for (const [label, path, token, status] of [
    ['missing credentials', target, '', 401],
    ['invalid credentials', target, 'bad', 401],
    ['foreign roles', target, 'foreign', 403],
    ['missing brand before invalid credentials', '/missing/rdmp/api/probe', 'bad', 404],
    ['invalid portal before invalid credentials', '/default/unknown/api/probe', 'bad', 404],
    ['authenticated', target, 'good', 200],
  ] as const)
    it(`retains Express ${label}`, async () => {
      const results = [];
      for (const native of [false, true]) {
        const f = await securityFixture(native);
        try {
          const result = await observation(
            await get(f.url + path, 'POST', token ? { Authorization: 'Bearer ' + token } : {})
          );
          assert.equal(result.status, status);
          results.push(result);
        } finally {
          await f.close();
        }
      }
      assert.deepEqual(results[1], results[0]);
    });
  for (const access of [{ kind: 'public' }, { kind: 'deny' }] as const)
    it(`retains explicit ${access.kind} access without fabricating context`, async () => {
      const results = [];
      for (const native of [false, true]) {
        const r = route('/public', 'get');
        const f = await securityFixture(native, { routes: [{ ...r, declaration: { ...r.declaration, access } }] });
        try {
          const result = await observation(await get(f.url + '/public', 'GET'));
          assert.equal(result.status, access.kind === 'public' ? 200 : 403);
          if (access.kind === 'public') assert.equal(JSON.parse(result.text).context, null);
          results.push(result);
        } finally {
          await f.close();
        }
      }
      assert.deepEqual(results[1], results[0]);
    });
  it('copies and freezes brand, actor, role array and role objects independently of the identity', async () => {
    let snapshot: ReturnType<typeof requestContext>;
    const f = await securityFixture(true, {
      action: (req, reply) => {
        snapshot = requestContext(req);
        for (const value of [
          snapshot,
          snapshot.brand,
          snapshot.brand.variables,
          snapshot.actor,
          snapshot.actor!.roles,
          snapshot.actor!.roles[0],
        ])
          assert(Object.isFrozen(value));
        return reply.send({ ok: true });
      },
    });
    try {
      assert.equal((await get(f.url + target, 'POST', { Authorization: 'Bearer good' })).status, 200);
      f.brand.name = 'mutated';
      f.user.roles[0].name = 'mutated';
      f.user.roles.length = 0;
      assert.equal(snapshot!.brand.name, 'default');
      assert.equal(snapshot!.actor!.roles.length, 1);
      assert.equal(snapshot!.actor!.roles[0].name, 'Admin');
      assert.equal(Object.isFrozen(f.brand), false);
    } finally {
      await f.close();
    }
  });
  it('retains ordered effects before deny and stops later CSRF/action work', async () => {
    for (const native of [false, true]) {
      const r = route();
      const f = await securityFixture(native, {
        routes: [
          {
            ...r,
            effectivePolicies: ['nocache', false],
            effectiveCsrf: 'protect',
            declaration: { ...r.declaration, access: { kind: 'deny' } },
          },
        ],
      });
      try {
        const result = await observation(await get(f.url + target));
        assert.equal(result.status, 403);
        assert.equal(result.text, '');
        assert.match(result.headers['cache-control']!, /no-store/);
        assert.deepEqual(f.state.trace, []);
      } finally {
        await f.close();
      }
    }
  });
  for (const fault of ['failProvider', 'failBrand'] as const)
    it(`redacts ${fault} and fake domain status/body/credential fields`, async () => {
      for (const native of [false, true]) {
        const f = await securityFixture(native);
        f.state[fault] = true;
        try {
          const result = await observation(await get(f.url + target, 'POST', { Authorization: 'Bearer good' }));
          assert.equal(result.status, 500);
          assert.equal(JSON.parse(result.text).message, 'Internal server error');
          assert(
            !JSON.stringify([result, f.logs]).match(
              /provider-secret|body-secret|datastore-secret|credential@|client-secret/
            )
          );
        } finally {
          await f.close();
        }
      }
    });
  it('isolates failing request/response/error observations, log transports and authorization events', async () => {
    const phases: string[] = [];
    const f = await securityFixture(true, {
      observers: {
        observe: async event => {
          phases.push(event.phase);
          throw new Error('observer-secret');
        },
        log: async () => {
          throw new Error('log-secret');
        },
      },
    });
    try {
      const allowed = await get(f.url + target, 'POST', { Authorization: 'Bearer good' });
      assert.equal(allowed.status, 200);
      await allowed.text();
      f.state.pathDenied = true;
      f.state.failEvent = true;
      const denied = await get(f.url + target, 'POST', { Authorization: 'Bearer good' });
      assert.equal(denied.status, 403);
      await denied.text();
      f.state.failBrand = true;
      const error = await get(f.url + target, 'POST', { Authorization: 'Bearer good' });
      assert.equal(error.status, 500);
      assert.equal(JSON.parse(await error.text()).message, 'Internal server error');
      assert(phases.includes('request'));
      assert(phases.includes('response'));
      assert(phases.includes('error'));
    } finally {
      await f.close();
    }
  });
  for (const mode of [
    'protect',
    'apiProtect',
    'protect except GET/HEAD/OPTIONS',
    'apiProtect on ALL methods, including HEAD/OPTIONS',
  ])
    for (const method of ['GET', 'HEAD', 'POST', 'OPTIONS'])
      it(`${mode} keeps the mount-specific ${method} exemption`, async () => {
        const observations = [];
        for (const native of [false, true]) {
          const r = route();
          const f = await securityFixture(native, {
            routes: [{ ...r, effectiveCsrf: mode, declaration: { ...r.declaration, method: 'all' } }],
          });
          try {
            const result = await observation(await get(f.url + target, method, { Authorization: 'Bearer good' }));
            assert.equal(
              result.status,
              mode.startsWith('apiProtect') || (mode.startsWith('protect except') && method !== 'POST') ? 200 : 403
            );
            observations.push(result);
          } finally {
            await f.close();
          }
        }
        assert.deepEqual(observations[1], observations[0]);
      });
  for (const headers of [
    { Origin: 'https://evil.invalid' },
    { Origin: canonical, 'Sec-Fetch-Site': 'same-site' },
    { 'Sec-Fetch-Site': 'cross-site' },
  ] as Record<string, string>[])
    it(`canonical origin wins before independently valid API bearer: ${JSON.stringify(headers)}`, async () => {
      const results = [];
      for (const native of [false, true]) {
        const f = await securityFixture(native, { routes: [{ ...route(), effectiveCsrf: 'apiProtect' }] });
        try {
          const result = await observation(
            await get(f.url + target, 'POST', {
              Authorization: 'Bearer good',
              ...headers,
              'X-Forwarded-Host': 'evil.invalid',
              'X-Forwarded-Proto': 'https',
            })
          );
          assert.match(result.text, /Cross-origin request denied/);
          results.push(result);
        } finally {
          await f.close();
        }
      }
      assert.deepEqual(results[1], results[0]);
    });
  it('fails missing/unknown/empty access and unknown CSRF/policy bindings offline', async () => {
    for (const access of [undefined, { kind: 'policies', names: [] }, { kind: 'policies', names: ['missing'] }])
      await assert.rejects(
        composeRoutes([{ ...route(), declaration: { ...route().declaration, access } } as any], {
          policyNames: policyChain,
        })
      );
    const plan = await composeRoutes([route()], { policyNames: policyChain });
    const csrf = createNativeCsrf({ origins: [canonical] });
    assert.throws(() => bindNativeRouteSecurity(plan, {}, csrf), /unbound policy/);
    const publicPlan = await composeRoutes(
      [{ ...route(), effectiveCsrf: 'typo', declaration: { ...route().declaration, access: { kind: 'public' } } }],
      { policyNames: [] }
    );
    assert.throws(() => bindNativeRouteSecurity(publicPlan, {}, csrf), /unbound CSRF/);
    for (const origins of [[], ['null'], ['file:///'], [canonical + '/'], ['https://user:password@example.invalid']])
      assert.throws(() => createNativeCsrf({ origins }));
  });
  for (const [query, session, config, expected] of [
    ['fr', 'en', {}, 'fr'],
    [['fr'], 'fr', {}, 'fr'],
    ['cimode', 'disabled', { lng: 'fr' }, 'fr'],
    ['bad', 'bad', { fallbackLng: ['fr'] }, 'fr'],
    ['bad', 'bad', {}, 'en'],
  ] as const)
    it(`resolves supported language ${JSON.stringify({ query, session, config })}`, async () => {
      const result = await resolveLanguage({
        query,
        session,
        config,
        languages: async () => [
          { code: 'en', displayName: 'English' },
          { code: 'fr', displayName: 'French' },
          { code: 'cimode', displayName: 'CI' },
          { code: 'disabled', displayName: 'Disabled', enabled: false },
        ],
      });
      assert.equal(result.language, expected);
      assert.equal(result.languages.length, 2);
      assert(Object.isFrozen(result.languages));
    });
  it('uses English when language loading and its warning fail', async () => {
    assert.equal(
      (
        await resolveLanguage({
          languages: async () => {
            throw new Error('provider-secret');
          },
          warn: () => {
            throw new Error('log-secret');
          },
        })
      ).language,
      'en'
    );
  });
});

describe('FM-016 retained ordinary parser differential before policy execution', function () {
  this.timeout(10000);
  const cases: { name: string; body: Buffer | string; type: string; encoding?: string; status: number }[] = [
    { name: 'invalid JSON secret', body: '{"password":"body-secret",', type: 'application/json', status: 400 },
    { name: 'scalar JSON', body: '"body-secret"', type: 'application/json', status: 400 },
    { name: 'empty JSON', body: '', type: 'application/json', status: 401 },
    { name: 'array JSON', body: '[]', type: 'application/json', status: 401 },
    {
      name: 'UTF-16LE JSON',
      body: Buffer.from('{"name":"café"}', 'utf16le'),
      type: 'application/json; charset=utf-16le',
      status: 401,
    },
    ...['utf-7', 'utf-32le', 'utf-32be', 'utf-16'].map(charset => ({
      name: charset + ' JSON',
      body: iconv.encode('{\"name\":\"café\"}', charset),
      type: 'application/json; charset=' + charset,
      status: 401,
    })),
    { name: 'unsupported JSON charset', body: '{}', type: 'application/json; charset=iso-8859-1', status: 415 },
    {
      name: 'Latin-1 form',
      body: 'name=caf%E9',
      type: 'application/x-www-form-urlencoded; charset=iso-8859-1',
      status: 401,
    },
    { name: 'JSON size', body: JSON.stringify({ x: 'x'.repeat(1048576) }), type: 'application/json', status: 413 },
    {
      name: 'form keys',
      body: Array.from({ length: 1001 }, (_, i) => 'x' + i + '=a').join('&'),
      type: 'application/x-www-form-urlencoded',
      status: 413,
    },
    { name: 'form depth', body: 'a' + '[b]'.repeat(33) + '=x', type: 'application/x-www-form-urlencoded', status: 400 },
    { name: 'unknown encoding', body: '{}', type: 'application/json', encoding: 'unknown', status: 415 },
    { name: 'corrupt gzip', body: 'body-secret', type: 'application/json', encoding: 'gzip', status: 400 },
    { name: 'unparsed problem JSON', body: 'body-secret', type: 'application/problem+json', status: 401 },
    { name: 'unparsed text', body: 'body-secret', type: 'text/plain; charset=not-a-charset', status: 401 },
    ...[
      ['gzip', gzipSync],
      ['deflate', deflateSync],
      ['br', brotliCompressSync],
    ].flatMap(([encoding, compress]: any) => [
      { name: encoding + ' JSON', body: compress(Buffer.from('{}')), type: 'application/json', encoding, status: 401 },
      {
        name: encoding + ' inflated oversize',
        body: compress(Buffer.from(JSON.stringify({ x: 'x'.repeat(1048576) }))),
        type: 'application/json',
        encoding,
        status: 413,
      },
    ]),
  ];
  for (const c of cases)
    it(c.name, async () => {
      const results = [];
      for (const native of [false, true]) {
        const f = await securityFixture(native);
        try {
          const result = await observation(
            await get(
              f.url + target,
              'POST',
              { 'Content-Type': c.type, ...(c.encoding ? { 'Content-Encoding': c.encoding } : {}) },
              c.body
            )
          );
          assert.equal(result.status, c.status);
          assert(!JSON.stringify([result, f.logs]).includes('body-secret'));
          results.push(result);
        } finally {
          await f.close();
        }
      }
      assert.deepEqual(results[1], results[0]);
    });
});

describe('FM-016 safe native action errors and parsed body semantics', function () {
  this.timeout(10000);
  for (const version of ['1.0', '2.0'])
    it(`redacts hostile domain status/code/body with API ${version}`, async () => {
      const f = await securityFixture(true, {
        action: () => {
          throw Object.assign(new Error('domain-secret password=body-secret'), {
            status: 200,
            statusCode: 200,
            code: 'domain-secret',
            body: { credential: 'body-secret' },
            response: { client_secret: 'client-secret' },
          });
        },
      });
      try {
        const response = await get(f.url + target + '?apiVersion=' + version, 'POST', {
          Authorization: 'Bearer good',
          'X-ReDBox-Api-Version': version,
        });
        assert.equal(response.status, 500);
        const result = await response.text();
        assert.deepEqual(
          JSON.parse(result),
          version === '2.0'
            ? { errors: [{ detail: 'Internal server error' }], meta: {} }
            : { message: 'Internal server error', details: '' }
        );
        assert(!JSON.stringify([result, f.logs]).match(/domain-secret|body-secret|client-secret/));
      } finally {
        await f.close();
      }
    });
  for (const [type, body, expected] of [
    ['application/json', '{"nested":{"name":"café"},"array":[1,2]}', { nested: { name: 'café' }, array: [1, 2] }],
    [
      'application/x-www-form-urlencoded',
      'nested[name]=caf%C3%A9&array[]=1&array[]=2',
      { nested: { name: 'café' }, array: ['1', '2'] },
    ],
  ] as const)
    it(`delivers the parsed ${type} body to the action`, async () => {
      const f = await securityFixture(true, { action: (req, reply) => reply.send(req.body) });
      try {
        const response = await get(
          f.url + target,
          'POST',
          { Authorization: 'Bearer good', 'Content-Type': type },
          body
        );
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), expected);
      } finally {
        await f.close();
      }
    });
  for (const accept of ['text/plain', 'text/html', 'application/json'])
    for (const method of ['GET', 'HEAD'])
      it(`retains ${method} browser redirects negotiated as ${accept}`, async () => {
        const results = [];
        for (const native of [false, true]) {
          const r = route('/:branding/:portal/page', 'get');
          const f = await securityFixture(native, {
            routes: [
              {
                ...r,
                declaration: {
                  ...r.declaration,
                  access: { kind: 'policies', names: ['brandingandportal', 'browseractor', 'browserauthenticated'] },
                },
              },
            ],
          });
          try {
            const response = await get(f.url + '/default/rdmp/page', method, { Accept: accept });
            const result = await observation(response);
            assert.equal(result.status, 302);
            results.push(result);
          } finally {
            await f.close();
          }
        }
        assert.deepEqual(results[1], results[0]);
      });
});
