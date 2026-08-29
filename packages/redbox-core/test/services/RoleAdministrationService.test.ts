import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'mocha';
import { asRoleKey, asScopeKey, createScopeRegistry, freezeAuthorizationContext } from '../../src/authorization';
import { Services, type RoleAdministrationServiceDependencies } from '../../src/services/RoleAdministrationService';

const actor = freezeAuthorizationContext({
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
  grantedScopeKeys: [asScopeKey('authorization.role.manage')],
  effectiveScopeKeys: [asScopeKey('authorization.role.manage')],
  scopeProvenance: [],
});

const reader = freezeAuthorizationContext({
  ...actor,
  grantedScopeKeys: [asScopeKey('authorization.role.read')],
  effectiveScopeKeys: [asScopeKey('authorization.role.read')],
});

function connectedResult<T>(value: T): Promise<T> & { usingConnection: () => Promise<T> } {
  return Object.assign(Promise.resolve(value), { usingConnection: () => Promise.resolve(value) });
}

const testConnection = Object.freeze({ lease: 'role-administration-test' }) as Sails.Connection;

function auditedTransactionDependencies(
  onAttempt?: (input: { readonly reasonCode?: string }, outcome: 'denied' | 'failed') => void
): Pick<RoleAdministrationServiceDependencies, 'audit' | 'runTransaction'> {
  return {
    runTransaction: work => work(testConnection),
    audit: () => ({
      createSucceededEvent: async () => assert.fail('A denied mutation cannot write a success audit.'),
      recordAttempt: async (input, outcome) => {
        onAttempt?.(input, outcome);
        return { persisted: true };
      },
    }),
  };
}

