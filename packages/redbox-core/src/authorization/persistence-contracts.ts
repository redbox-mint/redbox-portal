export const AUTHORIZATION_AUDIT_OUTCOMES = ['succeeded', 'denied', 'failed'] as const;
export type AuthorizationAuditOutcome = (typeof AUTHORIZATION_AUDIT_OUTCOMES)[number];

export const AUTHORIZATION_AUDIT_ACTOR_TYPES = ['user', 'system-process', 'operator'] as const;
export type AuthorizationAuditActorType = (typeof AUTHORIZATION_AUDIT_ACTOR_TYPES)[number];

export const AUTHORIZATION_AUDIT_AUTH_METHODS = ['session', 'legacy-bearer', 'internal', 'operator'] as const;
export type AuthorizationAuditAuthMethod = (typeof AUTHORIZATION_AUDIT_AUTH_METHODS)[number];

/**
 * Bounded administrative event vocabulary. Event types are part of the audit
 * contract, so new mutations must extend this list rather than emit free text.
 */
export const AUTHORIZATION_AUDIT_EVENT_TYPES = [
  'authorization.bootstrap.invariants-checked',
  'authorization.migration.batch-applied',
  'assignment.created',
  'assignment.batch-applied',
  'assignment.expired',
  'assignment.noop',
  'assignment.reactivated',
  'assignment.revoked',
  'assignment.source-replaced',
  'assignment.suppressed',
  'assignment.unsuppressed',
  'audit.retention.completed',
  'authorization.config-exported',
  'authorization.config-imported',
  'role.cloned',
  'role.created',
  'role.deleted',
  'role.inactivated',
  'role.scopes-updated',
  'role.template-upgraded',
  'role.template-upgrade-batch-applied',
  'role.updated',
  'scope.adopted',
  'scope.catalog-reconciled',
  'scope.orphaned',
  'template.reconciled',
  'template.revision-published',
] as const;
export type AuthorizationAuditEventType = (typeof AUTHORIZATION_AUDIT_EVENT_TYPES)[number];

export const AUTHORIZATION_AUDIT_TARGET_TYPES = [
  'authorization-audit',
  'authorization-config',
  'authorization-migration',
  'authorization-readiness',
  'authorization-scope',
  'role',
  'role-assignment',
  'role-scope-override',
  'role-template',
  'role-template-revision',
] as const;
export type AuthorizationAuditTargetType = (typeof AUTHORIZATION_AUDIT_TARGET_TYPES)[number];

const AUTHORIZATION_PERSISTENCE_REDACTED_EXACT_KEYS = new Set<string>([
  'apikey',
  'authorization',
  'authorizationheader',
  'bearer',
  'clientsecret',
  'cookie',
  'cookies',
  'credential',
  'credentials',
  'csrf',
  'csrftoken',
  'forwardedfor',
  'password',
  'principaldisplayname',
  'principalemail',
  'principalusername',
  'rawclaims',
  'rawrequest',
  'remoteaddress',
  'requestbody',
  'requestheaders',
  'requestip',
  'secret',
  'session',
  'sessionid',
  'useragent',
  'xforwardedfor',
]);

const AUTHORIZATION_PERSISTENCE_REDACTED_KEY_PARTS = ['credential', 'password', 'rawclaim', 'secret', 'token'] as const;

export const AUTHORIZATION_PERSISTENCE_REDACTION_MAX_DEPTH = 8;
export const AUTHORIZATION_PERSISTENCE_REDACTION_MAX_ENTRIES = 100;
export const AUTHORIZATION_PERSISTENCE_REDACTION_MAX_VALUES = 1_000;
export const AUTHORIZATION_PERSISTENCE_REDACTION_MAX_STRING_LENGTH = 4_096;

const AUTHORIZATION_PERSISTENCE_CIRCULAR_VALUE = '[CIRCULAR]';
const AUTHORIZATION_PERSISTENCE_TRUNCATED_VALUE = '[TRUNCATED]';

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function shouldOmitAuthorizationPersistenceField(key: string): boolean {
  const normalized = normalizeKey(key);
  return (
    AUTHORIZATION_PERSISTENCE_REDACTED_EXACT_KEYS.has(normalized) ||
    AUTHORIZATION_PERSISTENCE_REDACTED_KEY_PARTS.some(part => normalized.includes(part))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface AuthorizationPersistenceRedactionState {
  remainingValues: number;
  readonly ancestors: Set<object>;
}

/**
 * JSON-encodable shape produced by {@link redactAuthorizationPersistenceValue}. Audit
 * state snapshots accept this type only, so raw request or model objects cannot be
 * persisted without passing through redaction.
 */
export type AuthorizationRedactedValue =
  | string
  | number
  | boolean
  | null
  | readonly AuthorizationRedactedValue[]
  | { readonly [key: string]: AuthorizationRedactedValue };

function redactBoundedAuthorizationPersistenceValue(
  value: unknown,
  depth: number,
  state: AuthorizationPersistenceRedactionState
): AuthorizationRedactedValue {
  if (state.remainingValues <= 0) {
    return AUTHORIZATION_PERSISTENCE_TRUNCATED_VALUE;
  }
  state.remainingValues -= 1;

  if (typeof value === 'string') {
    return value.length <= AUTHORIZATION_PERSISTENCE_REDACTION_MAX_STRING_LENGTH
      ? value
      : value.slice(0, AUTHORIZATION_PERSISTENCE_REDACTION_MAX_STRING_LENGTH);
  }

  if (value === null || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value !== 'object') {
    return null;
  }

  // Dates carry meaningful audit state (`assignedAt`, `expiresAt`) but expose no own
  // enumerable keys, so they would otherwise be flattened to an empty object.
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (depth >= AUTHORIZATION_PERSISTENCE_REDACTION_MAX_DEPTH) {
    return AUTHORIZATION_PERSISTENCE_TRUNCATED_VALUE;
  }

  if (state.ancestors.has(value)) {
    return AUTHORIZATION_PERSISTENCE_CIRCULAR_VALUE;
  }

  state.ancestors.add(value);
  let redacted: AuthorizationRedactedValue;

  if (Array.isArray(value)) {
    redacted = value
      .slice(0, AUTHORIZATION_PERSISTENCE_REDACTION_MAX_ENTRIES)
      .map(entry => redactBoundedAuthorizationPersistenceValue(entry, depth + 1, state));
  } else if (isRecord(value)) {
    const redactedRecord: Record<string, AuthorizationRedactedValue> = {};
    const keys = Object.keys(value).slice(0, AUTHORIZATION_PERSISTENCE_REDACTION_MAX_ENTRIES);

    for (const key of keys) {
      if (!shouldOmitAuthorizationPersistenceField(key)) {
        redactedRecord[key] = redactBoundedAuthorizationPersistenceValue(value[key], depth + 1, state);
      }
    }
    redacted = redactedRecord;
  } else {
    redacted = null;
  }

  state.ancestors.delete(value);
  return redacted;
}

export function redactAuthorizationPersistenceValue(value: unknown): AuthorizationRedactedValue {
  return redactBoundedAuthorizationPersistenceValue(value, 0, {
    remainingValues: AUTHORIZATION_PERSISTENCE_REDACTION_MAX_VALUES,
    ancestors: new Set<object>(),
  });
}
