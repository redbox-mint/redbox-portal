import { strict as assert } from 'assert';
import { describe, it } from 'mocha';
import {
  AUTHORIZATION_MAX_SCOPE_SET_SIZE,
  AUTHORIZATION_PERSISTENCE_REDACTION_MAX_DEPTH,
  AUTHORIZATION_PERSISTENCE_REDACTION_MAX_ENTRIES,
  AUTHORIZATION_PRINCIPAL_CATEGORIES,
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
