import { Effect } from 'effect';
import { Services as services } from '../CoreService';
import type { SiemConfiguration, SiemDeliveryConfig, SiemDestinationConfig, SiemRedactionConfig } from '../configmodels/SiemConfiguration';
import { DEFAULT_SIEM_DELIVERY, DEFAULT_SIEM_REDACTION } from '../configmodels/SiemConfiguration';
import type { SecurityEventAttributes } from '../waterline-models/SecurityEvent';
import { buildSiemPayload, deliverSiemPayload, SiemHttpError } from './siem/SiemAdapters';
import { redactForSiem } from './siem/SiemPayloadRedactor';
import type { SiemDeliveryResult, SiemTestInput } from './siem/SiemTypes';

type AgendaJobLike = { attrs?: { data?: unknown } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export namespace Services {
  export class SiemForwardingService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'forwardSecurityEvents',
      'retryFailedDeliveries',
      'testDestination',
      'getDeliveryStatus',
    ];

    constructor() {
      super();
      this.logHeader = 'SiemForwardingService::';
    }

    private getConfig(brandId: string): SiemConfiguration {
      const brandConfig = AppConfigService.getAppConfigurationForBrand(brandId) as unknown as Record<string, unknown>;
      return ({
        enabled: false,
        destinations: [],
        events: { categories: {}, severity: {} },
        delivery: DEFAULT_SIEM_DELIVERY,
        redaction: DEFAULT_SIEM_REDACTION,
        ...(isRecord(brandConfig.siem) ? brandConfig.siem : {}),
      } as unknown) as SiemConfiguration;
    }

    private deliveryConfig(config: SiemConfiguration): SiemDeliveryConfig {
      return { ...DEFAULT_SIEM_DELIVERY, ...(config.delivery ?? {}) };
    }

    private redactionConfig(config: SiemConfiguration): SiemRedactionConfig {
      return { ...DEFAULT_SIEM_REDACTION, ...(config.redaction ?? {}) };
    }

    private enabledDestinations(config: SiemConfiguration): SiemDestinationConfig[] {
      return (config.destinations ?? []).filter((destination) => destination.enabled !== false);
    }

    private async nextAttemptNumber(eventId: string, destinationId: string): Promise<number> {
      const count = await SiemDeliveryAttempt.count({ eventId, destinationId });
      return count + 1;
    }

    private async recordAttempt(
      event: SecurityEventAttributes,
      destination: SiemDestinationConfig,
      startedAt: string,
      result: SiemDeliveryResult,
      attemptNumber: number
    ): Promise<void> {
      const completedAt = new Date().toISOString();
      await SiemDeliveryAttempt.create({
        eventId: event.eventId,
        brandId: event.brandId,
        destinationId: destination.id,
        adapterType: destination.adapterType,
        attemptNumber,
        status: result.status,
        startedAt,
        completedAt,
        durationMs: Date.parse(completedAt) - Date.parse(startedAt),
        httpStatusCode: result.httpStatusCode,
        responseSummary: result.responseSummary,
        errorSummary: result.errorSummary,
      });
    }

    private async deliverEvent(event: SecurityEventAttributes, destination: SiemDestinationConfig, redaction: SiemRedactionConfig): Promise<SiemDeliveryResult> {
      const redactedEvent = redactForSiem(event, redaction);
      const program = buildSiemPayload([redactedEvent], destination).pipe(
        Effect.flatMap((payload) => deliverSiemPayload(payload, destination))
      );
      return Effect.runPromise(program).catch((error) => {
        if (error instanceof SiemHttpError) {
          return {
            status: 'failed' as const,
            httpStatusCode: error.statusCode,
            errorSummary: { message: error.message, response: error.responseSummary },
          };
        }
        return { status: 'failed' as const, errorSummary: { message: String(error) } };
      });
    }

    private async updateEventState(event: SecurityEventAttributes, destinationResults: Record<string, string>, delivery: SiemDeliveryConfig): Promise<void> {
      const statuses = Object.values(destinationResults);
      const hasFailure = statuses.includes('failed');
      const delivered = statuses.length > 0 && statuses.every((status) => status === 'success');
      const failedAttempts = await SiemDeliveryAttempt.count({ eventId: event.eventId, status: 'failed' });
      const deliveryState = delivered ? 'delivered' : failedAttempts >= delivery.maxAttempts ? 'deadLetter' : hasFailure ? 'failed' : 'partial';
      await SecurityEvent.update({ eventId: event.eventId }).set({
        deliveryState,
        destinationStates: destinationResults,
      });
    }

    public async forwardSecurityEvents(job: AgendaJobLike): Promise<void> {
      const brandId = (job.attrs?.data as { brandId?: string } | undefined)?.brandId;
      const where: Record<string, unknown> = { deliveryState: ['pending', 'failed', 'partial'] };
      if (brandId) {
        where.brandId = brandId;
      }
      const firstConfig = this.getConfig(brandId ?? 'default');
      const delivery = this.deliveryConfig(firstConfig);
      const events = await SecurityEvent.find(where).sort('occurredAt ASC').limit(delivery.batchSize) as unknown as SecurityEventAttributes[];
      for (const event of events) {
        const config = this.getConfig(event.brandId);
        if (config.enabled !== true) {
          await SecurityEvent.update({ eventId: event.eventId }).set({ deliveryState: 'ignored' });
          continue;
        }
        const destinations = this.enabledDestinations(config);
        const destinationResults: Record<string, string> = {};
        for (const destination of destinations) {
          const attemptNumber = await this.nextAttemptNumber(event.eventId, destination.id);
          if (attemptNumber > this.deliveryConfig(config).maxAttempts) {
            destinationResults[destination.id] = 'deadLetter';
            continue;
          }
          const startedAt = new Date().toISOString();
          const result = await this.deliverEvent(event, destination, this.redactionConfig(config));
          destinationResults[destination.id] = result.status;
          await this.recordAttempt(event, destination, startedAt, result, attemptNumber);
        }
        await this.updateEventState(event, destinationResults, this.deliveryConfig(config));
      }
    }

    public async retryFailedDeliveries(_job: AgendaJobLike): Promise<void> {
      await this.forwardSecurityEvents({ attrs: { data: {} } });
    }

    public async testDestination(input: SiemTestInput): Promise<SiemDeliveryResult> {
      const sampleEvent = {
        eventId: 'siem-test',
        brandId: 'test',
        eventType: 'siem.test',
        category: 'integrationAudit',
        severity: 'info',
        occurredAt: new Date().toISOString(),
        source: 'SiemForwardingService',
        deliveryState: 'pending',
        payload: { message: 'SIEM destination test' },
        ...(input.sampleEvent ?? {}),
      } as SecurityEventAttributes;
      return this.deliverEvent(sampleEvent, input.destination, { ...DEFAULT_SIEM_REDACTION, ...(input.redaction ?? {}) });
    }

    public async getDeliveryStatus(params: Record<string, unknown> = {}): Promise<{ rows: Record<string, unknown>[]; total: number }> {
      const limit = Math.min(Number(params.limit ?? 50), 500);
      const skip = Math.max(Number(params.skip ?? 0), 0);
      const where: Record<string, unknown> = {};
      ['brandId', 'destinationId', 'status'].forEach((key) => {
        if (typeof params[key] === 'string' && params[key] !== '') {
          where[key] = params[key];
        }
      });
      const rows = await SiemDeliveryAttempt.find(where).sort('startedAt DESC').skip(skip).limit(limit) as unknown as Record<string, unknown>[];
      const total = await SiemDeliveryAttempt.count(where);
      return { rows, total };
    }
  }
}
