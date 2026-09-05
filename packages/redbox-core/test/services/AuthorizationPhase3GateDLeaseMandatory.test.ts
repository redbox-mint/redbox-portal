import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';

import {
  __resetMigrationLeaseStateForTests,
  MIGRATION_LEASE_TTL_MS,
} from '../../src/services/AuthorizationMigrationService';
import { Services as MigrationServices } from '../../src/services/AuthorizationMigrationService';
import { Services as ScopeServices } from '../../src/services/AuthorizationScopeService';

/**
 * Gate D remediation: every exported mutating surface must fail closed when
 * invoked without a lease on a durable topology, before any role/assignment/
 * catalog/orphan write can commit. Pure memory doubles (no durable lease
 * collection, non-production) keep the historical leaseless path so the
 * bounded Phase 3 unit suite stays green; these tests prove the durable
 * fail-closed contract plus a takeover-after-write for the orphan-apply
 * pre-commit branch.
 */

function durableLeaseDouble() {
  return {
    findOne: async (): Promise<unknown> => null,
    insertOne: async (): Promise<unknown> => ({ acknowledged: true }),
    updateOne: async (): Promise<unknown> => ({ matchedCount: 1, modifiedCount: 1 }),
    deleteOne: async (): Promise<unknown> => ({ deletedCount: 0 }),
  };
}

