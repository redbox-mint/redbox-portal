import {
  asScopeKey,
  type AuthorizationConfigurationDocument,
  type AuthorizationContext,
} from '../../../packages/redbox-core/src/authorization';
import {
  authorizationConfigurationDocumentSchema,
  authorizationConfigurationImportMutationSchema,
  authorizationConfigurationImportPreviewSchema,
  authorizationExplainResultSchema,
  authorizationReadinessSchema,
} from '../../../packages/redbox-core/src/api-routes';

describe('Authorization Phase 8.5 audit, explain, readiness, and configuration services', function () {
  this.timeout(90_000);

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const observerRoleKey = `phase85-observer-${suffix}`.toLowerCase();
  const importedRoleKey = `phase85-imported-${suffix}`.toLowerCase();
  const requestIds: string[] = [];
  let actor: AuthorizationContext;
  let observerActor: AuthorizationContext;
  let brand: { id: string };
  let otherBrand: { id: string; name: string };
  let admin: { id: string };
  let observer: { id: string };
  let observerRole: { id: string };
  let importedRoleId: string | undefined;

  const requestId = (operation: string): string => {
    const value = `phase85-${operation}-${suffix}`;
    requestIds.push(value);
    return value;
  };

  before(async () => {
    admin = await User.findOne({ username: 'admin' });
    expect(admin).to.exist;
    await AuthorizationScopeService.bootstrap();
    brand = await BrandingConfig.findOne({ name: 'default' });
    expect(brand).to.exist;
    await AuthorizationBootstrapService.bootstrap({ bootstrapUser: admin });
    actor = await AuthorizationService.resolveUserContext(admin.id, brand.id, 'session');
    otherBrand = await BrandingConfig.create({ name: `phase85-other-${suffix}` }).fetch();
    observer = await User.create({
      username: `phase85-observer-${suffix}`,
      password: 'phase85-integration-password',
      type: 'local',
      name: 'Phase 8.5 observer',
      email: `phase85-observer-${suffix}@example.test`,
    }).fetch();
    const createdRole = await RoleAdministrationService.createRole({
      actor,
      brandId: brand.id,
      key: observerRoleKey,
      displayName: 'Phase 8.5 observer',
      desiredScopeKeys: [
        asScopeKey('authorization.audit.read'),
        asScopeKey('authorization.explain'),
        asScopeKey('authorization.self.read'),
      ],
      requestId: requestId('observer-role-create'),
    });
    observerRole = createdRole.data;
    await RoleAdministrationService.grantAssignment({
      actor,
      brandId: brand.id,
      principalId: observer.id,
      roleKey: observerRoleKey,
      source: 'manual',
      sourceKey: 'manual',
      requestId: requestId('observer-assignment'),
    });
    observerActor = await AuthorizationService.resolveUserContext(observer.id, brand.id, 'session');
  });

  after(async () => {
    if (importedRoleId !== undefined) {
      await RoleScopeOverride.destroy({ role: importedRoleId });
      await Role.destroy({ id: importedRoleId });
    }
    if (observer?.id) {
      await User.removeFromCollection(observer.id, 'roles').members([observerRole?.id].filter(Boolean));
      await RoleAssignment.destroy({ principalId: observer.id });
      await User.destroy({ id: observer.id });
    }
    if (observerRole?.id) {
      await RoleScopeOverride.destroy({ role: observerRole.id });
      await Role.destroy({ id: observerRole.id });
    }
    if (otherBrand?.id) await BrandingConfig.destroy({ id: otherBrand.id });
    if (requestIds.length) await AuthorizationAudit.destroy({ requestId: requestIds });
  });

  it('queries redacted audit events with stable pagination and hides foreign-brand topology', async () => {
    for (const [index, brandId] of [brand.id, brand.id, otherBrand.id].entries()) {
      await AuthorizationAuditService.recordAttempt(
        {
          eventType: 'role.updated',
          actorType: 'user',
          actorId: `phase85-audit-${suffix}`,
          authMethod: 'session',
          brandId,
          targetType: 'role',
          targetId: `phase85-target-${index}`,
          before: { password: 'must-be-redacted', safe: { state: 'before' } },
          after: { authorization: 'Bearer must-be-redacted', safe: { state: 'after' } },
          requestId: requestId(`audit-${index}`),
        },
        'denied'
      );
    }

    const first = await AuthorizationAuditService.queryEvents({
      actor: observerActor,
      actorId: `phase85-audit-${suffix}`,
      outcome: 'denied',
      limit: 1,
    });
    expect(first.items).to.have.length(1);
    expect(first.nextCursor).to.be.a('string').and.not.empty;
    expect(first.items[0].brandId).to.equal(brand.id);
    expect(JSON.stringify(first.items[0])).not.to.include('must-be-redacted');
    expect(first.items[0]).not.to.have.property('id');

    const second = await AuthorizationAuditService.queryEvents({
      actor: observerActor,
      actorId: `phase85-audit-${suffix}`,
      outcome: 'denied',
      cursor: first.nextCursor,
      limit: 1,
    });
    expect(second.items).to.have.length(1);
    expect(second.items[0].eventId).not.to.equal(first.items[0].eventId);
    expect(second.nextCursor).to.equal(undefined);

    let hidden: { code?: string; status?: number } | undefined;
    try {
      await AuthorizationAuditService.queryEvents({ actor: observerActor, brandId: otherBrand.id });
    } catch (error) {
      hidden = error as { code?: string; status?: number };
    }
    expect(hidden).to.deep.include({ code: 'authorization.not-found', status: 404 });
  });

  it('explains a hypothetical decision read-only and keeps a foreign brand opaque', async () => {
    const beforeAuditCount = await AuthorizationAudit.count({ requestId: requestIds });
    const explanation = await AuthorizationService.explainDecision(
      observerActor,
      observer.id,
      brand.id,
      asScopeKey('authorization.self.read'),
      { found: true, brandId: brand.id, recordAcl: 'allowed' }
    );
    expect(explanation.explained).to.equal(true);
    if (!explanation.explained) throw new Error('The same-brand explanation must be available.');
    expect(explanation.decision).to.deep.include({ allowed: true, reasonCode: 'allowed' });
    expect(explanation.projection.principal.userId).to.equal(observer.id);
    expect(authorizationExplainResultSchema.safeParse(explanation).success).to.equal(true);

    const foreign = await AuthorizationService.explainDecision(
      observerActor,
      observer.id,
      otherBrand.id,
      asScopeKey('authorization.self.read')
    );
    expect(foreign.explained).to.equal(false);
    expect(foreign).not.to.have.property('projection');
    expect(await AuthorizationAudit.count({ requestId: requestIds })).to.equal(beforeAuditCount);
  });

  it('exports deterministic configuration, excludes assignments by default, and separately binds sensitive exports', async () => {
    const baseCommand = { actor, requestId: requestId('export-default') };
    const first = await AuthorizationConfigurationService.exportConfiguration(baseCommand);
    const second = await AuthorizationConfigurationService.exportConfiguration({
      ...baseCommand,
      requestId: requestId('export-default-repeat'),
    });
    expect(first).to.deep.equal(second);
    expect(authorizationConfigurationDocumentSchema.safeParse(first).success).to.equal(true);
    expect(first).not.to.have.property('assignments');
    expect(JSON.stringify(first)).not.to.include('phase85-integration-password');

    const preview = await AuthorizationConfigurationService.exportConfiguration({
      actor,
      includeAssignments: true,
      requestId: requestId('export-assignment-preview'),
    });
    expect(preview).to.deep.include({ operation: 'config-export-sensitive', includeAssignments: true });
    if (!('confirmationToken' in preview)) throw new Error('Sensitive export confirmation is required.');
    const assignmentExport = await AuthorizationConfigurationService.exportConfiguration({
      actor,
      includeAssignments: true,
      confirmationToken: preview.confirmationToken,
      requestId: requestId('export-assignment-apply'),
    });
    expect('assignments' in assignmentExport).to.equal(true);
    if (!('assignments' in assignmentExport)) throw new Error('The confirmed assignment export must be a document.');
    expect(assignmentExport.assignments?.some(item => item.principalId === observer.id)).to.equal(true);
    expect(assignmentExport.assignments?.some(item => item.brandId === undefined)).to.equal(false);

    const replayRequestId = requestId('export-assignment-replay');
    let replayedExport: { code?: string; status?: number } | undefined;
    try {
      await AuthorizationConfigurationService.exportConfiguration({
        actor,
        includeAssignments: true,
        confirmationToken: preview.confirmationToken,
        requestId: replayRequestId,
      });
    } catch (error) {
      replayedExport = error as { code?: string; status?: number };
    }
    expect(replayedExport).to.deep.include({ code: 'authorization.preview-stale', status: 409 });
    expect(await AuthorizationAudit.findOne({ requestId: replayRequestId })).to.deep.include({
      eventType: 'authorization.config-exported',
      outcome: 'denied',
      reasonCode: 'authorization.preview-stale',
    });

    let rebound: { code?: string; status?: number } | undefined;
    try {
      await AuthorizationConfigurationService.exportConfiguration({
        actor,
        includeAssignments: true,
        includeSystemAssignments: true,
        confirmationToken: preview.confirmationToken,
        requestId: requestId('export-token-rebind'),
      });
    } catch (error) {
      rebound = error as { code?: string; status?: number };
    }
    expect(rebound).to.deep.include({ code: 'authorization.preview-stale', status: 409 });
  });

  it('previews and atomically imports a bounded configuration change with stale-token replay protection', async () => {
    const exported = await AuthorizationConfigurationService.exportConfiguration({
      actor,
      requestId: requestId('import-source-export'),
    });
    if ('operation' in exported) throw new Error('The default export must be a configuration document.');
    const document: AuthorizationConfigurationDocument = {
      ...exported,
      roles: [
        ...exported.roles,
        {
          brandId: brand.id,
          key: importedRoleKey,
          displayName: 'Phase 8.5 imported role',
          description: 'Transactional import fixture',
          protectedKind: 'none',
          status: 'active',
          effectiveScopeKeys: [asScopeKey('authorization.self.read')],
          version: 1,
        },
      ],
    };
    const command = {
      actor,
      document,
      reason: 'Reviewed Phase 8.5 import',
      requestId: requestId('import'),
    };
    const preview = await RoleAdministrationService.previewConfigurationImport(command);
    expect(preview).to.deep.include({ operation: 'config-import', roleChanges: 1, assignmentChanges: 0 });
    expect(preview.fatalErrors).to.deep.equal([]);
    expect(preview.confirmationToken).to.be.a('string').and.not.empty;
    expect(authorizationConfigurationImportPreviewSchema.safeParse(preview).success).to.equal(true);

    const applied = await RoleAdministrationService.applyConfigurationImport({
      ...command,
      confirmationToken: preview.confirmationToken!,
    });
    expect(applied).to.deep.include({ changed: true, requestId: command.requestId });
    expect(applied.data.roleChanges).to.equal(1);
    expect(authorizationConfigurationImportMutationSchema.safeParse(applied).success).to.equal(true);
    const imported = await Role.findOne({ branding: brand.id, key: importedRoleKey });
    expect(imported).to.exist;
    importedRoleId = imported.id;
    expect(await AuthorizationAudit.count({ batchId: applied.batchId, eventType: 'role.created' })).to.equal(1);
    expect(
      await AuthorizationAudit.count({ batchId: applied.batchId, eventType: 'authorization.config-imported' })
    ).to.equal(1);

    let replay: { code?: string; status?: number } | undefined;
    try {
      await RoleAdministrationService.applyConfigurationImport({
        ...command,
        requestId: requestId('import-replay'),
        confirmationToken: preview.confirmationToken!,
      });
    } catch (error) {
      replay = error as { code?: string; status?: number };
    }
    expect(replay).to.deep.include({ code: 'authorization.preview-stale', status: 409 });
    expect(await Role.count({ branding: brand.id, key: importedRoleKey })).to.equal(1);
  });

  it('rolls back an import that would revoke the final system administrator', async () => {
    const systemRole = await Role.findOne({ contextType: 'system', protectedKind: 'system-admin' });
    const assignment = await RoleAssignment.findOne({
      principalId: admin.id,
      role: systemRole.id,
      source: 'recovery',
    });
    expect(assignment).to.exist;
    const document: AuthorizationConfigurationDocument = {
      schemaVersion: 1,
      templates: [],
      roles: [],
      assignments: [
        {
          principalId: admin.id,
          roleKey: systemRole.key ?? systemRole.name,
          source: assignment.source,
          sourceKey: assignment.sourceKey,
          status: 'revoked',
          sourcePresent: true,
          version: assignment.version,
        },
      ],
    };
    const command = {
      actor,
      document,
      reason: 'This must fail the protected quorum',
      requestId: requestId('protected-import'),
    };
    const preview = await RoleAdministrationService.previewConfigurationImport(command);
    expect(preview.confirmationToken).to.be.a('string').and.not.empty;
    let rejected: { code?: string; status?: number } | undefined;
    try {
      await RoleAdministrationService.applyConfigurationImport({
        ...command,
        confirmationToken: preview.confirmationToken!,
      });
    } catch (error) {
      rejected = error as { code?: string; status?: number };
    }
    expect(rejected).to.deep.include({ code: 'authorization.last-system-admin', status: 409 });
    expect(await RoleAssignment.findOne({ id: assignment.id })).to.deep.include({
      status: 'active',
      version: assignment.version,
    });
    expect((await Role.findOne({ id: systemRole.id })).version).to.equal(systemRole.version);
  });

  it('rejects protected-system scope adoption and scheduled final-administrator expiry through import', async () => {
    const exported = await AuthorizationConfigurationService.exportConfiguration({
      actor,
      requestId: requestId('protected-import-source'),
    });
    if ('operation' in exported) throw new Error('The default export must be a configuration document.');
    const systemRoleDocument = exported.roles.find(role => role.protectedKind === 'system-admin');
    expect(systemRoleDocument).to.exist;
    if (systemRoleDocument === undefined) throw new Error('The system role must be exported.');
    const broadened: AuthorizationConfigurationDocument = {
      schemaVersion: 1,
      templates: [],
      roles: [
        {
          ...systemRoleDocument,
          effectiveScopeKeys: [...systemRoleDocument.effectiveScopeKeys, asScopeKey('record.read')].sort(),
        },
      ],
    };
    const broadenedPreview = await RoleAdministrationService.previewConfigurationImport({
      actor,
      document: broadened,
      reason: 'Must use the dedicated scope-adoption flow',
      requestId: requestId('protected-scope-adoption'),
    });
    expect(broadenedPreview.fatalErrors).to.deep.equal(['roles[0]:authorization.protected-role']);
    expect(broadenedPreview.confirmationToken).to.equal(undefined);

    const systemRole = await Role.findOne({ contextType: 'system', protectedKind: 'system-admin' });
    const assignment = await RoleAssignment.findOne({
      principalId: admin.id,
      role: systemRole.id,
      source: 'recovery',
    });
    const expiryDocument: AuthorizationConfigurationDocument = {
      schemaVersion: 1,
      templates: [],
      roles: [],
      assignments: [
        {
          principalId: admin.id,
          roleKey: systemRole.key ?? systemRole.name,
          source: assignment.source,
          sourceKey: assignment.sourceKey,
          status: 'active',
          sourcePresent: true,
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          version: assignment.version,
        },
      ],
    };
    const expiryCommand = {
      actor,
      document: expiryDocument,
      reason: 'Must not schedule final administrator expiry',
      requestId: requestId('protected-expiry'),
    };
    const expiryPreview = await RoleAdministrationService.previewConfigurationImport(expiryCommand);
    expect(expiryPreview.confirmationToken).to.be.a('string').and.not.empty;
    let expiryRejected: { code?: string; status?: number } | undefined;
    try {
      await RoleAdministrationService.applyConfigurationImport({
        ...expiryCommand,
        confirmationToken: expiryPreview.confirmationToken!,
      });
    } catch (error) {
      expiryRejected = error as { code?: string; status?: number };
    }
    expect(expiryRejected).to.deep.include({ code: 'authorization.last-system-admin', status: 409 });
    expect(await RoleAssignment.findOne({ id: assignment.id })).to.deep.include({
      expiresAt: assignment.expiresAt,
      version: assignment.version,
    });
  });

  it('reports bounded rollout readiness without changing rollout mode', async () => {
    const beforeMode = sails.config.authorization.mode;
    const report = await AuthorizationReadinessService.getReport(actor);

    expect(authorizationReadinessSchema.safeParse(report).success).to.equal(true);
    expect(report.mode).to.equal(beforeMode);
    expect(report.routes.valid).to.equal(true);
    expect(report.transactions.available).to.equal(true);
    expect(report.administrators.requiredSystemAdministratorCount).to.equal(2);
    expect(report.administrators.brandsWithoutAdministrator).to.have.length.at.most(100);
    expect(report.administrators.brandsWithoutAdministratorCount).to.be.at.least(
      report.administrators.brandsWithoutAdministrator.length
    );
    expect(report.readyForEnforce).to.equal(report.blockers.length === 0);
    expect(sails.config.authorization.mode).to.equal(beforeMode);
  });
});
