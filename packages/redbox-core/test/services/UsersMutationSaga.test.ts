import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'mocha';

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

function installDurableSagaStore(shared: Map<string, FakeSagaRow>): void {
  const store = {
    findOne: async (criteria: { readonly operationId?: string }): Promise<FakeSagaRow | null> => {
      if (criteria.operationId === undefined) return null;
      return shared.get(criteria.operationId) ?? null;
    },
    create: async (values: FakeSagaRow): Promise<FakeSagaRow> => {
      if (shared.has(values.operationId)) {
        const error = new Error('E_UNIQUE: operationId') as Error & { code?: string };
        error.code = 'E_UNIQUE';
        throw error;
      }
      const row: FakeSagaRow = { ...values };
      shared.set(values.operationId, row);
      return { ...row };
    },
    update: async (
      criteria: { readonly operationId?: string; readonly attemptCount?: number },
      patch: Partial<FakeSagaRow>
    ): Promise<FakeSagaRow[]> => {
      if (criteria.operationId === undefined) return [];
      const current = shared.get(criteria.operationId);
      if (current === undefined) return [];
      if (criteria.attemptCount !== undefined && current.attemptCount !== criteria.attemptCount) return [];
      const next: FakeSagaRow = { ...current, ...patch } as FakeSagaRow;
      shared.set(criteria.operationId, next);
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

describe('AUTH-SAGA-001 user mutation saga/outbox', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let UsersService: any;

  beforeEach(() => {
    delete (global as Record<string, unknown>).UserMutationOperation;
    const { Services } = require('../../src/services/UsersService') as typeof import('../../src/services/UsersService');
    UsersService = new Services.Users();
  });

  afterEach(() => {
    delete (global as Record<string, unknown>).UserMutationOperation;
  });

  it('begins idempotently and fences attempts with CAS', async () => {
    installDurableSagaStore(new Map<string, FakeSagaRow>());
    const begun = await UsersService.beginUserMutationOperation({
      operationId: 'saga-cas-1',
      kind: 'create',
      brandId: 'brand-1',
      username: 'alice',
      roleIds: ['role-b', 'role-a', 'role-a'],
      requestId: 'req-1',
    });
    assert.equal(begun.status, 'pending');
    assert.deepEqual([...begun.roleIds], ['role-a', 'role-b']);
    const repeat = await UsersService.beginUserMutationOperation({
      operationId: 'saga-cas-1',
      kind: 'create',
      brandId: 'brand-1',
      username: 'alice',
      roleIds: ['role-a'],
    });
    assert.equal(repeat.status, 'pending');

    const running = await UsersService.markUserMutationRunning('saga-cas-1');
    assert.equal(running.status, 'running');
    assert.equal(running.attemptCount, 1);

    const completed = await UsersService.completeUserMutationOperation('saga-cas-1', {
      userId: 'user-1',
      createdIsNew: true,
    });
    assert.equal(completed.status, 'completed');
    assert.equal(completed.userId, 'user-1');

    const terminal = await UsersService.markUserMutationRunning('saga-cas-1');
    assert.equal(terminal.status, 'completed');

    const recovered = await UsersService.recoverIncompleteUserMutationOperations();
    assert.equal(
      recovered.some((state: { readonly operationId?: string }) => state.operationId === 'saga-cas-1'),
      false
    );
  });

  it('enforces the bounded retry budget and records failures', async () => {
    installDurableSagaStore(new Map<string, FakeSagaRow>());
    await UsersService.beginUserMutationOperation({
      operationId: 'saga-budget-1',
      kind: 'update',
      brandId: 'brand-1',
      username: 'bob',
    });
    await UsersService.markUserMutationRunning('saga-budget-1', 1);
    let code: string | undefined;
    try {
      await UsersService.markUserMutationRunning('saga-budget-1', 1);
    } catch (error) {
      code = (error as { readonly code?: string }).code;
    }
    assert.equal(code, 'authorization.bulk-invalid');
    const failed = await UsersService.failUserMutationOperation('saga-budget-1', 'role phase failed');
    assert.equal(failed.status, 'failed');
    assert.equal(failed.lastError, 'role phase failed');
  });

  it('recovers pending work across a restart through the durable store', async () => {
    const shared = new Map<string, FakeSagaRow>();
    installDurableSagaStore(shared);
    const { Services } = require('../../src/services/UsersService') as typeof import('../../src/services/UsersService');
    const beforeRestart = new Services.Users();
    const begun = await beforeRestart.beginUserMutationOperation({
      operationId: 'saga-restart-1',
      kind: 'create',
      brandId: 'brand-1',
      username: 'carol',
      roleIds: ['role-1'],
      requestId: 'req-restart',
    });
    assert.equal(begun.status, 'pending');

    // Simulate a process restart: a fresh instance reads the same durable
    // store and resumes ONLY the stored plan.
    const afterRestart = new Services.Users();
    const pending = await afterRestart.recoverIncompleteUserMutationOperations();
    const resumed = pending.find((state: { readonly operationId?: string }) => state.operationId === 'saga-restart-1');
    assert.ok(resumed !== undefined, 'restarted process must recover the pending saga');
    assert.deepEqual([...(resumed.roleIds as readonly string[])], ['role-1']);
    const running = await afterRestart.markUserMutationRunning('saga-restart-1');
    assert.equal(running.attemptCount, 1);
    const completed = await afterRestart.completeUserMutationOperation('saga-restart-1', {
      userId: 'user-carol',
      createdIsNew: true,
    });
    assert.equal(completed.status, 'completed');
    const drained = await afterRestart.recoverIncompleteUserMutationOperations();
    assert.equal(
      drained.some((state: { readonly operationId?: string }) => state.operationId === 'saga-restart-1'),
      false
    );
  });

  it('fails closed instead of falling back in-process when the store is unavailable in a lifted runtime', async () => {
    const sailsGlobal = (global as Record<string, unknown>).sails as Record<string, unknown> | undefined;
    const config = sailsGlobal?.config as Record<string, unknown> | undefined;
    const hadEnvironment = config?.environment;
    if (config !== undefined) config.environment = 'production';
    try {
      await assert.rejects(
        UsersService.beginUserMutationOperation({
          operationId: 'saga-failclosed-1',
          kind: 'create',
          brandId: 'brand-1',
          username: 'dave',
        }),
        (error: unknown) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'authorization.saga-unavailable' &&
          'status' in error &&
          error.status === 503
      );
      await assert.rejects(
        UsersService.recoverIncompleteUserMutationOperations(),
        (error: unknown) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'authorization.saga-unavailable'
      );
    } finally {
      if (config !== undefined) {
        if (hadEnvironment === undefined) delete config.environment;
        else config.environment = hadEnvironment;
      }
    }
  });

  it('replays the stored plan through the replay driver and completes idempotently', async () => {
    const shared = new Map<string, FakeSagaRow>();
    installDurableSagaStore(shared);
    const { Services } = require('../../src/services/UsersService') as typeof import('../../src/services/UsersService');
    const service = new Services.Users();
    await service.beginUserMutationOperation({
      operationId: 'saga-replay-1',
      kind: 'update',
      brandId: 'brand-1',
      username: 'erin',
      roleIds: ['role-9'],
      requestId: 'req-replay',
    });

    const replayedPlans: string[][] = [];
    const settled = await service.replayIncompleteUserMutationOperations({
      onReplay: async state => {
        replayedPlans.push([...state.roleIds]);
        return { userId: 'user-erin', createdIsNew: false };
      },
    });
    assert.equal(settled.length, 1);
    assert.equal(settled[0].status, 'completed');
    assert.equal(settled[0].userId, 'user-erin');
    assert.deepEqual(replayedPlans, [['role-9']]);

    // Terminal rows are never replayed again: the driver is idempotent.
    const drained = await service.replayIncompleteUserMutationOperations({
      onReplay: async () => {
        assert.fail('terminal saga rows must not replay');
      },
    });
    assert.equal(drained.length, 0);
  });

  it('marks budget-exhausted rows failed during replay instead of retrying forever', async () => {
    const shared = new Map<string, FakeSagaRow>();
    installDurableSagaStore(shared);
    const { Services } = require('../../src/services/UsersService') as typeof import('../../src/services/UsersService');
    const service = new Services.Users();
    await service.beginUserMutationOperation({
      operationId: 'saga-replay-budget-1',
      kind: 'create',
      brandId: 'brand-1',
      username: 'frank',
    });
    await service.markUserMutationRunning('saga-replay-budget-1', 1);

    let replayed = false;
    const settled = await service.replayIncompleteUserMutationOperations({
      maxAttempts: 1,
      onReplay: async () => {
        replayed = true;
      },
    });
    assert.equal(replayed, false);
    assert.equal(settled.length, 1);
    assert.equal(settled[0].status, 'failed');
    assert.ok(String(settled[0].lastError ?? '').includes('retry budget'));
  });

  it('fails the row with detail when the default replayer finds no user row for the stored plan', async () => {
    const shared = new Map<string, FakeSagaRow>();
    installDurableSagaStore(shared);
    // Bounded production-path seam: a lifted User store that resolves to no
    // row (exec-callback null) so the default replayer traverses its real
    // username-in-brand resolution instead of a missing-global ReferenceError.
    const query = { exec: (callback: (error: Error | null, result: null) => void): void => callback(null, null) };
    (global as Record<string, unknown>).User = {
      findOne: (): { populate: () => typeof query } => ({ populate: () => query }),
    };
    const { Services } = require('../../src/services/UsersService') as typeof import('../../src/services/UsersService');
    const service = new Services.Users();
    try {
      await service.beginUserMutationOperation({
        operationId: 'saga-replay-orphan-1',
        kind: 'create',
        brandId: 'brand-1',
        username: 'ghost-user',
        roleIds: ['role-1'],
      });

      const settled = await service.replayIncompleteUserMutationOperations();
      assert.equal(settled.length, 1);
      assert.equal(settled[0].status, 'failed');
      assert.ok(String(settled[0].lastError ?? '').includes('no user row'));
    } finally {
      delete (global as Record<string, unknown>).User;
    }
  });
});
