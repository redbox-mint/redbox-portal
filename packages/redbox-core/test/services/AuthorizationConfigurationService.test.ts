import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES, type AuthorizationConfigurationDocument } from '../../src/authorization';
import {
  Services,
  parseAuthorizationConfigurationDocument,
} from '../../src/services/AuthorizationConfigurationService';

function validDocument(): AuthorizationConfigurationDocument {
  return {
    schemaVersion: 1,
    templates: [
      {
        key: 'researcher',
        displayName: 'Researchers',
        description: 'Researcher template',
        protectedKind: 'none',
        status: 'active',
        version: 1,
        revisions: [{ revision: 1, scopeKeys: ['authorization.self.read', 'record.read'] }],
      },
    ],
    roles: [
      {
        brandId: 'brand-1',
        key: 'researcher',
        displayName: 'Researchers',
        protectedKind: 'none',
        status: 'active',
        templateKey: 'researcher',
        templateRevision: 1,
        effectiveScopeKeys: ['authorization.self.read', 'record.read'],
        version: 1,
      },
    ],
    assignments: [
      {
        principalId: 'user-1',
        brandId: 'brand-1',
        roleKey: 'researcher',
        source: 'manual',
        sourceKey: 'manual',
        status: 'active',
        sourcePresent: true,
        version: 1,
      },
    ],
  };
}

describe('AuthorizationConfigurationService', () => {
  it('exports only the read-side configuration operation', () => {
    const exported = new Services.AuthorizationConfigurationService({
      getConfirmationSecret: () => 'x'.repeat(32),
    }).exports();
    assert.equal(typeof exported.exportConfiguration, 'function');
    assert.equal(exported.previewImport, undefined);
    assert.equal(exported.applyImport, undefined);
    assert.equal(exported.update, undefined);
    assert.equal(exported.destroy, undefined);
  });

  it('strictly parses, canonicalizes dates, and freezes a versioned document', () => {
    const parsed = parseAuthorizationConfigurationDocument(
      JSON.stringify({ ...validDocument(), generatedAt: '2026-08-30T10:00:00+09:30' })
    );

    assert.equal(parsed.generatedAt, '2026-08-30T00:30:00.000Z');
    assert.equal(Object.isFrozen(parsed), true);
    assert.equal(Object.isFrozen(parsed.templates), true);
    assert.equal(Object.isFrozen(parsed.templates[0].revisions), true);
    assert.equal(Object.isFrozen(parsed.roles), true);
    assert.equal(Object.isFrozen(parsed.assignments), true);
  });

  it('fails closed on unknown fields, unsorted/duplicate scopes, duplicate role contexts, and non-manual sources', () => {
    const base = validDocument();
    const invalidDocuments: unknown[] = [
      { ...base, credential: 'must-never-be-accepted' },
      {
        ...base,
        templates: [
          {
            ...base.templates[0],
            revisions: [{ revision: 1, scopeKeys: ['record.read', 'authorization.self.read'] }],
          },
        ],
      },
      { ...base, roles: [base.roles[0], { ...base.roles[0] }] },
      {
        ...base,
        assignments: [{ ...base.assignments?.[0], source: 'external', sourceKey: 'private-claim' }],
      },
      {
        ...base,
        assignments: [{ ...base.assignments?.[0], expiresAt: '2026-02-30T10:00:00Z' }],
      },
      {
        ...base,
        templates: [
          {
            ...base.templates[0],
            revisions: Array.from({ length: 501 }, (_value, index) => ({ revision: index + 1, scopeKeys: [] })),
          },
        ],
      },
      {
        ...base,
        templates: [
          {
            ...base.templates[0],
            revisions: [{ revision: 1, scopeKeys: ['not a scope'] }],
          },
        ],
      },
    ];

    for (const document of invalidDocuments) {
      assert.throws(
        () => parseAuthorizationConfigurationDocument(document as AuthorizationConfigurationDocument),
        (error: unknown) =>
          typeof error === 'object' &&
          error !== null &&
          Reflect.get(error, 'code') === 'authorization.bulk-invalid' &&
          Reflect.get(error, 'status') === 422
      );
    }
  });

  it('rejects malformed and oversized JSON before persistence access', () => {
    const validSerializedDocument = JSON.stringify(validDocument());
    const maxByteDocument = validSerializedDocument.padEnd(AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES, ' ');
    assert.doesNotThrow(() => parseAuthorizationConfigurationDocument(maxByteDocument));
    assert.throws(() => parseAuthorizationConfigurationDocument(`${maxByteDocument} `), /cannot exceed/);
    assert.throws(() => parseAuthorizationConfigurationDocument('{"schemaVersion":'), /not valid JSON/);
    assert.throws(
      () =>
        parseAuthorizationConfigurationDocument(`{"padding":"${'x'.repeat(AUTHORIZATION_ADMIN_MAX_IMPORT_BYTES)}"}`),
      /cannot exceed/
    );
  });

  it('keeps a brand literally identified as system distinct from the global system context', () => {
    const document = validDocument();
    assert.doesNotThrow(() =>
      parseAuthorizationConfigurationDocument({
        ...document,
        roles: [
          { ...document.roles[0], brandId: 'system' },
          {
            key: document.roles[0].key,
            displayName: 'Global role-shaped fixture',
            protectedKind: 'system-admin',
            status: 'active',
            effectiveScopeKeys: ['authorization.self.read', 'system.authorization.manage'],
            version: 1,
          },
        ],
      })
    );
  });
});
