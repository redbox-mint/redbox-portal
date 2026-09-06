import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';

import {
  MIGRATION_LEASE_TTL_MS,
  __resetMigrationLeaseStateForTests,
  acquireMigrationLease,
  assertMigrationLeaseHeld,
  clearMigrationCheckpoint,
  readMigrationCheckpoint,
  readMigrationLease,
  writeMigrationCheckpoint,
} from '../../src/services/AuthorizationMigrationService';
import { Services as BootstrapServices } from '../../src/services/AuthorizationBootstrapService';
import { runPendingMigrations, type RedboxMigration } from '../../src/loader/MigrationRunner';

type MutableRow = Record<string, unknown>;

function uniqueViolation(): Error {
  const error = new Error('E11000 duplicate key error');
  Object.assign(error, { code: 'E_UNIQUE' });
  return error;
}

function toMs(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value);
  return NaN;
}

/** Durable lease double with CAS semantics for owner+fence and takeover filters. */
function makeDurableLeaseDouble(store: { row: MutableRow | null }) {
  return {
    findOne: async (): Promise<unknown> => (store.row === null ? null : { ...store.row }),
    insertOne: async (doc: unknown): Promise<unknown> => {
      if (store.row !== null) throw uniqueViolation();
      store.row = { ...(doc as MutableRow) };
      return { acknowledged: true, insertedId: 1 };
    },
    updateOne: async (filter: unknown, update: unknown): Promise<unknown> => {
      const criteria = filter as Record<string, unknown>;
      const row = store.row;
      if (row === null) return { matchedCount: 0, modifiedCount: 0 };
      const applySet = (): void => {
        const set = (update as Record<string, unknown>).$set as MutableRow | undefined;
        if (set !== undefined) Object.assign(row, set);
      };
      if (criteria.owner !== undefined) {
        let ok = row.owner === criteria.owner && row.fence === criteria.fence;
        const expires = criteria.expiresAt as Record<string, unknown> | undefined;
        if (ok && expires !== undefined && typeof expires === 'object' && '$gt' in expires) {
          ok = toMs(row.expiresAt) > toMs(expires.$gt);
        }
        if (!ok) return { matchedCount: 0, modifiedCount: 0 };
        applySet();
        return { matchedCount: 1, modifiedCount: 1 };
      }
      if (criteria.fence !== undefined && row.fence !== criteria.fence) {
        return { matchedCount: 0, modifiedCount: 0 };
      }
      const orClauses = criteria.$or as Array<Record<string, unknown>> | undefined;
      let ok = false;
      if (orClauses !== undefined) {
        for (const clause of orClauses) {
          if (clause.owner !== undefined && row.owner === clause.owner) ok = true;
          const clauseExpires = clause.expiresAt as Record<string, unknown> | undefined;
          if (
            clauseExpires !== undefined &&
            typeof clauseExpires === 'object' &&
            '$lte' in clauseExpires &&
            toMs(row.expiresAt) <= toMs(clauseExpires.$lte)
          ) {
            ok = true;
          }
        }
      } else {
        const expires = criteria.expiresAt as Record<string, unknown> | undefined;
        if (expires !== undefined && typeof expires === 'object' && '$lte' in expires) {
          ok = toMs(row.expiresAt) <= toMs(expires.$lte);
        }
      }
      if (!ok) return { matchedCount: 0, modifiedCount: 0 };
      applySet();
      return { matchedCount: 1, modifiedCount: 1 };
    },
    deleteOne: async (): Promise<unknown> => ({ deletedCount: 0 }),
  };
}

/** Durable checkpoint double with unique-insert semantics on `{ migrationName, phase }`. */
function makeDurableCheckpointDouble(
  store: Map<string, MutableRow>,
  options: { forceFindRows?: MutableRow[]; forceDeleteResult?: unknown } = {}
) {
  const matches = (row: MutableRow, filter: Record<string, unknown>): boolean =>
    Object.entries(filter).every(([key, expected]) => row[key] === expected);
  return {
    find: (filter: unknown) => ({
      limit: (count: number) => ({
        toArray: async (): Promise<unknown[]> => {
          if (options.forceFindRows !== undefined) return options.forceFindRows;
          const criteria = filter as Record<string, unknown>;
          return [...store.values()].filter(row => matches(row, criteria)).slice(0, count);
        },
      }),
    }),
    insertOne: async (doc: unknown): Promise<unknown> => {
      const row = { ...(doc as MutableRow) };
      const key = `${String(row.migrationName)}:${String(row.phase)}`;
      if (store.has(key)) throw uniqueViolation();
      store.set(key, row);
      return { acknowledged: true };
    },
    updateOne: async (filter: unknown, update: unknown): Promise<unknown> => {
      const criteria = filter as Record<string, unknown>;
      const entry = [...store.entries()].find(([, row]) => matches(row, criteria));
      if (entry === undefined) return { matchedCount: 0, modifiedCount: 0 };
      const set = (update as Record<string, unknown>).$set as MutableRow | undefined;
      const unset = (update as Record<string, unknown>).$unset as Record<string, unknown> | undefined;
      if (set !== undefined) Object.assign(entry[1], set);
      if (unset !== undefined) for (const key of Object.keys(unset)) delete entry[1][key];
      return { matchedCount: 1, modifiedCount: 1 };
    },
    deleteOne: async (filter: unknown): Promise<unknown> => {
      if (options.forceDeleteResult !== undefined) return options.forceDeleteResult;
      const criteria = filter as Record<string, unknown>;
      const entry = [...store.entries()].find(([, row]) => matches(row, criteria));
      if (entry === undefined) return { deletedCount: 0 };
      store.delete(entry[0]);
      return { deletedCount: 1 };
    },
  };
}

