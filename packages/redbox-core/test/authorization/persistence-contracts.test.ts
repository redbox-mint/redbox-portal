import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import {
  AUTHORIZATION_AUDIT_RECORD_BRAND_QUERY_INDEX,
  AUTHORIZATION_AUDIT_RECORD_EVENT_ID_UNIQUE_INDEX,
  AUTHORIZATION_MAX_SCOPE_SET_SIZE,
  AUTHORIZATION_PERSISTENCE_REDACTION_MAX_DEPTH,
  AUTHORIZATION_PERSISTENCE_REDACTION_MAX_ENTRIES,
  AUTHORIZATION_PRINCIPAL_CATEGORIES,
  AUTHORIZATION_SHADOW_MISMATCH_RECORD_FINGERPRINT_UNIQUE_INDEX,
  AuthorizationAuditRecord,
  AuthorizationShadowMismatchRecord,
  RoleAssignmentRecord,
  RoleScopeOverrideRecord,
  RoleTemplateRecord,
  ScopeRecord,
  ROLE_ASSIGNMENT_RECORD_PRINCIPAL_QUERY_INDEX,
  ROLE_ASSIGNMENT_RECORD_SOURCE_TUPLE_UNIQUE_INDEX,
  ROLE_SCOPE_OVERRIDE_RECORD_UNIQUE_INDEX,
  ROLE_TEMPLATE_RECORD_CONTEXT_REVISION_UNIQUE_INDEX,
  SCOPE_RECORD_KEY_UNIQUE_INDEX,
  asRoleKey,
  asScopeKey,
  hasValidAssignmentBrandContext,
  hasValidRoleBrandContext,
  redactAuthorizationPersistenceValue,
  validateCanonicalScopeKeyArray,
} from '../../src/authorization';

