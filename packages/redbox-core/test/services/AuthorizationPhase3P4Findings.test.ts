import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';

import {
  MIGRATION_LEASE_TTL_MS,
  Services as MigrationServices,
  __resetMigrationLeaseStateForTests,
  acquireMigrationLease,
  clearMigrationCheckpoint,
  readMigrationLease,
  readMigrationCheckpoint,
  renewMigrationLease,
  writeMigrationCheckpoint,
} from '../../src/services/AuthorizationMigrationService';
import { Services as BootstrapServices } from '../../src/services/AuthorizationBootstrapService';
import { DEFAULT_ROLE_TEMPLATES } from '../../src/authorization';

const connection = Object.freeze({ lease: 'p4-findings' });

function txDatastore(extra: Record<string, unknown> = {}): Sails.Datastore {
  return {
    transaction: async (work: (leased: Sails.Connection) => Promise<unknown>) => work(connection),
    ...extra,
  } as unknown as Sails.Datastore;
}

function installHealthyTemplateGlobals(): void {
  Reflect.set(globalThis, 'RoleTemplate', {
    findOne: async (criteria: Record<string, unknown>) => {
      const definition = DEFAULT_ROLE_TEMPLATES.find(
        candidate =>
          String(candidate.key) === String(criteria.key) || `tmpl-${String(candidate.key)}` === String(criteria.id)
      );
      if (definition === undefined) return undefined;
      return {
        id: `tmpl-${String(definition.key)}`,
        key: String(definition.key),
        status: 'active',
        protectedKind: definition.protectedKind,
        currentRevision: definition.revision,
      };
    },
  });
  Reflect.set(globalThis, 'RoleTemplateRevision', {
    findOne: async (criteria: Record<string, unknown>) => {
      const definition = DEFAULT_ROLE_TEMPLATES.find(
        candidate => `tmpl-${String(candidate.key)}` === String(criteria.template)
      );
      if (definition === undefined || criteria.revision !== definition.revision) return undefined;
      return { template: criteria.template, revision: criteria.revision, scopeKeys: [...definition.scopeKeys] };
    },
  });
}

const guestRow = {
  id: 'guest-1',
  name: 'Guest',
  key: 'Guest',
  identityKey: 'brand:brand-1:Guest',
  displayName: 'Guest',
  contextType: 'brand',
  branding: 'brand-1',
  template: 'tmpl-guest',
  templateRevision: 1,
  protectedKind: 'guest',
  status: 'active',
  version: 3,
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
  version: 2,
};

function canonicalAssignment(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    principalType: 'user',
    principalId: 'user-1',
    role: 'role-sys',
    source: 'recovery',
    sourceKey: 'bootstrap-parent-administrator',
    status: 'active',
    sourcePresent: true,
    expiresAt: null,
    branding: null,
    version: 1,
    assignedBy: 'bootstrap:authorization-invariants',
    assignedAt: '2026-08-31T00:00:00.000Z',
    ...overrides,
  };
}

interface BootstrapHarness {
  limitCalls: number[];
  created: unknown[];
  audits: unknown[];
  restore: () => void;
}