function stubRoleDatastore(doubles: Record<string, unknown>): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Role');
  Reflect.set(globalThis, 'Role', {
    getDatastore: () => ({ manager: { collection: (name: string): unknown => doubles[name] } }),
  });
  return () => {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, 'Role');
    else Object.defineProperty(globalThis, 'Role', descriptor);
  };
}

describe('Phase 3 remediation: checkpoint writes fail closed on the durable lease (finding 1)', () => {
  beforeEach(async () => {
    __resetMigrationLeaseStateForTests();
    await clearMigrationCheckpoint('roles');
  });

  afterEach(async () => {
    __resetMigrationLeaseStateForTests();
    await clearMigrationCheckpoint('roles');
  });

  it('rejects leaseless writes and clears while a live lease is held', async () => {
    const holder = await acquireMigrationLease('live-holder');
    try {
      await assert.rejects(() => writeMigrationCheckpoint('roles', 'cursor-a'), /no lease held/);
      await assert.rejects(() => clearMigrationCheckpoint('roles'), /no lease held/);
    } finally {
      await holder.release();
    }
  });

  it('rejects foreign owner+fence writes and clears', async () => {
    const holder = await acquireMigrationLease('owner-a');
    try {
      await assert.rejects(
        () => writeMigrationCheckpoint('roles', 'cursor-a', undefined, { lease: { owner: 'intruder', fence: 999 } }),
        /mismatch/
      );
      await assert.rejects(
        () => clearMigrationCheckpoint('roles', { lease: { owner: 'intruder', fence: 999 } }),
        /mismatch/
      );
    } finally {
      await holder.release();
    }
  });

  it('rejects writes and clears with an expired lease', async () => {
    const realNow = Date.now;
    try {
      let nowMs = realNow();
      Date.now = () => nowMs;
      const holder = await acquireMigrationLease('expiring-owner');
      nowMs += MIGRATION_LEASE_TTL_MS + 1;
      await assert.rejects(
        () => writeMigrationCheckpoint('roles', 'cursor-a', undefined, { lease: holder }),
        /expired/
      );
      await assert.rejects(() => clearMigrationCheckpoint('roles', { lease: holder }), /expired/);
      await assert.rejects(() => assertMigrationLeaseHeld(holder), /expired/);
    } finally {
      Date.now = realNow;
    }
  });

  it('keeps the historical leaseless memory path only when no live holder exists', async () => {
    const written = await writeMigrationCheckpoint('roles', 'cursor-a');
    assert.equal(written.lastId, 'cursor-a');
    assert.equal((await readMigrationCheckpoint('roles'))?.lastId, 'cursor-a');
  });
});

