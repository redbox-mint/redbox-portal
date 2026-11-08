import assert from 'node:assert/strict';
import { Server, request as httpRequest } from 'node:http';
import sinon from 'sinon';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { ApplicationRuntime } from '../../../dist/application';
import { defineController, bindControllerFactory } from '../../../dist/http';
import { createControllerHost, type ControllerHostOptions } from '../../../dist/http/fastify/composition';
import { HttpTargetNamespace, automaticHeadTarget, nativeHttpTarget } from '../../../dist/http/fastify/targetNames';
import { composeRoutes } from '../../../dist/http/fastify/routes';
import { resolveExtensionsV2 } from '../../../dist/extensions';
import type { HttpHookContribution, HttpFallbackContribution, HttpRouteDeclaration } from '../../../dist/http';
import type { FastifyHost } from '../../../dist/http/fastify/FastifyHost';

const reg = <T>(declaration: T, provider = 'core') => ({ provider, declaration });
const noop = async () => undefined;
describe('FM-018 unified HTTP target names', function () {
  const hosts: FastifyHost[] = [];
  let created = 0;
  let prepared = 0;
  beforeEach(() => {
    created = 0;
    prepared = 0;
  });
  afterEach(async () => {
    sinon.restore();
    for (const host of hosts.splice(0)) await host.stop({ deadlineMs: 2000 });
  });
  async function fixture(options: Partial<ControllerHostOptions> = {}) {
    const factory = defineController({
      name: 'Names',
      actions: ['run'],
      create: () => {
        created++;
        return { run: async (_request: FastifyRequest, reply: FastifyReply) => reply.send('ok') };
      },
    });
    const host = await createControllerHost(new ApplicationRuntime({ config: {}, log: { warn() {} } }, []), {
      hostname: '127.0.0.1',
      port: 0,
      logger: () => {},
      controllers: [reg(factory)],
      bindings: [bindControllerFactory(factory, undefined)],
      routes: [
        reg({
          name: 'known',
          method: 'get',
          path: '/known',
          controller: 'Names',
          action: 'run',
          access: { kind: 'public' },
        }),
      ],
      routing: { policyNames: [] },
      security: {
        policies: {},
        csrf: {
          protect: noop,
          apiProtect: noop,
          token: async () => {
            throw new Error('unused');
          },
        },
        prepare: async () => {
          prepared++;
        },
      },
      ...options,
    });
    hosts.push(host);
    return host;
  }
  for (const root of ['', '/research/v6'])
    it(`rejects the synthetic OPTIONS fallback alias offline at ${root || '/'}`, async () => {
      const listen = sinon.spy(Server.prototype, 'listen');
      await assert.rejects(
        fixture({
          routing: { rootContext: root, policyNames: [] },
          fallbacks: [
            reg({
              name: 'portal.automatic-options',
              prefix: '/institution',
              controller: 'Names',
              action: 'run',
              access: { kind: 'public' },
            }),
          ],
          hooks: [
            reg({
              name: 'deny',
              stage: 'afterAuthentication',
              scope: { kind: 'routes', names: ['portal.automatic-options'] },
              run: async (_request, reply) => {
                reply.code(403).send('denied');
              },
            }),
          ],
        }),
        /reserved HTTP target name/
      );
      assert.equal(listen.callCount, 0);
    });
  const declared = (name: string): HttpRouteDeclaration => ({
    name,
    method: 'get',
    path: '/owned',
    controller: 'Names',
    action: 'run',
    access: { kind: 'public' },
  });
  const unmatched = (name: string): HttpFallbackContribution => ({
    name,
    prefix: '/institution',
    controller: 'Names',
    action: 'run',
    access: { kind: 'public' },
  });
  const scoped = (name: string, stage: HttpHookContribution['stage'] = 'beforeAction'): HttpHookContribution =>
    stage === 'onError' || stage === 'onResponse'
      ? { name: 'observer', stage, scope: { kind: 'routes', names: [name] }, observe: noop }
      : { name: 'request-stage', stage, scope: { kind: 'routes', names: [name] }, run: noop };
  const internal = [
    'portal.automatic-options',
    'portal.automatic-head',
    'portal.automatic-future',
    'redbox.internal.head',
    'redbox.internal.probe.healthz',
    'redbox.internal.probe.readyz',
    'redbox.internal.native.authentication',
    'redbox.internal.native.provider',
    'redbox.internal.static',
    'redbox.internal.asset',
    'redbox.internal.error',
    'redbox.internal.not-found',
    nativeHttpTarget('GET', '/user/info'),
    automaticHeadTarget('known', '/known'),
    'redbox.internal.future-owner',
    'Redbox.Internal.MixedCase',
    'PORTAL.AUTOMATIC-OPTIONS',
    'CORE-NATIVE-HTTP-future',
  ];
  for (const name of internal) {
    for (const kind of ['route', 'fallback', 'hook-name'] as const)
      it(`rejects reserved ${kind} ${name} offline for core and extension declarations`, async () => {
        const listen = sinon.spy(Server.prototype, 'listen');
        for (const provider of ['core', 'extension']) {
          const options =
            kind === 'route'
              ? { routes: [reg(declared(name), provider)] }
              : kind === 'fallback'
                ? { fallbacks: [reg(unmatched(name), provider)] }
                : {
                    hooks: [
                      reg(
                        { name, stage: 'beforeAction' as const, scope: { kind: 'application' as const }, run: noop },
                        provider
                      ),
                    ],
                  };
          await assert.rejects(fixture(options), /reserved HTTP target name/);
        }
        assert.equal(created, 0);
        assert.equal(prepared, 0);
        assert.equal(listen.callCount, 0);
      });
    for (const stage of ['afterAuthentication', 'beforeAction', 'onError', 'onResponse'] as const)
      it(`rejects internal hook target ${name} at ${stage} offline`, async () => {
        const listen = sinon.spy(Server.prototype, 'listen');
        await assert.rejects(fixture({ hooks: [reg(scoped(name, stage), 'extension')] }), /unresolved route scope/);
        assert.equal(created, 0);
        assert.equal(prepared, 0);
        assert.equal(listen.callCount, 0);
      });
  }
  it('reserves every catalog owner and detects duplicates in the single namespace', () => {
    const targets = new HttpTargetNamespace();
    for (const entry of targets.snapshot()) {
      assert.equal(entry.kind, 'internal');
      assert(!targets.hookTarget(entry.name));
      assert.throws(() => targets.declare('extension', entry.name, 'route'), /reserved HTTP target name/);
      assert.throws(() => targets.declare('extension', entry.name, 'fallback'), /reserved HTTP target name/);
      assert.throws(() => targets.internal(entry.name), /Duplicate internal HTTP target/);
    }
    targets.declare('core', 'owned', 'route');
    assert(targets.hookTarget('owned'));
    assert.throws(() => targets.declare('extension', 'owned', 'fallback'), /collides/);
    assert.throws(() => targets.declare('extension', 'owned', 'route'), /collides/);
  });
  it('checks reserved route replacements even when another provider would win', async () => {
    await assert.rejects(
      fixture({
        routes: [
          reg(declared('portal.automatic-options')),
          reg({ ...declared('portal.automatic-options'), replaces: true }, 'extension'),
        ],
      }),
      /reserved HTTP target name/
    );
  });
  it('checks reserved fallback replacements even when another provider would win', async () => {
    await assert.rejects(
      fixture({
        fallbacks: [
          reg(unmatched('portal.automatic-options')),
          reg({ ...unmatched('portal.automatic-options'), replaces: true }, 'extension'),
        ],
      }),
      /reserved HTTP target name/
    );
  });
  it('checks scoped targets in losing hook replacements', async () => {
    await assert.rejects(
      fixture({
        hooks: [reg(scoped('portal.automatic-options')), reg({ ...scoped('known'), replaces: true }, 'extension')],
      }),
      /unresolved route scope/
    );
  });
  it('records synthetic HEAD under an internal owner while retaining its declared hook target', async () => {
    const plan = await composeRoutes([reg(declared('read'))], { policyNames: [] });
    const head = plan.bindings.find(binding => binding.kind === 'implicit-head')!;
    assert(head);
    assert(plan.targets.snapshot().some(entry => entry.name === automaticHeadTarget('read', head.path.url)));
    assert(plan.targets.hookTarget('read'));
    assert(!plan.targets.hookTarget('portal.automatic-options'));
  });
  for (const kind of ['route', 'fallback', 'hook-target'] as const)
    it(`uses the same internal-name checks in API2 ${kind} resolution`, async () => {
      const factory = defineController({
        name: 'Names',
        actions: ['run'],
        create: () => {
          created++;
          return { run: async () => 'ok' };
        },
      });
      await assert.rejects(
        resolveExtensionsV2(
          [
            {
              name: 'extension',
              root: process.cwd(),
              declaration: {
                apiVersion: 2,
                controllers: [factory],
                ...(kind === 'route'
                  ? { routes: [declared('portal.automatic-options')] }
                  : kind === 'fallback'
                    ? { fallbacks: [unmatched('portal.automatic-options')] }
                    : { hooks: [scoped('portal.automatic-options')] }),
              },
            },
          ],
          {
            bindings: [bindControllerFactory(factory, undefined)],
            coreRoutes: [reg(declared('known'))],
            routing: { policyNames: [] },
          }
        ),
        kind === 'hook-target' ? /unresolved route scope/ : /reserved HTTP target name/
      );
      assert.equal(created, 0);
    });
  it('a public fallback scope stays inside its prefix and leaves both OPTIONS paths untouched', async () => {
    let calls = 0;
    const host = await fixture({
      fallbacks: [reg(unmatched('institution'))],
      hooks: [
        reg({
          name: 'deny-institution',
          stage: 'afterAuthentication',
          scope: { kind: 'routes', names: ['institution'] },
          run: async (_request, reply) => {
            calls++;
            reply.code(403).send('denied');
          },
        }),
      ],
    });
    await host.initialize();
    await host.activate();
    const exchange = (path: string, method: string) =>
      new Promise<number>((resolve, reject) => {
        const request = httpRequest(
          { hostname: '127.0.0.1', port: host.address()!.port, path, method, agent: false },
          response => {
            response.resume();
            response.on('end', () => resolve(response.statusCode!));
            response.on('error', reject);
          }
        );
        request.setTimeout(3000, () => request.destroy(new Error('Names HTTP deadline')));
        request.on('error', reject);
        request.end();
      });
    assert.equal(await exchange('/known', 'OPTIONS'), 200);
    assert.equal(await exchange('/elsewhere', 'OPTIONS'), 404);
    assert.equal(await exchange('/elsewhere', 'GET'), 404);
    assert.equal(calls, 0);
    assert.equal(await exchange('/institution', 'GET'), 403);
    assert.equal(calls, 1);
  });
});
