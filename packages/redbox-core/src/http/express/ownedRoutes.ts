import { createHash } from 'node:crypto';
import { canonicalHttpRoutePath, type OwnedHttpRoute } from '../../extensions/resolution';
import { ownedHttpDeclarations } from './apiManifest';
import { authenticationRoutes } from './login';
import { csrfTokenRoute } from './csrf';
import { appConfigFormReadRoute } from './configuration';
import { pageRoutes, pageRootRoute } from './pages';
import { formVocabularyRoutes } from './formVocabulary';
import { configuredActionRoutes } from './configuredActions';
import { resumableUploadRoutes } from './resumableUploads';
import { progressOperationRoutes, progressSocketGrantRoute } from './progressOperations';
import { brandingDeliveryRoutes, fontDeliveryRoute, dynamicAssetRoutes } from './pageAssets';
import { datastreamReadRoutes } from './datastreamReads';
import { datastreamWriteRoutes } from './datastreamWrites';

export interface DeclaredHttpOwner {
  readonly method: string;
  readonly path: string;
  readonly controller?: string;
  readonly action?: string;
  readonly policy?: import('../../api-routes/types').ApiRouteDefinition['policy'];
}
export interface HttpOwnerDeclaration {
  readonly route: DeclaredHttpOwner;
  readonly csrf: 'none' | 'apiProtect';
  readonly actorRequired: boolean;
  readonly headFallsThrough?: boolean;
  readonly implicitHead?: false;
  readonly rawTarget?: boolean;
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
      ? [config.companion.route, config.companion.route + '/{*companionPath}'].map(path =>
          owner({ method: 'all', path })
        )
      : []),
    ...(config.server.rootContext
      ? []
      : ['/healthz', '/readyz'].map(path => ({ ...owner({ method: 'get', path }), implicitHead: false as const }))),
  ];
}

/** Offline identities of concrete portal routes, including implicit HEAD handling.
 * Static delivery and the final page fallback intentionally leave room for new routes.
 */
export function portalOwnedHttpRoutes(config: OwnershipConfiguration): readonly OwnedHttpRoute[] {
  const declarations = portalHttpOwnerDeclarations(config).map(owner => owner.route);
  const routes = new Map<string, OwnedHttpRoute>();
  for (const route of declarations) {
    // The API reference retains these legacy spellings; use the paths mounted by the host.
    const path = route.path.replace(':key*', '*key').replace('datastream*', 'datastream{*tail}');
    const pattern = canonicalHttpRoutePath(path);
    const methods =
      route.method === 'all'
        ? ['get', 'head', 'post', 'put', 'patch', 'delete', 'options']
        : route.method === 'get'
          ? ['get', 'head']
          : [route.method];
    for (const method of methods) {
      const key = method + ' ' + pattern;
      routes.set(key, {
        name: `core-http-${method}-${createHash('sha256').update(pattern).digest('hex').slice(0, 16)}`,
        method,
        path,
      });
    }
  }
  return [...routes.values()];
}
