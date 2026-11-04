import assert from 'node:assert/strict';
import { request, type IncomingHttpHeaders } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import type { Router } from 'express';
import session from 'express-session';
import sinon from 'sinon';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { ApplicationRuntime } from '../../src/application';
import { ExpressHost } from '../../src/http/express/ExpressHost';
import { prepareHttpMiddleware, httpErrorHandler } from '../../src/http/express/middleware';
import { HttpIdentity } from '../../src/http/express/identity';
import { pageResponseHeaders } from '../../src/http/express/pageHeaders';
import { dynamicAssetRoutes, mountStaticPageArtifacts } from '../../src/http/express/pageAssets';
import { PageArtifacts } from '../../src/pages/Artifacts';
import { mountPageRoot, mountPageNotFound } from '../../src/http/express/pages';
import { mountAuthenticationRoutes } from '../../src/http/express/login';
import { createHttpCsrf } from '../../src/http/express/csrf';
import { mountDatastreamReadRoutes } from '../../src/http/express/datastreamReads';
import { mountConfigurationReadRoutes } from '../../src/http/express/configuration';
import { sendApiData, sendApiValidationErrors } from '../../src/http/express/responses';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { pageInputFixture } from '../helpers/pageInputFixture';
import { httpRecordReadsFixture } from '../helpers/httpRecordReadsFixture';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';

// Use Node HTTP so malformed URLs/methods, conditional headers and body bytes reach
// the server unchanged (fetch adds cache directives to conditional requests).
function exchange(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: string | Buffer } = {}
): Promise<{ status: number; headers: IncomingHttpHeaders; text: string }> {
  return new Promise((resolve, reject) => {
    const client = request(
      url,
      {
        method: options.method ?? 'GET',
        headers: {
          ...(options.body === undefined ? {} : { 'Content-Length': String(Buffer.byteLength(options.body)) }),
          ...options.headers,
        },
      },
      response => {
        const chunks: Buffer[] = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () =>
          resolve({ status: response.statusCode!, headers: response.headers, text: Buffer.concat(chunks).toString() })
        );
      }
    );
    client.on('error', reject);
    client.setTimeout(5000, () => client.destroy(new Error('HTTP characterization request timed out')));
    client.end(options.body);
  });
}

