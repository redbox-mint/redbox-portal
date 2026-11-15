import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, symlink, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ApplicationModule } from '../../../src/application';
import { bindExtensionFactory, type ExtensionFactory, type RedboxExtensionV2 } from '../../../src/extensions';
import { portalHttpPolicies } from '../../../src/application/portal/httpPolicies';
import { portalPageRenderingInput } from '../../../src/application/portal/pageHttpPlan';
import {
  PageArtifacts,
  prepareNativePage,
  renderPageShell,
  sendPageResponse,
  type PageRenderingInput,
} from '../../../src/http';
import { bindControllerFactory, type ControllerFactory } from '../../../src/http';
import { createNativeCsrf } from '../../../src/http/fastify/csrf';
import { HttpFailure } from '../../../src/http/fastify/errorBoundary';
import { referenceReadDeclarations } from '../../../src/http/referenceRoutes';
import { referenceProductionFixture } from './referenceProductionFixture';
import { wire } from './mutationDifferentialSupport';

type Operation = (request: FastifyRequest) => Promise<unknown>;
type Example = ApplicationModule & { greet(): Promise<string> };
interface GeneratedHook {
  exampleModule: ExtensionFactory<{ auditPath: string; greeting: string }, Example>;
  exampleController: ControllerFactory<{ example: Pick<Example, 'greet'>; scaffoldAdded?: Operation }, object>;
  apiPolicies: Record<string, Record<string, true>>;
  registerRedboxExtension(): RedboxExtensionV2;
  migrateExample(input: WorkInput): Promise<void>;
  bootstrapExample(input: WorkInput): Promise<void>;
  bindGeneratedControllers(input: {
    ProbeController: { read: Operation; write: Operation; added?: Operation };
    'webservice/ProbeController': { read: Operation; write: Operation; apiAdded?: Operation };
    'webservice/PublicApiController': { read: Operation; publish: Operation };
    PublicController: { read: Operation; publish: Operation; publicAdded?: Operation };
    LegacyController: { read: Operation };
    ReviewAppPageController: {
      render(request: FastifyRequest, reply: FastifyReply, view: string, title: string): Promise<unknown>;
    };
  }): readonly import('../../../src/http').BoundControllerFactory[];
}
interface WorkInput {
  ensureNamedQuery(name: string, query: Readonly<Record<string, unknown>>): Promise<void>;
}

