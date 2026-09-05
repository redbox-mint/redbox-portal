import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';

import {
  MIGRATION_LEASE_TTL_MS,
  __resetMigrationLeaseStateForTests,
  acquireMigrationLease,
  clearMigrationCheckpoint,
  readMigrationCheckpoint,
  writeMigrationCheckpoint,
} from '../../src/services/AuthorizationMigrationService';
import { Services as BootstrapServices } from '../../src/services/AuthorizationBootstrapService';
import { coreBootstrap } from '../../src/bootstrap';
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
    updateOne: async (filter: unknown, update: unknown, _leaseOptions?: unknown): Promise<unknown> => {
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
  options: { forceFindRows?: MutableRow[]; onDeleteOne?: (filter: unknown) => Promise<unknown> } = {}
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
    updateOne: async (filter: unknown, update: unknown, _checkpointOptions?: unknown): Promise<unknown> => {
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
      if (options.onDeleteOne !== undefined) return options.onDeleteOne(filter);
      const criteria = filter as Record<string, unknown>;
      const entry = [...store.entries()].find(([, row]) => matches(row, criteria));
      if (entry === undefined) return { deletedCount: 0 };
      store.delete(entry[0]);
      return { deletedCount: 1 };
    },
  };
}

interface CheckpointFixture {
  leaseStore: { row: MutableRow | null };
  checkpointStore: Map<string, MutableRow>;
  checkpointDouble: ReturnType<typeof makeDurableCheckpointDouble>;
  leaseDouble: ReturnType<typeof makeDurableLeaseDouble>;
  restoreRole: () => void;
  transactions: number;
}

/**
 * Transaction-capable Role datastore double: `transaction` runs the mutation
 * closure (proving the required-transaction path is taken) and the session
 * connection exposes the same durable doubles as session-bound collections,
 * so lease predicates and checkpoint mutations share one atomic boundary.
 */
function stubTransactionalRoleDatastore(
  leaseDouble: ReturnType<typeof makeDurableLeaseDouble>,
  checkpointDouble: ReturnType<typeof makeDurableCheckpointDouble>,
  onTransaction: () => void
): () => void {
  const sessionConnection = {
    collection: (name: string): unknown => {
      if (name === 'authorizationmigrationlease') return leaseDouble;
      if (name === 'authorizationmigrationcheckpoint') return checkpointDouble;
      throw new Error(`unexpected collection '${name}'`);
    },
  };
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Role');
  Reflect.set(globalThis, 'Role', {
    getDatastore: () => ({
      transaction: async (work: (connection: unknown) => Promise<unknown>): Promise<unknown> => {
        onTransaction();
        return work(sessionConnection);
      },
      manager: {
        collection: (name: string): unknown => {
          if (name === 'authorizationmigrationlease') return leaseDouble;
          if (name === 'authorizationmigrationcheckpoint') return checkpointDouble;
          throw new Error(`unexpected collection '${name}'`);
        },
      },
    }),
  });
  return () => {
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, 'Role');
    else Object.defineProperty(globalThis, 'Role', descriptor);
  };
}

function installCheckpointFixture(): CheckpointFixture {
  const leaseStore: { row: MutableRow | null } = { row: null };
  const checkpointStore = new Map<string, MutableRow>();
  const leaseDouble = makeDurableLeaseDouble(leaseStore);
  const checkpointDouble = makeDurableCheckpointDouble(checkpointStore);
  let transactions = 0;
  const restoreRole = stubTransactionalRoleDatastore(leaseDouble, checkpointDouble, () => (transactions += 1));
  return {
    leaseStore,
    checkpointStore,
    checkpointDouble,
    leaseDouble,
    restoreRole,
    get transactions() {
      return transactions;
    },
  };
}

