import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';

import {
  __resetMigrationLeaseStateForTests,
  acquireMigrationLease,
} from '../../src/services/AuthorizationMigrationService';
import {
  Services as BootstrapServices,
  protectedSystemAssignmentBootstrapIssue,
} from '../../src/services/AuthorizationBootstrapService';
import { buildRoleIdentityKey } from '../../src/authorization';
import { DEFAULT_ROLE_TEMPLATES } from '../../src/authorization/default-role-templates';
import type { AuthorizationMigrationIssue } from '../../src/services/AuthorizationMigrationService';
import type { RoleTemplateAttributes } from '../../src/waterline-models/RoleTemplate';

const now = new Date('2026-08-31T00:00:00.000Z');

function canonicalTuple(
  overrides: Record<string, unknown> = {}
): Parameters<typeof protectedSystemAssignmentBootstrapIssue>[0] {
  return {
    status: 'active',
    sourcePresent: true,
    expiresAt: null,
    branding: undefined,
    version: 1,
    principalType: 'user',
    principalId: 'user-1',
    role: 'role-sys',
    source: 'recovery',
    sourceKey: 'bootstrap-parent-administrator',
    assignedBy: 'bootstrap:authorization-invariants',
    assignedAt: '2026-08-31T00:00:00.000Z',
    ...overrides,
  } as Parameters<typeof protectedSystemAssignmentBootstrapIssue>[0];
}

describe('AuthorizationBootstrapService protected assignment classification', () => {
  it('accepts only the already-active, present, non-expiring protected tuple', () => {
    assert.equal(
      protectedSystemAssignmentBootstrapIssue(canonicalTuple(), now, { principalId: 'user-1', roleId: 'role-sys' }),
      undefined
    );
  });

  it('fails closed for a revoked protected tuple', () => {
    assert.equal(
      protectedSystemAssignmentBootstrapIssue(canonicalTuple({ status: 'revoked' }), now),
      'bootstrap-system-assignment-revoked'
    );
  });

  it('fails closed for a suppressed protected tuple', () => {
    assert.equal(
      protectedSystemAssignmentBootstrapIssue(canonicalTuple({ status: 'suppressed' }), now),
      'bootstrap-system-assignment-suppressed'
    );
  });

  it('fails closed for an expired protected tuple', () => {
    assert.equal(
      protectedSystemAssignmentBootstrapIssue(canonicalTuple({ expiresAt: '2026-08-30T23:59:59.999Z' }), now),
      'bootstrap-system-assignment-expired'
    );
  });

  it('does not silently clear future expiry or missing source presence', () => {
    assert.equal(
      protectedSystemAssignmentBootstrapIssue(canonicalTuple({ expiresAt: '2026-09-01T00:00:00.000Z' }), now),
      'bootstrap-system-assignment-noncanonical'
    );
    assert.equal(
      protectedSystemAssignmentBootstrapIssue(canonicalTuple({ sourcePresent: false }), now),
      'bootstrap-system-assignment-noncanonical'
    );
  });
});

describe('AuthorizationBootstrapService Guest-role pre-commit lease fence', () => {
  const globalNames = ['Role', 'RoleScopeOverride'] as const;
  let savedGlobals: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;

  beforeEach(() => {
    savedGlobals = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedServices = sails.services;
    __resetMigrationLeaseStateForTests();
  });

  afterEach(async () => {
    for (const name of globalNames) {
      const descriptor = savedGlobals.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    sails.services = savedServices;
    __resetMigrationLeaseStateForTests();
  });

  it('rejects instead of committing when the lease is taken over after a Guest role write but before commit', async () => {
    const brandId = 'brand-takeover';
    const victim = await acquireMigrationLease('guest-takeover-victim');
    const victimLease = { owner: victim.owner, fence: victim.fence };
    const definition = DEFAULT_ROLE_TEMPLATES.find(template => template.key === 'guest');
    assert.ok(definition !== undefined, 'the Guest default role template must be declared');
    const template = { id: 'tmpl-guest' } as RoleTemplateAttributes;
    const expectedIdentity = buildRoleIdentityKey('brand', String(definition.legacyRoleName), brandId);

    let committed = false;
    let roleWrites = 0;
    let audits = 0;
    let createdIdentityKey: unknown;
    const issues: AuthorizationMigrationIssue[] = [];
    const connection = {};
    Reflect.set(globalThis, 'Role', {
      find: () => ({
        sort: () => ({
          usingConnection: () => ({
            limit: async (): Promise<unknown[]> => [],
          }),
        }),
      }),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({
          usingConnection: async (): Promise<unknown> => {
            roleWrites += 1;
            createdIdentityKey = values.identityKey;
            // A successor lift takes over after the Guest role write but
            // before the pre-commit fence below: the victim transaction must
            // reject instead of committing past the lost lease.
            await victim.release();
            await acquireMigrationLease('guest-takeover-successor');
            return { id: 'role-guest-takeover', ...values };
          },
        }),
      }),
      getDatastore: () => ({
        transaction: async (work: (leased: unknown) => Promise<unknown>): Promise<unknown> => {
          try {
            const result = await work(connection);
            committed = true;
            return result;
          } catch (error) {
            committed = false;
            throw error;
          }
        },
      }),
    });
    // No bounded override surface: the Guest override scan records
    // `protected-guest-overrides-scan-incomplete` after the role write above,
    // exercising the post-write early-return commit path.
    Reflect.set(globalThis, 'RoleScopeOverride', {
      find: () => ({
        sort: () => ({
          usingConnection: () => ({}),
        }),
      }),
    });
    sails.services = {
      ...sails.services,
      authorizationauditservice: {
        createSucceededEvent: async (): Promise<unknown> => {
          audits += 1;
          return { id: `audit-${audits}` };
        },
      },
    };

    const service = new BootstrapServices.AuthorizationBootstrapService() as unknown as {
      ensureGuestRoleForBrand: (
        brand: string,
        roleDefinition: typeof definition,
        roleTemplate: RoleTemplateAttributes,
        collected: AuthorizationMigrationIssue[],
        raceAdopted: boolean,
        lease?: { owner: string; fence: number }
      ) => Promise<{ created: number; repaired: number }>;
    };
    await assert.rejects(
      () => service.ensureGuestRoleForBrand(brandId, definition, template, issues, false, victimLease),
      /mismatch|superseded/
    );
    assert.equal(roleWrites, 1, 'the Guest role write must have been attempted before the takeover');
    assert.equal(createdIdentityKey, expectedIdentity, 'the Guest role write must carry the protected identity');
    assert.equal(audits, 1, 'the Guest role-created audit must have been attempted before the pre-commit fence');
    assert.equal(committed, false, 'the taken-over transaction must not commit');
    assert.ok(
      issues.some(
        issue =>
          issue.code === 'protected-guest-overrides-scan-incomplete' &&
          issue.severity === 'blocker' &&
          issue.entityId === 'role-guest-takeover'
      ),
      `expected a scan-incomplete blocker for the created role, saw ${JSON.stringify(issues)}`
    );
  });
});
