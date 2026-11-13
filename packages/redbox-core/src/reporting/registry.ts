import { z } from 'zod';
import { DateTime } from 'luxon';
import { reportingLimitsSchema, type ReportingConfig } from '../config/reporting.config';
import type { RecordTypeConfig } from '../config/recordtype.config';
import { assertReportingPrincipal, recordRoleNames } from './authorization';
import { reportingIdSchema, reportingQuerySchema, type ReportingQuery, type ReportingFilter } from './query';
import { ReportingError, type ReportingFieldDefinition, type ReportingPrincipal, type ReportingLimits } from './types';

const fieldSchema = z
  .strictObject({
    id: reportingIdSchema,
    label: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    path: z
      .string()
      .regex(
        /^(?:metadata\.[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*|metaMetadata\.createdOn|workflow\.stage)$/
      )
      .refine(path => !path.split('.').some(part => ['constructor', 'prototype', '__proto__'].includes(part))),
    type: z.enum(['category', 'date', 'boolean', 'number', 'text']),
    operations: z
      .array(z.enum(['filter', 'group', 'histogram', 'sum', 'average', 'read']))
      .min(1)
      .max(6),
    array: z.boolean().optional(),
    enabled: z.boolean().optional(),
    allowedRoles: z.array(z.string().min(1)).max(100).optional(),
  })
  .refine(
    field =>
      (!field.array || field.type === 'category') &&
      (!field.operations.includes('histogram') || field.type === 'date') &&
      (!field.operations.some(op => op === 'sum' || op === 'average') || field.type === 'number') &&
      (!field.operations.includes('group') || ['category', 'boolean', 'number'].includes(field.type))
  );
const configSchema = z
  .strictObject({
    enabled: z.boolean(),
    allowedRoles: z.array(z.string().min(1)).min(1).max(100),
    forms: z.array(z.string().min(1).max(128)).max(50).optional(),
    searchCore: reportingIdSchema.optional(),
    fields: z.array(fieldSchema).max(100),
  })
  .refine(config => new Set(config.fields.map(field => field.id)).size === config.fields.length);

export interface ReportingRegistry {
  fields: Map<string, ReportingFieldDefinition>;
  forms: string[];
  searchCore: string;
  limits: ReportingLimits;
}
export type VisibleReportingPaths = (principal: ReportingPrincipal, forms: string[]) => Promise<Set<string>>;

/** Fail closed: metadata paths must exist in every covered caller-effective view form. */
export async function resolveReportingRegistry(
  principal: ReportingPrincipal,
  recordType: string,
  config: ReportingConfig,
  recordTypes: RecordTypeConfig,
  visiblePaths: VisibleReportingPaths
): Promise<ReportingRegistry> {
  assertReportingPrincipal(principal);
  if (!config?.enabled) throw new ReportingError('UNAVAILABLE');
  const limitResult = reportingLimitsSchema.safeParse(config.limits);
  if (!limitResult.success) throw new ReportingError('UNAVAILABLE');
  const parsed = configSchema.safeParse(
    Object.hasOwn(recordTypes, recordType) ? recordTypes[recordType]?.reporting : undefined
  );
  if (!parsed.success || !parsed.data.enabled) throw new ReportingError('FORBIDDEN');
  const names = recordRoleNames(principal.brand, principal.roles);
  if (!parsed.data.allowedRoles.some(name => names.includes(name))) throw new ReportingError('FORBIDDEN');
  const forms = parsed.data.forms ?? [];
  const candidates = parsed.data.fields.filter(
    field => field.enabled !== false && (!field.allowedRoles || field.allowedRoles.some(name => names.includes(name)))
  );
  const paths =
    forms.length && candidates.some(field => field.path.startsWith('metadata.'))
      ? await visiblePaths(principal, forms)
      : new Set<string>();
  return {
    fields: new Map(
      candidates
        .filter(field => !field.path.startsWith('metadata.') || paths.has(field.path))
        .map(field => [field.id, field])
    ),
    forms,
    searchCore: parsed.data.searchCore ?? 'default',
    limits: limitResult.data,
  };
}
export function reportingDate(value: string): Date {
  // Calendar dates or complete timestamps with an explicit timezone; reject normalized invalid dates.
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))
    throw new ReportingError('INVALID_QUERY');
  const parsed = DateTime.fromISO(value, { zone: 'utc', setZone: true });
  if (!parsed.isValid) throw new ReportingError('INVALID_QUERY');
  return parsed.toJSDate();
}
export function reportingRange(start: string, end: string, limits: ReportingLimits): { start: Date; end: Date } {
  const dates = { start: reportingDate(start), end: reportingDate(end) };
  const days = (dates.end.getTime() - dates.start.getTime()) / 86_400_000;
  if (days <= 0 || days > limits.maxDateRangeDays) throw new ReportingError('INVALID_QUERY');
  return dates;
}
export function requireReportingField(
  registry: ReportingRegistry,
  id: string,
  operation: ReportingFieldDefinition['operations'][number]
): ReportingFieldDefinition {
  const field = registry.fields.get(id);
  if (!field?.operations.includes(operation)) throw new ReportingError('INVALID_QUERY');
  return field;
}
export function validateReportingFilter(registry: ReportingRegistry, filter: ReportingFilter): void {
  const field = requireReportingField(registry, filter.field, 'filter');
  if (filter.operator === 'missing') return;
  if (filter.operator === 'between') {
    if (field.type !== 'date') throw new ReportingError('INVALID_QUERY');
    reportingRange(filter.start, filter.end, registry.limits);
    return;
  }
  const values = filter.operator === 'eq' ? [filter.value] : filter.values;
  for (const value of values) {
    if (field.type === 'date') {
      if (typeof value !== 'string') throw new ReportingError('INVALID_QUERY');
      reportingDate(value);
    } else if (
      typeof value !== (field.type === 'number' ? 'number' : field.type === 'boolean' ? 'boolean' : 'string')
    ) {
      throw new ReportingError('INVALID_QUERY');
    }
  }
}
export function validateReportingQuery(input: unknown, registry: ReportingRegistry): ReportingQuery {
  const parsed = reportingQuerySchema.safeParse(input);
  if (!parsed.success) throw new ReportingError('INVALID_QUERY');
  const query = parsed.data;
  if ('filters' in query) {
    if ((query.filters?.length ?? 0) > registry.limits.maxFilters) throw new ReportingError('LIMIT_EXCEEDED');
    query.filters?.forEach(filter => validateReportingFilter(registry, filter));
  }
  if (
    'pagination' in query &&
    query.pagination &&
    ((query.pagination.limit ?? 0) > registry.limits.maxPageSize || query.pagination.offset > registry.limits.maxOffset)
  )
    throw new ReportingError('LIMIT_EXCEEDED');
  if (query.operation === 'group') {
    if (
      query.groupBy.length > registry.limits.maxGroupDimensions ||
      new Set(query.groupBy).size !== query.groupBy.length
    )
      throw new ReportingError('INVALID_QUERY');
    const dimensions = query.groupBy.map(id => requireReportingField(registry, id, 'group'));
    if (dimensions.filter(field => field.array).length > 1) throw new ReportingError('INVALID_QUERY');
    const metricIds = (query.metrics ?? [{ operation: 'count' }]).map(metric => {
      if (metric.operation === 'count') return 'count';
      requireReportingField(registry, metric.field, metric.operation);
      if (metric.id === 'count' || query.groupBy.includes(metric.id)) throw new ReportingError('INVALID_QUERY');
      return metric.id;
    });
    if (
      new Set(metricIds).size !== metricIds.length ||
      metricIds.some(id => query.groupBy.includes(id)) ||
      (query.sort && ![...query.groupBy, ...metricIds].includes(query.sort.by))
    )
      throw new ReportingError('INVALID_QUERY');
  }
  if (query.operation === 'time_series') {
    requireReportingField(registry, query.dateHistogram.field, 'histogram');
    reportingRange(query.dateHistogram.start, query.dateHistogram.end, registry.limits);
  }
  if (
    query.operation === 'search' &&
    (query.pagination?.limit ?? Math.min(20, registry.limits.maxSearchResults, registry.limits.maxPageSize)) >
      registry.limits.maxSearchResults
  )
    throw new ReportingError('LIMIT_EXCEEDED');
  return query;
}
export function reportingFieldsUsed(query: ReportingQuery): string[] {
  const fields = 'filters' in query ? (query.filters ?? []).map(filter => filter.field) : [];
  if (query.operation === 'group')
    fields.push(
      ...query.groupBy,
      ...(query.metrics ?? []).flatMap(metric => ('field' in metric ? [metric.field] : []))
    );
  if (query.operation === 'time_series') fields.push(query.dateHistogram.field);
  return [...new Set(fields)];
}