function installBootstrapHarness(
  assignmentRows: (criteria: Record<string, unknown>) => unknown,
  overrides: { overrides?: unknown[]; destroyed?: unknown[] } = {}
): BootstrapHarness {
  const names = [
    'BrandingConfig',
    'Role',
    'RoleTemplate',
    'RoleScopeOverride',
    'RoleAssignment',
    'User',
    'AuthorizationAudit',
  ] as const;
  const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
  const savedServices = sails.services;
  const savedModels = sails.models;
  const savedReadiness = (sails.config as Record<string, unknown>).authorizationReadiness;
  const limitCalls: number[] = [];
  const created: unknown[] = [];
  const audits: unknown[] = [];
  const destroyed: unknown[] = overrides.destroyed ?? [];
  const overrideRows: unknown[] = overrides.overrides ?? [];
  sails.models = {} as typeof sails.models;
  sails.services = {
    ...sails.services,
    authorizationscopeservice: {
      bootstrap: async () => ({}),
      getRegistry: () => ({ isActive: () => true }),
    },
    authorizationmigrationservice: {
      reconcileBrandRoles: async () => ({ issues: [], metrics: { conflictsResolved: 0, transactionFailures: 0 } }),
      migrateUserAssignments: async () => ({}),
      reportDrift: async () => ({
        generatedAt: new Date(0).toISOString(),
        issues: [],
        truncated: false,
        summary: { blocker: 0, warning: 0, expected: 0 },
      }),
    },
    authorizationauditservice: {
      createSucceededEvent: async (event: unknown) => {
        audits.push(event);
        return { id: `audit-${audits.length}` };
      },
    },
    authorizationpersistenceservice: {
      createRoleAssignment: async (input: unknown) => {
        created.push(input);
        return { id: 'assignment-new', ...(input as object) };
      },
    },
  };
  Reflect.set(globalThis, 'BrandingConfig', {
    find: () => ({ sort: () => ({ limit: () => Promise.resolve([{ id: 'brand-1' }]) }) }),
  });
  Reflect.set(globalThis, 'RoleTemplate', { findOne: async () => ({ id: 'tmpl-x' }) });
  Reflect.set(globalThis, 'Role', {
    find: (criteria: Record<string, unknown>) => ({
      sort: () => ({
        usingConnection: () => ({
          limit: (n: number) => {
            const isGuest =
              (criteria as { branding?: unknown }).branding !== undefined || 'branding' in (criteria as object);
            const rows = isGuest ? [{ ...guestRow }] : [{ ...systemRow }];
            return Promise.resolve(rows.slice(0, n));
          },
        }),
      }),
    }),
    updateOne: (criteria: Record<string, unknown>) => ({
      set: (values: Record<string, unknown>) => ({
        meta: () => ({
          usingConnection: async () => ({
            ...(String(criteria.id) === 'role-sys' ? systemRow : guestRow),
            ...values,
            id: String(criteria.id),
          }),
        }),
      }),
    }),
    getDatastore: () => txDatastore(),
  });
  Reflect.set(globalThis, 'RoleScopeOverride', {
    find: (criteria: Record<string, unknown>) => ({
      sort: () => ({
        usingConnection: () => ({
          limit: (n: number) => {
            const cursor = (criteria as { id?: { '>': string } }).id?.['>'];
            const filtered =
              cursor === undefined
                ? [...overrideRows]
                : (overrideRows as { id: string }[]).filter(o => o.id > String(cursor));
            return Promise.resolve(filtered.slice(0, n));
          },
        }),
      }),
    }),
    destroy: (criteria: unknown) => {
      destroyed.push(criteria);
      return { usingConnection: async () => [] };
    },
  });
  Reflect.set(globalThis, 'RoleAssignment', {
    find: (criteria: Record<string, unknown>) => ({
      sort: () => ({
        usingConnection: () => ({
          limit: (n: number) => {
            limitCalls.push(n);
            return Promise.resolve(assignmentRows(criteria));
          },
        }),
      }),
    }),
    findOne: () => ({ usingConnection: async () => undefined }),
    getDatastore: () => txDatastore(),
  });
  const canonicalUser = { id: 'user-1', loginDisabled: false };
  Reflect.set(globalThis, 'User', {
    findOne: (criteria: Record<string, unknown>) => ({
      usingConnection: async () => ({ ...canonicalUser, id: String(criteria.id ?? 'user-1') }),
      then: (onfulfilled?: (value: unknown) => unknown) =>
        Promise.resolve({ ...canonicalUser }).then(onfulfilled as never),
    }),
    getDatastore: () => txDatastore(),
  });
  Reflect.set(globalThis, 'AuthorizationAudit', { getDatastore: () => txDatastore() });
  return {
    limitCalls,
    created,
    audits,
    restore: () => {
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
      sails.services = savedServices;
      sails.models = savedModels;
      (sails.config as Record<string, unknown>).authorizationReadiness = savedReadiness;
    },
  };
}

