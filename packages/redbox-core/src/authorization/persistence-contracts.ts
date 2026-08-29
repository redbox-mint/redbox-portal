import {
  AuthorizationDecisionReasonCode,
  AuthorizationPrincipalCategory,
  AuthorizationScopeRisk,
  AuthorizationScopeSourceType,
  ProtectedRoleKind,
  RoleAssignmentSource,
  RoleAssignmentStatus,
  RoleKey,
  RoleScopeEffect,
  ScopeKey,
} from './types';

export type AuthorizationPersistenceIndexDirection = 1 | -1;

export interface AuthorizationPersistenceIndexDefinition {
  readonly name: string;
  readonly unique: boolean;
  readonly fields: Readonly<Record<string, AuthorizationPersistenceIndexDirection>>;
  readonly partialFilter?: Readonly<Record<string, string | number | boolean>>;
}

export interface RoleAuthorizationFields {
  readonly roleKey: RoleKey;
  readonly brandId?: string;
  readonly appliesToAllBrands: boolean;
}

export interface ScopeRecord {
  readonly key: ScopeKey;
  readonly label: string;
  readonly description: string;
  readonly risk: AuthorizationScopeRisk;
  readonly namespace: string;
  readonly sourceType: AuthorizationScopeSourceType;
  readonly sourcePackage: string;
  readonly sourceVersion: string;
  readonly deprecated: boolean;
  readonly replacementKey?: ScopeKey;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RoleTemplateRecord extends RoleAuthorizationFields {
  readonly revision: number;
  readonly label: string;
  readonly description: string;
  readonly scopeKeys: readonly ScopeKey[];
  readonly protectedKind: ProtectedRoleKind;
  readonly active: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RoleScopeOverrideRecord extends RoleAuthorizationFields {
  readonly scopeKey: ScopeKey;
  readonly effect: RoleScopeEffect;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RoleAssignmentRecord extends RoleAuthorizationFields {
  readonly principalType: 'user';
  readonly principalId: string;
  readonly source: RoleAssignmentSource;
  readonly sourceKey: string;
  readonly status: RoleAssignmentStatus;
  readonly sourcePresent: boolean;
  readonly assignedAt: string;
  readonly assignedBy: string;
  readonly expiresAt?: string;
  readonly revokedAt?: string;
  readonly revokedBy?: string;
  readonly suppressedAt?: string;
  readonly suppressedBy?: string;
  readonly reason?: string;
  readonly version: number;
  readonly updatedAt: string;
}

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

export interface AuthorizationAuditRecord {
  readonly eventId: string;
  readonly schemaVersion: number;
  readonly eventType: AuthorizationAuditEventType;
  readonly outcome: AuthorizationAuditOutcome;
  readonly actorType: AuthorizationAuditActorType;
  readonly actorId: string;
  readonly authMethod: AuthorizationAuditAuthMethod;
  readonly brandId?: string;
  readonly targetType: AuthorizationAuditTargetType;
  readonly targetId?: string;
  /** Redacted prior state. Only {@link redactAuthorizationPersistenceValue} output is persistable. */
  readonly before?: AuthorizationRedactedValue;
  /** Redacted resulting state. Only {@link redactAuthorizationPersistenceValue} output is persistable. */
  readonly after?: AuthorizationRedactedValue;
  readonly reasonCode?: string;
  readonly reason?: string;
  readonly requestId?: string;
  readonly batchId?: string;
  readonly occurredAt: string;
}

export interface AuthorizationShadowMismatchRecord {
  readonly fingerprint: string;
  readonly routeId: string;
  readonly brandId?: string;
  readonly legacyOutcome: 'allow' | 'deny';
  readonly scopeOutcome: 'allow' | 'deny';
  readonly reasonCode: AuthorizationDecisionReasonCode;
  readonly principalCategory: AuthorizationPrincipalCategory;
  readonly count: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly sampleRequestId?: string;
  readonly resolvedAt?: string;
}

export const SCOPE_RECORD_KEY_UNIQUE_INDEX: AuthorizationPersistenceIndexDefinition = Object.freeze({
  name: 'scope-record-key-unique',
  unique: true,
  fields: Object.freeze({ key: 1 }),
});

export const SCOPE_RECORD_NAMESPACE_QUERY_INDEX: AuthorizationPersistenceIndexDefinition = Object.freeze({
  name: 'scope-record-namespace-query',
  unique: false,
  fields: Object.freeze({ namespace: 1, deprecated: 1, key: 1 }),
});

export const ROLE_TEMPLATE_RECORD_CONTEXT_REVISION_UNIQUE_INDEX: AuthorizationPersistenceIndexDefinition =
  Object.freeze({
    name: 'role-template-record-context-revision-unique',
    unique: true,
    fields: Object.freeze({ roleKey: 1, brandId: 1, appliesToAllBrands: 1, revision: 1 }),
  });

export const ROLE_TEMPLATE_RECORD_CONTEXT_QUERY_INDEX: AuthorizationPersistenceIndexDefinition = Object.freeze({
  name: 'role-template-record-context-query',
  unique: false,
  fields: Object.freeze({ brandId: 1, appliesToAllBrands: 1, active: 1, roleKey: 1, revision: -1 }),
});

export const ROLE_SCOPE_OVERRIDE_RECORD_UNIQUE_INDEX: AuthorizationPersistenceIndexDefinition = Object.freeze({
  name: 'role-scope-override-record-unique',
  unique: true,
  fields: Object.freeze({ roleKey: 1, brandId: 1, appliesToAllBrands: 1, scopeKey: 1 }),
});

export const ROLE_SCOPE_OVERRIDE_RECORD_ROLE_QUERY_INDEX: AuthorizationPersistenceIndexDefinition = Object.freeze({
  name: 'role-scope-override-record-role-query',
  unique: false,
  fields: Object.freeze({ roleKey: 1, brandId: 1, appliesToAllBrands: 1, effect: 1, scopeKey: 1 }),
});

/**
 * Role identity in this contract is the composite `(roleKey, brandId, appliesToAllBrands)`
 * rather than a single role reference, so the brand context is part of the uniqueness
 * tuple. Without it, the same principal could not hold the same role key in two brands.
 */
export const ROLE_ASSIGNMENT_RECORD_SOURCE_TUPLE_UNIQUE_INDEX: AuthorizationPersistenceIndexDefinition = Object.freeze({
  name: 'role-assignment-record-source-tuple-unique',
  unique: true,
  fields: Object.freeze({
    principalType: 1,
    principalId: 1,
    roleKey: 1,
    brandId: 1,
    appliesToAllBrands: 1,
    source: 1,
    sourceKey: 1,
  }),
});

export const ROLE_ASSIGNMENT_RECORD_PRINCIPAL_QUERY_INDEX: AuthorizationPersistenceIndexDefinition = Object.freeze({
  name: 'role-assignment-record-principal-query',
  unique: false,
  fields: Object.freeze({ principalType: 1, principalId: 1, status: 1, expiresAt: 1 }),
});

export const ROLE_ASSIGNMENT_RECORD_BRAND_ROLE_QUERY_INDEX: AuthorizationPersistenceIndexDefinition = Object.freeze({
  name: 'role-assignment-record-brand-role-query',
  unique: false,
  fields: Object.freeze({ brandId: 1, roleKey: 1, status: 1 }),
});

export const ROLE_ASSIGNMENT_RECORD_ROLE_QUERY_INDEX: AuthorizationPersistenceIndexDefinition = Object.freeze({
  name: 'role-assignment-record-role-query',
  unique: false,
  fields: Object.freeze({ roleKey: 1, status: 1 }),
});

export const ROLE_ASSIGNMENT_RECORD_EXPIRY_QUERY_INDEX: AuthorizationPersistenceIndexDefinition = Object.freeze({
  name: 'role-assignment-record-expiry-query',
  unique: false,
  fields: Object.freeze({ expiresAt: 1, status: 1 }),
});

export const AUTHORIZATION_AUDIT_RECORD_EVENT_ID_UNIQUE_INDEX: AuthorizationPersistenceIndexDefinition = Object.freeze({
  name: 'authorization-audit-record-event-id-unique',
  unique: true,
  fields: Object.freeze({ eventId: 1 }),
});

export const AUTHORIZATION_AUDIT_RECORD_OCCURRED_AT_QUERY_INDEX: AuthorizationPersistenceIndexDefinition =
  Object.freeze({
    name: 'authorization-audit-record-occurred-at-query',
    unique: false,
    fields: Object.freeze({ occurredAt: -1 }),
  });

export const AUTHORIZATION_AUDIT_RECORD_BRAND_QUERY_INDEX: AuthorizationPersistenceIndexDefinition = Object.freeze({
  name: 'authorization-audit-record-brand-query',
  unique: false,
  fields: Object.freeze({ brandId: 1, occurredAt: -1 }),
});

export const AUTHORIZATION_AUDIT_RECORD_ACTOR_QUERY_INDEX: AuthorizationPersistenceIndexDefinition = Object.freeze({
  name: 'authorization-audit-record-actor-query',
  unique: false,
  fields: Object.freeze({ actorId: 1, occurredAt: -1 }),
});

export const AUTHORIZATION_AUDIT_RECORD_TARGET_QUERY_INDEX: AuthorizationPersistenceIndexDefinition = Object.freeze({
  name: 'authorization-audit-record-target-query',
  unique: false,
  fields: Object.freeze({ targetType: 1, targetId: 1, occurredAt: -1 }),
});

export const AUTHORIZATION_AUDIT_RECORD_EVENT_OUTCOME_QUERY_INDEX: AuthorizationPersistenceIndexDefinition =
  Object.freeze({
    name: 'authorization-audit-record-event-outcome-query',
    unique: false,
    fields: Object.freeze({ eventType: 1, outcome: 1, occurredAt: -1 }),
  });

export const AUTHORIZATION_SHADOW_MISMATCH_RECORD_FINGERPRINT_UNIQUE_INDEX: AuthorizationPersistenceIndexDefinition =
  Object.freeze({
    name: 'authorization-shadow-mismatch-record-fingerprint-unique',
    unique: true,
    fields: Object.freeze({ fingerprint: 1 }),
  });

export const AUTHORIZATION_SHADOW_MISMATCH_RECORD_RESOLUTION_QUERY_INDEX: AuthorizationPersistenceIndexDefinition =
  Object.freeze({
    name: 'authorization-shadow-mismatch-record-resolution-query',
    unique: false,
    fields: Object.freeze({ resolvedAt: 1, lastSeenAt: -1 }),
  });

export const AUTHORIZATION_SHADOW_MISMATCH_RECORD_BRAND_QUERY_INDEX: AuthorizationPersistenceIndexDefinition =
  Object.freeze({
    name: 'authorization-shadow-mismatch-record-brand-query',
    unique: false,
    fields: Object.freeze({ brandId: 1, lastSeenAt: -1 }),
  });

/**
 * Datastores materialise an unset brand as either `undefined` or `null`, so both are
 * treated as an absent brand context.
 */
export interface BrandContextFields {
  readonly brandId?: string | null;
  readonly appliesToAllBrands: boolean;
}

function hasAbsentBrandId(brandId: string | null | undefined): boolean {
  return brandId === undefined || brandId === null;
}

function hasTrimmedBrandId(brandId: string | null | undefined): boolean {
  return typeof brandId === 'string' && brandId.trim().length > 0;
}

function hasValidBrandContext(fields: BrandContextFields): boolean {
  return fields.appliesToAllBrands ? hasAbsentBrandId(fields.brandId) : hasTrimmedBrandId(fields.brandId);
}

export function hasValidRoleBrandContext(fields: BrandContextFields): boolean {
  return hasValidBrandContext(fields);
}

export function hasValidAssignmentBrandContext(record: BrandContextFields): boolean {
  return hasValidBrandContext(record);
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
