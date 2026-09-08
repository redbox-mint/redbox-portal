import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';
import {
  Services as MigrationServices,
  clearMigrationCheckpoint,
  readMigrationCheckpoint,
  writeMigrationCheckpoint,
} from '../../src/services/AuthorizationMigrationService';
import {
  Services as BootstrapServices,
  canonicalActiveUserRejection,
  protectedSystemAssignmentBootstrapIssue,
} from '../../src/services/AuthorizationBootstrapService';
import { FROZEN_LEGACY_PATH_RULE_ROWS } from '../../src/authorization/legacy-authorization-baseline.snapshot';
import { DEFAULT_ROLE_TEMPLATES, isExactSystemAdminRole } from '../../src/authorization';

const connection = Object.freeze({ lease: 'p3-9-blockers' });

function txDatastore(extra: Record<string, unknown> = {}): Sails.Datastore {
  return {
    transaction: async (work: (leased: Sails.Connection) => Promise<unknown>) => work(connection),
    ...extra,
  } as unknown as Sails.Datastore;
}

describe('P3-001 checkpoint clear deletes the durable row', () => {
  it('deletes the row via native collection and treats a stateless residual row as absent', async () => {
    const deleted: unknown[] = [];
    const unset: Record<string, unknown>[] = [];
    // Stateful native-collection-shaped store keyed by migrationName+phase.
    const store = new Map<string, Record<string, unknown>>();
    store.set('20260828T120000-authorization-model-v1:roles', {
      migrationName: '20260828T120000-authorization-model-v1',
      phase: 'roles',
      lastId: 'role-9',
      updatedAt: new Date().toISOString(),
      blockerCodes: ['role-brand-missing'],
      blockerCount: 1,
      issuesTruncated: true,
    });
    Reflect.set(globalThis, 'Role', {
      getDatastore: () => ({
        manager: {
          collection: () => ({
            find: () => ({
              limit: () => ({
                toArray: async () => {
                  const row = store.get('20260828T120000-authorization-model-v1:roles');
                  return row === undefined ? [] : [{ ...row }];
                },
              }),
            }),
            updateOne: async (_f: unknown, u: unknown) => {
              unset.push(u as Record<string, unknown>);
              return {};
            },
            deleteOne: async (f: unknown) => {
              deleted.push(f);
              store.delete('20260828T120000-authorization-model-v1:roles');
              return { deletedCount: 1 };
            },
          }),
        },
      }),
    });
    try {
      await writeMigrationCheckpoint('roles', 'role-9', {
        blockerCodes: ['role-brand-missing'],
        blockerCount: 1,
        issuesTruncated: true,
      });
      await clearMigrationCheckpoint('roles');
      assert.deepEqual(deleted, [
        { migrationName: '20260828T120000-authorization-model-v1', phase: 'roles', revision: 1 },
      ]);
      assert.ok(
        unset.every(entry => entry['$unset'] === undefined),
        'clear must delete the row, not $unset fields'
      );
      assert.equal(await readMigrationCheckpoint('roles'), undefined);

      // Legacy residual row without run-state (e.g. written by an adapter
      // lacking deleteOne) must read back as absent, not as a valid cursor.
      store.set('20260828T120000-authorization-model-v1:roles', {
        migrationName: '20260828T120000-authorization-model-v1',
        phase: 'roles',
      });
      assert.equal(await readMigrationCheckpoint('roles'), undefined);
    } finally {
      Reflect.deleteProperty(globalThis, 'Role');
    }
  });

  it('falls back to $unset on adapters without deleteOne', async () => {
    const updates: Array<{ filter: unknown; update: Record<string, unknown> }> = [];
    // Stateful store so the clear observes an existing row: a clear that
    // observes no row is an idempotent no-op and must never issue a blind
    // $unset that could wipe a row created after the read.
    const store = new Map<string, Record<string, unknown>>();
    store.set('20260828T120000-authorization-model-v1:roles', {
      migrationName: '20260828T120000-authorization-model-v1',
      phase: 'roles',
      lastId: 'role-9',
      updatedAt: new Date().toISOString(),
      revision: 1,
      blockerCodes: ['role-brand-missing'],
      blockerCount: 1,
      issuesTruncated: true,
    });
    Reflect.set(globalThis, 'Role', {
      getDatastore: () => ({
        manager: {
          collection: () => ({
            find: () => ({
              limit: () => ({
                toArray: async () => {
                  const row = store.get('20260828T120000-authorization-model-v1:roles');
                  return row === undefined ? [] : [{ ...row }];
                },
              }),
            }),
            updateOne: async (f: unknown, u: unknown) => {
              updates.push({ filter: f, update: u as Record<string, unknown> });
              const key = '20260828T120000-authorization-model-v1:roles';
              const set = (u as { $set?: Record<string, unknown> }).$set;
              const unset = (u as { $unset?: Record<string, unknown> }).$unset;
              if (set !== undefined) store.set(key, { ...store.get(key), ...set });
              if (unset !== undefined) {
                const row = store.get(key);
                if (row !== undefined) for (const field of Object.keys(unset)) delete row[field];
              }
              return {};
            },
          }),
        },
      }),
    });
    try {
      await writeMigrationCheckpoint('roles', 'role-9', {
        blockerCodes: ['role-brand-missing'],
        blockerCount: 1,
        issuesTruncated: true,
      });
      await clearMigrationCheckpoint('roles');
      const unsets = updates.filter(entry => entry.update['$unset'] !== undefined);
      assert.equal(unsets.length, 1, 'clear of an existing row must $unset exactly once');
      const unsetKeys = Object.keys((unsets[0]?.update['$unset'] ?? {}) as Record<string, unknown>).sort();
      assert.deepEqual(unsetKeys, [
        'assignmentsCreated',
        'batchesApplied',
        'blockerCodes',
        'blockerCount',
        'blockerIssues',
        'conflictsResolved',
        'fence',
        'guestAssociationsSkipped',
        'issuesTruncated',
        'lastId',
        'owner',
        'revision',
        'rolesScanned',
        'transactionFailures',
        'updatedAt',
        'usersScanned',
      ]);
      assert.equal(await readMigrationCheckpoint('roles'), undefined);
      // The $unset CAS pins the exact revision read before the clear.
      assert.deepEqual(unsets[0]?.filter, {
        migrationName: '20260828T120000-authorization-model-v1',
        phase: 'roles',
        revision: 2,
      });
      // A clear that observes no row issues no durable mutation at all, so a
      // row created after the read is never wiped.
      const updateCount = updates.length;
      await clearMigrationCheckpoint('roles');
      assert.equal(updates.length, updateCount, 'clear of an absent row must not touch durable storage');
    } finally {
      Reflect.deleteProperty(globalThis, 'Role');
    }
  });

  it('blocker -> clear/repair -> process restart -> full rerun reads clean', async () => {
    // Simulates: run records a blocker cursor, operator repairs the data and
    // clears the checkpoint, the process restarts (memory lost), and the next
    // full rerun must start from the beginning with no stale resume state.
    const store = new Map<string, Record<string, unknown>>();
    const installNative = () => {
      Reflect.set(globalThis, 'Role', {
        getDatastore: () => ({
          manager: {
            collection: () => ({
              find: () => ({
                limit: () => ({
                  toArray: async () => {
                    const row = store.get('20260828T120000-authorization-model-v1:roles');
                    return row === undefined ? [] : [{ ...row }];
                  },
                }),
              }),
              updateOne: async (f: unknown, u: unknown) => {
                const key = '20260828T120000-authorization-model-v1:roles';
                const set = (u as { $set?: Record<string, unknown> }).$set ?? {};
                store.set(key, { ...store.get(key), ...(f as object), ...set });
                return {};
              },
              deleteOne: async () => {
                store.delete('20260828T120000-authorization-model-v1:roles');
                return { deletedCount: 1 };
              },
            }),
          },
        }),
      });
    };
    installNative();
    try {
      await writeMigrationCheckpoint('roles', 'role-9', {
        blockerCodes: ['role-brand-missing'],
        blockerCount: 1,
        issuesTruncated: false,
      });
      assert.equal((await readMigrationCheckpoint('roles'))?.lastId, 'role-9');
      // Operator repairs data, clears the checkpoint, then the process restarts.
      await clearMigrationCheckpoint('roles');
      installNative(); // fresh lift: memory fallback is empty, durable row gone
      const afterRestart = await readMigrationCheckpoint('roles');
      assert.equal(afterRestart, undefined);
    } finally {
      Reflect.deleteProperty(globalThis, 'Role');
    }
  });
});

