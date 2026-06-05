import * as crypto from 'node:crypto';
import { Services as services } from '../CoreService';
import type { SiemConfiguration, SiemSeverity } from '../configmodels/SiemConfiguration';
import { DEFAULT_SIEM_DELIVERY, DEFAULT_SIEM_EVENT_SELECTION, DEFAULT_SIEM_REDACTION } from '../configmodels/SiemConfiguration';
import type { SecurityEventAttributes } from '../waterline-models/SecurityEvent';
import { redactForSiem } from './siem/SiemPayloadRedactor';
import type { SecurityEventInput } from './siem/SiemTypes';

type AgendaJobLike = { attrs?: { data?: unknown } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export namespace Services {
  export class SecurityEventService extends services.Core.Service {
    private readonly storeJobName = 'SecurityEventService-StoreSecurityEvent';
    private readonly forwardJobName = 'SiemForwardingService-ForwardSecurityEvents';

    protected override _exportedMethods: string[] = [
      'emitSecurityEvent',
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

    private getConfig(brandId: string): SiemConfiguration {
      const brand = BrandingService.getBrandById(brandId) ?? BrandingService.getBrand(brandId);
      const brandConfig = AppConfigService.getAppConfigurationForBrand(brand?.name ?? brandId) as unknown as Record<string, unknown>;
      return ({
        enabled: false,
        destinations: [],
        events: DEFAULT_SIEM_EVENT_SELECTION,
        redaction: DEFAULT_SIEM_REDACTION,
        delivery: DEFAULT_SIEM_DELIVERY,
        ...(isRecord(brandConfig.siem) ? brandConfig.siem : {}),
      } as unknown) as SiemConfiguration;
    }

    private severityFor(config: SiemConfiguration, input: SecurityEventInput): SiemSeverity {
      return input.severity ?? config.events?.severity?.[input.eventType] ?? 'info';
    }

    private shouldEmit(config: SiemConfiguration, input: SecurityEventInput): boolean {
      return config.enabled === true && config.events?.categories?.[input.category] !== false;
    }

    private buildEvent(config: SiemConfiguration, input: SecurityEventInput): SecurityEventAttributes {
      const redaction = { ...DEFAULT_SIEM_REDACTION, ...(config.redaction ?? {}) };
      const sanitized = redactForSiem(input, redaction);
      return {
        eventId: crypto.randomUUID(),
        brandId: input.brandId,
        portalId: input.portalId,
        eventType: input.eventType,
        category: input.category,
        severity: this.severityFor(config, input),
        occurredAt: input.occurredAt ?? new Date().toISOString(),
        source: input.source,
        actor: sanitized.actor,
        subject: sanitized.subject,
        resource: sanitized.resource,
        requestContext: sanitized.requestContext,
        payload: sanitized.payload,
        correlationId: input.correlationId,
        traceId: input.traceId,
        deliveryState: 'pending',
        destinationStates: {},
      } as SecurityEventAttributes;
    }

    public async emitSecurityEvent(input: SecurityEventInput): Promise<void> {
      try {
        const config = this.getConfig(input.brandId);
        if (!this.shouldEmit(config, input)) {
          return;
        }
        const event = this.buildEvent(config, input);
        await AgendaQueueService.now(this.storeJobName, { event });
      } catch (error) {
        sails.log.error(`${this.logHeader} Failed to enqueue security event`);
        sails.log.error(error);
      }
    }

    public async emitFromUserAudit(user: unknown, action: string, context: Record<string, unknown> = {}): Promise<void> {
      const brandValue = context.brandId ?? context.branding ?? 'default';
      const brand = typeof brandValue === 'string'
        ? BrandingService.getBrandById(brandValue) ?? BrandingService.getBrand(brandValue)
        : undefined;
      const brandId = String(brand?.id ?? brandValue);
      await this.emitSecurityEvent({
        brandId,
        portalId: typeof context.portalId === 'string' ? context.portalId : undefined,
        eventType: `user.${action}`,
        category: action.includes('login') || action.includes('logout') ? 'authentication' : 'userManagement',
        source: 'UsersService',
        actor: isRecord(user) ? user : undefined,
        payload: context,
      });
    }

    public async emitFromRecordAudit(recordAudit: Record<string, unknown>): Promise<void> {
      const brandId = await this.resolveBrandId(recordAudit);
      await this.emitSecurityEvent({
        brandId,
        eventType: `record.${String(recordAudit.action ?? 'audit')}`,
        category: 'recordLifecycle',
        source: 'RecordsService',
        resource: recordAudit,
        payload: recordAudit,
      });
    }

    public async emitFromIntegrationAudit(integrationAudit: Record<string, unknown>): Promise<void> {
      await this.emitSecurityEvent({
        brandId: String(integrationAudit.brandId ?? 'default'),
        eventType: `integration.${String(integrationAudit.status ?? 'audit')}`,
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
      const event = (job.attrs?.data as { event?: SecurityEventAttributes } | undefined)?.event;
      if (!event) {
        return;
      }
      await SecurityEvent.create(event as unknown as Record<string, unknown>);
      await AgendaQueueService.now(this.forwardJobName, { brandId: event.brandId });
    }

    public async queryEvents(params: Record<string, unknown> = {}): Promise<{ rows: SecurityEventAttributes[]; total: number }> {
      const requestedLimit = Number.parseInt(String(params.limit ?? 50), 10);
      const requestedSkip = Number.parseInt(String(params.skip ?? params.offset ?? 0), 10);
      const limit = Math.min(Number.isFinite(requestedLimit) ? Math.max(requestedLimit, 0) : 50, 500);
      const skip = Math.max(Number.isFinite(requestedSkip) ? requestedSkip : 0, 0);
      const where: Record<string, unknown> = {};
      ['brandId', 'eventType', 'category', 'severity', 'deliveryState'].forEach((key) => {
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
      const rows = await query as unknown as SecurityEventAttributes[];
      const total = await SecurityEvent.count(where);
      return { rows, total };
    }

    private async resolveBrandId(payload: Record<string, unknown>): Promise<string> {
      const directBrand = payload.brandId ?? payload.branding ?? _.get(payload, 'record.metaMetadata.brandId') ?? _.get(payload, 'metaMetadata.brandId');
      if (typeof directBrand === 'string' && directBrand.trim() !== '') {
        const brand = BrandingService.getBrandById(directBrand) ?? BrandingService.getBrand(directBrand);
        return String(brand?.id ?? directBrand);
      }

      const oid = String(payload.redboxOid ?? payload.oid ?? '').trim();
      if (oid) {
        const record = await Record.findOne({ redboxOid: oid }) as unknown as Record<string, unknown> | undefined;
        const recordBrandId = _.get(record, 'metaMetadata.brandId');
        if (typeof recordBrandId === 'string' && recordBrandId.trim() !== '') {
          return recordBrandId;
        }
      }

      const defaultBrand = BrandingService.getDefault();
      return String(defaultBrand?.id ?? 'default');
    }
  }
}

declare global {
  let SecurityEventService: Services.SecurityEventService;
}
