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

/** Offline identities of concrete portal routes, including implicit HEAD handling.
 * Static delivery and the final page fallback intentionally leave room for new routes.
 */
export function portalOwnedHttpRoutes(config: {
  readonly server: { readonly rootContext: string };
  readonly companion: { readonly enabled: boolean; readonly route: string };
}): readonly OwnedHttpRoute[] {
  const declarations = [
    ...ownedHttpDeclarations,
    ...authenticationRoutes,
    csrfTokenRoute,
    appConfigFormReadRoute,
    pageRootRoute,
    ...pageRoutes,
    ...formVocabularyRoutes,
    ...configuredActionRoutes,
    ...resumableUploadRoutes,
    ...progressOperationRoutes,
    progressSocketGrantRoute,
    ...brandingDeliveryRoutes,
    fontDeliveryRoute,
    ...dynamicAssetRoutes,
    ...(config.companion.enabled
      ? [config.companion.route, config.companion.route + '/{*companionPath}'].map(path => ({ method: 'all', path }))
      : []),
    ...(config.server.rootContext ? [] : ['/healthz', '/readyz'].map(path => ({ method: 'get', path }))),
  ];
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
