import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';

import {
  __resetMigrationLeaseStateForTests,
  acquireMigrationLease,
  MIGRATION_LEASE_TTL_MS,
  writeMigrationCheckpoint,
} from '../../src/services/AuthorizationMigrationService';
import { Services as MigrationServices } from '../../src/services/AuthorizationMigrationService';
import { runPendingMigrations } from '../../src/loader/MigrationRunner';

function staleSessionLeaseDouble() {
  return {
    findOne: async (): Promise<unknown> => ({
      migrationName: '20260828T120000-authorization-model-v1',
      owner: 'successor-takeover',
      fence: 999_999,
      expiresAt: new Date(Date.now() + MIGRATION_LEASE_TTL_MS),
    }),
    updateOne: async (): Promise<unknown> => ({ matchedCount: 0, modifiedCount: 0 }),
  };
}

function sessionConnectionFor(leaseDouble: unknown) {
  return {
    collection: (name: string): unknown => {
      if (name === 'authorizationmigrationlease') return leaseDouble;
      if (name === 'authorizationmigrationcheckpoint') {
        return {
          find: () => ({ limit: () => ({ toArray: async (): Promise<unknown[]> => [] }) }),
          updateOne: async (): Promise<unknown> => ({ matchedCount: 1, modifiedCount: 1 }),
        };
      }
      throw new Error(`unexpected session collection '${name}'`);
    },
  };
}

