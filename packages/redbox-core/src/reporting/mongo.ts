import type { Document } from 'mongodb';
/** Minimal driver contract keeps storage hooks compatible across pinned Mongo driver versions. */
export interface ReportingMongoCollection {
  aggregate(
    pipeline: Document[],
    options: { maxTimeMS: number; allowDiskUse: boolean }
  ): { toArray(): Promise<Document[]> };
}
import { reportingMongoAuthorization } from './authorization';
import {
  requireReportingField,
  reportingDate,
  reportingRange,
  reportingFieldsUsed,
  validateReportingQuery,
  type ReportingRegistry,
} from './registry';
import type { MongoReportingQuery, ReportingFilter } from './query';
import {
  ReportingError,
  type ReportingPrincipal,
  type ReportingProvider,
  type ReportingPage,
  type ReportingGroup,
} from './types';

const dateValue = (path: string): Document => ({
  $convert: { input: `$${path}`, to: 'date', onError: null, onNull: null },
});
function typedValue(path: string, type: string): Document {
  const ref = `$${path}`;
  return {
    $cond: [
      type === 'number' ? { $isNumber: ref } : { $eq: [{ $type: ref }, type === 'boolean' ? 'bool' : 'string'] },
      ref,
      null,
    ],
  };
}
/** One normalized array contract for grouping and null-bucket drilldown. */
function categoryArrayValues(path: string): Document {
  return {
    $let: {
      vars: {
        values: {
          $setUnion: [
            {
              $cond: [
                { $isArray: `$${path}` },
                {
                  $filter: {
                    input: `$${path}`,
                    as: 'item',
                    cond: { $eq: [{ $type: '$$item' }, 'string'] },
                  },
                },
                [typedValue(path, 'category')],
              ],
            },
            [],
          ],
        },
      },
      in: { $cond: [{ $eq: [{ $size: '$$values' }, 0] }, [null], '$$values'] },
    },
  };
}
function filterMatch(filter: ReportingFilter, registry: ReportingRegistry): Document {
  const field = requireReportingField(registry, filter.field, 'filter');
  if (filter.operator === 'missing') {
    if (field.array) {
      return { $expr: { [filter.value ? '$eq' : '$ne']: [categoryArrayValues(field.path), [null]] } };
    }
    const value = field.type === 'date' ? dateValue(field.path) : typedValue(field.path, field.type);
    return { $expr: { [filter.value ? '$eq' : '$ne']: [value, null] } };
  }
  if (field.type === 'date') {
    const value = dateValue(field.path);
    if (filter.operator === 'between') {
      const range = reportingRange(filter.start, filter.end, registry.limits);
      return { $expr: { $and: [{ $ne: [value, null] }, { $gte: [value, range.start] }, { $lt: [value, range.end] }] } };
    }
    const inputs = filter.operator === 'eq' ? [filter.value] : filter.values;
    return { $expr: { $in: [value, inputs.map(input => reportingDate(String(input)))] } };
  }
  if (filter.operator === 'between') throw new ReportingError('INVALID_QUERY');
  // Scalars are always operator values, never object fragments or expression strings.
  return { [field.path]: filter.operator === 'eq' ? { $eq: filter.value } : { $in: filter.values } };
}
/** Only trusted code generates stages. Revalidates DSL even for direct storage callers. */
export function compileReportingPipeline(
  principal: ReportingPrincipal,
  input: MongoReportingQuery,
  registry: ReportingRegistry
): Document[] {
  const query = validateReportingQuery(input, registry);
  if (query.operation === 'search' || query.operation === 'get_record') throw new ReportingError('INVALID_QUERY');
  const matches: Document[] = [reportingMongoAuthorization(principal), { 'metaMetadata.type': query.recordType }];
  if (reportingFieldsUsed(query).some(id => registry.fields.get(id)?.path.startsWith('metadata.'))) {
    matches.push({ 'metaMetadata.form': { $in: registry.forms } });
  }
  matches.push(...(query.filters ?? []).map(filter => filterMatch(filter, registry)));
  const pipeline: Document[] = [{ $match: { $and: matches } }];
  if (query.operation === 'count') return [...pipeline, { $count: 'count' }];
  const page = query.pagination ?? {
    limit: Math.min(20, registry.limits.maxPageSize, query.operation === 'records' ? 100 : registry.limits.maxGroups),
    offset: 0,
  };
  if (query.operation === 'records')
    return [
      ...pipeline,
      {
        $facet: {
          total: [{ $count: 'value' }],
          items: [
            { $sort: { redboxOid: 1 } },
            { $skip: page.offset },
            { $limit: page.limit },
            { $project: { _id: 0, oid: '$redboxOid' } },
          ],
        },
      },
    ];
  const project: Document = { _id: 0 };
  const groupId: Document = {};
  const dimensions: Document = {};
  const group: Document = { _id: groupId };
  const metrics: Document = {};
  let arrayDimension: string | undefined;
  if (query.operation === 'time_series') {
    const histogram = query.dateHistogram;
    const field = requireReportingField(registry, histogram.field, 'histogram');
    const range = reportingRange(histogram.start, histogram.end, registry.limits);
    const date = dateValue(field.path);
    pipeline.push({
      $match: { $expr: { $and: [{ $ne: [date, null] }, { $gte: [date, range.start] }, { $lt: [date, range.end] }] } },
    });
    project.d0 = {
      $dateToString: {
        date,
        timezone: 'UTC',
        format: histogram.interval === 'year' ? '%Y' : histogram.interval === 'month' ? '%Y-%m' : '%Y-%m-%d',
      },
    };
    groupId.d0 = '$d0';
    dimensions.bucket = '$_id.d0';
    group.m0 = { $sum: 1 };
    metrics.count = '$m0';
  } else {
    query.groupBy.forEach((id, index) => {
      const field = requireReportingField(registry, id, 'group');
      const key = `d${index}`;
      if (field.array) {
        // Count a record once per distinct array value, retaining a null bucket for empty/missing arrays.
        project[key] = categoryArrayValues(field.path);
        arrayDimension = key;
      } else project[key] = typedValue(field.path, field.type);
      groupId[key] = `$${key}`;
      dimensions[id] = `$_id.${key}`;
    });
    (query.metrics ?? [{ operation: 'count' }]).forEach((metric, index) => {
      const key = `m${index}`;
      if (metric.operation === 'count') {
        group[key] = { $sum: 1 };
        metrics.count = `$${key}`;
      } else {
        const field = requireReportingField(registry, metric.field, metric.operation);
        project[key] = typedValue(field.path, 'number');
        group[key] = { [metric.operation === 'sum' ? '$sum' : '$avg']: `$${key}` };
        metrics[metric.id] = `$${key}`;
      }
    });
  }
  pipeline.push({ $project: project });
  if (arrayDimension) pipeline.push({ $unwind: `$${arrayDimension}` });
  pipeline.push({ $group: group }, { $project: { _id: 0, dimensions, metrics } });
  const sort: Document = query.operation === 'time_series' ? { 'dimensions.bucket': 1 } : {};
  if (query.operation === 'group') {
    if (query.sort)
      sort[`${query.groupBy.includes(query.sort.by) ? 'dimensions' : 'metrics'}.${query.sort.by}`] =
        query.sort.direction === 'asc' ? 1 : -1;
    // Always break ties deterministically so pagination is repeatable within a stable dataset.
    for (const id of query.groupBy) sort[`dimensions.${id}`] ??= 1;
  }
  pipeline.push({
    $facet: {
      total: [{ $count: 'value' }],
      items: [{ $sort: sort }, { $skip: page.offset }, { $limit: page.limit }],
    },
  });
  return pipeline;
}

