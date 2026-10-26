import { SiemReads } from '../queries/SiemReads';
import * as Effect from 'effect/Effect';
import type { SiemRepository } from '../persistence/siem/SiemRepository';
import type { SiemDeliveryConfig, SiemDestinationConfig, SiemRedactionConfig } from '../configmodels/SiemConfiguration';
import {
  DEFAULT_SIEM_DELIVERY,
  DEFAULT_SIEM_REDACTION,
  SiemConfiguration,
  normalizeSiemConfiguration,
} from '../configmodels/SiemConfiguration';
import type { SecurityEventRow as SecurityEventAttributes } from '../persistence/siem/SiemRepository';
import { buildSiemPayload, deliverSiemPayload, SiemHttpError, SiemAdapterError } from '../services/siem/SiemAdapters';
import { redactForSiem } from '../services/siem/SiemPayloadRedactor';
import type { SiemDeliveryResult, SiemTestInput } from '../services/siem/SiemTypes';

import { readProgress } from '../services/siem/SiemDeliveryStore';
import type { DestinationProgress } from '../services/siem/SiemDeliveryStore';

type AgendaJobLike = { attrs?: { data?: unknown } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export namespace Services {
  export class SiemForwardingService {
    constructor(
      protected readonly input: {
        repository: SiemRepository;
        configuration(brandId: string): unknown;
        brandIds(): string[];
      }
    ) {}

    private draining = false;
    private readonly active = new Set<Promise<unknown>>();
    public quiesce(): void {
      this.draining = true;
    }
    /** Called before persistence cleanup so accepted work can persist its outcome. */
    public async drain(): Promise<void> {
      this.draining = true;
      await Promise.allSettled(this.active);
    }
    private accept<T>(operation: () => Promise<T>): Promise<T> {
      if (this.draining) return Promise.reject(new Error('SIEM workers are draining.'));
      const pending = Promise.resolve().then(operation);
      this.active.add(pending);
      void pending.then(
        () => this.active.delete(pending),
        () => this.active.delete(pending)
      );
      return pending;
    }

    public async bootstrap(): Promise<void> {
      void this.input.repository;
    }
    private getConfig(brandId: string): SiemConfiguration {
      return Object.assign(
        new SiemConfiguration(),
        normalizeSiemConfiguration(this.input.configuration(brandId) ?? {})
      );
    }

    private deliveryConfig(config: SiemConfiguration): SiemDeliveryConfig {
      return { ...DEFAULT_SIEM_DELIVERY, ...(config.delivery ?? {}) };
    }

    private redactionConfig(config: SiemConfiguration): SiemRedactionConfig {
      return { ...DEFAULT_SIEM_REDACTION, ...(config.redaction ?? {}) };
    }

    private enabledDestinations(config: SiemConfiguration): SiemDestinationConfig[] {
      return (config.destinations ?? []).filter(destination => destination.enabled !== false);
    }

    private async nextAttemptNumber(eventId: string, destinationId: string): Promise<number> {
      const count = await this.input.repository.countAttempts({ eventId, destinationId });
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
      await this.input.repository.appendAttempt({
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

    private async deliverEvent(
      event: SecurityEventAttributes,
      destination: SiemDestinationConfig,
      redaction: SiemRedactionConfig
    ): Promise<SiemDeliveryResult> {
      const program = Effect.try({
        try: () => {
          // Delivery bookkeeping is neither collector content nor part of its byte budget.
          const envelope: SecurityEventAttributes = {
            id: event.id,
            eventId: event.eventId,
            brandId: event.brandId,
            portalId: event.portalId,
            eventType: event.eventType,
            category: event.category,
            severity: event.severity,
            occurredAt: event.occurredAt,
            source: event.source,
            deliveryState: event.deliveryState,
            actor: event.actor,
            subject: event.subject,
            resource: event.resource,
            requestContext: event.requestContext,
            payload: event.payload,
            correlationId: event.correlationId,
            traceId: event.traceId,
          };
          return redactForSiem(envelope, redaction);
        },
        catch: () => new SiemAdapterError('SIEM event could not be safely serialized'),
      }).pipe(
        Effect.flatMap(redactedEvent => buildSiemPayload([redactedEvent], destination)),
        Effect.flatMap(payload => deliverSiemPayload(payload, destination))
      );
      return Effect.runPromise(
        program.pipe(
          Effect.catch(error =>
            Effect.succeed<SiemDeliveryResult>({
              status: 'failed',
              httpStatusCode: error instanceof SiemHttpError ? error.statusCode : undefined,
              responseSummary: error instanceof SiemHttpError ? error.responseSummary : undefined,
              errorSummary: { message: error.message.slice(0, 500) },
            })
          )
        )
      );
    }

    private getKnownBrandIds(): string[] {
      return this.input.brandIds();
    }

    private async cleanupDeadLetters(brandId: string, delivery: SiemDeliveryConfig): Promise<void> {
      const cutoff = new Date(Date.now() - delivery.deadLetterRetentionDays * 86400000).toISOString();
      await this.input.repository.cleanupDeadLetters(brandId, cutoff, delivery.batchSize);
    }

    private async findEventsForBrand(brandId: string): Promise<SecurityEventAttributes[]> {
      const delivery = this.deliveryConfig(this.getConfig(brandId));
      await this.cleanupDeadLetters(brandId, delivery);
      return this.input.repository.readyEvents(brandId, delivery.batchSize);
    }

    private async processEvent(candidate: SecurityEventAttributes): Promise<void> {
      const config = this.getConfig(candidate.brandId);
      const destinations = this.enabledDestinations(config);
      // Each HTTP operation is bounded; renew before each operation for its complete timeout plus margin.
      const leaseMs = Math.max(30000, ...destinations.map(destination => (destination.timeoutMs ?? 10000) + 30000));
      const event = await this.input.repository.claimDelivery(candidate, leaseMs);
      if (!event) return;
      if (config.enabled !== true || destinations.length === 0) {
        await this.input.repository.saveDelivery(event, {
          deliveryState: 'ignored',
          leaseToken: null,
          leaseExpiresAt: null,
        });
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
          const successes = await this.input.repository.countAttempts({
            eventId: event.eventId,
            destinationId: destination.id,
            status: 'success',
          });
          progress = {
            status: successes > 0 ? 'success' : 'failed',
            attempts: (await this.nextAttemptNumber(event.eventId, destination.id)) - 1,
          };
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
        const delay =
          (destination.retry?.retryDelayMs ?? delivery.retryDelayMs) *
          Math.pow(destination.retry?.retryBackoffMultiplier ?? delivery.retryBackoffMultiplier, progress.attempts - 1);
        progress.nextEligibleAt = new Date(Date.now() + Math.min(delay, 2147483647)).toISOString();
        // Reserve the attempt before sending, so process death cannot reset retry budgets.
        if (
          !(await this.input.repository.saveDelivery(event, {
            destinationStates: states,
            leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
          }))
        )
          return;
        const startedAt = new Date().toISOString();
        const result = await this.deliverEvent(event, destination, this.redactionConfig(config));
        progress.status =
          result.status === 'success'
            ? 'success'
            : progress.attempts >= this.maxAttemptsForDestination(destination, delivery)
              ? 'deadLetter'
              : 'failed';
        if (progress.status === 'failed')
          progress.nextEligibleAt = new Date(Date.now() + Math.min(delay, 2147483647)).toISOString();
        else delete progress.nextEligibleAt;
        // Save acknowledgement before auxiliary attempt history or another destination is processed.
        if (!(await this.input.repository.saveDelivery(event, { destinationStates: states }))) return;
        await this.recordAttempt(event, destination, startedAt, result, progress.attempts);
      }
      const activeStates = destinations.map(destination => states[destination.id]);
      const unfinished = activeStates.filter(state => state.status !== 'success' && state.status !== 'deadLetter');
      const deliveryState = unfinished.length
        ? 'failed'
        : activeStates.every(state => state.status === 'success')
          ? 'delivered'
          : 'deadLetter';
      const nextTimes = unfinished.map(state => state.nextEligibleAt ?? new Date().toISOString()).sort();
      await this.input.repository.saveDelivery(event, {
        destinationStates: states,
        deliveryState,
        nextEligibleAt: nextTimes[0] ?? null,
        terminalAt: unfinished.length ? null : new Date().toISOString(),
        leaseToken: null,
        leaseExpiresAt: null,
      });
    }

    public forwardSecurityEvents(job: AgendaJobLike): Promise<void> {
      return this.accept(() => this.forwardAccepted(job));
    }
    private async forwardAccepted(job: AgendaJobLike): Promise<void> {
      void this.input.repository;
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

    public testDestination(input: SiemTestInput): Promise<SiemDeliveryResult> {
      return this.accept(() => this.testAcceptedDestination(input));
    }
    private async testAcceptedDestination(input: SiemTestInput): Promise<SiemDeliveryResult> {
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
      return this.deliverEvent(sampleEvent, input.destination, {
        ...DEFAULT_SIEM_REDACTION,
        ...(input.redaction ?? {}),
      });
    }

    public getDeliveryStatus(...args: Parameters<SiemReads['getDeliveryStatus']>) {
      return new SiemReads(this.input.repository).getDeliveryStatus(...args);
    }
  }
}
