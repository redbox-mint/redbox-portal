import * as crypto from 'node:crypto';
import { trace } from '@opentelemetry/api';
import { Services as services } from '../CoreService';
import { IntegrationAuditParams } from '../IntegrationAuditParams';

import {
  IntegrationAuditAction,
  IntegrationAuditModel,
  IntegrationAuditName,
  IntegrationAuditStatus,
} from '../model/storage/IntegrationAuditModel';
import { StorageServiceResponse } from '../StorageServiceResponse';
import { redactObject } from './figshare-v2/observability';
import { StorageService } from '../StorageService';

type AnyRecord = Record<string, unknown>;


export type IntegrationAuditContext = {
  redboxOid: string;
  brandId?: string;
  integrationName: IntegrationAuditName;
  integrationAction: IntegrationAuditAction;
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

type IntegrationAuditOptions = {
  brandId?: string;
  triggeredBy?: string;
  requestSummary?: Record<string, unknown>;
  message?: string;
  httpStatusCode?: number;
};

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

    private buildAuditEntry(
      ctx: IntegrationAuditContext,
      status: IntegrationAuditStatus,
      details: {
        message?: string;
        errorDetail?: string;
        httpStatusCode?: number;
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
        requestSummary: ctx.requestSummary,
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

    public startAudit(oid: string, action: IntegrationAuditAction, opts: IntegrationAuditOptions = {}): IntegrationAuditContext {
      const startedAt = new Date().toISOString();
      const traceContext = this.extractTraceContext();
      const ctx: IntegrationAuditContext = {
        redboxOid: oid,
        brandId: opts.brandId,
        integrationName: IntegrationAuditName.figshare,
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

    public storeIntegrationAudit(job: AnyRecord): void {
      const jobObj = job as AnyRecord;
      const jobAttrs = (jobObj.attrs ?? {}) as AnyRecord;
      const data = ((jobAttrs.data ?? jobAttrs) as Partial<IntegrationAuditModel>) ?? {};
      void this.persistEntry(new IntegrationAuditModel(data));
    }
  }
}
