import { randomUUID } from 'node:crypto';
import { Services as services } from '../CoreService';
import {
  AUTHORIZATION_AUDIT_ACTOR_TYPES,
  AUTHORIZATION_AUDIT_AUTH_METHODS,
  AUTHORIZATION_AUDIT_EVENT_TYPES,
  AUTHORIZATION_AUDIT_OUTCOMES,
  AUTHORIZATION_AUDIT_TARGET_TYPES,
  AuthorizationPersistenceValidationError,
  redactAuthorizationPersistenceValue,
  sanitizeAuthorizationText,
  type AuthorizationAuditActorType,
  type AuthorizationAuditAuthMethod,
  type AuthorizationAuditEventType,
  type AuthorizationAuditOutcome,
  type AuthorizationAuditTargetType,
} from '../authorization';
import type {
  AuthorizationAuditAttributes,
  AuthorizationAuditCreateRecord,
} from '../waterline-models/AuthorizationAudit';
import type { AuthorizationRedactedValue } from '../authorization';
import {
  probeRequiredTransactionCapability,
  runWithRequiredTransaction,
  type RequiredTransactionCapabilityProbe,
} from '../utilities/RequiredTransactionUtils';

export const AUTHORIZATION_AUDIT_SCHEMA_VERSION = 1;
export const AUTHORIZATION_AUDIT_DEFAULT_PAGE_SIZE = 50;
export const AUTHORIZATION_AUDIT_MAX_PAGE_SIZE = 100;
export const AUTHORIZATION_AUDIT_MAX_RETENTION_BATCH = 1_000;

export interface AuthorizationAuditActor {
  readonly actorType: AuthorizationAuditActorType;
  readonly actorId: string;
  readonly authMethod: AuthorizationAuditAuthMethod;
  readonly requestId?: string;
}

export interface AuthorizationAuditEventInput extends AuthorizationAuditActor {
  readonly eventType: AuthorizationAuditEventType;
  readonly brandId?: string;
  readonly targetType: AuthorizationAuditTargetType;
  readonly targetId?: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly reasonCode?: string;
  readonly reason?: string;
  readonly batchId?: string;
}

export interface AuthorizationAuditEventFactory {
  readonly eventId: () => string;
  readonly now: () => Date;
}

export interface AuthorizationAuditReadFilter {
  readonly actorId?: string;
  readonly brandId?: string;
  readonly cursor?: string;
  readonly eventType?: AuthorizationAuditEventType;
  readonly outcome?: AuthorizationAuditOutcome;
  readonly targetId?: string;
  readonly targetType?: AuthorizationAuditTargetType;
  readonly limit?: number;
}

export interface AuthorizationAuditReadResult {
  readonly events: readonly AuthorizationAuditAttributes[];
  readonly nextCursor?: string;
}

export interface AuthorizationAuditRetentionOptions {
  readonly retentionDays?: number;
  readonly legalHold?: boolean;
  readonly batchSize?: number;
}

export interface AuthorizationAuditRetentionResult {
  readonly auditEventId: string;
  readonly deletedCount: number;
  readonly status: 'disabled' | 'legal-hold' | 'completed';
}

const DEFAULT_EVENT_FACTORY: AuthorizationAuditEventFactory = Object.freeze({
  eventId: randomUUID,
  now: () => new Date(),
});

function freezeRedactedValue(value: AuthorizationRedactedValue): AuthorizationRedactedValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(freezeRedactedValue));
  }
  if (typeof value === 'object' && value !== null) {
    const snapshot: Record<string, AuthorizationRedactedValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      snapshot[key] = freezeRedactedValue(entry);
    }
    return Object.freeze(snapshot);
  }
  return value;
}

function redactAndFreeze(value: unknown): AuthorizationRedactedValue {
  return freezeRedactedValue(redactAuthorizationPersistenceValue(value));
}

function requireSanitizedText(value: unknown, field: string, maxLength: number): string {
  const sanitized = sanitizeAuthorizationText(value, maxLength);
  if (sanitized === undefined) {
    throw new AuthorizationPersistenceValidationError('audit-event-invalid', `${field} is required.`);
  }
  return sanitized;
}

function optionalSanitizedText(value: unknown, maxLength: number): string | undefined {
  return sanitizeAuthorizationText(value, maxLength);
}

