import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'mocha';

/**
 * AUTH-STRICT-GATE independent regression proof for durable-operation
 * recovery and terminal-state guarantees.
 *
 * - UserMutationOperation terminal writes are fenced by operationId +
 *   claimed attempt/status: stale attempts surface 409 and never overwrite
 *   the winner, terminal rows are idempotent, and the unfenced default pins
 *   the freshly read attempt instead of blind-overwriting by operationId.
 * - Restart recovery replays/compenses the STORED authoritative plan
 *   (user roleIds; link recordOids + proof) across a simulated restart (fresh
 *   service instance, same durable store) instead of merely listing rows.
 * - Link replay consumes only the stored plan, unions durable per-record
 *   progress monotonically, fails incomplete rows closed, and never replays
 *   terminal rows.
 */

function waterlineQuery<T>(rows: T): Promise<T> & Record<string, (...args: never[]) => unknown> {
  const pending = Promise.resolve(rows);
  const query = pending as Promise<T> & Record<string, (...args: never[]) => unknown>;
  for (const method of [
    'exec',
    'fetch',
    'populate',
    'where',
    'sort',
    'limit',
    'skip',
    'select',
    'set',
    'meta',
    'usingConnection',
  ]) {
    query[method] = () => query;
  }
  return query;
}

interface FakeSagaRow {
  operationId: string;
  kind: 'create' | 'update';
  brandId: string;
  username: string;
  userId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attemptCount: number;
  roleIds?: string[];
  createdIsNew?: boolean;
  requestId?: string;
  lastError?: string;
}

function matchesCriteria(row: Record<string, unknown>, criteria: Record<string, unknown>): boolean {
  return Object.entries(criteria ?? {}).every(([key, value]) => row[key] === value);
}

function installSagaStore(shared: Map<string, FakeSagaRow>): void {
  const store = {
    findOne: async (criteria: { readonly operationId?: string }): Promise<FakeSagaRow | null> => {
      if (criteria.operationId === undefined) return null;
      const row = shared.get(criteria.operationId) ?? null;
      return row === null ? null : { ...row };
    },
    create: async (values: FakeSagaRow): Promise<FakeSagaRow> => {
      if (shared.has(values.operationId)) {
        const error = new Error('E_UNIQUE: operationId') as Error & { code?: string };
        error.code = 'E_UNIQUE';
        throw error;
      }
      shared.set(values.operationId, { ...values });
      return { ...values };
    },
    update: async (criteria: Record<string, unknown>, patch: Partial<FakeSagaRow>): Promise<FakeSagaRow[]> => {
      if (criteria.operationId === undefined) return [];
      const current = shared.get(String(criteria.operationId));
      if (current === undefined) return [];
      if (!matchesCriteria(current as unknown as Record<string, unknown>, criteria)) return [];
      const next: FakeSagaRow = { ...current, ...patch } as FakeSagaRow;
      shared.set(String(criteria.operationId), next);
      return [{ ...next }];
    },
    find: (criteria: { readonly or?: readonly { readonly status?: string }[] }) => {
      const statuses = new Set((criteria.or ?? []).map(entry => entry.status));
      const rows = [...shared.values()].filter(row => statuses.has(row.status));
      return {
        limit: async (value: number): Promise<FakeSagaRow[]> => rows.slice(0, value).map(row => ({ ...row })),
      };
    },
  };
  (global as Record<string, unknown>).UserMutationOperation = store;
}

function installLinkStore(shared: Map<string, Record<string, unknown>>): void {
  Reflect.set(globalThis, 'UserLinkOperation', {
    findOne: (criteria: Record<string, unknown>) => {
      const row = [...shared.values()].find(candidate => matchesCriteria(candidate, criteria));
      return waterlineQuery(row === undefined ? undefined : { ...row });
    },
    create: (values: Record<string, unknown>) => {
      if ([...shared.values()].some(candidate => candidate.operationId === values.operationId)) {
        const error = new Error('E_UNIQUE: operationId') as Error & { code?: string };
        error.code = 'E_UNIQUE';
        throw error;
      }
      shared.set(String(values.operationId), { ...values });
      return waterlineQuery({ ...values });
    },
    updateOne: (criteria: Record<string, unknown>) => ({
      set: (values: Record<string, unknown>) => {
        const row = [...shared.values()].find(candidate => matchesCriteria(candidate, criteria));
        if (row === undefined) return waterlineQuery(undefined);
        const next = { ...row, ...values };
        shared.set(String(next.operationId), next);
        return waterlineQuery({ ...next });
      },
    }),
    find: (criteria: Record<string, unknown>) => ({
      limit: (value: number) => {
        let rows = [...shared.values()];
        if (Array.isArray(criteria?.or)) {
          const statuses = new Set((criteria.or as Record<string, unknown>[]).map(entry => String(entry.status)));
          rows = rows.filter(candidate => statuses.has(String(candidate.status)));
        } else {
          rows = rows.filter(candidate => matchesCriteria(candidate, criteria ?? {}));
        }
        return waterlineQuery(rows.slice(0, value).map(candidate => ({ ...candidate })));
      },
    }),
  });
}