describe('P3-002 limit=1 over-limit-per-entity paginates without duplication', () => {
  it('a single user with multiple findings pages finding-by-finding', async () => {
    const previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    const d0 = Object.getOwnPropertyDescriptor(globalThis, 'BrandingConfig');
    const d1 = Object.getOwnPropertyDescriptor(globalThis, 'Role');
    const d2 = Object.getOwnPropertyDescriptor(globalThis, 'RoleAssignment');
    const d3 = Object.getOwnPropertyDescriptor(globalThis, 'User');
    const d4 = Object.getOwnPropertyDescriptor(globalThis, 'PathRule');
    const d5 = Object.getOwnPropertyDescriptor(globalThis, 'RoleTemplate');
    const d6 = Object.getOwnPropertyDescriptor(globalThis, 'RoleTemplateRevision');
    Reflect.set(globalThis, 'BrandingConfig', { find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) });
    Reflect.set(globalThis, 'Role', {
      count: () => Promise.resolve(0),
      find: () => ({ sort: () => ({ limit: (n: number) => Promise.resolve([]).then(r => r.slice(0, n)) }) }),
      findOne: async () => undefined,
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      count: () => Promise.resolve(0),
      find: () => ({
        populate: (_a: string, _c?: unknown) => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }),
      }),
    });
    const ghostUser = { id: 'user-1', roles: [{ id: 'ghost-1' }, { id: 'ghost-2' }] };
    Reflect.set(globalThis, 'User', {
      find: () => ({
        populate: (_a: string, _c?: unknown) => ({ sort: () => ({ limit: () => Promise.resolve([ghostUser]) }) }),
      }),
    });
    Reflect.set(globalThis, 'PathRule', {
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    installHealthyTemplateGlobals();
    try {
      const service = new MigrationServices.AuthorizationMigrationService();
      const seen: string[] = [];
      let continuation: string | undefined;
      let pages = 0;
      do {
        const page = await service.reportDrift(1, continuation);
        pages += 1;
        assert.ok(pages < 10, 'must progress, not loop forever');
        if (page.truncated) assert.ok(page.continuation !== undefined, 'truncated must carry continuation');
        for (const issue of page.issues) seen.push(`${issue.code}`);
        continuation = page.continuation;
        if (!page.truncated) break;
      } while (continuation !== undefined);
      assert.ok(seen.length >= 2, `expected >=2 findings, got ${seen.length}`);
    } finally {
      sails.models = previousModels;
      for (const [name, d] of [
        ['BrandingConfig', d0],
        ['Role', d1],
        ['RoleAssignment', d2],
        ['User', d3],
        ['PathRule', d4],
        ['RoleTemplate', d5],
        ['RoleTemplateRevision', d6],
      ] as const) {
        if (d === undefined) Reflect.deleteProperty(globalThis, name);
        else Object.defineProperty(globalThis, name, d);
      }
    }
  });
});

describe('P3-003 absent flags grant nothing and report operation drift', () => {
  it('flagless rule on a known path+role is operation-unmapped, not clean', async () => {
    const previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    const names = [
      'BrandingConfig',
      'Role',
      'RoleAssignment',
      'User',
      'PathRule',
      'RoleTemplate',
      'RoleTemplateRevision',
    ] as const;
    const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
    const row = FROZEN_LEGACY_PATH_RULE_ROWS[0] as { path: string; role: string };
    Reflect.set(globalThis, 'BrandingConfig', { find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) });
    Reflect.set(globalThis, 'Role', {
      count: () => Promise.resolve(0),
      find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }),
      findOne: async () => undefined,
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      count: () => Promise.resolve(0),
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    Reflect.set(globalThis, 'User', {
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    Reflect.set(globalThis, 'PathRule', {
      find: () => ({
        populate: () => ({
          sort: () => ({
            limit: () => Promise.resolve([{ id: 'rule-1', path: row.path, role: { id: 'r1', name: row.role } }]),
          }),
        }),
      }),
    });
    installHealthyTemplateGlobals();
    try {
      const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
      const codes = report.issues.map(i => i.code);
      assert.ok(
        codes.includes('legacy-path-rule-operation-unmapped') || codes.includes('legacy-path-rule-unmapped'),
        `flagless rule must drift, got ${JSON.stringify(codes)}`
      );
    } finally {
      sails.models = previousModels;
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
    }
  });
});

describe('P3-006 canonical predicate rejects dangling linkedPrimaryUserId', () => {
  it('active user with non-empty linkedPrimaryUserId is an alias', () => {
    assert.equal(
      canonicalActiveUserRejection({
        accountLinkState: undefined,
        linkedPrimaryUserId: 'user-9',
        loginDisabled: false,
      } as never),
      'alias'
    );
    assert.equal(
      canonicalActiveUserRejection({
        accountLinkState: undefined,
        linkedPrimaryUserId: '  ',
        loginDisabled: false,
      } as never),
      undefined
    );
    assert.equal(
      canonicalActiveUserRejection({
        accountLinkState: 'linked-alias',
        linkedPrimaryUserId: '',
        loginDisabled: false,
      } as never),
      'alias'
    );
  });

  it('recovery rejects active + linkedPrimaryUserId before any mutation', async () => {
    const prevServices = sails.services;
    sails.services = {
      ...prevServices,
      authorizationauditservice: { recordAttempt: async () => ({}) },
    } as typeof sails.services;
    const d = Object.getOwnPropertyDescriptor(globalThis, 'User');
    Reflect.set(globalThis, 'User', {
      find: () => ({
        limit: async () => [{ id: 'user-1', username: 'alice', linkedPrimaryUserId: 'user-9', loginDisabled: false }],
      }),
    });
    try {
      await assert.rejects(
        new BootstrapServices.AuthorizationBootstrapService().recoverSystemAdministrator({
          target: 'alice',
          confirmation: 'RECOVER-SYSTEM-ADMIN',
          reason: 'test',
        }),
        /linked alias/
      );
    } finally {
      sails.services = prevServices;
      if (d === undefined) Reflect.deleteProperty(globalThis, 'User');
      else Object.defineProperty(globalThis, 'User', d);
    }
    void txDatastore;
  });
});

describe('P3-R04 versionless role predicate pins every overwritten field', () => {
  const versionlessRow = {
    id: 'role-a',
    name: 'RoleA',
    branding: 'brand-1',
    status: 'active',
  };

  function installVersionlessRole(updateCriteria: unknown[], winner: unknown) {
    const previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    const previousServices = sails.services;
    sails.services = {
      ...previousServices,
      authorizationauditservice: { createSucceededEvent: async () => ({ id: 'audit-1' }) },
    } as typeof sails.services;
    const names = ['Role', 'RoleTemplate'] as const;
    const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
    Reflect.set(globalThis, 'Role', {
      find: () => ({ sort: () => ({ limit: () => Promise.resolve([{ ...versionlessRow }]) }) }),
      findOne: () => ({ usingConnection: async () => ({ ...versionlessRow }) }),
      count: () => ({ usingConnection: async () => 1 }),
      updateOne: (criteria: Record<string, unknown>) => {
        updateCriteria.push(criteria);
        return {
          set: () => ({ meta: () => ({ usingConnection: async () => winner }) }),
        };
      },
      getDatastore: () => txDatastore(),
    });
    Reflect.set(globalThis, 'RoleTemplate', {
      find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    return () => {
      sails.models = previousModels;
      sails.services = previousServices;
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
    };
  }

  it('pins actor fields and absent values as null without any cast', async () => {
    await clearMigrationCheckpoint('roles');
    const updateCriteria: unknown[] = [];
    const restore = installVersionlessRole(updateCriteria, { ...versionlessRow, key: 'RoleA', version: 1 });
    try {
      const summary = await new MigrationServices.AuthorizationMigrationService().reconcileBrandRoles(10);
      assert.equal(summary.rolesMigrated, 1);
      assert.deepEqual(updateCriteria[0], {
        id: 'role-a',
        version: null,
        name: 'RoleA',
        branding: 'brand-1',
        template: null,
        key: null,
        identityKey: null,
        displayName: null,
        contextType: null,
        protectedKind: null,
        status: 'active',
        templateRevision: null,
        createdBy: null,
        updatedBy: null,
      });
    } finally {
      restore();
      await clearMigrationCheckpoint('roles');
    }
  });

  it('fails closed when a concurrent actor-field write wins the versionless race', async () => {
    await clearMigrationCheckpoint('roles');
    const updateCriteria: unknown[] = [];
    // Zero matched rows: the pinned predicate (e.g. updatedBy still null)
    // no longer holds because a concurrent administrator wrote first.
    const restore = installVersionlessRole(updateCriteria, null);
    try {
      await assert.rejects(
        new MigrationServices.AuthorizationMigrationService().reconcileBrandRoles(10),
        /changed concurrently/
      );
      assert.equal(updateCriteria.length, 1);
    } finally {
      restore();
      await clearMigrationCheckpoint('roles');
    }
  });
});
/**
 * Healthy protected-template doubles: every default template resolves as
 * active at its declared revision with exact scope keys, so drift tests
 * focused on other sections observe a verified-clean template section.
 */
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

function installDriftGlobals(overrides: Record<string, unknown>): Map<string, PropertyDescriptor | undefined> {
  const previousModels = sails.models;
  sails.models = {} as typeof sails.models;
  const names = [
    'BrandingConfig',
    'Role',
    'RoleAssignment',
    'User',
    'PathRule',
    'RoleTemplate',
    'RoleTemplateRevision',
  ] as const;
  const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
  Reflect.set(globalThis, 'BrandingConfig', {
    find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }),
  });
  Reflect.set(globalThis, 'Role', {
    count: () => Promise.resolve(0),
    // Lazy cursor double: bound before materialization, never pre-materialized.
    find: () => ({ sort: () => ({ limit: (n: number) => Promise.resolve([]).then(r => r.slice(0, n)) }) }),
    findOne: async () => undefined,
  });
  Reflect.set(globalThis, 'RoleAssignment', {
    count: () => Promise.resolve(0),
    find: () => ({
      populate: (_a: string, _c?: unknown) => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }),
    }),
    findOne: async () => undefined,
  });
  Reflect.set(globalThis, 'User', {
    find: () => ({
      populate: (_a: string, criteria?: { limit?: number }) => ({
        sort: () => ({ limit: () => Promise.resolve([]) }),
      }),
    }),
    findOne: () => ({ populate: (_a: string, _c?: unknown) => Promise.resolve(undefined) }),
  });
  Reflect.set(globalThis, 'PathRule', {
    find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
  });
  for (const [name, double] of Object.entries(overrides)) Reflect.set(globalThis, name, double);
  installHealthyTemplateGlobals();
  for (const [name, double] of Object.entries(overrides)) {
    if (name === 'RoleTemplate' || name === 'RoleTemplateRevision') Reflect.set(globalThis, name, double);
  }
  return saved;
}

