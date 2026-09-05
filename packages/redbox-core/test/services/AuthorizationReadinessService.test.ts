import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';
import { afterEach, beforeEach, describe, it } from 'mocha';
import {
  asScopeKey,
  createScopeRegistry,
  freezeAuthorizationContext,
  type AuthorizationContext,
} from '../../src/authorization';
import { AUTHORIZATION_MIGRATION_NAME } from '../../src/services/AuthorizationMigrationService';
import { Services as AuthorizationServices } from '../../src/services/AuthorizationService';
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

const approvedEvidence = {
  approved: true,
  approvedAt: '2026-08-29T00:00:00.000Z',
  fingerprint: 'a'.repeat(64),
};

const completeReleaseEvidence = {
  navigationParity: approvedEvidence,
  approvedSecurityDifferences: approvedEvidence,
  performance: {
    ...approvedEvidence,
    baselineP95Ms: 10,
    baselineP99Ms: 20,
    maximumOverheadP95Ms: 5,
    maximumOverheadP99Ms: 8,
    observedOverheadP95Ms: 3,
    observedOverheadP99Ms: 6,
    baselineQueryCount: 4,
    maximumQueryCount: 4,
    observedQueryCount: 4,
  },
  identity: { buildVersion: '1.2.3', instanceId: 'instance-1' },
  shadowWindow: {
    ...approvedEvidence,
    startedAt: '2026-08-27T00:00:00.000Z',
    completedAt: '2026-08-29T00:00:00.000Z',
    minimumHours: 24,
  },
  rollback: approvedEvidence,
  approvals: {
    product: approvedEvidence,
    security: approvedEvidence,
    operations: approvedEvidence,
    hookOwners: approvedEvidence,
    integrators: approvedEvidence,
  },
  durableFingerprint: 'b'.repeat(64),
} as const;

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
let savedAuthorizationReadiness: unknown;
let savedSailsDescriptor: PropertyDescriptor | undefined;
let savedSailsDescriptorCaptured = false;

function sailsConfig(): Record<string, unknown> | undefined {
  return (globalThis as { sails?: { config?: Record<string, unknown> } }).sails?.config;
}

function ensureSailsDescriptor(): void {
  const existing = (globalThis as Record<string, unknown>).sails;
  if (existing !== undefined) return;
  Reflect.set(globalThis, 'sails', {
    config: { authorization: { mode: 'legacy' }, routes: {} },
    log: {},
    services: {},
    models: {},
    on: () => {},
    emit: () => {},
  });
}