afterEach(() => {
  for (const name of [
    'Role',
    'RoleAssignment',
    'RoleTemplate',
    'RoleTemplateRevision',
    'RoleScopeOverride',
    'Record',
    'DeletedRecord',
    'AppConfig',
    'Form',
    'RecordType',
    'WorkflowStep',
  ]) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe('RoleAdministrationService', () => {
  it('exports only the supported Phase 5 writer operations', () => {
    const exported = new Services.RoleAdministrationService().exports() as Record<string, unknown>;
    const supported = [
      'applyBulkAssignments',
      'applyBulkTemplateUpgrade',
      'applyRoleScopes',
      'applyRoleTemplateUpgrade',
      'applyScopeAdoption',
      'createRole',
      'deleteRole',
      'expireAssignment',
      'grantAssignment',
      'inactivateRole',
      'getRole',
      'listAssignments',
      'listRoles',
      'previewBulkAssignments',
      'previewBulkTemplateUpgrade',
      'previewRoleDeletion',
      'previewRoleInactivation',
      'previewRoleScopes',
      'previewRoleTemplateUpgrade',
      'previewScopeAdoption',
      'previewTemplateRevision',
      'publishTemplateRevision',
      'replaceExternalAssignments',
      'revokeAssignment',
      'suppressAssignment',
      'unsuppressAssignment',
      'updateRole',
    ];
    assert.ok(supported.every(method => typeof exported[method] === 'function'));
    assert.equal(exported.update, undefined);
    assert.equal(exported.destroy, undefined);
  });

  it('lists only bounded current-brand role metadata and resolves template keys in one batch', async () => {
    const roleCriteria: Record<string, unknown>[] = [];
    Reflect.set(globalThis, 'Role', {
      find(criteria: Record<string, unknown>) {
        roleCriteria.push(criteria);
        return {
          sort: () => ({
            limit: () =>
              Promise.resolve([
                {
                  id: 'role-1',
                  name: 'Researcher',
                  key: 'Researcher',
                  displayName: 'Researchers',
                  description: 'Research role',
                  contextType: 'brand',
                  branding: 'brand-1',
                  template: 'template-1',
                  templateRevision: 2,
                  protectedKind: 'none',
                  status: 'active',
                  version: 4,
                },
              ]),
          }),
        };
      },
    });
    Reflect.set(globalThis, 'RoleTemplate', {
      find: () => Promise.resolve([{ id: 'template-1', key: 'researcher' }]),
    });
    const page = await new Services.RoleAdministrationService().listRoles({
      actor: reader,
      brandId: 'brand-1',
      limit: 25,
      search: 'Research',
    });

    assert.deepEqual(roleCriteria, [
      {
        branding: 'brand-1',
        contextType: 'brand',
        or: [
          { key: { contains: 'Research' } },
          { name: { contains: 'Research' } },
          { displayName: { contains: 'Research' } },
          { description: { contains: 'Research' } },
        ],
      },
    ]);
    assert.deepEqual(page, {
      items: [
        {
          id: 'role-1',
          key: 'Researcher',
          displayName: 'Researchers',
          description: 'Research role',
          contextType: 'brand',
          brandId: 'brand-1',
          protectedKind: 'none',
          status: 'active',
          templateKey: 'researcher',
          templateRevision: 2,
          version: 4,
        },
      ],
    });
  });

  it('lists only active-brand assignments with bounded provenance and server-side filters', async () => {
    let assignmentCriteria: Record<string, unknown> | undefined;
    Reflect.set(globalThis, 'RoleAssignment', {
      find(criteria: Record<string, unknown>) {
        assignmentCriteria = criteria;
        return {
          sort: () => ({
            limit: () =>
              Promise.resolve([
                {
                  id: 'assignment-1',
                  principalId: 'user-1',
                  role: 'role-1',
                  branding: 'brand-1',
                  source: 'external',
                  sourceKey: 'oidc::researchers',
                  status: 'suppressed',
                  sourcePresent: false,
                  assignedBy: 'provider-sync',
                  assignedAt: new Date('2026-08-20T00:00:00.000Z'),
                  suppressedBy: 'operator-1',
                  suppressedAt: new Date('2026-08-21T00:00:00.000Z'),
                  reason: 'Reviewed local suppression',
                  version: 3,
                },
              ]),
          }),
        };
      },
    });
    Reflect.set(globalThis, 'Role', {
      find: () => ({
        limit: () =>
          Promise.resolve([
            {
              id: 'role-1',
              name: 'Researcher',
              key: 'Researcher',
              contextType: 'brand',
              branding: 'brand-1',
              protectedKind: 'none',
              status: 'active',
            },
          ]),
      }),
    });
    const assignmentReader = freezeAuthorizationContext({
      ...reader,
      grantedScopeKeys: [asScopeKey('authorization.assignment.read')],
      effectiveScopeKeys: [asScopeKey('authorization.assignment.read')],
    });

    const page = await new Services.RoleAdministrationService().listAssignments({
      actor: assignmentReader,
      brandId: 'brand-1',
      cursor: 'assignment-0',
      limit: 25,
      principalId: 'user-1',
      source: 'external',
      status: 'suppressed',
      sourcePresent: false,
      expiry: 'never',
    });

    assert.deepEqual(assignmentCriteria, {
      and: [
        { branding: 'brand-1' },
        { id: { '>': 'assignment-0' } },
        { principalId: 'user-1' },
        { source: 'external' },
        { status: 'suppressed' },
        { sourcePresent: false },
        { expiresAt: null },
      ],
    });
    assert.deepEqual(page, {
      items: [
        {
          id: 'assignment-1',
          principalId: 'user-1',
          roleId: 'role-1',
          roleKey: 'Researcher',
          brandId: 'brand-1',
          source: 'external',
          sourceKey: 'oidc::researchers',
          status: 'suppressed',
          sourcePresent: false,
          assignedBy: 'provider-sync',
          assignedAt: '2026-08-20T00:00:00.000Z',
          suppressedBy: 'operator-1',
          suppressedAt: '2026-08-21T00:00:00.000Z',
          reason: 'Reviewed local suppression',
          version: 3,
        },
      ],
    });
  });

  it('includes protected global assignments only for explicit system authorization managers', async () => {
    let assignmentCriteria: Record<string, unknown> | undefined;
    Reflect.set(globalThis, 'RoleAssignment', {
      find(criteria: Record<string, unknown>) {
        assignmentCriteria = criteria;
        return {
          sort: () => ({
            limit: () =>
              Promise.resolve([
                {
                  id: 'system-assignment-1',
                  principalId: 'system-user',
                  role: 'system-role',
                  source: 'manual',
                  sourceKey: 'manual',
                  status: 'active',
                  sourcePresent: true,
                  assignedBy: 'operator-1',
                  assignedAt: new Date('2026-08-20T00:00:00.000Z'),
                  version: 1,
                },
              ]),
          }),
        };
      },
    });
    Reflect.set(globalThis, 'Role', {
      find: () => ({
        limit: () =>
          Promise.resolve([
            {
              id: 'system-role',
              name: 'system-admin',
              key: 'system-admin',
              contextType: 'system',
              protectedKind: 'system-admin',
              status: 'active',
            },
          ]),
      }),
    });
    const systemReader = freezeAuthorizationContext({
      ...reader,
      grantedScopeKeys: [asScopeKey('authorization.assignment.read'), asScopeKey('system.authorization.manage')],
      effectiveScopeKeys: [asScopeKey('authorization.assignment.read'), asScopeKey('system.authorization.manage')],
    });

    const page = await new Services.RoleAdministrationService().listAssignments({
      actor: systemReader,
      brandId: 'brand-1',
      roleKey: 'system-admin',
    });

    assert.deepEqual(assignmentCriteria, {
      and: [{ or: [{ branding: 'brand-1' }, { branding: null }] }, { role: ['system-role'] }],
    });
    assert.equal(page.items[0].brandId, undefined);
    assert.equal(page.items[0].roleKey, 'system-admin');
  });

  it('fails closed when a protected system assignment or role has persisted brand ownership', async () => {
    Reflect.set(globalThis, 'RoleAssignment', {
      find: () => ({
        sort: () => ({
          limit: () =>
            Promise.resolve([
              {
                id: 'system-assignment-1',
                principalId: 'system-user',
                role: 'system-role',
                source: 'manual',
                sourceKey: 'manual',
                status: 'active',
                sourcePresent: true,
                assignedBy: 'operator-1',
                assignedAt: new Date('2026-08-20T00:00:00.000Z'),
                version: 1,
              },
            ]),
        }),
      }),
    });
    Reflect.set(globalThis, 'Role', {
      find: () => ({
        limit: () =>
          Promise.resolve([
            {
              id: 'system-role',
              name: 'system-admin',
              key: 'system-admin',
              contextType: 'system',
              branding: 'foreign-brand',
              protectedKind: 'system-admin',
              status: 'active',
            },
          ]),
      }),
    });
    const systemReader = freezeAuthorizationContext({
      ...reader,
      grantedScopeKeys: [asScopeKey('authorization.assignment.read'), asScopeKey('system.authorization.manage')],
      effectiveScopeKeys: [asScopeKey('authorization.assignment.read'), asScopeKey('system.authorization.manage')],
    });

    await assert.rejects(
      new Services.RoleAdministrationService().listAssignments({
        actor: systemReader,
        brandId: 'brand-1',
      }),
      (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'authorization.not-found'
    );
  });

  it('returns an opaque not-found result before querying another brand', async () => {
    let queried = false;
    Reflect.set(globalThis, 'Role', {
      find: () => {
        queried = true;
        return { sort: () => ({ limit: () => Promise.resolve([]) }) };
      },
    });

    await assert.rejects(
      new Services.RoleAdministrationService().listRoles({
        actor: reader,
        brandId: 'brand-2',
      }),
      (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'authorization.not-found'
    );
    assert.equal(queried, false);
  });

  it('rejects duplicate selected roles before a bulk template preview touches persistence', async () => {
    let queried = false;
    Reflect.set(globalThis, 'RoleTemplate', {
      findOne: () => {
        queried = true;
        return Promise.resolve(undefined);
      },
    });
    const systemReader = freezeAuthorizationContext({
      ...reader,
      grantedScopeKeys: [asScopeKey('system.authorization.manage')],
      effectiveScopeKeys: [asScopeKey('system.authorization.manage')],
    });

    await assert.rejects(
      new Services.RoleAdministrationService().previewBulkTemplateUpgrade({
        actor: systemReader,
        templateKey: 'researcher',
        targetRevision: 2,
        roles: [
          { roleId: 'role-1', expectedVersion: 1 },
          { roleId: 'role-1', expectedVersion: 1 },
        ],
        requestId: 'request-duplicate-selection',
      }),
      (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'authorization.bulk-invalid'
    );
    assert.equal(queried, false);
  });

  it('reports selected-role bulk template conflicts without issuing a confirmation token', async () => {
    const connection = Object.freeze({ lease: 'bulk-template-preview' }) as Sails.Connection;
    const systemReader = freezeAuthorizationContext({
      ...reader,
      grantedScopeKeys: [asScopeKey('system.authorization.manage')],
      effectiveScopeKeys: [asScopeKey('system.authorization.manage')],
    });
    Reflect.set(globalThis, 'RoleTemplate', {
      findOne: () =>
        Promise.resolve({
          id: 'template-1',
          key: 'researcher',
          currentRevision: 1,
          protectedKind: 'none',
          status: 'active',
          version: 1,
        }),
    });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      findOne: () => ({
        usingConnection: () =>
          Promise.resolve({
            id: 'revision-2',
            template: 'template-1',
            revision: 2,
            scopeKeys: [],
          }),
      }),
    });
    Reflect.set(globalThis, 'Role', {
      findOne: () => ({ usingConnection: () => Promise.resolve(undefined) }),
    });

    const preview = await new Services.RoleAdministrationService({
      runTransaction: work => work(connection),
      getRegistry: () => createScopeRegistry([]),
      getConfirmationSecret: () => 'confirmation-secret-that-is-long-enough',
    }).previewBulkTemplateUpgrade({
      actor: systemReader,
      templateKey: 'researcher',
      targetRevision: 2,
      roles: [{ roleId: 'missing-role', expectedVersion: 3 }],
      requestId: 'request-bulk-template-conflict',
    });

    assert.deepEqual(preview.roles, [
      {
        roleId: 'missing-role',
        expectedVersion: 3,
        targetRevision: 2,
        conflict: { code: 'authorization.not-found', status: 404 },
      },
    ]);
    assert.deepEqual(preview.fatalErrors, ['selected-role-conflict']);
    assert.equal(preview.confirmationToken, undefined);
  });

  it('does not delegate active-brand-only scopes into another brand during a bulk upgrade', async () => {
    const connection = Object.freeze({ lease: 'cross-brand-delegation' }) as Sails.Connection;
    const template = {
      id: 'template-1',
      key: 'researcher',
      currentRevision: 2,
      protectedKind: 'none',
      status: 'active',
      version: 2,
    };
    const role = {
      id: 'role-other-brand',
      name: 'researcher',
      key: 'researcher',
      displayName: 'Other-brand researchers',
      contextType: 'brand',
      branding: 'brand-2',
      template: template.id,
      templateRevision: 1,
      protectedKind: 'none',
      status: 'active',
      version: 1,
    };
    Reflect.set(globalThis, 'RoleTemplate', { findOne: () => connectedResult(template) });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      findOne: (criteria: { readonly revision: number }) =>
        connectedResult({
          id: `revision-${criteria.revision}`,
          template: template.id,
          revision: criteria.revision,
          scopeKeys: criteria.revision === 2 ? ['record.read'] : [],
        }),
    });
    Reflect.set(globalThis, 'Role', { findOne: () => connectedResult(role) });
    Reflect.set(globalThis, 'RoleScopeOverride', { find: () => ({ sort: () => connectedResult([]) }) });
    const crossBrandActor = freezeAuthorizationContext({
      ...actor,
      roles: [
        {
          id: 'system-role',
          key: asRoleKey('system-admin'),
          name: 'system-admin',
          displayName: 'System administrator',
          contextType: 'system',
          protectedKind: 'system-admin',
          implicit: false,
          assignmentCount: 1,
          assignmentsTruncated: false,
          assignments: [],
          effectiveScopeKeys: [asScopeKey('system.authorization.manage')],
          inactiveScopeKeys: [],
          missingScopeKeys: [],
        },
        {
          id: 'brand-1-role',
          key: asRoleKey('local-reader'),
          name: 'local-reader',
          displayName: 'Local reader',
          contextType: 'brand',
          brandId: 'brand-1',
          protectedKind: 'none',
          implicit: false,
          assignmentCount: 1,
          assignmentsTruncated: false,
          assignments: [],
          effectiveScopeKeys: [asScopeKey('record.read')],
          inactiveScopeKeys: [],
          missingScopeKeys: [],
        },
      ],
      grantedScopeKeys: [asScopeKey('record.read'), asScopeKey('system.authorization.manage')],
      effectiveScopeKeys: [asScopeKey('record.read'), asScopeKey('system.authorization.manage')],
      scopeProvenance: [
        {
          scopeKey: asScopeKey('record.read'),
          roleIds: ['brand-1-role'],
          roleKeys: [asRoleKey('local-reader')],
        },
        {
          scopeKey: asScopeKey('system.authorization.manage'),
          roleIds: ['system-role'],
          roleKeys: [asRoleKey('system-admin')],
        },
      ],
    });
    const registry = createScopeRegistry([
      {
        sourceType: 'core',
        sourcePackage: '@researchdatabox/redbox-core',
        sourceVersion: '1.0.0',
        definitions: [
          {
            key: asScopeKey('record.read'),
            label: 'Read records',
            description: 'Read records.',
            risk: 'read',
          },
        ],
      },
    ]);

    const preview = await new Services.RoleAdministrationService({
      runTransaction: work => work(connection),
      getRegistry: () => registry,
    }).previewBulkTemplateUpgrade({
      actor: crossBrandActor,
      templateKey: template.key,
      targetRevision: 2,
      roles: [{ roleId: role.id, expectedVersion: role.version }],
      requestId: 'request-cross-brand-delegation',
    });

    assert.deepEqual(preview.fatalErrors, ['selected-role-conflict']);
    assert.deepEqual(preview.roles, [
      {
        roleId: role.id,
        expectedVersion: role.version,
        targetRevision: 2,
        conflict: { code: 'authorization.delegation-ceiling', status: 403 },
      },
    ]);
    assert.equal(preview.confirmationToken, undefined);
  });

  it('uses the leased transaction connection for role CAS, overrides, and success audit', async () => {
    const connection = Object.freeze({ lease: 'phase-five' }) as unknown as Sails.Connection;
    const connections: Sails.Connection[] = [];
    let updateCriteria: Record<string, unknown> | undefined;
    const chain = <T>(value: T) => ({
      usingConnection(leased: Sails.Connection) {
        connections.push(leased);
        return Promise.resolve(value);
      },
    });
    Reflect.set(globalThis, 'Role', {
      find() {
        return {
          limit: () =>
            chain([
              {
                id: 'role-1',
                name: 'researcher',
                key: 'researcher',
                displayName: 'Before',
                contextType: 'brand',
                branding: 'brand-1',
                protectedKind: 'none',
                status: 'active',
                version: 2,
              },
            ]),
        };
      },
      updateOne(criteria: Record<string, unknown>) {
        updateCriteria = criteria;
        return {
          set: () =>
            chain({
              id: 'role-1',
              name: 'researcher',
              key: 'researcher',
              displayName: 'After',
              contextType: 'brand',
              branding: 'brand-1',
              protectedKind: 'none',
              status: 'active',
              version: 3,
            }),
        };
      },
    });
    Reflect.set(globalThis, 'RoleTemplate', { findOne: () => chain(undefined) });
    Reflect.set(globalThis, 'RoleTemplateRevision', { findOne: () => chain(undefined) });
    Reflect.set(globalThis, 'RoleScopeOverride', { find: () => ({ sort: () => chain([]) }) });
    const audits: unknown[] = [];
    const service = new Services.RoleAdministrationService({
      runTransaction: work => work(connection),
      getRegistry: () => createScopeRegistry([]),
      audit: () => ({
        createSucceededEvent: async (input, leased) => {
          connections.push(leased);
          audits.push(input);
          return { id: 'audit-1', eventId: 'event-1' } as never;
        },
        recordAttempt: async () => ({ persisted: true }),
      }),
    });

    const result = await service.updateRole({
      actor,
      brandId: 'brand-1',
      roleKey: asRoleKey('researcher'),
      expectedVersion: 2,
      displayName: 'After',
      requestId: 'request-1',
    });

    assert.deepEqual(updateCriteria, { id: 'role-1', version: 2 });
    assert.equal(result.version, 3);
    assert.equal(result.auditEventId, 'event-1');
    assert.equal(audits.length, 1);
    assert.ok(connections.length >= 4);
    assert.ok(connections.every(leased => leased === connection));
  });

  it('normalizes datastore write conflicts to a documented audited version conflict', async () => {
    let attempt:
      | { readonly input: { readonly reasonCode?: string }; readonly outcome: 'denied' | 'failed' }
      | undefined;
    const service = new Services.RoleAdministrationService({
      runTransaction: async () => {
        throw { raw: { code: 112, codeName: 'WriteConflict' } };
      },
      audit: () => ({
        createSucceededEvent: async () => {
          throw new Error('A failed transaction cannot write a success audit.');
        },
        recordAttempt: async (input, outcome) => {
          attempt = { input, outcome };
          return { persisted: true };
        },
      }),
    });

    await assert.rejects(
      service.updateRole({
        actor,
        brandId: 'brand-1',
        roleKey: asRoleKey('researcher'),
        expectedVersion: 2,
        displayName: 'Concurrent update',
        requestId: 'request-write-conflict',
      }),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'authorization.version-conflict'
    );
    assert.equal(attempt?.outcome, 'denied');
    assert.equal(attempt?.input.reasonCode, 'authorization.version-conflict');
  });

  it('maps a concurrent role-key uniqueness race to the documented duplicate-role conflict', async () => {
    const connection = Object.freeze({ lease: 'create-role-race' }) as Sails.Connection;
    let deniedReason: string | undefined;
    Reflect.set(globalThis, 'Role', {
      find: () => ({
        limit: () => ({ usingConnection: () => Promise.resolve([]) }),
      }),
      create: () => {
        const query = {
          fetch: () => query,
          usingConnection: () => Promise.reject({ code: 'E_UNIQUE' }),
        };
        return query;
      },
    });
    const service = new Services.RoleAdministrationService({
      runTransaction: work => work(connection),
      getRegistry: () => createScopeRegistry([]),
      audit: () => ({
        createSucceededEvent: async () => {
          throw new Error('A duplicate role cannot write a success audit.');
        },
        recordAttempt: async input => {
          deniedReason = input.reasonCode;
          return { persisted: true };
        },
      }),
    });

    await assert.rejects(
      service.createRole({
        actor,
        brandId: 'brand-1',
        key: 'researcher',
        displayName: 'Concurrent researcher role',
        requestId: 'request-create-race',
      }),
      (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'authorization.duplicate-role'
    );
    assert.equal(deniedReason, 'authorization.duplicate-role');
  });

  it('rejects a duplicate legacy role even when its authorization identity key is not migrated', async () => {
    const connection = Object.freeze({ lease: 'legacy-role-duplicate' }) as Sails.Connection;
    let criteria: Record<string, unknown> | undefined;
    let createInvoked = false;
    Reflect.set(globalThis, 'Role', {
      find: (value: Record<string, unknown>) => {
        criteria = value;
        return {
          limit: () => ({
            usingConnection: () => Promise.resolve([{ id: 'legacy-role', name: 'researcher', branding: 'brand-1' }]),
          }),
        };
      },
      create: () => {
        createInvoked = true;
        throw new Error('Duplicate detection must run before creation.');
      },
    });
    const service = new Services.RoleAdministrationService({
      runTransaction: work => work(connection),
      getRegistry: () => createScopeRegistry([]),
      audit: () => ({
        createSucceededEvent: async () => {
          throw new Error('A duplicate role cannot write a success audit.');
        },
        recordAttempt: async () => ({ persisted: true }),
      }),
    });

    await assert.rejects(
      service.createRole({
        actor,
        brandId: 'brand-1',
        key: 'researcher',
        displayName: 'Duplicate legacy researcher',
        requestId: 'request-legacy-duplicate',
      }),
      (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'authorization.duplicate-role'
    );
    assert.equal(createInvoked, false);
    assert.deepEqual(criteria, {
      branding: 'brand-1',
      or: [{ identityKey: 'brand:brand-1:researcher' }, { key: 'researcher' }, { name: 'researcher' }],
    });
  });

  it('does not let a brand role manager target a global system role', async () => {
    Reflect.set(globalThis, 'Role', {
      find() {
        return {
          limit: () =>
            Promise.resolve([
              {
                id: 'system-role-1',
                name: 'system-administrator',
                key: 'system-administrator',
                displayName: 'System administrator',
                contextType: 'system',
                protectedKind: 'system-admin',
                status: 'active',
                version: 1,
              },
            ]),
        };
      },
    });
    const service = new Services.RoleAdministrationService();

    await assert.rejects(
      service.previewRoleScopes({
        actor,
        roleKey: asRoleKey('system-administrator'),
        expectedVersion: 1,
        desiredScopeKeys: [],
        requestId: 'request-system-poisoning',
      }),
      (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'authorization.scope-denied'
    );
  });

  it('uses the configured ReDBox session secret when no dedicated confirmation secret is set', async () => {
    const previousAuthorization = sails.config.authorization;
    const previousRedboxSession = sails.config.redboxSession;
    sails.config.authorization = { mode: 'legacy', collectLegacyEvidenceInEnforce: true };
    sails.config.redboxSession = {
      name: 'redbox.sid',
      secret: 'redbox-session-confirmation-secret',
      adapter: 'memory',
      mongoUrl: '',
    };
    Reflect.set(globalThis, 'RoleTemplate', {
      findOne: () =>
        Promise.resolve({
          id: 'template-1',
          key: 'researcher',
          displayName: 'Researchers',
          description: 'Researcher template',
          currentRevision: 1,
          protectedKind: 'none',
          status: 'active',
          version: 1,
        }),
    });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      findOne: () =>
        Promise.resolve({
          id: 'revision-1',
          template: 'template-1',
          revision: 1,
          scopeKeys: ['authorization.self.read'],
          publishedBy: 'test',
          publishedAt: new Date(),
        }),
    });
    const registry = createScopeRegistry([
      {
        sourceType: 'core',
        sourcePackage: '@researchdatabox/redbox-core',
        sourceVersion: '1.0.0',
        definitions: [
          {
            key: asScopeKey('authorization.self.read'),
            label: 'Read own authorization',
            description: 'Read own authorization.',
            risk: 'read',
          },
        ],
      },
    ]);
    const systemActor = freezeAuthorizationContext({
      ...actor,
      grantedScopeKeys: [asScopeKey('authorization.self.read'), asScopeKey('system.authorization.manage')],
      effectiveScopeKeys: [asScopeKey('authorization.self.read'), asScopeKey('system.authorization.manage')],
    });

    try {
      const preview = await new Services.RoleAdministrationService({
        getRegistry: () => registry,
      }).previewTemplateRevision({
        actor: systemActor,
        templateKey: 'researcher',
        expectedVersion: 1,
        scopeKeys: [asScopeKey('authorization.self.read')],
        requestId: 'request-session-secret',
      });
      assert.equal(typeof preview.confirmationToken, 'string');
    } finally {
      sails.config.authorization = previousAuthorization;
      sails.config.redboxSession = previousRedboxSession;
    }
  });

  it('binds every template publication field into the preview and confirmation token', async () => {
    const template = {
      id: 'template-1',
      key: 'researcher',
      displayName: 'Researchers',
      description: 'Researcher template',
      currentRevision: 1,
      protectedKind: 'none',
      status: 'active',
      version: 1,
    };
    Reflect.set(globalThis, 'RoleTemplate', { findOne: () => connectedResult(template) });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      findOne: () =>
        connectedResult({
          id: 'revision-1',
          template: template.id,
          revision: 1,
          scopeKeys: ['authorization.self.read'],
          notes: 'Current notes',
          publishedBy: 'operator-1',
          publishedAt: new Date(),
        }),
    });
    const registry = createScopeRegistry([
      {
        sourceType: 'core',
        sourcePackage: '@researchdatabox/redbox-core',
        sourceVersion: '1.0.0',
        definitions: [
          {
            key: asScopeKey('authorization.self.read'),
            label: 'Read own authorization',
            description: 'Read own authorization.',
            risk: 'read',
          },
        ],
      },
    ]);
    const systemActor = freezeAuthorizationContext({
      ...actor,
      grantedScopeKeys: [asScopeKey('authorization.self.read'), asScopeKey('system.authorization.manage')],
      effectiveScopeKeys: [asScopeKey('authorization.self.read'), asScopeKey('system.authorization.manage')],
    });
    const service = new Services.RoleAdministrationService({
      ...auditedTransactionDependencies(),
      getRegistry: () => registry,
      getConfirmationSecret: () => 'confirmation-secret-that-is-long-enough',
    });
    const command = {
      actor: systemActor,
      templateKey: 'researcher',
      expectedVersion: 1,
      scopeKeys: [asScopeKey('authorization.self.read')],
      displayName: 'Research users',
      description: 'Updated template description',
      notes: 'Reviewed publication notes',
      reason: 'Approved change',
      requestId: 'request-template-preview',
    };

    const preview = await service.previewTemplateRevision(command);
    assert.deepEqual(preview.current, {
      templateKey: 'researcher',
      revision: 1,
      scopeKeys: [asScopeKey('authorization.self.read')],
      displayName: 'Researchers',
      description: 'Researcher template',
      notes: 'Current notes',
      version: 1,
    });
    assert.deepEqual(preview.proposed, {
      templateKey: 'researcher',
      revision: 2,
      scopeKeys: [asScopeKey('authorization.self.read')],
      displayName: 'Research users',
      description: 'Updated template description',
      notes: 'Reviewed publication notes',
      version: 2,
    });

    for (const changed of [
      { displayName: 'Changed after preview' },
      { description: 'Changed after preview' },
      { notes: 'Changed after preview' },
      { reason: 'Changed after preview' },
    ]) {
      await assert.rejects(
        service.publishTemplateRevision({
          ...command,
          ...changed,
          confirmationToken: preview.confirmationToken!,
        }),
        (error: unknown) =>
          typeof error === 'object' && error !== null && 'code' in error && error.code === 'authorization.preview-stale'
      );
    }
  });

  it('revalidates template scope availability when applying a confirmed preview', async () => {
    const template = {
      id: 'template-1',
      key: 'researcher',
      displayName: 'Researchers',
      description: 'Researcher template',
      currentRevision: 1,
      protectedKind: 'none',
      status: 'active',
      version: 1,
    };
    Reflect.set(globalThis, 'RoleTemplate', { findOne: () => connectedResult(template) });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      findOne: () =>
        connectedResult({
          id: 'revision-1',
          template: template.id,
          revision: 1,
          scopeKeys: ['authorization.self.read'],
          publishedBy: 'operator-1',
          publishedAt: new Date(),
        }),
    });
    const activeRegistry = createScopeRegistry([
      {
        sourceType: 'core',
        sourcePackage: '@researchdatabox/redbox-core',
        sourceVersion: '1.0.0',
        definitions: [
          {
            key: asScopeKey('authorization.self.read'),
            label: 'Read own authorization',
            description: 'Read own authorization.',
            risk: 'read',
          },
        ],
      },
    ]);
    let registry = activeRegistry;
    const systemActor = freezeAuthorizationContext({
      ...actor,
      grantedScopeKeys: [asScopeKey('authorization.self.read'), asScopeKey('system.authorization.manage')],
      effectiveScopeKeys: [asScopeKey('authorization.self.read'), asScopeKey('system.authorization.manage')],
    });
    const service = new Services.RoleAdministrationService({
      ...auditedTransactionDependencies(),
      getRegistry: () => registry,
      getConfirmationSecret: () => 'confirmation-secret-that-is-long-enough',
    });
    const command = {
      actor: systemActor,
      templateKey: 'researcher',
      expectedVersion: 1,
      scopeKeys: [asScopeKey('authorization.self.read')],
      requestId: 'request-template-drift',
    };
    const preview = await service.previewTemplateRevision(command);
    registry = createScopeRegistry([]);

    await assert.rejects(
      service.publishTemplateRevision({ ...command, confirmationToken: preview.confirmationToken! }),
      (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'authorization.invalid-scope'
    );
  });

  describe('scope-set guards', () => {
    const REGISTRY = createScopeRegistry([
      {
        sourceType: 'core',
        sourcePackage: '@researchdatabox/redbox-core',
        sourceVersion: '1.0.0',
        definitions: [
          {
            key: asScopeKey('record.read'),
            label: 'Read records',
            description: 'Read records.',
            risk: 'read',
          },
          {
            key: asScopeKey('record.destroy'),
            label: 'Destroy records',
            description: 'Destroy records.',
            risk: 'admin',
          },
          {
            key: asScopeKey('authorization.self.read'),
            label: 'Read own authorization',
            description: 'Read own authorization.',
            risk: 'read',
          },
          {
            key: asScopeKey('portal.home.read'),
            label: 'Read portal home',
            description: 'Read portal home.',
            risk: 'read',
          },
        ],
      },
    ]);

    function stubRole(overrides: Record<string, unknown> = {}): void {
      const role = {
        id: 'role-1',
        name: 'researcher',
        key: 'researcher',
        displayName: 'Researchers',
        contextType: 'brand',
        branding: 'brand-1',
        protectedKind: 'none',
        status: 'active',
        version: 1,
        ...overrides,
      };
      Reflect.set(globalThis, 'Role', {
        find: () =>
          ({
            limit: () => connectedResult([role]),
          }) as never,
        findOne: () => ({ populate: () => connectedResult({ ...role, users: [] }) }),
      });
      Reflect.set(globalThis, 'RoleTemplate', { findOne: () => connectedResult(undefined) });
      Reflect.set(globalThis, 'RoleTemplateRevision', { findOne: () => connectedResult(undefined) });
      Reflect.set(globalThis, 'RoleScopeOverride', { find: () => ({ sort: () => connectedResult([]) }) });
      Reflect.set(globalThis, 'RoleAssignment', {
        count: () => connectedResult(0),
        find: () => ({ limit: () => connectedResult([]) }),
      });
      const emptyNativeModel = (tableName: string) => ({
        tableName,
        getDatastore: () => ({
          manager: {
            collection: () => ({
              find: () => ({
                limit: () => ({ toArray: () => Promise.resolve([]) }),
              }),
            }),
          },
        }),
      });
      Reflect.set(globalThis, 'Record', emptyNativeModel('record'));
      Reflect.set(globalThis, 'DeletedRecord', emptyNativeModel('deletedrecord'));
      // `dependencySummary` scans every model that can reference a role key.
      for (const model of ['AppConfig', 'Form', 'RecordType', 'WorkflowStep']) {
        Reflect.set(globalThis, model, { find: () => ({ limit: () => connectedResult([]) }) });
      }
      Reflect.set(globalThis, 'sails', {
        ...(Reflect.get(globalThis, 'sails') as object | undefined),
        config: {},
        models: {},
      });
    }

    function serviceWithRegistry(): Services.RoleAdministrationService {
      return new Services.RoleAdministrationService({ getRegistry: () => REGISTRY });
    }

    function hasCode(code: string) {
      return (error: unknown): boolean =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === code;
    }

    it('refuses to grant a role any scope the acting administrator does not hold', async () => {
      stubRole();

      // The actor holds only `authorization.role.manage`, so delegating `record.destroy`
      // would let an administrator manufacture authority they cannot exercise.
      await assert.rejects(
        serviceWithRegistry().previewRoleScopes({
          actor,
          brandId: 'brand-1',
          roleKey: asRoleKey('researcher'),
          expectedVersion: 1,
          desiredScopeKeys: [asScopeKey('record.destroy')],
          requestId: 'request-delegation',
        }),
        hasCode('authorization.delegation-ceiling')
      );
    });

    it('refuses to remove the protected brand-administrator scope floor', async () => {
      stubRole({ protectedKind: 'brand-admin', name: 'Admin', key: 'Admin' });

      await assert.rejects(
        serviceWithRegistry().previewRoleScopes({
          actor,
          brandId: 'brand-1',
          roleKey: asRoleKey('Admin'),
          expectedVersion: 1,
          desiredScopeKeys: [],
          requestId: 'request-floor',
        }),
        hasCode('authorization.protected-role')
      );
    });

    it('refuses to widen Guest beyond the reviewed read-risk allowlist', async () => {
      stubRole({ protectedKind: 'guest', name: 'Guest', key: 'Guest' });

      await assert.rejects(
        serviceWithRegistry().previewRoleScopes({
          actor,
          brandId: 'brand-1',
          roleKey: asRoleKey('Guest'),
          expectedVersion: 1,
          desiredScopeKeys: [
            asScopeKey('authorization.self.read'),
            asScopeKey('portal.home.read'),
            asScopeKey('record.read'),
          ],
          requestId: 'request-guest',
        }),
        hasCode('authorization.protected-role')
      );
    });

    it('rejects a confirmation token that does not match the applied scope set', async () => {
      stubRole();
      // This actor must hold everything it delegates, so the handshake is what fails.
      const delegatingActor = freezeAuthorizationContext({
        ...actor,
        grantedScopeKeys: [
          asScopeKey('authorization.role.manage'),
          asScopeKey('authorization.self.read'),
          asScopeKey('record.read'),
        ],
        effectiveScopeKeys: [
          asScopeKey('authorization.role.manage'),
          asScopeKey('authorization.self.read'),
          asScopeKey('record.read'),
        ],
      });
      const attempts: { readonly reasonCode?: string; readonly outcome: 'denied' | 'failed' }[] = [];
      const service = new Services.RoleAdministrationService({
        ...auditedTransactionDependencies((input, outcome) => attempts.push({ reasonCode: input.reasonCode, outcome })),
        getRegistry: () => REGISTRY,
        getConfirmationSecret: () => 'confirmation-secret-that-is-long-enough',
      });

      const preview = await service.previewRoleScopes({
        actor: delegatingActor,
        brandId: 'brand-1',
        roleKey: asRoleKey('researcher'),
        expectedVersion: 1,
        desiredScopeKeys: [asScopeKey('record.read')],
        requestId: 'request-preview',
      });
      assert.equal(typeof preview.confirmationToken, 'string');

      await assert.rejects(
        service.applyRoleScopes({
          actor: delegatingActor,
          brandId: 'brand-1',
          roleKey: asRoleKey('researcher'),
          expectedVersion: 1,
          desiredScopeKeys: [asScopeKey('record.read')],
          reason: 'Changed after impact review',
          confirmationToken: preview.confirmationToken!,
          requestId: 'request-apply-changed-reason',
        }),
        hasCode('authorization.preview-stale')
      );

      // Replaying a token issued for one scope set against a different one must fail
      // before any write, otherwise the preview/confirm handshake proves nothing.
      await assert.rejects(
        service.applyRoleScopes({
          actor: delegatingActor,
          brandId: 'brand-1',
          roleKey: asRoleKey('researcher'),
          expectedVersion: 1,
          desiredScopeKeys: [asScopeKey('authorization.self.read')],
          confirmationToken: preview.confirmationToken!,
          requestId: 'request-apply',
        }),
        hasCode('authorization.preview-stale')
      );
      assert.deepEqual(attempts, [
        { reasonCode: 'authorization.preview-stale', outcome: 'denied' },
        { reasonCode: 'authorization.preview-stale', outcome: 'denied' },
      ]);
    });

    it('counts only currently effective assignments as preview impact', async () => {
      stubRole();
      Reflect.set(globalThis, 'RoleAssignment', {
        count: (criteria: { readonly status?: string }) => connectedResult(criteria.status === 'active' ? 2 : 1_500),
        find: () => ({ limit: () => connectedResult([]) }),
      });
      const delegatingActor = freezeAuthorizationContext({
        ...actor,
        grantedScopeKeys: [asScopeKey('authorization.role.manage'), asScopeKey('record.read')],
        effectiveScopeKeys: [asScopeKey('authorization.role.manage'), asScopeKey('record.read')],
      });

      const preview = await new Services.RoleAdministrationService({
        getRegistry: () => REGISTRY,
        getConfirmationSecret: () => 'confirmation-secret-that-is-long-enough',
      }).previewRoleScopes({
        actor: delegatingActor,
        brandId: 'brand-1',
        roleKey: asRoleKey('researcher'),
        expectedVersion: 1,
        desiredScopeKeys: [asScopeKey('record.read')],
        requestId: 'request-historical-assignment-impact',
      });

      assert.equal(preview.dependencies?.assignmentRows, 1_001);
      assert.equal(preview.affectedAssignments, 2);
      assert.deepEqual(preview.fatalErrors, []);
      assert.equal(typeof preview.confirmationToken, 'string');
    });

    it('rejects apply when active assignment impact changes after preview', async () => {
      stubRole();
      let activeAssignments = 1;
      Reflect.set(globalThis, 'RoleAssignment', {
        count: (criteria: { readonly status?: string }) =>
          connectedResult(criteria.status === 'active' ? activeAssignments : 4),
        find: () => ({ limit: () => connectedResult([]) }),
      });
      const delegatingActor = freezeAuthorizationContext({
        ...actor,
        grantedScopeKeys: [asScopeKey('authorization.role.manage'), asScopeKey('record.read')],
        effectiveScopeKeys: [asScopeKey('authorization.role.manage'), asScopeKey('record.read')],
      });
      let deniedReason: string | undefined;
      const service = new Services.RoleAdministrationService({
        ...auditedTransactionDependencies(input => {
          deniedReason = input.reasonCode;
        }),
        getRegistry: () => REGISTRY,
        getConfirmationSecret: () => 'confirmation-secret-that-is-long-enough',
      });
      const command = {
        actor: delegatingActor,
        brandId: 'brand-1',
        roleKey: asRoleKey('researcher'),
        expectedVersion: 1,
        desiredScopeKeys: [asScopeKey('record.read')],
        requestId: 'request-assignment-impact-drift',
      };
      const preview = await service.previewRoleScopes(command);
      activeAssignments = 2;

      await assert.rejects(
        service.applyRoleScopes({ ...command, confirmationToken: preview.confirmationToken! }),
        hasCode('authorization.preview-stale')
      );
      assert.equal(deniedReason, 'authorization.preview-stale');
    });

    it('scans active records and tombstones through their persistence-native ACL paths', async () => {
      stubRole();
      let activeCriteria: Record<string, unknown> | undefined;
      let deletedCriteria: Record<string, unknown> | undefined;
      let workflowCriteria: Record<string, unknown> | undefined;
      Reflect.set(globalThis, 'Record', {
        tableName: 'record',
        getDatastore: () => ({
          manager: {
            collection: () => ({
              find: (criteria: Record<string, unknown>) => {
                activeCriteria = criteria;
                return { limit: () => ({ toArray: () => Promise.resolve([]) }) };
              },
            }),
          },
        }),
      });
      Reflect.set(globalThis, 'DeletedRecord', {
        tableName: 'deletedrecord',
        getDatastore: () => ({
          manager: {
            collection: () => ({
              find: (criteria: Record<string, unknown>) => {
                deletedCriteria = criteria;
                return { limit: () => ({ toArray: () => Promise.resolve([]) }) };
              },
            }),
          },
        }),
      });
      Reflect.set(globalThis, 'RecordType', {
        find: () => ({ limit: () => Promise.resolve([{ id: 'record-type-1' }]) }),
      });
      Reflect.set(globalThis, 'Form', {
        find: () => ({ limit: () => Promise.resolve([{ id: 'form-1' }]) }),
      });
      Reflect.set(globalThis, 'WorkflowStep', {
        find: (criteria: Record<string, unknown>) => {
          workflowCriteria = criteria;
          return { limit: () => Promise.resolve([]) };
        },
      });
      const preview = await new Services.RoleAdministrationService({
        getRegistry: () => REGISTRY,
        getConfirmationSecret: () => 'confirmation-secret-that-is-long-enough',
      }).previewRoleInactivation({
        actor,
        brandId: 'brand-1',
        roleKey: asRoleKey('researcher'),
        expectedVersion: 1,
        requestId: 'request-inactivation-dependencies',
      });

      assert.equal(typeof preview.confirmationToken, 'string');
      assert.deepEqual(activeCriteria, {
        'metaMetadata.brandId': 'brand-1',
        $or: [{ 'authorization.viewRoles': 'researcher' }, { 'authorization.editRoles': 'researcher' }],
      });
      assert.deepEqual(deletedCriteria, {
        'deletedRecordMetadata.metaMetadata.brandId': 'brand-1',
        $or: [
          { 'deletedRecordMetadata.authorization.viewRoles': 'researcher' },
          { 'deletedRecordMetadata.authorization.editRoles': 'researcher' },
        ],
      });
      assert.deepEqual(workflowCriteria, {
        or: [{ recordType: ['record-type-1'] }, { form: ['form-1'] }],
      });
    });

    it('blocks hard deletion when only a legacy Role.users association remains', async () => {
      stubRole();
      Reflect.set(globalThis, 'Role', {
        ...(Reflect.get(globalThis, 'Role') as object),
        findOne: () => ({
          populate: () =>
            Promise.resolve({
              id: 'role-1',
              name: 'researcher',
              key: 'researcher',
              branding: 'brand-1',
              users: [{ id: 'legacy-user-1' }],
            }),
        }),
      });

      const preview = await serviceWithRegistry().previewRoleDeletion({
        actor,
        brandId: 'brand-1',
        roleKey: asRoleKey('researcher'),
        expectedVersion: 1,
        requestId: 'request-legacy-role-membership',
      });

      assert.equal(preview.affectedAssignments, 0);
      assert.equal(preview.dependencies?.assignmentRows, 0);
      assert.equal(preview.dependencies?.legacyUserAssociations, 1);
      assert.deepEqual(preview.fatalErrors, ['role-has-dependencies']);
      assert.equal(preview.confirmationToken, undefined);
    });

    it('does not issue a scope-change token when dependency impact cannot be bounded', async () => {
      stubRole();
      Reflect.set(globalThis, 'Role', {
        ...(Reflect.get(globalThis, 'Role') as object),
        findOne: () => ({
          populate: () => Promise.reject(new Error('legacy association unavailable')),
        }),
      });
      const delegatingActor = freezeAuthorizationContext({
        ...actor,
        grantedScopeKeys: [asScopeKey('authorization.role.manage'), asScopeKey('record.read')],
        effectiveScopeKeys: [asScopeKey('authorization.role.manage'), asScopeKey('record.read')],
      });

      const preview = await new Services.RoleAdministrationService({
        getRegistry: () => REGISTRY,
        getConfirmationSecret: () => 'confirmation-secret-that-is-long-enough',
      }).previewRoleScopes({
        actor: delegatingActor,
        brandId: 'brand-1',
        roleKey: asRoleKey('researcher'),
        expectedVersion: 1,
        desiredScopeKeys: [asScopeKey('record.read')],
        requestId: 'request-incomplete-role-impact',
      });

      assert.equal(preview.dependencies?.scanIncomplete, true);
      assert.deepEqual(preview.fatalErrors, ['assignment-impact-limit']);
      assert.equal(preview.confirmationToken, undefined);
    });
  });
});
