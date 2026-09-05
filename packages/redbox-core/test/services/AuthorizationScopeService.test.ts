import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'mocha';
import {
  DEFAULT_ROLE_TEMPLATES,
  asRoleKey,
  asScopeKey,
  freezeAuthorizationContext,
  type AuthorizationContext,
} from '../../src/authorization';
import { Services } from '../../src/services/AuthorizationScopeService';

function actor(scopeKeys: readonly string[]): AuthorizationContext {
  return freezeAuthorizationContext({
    contextType: 'brand',
    principal: {
      category: 'authenticated',
      authMethod: 'session',
      active: true,
      userId: 'operator-1',
      username: 'operator',
    },
    brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1', exists: true, authorized: true },
    roles: [],
    compatibilityRoles: [],
    grantedScopeKeys: scopeKeys.map(asScopeKey),
    effectiveScopeKeys: scopeKeys.map(asScopeKey),
    scopeProvenance: [],
  });
}

function queryResult<T>(rows: T, capture?: (criteria: Record<string, unknown>) => void) {
  return (criteria: Record<string, unknown> = {}) => {
    capture?.(criteria);
    const query = {
      sort() {
        return query;
      },
      limit() {
        return Promise.resolve(rows);
      },
    };
    return query;
  };
}

afterEach(() => {
  for (const name of ['AuthorizationScope', 'RoleTemplate', 'RoleTemplateRevision']) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe('AuthorizationScopeService contract queries', () => {
  it('returns a bounded deterministic scope page and a continuation key', async () => {
    let criteria: Record<string, unknown> | undefined;
    Reflect.set(globalThis, 'AuthorizationScope', {
      find: queryResult(
        [
          {
            id: 'scope-1',
            key: 'authorization.role.read',
            namespace: 'authorization',
            label: 'Read roles',
            description: 'Read roles.',
            risk: 'read',
            sourceType: 'core',
            sourcePackage: '@researchdatabox/redbox-core',
            sourceVersion: '1',
            status: 'active',
            lastSeenGeneration: 'generation',
            metadataVersion: 1,
          },
          {
            id: 'scope-2',
            key: 'authorization.scope.read',
            namespace: 'authorization',
            label: 'Read scopes',
            description: 'Read scopes.',
            risk: 'read',
            sourceType: 'core',
            sourcePackage: '@researchdatabox/redbox-core',
            sourceVersion: '1',
            status: 'active',
            lastSeenGeneration: 'generation',
            metadataVersion: 1,
          },
        ],
        value => {
          criteria = value;
        }
      ),
    });
    const service = new Services.AuthorizationScopeService();
    const page = await service.listCatalog({
      actor: actor(['authorization.scope.read']),
      cursor: 'authorization.audit.read',
      limit: 1,
      namespace: 'authorization',
      risk: 'read',
      search: 'read',
      sourceType: 'core',
      status: 'active',
    });

    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].key, asScopeKey('authorization.role.read'));
    assert.equal(page.nextCursor, 'authorization.role.read');
    assert.deepEqual(criteria, {
      key: { '>': 'authorization.audit.read' },
      namespace: 'authorization',
      risk: 'read',
      sourceType: 'core',
      status: 'active',
      or: [
        { key: { contains: 'read' } },
        { label: { contains: 'read' } },
        { description: { contains: 'read' } },
        { sourcePackage: { contains: 'read' } },
      ],
    });
    assert.equal(Object.isFrozen(page), true);
    assert.equal(Object.isFrozen(page.items), true);
  });

  it('lists templates and reads one immutable revision without leaking an absent template', async () => {
    const template = {
      id: 'template-1',
      key: 'researcher',
      displayName: 'Researcher',
      description: 'Research role',
      currentRevision: 2,
      protectedKind: 'none',
      status: 'active',
      version: 2,
    };
    const revision = {
      id: 'revision-2',
      template: 'template-1',
      revision: 2,
      scopeKeys: [asScopeKey('record.read')],
      publishedBy: 'operator-1',
      publishedAt: '2026-08-29T00:00:00.000Z',
    };
    Reflect.set(globalThis, 'RoleTemplate', {
      find: queryResult([template]),
      findOne: ({ key }: { key: string }) => Promise.resolve(key === 'researcher' ? template : undefined),
    });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      find: () => ({ sort: () => Promise.resolve([revision]) }),
      findOne: ({ revision: requestedRevision }: { revision: number }) =>
        Promise.resolve(requestedRevision === 2 ? revision : undefined),
    });
    const service = new Services.AuthorizationScopeService();
    const authorizedActor = actor(['authorization.role.read']);

    const page = await service.listTemplates({ actor: authorizedActor, limit: 10 });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].key, asRoleKey('researcher'));
    assert.equal('scopeKeys' in page.items[0].revisions[0], false);
    assert.equal(page.items[0].revisionsTruncated, false);
    assert.equal(page.items[0].revisions[0].publishedAt, '2026-08-29T00:00:00.000Z');

    const found = await service.getTemplateRevision(authorizedActor, 'researcher', 2);
    assert.equal(found.templateKey, 'researcher');
    assert.equal(found.revision, 2);
    assert.deepEqual(found.scopeKeys, [asScopeKey('record.read')]);

    await assert.rejects(
      service.getTemplateRevision(authorizedActor, 'missing', 2),
      (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'authorization.not-found'
    );
  });

  it('bounds nested template revision summaries to the latest numeric window', async () => {
    const template = {
      id: 'template-1',
      key: 'researcher',
      displayName: 'Researcher',
      description: 'Research role',
      currentRevision: 25,
      protectedKind: 'none',
      status: 'active',
      version: 25,
    };
    let revisionCriteria: Record<string, unknown> | undefined;
    Reflect.set(globalThis, 'RoleTemplate', { find: queryResult([template]) });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      find: (criteria: Record<string, unknown>) => {
        revisionCriteria = criteria;
        return {
          sort: () =>
            Promise.resolve(
              Array.from({ length: 20 }, (_value, index) => ({
                id: `revision-${25 - index}`,
                template: template.id,
                revision: 25 - index,
                scopeKeys: [asScopeKey('record.read')],
                publishedBy: 'operator-1',
                publishedAt: '2026-08-29T00:00:00.000Z',
              }))
            ),
        };
      },
    });

    const page = await new Services.AuthorizationScopeService().listTemplates({
      actor: actor(['authorization.role.read']),
      limit: 1,
    });

    assert.equal(page.items[0].revisions.length, 20);
    assert.equal(page.items[0].revisionsTruncated, true);
    assert.equal('scopeKeys' in page.items[0].revisions[0], false);
    assert.deepEqual(revisionCriteria, {
      or: [{ template: 'template-1', revision: { '>=': 6 } }],
    });
  });

  it('rejects catalog reads without the matching effective scope before querying storage', async () => {
    let queried = false;
    Reflect.set(globalThis, 'AuthorizationScope', {
      find: () => {
        queried = true;
        throw new Error('must not query');
      },
    });
    const service = new Services.AuthorizationScopeService();

    await assert.rejects(
      service.listCatalog({ actor: actor([]) }),
      (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'authorization.scope-denied'
    );
    assert.equal(queried, false);
  });
});

