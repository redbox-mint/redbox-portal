import { z } from '../zod-openapi';
import {
  normalizeSiemConfiguration,
  normalizeSiemDestination,
  normalizeSiemRedaction,
  SIEM_ADAPTER_TYPES,
  SIEM_CATEGORIES,
  SIEM_SEVERITIES,
} from '../../configmodels/SiemConfiguration';

function validateConfiguration(value: unknown, ctx: z.RefinementCtx): void {
  try {
    normalizeSiemConfiguration(value);
  } catch (error) {
    ctx.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'Invalid SIEM configuration' });
  }
}
const destinationSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    enabled: z.boolean().pipe(z.boolean()).optional(),
    adapterType: z.enum(SIEM_ADAPTER_TYPES),
    endpointUrl: z.string(),
    token: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    timeoutMs: z.number().pipe(z.number()).optional(),
    retry: z
      .object({
        maxAttempts: z.number().pipe(z.number()).optional(),
        retryDelayMs: z.number().pipe(z.number()).optional(),
        retryBackoffMultiplier: z.number().pipe(z.number()).optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    try {
      normalizeSiemDestination(value);
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'Invalid destination' });
    }
  });
const redactionSchema = z
  .object({
    denylistedPaths: z.array(z.string()).optional(),
    maxPayloadBytes: z.number().pipe(z.number()).optional(),
    includeActorEmail: z.boolean().pipe(z.boolean()).optional(),
    includeIpAddress: z.boolean().pipe(z.boolean()).optional(),
    includeUserAgent: z.boolean().pipe(z.boolean()).optional(),
  })
  .superRefine((value, ctx) => {
    try {
      normalizeSiemRedaction(value);
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'Invalid redaction' });
    }
  });
const configSchema = z
  .object({
    enabled: z.boolean().pipe(z.boolean()).optional(),
    destinations: z.array(destinationSchema).optional(),
    events: z
      .object({
        categories: z.record(z.string(), z.boolean().pipe(z.boolean())).optional(),
        severity: z.record(z.string(), z.enum(SIEM_SEVERITIES)).optional(),
      })
      .optional(),
    redaction: redactionSchema.optional(),
    delivery: z
      .object({
        batchSize: z.number().pipe(z.number()).optional(),
        maxAttempts: z.number().pipe(z.number()).optional(),
        retryDelayMs: z.number().pipe(z.number()).optional(),
        retryBackoffMultiplier: z.number().pipe(z.number()).optional(),
        deadLetterRetentionDays: z.number().pipe(z.number()).optional(),
        nonBlocking: z.boolean().pipe(z.boolean()).optional(),
      })
      .optional(),
  })
  .superRefine(validateConfiguration);
const testSchema = z.object({ destination: destinationSchema, redaction: redactionSchema.optional() });
const isoDate = z.string().datetime({ offset: true });
import { apiRoute } from '../route-factory';
import {
  apiErrorResponseSchema,
  arrayField,
  numberField,
  objectField,
  responseField,
  stringField,
} from '../schemas/common';

const errorResponse = responseField(apiErrorResponseSchema, 'Error response');
const anyObject = objectField({}, [], 'SIEM payload', true);
const listResponse = objectField(
  {
    rows: arrayField(anyObject),
    total: numberField(),
  },
  ['rows', 'total']
);
const paginationQuery = {
  limit: z.number().min(1).max(500).refine(Number.isSafeInteger, 'Must be an integer'),
  offset: z.number().min(0).max(Number.MAX_SAFE_INTEGER).refine(Number.isSafeInteger, 'Must be an integer'),
};
const siemEventsQuery = objectField({
  ...paginationQuery,
  brandId: stringField('Brand identifier filter'),
  eventType: stringField('Event type filter'),
  category: z.enum(SIEM_CATEGORIES),
  severity: z.enum(SIEM_SEVERITIES),
  deliveryState: z.enum(['pending', 'processing', 'partial', 'failed', 'delivered', 'deadLetter', 'ignored']),
  startDate: isoDate,
  endDate: isoDate,
});
const siemDeliveryStatusQuery = objectField({
  ...paginationQuery,
  brandId: stringField('Brand identifier filter'),
  eventId: stringField('Event identifier filter'),
  destinationId: stringField('Destination identifier filter'),
  status: z.enum(['success', 'failed', 'deadLetter']),
  startDate: isoDate,
  endDate: isoDate,
});

export const getSiemConfigRoute = apiRoute(
  'get',
  '/:branding/:portal/api/siem/config',
  'webservice/SiemController',
  'getConfig',
  {},
  {
    tags: ['SIEM'],
    summary: 'Get SIEM config',
    responses: { 200: responseField(anyObject, 'SIEM config'), 400: errorResponse, 500: errorResponse },
  }
);

export const saveSiemConfigRoute = apiRoute(
  'put',
  '/:branding/:portal/api/siem/config',
  'webservice/SiemController',
  'saveConfig',
  {
    body: { required: true, content: { 'application/json': { schema: configSchema } } },
  },
  {
    tags: ['SIEM'],
    summary: 'Save SIEM config',
    responses: { 200: responseField(anyObject, 'SIEM config saved'), 400: errorResponse, 500: errorResponse },
  }
);

export const getSiemEventsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/siem/events',
  'webservice/SiemController',
  'getEvents',
  {
    query: siemEventsQuery,
  },
  {
    tags: ['SIEM'],
    summary: 'List SIEM events',
    responses: { 200: responseField(listResponse, 'SIEM events'), 400: errorResponse, 500: errorResponse },
  }
);

export const getSiemDeliveryStatusRoute = apiRoute(
  'get',
  '/:branding/:portal/api/siem/delivery-status',
  'webservice/SiemController',
  'getDeliveryStatus',
  {
    query: siemDeliveryStatusQuery,
  },
  {
    tags: ['SIEM'],
    summary: 'List SIEM delivery attempts',
    responses: { 200: responseField(listResponse, 'SIEM delivery attempts'), 400: errorResponse, 500: errorResponse },
  }
);

export const testSiemDestinationRoute = apiRoute(
  'post',
  '/:branding/:portal/api/siem/test',
  'webservice/SiemController',
  'testDestination',
  {
    body: { required: true, content: { 'application/json': { schema: testSchema } } },
  },
  {
    tags: ['SIEM'],
    summary: 'Test SIEM destination',
    responses: { 200: responseField(anyObject, 'SIEM test result'), 400: errorResponse, 500: errorResponse },
  }
);

export const siemApiRoutes = [
  getSiemConfigRoute,
  saveSiemConfigRoute,
  getSiemEventsRoute,
  getSiemDeliveryStatusRoute,
  testSiemDestinationRoute,
];