function restoreDriftGlobals(
  saved: Map<string, PropertyDescriptor | undefined>,
  previousModels: typeof sails.models
): void {
  sails.models = previousModels;
  for (const n of [
    'BrandingConfig',
    'Role',
    'RoleAssignment',
    'User',
    'PathRule',
    'RoleTemplate',
    'RoleTemplateRevision',
  ] as const) {
    const d = saved.get(n);
    if (d === undefined) Reflect.deleteProperty(globalThis, n);
    else Object.defineProperty(globalThis, n, d);
  }
}

describe('P3-R02 junction scans are bounded and fail closed', () => {
  it('reports blocking drift when junction discovery is unavailable instead of clean', async () => {
    const previousModels = sails.models;
    const saved = installDriftGlobals({
      User: {
        // No getDatastore manager and no junction model: discovery fails.
        find: () => ({
          populate: () => ({
            sort: () => ({
              limit: () => Promise.resolve([{ id: 'user-1', roles: [{ id: 'role-1', name: 'Researcher' }] }]),
            }),
          }),
        }),
        findOne: () => ({ populate: () => Promise.resolve(undefined) }),
      },
      RoleAssignment: {
        count: () => Promise.resolve(0),
        find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
        findOne: async () => undefined,
      },
    });
    try {
      const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
      const codes = report.issues.map(i => i.code);
      assert.ok(
        codes.includes('user-role-junction-scan-incomplete'),
        `unverifiable junction must block, got ${JSON.stringify(codes)}`
      );
    } finally {
      restoreDriftGlobals(saved, previousModels);
    }
  });

  it('reports truncation overflow explicitly while keeping bounded orphan evidence', async () => {
    const previousModels = sails.models;
    // 502 junction rows: the 500-row bound keeps a prefix and the overflow is
    // reported instead of silently scanning everything.
    const rows = Array.from({ length: 502 }, (_, i) => ({
      id: `junction-${i}`,
      user_roles: 'user-1',
      role_users: 'ghost-role',
    }));
    const saved = installDriftGlobals({
      User: {
        find: () => ({
          populate: (_a: string, _c?: unknown) => ({
            sort: () => ({ limit: () => Promise.resolve([{ id: 'user-1', roles: [] }]) }),
          }),
        }),
        findOne: () => ({ populate: () => Promise.resolve(undefined) }),
        getDatastore: () => ({
          manager: {
            collection: () => ({
              find: () => ({
                limit: (n: number) => Promise.resolve(rows.slice(0, n)),
              }),
            }),
          },
        }),
      },
      RoleAssignment: {
        count: () => Promise.resolve(0),
        find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
        findOne: async () => undefined,
      },
    });
    try {
      const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
      const codes = report.issues.map(i => i.code);
      assert.ok(codes.includes('user-role-junction-scan-truncated'), `expected overflow evidence, got ${codes}`);
      assert.ok(codes.includes('user-role-reference-missing'), `bounded orphan evidence kept, got ${codes}`);
    } finally {
      restoreDriftGlobals(saved, previousModels);
    }
  });

  it('applies limit=501 to nested scans before awaiting', async () => {
    const previousModels = sails.models;
    const seenLimits: number[] = [];
    const saved = installDriftGlobals({
      Role: {
        count: () => Promise.resolve(0),
        findOne: async () => undefined,
        find: () => ({
          sort: () => ({
            limit: (n: number) => {
              seenLimits.push(n);
              return Promise.resolve([]);
            },
          }),
        }),
      },
    });
    try {
      await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
      assert.ok(seenLimits.includes(501), `nested scans must request the 501 bound, saw ${seenLimits}`);
    } finally {
      restoreDriftGlobals(saved, previousModels);
    }
  });
});

