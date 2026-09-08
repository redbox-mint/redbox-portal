import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';

import { buildCoreApiOpenApiDocument, buildCoreApiRouteConfig, registerCoreApiRoutes } from '../../src/api-routes';
import { apiRoute } from '../../src/api-routes/route-factory';
import {
  asScopeKey,
  createCoreAuthorizationScopeSource,
  createScopeRegistry,
  publicAuthorization,
  requireRequestAuthorizationContext,
  validateRouteAuthorizations,
} from '../../src/authorization';
import { routes } from '../../src/config/routes.config';
import { policies } from '../../src/config/policies.config';

const registry = createScopeRegistry([createCoreAuthorizationScopeSource('test')]);

describe('route authorization metadata', function () {
  it('classifies every core contract and Sails route with a unique stable route identity', function () {
    const contractRoutes = registerCoreApiRoutes();
    const runtimeRoutes = Object.values(routes);

    assert.doesNotThrow(() => validateRouteAuthorizations(contractRoutes, registry, 'core contracts'));
    assert.equal(
      runtimeRoutes.every(route => route.authorization !== undefined),
      true
    );
    assert.equal(
      runtimeRoutes.every(route => route.routeId.length > 0),
      true
    );
    assert.equal(new Set(runtimeRoutes.map(route => route.routeId)).size, runtimeRoutes.length);
    assert.equal(routes['get /user/info'].authorization.kind, 'scope');
    assert.equal(routes['get /:branding/:portal/user/info'].authorization.kind, 'scope');
    assert.equal(Object.hasOwn(routes, '/:branding/:portal/images/logo'), false);
    assert.equal(routes['get /:branding/:portal/images/logo'].authorization.kind, 'public');
    assert.equal(routes['HEAD /user/begin_oidc'].policy, 'disallowedHeadRequestHandler');
  });

  it('preserves the same declaration and route identity in generated Sails targets', function () {
    const route = registerCoreApiRoutes().find(
      candidate => candidate.controller === 'webservice/UserManagementController' && candidate.action === 'listUsers'
    );
    assert.ok(route);
    const target = buildCoreApiRouteConfig()[`${route.method} ${route.path}`] as Record<string, unknown>;

    assert.deepEqual(target.authorization, route.authorization);
    assert.equal(target.routeId, route.routeId);
  });

  it('rejects invalid supplied credentials on pre-auth, public, and authenticated-info policy exceptions', function () {
    const userPolicies = policies.UserController as Record<string, string[]>;
    const translationPolicies = policies.TranslationController as Record<string, string[]>;

    for (const action of ['localLogin', 'aafLogin', 'openidConnectLogin', 'beginOidc']) {
      assert.equal(userPolicies[action].includes('isWebServiceAuthenticated'), true, action);
    }
    assert.equal(translationPolicies.getNamespace.includes('isWebServiceAuthenticated'), true);
    assert.deepEqual(userPolicies.info.slice(-4), [
      'menuResolver',
      'authorizeRequest',
      'isAuthenticated',
      'contentSecurityPolicy',
    ]);
  });

  it('resolves navigation from the fresh authoritative authorization context', function () {
    // menuResolver must run after authentication and context resolution so
    // NavigationService.buildResolutionContext observes req.authorization.
    const chains: Array<[string, string[]]> = [
      ['*', policies['*'] as string[]],
      ['UserController.*', (policies.UserController as Record<string, string[]>)['*']],
      ['RenderViewController.render', (policies.RenderViewController as Record<string, string[]>)['render']],
      ['RecordController.*', (policies.RecordController as Record<string, string[]>)['*']],
    ];
    for (const [label, chain] of chains) {
      const authIndex = chain.indexOf('isWebServiceAuthenticated');
      const contextIndex = chain.indexOf('resolveAuthorizationContext');
      const menuIndex = chain.indexOf('menuResolver');
      const authorizeIndex = chain.indexOf('authorizeRequest');
      assert.ok(authIndex >= 0 && contextIndex >= 0 && menuIndex >= 0 && authorizeIndex >= 0, label);
      assert.ok(authIndex < contextIndex, `${label}: authentication before context resolution`);
      assert.ok(contextIndex < menuIndex, `${label}: navigation uses fresh authorization context`);
      assert.ok(contextIndex < authorizeIndex, `${label}: route decision uses fresh authorization context`);
    }
  });

  it('emits scope and compatibility metadata and describes the bearer as opaque', function () {
    this.timeout(30_000);
    const document = buildCoreApiOpenApiDocument();
    const operation = document.paths['/{branding}/{portal}/api/users']?.get as Record<string, unknown>;

    assert.equal(operation['x-redbox-scope'], 'user.read');
    assert.equal(operation['x-redbox-roles-deprecated'], true);
    assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
    assert.equal(document.components.securitySchemes.bearerAuth.bearerFormat, 'Opaque legacy bearer token');
    assert.match(document.info.description ?? '', /explicit runtime authorization targets/u);
    assert.match(document.info.description ?? '', /fail-closed/u);
    assert.ok((operation.responses as Record<string, unknown>)['401']);
    assert.ok((operation.responses as Record<string, unknown>)['403']);
  });

  it('requires hook routes to declare authorization and emits no security for public contracts', function () {
    assert.throws(
      () => apiRoute('get', '/:branding/:portal/api/hook/widgets', 'hook/WidgetController', 'list'),
      /must declare authorization metadata/u
    );

    const publicRoute = apiRoute(
      'get',
      '/:branding/:portal/api/hook/metadata',
      'hook/MetadataController',
      'show',
      undefined,
      { authorization: publicAuthorization('Published hook metadata.') }
    );
    assert.deepEqual(publicRoute.security, []);

    const unknownScopeRoute = {
      ...publicRoute,
      authorization: { kind: 'scope' as const, scope: asScopeKey('hook-example.read') },
    };
    assert.throws(
      () => validateRouteAuthorizations([unknownScopeRoute], registry, 'hook route'),
      /Unknown authorization scope hook-example\.read/u
    );

    const mergedRegistry = createScopeRegistry([
      createCoreAuthorizationScopeSource('test'),
      {
        sourceType: 'hook',
        sourcePackage: 'redbox-hook-example',
        sourceVersion: '1.0.0',
        definitions: [
          {
            key: asScopeKey('example.read'),
            label: 'Read example data',
            description: 'Read data owned by the example hook.',
            risk: 'read',
          },
        ],
      },
    ]);
    const declaredHookRoute = {
      ...publicRoute,
      authorization: { kind: 'scope' as const, scope: asScopeKey('example.read') },
    };
    assert.doesNotThrow(() => validateRouteAuthorizations([declaredHookRoute], mergedRegistry, 'merged hook route'));
  });

  it('provides a fail-closed controller context seam behind a pure request-context contract', function () {
    const context = requireRequestAuthorizationContext({
      authorization: {
        contextType: 'brand',
        principal: { category: 'authenticated', authMethod: 'session', active: true },
        roles: [],
        compatibilityRoles: [],
        roleKeys: [],
        grantedScopeKeys: [],
        effectiveScopeKeys: [],
        scopeProvenance: [],
        resolutionEvidence: {
          expiredAssignmentIds: [],
          ignoredAssignmentIds: [],
          inactiveRoleIds: [],
          ignoredRoleIds: [],
          missingTemplateRevisionRoleIds: [],
          inactiveScopeKeys: [],
          missingScopeKeys: [],
          rejectedScopeKeys: [],
        },
      },
    });
    assert.equal(context.contextType, 'brand');

    assert.throws(
      () => requireRequestAuthorizationContext({ authorization: undefined }),
      /did not pass authorization context resolution/u
    );
    assert.throws(() => requireRequestAuthorizationContext({}), /did not pass authorization context resolution/u);

    // A Sails request remains structurally compatible without the pure module
    // importing the ambient Sails type.
    const sailsShaped = { authorization: context } as unknown as { authorization?: typeof context };
    assert.equal(requireRequestAuthorizationContext(sailsShaped), context);
  });
});
