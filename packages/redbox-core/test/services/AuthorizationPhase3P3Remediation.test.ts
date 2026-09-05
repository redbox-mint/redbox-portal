import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';

import {
  Services as MigrationServices,
  clearMigrationCheckpoint,
  readMigrationCheckpoint,
  writeMigrationCheckpoint,
} from '../../src/services/AuthorizationMigrationService';
import { Services as BootstrapServices } from '../../src/services/AuthorizationBootstrapService';
import { isExactGuestRole, isExactSystemAdminRole, isExactBrandAdminRole } from '../../src/authorization';

const connection = Object.freeze({ lease: 'p3-remediation' });

function txDatastore(extra: Record<string, unknown> = {}): Sails.Datastore {
  return {
    transaction: async (work: (leased: Sails.Connection) => Promise<unknown>) => work(connection),
    ...extra,
  } as unknown as Sails.Datastore;
}

function stubAuditServices(): typeof sails.services {
  const previous = sails.services;
  sails.services = {
    ...previous,
    authorizationauditservice: { createSucceededEvent: async () => ({ id: 'audit-1' }) },
    authorizationpersistenceservice: {
      createRoleAssignment: async (input: unknown) => ({
        id: 'assignment-1',
        ...(typeof input === 'object' && input !== null ? input : {}),
      }),
    },
    authorizationscopeservice: {
      bootstrap: async () => ({}),
      getRegistry: () => ({ isActive: () => true }),
    },
  };
  return previous;
}

describe('P3-001: >501 legacy associations block without partial migration', () => {
  const names = ['User', 'Role', 'RoleAssignment', 'RoleTemplate'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;
  let savedModels: typeof sails.models;
  let createdAssignments = 0;

  beforeEach(() => {
    saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
    savedServices = stubAuditServices();
    savedModels = sails.models;
    sails.models = {} as typeof sails.models;
    createdAssignments = 0;
    const overflowRoles = Array.from({ length: 501 }, (_, i) => ({
      id: `role-${String(i).padStart(4, '0')}`,
      name: `Role${i}`,
      contextType: 'brand',
      branding: 'brand-1',
      protectedKind: 'none',
    }));
    Reflect.set(globalThis, 'User', {
      find: () => ({
        populate: () => ({ sort: () => ({ limit: () => Promise.resolve([{ id: 'user-1', roles: overflowRoles }]) }) }),
        sort: () => ({ limit: () => Promise.resolve([{ id: 'user-1', roles: overflowRoles }]) }),
      }),
      getDatastore: () => txDatastore(),
    });
    Reflect.set(globalThis, 'Role', { getDatastore: () => txDatastore() });
    Reflect.set(globalThis, 'RoleTemplate', { find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) });
    Reflect.set(globalThis, 'RoleAssignment', {
      findOne: () => ({ usingConnection: async () => undefined }),
    });
    sails.services = {
      ...sails.services,
      authorizationpersistenceservice: {
        createRoleAssignment: async (input: unknown) => {
          createdAssignments += 1;
          return { id: `assignment-${createdAssignments}`, ...(input as object) };
        },
      },
    };
  });

  afterEach(() => {
    for (const n of names) {
      const d = saved.get(n);
      if (d === undefined) Reflect.deleteProperty(globalThis, n);
      else Object.defineProperty(globalThis, n, d);
    }
    sails.services = savedServices;
    sails.models = savedModels;
  });

  it('emits user-role-associations-overflow, creates nothing, and holds the checkpoint', async () => {
    await clearMigrationCheckpoint('assignments');
    const summary = await new MigrationServices.AuthorizationMigrationService().migrateUserAssignments(10);
    assert.ok(
      summary.issues.some(i => i.code === 'user-role-associations-overflow' && i.severity === 'blocker'),
      `expected overflow blocker, got ${JSON.stringify(summary.issues)}`
    );
    assert.equal(createdAssignments, 0, 'partial migration must not create assignments');
    assert.equal(summary.assignmentsCreated, 0);
    const checkpoint = await readMigrationCheckpoint('assignments');
    // Checkpoint must not advance past the overflow user: either absent or
    // without a lastId beyond the blocked user.
    assert.ok(checkpoint === undefined || checkpoint.lastId === undefined);
  });
});