describe('P3-R03 alias projection compares the canonical account set both directions', () => {
  it('accepts an alias-retained legacy role in forward and reverse drift checks', async () => {
    const previousModels = sails.models;
    const roleRow = {
      id: 'role-1',
      name: 'Researcher',
      protectedKind: 'none',
      contextType: 'brand',
      branding: 'brand-1',
      status: 'active',
    };
    const alias = { id: 'alias-1', linkedPrimaryUserId: 'primary-1', loginDisabled: false, roles: [roleRow] };
    const primary = { id: 'primary-1', loginDisabled: false, roles: [] };
    const assignmentRow = {
      id: 'assignment-1',
      principalType: 'user',
      principalId: 'primary-1',
      role: { ...roleRow },
      branding: 'brand-1',
      source: 'migration',
      sourceKey: 'legacy-role:alias-1:role-1',
      status: 'active',
      sourcePresent: true,
      expiresAt: null,
    };
    const saved = installDriftGlobals({
      User: {
        find: () => ({
          populate: () => ({ sort: () => ({ limit: () => Promise.resolve([alias]) }) }),
        }),
        findOne: (criteria: Record<string, unknown>) => {
          const row = criteria.id === 'alias-1' ? alias : criteria.id === 'primary-1' ? primary : undefined;
          const chain: Record<string, unknown> = { populate: () => Promise.resolve(row) };
          // Waterline findOne is thenable: the link-chain walker awaits it directly.
          chain.then = (onfulfilled?: (value: unknown) => unknown) => Promise.resolve(row).then(onfulfilled);
          return chain;
        },
        getDatastore: () => ({ manager: { collection: () => ({ find: () => [] }) } }),
      },
      RoleAssignment: {
        count: () => Promise.resolve(1),
        find: () => ({
          populate: () => ({ sort: () => ({ limit: () => Promise.resolve([assignmentRow]) }) }),
        }),
        findOne: async (criteria: Record<string, unknown>) =>
          (criteria as { principalId?: string }).principalId === 'primary-1' ? assignmentRow : undefined,
      },
    });
    try {
      const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
      const codes = report.issues.map(i => i.code);
      assert.ok(
        !codes.includes('legacy-assignment-projection-missing'),
        `alias forward projection must resolve, got ${JSON.stringify(codes)}`
      );
      assert.ok(
        !codes.includes('new-assignment-legacy-projection-missing'),
        `alias reverse projection must resolve via sourceKey user, got ${JSON.stringify(codes)}`
      );
    } finally {
      restoreDriftGlobals(saved, previousModels);
    }
  });

  it('still flags an assignment whose role is on neither primary nor alias', async () => {
    const previousModels = sails.models;
    const roleRow = {
      id: 'role-2',
      name: 'Librarians',
      protectedKind: 'none',
      contextType: 'brand',
      branding: 'brand-1',
      status: 'active',
    };
    const alias = { id: 'alias-1', linkedPrimaryUserId: 'primary-1', loginDisabled: false, roles: [] };
    const primary = { id: 'primary-1', loginDisabled: false, roles: [] };
    const assignmentRow = {
      id: 'assignment-9',
      principalType: 'user',
      principalId: 'primary-1',
      role: { ...roleRow },
      branding: 'brand-1',
      source: 'migration',
      sourceKey: 'legacy-role:alias-1:role-2',
      status: 'active',
      sourcePresent: true,
      expiresAt: null,
    };
    const saved = installDriftGlobals({
      User: {
        find: () => ({
          populate: () => ({ sort: () => ({ limit: () => Promise.resolve([alias]) }) }),
        }),
        findOne: (criteria: Record<string, unknown>) => {
          const row = criteria.id === 'alias-1' ? alias : criteria.id === 'primary-1' ? primary : undefined;
          const chain: Record<string, unknown> = { populate: () => Promise.resolve(row) };
          // Waterline findOne is thenable: the link-chain walker awaits it directly.
          chain.then = (onfulfilled?: (value: unknown) => unknown) => Promise.resolve(row).then(onfulfilled);
          return chain;
        },
        getDatastore: () => ({ manager: { collection: () => ({ find: () => [] }) } }),
      },
      RoleAssignment: {
        count: () => Promise.resolve(1),
        find: () => ({
          populate: () => ({ sort: () => ({ limit: () => Promise.resolve([assignmentRow]) }) }),
        }),
        findOne: async () => undefined,
      },
    });
    try {
      const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
      const codes = report.issues.map(i => i.code);
      assert.ok(
        codes.includes('new-assignment-legacy-projection-missing'),
        `missing on both sides must drift, got ${JSON.stringify(codes)}`
      );
    } finally {
      restoreDriftGlobals(saved, previousModels);
    }
  });
});

describe('P3-R05 versionless recovery predicate pins the full snapshot', () => {
  const principal = { id: 'user-1', username: 'admin', accountLinkState: 'active', loginDisabled: false };

  function versionlessRevokedRow(): Record<string, unknown> {
    return {
      id: 'assignment-1',
      principalType: 'user',
      principalId: 'user-1',
      role: 'role-system-1',
      source: 'recovery',
      sourceKey: 'bootstrap-parent-administrator',
      status: 'revoked',
      sourcePresent: true,
      assignedBy: 'bootstrap:authorization-invariants',
      assignedAt: '2024-01-01T00:00:00.000Z',
      expiresAt: null,
      revokedBy: 'operator-1',
      revokedAt: '2024-02-01T00:00:00.000Z',
      suppressedBy: null,
      suppressedAt: null,
      reason: 'rotated admin',
    };
  }

  function installRecoveryHarness(options: {
    liveRow: Record<string, unknown>;
    concurrentChange?: { field: string; value: unknown };
    updateCalls: Array<{ criteria: unknown; values: unknown }>;
  }): () => void {
    const previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    const previousServices = sails.services;
    sails.services = {
      ...previousServices,
      authorizationauditservice: {
        createSucceededEvent: async () => ({ eventId: 'audit-1' }),
        recordAttempt: async () => ({ persisted: true }),
      },
    } as typeof sails.services;
    const names = ['User', 'RoleAssignment'] as const;
    const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
    Reflect.set(globalThis, 'User', {
      find: () => ({ limit: () => Promise.resolve([{ ...principal }]) }),
      findOne: () => ({ usingConnection: async () => ({ ...principal }) }),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      getDatastore: () => txDatastore(),
      findOne: () => ({
        usingConnection: async () => {
          const snapshot = { ...options.liveRow };
          // A concurrent writer lands between the in-transaction read and the
          // CAS repair write.
          if (options.concurrentChange !== undefined) {
            options.liveRow[options.concurrentChange.field] = options.concurrentChange.value;
          }
          return snapshot;
        },
      }),
      updateOne: (criteria: Record<string, unknown>) => ({
        set: (values: Record<string, unknown>) => ({
          usingConnection: async () => {
            options.updateCalls.push({ criteria, values });
            // Strict CAS emulation: every pinned predicate entry must still
            // match the live row (undefined and null equivalent).
            for (const [key, expected] of Object.entries(criteria)) {
              const live = options.liveRow[key] === undefined ? null : options.liveRow[key];
              if (expected !== live) return null;
            }
            return { ...options.liveRow, ...values };
          },
        }),
      }),
    });
    const proto = BootstrapServices.AuthorizationBootstrapService.prototype as unknown as Record<string, unknown>;
    const originalEnsure = proto.ensureSystemRole;
    proto.ensureSystemRole = async () => ({ role: { id: 'role-system-1' }, created: false });
    return () => {
      proto.ensureSystemRole = originalEnsure;
      sails.models = previousModels;
      sails.services = previousServices;
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
    };
  }

  it('pins expiry, revocation/suppression, actor/time, and reason in the repair predicate', async () => {
    const updateCalls: Array<{ criteria: unknown; values: unknown }> = [];
    const restore = installRecoveryHarness({ liveRow: versionlessRevokedRow(), updateCalls });
    try {
      const result = await new BootstrapServices.AuthorizationBootstrapService().recoverSystemAdministrator({
        target: 'user-1',
        confirmation: 'RECOVER-SYSTEM-ADMIN',
        reason: 'lockout rehearsal',
      });
      assert.equal(result.assignmentReactivated, true);
      assert.deepEqual(updateCalls[0].criteria, {
        id: 'assignment-1',
        version: null,
        principalType: 'user',
        principalId: 'user-1',
        role: 'role-system-1',
        branding: null,
        source: 'recovery',
        sourceKey: 'bootstrap-parent-administrator',
        status: 'revoked',
        sourcePresent: true,
        assignedBy: 'bootstrap:authorization-invariants',
        assignedAt: '2024-01-01T00:00:00.000Z',
        expiresAt: null,
        revokedBy: 'operator-1',
        revokedAt: '2024-02-01T00:00:00.000Z',
        suppressedBy: null,
        suppressedAt: null,
        reason: 'rotated admin',
      });
    } finally {
      restore();
    }
  });

  it('fails closed when a concurrent change wins the race for each overwritten field', async () => {
    const races: Array<{ field: string; value: unknown }> = [
      { field: 'status', value: 'suppressed' },
      { field: 'sourcePresent', value: false },
      { field: 'expiresAt', value: '2030-01-01T00:00:00.000Z' },
      { field: 'revokedBy', value: 'operator-2' },
      { field: 'revokedAt', value: '2024-02-02T00:00:00.000Z' },
      { field: 'suppressedBy', value: 'operator-3' },
      { field: 'suppressedAt', value: '2024-03-03T00:00:00.000Z' },
      { field: 'assignedBy', value: 'operator-4' },
      { field: 'assignedAt', value: '2024-05-05T00:00:00.000Z' },
      { field: 'reason', value: 'changed reason' },
    ];
    for (const concurrentChange of races) {
      const updateCalls: Array<{ criteria: unknown; values: unknown }> = [];
      const restore = installRecoveryHarness({ liveRow: versionlessRevokedRow(), concurrentChange, updateCalls });
      try {
        await assert.rejects(
          new BootstrapServices.AuthorizationBootstrapService().recoverSystemAdministrator({
            target: 'user-1',
            confirmation: 'RECOVER-SYSTEM-ADMIN',
            reason: 'lockout rehearsal',
          }),
          /changed concurrently/,
          `race on ${concurrentChange.field} must fail closed`
        );
        assert.equal(updateCalls.length, 1, `race on ${concurrentChange.field} must attempt the CAS once`);
      } finally {
        restore();
      }
    }
  });
});

