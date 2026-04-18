import { apiRoute } from '../route-factory';
import { apiActionResponseSchema, apiErrorResponseSchema, notificationBody, responseField } from '../schemas/common';

const badRequestResponse = responseField(apiErrorResponseSchema, 'Bad request');
const internalServerErrorResponse = responseField(apiErrorResponseSchema, 'Internal server error');

export const sendNotificationRoute = apiRoute(
  'post',
  '/:branding/:portal/api/sendNotification',
  'EmailController',
  'sendNotification',
  {
    body: { required: true, content: { 'application/json': { schema: notificationBody } } },
  },
  {
    tags: ['Notifications'],
    summary: 'Send notification email',
    responses: {
      200: responseField(apiActionResponseSchema, 'Notification sent'),
      400: badRequestResponse,
      500: internalServerErrorResponse,
    },
  }
);

export const notificationApiRoutes = [sendNotificationRoute];