describe('AuthorizationScopeService reconciliation CAS', () => {
  const connection = Object.freeze({ lease: 'scope-reconciliation' });

  function installScopeReconciliationMocks(options: {
    readonly staleScopeKey?: string;
    readonly scopeUpdateResult?: 'updated' | 'stale';
    readonly templateUpdateResult?: 'advanced' | 'stale';
    readonly scopeUpdateCriteria?: unknown[];
    readonly templateUpdateCriteria?: unknown[];
    readonly templateUpdateValues?: unknown[];
  }) {
    const service = new Services.AuthorizationScopeService();
    const registry = service.buildRegistry([]);
    const firstDefinition = registry.all[0];
    assert.ok(firstDefinition !== undefined, 'expected at least one core scope definition');
    const staleScopeKey = options.staleScopeKey ?? String(firstDefinition.key);
    const staleRow = {
      id: 'scope-row-1',
      key: staleScopeKey,
      namespace: firstDefinition.namespace,
      label: 'STALE LABEL',
      description: firstDefinition.description,
      risk: firstDefinition.risk,
      sourceType: firstDefinition.sourceType,
      sourcePackage: firstDefinition.sourcePackage,
      sourceVersion: firstDefinition.sourceVersion,
      status: firstDefinition.status,
      replacementKey: firstDefinition.replacementKey,
      lastSeenGeneration: 'old-generation',
      metadataVersion: 5,
    };
    const findScopeRow = (criteria: Record<string, unknown>) =>
      criteria.key === staleScopeKey || (criteria as { id?: unknown }).id === staleRow.id ? staleRow : undefined;
    Reflect.set(globalThis, 'AuthorizationScope', {
      findOne: (criteria: Record<string, unknown>) => {
        const row = findScopeRow(criteria);
        const query = Promise.resolve(row) as Promise<unknown> & {
          usingConnection?: (leased: Sails.Connection) => Promise<unknown>;
        };
        query.usingConnection = (leased: Sails.Connection) => {
          assert.equal(leased, connection);
          return Promise.resolve(findScopeRow(criteria));
        };
        return query;
      },
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({
          usingConnection: (leased: Sails.Connection) => {
            assert.equal(leased, connection);
            return Promise.resolve({ id: `scope-new-${String(values.key)}`, ...values });
          },
        }),
      }),
      updateOne: (criteria: Record<string, unknown>) => {
        options.scopeUpdateCriteria?.push(criteria);
        return {
          set: (values: Record<string, unknown>) => ({
            usingConnection: (leased: Sails.Connection) => {
              assert.equal(leased, connection);
              if (options.scopeUpdateResult === 'stale') return Promise.resolve(undefined);
              return Promise.resolve({ ...(findScopeRow(criteria) ?? {}), ...values });
            },
          }),
        };
      },
      getDatastore: () => ({
        transaction: (work: (leased: Sails.Connection) => Promise<unknown>) => work(connection),
      }),
    });
    const templateDefinition = DEFAULT_ROLE_TEMPLATES[0];
    Reflect.set(globalThis, 'RoleTemplate', {
      findOne: (criteria: Record<string, unknown>) => {
        const query = {
          usingConnection: (leased: Sails.Connection) => {
            assert.equal(leased, connection);
            if (String((criteria as { key?: unknown }).key) !== String(templateDefinition.key)) {
              return Promise.resolve(undefined);
            }
            // Lagging revision pointer so the advance path runs its CAS update.
            return Promise.resolve({
              id: 'template-1',
              key: String(templateDefinition.key),
              displayName: 'Template',
              description: 'Template.',
              currentRevision: templateDefinition.revision - 1,
              protectedKind: templateDefinition.protectedKind,
              status: 'active',
              version: 7,
            });
          },
        };
        return query;
      },
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({
          usingConnection: (leased: Sails.Connection) => {
            assert.equal(leased, connection);
            return Promise.resolve({ id: 'template-new', ...values });
          },
        }),
      }),
      updateOne: (criteria: Record<string, unknown>) => {
        options.templateUpdateCriteria?.push(criteria);
        return {
          set: (values: Record<string, unknown>) => {
            options.templateUpdateValues?.push(values);
            return {
              usingConnection: (leased: Sails.Connection) => {
                assert.equal(leased, connection);
                if (options.templateUpdateResult === 'stale') return Promise.resolve(undefined);
                return Promise.resolve({ id: 'template-1', ...values });
              },
            };
          },
        };
      },
      getDatastore: () => ({
        transaction: (work: (leased: Sails.Connection) => Promise<unknown>) => work(connection),
      }),
    });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      findOne: (criteria: Record<string, unknown>) => ({
        usingConnection: (leased: Sails.Connection) => {
          assert.equal(leased, connection);
          if (String((criteria as { template?: unknown }).template) !== 'template-1') {
            return Promise.resolve(undefined);
          }
          return Promise.resolve({ id: 'revision-1', scopeKeys: [...templateDefinition.scopeKeys] });
        },
      }),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({
          usingConnection: (leased: Sails.Connection) => {
            assert.equal(leased, connection);
            return Promise.resolve({ id: 'revision-new', ...values });
          },
        }),
      }),
    });
    const originalServices = sails.services;
    sails.services = {
      ...originalServices,
      authorizationauditservice: { createSucceededEvent: () => Promise.resolve({ id: 'audit-1' }) },
    };
    return {
      service,
      restore: () => {
        sails.services = originalServices;
      },
    };
  }

  it('predicates scope metadata writes on the expected version and surfaces stale races', async () => {
    const scopeUpdateCriteria: unknown[] = [];
    const { service, restore } = installScopeReconciliationMocks({ scopeUpdateCriteria });
    try {
      const result = await service.reconcileDeclaredCatalog([]);
      assert.ok(result.scopesUpdated >= 1);
      assert.ok(
        scopeUpdateCriteria.some(
          criteria =>
            typeof criteria === 'object' &&
            criteria !== null &&
            (criteria as Record<string, unknown>).id === 'scope-row-1' &&
            (criteria as Record<string, unknown>).metadataVersion === 5
        ),
        `expected a metadataVersion CAS predicate, saw ${JSON.stringify(scopeUpdateCriteria)}`
      );
    } finally {
      restore();
    }

    const staleCriteria: unknown[] = [];
    const racing = installScopeReconciliationMocks({ scopeUpdateCriteria: staleCriteria, scopeUpdateResult: 'stale' });
    try {
      await assert.rejects(racing.service.reconcileDeclaredCatalog([]), /changed concurrently/);
    } finally {
      racing.restore();
    }
  });

  it('predicates template revision advances on revision and version and surfaces stale races', async () => {
    const templateDefinition = DEFAULT_ROLE_TEMPLATES[0];
    const templateUpdateCriteria: unknown[] = [];
    const templateUpdateValues: unknown[] = [];
    const { service, restore } = installScopeReconciliationMocks({ templateUpdateCriteria, templateUpdateValues });
    try {
      await service.reconcileDeclaredCatalog([]);
      assert.deepEqual(templateUpdateCriteria, [
        {
          id: 'template-1',
          currentRevision: templateDefinition.revision - 1,
          version: 7,
        },
      ]);
      assert.deepEqual(templateUpdateValues, [{ currentRevision: templateDefinition.revision, version: 8 }]);
    } finally {
      restore();
    }

    const racing = installScopeReconciliationMocks({ templateUpdateResult: 'stale' });
    try {
      await assert.rejects(racing.service.reconcileDeclaredCatalog([]), /changed concurrently/);
    } finally {
      racing.restore();
    }
  });
});

