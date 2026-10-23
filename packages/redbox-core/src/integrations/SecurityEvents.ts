import { SiemReads } from '../queries/SiemReads';
import * as crypto from 'node:crypto';
import _ from 'lodash';
import type { SiemRepository } from '../persistence/siem/SiemRepository';
import type { SiemConfigDto, SiemSeverity } from '../configmodels/SiemConfiguration';
import { normalizeSiemConfiguration, DEFAULT_SIEM_REDACTION } from '../configmodels/SiemConfiguration';
import type { SecurityEventRow as SecurityEventAttributes } from '../persistence/siem/SiemRepository';
import { redactForSiem } from '../services/siem/SiemPayloadRedactor';
import type { SecurityEventInput } from '../services/siem/SiemTypes';

export interface SecurityEventCaptureInput {
  readonly repository: SiemRepository;
  readonly log: { error(message: string): void };
  brand(value: string): { id?: string | number; name: string } | null | undefined;
  configuration(brandName: string): unknown;
  enqueue(name: string, data: Record<string, unknown>): Promise<unknown>;
  record(oid: string): Promise<unknown>;
}

type AgendaJobLike = { attrs?: { data?: unknown } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export namespace Services {
  export class SecurityEventService {
    private readonly storeJobName = 'SecurityEventService-StoreSecurityEvent';
    private readonly forwardJobName = 'SiemForwardingService-ForwardSecurityEvents';

    private draining = false;
    private readonly active = new Set<Promise<void>>();
    public quiesce(): void {
      this.draining = true;
    }
    public async close(): Promise<void> {
      await this.drain();
    }
    /** Called before persistence cleanup so accepted work can persist its outcome. */
    public async drain(): Promise<void> {
      this.draining = true;
      await Promise.allSettled(this.active);
    }
    private accept(operation: () => Promise<void>): Promise<void> {
      if (this.draining) return Promise.reject(new Error('SIEM workers are draining.'));
      const pending = Promise.resolve().then(operation);
      this.active.add(pending);
      void pending.then(
        () => this.active.delete(pending),
        () => this.active.delete(pending)
      );
      return pending;
    }

    protected readonly logHeader = 'SecurityEventService::';
    constructor(protected readonly input: SecurityEventCaptureInput) {}

    private getConfig(brandId: string): SiemConfigDto {
      const brand = this.input.brand(brandId);
      if (!brand) return normalizeSiemConfiguration({});
      return normalizeSiemConfiguration(this.input.configuration(brand.name) ?? {});
    }

    private severityFor(config: SiemConfigDto, input: SecurityEventInput): SiemSeverity {
      return config.events?.severity?.[input.eventType] ?? input.severity ?? 'info';
    }

    private shouldEmit(config: SiemConfigDto, input: SecurityEventInput): boolean {
      return config.enabled === true && config.events?.categories?.[input.category] !== false;
    }

    private buildEvent(config: SiemConfigDto, input: SecurityEventInput): Omit<SecurityEventAttributes, 'id'> {
      const redaction = { ...DEFAULT_SIEM_REDACTION, ...(config.redaction ?? {}) };
      const timestamp = typeof input.occurredAt === 'string' ? Date.parse(input.occurredAt) : NaN;
      const event: Omit<SecurityEventAttributes, 'id'> = {
        eventId: crypto.randomUUID(),
        brandId: input.brandId,
        portalId: input.portalId,
        eventType: input.eventType,
        category: input.category,
        severity: this.severityFor(config, input),
        occurredAt: new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString(),
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

    public emitSecurityEvent(input: SecurityEventInput): Promise<void> {
      if (this.draining) return Promise.resolve();
      return this.accept(() => this.emitAccepted(input));
    }
    private async emitAccepted(input: SecurityEventInput): Promise<void> {
      try {
        if (typeof input.brandId !== 'string' || !input.brandId.trim()) return;
        const config = this.getConfig(input.brandId);
        if (!this.shouldEmit(config, input)) {
          return;
        }
        const event = this.buildEvent(config, input);
        await this.input.enqueue(this.storeJobName, { event });
      } catch {
        this.input.log.error(`${this.logHeader} Failed to enqueue security event`);
      }
    }

    public async emitFromUserAudit(
      user: unknown,
      action: string,
      context: Record<string, unknown> = {}
    ): Promise<void> {
      const brandValue = context.brandId ?? context.branding;
      if (typeof brandValue !== 'string' || brandValue.trim() === '') return;
      const brand = typeof brandValue === 'string' ? this.input.brand(brandValue) : undefined;
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
      const record = isRecord(recordAudit.record) ? recordAudit.record : {};
      const meta = isRecord(record.metaMetadata) ? record.metaMetadata : {};
      const user = isRecord(recordAudit.user) ? recordAudit.user : undefined;
      const actor: Record<string, unknown> = {};
      // Audit user objects can carry profiles and serialized attributes; select identity only.
      for (const key of ['id', 'username', 'email', 'service']) {
        if (user && typeof user[key] === 'string') actor[key] = user[key];
      }
      const concurrency = isRecord(recordAudit.concurrency) ? recordAudit.concurrency : undefined;
      const context: Record<string, unknown> = {};
      if (concurrency) {
        if (typeof concurrency.revision === 'number' && Number.isFinite(concurrency.revision)) {
          context.revision = concurrency.revision;
        }
        if (typeof concurrency.resolution === 'string') context.resolution = concurrency.resolution;
      }
      await this.emitSecurityEvent({
        brandId,
        eventType: `record.${String(recordAudit.action ?? 'audit')}`,
        category: 'recordLifecycle',
        source: 'RecordsService',
        occurredAt: typeof recordAudit.occurredAt === 'string' ? recordAudit.occurredAt : undefined,
        actor: user ? actor : undefined,
        resource: {
          redboxOid: typeof recordAudit.redboxOid === 'string' ? recordAudit.redboxOid : undefined,
          action: typeof recordAudit.action === 'string' ? recordAudit.action : undefined,
          type: typeof meta.type === 'string' ? meta.type : undefined,
          brandId,
        },
        payload: concurrency ? { concurrency: context } : undefined,
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

    public storeSecurityEvent(job: AgendaJobLike): Promise<void> {
      return this.accept(() => this.storeAccepted(job));
    }
    private async storeAccepted(job: AgendaJobLike): Promise<void> {
      const data = job.attrs?.data;
      if (!isRecord(data) || !isRecord(data.event)) return;
      const event = data.event;
      if (typeof event.brandId !== 'string' || typeof event.eventId !== 'string') return;
      await this.input.repository.capture(event);
      await this.input.enqueue(this.forwardJobName, { brandId: event.brandId });
    }

    public queryEvents(...args: Parameters<SiemReads['queryEvents']>) {
      return new SiemReads(this.input.repository).queryEvents(...args);
    }

    private async resolveBrandId(payload: Record<string, unknown>): Promise<string | undefined> {
      const directBrand =
        payload.brandId ??
        payload.branding ??
        _.get(payload, 'record.metaMetadata.brandId') ??
        _.get(payload, 'metaMetadata.brandId') ??
        _.get(payload, 'record.validationBypass.recordContext.brand');
      if (typeof directBrand === 'string' && directBrand.trim() !== '') {
        const brand = this.input.brand(directBrand);
        return String(brand?.id ?? directBrand);
      }

      const oid = String(payload.redboxOid ?? payload.oid ?? '').trim();
      if (oid) {
        const record = await this.input.record(oid);
        const metadata = isRecord(record) && isRecord(record.metaMetadata) ? record.metaMetadata : {};
        const recordBrandId = metadata.brandId;
        if (typeof recordBrandId === 'string' && recordBrandId.trim() !== '') {
          return recordBrandId;
        }
      }

      // Unknown ownership cannot safely be forwarded to the default brand.
      return undefined;
    }
  }
}
