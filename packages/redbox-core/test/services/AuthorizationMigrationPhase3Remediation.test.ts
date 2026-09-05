import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';
import { afterEach, beforeEach, describe, it } from 'mocha';

import {
  Services as MigrationServices,
  clearMigrationCheckpoint,
  readMigrationCheckpoint,
  writeMigrationCheckpoint,
} from '../../src/services/AuthorizationMigrationService';
import { Services as BootstrapServices } from '../../src/services/AuthorizationBootstrapService';
import {
  FROZEN_LEGACY_PATH_RULE_ROWS,
  FROZEN_LEGACY_ROUTE_BASELINE,
} from '../../src/authorization/legacy-authorization-baseline.snapshot';
import { DEFAULT_ROLE_TEMPLATES } from '../../src/authorization';
import { clearCapturedOpenTelemetryMeasurements, getCapturedOpenTelemetryMeasurements } from '../setup';

const connection = Object.freeze({ lease: 'phase3-remediation' });

function transactionDatastore(extra: Record<string, unknown> = {}): Sails.Datastore {
  return {
    transaction: async (work: (leased: Sails.Connection) => Promise<unknown>) => work(connection),
    ...extra,
  } as unknown as Sails.Datastore;
}

function stubServices(overrides: Record<string, unknown> = {}): typeof sails.services {
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
    ...overrides,
  };
  return previous;
}

