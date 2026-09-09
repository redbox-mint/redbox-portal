import { firstValueFrom } from 'rxjs';
import sinon from 'sinon';
import { createRecordSaveContext, hasFullRecordStorageConcurrencyCapability } from '@researchdatabox/redbox-core';

describe('The RecordsService', function () {
  this.timeout(60_000);

  let recordsService;
  const createdOids: string[] = [];
  const createdUserIds: string[] = [];
  const createdSchemaDigests = new Set<string>();
  let originalRecordSchemaConfig;
  let originalRecordValidationConfig;

  before(function () {
    recordsService = sails.services.recordsservice;
    if (typeof recordsService.getServices === 'function') {
      recordsService.getServices(recordsService);
    }
  });

  beforeEach(function () {
    originalRecordSchemaConfig = sails.config.recordSchema;
    originalRecordValidationConfig = sails.config.recordValidation;
  });

  afterEach(async function () {
    sinon.restore();
    sails.config.recordSchema = originalRecordSchemaConfig;
    sails.config.recordValidation = originalRecordValidationConfig;

    for (const digest of createdSchemaDigests) {
      await sails.models.recordschemareference.destroy({ digest });
      await sails.models.recordschemaartifact.destroy({ digest });
    }
    createdSchemaDigests.clear();

    if (createdOids.length > 0) {
      const oidsToDelete = createdOids.splice(0, createdOids.length);
      if (typeof RecordAudit !== 'undefined') {
        await RecordAudit.destroy({
          or: oidsToDelete.map(redboxOid => ({ redboxOid })),
        });
      }
      if (typeof DeletedRecord !== 'undefined') {
        await DeletedRecord.destroy({
          or: oidsToDelete.map(redboxOid => ({ redboxOid })),
        });
      }
      if (typeof Record !== 'undefined') {
        await Record.destroy({
          or: oidsToDelete.map(redboxOid => ({ redboxOid })),
        });
      }
    }

    if (createdUserIds.length > 0) {
      const userIds = createdUserIds.splice(0, createdUserIds.length);
      if (typeof User !== 'undefined') {
        await User.destroy({ id: userIds });
      }
    }
  });

  it('resolves record permissions to user summaries and preserves pending access metadata', async function () {
    const suffix = Date.now().toString();
    const editorUsername = `recordaudit-editor-${suffix}`;
    const viewerUsername = `recordaudit-viewer-${suffix}`;

    const editor = await firstValueFrom(
      UsersService.addLocalUser(editorUsername, 'Record Audit Editor', `${editorUsername}@example.edu.au`, 'RBTest123!')
    );
    const viewer = await firstValueFrom(
      UsersService.addLocalUser(viewerUsername, 'Record Audit Viewer', `${viewerUsername}@example.edu.au`, 'RBTest123!')
    );
    createdUserIds.push(String(editor.id), String(viewer.id));

    const brand = BrandingService.getDefault();
    const recordType = await firstValueFrom(RecordTypesService.get(brand, 'rdmp'));
    const requestedOid = `records-service-permissions-${suffix}`;

    const createResponse = await recordsService.create(
      brand,
      {
        redboxOid: requestedOid,
        metadata: {
          title: 'RecordsService permission summary integration test',
        },
        workflow: {
          stage: 'draft',
          name: 'Draft',
        },
        metaMetadata: {
          type: 'rdmp',
          packageType: 'rdmp',
          brandId: brand.id,
          createdBy: 'admin',
          searchCore: 'default',
          form: 'default-1.0-draft',
          attachmentFields: [],
        },
        authorization: {
          edit: [editorUsername, 'missing-record-audit-user'],
          view: [viewerUsername],
          editRoles: ['Admin'],
          viewRoles: ['Librarians'],
          editPending: ['pending-edit@example.edu.au'],
          viewPending: ['pending-view@example.edu.au'],
        },
      },
      recordType,
      { username: 'admin' },
      false,
      false
    );

    expect(createResponse.isSuccessful()).to.equal(true);
    const oid = String(createResponse.oid);
    createdOids.push(oid);

    const summary = await recordsService.getResolvedPermissionsSummary(oid);

    expect(summary.edit).to.deep.equal([
      {
        username: editorUsername,
        name: 'Record Audit Editor',
        email: `${editorUsername}@example.edu.au`,
      },
      {
        username: 'missing-record-audit-user',
        name: '',
        email: '',
      },
    ]);
    expect(summary.view).to.deep.equal([
      {
        username: viewerUsername,
        name: 'Record Audit Viewer',
        email: `${viewerUsername}@example.edu.au`,
      },
    ]);
    expect(summary.editRoles).to.deep.equal(['Admin']);
    expect(summary.viewRoles).to.deep.equal(['Librarians']);
    expect(summary.editPending).to.deep.equal(['pending-edit@example.edu.au']);
    expect(summary.viewPending).to.deep.equal(['pending-view@example.edu.au']);
  });

  it('wires loader-discovered contributors into the lifted RecordSchemaService export', async function () {
    sails.config.recordSchema = { ...sails.config.recordSchema, enabled: true };
    const contributorState = sails.config.recordContractContributorState;
    expect(contributorState?.registrations).to.have.length(36);
    expect(
      contributorState?.registrations.every(registration => typeof registration.contributor.compile === 'function')
    ).to.equal(true);

    expect(() => sails.services.recordschemaservice.init()).not.to.throw();

    const brand = BrandingService.getDefault();
    const resolution = await sails.services.recordschemaservice.resolveCreate({
      brand: brand.id,
      portal: 'rdmp',
      recordType: 'rdmp',
      targetStep: 'draft',
      caller: {
        brand,
        user: { username: 'admin', roles: [RolesService.getRole(brand, 'Admin')] },
      },
    });
    expect(resolution.kind, JSON.stringify(resolution)).to.equal('partial');
    expect(resolution.metadata.completeness).to.equal('partial');
    expect(resolution.digest).to.match(/^[0-9a-f]{64}$/);
    createdSchemaDigests.add(resolution.digest);
  });

  it('runs the lifted update save boundary through schema, merge, hooks, business validation, Mongo, and usage', async function () {
    const environmentRecordSchemaConfig = { ...sails.config.recordSchema };
    Reflect.set(environmentRecordSchemaConfig, 'enabled', 'true');
    sails.config.recordSchema = environmentRecordSchemaConfig;
    sails.config.recordValidation = { ...sails.config.recordValidation, mode: 'shadow' };

    const suffix = Date.now().toString();
    const oid = `records-service-save-boundary-${suffix}`;
    const brand = BrandingService.getDefault();
    const user = { username: 'admin', roles: [{ name: 'Admin' }] };
    const storage = sails.services.mongostorageservice;
    const schemaService = sails.services.recordschemaservice;
    const validationService = sails.services.recordvalidationservice;
    const recordType = await firstValueFrom(RecordTypesService.get(brand, 'rdmp'));

    const initialRecord = {
      redboxOid: oid,
      revision: 0,
      harvestId: '',
      metadata: {
        title: 'Before save-boundary update',
        integrationNested: { retained: true },
        integrationTags: ['stored'],
      },
      metaMetadata: {
        type: recordType.name,
        packageType: recordType.packageType,
        brandId: brand.id,
        createdBy: user.username,
        searchCore: 'default',
        form: 'default-1.0-draft',
        attachmentFields: [],
      },
      workflow: { stage: 'draft', stageLabel: 'Draft' },
      authorization: {
        edit: [user.username],
        view: [user.username],
        editRoles: [],
        viewRoles: [],
        editPending: [],
        viewPending: [],
      },
    };
    const createResponse = await storage.create(brand, initialRecord, {}, user);
    expect(createResponse.success).to.equal(true);
    createdOids.push(oid);

    await storage.init();
    expect(hasFullRecordStorageConcurrencyCapability(storage)).to.equal(true);

    const snapshot = await recordsService.getMeta(oid);
    expect(snapshot).to.include({ redboxOid: oid });
    expect(snapshot.revision).to.be.a('number');

    const resolveUpdate = sinon.spy(schemaService, 'resolveUpdate');
    const validateResolvedArtifact = sinon.spy(schemaService, 'validateResolvedArtifact');
    const businessValidation = sinon.spy(validationService, 'resolve');
    const updateStorage = sinon.spy(storage, 'updateMeta');
    const persistUsage = sinon.spy(schemaService, 'persistSaveUsageReference');
    const rawDelta = {
      title: 'After save-boundary update',
      integrationNested: { added: true },
      integrationTags: ['incoming'],
    };

    const result = await recordsService.updateMetaInternal({
      actor: { kind: 'service', id: 'RecordsServiceIntegration.saveBoundary' },
      authorization: { kind: 'service' },
      mutationClass: 'full-record',
      brand,
      oid,
      record: snapshot,
      user,
      triggerPostSaveTriggers: false,
      metadata: rawDelta,
      metadataMode: 'merge',
      context: createRecordSaveContext({
        routeFamily: 'internal',
        operation: 'update',
        portal: 'rdmp',
      }),
    });

    expect(result.wasPersisted(), JSON.stringify(result)).to.equal(true);
    expect(result.schemaOutcome?.digest, JSON.stringify(result)).to.match(/^[0-9a-f]{64}$/);
    createdSchemaDigests.add(result.schemaOutcome.digest);
    expect(resolveUpdate.calledOnce).to.equal(true);
    expect(validateResolvedArtifact.calledOnce).to.equal(true);
    expect(validateResolvedArtifact.firstCall.args[0].input).to.equal(rawDelta);
    expect(businessValidation.calledOnce).to.equal(true);
    expect(businessValidation.firstCall.args[0].candidate.metadata).to.deep.include({
      title: 'After save-boundary update',
      integrationNested: { retained: true, added: true },
      integrationTags: ['stored', 'incoming'],
    });
    expect(businessValidation.firstCall.args[0].candidate.metadata.server_sync_test_value).to.match(/^test-\d{6}$/);
    expect(updateStorage.calledOnce).to.equal(true);
    expect(persistUsage.calledOnce).to.equal(true);
    expect(resolveUpdate.calledBefore(validateResolvedArtifact)).to.equal(true);
    expect(validateResolvedArtifact.calledBefore(businessValidation)).to.equal(true);
    expect(businessValidation.calledBefore(updateStorage)).to.equal(true);
    expect(updateStorage.calledBefore(persistUsage)).to.equal(true);
    expect(rawDelta).to.deep.equal({
      title: 'After save-boundary update',
      integrationNested: { added: true },
      integrationTags: ['incoming'],
    });

    const stored = await recordsService.getMeta(oid);
    expect(stored.metadata).to.deep.include({
      title: 'After save-boundary update',
      integrationNested: { retained: true, added: true },
      integrationTags: ['stored', 'incoming'],
    });
    expect(stored.metadata.server_sync_test_value).to.match(/^test-\d{6}$/);
    expect(stored.revision).to.equal(snapshot.revision + 1);

    const references = await storage.listRecordSchemaReferences({
      digest: result.schemaOutcome.digest,
      oid,
      limit: 10,
    });
    expect(references.some(reference => reference.kind === 'grant')).to.equal(true);
    expect(references.some(reference => reference.kind === 'save')).to.equal(true);
  });

  it('persists an actual schema-invalid update with advisory shadow validation', async function () {
    sails.config.recordSchema = { ...sails.config.recordSchema, enabled: true };
    sails.config.recordValidation = { ...sails.config.recordValidation, mode: 'shadow' };

    const suffix = Date.now().toString();
    const oid = `record-schema-shadow-rollout-${suffix}`;
    const brand = BrandingService.getDefault();
    const user = { username: 'admin', roles: [{ name: 'Admin' }] };
    const storage = sails.services.mongostorageservice;
    const schemaService = sails.services.recordschemaservice;
    const recordType = await firstValueFrom(RecordTypesService.get(brand, 'rdmp'));
    const initialRecord = {
      redboxOid: oid,
      revision: 0,
      harvestId: '',
      metadata: { text_1_event: 'valid before shadow update', text_7: 'prefix-valid' },
      metaMetadata: {
        type: recordType.name,
        packageType: recordType.packageType,
        brandId: brand.id,
        createdBy: user.username,
        searchCore: 'default',
        form: 'default-1.0-draft',
        attachmentFields: [],
      },
      workflow: { stage: 'draft', stageLabel: 'Draft' },
      authorization: {
        edit: [user.username],
        view: [user.username],
        editRoles: [],
        viewRoles: [],
        editPending: [],
        viewPending: [],
      },
    };
    const createResponse = await storage.create(brand, initialRecord, {}, user);
    expect(createResponse.success).to.equal(true);
    createdOids.push(oid);

    const snapshot = await recordsService.getMeta(oid);
    const resolveUpdate = sinon.spy(schemaService, 'resolveUpdate');
    const validateResolvedArtifact = sinon.spy(schemaService, 'validateResolvedArtifact');
    const updateStorage = sinon.spy(storage, 'updateMeta');
    const persistUsage = sinon.spy(schemaService, 'persistSaveUsageReference');
    const rawDelta = { text_1_event: 42, text_7: 'x' };

    const result = await recordsService.updateMetaInternal({
      actor: { kind: 'service', id: 'RecordsServiceIntegration.shadowRollout' },
      authorization: { kind: 'service' },
      mutationClass: 'full-record',
      brand,
      oid,
      record: snapshot,
      user,
      triggerPostSaveTriggers: false,
      metadata: rawDelta,
      metadataMode: 'merge',
      context: createRecordSaveContext({
        routeFamily: 'internal',
        operation: 'update',
        portal: 'rdmp',
      }),
    });

    expect(result.wasPersisted(), JSON.stringify(result)).to.equal(true);
    expect(result.outcome).to.equal('saved-with-warnings');
    expect(result.schemaOutcome).to.deep.include({ enforcement: 'shadow' });
    expect(result.schemaOutcome?.digest).to.match(/^[0-9a-f]{64}$/);
    createdSchemaDigests.add(result.schemaOutcome.digest);
    const schemaProblem = result.problems.find(problem => problem.source === 'schema');
    expect(schemaProblem).to.deep.include({ kind: 'validation', phase: 'schema' });
    expect(schemaProblem?.issues).to.deep.include({
      code: 'record-schema.type',
      message: '@record-schema.type',
      pointer: '/text_1_event',
      expected: { type: 'string' },
    });
    expect(resolveUpdate.calledOnce).to.equal(true);
    expect(validateResolvedArtifact.calledOnce).to.equal(true);
    expect(validateResolvedArtifact.firstCall.args[0].input).to.equal(rawDelta);
    expect(updateStorage.calledOnce).to.equal(true);
    expect(persistUsage.calledOnce).to.equal(true);

    const stored = await recordsService.getMeta(oid);
    expect(stored.metadata).to.deep.include(rawDelta);
    const references = await storage.listRecordSchemaReferences({
      digest: result.schemaOutcome.digest,
      oid,
      limit: 10,
    });
    expect(references.some(reference => reference.kind === 'save')).to.equal(true);
    expect(rawDelta).to.deep.equal({ text_1_event: 42, text_7: 'x' });
  });
});
