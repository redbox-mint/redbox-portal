import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from '../services/testHelper';
import {
  asScopeKey,
  freezeAuthorizationContext,
  scopeAuthorization,
  type AuthorizationContext,
} from '../../src/authorization';
import { Services as RolloutServices } from '../../src/services/AuthorizationRolloutService';

const REQUIRED_SCOPE = asScopeKey('record.read');

function enforceContext(): AuthorizationContext {
  return freezeAuthorizationContext({
    contextType: 'brand',
    principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'user-1' },
    brand: { requestedIdentifier: 'default', id: 'brand-1', name: 'default', exists: true, authorized: true },
    grantedScopeKeys: [REQUIRED_SCOPE],
    effectiveScopeKeys: [REQUIRED_SCOPE],
  });
}

function directRouteAllowed(scopeAllowed: boolean): boolean {
  const service = new RolloutServices.AuthorizationRolloutService({
    getMode: () => 'enforce',
    collectLegacyEvidenceInEnforce: () => false,
    authorizeScope: () =>
      Object.freeze({
        allowed: scopeAllowed,
        reasonCode: scopeAllowed ? 'allowed' : 'scope-missing',
        requiredScope: REQUIRED_SCOPE,
        brandId: 'brand-1',
      }),
    evaluateLegacy: () => true,
    persistMismatch: async () => undefined,
  });
  const result = service.evaluateRequest({
    req: { method: 'GET', path: '/default/portal/admin', headers: {}, query: {} } as Sails.Req,
    context: enforceContext(),
    authorization: scopeAuthorization(REQUIRED_SCOPE),
    routeId: 'GET /:branding/:portal/admin (AdminController#index)',
    requestId: 'parity-request',
  });
  assert.equal(result.enforcedBy, 'scope');
  return result.allowed;
}

describe('navigation/direct-route parity in enforce mode', function () {
  let mockSails: any;
  let NavigationService: any;

  beforeEach(function () {
    mockSails = createMockSails({
      config: {
        authorization: { mode: 'enforce' },
        appmode: {},
        brandingAware: sinon.stub().returns({
          menu: {
            items: [
              {
                id: 'scoped-entry',
                labelKey: 'scoped-entry',
                href: '/admin',
                requiresAuth: true,
                requiredScope: 'record.read',
              },
              {
                id: 'dual-gated',
                labelKey: 'dual-gated',
                href: '/admin/roles',
                requiresAuth: true,
                requiredRoles: ['Admin'],
                requiredScope: 'record.read',
              },
            ],
            showSearch: true,
          },
          homePanels: { panels: [] },
          adminSidebar: { sections: [] },
        }),
      },
      log: { verbose: sinon.stub(), debug: sinon.stub(), info: sinon.stub(), warn: sinon.stub(), error: sinon.stub() },
    });
    setupServiceTestGlobals(mockSails);
    (global as any).BrandingService = {
      getBrandNameFromReq: sinon.stub().returns('default'),
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
      getBrandAndPortalPath: sinon.stub().returns('/default/portal'),
    };
    (global as any).RolesService = { getRoleByName: sinon.stub().returns({ name: 'Admin' }) };
    (global as any).UsersService = { hasRole: sinon.stub().returns(true) };
    (global as any).TranslationService = { t: sinon.stub().callsFake((key: string) => key) };
    const { Services } = require('../../src/services/NavigationService');
    NavigationService = new Services.Navigation();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).BrandingService;
    delete (global as any).RolesService;
    delete (global as any).UsersService;
    delete (global as any).TranslationService;
    sinon.restore();
  });

  function configureScope(hasScope: boolean, roleAllowed = true): void {
    (mockSails.services as any).authorizationservice = { hasScope: sinon.stub().returns(hasScope) };
    (mockSails.services as any).authorizationscopeservice = { getRegistry: () => ({ isActive: () => true }) };
    (global as any).UsersService.hasRole = sinon.stub().returns(roleAllowed);
  }

  function menuReq(): Record<string, unknown> {
    return {
      isAuthenticated: sinon.stub().returns(true),
      user: { id: 'user-1' },
      path: '/dashboard',
      authorization: enforceContext(),
      authorizationRequestId: 'parity-request',
      params: { branding: 'default', portal: 'portal' },
    };
  }

  it('keeps requiredScope authoritative: scope denial hides navigation and denies the direct route', async function () {
    configureScope(false);
    const menu = await NavigationService.resolveMenu(menuReq());
    assert.equal(
      menu.items.some((item: { href: string }) => item.href.endsWith('/admin')),
      false
    );
    assert.equal(directRouteAllowed(false), false);
  });

  it('shows scope-only navigation exactly when the direct route allows', async function () {
    for (const scopeAllowed of [false, true]) {
      configureScope(scopeAllowed);
      const menu = await NavigationService.resolveMenu(menuReq());
      const visible = menu.items.some((item: { href: string }) => item.href === '/default/portal/admin');
      assert.equal(visible, scopeAllowed, `scope-only parity for ${scopeAllowed}`);
      assert.equal(visible, directRouteAllowed(scopeAllowed), `navigation matches direct route for ${scopeAllowed}`);
    }
  });

  it('keeps dual-gated navigation exactly equal to the direct route: scope is authoritative in enforce', async function () {
    // In enforce mode a declared requiredScope is authoritative; legacy
    // requiredRoles are shadow-only and never veto an allowed scope, so
    // dual-gated visibility must exactly equal scope-only direct-route
    // authorization for every role/scope combination. Direct-route
    // enforcement itself stays scope-only and is not weakened.
    for (const scopeAllowed of [false, true]) {
      for (const roleAllowed of [false, true]) {
        configureScope(scopeAllowed, roleAllowed);
        const menu = await NavigationService.resolveMenu(menuReq());
        const visible = menu.items.some((item: { href: string }) => item.href.endsWith('/admin/roles'));
        assert.equal(visible, scopeAllowed, `dual-gated parity for scope=${scopeAllowed} role=${roleAllowed}`);
        assert.equal(
          visible,
          directRouteAllowed(scopeAllowed),
          `navigation matches direct route for scope=${scopeAllowed} role=${roleAllowed}`
        );
      }
    }
  });
});
