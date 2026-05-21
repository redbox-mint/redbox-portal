import { apiRoute } from '../route-factory';
import { apiErrorResponseSchema, appConfigValueSchema, objectField, responseField, stringField } from '../schemas/common';

const badRequestResponse = responseField(apiErrorResponseSchema, 'Bad request');
const internalServerErrorResponse = responseField(apiErrorResponseSchema, 'Internal server error');

export const getAppConfigByIdRoute = apiRoute(
  'get',
  '/:branding/:portal/api/appconfig/:appConfigId',
  'webservice/AppConfigController',
  'getAppConfig',
  { params: objectField({ appConfigId: stringField() }, ['appConfigId']) },
  {
    tags: ['AppConfig'],
    summary: 'Get app config',
    responses: {
      200: responseField(appConfigValueSchema, 'App config'),
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const saveAppConfigByIdRoute = apiRoute(
  'post',
  '/:branding/:portal/api/appconfig/:appConfigId',
  'webservice/AppConfigController',
  'saveAppConfig',
  {
    params: objectField({ appConfigId: stringField() }, ['appConfigId']),
    body: {
      required: true,
      content: { 'application/json': { schema: objectField({}, [], 'App config payload', true) } },
    },
  },
  {
    tags: ['AppConfig'],
    summary: 'Save app config',
    responses: {
      200: responseField(appConfigValueSchema, 'App config saved'),
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const appConfigApiRoutes = [getAppConfigByIdRoute, saveAppConfigByIdRoute];
