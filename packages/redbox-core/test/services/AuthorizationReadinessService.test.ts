import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, it } from 'mocha';
import {
  asScopeKey,
  createScopeRegistry,
  freezeAuthorizationContext,
  type AuthorizationContext,
} from '../../src/authorization';
import { AUTHORIZATION_MIGRATION_NAME } from '../../src/services/AuthorizationMigrationService';
import { Services } from '../../src/services/AuthorizationReadinessService';

function queryResult<T>(value: T) {
  const query = {
    sort() {
      return query;
    },
    limit() {
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

function systemActor(active = true): AuthorizationContext {
  return freezeAuthorizationContext({
    contextType: 'brand',
    principal: { category: 'authenticated', authMethod: 'session', active, userId: 'system-operator' },
    brand: { requestedIdentifier: 'default', id: 'brand-1', name: 'default', exists: true, authorized: true },
    grantedScopeKeys: [asScopeKey('system.authorization.manage')],
    effectiveScopeKeys: [asScopeKey('system.authorization.manage')],
  });
}

const registry = createScopeRegistry([
  {
    sourceType: 'core',
    sourcePackage: '@researchdatabox/redbox-core',
    sourceVersion: 'test',
    definitions: [
      {
        key: asScopeKey('system.authorization.manage'),
        label: 'Manage authorization',
        description: 'Manage system authorization.',
        risk: 'system',
      },
    ],
  },
]);

const globalNames = [
  'AuthorizationScope',
  'Migration',
  'AuthorizationShadowMismatch',
  'BrandingConfig',
  'Role',
  'RoleAssignment',
  'User',
] as const;
let descriptors: Map<string, PropertyDescriptor | undefined>;

beforeEach(() => {
  descriptors = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Reflect.set(globalThis, 'AuthorizationScope', {
    count: (criteria: Record<string, unknown>) => Promise.resolve('status' in criteria ? 0 : 1),
  });
  Reflect.set(globalThis, 'Migration', {
    findOne: () => Promise.resolve({ name: AUTHORIZATION_MIGRATION_NAME }),
  });
  Reflect.set(globalThis, 'AuthorizationShadowMismatch', { count: () => Promise.resolve(0) });
  Reflect.set(globalThis, 'BrandingConfig', {
    find: () => queryResult([{ id: 'brand-1' }, { id: 'brand-2' }]),
  });
  Reflect.set(globalThis, 'Role', {
    find: () =>
      queryResult([
        {
          id: 'brand-admin-role',
          contextType: 'brand',
          protectedKind: 'brand-admin',
          status: 'active',
          branding: 'brand-1',
        },
        {
          id: 'system-admin-role',
          contextType: 'system',
          protectedKind: 'system-admin',
          status: 'active',
          branding: null,
        },
      ]),
  });
  Reflect.set(globalThis, 'RoleAssignment', {
    find: () =>
      queryResult([
        {
          id: 'brand-assignment',
          role: 'brand-admin-role',
          branding: 'brand-1',
          principalId: 'brand-admin',
          status: 'active',
          sourcePresent: true,
        },
        {
          id: 'system-assignment',
          role: 'system-admin-role',
          branding: null,
          principalId: 'system-admin',
          status: 'active',
          sourcePresent: true,
        },
      ]),
  });
  Reflect.set(globalThis, 'User', {
    find: () =>
      queryResult([
        { id: 'brand-admin', loginDisabled: false, accountLinkState: 'standalone' },
        { id: 'system-admin', loginDisabled: false, accountLinkState: 'standalone' },
      ]),
  });
});

afterEach(() => {
  for (const name of globalNames) {
    const descriptor = descriptors.get(name);
    if (descriptor === undefined) Reflect.deleteProperty(globalThis, name);
    else Object.defineProperty(globalThis, name, descriptor);
  }
});

describe('AuthorizationReadinessService', () => {
  function service() {
    return new Services.AuthorizationReadinessService({
      now: () => new Date('2026-08-30T00:00:00.000Z'),
      getMode: () => 'shadow',
      getRegistry: () => registry,
      validateRoutes: () => ({ routeCount: 31, valid: true }),
      reportDrift: async () => ({
        generatedAt: '2026-08-30T00:00:00.000Z',
        issues: [],
        truncated: false,
        summary: { blocker: 0, warning: 0, expected: 0 },
      }),
      probeTransactions: async () => ({ available: true }),
    });
  }

  it('returns bounded blockers for missing brand coverage and the two-system-admin readiness quorum', async () => {
    const report = await service().getReport(systemActor());

    assert.equal(report.readyForEnforce, false);
    assert.deepEqual(report.administrators, {
      brandCount: 2,
      brandsWithoutAdministratorCount: 1,
      brandsWithoutAdministrator: ['brand-2'],
      systemAdministratorCount: 1,
      requiredSystemAdministratorCount: 2,
    });
    assert.deepEqual(
      report.blockers.map(blocker => blocker.code),
      ['authorization-readiness.brand-administrator-missing', 'authorization-readiness.system-administrator-quorum-low']
    );
  });

  it('requires an active system-management actor before reading deployment topology', async () => {
    await assert.rejects(
      service().getReport(systemActor(false)),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        Reflect.get(error, 'code') === 'authorization.authentication-required'
    );
    await assert.rejects(
      service().getReport(
        freezeAuthorizationContext({
          ...systemActor(),
          grantedScopeKeys: [],
          effectiveScopeKeys: [],
        })
      ),
      (error: unknown) =>
        typeof error === 'object' && error !== null && Reflect.get(error, 'code') === 'authorization.scope-denied'
    );
  });

  it('reports the complete missing-brand count while bounding disclosed brand identifiers', async () => {
    Reflect.set(globalThis, 'BrandingConfig', {
      find: () => queryResult(Array.from({ length: 102 }, (_value, index) => ({ id: `brand-${index + 1}` }))),
    });

    const report = await service().getReport(systemActor());

    assert.equal(report.administrators.brandsWithoutAdministratorCount, 101);
    assert.equal(report.administrators.brandsWithoutAdministrator.length, 100);
    assert.equal(
      report.blockers.find(blocker => blocker.code === 'authorization-readiness.brand-administrator-missing')?.count,
      101
    );
  });

  it('fails closed on malformed protected-role ownership', async () => {
    Reflect.set(globalThis, 'RoleAssignment', {
      find: () =>
        queryResult([
          {
            id: 'malformed',
            role: 'brand-admin-role',
            branding: 'brand-2',
            principalId: 'brand-admin',
            status: 'active',
            sourcePresent: true,
          },
        ]),
    });

    await assert.rejects(service().getReport(systemActor()), /malformed protected-role ownership/);
  });

  it('treats an invalid route result and transaction probe as readiness blockers', async () => {
    const report = await new Services.AuthorizationReadinessService({
      now: () => new Date('2026-08-30T00:00:00.000Z'),
      getMode: () => 'shadow',
      getRegistry: () => registry,
      validateRoutes: () => ({ routeCount: 0, valid: false }),
      reportDrift: async () => ({
        generatedAt: '2026-08-30T00:00:00.000Z',
        issues: [],
        truncated: false,
        summary: { blocker: 0, warning: 0, expected: 0 },
      }),
      probeTransactions: async () => ({ available: false, code: 'authorization.transaction-unavailable' }),
    }).getReport(systemActor());

    assert.equal(report.routes.valid, false);
    assert.deepEqual(report.transactions, {
      available: false,
      code: 'authorization.transaction-unavailable',
    });
    assert.equal(report.readyForEnforce, false);
    assert.equal(
      report.blockers.some(blocker => blocker.code === 'authorization-readiness.route-declarations-invalid'),
      true
    );
    assert.equal(
      report.blockers.some(blocker => blocker.code === 'authorization-readiness.transactions-unavailable'),
      true
    );
  });
});