describe('authorization persistence contracts', () => {
  it('rejects persisted template revisions above the shared scope-set bound', () => {
    assert.throws(
      () =>
        validateCanonicalScopeKeyArray(
          Array.from({ length: AUTHORIZATION_MAX_SCOPE_SET_SIZE + 1 }, (_, index) => `record.field-${index}.read`)
        ),
      /cannot contain more than/u
    );
  });

  it('defines readonly persistence records with existing branded keys', () => {
    const scope = {
      key: asScopeKey('authorization.manage'),
      label: 'Authorization Manage',
      description: 'Allows authorization administration',
      risk: 'admin',
      namespace: 'authorization',
      sourceType: 'core',
      sourcePackage: '@researchdatabox/redbox-core',
      sourceVersion: '1.0.0',
      deprecated: false,
      createdAt: '2026-08-28T00:00:00.000Z',
      updatedAt: '2026-08-28T00:00:00.000Z',
    } satisfies ScopeRecord;

    const template = {
      roleKey: asRoleKey('Brand Admin'),
      brandId: 'brand-1',
      appliesToAllBrands: false,
      revision: 3,
      label: 'Brand Admin',
      description: 'Administrative brand role',
      scopeKeys: [scope.key],
      protectedKind: 'brand-admin',
      active: true,
      createdAt: '2026-08-28T00:00:00.000Z',
      updatedAt: '2026-08-28T00:00:00.000Z',
    } satisfies RoleTemplateRecord;

    const override = {
      roleKey: template.roleKey,
      brandId: 'brand-1',
      appliesToAllBrands: false,
      scopeKey: scope.key,
      effect: 'add',
      createdAt: '2026-08-28T00:00:00.000Z',
      updatedAt: '2026-08-28T00:00:00.000Z',
    } satisfies RoleScopeOverrideRecord;

    const assignment = {
      principalType: 'user',
      principalId: 'user-1',
      roleKey: template.roleKey,
      brandId: 'brand-1',
      appliesToAllBrands: false,
      source: 'external',
      sourceKey: 'idp:researchers',
      status: 'suppressed',
      sourcePresent: true,
      assignedAt: '2026-08-28T00:00:00.000Z',
      assignedBy: 'admin-1',
      expiresAt: '2027-08-28T00:00:00.000Z',
      revokedAt: '2026-08-28T01:00:00.000Z',
      revokedBy: 'admin-2',
      suppressedAt: '2026-08-28T02:00:00.000Z',
      suppressedBy: 'admin-3',
      reason: 'Local source governance',
      version: 4,
      updatedAt: '2026-08-28T00:00:00.000Z',
    } satisfies RoleAssignmentRecord;

    const audit = {
      eventId: 'event-1',
      schemaVersion: 1,
      eventType: 'assignment.suppressed',
      outcome: 'succeeded',
      actorType: 'user',
      actorId: 'admin-3',
      authMethod: 'session',
      brandId: 'brand-1',
      targetType: 'role-assignment',
      targetId: 'assignment-1',
      before: { status: 'active' },
      after: { status: 'suppressed' },
      reasonCode: 'assignment-suppressed',
      reason: 'Local source governance',
      requestId: 'request-1',
      batchId: 'batch-1',
      occurredAt: '2026-08-28T02:00:00.000Z',
    } satisfies AuthorizationAuditRecord;

    const shadowMismatch = {
      fingerprint: 'fingerprint-1',
      routeId: 'GET:/api/records/:id',
      brandId: 'brand-1',
      legacyOutcome: 'allow',
      scopeOutcome: 'deny',
      reasonCode: 'scope-missing',
      principalCategory: 'authenticated',
      count: 3,
      firstSeenAt: '2026-08-28T00:00:00.000Z',
      lastSeenAt: '2026-08-28T02:00:00.000Z',
      sampleRequestId: 'request-1',
      resolvedAt: '2026-08-28T03:00:00.000Z',
    } satisfies AuthorizationShadowMismatchRecord;

    assert.equal(scope.namespace, 'authorization');
    assert.equal(template.scopeKeys[0], scope.key);
    assert.equal(override.effect, 'add');
    assert.equal(assignment.sourceKey, 'idp:researchers');
    assert.equal(assignment.sourcePresent, true);
    assert.equal(assignment.version, 4);
    assert.equal(audit.actorId, 'admin-3');
    assert.equal(shadowMismatch.principalCategory, 'authenticated');
  });

  it('publishes stable unique and query index metadata', () => {
    assert.deepEqual(SCOPE_RECORD_KEY_UNIQUE_INDEX, {
      name: 'scope-record-key-unique',
      unique: true,
      fields: { key: 1 },
    });

    assert.deepEqual(ROLE_TEMPLATE_RECORD_CONTEXT_REVISION_UNIQUE_INDEX, {
      name: 'role-template-record-context-revision-unique',
      unique: true,
      fields: { roleKey: 1, brandId: 1, appliesToAllBrands: 1, revision: 1 },
    });

    assert.deepEqual(ROLE_SCOPE_OVERRIDE_RECORD_UNIQUE_INDEX, {
      name: 'role-scope-override-record-unique',
      unique: true,
      fields: { roleKey: 1, brandId: 1, appliesToAllBrands: 1, scopeKey: 1 },
    });

    assert.deepEqual(ROLE_ASSIGNMENT_RECORD_SOURCE_TUPLE_UNIQUE_INDEX, {
      name: 'role-assignment-record-source-tuple-unique',
      unique: true,
      fields: {
        principalType: 1,
        principalId: 1,
        roleKey: 1,
        brandId: 1,
        appliesToAllBrands: 1,
        source: 1,
        sourceKey: 1,
      },
    });

    assert.deepEqual(ROLE_ASSIGNMENT_RECORD_PRINCIPAL_QUERY_INDEX, {
      name: 'role-assignment-record-principal-query',
      unique: false,
      fields: { principalType: 1, principalId: 1, status: 1, expiresAt: 1 },
    });

    assert.deepEqual(AUTHORIZATION_AUDIT_RECORD_EVENT_ID_UNIQUE_INDEX, {
      name: 'authorization-audit-record-event-id-unique',
      unique: true,
      fields: { eventId: 1 },
    });

    assert.deepEqual(AUTHORIZATION_AUDIT_RECORD_BRAND_QUERY_INDEX, {
      name: 'authorization-audit-record-brand-query',
      unique: false,
      fields: { brandId: 1, occurredAt: -1 },
    });

    assert.deepEqual(AUTHORIZATION_SHADOW_MISMATCH_RECORD_FINGERPRINT_UNIQUE_INDEX, {
      name: 'authorization-shadow-mismatch-record-fingerprint-unique',
      unique: true,
      fields: { fingerprint: 1 },
    });
  });

  it('uses only the design principal categories', () => {
    assert.deepEqual(AUTHORIZATION_PRINCIPAL_CATEGORIES, [
      'anonymous',
      'authenticated',
      'system-admin',
      'legacy-bearer',
      'system-process',
    ]);
  });

  it('keeps the assignment source tuple unique per brand context', () => {
    const sourceTupleFields = Object.keys(ROLE_ASSIGNMENT_RECORD_SOURCE_TUPLE_UNIQUE_INDEX.fields);

    // The same principal must be able to hold the same role key in two brands.
    assert.equal(sourceTupleFields.includes('brandId'), true);
    assert.equal(sourceTupleFields.includes('appliesToAllBrands'), true);
  });

  it('validates role and assignment brand contexts without mutation or throwing', () => {
    assert.equal(hasValidRoleBrandContext({ brandId: undefined, appliesToAllBrands: true }), true);
    assert.equal(hasValidRoleBrandContext({ brandId: null, appliesToAllBrands: true }), true);
    assert.equal(hasValidAssignmentBrandContext({ brandId: null, appliesToAllBrands: true }), true);
    assert.equal(hasValidAssignmentBrandContext({ brandId: null, appliesToAllBrands: false }), false);
    assert.equal(hasValidRoleBrandContext({ brandId: 'brand-1', appliesToAllBrands: false }), true);
    assert.equal(hasValidRoleBrandContext({ brandId: 'brand-1', appliesToAllBrands: true }), false);
    assert.equal(hasValidRoleBrandContext({ brandId: '   ', appliesToAllBrands: false }), false);

    assert.equal(hasValidAssignmentBrandContext({ brandId: undefined, appliesToAllBrands: true }), true);
    assert.equal(hasValidAssignmentBrandContext({ brandId: 'brand-2', appliesToAllBrands: false }), true);
    assert.equal(hasValidAssignmentBrandContext({ brandId: undefined, appliesToAllBrands: false }), false);
    assert.equal(hasValidAssignmentBrandContext({ brandId: 'brand-2', appliesToAllBrands: true }), false);
  });

  it('removes token, raw request, and pii fields recursively while preserving safe context', () => {
    const source = {
      routeId: 'records.read',
      brandId: 'brand-1',
      principalId: 'user-1',
      principalEmail: 'user@example.test',
      principalUsername: 'alice',
      principalDisplayName: 'Alice Example',
      requestIp: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      tokenId: 'token-1',
      tokenScopeKeys: ['authorization.manage'],
      requestHeaders: { authorization: 'Bearer secret' },
      credentials: { password: 'secret password' },
      csrf: 'secret csrf value',
      rawClaims: { groups: ['private-group'] },
      sessionId: 'secret session id',
      rawRequest: {
        body: { title: 'secret draft' },
      },
      responseSummary: { allowed: true },
      additionalContext: {
        safe: true,
        nested: {
          tokenHash: 'hash',
          remoteAddress: '10.0.0.1',
          keep: 'value',
        },
      },
      items: [
        {
          tokenValue: 'secret',
          requestBody: { hidden: true },
          allowed: false,
        },
      ],
    };

    assert.deepEqual(redactAuthorizationPersistenceValue(source), {
      routeId: 'records.read',
      brandId: 'brand-1',
      principalId: 'user-1',
      responseSummary: { allowed: true },
      additionalContext: {
        safe: true,
        nested: {
          keep: 'value',
        },
      },
      items: [
        {
          allowed: false,
        },
      ],
    });

    assert.deepEqual(source.requestHeaders, { authorization: 'Bearer secret' });
    assert.deepEqual(source.additionalContext.nested, {
      tokenHash: 'hash',
      remoteAddress: '10.0.0.1',
      keep: 'value',
    });
  });

  it('preserves temporal and numeric audit state as encodable values', () => {
    const redacted = redactAuthorizationPersistenceValue({
      assignedAt: new Date('2026-08-28T00:00:00.000Z'),
      expiresAt: new Date(Number.NaN),
      version: 4n,
      notANumber: Number.NaN,
    });

    assert.deepEqual(redacted, {
      assignedAt: '2026-08-28T00:00:00.000Z',
      expiresAt: null,
      version: '4',
      notANumber: null,
    });
  });

  it('redacts cycles and bounds nested and collection values', () => {
    interface NestedValue {
      safe: boolean;
      child?: NestedValue;
    }

    interface CircularValue {
      safe: string;
      self?: CircularValue;
    }

    const circular: CircularValue = { safe: 'value' };
    circular.self = circular;

    const nested: NestedValue = { safe: true };
    let cursor = nested;
    for (let depth = 0; depth <= AUTHORIZATION_PERSISTENCE_REDACTION_MAX_DEPTH; depth += 1) {
      cursor.child = { safe: true };
      cursor = cursor.child;
    }

    const longArray = Array.from({ length: AUTHORIZATION_PERSISTENCE_REDACTION_MAX_ENTRIES + 20 }, (_, index) => index);
    const redactedCircular = redactAuthorizationPersistenceValue(circular);
    const redactedNested = redactAuthorizationPersistenceValue(nested);
    const redactedArray = redactAuthorizationPersistenceValue(longArray);
    const encodedCircular = JSON.stringify(redactedCircular);
    const encodedNested = JSON.stringify(redactedNested);

    assert.equal(encodedCircular, '{"safe":"value","self":"[CIRCULAR]"}');
    if (encodedNested === undefined) {
      assert.fail('Expected the redacted nested value to be JSON encodable.');
    }
    assert.match(encodedNested, /\[TRUNCATED\]/);
    assert.equal(Array.isArray(redactedArray), true);
    if (!Array.isArray(redactedArray)) {
      assert.fail('Expected a redacted array.');
    }
    assert.equal(redactedArray.length, AUTHORIZATION_PERSISTENCE_REDACTION_MAX_ENTRIES);
  });
});