/** Runs the shipped CLI and compiled extension, never a substitute dispatcher. */
describe('FM-037 generated API2 extension on production Fastify', function () {
  this.timeout(300000);
  it('boots a strict generated extension, adds a method, recompiles and boots the same installed extension again', async () => {
    assert(process.env.HTTP_PILOT_TEST_MONGO_URL && process.env.HTTP_READ_SOLR_PORT, 'Disposable Mongo/Solr required');
    const repository = path.resolve(__dirname, '../../../../..');
    const directory = await mkdtemp(path.join(tmpdir(), 'fm037-generated-'));
    let pageArtifacts: PageArtifacts | undefined;
    let fixture: Awaited<ReturnType<typeof referenceProductionFixture>> | undefined;
    const run = (command: string, args: string[], cwd = directory) =>
      execFileSync('timeout', ['--signal=TERM', '--kill-after=15', '120', command, ...args], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    const cli = path.join(repository, 'packages/redbox-dev-tools/bin/cli.js');
    try {
      run(process.execPath, [cli, 'init', 'fm037', '--template', 'v6']);
      const hookDirectory = directory;
      // Source-linked qualification is FM-037; clean packed installation is FM-039.
      await symlink(path.join(repository, 'node_modules'), path.join(hookDirectory, 'node_modules'), 'dir');
      run(process.execPath, [
        cli,
        '--root',
        hookDirectory,
        'generate',
        'controller',
        'Probe',
        '--class-name',
        'CustomProbe',
        '--routes',
        'read:get:/:branding/:portal/hooks/fm037/read:Admin,write:post:/:branding/:portal/hooks/fm037/write:Admin',
      ]);
      const generate = (...args: string[]) =>
        run(process.execPath, [cli, '--root', hookDirectory, 'generate', ...args]);
      generate(
        'controller',
        'Probe',
        '--webservice',
        '--class-name',
        'ApiProbe',
        '--auth',
        'Admin',
        '--routes',
        'read:get:/:branding/:portal/api/fm037/read,write:post:/:branding/:portal/api/fm037/write'
      );
      generate(
        'controller',
        'Public',
        '--public',
        '--actions',
        'read,publish',
        '--routes',
        'read:get:/hooks/fm037/public,publish:post:/hooks/fm037/public-write'
      );
      generate(
        'controller',
        'PublicApi',
        '--webservice',
        '--public',
        '--routes',
        'read:get:/hooks/fm037/public-api,publish:post:/hooks/fm037/public-api-write'
      );
      generate('controller', 'Legacy', '--public', '--actions', 'read', '--route', '/hooks/fm037/legacy');
      generate('angular-app', 'review-app', '--ejs-view', 'review-view', '--auth', 'Admin');
      // A conflicting request must fail visibly in both directions and preserve all output.
      for (const [file, method, route, access] of [
        ['PublicController.ts', 'read', '/hooks/fm037/public', ['--auth', 'Admin']],
        ['ProbeController.ts', 'read', '/:branding/:portal/hooks/fm037/read', ['--public']],
      ] as const) {
        const targets = ['src/controllers/' + file, 'src/config/extensionRoutes.ts', 'src/config/auth.config.ts'];
        const before = await Promise.all(targets.map(target => readFile(path.join(directory, target), 'utf8')));
        assert.throws(
          () =>
            generate('method', '--file', 'src/controllers/' + file, '--method', method, '--route', route, ...access),
          /Conflicting declaration/
        );
        assert.deepEqual(
          await Promise.all(targets.map(target => readFile(path.join(directory, target), 'utf8'))),
          before
        );
      }
      const compile = () =>
        run(
          path.join(repository, 'packages/redbox-core/node_modules/.bin/tsc'),
          ['-p', 'tsconfig.json'],
          hookDirectory
        );
      compile();
      for (const extended of [false, true]) {
        if (extended) {
          run(process.execPath, [
            cli,
            '--root',
            hookDirectory,
            'generate',
            'method',
            '--file',
            'src/controllers/ProbeController.ts',
            '--method',
            'added',
            '--route',
            '/:branding/:portal/hooks/fm037/added',
            '--http',
            'POST',
            '--auth',
            'Admin',
          ]);
          generate(
            'method',
            '--file',
            'src/controllers/webservice/ProbeController.ts',
            '--method',
            'apiAdded',
            '--route',
            '/:branding/:portal/api/fm037/added',
            '--http',
            'PUT',
            '--auth',
            'Admin'
          );
          generate(
            'method',
            '--file',
            'src/controllers/PublicController.ts',
            '--method',
            'publicAdded',
            '--route',
            '/hooks/fm037/public-added',
            '--http',
            'PATCH',
            '--public'
          );
          generate(
            'method',
            '--file',
            'src/controllers/ExampleController.ts',
            '--method',
            'scaffoldAdded',
            '--route',
            '/:branding/:portal/hooks/fm037/scaffold-added',
            '--http',
            'POST',
            '--auth',
            'Admin'
          );
          compile();
        }
        // Each deployment gets a fresh artifact path, as native ESM/CJS discovery
        // caches module namespaces for the life of the importing process.
        const installedDirectory = path.join(directory, extended ? 'after-method' : 'before-method');
        await mkdir(installedDirectory);
        for (const item of ['dist', 'package.json', 'views', 'assets'])
          await cp(path.join(hookDirectory, item), path.join(installedDirectory, item), { recursive: true });
        await symlink(path.join(repository, 'node_modules'), path.join(installedDirectory, 'node_modules'), 'dir');
        const hook: GeneratedHook = require(path.join(installedDirectory, 'dist/index.js'));
        const declaration = hook.registerRedboxExtension();
        assert.equal(declaration.apiVersion, 2);
        assert.equal(declaration.controllers?.length, 7);
        assert.equal(new Set(declaration.controllers!.map(c => c.name)).size, 7);
        assert.equal(declaration.routes?.length, extended ? 16 : 12);
        const dns = run('tailscale', ['status', '--json']);
        const hostname: string = JSON.parse(dns).Self.DNSName.replace(/\.$/, '');
        assert(hostname && hostname !== 'localhost');
        const port = Number(process.env.FM037_HOST_PORT ?? '47991');
        const origin = `http://${hostname}:${port}`;
        const nativeCsrf = createNativeCsrf({ origins: [origin] });
        let example: Example | undefined;
        let calls = 0;
        pageArtifacts = new PageArtifacts(
          [path.join(installedDirectory, 'views'), path.join(repository, 'views')],
          [path.join(installedDirectory, 'assets')]
        );
        await pageArtifacts.initialize();
        const respond =
          (action: string): Operation =>
          async request => ({ action, body: request.body });
        const input: Parameters<GeneratedHook['bindGeneratedControllers']>[0] = {
          'webservice/ProbeController': {
            read: respond('apiRead'),
            write: respond('apiWrite'),
            ...(extended ? { apiAdded: respond('apiAdded') } : {}),
          },
          'webservice/PublicApiController': { read: respond('publicApiRead'), publish: respond('publicApiPublish') },
          LegacyController: { read: respond('legacyRead') },
          PublicController: {
            read: respond('publicRead'),
            publish: respond('publish'),
            ...(extended ? { publicAdded: respond('publicAdded') } : {}),
          },
          ReviewAppPageController: {
            render: async (request, reply, view, title) => {
              const page = await prepareNativePage(request, reply, rendering, () => nativeCsrf.generateToken(request));
              return sendPageResponse(request, reply, renderPageShell(page, view, title));
            },
          },
          ProbeController: {
            read: async request => {
              calls++;
              const query = request.query as { failure?: string };
              if (query.failure === 'opaque') throw new Error('fm037-private-password-marker');
              if (query.failure === 'cycle') {
                const value: { self?: unknown } = {};
                value.self = value;
                return value;
              }
              if (query.failure) throw new HttpFailure(Number(query.failure));
              return { action: 'read' };
            },
            write: async request => {
              calls++;
              return { action: 'write', body: request.body };
            },
            ...(extended
              ? {
                  added: async (request: FastifyRequest) => {
                    calls++;
                    return { action: 'added', body: request.body, query: request.query, params: request.params };
                  },
                }
              : {}),
          },
        };
        let rendering: PageRenderingInput;
        fixture = await referenceProductionFixture(true, { ...portalHttpPolicies(), ...hook.apiPolicies }, undefined, {
          declarations: referenceReadDeclarations,
          pages: {},
          configuration: {
            // Leave role rules to the generated extension's config contribution.
            auth: { roles: [{ name: 'Admin' }, { name: 'Researcher' }, { name: 'Guest' }] },
            server: {
              hostname: '0.0.0.0',
              port,
              rootContext: '/portal',
              trustProxy: false,
              publicUrl: origin,
              stopDeadlineMs: 30000,
            },
          },
          env: { REDBOX_PUBLIC_URL: origin },
          artifacts: async appPath => {
            const manifestPath = path.join(appPath, 'package.json');
            const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
            manifest.dependencies['redbox-hook-fm037'] = 'file:' + installedDirectory;
            manifest.dependencies['fm037-hooks'] = '1.0.0';
            await writeFile(manifestPath, JSON.stringify(manifest));
            await symlink(installedDirectory, path.join(appPath, 'node_modules/redbox-hook-fm037'), 'dir');
            const provider = path.join(appPath, 'node_modules/fm037-hooks');
            await mkdir(provider);
            await writeFile(
              path.join(provider, 'package.json'),
              JSON.stringify({ name: 'fm037-hooks', main: 'index.cjs', redbox: { extension: './index.cjs' } })
            );
            const added = declaration.routes!.find(r => r.action === 'added');
            await writeFile(
              path.join(provider, 'index.cjs'),
              'exports.registerRedboxExtension=()=>({apiVersion:2,hooks:' +
                (added
                  ? `[{ name: 'fm037-live-input', stage: 'beforeAction', scope: {kind:'routes',names:[${JSON.stringify(added.name)}]}, run:async(request)=> { request.body={live:true}; request.query={live:'query'}; request.params={branding:'default',portal:'rdmp',live:'params'}; } }]`
                  : '[]') +
                '});'
            );
          },
          bindings: {
            module: registration => {
              assert.strictEqual(registration.declaration, hook.exampleModule);
              const create = bindExtensionFactory(hook.exampleModule, {
                auditPath: path.join(directory, `audit-${extended}.log`),
                greeting: 'Generated greeting',
              });
              return () => (example = create());
            },
            work: registration => {
              assert(
                registration.declaration.run === hook.migrateExample ||
                  registration.declaration.run === hook.bootstrapExample
              );
              const work: WorkInput = {
                ensureNamedQuery: async (name, query) => {
                  // An application-owned durable fixture repository; no global or second pool.
                  await writeFile(path.join(directory, name + '.json'), JSON.stringify(query));
                },
              };
              return () =>
                registration.declaration.run === hook.migrateExample
                  ? hook.migrateExample(work)
                  : hook.bootstrapExample(work);
            },
          },
          httpBindings: context => {
            rendering = portalPageRenderingInput(context, pageArtifacts!);
            return [
              bindControllerFactory(hook.exampleController, {
                ...(extended ? { scaffoldAdded: respond('scaffoldAdded') } : {}),
                example: {
                  greet: () => {
                    assert(example);
                    return example.greet();
                  },
                },
              }),
              ...hook.bindGeneratedControllers(input),
            ];
          },
        });
        assert.equal(fixture.portal.config.server.publicUrl, origin);
        const url = fixture.url;
        const publicResponse = await wire(url + '/hooks/fm037/status', 'GET');
        assert.equal(publicResponse.status, 200, publicResponse.text);
        assert.deepEqual(JSON.parse(publicResponse.text), { greeting: 'Generated greeting' });
        const read = url + '/default/rdmp/hooks/fm037/read';
        assert.equal((await wire(read, 'GET')).status, 401);
        assert.equal(calls, 0);
        const csrf = await wire(url + '/csrfToken', 'GET');
        const anonymousCookie = String((csrf.headers['set-cookie'] as string[])[0]).split(';')[0];
        const login = await wire(
          url + '/user/login_local',
          'POST',
          { Cookie: anonymousCookie, Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
          new URLSearchParams({
            username: 'pilot-admin',
            password: 'pilot-password',
            branding: 'default',
            portal: 'rdmp',
            _csrf: JSON.parse(csrf.text)._csrf,
          }).toString()
        );
        assert.equal(login.status, 302, login.text);
        const cookie = String((login.headers['set-cookie'] as string[])[0]).split(';')[0];
        const token = JSON.parse((await wire(url + '/csrfToken', 'GET', { Cookie: cookie })).text)._csrf;
        const headers = { Cookie: cookie, Origin: origin, 'X-CSRF-Token': token, 'Content-Type': 'application/json' };
        assert.equal((await wire(read, 'GET', { Cookie: cookie })).status, 200);
        for (const status of [400, 403, 404])
          for (const version of ['1.0', '2.0']) {
            const response = await wire(read + '?failure=' + status, 'GET', {
              Cookie: cookie,
              'X-ReDBox-Api-Version': version,
            });
            assert.equal(response.status, status, response.text);
            assert(!/HTTP_REQUEST_FAILED|stack|password/.test(response.text));
            const body = JSON.parse(response.text);
            if (status === 404) assert.deepEqual(body, { error: 'not-found' });
            else
              assert.deepEqual(
                body,
                version === '2.0'
                  ? { errors: [{ detail: 'Invalid request' }], meta: {} }
                  : { message: 'Invalid request', details: '' }
              );
          }
        for (const failure of ['opaque', 'cycle']) {
          const response = await wire(read + '?failure=' + failure, 'GET', { Cookie: cookie });
          assert.equal(response.status, 500);
          assert.deepEqual(JSON.parse(response.text), { message: 'Internal server error', details: '' });
          assert(!response.text.includes('fm037-private'));
        }
        const target = url + '/default/rdmp/hooks/fm037/write';
        const beforeDenials = calls;
        assert.equal((await wire(target, 'POST')).status, 401);
        assert.equal((await wire(target, 'POST', { ...headers, 'X-CSRF-Token': '' }, '{}')).status, 403);
        assert.equal((await wire(target, 'POST', { ...headers, Origin: 'https://foreign.invalid' }, '{}')).status, 403);
        assert.equal(calls, beforeDenials);
        assert.equal((await wire(target, 'POST', headers, '{}')).status, 200);
        assert.equal(
          (await wire(target, 'POST', { Cookie: cookie, Origin: origin, 'X-CSRF-Token': token })).status,
          200
        );
        const greeting = await wire(url + '/default/rdmp/hooks/fm037/greet', 'POST', headers, '{}');
        assert.equal(greeting.status, 200, greeting.text);
        assert.deepEqual(JSON.parse(greeting.text), { greeting: 'Generated greeting' });
        if (extended) assert.equal((await wire(url + '/default/rdmp/hooks/fm037/added', 'POST')).status, 401);
        if (extended)
          for (const body of ['{}', '']) {
            const response = await wire(
              url + '/default/rdmp/hooks/fm037/added',
              'POST',
              body ? headers : { Cookie: cookie, Origin: origin, 'X-CSRF-Token': token },
              body
            );
            assert.equal(response.status, 200, response.text);
            assert.deepEqual(JSON.parse(response.text), {
              action: 'added',
              body: { live: true },
              query: { live: 'query' },
              params: { branding: 'default', portal: 'rdmp', live: 'params' },
            });
          }
        assert.equal(
          (await readFile(path.join(directory, `audit-${extended}.log`), 'utf8')).split('\n').filter(Boolean).length,
          2
        );
        assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'fm037-records.json'), 'utf8')), {
          recordType: 'example',
        });
        assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'fm037-dashboard.json'), 'utf8')), {
          dashboard: 'example',
        });
        const loginAs = async (username: string) => {
          const csrf = await wire(url + '/csrfToken', 'GET');
          const anonymous = String((csrf.headers['set-cookie'] as string[])[0]).split(';')[0];
          const login = await wire(
            url + '/user/login_local',
            'POST',
            { Cookie: anonymous, Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' },
            new URLSearchParams({
              username,
              password: 'pilot-password',
              branding: 'default',
              portal: 'rdmp',
              _csrf: JSON.parse(csrf.text)._csrf,
            }).toString()
          );
          assert.equal(login.status, 302, login.text);
          const sessionCookie = String((login.headers['set-cookie'] as string[])[0]).split(';')[0];
          const token = JSON.parse((await wire(url + '/csrfToken', 'GET', { Cookie: sessionCookie })).text)._csrf;
          return { Cookie: sessionCookie, Origin: origin, 'X-CSRF-Token': token, 'Content-Type': 'application/json' };
        };
        const wrongRole = await loginAs('reader');
        const anon = await wire(url + '/csrfToken', 'GET');
        const anonymousHeaders = {
          Cookie: String((anon.headers['set-cookie'] as string[])[0]).split(';')[0],
          Origin: origin,
          'X-CSRF-Token': JSON.parse(anon.text)._csrf,
          'Content-Type': 'application/json',
        };
        const matrix = [
          { name: 'browser-custom-class', path: '/default/rdmp/hooks/fm037/read', method: 'GET' },
          { name: 'browser-mutation', path: '/default/rdmp/hooks/fm037/write', method: 'POST' },
          { name: 'api-read', path: '/default/rdmp/api/fm037/read', method: 'GET', api: true },
          { name: 'api-mutation', path: '/default/rdmp/api/fm037/write', method: 'POST', api: true },
          { name: 'public-api-read', path: '/hooks/fm037/public-api', method: 'GET', public: true, api: true },
          {
            name: 'public-api-mutation',
            path: '/hooks/fm037/public-api-write',
            method: 'POST',
            public: true,
            api: true,
          },
          { name: 'legacy-route-option', path: '/hooks/fm037/legacy', method: 'GET', public: true },
          { name: 'public-read-rerun', path: '/hooks/fm037/public', method: 'GET', public: true },
          { name: 'public-mutation', path: '/hooks/fm037/public-write', method: 'POST', public: true },
          { name: 'angular-ejs', path: '/default/rdmp/admin/review-app', method: 'GET', page: true },
          ...(extended
            ? [
                { name: 'browser-added', path: '/default/rdmp/hooks/fm037/added', method: 'POST' },
                { name: 'api-added', path: '/default/rdmp/api/fm037/added', method: 'PUT', api: true },
                { name: 'public-added', path: '/hooks/fm037/public-added', method: 'PATCH', public: true },
                { name: 'scaffold-added', path: '/default/rdmp/hooks/fm037/scaffold-added', method: 'POST' },
              ]
            : []),
        ];
        for (const cell of matrix) {
          const mutation = cell.method !== 'GET';
          const body = mutation ? '{}' : '';
          const call = (h: Record<string, string> = {}) =>
            wire(url + cell.path, cell.method, { ...h, ...(cell.page ? { Accept: 'text/html' } : {}) }, body);
          const check = async (h: Record<string, string>, status: number) => {
            const response = await call(h);
            assert.equal(response.status, status, `${cell.name}: ${response.text}`);
            return response;
          };
          await check(
            mutation ? { 'Content-Type': 'application/json' } : {},
            cell.public ? (mutation ? 403 : 200) : 401
          );
          await check(wrongRole, cell.public ? 200 : 403);
          const allowed = await check(headers, 200);
          if (cell.page) {
            assert.match(allowed.text, /<review-app/);
            assert.match(allowed.text, /angular\/review-app\/browser\/main/);
            assert.match(String(allowed.headers['content-type']), /text\/html/);
          }
          if (cell.public) await check(anonymousHeaders, 200);
          if (mutation) {
            await check({ ...headers, 'X-CSRF-Token': '' }, 403);
            await check({ ...headers, Origin: 'https://foreign.invalid' }, 403);
          }
          const bearer = {
            Authorization: 'Bearer pilot-api-token',
            Origin: origin,
            'Content-Type': 'application/json',
          };
          await check(bearer, mutation && !cell.api ? 403 : 200);
          if (cell.api && mutation) {
            const response = await wire(url + cell.path, cell.method, {
              Authorization: 'Bearer pilot-api-token',
              Origin: origin,
            });
            assert.equal(response.status, 200, `${cell.name} bodyless: ${response.text}`);
          }
          if (!cell.public) await check({ ...bearer, Authorization: 'Bearer reader-token' }, 403);
          if (mutation) {
            await check({ ...bearer, Authorization: 'Bearer invalid' }, cell.public ? 403 : 401);
            await check({ ...bearer, Origin: 'https://foreign.invalid' }, 403);
          }
          // Retain a compact result for every cell in both compiled deployments.
          console.log(
            `FM037_MATRIX ${JSON.stringify({ deployment: extended ? 'after-method' : 'before-method', ...cell, passed: true })}`
          );
        }
        await fixture.close();
        fixture = undefined;
        await pageArtifacts.close();
        pageArtifacts = undefined;
      }
    } finally {
      await fixture?.close();
      await pageArtifacts?.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