function linkServiceDependencies(audits: {
  succeeded: { readonly input: Record<string, unknown> }[];
  attempts: { readonly input: Record<string, unknown>; readonly outcome: 'denied' | 'failed' }[];
}): Record<string, unknown> {
  const testConnection = Object.freeze({ lease: 'strict-gate-proof' }) as Sails.Connection;
  return {
    now: () => new Date('2026-09-06T00:00:00.000Z'),
    randomId: () => `strict-gate-${Math.random().toString(36).slice(2)}`,
    getRegistry: () => {
      throw new Error('registry unused in recovery replay');
    },
    getConfirmationSecret: () => 'strict-gate-proof-secret-long-enough!!',
    audit: () => ({
      createSucceededEvent: async (input: Record<string, unknown>) => {
        audits.succeeded.push({ input });
        return { eventId: `event-${audits.succeeded.length}` };
      },
      recordAttempt: async (input: Record<string, unknown>, outcome: 'denied' | 'failed') => {
        audits.attempts.push({ input, outcome });
        return { persisted: true };
      },
    }),
    runTransaction: (work: (connection: Sails.Connection) => Promise<unknown>) => work(testConnection),
  };
}

function pendingLinkRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operationId: 'link-recovery-1',
    brandId: 'brand-1',
    primaryUserId: 'primary-1',
    secondaryUserId: 'secondary-1',
    primaryUsername: 'primary-1',
    secondaryUsername: 'secondary-1',
    secondaryEmail: 'secondary@example.com',
    status: 'pending',
    recordsPending: true,
    recordsRewritten: 1,
    rolesAdopted: 1,
    rolesRetired: 1,
    attemptCount: 1,
    recordOids: ['rec-a', 'rec-b'],
    recordsCompletedOids: ['rec-a'],
    primaryExpectedVersion: 1,
    secondaryExpectedVersion: 1,
    proofHash: 'proof-hash-1',
    assignmentSnapshot: ['snapshot-1'],
    proofActorId: 'operator-1',
    ...overrides,
  };
}

