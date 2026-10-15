import * as Effect from 'effect/Effect';
import { Services as services } from '../CoreService';
import type { SiemDeliveryConfig, SiemDestinationConfig, SiemRedactionConfig } from '../configmodels/SiemConfiguration';
import { DEFAULT_SIEM_DELIVERY, DEFAULT_SIEM_REDACTION, SiemConfiguration, normalizeSiemConfiguration } from '../configmodels/SiemConfiguration';
import type { SecurityEventAttributes } from '../waterline-models/SecurityEvent';
import { buildSiemPayload, deliverSiemPayload, SiemHttpError, SiemAdapterError } from './siem/SiemAdapters';
import { redactForSiem } from './siem/SiemPayloadRedactor';
import type { SiemDeliveryResult, SiemTestInput } from './siem/SiemTypes';

import { claimDelivery, deliveryCollection, ensureSiemDeliveryStorage, readProgress, readyEventsFilter, saveDelivery } from './siem/SiemDeliveryStore';
import type { DestinationProgress } from './siem/SiemDeliveryStore';

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

    public async bootstrap(): Promise<void> {
      await ensureSiemDeliveryStorage();
    }

    private getConfig(brandId: string): SiemConfiguration {
      const brand = BrandingService.getBrandById(brandId) ?? BrandingService.getBrand(brandId);
      if (!brand) return new SiemConfiguration();
      const brandConfig = AppConfigService.getAppConfigurationForBrand(brand.name);
      return Object.assign(new SiemConfiguration(), normalizeSiemConfiguration(brandConfig && 'siem' in brandConfig ? brandConfig.siem : {}));
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

    private maxAttemptsForDestination(destination: SiemDestinationConfig, delivery: SiemDeliveryConfig): number {
      return destination.retry?.maxAttempts ?? delivery.maxAttempts;
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
        leaseToken: event.leaseToken,
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
      const program = Effect.try({
        try: () => {
          // Delivery bookkeeping is neither collector content nor part of its byte budget.
          const envelope: SecurityEventAttributes = {
            id: event.id, eventId: event.eventId, brandId: event.brandId, portalId: event.portalId,
            eventType: event.eventType, category: event.category, severity: event.severity,
            occurredAt: event.occurredAt, source: event.source, deliveryState: event.deliveryState,
            actor: event.actor, subject: event.subject, resource: event.resource, requestContext: event.requestContext,
            payload: event.payload, correlationId: event.correlationId, traceId: event.traceId,
          };
          return redactForSiem(envelope, redaction);
        },
        catch: () => new SiemAdapterError('SIEM event could not be safely serialized'),
      }).pipe(Effect.flatMap((redactedEvent) => buildSiemPayload([redactedEvent], destination)),
        Effect.flatMap((payload) => deliverSiemPayload(payload, destination)));
      return Effect.runPromise(program.pipe(Effect.catchAll((error) => Effect.succeed<SiemDeliveryResult>({
        status: 'failed',
        httpStatusCode: error instanceof SiemHttpError ? error.statusCode : undefined,
        responseSummary: error instanceof SiemHttpError ? error.responseSummary : undefined,
        errorSummary: { message: error.message.slice(0, 500) },
      }))));
    }

    private getKnownBrandIds(): string[] {
      const names = typeof BrandingService.getAvailable === 'function' ? BrandingService.getAvailable() : [];
      return names
        .map((name: string) => BrandingService.getBrand(name)?.id)
        .filter((id: unknown): id is string => typeof id === 'string' && id.trim() !== '');
    }

    private async cleanupDeadLetters(brandId: string, delivery: SiemDeliveryConfig): Promise<void> {
      const cutoff = new Date(Date.now() - delivery.deadLetterRetentionDays * 86400000).toISOString();
      const collection = deliveryCollection(SecurityEvent);
      const filter = { brandId, deliveryState: 'deadLetter', $or: [
        { terminalAt: { $lte: cutoff, $type: 'string' } },
        { terminalAt: { $exists: false }, updatedAt: { $lte: cutoff } },
      ] };
      const expired = await collection.find(filter).sort({ occurredAt: 1 }).limit(delivery.batchSize).toArray();
      for (const event of expired) {
        // Delete attempts first: a crash leaves an event to clean up on the next poll.
        await deliveryCollection(SiemDeliveryAttempt).deleteMany({ eventId: event.eventId, brandId });
        await collection.deleteMany({ ...filter, eventId: event.eventId });
      }
    }

    private async findEventsForBrand(brandId: string): Promise<SecurityEventAttributes[]> {
      const delivery = this.deliveryConfig(this.getConfig(brandId));
      await this.cleanupDeadLetters(brandId, delivery);
      return deliveryCollection(SecurityEvent).find(readyEventsFilter(brandId, new Date().toISOString()))
        .sort({ occurredAt: 1 }).limit(delivery.batchSize).toArray();
    }

    private async processEvent(candidate: SecurityEventAttributes): Promise<void> {
      const config = this.getConfig(candidate.brandId);
      const destinations = this.enabledDestinations(config);
      // Each HTTP operation is bounded; renew before each operation for its complete timeout plus margin.
      const leaseMs = Math.max(30000, ...destinations.map(destination => (destination.timeoutMs ?? 10000) + 30000));
      const event = await claimDelivery(candidate, leaseMs);
      if (!event) return;
      if (config.enabled !== true || destinations.length === 0) {
        await saveDelivery(event, { deliveryState: 'ignored', leaseToken: null, leaseExpiresAt: null });
        return;
      }
      const states: Record<string, DestinationProgress> = {};
      Object.setPrototypeOf(states, null);
      for (const [id, value] of Object.entries(event.destinationStates ?? {})) {
        const progress = readProgress(value);
        if (progress) states[id] = progress;
      }
      const delivery = this.deliveryConfig(config);
      for (const destination of destinations) {
        let progress = readProgress(event.destinationStates?.[destination.id]);
        if (!progress) {
          // Recover pre-upgrade attempts too: an acknowledged success is terminal forever.
          const successes = await SiemDeliveryAttempt.count({ eventId: event.eventId, destinationId: destination.id, status: 'success' });
          progress = { status: successes > 0 ? 'success' : 'failed', attempts: (await this.nextAttemptNumber(event.eventId, destination.id)) - 1 };
        }
        states[destination.id] = progress;
      }
      for (const destination of destinations) {
        const progress = states[destination.id];
        if (progress.status === 'success' || progress.status === 'deadLetter') continue;
        if (progress.attempts >= this.maxAttemptsForDestination(destination, delivery)) {
          progress.status = 'deadLetter';
          continue;
        }
        if (progress.nextEligibleAt && Date.parse(progress.nextEligibleAt) > Date.now()) continue;
        progress.attempts++;
        progress.status = 'processing';
        const delay = (destination.retry?.retryDelayMs ?? delivery.retryDelayMs) * Math.pow(destination.retry?.retryBackoffMultiplier ?? delivery.retryBackoffMultiplier, progress.attempts - 1);
        progress.nextEligibleAt = new Date(Date.now() + Math.min(delay, 2147483647)).toISOString();
        // Reserve the attempt before sending, so process death cannot reset retry budgets.
        if (!(await saveDelivery(event, { destinationStates: states, leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString() }))) return;
        const startedAt = new Date().toISOString();
        const result = await this.deliverEvent(event, destination, this.redactionConfig(config));
        progress.status = result.status === 'success' ? 'success' : progress.attempts >= this.maxAttemptsForDestination(destination, delivery) ? 'deadLetter' : 'failed';
        progress.nextEligibleAt = progress.status === 'failed' ? new Date(Date.now() + Math.min(delay, 2147483647)).toISOString() : undefined;
        // Save acknowledgement before auxiliary attempt history or another destination is processed.
        if (!(await saveDelivery(event, { destinationStates: states }))) return;
        await this.recordAttempt(event, destination, startedAt, result, progress.attempts);
      }
      const activeStates = destinations.map(destination => states[destination.id]);
      const unfinished = activeStates.filter(state => state.status !== 'success' && state.status !== 'deadLetter');
      const deliveryState = unfinished.length ? 'failed' : activeStates.every(state => state.status === 'success') ? 'delivered' : 'deadLetter';
      const nextTimes = unfinished.map(state => state.nextEligibleAt ?? new Date().toISOString()).sort();
      await saveDelivery(event, { destinationStates: states, deliveryState, nextEligibleAt: nextTimes[0] ?? null,
        terminalAt: unfinished.length ? null : new Date().toISOString(), leaseToken: null, leaseExpiresAt: null });
    }

    public async forwardSecurityEvents(job: AgendaJobLike): Promise<void> {
      await ensureSiemDeliveryStorage();
      const data = job.attrs?.data;
      const brandId = isRecord(data) && typeof data.brandId === 'string' ? data.brandId : undefined;
      if (brandId) {
        const events = await this.findEventsForBrand(brandId);
        for (const event of events) {
          await this.processEvent(event);
        }
        return;
      }
      for (const knownBrandId of this.getKnownBrandIds()) {
        const events = await this.findEventsForBrand(knownBrandId);
        for (const event of events) {
          await this.processEvent(event);
        }
      }
    }

    public async retryFailedDeliveries(_job: AgendaJobLike): Promise<void> {
      await this.forwardSecurityEvents({ attrs: { data: {} } });
    }

    public async testDestination(input: SiemTestInput): Promise<SiemDeliveryResult> {
      const sampleEvent: SecurityEventAttributes = {
        id: 'siem-test',
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
      };
      return this.deliverEvent(sampleEvent, input.destination, { ...DEFAULT_SIEM_REDACTION, ...(input.redaction ?? {}) });
    }

    public async getDeliveryStatus(params: Record<string, unknown> = {}): Promise<{ rows: Record<string, unknown>[]; total: number }> {
      await ensureSiemDeliveryStorage();
      const requestedLimit = Number.parseInt(String(params.limit ?? 50), 10);
      const requestedSkip = Number.parseInt(String(params.skip ?? params.offset ?? 0), 10);
      const limit = Math.min(Number.isFinite(requestedLimit) ? Math.max(requestedLimit, 0) : 50, 500);
      const skip = Math.max(Number.isFinite(requestedSkip) ? requestedSkip : 0, 0);
      const where: Record<string, unknown> = {};
      ['brandId', 'eventId', 'destinationId', 'status'].forEach((key) => {
        if (typeof params[key] === 'string' && params[key] !== '') {
          where[key] = params[key];
        }
      });
      const startedAt: Record<string, string> = {};
      if (typeof params.startedAtStart === 'string' && params.startedAtStart !== '') {
        startedAt['>='] = params.startedAtStart;
      }
      if (typeof params.startedAtEnd === 'string' && params.startedAtEnd !== '') {
        startedAt['<='] = params.startedAtEnd;
      }
      if (Object.keys(startedAt).length > 0) {
        where.startedAt = startedAt;
      }
      const rows = await SiemDeliveryAttempt.find(where).sort('startedAt DESC').skip(skip).limit(limit);
      const total = await SiemDeliveryAttempt.count(where);
      return { rows: Array.isArray(rows) ? rows.filter(isRecord) : [], total };
    }
  }
}
