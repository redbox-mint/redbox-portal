import { firstValueFrom } from 'rxjs';

const BINDING_KEY = 'create-demo-rdmp-from-activity';
const PROFILE_KEY = 'research-activity-to-demo-rdmp';
const ENCRYPTION_ENV = 'REDBOX_GENERATION_INTEGRATION_KEY';

describe('AI-assisted form generation', function () {
  this.timeout(120_000);

  let brand: any;
  let user: any;
  let actor: any;
  let sourceOid: string;
  let originalEnabled: boolean;
  let originalEncryptionKeyRef: string;
  let originalDiagnosticRetentionDays: number;
  let originalEncryptionValue: string | undefined;
  const createdTargetOids: string[] = [];
  const createdRunIds: string[] = [];

  before(async function () {
    brand = BrandingService.getDefault();
    const roles = await firstValueFrom<any[]>(RolesService.getRolesWithBrand(brand));
    const adminRole = RolesService.getAdminFromRoles(roles);
    user = await firstValueFrom(UsersService.getUserWithId(adminRole.users[0].id));
    const roleNames = user.roles.map((role: any) => String(role.name));
    actor = {
      brandId: String(brand.id),
      branding: String(brand.name),
      portal: 'rdmp',
      userId: String(user.id),
      username: String(user.username),
      roles: roleNames,
    };

    originalEnabled = sails.config.generation.enabled;
    originalEncryptionKeyRef = sails.config.generation.artifacts.encryptionKeyRef;
    originalDiagnosticRetentionDays = sails.config.generation.artifacts.diagnosticRetentionDays;
    originalEncryptionValue = process.env[ENCRYPTION_ENV];
    process.env[ENCRYPTION_ENV] = Buffer.alloc(32, 19).toString('base64');
    sails.config.generation.enabled = true;
    sails.config.generation.artifacts.encryptionKeyRef = `env:${ENCRYPTION_ENV}`;
    sails.config.generation.artifacts.diagnosticRetentionDays = 0;

    await GenerationPersistenceService.ensureIndexes();
    await sails.services.recordsservice.bootstrapData();
    const sourceRecord = await Record.findOne({ 'metadata.bootstrapSeedId': 'researchActivity:1' })
      .meta({ enableExperimentalDeepTargets: true });
    sourceOid = String(sourceRecord?.redboxOid ?? '');
    expect(sourceOid).not.to.equal('');
    await GenerationBootstrapService.bootstrap(brand);
  });

  after(async function () {
    for (const oid of createdTargetOids) {
      await GenerationFieldProvenance.destroy({ brandId: actor.brandId, targetRecordOid: oid });
      await RecordAudit.destroy({ redboxOid: oid });
      await Record.destroy({ redboxOid: oid });
    }
    for (const runId of createdRunIds) {
      await GenerationRunArtifact.destroy({ brandId: actor.brandId, runId });
      await GenerationFieldProvenance.destroy({ brandId: actor.brandId, runId });
      await GenerationRun.destroy({ brandId: actor.brandId, id: runId });
    }
    sails.config.generation.enabled = originalEnabled;
    sails.config.generation.artifacts.encryptionKeyRef = originalEncryptionKeyRef;
    sails.config.generation.artifacts.diagnosticRetentionDays = originalDiagnosticRetentionDays;
    if (originalEncryptionValue === undefined) delete process.env[ENCRYPTION_ENV];
    else process.env[ENCRYPTION_ENV] = originalEncryptionValue;
  });

  it('registers all durable models and orchestration services', function () {
    const models = [
      GenerationProfile, GenerationProfileVersion, GenerationBinding,
      GenerationModelConnection, GenerationModelDeployment, KnowledgeCollection,
      KnowledgeCollectionVersion, KnowledgeDocument, KnowledgeChunk,
      GenerationRun, GenerationRunArtifact, GenerationFieldProvenance,
    ];
    models.forEach((model) => expect(model).to.have.property('findOne').that.is.a('function'));

    const services = [
      'generationbindingservice', 'generationbootstrapservice', 'generationcontextservice',
      'generationcryptoservice', 'generationknowledgeservice', 'generationmodelservice',
      'generationpersistenceservice', 'generationprofileservice', 'generationpromptservice',
      'generationprovenanceservice', 'generationproviderregistryservice', 'generationrunservice',
      'generationschemaservice', 'generationsecretresolverservice', 'generationworkerservice',
    ];
    services.forEach((name) => expect(sails.services[name], name).to.be.an('object'));
  });

  it('bootstraps the published demo graph idempotently', async function () {
    const countsBefore = await Promise.all([
      GenerationModelConnection.count({ brandId: actor.brandId }),
      GenerationModelDeployment.count({ brandId: actor.brandId }),
      KnowledgeCollection.count({ brandId: actor.brandId }),
      GenerationProfile.count({ brandId: actor.brandId }),
      GenerationBinding.count({ brandId: actor.brandId }),
    ]);

    await GenerationBootstrapService.bootstrap(brand);

    const countsAfter = await Promise.all([
      GenerationModelConnection.count({ brandId: actor.brandId }),
      GenerationModelDeployment.count({ brandId: actor.brandId }),
      KnowledgeCollection.count({ brandId: actor.brandId }),
      GenerationProfile.count({ brandId: actor.brandId }),
      GenerationBinding.count({ brandId: actor.brandId }),
    ]);
    expect(countsAfter).to.deep.equal(countsBefore);
    expect(countsAfter).to.deep.equal([2, 2, 1, 1, 1]);

    const deployment = await GenerationModelDeployment.findOne({ brandId: actor.brandId, key: 'demo-fake-rdmp-v1' });
    const profile = await GenerationProfile.findOne({ brandId: actor.brandId, key: PROFILE_KEY });
    const version = await GenerationProfileVersion.findOne({ brandId: actor.brandId, id: profile.publishedVersionId });
    const binding = await GenerationBinding.findOne({ brandId: actor.brandId, key: BINDING_KEY });
    expect(deployment.status).to.equal('published');
    expect(version.status).to.equal('published');
    expect(version.definition.questions).to.have.length(5);
    expect(version.definition.targetFields).to.have.length(9);
    expect(binding.profileId).to.equal(profile.id);
  });

  it('creates the required native indexes and encrypts artifacts with scoped AAD', async function () {
    const manager = GenerationRunArtifact.getDatastore().manager;
    const artifactIndexes = await manager.collection(GenerationRunArtifact.tableName).indexes();
    const provenanceIndexes = await manager.collection(GenerationFieldProvenance.tableName).indexes();
    expect(artifactIndexes.some((index: any) => index.name === 'generation_artifact_expiry_ttl' && index.expireAfterSeconds === 0)).to.equal(true);
    expect(artifactIndexes.some((index: any) => index.name === 'generation_artifact_brand_run' && index.unique === true)).to.equal(true);
    expect(provenanceIndexes.some((index: any) => index.name === 'generation_provenance_run_field' && index.unique === true)).to.equal(true);

    const plaintext = { marker: `not-plaintext-${Date.now()}`, nested: { approved: true } };
    const envelope = await GenerationCryptoService.encrypt(actor.brandId, 'crypto-test-run', plaintext);
    expect(envelope.ciphertext).not.to.contain(plaintext.marker);
    expect(await GenerationCryptoService.decrypt(actor.brandId, 'crypto-test-run', envelope)).to.deep.equal(plaintext);
    await expectRejected(
      GenerationCryptoService.decrypt('another-brand', 'crypto-test-run', envelope),
      'GENERATION_ARTIFACT_EXPIRED',
    );
  });

  it('enforces brand-scoped compare-and-set run transitions', async function () {
    const binding = await GenerationBinding.findOne({ brandId: actor.brandId, key: BINDING_KEY });
    const profile = await GenerationProfile.findOne({ brandId: actor.brandId, key: PROFILE_KEY });
    const version = await GenerationProfileVersion.findOne({ brandId: actor.brandId, id: profile.publishedVersionId });
    const run = await GenerationRun.create({
      brandId: actor.brandId,
      bindingId: binding.id,
      profileVersionId: version.id,
      modelDeploymentId: version.definition.modelDeploymentId,
      knowledgeCollectionVersionIds: version.definition.knowledgeCollectionVersionIds,
      initiatedByUserId: actor.userId,
      initiatedByUsername: actor.username,
      sourceRefs: [{ slotId: 'activity', recordType: 'researchActivity', oid: sourceOid }],
      targetDescriptor: { recordType: 'demoRdmp', formName: 'demoRdmp-1.0-draft', mode: 'create' },
      status: 'draft', phase: 'context', attemptCount: 0, retryable: false,
      artifactExpiresAt: new Date(Date.now() + 60_000).toISOString(), diagnosticRetentionDays: 0,
    }).fetch();
    createdRunIds.push(String(run.id));

    const queued = await GenerationPersistenceService.transitionRun(actor.brandId, run.id, 'draft', 'queued', { attemptCount: 1 }, 0);
    expect(queued.status).to.equal('queued');
    await expectRejected(
      GenerationPersistenceService.transitionRun(actor.brandId, run.id, 'draft', 'queued', { attemptCount: 1 }, 0),
      'GENERATION_INVALID_STATE',
    );
    expect(await GenerationPersistenceService.findOneScoped(GenerationRun, 'wrong-brand', { id: run.id })).to.equal(undefined);
  });

  it('generates through Agenda, saves normally, and commits provenance idempotently', async function () {
    const source = await sails.services.recordsservice.getMeta(sourceOid);
    expect(source).to.be.an('object');
    const actions = await GenerationBindingService.resolveActions({
      actor, brand, user, record: source, formName: source.metaMetadata.form, mode: 'view',
    });
    expect(actions.map((action: any) => action.bindingKey)).to.include(BINDING_KEY);

    const launch = await GenerationRunService.launch({ actor, brand, user, bindingKey: BINDING_KEY, sourceOid });
    createdRunIds.push(String(launch.runId));
    expect(launch.targetUrl).to.contain(`/record/demoRdmp/edit?generationRunId=${launch.runId}`);
    const draft = await GenerationRunService.getForActor(actor, launch.runId);
    expect(draft.questions).to.have.length(5);

    await GenerationRunService.execute({
      actor, brand, user, runId: launch.runId,
      answers: [
        { id: 'projectPurpose', value: 'Explore fictional coastal community wellbeing.' },
        { id: 'humanParticipants', value: true },
        { id: 'sensitiveData', value: true },
        { id: 'expectedDataTypes', value: ['De-identified survey responses', 'Synthetic interview transcripts', 'Aggregate statistics'] },
        { id: 'retentionPeriod', value: '7 years' },
      ],
      targetForm: { recordType: 'demoRdmp', formName: 'demoRdmp-1.0-draft', mode: 'create' },
      targetDraft: { researchActivity: { oid: sourceOid } },
    });

    const completed = await waitForRun(launch.runId, ['completed', 'failed'], 60_000);
    expect(completed.status, completed.errorCode || completed.errorSummary).to.equal('completed');
    const view = await GenerationRunService.getForActor(actor, launch.runId);
    expect(view.result.items).to.have.length(9);
    const flagged = view.result.items.filter((item: any) => item.reviewRequired);
    expect(flagged).to.have.length(1);
    expect(flagged[0]).to.include({ fieldId: 'sharingAccess', reviewReasonCode: 'SHARING_CONSENT_REQUIRES_REVIEW' });

    const metadata: Record<string, unknown> = { researchActivity: { oid: sourceOid } };
    for (const item of view.result.items) metadata[item.metadataPointer.slice(1)] = item.value;
    const targetType = await firstValueFrom(RecordTypesService.get(brand, 'demoRdmp'));
    const requestedOid = `generation-integration-${Date.now()}`;
    const createResponse = await sails.services.recordsservice.create(
      brand,
      {
        redboxOid: requestedOid,
        metadata,
        workflow: { stage: 'draft', name: 'Draft' },
        metaMetadata: {
          type: 'demoRdmp', packageType: 'demoRdmp', brandId: actor.brandId,
          createdBy: actor.username, searchCore: 'default', form: 'demoRdmp-1.0-draft', attachmentFields: [],
        },
        authorization: { edit: [actor.username], view: [], editRoles: ['Admin'], viewRoles: ['Admin'] },
      },
      targetType,
      user,
      false,
      false,
    );
    expect(createResponse.isSuccessful()).to.equal(true);
    const targetOid = String(createResponse.oid);
    createdTargetOids.push(targetOid);

    const receipt = { targetOid, candidateDigest: view.result.candidateDigest, reviewedFieldIds: ['sharingAccess'] };
    const committed = await GenerationRunService.commit(actor, user, brand, launch.runId, receipt);
    expect(committed).to.include({ committed: true, provenanceCount: 9, targetOid });
    expect(await GenerationRunService.commit(actor, user, brand, launch.runId, receipt)).to.deep.equal(committed);
    expect(await GenerationRunArtifact.findOne({ brandId: actor.brandId, runId: launch.runId })).to.equal(undefined);

    const provenance = await GenerationProvenanceService.getForRecord(actor, user, brand, targetOid);
    expect(provenance.fields).to.have.length(9);
    expect(provenance.fields.every((field: any) => field.displayState === 'generated')).to.equal(true);
    const sharing = provenance.fields.find((field: any) => field.profileFieldId === 'sharingAccess');
    expect(sharing.reviewRequired).to.equal(false);
    expect(sharing.reviewedAt).to.be.a('string');
  });
});

async function waitForRun(runId: string, statuses: string[], timeoutMs: number): Promise<any> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const run = await GenerationRun.findOne({ id: runId });
    if (run && statuses.includes(run.status)) return run;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for generation run ${runId}`);
}

async function expectRejected(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected rejection ${code}`);
  } catch (error) {
    expect((error as { code?: string }).code).to.equal(code);
  }
}
