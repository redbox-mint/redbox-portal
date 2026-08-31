import {
  AUTHORIZATION_PERSISTENCE_MODEL_INDEXES,
  runWithRequiredTransaction,
  type RoleAssignmentCreateRecord,
} from '@researchdatabox/redbox-core';

interface MongoIndexInfo {
  readonly key: Readonly<Record<string, unknown>>;
  readonly name: string;
  readonly partialFilterExpression?: Readonly<Record<string, unknown>>;
  readonly sparse?: boolean;
  readonly unique?: boolean;
}

interface MongoModelInfo {
  readonly attributes: Readonly<Record<string, { readonly columnName?: string }>>;
  readonly tableName: string;
  getDatastore(): {
    readonly manager: {
      collection(name: string): { indexes(): Promise<MongoIndexInfo[]> };
    };
  };
}

function physicalFields(
  model: MongoModelInfo,
  fields: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(fields).map(([attributeName, value]) => [
      model.attributes[attributeName]?.columnName ?? attributeName,
      value,
    ])
  );
}

describe('Authorization persistence models', function () {
  this.timeout(30_000);

  const suffix = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  async function expectRejected(promise: Promise<unknown>, message?: RegExp) {
    let rejection: unknown;
    try {
      await promise;
    } catch (error) {
      rejection = error;
    }
    if (rejection === undefined) {
      expect.fail('Expected the operation to reject.');
    }
    if (message !== undefined) {
      expect(String(rejection instanceof Error ? rejection.message : rejection)).to.match(message);
    }
  }

  async function defaultBrand() {
    const brand = await BrandingConfig.findOne({ name: 'default' });
    expect(brand).to.exist;
    return brand;
  }

  async function createScope(key: string) {
    return AuthorizationScope.create({
      key,
      namespace: 'phase2',
      label: key,
      description: 'Phase 2 integration-test scope.',
      risk: 'read',
      sourceType: 'core',
      sourcePackage: '@researchdatabox/redbox-core',
      sourceVersion: '0.0.1',
      status: 'active',
      lastSeenGeneration: 'phase-2-test',
      metadataVersion: 1,
    }).fetch();
  }

  async function createBrandRole(name: string, branding: string, protectedKind = 'none') {
    return Role.create({
      name,
      key: name,
      displayName: `Display ${name}`,
      description: 'Phase 2 integration-test role.',
      contextType: 'brand',
      branding,
      protectedKind,
      status: 'active',
      version: 1,
      createdBy: 'integration-test',
    }).fetch();
  }

  async function createRoleAssignment(input: RoleAssignmentCreateRecord) {
    return runWithRequiredTransaction(RoleAssignment.getDatastore(), connection =>
      AuthorizationPersistenceService.createRoleAssignment(input, connection)
    );
  }

  it('lifts every new model and safely accepts multiple legacy roles without identityKey', async () => {
    for (const modelName of [
      'AuthorizationAudit',
      'AuthorizationScope',
      'AuthorizationShadowMismatch',
      'RoleAssignment',
      'RoleScopeOverride',
      'RoleTemplate',
      'RoleTemplateRevision',
    ]) {
      expect(sails.models).to.have.property(modelName.toLowerCase());
    }
    // Phase 3 migration backfills `identityKey` for every reachable legacy role, so this
    // must create its own pre-migration rows rather than depend on bootstrap leftovers.
    // Two rows with no `identityKey` must coexist: the unique index is sparse, and the
    // Role lifecycle deletes the field instead of persisting Waterline's `''` base value.
    const id = suffix();
    const brand = await defaultBrand();
    const legacy = [];
    for (const name of [`Legacy Sparse A ${id}`, `Legacy Sparse B ${id}`]) {
      legacy.push(await Role.create({ name, branding: brand.id }).fetch());
    }
    const stored = await Role.find({ id: legacy.map(role => role.id) });
    expect(stored).to.have.length(2);
    expect(stored.every((role: { identityKey?: string }) => !role.identityKey)).to.equal(true);
    await Role.destroy({ id: legacy.map(role => role.id) });
  });

  it('materializes every required native Mongo index without an unsafe Role identity index', async () => {
    for (const definition of AUTHORIZATION_PERSISTENCE_MODEL_INDEXES) {
      const model: MongoModelInfo | undefined = sails.models[definition.modelIdentity];
      expect(model, `${definition.modelIdentity} must be loaded`).to.exist;
      if (model === undefined) {
        throw new Error(`${definition.modelIdentity} must be loaded.`);
      }
      const indexes = await model.getDatastore().manager.collection(model.tableName).indexes();
      for (const required of definition.indexes) {
        const existing = indexes.find(index => index.name === required.name);
        expect(existing, `${model.tableName}.${required.name} must exist`).to.exist;
        expect(existing?.key).to.deep.equal(physicalFields(model, required.key));
        expect(existing?.unique === true).to.equal(required.unique === true);
        expect(existing?.sparse === true).to.equal(required.sparse === true);
        expect(existing?.partialFilterExpression).to.deep.equal(
          required.partialFilterExpression === undefined
            ? undefined
            : physicalFields(model, required.partialFilterExpression)
        );
      }
    }
  });

  it('enforces catalog, template-revision, and role-override uniqueness', async () => {
    const id = suffix();
    const scopeKey = `phase2.scope-${id}`;
    const scope = await createScope(scopeKey);
    const template = await RoleTemplate.create({
      key: `phase2-${id}`,
      displayName: 'Phase 2 template',
      description: 'Phase 2 integration-test template.',
      currentRevision: 1,
      protectedKind: 'none',
      status: 'active',
      version: 1,
    }).fetch();
    const brand = await defaultBrand();
    const role = await createBrandRole(`Role Exact ${id}`, brand.id);
    try {
      expect(scope.key).to.equal(scopeKey);
      await expectRejected(createScope(scopeKey));

      await RoleTemplateRevision.create({
        template: template.id,
        revision: 1,
        scopeKeys: [scopeKey],
        publishedBy: 'integration-test',
        publishedAt: new Date(),
      }).fetch();
      await expectRejected(
        RoleTemplateRevision.create({
          template: template.id,
          revision: 1,
          scopeKeys: [scopeKey],
          publishedBy: 'integration-test',
          publishedAt: new Date(),
        }).fetch()
      );

      await RoleScopeOverride.create({
        role: role.id,
        scopeKey,
        effect: 'add',
        createdBy: 'integration-test',
      }).fetch();
      await expectRejected(
        RoleScopeOverride.create({
          role: role.id,
          scopeKey,
          effect: 'remove',
          createdBy: 'integration-test',
        }).fetch()
      );
    } finally {
      await RoleScopeOverride.destroy({ role: role.id });
      await Role.destroy({ id: role.id });
      const templateCollection = RoleTemplate.getDatastore().manager.collection(RoleTemplate.tableName);
      const templateRevisionCollection = RoleTemplateRevision.getDatastore().manager.collection(
        RoleTemplateRevision.tableName
      );
      const storedTemplate = await templateCollection.findOne({ key: template.key });
      if (storedTemplate !== null) {
        await templateRevisionCollection.deleteMany({ template: storedTemplate._id });
        await templateCollection.deleteOne({ _id: storedTemplate._id });
      }
      await AuthorizationScope.destroy({ id: scope.id });
    }
  });

  it('allows distinct assignment sources but rejects source-tuple duplicates', async () => {
    const id = suffix();
    const brand = await defaultBrand();
    const role = await createBrandRole(`Assignment Role ${id}`, brand.id);
    const common = {
      principalType: 'user',
      principalId: `user-${id}`,
      role: role.id,
      branding: brand.id,
      status: 'active',
      sourcePresent: true,
      assignedBy: 'integration-test',
      assignedAt: new Date(),
      version: 1,
    };
    await createRoleAssignment({ ...common, source: 'manual', sourceKey: 'manual' });
    await createRoleAssignment({ ...common, source: 'external', sourceKey: 'idp:researchers' });
    await expectRejected(createRoleAssignment({ ...common, source: 'manual', sourceKey: 'manual' }));

    expect(await RoleAssignment.count({ principalId: common.principalId, role: role.id })).to.equal(2);
  });

  it('rejects wrong-brand and explicit Guest assignments', async () => {
    const id = suffix();
    const brand = await defaultBrand();
    const otherBrand = await BrandingConfig.create({ name: `phase2-brand-${id}` }).fetch();
    const role = await createBrandRole(`Context Role ${id}`, brand.id);
    const assignment = {
      principalType: 'user',
      principalId: `user-${id}`,
      role: role.id,
      source: 'manual',
      sourceKey: 'manual',
      status: 'active',
      sourcePresent: true,
      assignedBy: 'integration-test',
      assignedAt: new Date(),
      version: 1,
    };
    await expectRejected(createRoleAssignment({ ...assignment, branding: otherBrand.id }), /must match its brand role/);

    const guest = await createBrandRole(`Guest Exact ${id}`, brand.id, 'guest');
    await expectRejected(
      createRoleAssignment({ ...assignment, role: guest.id, branding: brand.id }),
      /Guest is implicit/
    );
  });

  it('validates an assignment against a Role created on the same transaction connection', async () => {
    const id = suffix();
    const brand = await defaultBrand();
    const principalId = `transaction-user-${id}`;
    const result = await runWithRequiredTransaction(Role.getDatastore(), async connection => {
      const role = await Role.create({
        name: `Transactional Assignment Role ${id}`,
        key: `Transactional Assignment Role ${id}`,
        displayName: `Transactional Assignment Role ${id}`,
        contextType: 'brand',
        branding: brand.id,
        protectedKind: 'none',
        status: 'active',
        version: 1,
        createdBy: 'integration-test',
      })
        .fetch()
        .usingConnection(connection);
      const assignment = await AuthorizationPersistenceService.createRoleAssignment(
        {
          principalType: 'user',
          principalId,
          role: role.id,
          branding: brand.id,
          source: 'manual',
          sourceKey: 'manual',
          status: 'active',
          sourcePresent: true,
          assignedBy: 'integration-test',
          assignedAt: new Date(),
          version: 1,
        },
        connection
      );
      return { assignmentId: assignment.id, roleId: role.id };
    });

    expect(await Role.findOne({ id: result.roleId })).to.exist;
    expect(await RoleAssignment.findOne({ id: result.assignmentId, principalId })).to.exist;
  });

  it('redacts audit state, prevents updates, and keeps shadow evidence separate', async () => {
    const id = suffix();
    const audit = await AuthorizationAudit.create({
      eventId: `event-${id}`,
      schemaVersion: 1,
      eventType: 'role.updated',
      outcome: 'succeeded',
      actorType: 'operator',
      actorId: 'integration-test',
      authMethod: 'operator',
      targetType: 'role',
      targetId: `role-${id}`,
      before: { password: 'secret', safe: 'before' },
      after: { rawClaims: { private: true }, safe: 'after' },
      occurredAt: new Date(),
    }).fetch();
    expect(audit.before).to.deep.equal({ safe: 'before' });
    expect(audit.after).to.deep.equal({ safe: 'after' });
    await expectRejected(AuthorizationAudit.updateOne({ id: audit.id }).set({ reason: 'edited' }), /append-only/);

    const mismatch = await AuthorizationShadowMismatch.create({
      fingerprint: `fingerprint-${id}`,
      routeId: 'GET:/api/records/:id',
      legacyOutcome: 'allow',
      scopeOutcome: 'deny',
      reasonCode: 'scope-missing',
      principalCategory: 'authenticated',
      count: 1,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      sampleRequestId: `request-${id}`,
    }).fetch();
    expect(mismatch).not.to.have.property('actorId');
    expect(mismatch).not.to.have.property('before');
    expect(mismatch).not.to.have.property('after');
  });

  it('commits state with its success audit and rolls both back on failure', async () => {
    const id = suffix();
    const brand = await defaultBrand();
    const committedRoleName = `Committed Role ${id}`;
    const committedRole = await runWithRequiredTransaction(Role.getDatastore(), async connection => {
      const role = await Role.create({
        name: committedRoleName,
        key: committedRoleName,
        displayName: committedRoleName,
        contextType: 'brand',
        branding: brand.id,
        protectedKind: 'none',
        status: 'active',
        version: 1,
      })
        .fetch()
        .usingConnection(connection);
      await AuthorizationAuditService.createSucceededEvent(
        {
          eventType: 'role.created',
          actorType: 'operator',
          actorId: 'integration-test',
          authMethod: 'operator',
          brandId: brand.id,
          targetType: 'role',
          targetId: role.id,
          after: { name: role.name },
        },
        connection
      );
      return role;
    });
    expect(await Role.findOne({ id: committedRole.id })).to.exist;
    expect(
      await AuthorizationAudit.count({ targetType: 'role', targetId: committedRole.id, outcome: 'succeeded' })
    ).to.equal(1);

    const rolledBackRoleName = `Rolled Back Role ${id}`;
    let rolledBackRoleId: string | undefined;
    await expectRejected(
      runWithRequiredTransaction(Role.getDatastore(), async connection => {
        const role = await Role.create({
          name: rolledBackRoleName,
          key: rolledBackRoleName,
          displayName: rolledBackRoleName,
          contextType: 'brand',
          branding: brand.id,
          protectedKind: 'none',
          status: 'active',
          version: 1,
        })
          .fetch()
          .usingConnection(connection);
        rolledBackRoleId = role.id;
        await AuthorizationAuditService.createSucceededEvent(
          {
            eventType: 'role.created',
            actorType: 'operator',
            actorId: '',
            authMethod: 'operator',
            targetType: 'role',
            targetId: role.id,
          },
          connection
        );
      })
    );
    expect(await Role.findOne({ name: rolledBackRoleName })).not.to.exist;
    expect(rolledBackRoleId).to.be.a('string');
    expect(await AuthorizationAudit.count({ targetType: 'role', targetId: rolledBackRoleId })).to.equal(0);

    const failedPrimaryTargetId = `failed-primary-${id}`;
    await expectRejected(
      runWithRequiredTransaction(Role.getDatastore(), async connection => {
        await Role.create({
          name: committedRoleName,
          key: committedRoleName,
          displayName: committedRoleName,
          contextType: 'brand',
          branding: brand.id,
          protectedKind: 'none',
          status: 'active',
          version: 1,
        })
          .fetch()
          .usingConnection(connection);
        await AuthorizationAuditService.createSucceededEvent(
          {
            eventType: 'role.created',
            actorType: 'operator',
            actorId: 'integration-test',
            authMethod: 'operator',
            targetType: 'role',
            targetId: failedPrimaryTargetId,
          },
          connection
        );
      })
    );
    expect(await AuthorizationAudit.count({ targetId: failedPrimaryTargetId })).to.equal(0);

    const associationRole = await Role.create({ name: `Association Role ${id}` }).fetch();
    await expectRejected(
      runWithRequiredTransaction(Role.getDatastore(), async connection => {
        await BrandingConfig.addToCollection(brand.id, 'roles')
          .members([associationRole.id])
          .usingConnection(connection);
        const associated = await Role.findOne({ id: associationRole.id }).usingConnection(connection);
        expect(associated?.branding).to.equal(brand.id);
        throw new Error('force association rollback');
      })
    );
    const associationAfterRollback = await Role.findOne({ id: associationRole.id });
    expect(associationAfterRollback?.branding).not.to.equal(brand.id);
  });
});