describe('Phase 3 atomic fencing: checkpoint mutations share one required transaction with the lease predicate', () => {
  let fixture: CheckpointFixture | undefined;

  beforeEach(() => {
    __resetMigrationLeaseStateForTests();
  });

  afterEach(() => {
    fixture?.restoreRole();
    fixture = undefined;
    __resetMigrationLeaseStateForTests();
  });

  it('commits the lease predicate and the checkpoint insert in one transaction', async () => {
    fixture = installCheckpointFixture();
    const holder = await acquireMigrationLease('tx-writer');
    try {
      const lease = { owner: holder.owner, fence: holder.fence };
      const written = await writeMigrationCheckpoint('roles', 'cursor-a', undefined, { lease });
      assert.equal(written.lastId, 'cursor-a');
      assert.equal(written.owner, holder.owner);
      assert.equal(written.fence, holder.fence);
      assert.ok((fixture?.transactions ?? 0) > 0, 'the durable write must run inside a required transaction');
      assert.equal((await readMigrationCheckpoint('roles'))?.lastId, 'cursor-a');
      await clearMigrationCheckpoint('roles', { lease });
      assert.equal(await readMigrationCheckpoint('roles'), undefined);
    } finally {
      await holder.release();
    }
  });

  it('refreshes the lease expiry with a conditional owner+fence write fence in the same session', async () => {
    fixture = installCheckpointFixture();
    const holder = await acquireMigrationLease('fence-writer');
    try {
      const before = (fixture?.leaseStore.row?.expiresAt as Date | undefined)?.getTime?.() ?? NaN;
      const lease = { owner: holder.owner, fence: holder.fence };
      await writeMigrationCheckpoint('roles', 'cursor-fence', undefined, { lease });
      const after = (fixture?.leaseStore.row?.expiresAt as Date | undefined)?.getTime?.() ?? NaN;
      assert.ok(after >= before, `the in-session lease write fence must refresh expiry (${before} -> ${after})`);
      assert.equal(fixture?.leaseStore.row?.owner, holder.owner);
      assert.equal(fixture?.leaseStore.row?.fence, holder.fence);
      await clearMigrationCheckpoint('roles', { lease });
    } finally {
      await holder.release();
    }
  });

  it('rejects a foreign owner+fence inside the transaction without writing', async () => {
    fixture = installCheckpointFixture();
    const holder = await acquireMigrationLease('owner-a');
    try {
      await assert.rejects(
        () => writeMigrationCheckpoint('roles', 'cursor-a', undefined, { lease: { owner: 'intruder', fence: 999 } }),
        /mismatch/
      );
      assert.equal(fixture?.checkpointStore.size ?? -1, 0);
    } finally {
      await holder.release();
    }
  });

  it('rolls back a stale insert when a takeover lands between validation and mutation', async () => {
    fixture = installCheckpointFixture();
    const stale = await acquireMigrationLease('stale-writer');
    const staleFence = stale.fence;
    const baseInsert = fixture.checkpointDouble.insertOne.bind(fixture.checkpointDouble);
    let takeovers = 0;
    fixture.checkpointDouble.insertOne = async (doc: unknown): Promise<unknown> => {
      takeovers += 1;
      fixture?.leaseStore !== null &&
        ((fixture as CheckpointFixture).leaseStore.row = {
          ...((fixture as CheckpointFixture).leaseStore.row as MutableRow),
          owner: 'successor',
          fence: staleFence + 1,
          expiresAt: new Date(Date.now() + MIGRATION_LEASE_TTL_MS),
        });
      return baseInsert(doc);
    };
    try {
      await assert.rejects(
        () =>
          writeMigrationCheckpoint('roles', 'cursor-stale', undefined, {
            lease: { owner: stale.owner, fence: staleFence },
          }),
        /mismatch|superseded|expired/
      );
      assert.equal(takeovers, 1);
      assert.equal(fixture?.checkpointStore.size ?? -1, 0, 'the stale insert must be rolled back, not left behind');
      assert.equal(await readMigrationCheckpoint('roles'), undefined);
    } finally {
      await stale.release();
    }
  });

  it('propagates compensation failure instead of swallowing it', async () => {
    fixture = installCheckpointFixture();
    const stale = await acquireMigrationLease('stale-writer');
    const staleFence = stale.fence;
    const baseInsert = fixture.checkpointDouble.insertOne.bind(fixture.checkpointDouble);
    fixture.checkpointDouble.insertOne = async (doc: unknown): Promise<unknown> => {
      fixture?.leaseStore !== null &&
        ((fixture as CheckpointFixture).leaseStore.row = {
          ...((fixture as CheckpointFixture).leaseStore.row as MutableRow),
          owner: 'successor',
          fence: staleFence + 1,
          expiresAt: new Date(Date.now() + MIGRATION_LEASE_TTL_MS),
        });
      return baseInsert(doc);
    };
    const baseDelete = fixture.checkpointDouble.deleteOne.bind(fixture.checkpointDouble);
    fixture.checkpointDouble.deleteOne = async (): Promise<unknown> => {
      await baseDelete({});
      throw new Error('compensation store down');
    };
    try {
      await assert.rejects(
        () =>
          writeMigrationCheckpoint('roles', 'cursor-stale', undefined, {
            lease: { owner: stale.owner, fence: staleFence },
          }),
        /compensation/
      );
    } finally {
      await stale.release();
    }
  });

  it('restores the prior row when a takeover lands between CAS and the post-write fence', async () => {
    fixture = installCheckpointFixture();
    const stale = await acquireMigrationLease('stale-writer');
    const staleFence = stale.fence;
    const lease = { owner: stale.owner, fence: staleFence };
    try {
      const first = await writeMigrationCheckpoint('roles', 'cursor-a', undefined, { lease });
      assert.equal(first.revision, 1);
      const baseUpdate = fixture.checkpointDouble.updateOne.bind(fixture.checkpointDouble);
      let armed = true;
      fixture.checkpointDouble.updateOne = async (
        filter: unknown,
        update: unknown,
        options?: unknown
      ): Promise<unknown> => {
        const result = await baseUpdate(filter, update, options);
        if (armed) {
          armed = false;
          (fixture as CheckpointFixture).leaseStore.row = {
            ...((fixture as CheckpointFixture).leaseStore.row as MutableRow),
            owner: 'successor',
            fence: staleFence + 1,
            expiresAt: new Date(Date.now() + MIGRATION_LEASE_TTL_MS),
          };
        }
        return result;
      };
      await assert.rejects(
        () => writeMigrationCheckpoint('roles', 'cursor-b', undefined, { lease }),
        /mismatch|superseded|expired/
      );
      const current = await readMigrationCheckpoint('roles');
      assert.equal(current?.lastId, 'cursor-a', 'the stale update must be rolled back to the prior cursor');
      assert.equal(current?.revision, 1);
    } finally {
      await stale.release();
    }
  });

  it('pins fence and owner on CAS clear inside the transaction', async () => {
    fixture = installCheckpointFixture();
    const holder = await acquireMigrationLease('cas-clearer');
    const lease = { owner: holder.owner, fence: holder.fence };
    try {
      const written = await writeMigrationCheckpoint('roles', 'cursor-a', undefined, { lease });
      const seenFilters: Array<Record<string, unknown>> = [];
      const baseDelete = fixture.checkpointDouble.deleteOne.bind(fixture.checkpointDouble);
      fixture.checkpointDouble.deleteOne = async (filter: unknown): Promise<unknown> => {
        seenFilters.push(filter as Record<string, unknown>);
        return baseDelete(filter);
      };
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

describe('Phase 3 atomic fencing: applied-migration markers are transactionally lease-fenced', () => {
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

  function installMarkerWorld(hooks: {
    onCreate?: (values: Record<string, unknown>) => Promise<unknown> | unknown;
    onDestroy?: (criteria: unknown) => Promise<unknown> | unknown;
    withTransaction?: boolean;
  }): { created: Array<Record<string, unknown>>; destroyed: Array<unknown> } {
    const created: Array<Record<string, unknown>> = [];
    const destroyed: Array<unknown> = [];
    const defaultCreate = async (values: unknown): Promise<unknown> => {
      const row = { id: `migration-row-${created.length + 1}`, ...(values as Record<string, unknown>) };
      created.push(row);
      return row;
    };
    Reflect.set(globalThis, 'sails', {
      models: {
        migration: {
          find: () => ({ sort: async () => [] }),
          create: (values: unknown): Promise<unknown> =>
            Promise.resolve(hooks.onCreate?.(values as Record<string, unknown>) ?? defaultCreate(values)),
          destroy: (criteria: unknown): Promise<unknown> => {
            destroyed.push(criteria);
            return Promise.resolve(hooks.onDestroy?.(criteria) ?? []);
          },
          ...(hooks.withTransaction === true
            ? { getDatastore: () => ({ transaction: async (work: (c: unknown) => Promise<unknown>) => work({}) }) }
            : {}),
        },
      },
      log: { verbose: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    });
    return { created, destroyed };
  }

  it('runs marker writes inside a required transaction when the datastore supports it', async () => {
    const { created } = installMarkerWorld({ withTransaction: true });
    const ran: string[] = [];
    await runPendingMigrations([
      {
        name: '2026.06.08T09.00.00-first',
        up: async () => {
          ran.push('first');
        },
      },
    ]);
    assert.deepEqual(ran, ['first']);
    assert.deepEqual(
      created.map(row => row.name),
      ['2026.06.08T09.00.00-first']
    );
  });

  it('removes the applied-marker and rejects when a takeover lands between the gate and the insert', async () => {
    const { created, destroyed } = installMarkerWorld({
      onCreate: async values => {
        nowMs += MIGRATION_LEASE_TTL_MS + 1;
        await acquireMigrationLease('takeover-owner');
        const row = { id: 'migration-row-1', ...(values as Record<string, unknown>) };
        created.push(row);
        return row;
      },
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
    void created;
  });

  it('propagates marker compensation failure instead of swallowing it', async () => {
    installMarkerWorld({
      onCreate: async values => {
        nowMs += MIGRATION_LEASE_TTL_MS + 1;
        await acquireMigrationLease('takeover-owner');
        return { id: 'migration-row-1', ...(values as Record<string, unknown>) };
      },
      onDestroy: async () => {
        throw new Error('marker compensation store down');
      },
    });
    let caught: unknown;
    try {
      await runPendingMigrations([
        {
          name: '2026.06.08T09.00.00-first',
          up: async () => {},
        },
      ]);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught !== undefined, 'the runner must reject when compensation fails');
    assert.match(String(caught), /compensation/);
  });
});

describe('Phase 3 atomic fencing: bootstrap never publishes readiness past a lease lost during the success audit', () => {
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
    for (const name of ['Role', 'RoleTemplate', 'BrandingConfig', 'AuthorizationAudit'] as const) {
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
    auditEvents: Array<unknown>;
    onAudit?: (event: unknown) => Promise<unknown> | unknown;
  }): { savedServices: unknown; savedReadiness: unknown } {
    const previousServices: unknown = sails.services;
    const txDatastore = {
      transaction: async (work: (connection: unknown) => Promise<unknown>): Promise<unknown> => work({}),
    };
    const systemRow = {
      id: 'role-sys',
      name: 'system-admin',
      key: 'system-admin',
      identityKey: 'system:system-admin',
      displayName: 'System administrators',
      contextType: 'system',
      branding: null,
      template: 'tmpl-x',
      templateRevision: 1,
      protectedKind: 'system-admin',
      status: 'active',
      version: 3,
    };
    saveGlobal('Role', {
      getDatastore: () => txDatastore,
      find: () => ({ sort: () => ({ usingConnection: () => ({ limit: async () => [{ ...systemRow }] }) }) }),
      create: () => {
        throw new Error('Role.create must not be called for the canonical system role');
      },
      updateOne: () => {
        throw new Error('Role.updateOne must not be called for the canonical system role');
      },
    });
    saveGlobal('RoleTemplate', { findOne: async () => ({ id: 'tmpl-x', key: 'system-admin' }) });
    saveGlobal('BrandingConfig', { find: () => ({ sort: () => ({ limit: async () => [] }) }) });
    saveGlobal('AuthorizationAudit', { getDatastore: () => txDatastore });
    sails.services = {
      ...(previousServices as Record<string, unknown>),
      authorizationscopeservice: { bootstrap: async () => undefined },
      authorizationmigrationservice: {
        reconcileBrandRoles: async (): Promise<unknown> => ({
          issues: [],
          metrics: { conflictsResolved: 0, transactionFailures: 0 },
        }),
        migrateUserAssignments: async (): Promise<unknown> => ({}),
        reportDrift: async (): Promise<unknown> => ({
          generatedAt: new Date(nowMs).toISOString(),
          issues: [],
          truncated: false,
          summary: { blocker: 0, warning: 0, expected: 0 },
        }),
      },
      authorizationauditservice: {
        createSucceededEvent: async (event: unknown): Promise<unknown> => {
          if (hooks.onAudit !== undefined) await hooks.onAudit(event);
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

  it('rejects without publishing readiness when the lease lapses inside the success-audit transaction', async () => {
    const auditEvents: Array<unknown> = [];
    const saved = stubBootstrapWorld({
      auditEvents,
      onAudit: async () => {
        // Deterministic lease loss after the in-transaction audit gate but
        // before the commit finishes: the TTL lapses while the success audit
        // is being recorded, so the final pre-publication latch must reject.
        nowMs += MIGRATION_LEASE_TTL_MS + 1;
      },
    });
    try {
      await assert.rejects(
        () => new BootstrapServices.AuthorizationBootstrapService().bootstrap({}),
        /renewal already failed|expired|superseded|mismatch/
      );
      assert.equal(
        Reflect.get(sails.config, 'authorizationReadiness'),
        undefined,
        'readiness must not be published after the lease is lost during the success audit'
      );
    } finally {
      restoreBootstrapWorld(saved);
    }
  });

  it('publishes readiness when the lease is held across the success audit', async () => {
    const auditEvents: Array<unknown> = [];
    const saved = stubBootstrapWorld({ auditEvents });
    try {
      const result = await new BootstrapServices.AuthorizationBootstrapService().bootstrap({});
      assert.equal(Reflect.get(sails.config, 'authorizationReadiness'), result);
      assert.ok(
        auditEvents.some(
          event =>
            typeof event === 'object' &&
            event !== null &&
            Reflect.get(event, 'eventType') === 'authorization.bootstrap.invariants-checked'
        ),
        'the success audit must be recorded when the lease is held'
      );
    } finally {
      restoreBootstrapWorld(saved);
    }
  });
});

describe('Phase 3 atomic fencing: coreBootstrap reconciles the catalog only under the shared lease', () => {
  it('never runs unleased scope reconciliation and keeps UsersService before protected bootstrap', async () => {
    const order: string[] = [];
    const immediate = async (): Promise<void> => undefined;
    const savedSails: unknown = Reflect.get(globalThis, 'sails');
    const savedUnderscore: unknown = Reflect.get(globalThis, '_');
    const savedAppConfig: unknown = Reflect.get(globalThis, 'AppConfigService');
    const { of } = await import('rxjs');
    Reflect.set(globalThis, '_', (await import('lodash')).default);
    Reflect.set(globalThis, 'AppConfigService', { getAppConfigurationForBrand: () => undefined });
    Reflect.set(globalThis, 'sails', {
      config: { crontab: { enabled: false } },
      log: { verbose: () => {}, debug: () => {}, info: () => {}, error: () => {} },
      services: {
        brandingservice: { bootstrap: () => of({ id: 'default' }), getDefault: () => ({ id: 'default' }) },
        authorizationscopeservice: {
          bootstrap: async (): Promise<void> => {
            order.push('scope-bootstrap');
          },
        },
        rolesservice: { bootstrap: () => of([]), getRolesWithBrand: () => of([]) },
        reportsservice: { bootstrapData: immediate },
        namedqueryservice: { bootstrapData: immediate },
        usersservice: {
          bootstrap: () => {
            order.push('usersservice');
            return of({ defUser: {}, defRoles: [] });
          },
        },
        authorizationbootstrapservice: {
          bootstrap: async (): Promise<void> => {
            order.push('authorizationbootstrapservice');
          },
        },
        pathrulesservice: { bootstrap: () => of(undefined) },
        recordtypesservice: { bootstrap: async () => [] },
        dashboardtypesservice: { bootstrap: immediate },
        workflowstepsservice: { bootstrap: async () => [] },
        formsservice: { bootstrap: immediate },
        recordsservice: {
          auditRecordValidationRollout: immediate,
          bootstrapData: immediate,
          checkRedboxRunning: async () => true,
        },
        vocabularyservice: { bootstrapData: immediate },
        i18nentriesservice: { bootstrap: immediate },
        translationservice: { bootstrap: immediate },
        appconfigservice: { bootstrap: immediate },
        figsharevocabularyservice: { bootstrapData: immediate },
        agendaqueueservice: { init: immediate },
        workspacetypesservice: { bootstrap: () => of(undefined) },
        cacheservice: { bootstrap: immediate },
        recordschemaservice: { bootstrap: immediate },
      },
    });
    try {
      await coreBootstrap();
      assert.ok(!order.includes('scope-bootstrap'), 'coreBootstrap must not reconcile the catalog unleased');
      assert.deepEqual(
        order,
        ['usersservice', 'authorizationbootstrapservice'],
        'UsersService.bootstrap must still precede the protected authorization bootstrap'
      );
    } finally {
      Reflect.set(globalThis, 'sails', savedSails);
      if (savedUnderscore === undefined) Reflect.deleteProperty(globalThis, '_');
      else Reflect.set(globalThis, '_', savedUnderscore);
      if (savedAppConfig === undefined) Reflect.deleteProperty(globalThis, 'AppConfigService');
      else Reflect.set(globalThis, 'AppConfigService', savedAppConfig);
    }
  });
});
