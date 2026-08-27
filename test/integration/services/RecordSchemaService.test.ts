import {
  BrandingModel,
  RECORD_CONTRACT_FORMAT_V1,
  RECORD_SCHEMA_PROBLEM_CODES,
  RecordContractContributorRegistry,
  RecordSchemaService,
  RoleModel,
  StorageServiceResponse,
  UserModel,
  createCoreRecordContractContributors,
  getDiscoveredRecordContractContributorRegistry,
  identifyRecordJsonSchema,
  recordSchema,
  type RecordContractComponentContributor,
  type RecordContractContributorRegistration,
  type RecordSchemaArtifactInput,
  type RecordSchemaReferenceInput,
} from '@researchdatabox/redbox-core';
import type { FormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';

const DIGEST = 'e'.repeat(64);
const DOCUMENT = { type: 'object', title: 'Integration schema' } as const;
const RETENTION_CURSOR = `${'f'.repeat(63)}9`;
const RETENTION_DIGESTS = ['a', 'b', 'c', 'd', 'e'].map(suffix => `${'f'.repeat(63)}${suffix}`);

describe('RecordSchemaService storage-backed orchestration', function () {
  const storage = () => sails.services.mongostorageservice;

  afterEach(async function () {
    await sails.models.recordschemareference.destroy({ digest: DIGEST });
    await sails.models.recordschemaartifact.destroy({ digest: DIGEST });
    for (const digest of RETENTION_DIGESTS) {
      await sails.models.recordschemareference.destroy({ digest });
      await sails.models.recordschemaartifact.destroy({ digest });
    }
  });

  it('materializes pins and maintains idempotent save usage against durable storage', async function () {
    const artifact: RecordSchemaArtifactInput = {
      digest: DIGEST,
      document: DOCUMENT,
      contractFormat: RECORD_CONTRACT_FORMAT_V1,
      completeness: 'complete',
      byteLength: Buffer.byteLength(JSON.stringify(DOCUMENT), 'utf8'),
    };
    expect((await storage().putRecordSchemaArtifact(artifact)).success).to.equal(true);

    const config = {
      ...structuredClone(recordSchema),
      enabled: true,
      retention: { minimumAgeDays: 1 },
      integrationPins: [
        {
          digest: DIGEST,
          brand: 'default',
          portal: 'rdmp',
          schemaKind: 'update',
          recordType: 'dataset',
          operation: 'strict-all',
          owner: 'integration-test',
          purpose: 'Verify durable task 5.10 orchestration.',
          expiresAt: '2030-01-01T00:00:00.000Z',
          rawSecret: 'must-not-persist',
        },
      ],
    };
    const service = new RecordSchemaService.Services.RecordSchema({
      getConfig: () => config,
      getStorageProvider: storage,
    });
    const request = {
      digest: DIGEST,
      brand: 'default',
      portal: 'rdmp',
      schemaKind: 'update',
      recordType: 'dataset',
      oid: 'integration-oid',
      operation: 'publish',
      saveIdentity: 'integration-save-identity',
      rawSecret: 'must-not-persist',
    };

    const pins = await service.materializeIntegrationPins();
    const firstSave = await service.persistSaveUsageReference(request);
    const retrySave = await service.persistSaveUsageReference(request);
    const references = await storage().listRecordSchemaReferences({
      digest: DIGEST,
      includeExpiredPins: true,
      limit: 10,
      offset: 0,
    });
    const report = await service.reportRetention({
      mode: 'targeted',
      digests: [DIGEST],
      now: new Date('2026-08-24T00:00:00.000Z'),
    });

    expect(pins.kind).to.equal('materialized');
    expect(firstSave.kind).to.equal('recorded');
    expect(retrySave).to.deep.equal(firstSave);
    expect(references.map(reference => reference.kind).sort()).to.deep.equal(['pin', 'save']);
    expect(JSON.stringify(references)).not.to.include('integration-save-identity');
    expect(JSON.stringify(references)).not.to.include('must-not-persist');
    expect(report.kind).to.equal('reported');
    if (report.kind !== 'reported') throw new Error('Expected durable retention report.');
    expect(report.entries).to.have.length(1);
    expect(report.entries[0]).to.deep.include({ saveCount: 1, activePinCount: 1, eligibleForDeletion: false });
  });

  it('rejects digest collisions and protects referenced artifacts from deletion', async function () {
    const artifact: RecordSchemaArtifactInput = {
      digest: DIGEST,
      document: DOCUMENT,
      contractFormat: RECORD_CONTRACT_FORMAT_V1,
      completeness: 'complete',
      byteLength: Buffer.byteLength(JSON.stringify(DOCUMENT), 'utf8'),
    };
    expect((await storage().putRecordSchemaArtifact(artifact)).success).to.equal(true);

    const collisionDocument = { type: 'object', title: 'Conflicting integration schema' } as const;
    const collision = await storage().putRecordSchemaArtifact({
      ...artifact,
      document: collisionDocument,
      byteLength: Buffer.byteLength(JSON.stringify(collisionDocument), 'utf8'),
    });
    expect(collision.success).to.equal(false);
    expect(collision.details).to.deep.equal({ code: RECORD_SCHEMA_PROBLEM_CODES.DIGEST_COLLISION });
    expect((await storage().getRecordSchemaArtifact(DIGEST))?.document).to.deep.equal(DOCUMENT);

    await sails.models.recordschemaartifact
      .updateOne({ digest: DIGEST })
      .set({ createdAt: new Date('2025-01-01T00:00:00.000Z') });
    const reference: RecordSchemaReferenceInput = {
      referenceKey: 'durability-review-grant',
      digest: DIGEST,
      kind: 'grant',
      brand: 'default',
      portal: 'rdmp',
      schemaKind: 'create',
      recordType: 'dataset',
      operation: 'strict-all',
    };
    expect((await storage().putRecordSchemaReference(reference)).success).to.equal(true);

    const deletion = await storage().deleteRecordSchemaArtifactIfUnreferenced({
      digest: DIGEST,
      now: new Date('2026-08-24T00:00:00.000Z'),
      minimumAgeDays: 365,
    });
    expect(deletion.success).to.equal(true);
    expect(deletion.data).to.deep.equal({
      kind: 'retained',
      digest: DIGEST,
      reasons: ['grant-reference'],
    });
    expect(await storage().getRecordSchemaArtifact(DIGEST)).not.to.equal(null);
  });

  it('reports every retention reason through stable redacted storage-backed pages', async function () {
    const now = new Date('2026-08-24T00:00:00.000Z');
    const createdAt = [
      new Date('2026-08-14T00:00:00.000Z'),
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-01-01T00:00:00.000Z'),
    ];
    for (const [index, digest] of RETENTION_DIGESTS.entries()) {
      const document = { type: 'object', title: `private-retention-schema-${index}` } as const;
      const artifact: RecordSchemaArtifactInput = {
        digest,
        document,
        contractFormat: RECORD_CONTRACT_FORMAT_V1,
        completeness: 'complete',
        byteLength: Buffer.byteLength(JSON.stringify(document), 'utf8'),
      };
      expect((await storage().putRecordSchemaArtifact(artifact)).success).to.equal(true);
      await sails.models.recordschemaartifact.updateOne({ digest }).set({ createdAt: createdAt[index] });
    }

    const commonReference = (referenceKey: string, digest: string) => ({
      referenceKey,
      digest,
      brand: 'default',
      portal: 'rdmp',
      recordType: 'dataset',
      operation: 'strict-all',
    });
    const references: RecordSchemaReferenceInput[] = [
      {
        ...commonReference('retention-integration-grant', RETENTION_DIGESTS[1]),
        kind: 'grant',
        schemaKind: 'create',
      },
      {
        ...commonReference('retention-integration-save', RETENTION_DIGESTS[2]),
        kind: 'save',
        schemaKind: 'update',
        oid: 'private-retention-oid',
      },
      {
        ...commonReference('retention-integration-active-pin', RETENTION_DIGESTS[3]),
        kind: 'pin',
        schemaKind: 'create',
        owner: 'private-retention-owner',
        purpose: 'private active retention purpose',
        expiresAt: new Date('2026-09-01T00:00:00.000Z'),
      },
      {
        ...commonReference('retention-integration-expired-pin', RETENTION_DIGESTS[4]),
        kind: 'pin',
        schemaKind: 'create',
        owner: 'private-retention-owner',
        purpose: 'private expired retention purpose',
        expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    ];
    for (const reference of references) {
      expect((await storage().putRecordSchemaReference(reference)).success).to.equal(true);
    }

    const service = new RecordSchemaService.Services.RecordSchema({
      getConfig: () => ({
        ...structuredClone(recordSchema),
        enabled: true,
        retention: { minimumAgeDays: 30 },
      }),
      getStorageProvider: storage,
    });
    const firstRequest = { mode: 'paginated', now, limit: 3, cursor: RETENTION_CURSOR } as const;
    const first = await service.reportRetention(firstRequest);
    const repeated = await service.reportRetention(firstRequest);
    const second = await service.reportRetention({
      mode: 'paginated',
      now,
      limit: 3,
      cursor: RETENTION_DIGESTS[2],
    });
    const summaries = await storage().listRecordSchemaArtifacts({ afterDigest: RETENTION_CURSOR, limit: 5 });

    expect(repeated).to.deep.equal(first);
    expect(first.kind).to.equal('reported');
    expect(second.kind).to.equal('reported');
    if (first.kind !== 'reported' || second.kind !== 'reported') {
      throw new Error('Expected storage-backed retention report pages.');
    }
    expect(first.entries.map(entry => entry.digest)).to.deep.equal(RETENTION_DIGESTS.slice(0, 3));
    expect(second.entries.map(entry => entry.digest)).to.deep.equal(RETENTION_DIGESTS.slice(3));
    expect(first.page).to.deep.equal({ limit: 3, nextCursor: RETENTION_DIGESTS[2] });
    expect(second.page).to.deep.equal({ limit: 3 });
    expect(first.entries[0]).to.deep.include({
      ageDays: 10,
      reasons: ['minimum-age'],
      eligibleForDeletion: false,
    });
    expect(first.entries[1]).to.deep.include({
      grantCount: 1,
      reasons: ['grant-reference'],
      eligibleForDeletion: false,
    });
    expect(first.entries[2]).to.deep.include({
      saveCount: 1,
      reasons: ['save-reference'],
      eligibleForDeletion: false,
    });
    expect(second.entries[0]).to.deep.include({
      activePinCount: 1,
      reasons: ['active-pin'],
      eligibleForDeletion: false,
    });
    expect(second.entries[1]).to.deep.include({
      activePinCount: 0,
      reasons: [],
      eligibleForDeletion: true,
    });
    expect(summaries.map(summary => summary.digest)).to.deep.equal(RETENTION_DIGESTS);
    expect(summaries.every(summary => Object.keys(summary).sort().join(',') === 'createdAt,digest')).to.equal(true);
    const serialized = JSON.stringify({ first, second, summaries });
    expect(serialized).not.to.include('private-retention-schema');
    expect(serialized).not.to.include('private-retention-owner');
    expect(serialized).not.to.include('private-retention-oid');
    expect(await sails.models.recordschemaartifact.count({ digest: { in: RETENTION_DIGESTS } })).to.equal(5);
  });
});

describe('RecordSchemaService configured-form integration', function () {
  const persistedDigests = new Set<string>();
  const persistedRecordOids = new Set<string>();
  const storage = () => sails.services.mongostorageservice;
  const config = {
    ...structuredClone(recordSchema),
    enabled: true,
  };

  function caller(username: string, brandId: string, brandName = brandId) {
    const role = new RoleModel();
    role.id = 'integration-admin-role';
    role.name = 'Admin';
    const brand = new BrandingModel();
    brand.id = brandId;
    brand.name = brandName;
    brand.roles = [role];
    const user = new UserModel();
    user.id = username;
    user.username = username;
    user.name = username;
    user.email = `${username}@example.test`;
    user.roles = [role];
    return { brand, user };
  }

  function integrationRegistry(onCompile: () => void): RecordContractContributorRegistry {
    const hookContributor: RecordContractComponentContributor = {
      kind: 'component',
      key: 'integration.hook-string',
      version: '1',
      componentType: 'IntegrationHookComponent',
      ownedPointers: [''],
      nullability: 'non-null',
      compile: () => {
        onCompile();
        return {
          kind: 'node',
          node: { kind: 'scalar', scalarType: 'string', nullable: false },
        };
      },
    };
    const discovered = getDiscoveredRecordContractContributorRegistry();
    const registrations: readonly RecordContractContributorRegistration[] = discovered
      ? discovered.registrations()
      : createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' }));
    return new RecordContractContributorRegistry([
      ...registrations,
      {
        contributor: hookContributor,
        source: 'hook',
        packageName: '@integration/record-schema-hook',
      },
    ]);
  }

  function integrationFields(): readonly FormComponentDefinitionFrame[] {
    return [
      {
        name: 'integration_hook_value',
        module: '@integration/record-schema-hook',
        component: { class: 'IntegrationHookComponent' },
        model: { class: 'IntegrationHookModel', config: {} },
      },
      {
        name: 'integration_unsupported_value',
        module: '@integration/unsupported-component-hook',
        component: { class: 'IntegrationUnsupportedComponent' },
        model: { class: 'IntegrationUnsupportedModel', config: {} },
      },
    ];
  }

  function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function nameAnonymousRepeatableTemplates(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) nameAnonymousRepeatableTemplates(item);
      return;
    }
    if (!isObjectRecord(value)) return;

    const component = value.component;
    if (isObjectRecord(component) && component.class === 'RepeatableComponent') {
      const config = component.config;
      if (isObjectRecord(config)) {
        const elementTemplate = config.elementTemplate;
        if (isObjectRecord(elementTemplate) && elementTemplate.name === '') {
          elementTemplate.name = '__record_schema_item';
        }
      }
    }
    for (const nested of Object.values(value)) nameAnonymousRepeatableTemplates(nested);
  }

  function trackPersistedArtifact(
    result: RecordSchemaService.ResolveCreateRecordSchemaResult | RecordSchemaService.ResolveUpdateRecordSchemaResult
  ): void {
    if (result.kind === 'resolved' || result.kind === 'partial') {
      persistedDigests.add(result.digest);
    } else if (result.kind === 'storage-failed' && result.stage === 'grant') {
      persistedDigests.add(result.artifact.digest);
    }
  }

  function service(
    onHookCompile: () => void,
    getStorageProvider: () => unknown = storage
  ): RecordSchemaService.Services.RecordSchema {
    const registry = integrationRegistry(onHookCompile);
    return new RecordSchemaService.Services.RecordSchema({
      getConfig: () => config,
      getStorageProvider,
      getContributorRegistry: () => registry,
      buildContractFormConfig: async (context, recordAccessContext) => {
        const built = await sails.services.formsservice.buildContractFormConfig(context, recordAccessContext);
        if (!built.ok) return built;
        const effectiveForm = structuredClone(built.effectiveForm);
        nameAnonymousRepeatableTemplates(effectiveForm.componentDefinitions);
        return {
          ok: true,
          effectiveForm: {
            ...effectiveForm,
            componentDefinitions: [...effectiveForm.componentDefinitions, ...integrationFields()],
          },
        } as const;
      },
    });
  }

  afterEach(async function () {
    for (const digest of persistedDigests) {
      await sails.models.recordschemareference.destroy({ digest });
      await sails.models.recordschemaartifact.destroy({ digest });
    }
    persistedDigests.clear();
    for (const oid of persistedRecordOids) {
      await sails.models.record.destroy({ redboxOid: oid });
    }
    persistedRecordOids.clear();
  });

  it('resolves a real workflow form through hook and fallback contributors and survives a fresh service', async function () {
    let hookCompileCount = 0;
    const defaultBrand = sails.services.brandingservice.getDefault();
    const brandId = defaultBrand.id;
    const branding = defaultBrand.name;
    expect(brandId).to.be.a('string').and.not.equal('');
    expect(branding).to.equal('default');
    const firstService = service(() => {
      hookCompileCount += 1;
    });

    const resolution = await firstService.resolveCreate({
      brand: brandId,
      branding,
      portal: 'rdmp',
      recordType: 'rdmp',
      targetStep: 'draft',
      actor: { authenticated: true, roles: ['Admin'] },
    });

    trackPersistedArtifact(resolution);
    expect(resolution.kind, JSON.stringify(resolution)).to.equal('partial');
    if (resolution.kind !== 'partial') throw new Error('Expected the unsupported custom component to be partial.');
    expect(resolution.metadata.context).to.deep.include({
      brand: branding,
      portal: 'rdmp',
      kind: 'create',
      recordType: 'rdmp',
      workflowStep: 'draft',
      form: 'default-1.0-draft',
      operation: 'strict-all',
    });
    expect(resolution.document.$id).to.equal(`/${branding}/rdmp/api/records/schemas/${resolution.digest}`);
    expect(resolution.document.properties?.integration_hook_value).to.deep.include({ type: 'string' });
    expect(resolution.document.properties?.integration_unsupported_value).to.deep.include({
      'x-redbox-unsupported-component': 'IntegrationUnsupportedComponent',
    });
    expect(resolution.document['x-redbox-diagnostics']).to.deep.include({
      code: 'x-redbox-unsupported-component',
      severity: 'warning',
      message: 'A custom component has no registered record-contract contributor and remains permissive.',
      pointer: '/integration_unsupported_value',
      componentType: 'IntegrationUnsupportedComponent',
    });
    expect(hookCompileCount).to.equal(1);

    const storedArtifact = await storage().getRecordSchemaArtifact(resolution.digest);
    const storedReferences = await storage().listRecordSchemaReferences({
      digest: resolution.digest,
      kind: 'grant',
      brand: branding,
      portal: 'rdmp',
      limit: 10,
      offset: 0,
    });
    expect(storedArtifact).not.to.equal(null);
    if (!storedArtifact) throw new Error('Expected the compiled artifact in Mongo.');
    expect(storedReferences).to.have.length(1);
    expect(storedReferences[0]).to.deep.include(resolution.grant);

    const resolvedIdentity = identifyRecordJsonSchema(resolution.document, config.limits.maxDocumentBytes);
    const persistedIdentity = identifyRecordJsonSchema(storedArtifact.document, config.limits.maxDocumentBytes);
    expect({
      canonicalJson: persistedIdentity.canonicalJson,
      digest: persistedIdentity.digest,
      byteLength: storedArtifact.byteLength,
      etag: persistedIdentity.etag,
    }).to.deep.equal({
      canonicalJson: resolvedIdentity.canonicalJson,
      digest: resolution.digest,
      byteLength: resolution.metadata.byteLength,
      etag: resolution.metadata.etag,
    });

    const denied = await firstService.resolveImmutable({
      brand: brandId,
      branding,
      portal: 'rdmp',
      digest: resolution.digest,
      caller: caller('integration-schema-user', 'another-brand'),
    });
    expect(denied.kind).to.equal('not-found');

    const restartedService = service(() => {
      hookCompileCount += 1;
    });
    expect(Reflect.get(restartedService, 'validatorCache')).to.equal(undefined);
    const immutable = await restartedService.resolveImmutable({
      brand: brandId,
      branding,
      portal: 'rdmp',
      digest: resolution.digest,
      caller: caller('integration-schema-user', brandId, branding),
    });
    expect(immutable.kind).to.equal('resolved');
    if (immutable.kind !== 'resolved') throw new Error('Expected immutable retrieval after a service restart.');
    expect(immutable.artifact).to.deep.include({
      digest: resolution.digest,
      document: resolution.document,
      contractFormat: resolution.metadata.contractFormat,
      completeness: 'partial',
      byteLength: resolution.metadata.byteLength,
    });
    const immutableIdentity = identifyRecordJsonSchema(immutable.artifact.document, config.limits.maxDocumentBytes);
    expect(immutableIdentity.canonicalJson).to.equal(resolvedIdentity.canonicalJson);
    expect(immutableIdentity.digest).to.equal(resolution.digest);
    expect(hookCompileCount).to.equal(2);

    const validation = restartedService.validateResolvedArtifact({
      digest: resolution.digest,
      schemaKind: 'create',
      document: immutable.artifact.document,
      input: { integration_hook_value: 42 },
    });
    expect(validation.kind).to.equal('validated');
    if (validation.kind !== 'validated' || validation.valid) {
      throw new Error('Expected AJV to reject the hook-contributed string field.');
    }
    expect(validation.issues).to.deep.include({
      code: RECORD_SCHEMA_PROBLEM_CODES.TYPE,
      pointer: '/integration_hook_value',
      expected: { type: 'string' },
    });

    const owner = caller('integration-schema-owner', brandId, branding);
    const outsider = caller('integration-schema-outsider', brandId, branding);
    const updateOid = `record-schema-update-${Date.now()}`;
    persistedRecordOids.add(updateOid);
    const recordWrite = await storage().create(
      owner.brand,
      {
        redboxOid: updateOid,
        harvestId: '',
        metadata: { title: 'Record schema update authorization integration' },
        metaMetadata: {
          type: 'rdmp',
          packageType: 'rdmp',
          brandId,
          createdBy: owner.user.username,
          searchCore: 'default',
          form: 'default-1.0-draft',
          attachmentFields: [],
        },
        workflow: { stage: 'draft', stageLabel: 'Draft' },
        authorization: {
          edit: [owner.user.username],
          view: [],
          editRoles: [],
          viewRoles: [],
          editPending: [],
          viewPending: [],
        },
      },
      {},
      owner.user
    );
    expect(recordWrite.success).to.equal(true);

    const updateResolution = await firstService.resolveUpdate({
      brand: brandId,
      branding,
      portal: 'rdmp',
      oid: updateOid,
      caller: owner,
    });
    trackPersistedArtifact(updateResolution);
    expect(updateResolution.kind).to.equal('partial');
    if (updateResolution.kind !== 'partial') throw new Error('Expected the persisted update schema to be partial.');
    expect(updateResolution.metadata.context).to.deep.include({
      brand: branding,
      portal: 'rdmp',
      kind: 'update',
      recordType: 'rdmp',
      workflowStep: 'draft',
      form: 'default-1.0-draft',
      operation: 'strict-all',
    });
    expect(updateResolution.document.$id).to.equal(`/${branding}/rdmp/api/records/schemas/${updateResolution.digest}`);
    expect(updateResolution.grant).to.deep.include({
      digest: updateResolution.digest,
      kind: 'grant',
      schemaKind: 'update',
      brand: branding,
      portal: 'rdmp',
      recordType: 'rdmp',
      oid: updateOid,
    });

    const updateReferences = await storage().listRecordSchemaReferences({
      digest: updateResolution.digest,
      kind: 'grant',
      brand: branding,
      portal: 'rdmp',
      limit: 10,
      offset: 0,
    });
    expect(updateReferences).to.have.length(1);
    expect(updateReferences[0]).to.deep.include(updateResolution.grant);

    const updateDenied = await restartedService.resolveImmutable({
      brand: brandId,
      branding,
      portal: 'rdmp',
      digest: updateResolution.digest,
      caller: outsider,
    });
    expect(updateDenied.kind).to.equal('not-found');
  });

  it('tracks the durable RDMP artifact when grant persistence fails', async function () {
    const defaultBrand = sails.services.brandingservice.getDefault();
    const brandId = defaultBrand.id;
    const branding = defaultBrand.name;
    const grantFailure = new StorageServiceResponse();
    const failingGrantService = service(
      () => undefined,
      () => ({
        putRecordSchemaArtifact: (artifact: RecordSchemaArtifactInput) => storage().putRecordSchemaArtifact(artifact),
        putRecordSchemaReference: async () => grantFailure,
      })
    );

    const result = await failingGrantService.resolveCreate({
      brand: brandId,
      branding,
      portal: 'rdmp',
      recordType: 'rdmp',
      targetStep: 'draft',
      actor: { authenticated: true, roles: ['Admin'] },
    });
    trackPersistedArtifact(result);

    expect(result.kind).to.equal('storage-failed');
    if (result.kind !== 'storage-failed' || result.stage !== 'grant') {
      throw new Error('Expected RDMP grant persistence to fail after artifact persistence.');
    }
    const storedArtifact = await storage().getRecordSchemaArtifact(result.artifact.digest);
    const storedReferences = await storage().listRecordSchemaReferences({
      digest: result.artifact.digest,
      kind: 'grant',
      brand: branding,
      portal: 'rdmp',
      limit: 10,
      offset: 0,
    });
    expect(storedArtifact).not.to.equal(null);
    expect(storedReferences).to.deep.equal([]);
  });
});
