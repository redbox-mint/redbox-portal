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
import * as AuthorizationActorIssuer from '../../src/services/AuthorizationActorIssuer';
import {
  computeAuthorizationReleaseEvidenceFingerprint,
  defaultSummarizeShadow,
  MAX_SHADOW_SUMMARY_GROUPS,
  resolveAuthorizationRuntimeIdentity,
  Services,
  type AuthorizationReadinessDependencies,
} from '../../src/services/AuthorizationReadinessService';
import { authorizationReadinessSchema } from '../../src/api-routes/schemas/authorization';
import type { AuthorizationReleaseEvidence } from '../../src/config/authorization.config';
import { ALL_SHADOW_CLASSIFICATION_FIXTURES } from '../fixtures/authorization-shadow-classification.fixtures';

interface ShadowReadinessRow {
  resolvedAt?: string | null;
  remediationStatus?: string | null;
  remediationEvidenceFingerprint?: string | null;
  remediationVerifiedAt?: string | null;
  resolutionClassification?: string | null;
}

interface ShadowReadinessModel {
  createEach(rows: readonly ShadowReadinessRow[]): Promise<unknown>;
  destroy(criteria: object): Promise<unknown>;
  count(criteria: object): Promise<number>;
}

interface ShadowReadinessOrm {
  registerModel(model: unknown): void;
  initialize(
    options: object,
    done: (error: Error | undefined, ontology: { collections: { mismatch: ShadowReadinessModel } }) => void
  ): void;
  teardown(done: (error?: Error) => void): void;
}

// Real Waterline normalization and adapter evaluation: a count stub that
// ignores criteria would miss Mongo operators and approval false positives.
async function withShadowReadinessModel(work: (model: ShadowReadinessModel) => Promise<void>): Promise<void> {
  const Waterline = require('waterline') as {
    new (): ShadowReadinessOrm;
    Collection: { extend(definition: object): unknown };
  };
  const orm = new Waterline();
  orm.registerModel(
    Waterline.Collection.extend({
      identity: 'mismatch',
      datastore: 'default',
      primaryKey: 'id',
      attributes: {
        id: { type: 'number', autoMigrations: { autoIncrement: true } },
        resolvedAt: { type: 'string', allowNull: true },
        remediationStatus: { type: 'string', allowNull: true },
        remediationEvidenceFingerprint: { type: 'string', allowNull: true },
        remediationVerifiedAt: { type: 'string', allowNull: true },
        resolutionClassification: { type: 'string', allowNull: true },
      },
    })
  );
  const model = await new Promise<ShadowReadinessModel>((resolve, reject) => {
    orm.initialize(
      {
        adapters: { 'sails-disk': require('sails-disk') },
        datastores: { default: { adapter: 'sails-disk', inMemoryOnly: true } },
      },
      (error, ontology) => (error ? reject(error) : resolve(ontology.collections.mismatch))
    );
  });
  try {
    await work(model);
  } finally {
    await new Promise<void>((resolve, reject) => orm.teardown(error => (error ? reject(error) : resolve())));
  }
}

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

const completeReleaseEvidenceBase = {
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
} as const;

const completeReleaseEvidence = {
  ...completeReleaseEvidenceBase,
  durableFingerprint: computeAuthorizationReleaseEvidenceFingerprint(completeReleaseEvidenceBase as never) as string,
} as const;