describe('Phase 3 remediation: durable lease rows fail closed (finding 1)', () => {
  let restoreRole: (() => void) | undefined;

  afterEach(async () => {
    restoreRole?.();
    restoreRole = undefined;
    __resetMigrationLeaseStateForTests();
  });

  function stubLeaseRow(row: MutableRow | null | 'throw') {
    const leaseStore: { row: MutableRow | null } = { row: null };
    const checkpointStore = new Map<string, MutableRow>();
    const leaseDouble =
      row === 'throw'
        ? {
            findOne: async (): Promise<unknown> => {
              throw new Error('mongo down');
            },
            updateOne: async (): Promise<unknown> => ({ matchedCount: 0, modifiedCount: 0 }),
          }
        : makeDurableLeaseDouble(leaseStore);
    if (row !== null && row !== 'throw') leaseStore.row = { ...row };
    restoreRole = stubRoleDatastore({
      authorizationmigrationlease: leaseDouble,
      authorizationmigrationcheckpoint: makeDurableCheckpointDouble(checkpointStore),
    });
    return { leaseStore, checkpointStore };
  }

  it('rejects writes and clears when the durable lease row is missing', async () => {
    stubLeaseRow(null);
    const lease = { owner: 'writer', fence: 1 };
    await assert.rejects(
      () => writeMigrationCheckpoint('roles', 'cursor-a', undefined, { lease }),
      /no durable lease row/
    );
    await assert.rejects(() => clearMigrationCheckpoint('roles', { lease }), /no durable lease row/);
    await assert.rejects(() => assertMigrationLeaseHeld(lease), /no durable lease row/);
  });

  it('rejects acquisition and writes when the durable lease row is malformed', async () => {
    stubLeaseRow({ migrationName: 'x', owner: '', fence: 'nan', expiresAt: 'garbage' });
    await assert.rejects(() => acquireMigrationLease('writer'), /malformed/);
    assert.equal(await readMigrationLease(), undefined);
    await assert.rejects(
      () => writeMigrationCheckpoint('roles', 'cursor-a', undefined, { lease: { owner: 'writer', fence: 1 } }),
      /malformed/
    );
  });

  it('rejects writes with an expired durable lease row', async () => {
    stubLeaseRow({ migrationName: 'x', owner: 'writer', fence: 2, expiresAt: new Date(Date.now() - 1000) });
    await assert.rejects(
      () => writeMigrationCheckpoint('roles', 'cursor-a', undefined, { lease: { owner: 'writer', fence: 2 } }),
      /expired/
    );
  });

  it('rejects writes with a foreign durable holder', async () => {
    stubLeaseRow({ migrationName: 'x', owner: 'other', fence: 7, expiresAt: new Date(Date.now() + 60_000) });
    await assert.rejects(
      () => writeMigrationCheckpoint('roles', 'cursor-a', undefined, { lease: { owner: 'writer', fence: 1 } }),
      /mismatch/
    );
  });

  it('propagates durable lease read failures instead of swallowing them', async () => {
    stubLeaseRow('throw');
    await assert.rejects(
      () => writeMigrationCheckpoint('roles', 'cursor-a', undefined, { lease: { owner: 'writer', fence: 1 } }),
      /mongo down/
    );
  });
});

describe('Phase 3 remediation: race-safe checkpoint creation and fenced clear (finding 2)', () => {
  let restoreRole: (() => void) | undefined;
  let checkpointStore: Map<string, MutableRow>;

  beforeEach(async () => {
    __resetMigrationLeaseStateForTests();
    checkpointStore = new Map<string, MutableRow>();
  });

  afterEach(async () => {
    restoreRole?.();
    restoreRole = undefined;
    __resetMigrationLeaseStateForTests();
  });

  async function acquireMemoryLease(owner: string): Promise<{ owner: string; fence: number }> {
    const handle = await acquireMigrationLease(owner);
    return { owner: handle.owner, fence: handle.fence };
  }

  it('fails a concurrent creation closed on duplicate-key instead of forking rows', async () => {
    const handle = await acquireMigrationLease('creator');
    const lease = { owner: handle.owner, fence: handle.fence };
    try {
      restoreRole = stubRoleDatastore({
        authorizationmigrationcheckpoint: makeDurableCheckpointDouble(checkpointStore, { forceFindRows: [] }),
      });
      const first = await writeMigrationCheckpoint('roles', 'cursor-a', undefined, { lease });
      assert.equal(first.revision, 1);
      await assert.rejects(
        () => writeMigrationCheckpoint('roles', 'cursor-b', undefined, { lease }),
        /duplicate write|concurrent create race/
      );
      assert.equal(checkpointStore.size, 1);
    } finally {
      await handle.release();
    }
  });

  it('clears only on the expected revision and validates the affected row', async () => {
    const lease = await acquireMemoryLease('clearer');
    restoreRole = stubRoleDatastore({
      authorizationmigrationcheckpoint: makeDurableCheckpointDouble(checkpointStore),
    });
    const written = await writeMigrationCheckpoint('roles', 'cursor-a', undefined, { lease });
    await assert.rejects(
      () => clearMigrationCheckpoint('roles', { lease, expectedRevision: written.revision + 1 }),
      /revision conflict/
    );
    await clearMigrationCheckpoint('roles', { lease, expectedRevision: written.revision });
    assert.equal(await readMigrationCheckpoint('roles'), undefined);
  });

  it('fails a clear closed when a concurrent writer advanced the row', async () => {
    const lease = await acquireMemoryLease('clear-racer');
    checkpointStore.set('20260828T120000-authorization-model-v1:roles', {
      migrationName: '20260828T120000-authorization-model-v1',
      phase: 'roles',
      lastId: 'cursor-a',
      updatedAt: new Date(0).toISOString(),
      revision: 5,
    });
    restoreRole = stubRoleDatastore({
      authorizationmigrationcheckpoint: makeDurableCheckpointDouble(checkpointStore, {
        forceDeleteResult: { deletedCount: 0 },
      }),
    });
    await assert.rejects(
      () => clearMigrationCheckpoint('roles', { lease, expectedRevision: 5 }),
      /changed concurrently/
    );
  });

  it('treats clearing an absent checkpoint as an idempotent no-op', async () => {
    const lease = await acquireMemoryLease('clear-idempotent');
    restoreRole = stubRoleDatastore({
      authorizationmigrationcheckpoint: makeDurableCheckpointDouble(checkpointStore),
    });
    await clearMigrationCheckpoint('roles', { lease });
    assert.equal(await readMigrationCheckpoint('roles'), undefined);
  });
});