describe('P3-R06 migration winner adoption validates the effective canonical projection', () => {
  const roleRow = {
    id: 'role-1',
    name: 'Researcher',
    protectedKind: 'none',
    contextType: 'brand',
    branding: 'brand-1',
  };
  const userRow = { id: 'user-1', loginDisabled: false, roles: [{ ...roleRow }] };

  function effectiveWinner(): Record<string, unknown> {
    return {
      id: 'assignment-1',
      principalType: 'user',
      principalId: 'user-1',
      role: 'role-1',
      branding: 'brand-1',
      source: 'migration',
      sourceKey: 'legacy-role:user-1:role-1',
      status: 'active',
      sourcePresent: true,
      expiresAt: null,
      version: 1,
    };
  }

  function installMigrationHarness(options: {
    existingWinner: Record<string, unknown> | undefined;
    raceWinner?: Record<string, unknown>;
  }): () => void {
    const previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    const previousServices = sails.services;
    let findCalls = 0;
    sails.services = {
      ...previousServices,
      authorizationauditservice: { createSucceededEvent: async () => ({ id: 'audit-1' }) },
      authorizationpersistenceservice: {
        createRoleAssignment: async () => {
          // Simulate losing the check-then-create race on the unique tuple.
          if (options.raceWinner !== undefined) throw Object.assign(new Error('duplicate key'), { code: 'E_UNIQUE' });
          return { id: 'assignment-new', version: 1 };
        },
      },
    } as typeof sails.services;
    const names = ['User', 'RoleAssignment'] as const;
    const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
    Reflect.set(globalThis, 'User', {
      find: () => ({
        populate: (_assoc: string, _criteria?: unknown) => ({
          sort: () => ({ limit: () => Promise.resolve([{ ...userRow }]) }),
        }),
      }),
      getDatastore: () => ({
        ...txDatastore(),
        manager: { collection: () => ({ find: () => ({ limit: (n: number) => Promise.resolve([]) }) }) },
      }),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      findOne: () => ({
        usingConnection: async () => {
          findCalls += 1;
          // First call is the in-batch existence check; subsequent calls are
          // fresh-transaction rereads (pre-existing adoption audit and/or
          // duplicate-key race). Pre-existing winners reread identically;
          // race winners appear only after the failed creation.
          if (findCalls === 1) return options.existingWinner === undefined ? undefined : { ...options.existingWinner };
          if (options.raceWinner !== undefined) return { ...options.raceWinner };
          if (options.existingWinner !== undefined) return { ...options.existingWinner };
          return undefined;
        },
      }),
    });
    return () => {
      sails.models = previousModels;
      sails.services = previousServices;
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
    };
  }

  it('adopts an effective canonical winner without drift', async () => {
    await clearMigrationCheckpoint('assignments');
    const restore = installMigrationHarness({ existingWinner: effectiveWinner() });
    try {
      const summary = await new MigrationServices.AuthorizationMigrationService().migrateUserAssignments(10);
      assert.equal(summary.assignmentsCreated, 0);
      assert.deepEqual(summary.issues, []);
    } finally {
      restore();
      await clearMigrationCheckpoint('assignments');
    }
  });

  it('blocks revoked, suppressed, expired, source-absent, and mismatched winners', async () => {
    const cases: Array<{ name: string; mutate: (row: Record<string, unknown>) => void; code: string }> = [
      { name: 'revoked', mutate: row => void (row.status = 'revoked'), code: 'migration-winner-revoked' },
      { name: 'suppressed', mutate: row => void (row.status = 'suppressed'), code: 'migration-winner-suppressed' },
      {
        name: 'expired',
        mutate: row => void (row.expiresAt = '2020-01-01T00:00:00.000Z'),
        code: 'migration-winner-expired',
      },
      {
        name: 'source-absent',
        mutate: row => void (row.sourcePresent = false),
        code: 'migration-winner-source-absent',
      },
      {
        name: 'principal-mismatch',
        mutate: row => void (row.principalId = 'user-2'),
        code: 'migration-winner-principal-mismatch',
      },
      { name: 'role-mismatch', mutate: row => void (row.role = 'role-9'), code: 'migration-winner-role-mismatch' },
      {
        name: 'source-mismatch',
        mutate: row => void (row.sourceKey = 'legacy-role:user-1:role-9'),
        code: 'migration-winner-source-mismatch',
      },
      {
        name: 'brand-mismatch',
        mutate: row => void (row.branding = 'brand-9'),
        code: 'migration-winner-brand-mismatch',
      },
    ];
    for (const { name, mutate, code } of cases) {
      await clearMigrationCheckpoint('assignments');
      const winner = effectiveWinner();
      mutate(winner);
      const restore = installMigrationHarness({ existingWinner: winner });
      try {
        const summary = await new MigrationServices.AuthorizationMigrationService().migrateUserAssignments(10);
        const codes = summary.issues.map(issue => issue.code);
        assert.ok(codes.includes(code), `${name}: expected ${code}, got ${JSON.stringify(codes)}`);
        assert.equal(summary.assignmentsCreated, 0, `${name}: nothing must be created`);
      } finally {
        restore();
        await clearMigrationCheckpoint('assignments');
      }
    }
  });

  it('blocks a non-effective race winner instead of reporting idempotent success', async () => {
    await clearMigrationCheckpoint('assignments');
    const winner = effectiveWinner();
    winner.status = 'revoked';
    const restore = installMigrationHarness({ existingWinner: undefined, raceWinner: winner });
    try {
      const summary = await new MigrationServices.AuthorizationMigrationService().migrateUserAssignments(10);
      const codes = summary.issues.map(issue => issue.code);
      assert.ok(codes.includes('migration-winner-revoked'), `race winner must block, got ${codes}`);
      assert.equal(summary.metrics.conflictsResolved, 1);
      assert.equal(summary.assignmentsCreated, 0);
    } finally {
      restore();
      await clearMigrationCheckpoint('assignments');
    }
  });
});