describe('AUTH-STRICT-GATE durable recovery and terminal fencing proof', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let UsersService: any;

  afterEach(() => {
    delete (global as Record<string, unknown>).UserMutationOperation;
    Reflect.deleteProperty(globalThis, 'UserLinkOperation');
  });

  it('a stale fenced terminal attempt loses with 409 and never overwrites the winner', async () => {
    const shared = new Map<string, FakeSagaRow>();
    installSagaStore(shared);
    const { Services } = require('../../src/services/UsersService') as typeof import('../../src/services/UsersService');
    UsersService = new Services.Users();

    await UsersService.beginUserMutationOperation({
      operationId: 'gate-stale-1',
      kind: 'update',
      brandId: 'brand-1',
      username: 'stale-user',
      roleIds: ['role-1'],
    });
    await UsersService.markUserMutationRunning('gate-stale-1');
    // A concurrent worker claims the next attempt first.
    const winner = await UsersService.markUserMutationRunning('gate-stale-1');
    assert.equal(winner.attemptCount, 2);

    // The stale attempt (fence 1) must lose instead of overwriting attempt 2.
    await assert.rejects(
      UsersService.completeUserMutationOperation('gate-stale-1', { userId: 'user-1' }, 1),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'authorization.version-conflict'
    );
    const stored = shared.get('gate-stale-1');
    assert.equal(stored?.status, 'running');
    assert.equal(stored?.attemptCount, 2);

    // The winner completes with its own fence.
    const completed = await UsersService.completeUserMutationOperation('gate-stale-1', { userId: 'user-1' }, 2);
    assert.equal(completed.status, 'completed');

    // Terminal rows are idempotent: a late stale finish returns the terminal
    // state instead of flipping it to failed.
    const late = await UsersService.failUserMutationOperation('gate-stale-1', 'late failure', 1);
    assert.equal(late.status, 'completed');
  });

  it('the unfenced terminal default pins the fresh attempt instead of blind-overwriting', async () => {
    const shared = new Map<string, FakeSagaRow>();
    installSagaStore(shared);
    const { Services } = require('../../src/services/UsersService') as typeof import('../../src/services/UsersService');
    UsersService = new Services.Users();

    await UsersService.beginUserMutationOperation({
      operationId: 'gate-unfenced-1',
      kind: 'create',
      brandId: 'brand-1',
      username: 'unfenced-user',
    });
    await UsersService.markUserMutationRunning('gate-unfenced-1');
    await UsersService.markUserMutationRunning('gate-unfenced-1');

    // No fence supplied: must complete against the freshly read attempt (2),
    // not blind-update the row by operationId alone.
    const completed = await UsersService.completeUserMutationOperation('gate-unfenced-1', { userId: 'user-9' });
    assert.equal(completed.status, 'completed');
    assert.equal(completed.attemptCount, 2);
    assert.equal(shared.get('gate-unfenced-1')?.userId, 'user-9');
  });

  it('restart replay re-drives the stored user plan and compensates orphans from stored fields', async () => {
    const shared = new Map<string, FakeSagaRow>();
    installSagaStore(shared);
    const { Services } = require('../../src/services/UsersService') as typeof import('../../src/services/UsersService');
    const beforeRestart = new Services.Users();
    await beforeRestart.beginUserMutationOperation({
      operationId: 'gate-replay-user-1',
      kind: 'create',
      brandId: 'brand-1',
      username: 'replay-user',
      roleIds: ['role-7', 'role-3'],
      requestId: 'req-replay-user',
    });

    // Simulate a restart: a fresh instance over the same durable store.
    const afterRestart = new Services.Users();
    const consumedPlans: string[][] = [];
    const settled = await afterRestart.replayIncompleteUserMutationOperations({
      onReplay: async state => {
        consumedPlans.push([...state.roleIds]);
        return { userId: 'user-replay', createdIsNew: true };
      },
    });
    assert.equal(settled.length, 1);
    assert.equal(settled[0].status, 'completed');
    assert.equal(settled[0].userId, 'user-replay');
    // ONLY the stored authoritative plan is consumed (sorted IDs, no names).
    assert.deepEqual(consumedPlans, [['role-3', 'role-7']]);

    // Terminal rows never replay again.
    const drained = await afterRestart.replayIncompleteUserMutationOperations({
      onReplay: async () => {
        assert.fail('terminal user saga rows must not replay');
      },
    });
    assert.equal(drained.length, 0);
  });

  it('restart link replay consumes the stored record plan with monotonic progress and a fenced terminal', async () => {
    const shared = new Map<string, Record<string, unknown>>();
    shared.set('link-recovery-1', pendingLinkRow());
    installLinkStore(shared);
    const audits = {
      succeeded: [] as { readonly input: Record<string, unknown> }[],
      attempts: [] as { readonly input: Record<string, unknown>; readonly outcome: 'denied' | 'failed' }[],
    };
    const { Services } =
      require('../../src/services/RoleAdministrationService') as typeof import('../../src/services/RoleAdministrationService');

    // Simulate a restart: a fresh instance over the same durable store.
    const afterRestart = new Services.RoleAdministrationService(linkServiceDependencies(audits) as never);
    const recovered = await afterRestart.recoverIncompleteLinkOperations();
    assert.equal(
      recovered.some(state => state.operationId === 'link-recovery-1'),
      true
    );

    const consumedPlans: string[][] = [];
    const settled = await afterRestart.replayIncompleteLinkOperations({
      onRewrite: async plan => {
        consumedPlans.push([...plan.recordOids]);
        // Only the not-yet-completed OID remains; the rewrite converges it.
        return { rewritten: 1, completedOids: ['rec-b'] };
      },
    });
    assert.equal(settled.length, 1);
    assert.equal(settled[0].status, 'completed');
    // Monotonic union of previously completed (rec-a) and newly completed (rec-b).
    assert.deepEqual([...settled[0].recordsCompletedOids].sort(), ['rec-a', 'rec-b']);
    assert.equal(settled[0].recordsRewritten, 2);
    // The terminal write advanced exactly one CAS-claimed attempt.
    assert.equal(settled[0].attemptCount, 2);
    // ONLY the stored authoritative plan is consumed — never fresh discovery.
    assert.deepEqual(consumedPlans, [['rec-a', 'rec-b']]);
    // Durable truth matches the returned terminal state.
    const stored = shared.get('link-recovery-1');
    assert.equal(stored?.status, 'completed');
    assert.equal(stored?.attemptCount, 2);
    // Completion is contingent on the durable completion audit.
    assert.equal(
      audits.succeeded.some(entry => entry.input.eventType === 'user.link-operation-completed'),
      true
    );

    // Terminal rows never replay again.
    const drained = await afterRestart.replayIncompleteLinkOperations({
      onRewrite: async () => {
        assert.fail('terminal link operations must not replay');
        return { rewritten: 0, completedOids: [] };
      },
    });
    assert.equal(drained.length, 0);
  });

  it('restart link replay emits the named bounded recovery-process identity, never the preview actor', async () => {
    const shared = new Map<string, Record<string, unknown>>();
    shared.set('link-recovery-1', pendingLinkRow({ proofActorId: 'operator-1' }));
    installLinkStore(shared);
    const audits = {
      succeeded: [] as { readonly input: Record<string, unknown> }[],
      attempts: [] as { readonly input: Record<string, unknown>; readonly outcome: 'denied' | 'failed' }[],
    };
    const { Services, LINK_RECOVERY_PROCESS_ACTOR_ID } =
      require('../../src/services/RoleAdministrationService') as typeof import('../../src/services/RoleAdministrationService');
    assert.equal(LINK_RECOVERY_PROCESS_ACTOR_ID, 'system-recovery:link-replay');
    const afterRestart = new Services.RoleAdministrationService(linkServiceDependencies(audits) as never);

    const settled = await afterRestart.replayIncompleteLinkOperations({
      onRewrite: async () => ({ rewritten: 1, completedOids: ['rec-b'] }),
    });
    assert.equal(settled.length, 1);
    assert.equal(settled[0].status, 'completed');
    const completion = audits.succeeded.find(entry => entry.input.eventType === 'user.link-operation-completed');
    assert.ok(completion !== undefined, 'replay must emit a terminal completion audit');
    assert.equal(completion.input.actorType, 'system-process');
    assert.equal(completion.input.authMethod, 'internal');
    assert.equal(completion.input.actorId, 'system-recovery:link-replay');
    assert.notEqual(completion.input.actorId, 'operator-1');

    // Failed-path recovery audits use the same named identity.
    const failedShared = new Map<string, Record<string, unknown>>();
    const incomplete = pendingLinkRow({ operationId: 'link-incomplete-1', proofHash: undefined });
    delete incomplete.assignmentSnapshot;
    failedShared.set('link-incomplete-1', incomplete);
    installLinkStore(failedShared);
    const failedAudits = {
      succeeded: [] as { readonly input: Record<string, unknown> }[],
      attempts: [] as { readonly input: Record<string, unknown>; readonly outcome: 'denied' | 'failed' }[],
    };
    const retryService = new Services.RoleAdministrationService(linkServiceDependencies(failedAudits) as never);
    const failed = await retryService.replayIncompleteLinkOperations({
      onRewrite: async () => ({ rewritten: 0, completedOids: [] }),
    });
    assert.equal(failed.length, 1);
    assert.equal(failed[0].status, 'failed');
    assert.equal(failedAudits.attempts.length, 1);
    assert.equal(failedAudits.attempts[0].input.actorType, 'system-process');
    assert.equal(failedAudits.attempts[0].input.authMethod, 'internal');
    assert.equal(failedAudits.attempts[0].input.actorId, 'system-recovery:link-replay');
  });

  it('restart link replay fails incomplete and budget-exhausted rows closed without rebuilding plans', async () => {
    const shared = new Map<string, Record<string, unknown>>();
    const incomplete = pendingLinkRow({ operationId: 'link-incomplete-1', proofHash: undefined });
    delete incomplete.assignmentSnapshot;
    shared.set('link-incomplete-1', incomplete);
    shared.set('link-budget-1', pendingLinkRow({ operationId: 'link-budget-1', attemptCount: 5 }));
    installLinkStore(shared);
    const audits = {
      succeeded: [] as { readonly input: Record<string, unknown> }[],
      attempts: [] as { readonly input: Record<string, unknown>; readonly outcome: 'denied' | 'failed' }[],
    };
    const { Services } =
      require('../../src/services/RoleAdministrationService') as typeof import('../../src/services/RoleAdministrationService');
    const afterRestart = new Services.RoleAdministrationService(linkServiceDependencies(audits) as never);

    let rewrote = false;
    const settled = await afterRestart.replayIncompleteLinkOperations({
      onRewrite: async () => {
        rewrote = true;
        return { rewritten: 0, completedOids: [] };
      },
    });
    assert.equal(rewrote, false);
    assert.equal(settled.length, 2);
    for (const state of settled) {
      assert.equal(state.status, 'failed');
      assert.equal(shared.get(state.operationId)?.status, 'failed');
    }
  });
});
