import * as crypto from 'node:crypto';
import { trace } from '@opentelemetry/api';
import { Services as services } from '../CoreService';
import { IntegrationAuditParams } from '../IntegrationAuditParams';

import {
  IntegrationAuditActionLike,
  IntegrationAuditModel,
  IntegrationAuditName,
  IntegrationAuditNameLike,
  IntegrationAuditStatus,
} from '../model/storage/IntegrationAuditModel';
import { StorageServiceResponse } from '../StorageServiceResponse';
import { redactObject } from './figshare-v2/observability';
import { StorageService } from '../StorageService';

type AnyRecord = Record<string, unknown>;


export type IntegrationAuditContext = {
  redboxOid: string;
  brandId?: string;
  integrationName: IntegrationAuditNameLike;
  integrationAction: IntegrationAuditActionLike;
  triggeredBy?: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startedAt: string;
  requestSummary?: Record<string, unknown>;
};

export type IntegrationAuditLogResult = {
  rows: Record<string, unknown>[];
  total: number;
};

export type IntegrationAuditTraceEvent = Record<string, unknown> & {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startedAt: string;
  status: string;
  depth: number;
  hasChildren: boolean;
};

export type IntegrationAuditTraceRecord = {
  id: string;
  traceId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  triggeredBy?: string;
  integrationName?: string;
  actions: string[];
  eventCount: number;
  rootSpanId?: string;
  events: IntegrationAuditTraceEvent[];
};

export type IntegrationAuditTraceLogResult = {
  rows: IntegrationAuditTraceRecord[];
  total: number;
};

type IntegrationAuditOptions = {
  brandId?: string;
  integrationName?: IntegrationAuditNameLike;
  triggeredBy?: string;
  requestSummary?: Record<string, unknown>;
  message?: string;
  httpStatusCode?: number;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
};

const MAX_DEPTH = 1000;
const MAX_BATCH = 500;

export namespace Services {
  export class IntegrationAuditService extends services.Core.Service {
    protected readonly storeJobName = 'IntegrationAuditService-StoreIntegrationAudit';

    storageService!: StorageService;

    protected override _exportedMethods: string[] = [
      'init',
      'startAudit',
      'completeAudit',
      'failAudit',
      'getAuditLog',
      'getTraceAuditLog',
      'storeIntegrationAudit',
    ];

    constructor() {
      super();
      this.logHeader = 'IntegrationAuditService::';
    }

    public override init() {
      const that = this;
      this.registerSailsHook(
        'after',
        ['hook:redbox:storage:ready', 'hook:redbox:datastream:ready', 'ready'],
        function () {
          that.getServices(that);
        }
      );
    }

    private getServices(ref: IntegrationAuditService = this) {
      ref.getStorageService(ref);
    }

    getStorageService(ref: IntegrationAuditService = this) {
      ref.storageService = sails.services[sails.config.storage.serviceName] as unknown as StorageService;
    }

    private getResolvedEnvironment(): string {
      return String((sails.config as AnyRecord).environment ?? process.env.NODE_ENV ?? '');
    }

    private generateTraceId(): string {
      return crypto.randomBytes(16).toString('hex');
    }

    private generateSpanId(): string {
      return crypto.randomBytes(8).toString('hex');
    }

    private extractTraceContext(): { traceId: string; spanId: string; parentSpanId?: string } {
      const activeSpan = trace.getActiveSpan();
      const spanContext = activeSpan?.spanContext();
      return {
        traceId: spanContext?.traceId ?? this.generateTraceId(),
        spanId: spanContext?.spanId ?? this.generateSpanId(),
        // TODO: revisit extractTraceContext if trace.getActiveSpan exposes an official parent span id API.
        parentSpanId: undefined,
      };
    }

    private resolveTraceContext(opts: IntegrationAuditOptions): { traceId: string; spanId: string; parentSpanId?: string } {
      const activeTraceContext = this.extractTraceContext();
      return {
        traceId: this.getString(opts.traceId) ?? activeTraceContext.traceId,
        spanId: this.getString(opts.spanId) ?? activeTraceContext.spanId,
        parentSpanId: this.getString(opts.parentSpanId) ?? activeTraceContext.parentSpanId,
      };
    }

