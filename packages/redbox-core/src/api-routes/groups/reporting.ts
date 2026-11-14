import { z } from '../zod-openapi';
import { apiRoute } from '../route-factory';
import { reportingQuerySchema, reportingIdSchema } from '../../reporting/query';
import { responseField } from '../schemas/common';
const reportingValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
]);
const record = z.object({ oid: z.string(), recordType: z.string(), fields: z.record(z.string(), reportingValue) });
const group = z.object({
  dimensions: z.record(z.string(), reportingValue),
  metrics: z.record(z.string(), z.number().nullable()),
});
const page = z.object({
  total: z.number().int().nonnegative().nullable(),
  returned: z.number().int().nonnegative(),
  truncated: z.boolean().nullable(),
  offset: z.number().int().nonnegative(),
  items: z.array(z.union([record, group])),
  totalReason: z.string().optional(),
});
const result = z.union([z.object({ count: z.number().int().nonnegative() }), page, record]);
const schema = z.object({
  recordType: z.string(),
  fields: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      description: z.string().optional(),
      type: z.enum(['category', 'boolean', 'date', 'number', 'text']),
      operations: z.array(z.enum(['filter', 'group', 'histogram', 'sum', 'average', 'read'])),
      array: z.boolean().optional(),
    })
  ),
  limits: z.record(z.string(), z.number()),
  dateSemantics: z.string(),
  metadataFormCoverage: z.array(z.string()),
});
export const reportingApiRoutes = [
  apiRoute(
    'get',
    '/:branding/:portal/api/reporting/schema/:recordType',
    'webservice/ReportingController',
    'schema',
    {
      params: z.object({ branding: z.string(), portal: z.string(), recordType: reportingIdSchema }),
    },
    {
      tags: ['Reporting'],
      summary: 'Discover caller-authorized semantic reporting fields',
      responses: { 200: responseField(schema, 'Caller-visible reporting schema') },
    }
  ),
  apiRoute(
    'post',
    '/:branding/:portal/api/reporting/query',
    'webservice/ReportingController',
    'query',
    {
      body: { required: true, content: { 'application/json': { schema: reportingQuerySchema } } },
    },
    {
      tags: ['Reporting'],
      summary: 'Execute a bounded reporting operation as the authenticated user',
      description:
        'No database paths or raw queries are accepted. Dates use UTC with an exclusive end. All aggregates enforce current tenant and record view permissions.',
      responses: { 200: responseField(result, 'Bounded authorized reporting result') },
    }
  ),
];
