import {
  asScopeKey,
  type AuthorizationContext,
  type PreviewRoleLifecycleCommand,
} from '../../../packages/redbox-core/src/authorization';
import {
  authorizationBulkTemplateUpgradeMutationSchema,
  authorizationBulkTemplateUpgradePreviewSchema,
  authorizationRoleDeletionPreviewSchema,
  authorizationRoleInactivationPreviewSchema,
  authorizationRoleMutationResultSchema,
  authorizationRoleScopePreviewSchema,
  authorizationRoleTemplateUpgradePreviewSchema,
  authorizationTemplatePublishMutationSchema,
  authorizationTemplatePublishPreviewSchema,
} from '../../../packages/redbox-core/src/api-routes';
import type { Collection, Document } from 'mongodb';

describe('Authorization Phase 8 contract query and template publication services', function () {
  this.timeout(60_000);

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const templateKey = `phase8-template-${suffix}`.toLowerCase();
  const requestId = `phase8-template-publish-${suffix}`;
  const roleRequestIds: string[] = [];
  let actor: AuthorizationContext;
  let brand: { id: string };
  let templateId: string | undefined;
  let templateCollection: Collection<Document>;
  let templateRevisionCollection: Collection<Document>;
  let otherBrand: { id: string };
  const roleIds = new Set<string>();

  const roleRequestId = (operation: string): string => {
    const value = `phase8-role-${operation}-${suffix}`;
    roleRequestIds.push(value);
    return value;
  };

  before(async () => {
    const admin = await User.findOne({ username: 'admin' });
    expect(admin).to.exist;
    await AuthorizationScopeService.bootstrap();
    brand = await BrandingConfig.findOne({ name: 'default' });
    expect(brand).to.exist;
    otherBrand = await BrandingConfig.create({ name: `phase8-other-brand-${suffix}` }).fetch();
    await AuthorizationBootstrapService.bootstrap({ bootstrapUser: admin });
    actor = await AuthorizationService.resolveUserContext(admin.id, brand.id, 'session');
    const manager = RoleTemplate.getDatastore().manager;
    templateCollection = manager.collection(RoleTemplate.tableName);
    templateRevisionCollection = manager.collection(RoleTemplateRevision.tableName);
  });

  after(async () => {
    const persistedRoleIds = [...roleIds];
    if (persistedRoleIds.length) {
      await RoleAssignment.destroy({ role: persistedRoleIds });
      await RoleScopeOverride.destroy({ role: persistedRoleIds });
      await Role.destroy({ id: persistedRoleIds });
    }
    if (templateId !== undefined) {
      const storedTemplate = await templateCollection.findOne({ key: templateKey });
      if (storedTemplate !== null) {
        await templateRevisionCollection.deleteMany({ template: storedTemplate._id });
        await templateCollection.deleteOne({ _id: storedTemplate._id });
      }
    }
    await AuthorizationAudit.destroy({ requestId });
    if (roleRequestIds.length) await AuthorizationAudit.destroy({ requestId: roleRequestIds });
    if (otherBrand?.id) await BrandingConfig.destroy({ id: otherBrand.id });
  });

  it('returns deterministic bounded scope pages with stable continuation semantics', async () => {
    const first = await AuthorizationScopeService.listCatalog({ actor, limit: 2, status: 'active' });
    expect(first.generation).to.be.a('string').and.not.empty;
    expect(first.items).to.have.length(2);
    expect(first.nextCursor).to.equal(first.items[1].key);
    expect(first.items.map((item: { key: string }) => item.key)).to.deep.equal(
      first.items.map((item: { key: string }) => item.key).sort()
    );

    const second = await AuthorizationScopeService.listCatalog({
      actor,
      cursor: first.nextCursor,
      limit: 2,
      status: 'active',
    });
    expect(second.items).not.to.be.empty;
    expect(second.items[0].key > first.items[1].key).to.equal(true);
    expect(second.items.map((item: { key: string }) => item.key)).not.to.include(first.items[1].key);

    const authorizationNamespace = await AuthorizationScopeService.listCatalog({
      actor,
      namespace: 'authorization',
      limit: 100,
    });
    expect(authorizationNamespace.items).not.to.be.empty;
    expect(
      authorizationNamespace.items.every((item: { namespace: string }) => item.namespace === 'authorization')
    ).to.equal(true);
  });

  it('lists immutable template revisions and returns an opaque not-found result', async () => {
    const page = await AuthorizationScopeService.listTemplates({ actor, limit: 2, status: 'active' });
    expect(page.items).to.have.length(2);
    expect(page.items[0].revisions).not.to.be.empty;

    const template = page.items[0];
    const revision = await AuthorizationScopeService.getTemplateRevision(
      actor,
      template.key,
      template.revisions[0].revision
    );
    expect(revision.templateKey).to.equal(template.key);
    expect(revision.scopeKeys).to.be.an('array').and.not.empty;
    expect(template.revisions[0]).not.to.have.property('scopeKeys');
    expect(template.revisionsTruncated).to.equal(false);

    let missing: { status?: number; code?: string } | undefined;
    try {
      await AuthorizationScopeService.getTemplateRevision(actor, `missing-${suffix}`, 1);
    } catch (error) {
      missing = error as { status?: number; code?: string };
    }
    expect(missing).to.deep.include({ status: 404, code: 'authorization.not-found' });
  });

  it('publishes a confirmed immutable template revision transactionally for a system administrator', async () => {
    const template = await RoleTemplate.create({
      key: templateKey,
      displayName: 'Phase 8 integration template',
      description: 'Disposable integration fixture for template publication.',
      currentRevision: 1,
      protectedKind: 'none',
      status: 'active',
      version: 1,
    }).fetch();
    templateId = template.id;
    await RoleTemplateRevision.create({
      template: template.id,
      revision: 1,
      scopeKeys: [asScopeKey('authorization.self.read')],
      notes: 'Initial integration fixture revision',
      publishedBy: 'phase8-integration-fixture',
      publishedAt: new Date(),
    });

    const scopeKeys = [asScopeKey('authorization.self.read'), asScopeKey('portal.home.read')];
    const command = {
      actor,
      templateKey,
      expectedVersion: 1,
      scopeKeys,
      notes: 'Confirmed integration publication',
      requestId,
    };
    const preview = await RoleAdministrationService.previewTemplateRevision(command);
    expect(preview.operation).to.equal('template-publish');
    expect(preview.confirmationToken).to.be.a('string').and.not.empty;
    expect(authorizationTemplatePublishPreviewSchema.safeParse(preview).success).to.equal(true);

    const published = await RoleAdministrationService.publishTemplateRevision({
      ...command,
      confirmationToken: preview.confirmationToken,
    });
    expect(published).to.deep.include({ version: 2, changed: true, requestId });
    expect(published.data).to.deep.include({ templateKey, revision: 2 });
    expect(authorizationTemplatePublishMutationSchema.safeParse(published).success).to.equal(true);
    expect(await RoleTemplateRevision.count({ template: template.id })).to.equal(2);
    expect((await RoleTemplate.findOne({ id: template.id })).currentRevision).to.equal(2);
    expect(await AuthorizationAudit.count({ eventId: published.auditEventId, requestId })).to.equal(1);
  });

  it('keeps role catalog/detail reads brand-scoped and applies the confirmed lifecycle transactionally', async () => {
    const roleKey = `phase8-role-${suffix}`.toLowerCase();
    const created = await RoleAdministrationService.createRole({
      actor,
      brandId: brand.id,
      key: roleKey,
      displayName: 'Phase 8 role',
      templateKey,
      templateRevision: 1,
      desiredScopeKeys: [],
      reason: 'Create the API lifecycle fixture',
      requestId: roleRequestId('create'),
    });
    roleIds.add(created.data.id);
    expect(authorizationRoleMutationResultSchema.safeParse(created).success).to.equal(true);

    const page = await RoleAdministrationService.listRoles({
      actor,
      brandId: brand.id,
      search: roleKey,
      limit: 10,
    });
    expect(page.items.map((role: { key: string }) => role.key)).to.deep.equal([roleKey]);
    const detail = await RoleAdministrationService.getRole(actor, brand.id, roleKey);
    expect(detail).to.deep.include({ key: roleKey, templateKey, templateRevision: 1, version: 1 });
    expect(detail.baseScopeKeys).to.deep.equal(['authorization.self.read']);
    expect(detail.effectiveScopeKeys).to.deep.equal([]);

    const crossBrandRoleKey = `phase8-cross-brand-${suffix}`.toLowerCase();
    const crossBrandRole = await Role.create({
      name: crossBrandRoleKey,
      key: crossBrandRoleKey,
      identityKey: `brand:${otherBrand.id}:${crossBrandRoleKey}`,
      displayName: 'Cross-brand role',
      contextType: 'brand',
      branding: otherBrand.id,
      protectedKind: 'none',
      status: 'active',
      version: 1,
    }).fetch();
    roleIds.add(crossBrandRole.id);
    let hidden: { status?: number; code?: string } | undefined;
    try {
      await RoleAdministrationService.getRole(actor, brand.id, crossBrandRoleKey);
    } catch (error) {
      hidden = error as { status?: number; code?: string };
    }
    expect(hidden).to.deep.include({ status: 404, code: 'authorization.not-found' });
    let crossBrandMutation: { status?: number; code?: string } | undefined;
    try {
      await RoleAdministrationService.updateRole({
        actor,
        brandId: brand.id,
        roleKey: crossBrandRoleKey,
        expectedVersion: 1,
        displayName: 'Cross-brand mutation must not apply',
        requestId: roleRequestId('cross-brand-update'),
      });
    } catch (error) {
      crossBrandMutation = error as { status?: number; code?: string };
    }
    expect(crossBrandMutation).to.deep.include({ status: 404, code: 'authorization.not-found' });
    expect((await Role.findOne({ id: crossBrandRole.id })).displayName).to.equal('Cross-brand role');

    const guest = await Role.findOne({ branding: brand.id, protectedKind: 'guest' });
    expect(guest).to.exist;
    if (guest === undefined) throw new Error('The default brand must have its protected Guest role.');
    const protectedPreviews: ReadonlyArray<
      readonly [string, (command: PreviewRoleLifecycleCommand) => Promise<unknown>]
    > = [
      ['inactivate', command => RoleAdministrationService.previewRoleInactivation(command)],
      ['delete', command => RoleAdministrationService.previewRoleDeletion(command)],
    ];
    for (const [operation, preview] of protectedPreviews) {
      let protectedFailure: { status?: number; code?: string } | undefined;
      try {
        await preview({
          actor,
          brandId: brand.id,
          roleKey: guest.key ?? guest.name,
          expectedVersion: guest.version,
          reason: `Protected Guest ${operation} must fail`,
          requestId: roleRequestId(`guest-${operation}`),
        });
      } catch (error) {
        protectedFailure = error as { status?: number; code?: string };
      }
      expect(protectedFailure).to.deep.include({ status: 409, code: 'authorization.protected-role' });
    }

    const updated = await RoleAdministrationService.updateRole({
      actor,
      brandId: brand.id,
      roleKey,
      expectedVersion: 1,
      description: 'Description-only PATCH semantics',
      requestId: roleRequestId('update'),
    });
    expect(updated.data.displayName).to.equal('Phase 8 role');
    expect(updated.data.description).to.equal('Description-only PATCH semantics');

    const scopeCommand = {
      actor,
      brandId: brand.id,
      roleKey,
      expectedVersion: 2,
      desiredScopeKeys: ['authorization.self.read'],
      reason: 'Grant the reviewed self projection',
      requestId: roleRequestId('scope'),
    };
    const scopePreview = await RoleAdministrationService.previewRoleScopes(scopeCommand);
    expect(authorizationRoleScopePreviewSchema.safeParse(scopePreview).success).to.equal(true);
    let changedReason: { code?: string } | undefined;
    try {
      await RoleAdministrationService.applyRoleScopes({
        ...scopeCommand,
        reason: 'Changed after preview',
        confirmationToken: scopePreview.confirmationToken,
      });
    } catch (error) {
      changedReason = error as { code?: string };
    }
    expect(changedReason?.code).to.equal('authorization.preview-stale');
    const scoped = await RoleAdministrationService.applyRoleScopes({
      ...scopeCommand,
      confirmationToken: scopePreview.confirmationToken,
    });
    expect(scoped.version).to.equal(3);

    const cloneKey = `phase8-clone-${suffix}`.toLowerCase();
    const cloned = await RoleAdministrationService.createRole({
      actor,
      brandId: brand.id,
      key: cloneKey,
      displayName: 'Phase 8 cloned role',
      cloneRoleKey: roleKey,
      reason: 'Verify same-brand scope-only cloning',
      requestId: roleRequestId('clone'),
    });
    roleIds.add(cloned.data.id);
    expect(cloned.data).to.deep.include({
      key: cloneKey,
      protectedKind: 'none',
      version: 1,
    });
    expect(cloned.data).not.to.have.property('templateKey');
    expect(cloned.data.baseScopeKeys).to.deep.equal([]);
    expect(cloned.data.effectiveScopeKeys).to.deep.equal(['authorization.self.read']);
    expect(await RoleAssignment.count({ role: cloned.data.id })).to.equal(0);

    const actorUserId = actor.principal.userId;
    expect(actorUserId).to.be.a('string').and.not.empty;
    if (actorUserId === undefined) throw new Error('The Phase 8 actor must resolve to a user.');
    await User.addToCollection(actorUserId, 'roles').members([cloned.data.id]);
    try {
      const legacyDependencyPreview = await RoleAdministrationService.previewRoleDeletion({
        actor,
        brandId: brand.id,
        roleKey: cloneKey,
        expectedVersion: 1,
        reason: 'Verify legacy compatibility membership blocks deletion',
        requestId: roleRequestId('legacy-dependency'),
      });
      expect(legacyDependencyPreview.dependencies).to.deep.include({
        assignmentRows: 0,
        legacyUserAssociations: 1,
      });
      expect(legacyDependencyPreview.fatalErrors).to.deep.equal(['role-has-dependencies']);
      expect(legacyDependencyPreview.confirmationToken).to.equal(undefined);
    } finally {
      await User.removeFromCollection(actorUserId, 'roles').members([cloned.data.id]);
    }

    const upgradeCommand = {
      actor,
      brandId: brand.id,
      roleKey,
      expectedVersion: 3,
      targetRevision: 2,
      reason: 'Adopt the published revision',
      requestId: roleRequestId('upgrade'),
    };
    const upgradePreview = await RoleAdministrationService.previewRoleTemplateUpgrade(upgradeCommand);
    expect(authorizationRoleTemplateUpgradePreviewSchema.safeParse(upgradePreview).success).to.equal(true);
    expect(upgradePreview.proposed?.baseScopeKeys).to.deep.equal(['authorization.self.read', 'portal.home.read']);
    const upgraded = await RoleAdministrationService.applyRoleTemplateUpgrade({
      ...upgradeCommand,
      confirmationToken: upgradePreview.confirmationToken,
    });
    expect(upgraded.data).to.deep.include({ templateRevision: 2, version: 4 });
    expect(upgraded.data.effectiveScopeKeys).to.deep.equal(['authorization.self.read', 'portal.home.read']);
    let downgradeFailure: { status?: number; code?: string } | undefined;
    try {
      await RoleAdministrationService.previewRoleTemplateUpgrade({
        ...upgradeCommand,
        expectedVersion: 4,
        targetRevision: 1,
        requestId: roleRequestId('downgrade'),
      });
    } catch (error) {
      downgradeFailure = error as { status?: number; code?: string };
    }
    expect(downgradeFailure).to.deep.include({ status: 400, code: 'authorization.invalid-role' });

    const inactiveCommand = {
      actor,
      brandId: brand.id,
      roleKey,
      expectedVersion: 4,
      reason: 'Retire the role',
      requestId: roleRequestId('inactivate'),
    };
    const inactivePreview = await RoleAdministrationService.previewRoleInactivation(inactiveCommand);
    expect(authorizationRoleInactivationPreviewSchema.safeParse(inactivePreview).success).to.equal(true);
    expect(inactivePreview.fatalErrors).to.deep.equal([]);
    expect(inactivePreview.confirmationToken).to.be.a('string').and.not.empty;
    const inactive = await RoleAdministrationService.inactivateRole({
      ...inactiveCommand,
      confirmationToken: inactivePreview.confirmationToken,
    });
    expect(inactive.data).to.deep.include({ status: 'inactive', version: 5 });

    const deleteCommand = {
      actor,
      brandId: brand.id,
      roleKey,
      expectedVersion: 5,
      reason: 'Delete the dependency-free role',
      requestId: roleRequestId('delete'),
    };
    const deletionPreview = await RoleAdministrationService.previewRoleDeletion(deleteCommand);
    expect(authorizationRoleDeletionPreviewSchema.safeParse(deletionPreview).success).to.equal(true);
    expect(deletionPreview.fatalErrors).to.deep.equal([]);
    const deleted = await RoleAdministrationService.deleteRole({
      ...deleteCommand,
      confirmationToken: deletionPreview.confirmationToken,
    });
    expect(authorizationRoleMutationResultSchema.safeParse(deleted).success).to.equal(true);
    expect(await Role.findOne({ id: created.data.id })).not.to.exist;
    roleIds.delete(created.data.id);
  });

  it('previews and atomically upgrades only explicitly selected roles across brands', async () => {
    if (templateId === undefined) throw new Error('The Phase 8 template fixture must be published first.');
    await RoleTemplateRevision.create({
      template: templateId,
      revision: 3,
      scopeKeys: [asScopeKey('authorization.role.read'), asScopeKey('authorization.scope.read')],
      notes: 'System-delegable cross-brand upgrade fixture',
      publishedBy: 'phase8-integration-fixture',
      publishedAt: new Date(),
    });
    await RoleTemplate.updateOne({ id: templateId, currentRevision: 2 }).set({ currentRevision: 3, version: 3 });

    const selected = [] as Array<{ roleId: string; expectedVersion: number }>;
    const first = await RoleAdministrationService.createRole({
      actor,
      brandId: brand.id,
      key: `phase8-bulk-1-${suffix}`.toLowerCase(),
      displayName: 'Phase 8 bulk role 1',
      templateKey,
      templateRevision: 1,
      requestId: roleRequestId('bulk-create-1'),
    });
    roleIds.add(first.data.id);
    selected.push({ roleId: first.data.id, expectedVersion: first.version });

    const secondKey = `phase8-bulk-2-${suffix}`.toLowerCase();
    const second = await Role.create({
      name: secondKey,
      key: secondKey,
      identityKey: `brand:${otherBrand.id}:${secondKey}`,
      displayName: 'Phase 8 bulk role 2',
      contextType: 'brand',
      branding: otherBrand.id,
      template: templateId,
      templateRevision: 1,
      protectedKind: 'none',
      status: 'active',
      version: 1,
    }).fetch();
    roleIds.add(second.id);
    selected.push({ roleId: second.id, expectedVersion: second.version });

    const unselectedKey = `phase8-bulk-unselected-${suffix}`.toLowerCase();
    const unselected = await Role.create({
      name: unselectedKey,
      key: unselectedKey,
      identityKey: `brand:${brand.id}:${unselectedKey}`,
      displayName: 'Phase 8 unselected bulk role',
      contextType: 'brand',
      branding: brand.id,
      template: templateId,
      templateRevision: 1,
      protectedKind: 'none',
      status: 'active',
      version: 1,
    }).fetch();
    roleIds.add(unselected.id);
    const command = {
      actor,
      templateKey,
      targetRevision: 3,
      roles: selected,
      reason: 'Upgrade only the reviewed selection',
      requestId: roleRequestId('bulk-upgrade'),
    };
    const preview = await RoleAdministrationService.previewBulkTemplateUpgrade(command);
    expect(authorizationBulkTemplateUpgradePreviewSchema.safeParse(preview).success).to.equal(true);
    expect(preview.fatalErrors).to.deep.equal([]);
    expect(preview.roles.every((role: object) => !('conflict' in role))).to.equal(true);
    expect(preview.roles).to.have.length(2);
    expect(preview.roles.map((role: { brandId: string }) => role.brandId)).to.have.members([brand.id, otherBrand.id]);
    expect(preview.roles.every((role: { changed: boolean }) => role.changed)).to.equal(true);
    const applied = await RoleAdministrationService.applyBulkTemplateUpgrade({
      ...command,
      confirmationToken: preview.confirmationToken,
    });
    expect(authorizationBulkTemplateUpgradeMutationSchema.safeParse(applied).success).to.equal(true);
    expect(applied.data).to.deep.include({ appliedCount: 2, noOpCount: 0, targetRevision: 3 });
    expect(await Role.count({ id: selected.map(role => role.roleId), templateRevision: 3 })).to.equal(2);
    expect((await Role.findOne({ id: unselected.id })).templateRevision).to.equal(1);
    expect(await AuthorizationAudit.count({ batchId: applied.batchId, eventType: 'role.template-upgraded' })).to.equal(
      2
    );
  });
});