describe('Phase 3 Gate D: lease fencing remediation', () => {
  const savedSailsDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sails');
  const savedSails: unknown = Reflect.get(globalThis, 'sails');
  const savedRoleDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Role');
  const savedUserDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'User');
  const savedRoleAssignmentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'RoleAssignment');
  const savedRoleTemplateDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'RoleTemplate');

  beforeEach(() => {
    __resetMigrationLeaseStateForTests();
  });

  afterEach(() => {
    __resetMigrationLeaseStateForTests();
    if (savedSailsDescriptor === undefined) Reflect.deleteProperty(globalThis, 'sails');
    else Object.defineProperty(globalThis, 'sails', savedSailsDescriptor);
    if (savedRoleDescriptor === undefined) Reflect.deleteProperty(globalThis, 'Role');
    else Object.defineProperty(globalThis, 'Role', savedRoleDescriptor);
    if (savedUserDescriptor === undefined) Reflect.deleteProperty(globalThis, 'User');
    else Object.defineProperty(globalThis, 'User', savedUserDescriptor);
    if (savedRoleAssignmentDescriptor === undefined) Reflect.deleteProperty(globalThis, 'RoleAssignment');
    else Object.defineProperty(globalThis, 'RoleAssignment', savedRoleAssignmentDescriptor);
    if (savedRoleTemplateDescriptor === undefined) Reflect.deleteProperty(globalThis, 'RoleTemplate');
    else Object.defineProperty(globalThis, 'RoleTemplate', savedRoleTemplateDescriptor);
  });

  it('marker writes use the same-session lease fence, not the canonical read', async () => {
    const leaseDouble = staleSessionLeaseDouble();
    const sessionConnection = sessionConnectionFor(leaseDouble);
    const created: Array<Record<string, unknown>> = [];
    const destroyed: Array<unknown> = [];
    Reflect.set(globalThis, 'sails', {
      models: {
        migration: {
          find: () => ({ sort: async (): Promise<unknown[]> => [] }),
          create: async (values: unknown): Promise<unknown> => {
            const row = { id: 'marker-1', ...(values as Record<string, unknown>) };
            created.push(row);
            return row;
          },
          destroy: async (criteria: unknown): Promise<unknown> => {
            destroyed.push(criteria);
            return [];
          },
          getDatastore: () => ({
            transaction: async (work: (connection: unknown) => Promise<unknown>): Promise<unknown> =>
              work(sessionConnection),
          }),
        },
      },
      log: { verbose: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    });
    let caught: unknown;
    try {
      await runPendingMigrations([{ name: '2026.09.01T00.00.00-gate-d', up: async () => undefined }]);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught !== undefined, 'a same-session takeover must reject the marker write');
    assert.match(String(caught), /mismatch|superseded|matched 0 rows|fence/i);
  });

  it('production fails closed for non-transactional markers even with the test memory opt-in', async () => {
    const savedNodeEnv = process.env.NODE_ENV;
    const savedMemory = process.env.AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY;
    process.env.NODE_ENV = 'production';
    process.env.AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY = 'test-allowed';
    // Durable lease collection so acquisition succeeds in production; the
    // marker datastore itself offers no transactions, isolating the marker
    // fallback under test.
    const leaseStore: { row: Record<string, unknown> | null } = { row: null };
    const durableLeaseDouble = {
      findOne: async (): Promise<unknown> => (leaseStore.row === null ? null : { ...leaseStore.row }),
      insertOne: async (doc: unknown): Promise<unknown> => {
        if (leaseStore.row !== null) {
          const error = new Error('duplicate key') as Error & { code?: string };
          error.code = 'E_UNIQUE';
          throw error;
        }
        leaseStore.row = { ...(doc as Record<string, unknown>) };
        return { acknowledged: true };
      },
      updateOne: async (filter: unknown, update: unknown): Promise<unknown> => {
        const criteria = filter as Record<string, unknown>;
        const row = leaseStore.row;
        if (row === null) return { matchedCount: 0, modifiedCount: 0 };
        if (criteria.owner !== undefined) {
          if (row.owner !== criteria.owner || row.fence !== criteria.fence)
            return { matchedCount: 0, modifiedCount: 0 };
          Object.assign(row, (update as Record<string, unknown>).$set as Record<string, unknown>);
          return { matchedCount: 1, modifiedCount: 1 };
        }
        return { matchedCount: 1, modifiedCount: 1 };
      },
      deleteOne: async (): Promise<unknown> => ({ deletedCount: 0 }),
    };
    Reflect.set(globalThis, 'Role', {
      getDatastore: () => ({ manager: { collection: () => durableLeaseDouble } }),
    });
    Reflect.set(globalThis, 'sails', {
      models: {
        migration: {
          find: () => ({ sort: async (): Promise<unknown[]> => [] }),
          create: async (): Promise<unknown> => ({ id: 'marker-1' }),
          destroy: async (): Promise<unknown> => [],
        },
      },
      log: { verbose: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    });
    let caught: unknown;
    try {
      await runPendingMigrations([{ name: '2026.09.01T00.00.00-gate-d-prod', up: async () => undefined }]);
    } catch (error) {
      caught = error;
    } finally {
      if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedNodeEnv;
      if (savedMemory === undefined) delete process.env.AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY;
      else process.env.AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY = savedMemory;
      __resetMigrationLeaseStateForTests();
    }
    assert.ok(caught !== undefined, 'production without marker transactions must fail closed');
    assert.match(String(caught), /transaction support/i);
  });

  it('stale role batch transactions are fenced at entry and before commit', async () => {
    const holder = await acquireMigrationLease('gate-d-roles-owner');
    const lease = { owner: holder.owner, fence: holder.fence };
    const leaseDouble = staleSessionLeaseDouble();
    const sessionConnection = sessionConnectionFor(leaseDouble);
    let updates = 0;
    let findCalls = 0;
    const roleRow = {
      id: 'role-1',
      name: 'CustomRole',
      branding: 'brand-1',
      displayName: '',
      status: 'active',
      version: 0,
    };
    Reflect.set(globalThis, 'Role', {
      find: () => ({
        sort: () => ({
          limit: async (): Promise<unknown[]> => {
            findCalls += 1;
            return findCalls === 1 ? [{ ...roleRow }] : [];
          },
        }),
      }),
      findOne: () => ({
        usingConnection: async (): Promise<unknown> => ({ ...roleRow }),
      }),
      count: () => ({
        usingConnection: async (): Promise<unknown> => 1,
      }),
      updateOne: () => ({
        set: () => ({
          meta: () => ({
            usingConnection: async (): Promise<unknown> => {
              updates += 1;
              return { ...roleRow };
            },
          }),
        }),
      }),
      getDatastore: () => ({
        transaction: async (work: (connection: unknown) => Promise<unknown>): Promise<unknown> =>
          work(sessionConnection),
        manager: { collection: (): unknown => undefined },
      }),
    });
    Reflect.set(globalThis, 'RoleTemplate', {
      find: () => ({ sort: () => ({ limit: async (): Promise<unknown[]> => [] }) }),
    });
    const services = (Reflect.get(globalThis, 'sails') as { services: Record<string, unknown> }).services;
    Reflect.set(globalThis, 'sails', {
      ...(savedSails as Record<string, unknown>),
      services: {
        ...(services as Record<string, unknown>),
        authorizationauditservice: { createSucceededEvent: async (): Promise<unknown> => ({ id: 'audit-1' }) },
      },
    });
    let caught: unknown;
    try {
      await new MigrationServices.AuthorizationMigrationService().reconcileBrandRoles(10, lease);
    } catch (error) {
      caught = error;
    } finally {
      await holder.release();
    }
    assert.ok(caught !== undefined, 'a stale role batch must fail closed');
    assert.match(String(caught), /mismatch|superseded|matched 0 rows|fence/i);
    assert.equal(updates, 0, 'no role write may commit past a stale lease');
  });

  it('stale scoped assignment transactions are fenced (bootstrap parent-admin path)', async () => {
    const holder = await acquireMigrationLease('gate-d-assignments-owner');
    const lease = { owner: holder.owner, fence: holder.fence };
    const leaseDouble = staleSessionLeaseDouble();
    const sessionConnection = sessionConnectionFor(leaseDouble);
    let creations = 0;
    const userRow = {
      id: 'user-1',
      linkedPrimaryUserId: undefined,
      accountLinkState: undefined,
      loginDisabled: false,
      roles: [{ id: 'role-1', name: 'Admin', protectedKind: 'brand-admin', contextType: 'brand', branding: 'brand-1' }],
    };
    Reflect.set(globalThis, 'User', {
      find: () => ({
        populate: () => ({
          sort: () => ({
            limit: async (): Promise<unknown[]> => [{ ...userRow }],
          }),
        }),
      }),
      getDatastore: () => ({
        transaction: async (work: (connection: unknown) => Promise<unknown>): Promise<unknown> =>
          work(sessionConnection),
        manager: { collection: (): unknown => undefined },
      }),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      findOne: () => ({ usingConnection: async (): Promise<unknown> => null }),
    });
    const services = (Reflect.get(globalThis, 'sails') as { services: Record<string, unknown> }).services;
    Reflect.set(globalThis, 'sails', {
      ...(savedSails as Record<string, unknown>),
      services: {
        ...(services as Record<string, unknown>),
        authorizationauditservice: { createSucceededEvent: async (): Promise<unknown> => ({ id: 'audit-1' }) },
        authorizationpersistenceservice: {
          createRoleAssignment: async (): Promise<unknown> => {
            creations += 1;
            return { id: 'assignment-1' };
          },
        },
      },
    });
    let caught: unknown;
    try {
      await new MigrationServices.AuthorizationMigrationService().migrateUserAssignments(10, ['user-1'], lease);
    } catch (error) {
      caught = error;
    } finally {
      await holder.release();
    }
    assert.ok(caught !== undefined, 'a stale scoped assignment batch must fail closed');
    assert.match(String(caught), /mismatch|superseded|matched 0 rows|fence/i);
    assert.equal(creations, 0, 'no assignment may be created past a stale lease');
  });

  it('run() fails closed without a lease and threads the effective lease into bootstrap', async () => {
    await assert.rejects(() => new MigrationServices.AuthorizationMigrationService().run(), /no migration lease/i);
    const holder = await acquireMigrationLease('gate-d-run-owner');
    const lease = { owner: holder.owner, fence: holder.fence };
    const seen: Array<unknown> = [];
    const services = (Reflect.get(globalThis, 'sails') as { services: Record<string, unknown> }).services;
    Reflect.set(globalThis, 'sails', {
      ...(savedSails as Record<string, unknown>),
      log: { verbose: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      services: {
        ...(services as Record<string, unknown>),
        authorizationscopeservice: {
          bootstrap: async (_sources?: unknown, captured?: unknown): Promise<unknown> => {
            seen.push(captured);
            return { generation: 'test' };
          },
        },
      },
    });
    Reflect.set(globalThis, 'Role', {
      find: () => ({ sort: () => ({ limit: async (): Promise<unknown[]> => [] }) }),
      getDatastore: () => ({ manager: { collection: (): unknown => undefined } }),
    });
    Reflect.set(globalThis, 'User', {
      find: () => ({
        populate: () => ({ sort: () => ({ limit: async (): Promise<unknown[]> => [] }) }),
      }),
      getDatastore: () => ({ manager: { collection: (): unknown => undefined } }),
    });
    Reflect.set(globalThis, 'RoleTemplate', {
      find: () => ({ sort: () => ({ limit: async (): Promise<unknown[]> => [] }) }),
    });
    try {
      await new MigrationServices.AuthorizationMigrationService().run(10, lease);
    } finally {
      await holder.release();
    }
    assert.equal(seen.length, 1, 'bootstrap must be invoked once');
    assert.deepEqual(seen[0], lease, 'run() must pass the effective lease to catalog bootstrap');
  });

  it('production fails closed for durable-but-nontransactional checkpoints even with the test memory opt-in', async () => {
    const savedNodeEnv = process.env.NODE_ENV;
    const savedMemory = process.env.AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY;
    process.env.NODE_ENV = 'production';
    process.env.AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY = 'test-allowed';
    // Durable lease + checkpoint collections exist, but the checkpoint
    // datastore offers no transaction/session capability. A leaked test
    // opt-in must not permit a non-transactional durable checkpoint mutation
    // in production: the write must fail closed with transaction-support
    // rejection and leave no durable row behind.
    const leaseStore: { row: Record<string, unknown> | null } = { row: null };
    const checkpointRows: Array<Record<string, unknown>> = [];
    const durableLeaseDouble = {
      findOne: async (): Promise<unknown> => (leaseStore.row === null ? null : { ...leaseStore.row }),
      insertOne: async (doc: unknown): Promise<unknown> => {
        if (leaseStore.row !== null) {
          const error = new Error('duplicate key') as Error & { code?: string };
          error.code = 'E_UNIQUE';
          throw error;
        }
        leaseStore.row = { ...(doc as Record<string, unknown>) };
        return { acknowledged: true };
      },
      updateOne: async (filter: unknown, update: unknown): Promise<unknown> => {
        const criteria = filter as Record<string, unknown>;
        const row = leaseStore.row;
        if (row === null) return { matchedCount: 0, modifiedCount: 0 };
        if (criteria.owner !== undefined) {
          if (row.owner !== criteria.owner || row.fence !== criteria.fence)
            return { matchedCount: 0, modifiedCount: 0 };
          Object.assign(row, (update as Record<string, unknown>).$set as Record<string, unknown>);
          return { matchedCount: 1, modifiedCount: 1 };
        }
        return { matchedCount: 1, modifiedCount: 1 };
      },
      deleteOne: async (): Promise<unknown> => ({ deletedCount: 0 }),
    };
    const durableCheckpointDouble = {
      find: () => ({
        limit: () => ({ toArray: async (): Promise<unknown[]> => [...checkpointRows] }),
      }),
      insertOne: async (doc: unknown): Promise<unknown> => {
        checkpointRows.push({ ...(doc as Record<string, unknown>) });
        return { acknowledged: true };
      },
      updateOne: async (): Promise<unknown> => ({ matchedCount: 0, modifiedCount: 0 }),
      deleteOne: async (): Promise<unknown> => ({ deletedCount: 0 }),
    };
    Reflect.set(globalThis, 'Role', {
      getDatastore: () => ({
        manager: {
          collection: (name: string): unknown => {
            if (name === 'authorizationmigrationlease') return durableLeaseDouble;
            if (name === 'authorizationmigrationcheckpoint') return durableCheckpointDouble;
            return undefined;
          },
        },
      }),
    });
    let holder: Awaited<ReturnType<typeof acquireMigrationLease>> | undefined;
    try {
      holder = await acquireMigrationLease('gate-d-checkpoint-prod-leak');
      const lease = { owner: holder.owner, fence: holder.fence };
      await assert.rejects(
        () => writeMigrationCheckpoint('roles', 'cursor-prod-leak', undefined, { lease }),
        /transaction support/i
      );
      assert.equal(checkpointRows.length, 0, 'no durable checkpoint row may be written past the lease');
    } finally {
      await holder?.release().catch(() => undefined);
      if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = savedNodeEnv;
      if (savedMemory === undefined) delete process.env.AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY;
      else process.env.AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY = savedMemory;
      __resetMigrationLeaseStateForTests();
    }
  });
});
