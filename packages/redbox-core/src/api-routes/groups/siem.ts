import { apiRoute } from '../route-factory';
import { apiErrorResponseSchema, arrayField, numberField, objectField, responseField } from '../schemas/common';

const errorResponse = responseField(apiErrorResponseSchema, 'Error response');
const anyObject = objectField({}, [], 'SIEM payload', true);
const listResponse = objectField({
  rows: arrayField(anyObject),
  total: numberField(),
}, ['rows', 'total']);

export const getSiemConfigRoute = apiRoute('get', '/:branding/:portal/api/siem/config', 'webservice/SiemController', 'getConfig', {}, {
  tags: ['SIEM'],
  summary: 'Get SIEM config',
  responses: { 200: responseField(anyObject, 'SIEM config'), 500: errorResponse },
});

export const saveSiemConfigRoute = apiRoute('put', '/:branding/:portal/api/siem/config', 'webservice/SiemController', 'saveConfig', {
  body: { required: true, content: { 'application/json': { schema: anyObject } } },
}, {
  tags: ['SIEM'],
  summary: 'Save SIEM config',
  responses: { 200: responseField(anyObject, 'SIEM config saved'), 500: errorResponse },
});

export const getSiemEventsRoute = apiRoute('get', '/:branding/:portal/api/siem/events', 'webservice/SiemController', 'getEvents', {}, {
  tags: ['SIEM'],
  summary: 'List SIEM events',
  responses: { 200: responseField(listResponse, 'SIEM events'), 500: errorResponse },
});

export const getSiemDeliveryStatusRoute = apiRoute('get', '/:branding/:portal/api/siem/delivery-status', 'webservice/SiemController', 'getDeliveryStatus', {}, {
  tags: ['SIEM'],
  summary: 'List SIEM delivery attempts',
  responses: { 200: responseField(listResponse, 'SIEM delivery attempts'), 500: errorResponse },
});

export const testSiemDestinationRoute = apiRoute('post', '/:branding/:portal/api/siem/test', 'webservice/SiemController', 'testDestination', {
  body: { required: true, content: { 'application/json': { schema: anyObject } } },
}, {
  tags: ['SIEM'],
  summary: 'Test SIEM destination',
  responses: { 200: responseField(anyObject, 'SIEM test result'), 400: errorResponse, 500: errorResponse },
});

export const siemApiRoutes = [
  getSiemConfigRoute,
  saveSiemConfigRoute,
  getSiemEventsRoute,
  getSiemDeliveryStatusRoute,
  testSiemDestinationRoute,
];
