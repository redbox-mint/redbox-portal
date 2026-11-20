import { registerCoreApiRoutes } from '../api-routes/route-registry';
import { referenceReadDeclarations, appConfigFormReadRoute } from './referenceRoutes';
import { authenticationRoutes } from './authenticationRoutes';
import { pageRoutes } from './pageRoutes';
import { formVocabularyRoutes } from './integrationRoutes';
import { configuredActionRoutes } from './mutationRoutes';
import { resumableUploadRoutes } from './uploadRoutes';
import { addDataStreamsRoute } from '../api-routes/groups/records';
const datastreamWriteRoutes = [addDataStreamsRoute];
const csrfTokenRoute = { method: 'get', path: '/csrfToken' };
import { progressOperationRoutes, progressSocketGrantRoute } from './progressRoutes';
import { brandingDeliveryRoutes, fontDeliveryRoute, dynamicAssetRoutes } from './assetRoutes';
import { datastreamReadRoutes } from './datastreamRoutes';
import { recordQueryReadDeclarations } from './readRoutes';
import { mutationDeclarations } from './mutationRoutes';
import { identityAdministrationDeclarations } from './identityRoutes';
import { integrationDeclarations } from './integrationRoutes';
const pageRootRoute = { method: 'all', path: '/' };
// Deduplicate API declarations that also participate in a browser family.
const ownedHttpDeclarations = [
  ...new Map(
    [
      ...registerCoreApiRoutes(),
      ...referenceReadDeclarations,
      ...recordQueryReadDeclarations,
      ...mutationDeclarations,
      ...identityAdministrationDeclarations,
      ...integrationDeclarations,
      ...datastreamReadRoutes,
      ...datastreamWriteRoutes,
    ].map(route => [route.method + ' ' + route.path, route])
  ).values(),
];
export interface DeclaredHttpOwner {
  readonly method: string;
  readonly path: string;
  readonly controller?: string;
  readonly action?: string;
  readonly policy?: import('../api-routes/types').ApiRouteDefinition['policy'];
}
export interface HttpOwnerDeclaration {
  readonly route: DeclaredHttpOwner;
  readonly csrf: 'none' | 'apiProtect';
  readonly actorRequired: boolean;
  readonly headFallsThrough?: boolean;
  readonly implicitHead?: false;
  readonly rawTarget?: boolean;
  /** A prepared raw integration owns dispatch outside the native router. */
  readonly selected?: boolean;
  /** Raw protocol owners enforce their canonical Origin before protocol dispatch. */
  readonly canonicalOrigin?: string;
}
type OwnershipConfiguration = {
  readonly server: { readonly rootContext: string };
  readonly companion: { readonly enabled: boolean; readonly route: string };
};

/** Concrete declarations used by both extension reservation and the native
 * pre-static boundary. Protocol implementations may remain unselected. */
export function portalHttpOwnerDeclarations(
  config: OwnershipConfiguration,
  protocols: readonly HttpOwnerDeclaration[] = []
): readonly HttpOwnerDeclaration[] {
  const owner = (
    route: DeclaredHttpOwner,
    csrf: HttpOwnerDeclaration['csrf'] = 'none',
    actorRequired = false
  ): HttpOwnerDeclaration => ({ route, csrf, actorRequired });
  return [
    ...ownedHttpDeclarations.map(route => ({
      ...owner(
        route,
        datastreamWriteRoutes.some(item => item === route) ? 'apiProtect' : 'none',
        [...datastreamReadRoutes, ...datastreamWriteRoutes].some(item => item === route)
      ),
      // These GET handlers explicitly continue to the following TUS ALL owner
      // on HEAD, after their policy chain. Keep both boundaries in the table.
      headFallsThrough: 'headBehavior' in route && route.headBehavior === 'fallthrough',
    })),
    ...authenticationRoutes.map(route => owner(route)),
    owner(csrfTokenRoute),
    owner(appConfigFormReadRoute),
    owner(pageRootRoute),
    ...pageRoutes.map(route => owner(route)),
    ...formVocabularyRoutes.map(route => owner(route)),
    ...configuredActionRoutes.map(route => owner(route)),
    ...resumableUploadRoutes.map(route => owner(route, 'apiProtect', true)),
    ...progressOperationRoutes.map(route => owner(route, route.method === 'get' ? 'none' : 'apiProtect', true)),
    owner(progressSocketGrantRoute, 'apiProtect', true),
    ...brandingDeliveryRoutes.map(route => owner(route)),
    owner(fontDeliveryRoute),
    ...dynamicAssetRoutes.map(route => owner(route)),
    ...protocols,
    ...(config.companion.enabled
      ? [config.companion.route, config.companion.route + '/*companionPath'].map(path => owner({ method: 'all', path }))
      : []),
    ...(config.server.rootContext
      ? []
      : ['/healthz', '/readyz'].map(path => ({ ...owner({ method: 'get', path }), implicitHead: false as const }))),
  ];
}