    private sanitizeText(value: unknown, maxLength: number = 1000): string | undefined {
      if (_.isNil(value)) {
        return undefined;
      }
      if (value instanceof Error) {
        return value.message.slice(0, maxLength);
      }
      const redacted = redactObject(value);
      const text = typeof redacted === 'string' ? redacted : JSON.stringify(redacted);
      if (_.isEmpty(text)) {
        return undefined;
      }
      return String(text).slice(0, maxLength);
    }

    private sanitizeSummary(value: unknown): Record<string, unknown> | undefined {
      if (_.isNil(value)) {
        return undefined;
      }
      const redacted = redactObject(value);
      if (_.isPlainObject(redacted)) {
        return redacted as Record<string, unknown>;
      }
      if (Array.isArray(redacted)) {
        return { items: redacted.slice(0, 20) };
      }
      if (typeof redacted === 'string' || typeof redacted === 'number' || typeof redacted === 'boolean') {
        return { value: redacted };
      }
      return undefined;
    }

    private mergeSummaries(
      baseSummary: Record<string, unknown> | undefined,
      extraSummary: unknown
    ): Record<string, unknown> | undefined {
      const sanitizedExtra = this.sanitizeSummary(extraSummary);
      if (baseSummary == null) {
        return sanitizedExtra;
      }
      if (sanitizedExtra == null) {
        return baseSummary;
      }
      return {
        ...baseSummary,
        ...sanitizedExtra,
      };
    }

    private buildAuditEntry(
      ctx: IntegrationAuditContext,
      status: IntegrationAuditStatus,
      details: {
        message?: string;
        errorDetail?: string;
        httpStatusCode?: number;
        requestSummary?: unknown;
        responseSummary?: Record<string, unknown>;
        completedAt?: string;
        durationMs?: number;
      } = {}
    ): IntegrationAuditModel {
      return new IntegrationAuditModel({
        redboxOid: ctx.redboxOid,
        brandId: ctx.brandId,
        integrationName: ctx.integrationName,
        integrationAction: ctx.integrationAction,
        triggeredBy: ctx.triggeredBy,
        status,
        message: details.message,
        errorDetail: details.errorDetail,
        httpStatusCode: details.httpStatusCode,
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        parentSpanId: ctx.parentSpanId,
        startedAt: ctx.startedAt,
        completedAt: details.completedAt,
        durationMs: details.durationMs,
        requestSummary: this.mergeSummaries(ctx.requestSummary, details.requestSummary),
        responseSummary: details.responseSummary,
      });
    }

    private async persistEntry(entry: IntegrationAuditModel): Promise<void> {
      try {
        if (typeof this.storageService?.createIntegrationAudit !== 'function') {
          sails.log.error(`${this.logHeader} Storage service does not expose createIntegrationAudit.`);
          return;
        }
        const response = await this.storageService.createIntegrationAudit(entry) as StorageServiceResponse;
        if (response?.isSuccessful != null && typeof response.isSuccessful === 'function' && !response.isSuccessful()) {
          sails.log.error(`${this.logHeader} Failed to persist integration audit.`);
          if (!_.isEmpty(response.message)) {
            sails.log.error(`${this.logHeader} Storage response message: ${response.message}`);
          }
          if (!_.isNil(response.details)) {
            sails.log.error(`${this.logHeader} Storage response details: ${JSON.stringify(response.details)}`);
          }
        }
      } catch (error) {
        sails.log.error(`${this.logHeader} Failed to persist integration audit entry.`);
        sails.log.error(error);
      }
    }

    private queueOrPersist(entry: IntegrationAuditModel): void {
      if (this.getResolvedEnvironment() === 'integrationtest') {
        void this.persistEntry(entry);
        return;
      }
      try {
        AgendaQueueService.now(this.storeJobName, entry);
      } catch (error) {
        sails.log.error(`${this.logHeader} Failed to queue integration audit entry.`);
        sails.log.error(error);
      }
    }

