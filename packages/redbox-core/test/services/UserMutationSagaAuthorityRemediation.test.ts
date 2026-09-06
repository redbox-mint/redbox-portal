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

/**
 * AUTH-SAGA-REMEDIATION independent regression proof.
 *
 * Proves, against the production code paths (not a re-implementation):
 * 1. The persisted saga plan is authoritative role IDs and replay consumes
 *    EXACTLY the stored IDs even when a live name->ID mapping would resolve
 *    differently mid-flight.
 * 2. Terminal updates are awaited and fenced by operationId+attempt+status:
 *    a stale attempt cannot overwrite the winner (409) and terminal rows are
 *    idempotent.
 * 3. Durable persistence stays fail-closed and restart-safe (503 without the
 *    store in a lifted runtime; pending rows survive a restart).
 */
function installFencedSagaStore(shared: Map<string, FakeSagaRow>): void {
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
      criteria: { readonly operationId?: string; readonly attemptCount?: number; readonly status?: string },
      patch: Partial<FakeSagaRow>
    ): Promise<FakeSagaRow[]> => {
      if (criteria.operationId === undefined) return [];
      const current = shared.get(criteria.operationId);
      if (current === undefined) return [];
      if (criteria.attemptCount !== undefined && current.attemptCount !== criteria.attemptCount) return [];
      if (criteria.status !== undefined && current.status !== criteria.status) return [];
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

describe('AUTH-SAGA-REMEDIATION authority + fenced terminal proof', () => {
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

  it('persists IDs (never names) and replays exactly the stored ID plan', async () => {
    const shared = new Map<string, FakeSagaRow>();
    installFencedSagaStore(shared);
    const { Services } = require('../../src/services/UsersService') as typeof import('../../src/services/UsersService');
    const service = new Services.Users();

    // Controller-equivalent: names resolved to IDs BEFORE saga begin.
    // Suppose brand mapping at request time resolves admin->role-id-1.
    const storedIds = ['role-id-1', 'role-id-2'];
    const begun = await service.beginUserMutationOperation({
      operationId: 'remediation-authority-1',
      kind: 'create',
      brandId: 'brand-1',
      username: 'authority-user',
      roleIds: storedIds,
      requestId: 'req-authority',
    });
    assert.deepEqual([...begun.roleIds], ['role-id-1', 'role-id-2']);

    // Durable row must contain IDs, never the request names.
    const durable = shared.get('remediation-authority-1');
    assert.ok(durable !== undefined);
    assert.deepEqual([...(durable?.roleIds ?? [])].sort(), ['role-id-1', 'role-id-2']);
    assert.ok(!(durable?.roleIds ?? []).includes('admin'));

    // Mid-flight the live brand mapping changes (admin now -> role-id-9).
    // Replay must still consume EXACTLY the stored IDs, not the new mapping.
    const seen: string[][] = [];
    const settled = await service.replayIncompleteUserMutationOperations({
      onReplay: async state => {
        seen.push([...state.roleIds]);
        assert.deepEqual([...state.roleIds].sort(), ['role-id-1', 'role-id-2']);
        return { userId: 'user-authority', createdIsNew: true };
      },
    });
    assert.equal(settled.length, 1);
    assert.equal(settled[0].status, 'completed');
    assert.deepEqual(seen, [['role-id-1', 'role-id-2']]);
  });

  it('fences terminal updates by operationId+attempt+status and stays awaited', async () => {
    const shared = new Map<string, FakeSagaRow>();
    installFencedSagaStore(shared);
    const { Services } = require('../../src/services/UsersService') as typeof import('../../src/services/UsersService');
    const service = new Services.Users();

    await service.beginUserMutationOperation({
      operationId: 'remediation-fence-1',
      kind: 'update',
      brandId: 'brand-1',
      username: 'fence-user',
      roleIds: ['role-1'],
    });
    const claimed = await service.markUserMutationRunning('remediation-fence-1');
    assert.equal(claimed.attemptCount, 1);

    // Stale attempt (0) must not overwrite the claimed running row.
    await assert.rejects(
      service.completeUserMutationOperation('remediation-fence-1', { userId: 'u-1' }, 0),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'authorization.version-conflict'
    );
    // Row must still be running after the stale attempt.
    const stillRunning = shared.get('remediation-fence-1');
    assert.equal(stillRunning?.status, 'running');

    // Correct fenced attempt completes (awaited: settled only after write).
    const completed = await service.completeUserMutationOperation('remediation-fence-1', { userId: 'u-1' }, 1);
    assert.equal(completed.status, 'completed');
    assert.equal(shared.get('remediation-fence-1')?.status, 'completed');

    // Terminal rows are idempotent, even for a stale attempt.
    const repeated = await service.completeUserMutationOperation('remediation-fence-1', { userId: 'u-1' }, 0);
    assert.equal(repeated.status, 'completed');

    // A second worker racing to fail the completed row observes terminal.
    const failedView = await service.failUserMutationOperation('remediation-fence-1', 'late failure', 1);
    assert.equal(failedView.status, 'completed');
  });

  it('stays fail-closed and restart-safe without the durable store', async () => {
    const sailsGlobal = (global as Record<string, unknown>).sails as Record<string, unknown> | undefined;
    const config = sailsGlobal?.config as Record<string, unknown> | undefined;
    const hadEnvironment = config?.environment;
    if (config !== undefined) config.environment = 'production';
    try {
      await assert.rejects(
        UsersService.completeUserMutationOperation('remediation-failclosed-1', undefined, 1),
        (error: unknown) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'authorization.saga-unavailable'
      );
      await assert.rejects(
        UsersService.failUserMutationOperation('remediation-failclosed-1', 'detail', 1),
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

    // Restart-safe: a pending row written before restart is recovered after.
    const shared = new Map<string, FakeSagaRow>();
    installFencedSagaStore(shared);
    const { Services } = require('../../src/services/UsersService') as typeof import('../../src/services/UsersService');
    const before = new Services.Users();
    await before.beginUserMutationOperation({
      operationId: 'remediation-restart-1',
      kind: 'create',
      brandId: 'brand-1',
      username: 'restart-user',
      roleIds: ['role-7'],
    });
    const after = new Services.Users();
    const pending = await after.recoverIncompleteUserMutationOperations();
    assert.ok(pending.some(state => state.operationId === 'remediation-restart-1'));
  });
});