describe('Phase 3 acceptance P4: protected bootstrap scan is bounded and fail-closed', () => {
  it('paginates past 500 hidden rows and accepts the canonical row without creating', async () => {
    const rows = [
      ...Array.from({ length: 599 }, (_, i) =>
        canonicalAssignment(`a-${String(i).padStart(4, '0')}`, {
          principalId: 'user-other',
          status: 'revoked',
        })
      ),
      canonicalAssignment('a-9999'),
    ];
    const harness = installBootstrapHarness(criteria => {
      const cursor = (criteria as { id?: { '>': string } }).id?.['>'];
      const visible = cursor === undefined ? rows : rows.filter(r => String(r.id) > String(cursor));
      return visible.slice(0, 501);
    });
    try {
      const result = await new BootstrapServices.AuthorizationBootstrapService().bootstrap({
        bootstrapUser: { id: 'user-1' },
      });
      assert.ok(harness.limitCalls.length >= 2, `expected pagination, saw ${harness.limitCalls.length} pages`);
      assert.ok(
        harness.limitCalls.every(n => n === 501),
        'every page must use the 501 limit+1 probe'
      );
      assert.equal(harness.created.length, 0, 'canonical row exists: no creation allowed');
      assert.ok(
        result.issues.some(i => i.severity === 'blocker' && i.entityType === 'assignment'),
        `hidden revoked rows must block, got ${JSON.stringify(result.issues)}`
      );
      assert.equal(result.systemAssignmentCreated, false);
    } finally {
      harness.restore();
    }
  });

  it('fails closed when the adapter ignores the range predicate', async () => {
    const rows = [
      ...Array.from({ length: 600 }, (_, i) =>
        canonicalAssignment(`a-${String(i).padStart(4, '0')}`, {
          principalId: 'user-other',
          status: 'revoked',
        })
      ),
    ];
    const harness = installBootstrapHarness(() => rows.slice(0, 501));
    try {
      await assert.rejects(
        () => new BootstrapServices.AuthorizationBootstrapService().bootstrap({ bootstrapUser: { id: 'user-1' } }),
        /stalled|range predicate/
      );
      const readiness = (sails.config as Record<string, unknown>).authorizationReadiness as
        | { issues?: { code?: string }[] }
        | undefined;
      void readiness;
    } finally {
      harness.restore();
    }
  });

  it('fails closed on a non-array page and on a throwing query', async () => {
    for (const mode of ['non-array', 'throwing'] as const) {
      const harness = installBootstrapHarness(() => {
        if (mode === 'throwing') throw new Error('adapter exploded');
        return 'not-an-array';
      });
      try {
        await assert.rejects(
          () => new BootstrapServices.AuthorizationBootstrapService().bootstrap({ bootstrapUser: { id: 'user-1' } }),
          mode === 'throwing' ? /adapter exploded/ : /non-array/
        );
        assert.equal(harness.created.length, 0, 'no creation may happen while hidden rows are unobservable');
      } finally {
        harness.restore();
      }
    }
  });
});

describe('Phase 3 acceptance P4: guest floor removal blocks readiness before deletion', () => {
  it('persists protected-guest-floor-removed and audits the repair', async () => {
    const destroyed: unknown[] = [];
    const harness = installBootstrapHarness(() => [], {
      destroyed,
      overrides: [{ id: 'ov-floor', role: 'guest-1', scopeKey: 'authorization.self.read', effect: 'remove' }],
    });
    try {
      const result = await new BootstrapServices.AuthorizationBootstrapService().bootstrap({
        bootstrapUser: { id: 'user-1' },
      });
      assert.ok(
        result.issues.some(i => i.code === 'protected-guest-floor-removed' && i.entityId === 'guest-1'),
        `floor removal must block readiness, got ${JSON.stringify(result.issues)}`
      );
      assert.ok(destroyed.length > 0, 'floor-removal row must still be repaired (deleted)');
      assert.ok(
        harness.audits.some(
          a =>
            (a as { eventType?: string }).eventType === 'role.scopes-updated' &&
            (a as { after?: { protectedGuestFloorRemoved?: boolean } }).after?.protectedGuestFloorRemoved === true
        ),
        'repair audit must record the floor removal'
      );
    } finally {
      harness.restore();
    }
  });
});