interface FacetResult {
  total: Array<{ value: number }>;
  items: Array<ReportingGroup | { oid: string }>;
}
export class MongoReportingProvider implements ReportingProvider {
  constructor(
    private readonly collection: ReportingMongoCollection,
    private readonly registry: (principal: ReportingPrincipal, recordType: string) => Promise<ReportingRegistry>
  ) {}
  async executeReporting(
    principal: ReportingPrincipal,
    input: MongoReportingQuery
  ): Promise<{ count: number } | ReportingPage<ReportingGroup> | ReportingPage<string>> {
    const registry = await this.registry(principal, input.recordType);
    const query = validateReportingQuery(input, registry);
    if (query.operation === 'search' || query.operation === 'get_record') throw new ReportingError('INVALID_QUERY');
    if (
      (query.operation === 'group' || query.operation === 'time_series') &&
      (query.pagination?.limit ?? Math.min(20, registry.limits.maxGroups)) > registry.limits.maxGroups
    )
      throw new ReportingError('LIMIT_EXCEEDED');
    const pipeline = compileReportingPipeline(principal, query, registry);
    const results = await this.collection
      .aggregate(pipeline, {
        maxTimeMS: registry.limits.aggregationTimeoutMs,
        allowDiskUse: false,
      })
      .toArray();
    const bounded = <T>(value: T): T => {
      if (Buffer.byteLength(JSON.stringify(value), 'utf8') > registry.limits.maxOutputBytes)
        throw new ReportingError('LIMIT_EXCEEDED');
      return value;
    };
    if (query.operation === 'count') return bounded({ count: Number(results[0]?.count ?? 0) });
    const facet = results[0] as FacetResult | undefined;
    const total = facet?.total[0]?.value ?? 0;
    const offset = query.pagination?.offset ?? 0;
    if (query.operation === 'records') {
      const items = (facet?.items ?? []).flatMap(item => ('oid' in item ? [item.oid] : []));
      return bounded({ total, returned: items.length, truncated: total > offset + items.length, offset, items });
    }
    const items = (facet?.items ?? []).filter((item): item is ReportingGroup => 'dimensions' in item);
    return bounded({ total, returned: items.length, truncated: total > offset + items.length, offset, items });
  }
}
