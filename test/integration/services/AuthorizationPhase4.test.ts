import {
  asScopeKey,
  buildRoleIdentityKey,
  type AuthorizationContext,
} from '../../../packages/redbox-core/src/authorization';

describe('Authorization Phase 4 effective context and decision engine', function () {
  this.timeout(60_000);

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const roleKey = `phase4-${suffix}`;
  let brandA: { id: string; name: string };
  let brandB: { id: string; name: string };
  let role: { id: string; name: string; version: number };
  let user: { id: string; username: string };
  let assignmentIds: string[] = [];

  before(async () => {
    const admin = await User.findOne({ username: 'admin' });
    expect(admin).to.exist;
    await AuthorizationScopeService.bootstrap();

    brandA = await BrandingConfig.findOne({ name: 'default' });
    expect(brandA).to.exist;
    brandB = await BrandingConfig.create({ name: `phase4-brand-${suffix}` }).fetch();
    await BrandingService.refreshBrandingCache(brandB.id);
    await AuthorizationBootstrapService.bootstrap({ bootstrapUser: admin });

    const researcherTemplate = await RoleTemplate.findOne({ key: 'researcher' });
    expect(researcherTemplate).to.exist;
    role = await Role.create({
      name: roleKey,
      key: roleKey,
      identityKey: buildRoleIdentityKey('brand', roleKey, brandA.id),
      displayName: 'Phase 4 integration role',
      description: 'Role used to exercise effective authorization resolution.',
      contextType: 'brand',
      branding: brandA.id,
      template: researcherTemplate.id,
      templateRevision: 1,
      protectedKind: 'none',
      status: 'active',
      version: 1,
      createdBy: 'phase4-integration',
      updatedBy: 'phase4-integration',
    }).fetch();
    await RoleScopeOverride.create({
      role: role.id,
      scopeKey: 'record.update',
      effect: 'add',
      createdBy: 'phase4-integration',
    });
    await BrandingService.refreshBrandingCache(brandA.id);

    user = await User.create({
      username: `phase4-user-${suffix}`,
      password: 'phase4-test-password',
      type: 'local',
      name: 'Phase 4 User',
      email: `phase4-${suffix}@example.test`,
    }).fetch();
    const createdAssignments = await RoleAssignment.createEach([
      {
        principalType: 'user',
        principalId: user.id,
        role: role.id,
        branding: brandA.id,
        source: 'manual',
        sourceKey: 'phase4-manual',
        status: 'active',
        sourcePresent: true,
        assignedBy: 'phase4-integration',
        assignedAt: new Date(),
        version: 1,
      },
      {
        principalType: 'user',
        principalId: user.id,
        role: role.id,
        branding: brandA.id,
        source: 'external',
        sourceKey: 'phase4-group',
        status: 'active',
        sourcePresent: true,
        assignedBy: 'phase4-integration',
        assignedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        version: 1,
      },
    ]).fetch();
    assignmentIds = createdAssignments.map((assignment: { id: string }) => assignment.id);
  });

  after(async () => {
    if (assignmentIds.length > 0) await RoleAssignment.destroy({ id: assignmentIds });
    if (role?.id) {
      await RoleScopeOverride.destroy({ role: role.id });
      await Role.destroy({ id: role.id });
    }
    if (user?.id) await User.destroy({ id: user.id });
    if (brandB?.id) {
      await Role.destroy({ branding: brandB.id });
      await BrandingConfig.destroy({ id: brandB.id });
    }
  });

  it('resolves fresh multi-source brand authority, implicit Guest, token ceilings, and record decisions', async () => {
    const context = (await AuthorizationService.resolveUserContext(
      user.id,
      brandA.id,
      'session'
    )) as AuthorizationContext;
    const resolvedRole = context.roles.find(candidate => candidate.id === role.id);

    expect(resolvedRole).to.exist;
    expect(resolvedRole?.key).to.equal(roleKey);
    expect(resolvedRole?.assignments.map(assignment => assignment.source)).to.deep.equal(['manual', 'external']);
    expect(context.roles.some(candidate => candidate.protectedKind === 'guest' && candidate.implicit)).to.equal(true);
    expect(context.effectiveScopeKeys).to.include('record.read');
    expect(context.effectiveScopeKeys).to.include('record.update');
    expect(UsersService.hasRole({ roles: context.compatibilityRoles }, role)?.id).to.equal(role.id);

    const bearer = (await AuthorizationService.resolveUserContext(user.id, brandA.id, 'bearer', [
      'record.read',
    ])) as AuthorizationContext;
    expect(bearer.effectiveScopeKeys).to.deep.equal(['record.read']);
    expect(AuthorizationService.authorizeAction(bearer, asScopeKey('record.update')).reasonCode).to.equal(
      'token-scope-ceiling'
    );

    const record = {
      metaMetadata: { brandId: brandA.id },
      authorization: { view: [], edit: [], viewRoles: [roleKey], editRoles: [] },
    };
    expect(
      (await AuthorizationService.authorizeRecord(context, asScopeKey('record.read'), record, 'read')).allowed
    ).to.equal(true);
    expect(
      (
        await AuthorizationService.authorizeRecord(
          context,
          asScopeKey('record.read'),
          { ...record, metaMetadata: { brandId: brandB.id } },
          'read'
        )
      ).reasonCode
    ).to.equal('resource-not-found');
  });

  it('keeps brands isolated, applies system assignments in every brand, and observes revocation next request', async () => {
    const otherBrand = (await AuthorizationService.resolveUserContext(
      user.id,
      brandB.id,
      'session'
    )) as AuthorizationContext;
    expect(otherBrand.roleKeys).to.deep.equal(['Guest']);

    const admin = await User.findOne({ username: 'admin' });
    const systemContext = (await AuthorizationService.resolveUserContext(
      admin.id,
      brandB.id,
      'session'
    )) as AuthorizationContext;
    expect(systemContext.principal.category).to.equal('system-admin');
    expect(systemContext.roles.some(candidate => candidate.protectedKind === 'system-admin')).to.equal(true);
    expect(systemContext.effectiveScopeKeys).to.include('system.authorization.manage');

    await Role.updateOne({ id: role.id }).set({ displayName: 'Changed phase 4 label', version: 2 });
    const renamed = (await AuthorizationService.resolveUserContext(
      user.id,
      brandA.id,
      'session'
    )) as AuthorizationContext;
    expect(renamed.roles.find(candidate => candidate.id === role.id)?.key).to.equal(roleKey);

    for (const assignmentId of assignmentIds) {
      const current = await RoleAssignment.findOne({ id: assignmentId });
      await RoleAssignment.updateOne({ id: assignmentId }).set({
        status: 'revoked',
        revokedAt: new Date(),
        revokedBy: 'phase4-integration',
        version: current.version + 1,
      });
    }
    const afterRevocation = (await AuthorizationService.resolveUserContext(
      user.id,
      brandA.id,
      'session'
    )) as AuthorizationContext;
    expect(afterRevocation.roleKeys).to.deep.equal(['Guest']);
    expect(afterRevocation.effectiveScopeKeys).not.to.include('record.update');
  });
});