describe('Phase 3 remediation: fencing stays monotonic across release and restart (finding 4)', () => {
  afterEach(() => {
    __resetMigrationLeaseStateForTests();
  });

  it('allocates a strictly greater fence to the next memory owner after release', async () => {
    __resetMigrationLeaseStateForTests();
    const first = await acquireMigrationLease('owner-a');
    const firstFence = first.fence;
    await first.release();
    const second = await acquireMigrationLease('owner-b');
    try {
      assert.ok(second.fence > firstFence, `fence must increase after release (${firstFence} -> ${second.fence})`);
    } finally {
      await second.release();
    }
  });

  it('retains the fencing tombstone on release and survives a restart with a greater fence', async () => {
    const leaseStore: { row: MutableRow | null } = { row: null };
    const restoreRole = stubRoleDatastore({ authorizationmigrationlease: makeDurableLeaseDouble(leaseStore) });
    try {
      __resetMigrationLeaseStateForTests();
      const first = await acquireMigrationLease('restart-owner-a');
      const firstFence = first.fence;
      await first.release();
      const tombstone = leaseStore.row;
      assert.ok(tombstone !== null, 'release must retain the fencing tombstone row');
      assert.equal(tombstone?.fence, firstFence);
      assert.equal(tombstone?.owner, 'restart-owner-a');
      // Simulate a process restart: in-memory counter and mirrors are gone,
      // the durable tombstone row is the only fencing memory.
      __resetMigrationLeaseStateForTests();
      const second = await acquireMigrationLease('restart-owner-b');
      try {
        assert.equal(second.fence, firstFence + 1);
      } finally {
        await second.release();
      }
    } finally {
      restoreRole();
    }
  });
});

