import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { asScopeKey, createScopeRegistry } from '../../src/authorization';
import {
  Services,
  type AuthorizationAssignmentSourceRecord,
  type AuthorizationBrandSourceRecord,
  type AuthorizationRoleScopeOverrideSourceRecord,
  type AuthorizationRoleSourceRecord,
  type AuthorizationServiceDependencies,
  type AuthorizationTemplateRevisionSourceRecord,
  type AuthorizationUserSourceRecord,
} from '../../src/services/AuthorizationService';

const BRAND_A = 'brand-a';
const BRAND_B = 'brand-b';
const NOW = new Date('2026-08-28T12:00:00.000Z');

interface QueryCounts {
  users: number;
  assignments: number;
  roles: number;
  revisions: number;
  overrides: number;
  recordAcl: number;
}

interface FixtureState {
  assignments: AuthorizationAssignmentSourceRecord[];
}

function fixture() {
  const registry = createScopeRegistry([
    {
      sourceType: 'core',
      sourcePackage: '@researchdatabox/redbox-core',
      sourceVersion: 'test',
      definitions: [
        {
          key: asScopeKey('authorization.explain'),
          label: 'Explain',
          description: 'Explain decisions.',
          risk: 'admin',
        },
        {
          key: asScopeKey('authorization.self.read'),
          label: 'Self',
          description: 'Read own authority.',
          risk: 'read',
        },
        {
          key: asScopeKey('portal.home.read'),
          label: 'Home',
          description: 'Read home.',
          risk: 'read',
        },
        {
          key: asScopeKey('record.read'),
          label: 'Record read',
          description: 'Read records.',
          risk: 'read',
        },
        {
          key: asScopeKey('record.read.all'),
          label: 'Record read all',
          description: 'Bypass record read ACLs.',
          risk: 'admin',
        },
        {
          key: asScopeKey('record.update'),
          label: 'Record update',
          description: 'Update records.',
          risk: 'write',
        },
        {
          key: asScopeKey('record.legacy-read'),
          label: 'Legacy record read',
          description: 'Deprecated record scope.',
          risk: 'read',
          deprecated: true,
          replacementKey: asScopeKey('record.read'),
        },
        {
          key: asScopeKey('system.authorization.manage'),
          label: 'System authorization',
          description: 'Manage system authorization.',
          risk: 'system',
        },
      ],
    },
  ]);
  const brands: AuthorizationBrandSourceRecord[] = [
    { id: BRAND_A, name: 'Brand A' },
    { id: BRAND_B, name: 'Brand B' },
  ];
  const users: AuthorizationUserSourceRecord[] = [
    {
      id: 'alias',
      username: 'alias-user',
      linkedPrimaryUserId: 'primary',
      accountLinkState: 'linked-alias',
    },
    { id: 'primary', username: 'primary-user', accountLinkState: 'active' },
    { id: 'ordinary', username: 'ordinary-user', accountLinkState: 'active' },
    { id: 'disabled', username: 'disabled-user', loginDisabled: true, accountLinkState: 'active' },
  ];
  const roles: AuthorizationRoleSourceRecord[] = [
    {
      id: 'guest-a',
      name: 'Guest',
      key: 'Guest',
      displayName: 'Guest label',
      branding: BRAND_A,
      contextType: 'brand',
      template: 'template-guest',
      templateRevision: 1,
      protectedKind: 'guest',
      status: 'active',
    },
    {
      id: 'guest-b',
      name: 'Guest',
      key: 'Guest',
      branding: BRAND_B,
      contextType: 'brand',
      template: 'template-guest',
      templateRevision: 1,
      protectedKind: 'guest',
      status: 'active',
    },
    {
      id: 'researcher-a',
      name: 'Researcher',
      key: 'Researcher',
      displayName: 'Mutable researcher label',
      branding: BRAND_A,
      contextType: 'brand',
      template: 'template-researcher',
      templateRevision: 1,
      protectedKind: 'none',
      status: 'active',
    },
    {
      id: 'inactive-a',
      name: 'Inactive',
      key: 'Inactive',
      branding: BRAND_A,
      contextType: 'brand',
      protectedKind: 'none',
      status: 'inactive',
    },
    {
      id: 'wrong-b',
      name: 'WrongBrand',
      key: 'WrongBrand',
      branding: BRAND_B,
      contextType: 'brand',
      template: 'template-researcher',
      templateRevision: 1,
      protectedKind: 'none',
      status: 'active',
    },
    {
      id: 'missing-revision',
      name: 'MissingTemplate',
      key: 'MissingTemplate',
      branding: BRAND_A,
      contextType: 'brand',
      template: 'template-missing',
      templateRevision: 7,
      protectedKind: 'none',
      status: 'active',
    },
    {
      id: 'system-admin',
      name: 'system-admin',
      key: 'system-admin',
      displayName: 'System administrator',
      contextType: 'system',
      template: 'template-system',
      templateRevision: 1,
      protectedKind: 'system-admin',
      status: 'active',
    },
  ];
  const revisions: AuthorizationTemplateRevisionSourceRecord[] = [
    {
      id: 'revision-guest',
      template: 'template-guest',
      revision: 1,
      scopeKeys: ['authorization.self.read', 'portal.home.read'],
    },
    {
      id: 'revision-researcher',
      template: 'template-researcher',
      revision: 1,
      scopeKeys: ['record.read', 'record.legacy-read'],
    },
    {
      id: 'revision-system',
      template: 'template-system',
      revision: 1,
      scopeKeys: ['authorization.explain', 'record.read', 'record.read.all', 'system.authorization.manage'],
    },
  ];
  const overrides: AuthorizationRoleScopeOverrideSourceRecord[] = [
    { id: 'override-unsafe-guest', role: 'guest-a', scopeKey: 'record.update', effect: 'add' },
    { id: 'override-update', role: 'researcher-a', scopeKey: 'record.update', effect: 'add' },
    { id: 'override-missing', role: 'researcher-a', scopeKey: 'record.publish', effect: 'add' },
  ];
  const state: FixtureState = {
    assignments: [
      {
        id: 'researcher-manual',
        principalId: 'primary',
        role: 'researcher-a',
        branding: BRAND_A,
        source: 'manual',
        sourceKey: 'manual-1',
        status: 'active',
        sourcePresent: true,
      },
      {
        id: 'researcher-external',
        principalId: 'primary',
        role: 'researcher-a',
        branding: BRAND_A,
        source: 'external',
        sourceKey: 'group-1',
        status: 'active',
        sourcePresent: true,
      },
      {
        id: 'inactive-role-assignment',
        principalId: 'primary',
        role: 'inactive-a',
        branding: BRAND_A,
        source: 'manual',
        sourceKey: 'manual-inactive',
        status: 'active',
        sourcePresent: true,
      },
      {
        id: 'wrong-brand-assignment',
        principalId: 'primary',
        role: 'wrong-b',
        branding: BRAND_B,
        source: 'manual',
        sourceKey: 'manual-wrong-brand',
        status: 'active',
        sourcePresent: true,
      },
      {
        id: 'missing-revision-assignment',
        principalId: 'primary',
        role: 'missing-revision',
        branding: BRAND_A,
        source: 'manual',
        sourceKey: 'manual-missing-revision',
        status: 'active',
        sourcePresent: true,
      },
      {
        id: 'system-assignment',
        principalId: 'primary',
        role: 'system-admin',
        source: 'recovery',
        sourceKey: 'bootstrap',
        status: 'active',
        sourcePresent: true,
      },
      {
        id: 'expired-at-boundary',
        principalId: 'primary',
        role: 'researcher-a',
        branding: BRAND_A,
        source: 'external',
        sourceKey: 'expired',
        status: 'active',
        sourcePresent: true,
        expiresAt: NOW,
      },
      {
        id: 'locally-suppressed',
        principalId: 'primary',
        role: 'researcher-a',
        branding: BRAND_A,
        source: 'external',
        sourceKey: 'suppressed',
        status: 'active',
        sourcePresent: true,
        suppressedAt: new Date('2026-08-28T11:00:00.000Z'),
      },
      {
        id: 'ordinary-researcher',
        principalId: 'ordinary',
        role: 'researcher-a',
        branding: BRAND_A,
        source: 'manual',
        sourceKey: 'ordinary',
        status: 'active',
        sourcePresent: true,
      },
    ],
  };
  const counts: QueryCounts = { users: 0, assignments: 0, roles: 0, revisions: 0, overrides: 0, recordAcl: 0 };
  const dependencies: AuthorizationServiceDependencies = {
    now: () => new Date(NOW),
    getRegistry: () => registry,
    async resolveBrand(identifier) {
      return brands.find(brand => String(brand.id) === identifier || brand.name === identifier);
    },
    async findUser(identifier) {
      counts.users += 1;
      return users.find(user => String(user.id) === identifier || user.username === identifier);
    },
    async findAssignments(principalId, brandId) {
      counts.assignments += 1;
      return state.assignments.filter(
        assignment =>
          assignment.principalId === principalId &&
          (assignment.branding === undefined || String(assignment.branding) === brandId)
      );
    },
    async findRoles(roleIds, brandId) {
      counts.roles += 1;
      const ids = new Set(roleIds);
      return roles.filter(
        role =>
          ids.has(String(role.id)) ||
          (role.contextType === 'brand' &&
            role.protectedKind === 'guest' &&
            role.status === 'active' &&
            String(role.branding) === brandId)
      );
    },
    async findTemplateRevisions(references) {
      counts.revisions += 1;
      return revisions.filter(revision =>
        references.some(
          reference => reference.templateId === String(revision.template) && reference.revision === revision.revision
        )
      );
    },
    async findRoleScopeOverrides(roleIds) {
      counts.overrides += 1;
      const ids = new Set(roleIds);
      return overrides.filter(override => ids.has(String(override.role)));
    },
    readRequestTokenScopeCeiling(req) {
      const authInfo = req.authInfo as { scopeKeys?: readonly string[] } | undefined;
      return authInfo?.scopeKeys;
    },
    recordBrandId(record) {
      const metaMetadata = record.metaMetadata as { brandId?: string } | undefined;
      return metaMetadata?.brandId;
    },
    recordAclAllows() {
      counts.recordAcl += 1;
      return true;
    },
  };
  return { service: new Services.AuthorizationService(dependencies), counts, state, roles };
}