describe('Phase 3 acceptance P4: drift rejects absent keys and direct writes', () => {
  const names = [
    'BrandingConfig',
    'Role',
    'RoleAssignment',
    'RoleScopeOverride',
    'User',
    'PathRule',
    'RoleTemplate',
    'RoleTemplateRevision',
  ] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedModels: typeof sails.models;

  function chainResult<T>(value: T) {
    const query: Record<string, unknown> = {
      limit: () => query,
      populate: () => query,
      sort: () => query,
      then: (onfulfilled?: ((result: T) => unknown) | null): Promise<unknown> =>
        Promise.resolve(value).then(onfulfilled as never),
    };
    return query;
  }

  function installDriftGlobals(assignmentRows: unknown[], roleRows: (criteria: Record<string, unknown>) => unknown[]) {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedModels = sails.models;
    sails.models = { record: { find: () => chainResult([]) } } as unknown as typeof sails.models;
    Reflect.set(globalThis, 'BrandingConfig', { find: () => chainResult([{ id: 'brand-1' }]) });
    Reflect.set(globalThis, 'Role', {
      count: () => Promise.resolve(1),
      findOne: async (criteria: Record<string, unknown>) => {
        if ((criteria as { protectedKind?: string }).protectedKind === 'guest') {
          return { ...guestRow };
        }
        return undefined;
      },
      find: (criteria: Record<string, unknown>) => chainResult(roleRows(criteria)),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      count: () => Promise.resolve(2),
      find: () => ({
        populate: () => ({ sort: () => ({ limit: (n: number) => Promise.resolve(assignmentRows.slice(0, n)) }) }),
      }),
    });
    Reflect.set(globalThis, 'RoleScopeOverride', { findOne: async () => undefined, find: () => chainResult([]) });
    Reflect.set(globalThis, 'User', { find: () => chainResult([]) });
    Reflect.set(globalThis, 'PathRule', { find: () => chainResult([]) });
    installHealthyTemplateGlobals();
  }

  afterEach(() => {
    sails.models = savedModels;
    for (const name of names) {
      const descriptor = saved.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
  });

  const healthyRows = () => [
    {
      id: 'system-admin',
      name: 'system-admin',
      key: 'system-admin',
      identityKey: 'system:system-admin',
      displayName: 'System administrators',
      contextType: 'system',
      protectedKind: 'system-admin',
      branding: null,
      status: 'active',
      version: 2,
    },
  ];

  it('blocks an ordinary role with a missing immutable key even when name/identity match', async () => {
    installDriftGlobals([], criteria =>
      (criteria as { contextType?: string }).contextType === 'system'
        ? healthyRows()
        : [
            {
              id: 'role-keyless',
              name: 'Custom',
              identityKey: 'brand:brand-1:Custom',
              displayName: 'Custom',
              contextType: 'brand',
              branding: 'brand-1',
              protectedKind: 'none',
              status: 'active',
              version: 1,
            },
          ]
    );
    const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
    assert.ok(
      report.issues.some(i => i.code === 'role-key-invalid' && i.entityId === 'role-keyless'),
      `missing key must block, got ${JSON.stringify(report.issues)}`
    );
  });

  it('classifies a branded system assignment as an explicit direct-write anomaly', async () => {
    const systemRole = {
      id: 'system-admin',
      name: 'system-admin',
      key: 'system-admin',
      identityKey: 'system:system-admin',
      contextType: 'system',
      protectedKind: 'system-admin',
      branding: 'brand-1',
      status: 'active',
      version: 2,
    };
    installDriftGlobals(
      [
        {
          id: 'a-branded-sys',
          principalType: 'user',
          principalId: 'user-1',
          role: systemRole,
          branding: 'brand-1',
          source: 'manual',
          sourceKey: 'manual-grant',
          status: 'active',
          sourcePresent: true,
          expiresAt: null,
          version: 1,
        },
      ],
      healthyRows
    );
    const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
    assert.ok(
      report.issues.some(i => i.code === 'assignment-system-branding-present' && i.entityId === 'a-branded-sys'),
      `branded system assignment must block, got ${JSON.stringify(report.issues)}`
    );
  });

  it('fails closed when the reverse legacy projection query throws', async () => {
    const brandRole = {
      id: 'role-1',
      name: 'Custom',
      key: 'Custom',
      identityKey: 'brand:brand-1:Custom',
      contextType: 'brand',
      protectedKind: 'none',
      branding: 'brand-1',
      status: 'active',
      version: 1,
    };
    installDriftGlobals(
      [
        {
          id: 'a-mig-1',
          principalType: 'user',
          principalId: 'user-1',
          role: brandRole,
          branding: 'brand-1',
          source: 'migration',
          sourceKey: 'legacy-role:user-1:role-1',
          status: 'active',
          sourcePresent: true,
          expiresAt: null,
          version: 1,
        },
      ],
      healthyRows
    );
    let populateCalls = 0;
    Reflect.set(globalThis, 'User', {
      // First populate (linkage validation) succeeds so the scan reaches the
      // reverse-projection loop; every later populate throws, proving the
      // exception path fails closed instead of yielding a clean result.
      findOne: () => ({
        populate: () => {
          populateCalls += 1;
          if (populateCalls > 1) return Promise.reject(new Error('projection store exploded'));
          return Promise.resolve({ id: 'user-1', roles: [{ id: 'role-1', name: 'Custom' }] });
        },
      }),
      find: () => chainResult([]),
    });
    const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
    assert.ok(
      report.issues.some(i => i.code === 'assignment-legacy-projection-scan-incomplete' && i.entityId === 'a-mig-1'),
      `throwing projection must block, got ${JSON.stringify(report.issues)}`
    );
  });
});

describe('Phase 3 acceptance P4: checkpoints are unique, monotonic, and leased', () => {
  it('detects duplicate durable checkpoint rows fail-closed', async () => {
    const names = ['Role'] as const;
    const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
    const rows = [{ lastId: 'a' }, { lastId: 'b' }];
    Reflect.set(globalThis, 'Role', {
      getDatastore: () => ({
        manager: {
          collection: () => ({
            find: () => ({ limit: () => ({ toArray: async () => rows }) }),
            updateOne: async () => ({}),
          }),
        },
      }),
    });
    try {
      await assert.rejects(() => readMigrationCheckpoint('roles'), /duplicate/i);
    } finally {
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
    }
  });

  it('never regresses counters and unions blockers across writes', async () => {
    await clearMigrationCheckpoint('roles');
    await writeMigrationCheckpoint('roles', 'cursor-b', {
      batchesApplied: 5,
      blockerCodes: ['role-key-invalid'],
    });
    await writeMigrationCheckpoint('roles', 'cursor-c', { batchesApplied: 2 });
    const checkpoint = await readMigrationCheckpoint('roles');
    assert.equal(checkpoint?.lastId, 'cursor-c');
    assert.equal(checkpoint?.batchesApplied, 5, 'counters must be monotonic, never regress');
    assert.ok(checkpoint?.blockerCodes?.includes('role-key-invalid'), 'blockers must survive later writes');
    await clearMigrationCheckpoint('roles');
  });

  it('grants the migration lease to exactly one runner at a time', async () => {
    const releaseFirst = await acquireMigrationLease();
    try {
      await assert.rejects(() => acquireMigrationLease(), /already running/);
    } finally {
      await releaseFirst();
    }
    const releaseSecond = await acquireMigrationLease();
    await releaseSecond();
  });
});

describe('Phase 3 acceptance P4: fencing lease renewal and stale-runner rejection', () => {
  beforeEach(async () => {
    __resetMigrationLeaseStateForTests();
    await clearMigrationCheckpoint('roles');
  });

  afterEach(async () => {
    __resetMigrationLeaseStateForTests();
    await clearMigrationCheckpoint('roles');
  });

  it('renews a live lease and rejects a stale runner after TTL takeover with a higher fence', async () => {
    const realNow = Date.now;
    try {
      let nowMs = realNow();
      Date.now = () => nowMs;
      const first = await acquireMigrationLease('stale-runner');
      const firstFence = first.fence;
      // Heartbeat renewal keeps a live owner inside its TTL.
      nowMs += 60_000;
      await renewMigrationLease(first);
      assert.ok(first.expiresAt > nowMs, 'renewal must extend the expiry');
      // Deterministic TTL expiry: advance past the renewed deadline, then a
      // successor takes over with a strictly greater fencing token.
      nowMs = first.expiresAt + 1;
      const second = await acquireMigrationLease('successor-runner');
      try {
        assert.ok(second.fence > firstFence, `fence must increase on takeover (${firstFence} -> ${second.fence})`);
        const holder = await readMigrationLease();
        assert.equal(holder?.owner, 'successor-runner');
        // The stale runner can neither renew nor mutate checkpoints past its TTL.
        await assert.rejects(() => renewMigrationLease(first), /superseded|expired/);
        await assert.rejects(
          () => writeMigrationCheckpoint('roles', 'cursor-stale', undefined, { lease: first }),
          /mismatch|superseded|stale fence|expired/
        );
        // The fenced successor writes successfully.
        const written = await writeMigrationCheckpoint('roles', 'cursor-live', undefined, { lease: second });
        assert.equal(written.lastId, 'cursor-live');
        assert.equal(written.fence, second.fence);
      } finally {
        await second.release();
      }
    } finally {
      Date.now = realNow;
    }
  });

  it('allows lease takeover only after expiry and keeps fences monotonic', async () => {
    const realNow = Date.now;
    try {
      let nowMs = realNow();
      Date.now = () => nowMs;
      const first = await acquireMigrationLease('owner-a');
      try {
        await assert.rejects(() => acquireMigrationLease('owner-b'), /already running/);
        nowMs += MIGRATION_LEASE_TTL_MS + 1;
        const second = await acquireMigrationLease('owner-b');
        try {
          assert.ok(second.fence > first.fence, 'takeover fence must be strictly greater');
          // A stale release from the loser must not delete the winner.
          await first.release();
          assert.equal((await readMigrationLease())?.owner, 'owner-b');
        } finally {
          await second.release();
        }
      } finally {
        await first.release();
      }
    } finally {
      Date.now = realNow;
    }
  });
});

describe('Phase 3 acceptance P4: checkpoint CAS, cursor monotonicity, and clear recreation', () => {
  beforeEach(async () => {
    __resetMigrationLeaseStateForTests();
    await clearMigrationCheckpoint('roles');
  });

  afterEach(async () => {
    __resetMigrationLeaseStateForTests();
    await clearMigrationCheckpoint('roles');
  });

  it('rejects a stale cursor regression without moving the resume position', async () => {
    await writeMigrationCheckpoint('roles', 'cursor-m');
    await writeMigrationCheckpoint('roles', 'cursor-z');
    await assert.rejects(() => writeMigrationCheckpoint('roles', 'cursor-a'), /stale cursor/);
    const checkpoint = await readMigrationCheckpoint('roles');
    assert.equal(checkpoint?.lastId, 'cursor-z');
    assert.ok((checkpoint?.revision ?? 0) >= 2, 'successful writes must advance the revision');
  });

  it('rejects a concurrent writer via expected-revision CAS', async () => {
    await writeMigrationCheckpoint('roles', 'cursor-1');
    const snapshot = await readMigrationCheckpoint('roles');
    assert.ok(snapshot?.revision !== undefined);
    await writeMigrationCheckpoint('roles', 'cursor-2');
    await assert.rejects(
      () =>
        writeMigrationCheckpoint('roles', 'cursor-3', undefined, {
          expectedRevision: snapshot?.revision as number,
        }),
      /revision conflict/
    );
    assert.equal((await readMigrationCheckpoint('roles'))?.lastId, 'cursor-2');
  });

  it('fails a durable CAS write when matchedCount is 0 (lost race)', async () => {
    const names = ['Role'] as const;
    const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
    const stored: Record<string, unknown> = {
      migrationName: '20260828T120000-authorization-model-v1',
      phase: 'roles',
      lastId: 'cursor-1',
      updatedAt: new Date(0).toISOString(),
      revision: 1,
    };
    Reflect.set(globalThis, 'Role', {
      getDatastore: () => ({
        manager: {
          collection: () => ({
            find: () => ({ limit: () => ({ toArray: async () => [{ ...stored }] }) }),
            updateOne: async () => ({ matchedCount: 0, modifiedCount: 0 }),
          }),
        },
      }),
    });
    try {
      await assert.rejects(() => writeMigrationCheckpoint('roles', 'cursor-2'), /revision conflict|0 rows/);
    } finally {
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
    }
  });

  it('recreates a cleared checkpoint from revision 1 instead of resurrecting stale state', async () => {
    await writeMigrationCheckpoint('roles', 'cursor-a', { batchesApplied: 4 });
    await clearMigrationCheckpoint('roles');
    assert.equal(await readMigrationCheckpoint('roles'), undefined);
    const recreated = await writeMigrationCheckpoint('roles', 'cursor-b', { batchesApplied: 1 });
    assert.equal(recreated.lastId, 'cursor-b');
    assert.equal(recreated.revision, 1, 'a cleared checkpoint restarts the revision sequence');
    assert.equal(recreated.batchesApplied, 1, 'cleared counters must not leak into the recreation');
  });
});
