import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';

import {
  Services as MigrationServices,
  clearMigrationCheckpoint,
  decodeDriftContinuation,
  keysetPage,
  migrationCheckpointDurabilityUnavailable,
  readMigrationCheckpoint,
  writeMigrationCheckpoint,
} from '../../src/services/AuthorizationMigrationService';
import { Services as BootstrapServices } from '../../src/services/AuthorizationBootstrapService';
import { DEFAULT_ROLE_TEMPLATES } from '../../src/authorization';

const connection = Object.freeze({ lease: 'scan-hardening' });

function txDatastore(extra: Record<string, unknown> = {}): Sails.Datastore {
  return {
    transaction: async (work: (leased: Sails.Connection) => Promise<unknown>) => work(connection),
    ...extra,
  } as unknown as Sails.Datastore;
}

function stubBaseServices(): typeof sails.services {
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

function systemHealthyRole(): Record<string, unknown> {
  return {
    id: 'system-admin',
    name: 'system-admin',
    key: 'system-admin',
    identityKey: 'system:system-admin',
    displayName: 'System administrators',
    contextType: 'system',
    protectedKind: 'system-admin',
    status: 'active',
    version: 2,
    branding: null,
  };
}

function healthyGuestRow(brandId: string): Record<string, unknown> {
  return {
    id: `guest-${brandId}`,
    name: 'Guest',
    key: 'Guest',
    identityKey: `brand:${brandId}:Guest`,
    displayName: 'Guest',
    contextType: 'brand',
    branding: brandId,
    protectedKind: 'guest',
    status: 'active',
    version: 2,
  };
}

function healthyBrandAdminRow(brandId: string): Record<string, unknown> {
  return {
    id: `brand-admin-${brandId}`,
    name: 'Admin',
    key: 'Admin',
    identityKey: `brand:${brandId}:Admin`,
    displayName: 'Brand administrators',
    contextType: 'brand',
    protectedKind: 'brand-admin',
    branding: brandId,
    status: 'active',
    version: 2,
    template: 'tmpl-brand-admin',
    templateRevision: 1,
  };
}

describe('Scan hardening: reusable keyset-page helper', () => {
  it('flags a full raw page with no post-cursor progress as stalled', () => {
    const raw = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const stalled = keysetPage(raw, 'c', 2);
    assert.equal(stalled.batch.length, 0);
    assert.equal(stalled.stalled, true);
    assert.equal(stalled.hasMore, true);
  });

  it('does not stall on a short raw page or when progress exists', () => {
    assert.equal(keysetPage([{ id: 'a' }], 'z', 2).stalled, false);
    const progressed = keysetPage([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'a', 2);
    assert.equal(progressed.stalled, false);
    assert.deepEqual(
      progressed.batch.map(row => row.id),
      ['b', 'c']
    );
    assert.equal(keysetPage([{ id: 'a' }], undefined, 2).stalled, false);
  });
});

describe('Scan hardening: reconcileBrandRoles batchSize+2 predicate-ignoring adapter', () => {
  const names = ['Role', 'RoleTemplate'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;
  let savedModels: typeof sails.models;

  const rows = ['role-1', 'role-2', 'role-3', 'role-4'].map(id => ({
    id,
    name: `Name-${id}`,
    branding: 'brand-1',
    displayName: `Name ${id}`,
    status: 'active',
    version: 1,
  }));

  beforeEach(async () => {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedServices = stubBaseServices();
    savedModels = sails.models;
    sails.models = {} as typeof sails.models;
    await clearMigrationCheckpoint('roles');
    Reflect.set(globalThis, 'Role', {
      // Predicate-ignoring: honors limit, ignores the range predicate.
      find: () => ({
        sort: () => ({
          limit: (size: number) => Promise.resolve(rows.slice(0, size)),
        }),
      }),
      findOne: (criteria: Record<string, unknown>) => ({
        usingConnection: async () => ({ ...rows.find(row => row.id === criteria.id) }),
      }),
      count: () => ({ usingConnection: async () => 1 }),
      updateOne: () => ({
        set: (projection: Record<string, unknown>) => ({
          meta: () => ({ usingConnection: async () => ({ ...rows[0], ...projection }) }),
        }),
      }),
      getDatastore: () => txDatastore(),
    });
    Reflect.set(globalThis, 'RoleTemplate', { find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) });
  });

  afterEach(async () => {
    for (const name of names) {
      const descriptor = saved.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    sails.services = savedServices;
    sails.models = savedModels;
    await clearMigrationCheckpoint('roles');
  });

  it('emits role-scan-incomplete, preserves the checkpoint, and never clears', async () => {
    const summary = await new MigrationServices.AuthorizationMigrationService().reconcileBrandRoles(2);
    assert.ok(
      summary.issues.some(issue => issue.code === 'role-scan-incomplete' && issue.severity === 'blocker'),
      `expected role-scan-incomplete blocker, saw ${JSON.stringify(summary.issues)}`
    );
    // role-4 sits beyond the predicate-ignored head and is never verified.
    assert.ok(summary.rolesMigrated < rows.length, `must not migrate all rows, saw ${summary.rolesMigrated}`);
    const checkpoint = await readMigrationCheckpoint('roles');
    assert.ok(checkpoint !== undefined, 'checkpoint must be preserved, never cleared, on a stalled scan');
    assert.equal(checkpoint?.lastId, 'role-3');
  });
});

describe('Scan hardening: migrateUserAssignments batchSize+2 predicate-ignoring adapter', () => {
  const names = ['User', 'Role', 'RoleAssignment', 'RoleTemplate'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;
  let savedModels: typeof sails.models;

  const users = ['user-1', 'user-2', 'user-3', 'user-4'].map(id => ({ id, roles: [] }));

  beforeEach(async () => {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedServices = stubBaseServices();
    savedModels = sails.models;
    sails.models = {} as typeof sails.models;
    await clearMigrationCheckpoint('assignments');
    Reflect.set(globalThis, 'User', {
      find: () => ({
        populate: () => ({
          sort: () => ({
            limit: (size: number) => Promise.resolve(users.slice(0, size).map(user => ({ ...user }))),
          }),
        }),
      }),
      getDatastore: () => txDatastore(),
    });
    Reflect.set(globalThis, 'Role', { getDatastore: () => txDatastore() });
    Reflect.set(globalThis, 'RoleTemplate', { find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) });
    Reflect.set(globalThis, 'RoleAssignment', {
      findOne: () => ({ usingConnection: async () => undefined }),
    });
  });

  afterEach(async () => {
    for (const name of names) {
      const descriptor = saved.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    sails.services = savedServices;
    sails.models = savedModels;
    await clearMigrationCheckpoint('assignments');
  });

  it('emits user-scan-incomplete and preserves the assignment checkpoint', async () => {
    const summary = await new MigrationServices.AuthorizationMigrationService().migrateUserAssignments(2);
    assert.ok(
      summary.issues.some(issue => issue.code === 'user-scan-incomplete' && issue.severity === 'blocker'),
      `expected user-scan-incomplete blocker, saw ${JSON.stringify(summary.issues)}`
    );
    assert.ok(summary.usersScanned < users.length, `must not scan all users, saw ${summary.usersScanned}`);
    const checkpoint = await readMigrationCheckpoint('assignments');
    assert.ok(checkpoint !== undefined, 'assignment checkpoint must be preserved on a stalled scan');
  });
});

describe('Scan hardening: drift predicate-ignoring sections fail closed', () => {
  const modelNames = [
    'BrandingConfig',
    'Role',
    'RoleAssignment',
    'User',
    'PathRule',
    'RoleTemplate',
    'RoleTemplateRevision',
  ] as const;
  let descriptors: Map<string, PropertyDescriptor | undefined>;
  let previousModels: typeof sails.models;
  let previousServices: typeof sails.services;

  function predicateIgnoringFinder<T extends { id: string }>(rows: readonly T[]) {
    return () => ({
      sort: () => ({
        limit: (size: number) => Promise.resolve(rows.slice(0, size).map(row => ({ ...row }))),
      }),
      populate: () => ({
        sort: () => ({
          limit: (size: number) => Promise.resolve(rows.slice(0, size).map(row => ({ ...row }))),
        }),
      }),
    });
  }

  function installDriftDoubles(overrides: {
    brands: Array<{ id: string }>;
    users: Array<{ id: string; roles?: unknown[] }>;
    assignments: Array<{ id: string }>;
    records: Array<{ id: string }>;
    pathRules: Array<{ id: string }>;
  }): void {
    descriptors = new Map(modelNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    installHealthyTemplateGlobals();
    Reflect.set(globalThis, 'BrandingConfig', { find: predicateIgnoringFinder(overrides.brands) });
    Reflect.set(globalThis, 'User', {
      find: () => ({
        populate: () => ({
          sort: () => ({
            limit: (size: number) =>
              Promise.resolve(overrides.users.slice(0, size).map(user => ({ ...user, roles: [] }))),
          }),
        }),
      }),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      count: () => Promise.resolve(2),
      find: () => ({
        populate: () => ({
          sort: () => ({
            limit: (size: number) => Promise.resolve(overrides.assignments.slice(0, size)),
          }),
        }),
      }),
    });
    Reflect.set(globalThis, 'Role', {
      count: () => Promise.resolve(1),
      findOne: async (criteria: Record<string, unknown>) => {
        if ((criteria as { protectedKind?: string }).protectedKind === 'guest') {
          const brandId = String((criteria as { branding?: unknown }).branding ?? 'brand-1');
          return healthyGuestRow(brandId);
        }
        return undefined;
      },
      find: (criteria: Record<string, unknown>) => {
        const rows =
          criteria.contextType === 'system'
            ? [systemHealthyRole()]
            : [healthyBrandAdminRow(String((criteria as { branding?: unknown }).branding ?? 'brand-1'))];
        // Chain shape for both direct awaits and withBoundedLimit (.sort/.limit).
        const limited = {
          limit: (size: number) => Promise.resolve(rows.slice(0, size)),
        };
        return { sort: () => limited, limit: (size: number) => Promise.resolve(rows.slice(0, size)) };
      },
    });
    Reflect.set(globalThis, 'PathRule', {
      find: () => ({
        populate: () => ({
          sort: () => ({
            limit: (size: number) => Promise.resolve(overrides.pathRules.slice(0, size)),
          }),
        }),
      }),
    });
    previousModels = sails.models;
    sails.models = {
      record: {
        find: () => ({
          sort: () => ({
            limit: (size: number) => Promise.resolve(overrides.records.slice(0, size)),
          }),
        }),
      },
    } as unknown as typeof sails.models;
  }

  function healthyOverrides(): {
    brands: Array<{ id: string }>;
    users: Array<{ id: string }>;
    assignments: Array<{ id: string }>;
    records: Array<{ id: string }>;
    pathRules: Array<{ id: string }>;
  } {
    return { brands: [], users: [], assignments: [], records: [], pathRules: [] };
  }

  async function drainToStall(
    service: MigrationServices.AuthorizationMigrationService,
    limit: number,
    code: string
  ): Promise<{ continuation: string; issues: Array<{ code: string }> }> {
    let continuation: string | undefined;
    for (let page = 0; page < 12; page += 1) {
      const report = await service.reportDrift(limit, continuation);
      if (report.issues.some(issue => issue.code === code)) {
        assert.equal(report.truncated, true, `${code} page must carry a continuation`);
        assert.ok(report.continuation !== undefined, `${code} page must carry a continuation`);
        const decoded = JSON.parse(Buffer.from(report.continuation as string, 'base64url').toString('utf8')) as {
          completed: string[];
        };
        assert.ok(!decoded.completed.includes('brands') || code !== 'brand-scan-incomplete');
        return { continuation: report.continuation as string, issues: [...report.issues] };
      }
      assert.equal(report.truncated, true, `must paginate toward the stall, saw ${JSON.stringify(report.issues)}`);
      assert.ok(report.continuation !== undefined);
      continuation = report.continuation;
    }
    assert.fail(`never observed ${code} within 12 pages`);
  }

  beforeEach(() => {
    previousServices = stubBaseServices();
  });

  afterEach(() => {
    sails.services = previousServices;
    sails.models = previousModels;
    for (const name of modelNames) {
      const descriptor = descriptors?.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
  });

  it('brands: limit+2 predicate-ignoring brands emit brand-scan-incomplete without completion', async () => {
    const brands = [{ id: 'brand-1' }, { id: 'brand-2' }, { id: 'brand-3' }];
    installDriftDoubles({ ...healthyOverrides(), brands });
    const service = new MigrationServices.AuthorizationMigrationService();
    const stalled = await drainToStall(service, 1, 'brand-scan-incomplete');
    assert.ok(stalled.issues.some(issue => issue.code === 'brand-scan-incomplete'));
  });

  it('users: limit+2 predicate-ignoring users emit user-scan-incomplete without completion', async () => {
    const users = [{ id: 'user-1' }, { id: 'user-2' }, { id: 'user-3' }];
    installDriftDoubles({ ...healthyOverrides(), users });
    const service = new MigrationServices.AuthorizationMigrationService();
    const stalled = await drainToStall(service, 1, 'user-scan-incomplete');
    assert.ok(stalled.issues.some(issue => issue.code === 'user-scan-incomplete'));
  });

  it('assignments: limit+2 predicate-ignoring assignments emit assignment-scan-incomplete', async () => {
    const assignments = [{ id: 'assignment-1' }, { id: 'assignment-2' }, { id: 'assignment-3' }];
    installDriftDoubles({ ...healthyOverrides(), assignments });
    const service = new MigrationServices.AuthorizationMigrationService();
    const stalled = await drainToStall(service, 1, 'assignment-scan-incomplete');
    assert.ok(stalled.issues.some(issue => issue.code === 'assignment-scan-incomplete'));
  });

  it('records: limit+2 predicate-ignoring records emit record-scan-incomplete', async () => {
    const records = [{ id: 'record-1' }, { id: 'record-2' }, { id: 'record-3' }];
    installDriftDoubles({ ...healthyOverrides(), records });
    const service = new MigrationServices.AuthorizationMigrationService();
    const stalled = await drainToStall(service, 1, 'record-scan-incomplete');
    assert.ok(stalled.issues.some(issue => issue.code === 'record-scan-incomplete'));
  });

  it('pathRules: limit+2 predicate-ignoring rules emit path-rule-scan-incomplete', async () => {
    const pathRules = [{ id: 'rule-1' }, { id: 'rule-2' }, { id: 'rule-3' }];
    installDriftDoubles({ ...healthyOverrides(), pathRules });
    const service = new MigrationServices.AuthorizationMigrationService();
    const stalled = await drainToStall(service, 1, 'path-rule-scan-incomplete');
    assert.ok(stalled.issues.some(issue => issue.code === 'path-rule-scan-incomplete'));
  });

  it('templates: predicate-ignoring role pins emit protected-role-scan-incomplete without completion', async () => {
    // Fixed 502 probe with 503 persisted pins: the adapter honors the bound
    // but ignores the range predicate, so the 503rd pin is never verified and
    // the tail page stalls fail-closed instead of completing. Pins carry full
    // healthy shapes so the ordinary-role scan stays silent and the pin-stream
    // stall itself is exercised.
    const pins = Array.from({ length: 503 }, (_, index) => ({
      id: `role-${String(index).padStart(4, '0')}`,
      name: 'Guest',
      key: 'Guest',
      identityKey: 'brand:brand-1:Guest',
      displayName: 'Guest',
      contextType: 'brand',
      branding: 'brand-1',
      protectedKind: 'guest',
      status: 'active',
      version: 1,
      template: 'tmpl-guest',
      templateRevision: 1,
    }));
    descriptors = new Map(modelNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    installHealthyTemplateGlobals();
    Reflect.set(globalThis, 'BrandingConfig', {
      find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    Reflect.set(globalThis, 'User', {
      find: () => ({
        populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }),
      }),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      count: () => Promise.resolve(2),
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    Reflect.set(globalThis, 'Role', {
      count: () => Promise.resolve(1),
      findOne: async () => undefined,
      find: (criteria: Record<string, unknown>) => {
        // Predicate-ignoring double for the pin stream: honors the bound,
        // ignores the range predicate, so the 503rd pin stays past the head.
        const rows =
          criteria.contextType === 'system' ? [systemHealthyRole()] : pins.slice(0, 502).map(pin => ({ ...pin }));
        const chain = {
          limit: (size: number) => Promise.resolve(rows.slice(0, size)),
        };
        return { sort: () => chain };
      },
    });
    Reflect.set(globalThis, 'PathRule', {
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    const service = new MigrationServices.AuthorizationMigrationService();
    let continuation: string | undefined;
    for (let page = 0; page < 15; page += 1) {
      const report = await service.reportDrift(100, continuation);
      // Either the ordinary-role scan or the pin-stream probe may stall
      // first: both prove the predicate-ignoring tail fails closed instead
      // of completing. Accept either stall signal.
      const stall = report.issues.find(
        issue => issue.code === 'protected-role-scan-incomplete' || issue.code === 'role-scan-incomplete'
      );
      if (stall !== undefined) {
        assert.equal(report.truncated, true, 'stalled templates page must carry a continuation');
        assert.ok(report.continuation !== undefined);
        const decoded = JSON.parse(Buffer.from(report.continuation as string, 'base64url').toString('utf8')) as {
          completed: string[];
        };
        assert.ok(!decoded.completed.includes('templates'), 'templates must never complete on a stalled scan');
        return;
      }
      assert.equal(report.truncated, true, `must paginate toward the stall, saw ${JSON.stringify(report.issues)}`);
      assert.ok(report.continuation !== undefined);
      continuation = report.continuation;
    }
    assert.fail('never observed protected-role-scan-incomplete within 15 pages');
  });
});

describe('Scan hardening: bootstrap brand and Guest override scans fail closed over 501 rows', () => {
  const names = ['BrandingConfig', 'RoleTemplate', 'Role', 'RoleScopeOverride', 'AuthorizationAudit'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;
  let savedReadiness: unknown;

  beforeEach(() => {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedServices = sails.services;
    savedReadiness = sails.config.authorizationReadiness;
    sails.services = {
      ...sails.services,
      authorizationscopeservice: {
        bootstrap: async () => ({}),
        getRegistry: () => ({ isActive: () => true }),
      },
      authorizationmigrationservice: {
        reconcileBrandRoles: async () => ({ issues: [], metrics: { conflictsResolved: 0, transactionFailures: 0 } }),
        migrateUserAssignments: async () => ({
          rolesScanned: 0,
          rolesMigrated: 0,
          usersScanned: 0,
          assignmentsCreated: 0,
          guestAssociationsSkipped: 0,
          issues: [],
          metrics: { batchesApplied: 0, conflictsResolved: 0, transactionFailures: 0 },
        }),
        reportDrift: async () => ({
          generatedAt: new Date(0).toISOString(),
          issues: [],
          truncated: false,
          summary: { blocker: 0, warning: 0, expected: 0 },
        }),
      },
      authorizationauditservice: { createSucceededEvent: async () => ({ id: 'audit-1' }) },
      authorizationpersistenceservice: { createRoleAssignment: async () => ({ id: 'assignment-1' }) },
    };
    Reflect.set(globalThis, 'RoleTemplate', { findOne: async () => ({ id: 'tmpl-guest' }) });
    Reflect.set(globalThis, 'AuthorizationAudit', { getDatastore: () => txDatastore() });
  });

  afterEach(() => {
    for (const name of names) {
      const descriptor = saved.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    sails.services = savedServices;
    sails.config.authorizationReadiness = savedReadiness;
  });

  it('brand scan over 502 predicate-ignoring brands emits brand-scan-incomplete', async () => {
    const brands = Array.from({ length: 502 }, (_, index) => ({ id: `brand-${String(index).padStart(4, '0')}` }));
    Reflect.set(globalThis, 'BrandingConfig', {
      find: () => ({
        sort: () => ({
          limit: (size: number) => Promise.resolve(brands.slice(0, size).map(brand => ({ ...brand }))),
        }),
      }),
    });
    Reflect.set(globalThis, 'Role', {
      find: () => ({
        sort: () => ({
          usingConnection: () => ({ limit: (size: number) => Promise.resolve([]).then(rows => rows.slice(0, size)) }),
        }),
      }),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({ usingConnection: async () => ({ id: `role-${values.branding}`, ...values }) }),
      }),
      updateOne: () => ({
        set: () => ({ meta: () => ({ usingConnection: async () => undefined }) }),
      }),
      getDatastore: () => txDatastore(),
    });
    Reflect.set(globalThis, 'RoleScopeOverride', {
      find: () => ({
        sort: () => ({ usingConnection: () => ({ limit: () => Promise.resolve([]) }) }),
      }),
      destroy: () => ({ usingConnection: async () => [] }),
    });
    const result = await new BootstrapServices.AuthorizationBootstrapService().bootstrap({});
    assert.ok(
      result.issues.some(issue => issue.code === 'brand-scan-incomplete' && issue.severity === 'blocker'),
      `expected brand-scan-incomplete, saw ${JSON.stringify(result.issues)}`
    );
    assert.ok(result.guestRolesCreated < brands.length, 'must not claim every brand when the scan stalled');
  });

  it('Guest override scan over 502 predicate-ignoring overrides emits protected-guest-overrides-scan-incomplete', async () => {
    Reflect.set(globalThis, 'BrandingConfig', {
      find: () => ({ sort: () => ({ limit: () => Promise.resolve([{ id: 'brand-1' }]) }) }),
    });
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
      version: 2,
    };
    Reflect.set(globalThis, 'Role', {
      find: () => ({
        sort: () => ({
          usingConnection: () => ({ limit: (size: number) => Promise.resolve([{ ...guestRow }].slice(0, size)) }),
        }),
      }),
      updateOne: () => ({
        set: () => ({ meta: () => ({ usingConnection: async () => ({ ...guestRow }) }) }),
      }),
      getDatastore: () => txDatastore(),
    });
    const overrides = Array.from({ length: 502 }, (_, index) => ({
      id: `override-${String(index).padStart(4, '0')}`,
      role: 'guest-1',
      scopeKey: 'authorization.self.read',
      effect: 'remove',
    }));
    Reflect.set(globalThis, 'RoleScopeOverride', {
      find: () => ({
        sort: () => ({
          usingConnection: () => ({
            limit: (size: number) => Promise.resolve(overrides.slice(0, size).map(row => ({ ...row }))),
          }),
        }),
      }),
      destroy: () => ({ usingConnection: async () => [] }),
    });
    const result = await new BootstrapServices.AuthorizationBootstrapService().bootstrap({});
    assert.ok(
      result.issues.some(
        issue => issue.code === 'protected-guest-overrides-scan-incomplete' && issue.severity === 'blocker'
      ),
      `expected protected-guest-overrides-scan-incomplete, saw ${JSON.stringify(result.issues)}`
    );
  });
});

describe('Scan hardening: outer continuation decoder requires canonical strict v1', () => {
  function encodeEnvelope(payload: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  function validToken(): string {
    return encodeEnvelope({ v: 1, cursors: { brands: 'brand-1' }, completed: [] });
  }

  it('accepts a canonical token and rejects padding, alphabet, and round-trip drift', () => {
    const valid = validToken();
    assert.deepEqual(decodeDriftContinuation(valid), { brands: 'brand-1' });
    assert.throws(() => decodeDriftContinuation(`${valid}=`), /continuation cursor is invalid/);
    assert.throws(() => decodeDriftContinuation('not-a-valid-cursor!!!'), /continuation cursor is invalid/);
    const withPlus = valid.replace(/[-_]/, match => (match === '-' ? '+' : '/'));
    if (withPlus !== valid) {
      assert.throws(() => decodeDriftContinuation(withPlus), /continuation cursor is invalid/);
    }
  });

  it('rejects legacy flat tokens, unknown fields, and malformed envelope types', async () => {
    assert.throws(
      () => decodeDriftContinuation(encodeEnvelope({ brands: 'brand-1' } as Record<string, unknown>)),
      /continuation cursor is invalid/
    );
    assert.throws(
      () => decodeDriftContinuation(encodeEnvelope({ v: 1, cursors: { brands: 'b' }, completed: [], extra: 1 })),
      /continuation cursor is invalid/
    );
    assert.throws(
      () => decodeDriftContinuation(encodeEnvelope({ v: 1, cursors: { brands: 'b' }, completed: 'nope' })),
      /continuation cursor is invalid/
    );
    assert.throws(
      () => decodeDriftContinuation(encodeEnvelope({ v: 1, cursors: { nope: 'b' }, completed: [] })),
      /continuation cursor is invalid/
    );
    assert.throws(
      () => decodeDriftContinuation(encodeEnvelope({ v: 1, cursors: { brands: 7 }, completed: [] })),
      /continuation cursor is invalid/
    );
    assert.throws(
      () => decodeDriftContinuation(encodeEnvelope({ v: 1, cursors: {}, completed: ['brands', 'brands'] })),
      /continuation cursor is invalid/
    );
    assert.throws(
      () => decodeDriftContinuation(encodeEnvelope({ v: 1, cursors: { brands: 'b' }, completed: ['brands'] })),
      /continuation cursor is invalid/
    );
    assert.throws(
      () => decodeDriftContinuation(encodeEnvelope({ v: 1, cursors: {}, completed: [], systemReported: false })),
      /continuation cursor is invalid/
    );
    assert.throws(
      () => decodeDriftContinuation(encodeEnvelope({ v: 1, cursors: {}, completed: [], systemOffset: 0 })),
      /continuation cursor is invalid/
    );
    assert.throws(
      () => decodeDriftContinuation(encodeEnvelope({ v: 1, cursors: { brands: 'a#0' }, completed: [] })),
      /continuation cursor is invalid/
    );
    const service = new MigrationServices.AuthorizationMigrationService();
    await assert.rejects(service.reportDrift(10, encodeEnvelope({ v: 2, cursors: {}, completed: [] })), /invalid/);
  });
});

describe('Scan hardening: checkpoint durability is required on every production operation', () => {
  const names = ['Role'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedEnv: string | undefined;
  let savedServices: typeof sails.services;

  beforeEach(async () => {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedEnv = process.env.NODE_ENV;
    savedServices = stubBaseServices();
    process.env.NODE_ENV = 'production';
    Reflect.set(globalThis, 'Role', { getDatastore: () => txDatastore() });
  });

  afterEach(async () => {
    for (const name of names) {
      const descriptor = saved.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    if (savedEnv === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV');
    else process.env.NODE_ENV = savedEnv;
    sails.services = savedServices;
  });

  it('requires a durable collection for read, write, and clear in production', async () => {
    assert.equal(migrationCheckpointDurabilityUnavailable(), true);
    await assert.rejects(readMigrationCheckpoint('roles'), /durable checkpoint collection/);
    await assert.rejects(writeMigrationCheckpoint('roles', 'role-1'), /durable checkpoint collection/);
    await assert.rejects(clearMigrationCheckpoint('roles'), /durable checkpoint collection/);
  });

  it('fails closed when the collection disappears after a successful probe', async () => {
    const durable = {
      find: () => ({ limit: () => ({ toArray: async () => [] }) }),
      updateOne: async () => ({}),
      deleteOne: async () => ({}),
    };
    Reflect.set(globalThis, 'Role', {
      getDatastore: () => txDatastore({ manager: { collection: () => durable } }),
    });
    assert.equal(migrationCheckpointDurabilityUnavailable(), false);
    Reflect.set(globalThis, 'Role', { getDatastore: () => txDatastore() });
    assert.equal(migrationCheckpointDurabilityUnavailable(), true);
    await assert.rejects(readMigrationCheckpoint('roles'), /durable checkpoint collection/);
    await assert.rejects(writeMigrationCheckpoint('roles', 'role-1'), /durable checkpoint collection/);
    await assert.rejects(clearMigrationCheckpoint('roles'), /durable checkpoint collection/);
  });

  it('keeps the memory fallback test-only outside production', async () => {
    process.env.NODE_ENV = 'test';
    assert.equal(migrationCheckpointDurabilityUnavailable(), false);
    await clearMigrationCheckpoint('roles');
    await writeMigrationCheckpoint('roles', 'role-memory');
    assert.equal((await readMigrationCheckpoint('roles'))?.lastId, 'role-memory');
    await clearMigrationCheckpoint('roles');
    assert.equal(await readMigrationCheckpoint('roles'), undefined);
  });
});