describe('AuthorizationReadinessService', () => {
  beforeEach(() => {
    if (!savedSailsDescriptorCaptured) {
      savedSailsDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'sails');
      savedSailsDescriptorCaptured = true;
    }
    ensureSailsDescriptor();
    descriptors = new Map(globalNames.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    savedAuthorizationReadiness = sailsConfig()?.authorizationReadiness;
    if (sailsConfig() !== undefined) {
      delete sailsConfig()?.authorizationReadiness;
    }
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
            name: 'Admin',
            key: 'Admin',
            identityKey: 'brand:brand-1:Admin',
            displayName: 'Brand administrators',
            contextType: 'brand',
            protectedKind: 'brand-admin',
            status: 'active',
            version: 2,
            branding: 'brand-1',
          },
          {
            id: 'system-admin-role',
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
    const config = sailsConfig();
    if (config !== undefined) {
      if (savedAuthorizationReadiness === undefined) {
        delete config.authorizationReadiness;
      } else {
        config.authorizationReadiness = savedAuthorizationReadiness;
      }
    }
    if (savedSailsDescriptorCaptured) {
      if (savedSailsDescriptor === undefined) Reflect.deleteProperty(globalThis, 'sails');
      else Object.defineProperty(globalThis, 'sails', savedSailsDescriptor);
      savedSailsDescriptorCaptured = false;
    }
  });

  function service() {
    return new Services.AuthorizationReadinessService({
      now: () => new Date('2026-08-30T00:00:00.000Z'),
      getMode: () => 'shadow',
      getRegistry: () => registry,
      validateRoutes: () => ({ routeCount: 160, configuredRouteCount: 317, valid: true }),
      reportDrift: async () => ({
        generatedAt: '2026-08-30T00:00:00.000Z',
        issues: [],
        truncated: false,
        summary: { blocker: 0, warning: 0, expected: 0 },
      }),
      probeTransactions: async () => ({ available: true }),
      getReleaseEvidence: () => completeReleaseEvidence,
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
      validateRoutes: () => ({ routeCount: 0, configuredRouteCount: 0, valid: false }),
      reportDrift: async () => ({
        generatedAt: '2026-08-30T00:00:00.000Z',
        issues: [],
        truncated: false,
        summary: { blocker: 0, warning: 0, expected: 0 },
      }),
      probeTransactions: async () => ({ available: false, code: 'authorization.transaction-unavailable' }),
      getReleaseEvidence: () => completeReleaseEvidence,
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

  it('models every normative release-evidence gate and blocks when durable evidence is absent', async () => {
    Reflect.set(globalThis, 'BrandingConfig', { find: () => queryResult([{ id: 'brand-1' }]) });
    Reflect.set(globalThis, 'User', {
      find: () =>
        queryResult([
          { id: 'brand-admin', accountLinkState: 'active' },
          { id: 'system-admin', accountLinkState: 'active' },
          { id: 'system-admin-2', accountLinkState: 'active' },
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
          {
            id: 'system-assignment-2',
            role: 'system-admin-role',
            branding: null,
            principalId: 'system-admin-2',
            status: 'active',
            sourcePresent: true,
          },
        ]),
    });

    const report = await new Services.AuthorizationReadinessService({
      now: () => new Date('2026-08-30T00:00:00.000Z'),
      getMode: () => 'shadow',
      getRegistry: () => registry,
      validateRoutes: () => ({ routeCount: 160, configuredRouteCount: 317, valid: true }),
      reportDrift: async () => ({
        generatedAt: '2026-08-30T00:00:00.000Z',
        issues: [],
        truncated: false,
        summary: { blocker: 0, warning: 0, expected: 0 },
      }),
      probeTransactions: async () => ({ available: true }),
      getReleaseEvidence: () => undefined,
    }).getReport(systemActor());

    assert.equal(report.readyForEnforce, false);
    assert.deepEqual(report.releaseGates, {
      navigationParity: false,
      approvedSecurityDifferences: false,
      performance: false,
      identity: { complete: false },
      shadowWindow: false,
      rollback: false,
      approvals: { product: false, security: false, operations: false, hookOwners: false, integrators: false },
      durableFingerprint: false,
    });
    assert.deepEqual(
      report.blockers.map(blocker => blocker.code),
      [
        'authorization-readiness.navigation-parity-evidence-missing',
        'authorization-readiness.security-differences-approval-missing',
        'authorization-readiness.performance-evidence-missing',
        'authorization-readiness.deployment-identity-missing',
        'authorization-readiness.shadow-window-evidence-missing',
        'authorization-readiness.rollback-rehearsal-evidence-missing',
        'authorization-readiness.release-approvals-missing',
        'authorization-readiness.durable-fingerprint-missing',
      ]
    );

    const approvedReport = await new Services.AuthorizationReadinessService({
      now: () => new Date('2026-08-30T00:00:00.000Z'),
      getMode: () => 'shadow',
      getRegistry: () => registry,
      validateRoutes: () => ({ routeCount: 160, configuredRouteCount: 317, valid: true }),
      reportDrift: async () => ({
        generatedAt: '2026-08-30T00:00:00.000Z',
        issues: [],
        truncated: false,
        summary: { blocker: 0, warning: 0, expected: 0 },
      }),
      probeTransactions: async () => ({ available: true }),
      getReleaseEvidence: () => completeReleaseEvidence,
    }).getReport(systemActor());

    assert.equal(approvedReport.readyForEnforce, true);
    assert.equal(approvedReport.blockers.length, 0);
    assert.deepEqual(approvedReport.releaseGates.approvals, {
      product: true,
      security: true,
      operations: true,
      hookOwners: true,
      integrators: true,
    });
  });

  it('rejects incomplete, non-finite, negative, and unordered query-count/latency evidence', async () => {
    Reflect.set(globalThis, 'BrandingConfig', { find: () => queryResult([{ id: 'brand-1' }]) });
    Reflect.set(globalThis, 'User', {
      find: () =>
        queryResult([
          { id: 'brand-admin', accountLinkState: 'active' },
          { id: 'system-admin', accountLinkState: 'active' },
          { id: 'system-admin-2', accountLinkState: 'active' },
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
          {
            id: 'system-assignment-2',
            role: 'system-admin-role',
            branding: null,
            principalId: 'system-admin-2',
            status: 'active',
            sourcePresent: true,
          },
        ]),
    });
    async function performanceGate(performance: Record<string, unknown>) {
      const report = await new Services.AuthorizationReadinessService({
        now: () => new Date('2026-08-30T00:00:00.000Z'),
        getMode: () => 'shadow',
        getRegistry: () => registry,
        validateRoutes: () => ({ routeCount: 160, configuredRouteCount: 317, valid: true }),
        reportDrift: async () => ({
          generatedAt: '2026-08-30T00:00:00.000Z',
          issues: [],
          truncated: false,
          summary: { blocker: 0, warning: 0, expected: 0 },
        }),
        probeTransactions: async () => ({ available: true }),
        getReleaseEvidence: () =>
          ({
            ...completeReleaseEvidence,
            performance: { ...completeReleaseEvidence.performance, ...performance },
          }) as never,
      }).getReport(systemActor());
      return report.releaseGates.performance;
    }
    const base = completeReleaseEvidence.performance;
    assert.equal(await performanceGate({ baselineP95Ms: Number.NaN }), false);
    assert.equal(await performanceGate({ baselineP95Ms: Number.POSITIVE_INFINITY }), false);
    assert.equal(await performanceGate({ baselineP95Ms: -1 }), false);
    assert.equal(await performanceGate({ baselineP99Ms: base.baselineP95Ms - 1 }), false);
    assert.equal(await performanceGate({ observedOverheadP95Ms: base.maximumOverheadP95Ms + 1 }), false);
    assert.equal(await performanceGate({ observedOverheadP99Ms: base.maximumOverheadP99Ms + 1 }), false);
    assert.equal(await performanceGate({ baselineQueryCount: 1.5 }), false);
    assert.equal(await performanceGate({ maximumQueryCount: -1 }), false);
    assert.equal(await performanceGate({ observedQueryCount: base.maximumQueryCount + 1 }), false);
    assert.equal(await performanceGate({ observedQueryCount: Number.NaN }), false);
    assert.equal(await performanceGate({ baselineQueryCount: undefined }), false);
  });

  it('requires configured route coverage at or above the contract route count', async () => {
    async function routeValidity(routes: { routeCount: number; configuredRouteCount: number; valid: boolean }) {
      const report = await new Services.AuthorizationReadinessService({
        now: () => new Date('2026-08-30T00:00:00.000Z'),
        getMode: () => 'shadow',
        getRegistry: () => registry,
        validateRoutes: () => routes,
        reportDrift: async () => ({
          generatedAt: '2026-08-30T00:00:00.000Z',
          issues: [],
          truncated: false,
          summary: { blocker: 0, warning: 0, expected: 0 },
        }),
        probeTransactions: async () => ({ available: true }),
        getReleaseEvidence: () => completeReleaseEvidence,
      }).getReport(systemActor());
      return report;
    }
    const uncovered = await routeValidity({ routeCount: 160, configuredRouteCount: 100, valid: true });
    assert.equal(uncovered.routes.valid, false);
    assert.equal(
      uncovered.blockers.some(blocker => blocker.code === 'authorization-readiness.route-declarations-invalid'),
      true
    );
    const covered = await routeValidity({ routeCount: 160, configuredRouteCount: 317, valid: true });
    assert.equal(
      covered.blockers.some(blocker => blocker.code === 'authorization-readiness.route-declarations-invalid'),
      false
    );
  });

  it('getOperatorReport builds the privileged system-process context internally', async () => {
    const createSystemProcessContext = sinon
      .stub(AuthorizationServices.AuthorizationService.prototype, 'createSystemProcessContext')
      .resolves(systemActor());
    Reflect.set(globalThis, 'BrandingConfig', { find: () => queryResult([{ id: 'brand-1' }]) });
    Reflect.set(globalThis, 'User', {
      find: () =>
        queryResult([
          { id: 'brand-admin', accountLinkState: 'active' },
          { id: 'system-admin', accountLinkState: 'active' },
          { id: 'system-admin-2', accountLinkState: 'active' },
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
          {
            id: 'system-assignment-2',
            role: 'system-admin-role',
            branding: null,
            principalId: 'system-admin-2',
            status: 'active',
            sourcePresent: true,
          },
        ]),
    });
    try {
      const report = await new Services.AuthorizationReadinessService({
        now: () => new Date('2026-08-30T00:00:00.000Z'),
        getMode: () => 'shadow',
        getRegistry: () => registry,
        validateRoutes: () => ({ routeCount: 160, configuredRouteCount: 317, valid: true }),
        reportDrift: async () => ({
          generatedAt: '2026-08-30T00:00:00.000Z',
          issues: [],
          truncated: false,
          summary: { blocker: 0, warning: 0, expected: 0 },
        }),
        probeTransactions: async () => ({ available: true }),
        getReleaseEvidence: () => completeReleaseEvidence,
      }).getOperatorReport();

      assert.equal(
        createSystemProcessContext.calledWith('authorization-readiness', undefined, ['system.authorization.manage']),
        true
      );
      assert.equal(report.readyForEnforce, true);
      assert.equal(report.blockers.length, 0);
    } finally {
      createSystemProcessContext.restore();
      for (const name of ['BrandingConfig', 'User', 'RoleAssignment']) {
        Reflect.deleteProperty(globalThis, name);
      }
    }
  });

  it('consumes persisted bootstrap invariant issues as readiness blockers', async () => {
    const config = sailsConfig() ?? {};
    if ((globalThis as { sails?: unknown }).sails === undefined) {
      Reflect.set(globalThis, 'sails', { config, log: {}, services: {}, models: {} });
    }
    (sailsConfig() as Record<string, unknown>).authorizationReadiness = {
      issues: [{ code: 'protected-guest-identity-drift', severity: 'blocker', entityType: 'role', entityId: 'role-1' }],
    };
    const report = await service().getReport(systemActor());
    assert.ok(
      report.blockers.some(b => b.code === 'authorization-readiness.bootstrap-invariants-blocked'),
      `persisted bootstrap blocker must gate readiness, got ${JSON.stringify(report.blockers.map(b => b.code))}`
    );
    assert.equal(report.readyForEnforce, false);
  });

  it('getOperatorReport is exported to the operator command surface', async () => {
    const exported = new Services.AuthorizationReadinessService().exports();
    assert.equal('getOperatorReport' in exported, true);
    assert.equal('getReport' in exported, true);
  });
});
