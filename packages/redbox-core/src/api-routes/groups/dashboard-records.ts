import { defineApiRoute } from '../define';
import { z } from '../zod-openapi';
import { anyField, responseField, apiErrorResponseSchema } from '../schemas/common';

export const dashboardRecordFilters = z.object({
  filterMode: z.enum(['', 'regex', 'equal', 'all', 'any']).optional(),
  filter: z.string().max(1024).optional(),
  filterFields: z.string().max(2048).refine(value => value === '' ||
    (value.split(',').length <= 20 && value.split(',').every(field =>
      /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(field) &&
      !field.split('.').some(part => ['__proto__', 'prototype', 'constructor'].includes(part)))), 'Invalid filter fields').optional(),
});
export const dashboardRecordsApiRoutes = [defineApiRoute({
  method: 'get', path: '/:branding/:portal/listRecords', controller: 'RecordController', action: 'getRecordList', csrf: true,
  request: { query: dashboardRecordFilters.extend({
    recordType: z.string().optional(), state: z.string().optional(), start: z.string().optional(), rows: z.string().optional(),
    packageType: z.string().optional(), sort: z.string().optional(), secondarySort: z.string().optional(), editOnly: z.string().optional(),
  }) },
  tags: ['Records'], summary: 'List dashboard records',
  description: 'Brand, workflow and permission scoped. filterFields is a comma-separated list of dotted field paths. Omitted filterMode (or all/regex) matches literal text in every field (AND). any matches literal text in at least one field (OR). equal retains exact AND matching. Text is escaped before constructing Mongo regular expressions.',
  responses: { 200: responseField(anyField(), 'Paged dashboard records'), 400: responseField(apiErrorResponseSchema, 'Invalid filter') },
})];
