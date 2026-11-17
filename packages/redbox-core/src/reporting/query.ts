import { z } from 'zod';

/** Semantic identifiers only; paths and database syntax are never part of the public DSL. */
export const reportingIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine(value => !['constructor', 'prototype', '__proto__'].includes(value));
const scalar = z.union([z.string().max(500), z.number().finite(), z.boolean()]);
export const reportingFilterSchema = z.discriminatedUnion('operator', [
  z.strictObject({ field: reportingIdSchema, operator: z.literal('eq'), value: scalar }),
  z.strictObject({ field: reportingIdSchema, operator: z.literal('in'), values: z.array(scalar).min(1).max(50) }),
  z.strictObject({
    field: reportingIdSchema,
    operator: z.literal('between'),
    start: z.string().max(40),
    end: z.string().max(40),
  }),
  z.strictObject({ field: reportingIdSchema, operator: z.literal('missing'), value: z.boolean() }),
]);
const base = { recordType: reportingIdSchema, filters: z.array(reportingFilterSchema).max(20).optional() };
export const reportingPaginationSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(10_000).default(0),
});
export const reportingMetricSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('count') }),
  z.strictObject({ operation: z.enum(['sum', 'average']), field: reportingIdSchema, id: reportingIdSchema }),
]);
const group = {
  groupBy: z.array(reportingIdSchema).min(1).max(3),
  metrics: z.array(reportingMetricSchema).min(1).max(5).optional(),
  sort: z.strictObject({ by: reportingIdSchema, direction: z.enum(['asc', 'desc']) }).optional(),
  pagination: reportingPaginationSchema.optional(),
};
export const reportingSchemaInput = z.strictObject({ recordType: reportingIdSchema });
export const reportingCountInput = z.strictObject(base);
export const reportingGroupInput = z.strictObject({ ...base, ...group });
export const reportingTimeSeriesInput = z.strictObject({
  ...base,
  dateHistogram: z.strictObject({
    field: reportingIdSchema,
    interval: z.enum(['day', 'month', 'year']),
    start: z.string().max(40),
    end: z.string().max(40),
  }),
  pagination: reportingPaginationSchema.optional(),
});
export const reportingRecordsInput = z.strictObject({ ...base, pagination: reportingPaginationSchema.optional() });
export const reportingSearchInput = z.strictObject({
  recordType: reportingIdSchema,
  text: z.string().trim().min(1).max(500),
  pagination: reportingPaginationSchema.optional(),
});
export const reportingRecordInput = z.strictObject({
  recordType: reportingIdSchema,
  oid: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
});
export const reportingQuerySchema = z.discriminatedUnion('operation', [
  reportingCountInput.extend({ operation: z.literal('count') }),
  reportingGroupInput.extend({ operation: z.literal('group') }),
  reportingTimeSeriesInput.extend({ operation: z.literal('time_series') }),
  reportingRecordsInput.extend({ operation: z.literal('records') }),
  reportingSearchInput.extend({ operation: z.literal('search') }),
  reportingRecordInput.extend({ operation: z.literal('get_record') }),
]);
export type ReportingQuery = z.infer<typeof reportingQuerySchema>;
export type ReportingFilter = z.infer<typeof reportingFilterSchema>;
export type ReportingMetric = z.infer<typeof reportingMetricSchema>;
export type MongoReportingQuery = Exclude<ReportingQuery, { operation: 'search' | 'get_record' }>;
