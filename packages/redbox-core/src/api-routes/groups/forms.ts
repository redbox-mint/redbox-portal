import { apiRoute } from '../route-factory';
import { apiErrorResponseSchema, formSchema, listApiResponseSchema, objectField, responseField, stringField } from '../schemas/common';

const badRequestResponse = responseField(apiErrorResponseSchema, 'Bad request');
const internalServerErrorResponse = responseField(apiErrorResponseSchema, 'Internal server error');
const formNotFoundResponse = responseField(apiErrorResponseSchema, 'Form not found');

export const getFormRoute = apiRoute(
  'get',
  '/:branding/:portal/api/forms/get',
  'webservice/FormManagementController',
  'getForm',
  { query: objectField({ name: stringField(), editable: stringField() }, ['name']) },
  {
    tags: ['Forms'],
    summary: 'Get form definition',
    responses: {
      200: responseField(formSchema, 'Form definition'),
      400: badRequestResponse,
      404: formNotFoundResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const listFormsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/forms',
  'webservice/FormManagementController',
  'listForms',
  {},
  {
    tags: ['Forms'],
    summary: 'List forms',
    responses: {
      200: responseField(listApiResponseSchema(formSchema), 'Form list'),
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const formApiRoutes = [getFormRoute, listFormsRoute];