describe('HTTP compatibility characterization (FM-003)', function () {
  this.timeout(10_000);
  const cleanup: Array<() => Promise<unknown>> = [];
  afterEach(async () => {
    for (const close of cleanup.splice(0).reverse()) await close();
    sinon.restore();
  });

  async function fixture(
    prepare: (
      router: Router,
      authentication: Awaited<ReturnType<typeof prepareHttpMiddleware>>
    ) => void | Promise<void> = router => {
      router.all('/input', (req, res) => res.json({ query: req.query, body: req.body ?? null }));
    },
    options: {
      rootContext?: string;
      parserExclusions?: string[];
      session?: Partial<session.SessionOptions>;
      identity?: HttpIdentity;
    } = {}
  ) {
    const owner = { config: {}, log: nothingLogger };
    const host = new ExpressHost(new ApplicationRuntime(owner), {
      owner,
      hostname: '127.0.0.1',
      port: 0,
      rootContext: options.rootContext,
      prepare: async router => {
        // Match PortalHttp.prepare's shared chain, including session work before
        // route dispatch. Domain collaborators and provider calls remain fixtures.
        router.use(pageResponseHeaders({}));
        const authentication = await prepareHttpMiddleware(router, {
          owner,
          log: nothingLogger,
          identity:
            options.identity ??
            new HttpIdentity({
              one: async () => null,
              verifyPassword: async () => false,
              findByApiTokenHash: async () => null,
            }),
          session: {
            name: 'redbox.sid',
            secret: 'fm003-synthetic-secret-at-least-32-characters',
            cookie: { secure: false },
            ...options.session,
          },
          parserExclusions: options.parserExclusions,
        });
        await prepare(router, authentication);
        router.use(httpErrorHandler(nothingLogger));
      },
    });
    cleanup.push(() => host.stop());
    await host.initialize();
    await host.activate();
    return { url: 'http://127.0.0.1:' + host.address()!.port };
  }

  for (const rootContext of ['', '/research/v6']) {
    it(`matches case and optional trailing slash within root '${rootContext}' without changing captures`, async () => {
      const f = await fixture(
        router => {
          router.get('/:branding/:portal/probe/:id', (req, res) => res.json(req.params));
        },
        { rootContext }
      );
      const response = await exchange(f.url + rootContext.toUpperCase() + '/Brand/Portal/PROBE/MiXeD/');
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.text), { branding: 'Brand', portal: 'Portal', id: 'MiXeD' });
      if (rootContext) {
        for (const prefix of ['', rootContext + 'x', '/research%2Fv6'])
          assert.equal((await exchange(f.url + prefix + '/Brand/Portal/probe/id')).status, 404);
      }
    });
  }

  it('captures the declared optional asset group and decodes each parameter exactly once', async () => {
    const route = dynamicAssetRoutes.find(route => route.action === 'getFormCompiledItems')!;
    const f = await fixture(router => {
      router.get(route.path, (req, res) => res.json(req.params));
    });
    const base = f.url + '/default/portal/dynamicAsset/formCompiledItems/Type%20One';
    for (const [suffix, oid] of [
      ['', undefined],
      ['/oid%2Fpart', 'oid/part'],
      ['/oid%252Fpart', 'oid%2Fpart'],
      ['/a+b', 'a+b'],
    ] as const) {
      const response = await exchange(base + suffix);
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.text), {
        branding: 'default',
        portal: 'portal',
        recordType: 'Type One',
        ...(oid === undefined ? {} : { oid }),
      });
    }
    assert.equal((await exchange(base + '/one/two')).status, 404);
  });

  it('matches the actual optional datastream wildcard including its empty and legacy suffix forms', async () => {
    const f = await fixture(router =>
      mountDatastreamReadRoutes(router, {
        records: {} as never,
        datastream: {} as never,
        log: nothingLogger,
        policies: {
          nocache: (_req, _res, next) => next(),
          captures: (req, res) => {
            res.json(req.params);
          },
        },
        policyConfiguration: { '*': ['captures'] },
      })
    );
    const url = f.url + '/default/portal/record/oid-1/datastream';
    for (const [suffix, tail] of [
      ['', undefined],
      ['legacy', ['legacy']],
      ['/one/two', ['', 'one', 'two']],
    ] as const) {
      const response = await exchange(url + suffix);
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.text), {
        branding: 'default',
        portal: 'portal',
        oid: 'oid-1',
        ...(tail === undefined ? {} : { tail }),
      });
    }
  });

  it('joins the actual translation wildcard into its decoded slash-delimited key', async () => {
    const keys: string[] = [];
    const f = await httpRouteFixture((router, input) =>
      mountConfigurationReadRoutes(router, {
        ...input,
        appConfigs: {} as never,
        forms: {} as never,
        loadRecord: async () => null,
        translations: {
          listEntries: async () => [],
          getBundle: async () => null!,
          getEntry: async (_brand, _locale, _namespace, key) => {
            keys.push(key);
            return { key } as never;
          },
        },
      })
    );
    cleanup.push(f.close);
    const base = f.url + '/default/portal/api/i18n/entries/en/translation/';
    for (const [tail, key] of [
      ['group/title', 'group/title'],
      ['group%2Ftitle', 'group/title'],
      ['group%252Ftitle', 'group%2Ftitle'],
      ['group/title/', 'group/title/'],
    ]) {
      const response = await exchange(base + tail);
      assert.equal(response.status, 200);
      assert.equal(keys.at(-1), key);
    }
    assert.equal((await exchange(base)).status, 404);
  });

  it('returns safe versioned 400 errors for malformed captures before the handler', async () => {
    let calls = 0;
    const f = await fixture(router => {
      router.get('/probe/:id', (_req, res) => {
        calls++;
        res.end();
      });
    });
    for (const id of ['%ZZ', '%', '%E0%A4%A', '%C0%AF']) {
      const response = await exchange(f.url + '/probe/' + id + '?apiVersion=2.0');
      assert.equal(response.status, 400);
      assert.deepEqual(JSON.parse(response.text), { errors: [{ detail: 'Invalid request' }], meta: {} });
      assert.equal(response.headers['cache-control'], 'no-cache, private');
    }
    assert.equal(calls, 0);
  });

  it('distinguishes exact global GET probes from ordinary HEAD, OPTIONS and mounted paths', async () => {
    const f = await fixture(undefined, { rootContext: '/research' });
    for (const [path, field] of [
      ['/healthz', 'healthy'],
      ['/readyz', 'ready'],
    ]) {
      const response = await exchange(f.url + path);
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.text), { [field]: true });
      for (const method of ['HEAD', 'OPTIONS']) assert.equal((await exchange(f.url + path, { method })).status, 404);
      for (const suffix of [path.toUpperCase(), path + '/', '/research' + path])
        assert.equal((await exchange(f.url + suffix)).status, 404);
    }
  });

  it('runs implicit HEAD through the GET guard/action while suppressing only its response body', async () => {
    let guards = 0,
      actions = 0;
    const f = await fixture(router => {
      router.get(
        '/read',
        (req, res, next) => {
          guards++;
          req.get('authorization') ? next() : res.status(401).end();
        },
        (_req, res) => {
          actions++;
          res.json({ unfiltered: 'value' });
        }
      );
    });
    assert.equal((await exchange(f.url + '/read', { method: 'HEAD' })).status, 401);
    const head = await exchange(f.url + '/read', { method: 'HEAD', headers: { Authorization: 'fixture' } });
    const get = await exchange(f.url + '/read', { headers: { Authorization: 'fixture' } });
    assert.equal(head.status, 200);
    assert.equal(head.text, '');
    assert.equal(head.headers['content-length'], get.headers['content-length']);
    assert.equal(head.headers.etag, undefined);
    assert.deepEqual([guards, actions], [3, 2]);
  });

  for (const state of ['no cookie', 'saved anonymous', 'authenticated v6', 'legacy authenticated'] as const) {
    it(`retains the explicit OIDC HEAD denial after production session middleware (${state})`, async () => {
      const store = new session.MemoryStore();
      const operations = {
        get: sinon.spy(store, 'get'),
        set: sinon.spy(store, 'set'),
        touch: sinon.spy(store, 'touch'),
        destroy: sinon.spy(store, 'destroy'),
      };
      const identity = new HttpIdentity({
        one: async () => null,
        verifyPassword: async () => false,
        findByApiTokenHash: async () => null,
      });
      const deserialize = sinon.stub(identity, 'session').resolves({ id: 'alice', username: 'alice', roles: [] });
      const beginContext = sinon.stub().returns(true);
      const audit = sinon.stub().throws(new Error('HEAD must not audit a login'));
      const loginFailure = sinon.stub().throws(new Error('HEAD must not report a login failure'));
      let provider: sinon.SinonStub;
      const f = await fixture(
        (router, authentication) => {
          provider = sinon
            .stub(authentication.passport, 'authenticate')
            .throws(new Error('HEAD must not invoke an OIDC provider'));
          router.post('/seed-session', (req, res) => {
            req.session.portal = 'original-portal';
            if (state === 'authenticated v6' || state === 'legacy authenticated') {
              Reflect.set(req.session, 'passport', { user: 'alice' });
              if (state === 'authenticated v6') Reflect.set(req.session, 'authenticationVersion', 6);
            }
            res.end();
          });
          mountAuthenticationRoutes(router, {
            passport: authentication.passport,
            identity,
            defaultBrand: 'default',
            defaultPortal: 'portal',
            validContext: beginContext,
            brandId: () => 'brand-1',
            postLoginPath: () => '/default/portal/home',
            audit,
            loginFailure,
            csrf: (_req, _res, next) => next(),
          });
        },
        { session: { store }, identity }
      );
      let cookie: string | undefined;
      if (state !== 'no cookie') {
        const seeded = await exchange(f.url + '/seed-session', { method: 'POST' });
        assert.equal(seeded.status, 200);
        cookie = seeded.headers['set-cookie']![0].split(';')[0];
      }
      for (const operation of Object.values(operations)) operation.resetHistory();
      const oidc = await exchange(f.url + '/user/begin_oidc', {
        method: 'HEAD',
        headers: cookie ? { Cookie: cookie } : {},
      });
      assert.equal(oidc.status, 405);
      assert.equal(oidc.headers.allow, undefined);
      assert.equal(oidc.text, '');
      if (state === 'legacy authenticated') {
        assert(oidc.headers['set-cookie']);
        assert.notEqual(oidc.headers['set-cookie'][0].split(';')[0], cookie);
      } else assert.equal(oidc.headers['set-cookie'], undefined);
      assert.equal(beginContext.callCount, 0);
      assert.equal(provider!.callCount, 0);
      assert.equal(audit.callCount, 0);
      assert.equal(loginFailure.callCount, 0);
      assert.deepEqual(
        Object.fromEntries(Object.entries(operations).map(([name, operation]) => [name, operation.callCount])),
        {
          get: state === 'no cookie' ? 0 : 1,
          set: state === 'legacy authenticated' ? 1 : 0,
          touch: state === 'saved anonymous' || state === 'authenticated v6' ? 1 : 0,
          destroy: state === 'legacy authenticated' ? 1 : 0,
        }
      );
      assert.equal(deserialize.callCount, state === 'authenticated v6' ? 1 : 0);
      if (state === 'authenticated v6') assert.deepEqual(deserialize.firstCall.args, ['alice']);
    });
  }

  it('synthesizes Allow for OPTIONS without invoking GET policies or adding CORS headers', async () => {
    let guards = 0;
    const store = new session.MemoryStore();
    const get = sinon.spy(store, 'get');
    const touch = sinon.spy(store, 'touch');
    const set = sinon.spy(store, 'set');
    const f = await fixture(
      router => {
        router.post('/seed-session', (req, res) => {
          req.session.portal = 'portal';
          res.end();
        });
        router.get('/read', (_req, res) => {
          guards++;
          res.status(401).end();
        });
        router.post('/read', (_req, res) => {
          guards++;
          res.status(401).end();
        });
      },
      { session: { store } }
    );
    const seeded = await exchange(f.url + '/seed-session', { method: 'POST' });
    assert.equal(seeded.status, 200);
    const cookie = seeded.headers['set-cookie']![0].split(';')[0];
    set.resetHistory();
    for (const savedCookie of ['', cookie]) {
      const response = await exchange(f.url + '/read', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://foreign.example',
          'Access-Control-Request-Method': 'POST',
          ...(savedCookie ? { Cookie: savedCookie } : {}),
        },
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.allow, 'GET, HEAD, POST');
      assert.equal(response.text, 'GET, HEAD, POST');
      assert.equal(response.headers['access-control-allow-origin'], undefined);
      assert.equal(response.headers['access-control-allow-methods'], undefined);
      assert.equal(response.headers['set-cookie'], undefined);
      assert.equal(get.callCount, savedCookie ? 1 : 0);
      assert.equal(touch.callCount, savedCookie ? 1 : 0);
      assert.equal(set.callCount, 0);
    }
    assert.equal(guards, 0);
    assert.equal((await exchange(f.url + '/missing', { method: 'OPTIONS' })).status, 404);
  });

  it('distinguishes unmatched supported HTTP verbs from Node-rejected method tokens', async () => {
    const f = await fixture(router => {
      router.get('/read', (_req, res) => res.end());
    });
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'PROPFIND', 'TRACE']) {
      const response = await exchange(f.url + '/read', { method });
      assert.equal(response.status, 404);
      assert.equal(response.headers.allow, undefined);
      assert.deepEqual(JSON.parse(response.text), { error: 'not-found' });
    }
    const rejected = await exchange(f.url + '/read', { method: 'BREW' });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.text, '');
  });

  it('characterizes branded fallback errors separately from host method misses and automatic OPTIONS', async () => {
    const page = await pageInputFixture();
    await page.input.artifacts.initialize();
    cleanup.push(() => page.input.artifacts.close());
    const f = await httpRouteFixture((router, input) => {
      router.use((req, _res, next) => {
        req.session = {} as typeof req.session;
        next();
      });
      router.get('/:branding/:portal/only-read', (_req, res) => res.end('read'));
      mountPageNotFound(router, { ...page.input, ...input, csrf: createHttpCsrf({ origins: [page.input.origin] }) });
    });
    cleanup.push(f.close);
    const url = f.url + '/default/portal/only-read';
    assert.equal((await exchange(url)).status, 200);
    const options = await exchange(url, { method: 'OPTIONS' });
    assert.equal(options.status, 200);
    assert.equal(options.headers.allow, 'GET, HEAD');
    const wrongMethod = await exchange(url, { method: 'POST' });
    assert.equal(wrongMethod.status, 403);
    assert.deepEqual(JSON.parse(wrongMethod.text), { message: 'Invalid CSRF token', details: '' });
    const unknown = await exchange(f.url + '/default/portal/missing', { headers: { Accept: 'application/json' } });
    assert.equal(unknown.status, 404);
    assert.equal(unknown.text, '');
    const html = await exchange(f.url + '/default/portal/missing', { headers: { Accept: 'text/html' } });
    assert.equal(html.status, 404);
    assert.match(html.headers['content-type']!, /text\/html/);
    assert(html.headers['content-security-policy']);
  });

  it('keeps ALL root redirects for OPTIONS and less common verbs with deployment-local Location', async () => {
    const f = await fixture(router => mountPageRoot(router, '/research', '/default/portal/home'), {
      rootContext: '/research',
    });
    for (const method of ['GET', 'HEAD', 'POST', 'PATCH', 'OPTIONS', 'PROPFIND']) {
      const response = await exchange(f.url + '/research/', { method });
      assert.equal(response.status, 302);
      assert.equal(response.headers.location, '/research/default/portal/home');
      assert.equal(response.headers['cache-control'], 'no-store, no-cache, must-revalidate');
      assert.equal(response.headers.allow, undefined);
      if (method === 'HEAD') assert.equal(response.text, '');
    }
  });

  for (const source of ['query', 'form'] as const) {
    it(`retains duplicate, nested, blank and mixed scalar/array ${source} values without coercion`, async () => {
      const f = await fixture();
      const values =
        'tag=a&tag=b&person[name]=A+Person&items[]=x&items[]=y&blank=&flag=false&count=02&mix=a&mix[]=b&indexed[21]=x&bad=%ZZ';
      const response = await exchange(
        f.url + '/input' + (source === 'query' ? '?' + values : ''),
        source === 'form'
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: values,
            }
          : {}
      );
      assert.equal(response.status, 200);
      assert.deepEqual(JSON.parse(response.text)[source === 'query' ? 'query' : 'body'], {
        tag: ['a', 'b'],
        person: { name: 'A Person' },
        items: ['x', 'y'],
        blank: '',
        flag: 'false',
        count: '02',
        mix: ['a', 'b'],
        indexed: source === 'query' ? { '21': 'x' } : ['x'],
        bad: '%ZZ',
      });
    });

    it(`does not pollute Object.prototype through ${source} while characterizing own prototype-named fields`, async () => {
      const f = await fixture();
      const values = '__proto__[fm003]=unsafe&constructor[prototype][fm003]=own&toString=own&ok=yes';
      const response = await exchange(
        f.url + '/input' + (source === 'query' ? '?' + values : ''),
        source === 'form'
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: values,
            }
          : {}
      );
      assert.equal(response.status, 200);
      assert.equal(Reflect.get(Object.prototype, 'fm003'), undefined);
      const parsed = JSON.parse(response.text)[source === 'query' ? 'query' : 'body'];
      assert.deepEqual(parsed, { constructor: { prototype: { fm003: 'own' } }, toString: 'own', ok: 'yes' });
      assert.equal(Object.hasOwn(parsed, '__proto__'), false);
    });
  }

  it('characterizes query truncation, depth folding, array indices and tolerant percent decoding', async () => {
    const f = await fixture();
    const keys = Array.from({ length: 1001 }, (_, i) => 'k' + i + '=v').join('&');
    const limited = await exchange(f.url + '/input?' + keys);
    assert.equal(limited.status, 200);
    assert.equal(Object.keys(JSON.parse(limited.text).query).length, 1000);
    assert.equal(JSON.parse(limited.text).query.k1000, undefined);
    const response = await exchange(f.url + '/input?a[b][c][d][e][f][g]=v&arr[21]=x&bad=%ZZ&short=%E0%A4%A');
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.text).query, {
      a: { b: { c: { d: { e: { f: { '[g]': 'v' } } } } } },
      arr: { '21': 'x' },
      bad: '%ZZ',
      short: '%E0%A4%A',
    });
  });

  it('enforces form parameter/depth bounds rather than applying query truncation', async () => {
    const f = await fixture();
    const form = (body: string) =>
      exchange(f.url + '/input', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    const keys = Array.from({ length: 1000 }, (_, i) => 'k' + i + '=v').join('&');
    assert.equal((await form(keys)).status, 200);
    assert.equal((await form(keys + '&overflow=v')).status, 413);
    assert.equal((await form('a' + '[b]'.repeat(32) + '=v')).status, 200);
    const deep = await form('a' + '[b]'.repeat(33) + '=private-value');
    assert.equal(deep.status, 400);
    assert.deepEqual(JSON.parse(deep.text), { message: 'Invalid request', details: '' });
  });

  it('bounds the request target through the Node HTTP header limit before application parsing', async () => {
    const f = await fixture();
    const response = await exchange(f.url + '/input?value=' + 'x'.repeat(20_000));
    assert.equal(response.status, 431);
    assert.equal(response.text, '');
    assert.equal((await exchange(f.url + '/input?value=small')).status, 200);
  });

  it('retains JSON duplicate last-value behavior and strict object/array parsing', async () => {
    const f = await fixture();
    const json = (body: string) =>
      exchange(f.url + '/input', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.deepEqual(JSON.parse((await json('{"name":"first","name":"last","count":2}')).text).body, {
      name: 'last',
      count: 2,
    });
    assert.deepEqual(JSON.parse((await json('[1,"two"]')).text).body, [1, 'two']);
    for (const body of ['null', 'true', '1', '"text"']) assert.equal((await json(body)).status, 400);
    assert.deepEqual(JSON.parse((await json('')).text).body, {});
  });

  it('accepts JSON UTF-8/UTF-16 and form UTF-8/Latin-1 while leaving unmatched media types unparsed', async () => {
    const f = await fixture();
    const cases: Array<[string, string | Buffer, unknown]> = [
      [
        'Application/JSON; Charset=UTF-8',
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"value":"é"}')]),
        { value: 'é' },
      ],
      ['application/json; charset=utf-16le', Buffer.from('{"value":"é"}', 'utf16le'), { value: 'é' }],
      ['application/x-www-form-urlencoded; charset=utf-8', 'value=%C3%A9', { value: 'é' }],
      ['application/x-www-form-urlencoded; charset=iso-8859-1', 'value=%E9', { value: 'é' }],
      ['application/problem+json', '{"value":1}', null],
      ['text/plain; charset=not-a-charset', 'private-value', null],
      ['application/octet-stream', 'private-value', null],
    ];
    for (const [contentType, body, expected] of cases) {
      const response = await exchange(f.url + '/input', {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body,
      });
      assert.equal(response.status, 200, contentType);
      assert.deepEqual(JSON.parse(response.text).body, expected, contentType);
    }
    const latinJson = await exchange(f.url + '/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=iso-8859-1' },
      body: '{}',
    });
    assert.equal(latinJson.status, 415);
  });

  it('inflates supported gzip, deflate and Brotli bodies before JSON/form parsing', async () => {
    const f = await fixture();
    for (const contentType of ['application/json', 'application/x-www-form-urlencoded']) {
      const body = contentType === 'application/json' ? '{"value":"decoded"}' : 'value=decoded';
      for (const [encoding, compress] of [
        ['gzip', gzipSync],
        ['deflate', deflateSync],
        ['br', brotliCompressSync],
      ] as const) {
        const response = await exchange(f.url + '/input', {
          method: 'POST',
          headers: { 'Content-Type': contentType, 'Content-Encoding': encoding },
          body: compress(body),
        });
        assert.equal(response.status, 200, contentType + ' ' + encoding);
        assert.deepEqual(JSON.parse(response.text).body, { value: 'decoded' });
      }
    }
  });

  for (const contentType of ['application/json', 'application/x-www-form-urlencoded']) {
    it(`enforces the exact 1 MiB ${contentType} body boundary`, async () => {
      const f = await fixture();
      const json = contentType === 'application/json';
      for (const bytes of [1_048_576, 1_048_577]) {
        const body = json ? '{"x":"' + 'x'.repeat(bytes - 8) + '"}' : 'x=' + 'x'.repeat(bytes - 2);
        assert.equal(Buffer.byteLength(body), bytes);
        const response = await exchange(f.url + '/input', {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body,
        });
        assert.equal(response.status, bytes === 1_048_576 ? 200 : 413);
        if (response.status === 413)
          assert.deepEqual(JSON.parse(response.text), { message: 'Invalid request', details: '' });
      }
    });
  }

  it('excludes raw prefixes case-insensitively on segment boundaries and retains untouched bytes', async () => {
    const f = await fixture(
      router => {
        router.post('/remote{/*tail}', async (req, res) => {
          assert.equal(req.body, undefined);
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk);
          res.end(Buffer.concat(chunks));
        });
      },
      { rootContext: '/research', parserExclusions: ['/remote'] }
    );
    for (const path of ['/REMOTE', '/REMOTE/file']) {
      const response = await exchange(f.url + '/research' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'unparsed-private-bytes',
      });
      assert.equal(response.status, 200);
      assert.equal(response.text, 'unparsed-private-bytes');
    }
    assert.equal(
      (
        await exchange(f.url + '/research/REMOTEx', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'unparsed-private-bytes',
        })
      ).status,
      400
    );
  });

  it('preserves signed cookie attributes and rejects tampering/malformed cookies without reusing session state', async () => {
    const store = new session.MemoryStore();
    const f = await fixture(
      router => {
        router.get('/read', (req, res) => res.json({ portal: req.session.portal ?? null }));
        router.post('/write', (req, res) => {
          req.session.portal = 'portal';
          res.json({ ok: true });
        });
      },
      {
        rootContext: '/research',
        session: { store, cookie: { secure: false, path: '/research', domain: 'example.test', maxAge: 60_000 } },
      }
    );
    assert.equal((await exchange(f.url + '/research/read')).headers['set-cookie'], undefined);
    const write = await exchange(f.url + '/research/write', { method: 'POST' });
    const setCookie = write.headers['set-cookie']![0];
    assert.match(setCookie, /^redbox\.sid=s%3A/);
    for (const attribute of ['Domain=example.test', 'Path=/research', 'HttpOnly', 'SameSite=Lax', 'Expires='])
      assert(setCookie.includes(attribute));
    assert(!setCookie.includes('; Secure'));
    const cookie = setCookie.split(';')[0];
    assert.deepEqual(JSON.parse((await exchange(f.url + '/research/read', { headers: { Cookie: cookie } })).text), {
      portal: 'portal',
    });
    for (const invalid of [cookie + 'tampered', 'redbox.sid=%ZZ', 'redbox.sid=unsigned']) {
      const read = await exchange(f.url + '/research/read', { headers: { Cookie: invalid } });
      assert.equal(read.status, 200);
      assert.deepEqual(JSON.parse(read.text), { portal: null });
      assert.equal(read.headers['set-cookie'], undefined);
    }
  });

  it('preserves strong record tags and conditional GET/HEAD while reauthorizing before 304', async () => {
    const f = await httpRecordReadsFixture();
    cleanup.push(f.close);
    const record = {
      redboxOid: 'oid-1',
      revision: 2,
      metaMetadata: { brandId: 'brand-1' },
      metadata: { title: 'Visible' },
      authorization: { view: ['alice'] },
    };
    f.storage.getMeta.resolves(record);
    f.schemas.resolveUpdate.resolves({ kind: 'disabled' });
    const url = f.url + '/default/portal/api/records/metadata/oid-1?apiVersion=2.0';
    const tag = formatRecordEntityTag('oid-1', 2);
    for (const method of ['GET', 'HEAD']) {
      const response = await exchange(url, { method, headers: { 'If-None-Match': tag, 'Accept-Encoding': 'gzip' } });
      assert.equal(response.status, 304);
      assert.equal(response.headers.etag, tag);
      assert.equal(response.headers['cache-control'], 'no-cache, private');
      assert.equal(response.headers['content-encoding'], undefined);
      assert.equal(response.text, '');
    }
    assert.equal((await exchange(url, { headers: { 'If-None-Match': '"other"' } })).status, 200);
    f.storage.getMeta.resolves({ ...record, authorization: {} });
    const denied = await exchange(url, { headers: { 'If-None-Match': tag } });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.etag, undefined);
  });

  it('retains static date/range responses, cache headers and cookie suppression without generated ETags', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fm003-assets-'));
    cleanup.push(() => rm(directory, { recursive: true, force: true }));
    await mkdir(join(directory, 'js'));
    await writeFile(join(directory, 'js/main-12345678.js'), '0123456789');
    const artifacts = new PageArtifacts([directory], [directory]);
    const store = new session.MemoryStore();
    const set = sinon.spy(store, 'set');
    const f = await fixture(
      router => {
        router.use((req, res, next) => {
          req.session.portal = 'private';
          res.set('Set-Cookie', 'upstream=private');
          next();
        });
        mountStaticPageArtifacts(router, artifacts);
      },
      { session: { store } }
    );
    const url = f.url + '/js/main-12345678.js';
    const get = await exchange(url, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(get.status, 200);
    assert.equal(get.text, '0123456789');
    assert.equal(get.headers.etag, undefined);
    assert(get.headers['last-modified']);
    assert.equal(get.headers['cache-control'], 'public, max-age=31536000, immutable');
    assert.equal(get.headers['content-encoding'], undefined);
    assert.equal(get.headers.vary, undefined);
    assert.equal(get.headers['set-cookie'], undefined);
    // Header suppression also covers express-session's deferred cookie after
    // saving a changed session; it does not suppress the store operation.
    assert.equal(set.callCount, 1);
    assert.equal(set.firstCall.args[1].portal, 'private');
    assert.equal(get.headers['x-content-type-options'], 'nosniff');
    const cached = await exchange(url, { headers: { 'If-Modified-Since': get.headers['last-modified']! } });
    assert.equal(cached.status, 304);
    assert.equal(cached.text, '');
    assert.equal((await exchange(url, { headers: { 'If-None-Match': '"unowned-tag"' } })).status, 200);
    const head = await exchange(url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(head.headers['content-length'], '10');
    assert.equal(head.text, '');
    const range = await exchange(url, { headers: { Range: 'bytes=2-4' } });
    assert.equal(range.status, 206);
    assert.equal(range.headers['content-range'], 'bytes 2-4/10');
    assert.equal(range.text, '234');
    const malformed = await exchange(f.url + '/js/%ZZ');
    assert.equal(malformed.status, 400);
    assert.equal(malformed.text, '');
  });

  it('keeps response and validation version negotiation distinct and preserves response fields', async () => {
    const f = await fixture(router => {
      router.get('/data', (req, res) => sendApiData(req, res, { extra: 'retained', nested: { custom: true } }));
      router.get('/invalid', (req, res) =>
        sendApiValidationErrors(req, res, [{ path: 'query.name', message: 'Required' }])
      );
    });
    const headers = { 'X-ReDBox-Api-Version': '2.0' };
    assert.deepEqual(JSON.parse((await exchange(f.url + '/data', { headers })).text), {
      data: { extra: 'retained', nested: { custom: true } },
      meta: {},
    });
    assert.deepEqual(JSON.parse((await exchange(f.url + '/data?apiVersion=1.0', { headers })).text), {
      extra: 'retained',
      nested: { custom: true },
    });
    assert.deepEqual(JSON.parse((await exchange(f.url + '/invalid?apiVersion=1.0', { headers })).text), {
      errors: [{ title: 'query.name', detail: 'Required' }],
      meta: {},
    });
    assert.deepEqual(JSON.parse((await exchange(f.url + '/invalid')).text), {
      message: 'query.name',
      details: 'Required',
    });
    const missing = await exchange(f.url + '/missing?apiVersion=2.0');
    assert.equal(missing.status, 404);
    assert.deepEqual(JSON.parse(missing.text), { error: 'not-found' });
  });
});