describe('Phase 3 remediation: MigrationRunner stops on lease loss (finding 5)', () => {
  const hadSails = Object.prototype.hasOwnProperty.call(globalThis, 'sails');
  const savedSails: unknown = Reflect.get(globalThis, 'sails');
  const realNow = Date.now;
  let nowMs = realNow();

  beforeEach(() => {
    __resetMigrationLeaseStateForTests();
    nowMs = realNow();
    Date.now = () => nowMs;
    const created: Array<Record<string, unknown>> = [];
    Reflect.set(globalThis, 'sails', {
      models: {
        migration: {
          find: () => ({ sort: async () => [] }),
          create: async (values: unknown): Promise<unknown> => {
            created.push(values as Record<string, unknown>);
            return values;
          },
          destroy: async (): Promise<unknown> => undefined,
        },
      },
      log: { verbose: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    });
    Reflect.set(globalThis, '__runnerCreatedRows', created);
  });

  afterEach(() => {
    Date.now = realNow;
    __resetMigrationLeaseStateForTests();
    if (hadSails) Reflect.set(globalThis, 'sails', savedSails);
    else Reflect.deleteProperty(globalThis, 'sails');
    Reflect.deleteProperty(globalThis, '__runnerCreatedRows');
  });

  it('rejects logMigration and skips later migrations after a mid-run takeover', async () => {
    const ran: string[] = [];
    const migrations: RedboxMigration[] = [
      {
        name: '2026.06.08T09.00.00-first',
        up: async () => {
          // Simulate heartbeat loss: the TTL lapses mid-run and a successor
          // takes over before this migration finishes.
          nowMs += MIGRATION_LEASE_TTL_MS + 1;
          await acquireMigrationLease('takeover-owner');
          ran.push('first');
        },
      },
      {
        name: '2026.06.08T10.00.00-second',
        up: async () => {
          ran.push('second');
        },
      },
    ];
    let caught: unknown;
    try {
      await runPendingMigrations(migrations);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught !== undefined, 'the runner must reject after losing the lease');
    const message = `${String(caught)} ${(caught as { cause?: unknown }).cause}`;
    assert.match(message, /rejected|superseded|mismatch|expired/);
    assert.deepEqual(ran, ['first']);
    const created = Reflect.get(globalThis, '__runnerCreatedRows') as Array<Record<string, unknown>>;
    assert.deepEqual(
      created.map(row => row.name),
      [],
      'no migration may be logged as applied after the lease was lost'
    );
  });
});

describe('Phase 3 remediation: bootstrap holds the shared durable lease (finding 3)', () => {
  beforeEach(() => {
    __resetMigrationLeaseStateForTests();
  });

  afterEach(() => {
    __resetMigrationLeaseStateForTests();
  });

  it('fails closed when another lift holds the shared lease', async () => {
    const holder = await acquireMigrationLease('other-lift');
    try {
      await assert.rejects(
        () => new BootstrapServices.AuthorizationBootstrapService().bootstrap({}),
        /already running/
      );
    } finally {
      await holder.release();
    }
  });

  it('holds the shared lease during reconciliation and releases it afterwards', async () => {
    const savedServices = sails.services;
    let observed: { owner: string; fence: number } | undefined;
    sails.services = {
      ...savedServices,
      authorizationscopeservice: { bootstrap: async () => undefined },
      authorizationmigrationservice: {
        reconcileBrandRoles: async (): Promise<unknown> => {
          const holder = await readMigrationLease();
          if (holder !== undefined) observed = { owner: holder.owner, fence: holder.fence };
          throw new Error('reconcile-boom');
        },
      },
    };
    try {
      await assert.rejects(() => new BootstrapServices.AuthorizationBootstrapService().bootstrap({}), /reconcile-boom/);
      assert.ok(observed !== undefined, 'reconciliation must run while the shared lease is held');
      assert.match(observed?.owner ?? '', /^bootstrap:/);
      const released = await readMigrationLease();
      assert.equal(released?.owner, observed?.owner);
      assert.equal(released?.fence, observed?.fence);
      assert.ok(
        (released?.expiresAt ?? Number.POSITIVE_INFINITY) <= Date.now(),
        'the bootstrap lease must be released (expired tombstone) after the run'
      );
    } finally {
      sails.services = savedServices;
    }
  });
});

describe('Phase 3 acceptance: takeover between lease validation and mutation cannot leave stale writes', () => {
  let restoreRole: (() => void) | undefined;

  afterEach(() => {
    restoreRole?.();
    restoreRole = undefined;
    __resetMigrationLeaseStateForTests();
  });

  it('rolls back a stale insert when a takeover lands between validation and mutation', async () => {
    const leaseStore: { row: MutableRow | null } = { row: null };
    const checkpointStore = new Map<string, MutableRow>();
    const baseCheckpoint = makeDurableCheckpointDouble(checkpointStore);
    let staleFence = 0;
    const racingCheckpoint = {
      ...baseCheckpoint,
      insertOne: async (doc: unknown): Promise<unknown> => {
        // Deterministic TTL takeover after the pre-write lease validation
        // but before the insert commits.
        leaseStore.row = {
          ...(leaseStore.row as MutableRow),
          owner: 'successor',
          fence: staleFence + 1,
          expiresAt: new Date(Date.now() + MIGRATION_LEASE_TTL_MS),
        };
        return baseCheckpoint.insertOne(doc);
      },
    };
    restoreRole = stubRoleDatastore({
      authorizationmigrationlease: makeDurableLeaseDouble(leaseStore),
      authorizationmigrationcheckpoint: racingCheckpoint,
    });
    const stale = await acquireMigrationLease('stale-writer');
    staleFence = stale.fence;
    try {
      await assert.rejects(
        () =>
          writeMigrationCheckpoint('roles', 'cursor-stale', undefined, {
            lease: { owner: stale.owner, fence: stale.fence },
          }),
        /mismatch|superseded|expired/
      );
      assert.equal(checkpointStore.size, 0, 'the stale insert must be rolled back, not left behind');
      assert.equal(await readMigrationCheckpoint('roles'), undefined);
    } finally {
      await stale.release();
    }
  });

  it('rejects a stale update when a takeover lands between validation and mutation and restores the prior row', async () => {
    const leaseStore: { row: MutableRow | null } = { row: null };
    const checkpointStore = new Map<string, MutableRow>();
    const baseCheckpoint = makeDurableCheckpointDouble(checkpointStore);
    let takeoverArmed = false;
    let staleFence = 0;
    const racingCheckpoint = {
      ...baseCheckpoint,
      updateOne: async (filter: unknown, update: unknown, options?: unknown): Promise<unknown> => {
        if (takeoverArmed) {
          takeoverArmed = false;
          leaseStore.row = {
            ...(leaseStore.row as MutableRow),
            owner: 'successor',
            fence: staleFence + 1,
            expiresAt: new Date(Date.now() + MIGRATION_LEASE_TTL_MS),
          };
        }
        return baseCheckpoint.updateOne(filter, update);
      },
    };
    restoreRole = stubRoleDatastore({
      authorizationmigrationlease: makeDurableLeaseDouble(leaseStore),
      authorizationmigrationcheckpoint: racingCheckpoint,
    });
    const stale = await acquireMigrationLease('stale-writer');
    staleFence = stale.fence;
    try {
      const first = await writeMigrationCheckpoint('roles', 'cursor-a', undefined, {
        lease: { owner: stale.owner, fence: stale.fence },
      });
      assert.equal(first.revision, 1);
      takeoverArmed = true;
      await assert.rejects(
        () =>
          writeMigrationCheckpoint('roles', 'cursor-b', undefined, {
            lease: { owner: stale.owner, fence: stale.fence },
          }),
        /mismatch|superseded|expired/
      );
      const current = await readMigrationCheckpoint('roles');
      assert.equal(current?.lastId, 'cursor-a', 'the stale update must be rolled back to the prior cursor');
      assert.equal(current?.revision, 1);
    } finally {
      await stale.release();
    }
  });

  it('propagates reread failures when distinguishing a generic insert error instead of assuming absent', async () => {
    const leaseStore: { row: MutableRow | null } = { row: null };
    let finds = 0;
    const failingCheckpoint = {
      ...makeDurableCheckpointDouble(new Map<string, MutableRow>()),
      find: () => ({
        limit: () => ({
          toArray: async (): Promise<unknown[]> => {
            finds += 1;
            if (finds > 1) throw new Error('mongo down');
            return [];
          },
        }),
      }),
      insertOne: async (): Promise<unknown> => {
        throw new Error('connection reset');
      },
    };
    restoreRole = stubRoleDatastore({
      authorizationmigrationlease: makeDurableLeaseDouble(leaseStore),
      authorizationmigrationcheckpoint: failingCheckpoint,
    });
    const writer = await acquireMigrationLease('writer');
    try {
      await assert.rejects(
        () =>
          writeMigrationCheckpoint('roles', 'cursor-a', undefined, {
            lease: { owner: writer.owner, fence: writer.fence },
          }),
        /mongo down/
      );
    } finally {
      await writer.release();
    }
  });

  it('never deletes a row created after the read when the initial row is absent', async () => {
    const checkpointStore = new Map<string, MutableRow>();
    // A successor row created after this clearer read the (stale) empty
    // snapshot: the double reports no rows on read while the store holds one.
    checkpointStore.set('20260828T120000-authorization-model-v1:roles', {
      migrationName: '20260828T120000-authorization-model-v1',
      phase: 'roles',
      lastId: 'successor-cursor',
      updatedAt: new Date(0).toISOString(),
      revision: 7,
    });
    let deleteCalls = 0;
    const baseCheckpoint = makeDurableCheckpointDouble(checkpointStore, { forceFindRows: [] });
    const countingCheckpoint = {
      ...baseCheckpoint,
      deleteOne: async (filter: unknown): Promise<unknown> => {
        deleteCalls += 1;
        return baseCheckpoint.deleteOne(filter);
      },
    };
    // No durable lease double: the memory lease below is the holder.
    restoreRole = stubRoleDatastore({ authorizationmigrationcheckpoint: countingCheckpoint });
    const clearer = await acquireMigrationLease('clear-guard');
    try {
      await clearMigrationCheckpoint('roles', { lease: { owner: clearer.owner, fence: clearer.fence } });
      assert.equal(deleteCalls, 0, 'an absent initial row must never issue a durable delete');
      assert.equal(checkpointStore.size, 1, 'the row created after the read must survive');
    } finally {
      await clearer.release();
    }
  });

  it('propagates post-CAS reread failures during clear instead of reporting success', async () => {
    let finds = 0;
    const row = {
      migrationName: '20260828T120000-authorization-model-v1',
      phase: 'roles',
      lastId: 'cursor-a',
      updatedAt: new Date(0).toISOString(),
      revision: 5,
    };
    const failingCheckpoint = {
      ...makeDurableCheckpointDouble(new Map<string, MutableRow>()),
      find: () => ({
        limit: () => ({
          toArray: async (): Promise<unknown[]> => {
            finds += 1;
            if (finds > 1) throw new Error('mongo down');
            return [{ ...row }];
          },
        }),
      }),
      deleteOne: async (): Promise<unknown> => ({ deletedCount: 0 }),
    };
    restoreRole = stubRoleDatastore({ authorizationmigrationcheckpoint: failingCheckpoint });
    const clearer = await acquireMigrationLease('clear-reread');
    try {
      await assert.rejects(
        () => clearMigrationCheckpoint('roles', { lease: { owner: clearer.owner, fence: clearer.fence } }),
        /mongo down/
      );
    } finally {
      await clearer.release();
    }
  });

  it('pins fence and owner on CAS clear so a concurrent advance is never deleted', async () => {
    const checkpointStore = new Map<string, MutableRow>();
    restoreRole = stubRoleDatastore({
      authorizationmigrationcheckpoint: makeDurableCheckpointDouble(checkpointStore),
    });
    const holder = await acquireMigrationLease('cas-clearer');
    const lease = { owner: holder.owner, fence: holder.fence };
    try {
      const written = await writeMigrationCheckpoint('roles', 'cursor-a', undefined, { lease });
      const seenFilters: Array<Record<string, unknown>> = [];
      const baseCheckpoint = makeDurableCheckpointDouble(checkpointStore);
      restoreRole = stubRoleDatastore({
        authorizationmigrationcheckpoint: {
          ...baseCheckpoint,
          deleteOne: async (filter: unknown): Promise<unknown> => {
            seenFilters.push(filter as Record<string, unknown>);
            return baseCheckpoint.deleteOne(filter);
          },
        },
      });
      await clearMigrationCheckpoint('roles', { lease, expectedRevision: written.revision });
      assert.equal(seenFilters.length, 1);
      assert.equal(seenFilters[0]?.revision, written.revision);
      assert.equal(seenFilters[0]?.fence, written.fence);
      assert.equal(seenFilters[0]?.owner, written.owner);
      assert.equal(await readMigrationCheckpoint('roles'), undefined);
    } finally {
      await holder.release();
    }
  });
});

describe('Phase 3 acceptance: migration log writes are fenced before and after the mutation', () => {
  const hadSails = Object.prototype.hasOwnProperty.call(globalThis, 'sails');
  const savedSails: unknown = Reflect.get(globalThis, 'sails');
  const realNow = Date.now;
  let nowMs = realNow();

  beforeEach(() => {
    __resetMigrationLeaseStateForTests();
    nowMs = realNow();
    Date.now = () => nowMs;
  });

  afterEach(() => {
    Date.now = realNow;
    __resetMigrationLeaseStateForTests();
    if (hadSails) Reflect.set(globalThis, 'sails', savedSails);
    else Reflect.deleteProperty(globalThis, 'sails');
  });

  it('removes the applied-marker and rejects when a takeover lands between the gate and the insert', async () => {
    const created: Array<Record<string, unknown>> = [];
    const destroyed: Array<unknown> = [];
    Reflect.set(globalThis, 'sails', {
      models: {
        migration: {
          find: () => ({ sort: async () => [] }),
          create: async (values: unknown): Promise<unknown> => {
            // Deterministic takeover after the pre-write gate but before the
            // insert is fenced: the TTL lapses and a successor takes over.
            nowMs += MIGRATION_LEASE_TTL_MS + 1;
            await acquireMigrationLease('takeover-owner');
            const row = { id: 'migration-row-1', ...(values as Record<string, unknown>) };
            created.push(row);
            return row;
          },
          destroy: async (criteria: unknown): Promise<unknown> => {
            destroyed.push(criteria);
            return [];
          },
        },
      },
      log: { verbose: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    });
    const ran: string[] = [];
    let caught: unknown;
    try {
      await runPendingMigrations([
        {
          name: '2026.06.08T09.00.00-first',
          up: async () => {
            ran.push('first');
          },
        },
        {
          name: '2026.06.08T10.00.00-second',
          up: async () => {
            ran.push('second');
          },
        },
      ]);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught !== undefined, 'the runner must reject after losing the lease mid-insert');
    assert.match(String(caught), /rejected|superseded|mismatch|expired/);
    assert.deepEqual(ran, ['first'], 'later migrations must not run after the lease is lost');
    assert.deepEqual(destroyed, [{ id: 'migration-row-1' }], 'the stale applied-marker must be compensated');
  });
});

describe('Phase 3 acceptance: bootstrap validates the lease around catalog work and refuses success past it', () => {
  const realNow = Date.now;
  let nowMs = realNow();
  const savedServices = (): unknown => sails.services;

  beforeEach(() => {
    __resetMigrationLeaseStateForTests();
    nowMs = realNow();
    Date.now = () => nowMs;
  });

  afterEach(() => {
    Date.now = realNow;
    __resetMigrationLeaseStateForTests();
    for (const name of ['Role', 'RoleTemplate', 'BrandingConfig'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, `__saved_${name}`);
      if (descriptor !== undefined) {
        Object.defineProperty(globalThis, name, descriptor);
        Reflect.deleteProperty(globalThis, `__saved_${name}`);
      }
    }
  });

  function saveGlobal(name: string, value: unknown): void {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    if (descriptor !== undefined) Reflect.set(globalThis, `__saved_${name}`, descriptor);
    Reflect.set(globalThis, name, value);
  }

  function stubBootstrapWorld(hooks: {
    onScopeBootstrap?: () => void;
    onReconcile?: () => Promise<unknown>;
    onDrift?: () => Promise<unknown>;
    auditEvents: Array<unknown>;
  }): { savedServices: unknown; savedReadiness: unknown } {
    const previousServices: unknown = savedServices();
    saveGlobal('Role', {
      getDatastore: () => ({ transaction: async (work: (connection: unknown) => Promise<unknown>) => work({}) }),
      find: () => ({
        sort: () => ({ usingConnection: () => ({ limit: async () => [] }) }),
      }),
      create: () => ({
        fetch: () => ({
          usingConnection: async () => ({ id: 'role-sys-1', name: 'system-admin', key: 'system-admin' }),
        }),
      }),
    });
    saveGlobal('RoleTemplate', {
      findOne: async () => ({ id: 'tmpl-1', key: 'system-admin' }),
    });
    saveGlobal('BrandingConfig', {
      find: () => ({ sort: () => ({ limit: async () => [] }) }),
    });
    sails.services = {
      ...(previousServices as Record<string, unknown>),
      authorizationscopeservice: {
        bootstrap: async () => {
          hooks.onScopeBootstrap?.();
        },
      },
      authorizationmigrationservice: {
        reconcileBrandRoles: async (): Promise<unknown> => {
          if (hooks.onReconcile !== undefined) return hooks.onReconcile();
          return { issues: [], metrics: { conflictsResolved: 0, transactionFailures: 0 } };
        },
        migrateUserAssignments: async (): Promise<unknown> => ({
          issues: [],
          metrics: { batchesApplied: 0, conflictsResolved: 0, transactionFailures: 0 },
        }),
        reportDrift: async (): Promise<unknown> => {
          if (hooks.onDrift !== undefined) return hooks.onDrift();
          return {
            generatedAt: new Date(nowMs).toISOString(),
            issues: [],
            truncated: false,
            summary: { blocker: 0, warning: 0, expected: 0 },
          };
        },
      },
      authorizationauditservice: {
        createSucceededEvent: async (event: unknown): Promise<unknown> => {
          hooks.auditEvents.push(event);
          return event;
        },
      },
    };
    const savedReadiness: unknown = Reflect.get(sails.config, 'authorizationReadiness');
    Reflect.deleteProperty(sails.config, 'authorizationReadiness');
    return { savedServices: previousServices, savedReadiness };
  }

  function restoreBootstrapWorld(saved: { savedServices: unknown; savedReadiness: unknown }): void {
    sails.services = saved.savedServices as typeof sails.services;
    if (saved.savedReadiness === undefined) Reflect.deleteProperty(sails.config, 'authorizationReadiness');
    else Reflect.set(sails.config, 'authorizationReadiness', saved.savedReadiness);
  }

  it('never runs catalog reconciliation without a validated lease', async () => {
    const auditEvents: Array<unknown> = [];
    let scopeBootstraps = 0;
    const saved = stubBootstrapWorld({ auditEvents, onScopeBootstrap: () => (scopeBootstraps += 1) });
    const holder = await acquireMigrationLease('other-lift');
    try {
      await assert.rejects(
        () => new BootstrapServices.AuthorizationBootstrapService().bootstrap({}),
        /already running/
      );
      assert.equal(scopeBootstraps, 0, 'scope bootstrap must not run while another lift holds the lease');
      assert.equal(Reflect.get(sails.config, 'authorizationReadiness'), undefined);
    } finally {
      await holder.release();
      restoreBootstrapWorld(saved);
    }
  });

  it('rejects instead of publishing readiness when the lease lapses during drift', async () => {
    const auditEvents: Array<unknown> = [];
    let reconcileOwner: string | undefined;
    const saved = stubBootstrapWorld({
      auditEvents,
      onReconcile: async () => {
        const holder = await readMigrationLease();
        reconcileOwner = holder?.owner;
        return { issues: [], metrics: { conflictsResolved: 0, transactionFailures: 0 } };
      },
      onDrift: async () => {
        // Deterministic renewal failure: the TTL lapses while drift scans,
        // so the post-drift and pre-publication latch checks must reject.
        nowMs += MIGRATION_LEASE_TTL_MS + 1;
        return {
          generatedAt: new Date(nowMs).toISOString(),
          issues: [],
          truncated: false,
          summary: { blocker: 0, warning: 0, expected: 0 },
        };
      },
    });
    try {
      await assert.rejects(
        () => new BootstrapServices.AuthorizationBootstrapService().bootstrap({}),
        /renewal already failed|expired|superseded|mismatch/
      );
      assert.match(reconcileOwner ?? '', /^bootstrap:/, 'reconciliation must have run under the bootstrap lease');
      assert.equal(
        auditEvents.filter(
          event =>
            typeof event === 'object' &&
            event !== null &&
            Reflect.get(event, 'eventType') === 'authorization.bootstrap.invariants-checked'
        ).length,
        0,
        'no bootstrap success audit may be recorded past a lost lease'
      );
      assert.equal(
        Reflect.get(sails.config, 'authorizationReadiness'),
        undefined,
        'readiness must not be published after the lease is lost'
      );
    } finally {
      restoreBootstrapWorld(saved);
    }
  });
});
