import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';
import { afterEach, beforeEach, describe, it } from 'mocha';

import { Services as AuthorizationBootstrapServices } from '../../src/services/AuthorizationBootstrapService';
import { runWithRequiredTransaction } from '../../src/utilities/RequiredTransactionUtils';

const USER = {
  id: 'user-1',
  username: 'recoverable-admin',
  accountLinkState: 'active',
  loginDisabled: false,
};

function queryResult<T>(value: T) {
  const query: Record<string, unknown> = {
    limit() {
      return query;
    },
    then(onfulfilled?: (result: T) => unknown) {
      return Promise.resolve(value).then(onfulfilled);
    },
  };
  return query;
}

function transactionDatastore(): Sails.Datastore {
  return {
    transaction: async (work: (connection: unknown) => Promise<unknown>) => work({ lease: 'recovery-1' }),
  } as unknown as Sails.Datastore;
}

describe('AuthorizationSystemAdminRecovery (operator, non-HTTP)', () => {
  let originalUsers: Map<string, PropertyDescriptor | undefined>;
  let ensureSystemRoleStub: sinon.SinonStub;
  let service: InstanceType<typeof AuthorizationBootstrapServices.AuthorizationBootstrapService>;
  let existingRow: Record<string, unknown> | undefined;
  let updateCalls: Array<{ criteria: unknown; values: unknown }>;
  let succeededEvents: Array<Record<string, unknown>>;
  let attemptEvents: Array<{ input: Record<string, unknown>; outcome: string }>;
  let currentUser: Record<string, unknown>;

  const globalNames = ['User', 'Role', 'RoleAssignment', 'AuthorizationAudit'] as const;

  beforeEach(() => {
    service = new AuthorizationBootstrapServices.AuthorizationBootstrapService();
    originalUsers = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    existingRow = undefined;
    updateCalls = [];
    succeededEvents = [];
    attemptEvents = [];
    currentUser = { ...USER };
    Reflect.set(globalThis, 'User', {
      find: () => queryResult([{ ...USER }]),
      findOne: () => ({ usingConnection: async () => ({ ...currentUser }) }),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      getDatastore: () => transactionDatastore(),
      findOne: () => ({ usingConnection: async () => (existingRow === undefined ? undefined : { ...existingRow }) }),
      updateOne: (criteria: Record<string, unknown>) => ({
        set: (values: Record<string, unknown>) => ({
          usingConnection: async () => {
            updateCalls.push({ criteria, values });
            if (existingRow === undefined) return undefined;
            // Mirror the CAS predicate: a versioned row matches only on the
            // read version; a versionless row matches on identity alone.
            const expectedVersion = (existingRow as { version?: unknown }).version;
            if (
              typeof expectedVersion === 'number' &&
              (criteria as { version?: unknown }).version !== expectedVersion
            ) {
              return undefined;
            }
            if ((criteria as { id?: unknown }).id !== (existingRow as { id?: unknown }).id) return undefined;
            return { ...existingRow, ...values };
          },
        }),
      }),
    });
    Reflect.set(globalThis, 'sails', {
      ...sails,
      services: {
        ...sails.services,
        authorizationpersistenceservice: { createRoleAssignment: async () => ({ id: 'assignment-1', version: 1 }) },
        authorizationauditservice: {
          createSucceededEvent: async (input: Record<string, unknown>) => {
            succeededEvents.push(input);
            return { eventId: 'audit-1' };
          },
          recordAttempt: async (input: Record<string, unknown>, outcome: string) => {
            attemptEvents.push({ input, outcome });
            return { persisted: true };
          },
        },
      },
      log: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
    });
    ensureSystemRoleStub = sinon
      .stub(
        AuthorizationBootstrapServices.AuthorizationBootstrapService.prototype as unknown as {
          ensureSystemRole: (issues: unknown[]) => Promise<{ role?: unknown; created: boolean }>;
        },
        'ensureSystemRole'
      )
      .resolves({ role: { id: 'role-system-1', key: 'system-admin', protectedKind: 'system-admin' }, created: false });
  });

  afterEach(() => {
    ensureSystemRoleStub.restore();
    for (const [name, descriptor] of originalUsers) {
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    sinon.restore();
  });

  const baseInput = { target: 'recoverable-admin', reason: 'lockout during migration rehearsal' };

  it('requires the exact typed confirmation phrase and audits the denial with the reason', async () => {
    await assert.rejects(
      service.recoverSystemAdministrator({ ...baseInput, confirmation: 'recover-system-admin' }),
      /exact typed confirmation phrase/
    );
    assert.equal(attemptEvents.length, 1);
    assert.equal(attemptEvents[0].outcome, 'denied');
    assert.equal(attemptEvents[0].input.eventType, 'assignment.reactivated');
    assert.equal(attemptEvents[0].input.actorType, 'operator');
    assert.equal(attemptEvents[0].input.reason, baseInput.reason);
  });

  it('requires a non-empty bounded operator reason and audits the denial', async () => {
    await assert.rejects(
      service.recoverSystemAdministrator({ ...baseInput, confirmation: 'RECOVER-SYSTEM-ADMIN', reason: '   ' }),
      /operator reason/
    );
    assert.equal(attemptEvents.length, 1);
    assert.equal(attemptEvents[0].outcome, 'denied');
    assert.equal(attemptEvents[0].input.reasonCode, 'recovery.reason-invalid');
  });

  it('rejects an ambiguous target instead of guessing', async () => {
    Reflect.set(globalThis, 'User', { find: () => queryResult([USER, { ...USER, id: 'user-2' }]) });
    await assert.rejects(
      service.recoverSystemAdministrator({ ...baseInput, confirmation: 'RECOVER-SYSTEM-ADMIN' }),
      /ambiguous/
    );
  });

  it('rejects disabled and alias targets', async () => {
    Reflect.set(globalThis, 'User', {
      find: () => queryResult([{ ...USER, loginDisabled: true }]),
    });
    await assert.rejects(
      service.recoverSystemAdministrator({ ...baseInput, confirmation: 'RECOVER-SYSTEM-ADMIN' }),
      /disabled/
    );

    Reflect.set(globalThis, 'User', {
      find: () => queryResult([{ ...USER, accountLinkState: 'linked-alias' }]),
    });
    await assert.rejects(
      service.recoverSystemAdministrator({ ...baseInput, confirmation: 'RECOVER-SYSTEM-ADMIN' }),
      /linked alias/
    );
  });

  it('creates the protected recovery assignment transactionally and audits it', async () => {
    let audited = false;
    Reflect.set(globalThis, 'sails', {
      ...sails,
      services: {
        ...sails.services,
        authorizationpersistenceservice: {
          createRoleAssignment: async (assignment: Record<string, unknown>) => {
            assert.equal(assignment.source, 'recovery');
            assert.equal(assignment.principalId, 'user-1');
            assert.equal(assignment.status, 'active');
            return { id: 'assignment-1', version: 1 };
          },
        },
        authorizationauditservice: {
          createSucceededEvent: async () => {
            audited = true;
            return { eventId: 'audit-1' };
          },
        },
      },
      log: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
    });

    const result = await service.recoverSystemAdministrator({ ...baseInput, confirmation: 'RECOVER-SYSTEM-ADMIN' });

    assert.equal(result.assignmentCreated, true);
    assert.equal(result.assignmentState, 'created');
    assert.equal(result.principalId, 'user-1');
    assert.equal(audited, true);
  });

  it('is idempotent when an active protected recovery assignment already exists and audits the noop', async () => {
    existingRow = {
      id: 'assignment-1',
      principalType: 'user',
      principalId: 'user-1',
      role: 'role-system-1',
      branding: null,
      source: 'recovery',
      sourceKey: 'bootstrap-parent-administrator',
      status: 'active',
      sourcePresent: true,
      expiresAt: null,
      version: 4,
      assignedBy: 'operator:seed',
      assignedAt: '2026-08-01T00:00:00.000Z',
    };

    const result = await service.recoverSystemAdministrator({ ...baseInput, confirmation: 'RECOVER-SYSTEM-ADMIN' });

    assert.equal(result.assignmentCreated, false);
    assert.equal(result.assignmentState, 'active');
    assert.equal(updateCalls.length, 0);
    const noop = succeededEvents.find(event => event.eventType === 'assignment.noop');
    assert.ok(noop !== undefined, 'idempotent recovery must audit the outcome');
    assert.equal(noop.reason, baseInput.reason);
    assert.equal(noop.targetId, 'assignment-1');
  });

  it('reactivates a revoked recovery row with CAS, reason, and audit', async () => {
    existingRow = {
      id: 'assignment-1',
      status: 'revoked',
      sourcePresent: true,
      version: 2,
      revokedBy: 'previous-operator',
      revokedAt: new Date(Date.now() - 3_600_000).toISOString(),
    };

    const result = await service.recoverSystemAdministrator({ ...baseInput, confirmation: 'RECOVER-SYSTEM-ADMIN' });

    assert.equal(result.assignmentCreated, false);
    assert.equal(result.assignmentReactivated, true);
    assert.equal(result.assignmentState, 'reactivated');
    assert.deepEqual(
      updateCalls.map(call => call.criteria),
      [{ id: 'assignment-1', version: 2 }]
    );
    const values = updateCalls[0].values as Record<string, unknown>;
    assert.equal(values.status, 'active');
    assert.equal(values.sourcePresent, true);
    assert.equal(values.expiresAt, null);
    assert.equal(values.revokedBy, null);
    assert.equal(values.version, 3);
    assert.equal(values.reason, baseInput.reason);
    const reactivated = succeededEvents.find(event => event.eventType === 'assignment.reactivated');
    assert.ok(reactivated !== undefined, 'repair must audit the reactivation');
    assert.equal(reactivated.reason, baseInput.reason);
    assert.equal(reactivated.targetId, 'assignment-1');
  });

  it('reactivates a suppressed recovery row', async () => {
    existingRow = {
      id: 'assignment-1',
      status: 'suppressed',
      sourcePresent: true,
      version: 1,
      suppressedBy: 'previous-operator',
      suppressedAt: new Date(Date.now() - 3_600_000).toISOString(),
    };

    const result = await service.recoverSystemAdministrator({ ...baseInput, confirmation: 'RECOVER-SYSTEM-ADMIN' });

    assert.equal(result.assignmentState, 'reactivated');
    const values = updateCalls[0].values as Record<string, unknown>;
    assert.equal(values.status, 'active');
    assert.equal(values.suppressedBy, null);
    assert.equal(values.version, 2);
  });

  it('reactivates an expired active-status row and clears the expiry', async () => {
    existingRow = {
      id: 'assignment-1',
      status: 'active',
      sourcePresent: true,
      version: 1,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    };

    const result = await service.recoverSystemAdministrator({ ...baseInput, confirmation: 'RECOVER-SYSTEM-ADMIN' });

    assert.equal(result.assignmentState, 'reactivated');
    assert.equal((updateCalls[0].values as Record<string, unknown>).expiresAt, null);
  });

  it('reactivates a source-absent active-status row', async () => {
    existingRow = { id: 'assignment-1', status: 'active', sourcePresent: false, version: 1 };

    const result = await service.recoverSystemAdministrator({ ...baseInput, confirmation: 'RECOVER-SYSTEM-ADMIN' });

    assert.equal(result.assignmentState, 'reactivated');
    assert.equal((updateCalls[0].values as Record<string, unknown>).sourcePresent, true);
  });

  it('revalidates the target inside the transaction and fails closed on drift', async () => {
    existingRow = { id: 'assignment-1', status: 'revoked', sourcePresent: true, version: 1 };
    currentUser = { ...USER, loginDisabled: true };

    await assert.rejects(
      service.recoverSystemAdministrator({ ...baseInput, confirmation: 'RECOVER-SYSTEM-ADMIN' }),
      /disabled/
    );
    assert.equal(updateCalls.length, 0);
    assert.ok(
      attemptEvents.some(event => event.outcome === 'failed'),
      'transactional recovery failure must be audited'
    );
  });

  it('fails closed when the repair row changes concurrently', async () => {
    existingRow = { id: 'assignment-1', status: 'revoked', sourcePresent: true, version: 1 };
    Reflect.set(globalThis, 'RoleAssignment', {
      getDatastore: () => transactionDatastore(),
      findOne: () => ({ usingConnection: async () => ({ ...existingRow }) }),
      // Concurrent administrator advanced the version: the pinned CAS misses.
      updateOne: () => ({ set: () => ({ usingConnection: async () => undefined }) }),
    });

    await assert.rejects(
      service.recoverSystemAdministrator({ ...baseInput, confirmation: 'RECOVER-SYSTEM-ADMIN' }),
      /changed concurrently/
    );
    assert.ok(
      attemptEvents.some(event => event.outcome === 'failed'),
      'concurrent repair conflict must be audited as failed'
    );
  });

  it('uses a required transaction so unsupported datastores fail closed', async () => {
    Reflect.set(globalThis, 'RoleAssignment', { getDatastore: () => ({}) });
    await assert.rejects(
      service.recoverSystemAdministrator({ ...baseInput, confirmation: 'RECOVER-SYSTEM-ADMIN' }),
      (error: unknown) => error instanceof Error && /transaction/i.test(error.message)
    );
  });

  it('rolls back the recovery when its audit write fails', async () => {
    const committed: unknown[] = [];
    Reflect.set(globalThis, 'RoleAssignment', {
      getDatastore: () => ({
        transaction: async (work: (leased: unknown) => Promise<unknown>) => {
          const staged: unknown[] = [];
          try {
            const result = await work({ lease: 'recovery-audit-rollback', staged });
            committed.push(...staged);
            return result;
          } catch (error) {
            assert.deepEqual(committed, []);
            throw error;
          }
        },
      }),
      findOne: () => ({ usingConnection: async () => undefined }),
    });
    Reflect.set(globalThis, 'sails', {
      ...sails,
      services: {
        ...sails.services,
        authorizationpersistenceservice: {
          createRoleAssignment: async (input: Record<string, unknown>, leased: unknown) => {
            const staged = (leased as { staged: unknown[] }).staged;
            const row = { id: 'assignment-1', ...input };
            staged.push(row);
            return row;
          },
        },
        authorizationauditservice: {
          createSucceededEvent: async () => Promise.reject(new Error('audit store unavailable')),
          recordAttempt: async (input: Record<string, unknown>, outcome: string) => {
            attemptEvents.push({ input, outcome });
            return { persisted: true };
          },
        },
      },
      log: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
    });

    await assert.rejects(
      service.recoverSystemAdministrator({ ...baseInput, confirmation: 'RECOVER-SYSTEM-ADMIN' }),
      /audit store unavailable/
    );
    assert.deepEqual(committed, [], 'failed audit must leave no committed assignment');
    assert.ok(
      attemptEvents.some(event => event.outcome === 'failed'),
      'audit failure must itself be recorded as a failed attempt'
    );
  });

  it('audits the created role-assignment id rather than the principal id', async () => {
    let targetId: unknown;
    Reflect.set(globalThis, 'sails', {
      ...sails,
      services: {
        ...sails.services,
        authorizationpersistenceservice: {
          createRoleAssignment: async () => ({ id: 'assignment-created-1', version: 1 }),
        },
        authorizationauditservice: {
          createSucceededEvent: async (input: { targetId?: string }) => {
            targetId = input.targetId;
            return { eventId: 'audit-1' };
          },
        },
      },
      log: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
    });

    const result = await service.recoverSystemAdministrator({ ...baseInput, confirmation: 'RECOVER-SYSTEM-ADMIN' });

    assert.equal(result.assignmentCreated, true);
    assert.equal(targetId, 'assignment-created-1');
  });
});
