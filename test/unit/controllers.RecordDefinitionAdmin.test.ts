import { http } from '../../packages/redbox-core/src/config/http.config';
import { createServer, type AddressInfo } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { RecordDefinitionPublicationLifecycleError } from '../../packages/redbox-core/src/services/RecordDefinitionPublicationService';
/** HTTP adapter unit tests with function handlers and stubbed branding/draft/publication services.
 * Session/CSRF/parser middleware is real; this suite is not generated production E2E.
 */
import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Controllers } from '../../packages/redbox-core/src/controllers/RecordDefinitionAdminController';
import { Services } from '../../packages/redbox-core/src/services/RecordDefinitionAdminService';
import { routes } from '../../packages/redbox-core/src/config/routes.config';
import { coreRecordActionRegistry } from '../../packages/redbox-core/src/services/record-actions/coordinator';
const Sails = require('sails').Sails;

describe('B09 HTTP adapter unit tests with service stubs', function () {
  this.timeout(60_000);
  let app: any;
  let root: string;
  let host: string;
  let saved: any;
  const globals = global as any;
  let cookie = '';
  let token = '';
  const mutations = Object.entries(routes).filter(
    ([route, target]) =>
      typeof target === 'object' && target.controller === 'RecordDefinitionAdminController' && !route.startsWith('get ')
  );
  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'redbox-b09-http-'));
    saved = Object.fromEntries(
      [
        'sails',
        'BrandingService',
        'RecordDefinitionAdminService',
        'RecordDefinitionDraftService',
        'RecordDefinitionPublicationService',
      ].map(key => [key, globals[key]])
    );
    const controller = new Controllers.RecordDefinitionAdmin().exports() as any;
    const testRoutes: any = { 'GET /csrfToken': { action: 'security/grant-csrf-token' } };
    for (const [route, target] of Object.entries(routes)) {
      if (typeof target !== 'object' || target.controller !== 'RecordDefinitionAdminController') continue;
      testRoutes[route] = { fn: controller[target.action!], csrf: true };
    }
    // Sails normalizes port 0 to its default, so reserve an actual ephemeral port first.
    const probe = createServer();
    await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve, reject) => probe.close(error => (error ? reject(error) : resolve())));
    app = new Sails();
    await new Promise<void>((resolve, reject) =>
      app.lift(
        {
          appPath: root,
          port,
          hooks: { orm: false, pubsub: false, sockets: false, grunt: false, views: false, blueprints: false },
          log: { level: 'silent' },
          session: { secret: 'b09-disposable-session-fixture-secret' },
          security: { csrf: true },
          routes: testRoutes,
          http: {
            middleware: {
              order: ['cookieParser', 'session', 'myBodyParser', 'fixtureUser', 'router'],
              myBodyParser: http.middleware.myBodyParser,
              fixtureUser(req: any, _res: any, next: any) {
                const role = req.headers['x-test-role'] ?? req.session.fixtureRole;
                if (req.headers['x-test-role']) req.session.fixtureRole = role;
                req.isAuthenticated = () => role !== undefined;
                req.user = role
                  ? {
                      id: 'admin',
                      roles: [
                        {
                          name: role === 'reader' ? 'Librarians' : 'Admin',
                          branding: role === 'other-brand' ? 'brand-b' : 'brand-a',
                        },
                      ],
                    }
                  : undefined;
                next();
              },
            },
          },
          bootstrap: (done: any) => done(),
        },
        (error: Error) => (error ? reject(error) : resolve())
      )
    );
    globals.sails = app;
    globals.BrandingService = {
      getBrand: (name: string) =>
        name === 'alpha' || name === 'default'
          ? { id: 'brand-a', name }
          : name === 'beta'
            ? { id: 'brand-b', name }
            : null,
    };
    globals.RecordDefinitionAdminService = new Services.RecordDefinitionAdmin();
    globals.RecordDefinitionPublicationService = {
      publish: async () => null,
      getRevision: async () => null,
      listHistory: async () => {
        throw new RecordDefinitionPublicationLifecycleError('record-type-not-found', 'Not found');
      },
    };
    globals.RecordDefinitionDraftService = { list: async () => [], get: async () => null, getStatus: async () => null };
    app.config.actionRegistry = coreRecordActionRegistry();
    host = `http://127.0.0.1:${app.hooks.http.server.address().port}`;
    const response = await fetch(`${host}/csrfToken`, { headers: { 'x-test-role': 'admin' } });
    cookie = response.headers
      .getSetCookie()
      .map(value => value.split(';')[0])
      .join('; ');
    token = ((await response.json()) as any)._csrf;
    assert(token);
  });
  after(async () => {
    if (app) await new Promise<void>(resolve => app.lower(() => resolve()));
    Object.assign(globals, saved);
    if (root) await rm(root, { recursive: true, force: true });
  });
  const url = (path: string) =>
    `${host}${path.replace(':branding', 'alpha').replace(':portal', 'rdmp').replace(':sourceKey', 'source').replace(':key', 'source').replace(':revision', '1').replace(':bindingId', 'actb_00000000000000000000000000000000').replace(':parameter', 'credential')}`;
  for (const environment of ['development', 'production']) {
    for (const [body, status, error] of [
      ['{"value":"B09-parser-secret-sentinel",', 400, 'invalid-request-body'],
      [JSON.stringify({ value: 'B09-parser-secret-sentinel' + 'x'.repeat(2 * 1024 * 1024) }), 413, 'payload-too-large'],
    ] as const) {
      it(`normalizes parser failures in ${environment} to ${status}`, async () => {
        const previous = app.config.environment;
        app.config.environment = environment;
        try {
          const response = await fetch(`${host}/alpha/rdmp/admin/record-definitions/source/draft`, {
            method: 'PUT',
            headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': token },
            body,
          });
          assert.equal(response.status, status);
          assert.deepEqual(await response.json(), { error });
        } finally {
          app.config.environment = previous;
        }
      });
    }
  }
  it('denies unauthenticated, non-Admin and cross-brand HTTP reads', async () => {
    for (const [role, status] of [
      [undefined, 401],
      ['reader', 403],
      ['other-brand', 403],
    ] as const) {
      const response = await fetch(`${host}/alpha/rdmp/admin/record-definitions`, {
        headers: role ? { 'x-test-role': role } : {},
      });
      assert.equal(response.status, status);
    }
    const response = await fetch(`${host}/alpha/rdmp/admin/record-definitions`, {
      headers: { 'x-test-role': 'admin' },
    });
    assert.equal(response.status, 200);
  });
  for (const [route] of mutations) {
    it(`requires real Sails CSRF: ${route}`, async () => {
      const [method, path] = route.split(' ');
      const response = await fetch(url(path!), {
        method: method!.toUpperCase(),
        headers: { 'x-test-role': 'admin', cookie, 'content-type': 'application/json' },
        body: '{}',
      });
      assert.equal(response.status, 403);
    });
  }
  it('valid CSRF reaches body validation without reflecting sensitive input', async () => {
    const response = await fetch(`${host}/alpha/rdmp/admin/record-definitions/source/publish`, {
      method: 'POST',
      headers: { 'x-test-role': 'admin', cookie, 'x-csrf-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ injected: 'B09-http-secret-sentinel' }),
    });
    assert.equal(response.status, 400);
    assert(!(await response.text()).includes('B09-http-secret-sentinel'));
  });
  it('bounds HTTP payloads after CSRF and never reflects oversized content', async () => {
    const response = await fetch(`${host}/alpha/rdmp/admin/record-definitions/source/draft`, {
      method: 'PUT',
      headers: { cookie, 'x-csrf-token': token, 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'B09-http-secret-sentinel'.repeat(4000) }),
    });
    assert.equal(response.status, 413);
    assert(!(await response.text()).includes('B09-http-secret-sentinel'));
  });
  it('returns UI-safe action metadata over HTTP', async () => {
    const response = await fetch(`${host}/alpha/rdmp/admin/record-actions`, { headers: { 'x-test-role': 'admin' } });
    assert.equal(response.status, 200);
    assert(!(await response.text()).includes('handler'));
  });
  it('runs the repository Bruno Admin collection through real session and CSRF middleware', async function () {
    const cli = process.env.B09_BRUNO_CLI;
    if (!cli) return this.skip();
    const { stdout } = await promisify(execFile)(
      cli,
      [
        'run',
        '2 - AJAX calls/1 - Admin User Tests/Record Definitions',
        '--env-var',
        `host=${host}`,
        '--env-var',
        `adminCookie=${cookie}`,
        '--sandbox',
        'developer',
      ],
      { cwd: join(process.cwd(), 'test/bruno'), maxBuffer: 2_000_000 }
    );
    console.log(stdout);
  });
});
