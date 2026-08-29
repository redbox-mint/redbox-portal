import type { AuthorizationContext } from '../../../packages/redbox-core/src/authorization';
import { Services } from '../../../packages/redbox-core/src/services/RoleAdministrationService';

describe('Authorization Phase 5 role and assignment administration', function () {
  this.timeout(60_000);

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const roleKey = `phase5-${suffix}`.toLowerCase();
  const requestIds: string[] = [];
  let brand: { id: string };
  let user: { id: string };
  let actor: AuthorizationContext;
  let roleId: string | undefined;
  let manualAssignmentId: string | undefined;
  let externalAssignmentId: string | undefined;

  const requestId = (name: string): string => {
    const value = `phase5-${name}-${suffix}`;
    requestIds.push(value);
    return value;
  };

  before(async () => {
    const admin = await User.findOne({ username: 'admin' });
    expect(admin).to.exist;
    await AuthorizationScopeService.bootstrap();
    brand = await BrandingConfig.findOne({ name: 'default' });
    expect(brand).to.exist;
    await AuthorizationBootstrapService.bootstrap({ bootstrapUser: admin });
    actor = await AuthorizationService.resolveUserContext(admin.id, brand.id, 'session');
    user = await User.create({
      username: `phase5-user-${suffix}`,
      password: 'phase5-test-password',
      type: 'local',
      name: 'Phase 5 User',
      email: `phase5-${suffix}@example.test`,
    }).fetch();
  });

  after(async () => {
    if (user?.id) await User.removeFromCollection(user.id, 'roles').members(roleId ? [roleId] : []);
    await RoleAssignment.destroy({ principalId: user?.id });
    if (roleId) {
      await RoleScopeOverride.destroy({ role: roleId });
      await Role.destroy({ id: roleId });
    }
    if (user?.id) await User.destroy({ id: user.id });
    if (requestIds.length) await AuthorizationAudit.destroy({ requestId: requestIds });
  });

  it('atomically creates and CAS-updates a role with an audit event', async () => {
    const created = await RoleAdministrationService.createRole({
      actor,
      brandId: brand.id,
      key: roleKey,
      displayName: 'Phase 5 role',
      desiredScopeKeys: [],
      requestId: requestId('create'),
      reason: 'integration coverage',
    });
    roleId = created.data.id;
    expect(created.version).to.equal(1);
    expect(await AuthorizationAudit.count({ eventId: created.auditEventId, outcome: 'succeeded' })).to.equal(1);

    const updated = await RoleAdministrationService.updateRole({
      actor,
      brandId: brand.id,
      roleKey,
      expectedVersion: 1,
      displayName: 'Phase 5 updated role',
      requestId: requestId('update'),
    });
    expect(updated.version).to.equal(2);

    let conflict: { code?: string } | undefined;
    try {
      await RoleAdministrationService.updateRole({
        actor,
        brandId: brand.id,
        roleKey,
        expectedVersion: 1,
        displayName: 'Stale update',
        requestId: requestId('stale'),
      });
    } catch (error) {
      conflict = error as { code?: string };
    }
    expect(conflict?.code).to.equal('authorization.version-conflict');
    expect((await Role.findOne({ id: roleId })).displayName).to.equal('Phase 5 updated role');
  });

  it('rolls back the primary write when the transaction audit insert fails', async () => {
    const rollbackKey = `phase5-rollback-${suffix}`.toLowerCase();
    const service = new Services.RoleAdministrationService({
      audit: () => ({
        createSucceededEvent: async () => {
          throw new Error('injected audit failure');
        },
        recordAttempt: async () => ({ persisted: true }),
      }),
    });

    let rejected = false;
    try {
      await service.createRole({
        actor,
        brandId: brand.id,
        key: rollbackKey,
        displayName: 'Must roll back',
        desiredScopeKeys: [],
        requestId: requestId('audit-rollback'),
      });
    } catch (error) {
      rejected = (error as Error).message === 'injected audit failure';
    }
    expect(rejected).to.equal(true);
    expect(await Role.findOne({ identityKey: `brand:${brand.id}:${rollbackKey}` })).not.to.exist;
  });

  it('keeps the legacy projection until the final effective assignment source is revoked', async () => {
    const manual = await RoleAdministrationService.grantAssignment({
      actor,
      brandId: brand.id,
      principalId: user.id,
      roleKey,
      source: 'manual',
      sourceKey: 'manual',
      requestId: requestId('grant-manual'),
    });
    manualAssignmentId = manual.data.id;
    const external = await RoleAdministrationService.grantAssignment({
      actor,
      brandId: brand.id,
      principalId: user.id,
      roleKey,
      source: 'external',
      sourceKey: `oidc::group-${suffix}`,
      requestId: requestId('grant-external'),
    });
    externalAssignmentId = external.data.id;

    let populated = await User.findOne({ id: user.id }).populate('roles');
    expect(populated.roles.map((role: { id: string }) => role.id)).to.include(roleId);

    await RoleAdministrationService.revokeAssignment({
      actor,
      brandId: brand.id,
      principalId: user.id,
      roleKey,
      source: 'manual',
      sourceKey: 'manual',
      expectedVersion: manual.version,
      requestId: requestId('revoke-manual'),
    });
    populated = await User.findOne({ id: user.id }).populate('roles');
    expect(populated.roles.map((role: { id: string }) => role.id)).to.include(roleId);

    await RoleAdministrationService.revokeAssignment({
      actor,
      brandId: brand.id,
      principalId: user.id,
      roleKey,
      source: 'external',
      sourceKey: `oidc::group-${suffix}`,
      expectedVersion: external.version,
      requestId: requestId('revoke-external'),
    });
    populated = await User.findOne({ id: user.id }).populate('roles');
    expect(populated.roles.map((role: { id: string }) => role.id)).not.to.include(roleId);
    expect(await AuthorizationAudit.count({ targetId: [manualAssignmentId, externalAssignmentId] })).to.be.greaterThan(
      1
    );
  });

  it('preserves local external suppression across provider disappearance and reappearance', async () => {
    const provider = `oidc-${suffix}`;
    const sourceKey = `groups-${suffix}`;
    await RoleAdministrationService.replaceExternalAssignments({
      actor,
      brandId: brand.id,
      principalId: user.id,
      provider,
      sourceKey,
      roleKeys: [roleKey],
      requestId: requestId('external-create'),
    });
    let assignment = await RoleAssignment.findOne({
      principalId: user.id,
      role: roleId,
      source: 'external',
      sourceKey: `${provider}::${sourceKey}`,
    });
    const suppressed = await RoleAdministrationService.suppressAssignment({
      actor,
      brandId: brand.id,
      assignmentId: assignment.id,
      expectedVersion: assignment.version,
      requestId: requestId('external-suppress'),
    });
    expect(suppressed.data.status).to.equal('suppressed');

    await RoleAdministrationService.replaceExternalAssignments({
      actor,
      brandId: brand.id,
      principalId: user.id,
      provider,
      sourceKey,
      roleKeys: [],
      requestId: requestId('external-disappear'),
    });
    assignment = await RoleAssignment.findOne({ id: assignment.id });
    expect(assignment.status).to.equal('suppressed');
    expect(assignment.sourcePresent).to.equal(false);

    await RoleAdministrationService.replaceExternalAssignments({
      actor,
      brandId: brand.id,
      principalId: user.id,
      provider,
      sourceKey,
      roleKeys: [roleKey],
      requestId: requestId('external-reappear'),
    });
    assignment = await RoleAssignment.findOne({ id: assignment.id });
    expect(assignment.status).to.equal('suppressed');
    expect(assignment.sourcePresent).to.equal(true);

    const unsuppressed = await RoleAdministrationService.unsuppressAssignment({
      actor,
      brandId: brand.id,
      assignmentId: assignment.id,
      expectedVersion: assignment.version,
      requestId: requestId('external-unsuppress'),
    });
    expect(unsuppressed.data.status).to.equal('active');
  });
});