    public startAudit(oid: string, action: IntegrationAuditActionLike, opts: IntegrationAuditOptions = {}): IntegrationAuditContext {
      const startedAt = new Date().toISOString();
      const traceContext = this.resolveTraceContext(opts);
      const ctx: IntegrationAuditContext = {
        redboxOid: oid,
        brandId: opts.brandId,
        integrationName: opts.integrationName ?? IntegrationAuditName.figshare,
        integrationAction: action,
        triggeredBy: opts.triggeredBy,
        traceId: traceContext.traceId,
        spanId: traceContext.spanId,
        parentSpanId: traceContext.parentSpanId,
        startedAt,
        requestSummary: this.sanitizeSummary(opts.requestSummary),
      };
      const entry = this.buildAuditEntry(ctx, IntegrationAuditStatus.started, {
        message: this.sanitizeText(opts.message),
        httpStatusCode: opts.httpStatusCode,
      });
      this.queueOrPersist(entry);
      return ctx;
    }

    public completeAudit(ctx: IntegrationAuditContext | null | undefined, result?: AnyRecord): void {
      if (ctx == null) {
        return;
      }
      const completedAt = new Date().toISOString();
      const durationMs = Math.max(0, new Date(completedAt).getTime() - new Date(ctx.startedAt).getTime());
      const entry = this.buildAuditEntry(ctx, IntegrationAuditStatus.success, {
        message: this.sanitizeText(result?.message ?? 'Integration action completed successfully.'),
        httpStatusCode: _.isNumber(result?.httpStatusCode) ? (result?.httpStatusCode as number) : undefined,
        requestSummary: result?.requestSummary,
        responseSummary: this.sanitizeSummary(result?.responseSummary ?? result),
        completedAt,
        durationMs,
      });
      this.queueOrPersist(entry);
    }

    public failAudit(ctx: IntegrationAuditContext | null | undefined, error: unknown, details: AnyRecord = {}): void {
      if (ctx == null) {
        return;
      }
      const completedAt = new Date().toISOString();
      const durationMs = Math.max(0, new Date(completedAt).getTime() - new Date(ctx.startedAt).getTime());
      const entry = this.buildAuditEntry(ctx, IntegrationAuditStatus.failed, {
        message: this.sanitizeText(details.message ?? (error instanceof Error ? error.message : String(error))),
        errorDetail: this.sanitizeText(details.errorDetail ?? error),
        httpStatusCode: _.isNumber(details.httpStatusCode) ? (details.httpStatusCode as number) : undefined,
        requestSummary: details.requestSummary,
        responseSummary: this.sanitizeSummary(details.responseSummary),
        completedAt,
        durationMs,
      });
      this.queueOrPersist(entry);
    }

    public async getAuditLog(params: IntegrationAuditParams): Promise<IntegrationAuditLogResult> {
      const rows = (await this.storageService.getIntegrationAudit(params)) as Record<string, unknown>[];
      const total = typeof this.storageService.countIntegrationAudit === 'function'
        ? await this.storageService.countIntegrationAudit(params)
        : rows.length;
      return { rows, total };
    }

    private getString(value: unknown): string | undefined {
      const text = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
      return _.isEmpty(text) ? undefined : text;
    }

    private getTimestampValue(row: Record<string, unknown>, ...keys: string[]): number {
      for (const key of keys) {
        const value = this.getString(row[key]);
        if (!_.isEmpty(value)) {
          const parsed = new Date(value as string).getTime();
          if (Number.isFinite(parsed)) {
            return parsed;
          }
        }
      }
      return 0;
    }

    private getRowSortTimestamp(row: Record<string, unknown>): number {
      return this.getTimestampValue(row, 'startedAt', 'completedAt', 'dateCreated', 'updatedAt', 'createdAt');
    }

    private getStatusRank(status: unknown): number {
      switch (this.getString(status)?.toLowerCase()) {
        case IntegrationAuditStatus.failed:
          return 3;
        case IntegrationAuditStatus.success:
          return 2;
        case IntegrationAuditStatus.started:
          return 1;
        default:
          return 0;
      }
    }

    private buildEventId(row: Record<string, unknown>, traceId: string, index: number): string {
      const persistedId = this.getString(row['id']);
      if (persistedId) {
        return persistedId;
      }
      const spanId = this.getString(row['spanId']) ?? `event-${index}`;
      return `${traceId}:${spanId}:${index}`;
    }