describe('Phase 3 Gate D: mandatory lease for durable mutating surfaces', () => {
  const savedGlobals = new Map<string, PropertyDescriptor | undefined>();
  const globalNames = [
    'sails',
    'Role',
    'User',
    'RoleAssignment',
    'RoleTemplate',
    'RoleTemplateRevision',
    'AuthorizationScope',
    'RoleScopeOverride',
  ];
  let savedServices: typeof sails.services;

  beforeEach(() => {
    __resetMigrationLeaseStateForTests();
    savedGlobals.clear();
    for (const name of globalNames) savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    savedServices = sails.services;
  });

  afterEach(() => {
    __resetMigrationLeaseStateForTests();
    for (const [name, descriptor] of savedGlobals) {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    sails.services = savedServices;
  });

  function installDurableRoleDatastore() {
    const leaseDouble = durableLeaseDouble();
    Reflect.set(globalThis, 'Role', {
      getDatastore: () => ({
        manager: {
          collection: (name: string): unknown => (name === 'authorizationmigrationlease' ? leaseDouble : undefined),
        },
      }),
    });
    return leaseDouble;
  }

  it('reconcileBrandRoles without a lease fails closed on durable and writes nothing', async () => {
    installDurableRoleDatastore();
    let updates = 0;
    const roleGlobal = Reflect.get(globalThis, 'Role') as Record<string, unknown>;
    Reflect.set(globalThis, 'Role', {
      ...roleGlobal,
      find: () => ({ sort: () => ({ limit: async (): Promise<unknown[]> => [] }) }),
      updateOne: () => {
        updates += 1;
        throw new Error('must not reach role writes without a lease');
      },
    });
    Reflect.set(globalThis, 'RoleTemplate', {
      find: () => ({ sort: () => ({ limit: async (): Promise<unknown[]> => [] }) }),
    });
    await assert.rejects(
      () => new MigrationServices.AuthorizationMigrationService().reconcileBrandRoles(10),
      /no lease held/i
    );
    assert.equal(updates, 0, 'no role write may run before the lease gate');
  });

  it('migrateUserAssignments without a lease fails closed on durable and creates nothing', async () => {
    installDurableRoleDatastore();
    let creations = 0;
    Reflect.set(globalThis, 'User', {
      find: () => ({
        populate: () => ({ sort: () => ({ limit: async (): Promise<unknown[]> => [] }) }),
      }),
      getDatastore: () => ({
        transaction: async (): Promise<unknown> => {
          throw new Error('must not enter assignment transactions without a lease');
        },
      }),
    });
    const services = sails.services as Record<string, unknown>;
    Reflect.set(globalThis, 'sails', {
      ...(Reflect.get(globalThis, 'sails') as Record<string, unknown>),
      services: {
        ...services,
        authorizationauditservice: { createSucceededEvent: async () => ({ id: 'audit-1' }) },
        authorizationpersistenceservice: {
          createRoleAssignment: async () => {
            creations += 1;
            return { id: 'assignment-1' };
          },
        },
      },
    });
    await assert.rejects(
      () => new MigrationServices.AuthorizationMigrationService().migrateUserAssignments(10),
      /no lease held/i
    );
    assert.equal(creations, 0, 'no assignment may be created past a missing lease');
  });

  it('catalog reconcile without a lease fails closed on durable and writes no scopes', async () => {
    installDurableRoleDatastore();
    let creates = 0;
    Reflect.set(globalThis, 'AuthorizationScope', {
      findOne: async (): Promise<unknown> => null,
      create: () => {
        creates += 1;
        throw new Error('must not create scopes without a lease');
      },
      getDatastore: () => ({
        transaction: async (): Promise<unknown> => {
          throw new Error('must not enter catalog transactions without a lease');
        },
      }),
    });
    const service = new ScopeServices.AuthorizationScopeService();
    await assert.rejects(() => service.reconcileDeclaredCatalog([]), /no lease held/i);
    assert.equal(creates, 0, 'no scope write may run before the lease gate');
  });

  it('orphan apply without a lease fails closed on durable; preview stays read-only', async () => {
    installDurableRoleDatastore();
    let orphanUpdates = 0;
    Reflect.set(globalThis, 'AuthorizationScope', {
      find: () => ({ sort: () => ({ limit: async (): Promise<unknown[]> => [] }) }),
      findOne: () => ({ usingConnection: async (): Promise<unknown> => null }),
      updateOne: () => {
        orphanUpdates += 1;
        throw new Error('must not mark orphans without a lease');
      },
      getDatastore: () => ({
        transaction: async (): Promise<unknown> => {
          throw new Error('must not enter orphan transactions without a lease');
        },
      }),
    });
    Reflect.set(globalThis, 'RoleScopeOverride', { count: async () => 0 });
    Reflect.set(globalThis, 'RoleTemplateRevision', { count: async () => 0 });
    const service = new ScopeServices.AuthorizationScopeService();
    // Read-only preview must remain valid without a lease.
    const preview = await service.reconcileOrphans({}, []);
    assert.equal(preview.applied, false);
    // Mutating apply must fail closed before any orphan write.
    const generation = service.buildRegistry([]).generation;
    await assert.rejects(
      () => service.reconcileOrphans({ apply: true, expectedGeneration: generation }, []),
      /no lease held/i
    );
    assert.equal(orphanUpdates, 0, 'no orphan-marking write may run before the lease gate');
  });

  it('orphan apply takeover after the marking write fails closed at pre-commit', async () => {
    installDurableRoleDatastore();
    const leaseOwner = 'gate-d-orphan-takeover-owner';
    // Session lease double: entry fence passes (matched), pre-commit fence
    // reports a TTL takeover (matched 0) after the orphan-marking write.
    let fenceCalls = 0;
    const sessionLeaseDouble = {
      findOne: async (): Promise<unknown> => ({
        migrationName: '20260828T120000-authorization-model-v1',
        owner: leaseOwner,
        fence: 41,
        expiresAt: new Date(Date.now() + MIGRATION_LEASE_TTL_MS),
      }),
      updateOne: async (): Promise<unknown> => {
        fenceCalls += 1;
        return fenceCalls === 1 ? { matchedCount: 1, modifiedCount: 1 } : { matchedCount: 0, modifiedCount: 0 };
      },
    };
    const sessionConnection = {
      collection: (name: string): unknown => {
        if (name === 'authorizationmigrationlease') return sessionLeaseDouble;
        throw new Error(`unexpected session collection '${name}'`);
      },
    };
    let orphanWrites = 0;
    const staleScope = {
      id: 'scope-stale-1',
      key: 'retired.feature',
      status: 'active',
      metadataVersion: 3,
    };
    Reflect.set(globalThis, 'AuthorizationScope', {
      find: () => ({ sort: () => ({ limit: async (): Promise<unknown[]> => [{ ...staleScope }] }) }),
      findOne: () => ({
        usingConnection: async (): Promise<unknown> => ({ ...staleScope }),
      }),
      updateOne: () => ({
        set: () => ({
          usingConnection: async (): Promise<unknown> => {
            orphanWrites += 1;
            return { ...staleScope, status: 'orphaned' };
          },
        }),
      }),
      getDatastore: () => ({
        transaction: async (work: (connection: unknown) => Promise<unknown>): Promise<unknown> =>
          work(sessionConnection),
        manager: { collection: (): unknown => undefined },
      }),
    });
    Reflect.set(globalThis, 'RoleScopeOverride', { count: async () => 0 });
    Reflect.set(globalThis, 'RoleTemplateRevision', { count: async () => 0 });
    const services = sails.services as Record<string, unknown>;
    Reflect.set(globalThis, 'sails', {
      ...(Reflect.get(globalThis, 'sails') as Record<string, unknown>),
      services: {
        ...services,
        authorizationauditservice: { createSucceededEvent: async () => ({ id: 'audit-1' }) },
      },
    });
    const service = new ScopeServices.AuthorizationScopeService();
    const generation = service.buildRegistry([]).generation;
    let caught: unknown;
    try {
      await service.reconcileOrphans(
        { apply: true, expectedGeneration: generation, lease: { owner: leaseOwner, fence: 41 } },
        []
      );
    } catch (error) {
      caught = error;
    }
    assert.ok(caught !== undefined, 'a takeover after the orphan write must reject at pre-commit');
    assert.match(String(caught), /matched 0 rows|mismatch|superseded|fence/i);
    assert.equal(orphanWrites, 1, 'the write ran before the takeover was detected at pre-commit');
    assert.ok(fenceCalls >= 2, 'both entry and pre-commit fences must run');
  });
});