function request(overrides: Partial<Sails.Req> = {}): Sails.Req {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    session: { branding: BRAND_A, portal: 'rdmp' } as Sails.Req['session'],
    isAuthenticated: (() => false) as Sails.Req['isAuthenticated'],
    ...overrides,
  } as Sails.Req;
}

describe('AuthorizationService', () => {
  it('canonicalizes users and resolves additive Guest, brand, and system authority in bounded queries', async () => {
    const { service, counts } = fixture();

    const context = await service.resolveUserContext('alias', BRAND_A, 'session');

    assert.equal(context.principal.userId, 'primary');
    assert.equal(context.principal.username, 'primary-user');
    assert.equal(context.principal.category, 'system-admin');
    assert.deepEqual(context.roleKeys, ['Guest', 'Researcher', 'system-admin']);
    assert.equal(context.roles.find(role => role.key === 'Guest')?.implicit, true);
    assert.deepEqual(
      context.roles.find(role => role.key === 'Researcher')?.assignments.map(assignment => assignment.assignmentId),
      ['researcher-external', 'researcher-manual']
    );
    assert.deepEqual(context.effectiveScopeKeys, [
      'authorization.explain',
      'authorization.self.read',
      'portal.home.read',
      'record.read',
      'record.read.all',
      'record.update',
      'system.authorization.manage',
    ]);
    assert.deepEqual(context.resolutionEvidence.expiredAssignmentIds, ['expired-at-boundary']);
    assert.deepEqual(context.resolutionEvidence.ignoredAssignmentIds, ['locally-suppressed']);
    assert.deepEqual(context.resolutionEvidence.inactiveRoleIds, ['inactive-a']);
    assert.deepEqual(context.resolutionEvidence.missingTemplateRevisionRoleIds, ['missing-revision']);
    assert.deepEqual(context.resolutionEvidence.inactiveScopeKeys, ['record.legacy-read']);
    assert.deepEqual(context.resolutionEvidence.missingScopeKeys, ['record.publish']);
    assert.deepEqual(context.resolutionEvidence.rejectedScopeKeys, ['record.update']);
    assert.equal(counts.assignments, 1);
    assert.equal(counts.roles, 1);
    assert.equal(counts.revisions, 1);
    assert.equal(counts.overrides, 1);
    assert.equal(Object.isFrozen(context), true);
  });

  it('applies token ceilings last and preserves the token-specific denial reason', async () => {
    const { service } = fixture();
    const context = await service.resolveUserContext('primary', BRAND_A, 'bearer', ['record.read']);

    assert.deepEqual(context.grantedScopeKeys.includes(asScopeKey('system.authorization.manage')), true);
    assert.deepEqual(context.effectiveScopeKeys, ['record.read']);
    assert.equal(
      service.authorizeAction(context, asScopeKey('system.authorization.manage')).reasonCode,
      'token-scope-ceiling'
    );
    assert.equal(service.hasScope(context, asScopeKey('record.read.all')), false);
  });

  it('fails closed for disabled principals, inactive roles, and missing template revisions', async () => {
    const { service } = fixture();
    const disabled = await service.resolveUserContext('disabled', BRAND_A, 'session');

    assert.equal(disabled.principal.active, false);
    assert.equal(
      service.authorizeAction(disabled, asScopeKey('authorization.self.read')).reasonCode,
      'principal-inactive'
    );
    assert.deepEqual(disabled.roles, []);
    assert.deepEqual(disabled.effectiveScopeKeys, []);
    assert.equal(service.hasScope(disabled, asScopeKey('authorization.self.read')), false);
  });

  it('keeps cross-brand entity denials opaque and composes record ACL and broad-scope gates', async () => {
    const { service, counts } = fixture();
    const context = await service.resolveUserContext('primary', BRAND_A, 'session');
    const record = {
      metaMetadata: { brandId: BRAND_A },
      authorization: { view: [], edit: [], viewRoles: [], editRoles: [] },
    };

    assert.equal(
      service.authorizeBrandEntity(context, asScopeKey('record.read'), BRAND_B).reasonCode,
      'resource-not-found'
    );
    assert.equal((await service.authorizeRecord(context, asScopeKey('record.read'), record, 'read')).allowed, true);
    assert.equal(counts.recordAcl, 0, 'record.read.all must satisfy only the ACL gate without calling the adapter');

    const ceilingContext = await service.resolveUserContext('primary', BRAND_A, 'bearer', ['record.read']);
    assert.equal(
      (await service.authorizeRecord(ceilingContext, asScopeKey('record.read'), record, 'read')).allowed,
      true
    );
    assert.equal(counts.recordAcl, 1);
    assert.equal(
      (
        await service.authorizeRecord(
          ceilingContext,
          asScopeKey('record.read'),
          { ...record, metaMetadata: { brandId: BRAND_B } },
          'read'
        )
      ).reasonCode,
      'resource-not-found'
    );
    assert.equal(counts.recordAcl, 1, 'cross-brand records must be rejected before ACL evaluation');

    const guest = await service.resolveRequestContext(request());
    assert.deepEqual(guest.effectiveScopeKeys, ['authorization.self.read', 'portal.home.read']);
    assert.deepEqual(guest.resolutionEvidence.rejectedScopeKeys, ['record.update']);
    // The Guest baseline has no `record.read`, so every entity gate denies identically.
    // A caller that fails the action gate must not be able to distinguish a cross-brand
    // identifier from an in-brand one by its reason code.
    assert.equal(service.authorizeBrandEntity(guest, asScopeKey('record.read'), BRAND_B).reasonCode, 'scope-missing');
    assert.equal(
      (
        await service.authorizeRecord(
          guest,
          asScopeKey('record.read'),
          { ...record, metaMetadata: { brandId: BRAND_B } },
          'read'
        )
      ).reasonCode,
      'scope-missing'
    );
    assert.equal(
      (await service.authorizeRecord(guest, asScopeKey('record.read'), record, 'read')).reasonCode,
      'scope-missing'
    );
  });

  it('ignores request-body branding, overwrites stale request roles, and memoizes only one request', async () => {
    const { service, counts, state } = fixture();
    const firstReq = request({
      body: { branding: BRAND_B },
      user: { id: 'ordinary', username: 'ordinary-user', roles: [{ id: 'stale-admin' }], token: 'secret' },
    });
    const first = await service.resolveRequestContext(firstReq);
    const repeated = await service.resolveRequestContext(firstReq);

    assert.equal(first, repeated);
    assert.equal(first.brand?.id, BRAND_A);
    assert.deepEqual(
      (firstReq.user?.roles as Array<{ key: string }>).map(role => role.key),
      ['Guest', 'Researcher']
    );
    assert.equal(firstReq.user?.token, undefined);
    assert.equal(counts.assignments, 1);

    state.assignments = state.assignments.filter(assignment => assignment.id !== 'ordinary-researcher');
    const second = await service.resolveRequestContext(
      request({ user: { id: 'ordinary', username: 'ordinary-user', roles: [{ id: 'stale-admin' }] } })
    );
    assert.deepEqual(second.roleKeys, ['Guest']);
    assert.equal(counts.assignments, 2, 'a new request must observe assignment revocation');
  });

  it('binds authority to the route brand ahead of session, query, and body values', async () => {
    const { service } = fixture();
    const req = request({
      params: { branding: BRAND_B, portal: 'rdmp' },
      query: { branding: BRAND_A },
      body: { branding: BRAND_A },
      session: { branding: BRAND_A, portal: 'rdmp' } as Sails.Req['session'],
      user: { id: 'ordinary', username: 'ordinary-user' },
      authorizationAuthMethod: 'session',
    });

    const context = await service.resolveRequestContext(req);

    assert.equal(context.brand?.requestedIdentifier, BRAND_B);
    assert.equal(context.brand?.id, BRAND_B);
    assert.deepEqual(context.roleKeys, ['Guest']);
  });

  it('treats a server-resolved explicit bearer as authoritative over serialized session state', async () => {
    const { service } = fixture();
    const sessionRequest = request({
      headers: { authorization: 'Bearer invalid-or-irrelevant' },
      session: {
        branding: BRAND_A,
        portal: 'rdmp',
        passport: { user: 'ordinary' },
      } as unknown as Sails.Req['session'],
      user: { id: 'ordinary', username: 'ordinary-user' },
      authInfo: { scopeKeys: [] },
      authorizationAuthMethod: 'bearer',
    });

    const context = await service.resolveRequestContext(sessionRequest);

    assert.equal(context.principal.authMethod, 'bearer');
    assert.deepEqual(context.tokenScopeCeiling, []);
    assert.equal(service.hasScope(context, asScopeKey('record.read')), false);
  });

  it('treats a presented bearer without a resolved user as inactive and grants no Guest baseline', async () => {
    const { service } = fixture();
    const context = await service.resolveRequestContext(request({ headers: { authorization: 'Bearer invalid' } }));

    assert.equal(context.principal.authMethod, 'bearer');
    assert.equal(context.principal.active, false);
    assert.deepEqual(context.roles, []);
    assert.deepEqual(context.effectiveScopeKeys, []);
  });

  it('keeps the trusted system-process factory off request service exports and constrains system context scopes', async () => {
    const { service } = fixture();
    const exported = service.exports();
    assert.equal(exported.createSystemProcessContext, undefined);

    const systemContext = await service.createSystemProcessContext('catalog-reconcile', undefined, [
      'system.authorization.manage',
      'record.read',
    ]);
    assert.equal(systemContext.contextType, 'system');
    assert.deepEqual(systemContext.effectiveScopeKeys, ['system.authorization.manage']);
    assert.equal(service.authorizeAction(systemContext, asScopeKey('system.authorization.manage')).allowed, true);

    const brandJob = await service.createSystemProcessContext('brand-export', BRAND_A, ['record.read']);
    assert.equal(service.authorizeAction(brandJob, asScopeKey('record.read')).allowed, true);

    const constrainedBrandJob = await service.createSystemProcessContext('brand-reconcile', BRAND_A, [
      'record.read',
      'system.authorization.manage',
    ]);
    assert.deepEqual(constrainedBrandJob.effectiveScopeKeys, ['record.read']);

    const invalidBrandJob = await service.createSystemProcessContext('missing-brand', 'unknown-brand', ['record.read']);
    assert.deepEqual(invalidBrandJob.effectiveScopeKeys, []);
    assert.equal(service.hasScope(invalidBrandJob, asScopeKey('record.read')), false);
  });

  it('reveals provenance only through a same-brand actor with authorization.explain', async () => {
    const { service, counts } = fixture();
    const ordinary = await service.resolveUserContext('ordinary', BRAND_A, 'session');
    const denied = await service.explainDecision(ordinary, 'primary', BRAND_A, asScopeKey('record.read'), {
      brandId: BRAND_B,
    });
    assert.equal(denied.explained, false);

    const administrator = await service.resolveUserContext('primary', BRAND_A, 'session');
    const explained = await service.explainDecision(administrator, 'ordinary', BRAND_A, asScopeKey('record.read'), {
      brandId: BRAND_B,
    });
    assert.equal(explained.explained, true);
    if (explained.explained) {
      assert.equal(explained.decision.reasonCode, 'resource-brand-mismatch');
      assert.equal(explained.decision.evidence?.resourceBrandMatches, false);
      assert.deepEqual(explained.projection.scopeProvenance.find(item => item.scopeKey === 'record.read')?.roleKeys, [
        'Researcher',
      ]);
    }
    assert.equal(
      counts.recordAcl,
      0,
      'explanation consumes caller-supplied resource evidence and performs no object lookup'
    );

    const brandJob = await service.createSystemProcessContext('brand-explain', BRAND_A, ['authorization.explain']);
    const crossBrandJobExplanation = await service.explainDecision(
      brandJob,
      'ordinary',
      BRAND_B,
      asScopeKey('record.read')
    );
    assert.equal(crossBrandJobExplanation.explained, false);
    assert.equal(crossBrandJobExplanation.decision.reasonCode, 'resource-not-found');
  });

  it('deduplicates a large multi-source assignment fixture without per-role or per-scope queries', async () => {
    const { service, state, counts } = fixture();
    for (let index = 0; index < 250; index += 1) {
      state.assignments.push({
        id: `bulk-${index}`,
        principalId: 'ordinary',
        role: 'researcher-a',
        branding: BRAND_A,
        source: 'external',
        sourceKey: `group-${index}`,
        status: 'active',
        sourcePresent: true,
      });
    }

    const context = await service.resolveUserContext('ordinary', BRAND_A, 'session');

    assert.deepEqual(context.roleKeys, ['Guest', 'Researcher']);
    assert.equal(context.roles.find(role => role.key === 'Researcher')?.assignmentCount, 251);
    assert.equal(context.roles.find(role => role.key === 'Researcher')?.assignments.length, 100);
    assert.equal(context.roles.find(role => role.key === 'Researcher')?.assignmentsTruncated, true);
    assert.equal(counts.assignments, 1);
    assert.equal(counts.roles, 1);
    assert.equal(counts.revisions, 1);
    assert.equal(counts.overrides, 1);
  });
});
