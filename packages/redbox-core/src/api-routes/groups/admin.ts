import { apiRoute } from '../route-factory';
import { apiErrorResponseSchema, appConfigValueSchema, apiActionResponseSchema, objectField, patternStringField, responseField } from '../schemas/common';

const badRequestResponse = responseField(apiErrorResponseSchema, 'Bad request');
const notFoundResponse = responseField(apiErrorResponseSchema, 'Not found');
const internalServerErrorResponse = responseField(apiErrorResponseSchema, 'Internal server error');
const appConfigKeyField = patternStringField('^(?!constructor$|prototype$|__proto__$)[A-Za-z0-9_-]+$', 'Config key');

export const refreshCachedResourcesRoute = apiRoute(
  'get',
  '/:branding/:portal/api/admin/refreshCachedResources',
  'webservice/AdminController',
  'refreshCachedResources',
  {},
  {
    tags: ['Admin'],
    summary: 'Refresh cached resources',
    responses: {
      200: responseField(apiActionResponseSchema, 'Cached resources refreshed'),
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const setAppConfigRoute = apiRoute(
  'post',
  '/:branding/:portal/api/admin/config/:configKey',
  'webservice/AdminController',
  'setAppConfig',
  {
    params: objectField({ configKey: appConfigKeyField }, ['configKey']),
    body: { required: true, content: { 'application/json': { schema: objectField({}, [], 'Config payload', true) } } },
  },
  {
    tags: ['Admin'],
    summary: 'Set app config',
    responses: {
      200: responseField(apiActionResponseSchema, 'App config updated'),
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const getAppConfigByKeyRoute = apiRoute(
  'get',
  '/:branding/:portal/api/admin/config/:configKey',
  'webservice/AdminController',
  'getAppConfig',
  { params: objectField({ configKey: appConfigKeyField }, ['configKey']) },
  {
    tags: ['Admin'],
    summary: 'Get app config by key',
    responses: {
      200: responseField(appConfigValueSchema, 'App config value'),
      400: badRequestResponse,
      404: notFoundResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const listAppConfigsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/admin/config',
  'webservice/AdminController',
  'getAppConfig',
  {},
  {
    tags: ['Admin'],
    summary: 'List app configs',
    responses: {
      200: responseField(appConfigValueSchema, 'App config list'),
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);
export const adminApiRoutes = [
  refreshCachedResourcesRoute,
  setAppConfigRoute,
  getAppConfigByKeyRoute,
  listAppConfigsRoute,
];
