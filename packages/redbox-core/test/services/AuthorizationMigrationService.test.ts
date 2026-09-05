import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';
import { Services } from '../../src/services/AuthorizationMigrationService';
import { DEFAULT_ROLE_TEMPLATES } from '../../src/authorization';

function queryResult<T>(value: T) {
  const query = {
    limit() {
      return query;
    },
    populate() {
      return query;
    },
    sort() {
      return query;
    },
    then<TResult1 = T, TResult2 = never>(
      onfulfilled?: ((result: T) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve(value).then(onfulfilled, onrejected);
    },
  };
  return query;
}

const modelNames = [
  'BrandingConfig',
  'Role',
  'RoleAssignment',
  'RoleScopeOverride',
  'User',
  'PathRule',
  'RoleTemplate',
  'RoleTemplateRevision',
] as const;
let descriptors: Map<string, PropertyDescriptor | undefined>;
let previousModels: typeof sails.models;

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

describe('AuthorizationMigrationService drift report', () => {
  beforeEach(() => {
    previousModels = sails.models;
    sails.models = { record: { find: () => queryResult([]) } } as unknown as typeof sails.models;
    descriptors = new Map(modelNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    Reflect.set(globalThis, 'BrandingConfig', {
      find: () => queryResult([{ id: 'brand-1' }, { id: 'brand-2' }]),
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
      find: (criteria: Record<string, unknown>) =>
        queryResult([
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
            : {
                id: 'brand-admin',
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
        ]),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      count: () => Promise.resolve(2),
      find: () => queryResult([]),
    });
    Reflect.set(globalThis, 'User', { find: () => queryResult([]) });
    Reflect.set(globalThis, 'PathRule', { find: () => queryResult([]) });
    Reflect.set(globalThis, 'RoleScopeOverride', {
      findOne: async () => undefined,
      find: () => queryResult([]),
    });
    installHealthyTemplateGlobals();
  });

  afterEach(() => {
    sails.models = previousModels;
    for (const name of modelNames) {
      const descriptor = descriptors.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
  });

  it('marks the report truncated when the brand scan exceeds its bounded limit', async () => {
    const report = await new Services.AuthorizationMigrationService().reportDrift(1);

    assert.equal(report.truncated, true);
    assert.deepEqual(report.issues, []);
  });
});

describe('AuthorizationMigrationService role CAS', () => {
  const connection = Object.freeze({ lease: 'migration-roles' });
  const names = ['Role', 'RoleTemplate', 'User', 'RoleAssignment'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;

  const roleRow = {
    id: 'role-1',
    name: 'CustomRole',
    branding: 'brand-1',
    displayName: '',
    status: 'active',
    version: 3,
  };

  function installRoleMocks(updateCriteria: unknown[], updateResult: 'updated' | 'stale') {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedServices = sails.services;
    let findCalls = 0;
    Reflect.set(globalThis, 'Role', {
      find: () => ({
        sort: () => ({
          limit: () => {
            findCalls += 1;
            return Promise.resolve(findCalls === 1 ? [roleRow] : []);
          },
        }),
      }),
      findOne: () => ({
        usingConnection: (leased: Sails.Connection) => {
          assert.equal(leased, connection);
          return Promise.resolve({ ...roleRow });
        },
      }),
      count: () => ({
        usingConnection: (leased: Sails.Connection) => {
          assert.equal(leased, connection);
          return Promise.resolve(1);
        },
      }),
      updateOne: (criteria: Record<string, unknown>) => {
        updateCriteria.push(criteria);
        return {
          set: () => ({
            meta: () => ({
              usingConnection: (leased: Sails.Connection) => {
                assert.equal(leased, connection);
                if (updateResult === 'stale') return Promise.resolve(undefined);
                return Promise.resolve({ ...roleRow, key: 'CustomRole' });
              },
            }),
          }),
        };
      },
      getDatastore: () => ({
        transaction: (work: (leased: Sails.Connection) => Promise<unknown>) => work(connection),
      }),
    });
    Reflect.set(globalThis, 'RoleTemplate', {
      find: () => ({ sort: () => ({ limit: (n: number) => Promise.resolve([]) }) }),
    });
    sails.services = {
      ...savedServices,
      authorizationauditservice: { createSucceededEvent: () => Promise.resolve({ id: 'audit-1' }) },
    };
  }

  afterEach(() => {
    for (const name of names) {
      const descriptor = saved?.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    if (savedServices !== undefined) sails.services = savedServices;
  });

  it('predicates role migration writes on the expected version', async () => {
    const updateCriteria: unknown[] = [];
    installRoleMocks(updateCriteria, 'updated');
    const summary = await new Services.AuthorizationMigrationService().reconcileBrandRoles(10);
    assert.deepEqual(updateCriteria, [{ id: 'role-1', version: 3 }]);
    assert.equal(summary.rolesMigrated, 1);
  });

  it('advances the stored version on successful migration writes', async () => {
    const localNames = ['Role', 'RoleTemplate'] as const;
    const localSaved = new Map(localNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    const localSavedServices = sails.services;
    const capturedProjections: Array<Record<string, unknown>> = [];
    try {
      let findCalls = 0;
      Reflect.set(globalThis, 'Role', {
        find: () => ({
          sort: () => ({
            limit: () => {
              findCalls += 1;
              return Promise.resolve(findCalls === 1 ? [{ ...roleRow }] : []);
            },
          }),
        }),
        findOne: () => ({
          usingConnection: () => Promise.resolve({ ...roleRow }),
        }),
        count: () => ({
          usingConnection: () => Promise.resolve(1),
        }),
        updateOne: () => ({
          set: (projection: Record<string, unknown>) => {
            capturedProjections.push(projection);
            return {
              meta: () => ({
                usingConnection: () => Promise.resolve({ ...roleRow, key: 'CustomRole' }),
              }),
            };
          },
        }),
        getDatastore: () => ({
          transaction: (work: (leased: Sails.Connection) => Promise<unknown>) => work(connection),
        }),
      });
      Reflect.set(globalThis, 'RoleTemplate', {
        find: () => ({ sort: () => ({ limit: (n: number) => Promise.resolve([]) }) }),
      });
      sails.services = {
        ...localSavedServices,
        authorizationauditservice: { createSucceededEvent: () => Promise.resolve({ id: 'audit-1' }) },
      };

      await new Services.AuthorizationMigrationService().reconcileBrandRoles(10);
      assert.equal(capturedProjections.length, 1);
      assert.equal(capturedProjections[0]['version'], 4);
    } finally {
      for (const name of localNames) {
        const descriptor = localSaved.get(name);
        if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
        else Object.defineProperty(globalThis, name, descriptor);
      }
      sails.services = localSavedServices;
    }
  });

  it('keeps the legacy fallback version for rows without a version', async () => {
    const localNames = ['Role', 'RoleTemplate'] as const;
    const localSaved = new Map(localNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    const localSavedServices = sails.services;
    const capturedCriteria: unknown[] = [];
    const capturedProjections: Array<Record<string, unknown>> = [];
    const legacyRow = { ...roleRow };
    delete (legacyRow as Record<string, unknown>)['version'];
    try {
      let findCalls = 0;
      Reflect.set(globalThis, 'Role', {
        find: () => ({
          sort: () => ({
            limit: () => {
              findCalls += 1;
              return Promise.resolve(findCalls === 1 ? [{ ...legacyRow }] : []);
            },
          }),
        }),
        findOne: () => ({
          usingConnection: () => Promise.resolve({ ...legacyRow }),
        }),
        count: () => ({
          usingConnection: () => Promise.resolve(1),
        }),
        updateOne: (criteria: Record<string, unknown>) => {
          capturedCriteria.push(criteria);
          return {
            set: (projection: Record<string, unknown>) => {
              capturedProjections.push(projection);
              return {
                meta: () => ({
                  usingConnection: () => Promise.resolve({ ...legacyRow, key: 'CustomRole' }),
                }),
              };
            },
          };
        },
        getDatastore: () => ({
          transaction: (work: (leased: Sails.Connection) => Promise<unknown>) => work(connection),
        }),
      });
      Reflect.set(globalThis, 'RoleTemplate', {
        find: () => ({ sort: () => ({ limit: (n: number) => Promise.resolve([]) }) }),
      });
      sails.services = {
        ...localSavedServices,
        authorizationauditservice: { createSucceededEvent: () => Promise.resolve({ id: 'audit-1' }) },
      };

      await new Services.AuthorizationMigrationService().reconcileBrandRoles(10);
      // Versionless rows pin every overwritten field with explicit
      // null/absence semantics so a concurrent field change fails closed
      // instead of being clobbered by an id-only write.
      assert.deepEqual(capturedCriteria, [
        {
          id: 'role-1',
          version: null,
          name: 'CustomRole',
          branding: 'brand-1',
          template: null,
          key: null,
          identityKey: null,
          displayName: '',
          contextType: null,
          protectedKind: null,
          status: 'active',
          templateRevision: null,
          createdBy: null,
          updatedBy: null,
        },
      ]);
      assert.equal(capturedProjections[0]['version'], 1);
    } finally {
      for (const name of localNames) {
        const descriptor = localSaved.get(name);
        if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
        else Object.defineProperty(globalThis, name, descriptor);
      }
      sails.services = localSavedServices;
    }
  });

  it('fails closed when a role changes concurrently during migration', async () => {
    installRoleMocks([], 'stale');
    await assert.rejects(new Services.AuthorizationMigrationService().reconcileBrandRoles(10), /changed concurrently/);
  });
});

describe('AuthorizationMigrationService assignment conflicts', () => {
  const connection = Object.freeze({ lease: 'migration-assignments' });
  const names = ['User', 'RoleAssignment'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedServices: typeof sails.services;

  const roleValue = {
    id: 'role-9',
    name: 'Researcher',
    contextType: 'brand',
    branding: 'brand-1',
    protectedKind: 'none',
  };
  const userRow = { id: 'user-1', roles: [roleValue] };

  function installAssignmentMocks(options: {
    readonly createBehavior: 'created' | 'existing' | 'unique-then-found' | 'unique-then-missing';
    readonly assignmentFindCalls?: unknown[];
    readonly createdCount?: { count: number };
  }) {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedServices = sails.services;
    let userCalls = 0;
    Reflect.set(globalThis, 'User', {
      find: () => ({
        populate: () => ({
          sort: () => ({
            limit: () => {
              userCalls += 1;
              return Promise.resolve(userCalls === 1 ? [userRow] : []);
            },
          }),
        }),
      }),
      getDatastore: () => ({
        transaction: (work: (leased: Sails.Connection) => Promise<unknown>) => work(connection),
      }),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      findOne: (criteria: Record<string, unknown>) => ({
        usingConnection: (leased: Sails.Connection) => {
          assert.equal(leased, connection);
          options.assignmentFindCalls?.push(criteria);
          if (options.createBehavior === 'existing') return Promise.resolve({ id: 'assignment-1' });
          if (options.createBehavior === 'created') return Promise.resolve(undefined);
          // Post-conflict reread: the winning worker's row is now visible.
          if (options.createBehavior === 'unique-then-found' && (options.assignmentFindCalls?.length ?? 0) > 1) {
            return Promise.resolve({ id: 'assignment-1' });
          }
          return Promise.resolve(undefined);
        },
      }),
    });
    sails.services = {
      ...savedServices,
      authorizationauditservice: { createSucceededEvent: () => Promise.resolve({ id: 'audit-1' }) },
      authorizationpersistenceservice: {
        createRoleAssignment: () => {
          if (options.createdCount) options.createdCount.count += 1;
          if (options.createBehavior === 'created') return Promise.resolve({ id: 'assignment-1' });
          const error = Object.assign(new Error('duplicate key'), { code: 'E_UNIQUE' });
          return Promise.reject(error);
        },
      },
    };
  }

  afterEach(() => {
    for (const name of names) {
      const descriptor = saved?.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    if (savedServices !== undefined) sails.services = savedServices;
  });

  it('maps a concurrent unique conflict to idempotent success after rereading the winner', async () => {
    const assignmentFindCalls: unknown[] = [];
    installAssignmentMocks({ createBehavior: 'unique-then-found', assignmentFindCalls });
    const summary = await new Services.AuthorizationMigrationService().migrateUserAssignments(10);
    assert.equal(summary.assignmentsCreated, 0);
    assert.equal(summary.usersScanned, 1);
    assert.equal(assignmentFindCalls.length, 2);
    assert.deepEqual(assignmentFindCalls[0], assignmentFindCalls[1]);
  });

  it('creates the assignment when the projection is missing', async () => {
    const createdCount = { count: 0 };
    installAssignmentMocks({ createBehavior: 'created', createdCount });
    const summary = await new Services.AuthorizationMigrationService().migrateUserAssignments(10);
    assert.equal(summary.assignmentsCreated, 1);
    assert.equal(createdCount.count, 1);
  });

  it('reruns are idempotent when the assignment already exists', async () => {
    const createdCount = { count: 0 };
    installAssignmentMocks({ createBehavior: 'existing', createdCount });
    const rerun = await new Services.AuthorizationMigrationService().migrateUserAssignments(10);
    assert.equal(rerun.assignmentsCreated, 0);
    assert.equal(rerun.usersScanned, 1);
    assert.equal(createdCount.count, 0);
  });

  it('rethrows the conflict when the reread finds no winning row', async () => {
    installAssignmentMocks({ createBehavior: 'unique-then-missing' });
    await assert.rejects(new Services.AuthorizationMigrationService().migrateUserAssignments(10), /duplicate key/);
  });

  it('aborts the failed creation transaction and rereads the winner in a fresh transaction', async () => {
    const localSaved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    const localSavedServices = sails.services;
    try {
      const transactions: Array<{ lease: string; aborted: boolean }> = [];
      let userCalls = 0;
      let createConnection: { lease: string; aborted: boolean } | undefined;
      let rereadConnection: { lease: string; aborted: boolean } | undefined;
      Reflect.set(globalThis, 'User', {
        find: () => ({
          populate: () => ({
            sort: () => ({
              limit: () => {
                userCalls += 1;
                return Promise.resolve(userCalls === 1 ? [userRow] : []);
              },
            }),
          }),
        }),
        getDatastore: () => ({
          transaction: (work: (leased: Sails.Connection) => Promise<unknown>) => {
            const connection = { lease: `migration-txn-${transactions.length + 1}`, aborted: false };
            transactions.push(connection);
            return work(connection as unknown as Sails.Connection);
          },
        }),
      });
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => ({
          usingConnection: (leased: Sails.Connection) => {
            const connection = leased as unknown as { lease: string; aborted: boolean };
            // The aborted creation session must never be reused for reads.
            assert.equal(connection.aborted, false);
            if (connection.lease === 'migration-txn-1') {
              // Outer pre-check snapshot misses the concurrent winner.
              return Promise.resolve(undefined);
            }
            if (createConnection !== undefined && connection === createConnection) {
              assert.fail('conflict reread reused the aborted creation transaction');
            }
            rereadConnection = connection;
            // Winner is visible only in the fresh reread transaction after abort.
            return Promise.resolve({ id: 'assignment-winner' });
          },
        }),
      });
      sails.services = {
        ...localSavedServices,
        authorizationauditservice: { createSucceededEvent: () => Promise.resolve({ id: 'audit-1' }) },
        authorizationpersistenceservice: {
          createRoleAssignment: (_input: unknown, leased: Sails.Connection) => {
            createConnection = leased as unknown as { lease: string; aborted: boolean };
            assert.equal(createConnection.lease, 'migration-txn-2');
            // Model MongoDB aborting the writing transaction on duplicate-key.
            createConnection.aborted = true;
            const error = Object.assign(new Error('duplicate key'), { code: 'E_UNIQUE' });
            return Promise.reject(error);
          },
        },
      };

      const summary = await new Services.AuthorizationMigrationService().migrateUserAssignments(10);

      assert.equal(summary.assignmentsCreated, 0);
      assert.equal(summary.usersScanned, 1);
      assert.ok(createConnection !== undefined);
      assert.equal(createConnection.aborted, true);
      assert.ok(rereadConnection !== undefined);
      assert.notEqual(rereadConnection, createConnection);
      assert.equal(transactions.length, 3);
      assert.equal(transactions[0].lease, 'migration-txn-1');
      assert.equal(transactions[1].aborted, true);
      assert.equal(transactions[2].aborted, false);
    } finally {
      for (const name of names) {
        const descriptor = localSaved.get(name);
        if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
        else Object.defineProperty(globalThis, name, descriptor);
      }
      sails.services = localSavedServices;
    }
  });

  it('rolls back the assignment when its success audit fails in the same transaction', async () => {
    const localSaved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    const localSavedServices = sails.services;
    try {
      type Txn = {
        lease: string;
        aborted: boolean;
        stagedAssignments: string[];
        stagedAudits: string[];
      };
      const transactions: Txn[] = [];
      const committedAssignmentIds: string[] = [];
      const committedAuditTargetIds: string[] = [];
      const byLease = new Map<string, Txn>();
      let userCalls = 0;
      let createConnection: { lease: string } | undefined;
      let auditConnection: { lease: string } | undefined;
      Reflect.set(globalThis, 'User', {
        find: () => ({
          populate: () => ({
            sort: () => ({
              limit: () => {
                userCalls += 1;
                return Promise.resolve(userCalls === 1 ? [userRow] : []);
              },
            }),
          }),
        }),
        // Waterline adapter path: no native mongo manager, only transaction().
        // The migration helper keeps using runWithRequiredTransaction, so the
        // native mongo session path shares the same atomic commit unit.
        getDatastore: () => ({
          transaction: async (work: (leased: Sails.Connection) => Promise<unknown>) => {
            const txn: Txn = {
              lease: `migration-txn-${transactions.length + 1}`,
              aborted: false,
              stagedAssignments: [],
              stagedAudits: [],
            };
            transactions.push(txn);
            byLease.set(txn.lease, txn);
            try {
              const result = await work(txn as unknown as Sails.Connection);
              committedAssignmentIds.push(...txn.stagedAssignments);
              committedAuditTargetIds.push(...txn.stagedAudits);
              return result;
            } catch (error) {
              txn.aborted = true;
              throw error;
            }
          },
        }),
      });
      Reflect.set(globalThis, 'RoleAssignment', {
        findOne: () => ({
          usingConnection: () => Promise.resolve(undefined),
        }),
      });
      sails.services = {
        ...localSavedServices,
        authorizationpersistenceservice: {
          createRoleAssignment: (_input: unknown, leased: Sails.Connection) => {
            createConnection = leased as unknown as { lease: string };
            assert.equal(createConnection.lease, 'migration-txn-2');
            byLease.get(createConnection.lease)?.stagedAssignments.push('assignment-1');
            return Promise.resolve({ id: 'assignment-1' });
          },
        },
        authorizationauditservice: {
          createSucceededEvent: (_input: unknown, leased: unknown) => {
            auditConnection = leased as unknown as { lease: string };
            // Assignment and its success audit must share one transaction/session.
            assert.equal(auditConnection, createConnection);
            return Promise.reject(new Error('audit write failed'));
          },
        },
      };

      let rejected = false;
      try {
        await new Services.AuthorizationMigrationService().migrateUserAssignments(10);
      } catch (error) {
        rejected = true;
        assert.match(String((error as Error).message), /audit write failed/);
      }

      assert.equal(rejected, true);
      assert.equal(transactions.length, 2);
      assert.deepEqual(committedAssignmentIds, []);
      assert.deepEqual(committedAuditTargetIds, []);
    } finally {
      for (const name of names) {
        const descriptor = localSaved.get(name);
        if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
        else Object.defineProperty(globalThis, name, descriptor);
      }
      sails.services = localSavedServices;
    }
  });
});

describe('AuthorizationMigrationService drift continuation', () => {
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
      then: (
        onfulfilled?: ((result: T) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null
      ): Promise<unknown> => Promise.resolve(value).then(onfulfilled as never, onrejected as never),
    };
    return query;
  }

  function decodeContinuation(token: string): { cursors: Record<string, string>; completed: string[] } {
    const parsed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as {
      v: number;
      cursors: Record<string, string>;
      completed: string[];
    };
    assert.equal(parsed.v, 1);
    return { cursors: parsed.cursors, completed: parsed.completed };
  }

  function installContinuationMocks(brandFindCalls: unknown[]) {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedModels = sails.models;
    sails.models = { record: { find: () => chainResult([]) } } as unknown as typeof sails.models;
    const brands = [{ id: 'brand-1' }, { id: 'brand-2' }, { id: 'brand-3' }];
    Reflect.set(globalThis, 'BrandingConfig', {
      find: (criteria: unknown) => {
        brandFindCalls.push(criteria);
        // Cursor-aware and limit-aware double: the scan must prove progress.
        // A predicate-ignoring double would stall fail-closed under the
        // keyset-page helper, so pagination tests honor the range predicate.
        let visible = [...brands];
        const idCrit = (criteria as { id?: { '>': string } }).id;
        if (idCrit !== undefined && typeof idCrit === 'object' && '>' in idCrit) {
          visible = visible.filter(brand => brand.id > (idCrit as { '>': string })['>']);
        }
        const chain: Record<string, unknown> = {};
        chain.sort = () => chain;
        chain.populate = () => chain;
        chain.limit = (size: number) => Promise.resolve(visible.slice(0, size));
        return chain;
      },
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
      find: (criteria: Record<string, unknown>) =>
        chainResult([
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
        ]),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      count: () => Promise.resolve(2),
      find: () => chainResult([]),
    });
    Reflect.set(globalThis, 'User', { find: () => chainResult([]) });
    Reflect.set(globalThis, 'PathRule', { find: () => chainResult([]) });
    Reflect.set(globalThis, 'RoleScopeOverride', {
      findOne: async () => undefined,
      find: () => chainResult([]),
    });
    installHealthyTemplateGlobals();
  }

  afterEach(() => {
    for (const name of names) {
      const descriptor = saved?.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    if (savedModels !== undefined) sails.models = savedModels;
  });

  it('resumes the brand scan from a validated opaque cursor without duplicates', async () => {
    const brandFindCalls: unknown[] = [];
    installContinuationMocks(brandFindCalls);
    const service = new Services.AuthorizationMigrationService();
    const page1 = await service.reportDrift(1);
    assert.equal(page1.truncated, true);
    assert.ok(typeof page1.continuation === 'string');
    const cursor1 = decodeContinuation(page1.continuation as string);
    assert.equal(cursor1.cursors.brands, 'brand-1');

    const page2 = await service.reportDrift(1, page1.continuation);
    assert.equal(page2.truncated, true);
    const cursor2 = decodeContinuation(page2.continuation as string);
    assert.equal(cursor2.cursors.brands, 'brand-2');
    assert.deepEqual(page1.issues, []);
    assert.deepEqual(page2.issues, []);
    // The second page resumed from the cursor instead of restarting the query.
    assert.deepEqual(brandFindCalls[1], { id: { '>': 'brand-1' } });

    // Drain the remaining pages (the healthy template definitions paginate
    // through the same bounded budget): no page may duplicate findings and
    // the scan terminates with no continuation.
    let continuation = page2.continuation;
    let pages = 2;
    for (;;) {
      pages += 1;
      assert.ok(pages < 12, 'must progress, not loop forever');
      const page = await service.reportDrift(1, continuation);
      assert.deepEqual(page.issues, []);
      if (!page.truncated) {
        assert.equal(page.continuation, undefined);
        break;
      }
      assert.ok(typeof page.continuation === 'string');
      continuation = page.continuation;
    }
  });

  it('fails closed on a tampered continuation cursor', async () => {
    const brandFindCalls: unknown[] = [];
    installContinuationMocks(brandFindCalls);
    const service = new Services.AuthorizationMigrationService();
    await assert.rejects(service.reportDrift(1, 'not-a-valid-cursor!!!'), /continuation cursor is invalid/);
    await assert.rejects(
      service.reportDrift(1, Buffer.from(JSON.stringify({ unknown: 'x' }), 'utf8').toString('base64url')),
      /continuation cursor is invalid/
    );
  });
});

describe('AuthorizationMigrationService effective assignments', () => {
  const names = ['BrandingConfig', 'Role', 'RoleAssignment', 'User', 'PathRule'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedModels: typeof sails.models;

  function chainResult<T>(value: T) {
    const query: Record<string, unknown> = {
      limit: () => query,
      populate: () => query,
      sort: () => query,
      then: (
        onfulfilled?: ((result: T) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null
      ): Promise<unknown> => Promise.resolve(value).then(onfulfilled as never, onrejected as never),
    };
    return query;
  }

  afterEach(() => {
    for (const name of names) {
      const descriptor = saved?.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    if (savedModels !== undefined) sails.models = savedModels;
  });

  function installEffectiveMocks(options: {
    readonly countCalls: unknown[];
    readonly findOneCalls: unknown[];
    readonly findOneResult: unknown;
  }) {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedModels = sails.models;
    sails.models = {} as typeof sails.models;
    Reflect.set(globalThis, 'BrandingConfig', { find: () => chainResult([{ id: 'brand-1' }]) });
    Reflect.set(globalThis, 'Role', {
      count: () => Promise.resolve(1),
      find: (criteria: Record<string, unknown>) =>
        chainResult([
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
            : {
                id: 'brand-admin-1',
                name: 'Admin',
                key: 'Admin',
                identityKey: 'brand:brand-1:Admin',
                displayName: 'Brand administrators',
                contextType: 'brand',
                protectedKind: 'brand-admin',
                branding: 'brand-1',
                status: 'active',
                version: 2,
              },
        ]),
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
      count: (criteria: unknown) => {
        options.countCalls.push(criteria);
        return Promise.resolve(0);
      },
      find: () => chainResult([]),
      findOne: (criteria: unknown) => {
        options.findOneCalls.push(criteria);
        return Promise.resolve(options.findOneResult);
      },
    });
    Reflect.set(globalThis, 'User', { find: () => chainResult([]) });
    Reflect.set(globalThis, 'PathRule', { find: () => chainResult([]) });
  }

  it('requires sourcePresent and unexpired status for quorum counts', async () => {
    const countCalls: unknown[] = [];
    const findOneCalls: unknown[] = [];
    installEffectiveMocks({ countCalls, findOneCalls, findOneResult: undefined });
    const report = await new Services.AuthorizationMigrationService().reportDrift(10);
    assert.ok(countCalls.length >= 2);
    for (const criteria of countCalls) {
      const row = criteria as Record<string, unknown>;
      assert.equal(row.status, 'active');
      assert.equal(row.sourcePresent, true);
      assert.ok(Array.isArray(row.or));
    }
    assert.ok(report.issues.some(issue => issue.code === 'brand-admin-assignment-missing'));
    assert.ok(report.issues.some(issue => issue.code === 'system-admin-assignment-missing'));
  });

  it('treats an expired or withdrawn legacy projection as missing', async () => {
    const countCalls: unknown[] = [];
    const findOneCalls: unknown[] = [];
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedModels = sails.models;
    sails.models = {} as typeof sails.models;
    try {
      const roleValue = {
        id: 'role-9',
        name: 'Researcher',
        contextType: 'brand',
        branding: 'brand-1',
        protectedKind: 'none',
      };
      Reflect.set(globalThis, 'BrandingConfig', { find: () => chainResult([]) });
      Reflect.set(globalThis, 'Role', {
        count: () => Promise.resolve(1),
        find: () =>
          chainResult([
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
          ]),
        findOne: () => Promise.resolve(undefined),
      });
      Reflect.set(globalThis, 'RoleAssignment', {
        count: () => Promise.resolve(2),
        find: () => chainResult([]),
        findOne: (criteria: unknown) => {
          findOneCalls.push(criteria);
          // Simulate the datastore filtering out expired/withdrawn rows: the
          // effective predicate matches nothing, so the projection is missing.
          return Promise.resolve(undefined);
        },
      });
      Reflect.set(globalThis, 'User', {
        find: () => chainResult([{ id: 'user-1', roles: [roleValue] }]),
      });
      Reflect.set(globalThis, 'PathRule', { find: () => chainResult([]) });

      const report = await new Services.AuthorizationMigrationService().reportDrift(10);
      assert.ok(findOneCalls.length >= 1);
      const projection = findOneCalls[0] as Record<string, unknown>;
      assert.equal(projection.status, 'active');
      assert.equal(projection.sourcePresent, true);
      assert.ok(Array.isArray(projection.or));
      assert.ok(
        report.issues.some(issue => issue.code === 'legacy-assignment-projection-missing'),
        'expired/withdrawn projection must report missing'
      );
    } finally {
      for (const name of names) {
        const descriptor = saved?.get(name);
        if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
        else Object.defineProperty(globalThis, name, descriptor);
      }
      sails.models = savedModels;
    }
    void countCalls;
  });
});

describe('AuthorizationMigrationService junction orphans', () => {
  const names = ['BrandingConfig', 'Role', 'RoleAssignment', 'User', 'PathRule'] as const;
  let saved: Map<string, PropertyDescriptor | undefined>;
  let savedModels: typeof sails.models;

  function chainResult<T>(value: T) {
    const query: Record<string, unknown> = {
      limit: () => query,
      populate: () => query,
      sort: () => query,
      then: (
        onfulfilled?: ((result: T) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null
      ): Promise<unknown> => Promise.resolve(value).then(onfulfilled as never, onrejected as never),
    };
    return query;
  }

  afterEach(() => {
    for (const name of names) {
      const descriptor = saved?.get(name);
      if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
      else Object.defineProperty(globalThis, name, descriptor);
    }
    if (savedModels !== undefined) sails.models = savedModels;
  });

  function installJunctionMocks(junctionRows: Array<Record<string, unknown>>) {
    saved = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedModels = sails.models;
    sails.models = {
      record: {
        find: () => chainResult([]),
      },
      user_roles__role_users: {
        find: (filter: unknown) => ({
          limit: (n: number) => {
            const text = JSON.stringify(filter);
            if (!text.includes('user-1')) return Promise.resolve([]);
            return Promise.resolve(junctionRows.slice(0, n));
          },
        }),
      },
    } as unknown as typeof sails.models;
    Reflect.set(globalThis, 'BrandingConfig', { find: () => chainResult([]) });
    Reflect.set(globalThis, 'Role', {
      count: () => Promise.resolve(1),
      find: () =>
        chainResult([
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
        ]),
      findOne: () => Promise.resolve(undefined),
    });
    Reflect.set(globalThis, 'RoleAssignment', {
      count: () => Promise.resolve(2),
      find: () => chainResult([]),
      findOne: () => Promise.resolve(undefined),
    });
    // Populate dropped the dangling junction row, so the populated array is empty.
    Reflect.set(globalThis, 'User', {
      find: () => chainResult([{ id: 'user-1', roles: [] }]),
    });
    Reflect.set(globalThis, 'PathRule', { find: () => chainResult([]) });
  }

  it('surfaces a dangling role reference stored in the junction', async () => {
    installJunctionMocks([{ user_roles: 'user-1', role_users: 'ghost-role' }]);
    const report = await new Services.AuthorizationMigrationService().reportDrift(10);
    assert.ok(
      report.issues.some(issue => issue.code === 'user-role-reference-missing'),
      'junction dangling reference must be reported'
    );
  });

  it('ignores inline roles on the native user document', async () => {
    // No junction rows: even if a native user document carried an inline `roles`
    // array (which never exists for a many-to-many), drift must not invent an orphan.
    installJunctionMocks([]);
    const report = await new Services.AuthorizationMigrationService().reportDrift(10);
    assert.ok(
      !report.issues.some(issue => issue.code === 'user-role-reference-missing'),
      'empty junction must report no orphan'
    );
  });
});