describe('P3-R07 winner reread, validation, and noop audit share one fresh transaction', () => {
  const principal = { id: 'user-1', username: 'admin', accountLinkState: 'active', loginDisabled: false };
  const role = { id: 'role-system-1' };
  const winner = {
    id: 'assignment-winner',
    principalType: 'user',
    principalId: 'user-1',
    role: 'role-system-1',
    branding: null,
    source: 'recovery',
    sourceKey: 'bootstrap-parent-administrator',
    status: 'active',
    sourcePresent: true,
    expiresAt: null,
    version: 3,
    assignedBy: 'operator:seed',
    assignedAt: new Date(0).toISOString(),
  };

  function installWinnerHarness(options: {
    auditBehavior: 'succeed' | 'throw';
    connections: unknown[];
    auditConnections: unknown[];
    rereadConnections: unknown[];
  }): () => void {
    const previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    const previousServices = sails.services;
    sails.services = {
      ...previousServices,
      authorizationpersistenceservice: {
        createRoleAssignment: async (input: unknown, connection: unknown) => {
          options.connections.push(connection);
          throw Object.assign(new Error('duplicate key'), { code: 'E_UNIQUE' });
        },
      },
      authorizationauditservice: {
        createSucceededEvent: async (input: unknown, connection: unknown) => {
          options.auditConnections.push(connection);
          if (options.auditBehavior === 'throw') throw new Error('audit store unavailable');
          return { eventId: 'audit-1' };
        },
        recordAttempt: async () => ({ persisted: true }),
      },
    } as typeof sails.services;
    const names = ['User', 'RoleAssignment'] as const;
    const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
    Reflect.set(globalThis, 'User', {
      find: () => ({ limit: () => Promise.resolve([{ ...principal }]) }),
      findOne: () => ({ usingConnection: async () => ({ ...principal }) }),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      // Every transaction leases a distinct connection object so the test can
      // prove the winner reread never reuses the aborted creation session.
      getDatastore: () => ({
        transaction: async (work: (leased: unknown) => Promise<unknown>) => {
          const leased = { lease: `winner-tx-${options.connections.length}` };
          options.connections.push(leased);
          return work(leased);
        },
      }),
      findOne: () => ({
        usingConnection: async (connection: unknown) => {
          options.rereadConnections.push(connection);
          // The in-transaction existence check sees nothing (creation is
          // attempted and loses the race); the fresh post-failure reread sees
          // the concurrent winner.
          return options.rereadConnections.length === 1 ? undefined : { ...winner };
        },
      }),
    });
    const proto = BootstrapServices.AuthorizationBootstrapService.prototype as unknown as Record<string, unknown>;
    const originalEnsure = proto.ensureSystemRole;
    proto.ensureSystemRole = async () => ({ role: { ...role }, created: false });
    return () => {
      proto.ensureSystemRole = originalEnsure;
      sails.models = previousModels;
      sails.services = previousServices;
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
    };
  }

  it('rereads, validates, and audits the recovery winner on one fresh connection', async () => {
    const connections: unknown[] = [];
    const auditConnections: unknown[] = [];
    const rereadConnections: unknown[] = [];
    const restore = installWinnerHarness({
      auditBehavior: 'succeed',
      connections,
      auditConnections,
      rereadConnections,
    });
    try {
      const result = await new BootstrapServices.AuthorizationBootstrapService().recoverSystemAdministrator({
        target: 'user-1',
        confirmation: 'RECOVER-SYSTEM-ADMIN',
        reason: 'lockout rehearsal',
      });
      assert.equal(result.assignmentState, 'active');
      assert.equal(rereadConnections.length, 2);
      assert.equal(auditConnections.length, 1);
      // The winner reread and the noop audit share one fresh transaction
      // connection that is not the aborted creation-transaction connection.
      assert.equal(auditConnections[0], rereadConnections[1]);
      assert.notEqual(auditConnections[0], rereadConnections[0]);
      assert.notEqual(auditConnections[0], connections[0]);
    } finally {
      restore();
    }
  });

  it('rolls back the winner adoption when the in-transaction audit fails', async () => {
    const connections: unknown[] = [];
    const auditConnections: unknown[] = [];
    const rereadConnections: unknown[] = [];
    const restore = installWinnerHarness({ auditBehavior: 'throw', connections, auditConnections, rereadConnections });
    try {
      await assert.rejects(
        new BootstrapServices.AuthorizationBootstrapService().recoverSystemAdministrator({
          target: 'user-1',
          confirmation: 'RECOVER-SYSTEM-ADMIN',
          reason: 'lockout rehearsal',
        }),
        /audit store unavailable/
      );
      assert.equal(auditConnections.length, 1);
      assert.equal(auditConnections[0], rereadConnections[1]);
      assert.notEqual(auditConnections[0], rereadConnections[0]);
    } finally {
      restore();
    }
  });

  it('rereads, validates, and audits a bootstrap assignment winner in one transaction', async () => {
    const names = ['RoleAssignment', 'User'] as const;
    const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
    const previousServices = sails.services;
    const connections: unknown[] = [];
    const auditConnections: unknown[] = [];
    const rereadConnections: unknown[] = [];
    sails.services = {
      ...previousServices,
      authorizationpersistenceservice: {
        createRoleAssignment: async () => {
          throw Object.assign(new Error('duplicate key'), { code: 'E_UNIQUE' });
        },
      },
      authorizationauditservice: {
        createSucceededEvent: async (input: unknown, connection: unknown) => {
          auditConnections.push(connection);
          return { eventId: 'audit-1' };
        },
      },
    } as typeof sails.services;
    Reflect.set(globalThis, 'RoleAssignment', {
      getDatastore: () => ({
        transaction: async (work: (leased: unknown) => Promise<unknown>) => {
          const leased = { lease: `bootstrap-tx-${connections.length}` };
          connections.push(leased);
          return work(leased);
        },
      }),
      // Bounded ordered scan surface: the creation transaction scans the
      // protected source/key (and sees nothing, so creation is attempted and
      // loses the race); the fresh post-failure reread uses the exact-tuple
      // findOne below and sees the concurrent winner.
      find: () => ({
        sort: () => ({
          usingConnection: () => ({ limit: () => Promise.resolve([]) }),
        }),
      }),
      findOne: () => ({
        usingConnection: async (connection: unknown) => {
          // The creation transaction scans via the bounded `find` surface
          // above (seeing nothing) and attempts creation, losing the race;
          // this exact-tuple read runs only on the fresh post-failure reread
          // and sees the concurrent winner.
          rereadConnections.push(connection);
          return { ...winner };
        },
      }),
    });
    // In-transaction canonical principal revalidation requires the User
    // model: the pre-transaction principal is re-read inside the lease and
    // must still be the same canonical active user.
    Reflect.set(globalThis, 'User', {
      findOne: () => ({ usingConnection: async () => ({ id: 'user-1' }) }),
    });
    try {
      const service = new BootstrapServices.AuthorizationBootstrapService() as unknown as {
        ensureSystemAssignment: (
          role: unknown,
          principal: unknown,
          issues: unknown[]
        ) => Promise<{ created: boolean; repaired: boolean }>;
      };
      const result = await service.ensureSystemAssignment({ id: 'role-system-1' }, { id: 'user-1' }, []);
      assert.deepEqual(result, { created: false, repaired: false });
      assert.equal(rereadConnections.length, 1);
      assert.equal(auditConnections.length, 1);
      assert.equal(auditConnections[0], rereadConnections[0]);
      assert.notEqual(auditConnections[0], connections[0]);
    } finally {
      sails.services = previousServices;
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
    }
  });
});