function emptyShadowSummary() {
  return Promise.resolve({
    byRoute: [],
    byReason: [],
    byBrand: [],
    byClassification: [],
    truncated: false,
  });
}

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

  function service(overrides: Partial<AuthorizationReadinessDependencies> = {}) {
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
      getCollectionEvidenceGap: () => false,
      probeTransactions: async () => ({ available: true }),
      getReleaseEvidence: () => completeReleaseEvidence,
      summarizeShadow: () => emptyShadowSummary(),
      getRuntimeIdentity: () => ({ buildVersion: '1.2.3', instanceId: 'instance-1' }),
      ...overrides,
    });
  }

  it('keeps collection failures, missing probes and telemetry loss visible as an evidence-gap blocker', async () => {
    for (const getCollectionEvidenceGap of [
      () => true,
      () => {
        throw new Error('probe unavailable');
      },
    ]) {
      const report = await service({ getCollectionEvidenceGap }).getOperatorReport();
      assert.equal(report.readyForEnforce, false);
      assert.ok(report.blockers.some(finding => finding.code === 'authorization-readiness.collection-evidence-gap'));
    }
  });

  it('reports complete exposure as a warning and blocks an incomplete or failed exposure scan', async () => {
    const exposure = {
      complete: true,
      incompleteReasons: [] as const,
      affectedUserCount: 1,
      affectedRoleCount: 1,
      affectedCapabilityCount: 1,
      items: [
        {
          userId: 'u',
          roleId: 'r',
          roleKey: 'Custom',
          scopeKeys: ['record.read'],
          temporaryLegacyRoleAssessment: 'required' as const,
        },
      ],
    };
    for (const complete of [true, false]) {
      const subject = service({
        reportRollbackExposure: async () => ({
          ...exposure,
          complete,
          incompleteReasons: complete ? [] : ['assignments-limit'],
        }),
      });
      const report = await subject.getReport(systemActor());
      assert.equal(report.rollbackExposure.complete, complete);
      assert.ok(report.warnings.some(row => row.code === 'authorization-readiness.rollback-custom-scope-exposure'));
      assert.equal(
        report.blockers.some(row => row.code === 'authorization-readiness.rollback-exposure-incomplete'),
        !complete
      );
      assert.equal(authorizationReadinessSchema.safeParse(report).success, true);
    }
    const subject = service({
      reportRollbackExposure: async () => {
        throw new Error('offline');
      },
    });
    const report = await subject.getReport(systemActor());
    assert.deepEqual(report.rollbackExposure.incompleteReasons, ['query-failed']);
    assert.ok(report.blockers.some(row => row.code === 'authorization-readiness.rollback-exposure-incomplete'));
  });

  it('counts only verified remediation closures as nonblocking with real Waterline normalization', async () => {
    await withShadowReadinessModel(async model => {
      Reflect.set(globalThis, 'AuthorizationShadowMismatch', model);
      const closed = {
        resolvedAt: null,
        resolutionClassification: 'mapping-defect',
        remediationStatus: 'verified',
        remediationEvidenceFingerprint: 'a'.repeat(64),
        remediationVerifiedAt: '2026-01-01T00:00:00.000Z',
      };
      for (const [patch, expected] of [
        [{}, 0],
        [{ remediationStatus: null }, 1],
        [{ remediationEvidenceFingerprint: null }, 1],
        [{ remediationVerifiedAt: null }, 1],
        [{ remediationEvidenceFingerprint: '' }, 1],
        [{ remediationVerifiedAt: '' }, 1],
        [{ resolutionClassification: 'unknown' }, 1],
        [{ resolutionClassification: null }, 1],
      ] as const) {
        await model.destroy({});
        await model.createEach([{ ...closed, ...patch }]);
        const report = await service().getReport(systemActor());
        assert.equal(report.shadow.unresolvedMismatchCount, expected, JSON.stringify(patch));
      }
    });
  });

  it('counts unresolved and unapproved historic rows with real Waterline criteria, without counting legacy approvals', async () => {
    Reflect.set(globalThis, 'BrandingConfig', { find: () => queryResult([{ id: 'brand-1' }]) });
    Reflect.set(globalThis, 'User', {
      find: () =>
        queryResult(['brand-admin', 'system-admin', 'system-admin-2'].map(id => ({ id, accountLinkState: 'active' }))),
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
          ...['system-admin', 'system-admin-2'].map(principalId => ({
            id: principalId,
            role: 'system-admin-role',
            branding: null,
            principalId,
            status: 'active',
            sourcePresent: true,
          })),
        ]),
    });
    await withShadowReadinessModel(async model => {
      Reflect.set(globalThis, 'AuthorizationShadowMismatch', model);
      const rows: ShadowReadinessRow[] = [];
      let expectedTotal = 0;
      for (const { classification, resolves } of ALL_SHADOW_CLASSIFICATION_FIXTURES) {
        for (const resolvedAt of [undefined, null, '2026-01-01T00:00:00.000Z']) {
          await model.destroy({});
          const row = { resolutionClassification: classification, ...(resolvedAt === undefined ? {} : { resolvedAt }) };
          await model.createEach([row]);
          const expected = resolvedAt == null || !resolves ? 1 : 0;
          const report = await service().getReport(systemActor());
          assert.equal(report.shadow.unresolvedMismatchCount, expected, `${classification}, resolvedAt=${resolvedAt}`);
          assert.equal(
            report.blockers.some(blocker => blocker.code === 'authorization-readiness.unresolved-shadow-mismatches'),
            expected > 0
          );
          assert.equal(report.readyForEnforce, expected === 0, `${classification} readiness`);
          rows.push(row);
          expectedTotal += expected;
        }
      }
      for (const resolutionClassification of [undefined, null, '', 'unknown-legacy-label']) {
        await model.destroy({});
        const row = {
          resolvedAt: '2026-01-01T00:00:00.000Z',
          ...(resolutionClassification === undefined ? {} : { resolutionClassification }),
        };
        await model.createEach([row]);
        const report = await service().getReport(systemActor());
        assert.equal(report.shadow.unresolvedMismatchCount, 1, `unapproved classification ${resolutionClassification}`);
        rows.push(row);
        expectedTotal += 1;
      }
      await model.destroy({});
      await model.createEach(rows);
      const report = await service().getReport(systemActor());
      assert.equal(report.shadow.unresolvedMismatchCount, expectedTotal, 'mixed rows count each blocker exactly once');
    });
  });

  function readinessService(
    overrides: Partial<ConstructorParameters<typeof Services.AuthorizationReadinessService>[0]> = {}
  ) {
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
      getCollectionEvidenceGap: () => false,
      probeTransactions: async () => ({ available: true }),
      getReleaseEvidence: () => completeReleaseEvidence,
      summarizeShadow: () => emptyShadowSummary(),
      getRuntimeIdentity: () => ({ buildVersion: '1.2.3', instanceId: 'instance-1' }),
      ...overrides,
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
      getCollectionEvidenceGap: () => false,
      probeTransactions: async () => ({ available: false, code: 'authorization.transaction-unavailable' }),
      getReleaseEvidence: () => completeReleaseEvidence,
      summarizeShadow: () => emptyShadowSummary(),
      getRuntimeIdentity: () => ({ buildVersion: '1.2.3', instanceId: 'instance-1' }),
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
      getCollectionEvidenceGap: () => false,
      probeTransactions: async () => ({ available: true }),
      getReleaseEvidence: () => undefined,
      summarizeShadow: () => emptyShadowSummary(),
      getRuntimeIdentity: () => ({ buildVersion: '1.2.3', instanceId: 'instance-1' }),
    }).getReport(systemActor());

    assert.equal(report.readyForEnforce, false);
    assert.deepEqual(report.releaseGates, {
      navigationParity: false,
      approvedSecurityDifferences: false,
      performance: false,
      identity: {
        complete: true,
        buildVersion: '1.2.3',
        instanceId: 'instance-1',
        match: true,
      },
      shadowWindow: false,
      rollback: false,
      approvals: { product: false, security: false, operations: false, hookOwners: false, integrators: false },
      durableFingerprint: false,
    });
    // Runtime-derived identity is observed from the deployment, not from
    // operator evidence: with no expected values to compare, an observed
    // runtime identity satisfies the identity gate while every
    // evidence-backed gate still blocks.
    assert.deepEqual(report.deploymentIdentity, {
      complete: true,
      buildVersion: '1.2.3',
      instanceId: 'instance-1',
    });
    assert.deepEqual(
      report.blockers.map(blocker => blocker.code),
      [
        'authorization-readiness.navigation-parity-evidence-missing',
        'authorization-readiness.security-differences-approval-missing',
        'authorization-readiness.performance-evidence-missing',
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
      getCollectionEvidenceGap: () => false,
      probeTransactions: async () => ({ available: true }),
      getReleaseEvidence: () => completeReleaseEvidence,
      summarizeShadow: () => emptyShadowSummary(),
      getRuntimeIdentity: () => ({ buildVersion: '1.2.3', instanceId: 'instance-1' }),
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

  describe('release evidence timestamps', () => {
    const reportTime = '2026-08-30T00:00:00.000Z';

    beforeEach(() => {
      Reflect.set(globalThis, 'BrandingConfig', { find: () => queryResult([{ id: 'brand-1' }]) });
      Reflect.set(globalThis, 'User', {
        find: () =>
          queryResult(
            ['brand-admin', 'system-admin', 'system-admin-2'].map(id => ({ id, accountLinkState: 'active' }))
          ),
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
            ...['system-admin', 'system-admin-2'].map(principalId => ({
              id: principalId,
              role: 'system-admin-role',
              branding: null,
              principalId,
              status: 'active',
              sourcePresent: true,
            })),
          ]),
      });
    });

    async function reportWithEvidence(evidence: AuthorizationReleaseEvidence) {
      // A valid bundle hash must not hide timestamp failures behind a fingerprint blocker.
      const durableFingerprint = computeAuthorizationReleaseEvidenceFingerprint(evidence);
      assert.equal(typeof durableFingerprint, 'string');
      const now = sinon.stub<[], Date>().returns(new Date('2099-01-01T00:00:00.000Z'));
      now.onFirstCall().returns(new Date(reportTime));
      const report = await service({
        now,
        getReleaseEvidence: () => ({ ...evidence, durableFingerprint }),
      }).getReport(systemActor());
      sinon.assert.calledOnce(now);
      assert.equal(report.generatedAt, reportTime);
      assert.equal(report.releaseGates.durableFingerprint, true);
      assert.equal(authorizationReadinessSchema.safeParse(report).success, true);
      return report;
    }

    const approvalCases = [
      ...(
        [
          ['navigationParity', 'navigation-parity-evidence-missing'],
          ['approvedSecurityDifferences', 'security-differences-approval-missing'],
          ['performance', 'performance-evidence-missing'],
          ['shadowWindow', 'shadow-window-evidence-missing'],
          ['rollback', 'rollback-rehearsal-evidence-missing'],
        ] as const
      ).map(([gate, blocker]) => ({
        gate,
        blocker,
        evidence: (approvedAt: string): AuthorizationReleaseEvidence => ({
          ...completeReleaseEvidenceBase,
          [gate]: { ...completeReleaseEvidenceBase[gate], approvedAt },
        }),
      })),
      ...(['product', 'security', 'operations', 'hookOwners', 'integrators'] as const).map(gate => ({
        gate,
        blocker: 'release-approvals-missing',
        evidence: (approvedAt: string): AuthorizationReleaseEvidence => ({
          ...completeReleaseEvidenceBase,
          approvals: {
            ...completeReleaseEvidenceBase.approvals,
            [gate]: { ...approvedEvidence, approvedAt },
          },
        }),
      })),
    ];

    for (const { gate, blocker, evidence } of approvalCases) {
      it(`retains the ${gate} blocker for future approvals with a valid fingerprint`, async () => {
        for (const approvedAt of ['2026-08-30T00:00:00.001Z', '2099-01-01T00:00:00.000Z']) {
          const report = await reportWithEvidence(evidence(approvedAt));
          assert.equal(report.readyForEnforce, false, approvedAt);
          assert.deepEqual(report.blockers, [{ code: `authorization-readiness.${blocker}`, count: 1 }], approvedAt);
        }
      });
    }

    it('preserves historical approvals and approvals exactly at the sampled report time for every gate', async () => {
      for (const { gate, evidence } of approvalCases) {
        for (const approvedAt of [approvedEvidence.approvedAt, reportTime]) {
          const report = await reportWithEvidence(evidence(approvedAt));
          assert.equal(report.readyForEnforce, true, `${gate}: ${approvedAt}`);
          assert.deepEqual(report.blockers, []);
        }
      }
    });

    for (const [scenario, startedAt, completedAt] of [
      ['missing completion', '2026-08-27T00:00:00.000Z', undefined],
      ['empty completion', '2026-08-27T00:00:00.000Z', ''],
      ['invalid completion', '2026-08-27T00:00:00.000Z', 'invalid'],
      ['invalid start', 'invalid', '2026-08-29T00:00:00.000Z'],
      ['unfinished window', '2026-08-27T00:00:00.000Z', '2026-08-30T00:00:00.001Z'],
      ['future completion', '2026-08-27T00:00:00.000Z', '2099-01-03T00:00:00.000Z'],
      ['future window', '2099-01-01T00:00:00.000Z', '2099-01-03T00:00:00.000Z'],
      ['reversed window', '2026-08-29T00:00:00.000Z', '2026-08-27T00:00:00.000Z'],
      ['zero duration', reportTime, reportTime],
      ['short window', '2026-08-29T12:00:00.000Z', reportTime],
    ] as const) {
      it(`retains the shadow-window blocker for ${scenario} with a valid fingerprint`, async () => {
        const evidence: AuthorizationReleaseEvidence = {
          ...completeReleaseEvidenceBase,
          shadowWindow: { ...completeReleaseEvidenceBase.shadowWindow, startedAt, completedAt: completedAt ?? '' },
        };
        if (completedAt === undefined) Reflect.deleteProperty(evidence.shadowWindow!, 'completedAt');
        const report = await reportWithEvidence(evidence);
        assert.equal(report.readyForEnforce, false);
        assert.equal(report.releaseGates.shadowWindow, false);
        assert.deepEqual(report.blockers, [
          { code: 'authorization-readiness.shadow-window-evidence-missing', count: 1 },
        ]);
      });
    }

    it('accepts a shadow window completed at the sampled report time with the exact minimum duration', async () => {
      const report = await reportWithEvidence({
        ...completeReleaseEvidenceBase,
        shadowWindow: {
          ...completeReleaseEvidenceBase.shadowWindow,
          startedAt: '2026-08-29T00:00:00.000Z',
          completedAt: reportTime,
        },
      });
      assert.equal(report.readyForEnforce, true);
      assert.equal(report.releaseGates.shadowWindow, true);
      assert.deepEqual(report.blockers, []);
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
        getCollectionEvidenceGap: () => false,
        probeTransactions: async () => ({ available: true }),
        getReleaseEvidence: () =>
          ({
            ...completeReleaseEvidence,
            performance: { ...completeReleaseEvidence.performance, ...performance },
          }) as never,
        summarizeShadow: () => emptyShadowSummary(),
        getRuntimeIdentity: () => ({ buildVersion: '1.2.3', instanceId: 'instance-1' }),
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
        getCollectionEvidenceGap: () => false,
        probeTransactions: async () => ({ available: true }),
        getReleaseEvidence: () => completeReleaseEvidence,
        summarizeShadow: () => emptyShadowSummary(),
        getRuntimeIdentity: () => ({ buildVersion: '1.2.3', instanceId: 'instance-1' }),
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
      .stub(AuthorizationActorIssuer, 'createSystemProcessContextInternal')
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
        getCollectionEvidenceGap: () => false,
        probeTransactions: async () => ({ available: true }),
        getReleaseEvidence: () => completeReleaseEvidence,
        summarizeShadow: () => emptyShadowSummary(),
        getRuntimeIdentity: () => ({ buildVersion: '1.2.3', instanceId: 'instance-1' }),
      }).getOperatorReport();

      assert.equal(createSystemProcessContext.firstCall.args[1], 'authorization-readiness');
      assert.equal(createSystemProcessContext.firstCall.args[2], undefined);
      assert.deepEqual(createSystemProcessContext.firstCall.args[3], ['system.authorization.manage']);
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

  it('resolves runtime identity from build environment signals and the OS hostname', async () => {
    assert.deepEqual(
      resolveAuthorizationRuntimeIdentity({}, () => 'host-a'),
      { instanceId: 'host-a' }
    );
    assert.deepEqual(
      resolveAuthorizationRuntimeIdentity({}, () => ''),
      {}
    );
    assert.deepEqual(resolveAuthorizationRuntimeIdentity({ REDBOX_BUILD_VERSION: ' 9.9.9 ', HOSTNAME: 'host-b' }), {
      buildVersion: '9.9.9',
      instanceId: 'host-b',
    });
    assert.deepEqual(
      resolveAuthorizationRuntimeIdentity(
        { REDBOX_BUILD_VERSION: 'from-redbox', BUILD_VERSION: 'from-build', APP_VERSION: 'from-app' },
        () => 'host-c'
      ),
      { buildVersion: 'from-redbox', instanceId: 'host-c' }
    );
    assert.deepEqual(
      resolveAuthorizationRuntimeIdentity(
        { BUILD_VERSION: 'from-build', REDBOX_INSTANCE_ID: 'explicit-instance' },
        () => 'host-d'
      ),
      { buildVersion: 'from-build', instanceId: 'explicit-instance' }
    );
    assert.deepEqual(
      resolveAuthorizationRuntimeIdentity({ REDBOX_BUILD_VERSION: 'x'.repeat(129) }, () => {
        throw new Error('hostname unavailable');
      }),
      {},
      'overlong build versions and hostname failures must report missing identity, not throw or fake values'
    );
  });

  it('does not treat operator-supplied identity as deployment evidence without a runtime signal', async () => {
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
    const report = await readinessService({ getRuntimeIdentity: () => ({}) }).getReport(systemActor());
    assert.deepEqual(report.deploymentIdentity, { complete: false });
    assert.equal(report.releaseGates.identity.complete, false);
    assert.equal(report.releaseGates.identity.match, false);
    assert.equal(report.releaseGates.identity.expectedBuildVersion, '1.2.3');
    assert.equal(report.releaseGates.identity.expectedInstanceId, 'instance-1');
    assert.ok(
      report.blockers.some(blocker => blocker.code === 'authorization-readiness.deployment-identity-missing'),
      `operator-supplied identity must not satisfy the gate without runtime identity, got ${JSON.stringify(report.releaseGates.identity)}`
    );
    assert.equal(report.readyForEnforce, false);
  });

  it('blocks when expected deployment values disagree with the observed runtime identity', async () => {
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
    const report = await readinessService({
      getRuntimeIdentity: () => ({ buildVersion: '9.9.9', instanceId: 'other-instance' }),
    }).getReport(systemActor());
    assert.equal(report.deploymentIdentity.complete, true);
    assert.deepEqual(report.deploymentIdentity, {
      complete: true,
      buildVersion: '9.9.9',
      instanceId: 'other-instance',
    });
    assert.equal(report.releaseGates.identity.complete, false);
    assert.equal(report.releaseGates.identity.match, false);
    assert.equal(report.releaseGates.identity.buildVersion, '9.9.9');
    assert.equal(report.releaseGates.identity.expectedBuildVersion, '1.2.3');
    assert.ok(
      report.blockers.some(blocker => blocker.code === 'authorization-readiness.deployment-identity-missing'),
      'an expected/runtime identity mismatch must block enforce readiness'
    );
    assert.equal(report.readyForEnforce, false);
  });

  it('reports runtime deployment identity alongside mode and registry generation', async () => {
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
    const report = await readinessService().getReport(systemActor());
    assert.equal(report.mode, 'shadow');
    assert.equal(report.registry.generation, registry.generation);
    assert.deepEqual(report.deploymentIdentity, {
      complete: true,
      buildVersion: '1.2.3',
      instanceId: 'instance-1',
    });
    assert.deepEqual(report.releaseGates.identity, {
      complete: true,
      buildVersion: '1.2.3',
      instanceId: 'instance-1',
      expectedBuildVersion: '1.2.3',
      expectedInstanceId: 'instance-1',
      match: true,
    });
    assert.equal(report.readyForEnforce, true);
  });

  it('samples the runtime identity once and reuses the observation for deployment identity and release gates', async () => {
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
    let observations = 0;
    const report = await readinessService({
      getRuntimeIdentity: () => {
        observations += 1;
        return { buildVersion: '1.2.3', instanceId: 'instance-1' };
      },
    }).getReport(systemActor());
    assert.equal(observations, 1, `expected a single runtime identity observation, saw ${observations}`);
    assert.deepEqual(report.deploymentIdentity, {
      complete: true,
      buildVersion: '1.2.3',
      instanceId: 'instance-1',
    });
    assert.equal(report.releaseGates.identity.buildVersion, report.deploymentIdentity.buildVersion);
    assert.equal(report.releaseGates.identity.instanceId, report.deploymentIdentity.instanceId);
  });

  it('recomputes the complete canonical evidence fingerprint independent of key order', async () => {
    const fingerprint = computeAuthorizationReleaseEvidenceFingerprint(completeReleaseEvidenceBase as never);
    assert.ok(typeof fingerprint === 'string' && /^[a-f0-9]{64}$/u.test(fingerprint));
    assert.equal(completeReleaseEvidence.durableFingerprint, fingerprint);
    const reordered = JSON.parse(
      JSON.stringify(completeReleaseEvidenceBase, Object.keys(completeReleaseEvidenceBase).sort().reverse())
    ) as Record<string, unknown>;
    // Rebuild with reversed top-level key order: canonicalization must yield the same digest.
    const reversedBundle = {} as Record<string, unknown>;
    for (const key of Object.keys(completeReleaseEvidenceBase).reverse()) {
      reversedBundle[key] = (completeReleaseEvidenceBase as Record<string, unknown>)[key];
    }
    assert.equal(
      computeAuthorizationReleaseEvidenceFingerprint(reversedBundle as never),
      fingerprint,
      'canonical fingerprint must be stable regardless of key insertion order'
    );
    assert.equal(computeAuthorizationReleaseEvidenceFingerprint(undefined), undefined);
    void reordered;
  });

  it('invalidates the durable fingerprint on any bundle mutation', async () => {
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
    async function readinessWithEvidence(evidence: unknown) {
      return readinessService({ getReleaseEvidence: () => evidence as never }).getReport(systemActor());
    }
    const baseline = await readinessWithEvidence(completeReleaseEvidence);
    assert.equal(baseline.releaseGates.durableFingerprint, true);
    assert.equal(baseline.readyForEnforce, true);
    const mutated = JSON.parse(JSON.stringify(completeReleaseEvidence)) as Record<string, unknown>;
    ((mutated.performance as Record<string, unknown>).observedOverheadP95Ms as number) = 4;
    const mutatedReport = await readinessWithEvidence(mutated);
    assert.equal(
      mutatedReport.releaseGates.durableFingerprint,
      false,
      'mutating any bundled field without recomputing the fingerprint must fail the durable gate'
    );
    assert.ok(
      mutatedReport.blockers.some(b => b.code === 'authorization-readiness.durable-fingerprint-missing'),
      'stale fingerprint must surface a durable-fingerprint blocker'
    );
    assert.equal(mutatedReport.readyForEnforce, false);
    const tampered = { ...completeReleaseEvidence, durableFingerprint: 'c'.repeat(64) };
    const tamperedReport = await readinessWithEvidence(tampered);
    assert.equal(tamperedReport.releaseGates.durableFingerprint, false);
  });

  it('exposes bounded grouped shadow summaries without gating readiness', async () => {
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
    const summary = {
      byRoute: [{ key: 'GET /:branding/:portal/admin (AdminController#index)', count: 3 }],
      byReason: [{ key: 'scope-missing', count: 3 }],
      byBrand: [{ key: 'brand-1', count: 2 }],
      byClassification: [{ key: 'approved-security-difference', count: 1 }],
      truncated: true,
    };
    const report = await readinessService({
      summarizeShadow: async () => summary,
    }).getReport(systemActor());
    assert.deepEqual(report.shadow.byRoute, summary.byRoute);
    assert.deepEqual(report.shadow.byReason, summary.byReason);
    assert.deepEqual(report.shadow.byBrand, summary.byBrand);
    assert.deepEqual(report.shadow.byClassification, summary.byClassification);
    assert.equal(report.shadow.groupsTruncated, true);
    assert.equal(report.releaseGates.durableFingerprint, true);
    assert.equal(report.readyForEnforce, true);
    const failingSummary = await readinessService({
      summarizeShadow: async () => {
        throw new Error('datastore unavailable');
      },
    }).getReport(systemActor());
    assert.deepEqual(failingSummary.shadow.byRoute, []);
    assert.equal(failingSummary.shadow.groupsTruncated, true);
    assert.equal(failingSummary.shadow.unresolvedMismatchCount, 0);
    assert.equal(
      failingSummary.readyForEnforce,
      true,
      'a summarizer failure must fall back to empty summaries without blocking enforce'
    );
  });

  for (const failurePath of ['datastore-read', 'injected-summarizer'] as const) {
    it(`marks ${failurePath} evidence incomplete while preserving the independent readiness count`, async () => {
      let countCalls = 0;
      let readCalls = 0;
      Reflect.set(globalThis, 'AuthorizationShadowMismatch', {
        tableName: 'authorizationshadowmismatch',
        count: async () => {
          countCalls += 1;
          return 7;
        },
        getDatastore: () => ({
          manager: {
            collection: () => ({
              find: () => ({
                limit: () => ({
                  toArray: async () => {
                    readCalls += 1;
                    throw new Error('shadow read unavailable');
                  },
                }),
              }),
            }),
          },
        }),
      });
      const report = await readinessService({
        summarizeShadow:
          failurePath === 'datastore-read'
            ? defaultSummarizeShadow
            : async () => {
                throw new Error('injected summarizer failed');
              },
      }).getReport(systemActor());
      assert.equal(countCalls, 1);
      assert.equal(readCalls, failurePath === 'datastore-read' ? 2 : 0);
      assert.deepEqual(report.shadow, {
        unresolvedMismatchCount: 7,
        byRoute: [],
        byReason: [],
        byBrand: [],
        byClassification: [],
        groupsTruncated: true,
      });
      assert.equal(report.readyForEnforce, false);
      assert.equal(
        report.blockers.find(blocker => blocker.code === 'authorization-readiness.unresolved-shadow-mismatches')?.count,
        7
      );
      assert.equal(authorizationReadinessSchema.safeParse(report).success, true);
    });
  }

  it('reports a successful empty datastore summary as complete', async () => {
    Reflect.set(globalThis, 'AuthorizationShadowMismatch', {
      tableName: 'authorizationshadowmismatch',
      getDatastore: () => ({
        manager: {
          collection: () => ({ find: () => ({ limit: () => ({ toArray: async () => [] }) }) }),
        },
      }),
    });
    assert.deepEqual(await defaultSummarizeShadow(), {
      byRoute: [],
      byReason: [],
      byBrand: [],
      byClassification: [],
      truncated: false,
    });
  });

  it('validates bounded grouped shadow summaries against the readiness schema', async () => {
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
    const report = await readinessService({
      summarizeShadow: async () => ({
        byRoute: [{ key: 'route-1', count: 2 }],
        byReason: [{ key: 'scope-missing', count: 2 }],
        byBrand: [{ key: 'brand-1', count: 2 }],
        byClassification: [{ key: 'needs-investigation', count: 1 }],
        truncated: false,
      }),
    }).getReport(systemActor());
    const parsed = authorizationReadinessSchema.safeParse(JSON.parse(JSON.stringify(report)));
    assert.equal(parsed.success, true, `grouped summary report must satisfy schema: ${JSON.stringify(parsed.error)}`);
    const oversized = {
      ...JSON.parse(JSON.stringify(report)),
      shadow: {
        ...JSON.parse(JSON.stringify(report.shadow)),
        byRoute: Array.from({ length: 21 }, (_, index) => ({ key: `route-${index}`, count: 1 })),
      },
    };
    assert.equal(
      authorizationReadinessSchema.safeParse(oversized).success,
      false,
      'more than 20 groups must fail schema'
    );
    const emptyKey = {
      ...JSON.parse(JSON.stringify(report)),
      shadow: {
        ...JSON.parse(JSON.stringify(report.shadow)),
        byReason: [{ key: '', count: 1 }],
      },
    };
    assert.equal(authorizationReadinessSchema.safeParse(emptyKey).success, false, 'empty group keys must fail schema');
  });

  it('reports truncation when the 20-group cap discards a distinct group while keeping output bounded', async () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'AuthorizationShadowMismatch');
    const unresolvedRows = Array.from({ length: MAX_SHADOW_SUMMARY_GROUPS + 5 }, (_value, index) => ({
      routeId: `route-${String(index).padStart(2, '0')}`,
      reasonCode: 'scope-missing',
      brandId: 'brand-1',
    }));
    const resolvedRows: Array<Record<string, unknown>> = [];
    Reflect.set(globalThis, 'AuthorizationShadowMismatch', {
      tableName: 'authorizationshadowmismatch',
      getDatastore: () => ({
        manager: {
          collection: () => ({
            find: (filter: Record<string, unknown>) => ({
              limit: () => ({
                toArray: async () =>
                  filter !== null && typeof filter === 'object' && Object.hasOwn(filter as object, '$and')
                    ? [...unresolvedRows]
                    : [...resolvedRows],
              }),
            }),
          }),
        },
      }),
    });
    try {
      const summary = await defaultSummarizeShadow();
      assert.equal(summary.byRoute.length, MAX_SHADOW_SUMMARY_GROUPS);
      assert.equal(summary.truncated, true);
      assert.ok(
        summary.byRoute.every(group => group.count >= 1),
        'bounded groups must retain valid counts'
      );
      const parsed = authorizationReadinessSchema.safeParse(
        JSON.parse(
          JSON.stringify({
            generatedAt: '2026-08-30T00:00:00.000Z',
            mode: 'shadow',
            readyForEnforce: true,
            registry: { generation: 'test', declaredScopeCount: 1, persistedScopeCount: 1, orphanedScopeCount: 0 },
            routes: { routeCount: 1, configuredRouteCount: 1, valid: true },
            migration: { name: 'test', completed: true, driftTruncated: false, blockerCount: 0, warningCount: 0 },
            transactions: { available: true },
            rollbackExposure: {
              complete: true,
              incompleteReasons: [],
              affectedUserCount: 0,
              affectedRoleCount: 0,
              affectedCapabilityCount: 0,
              items: [],
            },
            shadow: {
              unresolvedMismatchCount: unresolvedRows.length,
              byRoute: summary.byRoute,
              byReason: summary.byReason,
              byBrand: summary.byBrand,
              byClassification: summary.byClassification,
              groupsTruncated: summary.truncated,
            },
            deploymentIdentity: { complete: true, buildVersion: '1.2.3', instanceId: 'instance-1' },
            administrators: {
              brandCount: 1,
              brandsWithoutAdministratorCount: 0,
              brandsWithoutAdministrator: [],
              systemAdministratorCount: 2,
              requiredSystemAdministratorCount: 2,
            },
            releaseGates: {
              navigationParity: true,
              approvedSecurityDifferences: true,
              performance: true,
              identity: { complete: true, match: true },
              shadowWindow: true,
              rollback: true,
              approvals: { product: true, security: true, operations: true, hookOwners: true, integrators: true },
              durableFingerprint: true,
            },
            blockers: [],
            warnings: [],
          })
        )
      );
      assert.equal(parsed.success, true, 'bounded truncated summary must satisfy the readiness schema');
    } finally {
      if (saved === undefined) Reflect.deleteProperty(globalThis, 'AuthorizationShadowMismatch');
      else Object.defineProperty(globalThis, 'AuthorizationShadowMismatch', saved);
    }
  });

  it('reports truncation when resolved classifications exceed the group cap', async () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'AuthorizationShadowMismatch');
    const resolvedRows = Array.from({ length: MAX_SHADOW_SUMMARY_GROUPS + 1 }, (_value, index) => ({
      resolutionClassification: `classification-${String(index).padStart(2, '0')}`,
    }));
    Reflect.set(globalThis, 'AuthorizationShadowMismatch', {
      tableName: 'authorizationshadowmismatch',
      getDatastore: () => ({
        manager: {
          collection: () => ({
            find: (filter: Record<string, unknown>) => ({
              limit: () => ({
                toArray: async () =>
                  filter !== null && typeof filter === 'object' && Object.hasOwn(filter as object, '$and')
                    ? []
                    : [...resolvedRows],
              }),
            }),
          }),
        },
      }),
    });
    try {
      const summary = await defaultSummarizeShadow();
      assert.equal(summary.byClassification.length, MAX_SHADOW_SUMMARY_GROUPS);
      assert.equal(summary.truncated, true);
    } finally {
      if (saved === undefined) Reflect.deleteProperty(globalThis, 'AuthorizationShadowMismatch');
      else Object.defineProperty(globalThis, 'AuthorizationShadowMismatch', saved);
    }
  });
});
