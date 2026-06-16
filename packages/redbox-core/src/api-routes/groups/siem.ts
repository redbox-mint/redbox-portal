import { apiRoute } from '../route-factory';
import { apiErrorResponseSchema, arrayField, numberField, objectField, responseField, stringField } from '../schemas/common';

const errorResponse = responseField(apiErrorResponseSchema, 'Error response');
const anyObject = objectField({}, [], 'SIEM payload', true);
const listResponse = objectField({
  rows: arrayField(anyObject),
  total: numberField(),
}, ['rows', 'total']);
const paginationQuery = {
  limit: numberField('Maximum results to return. Defaults to 50, maximum 500.'),
  offset: numberField('Result offset. Defaults to 0.'),
};
const siemEventsQuery = objectField({
  ...paginationQuery,
  brandId: stringField('Brand identifier filter'),
  eventType: stringField('Event type filter'),
  category: stringField('Event category filter'),
  severity: stringField('Severity filter'),
  deliveryState: stringField('Delivery state filter'),
  startDate: stringField('Inclusive occurredAt start date/time filter (ISO 8601)'),
  endDate: stringField('Inclusive occurredAt end date/time filter (ISO 8601)'),
});
const siemDeliveryStatusQuery = objectField({
  ...paginationQuery,
  brandId: stringField('Brand identifier filter'),
  eventId: stringField('Event identifier filter'),
  destinationId: stringField('Destination identifier filter'),
  status: stringField('Delivery attempt status filter: success, failed, or deadLetter'),
  startDate: stringField('Inclusive startedAt start date/time filter (ISO 8601)'),
  endDate: stringField('Inclusive startedAt end date/time filter (ISO 8601)'),
});

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

export const getSiemEventsRoute = apiRoute('get', '/:branding/:portal/api/siem/events', 'webservice/SiemController', 'getEvents', {
  query: siemEventsQuery,
}, {
  tags: ['SIEM'],
  summary: 'List SIEM events',
  responses: { 200: responseField(listResponse, 'SIEM events'), 500: errorResponse },
});

export const getSiemDeliveryStatusRoute = apiRoute('get', '/:branding/:portal/api/siem/delivery-status', 'webservice/SiemController', 'getDeliveryStatus', {
  query: siemDeliveryStatusQuery,
}, {
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