describe('P3-R08 protected template scan uses separate cursors and fails closed', () => {
  it('fails closed with blocking incomplete drift when template models are absent', async () => {
    const previousModels = sails.models;
    const saved = installDriftGlobals({});
    // Production lifts always expose both models; their absence means the
    // scan verified nothing and must block instead of reading clean.
    Reflect.deleteProperty(globalThis, 'RoleTemplate');
    Reflect.deleteProperty(globalThis, 'RoleTemplateRevision');
    try {
      const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
      const blockers = report.issues.filter(issue => issue.severity === 'blocker').map(issue => issue.code);
      assert.ok(
        blockers.includes('protected-template-scan-incomplete'),
        `absent models must block, got ${JSON.stringify(blockers)}`
      );
    } finally {
      restoreDriftGlobals(saved, previousModels);
    }
  });

  it('rejects protected roles without an exact integer revision pin', async () => {
    const previousModels = sails.models;
    const pinless = {
      id: 'role-1',
      name: 'Admin',
      key: 'Admin',
      identityKey: 'brand:brand-1:Admin',
      displayName: 'Brand administrators',
      contextType: 'brand',
      branding: 'brand-1',
      protectedKind: 'brand-admin',
      status: 'active',
      version: 1,
      template: 'tmpl-brand-admin',
    };
    const zeroPin = {
      id: 'role-2',
      name: 'Admin',
      key: 'Admin',
      identityKey: 'brand:brand-1:Admin',
      displayName: 'Brand administrators',
      contextType: 'brand',
      branding: 'brand-1',
      protectedKind: 'brand-admin',
      status: 'active',
      version: 1,
      template: 'tmpl-brand-admin',
      templateRevision: 0,
    };
    const saved = installDriftGlobals({
      Role: {
        count: () => Promise.resolve(1),
        findOne: async () => undefined,
        find: (criteria: Record<string, unknown>) => ({
          sort: () => ({
            limit: () =>
              Promise.resolve(
                (criteria as { contextType?: string }).contextType === 'system' ? [] : [{ ...pinless }, { ...zeroPin }]
              ),
          }),
        }),
      },
      RoleAssignment: {
        count: () => Promise.resolve(0),
        find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
        findOne: async () => undefined,
      },
    });
    try {
      const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
      const missing = report.issues.filter(issue => issue.code === 'protected-role-revision-missing');
      // Both the roles section and the templates pin probe report a missing
      // pin defence-in-depth; assert the affected set, not a single reporter.
      assert.deepEqual([...new Set(missing.map(issue => issue.entityId))].sort(), ['role-1', 'role-2']);
    } finally {
      restoreDriftGlobals(saved, previousModels);
    }
  });

  it('paginates template and role-pin streams on separate cursors without skipping roles', async () => {
    const previousModels = sails.models;
    const role1 = {
      id: 'role-1',
      name: 'Admin',
      key: 'Admin',
      identityKey: 'brand:brand-1:Admin',
      displayName: 'Brand administrators',
      contextType: 'brand',
      branding: 'brand-1',
      protectedKind: 'brand-admin',
      status: 'active',
      version: 1,
      template: 'tmpl-brand-admin',
    };
    const role2 = {
      id: 'role-2',
      name: 'Admin',
      key: 'Admin',
      identityKey: 'brand:brand-1:Admin',
      displayName: 'Brand administrators',
      contextType: 'brand',
      branding: 'brand-1',
      protectedKind: 'brand-admin',
      status: 'active',
      version: 1,
      template: 'tmpl-brand-admin',
      templateRevision: 1,
    };
    const sysRole = {
      id: 'sys',
      name: 'system-admin',
      key: 'system-admin',
      identityKey: 'system:system-admin',
      displayName: 'System administrators',
      contextType: 'system',
      protectedKind: 'system-admin',
      status: 'active',
      version: 1,
      template: 'tmpl-system-admin',
      templateRevision: 1,
    };
    const saved = installDriftGlobals({
      Role: {
        count: () => Promise.resolve(1),
        findOne: async () => undefined,
        find: (criteria: Record<string, unknown>) => ({
          sort: () => ({
            limit: () =>
              Promise.resolve(
                (criteria as { contextType?: string }).contextType === 'system'
                  ? [{ ...sysRole }]
                  : [{ ...role1 }, { ...role2 }]
              ),
          }),
        }),
      },
      RoleAssignment: {
        count: () => Promise.resolve(2),
        find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
        findOne: async () => undefined,
      },
      // Template definitions are missing (drift), but role pins resolve
      // against healthy template rows so the pin check itself is exercised.
      RoleTemplate: {
        findOne: async (criteria: Record<string, unknown>) =>
          criteria.id !== undefined
            ? {
                id: criteria.id,
                status: 'active',
                key: String(criteria.id).startsWith('tmpl-system') ? 'system-admin' : 'brand-admin',
                protectedKind: String(criteria.id).startsWith('tmpl-system') ? 'system-admin' : 'brand-admin',
                currentRevision: 1,
              }
            : undefined,
      },
      RoleTemplateRevision: {
        findOne: async () => ({ scopeKeys: [] }),
      },
    });
    try {
      const service = new MigrationServices.AuthorizationMigrationService();
      const codes: string[] = [];
      let continuation: string | undefined;
      let pages = 0;
      for (;;) {
        pages += 1;
        assert.ok(pages < 10, 'must progress, not loop forever');
        const page = await service.reportDrift(2, continuation);
        for (const issue of page.issues) codes.push(`${issue.code}:${issue.entityId ?? ''}`);
        if (page.truncated) assert.ok(page.continuation !== undefined, 'truncated must carry continuation');
        continuation = page.continuation;
        if (!page.truncated) break;
      }
      const missingTemplates = codes.filter(code => code.startsWith('protected-template-missing:')).sort();
      assert.equal(missingTemplates.length, 5);
      // role-1 has no revision pin and must still be reported even though the
      // template-stream cursor lexically sorts after every `role:*` item.
      assert.ok(
        codes.includes('protected-role-revision-missing:role-1'),
        `role stream must not be skipped, got ${JSON.stringify(codes)}`
      );
      assert.ok(
        !codes.some(code => code.startsWith('protected-role-pin-invalid')),
        `valid pin must stay silent, got ${JSON.stringify(codes)}`
      );
    } finally {
      restoreDriftGlobals(saved, previousModels);
    }
  });
});