/**
 * Healthy protected-template doubles: every default template resolves as
 * active at its declared revision with exact scope keys, so drift tests
 * focused on other sections observe a verified-clean template section.
 * Tests for the template section itself override these globals.
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

describe('Phase 3 remediation: brandless system administrator exemption', () => {
  const names = ['Role', 'RoleTemplate'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;
  let savedModels: typeof sails.models;

  const systemRole = {
    id: 'role-system-1',
    name: 'system-admin',
    key: 'system-admin',
    identityKey: 'system:system-admin',
    contextType: 'system',
    protectedKind: 'system-admin',
    status: 'active',
    version: 2,
  };

  beforeEach(() => {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedServices = stubServices();
    savedModels = sails.models;
    sails.models = {} as typeof sails.models;
    let findCalls = 0;
    Reflect.set(globalThis, 'Role', {
      find: () => ({
        sort: () => ({
          limit: () => {
            findCalls += 1;
            return Promise.resolve(findCalls === 1 ? [{ ...systemRole }] : []);
          },
        }),
      }),
      findOne: () => ({ usingConnection: async () => ({ ...systemRole }) }),
      count: () => ({ usingConnection: async () => 1 }),
      updateOne: () => {
        throw new Error('brandless system role must never be rewritten');
      },
      getDatastore: () => transactionDatastore(),
    });
    Reflect.set(globalThis, 'RoleTemplate', { find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) });
  });

  afterEach(() => {
    for (const name of names) {
      const descriptor = saved.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    sails.services = savedServices;
    sails.models = savedModels;
  });

  it('skips the intentionally brandless system role and keeps reruns green', async () => {
    const first = await new MigrationServices.AuthorizationMigrationService().reconcileBrandRoles(10);
    assert.equal(first.rolesScanned, 1);
    assert.equal(first.rolesMigrated, 0);
    assert.deepEqual(first.issues, []);

    const second = await new MigrationServices.AuthorizationMigrationService().reconcileBrandRoles(10);
    assert.equal(second.rolesMigrated, 0);
    assert.deepEqual(second.issues, []);
  });
});

describe('Phase 3 remediation: migration checkpoint and resume', () => {
  const names = ['Role', 'RoleTemplate'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;
  let savedModels: typeof sails.models;

  const roleA = {
    id: 'role-a',
    name: 'RoleA',
    branding: 'brand-1',
    displayName: '',
    status: 'active',
    version: 1,
  };
  const roleB = { ...roleA, id: 'role-b', name: 'RoleB' };
  const rows = [roleA, roleB];

  function install(cursorAware: boolean, failBatchAtCall: number, updateCriteria: unknown[]) {
    let findCalls = 0;
    let transactionCalls = 0;
    Reflect.set(globalThis, 'Role', {
      find: (criteria: Record<string, unknown>) => ({
        sort: () => ({
          limit: (size: number) => {
            findCalls += 1;
            let visible = [...rows];
            if (cursorAware) {
              const idCriteria = criteria.id as { '>': string } | undefined;
              if (idCriteria !== undefined && typeof idCriteria === 'object' && '>' in idCriteria) {
                visible = visible.filter(row => row.id > idCriteria['>']);
              }
            }
            return Promise.resolve(visible.slice(0, size));
          },
        }),
      }),
      findOne: (criteria: Record<string, unknown>) => ({
        usingConnection: async () => ({ ...rows.find(row => row.id === criteria.id) }),
      }),
      count: () => ({ usingConnection: async () => 1 }),
      updateOne: (criteria: Record<string, unknown>) => {
        updateCriteria.push(criteria);
        return {
          set: (projection: Record<string, unknown>) => ({
            meta: () => ({
              usingConnection: async () => ({ ...roleA, ...projection, key: projection.key }),
            }),
          }),
        };
      },
      getDatastore: () => ({
        transaction: (work: (leased: Sails.Connection) => Promise<unknown>) => {
          transactionCalls += 1;
          if (transactionCalls === failBatchAtCall) return Promise.reject(new Error('interrupted lift'));
          return work(connection);
        },
      }),
    });
    Reflect.set(globalThis, 'RoleTemplate', { find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) });
    return { transactionCalls: () => transactionCalls };
  }

  beforeEach(async () => {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedServices = stubServices();
    savedModels = sails.models;
    sails.models = {} as typeof sails.models;
    await clearMigrationCheckpoint('roles');
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

  it('round-trips checkpoint state through the memory fallback', async () => {
    assert.equal(await readMigrationCheckpoint('roles'), undefined);
    const written = await writeMigrationCheckpoint('roles', 'role-a');
    assert.equal(written.lastId, 'role-a');
    assert.equal((await readMigrationCheckpoint('roles'))?.lastId, 'role-a');
    await clearMigrationCheckpoint('roles');
    assert.equal(await readMigrationCheckpoint('roles'), undefined);
  });

  it('persists the cursor on interruption and resumes without rework', async () => {
    const updateCriteria: unknown[] = [];
    install(true, 2, updateCriteria);

    await assert.rejects(
      new MigrationServices.AuthorizationMigrationService().reconcileBrandRoles(1),
      /interrupted lift/
    );
    assert.equal((await readMigrationCheckpoint('roles'))?.lastId, 'role-a');

    const resumedCriteria: unknown[] = [];
    install(true, -1, resumedCriteria);
    const calls: unknown[] = [];
    const originalFind = (globalThis as Record<string, unknown>).Role as { find: (criteria: unknown) => unknown };
    (globalThis as Record<string, unknown>).Role = {
      ...(originalFind as object),
      find: (criteria: unknown) => {
        calls.push(criteria);
        return (originalFind.find as (criteria: unknown) => unknown)(criteria);
      },
    };

    const resumed = await new MigrationServices.AuthorizationMigrationService().reconcileBrandRoles(1);
    assert.equal(resumed.rolesMigrated, 1);
    assert.deepEqual(calls[0], { id: { '>': 'role-a' } });
    assert.deepEqual(resumedCriteria[0], { id: 'role-b', version: 1 });
    assert.equal(await readMigrationCheckpoint('roles'), undefined);
  });
});

describe('Phase 3 remediation: orphan legacy role references', () => {
  const names = ['User', 'RoleAssignment'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;
  let savedModels: typeof sails.models;

  beforeEach(() => {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedServices = stubServices();
    savedModels = sails.models;
    sails.models = {} as typeof sails.models;
    let userCalls = 0;
    // User.roles is a Waterline many-to-many junction (User.ts:112): the stored
    // foreign keys live in the junction collection, never as an inline `roles`
    // array on the native user document. Strict contract: the bound is applied
    // via `.limit()` before materialization; the double asserts it.
    const junctionCollection = {
      find: (filter: unknown) => ({
        limit: (n: number) => {
          assert.ok(n === 501, `junction scan must be bounded at 501, got ${n}`);
          return {
            forEach: (cb: (doc: Record<string, unknown>) => void) => {
              if (JSON.stringify(filter).includes('user-1')) {
                cb({ user_roles: 'user-1', role_users: 'role-orphan' });
              }
              return Promise.resolve(undefined);
            },
          };
        },
      }),
    };
    Reflect.set(globalThis, 'User', {
      find: () => ({
        populate: () => ({
          sort: () => ({
            limit: () => {
              userCalls += 1;
              // Populate drops the dangling reference entirely.
              return Promise.resolve(userCalls === 1 ? [{ id: 'user-1', roles: [] }] : []);
            },
          }),
        }),
      }),
      getDatastore: () => transactionDatastore({ manager: { collection: () => junctionCollection } }),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      findOne: () => ({ usingConnection: async () => undefined }),
    });
  });

  afterEach(() => {
    for (const name of names) {
      const descriptor = saved.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    sails.services = savedServices;
    sails.models = savedModels;
  });

  it('flags dangling references the populate omitted', async () => {
    const summary = await new MigrationServices.AuthorizationMigrationService().migrateUserAssignments(10);
    assert.equal(summary.usersScanned, 1);
    assert.deepEqual(summary.issues, [
      { code: 'user-role-reference-missing', severity: 'blocker', entityType: 'user', entityId: 'user-1' },
    ]);
  });
});

describe('Phase 3 remediation: drift report mapping, continuation, and record preservation', () => {
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
  let recordWrites: string[];

  function scopedBaselineRow(): { path: string; role: string } {
    const entry = FROZEN_LEGACY_ROUTE_BASELINE.find(
      candidate => candidate.authorizationKind === 'scope' && candidate.pathRuleMatches.length > 0
    );
    assert.ok(entry !== undefined, 'frozen baseline must contain a scoped route with path-rule matches');
    const row = FROZEN_LEGACY_PATH_RULE_ROWS[entry.pathRuleMatches[0]];
    return { path: row.path, role: row.role };
  }

  beforeEach(() => {
    previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    previousServices = stubServices();
    recordWrites = [];
    const mapped = scopedBaselineRow();
    descriptors = new Map(modelNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    installHealthyTemplateGlobals();
    Reflect.set(globalThis, 'BrandingConfig', {
      find: () => ({
        sort: () => ({ limit: () => Promise.resolve([{ id: 'brand-1' }, { id: 'brand-2' }]) }),
      }),
    });
    Reflect.set(globalThis, 'Role', {
      count: () => Promise.resolve(1),
      findOne: async (criteria: Record<string, unknown>) => {
        if ((criteria as { protectedKind?: string }).protectedKind === 'guest') {
          const brandId = String((criteria as { branding?: unknown }).branding ?? 'brand-1');
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
        return undefined;
      },
      find: (criteria: Record<string, unknown>) => {
        const value = [
          criteria.contextType === 'system'
            ? {
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
              }
            : (() => {
                const brandId = String((criteria as { branding?: unknown }).branding ?? 'brand-1');
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
              })(),
        ];
        const query: Record<string, unknown> = {};
        query.sort = () => query;
        query.limit = () => query;
        query.populate = () => query;
        query.then = (onfulfilled?: (value: unknown) => unknown, onrejected?: (reason: unknown) => unknown) =>
          Promise.resolve(value).then(onfulfilled, onrejected);
        return query;
      },
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      count: () => Promise.resolve(2),
      find: () => ({
        populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }),
      }),
    });
    Reflect.set(globalThis, 'User', {
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    Reflect.set(globalThis, 'PathRule', {
      find: () => ({
        populate: () => ({
          sort: () => ({
            limit: () => [
              { id: 'rule-mapped', path: mapped.path, role: { id: 'role-1', name: mapped.role } },
              { id: 'rule-unmapped', path: '/no/such/legacy/path(/*)', role: { id: 'role-2', name: 'Nobody' } },
              { id: 'rule-role-missing', path: mapped.path, role: 'role-gone' },
            ],
          }),
        }),
      }),
    });
    const throwingWrites = (model: string) => () => {
      recordWrites.push(model);
      throw new Error(`drift reporting must never write ${model}`);
    };
    sails.models = {
      record: {
        find: () => ({
          sort: () => ({
            limit: () =>
              Promise.resolve([
                {
                  id: 'record-1',
                  oid: 'record-1',
                  metaMetadata: { brandId: 'brand-1' },
                  authorization: { viewRoles: ['Ghost'], editRoles: [] },
                },
              ]),
          }),
        }),
        updateOne: throwingWrites('record.updateOne'),
        update: throwingWrites('record.update'),
        destroy: throwingWrites('record.destroy'),
        create: throwingWrites('record.create'),
      },
    } as unknown as typeof sails.models;
  });

  afterEach(() => {
    sails.models = previousModels;
    sails.services = previousServices;
    for (const name of modelNames) {
      const descriptor = descriptors.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
  });

  it('identifies actually unmapped rules per rule and never writes records', async () => {
    const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
    assert.deepEqual(recordWrites, []);
    const codes = report.issues.map(issue => `${issue.code}:${issue.entityId ?? ''}`);
    assert.ok(
      codes.includes('legacy-path-rule-unmapped:rule-unmapped'),
      `expected per-rule unmapped issue, saw ${JSON.stringify(codes)}`
    );
    assert.ok(
      !codes.some(code => code.startsWith('legacy-path-rule-unmapped:rule-mapped')),
      `mapped rule must not be reported: ${JSON.stringify(codes)}`
    );
    assert.ok(
      codes.includes('legacy-path-rule-role-missing:'),
      `expected role-missing blocker, saw ${JSON.stringify(codes)}`
    );
    assert.ok(
      !codes.some(code => code.includes('count:')),
      `aggregate counts must not appear: ${JSON.stringify(codes)}`
    );
  });

  it('exposes a continuation cursor when the scan is truncated', async () => {
    const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(1);
    assert.equal(report.truncated, true);
    assert.ok(typeof report.continuation === 'string' && report.continuation.length > 0);
    const decoded = JSON.parse(Buffer.from(report.continuation as string, 'base64url').toString('utf8')) as {
      v: number;
      cursors: Record<string, string>;
      completed: string[];
    };
    assert.equal(decoded.v, 1);
    assert.equal(decoded.cursors.brands, 'brand-1');
  });
});

describe('Phase 3 remediation: Solr ACL-string preservation', () => {
  const names = ['Role', 'RoleTemplate', 'User', 'RoleAssignment'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;
  let savedModels: typeof sails.models;
  let capturedProjections: Array<Record<string, unknown>>;

  const legacyRow = {
    id: 'role-acl',
    name: 'Research Team',
    branding: 'brand-1',
    displayName: '',
    status: 'active',
    version: 1,
  };

  beforeEach(() => {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedServices = stubServices();
    savedModels = sails.models;
    sails.models = {} as typeof sails.models;
    capturedProjections = [];
    let roleCalls = 0;
    let userCalls = 0;
    Reflect.set(globalThis, 'Role', {
      find: () => ({
        sort: () => ({
          limit: () => {
            roleCalls += 1;
            return Promise.resolve(roleCalls === 1 ? [{ ...legacyRow }] : []);
          },
        }),
      }),
      findOne: () => ({ usingConnection: async () => ({ ...legacyRow }) }),
      count: () => ({ usingConnection: async () => 1 }),
      updateOne: () => ({
        set: (projection: Record<string, unknown>) => {
          capturedProjections.push(projection);
          return { meta: () => ({ usingConnection: async () => ({ ...legacyRow, key: 'Research Team' }) }) };
        },
      }),
      getDatastore: () => transactionDatastore(),
    });
    Reflect.set(globalThis, 'RoleTemplate', { find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) });
    Reflect.set(globalThis, 'User', {
      find: () => ({
        populate: () => ({
          sort: () => ({
            limit: () => {
              userCalls += 1;
              return Promise.resolve(userCalls === 1 ? [{ id: 'user-9', roles: [] }] : []);
            },
          }),
        }),
      }),
      getDatastore: () => transactionDatastore(),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      findOne: () => ({ usingConnection: async () => undefined }),
    });
  });

  afterEach(() => {
    for (const name of names) {
      const descriptor = saved.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    sails.services = savedServices;
    sails.models = savedModels;
  });

  it('keeps the immutable compatibility key so record ACLs and Solr strings still match', async () => {
    const service = new MigrationServices.AuthorizationMigrationService();
    const roles = await service.reconcileBrandRoles(10);
    const assignments = await service.migrateUserAssignments(10);

    assert.equal(roles.rolesMigrated, 1);
    assert.equal(assignments.usersScanned, 1);
    assert.equal(capturedProjections.length, 1);
    // Record `authorization.viewRoles/editRoles` and Solr role strings embed
    // `Role.name`; migration must project `key` from `name`, never rename it.
    assert.equal(capturedProjections[0]['key'], 'Research Team');
    assert.equal(capturedProjections[0]['identityKey'], 'brand:brand-1:Research Team');
    assert.ok(!('authorization' in capturedProjections[0]));
  });
});

describe('Phase 3 remediation: bootstrap propagation and protected CAS', () => {
  const names = ['BrandingConfig', 'RoleTemplate', 'Role', 'RoleScopeOverride', 'AuthorizationAudit'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;
  let savedReadiness: unknown;
  let guestUpdateCriteria: unknown[];
  let guestProjections: Array<Record<string, unknown>>;

  const guestRow = {
    id: 'guest-1',
    name: 'Guest',
    key: 'Guest',
    identityKey: 'brand:brand-1:Guest',
    displayName: '',
    contextType: 'brand',
    branding: 'brand-1',
    template: 'tmpl-old',
    templateRevision: 0,
    protectedKind: 'guest',
    status: 'active',
    version: 3,
  };

  beforeEach(() => {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedServices = sails.services;
    savedReadiness = sails.config.authorizationReadiness;
    guestUpdateCriteria = [];
    guestProjections = [];
    sails.services = {
      ...sails.services,
      authorizationscopeservice: {
        bootstrap: async () => ({}),
        getRegistry: () => ({ isActive: () => true }),
      },
      authorizationmigrationservice: {
        reconcileBrandRoles: async () => ({
          issues: [{ code: 'reconcile-brand-missing', severity: 'blocker', entityType: 'role', entityId: 'role-9' }],
          metrics: { conflictsResolved: 2, transactionFailures: 0 },
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
    Reflect.set(globalThis, 'BrandingConfig', {
      find: () => ({ sort: () => ({ limit: () => Promise.resolve([{ id: 'brand-1' }]) }) }),
    });
    Reflect.set(globalThis, 'RoleTemplate', { findOne: async () => ({ id: 'tmpl-guest' }) });
    Reflect.set(globalThis, 'Role', {
      find: (criteria: Record<string, unknown>) => {
        const rows = criteria.branding !== undefined ? [{ ...guestRow }] : [];
        // Protected bootstrap re-reads candidates inside the transaction.
        // Strict contract: ordered + bounded before materialization.
        return {
          sort: () => ({
            usingConnection: () => ({
              limit: (n: number) => {
                assert.ok(n <= 3, `Guest candidate scan must be bounded, got ${n}`);
                return Promise.resolve(rows.slice(0, n));
              },
            }),
          }),
        };
      },
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({ usingConnection: async () => ({ id: 'sys-1', ...values }) }),
      }),
      updateOne: (criteria: Record<string, unknown>) => {
        guestUpdateCriteria.push(criteria);
        return {
          set: (projection: Record<string, unknown>) => {
            guestProjections.push(projection);
            return { meta: () => ({ usingConnection: async () => ({ ...guestRow, ...projection }) }) };
          },
        };
      },
      getDatastore: () => transactionDatastore(),
    });
    Reflect.set(globalThis, 'RoleScopeOverride', {
      find: () => ({
        sort: () => ({
          usingConnection: () => ({
            limit: (n: number) => {
              assert.ok(n <= 501, `Override scan must be bounded, got ${n}`);
              return Promise.resolve([]);
            },
          }),
        }),
      }),
      destroy: () => ({ usingConnection: async () => [] }),
    });
    Reflect.set(globalThis, 'AuthorizationAudit', { getDatastore: () => transactionDatastore() });
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

  it('propagates reconcile blockers into readiness and repairs with version CAS', async () => {
    const result = await new BootstrapServices.AuthorizationBootstrapService().bootstrap({});

    assert.ok(
      result.issues.some(issue => issue.code === 'reconcile-brand-missing' && issue.severity === 'blocker'),
      `reconcile blockers must surface, saw ${JSON.stringify(result.issues)}`
    );
    assert.deepEqual(result.metrics, { reconcileBlockers: 1, conflictsResolved: 2, transactionFailures: 0 });
    assert.equal(result.guestRolesRepaired, 1);
    assert.deepEqual(guestUpdateCriteria, [{ id: 'guest-1', version: 3 }]);
    assert.equal(guestProjections.length, 1);
    assert.equal(guestProjections[0]['version'], 4);
    assert.equal(result.systemRoleCreated, true);
  });
});

describe('Phase 3 remediation: exported Sails recovery path', () => {
  it('exposes recoverSystemAdministrator through the generated Sails shim surface', () => {
    const exported = new BootstrapServices.AuthorizationBootstrapService().exports() as Record<string, unknown>;
    assert.ok('bootstrap' in exported, 'bootstrap must stay exported');
    assert.equal(typeof exported.recoverSystemAdministrator, 'function');
  });
});

describe('Phase 3 remediation: migration and recovery metrics', () => {
  const names = ['Role', 'RoleTemplate'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;
  let savedModels: typeof sails.models;

  beforeEach(async () => {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedServices = stubServices();
    savedModels = sails.models;
    sails.models = {} as typeof sails.models;
    clearCapturedOpenTelemetryMeasurements();
    await clearMigrationCheckpoint('roles');
    const row = {
      id: 'role-m',
      name: 'MetricRole',
      branding: 'brand-1',
      displayName: '',
      status: 'active',
      version: 1,
    };
    let findCalls = 0;
    Reflect.set(globalThis, 'Role', {
      find: () => ({
        sort: () => ({
          limit: () => {
            findCalls += 1;
            return Promise.resolve(findCalls === 1 ? [{ ...row }] : []);
          },
        }),
      }),
      findOne: () => ({ usingConnection: async () => ({ ...row }) }),
      count: () => ({ usingConnection: async () => 1 }),
      updateOne: () => ({
        set: (projection: Record<string, unknown>) => ({
          meta: () => ({ usingConnection: async () => ({ ...row, ...projection }) }),
        }),
      }),
      getDatastore: () => transactionDatastore(),
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
    clearCapturedOpenTelemetryMeasurements();
    await clearMigrationCheckpoint('roles');
  });

  it('records batch outcomes using the OpenTelemetry convention', async () => {
    await new MigrationServices.AuthorizationMigrationService().reconcileBrandRoles(10);
    const measurements = getCapturedOpenTelemetryMeasurements().filter(
      measurement => measurement.name === 'redbox.authorization_migration.batch.outcomes'
    );
    assert.deepEqual(measurements, [
      {
        name: 'redbox.authorization_migration.batch.outcomes',
        value: 1,
        attributes: { phase: 'roles', outcome: 'applied' },
      },
    ]);
  });

  it('records system-administrator recovery outcomes', async () => {
    const service = new BootstrapServices.AuthorizationBootstrapService();
    const ensureStub = sinon
      .stub(
        BootstrapServices.AuthorizationBootstrapService.prototype as unknown as {
          ensureSystemRole: (issues: unknown[]) => Promise<{ role?: unknown; created: boolean }>;
        },
        'ensureSystemRole'
      )
      .resolves({ role: { id: 'role-system-1', key: 'system-admin', protectedKind: 'system-admin' }, created: false });
    const globalNames = ['User', 'RoleAssignment'] as const;
    const originals = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    try {
      Reflect.set(globalThis, 'User', {
        find: () => ({
          limit: () => Promise.resolve([{ id: 'user-1', username: 'metrics-admin', accountLinkState: 'active' }]),
        }),
        findOne: () => ({
          usingConnection: async () => ({ id: 'user-1', username: 'metrics-admin', accountLinkState: 'active' }),
        }),
      });
      Reflect.set(globalThis, 'RoleAssignment', {
        getDatastore: () => transactionDatastore(),
        findOne: () => ({ usingConnection: async () => undefined }),
      });
      Reflect.set(globalThis, 'sails', {
        ...sails,
        services: {
          ...sails.services,
          authorizationpersistenceservice: { createRoleAssignment: async () => ({ id: 'assignment-9', version: 1 }) },
          authorizationauditservice: { createSucceededEvent: async () => ({ eventId: 'audit-9' }) },
        },
        log: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined },
      });

      await service.recoverSystemAdministrator({
        target: 'metrics-admin',
        reason: 'metrics rehearsal',
        confirmation: 'RECOVER-SYSTEM-ADMIN',
      });

      const measurements = getCapturedOpenTelemetryMeasurements().filter(
        measurement => measurement.name === 'redbox.authorization_bootstrap.recovery.outcomes'
      );
      assert.deepEqual(measurements, [
        { name: 'redbox.authorization_bootstrap.recovery.outcomes', value: 1, attributes: { outcome: 'created' } },
      ]);
    } finally {
      ensureStub.restore();
      for (const [name, descriptor] of originals) {
        if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
        else Object.defineProperty(globalThis, name, descriptor);
      }
      sinon.restore();
    }
  });
});

describe('Phase 3 remediation: ObjectId-style cursors resume across predicate-ignoring adapters', () => {
  const names = ['Role', 'RoleTemplate'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;
  let savedModels: typeof sails.models;

  // Native `_id` values: sails-mongo binds 24-hex `id` cursors to ObjectIds.
  const rowA = {
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    name: 'RoleA',
    branding: 'brand-1',
    displayName: '',
    status: 'active',
    version: 1,
  };
  const rowB = { ...rowA, id: 'bbbbbbbbbbbbbbbbbbbbbbbb', name: 'RoleB' };
  const rows = [rowA, rowB];

  function install(failBatchAtCall: number, updatedIds: string[]) {
    let transactionCalls = 0;
    Reflect.set(globalThis, 'Role', {
      // Predicate-ignoring adapter: returns the head of the collection
      // regardless of the range predicate, like a mixed-type `_id` collection
      // that cannot bind the cursor. Client-side resume filtering is
      // authoritative, so resume must still advance without rework.
      find: () => ({
        sort: () => ({
          limit: (size: number) => Promise.resolve(rows.slice(0, size)),
        }),
      }),
      findOne: (criteria: Record<string, unknown>) => ({
        usingConnection: async () => ({ ...rows.find(row => row.id === criteria.id) }),
      }),
      count: () => ({ usingConnection: async () => 1 }),
      updateOne: (criteria: Record<string, unknown>) => ({
        set: (projection: Record<string, unknown>) => ({
          meta: () => ({
            usingConnection: async () => {
              updatedIds.push(String((criteria as Record<string, unknown>).id));
              return { ...rowA, ...projection };
            },
          }),
        }),
      }),
      getDatastore: () => ({
        transaction: (work: (leased: Sails.Connection) => Promise<unknown>) => {
          transactionCalls += 1;
          if (transactionCalls === failBatchAtCall) return Promise.reject(new Error('interrupted lift'));
          return work(connection);
        },
      }),
    });
    Reflect.set(globalThis, 'RoleTemplate', { find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) });
  }

  beforeEach(async () => {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedServices = stubServices();
    savedModels = sails.models;
    sails.models = {} as typeof sails.models;
    await clearMigrationCheckpoint('roles');
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

  it('migrates every batch exactly once across interruption with native ObjectId keys', async () => {
    const firstUpdated: string[] = [];
    install(2, firstUpdated);
    await assert.rejects(
      new MigrationServices.AuthorizationMigrationService().reconcileBrandRoles(1),
      /interrupted lift/
    );
    assert.deepEqual(firstUpdated, ['aaaaaaaaaaaaaaaaaaaaaaaa']);
    assert.equal((await readMigrationCheckpoint('roles'))?.lastId, 'aaaaaaaaaaaaaaaaaaaaaaaa');

    const secondUpdated: string[] = [];
    install(-1, secondUpdated);
    const resumed = await new MigrationServices.AuthorizationMigrationService().reconcileBrandRoles(1);
    assert.equal(resumed.rolesMigrated, 1);
    assert.deepEqual(secondUpdated, ['bbbbbbbbbbbbbbbbbbbbbbbb']);
    // Fail-closed tail: the predicate-ignoring adapter keeps returning the
    // full head after the last row, so completeness is unverifiable. The scan
    // migrates each row exactly once, then emits role-scan-incomplete and
    // preserves the checkpoint instead of clearing it.
    assert.ok(
      resumed.issues.some(issue => issue.code === 'role-scan-incomplete' && issue.severity === 'blocker'),
      `expected role-scan-incomplete tail, saw ${JSON.stringify(resumed.issues)}`
    );
    assert.equal((await readMigrationCheckpoint('roles'))?.lastId, 'bbbbbbbbbbbbbbbbbbbbbbbb');
  });
});

describe('Phase 3 remediation: checkpoint preserves blockers across interruption', () => {
  const names = ['Role', 'RoleTemplate'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;
  let savedModels: typeof sails.models;

  const blockerRow = { id: 'role-a', name: 'RoleA', displayName: '', status: 'active', version: 1 };
  const okRow = { id: 'role-b', name: 'RoleB', branding: 'brand-1', displayName: '', status: 'active', version: 1 };
  const rows = [blockerRow, okRow];

  function install(failBatchAtCall: number) {
    let transactionCalls = 0;
    Reflect.set(globalThis, 'Role', {
      find: (criteria: Record<string, unknown>) => ({
        sort: () => ({
          limit: (size: number) => {
            let visible = [...rows];
            const idCriteria = criteria.id as { '>': string } | undefined;
            if (idCriteria !== undefined && typeof idCriteria === 'object' && '>' in idCriteria) {
              visible = visible.filter(row => row.id > idCriteria['>']);
            }
            return Promise.resolve(visible.slice(0, size));
          },
        }),
      }),
      findOne: (criteria: Record<string, unknown>) => ({
        usingConnection: async () => ({ ...rows.find(row => row.id === criteria.id) }),
      }),
      count: () => ({ usingConnection: async () => 1 }),
      updateOne: () => ({
        set: (projection: Record<string, unknown>) => ({
          meta: () => ({ usingConnection: async () => ({ ...okRow, ...projection }) }),
        }),
      }),
      getDatastore: () => ({
        transaction: (work: (leased: Sails.Connection) => Promise<unknown>) => {
          transactionCalls += 1;
          if (transactionCalls === failBatchAtCall) return Promise.reject(new Error('interrupted lift'));
          return work(connection);
        },
      }),
    });
    Reflect.set(globalThis, 'RoleTemplate', { find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) });
  }

  beforeEach(async () => {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedServices = stubServices();
    savedModels = sails.models;
    sails.models = {} as typeof sails.models;
    await clearMigrationCheckpoint('roles');
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

  it('keeps the completed-batch blocker after interruption and reports it on resume', async () => {
    install(2);
    await assert.rejects(
      new MigrationServices.AuthorizationMigrationService().reconcileBrandRoles(1),
      /interrupted lift/
    );
    const checkpoint = await readMigrationCheckpoint('roles');
    assert.equal(checkpoint?.lastId, 'role-a');
    assert.ok(checkpoint?.blockerCodes?.includes('role-brand-missing'), 'blocker must persist in the checkpoint');

    install(-1);
    const resumed = await new MigrationServices.AuthorizationMigrationService().reconcileBrandRoles(1);
    assert.equal(resumed.rolesMigrated, 1);
    assert.ok(
      resumed.issues.some(issue => issue.code === 'role-brand-missing' && issue.severity === 'blocker'),
      `resumed summary must retain the completed-batch blocker: ${JSON.stringify(resumed.issues)}`
    );
  });
});

describe('Phase 3 remediation: junction primary key is never a role reference', () => {
  const names = ['User', 'RoleAssignment'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;
  let savedModels: typeof sails.models;

  function installJunction(junctionDoc: Record<string, unknown>) {
    const junctionCollection = {
      find: (filter: unknown) => ({
        limit: (n: number) => {
          assert.ok(n === 501, `junction scan must be bounded at 501, got ${n}`);
          return {
            forEach: (cb: (doc: Record<string, unknown>) => void) => {
              if (JSON.stringify(filter).includes('user-1')) cb({ ...junctionDoc });
              return Promise.resolve(undefined);
            },
          };
        },
      }),
    };
    Reflect.set(globalThis, 'User', {
      find: () => ({
        populate: () => ({
          sort: () => ({
            limit: () => Promise.resolve([{ id: 'user-1', roles: [] }]),
          }),
        }),
      }),
      getDatastore: () => transactionDatastore({ manager: { collection: () => junctionCollection } }),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      findOne: () => ({ usingConnection: async () => undefined }),
    });
  }

  beforeEach(() => {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedServices = stubServices();
    savedModels = sails.models;
    sails.models = {} as typeof sails.models;
  });

  afterEach(() => {
    for (const name of names) {
      const descriptor = saved.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    sails.services = savedServices;
    sails.models = savedModels;
  });

  it('ignores a hydrated junction row carrying only its own primary key', async () => {
    installJunction({ id: 'ghost-pk', user_roles: 'user-1', createdAt: new Date(0), updatedAt: new Date(0) });
    // Populate dropped nothing (no roles) and the junction holds no role-side
    // reference: the row's own `id` must not become a dangling-role blocker.
    const summary = await new MigrationServices.AuthorizationMigrationService().migrateUserAssignments(10);
    assert.equal(summary.usersScanned, 1);
    assert.deepEqual(summary.issues, []);
  });

  it('still surfaces a genuine dangling role-side reference', async () => {
    installJunction({ id: 'junction-1', user_roles: 'user-1', role_users: 'ghost-role' });
    const summary = await new MigrationServices.AuthorizationMigrationService().migrateUserAssignments(10);
    assert.deepEqual(summary.issues, [
      { code: 'user-role-reference-missing', severity: 'blocker', entityType: 'user', entityId: 'user-1' },
    ]);
  });
});

describe('Phase 3 remediation: drift pages findings atomically without omissions or duplicates', () => {
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

  const brands = [{ id: 'brand-1' }, { id: 'brand-2' }, { id: 'brand-3' }];

  beforeEach(() => {
    previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    previousServices = stubServices();
    descriptors = new Map(modelNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    installHealthyTemplateGlobals();
    Reflect.set(globalThis, 'BrandingConfig', {
      find: (criteria: Record<string, unknown> = {}) => ({
        sort: () => ({
          limit: (size: number) => {
            // Cursor-aware double: honor the range predicate and the bound so
            // pagination proves progress instead of stalling fail-closed.
            let visible = [...brands];
            const idCrit = criteria.id as { '>': string } | undefined;
            if (idCrit !== undefined && typeof idCrit === 'object' && '>' in idCrit) {
              visible = visible.filter(brand => brand.id > idCrit['>']);
            }
            return Promise.resolve(visible.slice(0, size));
          },
        }),
      }),
    });
    Reflect.set(globalThis, 'Role', {
      count: () => Promise.resolve(0),
      find: (criteria: Record<string, unknown>) => ({
        sort: () => ({
          limit: (n: number) =>
            Promise.resolve(
              (criteria.contextType === 'system'
                ? [
                    {
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
                    },
                  ]
                : []
              ).slice(0, n)
            ),
        }),
      }),
      findOne: async (criteria: Record<string, unknown>) => {
        if ((criteria as { protectedKind?: string }).protectedKind === 'guest') {
          const brandId = String((criteria as { branding?: unknown }).branding ?? 'brand-1');
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
        return undefined;
      },
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      count: () => Promise.resolve(2),
      find: () => ({
        populate: (_a: string, _c?: unknown) => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }),
      }),
    });
    Reflect.set(globalThis, 'User', {
      find: () => ({
        populate: (_a: string, _c?: unknown) => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }),
      }),
    });
    Reflect.set(globalThis, 'PathRule', {
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
  });

  afterEach(() => {
    sails.models = previousModels;
    sails.services = previousServices;
    for (const name of modelNames) {
      const descriptor = descriptors.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
  });

  function decode(token: string): { cursors: Record<string, string>; completed: string[]; systemReported?: boolean } {
    return JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      cursors: Record<string, string>;
      completed: string[];
      systemReported?: boolean;
    };
  }

  it('emits each brand exactly once across findings-full pages and reports system state once', async () => {
    const service = new MigrationServices.AuthorizationMigrationService();
    // Every brand yields two blockers; limit=2 fits exactly one brand per page.
    const page1 = await service.reportDrift(2);
    assert.equal(page1.truncated, true);
    assert.equal(page1.issues.length, 2);
    assert.ok(page1.issues.every(issue => issue.entityId === 'brand-1'));
    assert.ok(page1.continuation !== undefined);
    const cursor1 = decode(page1.continuation as string);
    assert.equal(cursor1.cursors.brands, 'brand-1');
    assert.equal(cursor1.systemReported, true);

    // Drain to completion: the healthy template section contributes no
    // findings but its five definition items still paginate through the same
    // bounded page budget without duplicating or omitting brand findings.
    const brandEntityIds: Array<string | undefined> = [...page1.issues.map(issue => issue.entityId)];
    const templateCodes: string[] = [];
    let continuation: string | undefined = page1.continuation;
    let pages = 1;
    for (;;) {
      pages += 1;
      assert.ok(pages < 10, 'must progress, not loop forever');
      const page = await service.reportDrift(2, continuation);
      for (const issue of page.issues) {
        if (issue.entityId !== undefined && issue.entityId.startsWith('brand-')) {
          brandEntityIds.push(issue.entityId);
        }
        if (issue.code.startsWith('protected-template') || issue.code.startsWith('protected-role')) {
          templateCodes.push(issue.code);
        }
      }
      if (page.truncated) assert.ok(page.continuation !== undefined, 'truncated must carry continuation');
      continuation = page.continuation;
      if (!page.truncated) {
        assert.equal(page.continuation, undefined);
        break;
      }
    }
    assert.deepEqual(brandEntityIds, ['brand-1', 'brand-1', 'brand-2', 'brand-2', 'brand-3', 'brand-3']);
    assert.deepEqual(templateCodes, []);
  });
});

describe('Phase 3 remediation: path-rule operation flags participate in drift mapping', () => {
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

  function scopedBaselineRow(): { path: string; role: string; canRead: boolean; canUpdate: boolean } {
    const entry = FROZEN_LEGACY_ROUTE_BASELINE.find(
      candidate => candidate.authorizationKind === 'scope' && candidate.pathRuleMatches.length > 0
    );
    assert.ok(entry !== undefined, 'frozen baseline must contain a scoped route with path-rule matches');
    const row = FROZEN_LEGACY_PATH_RULE_ROWS[entry.pathRuleMatches[0]];
    return { path: row.path, role: row.role, canRead: row.canRead, canUpdate: row.canUpdate };
  }

  beforeEach(() => {
    previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    previousServices = stubServices();
    const mapped = scopedBaselineRow();
    // Flip at least one operation flag so the signature differs from baseline.
    const driftedFlags = mapped.canUpdate
      ? { can_read: true, can_update: false }
      : { can_read: true, can_update: true };
    descriptors = new Map(modelNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    installHealthyTemplateGlobals();
    Reflect.set(globalThis, 'BrandingConfig', {
      find: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    Reflect.set(globalThis, 'Role', {
      count: () => Promise.resolve(1),
      findOne: async () => undefined,
      find: (criteria: Record<string, unknown>) => ({
        sort: () => ({
          // Bounded limit surface: production resolves limit+1 probes via
          // `withBoundedLimit(chain, size)`, so `limit` must resolve to the
          // raw row array (fail-closed behavior depends on an iterable page,
          // never on a nested chain object).
          limit: () =>
            Promise.resolve(
              criteria.contextType === 'system'
                ? [{ id: 'system-admin', contextType: 'system', protectedKind: 'system-admin' }]
                : [{ id: 'brand-admin', contextType: 'brand', protectedKind: 'brand-admin' }]
            ),
          populate: () => ({
            then: (onfulfilled?: (value: unknown) => unknown) =>
              Promise.resolve(
                criteria.contextType === 'system'
                  ? [{ id: 'system-admin', contextType: 'system', protectedKind: 'system-admin' }]
                  : [{ id: 'brand-admin', contextType: 'brand', protectedKind: 'brand-admin' }]
              ).then(onfulfilled as never),
          }),
          then: (onfulfilled?: (value: unknown) => unknown) =>
            Promise.resolve(
              criteria.contextType === 'system'
                ? [{ id: 'system-admin', contextType: 'system', protectedKind: 'system-admin' }]
                : [{ id: 'brand-admin', contextType: 'brand', protectedKind: 'brand-admin' }]
            ).then(onfulfilled as never),
        }),
      }),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      count: () => Promise.resolve(2),
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    Reflect.set(globalThis, 'User', {
      find: () => ({ populate: () => ({ sort: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    Reflect.set(globalThis, 'PathRule', {
      find: () => ({
        populate: () => ({
          sort: () => ({
            limit: () =>
              Promise.resolve([
                {
                  id: 'rule-flag-drift',
                  path: mapped.path,
                  role: { id: 'role-1', name: mapped.role },
                  ...driftedFlags,
                },
                {
                  id: 'rule-flags-ok',
                  path: mapped.path,
                  role: { id: 'role-1', name: mapped.role },
                  can_read: mapped.canRead,
                  can_update: mapped.canUpdate,
                },
              ]),
          }),
        }),
      }),
    });
  });

  afterEach(() => {
    sails.models = previousModels;
    sails.services = previousServices;
    for (const name of modelNames) {
      const descriptor = descriptors.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
  });

  it('flags a same-path-same-role rule whose operation flags changed', async () => {
    const report = await new MigrationServices.AuthorizationMigrationService().reportDrift(100);
    const codes = report.issues.map(issue => `${issue.code}:${issue.entityId ?? ''}`);
    assert.ok(
      codes.includes('legacy-path-rule-operation-unmapped:rule-flag-drift'),
      `flag drift must be reported, saw ${JSON.stringify(codes)}`
    );
    assert.ok(
      !codes.some(code => code.endsWith(':rule-flags-ok')),
      `flag-identical rule must stay silent: ${JSON.stringify(codes)}`
    );
  });
});

describe('Phase 3 remediation: protected bootstrap create races and versionless repair', () => {
  const names = ['BrandingConfig', 'RoleTemplate', 'Role', 'RoleScopeOverride', 'AuthorizationAudit'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;
  let savedReadiness: unknown;

  interface RoleMockState {
    findRows: Array<Array<Record<string, unknown>>>;
    failCreateTimes: number;
    updateResult: 'updated' | 'stale';
    createCalls: unknown[];
    updateCriteria: unknown[];
    updateProjections: Array<Record<string, unknown>>;
  }

  function installRoleMock(state: RoleMockState): void {
    let findCalls = 0;
    let createCalls = 0;
    let lastRows: Array<Record<string, unknown>> = [];
    Reflect.set(globalThis, 'Role', {
      // Lazy cursor double: asserts the adapter bound (`.limit()`) is applied
      // before materialization, never a pre-materialized array.
      find: () => ({
        sort: () => ({
          usingConnection: () => ({
            limit: (n: number) => {
              assert.ok(n <= 502, `Role scan must be bounded, got limit ${n}`);
              return (async () => {
                lastRows = state.findRows[Math.min(findCalls++, state.findRows.length - 1)];
                return lastRows.slice(0, n);
              })();
            },
          }),
        }),
      }),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({
          usingConnection: async () => {
            state.createCalls.push(values);
            createCalls += 1;
            if (createCalls <= state.failCreateTimes) {
              throw Object.assign(new Error('duplicate key'), { code: 'E_UNIQUE' });
            }
            return { id: 'role-new', ...values };
          },
        }),
      }),
      updateOne: (criteria: Record<string, unknown>) => {
        state.updateCriteria.push(criteria);
        return {
          set: (projection: Record<string, unknown>) => {
            state.updateProjections.push(projection);
            return {
              meta: () => ({
                usingConnection: async () =>
                  state.updateResult === 'stale' ? undefined : { ...lastRows[0], ...projection },
              }),
            };
          },
        };
      },
      getDatastore: () => transactionDatastore(),
    });
  }

  function installBootstrapHarness(): void {
    savedServices = sails.services;
    savedReadiness = sails.config.authorizationReadiness;
    sails.services = {
      ...sails.services,
      authorizationscopeservice: {
        bootstrap: async () => ({}),
        getRegistry: () => ({ isActive: () => true }),
      },
      authorizationmigrationservice: {
        reconcileBrandRoles: async () => ({
          issues: [],
          metrics: { conflictsResolved: 0, transactionFailures: 0 },
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
    Reflect.set(globalThis, 'BrandingConfig', {
      // Lazy brand cursor: bound before materialization.
      find: () => ({
        sort: () => ({
          limit: (n: number) => {
            assert.ok(n <= 501, `Brand scan must be bounded, got limit ${n}`);
            return Promise.resolve([{ id: 'brand-1' }].slice(0, n));
          },
        }),
      }),
    });
    Reflect.set(globalThis, 'RoleTemplate', { findOne: async () => ({ id: 'tmpl-guest' }) });
    Reflect.set(globalThis, 'RoleScopeOverride', {
      find: () => ({
        sort: () => ({
          usingConnection: () => ({
            limit: (n: number) => {
              assert.ok(n <= 501, `Override scan must be bounded, got limit ${n}`);
              return Promise.resolve([]);
            },
          }),
        }),
      }),
      destroy: () => ({ usingConnection: async () => [] }),
    });
    Reflect.set(globalThis, 'AuthorizationAudit', { getDatastore: () => transactionDatastore() });
  }

  beforeEach(() => {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    installBootstrapHarness();
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

  function freshState(overrides: Partial<RoleMockState> = {}): RoleMockState {
    return {
      findRows: [[]],
      failCreateTimes: 0,
      updateResult: 'updated',
      createCalls: [],
      updateCriteria: [],
      updateProjections: [],
      ...overrides,
    };
  }

  it('adopts a concurrent identical Guest winner instead of failing the lift', async () => {
    const winner = {
      id: 'guest-winner',
      name: 'Guest',
      key: 'Guest',
      identityKey: 'brand:brand-1:Guest',
      displayName: 'Guest',
      contextType: 'brand',
      branding: 'brand-1',
      template: 'tmpl-guest',
      templateRevision: -1,
      protectedKind: 'guest',
      status: 'active',
      version: 2,
    };
    const state = freshState({ findRows: [[], [{ ...winner }]], failCreateTimes: 1 });
    installRoleMock(state);

    const result = await new BootstrapServices.AuthorizationBootstrapService().bootstrap({});

    assert.equal(state.createCalls.length, 1);
    assert.ok(
      !result.issues.some(issue => String(issue.code).startsWith('protected-guest')),
      `identical winner must be adopted silently: ${JSON.stringify(result.issues)}`
    );
    assert.equal(result.guestRolesCreated, 0);
  });

  it('rejects a concurrent Guest winner with drifted protected identity', async () => {
    const impostor = {
      id: 'guest-impostor',
      name: 'Guest',
      key: 'Guest',
      identityKey: 'brand:brand-1:Guest',
      displayName: 'Guest',
      contextType: 'brand',
      branding: 'brand-1',
      template: 'tmpl-guest',
      templateRevision: -1,
      protectedKind: 'none',
      status: 'active',
      version: 2,
    };
    const state = freshState({ findRows: [[], [{ ...impostor }]], failCreateTimes: 1 });
    installRoleMock(state);

    const result = await new BootstrapServices.AuthorizationBootstrapService().bootstrap({});

    assert.ok(
      result.issues.some(issue => issue.code === 'protected-guest-identity-drift' && issue.severity === 'blocker'),
      `drifted winner must be reported: ${JSON.stringify(result.issues)}`
    );
    assert.equal(result.guestRolesRepaired, 0);
  });

  it('repairs a versionless Guest row with a full expected-state predicate', async () => {
    const versionless = {
      id: 'guest-1',
      name: 'Guest',
      key: 'Guest',
      identityKey: 'brand:brand-1:Guest',
      displayName: 'Guest',
      contextType: 'brand',
      branding: 'brand-1',
      template: 'tmpl-old',
      templateRevision: -1,
      protectedKind: 'guest',
      status: 'active',
    };
    const state = freshState({ findRows: [[{ ...versionless }]] });
    installRoleMock(state);

    const result = await new BootstrapServices.AuthorizationBootstrapService().bootstrap({});

    assert.equal(result.guestRolesRepaired, 1);
    assert.equal(state.updateCriteria.length, 1);
    const criteria = state.updateCriteria[0] as Record<string, unknown>;
    assert.equal(criteria.id, 'guest-1');
    assert.equal(criteria.version, null, 'versionless rows must pin version null/absent fail-closed');
    assert.equal(criteria.identityKey, 'brand:brand-1:Guest');
    assert.equal(criteria.protectedKind, 'guest');
    assert.equal(criteria.status, 'active');
    assert.equal(criteria.contextType, 'brand');
    assert.equal(state.updateProjections[0]['version'], 1);
  });

  it('fails closed when a versionless Guest repair loses a concurrent race', async () => {
    const versionless = {
      id: 'guest-1',
      name: 'Guest',
      key: 'Guest',
      identityKey: 'brand:brand-1:Guest',
      displayName: 'Guest',
      contextType: 'brand',
      branding: 'brand-1',
      template: 'tmpl-old',
      templateRevision: -1,
      protectedKind: 'guest',
      status: 'active',
    };
    installRoleMock(freshState({ findRows: [[{ ...versionless }]], updateResult: 'stale' }));

    await assert.rejects(new BootstrapServices.AuthorizationBootstrapService().bootstrap({}), /changed concurrently/);
  });

  it('adopts a concurrent identical system-administrator winner', async () => {
    const winner = {
      id: 'sys-winner',
      name: 'system-admin',
      key: 'system-admin',
      identityKey: 'system:system-admin',
      displayName: 'System administrator',
      contextType: 'system',
      template: 'tmpl-sys',
      templateRevision: -1,
      protectedKind: 'system-admin',
      status: 'active',
      version: 5,
    };
    const state = freshState({ findRows: [[], [{ ...winner }]], failCreateTimes: 1 });
    installRoleMock(state);
    Reflect.set(globalThis, 'RoleTemplate', { findOne: async () => ({ id: 'tmpl-sys' }) });

    const service = new BootstrapServices.AuthorizationBootstrapService() as unknown as {
      ensureSystemRole: (issues: unknown[]) => Promise<{ role?: Record<string, unknown>; created: boolean }>;
    };
    const issues: unknown[] = [];
    const result = await service.ensureSystemRole(issues);

    assert.equal(state.createCalls.length, 1);
    assert.equal(result.role?.id, 'sys-winner');
    assert.equal(result.created, false);
    assert.deepEqual(issues, []);
  });

  it('rejects a concurrent system-administrator winner with drifted identity', async () => {
    const impostor = {
      id: 'sys-impostor',
      name: 'system-admin',
      key: 'system-admin',
      identityKey: 'system:system-admin',
      displayName: 'System administrator',
      contextType: 'system',
      template: 'tmpl-sys',
      templateRevision: -1,
      protectedKind: 'none',
      status: 'active',
      version: 5,
    };
    const state = freshState({ findRows: [[], [{ ...impostor }]], failCreateTimes: 1 });
    installRoleMock(state);
    Reflect.set(globalThis, 'RoleTemplate', { findOne: async () => ({ id: 'tmpl-sys' }) });

    const service = new BootstrapServices.AuthorizationBootstrapService() as unknown as {
      ensureSystemRole: (issues: unknown[]) => Promise<{ role?: Record<string, unknown>; created: boolean }>;
    };
    const issues: unknown[] = [];
    const result = await service.ensureSystemRole(issues);

    assert.equal(result.role, undefined);
    assert.ok(
      (issues as Array<{ code?: unknown }>).some(issue => issue.code === 'system-admin-role-identity-drift'),
      `drifted system winner must be reported: ${JSON.stringify(issues)}`
    );
  });

  it('audits a Guest race adoption with a role.noop event instead of absorbing it silently', async () => {
    const winner = {
      id: 'guest-winner',
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
    const state = freshState({ findRows: [[], [{ ...winner }]], failCreateTimes: 1 });
    installRoleMock(state);
    const auditEvents: Array<Record<string, unknown>> = [];
    sails.services = {
      ...sails.services,
      authorizationauditservice: {
        createSucceededEvent: async (...args: unknown[]) => {
          auditEvents.push(args[0] as Record<string, unknown>);
          return { id: 'audit-1' };
        },
      },
    };

    const result = await new BootstrapServices.AuthorizationBootstrapService().bootstrap({});

    assert.equal(result.guestRolesCreated, 0);
    assert.equal(result.guestRolesRepaired, 0);
    const noop = auditEvents.filter(event => event.eventType === 'role.noop');
    assert.equal(noop.length, 1);
    assert.equal(noop[0].targetType, 'role');
    assert.equal(noop[0].targetId, 'guest-winner');
    assert.deepEqual(noop[0].after, { protectedKind: 'guest', state: 'active-adopted' });
  });

  it('audits a system-administrator race adoption with a role.noop event', async () => {
    const winner = {
      id: 'sys-winner',
      name: 'system-admin',
      key: 'system-admin',
      identityKey: 'system:system-admin',
      displayName: 'System administrator',
      contextType: 'system',
      template: 'tmpl-sys',
      templateRevision: 1,
      protectedKind: 'system-admin',
      status: 'active',
      version: 5,
    };
    const state = freshState({ findRows: [[], [{ ...winner }]], failCreateTimes: 1 });
    installRoleMock(state);
    Reflect.set(globalThis, 'RoleTemplate', { findOne: async () => ({ id: 'tmpl-sys' }) });
    const auditEvents: Array<Record<string, unknown>> = [];
    sails.services = {
      ...sails.services,
      authorizationauditservice: {
        createSucceededEvent: async (...args: unknown[]) => {
          auditEvents.push(args[0] as Record<string, unknown>);
          return { id: 'audit-1' };
        },
      },
    };

    const service = new BootstrapServices.AuthorizationBootstrapService() as unknown as {
      ensureSystemRole: (issues: unknown[]) => Promise<{ role?: Record<string, unknown>; created: boolean }>;
    };
    const issues: unknown[] = [];
    const result = await service.ensureSystemRole(issues);

    assert.equal(result.role?.id, 'sys-winner');
    assert.deepEqual(issues, []);
    const noop = auditEvents.filter(event => event.eventType === 'role.noop');
    assert.equal(noop.length, 1);
    assert.equal(noop[0].targetId, 'sys-winner');
    assert.deepEqual(noop[0].after, { protectedKind: 'system-admin', state: 'active-adopted' });
  });

  it('migrates one user with roles in two brands into two brand-scoped assignments', async () => {
    // True multi-brand fixture: a single canonical user holds a legacy role
    // in brand-1 and a different legacy role in brand-2. Migration must create
    // two brand-scoped assignments for the same principal, one per brand.
    const roleBrand1 = {
      id: 'role-brand-1',
      name: 'Researcher',
      protectedKind: 'none',
      contextType: 'brand',
      branding: 'brand-1',
    };
    const roleBrand2 = {
      id: 'role-brand-2',
      name: 'Librarians',
      protectedKind: 'none',
      contextType: 'brand',
      branding: 'brand-2',
    };
    const previousModels = sails.models;
    sails.models = {} as typeof sails.models;
    const previousServices = sails.services;
    const created: Array<Record<string, unknown>> = [];
    const noopAudits: Array<Record<string, unknown>> = [];
    sails.services = {
      ...previousServices,
      authorizationauditservice: {
        createSucceededEvent: async (...args: unknown[]) => {
          noopAudits.push(args[0] as Record<string, unknown>);
          return { id: 'audit-1' };
        },
      },
      authorizationpersistenceservice: {
        createRoleAssignment: async (input: Record<string, unknown>) => {
          const row = { id: `assignment-${String(input.role)}`, ...(input as object) };
          created.push(row);
          return row;
        },
      },
    } as typeof sails.services;
    const names = ['User', 'Role', 'RoleAssignment'] as const;
    const saved = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis, n)]));
    Reflect.set(globalThis, 'User', {
      find: () => ({
        // Lazy user cursor with bounded nested roles: the adapter bound is
        // applied before materialization.
        populate: (_assoc: string, criteria?: { limit?: number }) => ({
          sort: () => ({
            limit: (n: number) => {
              assert.ok(n <= 11, `User scan must be bounded, got limit ${n}`);
              const roles =
                criteria?.limit !== undefined
                  ? [{ ...roleBrand1 }, { ...roleBrand2 }].slice(0, criteria.limit)
                  : [{ ...roleBrand1 }, { ...roleBrand2 }];
              return Promise.resolve([{ id: 'user-multi', loginDisabled: false, roles }]);
            },
          }),
        }),
      }),
      getDatastore: () => ({
        transaction: async (work: (c: unknown) => Promise<unknown>) => work({ lease: 'multi-brand' }),
        manager: { collection: () => ({ find: () => ({ limit: () => ({ toArray: async () => [] }) }) }) },
      }),
    });
    Reflect.set(globalThis, 'Role', {
      getDatastore: () => ({
        transaction: async (work: (c: unknown) => Promise<unknown>) => work({ lease: 'multi-brand' }),
      }),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      findOne: () => ({ usingConnection: async () => undefined }),
    });
    try {
      await clearMigrationCheckpoint('assignments');
      const summary = await new MigrationServices.AuthorizationMigrationService().migrateUserAssignments(10);
      assert.equal(summary.usersScanned, 1);
      assert.equal(summary.assignmentsCreated, 2);
      const brands = created.map(row => String((row.branding as string) ?? '')).sort();
      assert.deepEqual(brands, ['brand-1', 'brand-2']);
      const principals = new Set(created.map(row => String(row.principalId)));
      assert.equal(principals.size, 1);
      assert.ok(principals.has('user-multi'));
      assert.deepEqual(created.map(row => String(row.role)).sort(), ['role-brand-1', 'role-brand-2']);
    } finally {
      sails.models = previousModels;
      sails.services = previousServices;
      for (const n of names) {
        const d = saved.get(n);
        if (d === undefined) Reflect.deleteProperty(globalThis, n);
        else Object.defineProperty(globalThis, n, d);
      }
      await clearMigrationCheckpoint('assignments');
    }
  });
});
