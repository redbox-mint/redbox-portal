describe('Authorization Phase 3 migration and bootstrap', function () {
  this.timeout(60_000);

  const suffix = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  async function bootstrapAdmin() {
    const admin = await User.findOne({ username: 'admin' });
    expect(admin).to.exist;
    return admin;
  }

  it('establishes fresh protected state and reruns without duplicate catalog or assignments', async () => {
    const admin = await bootstrapAdmin();
    await AuthorizationScopeService.bootstrap();

    // The first run may legitimately do work — for example creating a Guest role for a
    // brand an earlier test introduced. Idempotency is a property of the rerun, so the
    // baseline is captured once protected state has converged.
    const first = await AuthorizationBootstrapService.bootstrap({ bootstrapUser: admin });
    const before = {
      scopes: await AuthorizationScope.count(),
      templates: await RoleTemplate.count(),
      revisions: await RoleTemplateRevision.count(),
      roles: await Role.count(),
      assignments: await RoleAssignment.count(),
    };
    const second = await AuthorizationBootstrapService.bootstrap({ bootstrapUser: admin });

    expect(first.issues.filter((issue: { severity: string }) => issue.severity === 'blocker')).to.deep.equal([]);
    expect(second.guestRolesCreated).to.equal(0);
    expect(second.systemRoleCreated).to.equal(false);
    expect(second.systemAssignmentCreated).to.equal(false);
    expect(await AuthorizationScope.count()).to.equal(before.scopes);
    expect(await RoleTemplate.count()).to.equal(before.templates);
    expect(await RoleTemplateRevision.count()).to.equal(before.revisions);
    expect(await Role.count()).to.equal(before.roles);
    expect(await RoleAssignment.count()).to.equal(before.assignments);

    const guest = await Role.find({ protectedKind: 'guest', status: 'active' });
    const system = await Role.find({ protectedKind: 'system-admin', contextType: 'system', status: 'active' });
    expect(guest).to.have.length(1);
    expect(system).to.have.length(1);
    expect(await RoleAssignment.count({ role: system[0].id, principalId: admin.id, status: 'active' })).to.equal(1);
  });

  it('preserves configurable Guest scope overrides and strips only unsafe ones', async () => {
    const admin = await bootstrapAdmin();
    const defaultBrand = await BrandingConfig.findOne({ name: 'default' });
    expect(defaultBrand).to.exist;
    // Other suites create brands, and each gets its own Guest, so this must be scoped.
    const guest = await Role.findOne({ branding: defaultBrand.id, protectedKind: 'guest', status: 'active' });
    expect(guest).to.exist;

    const safeRemoval = await RoleScopeOverride.create({
      role: guest.id,
      scopeKey: 'portal.home.read',
      effect: 'remove',
      createdBy: 'phase3-test',
    }).fetch();
    const unsafeAddition = await RoleScopeOverride.create({
      role: guest.id,
      scopeKey: 'record.create',
      effect: 'add',
      createdBy: 'phase3-test',
    }).fetch();

    await AuthorizationBootstrapService.bootstrap({ bootstrapUser: admin });

    // An administrator's supported Guest configuration must survive a lift; an addition
    // outside the reviewed Guest allowlist must not.
    expect(await RoleScopeOverride.findOne({ id: safeRemoval.id })).to.exist;
    expect(await RoleScopeOverride.findOne({ id: unsafeAddition.id })).to.not.exist;

    await RoleScopeOverride.destroy({ id: safeRemoval.id });
  });

  it('writes no catalog audit events when the declared registry is unchanged', async () => {
    await AuthorizationScopeService.bootstrap();
    const before = await AuthorizationAudit.count({ targetType: 'authorization-scope' });
    const result = await AuthorizationScopeService.bootstrap();

    expect(result.scopesCreated).to.equal(0);
    expect(result.scopesUpdated).to.equal(0);
    expect(await AuthorizationAudit.count({ targetType: 'authorization-scope' })).to.equal(before);
  });

  it('migrates legacy multi-brand and linked-alias associations without renaming compatibility keys', async () => {
    const id = suffix();
    const brand = await BrandingConfig.create({ name: `phase3-${id}` }).fetch();
    const guest = await Role.create({ name: 'Guest', branding: brand.id }).fetch();
    const researcher = await Role.create({ name: `Research Team ${id}`, branding: brand.id }).fetch();
    const primary = await User.create({
      username: `primary-${id}`,
      password: 'test-password',
      type: 'local',
      name: 'Phase 3 Primary',
      email: `primary-${id}@example.test`,
    }).fetch();
    const alias = await User.create({
      username: `alias-${id}`,
      password: 'test-password',
      type: 'oidc',
      name: 'Phase 3 Alias',
      email: `alias-${id}@example.test`,
      linkedPrimaryUserId: primary.id,
      accountLinkState: 'linked-alias',
    }).fetch();
    await User.addToCollection(alias.id, 'roles').members([guest.id, researcher.id]);

    const recordsBefore = JSON.stringify(await Record.find({}));
    const rolesFirst = await AuthorizationMigrationService.reconcileBrandRoles(2);
    const assignmentsFirst = await AuthorizationMigrationService.migrateUserAssignments(2, [alias.id]);
    const assignmentsAfterFirst = await RoleAssignment.count({ source: 'migration' });
    const rolesSecond = await AuthorizationMigrationService.reconcileBrandRoles(2);
    const assignmentsSecond = await AuthorizationMigrationService.migrateUserAssignments(2, [alias.id]);

    const migratedRole = await Role.findOne({ id: researcher.id });
    const retainedAlias = await User.findOne({ id: alias.id }).populate('roles');
    expect(rolesFirst.rolesMigrated).to.be.greaterThan(0);
    expect(assignmentsFirst.assignmentsCreated).to.equal(1);
    expect(migratedRole.name).to.equal(`Research Team ${id}`);
    expect(migratedRole.key).to.equal(`Research Team ${id}`);
    expect(migratedRole.identityKey).to.equal(`brand:${brand.id}:Research Team ${id}`);
    expect(retainedAlias.roles.map((role: { id: string }) => role.id)).to.include(researcher.id);
    expect(await RoleAssignment.count({ principalId: primary.id, role: researcher.id, source: 'migration' })).to.equal(
      1
    );
    expect(await RoleAssignment.count({ role: guest.id })).to.equal(0);
    expect(rolesSecond.rolesMigrated).to.equal(0);
    expect(assignmentsSecond.assignmentsCreated).to.equal(0);
    expect(await RoleAssignment.count({ source: 'migration' })).to.equal(assignmentsAfterFirst);
    expect(JSON.stringify(await Record.find({}))).to.equal(recordsBefore);
  });

  it('does not orphan unseen hook scopes during startup and requires an exact generation to apply orphaning', async () => {
    const id = suffix();
    const key = `phase3-${id.replaceAll('.', '-')}.read`.toLowerCase();
    const created = await AuthorizationScope.create({
      key,
      namespace: key.split('.')[0],
      label: 'Rolling hook scope',
      description: 'Scope retained while application versions overlap.',
      risk: 'read',
      sourceType: 'hook',
      sourcePackage: `redbox-hook-${key.split('.')[0]}`,
      sourceVersion: 'old',
      status: 'active',
      lastSeenGeneration: 'old-generation',
      metadataVersion: 1,
    }).fetch();

    const startup = await AuthorizationScopeService.bootstrap();
    expect((await AuthorizationScope.findOne({ id: created.id })).status).to.equal('active');
    const preview = await AuthorizationScopeService.reconcileOrphans({ limit: 100 });
    expect(preview.impacts.map((impact: { key: string }) => impact.key)).to.include(key);
    let rejected = false;
    try {
      await AuthorizationScopeService.reconcileOrphans({ apply: true, expectedGeneration: 'stale', limit: 100 });
    } catch {
      rejected = true;
    }
    expect(rejected).to.equal(true);
    await AuthorizationScopeService.reconcileOrphans({
      apply: true,
      expectedGeneration: startup.generation,
      limit: 100,
    });
    expect((await AuthorizationScope.findOne({ id: created.id })).status).to.equal('orphaned');
  });
});
