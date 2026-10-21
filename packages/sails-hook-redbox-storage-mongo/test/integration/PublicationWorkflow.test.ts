import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MongoClient } from 'mongodb';
import { of } from 'rxjs';
import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import {
  PublicationService as CorePublication,
  PublicationPublishing,
  PublicationExecution,
  publicationDigest,
  importPublicationIntents,
  runPublicationWorker,
  dispatchPublications,
  evaluatePublicationWorkflow,
  type PublicationProviderExecution,
  type PublicationWorkKey,
  reopenPublicationSource,
  PublicationStaging,
  type PublicationObject,
  type PublicationProvider,
  type PublicationProviderOutcome,
  type PublicationConfigurationContext,
  type StorageService,
  migratePublication,
  migrationJson,
  convertPublicationConfiguration,
  PublicationMigrationStore,
} from '@researchdatabox/redbox-core';
import { FigsharePublishing } from '@researchdatabox/redbox-core/dist/configmodels/FigsharePublishing';
import { emptyFigshareEvidence } from '@researchdatabox/redbox-core/dist/services/figshare-v2/publication-state';
import { Services as RecordServices } from '@researchdatabox/redbox-core/dist/services/RecordsService.js';
import { isPublicationObject } from '@researchdatabox/redbox-core/dist/services/publication/builtins.js';
import { Services } from '../../src/services/MongoStorageService';
import { Services as WorkflowServices } from '@researchdatabox/redbox-core/dist/services/WorkflowStepsService.js';
import { publicationSource } from '../../src/services/publicationSourcePersistence';
import { storage } from '../../src/config/storage';

if (process.env.CI && !process.env.MONGO_TEST_URL)
  throw new Error('CI requires MONGO_TEST_URL for PUB-12 save acceptance');
