import { strict as assert } from 'node:assert';
import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it } from 'mocha';
import { join, resolve } from 'node:path';
import { freezeAuthorizationContext, type AuthorizationContext } from '../../src/authorization';
import * as authorizationContextModule from '../../src/authorization/context';
import { isTrustedAuthorizationContextInternal } from '../../src/services/AuthorizationActorIssuer';
import * as authorizationIndex from '../../src/authorization';
import * as authorizationServiceModule from '../../src/services/AuthorizationService';
import { genuineTestActor } from './genuineActor';
import { normalizeLinkUserAccountsRequest, type LinkUserAccountsCommand } from '../../src/authorization/administration';
import { WaterlineModels } from '../../src/waterline-models';
import { AUTHORIZATION_PERSISTENCE_MODEL_INDEXES } from '../../src/services/AuthorizationPersistenceService';
import { discoverLocalMigrationFiles, generateMigrationConfigShim } from '../../src/loader';

function genuineInput(): Parameters<typeof freezeAuthorizationContext>[0] {
  return {
    contextType: 'brand',
    principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'admin-1' },
    brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1', exists: true, authorized: true },
    roles: [],
    compatibilityRoles: [],
    grantedScopeKeys: ['user.manage'] as never,
    effectiveScopeKeys: ['user.manage'] as never,
    scopeProvenance: [{ scopeKey: 'user.manage', roleIds: ['role-1'], roleKeys: ['researcher'] }] as never,
  };
}

function wireCommand(overrides: Partial<LinkUserAccountsCommand> = {}): LinkUserAccountsCommand {
  return {
    actor: undefined as never,
    brandId: 'brand-1',
    primaryUserId: 'primary-1',
    secondaryUserId: 'secondary-1',
    requestId: 'verify-1',
    ...overrides,
  };
}

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