    private buildSpanEvents(rows: Record<string, unknown>[], traceId: string): Record<string, unknown>[] {
      const spans = new Map<string, Array<{ row: Record<string, unknown>; index: number }>>();

      rows.forEach((row, index) => {
        const spanId = this.getString(row['spanId']) ?? `${traceId}:unknown-span:${index}`;
        const existing = spans.get(spanId) ?? [];
        existing.push({ row, index });
        spans.set(spanId, existing);
      });

      return Array.from(spans.entries()).map(([spanId, spanRows]) => {
        const sortedSpanRows = [...spanRows].sort(
          (left, right) => this.getRowSortTimestamp(left.row) - this.getRowSortTimestamp(right.row)
        );
        const preferredEntry = [...sortedSpanRows].sort((left, right) => {
          const statusDiff = this.getStatusRank(right.row['status']) - this.getStatusRank(left.row['status']);
          if (statusDiff !== 0) {
            return statusDiff;
          }
          const completedDiff = this.getTimestampValue(right.row, 'completedAt', 'updatedAt', 'dateCreated', 'createdAt')
            - this.getTimestampValue(left.row, 'completedAt', 'updatedAt', 'dateCreated', 'createdAt');
          if (completedDiff !== 0) {
            return completedDiff;
          }
          return right.index - left.index;
        })[0];
        const preferredRow = preferredEntry?.row ?? {};
        const earliestRow = sortedSpanRows[0]?.row ?? {};
        const parentSpanId = sortedSpanRows
          .map(entry => this.getString(entry.row['parentSpanId']))
          .find(Boolean);
        const startedTimes = sortedSpanRows
          .map(entry => this.getString(entry.row['startedAt']))
          .filter(Boolean)
          .map(value => ({ raw: value as string, ts: new Date(value as string).getTime() }))
          .filter(value => Number.isFinite(value.ts))
          .sort((left, right) => left.ts - right.ts);
        const completedTimes = sortedSpanRows
          .map(entry => this.getString(entry.row['completedAt']))
          .filter(Boolean)
          .map(value => ({ raw: value as string, ts: new Date(value as string).getTime() }))
          .filter(value => Number.isFinite(value.ts))
          .sort((left, right) => right.ts - left.ts);
        const startedAt = startedTimes[0]?.raw ?? this.getString(earliestRow['startedAt']) ?? this.getString(preferredRow['startedAt']) ?? '';
        const completedAt = completedTimes[0]?.raw ?? this.getString(preferredRow['completedAt']);
        const startedAtMs = startedTimes[0]?.ts;
        const completedAtMs = completedTimes[0]?.ts;
        const durationMs =
          Number.isFinite(startedAtMs) && Number.isFinite(completedAtMs) && (completedAtMs as number) >= (startedAtMs as number)
            ? (completedAtMs as number) - (startedAtMs as number)
            : (_.isNumber(preferredRow['durationMs']) ? preferredRow['durationMs'] as number : undefined);

        return {
          ...(earliestRow as Record<string, unknown>),
          ...(preferredRow as Record<string, unknown>),
          id: this.buildEventId(preferredRow as Record<string, unknown>, traceId, preferredEntry?.index ?? 0),
          traceId,
          spanId,
          parentSpanId,
          startedAt,
          completedAt,
          durationMs,
          status: this.getString(preferredRow['status']) ?? '',
        };
      });
    }

