import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import {
  AUTHORIZATION_MAX_SCOPE_SET_SIZE,
  AUTHORIZATION_PERSISTENCE_REDACTION_MAX_DEPTH,
  AUTHORIZATION_PERSISTENCE_REDACTION_MAX_ENTRIES,
  AUTHORIZATION_PRINCIPAL_CATEGORIES,
  assertAuthorizationFreeTextSafe,
  containsAuthorizationCredentialValue,
  containsAuthorizationUuid,
  redactAuthorizationCredentialStrings,
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

  it('uses only the design principal categories', () => {
    assert.deepEqual(AUTHORIZATION_PRINCIPAL_CATEGORIES, [
      'anonymous',
      'authenticated',
      'system-admin',
      'legacy-bearer',
      'system-process',
    ]);
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

  it('redacts credential values stored under neutral key names', () => {
    const bearer = 'Bearer abcdef123456';
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5c';
    assert.equal(containsAuthorizationCredentialValue(bearer), true);
    assert.equal(containsAuthorizationCredentialValue(jwt), true);
    assert.equal(containsAuthorizationCredentialValue('approved by operator'), false);
    assert.equal(containsAuthorizationCredentialValue('00000000-0000-4000-8000-000000000001'), false);
    assert.equal(
      redactAuthorizationCredentialStrings(`call back on ${bearer} please`),
      'call back on [REDACTED] please'
    );

    assert.deepEqual(
      redactAuthorizationPersistenceValue({
        notes: `escalated with ${bearer}`,
        nested: { handoff: jwt, safe: 'ok' },
        reason: 'approved by operator',
        eventId: '00000000-0000-4000-8000-000000000001',
      }),
      {
        notes: 'escalated with [REDACTED]',
        nested: { handoff: '[REDACTED]', safe: 'ok' },
        reason: 'approved by operator',
        eventId: '00000000-0000-4000-8000-000000000001',
      }
    );
  });

  it('rejects free-text fields carrying credential material', () => {
    assert.throws(() => assertAuthorizationFreeTextSafe('Bearer abcdef123456', 'reason'), /credential material/);
    assert.throws(
      () => assertAuthorizationFreeTextSafe('login with password=hunter2-hunter', 'reason'),
      /credential material/
    );
    assert.doesNotThrow(() => assertAuthorizationFreeTextSafe('approved by operator', 'reason'));
  });

  it('treats a bare UUID as a bearer leak only outside identifier fields', () => {
    const bearerUuid = '123e4567-e89b-12d3-a456-426614174000';
    // Key-agnostic credential check still treats a bare UUID as an ordinary ID.
    assert.equal(containsAuthorizationUuid(bearerUuid), true);
    assert.equal(containsAuthorizationCredentialValue(bearerUuid), false);
    assert.equal(containsAuthorizationCredentialValue('approved by operator'), false);

    // Free-text reason must reject the UUID bearer; identifier fields must accept it.
    assert.throws(
      () => assertAuthorizationFreeTextSafe(`escalated with ${bearerUuid}`, 'reason'),
      /credential material/
    );
    assert.throws(() => assertAuthorizationFreeTextSafe(bearerUuid, 'reasonCode'), /credential material/);
    assert.doesNotThrow(() => assertAuthorizationFreeTextSafe(bearerUuid, 'eventId'));
    assert.doesNotThrow(() => assertAuthorizationFreeTextSafe(bearerUuid, 'requestId'));
    assert.doesNotThrow(() => assertAuthorizationFreeTextSafe(bearerUuid, 'targetId'));
    assert.doesNotThrow(() => assertAuthorizationFreeTextSafe(bearerUuid, 'actorId'));
  });

  it('redacts bare UUIDs under neutral snapshot keys while preserving identifier keys', () => {
    const bearerUuid = '123e4567-e89b-12d3-a456-426614174000';
    assert.deepEqual(
      redactAuthorizationPersistenceValue({
        notes: `escalated with ${bearerUuid} please`,
        nested: { handoff: bearerUuid, safe: 'ok' },
        reason: 'approved by operator',
        eventId: bearerUuid,
        requestId: bearerUuid,
        targetId: bearerUuid,
      }),
      {
        notes: 'escalated with [REDACTED] please',
        nested: { handoff: '[REDACTED]', safe: 'ok' },
        reason: 'approved by operator',
        eventId: bearerUuid,
        requestId: bearerUuid,
        targetId: bearerUuid,
      }
    );
  });

  it('redacts root-level UUID strings and arrays while preserving identifier keys', () => {
    const bearerUuid = '123e4567-e89b-12d3-a456-426614174000';
    // Root-level snapshots accept unknown, so a bare UUID with no key context
    // must be treated as a potential bearer leak.
    assert.equal(redactAuthorizationPersistenceValue(bearerUuid), '[REDACTED]');
    assert.equal(
      redactAuthorizationPersistenceValue(`escalated with ${bearerUuid} please`),
      'escalated with [REDACTED] please'
    );
    assert.deepEqual(redactAuthorizationPersistenceValue([bearerUuid, 'ok']), ['[REDACTED]', 'ok']);
    assert.deepEqual(redactAuthorizationPersistenceValue([`token ${bearerUuid}`]), ['token [REDACTED]']);

    // Neutral key context redacts; identifier key context preserves.
    assert.deepEqual(redactAuthorizationPersistenceValue({ notes: bearerUuid }), {
      notes: '[REDACTED]',
    });
    assert.deepEqual(redactAuthorizationPersistenceValue({ eventId: bearerUuid }), {
      eventId: bearerUuid,
    });
    assert.deepEqual(redactAuthorizationPersistenceValue({ id: bearerUuid }), {
      id: bearerUuid,
    });
  });

  it('redacts UUIDs under neutral keys ending in id while preserving documented identifiers', () => {
    const bearerUuid = '123e4567-e89b-12d3-a456-426614174000';
    // `valid`, `grid`, and `fluid` normalize to words ending in `id` but are
    // not identifier fields, so a bare UUID under them is a bearer leak.
    assert.deepEqual(
      redactAuthorizationPersistenceValue({
        valid: bearerUuid,
        grid: bearerUuid,
        fluid: bearerUuid,
      }),
      {
        valid: '[REDACTED]',
        grid: '[REDACTED]',
        fluid: '[REDACTED]',
      }
    );
    assert.throws(() => assertAuthorizationFreeTextSafe(bearerUuid, 'valid'), /credential material/);
    assert.throws(() => assertAuthorizationFreeTextSafe(bearerUuid, 'grid'), /credential material/);
    assert.throws(() => assertAuthorizationFreeTextSafe(bearerUuid, 'fluid'), /credential material/);

    // Documented identifier fields preserve ordinary UUID IDs.
    assert.deepEqual(
      redactAuthorizationPersistenceValue({
        id: bearerUuid,
        uuid: bearerUuid,
        eventId: bearerUuid,
        requestId: bearerUuid,
        targetId: bearerUuid,
        actorId: bearerUuid,
        brandId: bearerUuid,
        batchId: bearerUuid,
        principalId: bearerUuid,
        roleId: bearerUuid,
        assignmentId: bearerUuid,
        auditEventId: bearerUuid,
        routeId: bearerUuid,
        userId: bearerUuid,
        operationId: bearerUuid,
      }),
      {
        id: bearerUuid,
        uuid: bearerUuid,
        eventId: bearerUuid,
        requestId: bearerUuid,
        targetId: bearerUuid,
        actorId: bearerUuid,
        brandId: bearerUuid,
        batchId: bearerUuid,
        principalId: bearerUuid,
        roleId: bearerUuid,
        assignmentId: bearerUuid,
        auditEventId: bearerUuid,
        routeId: bearerUuid,
        userId: bearerUuid,
        operationId: bearerUuid,
      }
    );
    assert.doesNotThrow(() => assertAuthorizationFreeTextSafe(bearerUuid, 'id'));
    assert.doesNotThrow(() => assertAuthorizationFreeTextSafe(bearerUuid, 'uuid'));
    assert.doesNotThrow(() => assertAuthorizationFreeTextSafe(bearerUuid, 'eventId'));
    assert.doesNotThrow(() => assertAuthorizationFreeTextSafe(bearerUuid, 'requestId'));
    assert.doesNotThrow(() => assertAuthorizationFreeTextSafe(bearerUuid, 'targetId'));
    assert.doesNotThrow(() => assertAuthorizationFreeTextSafe(bearerUuid, 'actorId'));
    assert.doesNotThrow(() => assertAuthorizationFreeTextSafe(bearerUuid, 'brandId'));
    assert.doesNotThrow(() => assertAuthorizationFreeTextSafe(bearerUuid, 'batchId'));
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
