import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import sinon from 'sinon';
import type { ExtensionResolutionV2Options, loadInstalledExtensionProvidersV2 } from '../../../src/extensions/v2';
import type { ControllerHostOptions } from '../../../src/http/fastify/composition';
import type { FastifyHostOptions } from '../../../src/http/fastify/FastifyHost';
import type { NativePolicyInput } from '../../../src/http/fastify/policies';
import type { NativeCsrfInput } from '../../../src/http/fastify/csrf';
import type { NativeParserOptions } from '../../../src/http/fastify/parsers';
import type { SafeHttpObservers } from '../../../src/http/fastify/responses';
import type { NativeAuthenticationRoutesInput } from '../../../src/http/fastify/authentication';
import type { prepareNativeAuthentication } from '../../../src/http/fastify/authentication';
import type { NativeIdentityProvidersInput } from '../../../src/http/fastify/identityProviders';
import type { apiRouteRegistrations, composeRoutes } from '../../../src/http/fastify/routes';
import type { composeHttpFallbacks } from '../../../src/http/fastify/fallbacks';
import type { composeHttpHooks } from '../../../src/http/fastify/hooks';
import type { composeControllers } from '../../../src/http/fastify/registration';
import type { HttpRouteRegistry, CoreNamespaceConfiguration } from '../../../src/http/fastify/registry';
import type { ResolvedPortalInstallation, PortalFastifySelection } from '../../../src/application/portal/installation';
import type { createPortalFastifyHost } from '../../../src/application/portal/host';
import { packed, fixture, login } from './pilotMongoFixture';

type Check = (value: unknown) => void;
const same =
  (expected: unknown): Check =>
  value =>
    assert.strictEqual(value, expected);
const equal =
  (expected: unknown): Check =>
  value =>
    assert.deepEqual(value, expected);
const callable: Check = value => assert.equal(typeof value, 'function');
/** Every accepted key has an assertion. Adding even an optional input to the
 * underlying API makes these tables fail tsc until its production selection is audited.
 */