describe('Phase 3 acceptance remediation R2-R9 regressions', () => {
  it('R2: fails closed when a scan chain exposes no .limit bound', async () => {
    const previousModels = sails.models;
    const saved = installDriftGlobals({
      Role: {
        count: () => Promise.resolve(0),
        findOne: async () => undefined,
        // No .limit method: the bound cannot be enforced.
        find: () => ({ sort: () => Promise.resolve([{ id: 'x' }]) }),
      },
    });
    try {
      const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(10);
      const codes = report.issues.map(i => i.code);
      assert.ok(
        codes.includes('system-role-scan-incomplete') ||
          codes.includes('protected-role-scan-incomplete') ||
          codes.includes('protected-template-scan-incomplete'),
        `unbounded scan must block, got ${JSON.stringify(codes)}`
      );
    } finally {
      restoreDriftGlobals(saved, previousModels);
    }
  });

  it('R3: rejects a direct assignment for an unrelated primary as missing projection', async () => {
    const previousModels = sails.models;
    // Canonical user-1 holds role-1; alias user-2 points at a different primary
    // (user-9) and never held role-1. An assignment for user-1 with sourceKey
    // claiming alias user-2 must fail linkage validation.
    const saved = installDriftGlobals({
      BrandingConfig: { find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) },
      Role: {
        count: () => Promise.resolve(1),
        findOne: async () => undefined,
        find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }),
      },
      RoleAssignment: {
        count: () => Promise.resolve(0),
        find: () => ({
          populate: () => ({
            sort: () => ({
              limit: () =>
                Promise.resolve([
                  {
                    id: 'a-unrelated',
                    principalType: 'user',
                    principalId: 'user-1',
                    role: { id: 'role-1', name: 'Researcher', contextType: 'brand', protectedKind: 'none' },
                    branding: 'brand-1',
                    source: 'migration',
                    sourceKey: 'legacy-role:user-2:role-1',
                    status: 'active',
                    sourcePresent: true,
                    expiresAt: null,
                  },
                ]),
            }),
          }),
        }),
        findOne: async () => undefined,
      },
      User: {
        find: () => ({
          populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }),
        }),
        findOne: (criteria: Record<string, unknown>) => ({
          populate: () =>
            Promise.resolve(
              String((criteria as { id?: string }).id) === 'user-2'
                ? { id: 'user-2', linkedPrimaryUserId: 'user-9', accountLinkState: 'linked-alias' }
                : String((criteria as { id?: string }).id) === 'user-1'
                  ? { id: 'user-1', roles: [{ id: 'role-1', name: 'Researcher' }] }
                  : undefined
            ),
        }),
      },
    });
    try {
      const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(10);
      const codes = report.issues.map(i => `${i.code}:${i.entityId ?? ''}`);
      assert.ok(
        codes.some(c => c.startsWith('new-assignment-legacy-projection-missing:a-unrelated')),
        `unrelated alias/primary must block, got ${JSON.stringify(codes)}`
      );
    } finally {
      restoreDriftGlobals(saved, previousModels);
    }
  });

  it('R6: traverses >501 protected role pins across pages via ordered cursor', async () => {
    const previousModels = sails.models;
    // 503 exact brand-admin pins except the 501st (index 500), which misses
    // its template pin so drift must report pin-invalid for exactly that pin
    // while still traversing every page.
    const pins = Array.from({ length: 503 }, (_, i) => {
      const id = `role-${String(i).padStart(4, '0')}`;
      const key = `Admin${String(i).padStart(4, '0')}`;
      return {
        id,
        name: key,
        key,
        identityKey: `brand:brand-1:${key}`,
        displayName: `Admin ${i}`,
        contextType: 'brand',
        branding: 'brand-1',
        protectedKind: 'brand-admin',
        status: 'active',
        version: 2,
        template: i === 500 ? undefined : 'tmpl-brand-admin',
        templateRevision: 1,
      };
    });
    const saved = installDriftGlobals({
      Role: {
        count: () => Promise.resolve(0),
        findOne: async () => undefined,
        find: (criteria: Record<string, unknown>) => ({
          sort: () => ({
            limit: (n: number) => {
              const c = criteria as { id?: { '>': string } };
              const cursor = c.id?.['>'];
              const filtered = cursor === undefined ? pins : pins.filter(p => p.id > String(cursor));
              return Promise.resolve(filtered.slice(0, n));
            },
          }),
        }),
      },
      RoleAssignment: {
        count: () => Promise.resolve(0),
        find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
        findOne: async () => undefined,
      },
      RoleTemplate: {
        findOne: async (criteria: Record<string, unknown>) =>
          criteria.id !== undefined ? { id: criteria.id, status: 'active' } : undefined,
      },
      RoleTemplateRevision: { findOne: async () => ({ scopeKeys: [] }) },
    });
    try {
      const service = new MigrationServices.AuthorizationMigrationService();
      const seen = new Set<string>();
      let continuation: string | undefined;
      let pages = 0;
      for (;;) {
        pages += 1;
        assert.ok(pages < 15, 'must progress across >501 pins');
        const page = await service.reportDrift(100, continuation);
        for (const issue of page.issues) {
          if (issue.entityId?.startsWith('role-')) seen.add(issue.entityId);
        }
        if (page.truncated) assert.ok(page.continuation !== undefined);
        continuation = page.continuation;
        if (!page.truncated) break;
      }
      assert.ok(pages >= 2, `>501 pins must require multiple pages, got ${pages}`);
      // Meaningful traversal: the malformed 501st pin must be reported with
      // exact identity drift, proving pages beyond 501 are validated, not skipped.
      assert.ok(
        seen.has('role-0500'),
        `malformed 501st pin must be reported, got ${JSON.stringify([...seen].slice(0, 5))}`
      );
    } finally {
      restoreDriftGlobals(saved, previousModels);
    }
  });

  it('R7: rejects malformed system role displayName/version and branded assignments', async () => {
    const badRole = {
      id: 'sys-bad',
      name: 'system-admin',
      key: 'system-admin',
      identityKey: 'system:system-admin',
      displayName: '   ',
      contextType: 'system',
      template: 'tmpl-sys',
      templateRevision: 1,
      protectedKind: 'system-admin',
      status: 'active',
      version: 0,
      branding: 'brand-1',
    };
    // Malformed persisted identity is never the exact protected identity:
    // empty displayName, non-positive version, and branded system shape all reject.
    assert.equal(isExactSystemAdminRole(badRole), false);
    assert.equal(
      isExactSystemAdminRole({
        ...badRole,
        displayName: 'System administrators',
        version: 2,
        branding: null,
      }),
      true
    );
    const branded = {
      status: 'active',
      sourcePresent: true,
      expiresAt: null,
      branding: 'brand-1',
      version: 1,
      principalType: 'user',
      principalId: 'user-1',
      role: 'role-sys',
      source: 'recovery',
      sourceKey: 'bootstrap-parent-administrator',
      assignedBy: 'operator:x',
      assignedAt: new Date(),
    };
    assert.equal(
      protectedSystemAssignmentBootstrapIssue(
        branded as unknown as Parameters<typeof protectedSystemAssignmentBootstrapIssue>[0],
        new Date(),
        { principalId: 'user-1', roleId: 'role-sys' }
      ),
      'bootstrap-system-assignment-noncanonical'
    );
    const unversioned = { ...branded, branding: null, version: 0 };
    assert.equal(
      protectedSystemAssignmentBootstrapIssue(
        unversioned as unknown as Parameters<typeof protectedSystemAssignmentBootstrapIssue>[0],
        new Date(),
        { principalId: 'user-1', roleId: 'role-sys' }
      ),
      'bootstrap-system-assignment-noncanonical'
    );
  });

  it('R9: rejects malformed template t/r subcursors fail-closed', async () => {
    const previousModels = sails.models;
    const saved = installDriftGlobals({});
    try {
      const service = new MigrationServices.AuthorizationMigrationService();
      // First obtain a valid continuation, then tamper with the t/r section.
      const first = await service.reportDrift(1);
      void first;
      const tampered = Buffer.from(
        JSON.stringify({ v: 1, cursors: { templates: 'not-a-t/r-cursor' }, completed: [] })
      ).toString('base64url');
      await assert.rejects(service.reportDrift(10, tampered), /continuation cursor is invalid/);
    } finally {
      restoreDriftGlobals(saved, previousModels);
    }
  });
});