export function createAuthorizationAuditEvent(
  input: AuthorizationAuditEventInput,
  outcome: AuthorizationAuditOutcome,
  factory: AuthorizationAuditEventFactory = DEFAULT_EVENT_FACTORY
): AuthorizationAuditCreateRecord {
  if (!AUTHORIZATION_AUDIT_EVENT_TYPES.includes(input.eventType)) {
    throw new AuthorizationPersistenceValidationError(
      'audit-event-invalid',
      'Authorization audit eventType is invalid.'
    );
  }
  if (!AUTHORIZATION_AUDIT_OUTCOMES.includes(outcome)) {
    throw new AuthorizationPersistenceValidationError('audit-event-invalid', 'Authorization audit outcome is invalid.');
  }
  if (!AUTHORIZATION_AUDIT_ACTOR_TYPES.includes(input.actorType)) {
    throw new AuthorizationPersistenceValidationError(
      'audit-event-invalid',
      'Authorization audit actorType is invalid.'
    );
  }
  if (!AUTHORIZATION_AUDIT_AUTH_METHODS.includes(input.authMethod)) {
    throw new AuthorizationPersistenceValidationError(
      'audit-event-invalid',
      'Authorization audit authMethod is invalid.'
    );
  }
  if (!AUTHORIZATION_AUDIT_TARGET_TYPES.includes(input.targetType)) {
    throw new AuthorizationPersistenceValidationError(
      'audit-event-invalid',
      'Authorization audit targetType is invalid.'
    );
  }
  return Object.freeze({
    eventId: requireSanitizedText(factory.eventId(), 'eventId', 128),
    schemaVersion: AUTHORIZATION_AUDIT_SCHEMA_VERSION,
    eventType: input.eventType,
    outcome,
    actorType: input.actorType,
    actorId: requireSanitizedText(input.actorId, 'actorId', 128),
    authMethod: input.authMethod,
    brandId: optionalSanitizedText(input.brandId, 128),
    targetType: input.targetType,
    targetId: optionalSanitizedText(input.targetId, 128),
    before: input.before === undefined ? undefined : redactAndFreeze(input.before),
    after: input.after === undefined ? undefined : redactAndFreeze(input.after),
    reasonCode: optionalSanitizedText(input.reasonCode, 128),
    reason: optionalSanitizedText(input.reason, 1_000),
    requestId: optionalSanitizedText(input.requestId, 128),
    batchId: optionalSanitizedText(input.batchId, 128),
    occurredAt: factory.now().toISOString(),
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAuthorizationAuditAttributes(value: unknown): value is AuthorizationAuditAttributes {
  if (!isObject(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.eventId === 'string' &&
    typeof value.actorId === 'string' &&
    typeof value.schemaVersion === 'number' &&
    (typeof value.occurredAt === 'string' || value.occurredAt instanceof Date) &&
    typeof value.eventType === 'string' &&
    AUTHORIZATION_AUDIT_EVENT_TYPES.some(eventType => eventType === value.eventType) &&
    typeof value.outcome === 'string' &&
    AUTHORIZATION_AUDIT_OUTCOMES.some(outcome => outcome === value.outcome) &&
    typeof value.actorType === 'string' &&
    AUTHORIZATION_AUDIT_ACTOR_TYPES.some(actorType => actorType === value.actorType) &&
    typeof value.authMethod === 'string' &&
    AUTHORIZATION_AUDIT_AUTH_METHODS.some(authMethod => authMethod === value.authMethod) &&
    typeof value.targetType === 'string' &&
    AUTHORIZATION_AUDIT_TARGET_TYPES.some(targetType => targetType === value.targetType)
  );
}

/**
 * Keyset cursor for audit pagination.
 *
 * The tiebreaker is `eventId` rather than the Mongo primary key: sails-mongo only
 * reifies primary-key strings into `ObjectId` for `=`, `!=`, `in` and `nin`, not for
 * range modifiers, so an `id < '<hex>'` predicate compares an ObjectId against a
 * string and matches nothing. `eventId` is a required, unique, sanitized string, so
 * range comparison and its supporting index both behave as written.
 */
interface AuthorizationAuditCursor {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly version: 1;
}

function encodeCursor(event: AuthorizationAuditAttributes): string {
  const cursor: AuthorizationAuditCursor = {
    eventId: event.eventId,
    occurredAt: new Date(event.occurredAt).toISOString(),
    version: 1,
  };
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): AuthorizationAuditCursor {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch (_error) {
    throw new AuthorizationPersistenceValidationError('audit-event-invalid', 'Authorization audit cursor is invalid.');
  }
  if (!isObject(value) || value.version !== 1 || typeof value.eventId !== 'string' || value.eventId.length === 0) {
    throw new AuthorizationPersistenceValidationError('audit-event-invalid', 'Authorization audit cursor is invalid.');
  }
  const date = new Date(typeof value.occurredAt === 'string' ? value.occurredAt : '');
  if (Number.isNaN(date.getTime())) {
    throw new AuthorizationPersistenceValidationError('audit-event-invalid', 'Authorization audit cursor is invalid.');
  }
  return Object.freeze({ eventId: value.eventId, occurredAt: date.toISOString(), version: 1 });
}

function boundedPageSize(limit: number | undefined): number {
  if (limit === undefined) {
    return AUTHORIZATION_AUDIT_DEFAULT_PAGE_SIZE;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > AUTHORIZATION_AUDIT_MAX_PAGE_SIZE) {
    throw new AuthorizationPersistenceValidationError(
      'audit-event-invalid',
      `Authorization audit page size must be between 1 and ${AUTHORIZATION_AUDIT_MAX_PAGE_SIZE}.`
    );
  }
  return limit;
}

function immutableAuditSnapshot(event: AuthorizationAuditAttributes): AuthorizationAuditAttributes {
  return Object.freeze({
    ...event,
    occurredAt: new Date(event.occurredAt).toISOString(),
    before: event.before === undefined ? undefined : redactAndFreeze(event.before),
    after: event.after === undefined ? undefined : redactAndFreeze(event.after),
  });
}

function retentionCutoff(now: Date, retentionDays: number): string {
  const cutoffMilliseconds = now.getTime() - retentionDays * 86_400_000;
  const cutoff = new Date(cutoffMilliseconds);
  if (Number.isNaN(now.getTime()) || !Number.isFinite(cutoffMilliseconds) || Number.isNaN(cutoff.getTime())) {
    throw new AuthorizationPersistenceValidationError(
      'audit-event-invalid',
      'Authorization audit retentionDays must produce a safe date boundary.'
    );
  }
  return cutoff.toISOString();
}

export namespace Services {
  export class AuthorizationAuditService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'applyRetention',
      'createSucceededEvent',
      'probeTransactions',
      'readEvents',
      'recordAttempt',
    ];

    public constructor(private readonly eventFactory: AuthorizationAuditEventFactory = DEFAULT_EVENT_FACTORY) {
      super();
      this.logHeader = 'AuthorizationAuditService::';
    }

    private async persistEvent(
      event: AuthorizationAuditCreateRecord,
      connection: Sails.Connection
    ): Promise<AuthorizationAuditAttributes> {
      // Event factories return immutable snapshots so callers cannot alter audit
      // evidence after construction. Waterline lifecycle hooks normalize their
      // create values in place, so persistence must receive a detached mutable
      // record rather than the caller-facing snapshot itself.
      const persistenceRecord: AuthorizationAuditCreateRecord = { ...event };
      return AuthorizationAudit.create(persistenceRecord).fetch().usingConnection(connection);
    }

    public async createSucceededEvent(
      input: AuthorizationAuditEventInput,
      connection: Sails.Connection | null | undefined
    ): Promise<AuthorizationAuditAttributes> {
      if (connection == null) {
        throw new AuthorizationPersistenceValidationError(
          'audit-event-invalid',
          'Successful authorization audit events require the caller transaction connection.'
        );
      }
      const event = createAuthorizationAuditEvent(input, 'succeeded', this.eventFactory);
      return this.persistEvent(event, connection);
    }

    public async recordAttempt(
      input: AuthorizationAuditEventInput,
      outcome: 'denied' | 'failed'
    ): Promise<{ readonly event: AuthorizationAuditCreateRecord; readonly persisted: boolean }> {
      const event = createAuthorizationAuditEvent(input, outcome, this.eventFactory);
      try {
        await runWithRequiredTransaction(AuthorizationAudit.getDatastore(), connection =>
          this.persistEvent(event, connection).then(() => undefined)
        );
        return { event, persisted: true };
      } catch (_error) {
        this.logger.error(
          `${this.logHeader} Failed to persist ${event.eventType}/${event.outcome}; the administrative attempt remains denied.`
        );
        return { event, persisted: false };
      }
    }

    public async probeTransactions(): Promise<RequiredTransactionCapabilityProbe> {
      return probeRequiredTransactionCapability(AuthorizationAudit.getDatastore(), async connection => {
        await AuthorizationAudit.count({}).usingConnection(connection);
      });
    }

    public async readEvents(filter: AuthorizationAuditReadFilter = {}): Promise<AuthorizationAuditReadResult> {
      const criteria: Record<string, unknown> = {};
      const limit = boundedPageSize(filter.limit);
      if (filter.actorId !== undefined) {
        criteria.actorId = requireSanitizedText(filter.actorId, 'actorId', 128);
      }
      if (filter.brandId !== undefined) {
        criteria.brandId = requireSanitizedText(filter.brandId, 'brandId', 128);
      }
      if (filter.eventType !== undefined) {
        if (!AUTHORIZATION_AUDIT_EVENT_TYPES.includes(filter.eventType)) {
          throw new AuthorizationPersistenceValidationError(
            'audit-event-invalid',
            'Audit eventType filter is invalid.'
          );
        }
        criteria.eventType = filter.eventType;
      }
      if (filter.outcome !== undefined) {
        if (!AUTHORIZATION_AUDIT_OUTCOMES.includes(filter.outcome)) {
          throw new AuthorizationPersistenceValidationError('audit-event-invalid', 'Audit outcome filter is invalid.');
        }
        criteria.outcome = filter.outcome;
      }
      if (filter.targetType !== undefined) {
        if (!AUTHORIZATION_AUDIT_TARGET_TYPES.includes(filter.targetType)) {
          throw new AuthorizationPersistenceValidationError(
            'audit-event-invalid',
            'Audit targetType filter is invalid.'
          );
        }
        criteria.targetType = filter.targetType;
      }
      if (filter.targetId !== undefined) {
        criteria.targetId = requireSanitizedText(filter.targetId, 'targetId', 128);
      }
      if (filter.cursor !== undefined) {
        const cursor = decodeCursor(filter.cursor);
        criteria.or = [
          { occurredAt: { '<': cursor.occurredAt } },
          { eventId: { '<': cursor.eventId }, occurredAt: cursor.occurredAt },
        ];
      }
      const value = await AuthorizationAudit.find(criteria)
        .sort([{ occurredAt: 'DESC' }, { eventId: 'DESC' }])
        .limit(limit + 1);
      if (!Array.isArray(value) || !value.every(isAuthorizationAuditAttributes)) {
        throw new Error('AuthorizationAudit returned an invalid persistence result.');
      }
      const events = Object.freeze(value.slice(0, limit).map(immutableAuditSnapshot));
      const lastEvent = events.at(-1);
      return Object.freeze({
        events,
        nextCursor: value.length > limit && lastEvent !== undefined ? encodeCursor(lastEvent) : undefined,
      });
    }

    public async applyRetention(
      options: AuthorizationAuditRetentionOptions,
      actor: AuthorizationAuditActor
    ): Promise<AuthorizationAuditRetentionResult> {
      const retentionDays = options.retentionDays;
      if (retentionDays !== undefined && (!Number.isSafeInteger(retentionDays) || retentionDays < 1)) {
        throw new AuthorizationPersistenceValidationError(
          'audit-event-invalid',
          'Authorization audit retentionDays must be a positive integer when configured.'
        );
      }
      const batchSize = options.batchSize ?? AUTHORIZATION_AUDIT_MAX_RETENTION_BATCH;
      if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > AUTHORIZATION_AUDIT_MAX_RETENTION_BATCH) {
        throw new AuthorizationPersistenceValidationError(
          'audit-event-invalid',
          `Authorization audit retention batchSize must be between 1 and ${AUTHORIZATION_AUDIT_MAX_RETENTION_BATCH}.`
        );
      }
      const configuredCutoff =
        retentionDays === undefined ? undefined : retentionCutoff(this.eventFactory.now(), retentionDays);
      return runWithRequiredTransaction(AuthorizationAudit.getDatastore(), async connection => {
        const status: AuthorizationAuditRetentionResult['status'] =
          retentionDays === undefined ? 'disabled' : options.legalHold === true ? 'legal-hold' : 'completed';
        let deletedCount = 0;
        let cutoff: string | undefined;
        if (status === 'completed' && retentionDays !== undefined) {
          cutoff = configuredCutoff;
          const value = await AuthorizationAudit.find({ occurredAt: { '<': cutoff } })
            .sort([{ occurredAt: 'ASC' }, { eventId: 'ASC' }])
            .limit(batchSize)
            .usingConnection(connection);
          if (!Array.isArray(value) || !value.every(isAuthorizationAuditAttributes)) {
            throw new Error('AuthorizationAudit returned an invalid retention result.');
          }
          const ids = value.map(event => event.id);
          if (ids.length > 0) {
            // Waterline resolves `destroy()` to `undefined` unless `fetch()` is requested,
            // so the deleted rows must be fetched to report an accurate retention count.
            const deleted = await AuthorizationAudit.destroy({ id: ids, occurredAt: { '<': cutoff } })
              .fetch()
              .usingConnection(connection);
            deletedCount = Array.isArray(deleted) ? deleted.length : 0;
          }
        }
        const summary = createAuthorizationAuditEvent(
          {
            ...actor,
            eventType: 'audit.retention.completed',
            targetType: 'authorization-audit',
            after: {
              batchSize,
              cutoff,
              deletedCount,
              legalHold: options.legalHold === true,
              retentionDays,
              status,
            },
            reasonCode: `audit-retention-${status}`,
          },
          'succeeded',
          this.eventFactory
        );
        await this.persistEvent(summary, connection);
        return { auditEventId: summary.eventId, deletedCount, status };
      });
    }
  }
}

declare global {
  let AuthorizationAuditService: Services.AuthorizationAuditService;
}