    private buildOrderedTraceEvents(rows: Record<string, unknown>[], traceId: string): IntegrationAuditTraceEvent[] {
      const sortedRows = this.buildSpanEvents(rows, traceId).sort(
        (left, right) => this.getRowSortTimestamp(left) - this.getRowSortTimestamp(right)
      );
      const childrenByParent = new Map<string, Array<{ row: Record<string, unknown>; index: number }>>();
      const roots: Array<{ row: Record<string, unknown>; index: number }> = [];
      const spanIds = new Set(sortedRows.map(row => this.getString(row['spanId'])).filter(Boolean) as string[]);

      sortedRows.forEach((row, index) => {
        const parentSpanId = this.getString(row['parentSpanId']);
        if (parentSpanId && spanIds.has(parentSpanId)) {
          const siblings = childrenByParent.get(parentSpanId) ?? [];
          siblings.push({ row, index });
          childrenByParent.set(parentSpanId, siblings);
        } else {
          roots.push({ row, index });
        }
      });

      const orderedEvents: IntegrationAuditTraceEvent[] = [];
      const visited = new Set<string>();

      const visitNode = (entry: { row: Record<string, unknown>; index: number }, depth: number) => {
        const spanId = this.getString(entry.row['spanId']) ?? `${traceId}:unknown-span:${entry.index}`;
        const visitKey = `${spanId}:${entry.index}`;
        if (visited.has(visitKey)) {
          return;
        }
        visited.add(visitKey);
        const children = [...(childrenByParent.get(spanId) ?? [])].sort(
          (left, right) => this.getRowSortTimestamp(left.row) - this.getRowSortTimestamp(right.row)
        );
        orderedEvents.push({
          ...(entry.row as Record<string, unknown>),
          id: this.buildEventId(entry.row, traceId, entry.index),
          traceId,
          spanId,
          parentSpanId: this.getString(entry.row['parentSpanId']),
          startedAt: this.getString(entry.row['startedAt']) ?? '',
          status: this.getString(entry.row['status']) ?? '',
          depth,
          hasChildren: children.length > 0,
        });
        if (depth >= MAX_DEPTH) {
          return;
        }
        children.forEach(child => visitNode(child, depth + 1));
      };

      roots.forEach(root => visitNode(root, 0));
      sortedRows.forEach((row, index) => visitNode({ row, index }, 0));
      return orderedEvents;
    }

    private deriveTraceStatus(events: IntegrationAuditTraceEvent[]): string {
      const statuses = events
        .map(event => this.getString(event['status'])?.toLowerCase())
        .filter(Boolean);
      if (statuses.some(status => status === IntegrationAuditStatus.failed)) {
        return IntegrationAuditStatus.failed;
      }
      if (statuses.length === 0 || statuses.some(status => status === IntegrationAuditStatus.started)) {
        return IntegrationAuditStatus.started;
      }
      return IntegrationAuditStatus.success;
    }

    private buildTraceRecord(traceId: string, rows: Record<string, unknown>[]): IntegrationAuditTraceRecord {
      const events = this.buildOrderedTraceEvents(rows, traceId);
      const status = this.deriveTraceStatus(events);
      const startedTimes = rows
        .map(row => this.getString(row['startedAt']))
        .filter(Boolean)
        .map(value => ({ raw: value as string, ts: new Date(value as string).getTime() }))
        .filter(value => Number.isFinite(value.ts))
        .sort((left, right) => left.ts - right.ts);
      const completedTimes = rows
        .map(row => this.getString(row['completedAt']))
        .filter(Boolean)
        .map(value => ({ raw: value as string, ts: new Date(value as string).getTime() }))
        .filter(value => Number.isFinite(value.ts))
        .sort((left, right) => right.ts - left.ts);
      const oldestStartedAt = startedTimes[0]?.raw ?? '';
      const latestCompletedAt = completedTimes[0]?.raw;
      const startedAtMs = startedTimes[0]?.ts;
      const completedAtMs = completedTimes[0]?.ts;
      const traceDuration =
        Number.isFinite(startedAtMs) && Number.isFinite(completedAtMs) && (completedAtMs as number) >= (startedAtMs as number)
          ? (completedAtMs as number) - (startedAtMs as number)
          : undefined;
      const actions = Array.from(
        new Set(
          events
            .map(event => this.getString(event['integrationAction']))
            .filter(Boolean)
        )
      ) as string[];
      const rootSpanId = events.find(event => _.isEmpty(event.parentSpanId))?.spanId;
      const newestRow = [...rows].sort((left, right) => this.getRowSortTimestamp(right) - this.getRowSortTimestamp(left))[0] ?? {};

      return {
        id: traceId,
        traceId,
        status,
        startedAt: oldestStartedAt,
        completedAt: latestCompletedAt,
        durationMs: traceDuration,
        triggeredBy: this.getString(newestRow['triggeredBy']) ?? this.getString(rows[0]?.['triggeredBy']),
        integrationName: this.getString(newestRow['integrationName']) ?? this.getString(rows[0]?.['integrationName']),
        actions,
        eventCount: events.length,
        rootSpanId,
        events,
      };
    }

