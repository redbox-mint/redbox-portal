import {
  asScopeKey,
  buildRoleIdentityKey,
  freezeAuthorizationContext,
  requireAllowedResource,
  type AuthorizationContext,
} from '../../../packages/redbox-core/src/authorization';
import { firstValueFrom } from 'rxjs';

describe('Authorization Phase 7 brand/entity/record resource gates', function () {
  this.timeout(60_000);

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const createdRecordOids: string[] = [];
  const createdDeletedRecordOids: string[] = [];
  const createdVocabularyIds: string[] = [];
  let foreignFormId: string | undefined;
  let foreignRecordTypeId: string | undefined;
  let foreignWorkflowStepId: string | undefined;
  let foreignReportId: string | undefined;
  let foreignNamedQueryId: string | undefined;
  let foreignDashboardTypeId: string | undefined;
  let foreignAppConfigId: string | undefined;
  let foreignTranslationId: string | undefined;
  let foreignHarvestRunId: string | undefined;
  let foreignUserId: string | undefined;
  let foreignRoleId: string | undefined;
  let brandA: { id: string; name: string };
  let brandB: { id: string; name: string };
  let fullContext: AuthorizationContext;
  let aclContext: AuthorizationContext;

  before(async () => {
    const admin = await User.findOne({ username: 'admin' });
    expect(admin).to.exist;
    await AuthorizationScopeService.bootstrap();
    brandA = await BrandingConfig.findOne({ name: 'default' });
    expect(brandA).to.exist;
    brandB = await BrandingConfig.create({ name: `phase7-brand-${suffix}` }).fetch();
    await BrandingService.refreshBrandingCache(brandB.id);
    await AuthorizationBootstrapService.bootstrap({ bootstrapUser: admin });
    fullContext = await AuthorizationService.resolveUserContext(admin.id, brandA.id, 'session');
    aclContext = await AuthorizationService.resolveUserContext(admin.id, brandA.id, 'bearer', ['record.read']);
  });

  after(async () => {
    if (foreignUserId) {
      await User.destroy({ id: foreignUserId });
    }
    if (foreignRoleId) {
      await Role.destroy({ id: foreignRoleId });
    }
    if (foreignHarvestRunId) {
      await HarvestRecordEvent.destroy({ runId: foreignHarvestRunId });
      await HarvestRunChunk.destroy({ runId: foreignHarvestRunId });
      await HarvestRun.destroy({ id: foreignHarvestRunId });
    }
    if (foreignTranslationId) {
      await I18nTranslation.destroy({ id: foreignTranslationId });
    }
    if (foreignAppConfigId) {
      await AppConfig.destroy({ id: foreignAppConfigId });
    }
    if (foreignDashboardTypeId) {
      await DashboardType.destroy({ id: foreignDashboardTypeId });
    }
    if (foreignNamedQueryId) {
      await NamedQuery.destroy({ id: foreignNamedQueryId });
    }
    if (foreignReportId) {
      await RBReport.destroy({ id: foreignReportId });
    }
    if (foreignWorkflowStepId) {
      await WorkflowStep.destroy({ id: foreignWorkflowStepId });
    }
    if (foreignRecordTypeId) {
      await RecordType.destroy({ id: foreignRecordTypeId });
    }
    if (foreignFormId) {
      await Form.destroy({ id: foreignFormId });
    }
    if (createdVocabularyIds.length > 0) {
      await VocabularyEntry.destroy({ vocabulary: createdVocabularyIds });
      await Vocabulary.destroy({ id: createdVocabularyIds });
    }
    if (createdRecordOids.length > 0) {
      await Record.destroy({ redboxOid: createdRecordOids });
    }
    if (createdDeletedRecordOids.length > 0) {
      await DeletedRecord.destroy({ redboxOid: createdDeletedRecordOids });
    }
    if (brandB?.id) {
      await Role.destroy({ branding: brandB.id });
      await BrandingConfig.destroy({ id: brandB.id });
    }
  });

  it('keeps vocabulary ID, slug, notation, create and update operations inside the active brand', async () => {
    const vocabularyA = await Vocabulary.create({
      name: `Phase 7 Vocabulary A ${suffix}`,
      slug: `phase7-vocabulary-a-${suffix}`,
      branding: brandA.id,
      type: 'tree',
      source: 'local',
    }).fetch();
    const vocabularyB = await Vocabulary.create({
      name: `Phase 7 Vocabulary B ${suffix}`,
      slug: `phase7-vocabulary-b-${suffix}`,
      branding: brandB.id,
      type: 'tree',
      source: 'local',
    }).fetch();
    createdVocabularyIds.push(vocabularyA.id, vocabularyB.id);
    await VocabularyEntry.create({
      vocabulary: vocabularyB.id,
      label: 'Foreign secret notation',
      value: 'SECRET',
      identifier: 'SECRET',
      order: 0,
    });

    const requiredScope = asScopeKey('vocabulary.manage');
    const listed = await VocabularyService.listAuthorized(fullContext, requiredScope, { limit: 200, offset: 0 });
    expect(listed.data.map((value: { id: string }) => value.id)).to.include(vocabularyA.id);
    expect(listed.data.map((value: { id: string }) => value.id)).not.to.include(vocabularyB.id);
    expect((await VocabularyService.getAuthorizedByIdOrSlug(fullContext, requiredScope, vocabularyA.id)).id).to.equal(
      vocabularyA.id
    );

    for (const foreignIdentifier of [vocabularyB.id, vocabularyB.slug]) {
      let error: { status?: number; code?: string } | undefined;
      try {
        await VocabularyService.getAuthorizedByIdOrSlug(fullContext, requiredScope, foreignIdentifier);
      } catch (candidate) {
        error = candidate as { status?: number; code?: string };
      }
      expect(error?.status).to.equal(404);
      expect(error?.code).to.equal('authorization.not-found');
    }
    expect(await VocabularyService.getEntryByNotation(brandA.id, vocabularyB.id, 'SECRET')).to.equal(null);

    const created = await VocabularyService.createAuthorized(fullContext, requiredScope, {
      name: `Phase 7 Derived Brand ${suffix}`,
      slug: `phase7-derived-brand-${suffix}`,
      branding: brandB.id,
      type: 'flat',
      source: 'local',
    });
    createdVocabularyIds.push(created.id);
    expect(String(created.branding)).to.equal(brandA.id);

    await VocabularyService.updateAuthorized(fullContext, requiredScope, created.id, {
      name: `Phase 7 Still Brand A ${suffix}`,
      branding: brandB.id,
    });
    const updated = await Vocabulary.findOne({ id: created.id });
    expect(String(updated.branding)).to.equal(brandA.id);
  });

  it('composes base scope, brand ownership, direct ACL and broad ACL bypass for active records', async () => {
    const directOid = `phase7-direct-${suffix}`;
    const deniedOid = `phase7-denied-${suffix}`;
    const foreignOid = `phase7-foreign-${suffix}`;
    createdRecordOids.push(directOid, deniedOid, foreignOid);
    await Record.createEach([
      {
        redboxOid: directOid,
        metaMetadata: { brandId: brandA.id, type: 'rdmp' },
        authorization: { view: ['admin'], edit: [], viewRoles: [], editRoles: [] },
      },
      {
        redboxOid: deniedOid,
        metaMetadata: { brandId: brandA.id, type: 'rdmp' },
        authorization: { view: [], edit: [], viewRoles: [], editRoles: [] },
      },
      {
        redboxOid: foreignOid,
        metaMetadata: { brandId: brandB.id, type: 'rdmp' },
        authorization: { view: ['admin'], edit: [], viewRoles: [], editRoles: [] },
      },
    ]);

    const requiredScope = asScopeKey('record.read');
    const direct = await RecordsService.getAuthorizedMeta(aclContext, requiredScope, directOid, 'read');
    expect(direct.allowed).to.equal(true);

    const denied = await RecordsService.getAuthorizedMeta(aclContext, requiredScope, deniedOid, 'read');
    expect(denied.allowed).to.equal(false);
    expect(denied.decision.reasonCode).to.equal('record-acl-denied');
    let deniedError: { status?: number } | undefined;
    try {
      requireAllowedResource(denied);
    } catch (error) {
      deniedError = error as { status?: number };
    }
    expect(deniedError?.status).to.equal(403);

    const broad = await RecordsService.getAuthorizedMeta(fullContext, requiredScope, deniedOid, 'read');
    expect(broad.allowed).to.equal(true);

    const foreign = await RecordsService.getAuthorizedMeta(aclContext, requiredScope, foreignOid, 'read');
    const missing = await RecordsService.getAuthorizedMeta(
      aclContext,
      requiredScope,
      `phase7-missing-${suffix}`,
      'read'
    );
    expect(foreign.allowed).to.equal(false);
    expect(missing.allowed).to.equal(false);
    expect(foreign.decision.reasonCode).to.equal('resource-not-found');
    expect(missing.decision.reasonCode).to.equal('resource-not-found');
  });

  it('covers the complete principal, brand, assignment, transport and ACL resource matrix', async () => {
    const researcherRoleA = await Role.findOne({ branding: brandA.id, name: 'Researcher' });
    const librarianRoleA = await Role.findOne({ branding: brandA.id, name: 'Librarians' });
    const brandAdminRoleA = await Role.findOne({ branding: brandA.id, protectedKind: 'brand-admin' });
    let researcherRoleB = await Role.findOne({ branding: brandB.id, name: 'Researcher' });
    expect(researcherRoleA).to.exist;
    expect(librarianRoleA).to.exist;
    expect(brandAdminRoleA).to.exist;
    if (!researcherRoleB) {
      researcherRoleB = await Role.create({
        name: researcherRoleA.name,
        key: researcherRoleA.key,
        identityKey: buildRoleIdentityKey('brand', String(researcherRoleA.key), brandB.id),
        displayName: researcherRoleA.displayName,
        description: researcherRoleA.description,
        contextType: 'brand',
        branding: brandB.id,
        template: researcherRoleA.template,
        templateRevision: researcherRoleA.templateRevision,
        protectedKind: 'none',
        status: 'active',
        version: 1,
        createdBy: 'phase7-resource-matrix',
        updatedBy: 'phase7-resource-matrix',
      }).fetch();
    }

    const users: Array<{ id: string; username: string }> = [];
    const assignmentIds: string[] = [];
    const indexedRecords: Array<Record<string, unknown>> = [];
    let inactiveRoleId: string | undefined;
    const createUser = async (label: string, loginDisabled = false) => {
      const username = `phase7-${label}-${suffix}`;
      const user = await User.create({
        username,
        password: `phase7-${label}-password`,
        type: 'local',
        name: `Phase 7 ${label}`,
        email: `${username}@example.test`,
        loginDisabled,
      }).fetch();
      users.push(user);
      return user;
    };
    const assignment = (
      principalId: string,
      role: string,
      branding: string,
      sourceKey: string,
      extras: Record<string, unknown> = {}
    ) => ({
      principalType: 'user',
      principalId,
      role,
      branding,
      source: 'manual',
      sourceKey,
      status: 'active',
      sourcePresent: true,
      assignedBy: 'phase7-resource-matrix',
      assignedAt: new Date(),
      version: 1,
      ...extras,
    });

    try {
      const guestUser = await createUser('guest');
      const researcherUser = await createUser('researcher');
      const librarianUser = await createUser('librarian');
      const brandAdminUser = await createUser('brand-admin');
      const multipleRoleUser = await createUser('multiple-role');
      const expiredUser = await createUser('expired');
      const inactiveRoleUser = await createUser('inactive-role');
      const disabledUser = await createUser('disabled', true);

      const inactiveRole = await Role.create({
        name: `Phase7Inactive-${suffix}`,
        key: `Phase7Inactive-${suffix}`,
        identityKey: buildRoleIdentityKey('brand', `Phase7Inactive-${suffix}`, brandA.id),
        displayName: 'Phase 7 inactive matrix role',
        contextType: 'brand',
        branding: brandA.id,
        protectedKind: 'none',
        status: 'inactive',
        version: 1,
        createdBy: 'phase7-resource-matrix',
        updatedBy: 'phase7-resource-matrix',
      }).fetch();
      inactiveRoleId = inactiveRole.id;

      const createdAssignments = await RoleAssignment.createEach([
        assignment(researcherUser.id, researcherRoleA.id, brandA.id, 'researcher-a'),
        assignment(librarianUser.id, librarianRoleA.id, brandA.id, 'librarian-a'),
        assignment(brandAdminUser.id, brandAdminRoleA.id, brandA.id, 'brand-admin-a'),
        assignment(multipleRoleUser.id, researcherRoleA.id, brandA.id, 'multiple-researcher-a'),
        assignment(multipleRoleUser.id, librarianRoleA.id, brandA.id, 'multiple-librarian-a'),
        assignment(multipleRoleUser.id, researcherRoleB.id, brandB.id, 'multiple-researcher-b'),
        assignment(expiredUser.id, researcherRoleA.id, brandA.id, 'expired-researcher-a', {
          expiresAt: new Date(Date.now() - 60_000),
        }),
        assignment(inactiveRoleUser.id, inactiveRole.id, brandA.id, 'inactive-role-a'),
        assignment(disabledUser.id, researcherRoleA.id, brandA.id, 'disabled-researcher-a'),
      ]).fetch();
      assignmentIds.push(...createdAssignments.map((value: { id: string }) => value.id));

      const directViewOid = `phase7-matrix-direct-view-${suffix}`;
      const directEditOid = `phase7-matrix-direct-edit-${suffix}`;
      const roleViewOid = `phase7-matrix-role-view-${suffix}`;
      const roleEditOid = `phase7-matrix-role-edit-${suffix}`;
      const flatRoleEditOid = `phase7-matrix-flat-role-edit-${suffix}`;
      const noAclOid = `phase7-matrix-no-acl-${suffix}`;
      const foreignOid = `phase7-matrix-foreign-${suffix}`;
      createdRecordOids.push(
        directViewOid,
        directEditOid,
        roleViewOid,
        roleEditOid,
        flatRoleEditOid,
        noAclOid,
        foreignOid
      );
      const researcherKey = String(researcherRoleA.key ?? researcherRoleA.name);
      const matrixRecords = await Record.createEach([
        {
          redboxOid: directViewOid,
          metaMetadata: { brandId: brandA.id, type: 'rdmp' },
          authorization: { view: [researcherUser.username], edit: [], viewRoles: [], editRoles: [] },
        },
        {
          redboxOid: directEditOid,
          metaMetadata: { brandId: brandA.id, type: 'rdmp' },
          authorization: { view: [], edit: [researcherUser.username], viewRoles: [], editRoles: [] },
        },
        {
          redboxOid: roleViewOid,
          metaMetadata: { brandId: brandA.id, type: 'rdmp' },
          authorization: { view: [], edit: [], viewRoles: [researcherKey], editRoles: [] },
        },
        {
          redboxOid: roleEditOid,
          metaMetadata: { brandId: brandA.id, type: 'rdmp' },
          authorization: { view: [], edit: [], viewRoles: [], editRoles: [researcherKey] },
        },
        {
          redboxOid: flatRoleEditOid,
          metaMetadata: { brandId: brandA.id, type: 'rdmp' },
          authorization_view: [],
          authorization_edit: [],
          authorization_viewRoles: [],
          authorization_editRoles: [researcherKey],
        },
        {
          redboxOid: noAclOid,
          metaMetadata: { brandId: brandA.id, type: 'rdmp' },
          authorization: { view: [], edit: [], viewRoles: [], editRoles: [] },
        },
        {
          redboxOid: foreignOid,
          metaMetadata: { brandId: brandB.id, type: 'rdmp' },
          authorization: { view: [researcherUser.username], edit: [researcherUser.username] },
        },
      ]).fetch();

      const anonymous = (await AuthorizationService.resolveRequestContext({
        params: { branding: brandA.id, portal: 'rdmp' },
        query: {},
        body: {},
        headers: {},
        session: { branding: brandA.id, portal: 'rdmp' },
        isAuthenticated: () => false,
      } as unknown as Sails.Req)) as AuthorizationContext;
      const invalidBearer = (await AuthorizationService.resolveRequestContext({
        params: { branding: brandA.id, portal: 'rdmp' },
        query: {},
        body: {},
        headers: { authorization: 'Bearer invalid' },
        session: { branding: brandA.id, portal: 'rdmp' },
        authorizationAuthMethod: 'bearer',
        isAuthenticated: () => false,
      } as unknown as Sails.Req)) as AuthorizationContext;
      const contexts = {
        authenticatedGuest: (await AuthorizationService.resolveUserContext(
          guestUser.id,
          brandA.id,
          'session'
        )) as AuthorizationContext,
        researcher: (await AuthorizationService.resolveUserContext(
          researcherUser.id,
          brandA.id,
          'session'
        )) as AuthorizationContext,
        librarian: (await AuthorizationService.resolveUserContext(
          librarianUser.id,
          brandA.id,
          'session'
        )) as AuthorizationContext,
        brandAdmin: (await AuthorizationService.resolveUserContext(
          brandAdminUser.id,
          brandA.id,
          'session'
        )) as AuthorizationContext,
        multipleRoleA: (await AuthorizationService.resolveUserContext(
          multipleRoleUser.id,
          brandA.id,
          'session'
        )) as AuthorizationContext,
        multipleRoleB: (await AuthorizationService.resolveUserContext(
          multipleRoleUser.id,
          brandB.id,
          'session'
        )) as AuthorizationContext,
        expired: (await AuthorizationService.resolveUserContext(
          expiredUser.id,
          brandA.id,
          'session'
        )) as AuthorizationContext,
        inactiveRole: (await AuthorizationService.resolveUserContext(
          inactiveRoleUser.id,
          brandA.id,
          'session'
        )) as AuthorizationContext,
        disabled: (await AuthorizationService.resolveUserContext(
          disabledUser.id,
          brandA.id,
          'session'
        )) as AuthorizationContext,
        bearer: (await AuthorizationService.resolveUserContext(researcherUser.id, brandA.id, 'bearer', [
          'record.read',
        ])) as AuthorizationContext,
      };
      const jobContext = freezeAuthorizationContext({
        contextType: 'brand',
        principal: {
          category: 'system-process',
          authMethod: 'internal',
          active: true,
          operationId: `phase7-resource-matrix-${suffix}`,
        },
        brand: { id: brandA.id, name: brandA.name, exists: true, authorized: true },
        grantedScopeKeys: [asScopeKey('record.read'), asScopeKey('record.read.all')],
        effectiveScopeKeys: [asScopeKey('record.read'), asScopeKey('record.read.all')],
      });

      expect(anonymous.principal.category).to.equal('anonymous');
      expect(invalidBearer.principal.active).to.equal(false);
      expect(contexts.authenticatedGuest.roleKeys).to.deep.equal(['Guest']);
      expect(contexts.researcher.roleKeys).to.include(researcherKey);
      expect(contexts.librarian.effectiveScopeKeys).to.include('record.read.all');
      expect(contexts.brandAdmin.roles.some(role => role.protectedKind === 'brand-admin')).to.equal(true);
      expect(fullContext.principal.category).to.equal('system-admin');
      expect(contexts.multipleRoleA.roles.filter(role => role.brandId === brandA.id)).to.have.length(3);
      expect(contexts.multipleRoleA.roles.some(role => role.brandId === brandB.id)).to.equal(false);
      expect(contexts.multipleRoleB.roles.some(role => role.brandId === brandA.id)).to.equal(false);
      expect(contexts.expired.roleKeys).to.deep.equal(['Guest']);
      expect(contexts.inactiveRole.roleKeys).to.deep.equal(['Guest']);
      expect(contexts.inactiveRole.resolutionEvidence.inactiveRoleIds).to.include(inactiveRole.id);
      expect(contexts.disabled.principal.active).to.equal(false);

      const gate = async (
        label: string,
        context: AuthorizationContext,
        oid: string,
        mode: 'read' | 'update',
        expectedAllowed: boolean,
        expectedReason?: string
      ) => {
        const scope = asScopeKey(mode === 'read' ? 'record.read' : 'record.update');
        const result = await RecordsService.getAuthorizedMeta(context, scope, oid, mode);
        expect(result.allowed, label).to.equal(expectedAllowed);
        if (!expectedAllowed && expectedReason) expect(result.decision.reasonCode, label).to.equal(expectedReason);
      };

      await gate('anonymous Guest action gate', anonymous, directViewOid, 'read', false, 'scope-missing');
      await gate(
        'authenticated Guest action gate',
        contexts.authenticatedGuest,
        directViewOid,
        'read',
        false,
        'scope-missing'
      );
      await gate('invalid bearer', invalidBearer, directViewOid, 'read', false, 'principal-inactive');
      await gate('disabled session', contexts.disabled, directViewOid, 'read', false, 'principal-inactive');
      await gate('expired assignment', contexts.expired, directViewOid, 'read', false, 'scope-missing');
      await gate('inactive role', contexts.inactiveRole, directViewOid, 'read', false, 'scope-missing');

      await gate('direct view ACL', contexts.researcher, directViewOid, 'read', true);
      await gate('direct view does not edit', contexts.researcher, directViewOid, 'update', false, 'record-acl-denied');
      await gate('direct edit ACL', contexts.researcher, directEditOid, 'update', true);
      await gate('direct edit implies view', contexts.researcher, directEditOid, 'read', true);
      await gate('role view ACL', contexts.researcher, roleViewOid, 'read', true);
      await gate('role view does not edit', contexts.researcher, roleViewOid, 'update', false, 'record-acl-denied');
      await gate('role edit ACL', contexts.researcher, roleEditOid, 'update', true);
      await gate('role edit implies view', contexts.researcher, roleEditOid, 'read', true);
      await gate('flat role edit ACL', contexts.researcher, flatRoleEditOid, 'update', true);
      await gate('flat role edit implies view', contexts.researcher, flatRoleEditOid, 'read', true);
      await gate('no ACL', contexts.researcher, noAclOid, 'read', false, 'record-acl-denied');

      await gate('valid bearer read', contexts.bearer, roleViewOid, 'read', true);
      await gate('valid bearer ceiling', contexts.bearer, directEditOid, 'update', false);
      await gate('Librarian broad read', contexts.librarian, noAclOid, 'read', true);
      await gate('Librarian broad update', contexts.librarian, noAclOid, 'update', true);
      await gate('Librarian broad flat projection read', contexts.librarian, flatRoleEditOid, 'read', true);
      await gate('brand Admin broad read', contexts.brandAdmin, noAclOid, 'read', true);
      await gate('brand Admin broad update', contexts.brandAdmin, noAclOid, 'update', true);
      await gate('multiple additive roles', contexts.multipleRoleA, noAclOid, 'read', true);
      await gate('system Admin plus active-brand role', fullContext, noAclOid, 'read', true);
      await gate('internal job explicit broad scope', jobContext, noAclOid, 'read', true);

      const researcherRoles = [...contexts.researcher.compatibilityRoles];
      const librarianRoles = [...contexts.librarian.compatibilityRoles];
      const expectedAclOids = [directViewOid, directEditOid, roleViewOid, roleEditOid].sort();
      const expectedBroadOids = [
        directViewOid,
        directEditOid,
        roleViewOid,
        roleEditOid,
        flatRoleEditOid,
        noAclOid,
      ].sort();
      const matrixOids = (records: Array<{ redboxOid?: string }>) =>
        records
          .map(record => record.redboxOid)
          .filter((oid): oid is string => oid?.startsWith('phase7-matrix-') === true)
          .sort();
      const listOids = async (username: string, roles: typeof researcherRoles, bypassRecordAcl: boolean) => {
        const listed = await RecordsService.getRecords(
          '',
          'rdmp',
          0,
          100,
          username,
          roles,
          brandA,
          false,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          bypassRecordAcl
        );
        return matrixOids(listed.items);
      };
      const exportOids = async (username: string, roles: typeof researcherRoles, bypassRecordAcl: boolean) => {
        const exportStream = RecordsService.exportAllPlans(
          username,
          roles,
          brandA,
          'json',
          undefined,
          undefined,
          'rdmp',
          bypassRecordAcl
        );
        const chunks: Buffer[] = [];
        for await (const chunk of exportStream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const exported = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          records: Array<{ redboxOid?: string }>;
        };
        return matrixOids(exported.records);
      };

      for (const record of matrixRecords as Array<Record<string, unknown>>) {
        indexedRecords.push(record);
        await SolrSearchService.solrAddOrUpdate({ attrs: { data: record } });
      }
      const searchOids = async (username: string, roles: typeof researcherRoles, bypassRecordAcl: boolean) => {
        const searched = await SolrSearchService.searchFuzzy(
          'default',
          'rdmp',
          '',
          '*',
          [],
          [],
          brandA,
          { username },
          roles,
          ['redboxOid'],
          0,
          100,
          bypassRecordAcl
        );
        return matrixOids(searched.records as Array<{ redboxOid?: string }>);
      };

      expect(await listOids(researcherUser.username, researcherRoles, false)).to.deep.equal(expectedAclOids);
      expect(await exportOids(researcherUser.username, researcherRoles, false)).to.deep.equal(expectedAclOids);
      expect(await searchOids(researcherUser.username, researcherRoles, false)).to.deep.equal(expectedAclOids);
      expect(await listOids(librarianUser.username, librarianRoles, true)).to.deep.equal(expectedBroadOids);
      expect(await exportOids(librarianUser.username, librarianRoles, true)).to.deep.equal(expectedBroadOids);
      expect(await searchOids(librarianUser.username, librarianRoles, true)).to.deep.equal(expectedBroadOids);

      for (const [label, context] of [
        ['Researcher', contexts.researcher],
        ['Librarian', contexts.librarian],
        ['brand Admin', contexts.brandAdmin],
        ['system Admin', fullContext],
        ['internal job', jobContext],
      ] as const) {
        await gate(`${label} cross-brand`, context, foreignOid, 'read', false, 'resource-not-found');
        await gate(`${label} missing`, context, `phase7-matrix-missing-${suffix}`, 'read', false, 'resource-not-found');
      }
    } finally {
      for (const record of indexedRecords) {
        await SolrSearchService.solrDelete({ attrs: { data: record } });
      }
      if (assignmentIds.length > 0) await RoleAssignment.destroy({ id: assignmentIds });
      if (inactiveRoleId) await Role.destroy({ id: inactiveRoleId });
      if (users.length > 0) await User.destroy({ id: users.map(user => user.id) });
    }
  });

  it('applies the same opaque brand and ACL decisions to deleted records', async () => {
    const directOid = `phase7-deleted-direct-${suffix}`;
    const deniedOid = `phase7-deleted-denied-${suffix}`;
    const foreignOid = `phase7-deleted-foreign-${suffix}`;
    createdDeletedRecordOids.push(directOid, deniedOid, foreignOid);
    await DeletedRecord.createEach([
      {
        redboxOid: directOid,
        brandId: brandA.id,
        deletedRecordMetadata: {
          redboxOid: directOid,
          metaMetadata: { brandId: brandA.id, type: 'rdmp' },
          authorization: { view: ['admin'], edit: [], viewRoles: [], editRoles: [] },
        },
      },
      {
        redboxOid: deniedOid,
        brandId: brandA.id,
        deletedRecordMetadata: {
          redboxOid: deniedOid,
          metaMetadata: { brandId: brandA.id, type: 'rdmp' },
          authorization: { view: [], edit: [], viewRoles: [], editRoles: [] },
        },
      },
      {
        redboxOid: foreignOid,
        brandId: brandB.id,
        deletedRecordMetadata: {
          redboxOid: foreignOid,
          metaMetadata: { brandId: brandB.id, type: 'rdmp' },
          authorization: { view: ['admin'], edit: [], viewRoles: [], editRoles: [] },
        },
      },
    ]);

    const requiredScope = asScopeKey('record.read');
    expect(
      (await RecordsService.getAuthorizedDeletedRecordMeta(aclContext, requiredScope, directOid, 'read')).allowed
    ).to.equal(true);
    const denied = await RecordsService.getAuthorizedDeletedRecordMeta(aclContext, requiredScope, deniedOid, 'read');
    expect(denied.allowed).to.equal(false);
    expect(denied.decision.reasonCode).to.equal('record-acl-denied');
    const foreign = await RecordsService.getAuthorizedDeletedRecordMeta(aclContext, requiredScope, foreignOid, 'read');
    expect(foreign.allowed).to.equal(false);
    expect(foreign.decision.reasonCode).to.equal('resource-not-found');
  });

  it('constrains configuration and workflow entity families to the authoritative brand', async () => {
    const formName = `phase7-form-${suffix}`;
    const recordTypeName = `phase7-record-type-${suffix}`;
    const workflowName = `phase7-workflow-${suffix}`;
    const reportName = `phase7-report-${suffix}`;
    const queryName = `phase7-query-${suffix}`;
    const dashboardName = `phase7-dashboard-${suffix}`;
    const appConfigKey = `phase7-app-config-${suffix}`;
    const translationKey = `phase7.translation.${suffix}`;

    const form = await Form.create({
      name: formName,
      branding: brandB.id,
      configuration: { name: formName, type: recordTypeName, componentDefinitions: [] },
    }).fetch();
    foreignFormId = form.id;
    const recordType = await RecordType.create({
      name: recordTypeName,
      branding: brandB.id,
      packageType: 'dataset',
    }).fetch();
    foreignRecordTypeId = recordType.id;
    const workflowStep = await WorkflowStep.create({
      name: workflowName,
      form: form.id,
      config: { form: formName },
      starting: true,
      recordType: recordType.id,
    }).fetch();
    foreignWorkflowStepId = workflowStep.id;
    const report = await RBReport.create({
      name: reportName,
      title: 'Foreign phase 7 report',
      branding: brandB.id,
      filter: {},
      columns: [],
    }).fetch();
    foreignReportId = report.id;
    const namedQuery = await NamedQuery.create({
      name: queryName,
      branding: brandB.id,
      mongoQuery: '{}',
      queryParams: '{}',
      collectionName: 'record',
      resultObjectMapping: '{}',
      brandIdFieldPath: 'metaMetadata.brandId',
    }).fetch();
    foreignNamedQueryId = namedQuery.id;
    const dashboardType = await DashboardType.create({
      name: dashboardName,
      branding: brandB.id,
      formatRules: {},
      tableConfig: {},
    }).fetch();
    foreignDashboardTypeId = dashboardType.id;
    const appConfig = await AppConfig.create({
      configKey: appConfigKey,
      branding: brandB.id,
      configData: { secretMarker: `foreign-${suffix}` },
    }).fetch();
    foreignAppConfigId = appConfig.id;
    const translation = await I18nTranslation.create({
      key: translationKey,
      locale: 'en',
      namespace: 'phase7',
      value: `foreign-${suffix}`,
      branding: brandB.id,
    }).fetch();
    foreignTranslationId = translation.id;

    expect(await firstValueFrom(FormsService.getFormByName(formName, true, brandA.id))).to.equal(null);
    expect(await firstValueFrom(RecordTypesService.get(brandA, recordTypeName))).to.equal(undefined);
    expect(await firstValueFrom(WorkflowStepsService.get({ id: 'missing-brand-a-parent' }, workflowName))).to.equal(
      undefined
    );
    expect(await ReportsService.get(brandA, reportName)).to.equal(undefined);
    expect(await NamedQueryService.getNamedQueryConfig(brandA, queryName)).to.equal(null);
    expect(await firstValueFrom(DashboardTypesService.get(brandA, dashboardName))).to.equal(undefined);
    expect(
      (await AppConfigService.getAllConfigurationForBrand(brandA.id)).map((entry: { id: string }) => entry.id)
    ).not.to.include(appConfig.id);
    expect(await I18nEntriesService.getEntry(brandA, 'en', 'phase7', translationKey)).to.equal(undefined);

    expect(await firstValueFrom(FormsService.getFormByName(formName, true, brandB.id))).to.have.property('id', form.id);
    expect(await firstValueFrom(RecordTypesService.get(brandB, recordTypeName))).to.have.property('id', recordType.id);
    expect(await ReportsService.get(brandB, reportName)).to.have.property('id', report.id);
    expect(await NamedQueryService.getNamedQueryConfig(brandB, queryName)).not.to.equal(null);
    expect(await firstValueFrom(DashboardTypesService.get(brandB, dashboardName))).to.have.property(
      'id',
      dashboardType.id
    );
    expect(await I18nEntriesService.getEntry(brandB, 'en', 'phase7', translationKey)).to.have.property(
      'id',
      translation.id
    );
  });

  it('constrains harvest state and user/account resources to the authoritative brand', async () => {
    const harvestRun = await HarvestRun.create({
      sourceRunId: `phase7-source-run-${suffix}`,
      brandId: brandB.id,
      recordType: 'rdmp',
      sourceName: `phase7-source-${suffix}`,
      startedAt: new Date().toISOString(),
    }).fetch();
    foreignHarvestRunId = harvestRun.id;

    expect(await HarvestRunService.getRun(brandA, harvestRun.id)).to.equal(null);
    expect(await HarvestRunService.getRun(brandB, harvestRun.id)).to.have.nested.property('run.id', harvestRun.id);

    const role = await Role.create({
      name: `Phase7ForeignRole-${suffix}`,
      branding: brandB.id,
    }).fetch();
    foreignRoleId = role.id;
    const user = await User.create({
      username: `phase7-foreign-${suffix}`,
      password: `phase7-password-${suffix}`,
      type: 'local',
      name: 'Local Admin',
      email: `phase7-foreign-${suffix}@example.test`,
    }).fetch();
    foreignUserId = user.id;
    await User.addToCollection(user.id, 'roles').members([role.id]);

    expect(await firstValueFrom(UsersService.getUserForBrand(user.id, brandA.id))).to.equal(null);
    expect(await firstValueFrom(UsersService.getUserForBrand(user.id, brandB.id))).to.have.property('id', user.id);

    let crossBrandError: { status?: number; code?: string } | undefined;
    try {
      await UsersService.disableUserForBrand(user.id, 'admin', brandA.id);
    } catch (error) {
      crossBrandError = error as { status?: number; code?: string };
    }
    expect(crossBrandError).to.include({ status: 404, code: 'authorization.not-found' });
    expect((await User.findOne({ id: user.id })).loginDisabled).not.to.equal(true);
  });
});