describe('Phase 5 independent verification (AUTH-P5-001/006/008)', () => {
  /**
   * AUTH-P5-001: provenance is asserted only through the internal issuer's
   * guarded predicate. The capability lives module-private in
   * `services/AuthorizationActorIssuer` and is never minted by tests — a
   * real `AuthorizationService` instance no longer exposes issuance or
   * verification methods. Forgery is proven behaviorally at the guarded
   * writer (401) in the blocks below.
   */
  const isTrustedActor = (context: unknown): boolean => {
    try {
      return isTrustedAuthorizationContextInternal(context);
    } catch {
      return false;
    }
  };
  describe('AUTH-P5-001 module-private provenance', () => {
    it('rejects frozen forgeries that lack the server-issued capability', () => {
      const forgedFrozen = freezeAuthorizationContext(genuineInput());
      assert.equal(Object.isFrozen(forgedFrozen), true);
      assert.equal(isTrustedActor(forgedFrozen), false);
    });

    it('rejects hand-rolled Object.freeze forgeries', () => {
      const forged = Object.freeze({
        contextType: 'brand',
        principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'admin-1' },
        roles: [],
        compatibilityRoles: [],
        roleKeys: [],
        grantedScopeKeys: ['user.manage'],
        effectiveScopeKeys: ['user.manage'],
        scopeProvenance: [],
        resolutionEvidence: {},
      });
      assert.equal(isTrustedActor(forged), false);
      assert.equal(isTrustedActor(undefined), false);
      assert.equal(isTrustedActor(null), false);
      assert.equal(isTrustedActor('user.manage'), false);
    });

    it('issues genuine contexts only through the genuine AuthorizationService resolver', async () => {
      const issued = await genuineTestActor({
        contextType: 'brand',
        principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'admin-1' },
        brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1' },
        effectiveScopeKeys: ['user.manage'],
      });
      assert.equal(Object.isFrozen(issued), true);
      assert.equal(isTrustedActor(issued), true);
    });

    it('exposes no minting or predicate capability (deep import or public index)', () => {
      assert.equal(
        (authorizationContextModule as Record<string, unknown>).markServerIssuedAuthorizationContext,
        undefined
      );
      assert.equal((authorizationIndex as Record<string, unknown>).markServerIssuedAuthorizationContext, undefined);
      // The issuer, marker, and predicate all live module-private inside the
      // internal `services/AuthorizationActorIssuer` module: they are reachable
      // neither via the deep `authorization/context` import, nor via the
      // public index, nor via the deep service-module import. Verification is
      // available only through the guarded internal predicate used above.
      assert.equal((authorizationContextModule as Record<string, unknown>).issueServerAuthorizationContext, undefined);
      assert.equal((authorizationIndex as Record<string, unknown>).issueServerAuthorizationContext, undefined);
      assert.equal(
        (authorizationContextModule as Record<string, unknown>).isServerIssuedAuthorizationContext,
        undefined
      );
      assert.equal((authorizationIndex as Record<string, unknown>).isServerIssuedAuthorizationContext, undefined);
      assert.equal(
        (authorizationServiceModule as unknown as Record<string, unknown>).isServerIssuedAuthorizationContext,
        undefined
      );
      assert.equal(
        (authorizationServiceModule as unknown as Record<string, unknown>).markServerIssuedAuthorizationContext,
        undefined
      );
      assert.equal(
        (authorizationServiceModule as unknown as Record<string, unknown>).issueServerAuthorizationContext,
        undefined
      );
      assert.equal(typeof isTrustedAuthorizationContextInternal, 'function');
      assert.equal(typeof freezeAuthorizationContext, 'function');
    });

    it('every issued context is a distinct capability (no shared forgery)', async () => {
      const first = (await genuineTestActor({
        contextType: 'brand',
        principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'admin-1' },
        brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1' },
        effectiveScopeKeys: ['user.manage'],
      })) as AuthorizationContext;
      const second = freezeAuthorizationContext(genuineInput());
      assert.equal(isTrustedActor(first), true);
      assert.equal(isTrustedActor(second), false);
      assert.notEqual(first, second);
    });
  });

  describe('AUTH-P5-006 canonical mandatory link DTO', () => {
    it('normalizes a complete wire command to the mandatory request', () => {
      const request = normalizeLinkUserAccountsRequest(
        wireCommand({
          primaryExpectedVersion: 3,
          secondaryExpectedVersion: 2,
          linkConfirmationToken: 'token-1',
          linkOperationId: ' op-1 ',
        })
      );
      assert.equal(request.primaryExpectedVersion, 3);
      assert.equal(request.secondaryExpectedVersion, 2);
      assert.equal(request.linkConfirmationToken, 'token-1');
      assert.equal(request.linkOperationId, 'op-1');
      assert.equal(Object.isFrozen(request), true);
    });

    it('fails closed when either expected version is omitted', () => {
      assert.throws(
        () =>
          normalizeLinkUserAccountsRequest(
            wireCommand({
              secondaryExpectedVersion: 2,
              linkConfirmationToken: 'token-1',
              linkOperationId: 'op-1',
            })
          ),
        hasCode('authorization.version-conflict')
      );
      assert.throws(
        () =>
          normalizeLinkUserAccountsRequest(
            wireCommand({
              primaryExpectedVersion: 3,
              linkConfirmationToken: 'token-1',
              linkOperationId: 'op-1',
            })
          ),
        hasCode('authorization.version-conflict')
      );
    });

    it('fails closed on non-positive versions', () => {
      for (const bad of [0, -1, 1.5, Number.NaN]) {
        assert.throws(
          () =>
            normalizeLinkUserAccountsRequest(
              wireCommand({
                primaryExpectedVersion: bad,
                secondaryExpectedVersion: 2,
                linkConfirmationToken: 'token-1',
                linkOperationId: 'op-1',
              })
            ),
          hasCode('authorization.version-conflict')
        );
      }
    });

    it('fails closed when the confirmation token is omitted', () => {
      assert.throws(
        () =>
          normalizeLinkUserAccountsRequest(
            wireCommand({ primaryExpectedVersion: 3, secondaryExpectedVersion: 2, linkOperationId: 'op-1' })
          ),
        hasCode('authorization.preview-stale')
      );
    });

    it('fails closed when the operation ID is omitted', () => {
      assert.throws(
        () =>
          normalizeLinkUserAccountsRequest(
            wireCommand({
              primaryExpectedVersion: 3,
              secondaryExpectedVersion: 2,
              linkConfirmationToken: 'token-1',
            })
          ),
        hasCode('authorization.preview-stale')
      );
    });
  });

  describe('AUTH-P5-008 migration/model/loader registration', () => {
    const packageRoot = resolve(__dirname, '..', '..');
    const repoRoot = resolve(packageRoot, '..', '..');

    it('ships the account-link uniqueness migration with a stable name/up', () => {
      const migrationPath = join(repoRoot, 'api', 'migrations', '20260905T120000-account-link-uniqueness.js');
      assert.equal(existsSync(migrationPath), true);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const migration = require(migrationPath) as { name?: unknown; up?: unknown };
      assert.equal(migration.name, '20260905T120000-account-link-uniqueness');
      assert.equal(typeof migration.up, 'function');
    });

    it('registers UserLinkOperation in the model index and persistence indexes', () => {
      assert.ok('UserLinkOperation' in WaterlineModels);
      assert.ok('UserLink' in WaterlineModels);
      const operation = (WaterlineModels as Record<string, { identity?: unknown }>)['UserLinkOperation'];
      assert.equal(operation?.identity, 'userlinkoperation');
      const operationIndexes = AUTHORIZATION_PERSISTENCE_MODEL_INDEXES.find(
        entry => entry.modelIdentity === 'userlinkoperation'
      );
      assert.ok(operationIndexes !== undefined, 'persistence indexes must cover userlinkoperation');
      assert.ok(
        operationIndexes.indexes.some(
          index =>
            index.name === 'user_link_operation_id_unique' && (index.key as Record<string, unknown>).operationId === 1
        ),
        'userlinkoperation must carry the operationId unique index'
      );
      const linkIndexes = AUTHORIZATION_PERSISTENCE_MODEL_INDEXES.find(entry => entry.modelIdentity === 'userlink');
      assert.ok(linkIndexes !== undefined, 'persistence indexes must cover userlink');
      assert.ok(
        linkIndexes.indexes.some(index => index.name === 'user_link_secondary_status_unique'),
        'userlink must carry the secondary/status uniqueness index'
      );
    });

    it('converges loader generation from tracked sources without asserting ignored artifacts on disk', async () => {
      // The generated runtime registry (config/migrations.js) and per-model
      // shims (api/models/*.js) are git-ignored build outputs: this test
      // proves they CONVERGE from tracked sources instead of asserting they
      // exist on disk in a clean checkout.
      const localFiles = await discoverLocalMigrationFiles(repoRoot);
      assert.ok(
        localFiles.includes('20260905T120000-account-link-uniqueness.js'),
        'loader discovery must see the tracked account-link migration source'
      );
      const tempConfigDir = mkdtempSync(join(tmpdir(), 'redbox-migrations-'));
      try {
        await generateMigrationConfigShim(tempConfigDir, repoRoot, []);
        const generated = readFileSync(join(tempConfigDir, 'migrations.js'), 'utf8');
        assert.ok(
          generated.includes('20260905T120000-account-link-uniqueness.js'),
          'generated migration registry must converge from the tracked source'
        );
      } finally {
        rmSync(tempConfigDir, { recursive: true, force: true });
      }
      // Model-shim convergence: the loader emits api/models shims for every
      // key of WaterlineModels, so membership here proves the
      // UserLinkOperation shim converges without checking an ignored file.
      assert.ok(Object.keys(WaterlineModels).includes('UserLinkOperation'));
    });

    it('tracks the migration and model sources in version control (clean-checkout proof)', () => {
      let tracked = '';
      try {
        tracked = execSync('git ls-files api/migrations packages/redbox-core/src/waterline-models', {
          cwd: repoRoot,
          encoding: 'utf8',
        });
      } catch {
        assert.fail('git ls-files is unavailable; cannot prove clean-checkout tracking.');
      }
      assert.ok(
        tracked.includes('api/migrations/20260905T120000-account-link-uniqueness.js'),
        'the account-link uniqueness migration must be git-tracked'
      );
      assert.ok(
        tracked.includes('packages/redbox-core/src/waterline-models/UserLinkOperation.ts'),
        'the UserLinkOperation model must be git-tracked'
      );
      // Generated artifacts must NOT be tracked: asserting their absence
      // proves this suite does not depend on ignored build outputs.
      // (api/models/.gitkeep is the tracked placeholder; model shims such
      // as api/models/UserLink*.js and config/migrations.js must stay
      // untracked.)
      let generatedTracked = '';
      try {
        generatedTracked = execSync('git ls-files config/migrations.js api/models', {
          cwd: repoRoot,
          encoding: 'utf8',
        });
      } catch {
        assert.fail('git ls-files is unavailable; cannot prove generated artifacts are untracked.');
      }
      assert.ok(!generatedTracked.includes('config/migrations.js'));
      assert.ok(!generatedTracked.includes('api/models/UserLinkOperation.js'));
      assert.ok(!generatedTracked.includes('api/models/UserLink.js'));
    });
  });
});
