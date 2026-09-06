import { AuthorizationPersistenceValidationError } from './errors';

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
  'role.noop',
  'role.scopes-updated',
  'role.template-upgraded',
  'role.template-upgrade-batch-applied',
  'role.updated',
  'scope.adopted',
  'scope.catalog-reconciled',
  'scope.orphaned',
  'template.reconciled',
  'template.revision-published',
  'user.access-noop',
  'user.disabled',
  'user.enabled',
  'user.linked',
  'user.link-records-pending',
  'user.link-operation-completed',
  'assignment.role-set-applied',
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
  'user',
] as const;
export type AuthorizationAuditTargetType = (typeof AUTHORIZATION_AUDIT_TARGET_TYPES)[number];

export const AUTHORIZATION_PERSISTENCE_REDACTED_VALUE = '[REDACTED]';

/**
 * Centralized credential-material patterns for authorization persistence.
 *
 * Field-name redaction alone cannot cover bearer or credential values stored under
 * neutral keys (for example `notes` or free-text `reason`). Every authorization
 * persistence write must route string values through these patterns so a credential
 * cannot reach storage merely because its key was not recognized.
 */
const AUTHORIZATION_CREDENTIAL_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9\-._~+/=]{4,}/giu,
  /\bBasic\s+[A-Za-z0-9+/=]{4,}/giu,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/gu,
  /(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|auth[_-]?token|session[_-]?token|password|passwd|pwd|secret)\s*[:=]\s*['"]?[^\s'";,]{4,}['"]?/giu,
] as const;

export function containsAuthorizationCredentialValue(value: string): boolean {
  return AUTHORIZATION_CREDENTIAL_VALUE_PATTERNS.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function redactAuthorizationCredentialStrings(value: string): string {
  let redacted = value;
  for (const pattern of AUTHORIZATION_CREDENTIAL_VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, AUTHORIZATION_PERSISTENCE_REDACTED_VALUE);
  }
  return redacted;
}

/**
 * Legacy bearer credentials are opaque UUIDs (`User.token` is a UUIDv4). A bare
 * UUID is an ordinary identifier under ID keys (`eventId`, `requestId`, ...),
 * so the key-agnostic credential check above deliberately does not match it.
 * Under neutral snapshot keys (`notes`, `handoff`) or free-text `reason`, a
 * bare UUID must be treated as a potential bearer leak.
 */
const AUTHORIZATION_UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export function containsAuthorizationUuid(value: string): boolean {
  AUTHORIZATION_UUID_PATTERN.lastIndex = 0;
  return AUTHORIZATION_UUID_PATTERN.test(value);
}

export function redactAuthorizationUuidStrings(value: string): string {
  AUTHORIZATION_UUID_PATTERN.lastIndex = 0;
  return value.replace(AUTHORIZATION_UUID_PATTERN, AUTHORIZATION_PERSISTENCE_REDACTED_VALUE);
}

/**
 * Rejects free-text authorization fields that carry credential material. Snapshots
 * (`before`/`after`) are redacted so the audit row still persists; operator-supplied
 * free text (`reason`, `reasonCode`) is rejected so the secret never reaches
 * storage in the first place. Identifier fields (`eventId`, `requestId`, ...) keep
 * accepting ordinary UUIDs; only non-identifier free text rejects a bare UUID as a
 * potential legacy bearer leak.
 */
export function assertAuthorizationFreeTextSafe(value: string, field: string): void {
  if (containsAuthorizationCredentialValue(value)) {
    throw new AuthorizationPersistenceValidationError(
      'audit-event-invalid',
      `${field} must not contain credential material.`
    );
  }
  if (!isUuidPreservingKeyOrField(field) && containsAuthorizationUuid(value)) {
    throw new AuthorizationPersistenceValidationError(
      'audit-event-invalid',
      `${field} must not contain credential material.`
    );
  }
}

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

/**
 * Ordinary identifiers are UUIDs too (`eventId`, `requestId`, `targetId`, ...).
 * Preserve a bare UUID only when the key/field names an explicit documented
 * identifier; neutral snapshot keys (`notes`, `handoff`, `reason`) must treat
 * it as a potential legacy bearer leak. Suffix matching is deliberately not
 * used: neutral English words such as `valid`, `grid`, or `fluid` also end in
 * `id` after normalization and must not bypass redaction.
 */
const AUTHORIZATION_UUID_PRESERVING_KEYS = new Set<string>([
  'id',
  'uuid',
  // Authorization audit contract identifiers (AuthorizationAudit model and
  // AuthorizationAuditService inputs).
  'eventid',
  'actorid',
  'targetid',
  'requestid',
  'brandid',
  'batchid',
  // Documented authorization identifiers that may carry UUIDs in snapshots.
  'principalid',
  'normalizedprincipalid',
  'roleid',
  'assignmentid',
  'auditeventid',
  'routeid',
  'userid',
  'operationid',
]);

function isUuidPreservingKeyOrField(name: string): boolean {
  const normalized = normalizeKey(name);
  if (normalized.length === 0) return false;
  return AUTHORIZATION_UUID_PRESERVING_KEYS.has(normalized);
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
  state: AuthorizationPersistenceRedactionState,
  keyContext?: string
): AuthorizationRedactedValue {
  if (state.remainingValues <= 0) {
    return AUTHORIZATION_PERSISTENCE_TRUNCATED_VALUE;
  }
  state.remainingValues -= 1;

  if (typeof value === 'string') {
    // Credential values must not survive under neutral key names: redact bearer,
    // basic, JWT, and key-assignment material before applying the length bound.
    // A bare UUID is additionally redacted with neutral key context or at the
    // root (no key context), since legacy bearer tokens are UUIDs while
    // ordinary IDs share the same shape. Only identifier keys/fields
    // (`id`, `eventId`, ...) preserve the UUID.
    let withoutCredentials = redactAuthorizationCredentialStrings(value);
    if (keyContext === undefined || !isUuidPreservingKeyOrField(keyContext)) {
      withoutCredentials = redactAuthorizationUuidStrings(withoutCredentials);
    }
    return withoutCredentials.length <= AUTHORIZATION_PERSISTENCE_REDACTION_MAX_STRING_LENGTH
      ? withoutCredentials
      : withoutCredentials.slice(0, AUTHORIZATION_PERSISTENCE_REDACTION_MAX_STRING_LENGTH);
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
      .map(entry => redactBoundedAuthorizationPersistenceValue(entry, depth + 1, state, keyContext));
  } else if (isRecord(value)) {
    const redactedRecord: Record<string, AuthorizationRedactedValue> = {};
    const keys = Object.keys(value).slice(0, AUTHORIZATION_PERSISTENCE_REDACTION_MAX_ENTRIES);

    for (const key of keys) {
      if (!shouldOmitAuthorizationPersistenceField(key)) {
        redactedRecord[key] = redactBoundedAuthorizationPersistenceValue(value[key], depth + 1, state, key);
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