describe('P3-002: Guest 501st unsafe override is removed via paging', () => {
  it('pages override scans so the 501st unsafe row is evaluated', async () => {
    const overrides = Array.from({ length: 501 }, (_, i) => ({
      id: `ov-${String(i).padStart(4, '0')}`,
      role: 'guest-1',
      scopeKey: i === 500 ? 'record.delete' : 'authorization.self.read',
      effect: 'add',
    }));
    const destroyed: unknown[] = [];
    const names = ['BrandingConfig', 'Role', 'RoleTemplate', 'RoleScopeOverride', 'AuthorizationAudit'] as const;
    const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
    const savedServices = sails.services;
    sails.services = {
      ...sails.services,
      authorizationscopeservice: {
        bootstrap: async () => ({}),
        getRegistry: () => ({ isActive: (k: string) => k !== 'record.delete' }),
      },
      authorizationmigrationservice: {
        reconcileBrandRoles: async () => ({ issues: [], metrics: { conflictsResolved: 0, transactionFailures: 0 } }),
        reportDrift: async () => ({
          generatedAt: new Date(0).toISOString(),
          issues: [],
          truncated: false,
          summary: { blocker: 0, warning: 0, expected: 0 },
        }),
      },
      authorizationauditservice: { createSucceededEvent: async () => ({ id: 'audit-1' }) },
      authorizationpersistenceservice: { createRoleAssignment: async () => ({ id: 'a-1' }) },
    };
    Reflect.set(globalThis, 'BrandingConfig', {
      find: () => ({ sort: () => ({ limit: () => Promise.resolve([{ id: 'brand-1' }]) }) }),
    });
    Reflect.set(globalThis, 'RoleTemplate', { findOne: async () => ({ id: 'tmpl-guest' }) });
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
    Reflect.set(globalThis, 'Role', {
      find: () => ({
        sort: () => ({
          usingConnection: () => ({ limit: (n: number) => Promise.resolve([{ ...guestRow }].slice(0, n)) }),
        }),
      }),
      updateOne: () => ({ set: () => ({ meta: () => ({ usingConnection: async () => ({ ...guestRow }) }) }) }),
      getDatastore: () => txDatastore(),
    });
    Reflect.set(globalThis, 'RoleScopeOverride', {
      find: (criteria: Record<string, unknown>) => ({
        sort: () => ({
          usingConnection: () => ({
            limit: (n: number) => {
              const cursor = (criteria as { id?: { '>': string } }).id?.['>'];
              const filtered = cursor === undefined ? overrides : overrides.filter(o => o.id > String(cursor));
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
    Reflect.set(globalThis, 'AuthorizationAudit', { getDatastore: () => txDatastore() });
    try {
      await new BootstrapServices.AuthorizationBootstrapService().bootstrap({});
      const destroyedIds = JSON.stringify(destroyed);
      assert.ok(destroyedIds.includes('ov-0500'), `501st unsafe override must be destroyed, got ${destroyedIds}`);
    } finally {
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
      sails.services = savedServices;
    }
  });
});

describe('P3-003/004: exact protected identity validators', () => {
  it('requires positive version and exact brandless identity', () => {
    assert.equal(
      isExactSystemAdminRole({
        name: 'system-admin',
        key: 'system-admin',
        identityKey: 'system:system-admin',
        displayName: 'System administrators',
        contextType: 'system',
        branding: null,
        protectedKind: 'system-admin',
        version: 2,
      }),
      true
    );
    // Name-only match without exact identity is not exempt.
    assert.equal(
      isExactSystemAdminRole({ name: 'system-admin', contextType: 'brand', branding: 'brand-1', version: 1 } as never),
      false
    );
    assert.equal(
      isExactGuestRole(
        {
          name: 'Guest',
          key: 'Guest',
          identityKey: 'brand:brand-1:Guest',
          displayName: '',
          contextType: 'brand',
          branding: 'brand-1',
          protectedKind: 'guest',
          version: 1,
        } as never,
        'brand-1'
      ),
      false,
      'empty displayName must not validate'
    );
    assert.equal(
      isExactBrandAdminRole(
        {
          name: 'Admin',
          key: 'Admin',
          identityKey: 'brand:brand-1:Admin',
          displayName: 'Brand administrators',
          contextType: 'brand',
          branding: 'brand-1',
          protectedKind: 'brand-admin',
          version: 0,
        } as never,
        'brand-1'
      ),
      false,
      'non-positive version must not validate'
    );
    // Raw missing-key rows never fall back to `name`: a Guest or system-admin
    // name match without the exact persisted `key` is not protected.
    assert.equal(
      isExactGuestRole(
        {
          name: 'Guest',
          identityKey: 'brand:brand-1:Guest',
          displayName: 'Guest',
          contextType: 'brand',
          branding: 'brand-1',
          protectedKind: 'guest',
          version: 1,
        } as never,
        'brand-1'
      ),
      false,
      'missing Guest key must not validate via name fallback'
    );
    assert.equal(
      isExactGuestRole(
        {
          name: 'Guest',
          key: undefined,
          identityKey: 'brand:brand-1:Guest',
          displayName: 'Guest',
          contextType: 'brand',
          branding: 'brand-1',
          protectedKind: 'guest',
          version: 1,
        } as never,
        'brand-1'
      ),
      false,
      'explicit undefined Guest key must not validate via name fallback'
    );
    assert.equal(
      isExactSystemAdminRole({
        name: 'system-admin',
        identityKey: 'system:system-admin',
        displayName: 'System administrators',
        contextType: 'system',
        branding: null,
        protectedKind: 'system-admin',
        version: 2,
      } as never),
      false,
      'missing system-admin key must not validate via name fallback'
    );
    assert.equal(
      isExactSystemAdminRole({
        name: 'system-admin',
        key: undefined,
        identityKey: 'system:system-admin',
        displayName: 'System administrators',
        contextType: 'system',
        branding: null,
        protectedKind: 'system-admin',
        version: 2,
      } as never),
      false,
      'explicit undefined system-admin key must not validate via name fallback'
    );
  });
});

describe('P3-005: oversized brand-admin and record ACL scans block', () => {
  it('reports brand-admin scan truncation and bounds record ACL lookups', async () => {
    const previousModels = sails.models;
    sails.models = {
      record: {
        find: () => ({
          sort: () => ({
            limit: () =>
              Promise.resolve([
                {
                  id: 'record-oversized',
                  metaMetadata: { brandId: 'brand-1' },
                  authorization: {
                    viewRoles: Array.from({ length: 501 }, (_, i) => `Role${i}`),
                    editRoles: [],
                  },
                },
              ]),
          }),
        }),
      },
    } as unknown as typeof sails.models;
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
    let roleFindCalls = 0;
    const bulkLookupKeyLengths: number[] = [];
    const bulkLookupLimits: number[] = [];
    Reflect.set(globalThis, 'BrandingConfig', {
      find: () => ({ sort: () => ({ limit: () => Promise.resolve([{ id: 'brand-1' }]) }) }),
    });
    Reflect.set(globalThis, 'Role', {
      count: () => Promise.resolve(1),
      findOne: async (criteria: Record<string, unknown>) => {
        if ((criteria as { protectedKind?: string }).protectedKind === 'guest') {
          return {
            id: 'guest-brand-1',
            name: 'Guest',
            key: 'Guest',
            identityKey: 'brand:brand-1:Guest',
            displayName: 'Guest',
            contextType: 'brand',
            branding: 'brand-1',
            protectedKind: 'guest',
            status: 'active',
            version: 2,
          };
        }
        return undefined;
      },
      find: (criteria: Record<string, unknown>) => {
        roleFindCalls += 1;
        const asQuery = (value: unknown) => {
          const q: Record<string, unknown> = {};
          q.sort = () => q;
          q.limit = (n: number) => {
            bulkLookupLimits.push(n);
            return Promise.resolve(Array.isArray(value) ? value.slice(0, n) : value);
          };
          q.populate = () => q;
          q.then = (a?: (v: unknown) => unknown, b?: (r: unknown) => unknown) => Promise.resolve(value).then(a, b);
          return q;
        };
        if (
          (criteria as { branding?: string }).branding === 'brand-1' &&
          (criteria as { key?: unknown }).key !== undefined
        ) {
          // Bulk record-ACL lookup: single call with the bounded key array.
          const keys = (criteria as { key: string[] }).key;
          bulkLookupKeyLengths.push(Array.isArray(keys) ? keys.length : -1);
          assert.ok(Array.isArray(keys) && keys.length <= 500, 'record ACL lookup must be bounded and bulk');
          return asQuery([]);
        }
        return asQuery([
          {
            id: 'brand-admin-brand-1',
            name: 'Admin',
            key: 'Admin',
            identityKey: 'brand:brand-1:Admin',
            displayName: 'Brand administrators',
            contextType: 'brand',
            protectedKind: 'brand-admin',
            branding: 'brand-1',
            status: 'active',
            version: 2,
            template: 'tmpl-brand-admin',
            templateRevision: 1,
          },
        ]);
      },
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      count: () => Promise.resolve(1),
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
      findOne: async () => undefined,
    });
    Reflect.set(globalThis, 'User', {
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    Reflect.set(globalThis, 'PathRule', {
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    Reflect.set(globalThis, 'RoleTemplate', {
      findOne: async (c: Record<string, unknown>) =>
        c.key !== undefined
          ? { id: `tmpl-${String(c.key)}`, key: String(c.key), status: 'active', currentRevision: 1 }
          : undefined,
    });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      findOne: async () => ({ scopeKeys: [] }),
    });
    try {
      const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
      // Exact oversized-ACL blocker: 501 role keys exceed the 500-key bound.
      const truncated = report.issues.filter(i => i.code === 'record-acl-scan-truncated');
      assert.equal(
        truncated.length,
        1,
        `expected exactly one truncation blocker, got ${JSON.stringify(report.issues)}`
      );
      assert.equal(truncated[0].severity, 'blocker');
      assert.equal(truncated[0].entityType, 'protected-state');
      assert.equal(truncated[0].entityId, 'record-oversized');
      // The bounded prefix is verified via a single bulk lookup of exactly
      // 500 keys with an enforced adapter limit of 501 (limit+1 probe).
      assert.ok(roleFindCalls >= 1);
      assert.ok(bulkLookupKeyLengths.length >= 1, 'expected at least one bulk record-ACL lookup');
      for (const length of bulkLookupKeyLengths) assert.equal(length, 500);
      assert.ok(bulkLookupLimits.includes(501), `bulk lookup must enforce limit 501, got ${bulkLookupLimits}`);
      // The healthy single brand-admin pin must not report truncation here.
      assert.ok(
        !report.issues.some(i => i.code === 'brand-admin-role-scan-truncated'),
        `unexpected brand-admin truncation, got ${JSON.stringify(report.issues)}`
      );
      assert.ok(report.summary.blocker >= truncated.length);
      assert.ok(report.summary.blocker >= 1);
    } finally {
      sails.models = previousModels;
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
    }
  });

  it('blocks with an exact entity when the brand-admin pin scan overflows 501', async () => {
    const previousModels = sails.models;
    sails.models = {} as unknown as typeof sails.models;
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
    const probeLimits: number[] = [];
    const oversizedAdmins = Array.from({ length: 502 }, (_, i) => ({
      id: `brand-admin-${String(i).padStart(4, '0')}`,
      name: 'Admin',
      key: 'Admin',
      identityKey: 'brand:brand-1:Admin',
      displayName: 'Brand administrators',
      contextType: 'brand',
      protectedKind: 'brand-admin',
      branding: 'brand-1',
      status: 'active',
      version: 2,
      template: 'tmpl-brand-admin',
      templateRevision: 1,
    }));
    Reflect.set(globalThis, 'BrandingConfig', {
      find: () => ({ sort: () => ({ limit: () => Promise.resolve([{ id: 'brand-1' }]) }) }),
    });
    Reflect.set(globalThis, 'Role', {
      count: () => Promise.resolve(1),
      findOne: async () => ({
        id: 'guest-brand-1',
        name: 'Guest',
        key: 'Guest',
        identityKey: 'brand:brand-1:Guest',
        displayName: 'Guest',
        contextType: 'brand',
        branding: 'brand-1',
        protectedKind: 'guest',
        status: 'active',
        version: 2,
      }),
      find: (criteria: Record<string, unknown>) => {
        const isBulkAcl =
          (criteria as { branding?: string }).branding === 'brand-1' &&
          (criteria as { key?: unknown }).key !== undefined;
        const value = isBulkAcl ? [] : oversizedAdmins;
        const q: Record<string, unknown> = {};
        q.sort = () => q;
        q.limit = (n: number) => {
          if (!isBulkAcl) probeLimits.push(n);
          return Promise.resolve((value as unknown[]).slice(0, n));
        };
        q.populate = () => q;
        return q;
      },
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      count: () => Promise.resolve(1),
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
      findOne: async () => undefined,
    });
    Reflect.set(globalThis, 'User', {
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    Reflect.set(globalThis, 'PathRule', {
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    Reflect.set(globalThis, 'RoleTemplate', {
      findOne: async (c: Record<string, unknown>) =>
        c.key !== undefined
          ? { id: `tmpl-${String(c.key)}`, key: String(c.key), status: 'active', currentRevision: 1 }
          : undefined,
    });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      findOne: async () => ({ scopeKeys: [] }),
    });
    try {
      const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
      const truncated = report.issues.filter(i => i.code === 'brand-admin-role-scan-truncated');
      assert.equal(
        truncated.length,
        1,
        `expected exactly one brand-admin truncation blocker, got ${JSON.stringify(report.issues)}`
      );
      assert.equal(truncated[0].severity, 'blocker');
      assert.equal(truncated[0].entityType, 'protected-state');
      assert.equal(truncated[0].entityId, 'brand-1');
      // The probe enforces a 502 (501+1) adapter bound so overflow is detected.
      assert.ok(probeLimits.includes(502), `brand-admin probe must enforce limit 502, got ${probeLimits}`);
      assert.ok(report.summary.blocker >= 1);
    } finally {
      sails.models = previousModels;
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
    }
  });

  it('treats exactly 500 record ACL keys as bounded (no truncation blocker)', async () => {
    const previousModels = sails.models;
    sails.models = {
      record: {
        find: () => ({
          sort: () => ({
            limit: () =>
              Promise.resolve([
                {
                  id: 'record-boundary',
                  metaMetadata: { brandId: 'brand-1' },
                  authorization: {
                    viewRoles: Array.from({ length: 500 }, (_, i) => `Role${i}`),
                    editRoles: [],
                  },
                },
              ]),
          }),
        }),
      },
    } as unknown as typeof sails.models;
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
    const keyLengths: number[] = [];
    Reflect.set(globalThis, 'BrandingConfig', {
      find: () => ({ sort: () => ({ limit: () => Promise.resolve([{ id: 'brand-1' }]) }) }),
    });
    Reflect.set(globalThis, 'Role', {
      count: () => Promise.resolve(1),
      findOne: async () => ({
        id: 'guest-brand-1',
        name: 'Guest',
        key: 'Guest',
        identityKey: 'brand:brand-1:Guest',
        displayName: 'Guest',
        contextType: 'brand',
        branding: 'brand-1',
        protectedKind: 'guest',
        status: 'active',
        version: 2,
      }),
      find: (criteria: Record<string, unknown>) => {
        const asQuery = (value: unknown) => {
          const q: Record<string, unknown> = {};
          q.sort = () => q;
          q.limit = (n: number) => Promise.resolve(Array.isArray(value) ? value.slice(0, n) : value);
          q.populate = () => q;
          return q;
        };
        if (
          (criteria as { branding?: string }).branding === 'brand-1' &&
          (criteria as { key?: unknown }).key !== undefined
        ) {
          const keys = (criteria as { key: string[] }).key;
          keyLengths.push(keys.length);
          return asQuery(keys.map(key => ({ key, name: key })));
        }
        return asQuery([
          {
            id: 'brand-admin-brand-1',
            name: 'Admin',
            key: 'Admin',
            identityKey: 'brand:brand-1:Admin',
            displayName: 'Brand administrators',
            contextType: 'brand',
            protectedKind: 'brand-admin',
            branding: 'brand-1',
            status: 'active',
            version: 2,
            template: 'tmpl-brand-admin',
            templateRevision: 1,
          },
        ]);
      },
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      count: () => Promise.resolve(1),
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
      findOne: async () => undefined,
    });
    Reflect.set(globalThis, 'User', {
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    Reflect.set(globalThis, 'PathRule', {
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    Reflect.set(globalThis, 'RoleTemplate', {
      findOne: async (c: Record<string, unknown>) =>
        c.key !== undefined
          ? { id: `tmpl-${String(c.key)}`, key: String(c.key), status: 'active', currentRevision: 1 }
          : undefined,
    });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      findOne: async () => ({ scopeKeys: [] }),
    });
    try {
      const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
      assert.ok(
        !report.issues.some(i => i.code === 'record-acl-scan-truncated'),
        `500 keys must not truncate, got ${JSON.stringify(report.issues)}`
      );
      assert.deepEqual(keyLengths, [500]);
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

describe('P3-006: checkpoints persist cumulative counters and metadata', () => {
  it('round-trips counters and blocker metadata across a simulated restart', async () => {
    const store = new Map<string, Record<string, unknown>>();
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
              const set = (u as { $set?: Record<string, unknown> }).$set ?? {};
              store.set('20260828T120000-authorization-model-v1:roles', {
                ...store.get('20260828T120000-authorization-model-v1:roles'),
                ...(f as object),
                ...set,
              });
              return {};
            },
            deleteOne: async () => {
              store.delete('20260828T120000-authorization-model-v1:roles');
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
        issuesTruncated: false,
        blockerIssues: [{ code: 'role-brand-missing', entityType: 'role', entityId: 'role-9' }],
        rolesScanned: 42,
        usersScanned: 7,
        assignmentsCreated: 3,
        guestAssociationsSkipped: 1,
        batchesApplied: 5,
        conflictsResolved: 2,
        transactionFailures: 1,
      });
      const reread = await readMigrationCheckpoint('roles');
      assert.equal(reread?.rolesScanned, 42);
      assert.equal(reread?.usersScanned, 7);
      assert.equal(reread?.blockerIssues?.[0]?.entityId, 'role-9');
      await clearMigrationCheckpoint('roles');
      assert.equal(await readMigrationCheckpoint('roles'), undefined);
    } finally {
      Reflect.deleteProperty(globalThis, 'Role');
    }
  });
});

describe('P3-007: template subcursor rejects invalid shapes', () => {
  it('rejects non-canonical alphabet, empty values, zero offset, and wrong stream prefix', async () => {
    const svc = new MigrationServices.AuthorizationMigrationService();
    const badCursors = [
      'not-a-t/r-cursor',
      `t=${Buffer.from('role:x', 'utf8').toString('base64url')};r=`,
      `t=;r=${Buffer.from('template:x', 'utf8').toString('base64url')}`,
      `t=${Buffer.from('template:a#0', 'utf8').toString('base64url')};r=`,
      `t=${Buffer.from('template:a#', 'utf8').toString('base64url')};r=`,
      't=!!!;r=',
      `t=${Buffer.from('', 'utf8').toString('base64url') || 'eA'};r=`,
      // Anchored strict grammar: any extra `#` delimiter rejects, even with a
      // numeric trailing suffix that lastIndexOf parsing would accept.
      `t=${Buffer.from('template:a#b#1', 'utf8').toString('base64url')};r=`,
      `t=${Buffer.from('template:a#1#2', 'utf8').toString('base64url')};r=`,
      `t=${Buffer.from('template:a##1', 'utf8').toString('base64url')};r=`,
      `t=${Buffer.from('template:#1', 'utf8').toString('base64url')};r=`,
      `t=;r=${Buffer.from('role:x#1#2', 'utf8').toString('base64url')}`,
      `t=;r=${Buffer.from('role:a#b', 'utf8').toString('base64url')}`,
      `t=${Buffer.from('template:a#501', 'utf8').toString('base64url')};r=`,
    ];
    const previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    const saved = new Map(
      (
        [
          'BrandingConfig',
          'Role',
          'RoleAssignment',
          'User',
          'PathRule',
          'RoleTemplate',
          'RoleTemplateRevision',
        ] as const
      ).map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)])
    );
    Reflect.set(globalThis, 'BrandingConfig', { find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) });
    Reflect.set(globalThis, 'Role', {
      count: () => Promise.resolve(0),
      find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }),
      findOne: async () => undefined,
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      count: () => Promise.resolve(0),
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
      findOne: async () => undefined,
    });
    Reflect.set(globalThis, 'User', {
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    Reflect.set(globalThis, 'PathRule', {
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    try {
      for (const templates of badCursors) {
        const token = Buffer.from(JSON.stringify({ v: 1, cursors: { templates }, completed: [] }), 'utf8').toString(
          'base64url'
        );
        await assert.rejects(svc.reportDrift(10, token), /continuation cursor is invalid/);
      }
    } finally {
      sails.models = previousModels;
      for (const [n, d] of saved) {
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
    }
  });

  it('rejects extra # delimiters in generic section cursors', async () => {
    const svc = new MigrationServices.AuthorizationMigrationService();
    const badSectionCursors = ['brand-1#2#3', 'brand-1##2', '#2', 'a#b', 'item#1#', 'x#0#1'];
    for (const brands of badSectionCursors) {
      const token = Buffer.from(JSON.stringify({ v: 1, cursors: { brands }, completed: [] }), 'utf8').toString(
        'base64url'
      );
      await assert.rejects(svc.reportDrift(10, token), /continuation cursor is invalid/);
    }
  });
});
