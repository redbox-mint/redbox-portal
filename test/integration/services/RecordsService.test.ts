import type { Agenda, Job } from 'agenda';
import { randomBytes } from 'node:crypto';
import { createServer, connect, Socket } from 'node:net';
import { StorageServiceResponse, UserModel } from '@researchdatabox/redbox-core';
import { AuditWriter, AuditWriteTimeout } from '../../../packages/redbox-core/src/services/record-audit/writer';

// Mongo's repository exposes these lifecycle methods in addition to Agenda's generic contract.
type MongoAuditQueueRepository = Agenda['db'] & {
  disconnect(): Promise<void>;
  getDb(): import('mongodb').Db;
  collection: { drop(): Promise<boolean> };
};
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

  async function waitForJob<T>(completion: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        completion,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Timed out waiting for the record audit Agenda job')), 15000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

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

  it('stores sequential workspace associations from null as an array through WorkspaceService and Mongo', async function () {
    const oid = `workspace-associations-${Date.now()}`;
    const brand = BrandingService.getDefault();
    const user = { username: 'admin', roles: [{ name: 'Admin' }] };
    const storage = sails.services.mongostorageservice;
    const recordType = await firstValueFrom(RecordTypesService.get(brand, 'rdmp'));
    const metadata = { title: 'Workspace association regression', workspaces: null, unrelated: { retained: true } };
    const created = await storage.create(
      brand,
      {
        redboxOid: oid,
        revision: 0,
        harvestId: '',
        metadata,
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
      },
      {},
      user
    );
    expect(created.success).to.equal(true);
    createdOids.push(oid);

    const workspaceService = sails.services.workspaceservice;
    const first = { id: 'workspace-first', reference: 'RDS-FIRST', capacity: '100 GB' };
    const second = { id: 'workspace-second', reference: 'RDS-SECOND', capacity: '200 GB' };
    for (const association of [first, second, { ...first }]) {
      const result = await workspaceService.addWorkspaceToRecord(
        oid,
        association.id,
        { ...association },
        undefined,
        user
      );
      expect(result.wasPersisted(), JSON.stringify(result)).to.equal(true);
    }

    const stored = await recordsService.getMeta(oid);
    expect(stored.metadata).to.deep.include({ ...metadata, workspaces: [first, second] });
  });

  for (const operation of ['create', 'update'] as const) {
    for (const phase of ['save', 'transition'] as const) {
      for (const replacement of ['full', 'partial', 'committed-partial'] as const) {
        const partial = replacement === 'partial';
        const partialCommit = replacement === 'committed-partial';
        it(`adopts a self-persisting ${operation} ${phase} postSync snapshot through Mongo${partialCommit ? ' returning only metadata and revision' : partial ? ' before a partial replacement' : ''}`, async function () {
          sails.config.recordSchema = { ...sails.config.recordSchema, enabled: false };
          sails.config.recordValidation = { ...sails.config.recordValidation, mode: 'shadow' };
          const brand = BrandingService.getDefault();
          const user = { username: 'admin', roles: [{ name: 'Admin' }] };
          const recordType = await firstValueFrom(RecordTypesService.get(brand, 'rdmp'));
          const draft = await firstValueFrom(WorkflowStepsService.getFirst(recordType));
          const events: string[] = [];
          let hookRevision: number | undefined;
          const mode = operation === 'create' ? 'onCreate' : 'onUpdate';
          const selfPersist = { function: '(oid, record) => globalThis.__integrationPostSyncCommit(oid, record)' };
          const chain = [
            selfPersist,
            ...(partial
              ? [
                  {
                    function: '(_oid, record) => ({ metadata: { ...record.metadata, laterHook: true } })',
                  },
                ]
              : []),
          ];
          const hooks = {
            [mode]: {
              postSync: phase === 'save' ? chain : [],
              post: [{ function: '() => globalThis.__integrationPostSyncEvents.push("save-post")' }],
            },
            onTransitionWorkflow: {
              postSync: chain,
              post: [{ function: '() => globalThis.__integrationPostSyncEvents.push("transition-post")' }],
            },
          };
          const configuredType = { ...recordType, hooks, searchable: false };
          // Configure real stored hooks so nested internal updates resolve the
          // same type without replacing any service or storage implementation.
          await sails.models.recordtype.updateOne({ id: recordType.id }).set({ hooks, searchable: false });
          Object.assign(globalThis, {
            __integrationPostSyncEvents: events,
            __integrationPostSyncCommit: async (oid, record) => {
              events.push('self-save');
              const saved = await recordsService.mutateMetaInternal({
                actor: { kind: 'service', id: 'RecordsServiceIntegration.postSync' },
                authorization: { kind: 'service' },
                oid,
                brand,
                user,
                triggerPreSaveTriggers: false,
                triggerPostSaveTriggers: false,
                mutate: snapshot => ({
                  ...snapshot,
                  metadata: { ...snapshot.metadata, selfPersisted: true },
                  authorization: {
                    ...snapshot.authorization,
                    edit: [],
                    editRoles: [],
                    view: ['private-viewer'],
                    viewRoles: [],
                  },
                  metaMetadata: { ...snapshot.metaMetadata, hookCommittedMarker: true },
                }),
              });
              expect(saved.outcome, JSON.stringify(saved)).to.equal('saved');
              const committed = await recordsService.getMeta(oid);
              hookRevision = committed.revision;
              if (partialCommit) {
                return { metadata: { ...committed.metadata, laterHook: true }, revision: committed.revision };
              }
              return { ...record, ...committed };
            },
          });
          try {
            const initial = {
              metadata: { title: 'Self-persisting postSync integration', text_2_component_event: 'Required value' },
              metaMetadata: { type: 'rdmp', brandId: brand.id, form: draft.config.form, attachmentFields: [] },
            };
            let result;
            if (operation === 'create') {
              result = await recordsService.create(
                brand,
                initial,
                configuredType,
                user,
                false,
                true,
                phase === 'transition' ? draft.name : null
              );
              if (result.oid) createdOids.push(String(result.oid));
            } else {
              const created = await recordsService.create(brand, initial, configuredType, user, false, false);
              expect(created.outcome, JSON.stringify(created)).to.equal('saved');
              const oid = String(created.oid);
              createdOids.push(oid);
              result = await recordsService.updateMeta(
                brand,
                oid,
                await recordsService.getMeta(oid),
                user,
                false,
                true,
                phase === 'transition' ? draft : {}
              );
            }
            await new Promise(resolve => setImmediate(resolve));
            expect(result.outcome, JSON.stringify(result)).to.equal('saved');
            expect(result.problems).to.deep.equal([]);
            const stored = await recordsService.getMeta(String(result.oid));
            expect(stored.metadata.selfPersisted).to.equal(true);
            expect(stored.authorization.edit).to.deep.equal([]);
            expect(stored.authorization.view).to.deep.equal(['private-viewer']);
            expect(stored.metaMetadata.hookCommittedMarker).to.equal(true);
            if (partial || partialCommit) expect(stored.metadata.laterHook).to.equal(true);
            expect(stored.revision).to.equal(hookRevision! + 1);
            expect(result.concurrency.revision).to.equal(stored.revision);
            expect(events).to.deep.equal(
              phase === 'transition' ? ['self-save', 'save-post', 'transition-post'] : ['self-save', 'save-post']
            );
          } finally {
            await sails.models.recordtype.updateOne({ id: recordType.id }).set({
              hooks: recordType.hooks,
              searchable: recordType.searchable,
            });
            Reflect.deleteProperty(globalThis, '__integrationPostSyncCommit');
            Reflect.deleteProperty(globalThis, '__integrationPostSyncEvents');
          }
        });
      }
    }
  }

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
      { username: 'admin', password: 'audit-password', token: 'audit-token' },
      false,
      false
    );

    expect(createResponse.isSuccessful()).to.equal(true);
    const oid = String(createResponse.oid);
    createdOids.push(oid);

    // Save finalization writes the audit after detached hooks finish, without an Agenda worker.
    const audits = await waitForJob(
      (async () => {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          const audits = await RecordAudit.find({ redboxOid: oid, action: 'created' });
          if (audits.length > 0) return audits;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        throw new Error('Timed out waiting for the created record audit');
      })()
    );
    expect(audits).to.have.length(1);
    expect(audits[0].action).to.equal('created');
    expect(audits[0].record.metadata.title).to.equal('RecordsService permission summary integration test');
    expect(audits[0].occurredAt).to.equal(audits[0].record.metaMetadata.createdOn);
    expect(audits[0].user).to.deep.equal({ username: 'admin' });

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

  it('retains restored concurrency metadata and a class-backed actor through the Mongo audit sanitizer', async function () {
    const oid = `records-service-restored-audit-${Date.now()}`;
    createdOids.push(oid);
    const brand = BrandingService.getDefault();
    const actor = new UserModel();
    actor.username = 'admin';
    actor.password = 'restore-password';
    actor.token = 'restore-token';
    actor.lastLogin = new Date('2026-03-01T12:00:00Z');
    const storage = sails.services[sails.config.storage.serviceName];
    const created = await storage.create(
      brand,
      {
        redboxOid: oid,
        metadata: { title: 'Restored record audit regression' },
        metaMetadata: { brandId: brand.id, type: 'rdmp', form: 'default-1.0-draft', createdBy: 'admin' },
        workflow: { stage: 'draft' },
        authorization: { edit: ['admin'], view: ['admin'] },
      },
      {},
      actor
    );
    expect(created.success).to.equal(true);
    // Use the lifecycle service so the tombstone owns the record's durable identity and revision.
    const deleted = await recordsService.delete(oid, actor);
    expect(deleted.wasPersisted(), JSON.stringify(deleted)).to.equal(true);
    const startedAt = Date.now();

    const response = await recordsService.restoreRecord(oid, actor);

    expect(response.wasPersisted(), JSON.stringify(response)).to.equal(true);
    expect(response.isSuccessful()).to.equal(true);
    const audits = await RecordAudit.find({ redboxOid: oid, action: 'restored' });
    expect(audits).to.have.length(1);
    expect(audits[0].record).to.deep.equal({
      revision: response.concurrency.revision,
      resolution: response.concurrency.resolution,
    });
    expect(response.data.metadata.title).to.equal('Restored record audit regression');
    expect(audits[0].user).to.deep.equal(JSON.parse(JSON.stringify(actor)));
    expect(audits[0].user).to.include({ username: 'admin', lastLogin: '2026-03-01T12:00:00.000Z' });
    expect(audits[0].user).not.to.have.property('password');
    expect(audits[0].user).not.to.have.property('token');
    expect(Date.parse(audits[0].occurredAt)).to.be.within(startedAt, Date.now());
  });

  for (const failWrite of [false, true]) {
    it(`dispatches the configured legacy audit job and records ${failWrite ? 'storage failure' : 'completion after persistence'}`, async function () {
      const oid = `records-service-agenda-audit-${Date.now()}-${failWrite}`;
      createdOids.push(oid);
      const storageService = sails.services[sails.config.storage.serviceName];
      const originalWrite = storageService.createRecordAudit.bind(storageService);
      let releaseWrite!: () => void;
      let signalStarted!: () => void;
      const released = new Promise<void>(resolve => {
        releaseWrite = resolve;
      });
      const started = new Promise<void>(resolve => {
        signalStarted = resolve;
      });
      const failureMessage = 'Legacy audit integration storage failure';
      const write = sinon.stub(storageService, 'createRecordAudit').callsFake(async (payload: unknown) => {
        if (_.get(payload, 'redboxOid') !== oid) return originalWrite(payload);
        signalStarted();
        await released;
        if (failWrite) throw new Error(failureMessage);
        return originalWrite(payload);
      });
      let queuedJob: Job | undefined;
      let resolveComplete!: (job: Job) => void;
      let didComplete = false;
      const completed = new Promise<Job>(resolve => {
        resolveComplete = resolve;
      });
      const onComplete = (job: Job) => {
        if (_.get(job.attrs.data, 'redboxOid') === oid) {
          didComplete = true;
          resolveComplete(job);
        }
      };
      const jobName = sails.config.record.auditing.recordAuditJobName;

      try {
        queuedJob = await AgendaQueueService.now(jobName, {
          redboxOid: oid,
          action: 'updated',
          user: { username: 'admin' },
          record: { metadata: { title: 'Dispatched legacy snapshot' } },
        });
        queuedJob.agenda.on(`complete:${jobName}`, onComplete);
        await waitForJob(started);
        // Give Agenda time to expose an incorrectly completed fire-and-forget handler.
        await new Promise(resolve => setTimeout(resolve, 100));
        const running = await queuedJob.agenda.db.getJobById(String(queuedJob.attrs._id));
        expect(didComplete).to.equal(false);
        expect(running?.lastFinishedAt == null).to.equal(true);
        expect(running?.failedAt == null).to.equal(true);
        expect(await RecordAudit.find({ redboxOid: oid })).to.have.length(0);

        releaseWrite();
        await waitForJob(completed);
        const finished = await queuedJob.agenda.db.getJobById(String(queuedJob.attrs._id));
        if (failWrite) {
          expect(finished?.failedAt).to.be.instanceOf(Date);
          expect(finished?.failReason).to.equal(failureMessage);
          expect(finished?.failCount).to.equal(1);
          expect(await RecordAudit.find({ redboxOid: oid })).to.have.length(0);
        } else {
          expect(finished?.lastFinishedAt).to.be.instanceOf(Date);
          expect(finished?.failedAt == null).to.equal(true);
          const audits = await RecordAudit.find({ redboxOid: oid });
          expect(audits).to.have.length(1);
          expect(audits[0].record.metadata.title).to.equal('Dispatched legacy snapshot');
        }
      } finally {
        releaseWrite();
        try {
          if (queuedJob) await waitForJob(completed);
        } finally {
          write.restore();
          if (queuedJob) {
            queuedJob.agenda.off(`complete:${jobName}`, onComplete);
            await queuedJob.remove();
          }
        }
      }
    });
  }

  it('persists an outstanding legacy audit before the worker completes', async function () {
    const oid = `records-service-legacy-audit-${Date.now()}`;
    createdOids.push(oid);
    const data = {
      redboxOid: oid,
      action: 'updated',
      user: { username: 'admin' },
      record: { metadata: { title: 'Legacy snapshot' }, lastSaveDate: '2026-03-01T12:00:00Z' },
    };

    await recordsService.storeRecordAudit({ attrs: { data } });

    const audits = await RecordAudit.find({ redboxOid: oid });
    expect(audits).to.have.length(1);
    expect(audits[0].record).to.deep.equal(data.record);
    expect(audits[0].user).to.deep.equal(data.user);
    expect(audits[0].action).to.equal('updated');
  });

  it('deduplicates simultaneous direct inserts and queue redelivery using the same audit ID', async function () {
    const oid = `records-service-idempotent-audit-${Date.now()}`;
    createdOids.push(oid);
    const storageService = sails.services[sails.config.storage.serviceName];
    const data = {
      auditId: randomBytes(12).toString('hex'),
      redboxOid: oid,
      action: 'updated',
      occurredAt: '2026-03-01T12:00:00Z',
      user: { username: 'admin' },
      record: { metadata: { title: 'Single event, multiple deliveries' } },
    };

    const responses = await Promise.all(Array.from({ length: 4 }, () => storageService.createRecordAudit(data)));
    expect(responses.every(response => response.success === true)).to.equal(true);
    await recordsService.recoverRecordAudit({ attrs: { data: JSON.parse(JSON.stringify(data)) } });
    const audits = await RecordAudit.find({ redboxOid: oid });
    expect(audits).to.have.length(1);
    expect(audits[0].id).to.equal(data.auditId);
    expect(audits[0].record).to.deep.equal(data.record);
    expect(audits[0].occurredAt).to.equal(data.occurredAt);
  });

  it('keeps index builds alive and releases stalled audit and Agenda write permits at the driver', async function () {
    // Exercise the driver's actual network timeout, rather than another Promise.race.
    const { MongoClient } = require(
      require.resolve('mongodb', { paths: [require.resolve('sails-mongo')] })
    ) as typeof import('mongodb');
    for (const datastore of ['mongodb', 'redboxStorage']) {
      const options = sails.config.datastores[datastore];
      expect(options.socketTimeoutMS).to.equal(120000);
      const manager = sails.getDatastore(datastore).manager;
      expect(manager.client.options.socketTimeoutMS).to.equal(options.socketTimeoutMS);
    }
    const target = new URL(sails.config.datastores.redboxStorage.url);
    const targetHost = target.hostname;
    const targetPort = Number(target.port || 27017);
    const sockets = new Set<Socket>();
    let stalled = false;
    let responseDelayMs = 0;
    const proxy = createServer(socket => {
      socket.setNoDelay(true);
      const upstream = connect(targetPort, targetHost);
      upstream.setNoDelay(true);
      sockets.add(socket);
      sockets.add(upstream);
      socket.on('data', data => {
        if (!stalled) upstream.write(data);
      });
      upstream.on('data', data => {
        if (responseDelayMs > 0)
          setTimeout(() => {
            if (!socket.destroyed) socket.write(data);
          }, responseDelayMs);
        else socket.write(data);
      });
      socket.on('error', () => upstream.destroy());
      upstream.on('error', () => socket.destroy());
      socket.on('close', () => {
        sockets.delete(socket);
        upstream.destroy();
      });
      upstream.on('close', () => {
        sockets.delete(upstream);
        socket.destroy();
      });
    });
    await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
    const address = proxy.address();
    if (!address || typeof address === 'string') throw new Error('Mongo fault proxy has no TCP address');
    target.host = `127.0.0.1:${address.port}`;
    const client = new MongoClient(target.toString(), {
      socketTimeoutMS: 1000,
      waitQueueTimeoutMS: 250,
      connectTimeoutMS: 1000,
      serverSelectionTimeoutMS: 2000,
      maxPoolSize: 1,
      retryWrites: false,
    });
    const collectionName = `auditDriverTimeoutTest_${randomBytes(12).toString('hex')}`;
    const queueCollection = `${collectionName}_jobs`;
    let dispatcher: Agenda | undefined;
    let stage = 'opening the proxy connection';
    try {
      const collection = client.db().collection(collectionName);
      await collection.insertOne({ warmup: true });
      stage = 'building an index beyond the ordinary socket timeout';
      responseDelayMs = 1500;
      const indexBuildOptions = { socketTimeoutMS: 0, maxTimeMS: 0 };
      await collection.createIndex({ warmup: 1 }, indexBuildOptions);
      responseDelayMs = 0;
      stage = 'ending a stalled write';
      stalled = true;
      const writer = new AuditWriter();
      let finishWrite!: () => void;
      const underlyingEnded = new Promise<void>(resolve => {
        finishWrite = resolve;
      });
      let driverFailure: unknown;
      try {
        await writer.run(
          async () => {
            try {
              await collection.insertOne({ stalled: true });
            } catch (error) {
              driverFailure = error;
              throw error;
            } finally {
              finishWrite();
            }
          },
          { maxConcurrentWrites: 1, writeAttempts: 1, writeTimeoutMs: 25 }
        );
        throw new Error('Expected the audit caller deadline to expire');
      } catch (error) {
        expect(error).to.be.instanceOf(AuditWriteTimeout);
      }
      const poolFailure = await collection.insertOne({ waitingForConnection: true }).then(
        () => null,
        error => error
      );
      expect(poolFailure).to.have.property('name', 'MongoWaitQueueTimeoutError');
      await waitForJob(underlyingEnded);
      expect(driverFailure).to.have.property('name', 'MongoNetworkTimeoutError');
      stalled = false;
      stage = 'writing after driver recovery';
      await writer.run(
        async () => {
          await collection.insertOne({ recovered: true });
        },
        {
          maxConcurrentWrites: 1,
          writeAttempts: 3,
          writeTimeoutMs: 5000,
        }
      );
      expect(await collection.countDocuments({ recovered: true })).to.equal(1);

      stage = 'opening Agenda’s separate Mongo connection';
      target.searchParams.set('retryWrites', 'false');
      target.searchParams.set('maxPoolSize', '1');
      target.searchParams.set('serverSelectionTimeoutMS', '2000');
      dispatcher = await AgendaQueueService.createAgendaForBackend(
        'mongodb',
        {
          ...sails.config.agendaQueue.options,
          db: target.toString(),
          collection: queueCollection,
          mongoOptions: { socketTimeoutMS: 1000, waitQueueTimeoutMS: 250 },
        },
        User.getDatastore().manager
      );
      const queued = await dispatcher!.now('audit-timeout-test', {});
      const repository = dispatcher!.db as MongoAuditQueueRepository;
      expect(repository.getDb().client.options.socketTimeoutMS).to.equal(1000);
      expect(repository.getDb().client.options.waitQueueTimeoutMS).to.equal(250);
      const enqueueWriter = new AuditWriter();
      let finishSave!: () => void;
      const saveEnded = new Promise<void>(resolve => {
        finishSave = resolve;
      });
      let saveFailure: unknown;
      stage = 'ending a stalled Agenda quarantine save';
      stalled = true;
      try {
        await enqueueWriter.run(
          async () => {
            try {
              await queued.disable().save();
            } catch (error) {
              saveFailure = error;
              throw error;
            } finally {
              finishSave();
            }
          },
          { maxConcurrentWrites: 1, writeAttempts: 1, writeTimeoutMs: 25 }
        );
        throw new Error('Expected the recovery caller deadline to expire');
      } catch (error) {
        expect(error).to.be.instanceOf(AuditWriteTimeout);
      }
      await waitForJob(saveEnded);
      expect(saveFailure).to.have.property('name', 'MongoNetworkTimeoutError');
      stalled = false;
      stage = 'enqueuing after Agenda driver recovery';
      await enqueueWriter.run(
        async () => {
          await dispatcher!.now('audit-timeout-recovered', {});
        },
        {
          maxConcurrentWrites: 1,
          writeAttempts: 3,
          writeTimeoutMs: 5000,
        }
      );
      expect(
        await repository.getDb().collection(queueCollection).countDocuments({ name: 'audit-timeout-recovered' })
      ).to.equal(1);
    } catch (error) {
      throw new Error(`Mongo fault test failed while ${stage}`, { cause: error });
    } finally {
      stalled = false;
      responseDelayMs = 0;
      try {
        await RecordAudit.getDatastore().manager.collection(collectionName).drop();
        if (dispatcher) await (dispatcher.db as MongoAuditQueueRepository).collection.drop();
      } finally {
        if (dispatcher) await (dispatcher.db as MongoAuditQueueRepository).disconnect();
        await client.close();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>(resolve => proxy.close(() => resolve()));
      }
    }
  });

  it('quarantines an invalid recovery snapshot without blocking valid jobs or allowing history cleanup to remove it', async function () {
    const oid = `records-service-quarantine-audit-${Date.now()}`;
    createdOids.push(oid);
    const jobName = sails.config.record.auditing.recordAuditRecoveryJobName;
    const options = {
      ...sails.config.agendaQueue.options,
      processEvery: '0.1 seconds',
      collection: `recordAuditQuarantineTest_${randomBytes(12).toString('hex')}`,
    };
    let dispatcher: Agenda | undefined;
    try {
      dispatcher = await AgendaQueueService.createAgendaForBackend('mongodb', options, User.getDatastore().manager);
      const originalQueueConfig = sails.config.agendaQueue;
      const definition = originalQueueConfig.jobs[jobName];
      dispatcher!.define(
        jobName,
        async job => {
          // Mixed-backend deployments also accept job arrays. Keep this override local to handler execution.
          const config = sinon.stub(sails.config, 'agendaQueue').value({
            ...originalQueueConfig,
            options: { ...originalQueueConfig.options, backend: 'sqs' },
            jobs: [{ ...definition, name: jobName, backend: 'mongodb' }],
          });
          try {
            await recordsService.recoverRecordAudit(job);
          } finally {
            config.restore();
          }
        },
        definition.options
      );
      const snapshot = {
        auditId: randomBytes(12).toString('hex'),
        redboxOid: oid,
        action: { invalid: true },
        record: { metadata: { title: 'Retain for operator inspection' } },
      };
      const invalid = await dispatcher!.now(jobName, snapshot);
      const clientOptions = (dispatcher!.db as MongoAuditQueueRepository).getDb().client.options;
      expect(clientOptions.socketTimeoutMS).to.equal(30000);
      expect(clientOptions.waitQueueTimeoutMS).to.equal(30000);
      const valid = await dispatcher!.now(jobName, {
        ...snapshot,
        action: 'updated',
        auditId: randomBytes(12).toString('hex'),
      });
      const completed = new Set<string>();
      let finish!: () => void;
      const finished = new Promise<void>(resolve => {
        finish = resolve;
      });
      dispatcher!.on(`complete:${jobName}`, job => {
        completed.add(String(job.attrs._id));
        if (completed.has(String(invalid.attrs._id)) && completed.has(String(valid.attrs._id))) finish();
      });
      await dispatcher!.start();
      await waitForJob(finished);
      const quarantined = await dispatcher!.db.getJobById(String(invalid.attrs._id));
      expect(quarantined?.disabled).to.equal(true);
      expect(quarantined?.failCount).to.equal(1);
      expect(quarantined?.nextRunAt == null).to.equal(true);
      expect(quarantined?.data).to.deep.equal(snapshot);
      expect(await RecordAudit.find({ redboxOid: oid })).to.have.length(1);

      const config = sinon.stub(sails.config.agendaQueue, 'options').value(options);
      try {
        await AgendaQueueService.moveCompletedJobsToHistory({});
      } finally {
        config.restore();
      }
      expect((await dispatcher!.db.getJobById(String(invalid.attrs._id)))?.data).to.deep.equal(snapshot);
      expect((await dispatcher!.db.getJobById(String(valid.attrs._id))) == null).to.equal(true);
    } finally {
      if (dispatcher) {
        await dispatcher.stop(false);
        try {
          await (dispatcher.db as MongoAuditQueueRepository).collection.drop();
          await User.getDatastore().manager.collection(`${options.collection}History`).drop();
        } finally {
          await (dispatcher.db as MongoAuditQueueRepository).disconnect();
        }
      }
    }
  });

  it('recovers a failed direct write after dispatcher reconstruction and persists retry backoff', async function () {
    const oid = `records-service-durable-audit-${Date.now()}`;
    createdOids.push(oid);
    const storageService = sails.services[sails.config.storage.serviceName];
    const originalWrite = storageService.createRecordAudit.bind(storageService);
    let storageAvailable = false;
    const write = sinon.stub(storageService, 'createRecordAudit').callsFake(async (payload: unknown) => {
      if (_.get(payload, 'redboxOid') === oid && !storageAvailable) throw new Error('Durable audit integration outage');
      return originalWrite(payload);
    });
    const jobName = sails.config.record.auditing.recordAuditRecoveryJobName;
    const options = {
      ...sails.config.agendaQueue.options,
      processEvery: '0.1 seconds',
      collection: `recordAuditRecoveryTest_${randomBytes(12).toString('hex')}`,
    };
    const originalNow = AgendaQueueService.now.bind(AgendaQueueService);
    let enqueue: sinon.SinonStub | undefined;
    let producer: Agenda | undefined;
    let queuedJob: Job | undefined;
    let restarted: Agenda | undefined;
    try {
      // The producer never starts polling. Existing application workers cannot see this collection.
      producer = await AgendaQueueService.createAgendaForBackend('mongodb', options, User.getDatastore().manager);
      const initial = producer!;
      enqueue = sinon.stub(AgendaQueueService, 'now').callsFake((name: string, data: unknown) => {
        return name === jobName && _.get(data, 'redboxOid') === oid ? initial.now(name, data) : originalNow(name, data);
      });
      await recordsService.auditRecord(
        oid,
        {
          metadata: { title: 'Snapshot retained through restart' },
          lastSaveDate: '2026-03-01T12:00:00Z',
        },
        { username: 'admin', password: 'secret', token: 'secret-token' }
      );
      const recoveryCall = enqueue
        .getCalls()
        .find(call => call.args[0] === jobName && _.get(call.args[1], 'redboxOid') === oid);
      if (!recoveryCall) throw new Error('Failed direct audit was not enqueued for recovery');
      queuedJob = await recoveryCall.returnValue;
      const saved = await initial.db.getJobById(String(queuedJob!.attrs._id));
      expect(saved?.data.auditId).to.match(/^[a-f0-9]{24}$/);
      expect(saved?.data.user).to.deep.equal({ username: 'admin' });
      expect(saved?.data.record.metadata.title).to.equal('Snapshot retained through restart');
      expect(saved?.data.occurredAt).to.equal('2026-03-01T12:00:00Z');

      // A fresh dispatcher reads the Mongo-persisted job; no in-memory retry fiber is reused.
      restarted = await AgendaQueueService.createAgendaForBackend('mongodb', options, User.getDatastore().manager);
      expect(restarted!.attrs.processEvery).to.equal(100);
      const configuredJob = sails.config.agendaQueue.jobs[jobName];
      expect(typeof configuredJob.options.backoff).to.equal('function');
      restarted!.define(jobName, job => recordsService.recoverRecordAudit(job), configuredJob.options);
      let resolveFailed!: () => void;
      let resolveRecovered!: () => void;
      const failed = new Promise<void>(resolve => {
        resolveFailed = resolve;
      });
      const recovered = new Promise<void>(resolve => {
        resolveRecovered = resolve;
      });
      restarted!.on(`complete:${jobName}`, job => {
        if (_.get(job.attrs.data, 'redboxOid') !== oid) return;
        if (!storageAvailable) resolveFailed();
        else resolveRecovered();
      });
      await restarted!.start();
      await waitForJob(failed);
      const retrying = await restarted!.db.getJobById(String(queuedJob!.attrs._id));
      expect(retrying?.failCount).to.be.greaterThan(0);
      expect(retrying?.nextRunAt).to.be.instanceOf(Date);
      expect(retrying?.data.auditId).to.equal(saved!.data.auditId);
      expect(await RecordAudit.find({ redboxOid: oid })).to.have.length(0);

      storageAvailable = true;
      await waitForJob(recovered);
      const finished = await restarted!.db.getJobById(String(queuedJob!.attrs._id));
      expect(finished?.nextRunAt == null).to.equal(true);
      expect(finished?.lastFinishedAt).to.be.instanceOf(Date);
      const audits = await RecordAudit.find({ redboxOid: oid });
      expect(audits).to.have.length(1);
      expect(audits[0].id).to.equal(saved!.data.auditId);
      expect(audits[0].record.metadata.title).to.equal('Snapshot retained through restart');
      expect(audits[0].occurredAt).to.equal(saved!.data.occurredAt);
    } finally {
      storageAvailable = true;
      if (restarted) await restarted.stop(false);
      write.restore();
      enqueue?.restore();
      try {
        if (producer) await (producer.db as MongoAuditQueueRepository).collection.drop();
      } finally {
        if (producer) await (producer.db as MongoAuditQueueRepository).disconnect();
        if (restarted) await (restarted.db as MongoAuditQueueRepository).disconnect();
      }
    }
  });
});
