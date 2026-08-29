import {
  asScopeKey,
  buildRoleIdentityKey,
  freezeAuthorizationContext,
  type AuthorizationContext,
} from '../../../packages/redbox-core/src/authorization';
import {
  authorizationAssignmentCatalogPageSchema,
  authorizationAssignmentMutationResultSchema,
  authorizationBulkAssignmentMutationSchema,
  authorizationBulkAssignmentPreviewSchema,
} from '../../../packages/redbox-core/src/api-routes';

describe('Authorization Phase 8.4 assignment contract services', function () {
  this.timeout(60_000);

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const roleKey = `phase84-role-${suffix}`.toLowerCase();
  const foreignRoleKey = `phase84-foreign-${suffix}`.toLowerCase();
  const requestIds: string[] = [];
  const userIds: string[] = [];
  let actor: AuthorizationContext;
  let otherBrandActor: AuthorizationContext;
  let restrictedActor: AuthorizationContext;
  let brand: { id: string };
  let otherBrand: { id: string; name: string };
  let role: { id: string; version: number };
  let foreignRole: { id: string };
  let systemRole: { id: string; key?: string; name: string };
  let otherBrandAdministratorRole: { id: string; key?: string; name: string };
  let user: { id: string };
  let bulkUser: { id: string };
  let invalidBatchUser: { id: string };
  let brandAdministratorUser: { id: string };

  const requestId = (operation: string): string => {
    const value = `phase84-${operation}-${suffix}`;
    requestIds.push(value);
    return value;
  };

  before(async () => {
    const admin = await User.findOne({ username: 'admin' });
    expect(admin).to.exist;
    await AuthorizationScopeService.bootstrap();
    brand = await BrandingConfig.findOne({ name: 'default' });
    expect(brand).to.exist;
    const defaultBrandAdministratorRole = await Role.findOne({
      branding: brand.id,
      contextType: 'brand',
      protectedKind: 'brand-admin',
    });
    expect(defaultBrandAdministratorRole).to.exist;
    otherBrand = await BrandingConfig.create({ name: `phase84-other-${suffix}` }).fetch();
    otherBrandAdministratorRole = await Role.create({
      name: defaultBrandAdministratorRole.name,
      key: defaultBrandAdministratorRole.key ?? defaultBrandAdministratorRole.name,
      identityKey: buildRoleIdentityKey(
        'brand',
        defaultBrandAdministratorRole.key ?? defaultBrandAdministratorRole.name,
        otherBrand.id
      ),
      displayName: defaultBrandAdministratorRole.displayName,
      description: defaultBrandAdministratorRole.description,
      contextType: 'brand',
      branding: otherBrand.id,
      template: defaultBrandAdministratorRole.template,
      templateRevision: defaultBrandAdministratorRole.templateRevision,
      protectedKind: 'brand-admin',
      status: 'active',
      version: 1,
      createdBy: 'phase84-fixture',
      updatedBy: 'phase84-fixture',
    }).fetch();
    await AuthorizationBootstrapService.bootstrap({ bootstrapUser: admin });
    actor = await AuthorizationService.resolveUserContext(admin.id, brand.id, 'session');
    otherBrandActor = freezeAuthorizationContext({
      ...actor,
      brand: {
        requestedIdentifier: otherBrand.name,
        id: otherBrand.id,
        name: otherBrand.name,
        exists: true,
        authorized: true,
      },
    });
    restrictedActor = freezeAuthorizationContext({
      ...actor,
      grantedScopeKeys: [asScopeKey('authorization.assignment.read'), asScopeKey('authorization.assignment.manage')],
      effectiveScopeKeys: [asScopeKey('authorization.assignment.read'), asScopeKey('authorization.assignment.manage')],
      scopeProvenance: [],
    });
    systemRole = await Role.findOne({ contextType: 'system', protectedKind: 'system-admin' });
    expect(systemRole).to.exist;
    const createdRole = await RoleAdministrationService.createRole({
      actor,
      brandId: brand.id,
      key: roleKey,
      displayName: 'Phase 8.4 assignment role',
      desiredScopeKeys: [],
      requestId: requestId('create-role'),
    });
    role = createdRole.data;
    foreignRole = await Role.create({
      name: foreignRoleKey,
      key: foreignRoleKey,
      identityKey: `brand:${otherBrand.id}:${foreignRoleKey}`,
      displayName: 'Foreign Phase 8.4 role',
      contextType: 'brand',
      branding: otherBrand.id,
      protectedKind: 'none',
      status: 'active',
      version: 1,
    }).fetch();
    const createUser = async (label: string) => {
      const created = await User.create({
        username: `phase84-${label}-${suffix}`,
        password: 'phase84-test-password',
        type: 'local',
        name: `Phase 8.4 ${label}`,
        email: `phase84-${label}-${suffix}@example.test`,
      }).fetch();
      userIds.push(created.id);
      return created;
    };
    user = await createUser('user');
    bulkUser = await createUser('bulk');
    invalidBatchUser = await createUser('invalid-batch');
    brandAdministratorUser = await createUser('brand-administrator');
    await RoleAssignment.create({
      principalType: 'user',
      principalId: user.id,
      role: foreignRole.id,
      branding: otherBrand.id,
      source: 'manual',
      sourceKey: 'manual',
      status: 'active',
      sourcePresent: true,
      assignedBy: 'phase84-fixture',
      assignedAt: new Date(),
      version: 1,
    });
  });

  after(async () => {
    for (const userId of userIds) {
      await User.removeFromCollection(userId, 'roles').members(
        [role?.id, foreignRole?.id, systemRole?.id, otherBrandAdministratorRole?.id].filter(Boolean)
      );
    }
    await RoleAssignment.destroy({ principalId: userIds });
    if (role?.id) {
      await RoleScopeOverride.destroy({ role: role.id });
      await Role.destroy({ id: role.id });
    }
    if (userIds.length) await User.destroy({ id: userIds });
    if (requestIds.length) await AuthorizationAudit.destroy({ requestId: requestIds });
    if (otherBrand?.id) {
      await Role.destroy({ branding: otherBrand.id });
      await BrandingConfig.destroy({ id: otherBrand.id });
    }
  });

  it('grants manual assignments idempotently, validates expiry, and dual-writes legacy membership', async () => {
    const expiresAt = '2099-01-01T00:00:00.000Z';
    const command = {
      actor,
      brandId: brand.id,
      principalId: user.id,
      roleKey,
      source: 'manual' as const,
      sourceKey: 'manual',
      expiresAt,
      requestId: requestId('grant'),
    };
    const granted = await RoleAdministrationService.grantAssignment(command);
    expect(granted.changed).to.equal(true);
    expect(granted.data).to.include({
      principalId: user.id,
      roleKey,
      source: 'manual',
      sourceKey: 'manual',
      status: 'active',
      sourcePresent: true,
      expiresAt,
      version: 1,
    });
    expect(granted.data.assignedAt).to.be.a('string');
    expect(authorizationAssignmentMutationResultSchema.safeParse(granted).success).to.equal(true);

    const unchanged = await RoleAdministrationService.grantAssignment({
      ...command,
      requestId: requestId('grant-idempotent'),
    });
    expect(unchanged).to.deep.include({ changed: false, version: 1 });
    expect(unchanged.data.id).to.equal(granted.data.id);
    expect(await RoleAssignment.count({ principalId: user.id, role: role.id, source: 'manual' })).to.equal(1);
    const populated = await User.findOne({ id: user.id }).populate('roles');
    expect(populated.roles.map((item: { id: string }) => item.id)).to.include(role.id);

    let invalidExpiry: { code?: string; status?: number } | undefined;
    try {
      await RoleAdministrationService.grantAssignment({
        ...command,
        expiresAt: '2000-01-01T00:00:00.000Z',
        requestId: requestId('grant-expired'),
      });
    } catch (error) {
      invalidExpiry = error as { code?: string; status?: number };
    }
    expect(invalidExpiry).to.deep.include({ code: 'authorization.invalid-role', status: 400 });
    expect((await RoleAssignment.findOne({ id: granted.data.id })).version).to.equal(1);
  });

  it('lists deterministically with filters while hiding foreign and unauthorized system contexts', async () => {
    const page = await RoleAdministrationService.listAssignments({
      actor,
      brandId: brand.id,
      principalId: user.id,
      roleKey,
      source: 'manual',
      status: 'active',
      sourcePresent: true,
      expiry: 'unexpired',
      limit: 10,
    });
    expect(page.items).to.have.length(1);
    expect(page.items[0]).to.include({ principalId: user.id, roleKey, brandId: brand.id });
    expect(page.items.some((item: { roleKey: string }) => item.roleKey === foreignRoleKey)).to.equal(false);
    expect(authorizationAssignmentCatalogPageSchema.safeParse(page).success).to.equal(true);

    const restrictedPage = await RoleAdministrationService.listAssignments({
      actor: restrictedActor,
      brandId: brand.id,
      limit: 100,
    });
    expect(restrictedPage.items.some((item: { roleKey: string }) => item.roleKey === 'system-admin')).to.equal(false);
    const systemPage = await RoleAdministrationService.listAssignments({ actor, brandId: brand.id, limit: 100 });
    expect(systemPage.items.some((item: { roleKey: string }) => item.roleKey === 'system-admin')).to.equal(true);

    let crossContext: { code?: string; status?: number } | undefined;
    try {
      await RoleAdministrationService.grantAssignment({
        actor: restrictedActor,
        principalId: user.id,
        roleKey: systemRole.key ?? systemRole.name,
        source: 'manual',
        sourceKey: 'manual',
        requestId: requestId('system-denied'),
      });
    } catch (error) {
      crossContext = error as { code?: string; status?: number };
    }
    expect(crossContext).to.deep.include({ code: 'authorization.not-found', status: 404 });

    const foreignAssignment = await RoleAssignment.findOne({ principalId: user.id, role: foreignRole.id });
    let systemCrossContext: { code?: string; status?: number } | undefined;
    try {
      await RoleAdministrationService.suppressAssignment({
        actor,
        brandId: brand.id,
        assignmentId: foreignAssignment.id,
        expectedVersion: foreignAssignment.version,
        requestId: requestId('system-foreign-suppress'),
      });
    } catch (error) {
      systemCrossContext = error as { code?: string; status?: number };
    }
    expect(systemCrossContext).to.deep.include({ code: 'authorization.not-found', status: 404 });

    const inconsistentAssignment = await RoleAssignment.create({
      principalType: 'user',
      principalId: invalidBatchUser.id,
      role: role.id,
      branding: otherBrand.id,
      source: 'external',
      sourceKey: `inconsistent-${suffix}`,
      status: 'active',
      sourcePresent: true,
      assignedBy: 'phase84-corrupt-fixture',
      assignedAt: new Date(),
      version: 1,
    }).fetch();
    let inconsistentContext: { code?: string; status?: number } | undefined;
    try {
      await RoleAdministrationService.suppressAssignment({
        actor,
        brandId: brand.id,
        assignmentId: inconsistentAssignment.id,
        expectedVersion: 999_999,
        requestId: requestId('inconsistent-assignment-context'),
      });
    } catch (error) {
      inconsistentContext = error as { code?: string; status?: number };
    }
    expect(inconsistentContext).to.deep.include({ code: 'authorization.not-found', status: 404 });
    expect(await RoleAssignment.findOne({ id: inconsistentAssignment.id })).to.include({
      status: 'active',
      version: 1,
    });
  });

  it('revokes only the manual source and preserves external suppression semantics', async () => {
    const external = await RoleAdministrationService.grantAssignment({
      actor,
      brandId: brand.id,
      principalId: user.id,
      roleKey,
      source: 'external',
      sourceKey: `oidc-${suffix}::researchers`,
      requestId: requestId('external-grant'),
    });
    const manual = await RoleAssignment.findOne({
      principalId: user.id,
      role: role.id,
      source: 'manual',
      sourceKey: 'manual',
    });
    const revoked = await RoleAdministrationService.revokeAssignment({
      actor,
      brandId: brand.id,
      principalId: user.id,
      roleKey,
      source: 'manual',
      sourceKey: 'manual',
      expectedVersion: manual.version,
      requestId: requestId('manual-revoke'),
    });
    expect(revoked.data.status).to.equal('revoked');
    let populated = await User.findOne({ id: user.id }).populate('roles');
    expect(populated.roles.map((item: { id: string }) => item.id)).to.include(role.id);

    const suppressed = await RoleAdministrationService.suppressAssignment({
      actor,
      brandId: brand.id,
      assignmentId: external.data.id,
      expectedVersion: external.version,
      requestId: requestId('external-suppress'),
    });
    expect(suppressed.data.status).to.equal('suppressed');
    populated = await User.findOne({ id: user.id }).populate('roles');
    expect(populated.roles.map((item: { id: string }) => item.id)).not.to.include(role.id);
    const unsuppressed = await RoleAdministrationService.unsuppressAssignment({
      actor,
      brandId: brand.id,
      assignmentId: external.data.id,
      expectedVersion: suppressed.version,
      requestId: requestId('external-unsuppress'),
    });
    expect(unsuppressed.data.status).to.equal('active');

    const suppressedWithoutProvider = await RoleAdministrationService.suppressAssignment({
      actor,
      brandId: brand.id,
      assignmentId: external.data.id,
      expectedVersion: unsuppressed.version,
      requestId: requestId('external-resuppress'),
    });
    const providerAbsent = await RoleAssignment.updateOne({
      id: external.data.id,
      version: suppressedWithoutProvider.version,
    }).set({ sourcePresent: false, version: suppressedWithoutProvider.version + 1 });
    const unsuppressedWithoutProvider = await RoleAdministrationService.unsuppressAssignment({
      actor,
      brandId: brand.id,
      assignmentId: external.data.id,
      expectedVersion: providerAbsent.version,
      requestId: requestId('external-unsuppress-provider-absent'),
    });
    expect(unsuppressedWithoutProvider.data).to.include({ status: 'revoked', sourcePresent: false });

    const foreignAssignment = await RoleAssignment.findOne({ principalId: user.id, role: foreignRole.id });
    let hidden: { code?: string; status?: number } | undefined;
    try {
      await RoleAdministrationService.suppressAssignment({
        actor,
        brandId: brand.id,
        assignmentId: foreignAssignment.id,
        expectedVersion: foreignAssignment.version,
        requestId: requestId('foreign-suppress'),
      });
    } catch (error) {
      hidden = error as { code?: string; status?: number };
    }
    expect(hidden).to.deep.include({ code: 'authorization.not-found', status: 404 });
  });

  it('protects the final effective system-administrator assignment', async () => {
    const administrator = await User.findOne({ username: 'admin' });
    const protectedAssignment = await RoleAssignment.findOne({
      principalId: administrator.id,
      role: systemRole.id,
      status: 'active',
    });
    expect(protectedAssignment).to.exist;

    let denied: { code?: string; status?: number } | undefined;
    try {
      await RoleAdministrationService.revokeAssignment({
        actor,
        principalId: administrator.id,
        roleKey: systemRole.key ?? systemRole.name,
        source: protectedAssignment.source,
        sourceKey: protectedAssignment.sourceKey,
        expectedVersion: protectedAssignment.version,
        requestId: requestId('final-system-admin'),
      });
    } catch (error) {
      denied = error as { code?: string; status?: number };
    }

    expect(denied).to.deep.include({ code: 'authorization.last-system-admin', status: 409 });
    const unchanged = await RoleAssignment.findOne({ id: protectedAssignment.id });
    expect(unchanged).to.include({ status: 'active', version: protectedAssignment.version });
  });

  it('protects the final effective brand-administrator assignment in its own brand', async () => {
    const granted = await RoleAdministrationService.grantAssignment({
      actor: otherBrandActor,
      brandId: otherBrand.id,
      principalId: brandAdministratorUser.id,
      roleKey: otherBrandAdministratorRole.key ?? otherBrandAdministratorRole.name,
      source: 'manual',
      sourceKey: 'manual',
      requestId: requestId('brand-admin-grant'),
    });
    const inconsistentQuorumAssignment = await RoleAssignment.create({
      principalType: 'user',
      principalId: invalidBatchUser.id,
      role: otherBrandAdministratorRole.id,
      branding: brand.id,
      source: 'external',
      sourceKey: `inconsistent-quorum-${suffix}`,
      status: 'active',
      sourcePresent: true,
      assignedBy: 'phase84-corrupt-fixture',
      assignedAt: new Date(),
      version: 1,
    }).fetch();

    let denied: { code?: string; status?: number } | undefined;
    try {
      await RoleAdministrationService.revokeAssignment({
        actor: otherBrandActor,
        brandId: otherBrand.id,
        principalId: brandAdministratorUser.id,
        roleKey: otherBrandAdministratorRole.key ?? otherBrandAdministratorRole.name,
        source: 'manual',
        sourceKey: 'manual',
        expectedVersion: granted.version,
        requestId: requestId('final-brand-admin'),
      });
    } catch (error) {
      denied = error as { code?: string; status?: number };
    }

    expect(denied).to.deep.include({ code: 'authorization.last-brand-admin', status: 409 });
    expect(await RoleAssignment.findOne({ id: granted.data.id })).to.include({ status: 'active', version: 1 });
    expect(await RoleAssignment.findOne({ id: inconsistentQuorumAssignment.id })).to.include({
      status: 'active',
      version: 1,
    });
  });

  it('applies a confirmed bulk batch atomically with row and batch audits, and rejects replay or partial failure', async () => {
    const rows = [{ action: 'grant' as const, principalId: bulkUser.id, roleKey }];
    const command = {
      actor,
      brandId: brand.id,
      rows,
      reason: 'Reviewed Phase 8.4 batch',
      requestId: requestId('bulk'),
    };
    const preview = await RoleAdministrationService.previewBulkAssignments(command);
    expect(preview).to.deep.include({ grantCount: 1, revokeCount: 0, noOpCount: 0, invalidCount: 0 });
    expect(preview.confirmationToken).to.be.a('string').and.not.empty;
    expect(authorizationBulkAssignmentPreviewSchema.safeParse(preview).success).to.equal(true);
    const applied = await RoleAdministrationService.applyBulkAssignments({
      ...command,
      confirmationToken: preview.confirmationToken,
    });
    expect(applied.data).to.deep.include({ appliedCount: 1, noOpCount: 0 });
    expect(applied.batchId).to.be.a('string').and.not.empty;
    expect(authorizationBulkAssignmentMutationSchema.safeParse(applied).success).to.equal(true);
    expect(await AuthorizationAudit.count({ batchId: applied.batchId })).to.equal(2);

    let replay: { code?: string; status?: number } | undefined;
    try {
      await RoleAdministrationService.applyBulkAssignments({
        ...command,
        requestId: requestId('bulk-replay'),
        confirmationToken: preview.confirmationToken,
      });
    } catch (error) {
      replay = error as { code?: string; status?: number };
    }
    expect(replay).to.deep.include({ code: 'authorization.preview-stale', status: 409 });
    expect(await RoleAssignment.count({ principalId: bulkUser.id, role: role.id, source: 'manual' })).to.equal(1);

    const assignment = await RoleAssignment.findOne({ principalId: bulkUser.id, role: role.id, source: 'manual' });
    const expiryRows = [
      {
        action: 'grant' as const,
        principalId: bulkUser.id,
        roleKey,
        expiresAt: '2099-01-01T00:00:00.000Z',
        expectedVersion: assignment.version,
      },
    ];
    const expiryPreview = await RoleAdministrationService.previewBulkAssignments({
      actor,
      brandId: brand.id,
      rows: expiryRows,
      reason: 'Reviewed expiry change',
      requestId: requestId('bulk-expiry-preview'),
    });
    expect(expiryPreview).to.deep.include({ grantCount: 1, noOpCount: 0, invalidCount: 0 });
    let changedReason: { code?: string; status?: number } | undefined;
    try {
      await RoleAdministrationService.applyBulkAssignments({
        actor,
        brandId: brand.id,
        rows: expiryRows,
        reason: 'Unreviewed expiry change',
        confirmationToken: expiryPreview.confirmationToken!,
        requestId: requestId('bulk-expiry-wrong-reason'),
      });
    } catch (error) {
      changedReason = error as { code?: string; status?: number };
    }
    expect(changedReason).to.deep.include({ code: 'authorization.preview-stale', status: 409 });
    const expiryApplied = await RoleAdministrationService.applyBulkAssignments({
      actor,
      brandId: brand.id,
      rows: expiryRows,
      reason: 'Reviewed expiry change',
      confirmationToken: expiryPreview.confirmationToken!,
      requestId: requestId('bulk-expiry-apply'),
    });
    expect(expiryApplied.data.appliedCount).to.equal(1);
    const expiringAssignment = await RoleAssignment.findOne({ id: assignment.id });
    expect(new Date(expiringAssignment.expiresAt).toISOString()).to.equal('2099-01-01T00:00:00.000Z');

    const staleGrant = await RoleAdministrationService.previewBulkAssignments({
      actor,
      brandId: brand.id,
      rows: expiryRows,
      requestId: requestId('bulk-stale-grant'),
    });
    expect(staleGrant).to.deep.include({ invalidCount: 1 });
    expect(staleGrant.rows[0]).to.include({ outcome: 'invalid', errorCode: 'authorization.version-conflict' });

    const invalidRows = [
      { action: 'grant' as const, principalId: invalidBatchUser.id, roleKey },
      { action: 'grant' as const, principalId: invalidBatchUser.id, roleKey: `missing-${suffix}` },
    ];
    const invalidPreview = await RoleAdministrationService.previewBulkAssignments({
      actor,
      brandId: brand.id,
      rows: invalidRows,
      requestId: requestId('bulk-invalid-preview'),
    });
    expect(invalidPreview.invalidCount).to.equal(1);
    expect(invalidPreview.confirmationToken).to.equal(undefined);
    let invalidApply: { code?: string; status?: number } | undefined;
    try {
      await RoleAdministrationService.applyBulkAssignments({
        actor,
        brandId: brand.id,
        rows: invalidRows,
        confirmationToken: 'invalid-token',
        requestId: requestId('bulk-invalid-apply'),
      });
    } catch (error) {
      invalidApply = error as { code?: string; status?: number };
    }
    expect(invalidApply).to.deep.include({ code: 'authorization.bulk-invalid', status: 422 });
    expect(await RoleAssignment.count({ principalId: invalidBatchUser.id, role: role.id, source: 'manual' })).to.equal(
      0
    );

    const duplicatePreview = await RoleAdministrationService.previewBulkAssignments({
      actor,
      brandId: brand.id,
      rows: [rows[0], rows[0]],
      requestId: requestId('bulk-duplicate'),
    });
    expect(duplicatePreview).to.deep.include({ invalidCount: 1 });
    expect(duplicatePreview.confirmationToken).to.equal(undefined);

    const assignmentBeforeRevoke = await RoleAssignment.findOne({ id: assignment.id });
    const revokeRows = [
      {
        action: 'revoke' as const,
        principalId: bulkUser.id,
        roleKey,
        expectedVersion: assignmentBeforeRevoke.version,
      },
    ];
    const revokeCommand = {
      actor,
      brandId: brand.id,
      rows: revokeRows,
      reason: 'Reviewed bulk revoke reason',
      requestId: requestId('bulk-revoke'),
    };
    const revokePreview = await RoleAdministrationService.previewBulkAssignments(revokeCommand);
    const revokeApplied = await RoleAdministrationService.applyBulkAssignments({
      ...revokeCommand,
      confirmationToken: revokePreview.confirmationToken!,
    });
    expect(revokeApplied.data).to.deep.include({ appliedCount: 1, noOpCount: 0 });
    expect(await RoleAssignment.findOne({ id: assignment.id })).to.include({
      status: 'revoked',
      reason: 'Reviewed bulk revoke reason',
    });
  });

  it('serializes concurrent manual grants without creating duplicate source tuples', async () => {
    const concurrentUser = await User.create({
      username: `phase84-concurrent-${suffix}`,
      password: 'phase84-test-password',
      type: 'local',
      name: 'Phase 8.4 concurrent user',
      email: `phase84-concurrent-${suffix}@example.test`,
    }).fetch();
    userIds.push(concurrentUser.id);
    const command = {
      actor,
      brandId: brand.id,
      principalId: concurrentUser.id,
      roleKey,
      source: 'manual' as const,
      sourceKey: 'manual',
    };
    const outcomes = await Promise.allSettled([
      RoleAdministrationService.grantAssignment({ ...command, requestId: requestId('concurrent-a') }),
      RoleAdministrationService.grantAssignment({ ...command, requestId: requestId('concurrent-b') }),
    ]);
    expect(outcomes.some(outcome => outcome.status === 'fulfilled')).to.equal(true);
    expect(await RoleAssignment.count({ principalId: concurrentUser.id, role: role.id, source: 'manual' })).to.equal(1);
    for (const outcome of outcomes.filter(result => result.status === 'rejected')) {
      expect((outcome as PromiseRejectedResult).reason).to.include({
        code: 'authorization.version-conflict',
        status: 409,
      });
    }
  });

  it('allows assignment cleanup after an ordinary role is inactive without reactivating authority', async () => {
    const granted = await RoleAdministrationService.grantAssignment({
      actor,
      brandId: brand.id,
      principalId: invalidBatchUser.id,
      roleKey,
      source: 'manual',
      sourceKey: 'manual',
      requestId: requestId('inactive-role-grant'),
    });
    await Role.updateOne({ id: role.id }).set({ status: 'inactive', version: role.version + 1 });

    const revoked = await RoleAdministrationService.revokeAssignment({
      actor,
      brandId: brand.id,
      principalId: invalidBatchUser.id,
      roleKey,
      source: 'manual',
      sourceKey: 'manual',
      expectedVersion: granted.version,
      requestId: requestId('inactive-role-revoke'),
    });

    expect(revoked.data.status).to.equal('revoked');
    const populated = await User.findOne({ id: invalidBatchUser.id }).populate('roles');
    expect(populated.roles.map((item: { id: string }) => item.id)).not.to.include(role.id);
  });
});