function inputs<T>(actual: object, checks: Record<keyof T, Check>) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(checks).sort());
  for (const [key, check] of Object.entries<Check>(checks)) check(Reflect.get(actual, key));
}
export function productionCompositionInputCases() {
  it('supplies every production resolver/host/security input explicitly from the selected installation', async () => {
    const requireInstalled = createRequire(packed.directory + '/package.json');
    const module = (name: string) =>
      requireInstalled(packed.directory + '/node_modules/@researchdatabox/redbox-core/dist/' + name + '.js');
    const sandbox = sinon.createSandbox();
    const bootstrap = sandbox.spy(module('application/portal/application'), 'createPortalFastifyApplication');
    const productionHost = sandbox.spy(module('application/portal/host'), 'createPortalFastifyHost');
    const load = sandbox.spy(module('extensions/v2'), 'loadInstalledExtensionProvidersV2');
    const resolve = sandbox.spy(module('extensions/v2'), 'resolveExtensionsV2');
    const api = sandbox.spy(module('http/fastify/routes'), 'apiRouteRegistrations');
    const routes = sandbox.spy(module('http/fastify/routes'), 'composeRoutes');
    const controllers = sandbox.spy(module('http/fastify/registration'), 'composeControllers');
    const hooks = sandbox.spy(module('http/fastify/hooks'), 'composeHttpHooks');
    const fallbacks = sandbox.spy(module('http/fastify/fallbacks'), 'composeHttpFallbacks');
    const registry = sandbox.spy(module('http/fastify/registry'), 'HttpRouteRegistry');
    const host = sandbox.spy(module('http/fastify/composition'), 'createControllerHost');
    const transport = sandbox.spy(module('http/fastify/FastifyHost'), 'FastifyHost');
    const policies = sandbox.spy(module('http/fastify/policies'), 'createNativePolicies');
    const bindSecurity = sandbox.spy(module('http/fastify/policies'), 'bindNativeRouteSecurity');
    const csrf = sandbox.spy(module('http/fastify/csrf'), 'createNativeCsrf');
    const parsers = sandbox.spy(module('http/fastify/parsers'), 'prepareNativeParsers');
    const errors = sandbox.spy(module('http/fastify/responses'), 'installSafeHttpErrors');
    const sessions = sandbox.spy(module('http/fastify/session'), 'prepareNativeSessions');
    const authentication = sandbox.spy(module('http/fastify/authentication'), 'prepareNativeAuthentication');
    const providers = sandbox.spy(module('http/fastify/identityProviders'), 'prepareNativeIdentityProviders');
    const loginRoutes = sandbox.spy(module('http/fastify/authentication'), 'installNativeAuthenticationRoutes');
    try {
      const f = await fixture(true, {
        policyConfiguration: { '*': true, ProbeController: { read: false } },
        server: {
          rootContext: '/composition',
          trustProxy: true,
          stopDeadlineMs: 23456,
          publicUrl: 'https://selected.example.invalid',
        },
        session: { name: 'composition.sid', collection: 'compositionSessions' },
        portals: ['rdmp', 'research'],
        auth: {
          loginPath: 'selected-login',
          postLogoutRedir: '/selected-logout',
          logoutOrigins: ['https://logout.example.invalid'],
        },
        companion: { enabled: false, route: '/selected-companion', server: { path: '/selected-companion-server' } },
      });
      try {
        assert('portal' in f);
        const selected = bootstrap.firstCall.args[0];
        const resolved = f.nativePlan!.resolved;
        const configuration = f.portal.config;
        const resolver = resolve.firstCall.args[1];
        const resolution = await resolve.firstCall.returnValue;
        const composed = host.firstCall.args[1];
        const security = composed.security;
        for (const spy of [
          bootstrap,
          productionHost,
          load,
          resolve,
          routes,
          controllers,
          hooks,
          fallbacks,
          registry,
          host,
          transport,
          policies,
          bindSecurity,
          csrf,
          parsers,
          errors,
          sessions,
          authentication,
          providers,
          loginRoutes,
        ])
          assert.equal(spy.callCount, 1);
        assert.strictEqual(load.firstCall.args[0], packed.application);
        inputs<NonNullable<Parameters<typeof loadInstalledExtensionProvidersV2>[1]>>(load.firstCall.args[1], {
          includeDevDependencies: same(false),
          core: same(undefined),
        });
        assert.strictEqual(resolved.policyConfiguration, selected.http.policyConfiguration);
        const prepared = productionHost.firstCall.args[1];
        inputs<PortalFastifySelection>(selected.http, {
          declarations: same(selected.http.declarations),
          policyConfiguration: same(resolved.policyConfiguration),
          portals: equal(resolved.portals),
          bindings: callable,
        });
        inputs<Parameters<typeof createPortalFastifyHost>[1]>(prepared, {
          authentication: callable,
          login: same(prepared.login),
          policies: same(prepared.policies),
          prepare: same(undefined),
        });
        assert.deepEqual(resolved.hookLoadPriority, ['a-replacement']);
        assert.deepEqual(
          resolved.providers.map(p => p.name),
          ['core', 'fm019-api2-pilot', 'z-base', 'a-replacement']
        );
        assert.strictEqual(resolve.firstCall.args[0][1], (await load.firstCall.returnValue).providers[0]);
        inputs<ResolvedPortalInstallation>(resolved, {
          providers: same(resolution.providers),
          modules: same(resolution.modules),
          moduleNames: same(resolution.moduleNames),
          migrations: same(resolution.migrations),
          bootstrap: same(resolution.bootstrap),
          views: same(resolution.views),
          assets: same(resolution.assets),
          controllerRegistrations: same(resolution.controllerRegistrations),
          routeRegistrations: same(resolution.routeRegistrations),
          hookRegistrations: same(resolution.hookRegistrations),
          fallbackRegistrations: same(resolution.fallbackRegistrations),
          controllerPlan: same(resolution.controllerPlan),
          routePlan: same(resolution.routePlan),
          hookPlan: same(resolution.hookPlan),
          fallbackPlan: same(resolution.fallbackPlan),
          registry: same(resolution.registry),
          bindings: same(resolver.bindings),
          routing: same(resolver.routing),
          policyConfiguration: same(resolver.apiConfiguration),
          portals: equal(selected.http.portals),
          hookLoadPriority: equal(resolver.hookLoadPriority),
          fallbackReservedPrefixes: same(resolver.fallbackReservedPrefixes),
          namespaceConfiguration: same(resolver.namespaceConfiguration),
          scope: equal({
            included: resolver.coreRoutes.map((route: object) => Reflect.get(route, 'declaration').name),
            excluded: 'All other core families, including the unresolved FM-034 TUS GET/fallthrough splits',
          }),
        });
        inputs<ExtensionResolutionV2Options>(resolver, {
          hookLoadPriority: equal(resolved.hookLoadPriority),
          bindings: same(resolved.bindings),
          routing: same(resolved.routing),
          coreRoutes: equal(
            api.firstCall.returnValue.map((route: object) => ({
              ...route,
              effectiveCsrf: Reflect.get(route, 'declaration').api.action === 'updateMeta' ? 'apiProtect' : 'none',
            }))
          ),
          apiConfiguration: same(selected.http.policyConfiguration),
          fallbackReservedPrefixes: same(resolved.fallbackReservedPrefixes),
          namespaceConfiguration: same(resolved.namespaceConfiguration),
        });
        inputs<NonNullable<Parameters<typeof apiRouteRegistrations>[0]>>(api.firstCall.args[0], {
          declarations: same(selected.http.declarations),
          configuration: same(selected.http.policyConfiguration),
          provider: same('@researchdatabox/redbox-core'),
        });
        // Every installed API must use the same selected configuration as core.
        for (const call of api.getCalls().slice(1)) {
          inputs<NonNullable<Parameters<typeof apiRouteRegistrations>[0]>>(call.args[0], {
            declarations: equal([call.returnValue[0].declaration.api]),
            configuration: same(selected.http.policyConfiguration),
            provider: same('fm019-api2-pilot'),
          });
        }
        assert.strictEqual(routes.firstCall.args[0], resolved.routeRegistrations);
        inputs<Parameters<typeof composeRoutes>[1]>(routes.firstCall.args[1], {
          rootContext: same(configuration.server.rootContext),
          policyNames: same(module('http/fastify/policies').nativePolicyNames),
          legacyOrder: same(true),
          precedence: equal(
            module('http/fastify/precedence').coreRoutePrecedence.filter(
              (entry: { winner: string; over: string }) =>
                resolver.coreRoutes.some((route: object) => Reflect.get(route, 'declaration').name === entry.winner) &&
                resolver.coreRoutes.some((route: object) => Reflect.get(route, 'declaration').name === entry.over)
            )
          ),
        });
        const routePlan = await routes.firstCall.returnValue;
        const fallbackPlan = fallbacks.firstCall.returnValue;
        assert.strictEqual(resolved.routePlan, routePlan);
        assert.strictEqual(resolved.fallbackPlan, fallbackPlan);
        assert.deepEqual(bindSecurity.firstCall.args, [
          { routes: [...routePlan.routes, ...fallbackPlan.routes] },
          policies.firstCall.returnValue,
          csrf.firstCall.returnValue,
        ]);
        assert.strictEqual(bindSecurity.firstCall.args[1], policies.firstCall.returnValue);
        assert.strictEqual(bindSecurity.firstCall.args[2], csrf.firstCall.returnValue);
        const controllerArguments: Required<Parameters<typeof composeControllers>> = [
          resolved.controllerRegistrations,
          resolved.bindings,
          [...routePlan.routes, ...fallbackPlan.routes].map(route => route.declaration),
          resolved.moduleNames,
        ];
        assert.deepEqual(controllers.firstCall.args, controllerArguments);
        for (const index of [0, 1, 3])
          assert.strictEqual(controllers.firstCall.args[index], controllerArguments[index]);
        assert(resolved.moduleNames.includes('PilotModule'));
        const hookArguments: Required<Parameters<typeof composeHttpHooks>> = [
          resolved.hookRegistrations,
          routePlan.targets,
        ];
        assert.deepEqual(hooks.firstCall.args, hookArguments);
        for (const index of [0, 1]) assert.strictEqual(hooks.firstCall.args[index], hookArguments[index]);
        const fallbackArguments: Required<Parameters<typeof composeHttpFallbacks>> = [
          resolved.fallbackRegistrations,
          routePlan,
          resolver.routing,
          resolved.registry,
        ];
        assert.deepEqual(fallbacks.firstCall.args, fallbackArguments);
        assert.strictEqual(fallbacks.firstCall.args[0], resolved.fallbackRegistrations);
        assert.strictEqual(fallbacks.firstCall.args[1], routePlan);
        // The shared routing selection also supplies every fallback composition input.
        for (const key of Object.keys({ policyNames: true, rootContext: true } satisfies Record<
          keyof Parameters<typeof composeHttpFallbacks>[2],
          boolean
        >))
          assert.strictEqual(Reflect.get(fallbacks.firstCall.args[2], key), resolver.routing[key]);
        assert.strictEqual(fallbacks.firstCall.args[3], resolved.registry);
        const registryArguments: Required<ConstructorParameters<typeof HttpRouteRegistry>> = [
          configuration.server.rootContext,
          resolved.fallbackReservedPrefixes,
          resolved.namespaceConfiguration,
          routePlan.targets,
        ];
        assert.deepEqual(registry.firstCall.args, registryArguments);
        for (const index of [1, 2, 3]) assert.strictEqual(registry.firstCall.args[index], registryArguments[index]);
        assert.deepEqual(resolved.namespaceConfiguration, {
          companion: { route: '/selected-companion', server: { path: '/selected-companion-server' } },
        });
        inputs<CoreNamespaceConfiguration>(resolved.namespaceConfiguration, {
          companion: equal({ route: '/selected-companion', server: { path: '/selected-companion-server' } }),
        });
        for (const path of ['/selected-companion', '/selected-companion-server']) {
          assert(resolved.fallbackReservedPrefixes.includes(path));
          assert(resolved.registry.namespaces().some(entry => entry.path === '/composition' + path));
        }
        inputs<ControllerHostOptions>(composed, {
          hostname: same(configuration.server.hostname),
          port: same(configuration.server.port),
          stopDeadlineMs: same(configuration.server.stopDeadlineMs),
          trustProxy: same(configuration.server.trustProxy),
          owner: same(f.owner),
          routeRegistry: same(resolved.registry),
          logger: same(transport.firstCall.args[1].logger),
          composition: same(resolved),
          controllers: same(resolved.controllerRegistrations),
          bindings: same(resolved.bindings),
          moduleNames: same(resolved.moduleNames),
          routes: same(resolved.routeRegistrations),
          hooks: same(resolved.hookRegistrations),
          fallbacks: same(resolved.fallbackRegistrations),
          fallbackReservedPrefixes: same(resolved.fallbackReservedPrefixes),
          namespaceConfiguration: same(resolved.namespaceConfiguration),
          routing: same(resolved.routing),
          guards: callable,
          security: same(security),
        });
        inputs<FastifyHostOptions>(transport.firstCall.args[1], {
          hostname: same(configuration.server.hostname),
          port: same(configuration.server.port),
          stopDeadlineMs: same(configuration.server.stopDeadlineMs),
          trustProxy: same(configuration.server.trustProxy),
          owner: same(f.owner),
          routeRegistry: same(resolved.registry),
          logger: same(composed.logger),
          prepare: callable,
        });
        inputs<NonNullable<ControllerHostOptions['security']>>(security, {
          policies: same(policies.firstCall.returnValue),
          csrf: same(csrf.firstCall.returnValue),
          observers: same(errors.firstCall.args[1]),
          resolveContext: same(undefined),
          parsers: same(parsers.firstCall.args[1]),
          prepare: callable,
        });
        inputs<NativeParserOptions>(security.parsers, { parserExclusions: equal([]) });
        inputs<SafeHttpObservers>(security.observers, { observe: same(undefined), log: same(undefined) });
        inputs<NativePolicyInput>(policies.firstCall.args[0], {
          branding: same(f.branding),
          pathRules: same(f.portal.data.reference.pathRules),
          portals: equal(['rdmp', 'research']),
          defaultUnauthenticatedRole: same(prepared.policies.defaultUnauthenticatedRole),
          authenticate: callable,
          emitRequestFailure: same(prepared.policies.emitRequestFailure),
          rootContext: same(configuration.server.rootContext),
          loginPath: same(configuration.auth.loginPath),
        });
        inputs<NativeCsrfInput>(csrf.firstCall.args[0], {
          origins: equal([new URL(configuration.server.publicUrl).origin]),
          authenticateBearer: callable,
        });
        assert.strictEqual(sessions.firstCall.args[1], f.owner);
        assert.strictEqual(sessions.firstCall.args[2], configuration.redboxSession);
        assert.strictEqual(authentication.firstCall.args[1].identity, f.identity);
        inputs<Parameters<typeof prepareNativeAuthentication>[1]>(authentication.firstCall.args[1], {
          identity: same(f.identity),
          accounts: same(f.accounts),
          config: same(authentication.firstCall.args[1].config),
          brand: same(authentication.firstCall.args[1].brand),
        });
        const providerInputs = { accounts: true, config: true, brand: true } satisfies Record<
          keyof NativeIdentityProvidersInput,
          boolean
        >;
        for (const key of Object.keys(providerInputs))
          assert.strictEqual(providers.firstCall.args[0][key], authentication.firstCall.args[1][key]);
        const loginInput = loginRoutes.firstCall.args[2];
        inputs<NativeAuthenticationRoutesInput>(loginInput, {
          identity: same(f.identity),
          rootContext: same(configuration.server.rootContext),
          defaultBrand: same(configuration.auth.defaultBrand),
          defaultPortal: same(configuration.auth.defaultPortal),
          validContext: same(prepared.login.validContext),
          brandId: same(prepared.login.brandId),
          postLoginPath: same(prepared.login.postLoginPath),
          postLogoutPath: same(configuration.auth.postLogoutRedir),
          logoutOrigins: same(configuration.auth.logoutOrigins),
          credentialFields: equal(['username', 'password']),
          sessionCookie: equal({ name: configuration.redboxSession.name, ...configuration.redboxSession.cookie }),
          csrf: same(csrf.firstCall.returnValue.protect),
          audit: same(prepared.login.audit),
          loginFailure: same(prepared.login.loginFailure),
          renderAuthenticationFailure: same(undefined),
        });
        // Actual requests prove that the audited plans, modules, hooks and policies
        // are installed, rather than merely being passed to an unused function.
        const auth = await login(f, true);
        const response = await fetch(f.url + '/default/rdmp/institution/publish', {
          method: 'POST',
          headers: { Cookie: auth.cookie, 'X-CSRF-Token': auth.token, 'Content-Type': 'application/json' },
          body: '{"title":"selected"}',
        });
        assert.equal(response.status, 200, await response.text());
        assert.equal(response.headers.get('x-pilot-guarded'), 'true');
        const denied = await fetch(f.url + '/installed-probe');
        assert.equal(denied.status, 403);
        assert.equal(denied.headers.get('x-installation-hook'), null);
        await denied.text();
        const fallback = await fetch(f.url + '/installed-fallback/child');
        assert.equal(fallback.status, 200);
        assert.equal(fallback.headers.get('x-installation-hook'), 'selected');
        assert.deepEqual(await fallback.json(), { reached: true });
      } finally {
        await f.close();
      }
    } finally {
      sandbox.restore();
    }
  });
}
