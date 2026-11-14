import { get } from 'lodash';
import { Services as services } from '../CoreService';
import type { RecordModel } from '../model';
import { assertReportingPrincipal } from '../reporting/authorization';
import { reportingQuerySchema, reportingSchemaInput, type ReportingQuery } from '../reporting/query';
import { reportingFieldsUsed, validateReportingQuery, type ReportingRegistry } from '../reporting/registry';
import { projectReportingMetadata, runtimeReportingRegistry } from '../reporting/runtime';
import {
  ReportingError,
  type ReportingPrincipal,
  type ReportingProvider,
  type ReportingSchema,
  type ReportingResult,
  type ReportingRecord,
  type ReportingValue,
  type ReportingFieldDefinition,
  type ReportingAuditContext,
  type ReportingApi,
} from '../reporting/types';

export interface ReportingServiceDependencies {
  registry(principal: ReportingPrincipal, recordType: string): Promise<ReportingRegistry>;
  provider(): ReportingProvider;
  records: {
    getMeta(oid: string): Promise<RecordModel>;
    hasViewAccess(
      brand: unknown,
      user: Record<string, unknown>,
      roles: object[],
      record: Record<string, unknown>
    ): boolean;
  };
  project(principal: ReportingPrincipal, record: RecordModel): Promise<Record<string, unknown>>;
  search(
    principal: ReportingPrincipal,
    core: string,
    recordType: string,
    text: string,
    offset: number,
    limit: number
  ): Promise<string[]>;
}
function runtimeDependencies(): ReportingServiceDependencies {
  return {
    registry: runtimeReportingRegistry,
    provider: () => {
      const provider = sails.services[sails.config.storage.serviceName];
      if (typeof provider?.executeReporting !== 'function') throw new ReportingError('UNAVAILABLE');
      return provider as unknown as ReportingProvider;
    },
    records: RecordsService,
    project: projectReportingMetadata,
    search: (principal, core, recordType, text, offset, limit) =>
      SolrSearchService.searchReportingText(principal, core, recordType, text, offset, limit),
  };
}
function scalarValue(value: unknown, field: ReportingFieldDefinition): ReportingValue {
  if (value == null) return null;
  if (field.array) return (Array.isArray(value) ? value : [value]).filter(item => typeof item === 'string');
  if (field.type === 'date')
    return value instanceof Date && Number.isFinite(value.getTime())
      ? value.toISOString()
      : typeof value === 'string'
        ? value
        : null;
  if (field.type === 'number') return typeof value === 'number' && Number.isFinite(value) ? value : null;
  if (field.type === 'boolean') return typeof value === 'boolean' ? value : null;
  return typeof value === 'string' ? value : null;
}
export namespace Services {
  /** Safe reporting engine shared by direct callers, REST and MCP. */
  export class Reporting extends services.Core.Service implements ReportingApi {
    protected override _exportedMethods = [
      'getReportingSchema',
      'execute',
      'count',
      'group',
      'timeSeries',
      'search',
      'getRecord',
    ];
    constructor(private readonly dependencies?: ReportingServiceDependencies) {
      super();
    }
    private get deps(): ReportingServiceDependencies {
      return this.dependencies ?? runtimeDependencies();
    }
    private bounded<T>(result: T, registry: ReportingRegistry): T {
      if (Buffer.byteLength(JSON.stringify(result), 'utf8') > registry.limits.maxOutputBytes)
        throw new ReportingError('LIMIT_EXCEEDED');
      return result;
    }
    public async getReportingSchema(
      principal: ReportingPrincipal,
      input: { recordType: string },
      audit?: ReportingAuditContext
    ): Promise<ReportingSchema> {
      const usedFields: string[] = [];
      return this.audited(principal, audit, 'schema', input.recordType, usedFields, async () => {
        const parsed = reportingSchemaInput.safeParse(input);
        if (!parsed.success) throw new ReportingError('INVALID_QUERY');
        const registry = await this.deps.registry(principal, parsed.data.recordType);
        usedFields.push(...registry.fields.keys());
        return this.bounded(
          {
            recordType: parsed.data.recordType,
            fields: [...registry.fields.values()].map(field => ({
              id: field.id,
              label: field.label,
              description: field.description,
              type: field.type,
              operations: field.operations,
              ...(field.array ? { array: true } : {}),
            })),
            limits: registry.limits,
            dateSemantics: 'UTC; ranges include start and exclude end. Histograms return occupied buckets.',
            metadataFormCoverage: registry.forms,
          },
          registry
        );
      });
    }
    public async execute(
      principal: ReportingPrincipal,
      input: ReportingQuery,
      audit?: ReportingAuditContext
    ): Promise<ReportingResult> {
      // Never audit raw malformed keys, values, full-text input, OIDs, tokens or backend exceptions.
      const parsed = reportingQuerySchema.safeParse(input);
      const usedFields = parsed.success ? reportingFieldsUsed(parsed.data) : [];
      return this.audited(
        principal,
        audit,
        parsed.success ? parsed.data.operation : 'invalid',
        parsed.success ? parsed.data.recordType : undefined,
        usedFields,
        async () => {
          if (!parsed.success) throw new ReportingError('INVALID_QUERY');
          const registry = await this.deps.registry(principal, parsed.data.recordType);
          const query = validateReportingQuery(parsed.data, registry);
          if (['get_record', 'records', 'search'].includes(query.operation)) {
            for (const field of registry.fields.values())
              if (field.operations.includes('read') && !usedFields.includes(field.id)) usedFields.push(field.id);
          }
          if (query.operation === 'get_record')
            return this.bounded(await this.read(principal, query.recordType, query.oid, registry), registry);
          if (query.operation === 'search') {
            if (!registry.searchCore) throw new ReportingError('FORBIDDEN');
            const page = {
              limit:
                query.pagination?.limit ?? Math.min(20, registry.limits.maxSearchResults, registry.limits.maxPageSize),
              offset: query.pagination?.offset ?? 0,
            };
            const ids = await this.deps.search(
              principal,
              registry.searchCore,
              query.recordType,
              query.text,
              page.offset,
              page.limit + 1
            );
            const items: ReportingRecord[] = [];
            for (const id of ids) {
              try {
                items.push(await this.read(principal, query.recordType, id, registry));
              } catch (error) {
                if (!(error instanceof ReportingError) || error.code !== 'NOT_FOUND') throw error;
              }
            }
            return this.bounded(
              {
                total: null,
                returned: Math.min(items.length, page.limit),
                truncated: items.length > page.limit ? true : null,
                offset: page.offset,
                items: items.slice(0, page.limit),
                totalReason: 'Search index permissions may lag; results are reauthorized against current records.',
              },
              registry
            );
          }
          const result = await this.deps.provider().executeReporting(principal, query);
          if (query.operation !== 'records') return this.bounded(result as ReportingResult, registry);
          if (!('items' in result)) throw new ReportingError('UNAVAILABLE');
          const items: ReportingRecord[] = [];
          for (const id of result.items) {
            if (typeof id !== 'string') throw new ReportingError('UNAVAILABLE');
            try {
              items.push(await this.read(principal, query.recordType, id, registry));
            } catch (error) {
              if (!(error instanceof ReportingError) || error.code !== 'NOT_FOUND') throw error;
            }
          }
          return this.bounded({ ...result, returned: items.length, items }, registry);
        }
      );
    }
    private async read(
      principal: ReportingPrincipal,
      recordType: string,
      oid: string,
      registry: ReportingRegistry
    ): Promise<ReportingRecord> {
      const record = await this.deps.records.getMeta(oid);
      if (
        !record ||
        record.metaMetadata?.brandId !== principal.brand.id ||
        record.metaMetadata?.type !== recordType ||
        !this.deps.records.hasViewAccess(principal.brand, principal.user, principal.roles, record)
      )
        throw new ReportingError('NOT_FOUND');
      const readable = [...registry.fields.values()].filter(field => field.operations.includes('read'));
      const needsMetadata = readable.some(field => field.path.startsWith('metadata.'));
      const projected = needsMetadata ? await this.deps.project(principal, record) : {};
      const fields: ReportingRecord['fields'] = {};
      for (const field of readable) {
        fields[field.id] = scalarValue(
          field.path.startsWith('metadata.') ? get(projected, field.path.slice(9)) : get(record, field.path),
          field
        );
      }
      return { oid: record.redboxOid, recordType, fields };
    }
    private async audited<T>(
      principal: ReportingPrincipal,
      audit: ReportingAuditContext | undefined,
      operation: string,
      recordType: string | undefined,
      fields: string[],
      action: () => Promise<T>
    ): Promise<T> {
      const start = Date.now();
      let success = false;
      let resultCount = 0;
      let code: string | undefined;
      try {
        assertReportingPrincipal(principal);
        const result = await action();
        if (result && typeof result === 'object') {
          const value = result as Record<string, unknown>;
          resultCount = Number(
            value.returned ?? value.count ?? (Array.isArray(value.fields) ? value.fields.length : 1)
          );
        }
        success = true;
        return result;
      } catch (error) {
        code = error instanceof ReportingError ? error.code : 'UNAVAILABLE';
        throw error instanceof ReportingError ? error : new ReportingError('UNAVAILABLE');
      } finally {
        this.logger.info({
          event: 'reporting',
          channel: audit?.channel ?? 'direct',
          tool: audit?.tool,
          userId: principal?.user?.id,
          brandId: principal?.brand?.id,
          recordType,
          fields,
          operation,
          durationMs: Date.now() - start,
          resultCount,
          success,
          code,
        });
      }
    }
    public count(
      principal: ReportingPrincipal,
      input: Omit<Extract<ReportingQuery, { operation: 'count' }>, 'operation'>
    ) {
      return this.execute(principal, { ...input, operation: 'count' });
    }
    public group(
      principal: ReportingPrincipal,
      input: Omit<Extract<ReportingQuery, { operation: 'group' }>, 'operation'>
    ) {
      return this.execute(principal, { ...input, operation: 'group' });
    }
    public timeSeries(
      principal: ReportingPrincipal,
      input: Omit<Extract<ReportingQuery, { operation: 'time_series' }>, 'operation'>
    ) {
      return this.execute(principal, { ...input, operation: 'time_series' });
    }
    public search(
      principal: ReportingPrincipal,
      input: Omit<Extract<ReportingQuery, { operation: 'search' }>, 'operation'>
    ) {
      return this.execute(principal, { ...input, operation: 'search' });
    }
    public getRecord(
      principal: ReportingPrincipal,
      input: Omit<Extract<ReportingQuery, { operation: 'get_record' }>, 'operation'>
    ) {
      return this.execute(principal, { ...input, operation: 'get_record' });
    }
  }
}
declare global {
  let ReportingService: Services.Reporting;
}
