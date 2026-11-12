import type { ApiRouteDefinition } from '../api-routes/types';
import type { BrandingOperationsInput } from './actions/brandingOperations';
import type { ReferenceRequest, ReferenceResult } from './actions/reference';
import type { RequestPreparation } from './actions/requestPreparation';
import { brandingPreviewPreparation, brandingOperationFailure } from './actions/brandingOperations';
import { optionalSyncBodyPreparation, vocabularyIntegrationFailure } from './actions/vocabularyIntegrations';
import { vocabularyApiRoutes } from '../api-routes/groups/vocabulary';
import { importVocabularyRoute, syncVocabularyRoute } from '../api-routes/groups/vocabulary';
import { brandingApiRoutes, brandingPreviewRoute } from '../api-routes/groups/branding';
import { figshareCrosswalkApiRoutes } from '../api-routes/groups/figshare-crosswalks';
import { figshareVocabularyApiRoutes } from '../api-routes/groups/figshare-vocabulary';
import { indexRecordRoute, indexAllRecordsRoute, removeAllIndexedRoute } from '../api-routes/groups/search';
import { sendNotificationRoute } from '../api-routes/groups/notifications';
const apiRoutes = vocabularyApiRoutes.filter(r => !['import', 'sync'].includes(r.action));
export const vocabularyAdministrationRoutes = [
  ...apiRoutes,
  ...apiRoutes
    .filter(r => r.action !== 'reorder')
    .map(r => ({ ...r, path: r.path.replace('/api/', '/admin/'), controller: 'VocabularyController' })),
];

export const vocabularyIntegrationRoutes = [
  importVocabularyRoute,
  syncVocabularyRoute,
  ...[importVocabularyRoute, syncVocabularyRoute].map(route => ({
    ...route,
    path: route.path.replace('/api/', '/admin/'),
    controller: 'VocabularyController',
    ...(route === syncVocabularyRoute
      ? { preparation: { request: optionalSyncBodyPreparation, failure: vocabularyIntegrationFailure } }
      : {}),
  })),
];

const api = brandingApiRoutes.filter(r => !['uploadFace', 'logo', 'favicon'].includes(r.action));
export const brandingOperationRoutes = [
  ...api,
  ...api
    .filter(r => r.action !== 'history')
    .map(r => ({
      ...r,
      path: r.path.replace('/api/branding/', '/app/branding/'),
      controller: 'BrandingAppController',
    })),
  {
    ...brandingPreviewRoute,
    path: '/:branding/:portal/preview',
    controller: 'BrandingController',
    action: 'createPreview',
    preparation: { request: brandingPreviewPreparation, failure: brandingOperationFailure },
  },
];

export const figshareAdministrationRoutes = [...figshareCrosswalkApiRoutes, ...figshareVocabularyApiRoutes];

export const integrationOperationRoutes = [
  indexRecordRoute,
  indexAllRecordsRoute,
  removeAllIndexedRoute,
  sendNotificationRoute,
];

const definitions = [
  ['get', '/vocab/:vocabIdOrSlug', 'get'],
  ['get', '/vocab/:vocabIdOrSlug/entries', 'entries'],
  ['get', '/vocab/:vocabIdOrSlug/children', 'children'],
  ['get', '/vocab/:vocabIdOrSlug/expandPath', 'expandPath'],
  ['get', '/query/vocab/:queryId', 'getRecords'],
  ['post', '/external/vocab/:provider', 'externalEntries'],
  ['post', '/service/vocab/:serviceId', 'serviceEntries'],
] as const;
export const formVocabularyRoutes = [
  ...definitions.map(([method, path, action]) => ({
    method,
    path: '/:branding/:portal' + path,
    controller: 'FormVocabularyController',
    action,
  })),
  { method: 'get' as const, path: '/:branding/:portal/user/find', controller: 'UserController', action: 'find' },
];
export interface IntegrationPreparation {
  readonly request: RequestPreparation<BrandingOperationsInput>;
  failure(input: BrandingOperationsInput, request: ReferenceRequest, error: unknown): ReferenceResult;
}
export const integrationDeclarations: readonly (ApiRouteDefinition & {
  readonly preparation?: IntegrationPreparation;
})[] = [
  ...vocabularyAdministrationRoutes,
  ...vocabularyIntegrationRoutes,
  ...brandingOperationRoutes,
  ...figshareAdministrationRoutes,
  ...integrationOperationRoutes,
  ...formVocabularyRoutes,
];
