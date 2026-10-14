import * as crypto from 'node:crypto';
import { Services as services } from '../CoreService';
import type { SiemConfigDto, SiemSeverity } from '../configmodels/SiemConfiguration';
import { normalizeSiemConfiguration, DEFAULT_SIEM_REDACTION } from '../configmodels/SiemConfiguration';
import type { SecurityEventAttributes } from '../waterline-models/SecurityEvent';
import { redactForSiem } from './siem/SiemPayloadRedactor';
import type { SecurityEventInput } from './siem/SiemTypes';

type AgendaJobLike = { attrs?: { data?: unknown } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSecurityEvent(value: unknown): value is SecurityEventAttributes {
  return (
    isRecord(value) &&
    ['id', 'eventId', 'brandId', 'eventType', 'category', 'severity', 'occurredAt', 'source', 'deliveryState'].every(
      key => typeof value[key] === 'string'
    )
  );
}

export namespace Services {
  export class SecurityEventService extends services.Core.Service {
    private readonly storeJobName = 'SecurityEventService-StoreSecurityEvent';
    private readonly forwardJobName = 'SiemForwardingService-ForwardSecurityEvents';

    protected override _exportedMethods: string[] = [
      'emitSecurityEvent',
      'requestContext',
      'emitRequestFailure',
      'emitFromUserAudit',
      'emitFromRecordAudit',
      'emitFromIntegrationAudit',
      'emitFromAttachmentAudit',
      'storeSecurityEvent',
      'queryEvents',
    ];

    constructor() {
      super();
      this.logHeader = 'SecurityEventService::';
    }

    private getConfig(brandId: string): SiemConfigDto {
      const brand = BrandingService.getBrandById(brandId) ?? BrandingService.getBrand(brandId);
      if (!brand) return normalizeSiemConfiguration({});
      const brandConfig = AppConfigService.getAppConfigurationForBrand(brand.name);
      return normalizeSiemConfiguration(_.get(brandConfig, 'siem', {}));
    }

    private severityFor(config: SiemConfigDto, input: SecurityEventInput): SiemSeverity {
      return config.events?.severity?.[input.eventType] ?? input.severity ?? 'info';
    }

    private shouldEmit(config: SiemConfigDto, input: SecurityEventInput): boolean {
      return config.enabled === true && config.events?.categories?.[input.category] !== false;
    }

    private buildEvent(config: SiemConfigDto, input: SecurityEventInput): Omit<SecurityEventAttributes, 'id'> {
      const redaction = { ...DEFAULT_SIEM_REDACTION, ...(config.redaction ?? {}) };
      const event: Omit<SecurityEventAttributes, 'id'> = {
        eventId: crypto.randomUUID(),
        brandId: input.brandId,
        portalId: input.portalId,
        eventType: input.eventType,
        category: input.category,
        severity: this.severityFor(config, input),
        occurredAt: input.occurredAt ?? new Date().toISOString(),
        source: input.source,
        actor: input.actor,
        subject: input.subject,
        resource: input.resource,
        requestContext: input.requestContext,
        payload: input.payload,
        correlationId: input.correlationId,
        traceId: input.traceId,
        deliveryState: 'pending',
        destinationStates: {},
      };
      const sanitized = redactForSiem(event, redaction);
      return {
        ...event,
        actor: isRecord(sanitized.actor) ? sanitized.actor : undefined,
        subject: isRecord(sanitized.subject) ? sanitized.subject : undefined,
        resource: isRecord(sanitized.resource) ? sanitized.resource : undefined,
        requestContext: isRecord(sanitized.requestContext) ? sanitized.requestContext : undefined,
        payload: isRecord(sanitized.payload) ? sanitized.payload : undefined,
      };
    }

    public async emitSecurityEvent(input: SecurityEventInput): Promise<void> {
      try {
        if (typeof input.brandId !== 'string' || !input.brandId.trim()) return;
        const config = this.getConfig(input.brandId);
        if (!this.shouldEmit(config, input)) {
          return;
        }
        const event = this.buildEvent(config, input);
        await AgendaQueueService.now(this.storeJobName, { event });
      } catch {
        sails.log.error(`${this.logHeader} Failed to enqueue security event`);
      }
    }

    /** Selected request fields only: never include body, cookies, headers or session. */
    public requestContext(req: Sails.Req): Record<string, unknown> {
      const brand = BrandingService.getBrandFromReq(req);
      return {
        brandId: brand?.id,
        portalId: BrandingService.getPortalFromReq(req),
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
      };
    }

    public async emitRequestFailure(
      req: Sails.Req,
      eventType: 'authentication.login.failure' | 'authorization.failure',
      source: string
    ): Promise<void> {
      try {
        const context = this.requestContext(req);
        if (typeof context.brandId !== 'string' || !context.brandId) return;
        await this.emitSecurityEvent({
          brandId: context.brandId,
          portalId: typeof context.portalId === 'string' ? context.portalId : undefined,
          eventType,
          category: eventType === 'authorization.failure' ? 'authorization' : 'authentication',
          severity: 'warning',
          source,
          actor: isRecord(req.user)
            ? { id: req.user.id, username: req.user.username, email: req.user.email }
            : undefined,
          requestContext: context,
        });
      } catch {
        sails.log.error(`${this.logHeader} Failed to capture request security event`);
      }
    }

    public async emitFromUserAudit(
      user: unknown,
      action: string,
      context: Record<string, unknown> = {}
    ): Promise<void> {
      const brandValue = context.brandId ?? context.branding;
      if (typeof brandValue !== 'string' || brandValue.trim() === '') return;
      const brand =
        typeof brandValue === 'string'
          ? (BrandingService.getBrandById(brandValue) ?? BrandingService.getBrand(brandValue))
          : undefined;
      const brandId = String(brand?.id ?? brandValue);
      await this.emitSecurityEvent({
        brandId,
        portalId: typeof context.portalId === 'string' ? context.portalId : undefined,
        eventType: action === 'login' || action === 'logout' ? `authentication.${action}.success` : `user.${action}`,
        category: action.includes('login') || action.includes('logout') ? 'authentication' : 'userManagement',
        source: 'UsersService',
        actor: isRecord(user) ? user : undefined,
        requestContext: context,
      });
    }

    public async emitFromRecordAudit(recordAudit: Record<string, unknown>): Promise<void> {
      const brandId = await this.resolveBrandId(recordAudit);
      if (!brandId) return;
      await this.emitSecurityEvent({
        brandId,
        eventType: `record.${String(recordAudit.action ?? 'audit')}`,
        category: 'recordLifecycle',
        source: 'RecordsService',
        occurredAt: typeof recordAudit.occurredAt === 'string' ? recordAudit.occurredAt : undefined,
        actor: isRecord(recordAudit.user) ? recordAudit.user : undefined,
        resource: recordAudit,
        payload: recordAudit,
      });
    }

    public async emitFromIntegrationAudit(integrationAudit: Record<string, unknown>): Promise<void> {
      if (typeof integrationAudit.brandId !== 'string' || !integrationAudit.brandId) return;
      await this.emitSecurityEvent({
        brandId: String(integrationAudit.brandId),
        eventType: `integration.${String(integrationAudit.status).toLowerCase() === 'failed' ? 'failure' : String(integrationAudit.status ?? 'audit')}`,
        category: 'integrationAudit',
        severity: String(integrationAudit.status).toLowerCase() === 'failed' ? 'error' : 'info',
        source: 'IntegrationAuditService',
        resource: integrationAudit,
        payload: integrationAudit,
        traceId: typeof integrationAudit.traceId === 'string' ? integrationAudit.traceId : undefined,
      });
    }

    public async emitFromAttachmentAudit(attachmentAudit: Record<string, unknown>): Promise<void> {
      const brandId = await this.resolveBrandId(attachmentAudit);
      if (!brandId) return;
      await this.emitSecurityEvent({
        brandId,
        eventType: `attachment.${String(attachmentAudit.action ?? 'audit')}`,
        category: 'attachmentAccess',
        source: 'StandardDatastreamService',
        resource: attachmentAudit,
        payload: attachmentAudit,
      });
    }

    public async storeSecurityEvent(job: AgendaJobLike): Promise<void> {
      const data = job.attrs?.data;
      if (!isRecord(data) || !isRecord(data.event)) return;
      const event = data.event;
      if (typeof event.brandId !== 'string') return;
      await SecurityEvent.create(event);
      await AgendaQueueService.now(this.forwardJobName, { brandId: event.brandId });
    }

    public async queryEvents(
      params: Record<string, unknown> = {}
    ): Promise<{ rows: SecurityEventAttributes[]; total: number }> {
      const requestedLimit = Number.parseInt(String(params.limit ?? 50), 10);
      const requestedSkip = Number.parseInt(String(params.skip ?? params.offset ?? 0), 10);
      const limit = Math.min(Number.isFinite(requestedLimit) ? Math.max(requestedLimit, 0) : 50, 500);
      const skip = Math.max(Number.isFinite(requestedSkip) ? requestedSkip : 0, 0);
      const where: Record<string, unknown> = {};
      ['brandId', 'eventType', 'category', 'severity', 'deliveryState'].forEach(key => {
        if (typeof params[key] === 'string' && params[key] !== '') {
          where[key] = params[key];
        }
      });
      const occurredAt: Record<string, string> = {};
      if (typeof params.occurredAtStart === 'string' && params.occurredAtStart !== '') {
        occurredAt['>='] = params.occurredAtStart;
      }
      if (typeof params.occurredAtEnd === 'string' && params.occurredAtEnd !== '') {
        occurredAt['<='] = params.occurredAtEnd;
      }
      if (Object.keys(occurredAt).length > 0) {
        where.occurredAt = occurredAt;
      }
      const query = SecurityEvent.find(where).sort('occurredAt DESC').skip(skip).limit(limit);
      const result = await query;
      const rows: SecurityEventAttributes[] = Array.isArray(result) ? result.filter(isSecurityEvent) : [];
      const total = await SecurityEvent.count(where);
      return { rows, total };
    }

    private async resolveBrandId(payload: Record<string, unknown>): Promise<string | undefined> {
      const directBrand =
        payload.brandId ??
        payload.branding ??
        _.get(payload, 'record.metaMetadata.brandId') ??
        _.get(payload, 'metaMetadata.brandId') ??
        _.get(payload, 'record.validationBypass.recordContext.brand');
      if (typeof directBrand === 'string' && directBrand.trim() !== '') {
        const brand = BrandingService.getBrandById(directBrand) ?? BrandingService.getBrand(directBrand);
        return String(brand?.id ?? directBrand);
      }

      const oid = String(payload.redboxOid ?? payload.oid ?? '').trim();
      if (oid) {
        const record = await Record.findOne({ redboxOid: oid });
        const recordBrandId = _.get(record, 'metaMetadata.brandId');
        if (typeof recordBrandId === 'string' && recordBrandId.trim() !== '') {
          return recordBrandId;
        }
      }

      // Unknown ownership cannot safely be forwarded to the default brand.
      return undefined;
    }
  }
}

declare global {
  let SecurityEventService: Services.SecurityEventService;
}