describe('AuthorizationScopeService startup create races', () => {
  const connection = Object.freeze({ lease: 'scope-create-race' });

  function datastore() {
    return {
      transaction: (work: (leased: Sails.Connection) => Promise<unknown>) => work(connection),
    };
  }

  function auditStub(): () => void {
    const originalServices = sails.services;
    sails.services = {
      ...originalServices,
      authorizationauditservice: { createSucceededEvent: async () => ({ id: 'audit-1' }) },
    };
    return () => {
      sails.services = originalServices;
    };
  }

  function deferredQuery(next: () => unknown) {
    return {
      usingConnection: async () => next(),
      then: (
        onfulfilled?: ((value: unknown) => unknown) | null,
        onrejected?: ((reason: unknown) => unknown) | null
      ): Promise<unknown> => Promise.resolve(next()).then(onfulfilled as never, onrejected as never),
    };
  }

  it('adopts a concurrent identical scope winner and rejects identity drift', async () => {
    const service = new Services.AuthorizationScopeService();
    const target = service.buildRegistry([]).all[0];
    assert.ok(target !== undefined, 'expected at least one core scope definition');
    const targetKey = String(target.key);
    let scopeFindCalls = 0;
    let scopeCreateCalls = 0;
    const scopeUpdateCriteria: unknown[] = [];
    const winner = {
      id: 'scope-winner',
      key: targetKey,
      namespace: target.namespace,
      label: 'STALE LABEL',
      description: target.description,
      risk: target.risk,
      sourceType: target.sourceType,
      sourcePackage: target.sourcePackage,
      sourceVersion: target.sourceVersion,
      status: target.status,
      replacementKey: target.replacementKey,
      lastSeenGeneration: 'old-generation',
      metadataVersion: 3,
    };
    Reflect.set(globalThis, 'AuthorizationScope', {
      findOne: (criteria: Record<string, unknown>) =>
        deferredQuery(() => {
          if (criteria.key !== targetKey) return undefined;
          scopeFindCalls += 1;
          return scopeFindCalls <= 2 ? undefined : { ...winner };
        }),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({
          usingConnection: async () => {
            if (String(values.key) === targetKey) {
              scopeCreateCalls += 1;
              if (scopeCreateCalls === 1) throw Object.assign(new Error('duplicate key'), { code: 'E_UNIQUE' });
            }
            return { id: `scope-new-${String(values.key)}`, ...values };
          },
        }),
      }),
      updateOne: (criteria: Record<string, unknown>) => {
        scopeUpdateCriteria.push(criteria);
        return {
          set: (values: Record<string, unknown>) => ({
            usingConnection: async () => ({ ...winner, ...values }),
          }),
        };
      },
      getDatastore: () => datastore(),
    });
    Reflect.set(globalThis, 'RoleTemplate', {
      findOne: () => deferredQuery(() => undefined),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({ usingConnection: async () => ({ id: `template-new-${String(values.key)}`, ...values }) }),
      }),
      updateOne: () => ({
        set: () => ({ usingConnection: async () => ({ id: 'template-1' }) }),
      }),
      getDatastore: () => datastore(),
    });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      findOne: () => deferredQuery(() => undefined),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({ usingConnection: async () => ({ id: 'revision-new', ...values }) }),
      }),
    });
    const restoreAudit = auditStub();
    try {
      const result = await service.reconcileDeclaredCatalog([]);
      assert.equal(scopeCreateCalls, 1);
      assert.ok(
        scopeUpdateCriteria.some(
          criteria =>
            typeof criteria === 'object' &&
            criteria !== null &&
            (criteria as Record<string, unknown>).id === 'scope-winner' &&
            (criteria as Record<string, unknown>).metadataVersion === 3
        ),
        `winner must be reconciled through CAS, saw ${JSON.stringify(scopeUpdateCriteria)}`
      );
      assert.ok(result.scopesUpdated >= 1);
    } finally {
      restoreAudit();
    }
  });

  it('rejects a concurrent scope winner with drifted identity ownership', async () => {
    const service = new Services.AuthorizationScopeService();
    const target = service.buildRegistry([]).all[0];
    assert.ok(target !== undefined, 'expected at least one core scope definition');
    const targetKey = String(target.key);
    let scopeFindCalls = 0;
    Reflect.set(globalThis, 'AuthorizationScope', {
      findOne: (criteria: Record<string, unknown>) =>
        deferredQuery(() => {
          if (criteria.key !== targetKey) return undefined;
          scopeFindCalls += 1;
          if (scopeFindCalls <= 2) return undefined;
          return {
            id: 'scope-impostor',
            key: targetKey,
            namespace: target.namespace,
            sourceType: 'hook',
            sourcePackage: 'rival-package',
          };
        }),
      create: () => ({
        fetch: () => ({
          usingConnection: async () => {
            throw Object.assign(new Error('duplicate key'), { code: 'E_UNIQUE' });
          },
        }),
      }),
      updateOne: () => ({
        set: () => ({ usingConnection: async () => ({ id: 'scope-impostor' }) }),
      }),
      getDatastore: () => datastore(),
    });
    Reflect.set(globalThis, 'RoleTemplate', {
      findOne: () => deferredQuery(() => undefined),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({ usingConnection: async () => ({ id: `template-new-${String(values.key)}`, ...values }) }),
      }),
      updateOne: () => ({
        set: () => ({ usingConnection: async () => ({ id: 'template-1' }) }),
      }),
      getDatastore: () => datastore(),
    });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      findOne: () => deferredQuery(() => undefined),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({ usingConnection: async () => ({ id: 'revision-new', ...values }) }),
      }),
    });
    const restoreAudit = auditStub();
    try {
      await assert.rejects(service.reconcileDeclaredCatalog([]), /persisted identity owner/);
    } finally {
      restoreAudit();
    }
  });

  it('adopts concurrent identical template and revision winners', async () => {
    const service = new Services.AuthorizationScopeService();
    const templateDefinition = DEFAULT_ROLE_TEMPLATES[0];
    const targetKey = String(templateDefinition.key);
    let templateFindCalls = 0;
    let templateCreateCalls = 0;
    const templateUpdateCriteria: unknown[] = [];
    const winner = {
      id: 'template-1',
      key: targetKey,
      displayName: 'Template',
      description: 'Template.',
      currentRevision: templateDefinition.revision,
      protectedKind: templateDefinition.protectedKind,
      status: 'active',
      version: 7,
    };
    Reflect.set(globalThis, 'AuthorizationScope', {
      findOne: () => deferredQuery(() => undefined),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({ usingConnection: async () => ({ id: `scope-new-${String(values.key)}`, ...values }) }),
      }),
      updateOne: () => ({
        set: (values: Record<string, unknown>) => ({ usingConnection: async () => ({ id: 'scope-1', ...values }) }),
      }),
      getDatastore: () => datastore(),
    });
    Reflect.set(globalThis, 'RoleTemplate', {
      findOne: (criteria: Record<string, unknown>) =>
        deferredQuery(() => {
          if (String(criteria.key) !== targetKey) return undefined;
          templateFindCalls += 1;
          return templateFindCalls <= 1 ? undefined : { ...winner };
        }),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({
          usingConnection: async () => {
            if (String(values.key) === targetKey) {
              templateCreateCalls += 1;
              if (templateCreateCalls === 1) throw Object.assign(new Error('duplicate key'), { code: 'E_UNIQUE' });
            }
            return { id: `template-new-${String(values.key)}`, ...values };
          },
        }),
      }),
      updateOne: (criteria: Record<string, unknown>) => {
        templateUpdateCriteria.push(criteria);
        return {
          set: (values: Record<string, unknown>) => ({
            usingConnection: async () => ({ id: 'template-1', ...values }),
          }),
        };
      },
      getDatastore: () => datastore(),
    });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      findOne: (criteria: Record<string, unknown>) =>
        deferredQuery(() =>
          String((criteria as { template?: unknown }).template) === 'template-1'
            ? { id: 'revision-1', scopeKeys: [...templateDefinition.scopeKeys] }
            : undefined
        ),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({ usingConnection: async () => ({ id: 'revision-new', ...values }) }),
      }),
    });
    const restoreAudit = auditStub();
    try {
      await service.reconcileDeclaredCatalog([]);
      assert.equal(templateCreateCalls, 1);
      assert.deepEqual(templateUpdateCriteria, [], 'identical winner needs no advance write');
    } finally {
      restoreAudit();
    }
  });

  it('rejects repurposed template and drifted revision winners', async () => {
    const service = new Services.AuthorizationScopeService();
    const templateDefinition = DEFAULT_ROLE_TEMPLATES[0];
    const targetKey = String(templateDefinition.key);
    let templateFindCalls = 0;
    Reflect.set(globalThis, 'AuthorizationScope', {
      findOne: () => deferredQuery(() => undefined),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({ usingConnection: async () => ({ id: `scope-new-${String(values.key)}`, ...values }) }),
      }),
      updateOne: () => ({
        set: (values: Record<string, unknown>) => ({ usingConnection: async () => ({ id: 'scope-1', ...values }) }),
      }),
      getDatastore: () => datastore(),
    });
    Reflect.set(globalThis, 'RoleTemplate', {
      findOne: (criteria: Record<string, unknown>) =>
        deferredQuery(() => {
          if (String(criteria.key) !== targetKey) return undefined;
          templateFindCalls += 1;
          if (templateFindCalls <= 1) return undefined;
          return { id: 'template-1', key: targetKey, protectedKind: 'guest', status: 'active', version: 7 };
        }),
      create: () => ({
        fetch: () => ({
          usingConnection: async () => {
            throw Object.assign(new Error('duplicate key'), { code: 'E_UNIQUE' });
          },
        }),
      }),
      updateOne: () => ({
        set: (values: Record<string, unknown>) => ({ usingConnection: async () => ({ id: 'template-1', ...values }) }),
      }),
      getDatastore: () => datastore(),
    });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      findOne: () => deferredQuery(() => undefined),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({ usingConnection: async () => ({ id: 'revision-new', ...values }) }),
      }),
    });
    const restoreAudit = auditStub();
    try {
      await assert.rejects(service.reconcileDeclaredCatalog([]), /cannot be repurposed/);
    } finally {
      restoreAudit();
    }
  });

  it('rejects a concurrent revision winner with drifted immutable content', async () => {
    const service = new Services.AuthorizationScopeService();
    const templateDefinition = DEFAULT_ROLE_TEMPLATES[0];
    const targetKey = String(templateDefinition.key);
    let templateFindCalls = 0;
    Reflect.set(globalThis, 'AuthorizationScope', {
      findOne: () => deferredQuery(() => undefined),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({ usingConnection: async () => ({ id: `scope-new-${String(values.key)}`, ...values }) }),
      }),
      updateOne: () => ({
        set: (values: Record<string, unknown>) => ({ usingConnection: async () => ({ id: 'scope-1', ...values }) }),
      }),
      getDatastore: () => datastore(),
    });
    Reflect.set(globalThis, 'RoleTemplate', {
      findOne: (criteria: Record<string, unknown>) =>
        deferredQuery(() => {
          if (String(criteria.key) !== targetKey) return undefined;
          templateFindCalls += 1;
          if (templateFindCalls <= 1) return undefined;
          return {
            id: 'template-1',
            key: targetKey,
            protectedKind: templateDefinition.protectedKind,
            status: 'active',
            version: 7,
          };
        }),
      create: () => ({
        fetch: () => ({
          usingConnection: async () => {
            throw Object.assign(new Error('duplicate key'), { code: 'E_UNIQUE' });
          },
        }),
      }),
      updateOne: () => ({
        set: (values: Record<string, unknown>) => ({ usingConnection: async () => ({ id: 'template-1', ...values }) }),
      }),
      getDatastore: () => datastore(),
    });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      findOne: () => deferredQuery(() => ({ id: 'revision-1', scopeKeys: ['tampered.scope'] })),
      create: (values: Record<string, unknown>) => ({
        fetch: () => ({ usingConnection: async () => ({ id: 'revision-new', ...values }) }),
      }),
    });
    const restoreAudit = auditStub();
    try {
      await assert.rejects(service.reconcileDeclaredCatalog([]), /has drifted/);
    } finally {
      restoreAudit();
    }
  });
});
