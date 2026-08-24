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
} from '@researchdatabox/redbox-core';
import type { FormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';

const DIGEST = 'e'.repeat(64);
const DOCUMENT = { type: 'object', title: 'Integration schema' } as const;

describe('RecordSchemaService storage-backed orchestration', function () {
  const storage = () => sails.services.mongostorageservice;

  afterEach(async function () {
    await sails.models.recordschemareference.destroy({ digest: DIGEST });
    await sails.models.recordschemaartifact.destroy({ digest: DIGEST });
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
});

describe('RecordSchemaService configured-form integration', function () {
  const persistedDigests = new Set<string>();
  const persistedRecordOids = new Set<string>();
  const storage = () => sails.services.mongostorageservice;
  const config = {
    ...structuredClone(recordSchema),
    enabled: true,
  };

  function caller(username: string, brandId: string) {
    const role = new RoleModel();
    role.id = 'integration-admin-role';
    role.name = 'Admin';
    const brand = new BrandingModel();
    brand.id = brandId;
    brand.name = brandId;
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
    const brandId = sails.services.brandingservice.getDefault().id;
    expect(brandId).to.be.a('string').and.not.equal('');
    const firstService = service(() => {
      hookCompileCount += 1;
    });

    const resolution = await firstService.resolveCreate({
      brand: brandId,
      portal: 'rdmp',
      recordType: 'rdmp',
      targetStep: 'draft',
      actor: { authenticated: true, roles: ['Admin'] },
    });

    trackPersistedArtifact(resolution);
    expect(resolution.kind, JSON.stringify(resolution)).to.equal('partial');
    if (resolution.kind !== 'partial') throw new Error('Expected the unsupported custom component to be partial.');
    expect(resolution.metadata.context).to.deep.include({
      brand: brandId,
      portal: 'rdmp',
      kind: 'create',
      recordType: 'rdmp',
      workflowStep: 'draft',
      form: 'default-1.0-draft',
      operation: 'strict-all',
    });
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
      brand: brandId,
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
      portal: 'rdmp',
      digest: resolution.digest,
      caller: caller('integration-schema-user', 'another-brand'),
    });
    expect(denied.kind).to.equal('not-found');

    const restartedService = service(() => {
      hookCompileCount += 1;
    });
    const immutable = await restartedService.resolveImmutable({
      brand: brandId,
      portal: 'rdmp',
      digest: resolution.digest,
      caller: caller('integration-schema-user', brandId),
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

    const owner = caller('integration-schema-owner', brandId);
    const outsider = caller('integration-schema-outsider', brandId);
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
      portal: 'rdmp',
      oid: updateOid,
      caller: owner,
    });
    trackPersistedArtifact(updateResolution);
    expect(updateResolution.kind).to.equal('partial');
    if (updateResolution.kind !== 'partial') throw new Error('Expected the persisted update schema to be partial.');
    expect(updateResolution.metadata.context).to.deep.include({
      brand: brandId,
      portal: 'rdmp',
      kind: 'update',
      recordType: 'rdmp',
      workflowStep: 'draft',
      form: 'default-1.0-draft',
      operation: 'strict-all',
    });
    expect(updateResolution.grant).to.deep.include({
      digest: updateResolution.digest,
      kind: 'grant',
      schemaKind: 'update',
      brand: brandId,
      portal: 'rdmp',
      recordType: 'rdmp',
      oid: updateOid,
    });

    const updateReferences = await storage().listRecordSchemaReferences({
      digest: updateResolution.digest,
      kind: 'grant',
      brand: brandId,
      portal: 'rdmp',
      limit: 10,
      offset: 0,
    });
    expect(updateReferences).to.have.length(1);
    expect(updateReferences[0]).to.deep.include(updateResolution.grant);

    const updateDenied = await restartedService.resolveImmutable({
      brand: brandId,
      portal: 'rdmp',
      digest: updateResolution.digest,
      caller: outsider,
    });
    expect(updateDenied.kind).to.equal('not-found');
  });

  it('tracks the durable RDMP artifact when grant persistence fails', async function () {
    const brandId = sails.services.brandingservice.getDefault().id;
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
      brand: brandId,
      portal: 'rdmp',
      limit: 10,
      offset: 0,
    });
    expect(storedArtifact).not.to.equal(null);
    expect(storedReferences).to.deep.equal([]);
  });
});