    private async getAllIntegrationAuditRows(params: IntegrationAuditParams): Promise<Record<string, unknown>[]> {
      if (typeof this.storageService.countIntegrationAudit === 'function') {
        const totalRows = await this.storageService.countIntegrationAudit(params);
        if (totalRows === 0) {
          return [];
        }

        const rows: Record<string, unknown>[] = [];
        let page = 1;

        while (rows.length < totalRows) {
          const queryParams = new IntegrationAuditParams();
          queryParams.oid = params.oid;
          queryParams.dateFrom = params.dateFrom;
          queryParams.dateTo = params.dateTo;
          queryParams.page = page;
          queryParams.pageSize = Math.min(MAX_BATCH, totalRows - rows.length);

          const pageRows = (await this.storageService.getIntegrationAudit(queryParams)) as Record<string, unknown>[];
          if (pageRows.length === 0) {
            break;
          }

          rows.push(...pageRows);
          if (pageRows.length < queryParams.pageSize) {
            break;
          }

          page += 1;
        }

        return rows;
      }

      const rows: Record<string, unknown>[] = [];
      let page = 1;

      while (true) {
        const queryParams = new IntegrationAuditParams();
        queryParams.oid = params.oid;
        queryParams.dateFrom = params.dateFrom;
        queryParams.dateTo = params.dateTo;
        queryParams.page = page;
        queryParams.pageSize = MAX_BATCH;

        const pageRows = (await this.storageService.getIntegrationAudit(queryParams)) as Record<string, unknown>[];
        rows.push(...pageRows);
        if (pageRows.length < MAX_BATCH) {
          break;
        }
        page += 1;
      }

      return rows;
    }

    public async getTraceAuditLog(params: IntegrationAuditParams): Promise<IntegrationAuditTraceLogResult> {
      const queryParams = new IntegrationAuditParams();
      queryParams.oid = params.oid;
      queryParams.dateFrom = params.dateFrom;
      queryParams.dateTo = params.dateTo;

      const allRows = await this.getAllIntegrationAuditRows(queryParams);
      if (allRows.length === 0) {
        return { rows: [], total: 0 };
      }
      const traceRows = new Map<string, Record<string, unknown>[]>();
      allRows.forEach(row => {
        const traceId = this.getString(row['traceId']) ?? `${params.oid}:missing-trace`;
        const existing = traceRows.get(traceId) ?? [];
        existing.push(row);
        traceRows.set(traceId, existing);
      });

      let groupedRows = Array.from(traceRows.entries()).map(([traceId, rows]) => this.buildTraceRecord(traceId, rows));
      if (!_.isEmpty(params.integrationName)) {
        const integrationNameFilter = String(params.integrationName).trim().toLowerCase();
        groupedRows = groupedRows.filter(row => (row.integrationName ?? '').toLowerCase().includes(integrationNameFilter));
      }
      if (!_.isEmpty(params.status)) {
        groupedRows = groupedRows.filter(row => row.status === params.status);
      }

      groupedRows.sort((left, right) => {
        const rightTs = Math.max(...right.events.map(event => this.getRowSortTimestamp(event)), 0);
        const leftTs = Math.max(...left.events.map(event => this.getRowSortTimestamp(event)), 0);
        return rightTs - leftTs;
      });

      const total = groupedRows.length;
      const page = _.toInteger(params.page) > 0 ? _.toInteger(params.page) : 1;
      const pageSize = _.toInteger(params.pageSize) > 0 ? _.toInteger(params.pageSize) : 20;
      const skip = (page - 1) * pageSize;

      return {
        rows: groupedRows.slice(skip, skip + pageSize),
        total,
      };
    }

    public storeIntegrationAudit(job: AnyRecord): void {
      const jobObj = job as AnyRecord;
      const jobAttrs = (jobObj.attrs ?? {}) as AnyRecord;
      const data = ((jobAttrs.data ?? jobAttrs) as Partial<IntegrationAuditModel>) ?? {};
      try {
        const entry = new IntegrationAuditModel(data);
        void this.persistEntry(entry);
      } catch (error) {
        sails.log.error(`${this.logHeader} Failed to construct integration audit entry from queued payload.`);
        sails.log.error(error);
      }
    }
  }
}

declare global {
  const IntegrationAuditService: Services.IntegrationAuditService;
}
