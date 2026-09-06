import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'mocha';
import { freezeAuthorizationContext } from '../../src/authorization';
import * as authorizationIndex from '../../src/authorization';
import * as authorizationContextModule from '../../src/authorization/context';
import * as authorizationServiceModule from '../../src/services/AuthorizationService';
import { isTrustedAuthorizationContextInternal } from '../../src/services/AuthorizationActorIssuer';
import { genuineTestActor } from './genuineActor';
import { Services as RoleAdministrationServices } from '../../src/services/RoleAdministrationService';
import { createScopeRegistry, asScopeKey } from '../../src/authorization';

function testRegistry() {
  return createScopeRegistry([
    {
      sourceType: 'core',
      sourcePackage: '@researchdatabox/redbox-core',
      sourceVersion: '1.0.0-test',
      definitions: [
        { key: asScopeKey('authorization.role.manage'), label: 'x', description: 'x', risk: 'admin' },
        { key: asScopeKey('authorization.role.read'), label: 'x', description: 'x', risk: 'read' },
      ],
    },
  ]);
}

function forgedFrozenActor(): unknown {
  return freezeAuthorizationContext({
    contextType: 'brand',
    principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'attacker-1' },
    brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1', exists: true, authorized: true },
    roles: [],
    compatibilityRoles: [],
    grantedScopeKeys: ['authorization.role.manage'] as never,
    effectiveScopeKeys: ['authorization.role.manage'] as never,
    scopeProvenance: [{ scopeKey: 'authorization.role.manage', roleIds: ['role-1'], roleKeys: ['admin'] }] as never,
  });
}

describe('AUTH-P5-001 actor provenance packaging (independent)', () => {
  it('publishes only the entry point: package exports blocks deep issuer imports', () => {
    const packageJson = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
      readonly exports?: Readonly<Record<string, unknown>>;
    };
    assert.ok(packageJson.exports !== undefined, 'package exports map must exist');
    const subpaths = Object.keys(packageJson.exports);
    assert.ok(subpaths.includes('.'), 'entry point must stay exported');
    assert.ok(subpaths.includes('./package.json'), 'package.json subpath must stay exported');
    assert.equal(
      subpaths.some(subpath => subpath.includes('*') || subpath.includes('AuthorizationActorIssuer')),
      false,
      'no wildcard or issuer subpath may be published'
    );
  });

  it('exposes no mint/verifier from the public index, context module, or service module', () => {
    for (const symbol of [
      'issueTrustedAuthorizationContextInternal',
      'isTrustedAuthorizationContextInternal',
      'requireTrustedAuthorizationContextInternal',
      'createSystemProcessContextInternal',
      'markServerIssuedAuthorizationContext',
      'issueServerAuthorizationContext',
      'isServerIssuedAuthorizationContext',
    ]) {
      assert.equal((authorizationIndex as Record<string, unknown>)[symbol], undefined, `index.${symbol}`);
      assert.equal((authorizationContextModule as Record<string, unknown>)[symbol], undefined, `context.${symbol}`);
      assert.equal(
        (authorizationServiceModule as unknown as Record<string, unknown>)[symbol],
        undefined,
        `service.${symbol}`
      );
    }
  });

  it('rejects frozen forgeries while accepting genuine resolver-issued contexts', async () => {
    const forged = forgedFrozenActor();
    assert.equal(Object.isFrozen(forged), true);
    assert.equal(isTrustedAuthorizationContextInternal(forged), false);
    const genuine = await genuineTestActor({
      contextType: 'brand',
      principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'admin-1' },
      brand: { id: 'brand-1', name: 'Brand 1' },
      effectiveScopeKeys: ['authorization.role.manage'],
    });
    assert.equal(isTrustedAuthorizationContextInternal(genuine), true);
  });

  it('ignores an injected trust predicate: forgeries still fail closed at the guarded writer', async () => {
    const audits: unknown[] = [];
    const deps = {
      now: () => new Date('2026-09-06T00:00:00.000Z'),
      randomId: () => 'test-id',
      getRegistry: () => testRegistry(),
      getConfirmationSecret: () => 'test-secret',
      audit: () => ({
        createSucceededEvent: async (input: unknown) => {
          audits.push(input);
          return { id: 'audit-1' };
        },
        recordAttempt: async () => ({ persisted: true }),
      }),
      configurationImport: () => ({
        previewImport: async () => {
          throw new Error('unreachable');
        },
        applyImport: async () => {
          throw new Error('unreachable');
        },
      }),
      runTransaction: async <T>(work: (connection: never) => Promise<T>): Promise<T> => work(undefined as never),
      // Bypass attempt: must be ignored — the service no longer accepts an
      // injectable verifier.
      isTrustedActor: () => true,
    };
    const service = new RoleAdministrationServices.RoleAdministrationService(deps as never);
    const forged = forgedFrozenActor();
    assert.equal(isTrustedAuthorizationContextInternal(forged), false);
    let code: string | undefined;
    try {
      await service.listRoles({ actor: forged as never, brandId: 'brand-1', requestId: 'prov-1' });
    } catch (error) {
      code = (error as { readonly code?: string }).code;
    }
    assert.equal(code, 'authorization.authentication-required');
  });
});
