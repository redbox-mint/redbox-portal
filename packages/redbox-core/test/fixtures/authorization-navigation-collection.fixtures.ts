import { freezeAuthorizationContext } from '../../src/authorization';
import { Services as Navigation } from '../../src/services/NavigationService';
import { Services as Rollout } from '../../src/services/AuthorizationRolloutService';

export const NAVIGATION_COLLECTION_SURFACES = ['menu', 'homePanels', 'adminSidebar'] as const;

/** Real navigation resolution through the exported serving-process collector. */
export function navigationCollectionFixture(rollout: Rollout.AuthorizationRolloutService, roleAllowed = true) {
  const saved = new Map(
    ['sails', 'BrandingService', 'RolesService', 'UsersService', 'TranslationService'].map(key => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  );
  const item = {
    id: 'collection-probe',
    labelKey: 'collection-probe',
    href: '/collection-probe',
    requiredRoles: ['Admin'],
    requiredScope: 'record.read',
  };
  const log = {
    error: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    verbose: () => undefined,
  };
  const runtime = {
    config: {
      authorization: { mode: 'shadow' },
      appmode: {},
      brandingAware: () => ({
        menu: { items: [item], showSearch: true },
        homePanels: { panels: [{ id: 'probe', titleKey: 'probe', iconClass: 'fa', items: [item] }] },
        adminSidebar: { sections: [{ id: 'probe', titleKey: 'probe', items: [item] }], footerLinks: [] },
      }),
    },
    services: {
      authorizationrolloutservice: rollout.exports(),
      authorizationservice: { hasScope: () => !roleAllowed },
      authorizationscopeservice: { getRegistry: () => ({ isActive: () => true }) },
    },
    log,
  };
  Reflect.set(globalThis, 'sails', runtime);
  Reflect.set(globalThis, 'BrandingService', {
    getBrandNameFromReq: () => 'default',
    getBrand: () => ({ id: 'b', name: 'default' }),
    getBrandAndPortalPath: () => '/default/portal',
  });
  Reflect.set(globalThis, 'RolesService', { getRoleByName: () => ({ name: 'Admin' }) });
  Reflect.set(globalThis, 'UsersService', { hasRole: () => roleAllowed });
  Reflect.set(globalThis, 'TranslationService', { t: (key: string) => key });
  const context = freezeAuthorizationContext({
    contextType: 'brand',
    principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'PRIVATE' },
    brand: { id: 'b', name: 'default', exists: true, authorized: true },
  });
  const req = {
    isAuthenticated: () => true,
    user: { id: 'PRIVATE' },
    path: '/collection-probe',
    headers: {},
    query: {},
    params: { branding: 'default', portal: 'portal' },
    authorization: context,
    authorizationRequestId: 'SECRET',
  } as unknown as Sails.Req;
  const navigation = new Navigation.Navigation();
  return {
    req,
    context,
    runtime,
    async visible(surface: (typeof NAVIGATION_COLLECTION_SURFACES)[number] = 'menu'): Promise<boolean> {
      const items =
        surface === 'menu'
          ? (await navigation.resolveMenu(req)).items
          : surface === 'homePanels'
            ? (await navigation.resolveHomePanels(req)).panels.flatMap(panel => panel.items)
            : (await navigation.resolveAdminSidebar(req)).sections.flatMap(section => section.items);
      return items.some(entry => entry.href === '/default/portal/collection-probe');
    },
    restore() {
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}