const describeMongo = process.env.MONGO_TEST_URL ? describe : describe.skip;
describeMongo('Publication projections and workflow integration (PUB-12, real Mongo)', function () {
  this.timeout(30000);
  const database = `publication_workflow_${randomUUID().replaceAll('-', '')}`;
  const brand = { id: 'brand', name: 'brand', css: '', roles: [] };
  const user = { username: 'approver', type: 'local', roles: [], disabled: false };
  const recordType = { id: 'pubtype', name: 'dataPublication', searchable: false, hooks: {} };
  const savedGlobals = new Map<string, unknown>();
  let client: MongoClient;
  let mongo: Services.MongoStorageService;
  let records: RecordServices.Records;
  let publication: TestPublication;
  let configuration: PublicationPublishing;
  let directory: string;
  let disk: Disk;
  let providerMutations = 0;
  let hookCalls = 0;
  let serviceAccess = true;
  let completing = new Set(['archive', 'repository']);
  type Context = PublicationProviderExecution<PublicationObject, PublicationObject, PublicationObject>;
  let executionFault: ((context: Context) => Promise<void>) | undefined;
  let preparationFault: (() => Promise<void>) | undefined;
  let postHook: ((record: Record<string, unknown>) => Promise<Record<string, unknown>>) | undefined;
  let savedConfig: unknown;
  let savedServices: unknown;
  let requesterDisabled = false;
  let durableAuthority = false;
  const objectResult = (value: unknown) =>
    isPublicationObject(value)
      ? { valid: true as const, value }
      : { valid: false as const, issues: [{ path: '', code: 'object', message: 'Object required' }] };
  const outputPaths = (configuration: PublicationObject): string[] => {
    const paths = isPublicationObject(configuration.writeBack) ? Object.values(configuration.writeBack) : [];
    if (!paths.every((path): path is string => typeof path === 'string')) throw new Error('Invalid outputs');
    return paths;
  };
  const mutate = async (context: Context): Promise<PublicationProviderOutcome<PublicationObject>> => {
    await executionFault?.(context);
    await context.assertAuthority();
    if (!completing.has(context.destinationId))
      return { kind: 'waiting', state: context.state, reason: 'manual_publication' };
    providerMutations++;
    const paths = outputPaths(context.configuration);
    await context.project({ [paths[0]]: 'completed', [paths[1]]: `https://example.test/${context.destinationId}` });
    const remote = { namespace: 'ledger:actual', objectId: context.destinationId };
    await context.bind({ ...remote, targetFingerprint: 'verified-target', evidence: { confirmed: true } });
    return {
      kind: 'completed',
      state: { deposited: true },
      links: { public: `https://example.test/${context.destinationId}` },
      evidence: {
        approvalId: context.approval.id,
        approvalEpoch: context.approval.epoch,
        sourceGeneration: context.sourceGeneration,
        sourceDigest: publicationDigest({
          ...context.source,
          attachments: context.source.attachments.map(({ staged: _staged, ...attachment }) => attachment),
        }),
        confirmedAt: new Date().toISOString(),
        remote,
        deposit: { confirmed: true },
        ingestion: { state: 'not_required', evidence: {} },
        visibility: 'unverified',
      },
    };
  };
  const provider: PublicationProvider<PublicationObject, PublicationObject, PublicationObject> = {
    id: 'ledger',
    contractVersion: 2,
    stateVersion: 1,
    configurationSchema: {},
    secretPaths: ['connection.token'],
    mutationRecovery: { mode: 'idempotency-key' },
    capabilities: { synchronise: true, reconcile: true, observe: true, resourceLeases: false },
    validateConfiguration: value => {
      if (isPublicationObject(value) && isPublicationObject(value.mapping) && value.mapping.invalidConfig === true)
        return { valid: false, issues: [{ path: '/mapping', code: 'mapping', message: 'Invalid provider mapping' }] };
      return objectResult(value);
    },
    sourceMaintenancePaths: outputPaths,
    targetFingerprint: () => 'verified-target',
    decodeState: objectResult,
    upgradeState: objectResult,
    decodePreparedSource: objectResult,
    prepareSource: async input => {
      await preparationFault?.();
      if (isPublicationObject(input.configuration.mapping) && input.configuration.mapping.fail === true)
        return { valid: false, issues: [{ path: '/title', code: 'title', message: 'Title is required' }] };
      return {
        valid: true,
        value: {
          record: input.record,
          generated: input.generatedValues,
          outputPaths: outputPaths(input.configuration),
        },
      };
    },
    synchronise: mutate,
    reconcile: mutate,
    observe: mutate,
    repairs: [],
  };
  class TestPublication extends CorePublication.Services.Publication {
    registry() {
      return this.providerRegistry;
    }
    runtime() {
      return this.publicationRuntime();
    }
    protected override configureProviders(): void {
      super.configureProviders();
      this.registerProvider(provider);
    }
    protected override async sourceConfigurationContext(
      _brand: string,
      adapter: StorageService
    ): Promise<PublicationConfigurationContext> {
      if (durableAuthority) return super.sourceConfigurationContext(_brand, adapter);
      return {
        publicationStorage: adapter,
        authority: 'shared',
        verifiedTargets: { archive: 'verified-target', repository: 'verified-target' },
      };
    }
  }
  function globalValue(name: string, value: unknown) {
    if (!savedGlobals.has(name)) savedGlobals.set(name, Reflect.get(globalThis, name));
    Reflect.set(globalThis, name, value);
  }
  before(async () => {
    client = new MongoClient(process.env.MONGO_TEST_URL!, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    const db = client.db(database);
    await db.createCollection('record');
    for (const name of [
      'PublicationSync',
      'Record',
      'DeletedRecord',
      'RecordAudit',
      'IntegrationAudit',
      'RecordSchemaArtifact',
      'RecordSchemaReference',
    ])
      globalValue(name, {
        tableName: name.toLowerCase(),
        getDatastore: () => ({ manager: db }),
        findOne: (criteria: Record<string, unknown>) => db.collection(name.toLowerCase()).findOne(criteria),
      });
    const sails = Reflect.get(globalThis, 'sails');
    savedConfig = sails.config;
    savedServices = sails.services;
    sails.config = {
      ...sails.config,
      storage,
      recordSchema: { enabled: false },
      record: { auditing: { enabled: false }, baseUrl: {}, datastreamService: 'datastream' },
      jsonld: { addJsonLdContext: false, contexts: {} },
    };
    mongo = new Services.MongoStorageService();
    await mongo.init();
    directory = await mkdtemp(join(tmpdir(), 'pub12-workflow-'));
    disk = new Disk(new FSDriver({ location: directory, visibility: 'private' }));
    globalValue('BrandingService', {
      getBrandById: () => brand,
      getBrand: () => brand,
      getDefault: () => brand,
      getAvailable: () => ['brand'],
    });
    globalValue('FormsService', {
      getForm: async () => ({ name: 'publication-form', attachmentFields: [] }),
      getFormByName: () => of({ name: 'publication-form', attachmentFields: [] }),
    });
    globalValue('RolesService', { getRole: () => null, getAdminFromBrand: () => ({ id: 'admin', name: 'Admin' }) });
    globalValue('WorkflowStep', {
      findOne: (criteria: { name?: string }) => ({
        exec: (callback: (error: null, result: unknown) => void) =>
          callback(null, {
            name: criteria.name ?? 'queued',
            config: {
              workflow: { stage: criteria.name ?? 'queued', stageLabel: criteria.name ?? 'queued' },
              form: 'publication-form',
              authorization: { editRoles: [], viewRoles: [] },
            },
          }),
      }),
    });
    globalValue('WorkflowStepsService', new WorkflowServices.WorkflowSteps().exports());
    globalValue('IntegrationAuditService', { recordPublicationAudit: async () => {} });
    globalValue('AgendaQueueService', { now: async () => {} });
    globalValue('RecordTypesService', { get: () => of(recordType) });
    globalValue('RecordValidationService', {
      resolve: async () => ({ status: 'unresolved', shouldBlock: false, mode: 'shadow', diagnostics: [] }),
    });
    globalValue('TranslationService', { t: (key: string) => key });
    globalValue('StorageManagerService', { disk: () => disk });
    globalValue('UsersService', {
      getUserWithUsername: (username: string) =>
        of({
          username,
          type: 'local',
          disabled: username === 'worker' ? !serviceAccess : requesterDisabled,
          roles: [],
        }),
    });
    globalValue('AppConfigService', { getAppConfigurationForBrand: () => ({ publicationPublishing: configuration }) });
    globalValue('__publicationHooks', {
      run: async (_oid: unknown, record: Record<string, unknown>) => {
        hookCalls++;
        return postHook ? postHook(record) : record;
      },
    });
  });
  after(async () => {
    const sails = Reflect.get(globalThis, 'sails');
    sails.config = savedConfig;
    sails.services = savedServices;
    for (const [name, value] of savedGlobals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name);
      else Reflect.set(globalThis, name, value);
    }
    if (client) {
      await client.db(database).dropDatabase();
      await client.close();
    }
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await mongo.recordCol.deleteMany({});
    await mongo.recordIdentityCol.deleteMany({});
    await mongo.deletedRecordCol.deleteMany({});
    for (const name of [
      'publicationsync',
      'publicationdestination',
      'publicationresourcelease',
      'publicationworkflowdecision',
      'publicationmigration',
      'publicationmigrationitem',
      'publicationmigrationinventory',
      'publicationadmincontrol',
      'publicationcorrection',
      'figsharesync',
    ])
      await client.db(database).collection(name).deleteMany({});
    hookCalls = 0;
    durableAuthority = false;
    serviceAccess = true;
    completing = new Set(['archive', 'repository']);
    executionFault = undefined;
    configuration = new PublicationPublishing();
    configuration.processing = {
      ...configuration.processing,
      enabled: true,
      serviceUsername: 'worker',
      stagingDisk: 'durable',
    };
    const destination = {
      provider: 'ledger',
      displayName: 'Archive',
      enabled: true,
      archived: false,
      connection: { token: 'private' },
      mapping: {},
      attachments: {},
      providerOptions: {},
      writeBack: {},
    };
    configuration.processing.coalesceMs = 1;
    configuration.processing.retryBaseMs = 1;
    configuration.destinations = {
      archive: {
        ...structuredClone(destination),
        writeBack: { status: 'metadata.archive.status', link: 'metadata.archive.url' },
      },
      repository: {
        ...structuredClone(destination),
        writeBack: { status: 'metadata.repository.status', link: 'metadata.repository.url' },
      },
    };
    configuration.sourcePolicies = [
      {
        id: 'approve',
        version: 1,
        mode: 'approval',
        recordType: 'dataPublication',
        event: 'onCreate',
        destinations: ['archive', 'repository'],
        grantCondition: '<%= record.workflow.stage === "queued" %>',
      },
    ];
    configuration.workflow.rules = [
      {
        id: 'publish',
        version: 1,
        recordType: 'dataPublication',
        destinations: ['archive', 'repository'],
        completion: 'all',
        targetStage: 'published',
      },
    ];
    providerMutations = 0;
    preparationFault = undefined;
    postHook = undefined;
    requesterDisabled = false;
    recordType.hooks = {};
    records = new RecordServices.Records();
    records.storageService = mongo;
    Reflect.set(records, 'searchService', { index: async () => true });
    Reflect.set(records, 'queueService', { now: async () => {} });
    Reflect.set(records, 'datastreamService', { listDatastreams: async () => [] });
    globalValue('RecordsService', records.exports());
    publication = new TestPublication();
    publication.bootstrap();
    globalValue('PublicationService', publication.exports());
  });
  async function create(post = false, candidate: Record<string, unknown> = {}) {
    return records.create(
      brand,
      {
        redboxOid: 'record',
        metadata: { title: 'Approved source' },
        authorization: { edit: ['approver', 'worker'], editRoles: [], view: [], viewRoles: [] },
        ...candidate,
      },
      recordType,
      user,
      false,
      post
    );
  }
  async function current() {
    const record = await mongo.recordCol.findOne({ redboxOid: 'record' });
    assert.ok(record);
    return { record, state: publicationSource(record.publicationSource) };
  }
  const key: PublicationWorkKey = { brandId: 'brand', oid: 'record', destinationId: 'archive' };
  async function start(completion: 'all' | 'any' = 'all') {
    configuration.workflow.rules[0].completion = completion;
    recordType.hooks = { onTransitionWorkflow: { pre: [{ function: '__publicationHooks.run' }] } };
    const response = await create();
    assert.equal(response.isComplete(), true, JSON.stringify(response));
    const runtime = publication.runtime();
    await importPublicationIntents(runtime, await mongo.getMeta('record'));
    return runtime;
  }
  async function run(destinationId: string, runtime = publication.runtime()) {
    await runPublicationWorker(runtime, { attrs: { data: { ...key, destinationId } } });
  }
  it('PUB-21 pauses, drains, blocks globally, migrates and explicitly enables a brand while isolating quarantined legacy work', async () => {
    const db = client.db(database);
    const priorUsers = Reflect.get(globalThis, 'UsersService');
    const priorRoles = Reflect.get(globalThis, 'RolesService');
    try {
      globalValue('UsersService', {
        getUserWithUsername: (username: string) =>
          of({ username, type: 'local', roles: username === 'admin' ? [{ name: 'Admin', branding: 'brand' }] : [] }),
      });
      globalValue('RolesService', {
        getRole: () => null,
        getAdminFromBrand: () => ({ id: 'admin', name: 'Admin' }),
        getAdminFromRoles: (roles: Array<{ name: string }>) => roles.find(role => role.name === 'Admin'),
      });
      const cli = require(resolve(__dirname, '../../../../support/publication/admin.js'));
      const load = async () => ({ service: publication, close: async () => {} });
      await cli.main(
        ['pause', '--brand', 'brand', '--username', 'admin', '--apply', '--reason', 'Disposable drain'],
        load,
        () => {}
      );
      assert.equal(
        await db.collection('publicationsync').countDocuments({ 'lease.expiresAt': { $gt: Date.now() } }),
        0
      );
      const figshare = new FigsharePublishing();
      figshare.connection.baseUrl = 'https://api.figshare.test/v2';
      figshare.workflow.transitionJob.enabled = false;
      const prepared = convertPublicationConfiguration('brand', migrationJson({ figsharePublishing: figshare }), [], {
        figshareAccountId: '12',
        serviceUsername: 'worker',
        stagingDisk: 'durable',
      });
      const oldId = prepared.assignments.figshare;
      configuration.destinations[oldId] = prepared.config.destinations[oldId];
      configuration.processing.enabled = false;
      for (const destination of Object.values(configuration.destinations)) destination.enabled = false;
      const state = emptyFigshareEvidence('legacy', 'brand');
      state.work.sync.requested = 1;
      await db.collection('figsharesync').insertOne({ ...state });
      await db.collection('record').insertOne({
        redboxOid: 'legacy',
        revision: 1,
        recordVersion: 1,
        metaMetadata: { brandId: 'brand', type: 'dataPublication' },
        metadata: { title: 'Legacy pending' },
        authorization: { edit: ['admin', 'worker'], editRoles: [], view: [], viewRoles: [] },
      });
      const migration = () =>
        migratePublication(
          {
            db,
            storage: mongo,
            registry: publication.registry(),
            administrator: async () => ({ username: 'admin', userType: 'local' }),
            legacyConfiguration: async () =>
              migrationJson({ figsharePublishing: figshare, publicationPublishing: configuration }),
            recordTypes: async () => [],
            persistConfiguration: async (_brand, value) => {
              configuration = Object.assign(new PublicationPublishing(), value);
            },
            verifyConfiguration: async (_brand, config) =>
              Object.fromEntries(
                Object.entries(config.destinations).map(([id, destination]) => [
                  id,
                  publication.registry().get(destination.provider)!.targetFingerprint(destination),
                ])
              ),
          },
          {
            brandId: 'brand',
            username: 'admin',
            apply: true,
            reason: 'Disposable activation rehearsal',
            parameters: {
              useExistingConfiguration: true,
              assignments: { figshare: oldId },
              consumersStopped: true,
              evidenceReference: 'rehearsal/drain',
            },
          }
        );
      durableAuthority = true;
      await db.collection('publicationresourcelease').dropIndexes();
      await db.collection('publicationresourcelease').createIndex({ providerId: 1, namespace: 1, resourceKey: 1 });
      const blocked = migrationJson(await migration());
      assert.equal(blocked.blocked, true);
      assert.equal((await new PublicationMigrationStore(db).get('brand'))?.authority, 'preparing');
      configuration.processing.enabled = true;
      await assert.rejects(publication.validateConfigurationForSave('brand', configuration, undefined));
      configuration.processing.enabled = false;
      await db.collection('publicationresourcelease').dropIndex('providerId_1_namespace_1_resourceKey_1');
      assert.equal(migrationJson(await migration()).authority, 'shared');
      assert.equal(configuration.processing.enabled, false);
      assert.ok(Object.values(configuration.destinations).every(destination => !destination.enabled));
      await assert.rejects(
        new PublicationMigrationStore(db).assertNotQuarantined('brand', 'legacy', oldId),
        /quarantine/
      );
      configuration.processing.enabled = true;
      configuration.destinations.archive.enabled = true;
      configuration.destinations.repository.enabled = true;
      assert.equal(
        (await publication.validateConfigurationForSave('brand', configuration, undefined)).schemaVersion,
        1
      );
      // Pausing is independent of AppConfig enablement.
      assert.equal((await publication.runtime().configuration('brand')).processing.enabled, false);
      await cli.main(
        ['resume', '--brand', 'brand', '--username', 'admin', '--apply', '--reason', 'Accepted disposable activation'],
        load,
        () => {}
      );
      const runtime = await start('any');
      await run('archive', runtime);
      await dispatchPublications(runtime);
      assert.equal((await current()).record.workflow.stage, 'published');
      await run('repository', runtime);
      await dispatchPublications(runtime);
      const rows = await runtime.store.forRecord('brand', 'record');
      assert.equal(rows.filter(row => row.status === 'completed').length, 2);
      assert.equal(providerMutations, 2);
      assert.equal(hookCalls, 1);
      assert.equal(
        (await runtime.store.get({ ...key, oid: 'legacy', destinationId: oldId }))?.status,
        'repair_required'
      );
      assert.ok(
        (await new PublicationMigrationStore(db).get('brand'))?.history.some(item => item.globalFailures.length)
      );
    } finally {
      globalValue('UsersService', priorUsers);
      globalValue('RolesService', priorRoles);
    }
  });
  it('PUB-12 advances all once under concurrent destination completions and preserves both narrow outputs', async () => {
    const runtime = await start();
    await Promise.all([run('archive', runtime), run('repository', runtime)]);
    await dispatchPublications(runtime);
    const { state, record } = await current();
    assert.equal(record.workflow.stage, 'published');
    assert.equal(state.workflowDecision?.status, 'completed');
    assert.equal(state.workflowDecisionId, state.workflowDecision?.id);
    assert.equal(hookCalls, 1);
    assert.equal(state.revision, 1);
    assert.equal(
      state.approvals.some(approval => approval.revokedAt),
      false
    );
    assert.equal(record.metadata.archive.url, 'https://example.test/archive');
    assert.equal(record.metadata.repository.url, 'https://example.test/repository');
    assert.equal(await runtime.store.workflowDecisions.countDocuments({}), 1);
    await evaluatePublicationWorkflow(runtime, key);
    assert.equal(hookCalls, 1);
  });
  it('PUB-12 all retains a successful destination and waits for its fixed pending sibling', async () => {
    completing.delete('repository');
    const runtime = await start();
    await run('archive', runtime);
    assert.equal((await current()).record.workflow.stage, 'queued');
    assert.equal((await runtime.store.get(key))?.status, 'completed');
    assert.equal(hookCalls, 0);
    configuration.destinations.repository.enabled = false;
    await dispatchPublications(runtime);
    assert.equal((await current()).record.workflow.stage, 'queued');
    assert.equal((await current()).state.approvals[0].destinationIds.length, 2);
  });
  it('PUB-12 any counts a valid completion independently of a disabled completed sibling', async () => {
    const runtime = await start('any');
    const prepare = runtime.prepareWorkflowTransition!;
    runtime.prepareWorkflowTransition = async () => {
      throw new Error('Defer local coordination');
    };
    await run('archive', runtime);
    assert.equal((await runtime.store.get(key))?.status, 'completed');
    assert.equal(hookCalls, 0);
    runtime.prepareWorkflowTransition = prepare;
    configuration.destinations.archive.enabled = false;
    await run('repository', runtime);
    assert.equal((await current()).record.workflow.stage, 'published');
    assert.equal(hookCalls, 1);
  });
  for (const boundary of ['preparation', 'claim'] as const) {
    it(`PUB-12 revalidates workflow configuration after ${boundary} before invoking hooks`, async () => {
      const runtime = await start('any');
      const prepare = runtime.prepareWorkflowTransition!;
      const write = mongo.setPublicationRecordFields.bind(mongo);
      if (boundary === 'preparation') {
        runtime.prepareWorkflowTransition = async (...args) => {
          const result = await prepare(...args);
          configuration.workflow.rules = [];
          return result;
        };
      } else {
        mongo.setPublicationRecordFields = async projection => {
          const result = await write(projection);
          if (result.updated && projection.workflowDecision?.operation === 'claim') configuration.workflow.rules = [];
          return result;
        };
      }
      try {
        await run('archive', runtime);
      } finally {
        mongo.setPublicationRecordFields = write;
      }
      const { record, state } = await current();
      assert.equal(record.workflow.stage, 'queued');
      assert.equal(hookCalls, 0);
      assert.equal(state.workflowDecision?.status, boundary === 'claim' ? 'failed' : undefined);
      await dispatchPublications(runtime);
      assert.equal(hookCalls, 0);
    });
  }
  it('PUB-12 any preserves stage-gated approval and unfinished sibling execution after advancement', async () => {
    completing.delete('repository');
    const runtime = await start('any');
    await run('archive', runtime);
    await evaluatePublicationWorkflow(runtime, key);
    const before = await current();
    assert.equal(before.record.workflow.stage, 'published');
    assert.equal(before.state.approvals[0].revokedAt, undefined);
    assert.equal(before.state.revision, 1);
    completing.add('repository');
    await run('repository', runtime);
    assert.equal((await runtime.store.get({ ...key, destinationId: 'repository' }))?.status, 'completed');
    assert.equal((await current()).state.revision, 1);
    assert.equal(hookCalls, 1);
    assert.equal(providerMutations, 2);
  });
  it('PUB-12 remaining any work still enforces current service permissions', async () => {
    const runtime = await start('any');
    await run('archive', runtime);
    serviceAccess = false;
    await run('repository', runtime);
    assert.equal((await runtime.store.get({ ...key, destinationId: 'repository' }))?.status, 'revoked');
    assert.equal(providerMutations, 1);
    assert.equal(hookCalls, 1);
  });
  for (const change of ['revocation', 'continuation', 'configuration'] as const) {
    it(`PUB-12 remaining any work enforces current ${change} after advancement`, async () => {
      const runtime = await start('any');
      await run('archive', runtime);
      if (change === 'revocation') {
        const { record, state } = await current();
        await mongo.updateMeta(brand, 'record', record, undefined, {
          publicationIntent: {
            kind: 'revoke',
            expectedSourceRevision: state.revision,
            saveToken: randomUUID(),
            approvals: [],
            revocations: [{ approvalId: state.approvals[0].id, epoch: state.approvals[0].epoch }],
          },
        });
      } else if (change === 'continuation') configuration.sourcePolicies[0].continuationCondition = '<%= false %>';
      else configuration.destinations.repository.mapping.changed = true;
      await run('repository', runtime);
      const row = await runtime.store.get({ ...key, destinationId: 'repository' });
      assert.ok(row && ['revoked', 'superseded'].includes(row.status));
      assert.equal(providerMutations, 1);
      assert.equal(hookCalls, 1);
      assert.equal((await current()).record.workflow.stage, 'published');
    });
  }
  it('PUB-12 an invalid unselected destination cannot block independent source preparation or gain output exemptions', async () => {
    configuration.sourcePolicies[0].destinations = ['archive'];
    configuration.workflow.rules = [];
    configuration.destinations.repository.enabled = false;
    configuration.destinations.repository.mapping.invalidConfig = true;
    const response = await create();
    assert.equal(response.isComplete(), true, JSON.stringify(response));
    const { state } = await current();
    const source = await reopenPublicationSource(
      'brand',
      state.approvals[0].source,
      new PublicationStaging('durable', disk)
    );
    const frozen = source.relatedInputs['publication:outputs'];
    assert.ok(isPublicationObject(frozen) && isPublicationObject(frozen.value));
    assert.equal(Object.hasOwn(frozen.value, 'repository'), false);
    // Runtime configuration stays strict; repair the unrelated draft before dispatching.
    configuration.destinations.repository.mapping = {};
    const runtime = publication.runtime();
    await importPublicationIntents(runtime, await mongo.getMeta('record'));
    await run('archive', runtime);
    assert.equal((await runtime.store.get(key))?.status, 'completed');
  });
  it('PUB-12 source edits between remote completion and coordination fence old outcomes', async () => {
    const runtime = await start('any');
    const prepare = runtime.prepareWorkflowTransition!;
    runtime.prepareWorkflowTransition = async (...args) => {
      const transition = await prepare(...args);
      await mongo.updateMeta(brand, 'record', { metadata: { title: 'New draft' } });
      return transition;
    };
    await run('archive', runtime);
    assert.equal((await current()).record.workflow.stage, 'queued');
    assert.equal((await current()).record.metadata.title, 'New draft');
    assert.equal((await current()).state.workflowDecision, undefined);
    assert.equal(hookCalls, 0);
  });
  it('PUB-12 reloads projection conflicts and preserves unrelated current fields', async () => {
    const runtime = await start('any');
    const original = mongo.setPublicationRecordFields.bind(mongo);
    let raced = false;
    mongo.setPublicationRecordFields = async projection => {
      if (!raced && Object.keys(projection.fields).length) {
        raced = true;
        await mongo.recordCol.updateOne(
          { redboxOid: 'record' },
          { $set: { operationalMarker: 'retained' }, $inc: { revision: 1 } }
        );
      }
      return original(projection);
    };
    try {
      await run('archive', runtime);
    } finally {
      mongo.setPublicationRecordFields = original;
    }
    assert.equal(raced, true);
    const { record, state } = await current();
    assert.equal(record.operationalMarker, 'retained');
    assert.equal(record.metadata.title, 'Approved source');
    assert.equal(record.metadata.archive.url, 'https://example.test/archive');
    assert.equal(state.revision, 1);
  });
  it('PUB-12 does not retry stale projections against changed source content', async () => {
    const runtime = await start('any');
    const original = mongo.setPublicationRecordFields.bind(mongo);
    let raced = false;
    mongo.setPublicationRecordFields = async projection => {
      if (!raced && Object.keys(projection.fields).length) {
        raced = true;
        await mongo.updateMeta(brand, 'record', { metadata: { title: 'New source' } });
      }
      return original(projection);
    };
    try {
      await run('archive', runtime);
    } finally {
      mongo.setPublicationRecordFields = original;
    }
    assert.equal((await current()).record.metadata.title, 'New source');
    assert.equal((await current()).record.metadata.archive, undefined);
    assert.equal((await current()).record.workflow.stage, 'queued');
    assert.equal(hookCalls, 0);
  });
  it('PUB-12 real transition hook content changes invalidate sibling authorisation', async () => {
    const runtime = await start('any');
    postHook = async record => ({
      ...record,
      metadata: { ...(isPublicationObject(record.metadata) ? record.metadata : {}), title: 'Hook changed title' },
    });
    await run('archive', runtime);
    const { record, state } = await current();
    assert.equal(record.metadata.title, 'Hook changed title');
    assert.equal(state.revision, 2);
    assert.equal(
      state.approvals.every(approval => !!approval.revokedAt),
      true
    );
    assert.equal(state.workflowDecision?.status, 'failed');
    await run('repository', runtime);
    assert.equal(providerMutations, 1);
    assert.equal(hookCalls, 1);
  });
  it('PUB-12 preserves pre-hook failure evidence without replaying side effects', async () => {
    const runtime = await start('any');
    postHook = async () => {
      throw new Error('Failure after side effect');
    };
    await run('archive', runtime);
    assert.equal((await current()).state.workflowDecision?.status, 'failed');
    assert.equal(hookCalls, 1);
    await dispatchPublications(runtime);
    await evaluatePublicationWorkflow(runtime, key);
    assert.equal(hookCalls, 1);
    assert.equal(await runtime.store.workflowDecisions.countDocuments({ 'decision.status': 'failed' }), 1);
  });
  it('PUB-12 preserves partial postSync transition failures with the already committed stage', async () => {
    const runtime = await start('any');
    recordType.hooks = { onTransitionWorkflow: { postSync: [{ function: '__publicationHooks.run' }] } };
    postHook = async () => {
      throw new Error('Post-save side effect failed');
    };
    await run('archive', runtime);
    assert.equal((await current()).record.workflow.stage, 'published');
    assert.equal((await current()).state.workflowDecision?.status, 'failed');
    await dispatchPublications(runtime);
    assert.equal(hookCalls, 1);
  });
  it('PUB-12 retains failed evidence when a postSync hook attempts to replace the server-owned stage', async () => {
    const runtime = await start('any');
    recordType.hooks = { onTransitionWorkflow: { postSync: [{ function: '__publicationHooks.run' }] } };
    postHook = async record => ({
      ...record,
      workflow: { ...(isPublicationObject(record.workflow) ? record.workflow : {}), stage: 'hook-owned' },
    });
    await run('archive', runtime);
    const { state, record } = await current();
    assert.equal(record.workflow.stage, 'published');
    assert.equal(state.revision, 1);
    assert.equal(state.workflowDecision?.status, 'failed');
    assert.ok(state.workflowDecision?.finishedAt);
    assert.equal(await runtime.store.workflowDecisions.countDocuments({ 'decision.status': 'failed' }), 1);
    await dispatchPublications(runtime);
    assert.equal(hookCalls, 1);
  });
  it('PUB-12 commits the decision and expected stage together under the actual record CAS', async () => {
    const runtime = await start('any');
    const update = mongo.updateMeta.bind(mongo);
    let observed = false;
    mongo.updateMeta = async (...args) => {
      const response = await update(...args);
      if (args[4]?.publicationIntent?.workflowDecisionId) {
        const { record, state } = await current();
        assert.equal(record.workflow.stage, 'published');
        assert.equal(state.workflowDecision?.status, 'stage_applied');
        assert.equal(state.workflowDecision?.id, args[4].publicationIntent.workflowDecisionId);
        assert.equal(state.revision, 1);
        observed = true;
      }
      return response;
    };
    try {
      await run('archive', runtime);
      assert.equal(observed, true);
      assert.equal((await current()).state.workflowDecision?.status, 'completed');
    } finally {
      mongo.updateMeta = update;
    }
  });
  for (const operation of ['claim', 'finish'] as const) {
    it(`PUB-12 recovers a lost ${operation} acknowledgement without replaying transition hooks`, async () => {
      const runtime = await start('any');
      const write = mongo.setPublicationRecordFields.bind(mongo);
      let lost = false;
      mongo.setPublicationRecordFields = async projection => {
        const result = await write(projection);
        if (!lost && result.updated && projection.workflowDecision?.operation === operation) {
          lost = true;
          throw new Error('Lost workflow acknowledgement');
        }
        return result;
      };
      try {
        await run('archive', runtime);
      } finally {
        mongo.setPublicationRecordFields = write;
      }
      assert.equal(lost, true);
      await dispatchPublications(runtime);
      const { state, record } = await current();
      assert.equal(state.workflowDecision?.status, operation === 'claim' ? 'started' : 'completed');
      assert.equal(record.workflow.stage, operation === 'claim' ? 'queued' : 'published');
      assert.equal(hookCalls, operation === 'claim' ? 0 : 1);
      assert.equal(
        await runtime.store.workflowDecisions.countDocuments({ 'decision.status': state.workflowDecision?.status }),
        1
      );
      assert.equal((await runtime.store.get(key))?.workflowPending, false);
    });
  }
  it('PUB-12 retries exporting terminal workflow evidence independently of provider work', async () => {
    const runtime = await start('any');
    const exportDecision = runtime.store.recordWorkflowDecision.bind(runtime.store);
    let failed = false;
    runtime.store.recordWorkflowDecision = async (key, decision) => {
      if (!failed && decision.finishedAt) {
        failed = true;
        throw new Error('Workflow evidence export unavailable');
      }
      await exportDecision(key, decision);
    };
    await run('archive', runtime);
    assert.equal(failed, true);
    assert.equal((await runtime.store.get(key))?.workflowPending, true);
    await dispatchPublications(runtime);
    assert.equal(hookCalls, 1);
    assert.equal(providerMutations, 1);
    assert.equal(await runtime.store.workflowDecisions.countDocuments({ 'decision.status': 'completed' }), 1);
    assert.equal((await runtime.store.get(key))?.workflowPending, false);
  });
  it('PUB-12 records a reserved attempt after interruption and never guesses that hooks can replay', async () => {
    const runtime = await start('any');
    const prepare = runtime.prepareWorkflowTransition!;
    runtime.prepareWorkflowTransition = async (...args) => {
      const transition = await prepare(...args);
      return {
        ...transition,
        run: async () => {
          throw new Error('Interrupted before transition outcome');
        },
      };
    };
    await run('archive', runtime);
    assert.equal((await current()).state.workflowDecision?.status, 'failed');
    runtime.prepareWorkflowTransition = prepare;
    await dispatchPublications(runtime);
    assert.equal((await current()).record.workflow.stage, 'queued');
    assert.equal(hookCalls, 0);
  });
  it('PUB-12 dispatch recovers completion checkpointed before local coordination', async () => {
    const runtime = await start('any');
    const prepare = runtime.prepareWorkflowTransition;
    runtime.prepareWorkflowTransition = async () => {
      throw new Error('Process stopped before decision');
    };
    await run('archive', runtime);
    assert.equal((await current()).record.workflow.stage, 'queued');
    assert.equal((await runtime.store.get(key))?.workflowPending, true);
    runtime.prepareWorkflowTransition = prepare;
    await dispatchPublications(runtime);
    assert.equal((await current()).record.workflow.stage, 'published');
    assert.equal(providerMutations, 1);
    assert.equal(hookCalls, 1);
  });
  it('PUB-12 late historical completion cannot advance a fresh pending source revision', async () => {
    const runtime = await start('any');
    runtime.prepareWorkflowTransition = async () => {
      throw new Error('Stop before decision');
    };
    await run('archive', runtime);
    const oldCompletion = (await runtime.store.get(key))?.completion;
    assert.ok(oldCompletion);
    await mongo.updateMeta(brand, 'record', { metadata: { title: 'New draft' } });
    const fresh = publication.runtime();
    await evaluatePublicationWorkflow(fresh, key);
    assert.equal((await current()).record.workflow.stage, 'queued');
    assert.deepEqual((await fresh.store.get(key))?.completion, oldCompletion);
    assert.equal(hookCalls, 0);
  });
  it('PUB-12 a newly configured rule does not reinterpret an already granted request', async () => {
    configuration.workflow.rules = [];
    const response = await create();
    assert.equal(response.isComplete(), true);
    configuration.workflow.rules = [
      {
        id: 'new',
        version: 1,
        recordType: 'dataPublication',
        destinations: ['archive', 'repository'],
        completion: 'any',
        targetStage: 'published',
      },
    ];
    const runtime = publication.runtime();
    await importPublicationIntents(runtime, await mongo.getMeta('record'));
    await run('archive', runtime);
    assert.equal((await current()).record.workflow.stage, 'queued');
    assert.equal((await current()).state.workflowDecision, undefined);
  });
  it('PUB-12 a stale internal save cannot overwrite projected links or the coordinated stage', async () => {
    const runtime = await start('any');
    const stale = await mongo.getMeta('record');
    await run('archive', runtime);
    const result = await records.updateMetaInternal({
      actor: { kind: 'service', id: 'StaleSave' },
      authorization: { kind: 'record-edit' },
      mutationClass: 'full-record',
      oid: 'record',
      record: { ...stale },
      user,
      triggerPreSaveTriggers: false,
      triggerPostSaveTriggers: false,
    });
    assert.equal(result.wasPersisted(), false);
    assert.equal((await current()).record.workflow.stage, 'published');
    assert.equal((await current()).record.metadata.archive.url, 'https://example.test/archive');
  });
  it('PUB-12 output collision rejects approval before provider work', async () => {
    configuration.destinations.repository.writeBack = { status: 'metadata.archive', link: 'metadata.other' };
    const response = await create();
    assert.equal(response.wasPersisted(), false);
    assert.equal(providerMutations, 0);
  });
  it('a pending projection rechecks refusal after reading the record', async () => {
    const runtime = await start('any');
    const before = await runtime.store.get(key);
    assert.ok(before);
    const recordBefore = await mongo.getMeta(key.oid);
    const originalAuthority = PublicationExecution.prototype.assertAuthority;
    const originalGetMeta = runtime.storage.getMeta;
    let projecting = false;
    let holdRead = false;
    let entered!: () => void;
    let release!: () => void;
    const reading = new Promise<void>(resolve => {
      entered = resolve;
    });
    const released = new Promise<void>(resolve => {
      release = resolve;
    });
    PublicationExecution.prototype.assertAuthority = async function () {
      await originalAuthority.call(this);
      if (projecting) holdRead = true;
    };
    runtime.storage.getMeta = async (...args) => {
      const result = await originalGetMeta.apply(runtime.storage, args);
      if (holdRead) {
        holdRead = false;
        entered();
        await released;
      }
      return result;
    };
    executionFault = async context => {
      projecting = true;
      const projection = context.project({ [outputPaths(context.configuration)[0]]: 'escaped' });
      await reading;
      assert.throws(
        () =>
          context.idempotencyKey({
            id: randomUUID(),
            kind: 'deposit',
            approvalId: context.approval.id,
            approvalEpoch: context.approval.epoch,
            sourceGeneration: context.sourceGeneration,
            intendedDigest: 'approved',
            submittedAt: new Date().toISOString(),
            outcome: 'submitted',
            evidence: {},
            idempotencyKey: 'malformed',
          }),
        /Invalid host publication idempotency key/
      );
      release();
      await assert.rejects(projection, /Invalid host publication idempotency key/);
    };
    try {
      await run('archive', runtime);
    } finally {
      release();
      runtime.storage.getMeta = originalGetMeta;
      PublicationExecution.prototype.assertAuthority = originalAuthority;
    }
    const saved = await runtime.store.get(key);
    assert.ok(saved);
    assert.equal(saved.status, 'repair_required');
    assert.deepEqual(saved.providerState, before.providerState);
    assert.deepEqual(saved.operations, before.operations);
    assert.deepEqual((await mongo.getMeta(key.oid))?.metadata, recordBefore?.metadata);
    assert.equal(saved.completion, undefined);
    assert.equal(providerMutations, 0);
    assert.equal(hookCalls, 0);
  });

  it('PUB-12 a provider cannot project an unregistered mapped field', async () => {
    const runtime = await start('any');
    const before = await runtime.store.get(key);
    assert.ok(before);
    executionFault = async context => {
      await assert.rejects(context.project({ 'metadata.title': 'Forged output' }), /Unregistered/);
    };
    await run('archive', runtime);
    assert.equal((await current()).record.metadata.title, 'Approved source');
    assert.equal((await current()).record.workflow.stage, 'queued');
    const refused = await runtime.store.get(key);
    assert.ok(refused);
    assert.equal(refused.status, 'repair_required');
    assert.deepEqual(refused.providerState, before.providerState);
    assert.equal(refused.work.synchronise.processed, before.work.synchronise.processed);
    assert.equal(refused.completion, undefined);
    assert.equal(providerMutations, 0);
    assert.equal(hookCalls, 0);
    executionFault = undefined;
    await runtime.store.request(key, 'synchronise', refused.revision);
    await run('archive', runtime);
    assert.equal((await current()).record.metadata.title, 'Approved source');
    assert.equal((await current()).record.workflow.stage, 'published');
  });
  for (const path of [
    'metadata.archive.status',
    'metadata.archive',
    'metadata.archive.status.child',
    'metadata.archive[0].url',
  ]) {
    it(`PUB-12 rejects overlapping output reservation ${path}`, async () => {
      configuration.destinations.repository.writeBack = { link: path };
      const response = await create();
      assert.equal(response.wasPersisted(), false);
      assert.equal(providerMutations, 0);
    });
  }
  it('PUB-12 any also preserves independently sealed auto-sync approvals', async () => {
    configuration.sourcePolicies[0].mode = 'auto-sync';
    const runtime = await start('any');
    assert.equal((await current()).state.approvals.length, 2);
    await run('archive', runtime);
    await run('repository', runtime);
    assert.equal((await current()).record.workflow.stage, 'published');
    assert.equal(
      (await current()).state.approvals.some(approval => approval.revokedAt),
      false
    );
    assert.equal((await runtime.store.get({ ...key, destinationId: 'repository' }))?.status, 'completed');
    assert.equal(hookCalls, 1);
  });
  it('PUB-12 current pending approval prevents a historical completion from satisfying all or any', async () => {
    const runtime = await start('any');
    runtime.prepareWorkflowTransition = async () => {
      throw new Error('Stop before coordination');
    };
    await run('archive', runtime);
    configuration.sourcePolicies[0].event = 'onUpdate';
    const prior = await mongo.getMeta('record');
    const response = await records.updateMetaInternal({
      actor: { kind: 'service', id: 'FreshSave' },
      authorization: { kind: 'record-edit' },
      mutationClass: 'full-record',
      oid: 'record',
      record: { ...prior, metadata: { title: 'Freshly approved source' } },
      user,
      triggerPreSaveTriggers: false,
      triggerPostSaveTriggers: false,
    });
    assert.equal(response.isComplete(), true, JSON.stringify(response));
    assert.equal((await current()).state.revision, 2);
    assert.equal((await current()).state.pending, true);
    await evaluatePublicationWorkflow(publication.runtime(), key);
    assert.equal((await current()).record.workflow.stage, 'queued');
    assert.equal((await current()).state.workflowDecision, undefined);
    assert.equal(hookCalls, 0);
  });
  it('PUB-12 ordinary maintenance options cannot exempt an unrelated content or stage edit', async () => {
    const runtime = await start('any');
    const prior = await mongo.getMeta('record');
    const response = await records.updateMetaInternal({
      actor: { kind: 'service', id: 'UnrelatedMaintenance' },
      authorization: { kind: 'record-edit' },
      mutationClass: 'full-record',
      oid: 'record',
      record: { ...prior, metadata: { title: 'Maintenance edited source' } },
      user,
      maintenance: true,
      triggerPreSaveTriggers: false,
      triggerPostSaveTriggers: false,
    });
    assert.equal(response.isComplete(), true, JSON.stringify(response));
    assert.equal((await current()).state.revision, 2);
    assert.equal(
      (await current()).state.approvals.every(approval => approval.revokedAt),
      true
    );
    await run('archive', runtime);
    assert.equal(providerMutations, 0);
  });
});
