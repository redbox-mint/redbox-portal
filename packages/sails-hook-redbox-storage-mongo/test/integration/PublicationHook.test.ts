import { publicationEvidenceFields, withPublicationEvidenceMismatch } from '../fixtures/publicationEvidence';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MongoClient } from 'mongodb';
import { of } from 'rxjs';
import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import {
  PublicationPublishing,
  PublicationSyncStore,
  PublicationResourceStore,
  PublicationStaging,
  PublicationLeaseLost,
  publicationDigest,
  reopenPublicationSource,
  ConfigModels,
  type PublicationWorkKey,
} from '@researchdatabox/redbox-core';
import { findAndRegisterHooks, generateServiceShims } from '@researchdatabox/redbox-core/dist/loader';
import {
  accessionProvider,
  type AccessionPublication,
} from '../../../../support/documentation/examples/publication-provider';
import { setFixtureTargets, setFixtureRemoteLookup, attestedAccessionProvider } from '../fixtures/publicationHook';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { accessionServer, type AccessionServer } from '../fixtures/accessionServer';
import { resolve } from 'node:path';

type PublicationApi = Pick<
  AccessionPublication,
  'bootstrap' | 'dispatch' | 'executeRecord' | 'getRecordStatus' | 'getProviders' | 'administer'
>;
function assertPublicationApi(value: unknown): asserts value is PublicationApi {
  assert.ok(value && typeof value === 'object');
  for (const method of ['bootstrap', 'dispatch', 'executeRecord', 'getRecordStatus', 'getProviders', 'administer'])
    assert.equal(typeof Reflect.get(value, method), 'function');
}
import { Services as RecordServices } from '@researchdatabox/redbox-core/dist/services/RecordsService.js';
import { Services } from '../../dist/services/MongoStorageService';
import { Services as WorkflowServices } from '@researchdatabox/redbox-core/dist/services/WorkflowStepsService.js';
import { publicationSource } from '../../dist/services/publicationSourcePersistence';
import { storage } from '../../dist/config/storage';

if (process.env.CI && !process.env.MONGO_TEST_URL)
  throw new Error('CI requires MONGO_TEST_URL for PUB-17 hook acceptance');
const describeMongo = process.env.MONGO_TEST_URL ? describe : describe.skip;
describeMongo('Third-provider hook extension (PUB-17, loader + HTTP + real Mongo)', function () {
  this.timeout(30000);
  const database = `publication_hook_${randomUUID().replaceAll('-', '')}`;
  const brand = { id: 'brand', name: 'brand', css: '', roles: [] };
  const user = { username: 'approver', type: 'local', roles: [], disabled: false };
  const recordType = { id: 'pubtype', name: 'dataPublication', searchable: false, hooks: {} };
  const savedGlobals = new Map<string, unknown>();
  let client: MongoClient;
  let mongo: Services.MongoStorageService;
  let records: RecordServices.Records;
  let publication: PublicationApi;
  let configuration: PublicationPublishing;
  let directory: string;
  let disk: Disk;
  let hookCalls = 0;
  const disabledUsers = new Set<string>();
  let savedConfig: unknown;
  let savedServices: unknown;
  const jobs: Array<{ name: string; key: PublicationWorkKey }> = [];
  let remote: AccessionServer;
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
    remote = await accessionServer();
    directory = await mkdtemp(join(tmpdir(), 'pub17-hook-'));
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
    globalValue('RolesService', {
      getRole: () => null,
      getAdminFromBrand: () => ({ id: 'admin', name: 'Admin' }),
      getAdminFromRoles: (roles: Array<{ id: string }>) => roles.find(role => role.id === 'admin'),
    });
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
    globalValue('AgendaQueueService', {
      now: async (name: string, key: PublicationWorkKey) => {
        jobs.push({ name, key });
      },
    });
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
          disabled: disabledUsers.has(username),
          roles: username === 'admin' ? [{ id: 'admin', branding: 'brand' }] : [],
        }),
    });
    globalValue('AppConfigService', { getAppConfigurationForBrand: () => ({ publicationPublishing: configuration }) });
    globalValue('__publicationHooks', {
      run: async (_oid: unknown, record: Record<string, unknown>) => {
        hookCalls++;
        return record;
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
    if (remote) await remote.close();
    for (const filename of Object.keys(require.cache))
      if (filename.startsWith(directory)) delete require.cache[filename];
  });
  beforeEach(async () => {
    await mongo.recordCol.deleteMany({});
    await mongo.recordIdentityCol.deleteMany({});
    await mongo.deletedRecordCol.deleteMany({});
    for (const name of [
      'publicationsync',
      'publicationdestination',
      'publicationdestinationledger',
      'publicationresourcelease',
      'publicationworkflowdecision',
      'publicationcorrection',
    ])
      await client.db(database).collection(name).deleteMany({});
    hookCalls = 0;
    disabledUsers.clear();
    remote.reset();
    setFixtureRemoteLookup(true);
    jobs.length = 0;
    configuration = new PublicationPublishing();
    configuration.processing = {
      ...configuration.processing,
      enabled: true,
      serviceUsername: 'worker',
      stagingDisk: 'durable',
    };
    const destination = {
      provider: 'accession-review',
      displayName: 'Accession archive',
      enabled: true,
      archived: false,
      connection: { endpoint: remote.endpoint, repository: 'research', token: 'fixture-secret' },
      mapping: {},
      attachments: {},
      providerOptions: {},
      writeBack: {},
    };
    configuration.processing.coalesceMs = 1;
    configuration.processing.retryBaseMs = 1;
    configuration.processing.observationMs = 1;
    configuration.destinations = {
      archive: {
        ...structuredClone(destination),
        writeBack: { url: 'metadata.archive.url' },
      },
      repository: {
        ...structuredClone(destination),
        displayName: 'Accession repository',
        writeBack: { url: 'metadata.repository.url' },
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

    globalValue('__publicationHooks', {
      run: async (_oid: unknown, record: Record<string, unknown>) => {
        hookCalls++;
        return record;
      },
    });
    recordType.hooks = {};
    records = new RecordServices.Records();
    records.storageService = mongo;
    Reflect.set(records, 'searchService', { index: async () => true });
    Reflect.set(records, 'queueService', { now: async () => {} });
    Reflect.set(records, 'datastreamService', { listDatastreams: async () => [] });
    globalValue('RecordsService', records.exports());
    publication = await loadHook();
    publication.bootstrap();
    globalValue('PublicationService', publication);
  });
  async function loadHook(): Promise<PublicationApi> {
    const app = join(directory, randomUUID());
    const hook = join(app, 'node_modules/publication-accession-hook');
    const services = join(app, 'api/services');
    await mkdir(hook, { recursive: true });
    await mkdir(services, { recursive: true });
    await writeFile(
      join(app, 'package.json'),
      JSON.stringify({ dependencies: { 'publication-accession-hook': '1.0.0' } })
    );
    await writeFile(
      join(hook, 'package.json'),
      JSON.stringify({
        name: 'publication-accession-hook',
        version: '1.0.0',
        main: 'index.js',
        sails: { hasServices: true },
      })
    );
    await writeFile(
      join(hook, 'index.js'),
      `const fixture = require(${JSON.stringify(resolve(__dirname, '../fixtures/publicationHook.ts'))});\nexports.registerRedboxServices = fixture.registerRedboxServices;\nexports.ServiceExports = exports.registerRedboxServices();`
    );
    const targets: Record<string, string> = {};
    for (const [id, destination] of Object.entries(configuration.destinations)) {
      const result = accessionProvider.validateConfiguration(destination);
      assert.ok(result.valid);
      targets[id] = accessionProvider.targetFingerprint(result.value);
    }
    setFixtureTargets(targets);
    // Use hook discovery, capability registration and generated shim loading, never a hand-built registry map.
    const registrations = await findAndRegisterHooks(app);
    assert.deepEqual(registrations.hookServices.PublicationService, { module: 'publication-accession-hook' });
    assert.deepEqual(Object.keys(registrations.hookModels), []);
    const generated = await generateServiceShims(services, registrations.hookServices);
    assert.equal(generated.fromHooks, 1);
    const requireGenerated = createRequire(join(app, 'package.json'));
    // Each application gets its own service instance, as on a fresh process boot.
    const value: unknown = requireGenerated(join(services, 'PublicationService.js'));
    assertPublicationApi(value);
    return value;
  }
  async function create(post = false, candidate: Record<string, unknown> = {}) {
    return records.create(
      brand,
      {
        redboxOid: 'record',
        metadata: { title: 'Approved source' },
        authorization: { edit: ['approver', 'worker', 'admin'], editRoles: [], view: [], viewRoles: [] },
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
    assert.equal(remote.submissions, 0, 'save preparation must not contact the provider');
    jobs.length = 0;
    await publication.dispatch();
    return new PublicationSyncStore(client.db(database));
  }
  async function run(destinationId: string) {
    // The host worker checks durable due state. Wait only for the configured 1ms review interval.
    await new Promise(resolve => setTimeout(resolve, 5));
    await publication.executeRecord({ attrs: { data: { ...key, destinationId } } });
  }
  for (const stage of ['journal', 'completion'] as const)
    for (const field of publicationEvidenceFields) {
      it(`generic evidence rejects ${stage} ${field}`, async () => {
        const store = await start();
        await run('archive');
        remote.decision('ACC-1', 'accepted');
        await withPublicationEvidenceMismatch(stage, field, async () => {
          await run('archive');
        });
        const result = await store.get({ ...key, destinationId: 'archive' });
        assert.ok(result);
        assert.equal(result.status, 'repair_required');
        assert.match(result.waitingReason ?? '', /publication_operation_evidence_mismatch/);
        assert.equal(result.completion, undefined);
        assert.equal(result.operationEvidenceFailures?.length, 1);
        assert.equal(result.operationEvidenceFailures[0].field, field.startsWith('remote.') ? 'remote' : field);
        assert.ok(result.operationEvidenceFailures[0].reported);
        assert.ok(result.operations.length > 0);
        assert.ok(result.operations.every(op => op.outcome === 'confirmed'));
      });
    }
  async function attest(
    operation: import('@researchdatabox/redbox-core').PublicationOperation,
    extra: Record<string, unknown>,
    apply = true
  ) {
    const inspected = await publication.administer({
      action: 'inspect',
      brandId: 'brand',
      oid: key.oid,
      destinationId: key.destinationId,
      username: 'admin',
    });
    assert.ok(inspected && typeof inspected === 'object');
    const rows: unknown = Reflect.get(inspected, 'rows');
    assert.ok(Array.isArray(rows));
    const operations: unknown = Reflect.get(rows[0], 'operations');
    assert.ok(Array.isArray(operations));
    const parameters = {
      operationId: operation.id,
      intendedDigest: operation.intendedDigest,
      idempotencyKey: Reflect.get(
        operations.find(op => op.id === operation.id),
        'idempotencyKey'
      ),
      priorOperationSettled: true,
      evidenceReference: 'external-investigation/no-lookup',
      ...extra,
    };
    const cli = require('../../../../support/publication/admin.js');
    return cli.main(
      [
        'repair',
        '--brand',
        'brand',
        '--oid',
        key.oid,
        '--destination',
        key.destinationId,
        '--username',
        'admin',
        '--repair',
        'attest-operation',
        '--parameters',
        JSON.stringify(parameters),
        ...(apply ? ['--apply', '--reason', 'Investigated the exact external submission'] : []),
      ],
      async () => ({ service: publication, close: async () => {} }),
      () => {}
    );
  }
  it('discovers the hook and registers adapter schema, secret metadata and capabilities before freeze', async () => {
    const registered = publication.getProviders().find(provider => provider.id === 'accession-review');
    assert.ok(registered?.executionAvailable);
    assert.equal(registered.capabilities.reconcile, true);
    assert.ok(
      ConfigModels.getModelInfo('publicationPublishing').secretFields?.includes('destinations.*.connection.token')
    );
    assert.ok(JSON.stringify(ConfigModels.getModelInfo('publicationPublishing').schema).includes('accession-review'));
    assert.equal(Reflect.has(publication, 'registerProvider'), false);
    assert.equal(Reflect.has(publication, 'providerRegistry'), false);
  });
  it('exposes ready source intent before import, then dispatches identifier-only independent destinations', async () => {
    const response = await create();
    assert.equal(response.isComplete(), true, JSON.stringify(response));
    const { state } = await current();
    assert.equal(state.pending, true);
    assert.equal(state.saves[0].outcome, 'ready');
    assert.deepEqual(state.approvals[0].destinationIds, ['archive', 'repository']);
    const identities = await new PublicationSyncStore(client.db(database)).usedDestinations('brand');
    assert.deepEqual(Object.keys(identities).sort(), ['archive', 'repository']);
    for (const id of state.approvals[0].destinationIds) {
      assert.equal(identities[id].providerId, 'accession-review');
      assert.equal(identities[id].targetFingerprint, state.approvals[0].targetFingerprints[id]);
    }
    assert.equal(await client.db(database).collection('publicationsync').countDocuments(), 0);

    const pending = await publication.getRecordStatus('brand', 'record');
    assert.equal(pending.integrations.length, 2);
    assert.ok(pending.integrations.every(row => row.workStatus === 'queued'));
    assert.equal(remote.submissions, 0);
    jobs.length = 0;
    await publication.dispatch();
    const store = new PublicationSyncStore(client.db(database));
    assert.equal((await current()).state.pending, false);
    assert.equal((await store.forRecord('brand', 'record')).length, 2);
    assert.equal(jobs.length, 2);
    for (const job of jobs) {
      assert.equal(job.name, 'Publication-SyncRecord');
      assert.deepEqual(Object.keys(job.key).sort(), ['brandId', 'destinationId', 'oid']);
    }
    assert.equal(remote.submissions, 0);
  });
  for (const changed of [false, true]) {
    it(`recovers a confirmed accession before its checkpoint under ${changed ? 'a fresh approval' : 'the same approval'}`, async () => {
      const store = await start();
      const checkpoint = PublicationSyncStore.prototype.checkpointProviderState;
      let crashed = false;
      PublicationSyncStore.prototype.checkpointProviderState = async function (...args: Parameters<typeof checkpoint>) {
        if (!crashed && args[0].destinationId === 'archive') {
          crashed = true;
          await this.collection.updateOne(key, { $set: { 'lease.expiresAt': 0 } });
          throw new PublicationLeaseLost();
        }
        return checkpoint.apply(this, args);
      };
      try {
        await run('archive');
      } finally {
        PublicationSyncStore.prototype.checkpointProviderState = checkpoint;
      }
      assert.equal(crashed, true);
      const interrupted = await store.get(key);
      assert.ok(interrupted);
      assert.equal(interrupted.operations[0].outcome, 'confirmed');
      assert.equal(interrupted.operations[0].evidence.accession, 'ACC-1');
      assert.equal(interrupted.providerState.accession, undefined);
      assert.equal(interrupted.binding, undefined);
      if (changed) {
        configuration.sourcePolicies[0].event = 'onUpdate';
        configuration.sourcePolicies[0].mode = 'auto-sync';
        const snapshot = await mongo.getMeta('record');
        const saved = await records.updateMeta(
          brand,
          'record',
          { ...snapshot, metadata: { title: 'New dossier' } },
          user,
          false,
          false
        );
        assert.equal(saved.isComplete(), true, JSON.stringify(saved));
        await publication.dispatch();
        assert.equal((await store.get(key))?.sourceGeneration, 2);
      }
      remote.decision('ACC-1', 'accepted');
      publication = await loadHook();
      publication.bootstrap();
      globalValue('PublicationService', publication);
      await run('archive');
      if (!changed) {
        const reconciled = await store.get(key);
        assert.equal(reconciled?.status, 'waiting');
        assert.equal(reconciled?.waitingReason, 'accession_reconciled_resume');
        assert.equal(reconciled?.binding, undefined);
        assert.equal(reconciled?.completion, undefined);
        assert.equal((await current()).record.metadata.archive, undefined);
        assert.equal(reconciled?.providerState.accession, 'ACC-1');
        assert.equal(reconciled?.operations[0].checkpointed, true);
        assert.equal(remote.submissions, 1);
        await run('archive');
      }
      const recovered = await store.get(key);
      assert.equal(remote.submissions, 1, 'Confirmed receipt recovery must not create another accession');
      assert.equal(recovered?.status, changed ? 'repair_required' : 'completed');
      assert.deepEqual(
        recovered?.operations,
        changed ? interrupted.operations : interrupted.operations.map(op => ({ ...op, checkpointed: true }))
      );
      if (changed) {
        assert.equal(recovered?.waitingReason, 'accession_dossier_conflict');
        assert.equal(recovered?.completion, undefined);
        assert.equal((await current()).record.metadata.archive, undefined);
      } else assert.equal(recovered?.completion?.remote.objectId, 'ACC-1');
    });
  }
  it('uses an accession review wait without transport retry consumption or status-triggered I/O', async () => {
    const store = await start();
    await run('archive');
    const row = await store.get(key);
    assert.equal(row?.status, 'waiting');
    assert.equal(row?.waitingReason, 'accession_review_pending');
    assert.equal(row?.retry, undefined);
    assert.equal(row?.operations.length, 1);
    assert.equal(row?.operations[0].outcome, 'confirmed');
    assert.equal(row?.binding?.objectId, 'ACC-1');
    assert.ok(row?.binding?.namespace.startsWith('accession:http://127.0.0.1:'));
    assert.equal((await store.get({ ...key, destinationId: 'repository' }))?.status, 'queued');
    const before = remote.reads;
    const status = await publication.getRecordStatus('brand', 'record', { includeSignals: true });
    const archive = status.integrations.find(row => row.destinationId === 'archive');
    assert.equal(archive?.workStatus, 'waiting');
    assert.equal(archive?.waitingReason, 'accession_review_pending');
    assert.equal(archive?.observation?.visibility, 'unverified');
    assert.equal(status.signals?.waiting, 1);
    assert.equal(remote.reads, before);
    await run('archive');
    assert.equal(remote.submissions, 1);
    assert.equal((await store.get(key))?.retry, undefined);
  });
  for (const completion of ['all', 'any'] as const) {
    it(`coordinates ${completion} with independent review decisions through the loaded service`, async () => {
      const store = await start(completion);
      await run('archive');
      if (completion === 'all') await run('repository');
      remote.decision('ACC-1', 'accepted');
      await run('archive');
      const intermediate = await current();
      assert.equal(intermediate.record.workflow.stage, completion === 'any' ? 'published' : 'queued');
      assert.equal(intermediate.state.revision, 1);
      assert.equal(intermediate.state.approvals[0].revokedAt, undefined);
      assert.equal((await store.get(key))?.completion?.remote.objectId, 'ACC-1');
      assert.equal(
        (await store.get({ ...key, destinationId: 'repository' }))?.status,
        completion === 'any' ? 'queued' : 'waiting'
      );
      if (completion === 'any') {
        // A new guarded submission is still authorized after the grant-stage transition.
        await run('repository');
        assert.equal(remote.submissions, 2);
      }
      remote.decision('ACC-2', 'accepted');
      await run('repository');
      await publication.dispatch();
      const final = await current();
      assert.equal(final.record.workflow.stage, 'published');
      assert.equal(final.state.workflowDecision?.status, 'completed');
      assert.equal(final.state.revision, 1);
      assert.equal(hookCalls, 1);
      assert.equal(remote.submissions, 2);
      assert.equal(final.record.metadata.archive.url, `${remote.endpoint}repositories/research/accessions/ACC-1`);
      assert.equal(final.record.metadata.repository.url, `${remote.endpoint}repositories/research/accessions/ACC-2`);
      assert.equal(await store.workflowDecisions.countDocuments({}), 1);
      const status = await publication.getRecordStatus('brand', 'record');
      assert.ok(status.integrations.every(row => row.workStatus === 'completed' && row.completion?.current));
      assert.ok(status.integrations.every(row => row.completion?.visibility === 'unverified'));
      assert.deepEqual(status.integrations.map(row => row.displayName).sort(), [
        'Accession archive',
        'Accession repository',
      ]);
    });
  }
  it('keeps an accepted sibling while a conflicting accession requires repair and blocks all', async () => {
    const store = await start();
    await run('archive');
    await run('repository');
    remote.decision('ACC-1', 'accepted');
    remote.decision('ACC-2', 'conflict');
    await run('archive');
    await run('repository');
    assert.equal((await store.get(key))?.status, 'completed');
    const sibling = await store.get({ ...key, destinationId: 'repository' });
    assert.equal(sibling?.status, 'repair_required');
    assert.equal(sibling?.waitingReason, 'accession_dossier_conflict');
    assert.equal(sibling?.work.synchronise.dueAt, null);
    assert.ok(sibling?.audit?.summaries?.some(summary => summary.category === 'repair_required'));
    assert.equal((await current()).record.workflow.stage, 'queued');
    const status = await publication.getRecordStatus('brand', 'record', {
      destinationId: 'repository',
      includeSignals: true,
    });
    assert.equal(status.integrations.length, 1);
    assert.equal(status.integrations[0].workStatus, 'repair_required');
  });
  for (const boundary of ['submitted', 'uncertain', 'confirmed-lost', 'confirmed-present'] as const) {
    for (const decision of ['pending', 'accepted', 'conflict'] as const) {
      it(`hook state matrix ${boundary}/${decision}: no duplicate or unverified completion`, async () => {
        const store = await start('any');
        const journal = PublicationSyncStore.prototype.journal;
        const checkpoint = PublicationSyncStore.prototype.checkpointProviderState;
        let stopped = false;
        if (boundary === 'uncertain') remote.loseNextResponse();
        if (boundary === 'submitted')
          PublicationSyncStore.prototype.journal = async function (...args: Parameters<typeof journal>) {
            if (!stopped && args[0].destinationId === 'archive' && args[3].outcome === 'confirmed') {
              stopped = true;
              await this.collection.updateOne(key, { $set: { 'lease.expiresAt': 0 } });
              throw new PublicationLeaseLost();
            }
            return journal.apply(this, args);
          };
        if (boundary === 'confirmed-lost')
          PublicationSyncStore.prototype.checkpointProviderState = async function (
            ...args: Parameters<typeof checkpoint>
          ) {
            if (!stopped && args[0].destinationId === 'archive') {
              stopped = true;
              await this.collection.updateOne(key, { $set: { 'lease.expiresAt': 0 } });
              throw new PublicationLeaseLost();
            }
            return checkpoint.apply(this, args);
          };
        try {
          await run('archive');
        } finally {
          PublicationSyncStore.prototype.journal = journal;
          PublicationSyncStore.prototype.checkpointProviderState = checkpoint;
        }
        assert.equal(remote.submissions, 1);
        const interrupted = await store.get(key);
        assert.ok(interrupted);
        assert.equal(interrupted.operations[0].outcome, boundary.startsWith('confirmed') ? 'confirmed' : boundary);
        assert.equal(interrupted.completion, undefined);
        remote.decision('ACC-1', decision);
        await run('archive');
        if (boundary !== 'confirmed-present' && decision !== 'conflict') await run('archive');
        const recovered = await store.get(key);
        assert.equal(
          recovered?.status,
          decision === 'conflict' ? 'repair_required' : decision === 'accepted' ? 'completed' : 'waiting'
        );
        assert.equal(Boolean(recovered?.completion), decision === 'accepted');
        assert.equal(remote.submissions, 1);
        assert.equal(hookCalls, decision === 'accepted' ? 1 : 0);
        assert.equal((await current()).record.workflow.stage, decision === 'accepted' ? 'published' : 'queued');
      });
    }
  }
  it('hook state matrix intent-unsent: key absence needs certified settlement before a fresh attempt', async () => {
    const store = await start('any');
    const journal = PublicationSyncStore.prototype.journal;
    let stopped = false;
    PublicationSyncStore.prototype.journal = async function (...args: Parameters<typeof journal>) {
      const saved = await journal.apply(this, args);
      if (!stopped && args[0].destinationId === 'archive' && args[3].outcome === 'submitted') {
        stopped = true;
        await this.collection.updateOne(key, { $set: { 'lease.expiresAt': 0 } });
        throw new PublicationLeaseLost();
      }
      return saved;
    };
    try {
      await run('archive');
    } finally {
      PublicationSyncStore.prototype.journal = journal;
    }
    const interrupted = await store.get(key);
    assert.ok(interrupted);
    assert.equal(stopped, true);
    assert.equal(interrupted.operations[0].outcome, 'submitted');
    assert.equal(remote.submissions, 0);
    await run('archive');
    const blocked = await store.get(key);
    assert.equal(blocked?.waitingReason, 'accession_submission_not_found');
    assert.deepEqual(blocked.operations, interrupted.operations);
    assert.equal(blocked.completion, undefined);
    assert.equal(remote.submissions, 0);
    await attest(interrupted.operations[0], { outcome: 'not_applied', nonApplicationVerified: true });
    await publication.administer({
      action: 'resume',
      brandId: 'brand',
      oid: key.oid,
      destinationId: key.destinationId,
      username: 'admin',
      apply: true,
      reason: 'Resume certified unsent submission',
    });
    await run('archive');
    assert.equal(remote.submissions, 1);
    assert.equal((await store.get(key))?.operations[0].outcome, 'not_applied');
  });
  it('retries a certified unsent accession after current permission is restored', async () => {
    const store = await start('any');
    const journal = PublicationSyncStore.prototype.journal;
    let stopped = false;
    PublicationSyncStore.prototype.journal = async function (...args: Parameters<typeof journal>) {
      const saved = await journal.apply(this, args);
      if (!stopped && args[0].destinationId === 'archive' && args[3].outcome === 'submitted') {
        stopped = true;
        disabledUsers.add('worker');
      }
      return saved;
    };
    try {
      await run('archive');
    } finally {
      PublicationSyncStore.prototype.journal = journal;
      disabledUsers.delete('worker');
    }
    const interrupted = await store.get(key);
    assert.ok(interrupted);
    assert.equal(stopped, true);
    assert.equal(interrupted.operations[0].outcome, 'not_applied');
    assert.equal(remote.submissions, 0);
    assert.equal(interrupted.completion, undefined);
    await store.request(key, 'synchronise', interrupted.revision);
    await run('archive');
    const resumed = await store.get(key);
    assert.equal(resumed?.waitingReason, 'accession_review_pending');
    assert.equal(remote.submissions, 1, 'Only the certified unsent attempt may be retried');
    assert.equal(resumed?.operations.length, 2);
    assert.deepEqual(resumed.operations[0], interrupted.operations[0]);
    assert.notEqual(resumed.operations[1].id, interrupted.operations[0].id);
    remote.decision('ACC-1', 'accepted');
    await run('archive');
    assert.equal((await store.get(key))?.status, 'completed');
    assert.equal(remote.submissions, 1);
  });
  it('retains a lost submission response for read-only reconciliation without a second create', async () => {
    const store = await start('any');
    remote.loseNextResponse();
    await run('archive');
    assert.equal(remote.submissions, 1);
    assert.equal((await store.get(key))?.operations[0].outcome, 'uncertain');
    await run('archive');
    const row = await store.get(key);
    assert.equal(row?.status, 'waiting');
    assert.equal(row?.waitingReason, 'accession_reconciled_resume');
    assert.equal(row?.operations[0].outcome, 'confirmed');
    assert.equal(row?.operations[0].checkpointed, true);
    assert.equal(row?.completion, undefined);
    assert.equal(remote.submissions, 1);
    assert.equal((await current()).record.workflow.stage, 'queued');
    assert.equal(hookCalls, 0);
  });
  it('lost-response HTTP retry reuses the durable key and accession across service reload and recovery', async () => {
    const store = await start('any');
    remote.loseNextResponse();
    await run('archive');
    const unknown = await store.get(key);
    assert.ok(unknown);
    const [remoteReceipt] = remote.accessions;
    const response = await fetch(new URL('/repositories/research/accessions', remote.endpoint), {
      method: 'POST',
      headers: {
        authorization: 'Bearer fixture-secret',
        'content-type': 'application/json',
        'idempotency-key': remoteReceipt.idempotencyKey,
      },
      body: JSON.stringify({ title: 'Approved source' }),
    });
    assert.equal(response.status, 200);
    const retried: unknown = await response.json();
    assert.ok(retried && typeof retried === 'object');
    assert.equal(Reflect.get(retried, 'accession'), remoteReceipt.accession);
    assert.equal(remote.posts, 2);
    assert.equal(remote.submissions, 1);
    const changed = await fetch(new URL('/repositories/research/accessions', remote.endpoint), {
      method: 'POST',
      headers: {
        authorization: 'Bearer fixture-secret',
        'content-type': 'application/json',
        'idempotency-key': remoteReceipt.idempotencyKey,
      },
      body: JSON.stringify({ title: 'Different mutation with a reused key' }),
    });
    assert.equal(changed.status, 400);
    assert.equal(remote.submissions, 1);
    publication = await loadHook();
    publication.bootstrap();
    globalValue('PublicationService', publication);
    await run('archive');
    const recovered = await store.get(key);
    assert.equal(recovered?.operations[0].evidence.idempotencyKey, remoteReceipt.idempotencyKey);
    assert.equal(recovered?.operations[0].id, unknown.operations[0].id);
    remote.decision(remoteReceipt.accession, 'accepted');
    await run('archive');
    assert.equal((await store.get(key))?.status, 'completed');
    assert.equal(remote.submissions, 1);
    assert.equal(remote.posts, 3);
  });
  it('recovers a historical key after a source edit without projecting or completing the old dossier', async () => {
    const store = await start('any');
    remote.loseNextResponse();
    await run('archive');
    const before = await store.get(key);
    assert.ok(before);
    const originalReceipt = remote.accessions[0];
    const changed = await mongo.updateMeta(brand, 'record', { metadata: { title: 'New unapproved dossier' } });
    assert.equal(changed.success, true);
    remote.decision(originalReceipt.accession, 'accepted');
    await run('archive');
    const recovered = await store.get(key);
    assert.ok(recovered);
    assert.equal(recovered.operations[0].id, before.operations[0].id);
    assert.equal(recovered.operations[0].outcome, 'confirmed');
    assert.equal(recovered.operations[0].evidence.idempotencyKey, originalReceipt.idempotencyKey);
    assert.equal(recovered.operations[0].checkpointed, true);
    assert.equal(recovered.completion, undefined);
    assert.equal(remote.operationLookups, 1);
    assert.equal(remote.submissions, 1);
    const { record } = await current();
    assert.equal(record.metadata.title, 'New unapproved dossier');
    assert.equal(record.metadata.archive, undefined);
    assert.equal(record.workflow.stage, 'queued');
    assert.equal(hookCalls, 0);
    await assert.rejects(
      publication.administer({
        action: 'resume',
        ...key,
        username: 'admin',
        apply: true,
        reason: 'Old authority must remain revoked',
      }),
      /current unchanged approval/
    );
  });
  for (const fault of ['missing', 'wrong-key', 'wrong-digest'] as const) {
    it(`refuses ${fault} operation lookup evidence without releasing submission authority`, async () => {
      const store = await start();
      remote.loseNextResponse();
      await run('archive');
      const before = await store.get(key);
      assert.ok(before);
      remote.lookupFault(fault);
      await run('archive');
      const after = await store.get(key);
      assert.ok(after);
      assert.equal(after.status, 'repair_required');
      assert.deepEqual(after.operations, before.operations);
      assert.equal(after.completion, undefined);
      assert.equal(remote.submissions, 1);
      remote.lookupFault(undefined);
      await publication.administer({
        action: 'resume',
        ...key,
        username: 'admin',
        apply: true,
        reason: 'Restore authoritative lookup',
      });
      await run('archive');
      assert.equal((await store.get(key))?.operations[0].outcome, 'confirmed');
      assert.equal(remote.submissions, 1);
    });
  }
  async function startWithoutLookup() {
    setFixtureRemoteLookup(false);
    publication = await loadHook();
    publication.bootstrap();
    globalValue('PublicationService', publication);
    return start('any');
  }
  for (const checkpointed of [false, true]) {
    it(`refuses an accession receipt for a different key with checkpointed=${checkpointed}`, async () => {
      const store = await start('any');
      await run('archive');
      const before = await store.get(key);
      assert.ok(before);
      const receipt = remote.accessions[0];
      const originalKey = receipt.idempotencyKey;
      receipt.idempotencyKey = `rbpub-v1-${'0'.repeat(64)}`;
      remote.decision(receipt.accession, 'accepted');
      if (!checkpointed) await store.collection.updateOne(key, { $unset: { 'operations.0.checkpointed': '' } });
      const pending = await store.get(key);
      assert.ok(pending);
      await run('archive');
      const refused = await store.get(key);
      assert.equal(refused?.status, 'repair_required');
      assert.deepEqual(refused.operations, pending.operations);
      assert.equal(refused.completion, undefined);
      assert.equal((await current()).record.metadata.archive, undefined);
      assert.equal((await current()).record.workflow.stage, 'queued');
      assert.equal(hookCalls, 0);
      assert.equal(remote.submissions, 1);
      receipt.idempotencyKey = originalKey;
      await publication.administer({
        action: 'resume',
        ...key,
        username: 'admin',
        apply: true,
        reason: 'Restored the exact retained operation receipt',
      });
      await run('archive');
      if (!checkpointed) await run('archive');
      assert.equal((await store.get(key))?.status, 'completed');
      assert.equal(remote.submissions, 1);
      assert.equal(hookCalls, 1);
    });
  }
  for (const changed of [false, true]) {
    it(`${changed ? 'refuses changed receipt content' : 'reuses exact receipt content'} under a retained historical operation key`, async () => {
      const store = await start('any');
      await run('archive');
      const before = await store.get(key);
      assert.ok(before);
      const receipt = remote.accessions[0];
      assert.equal(receipt.dossierDigest, before.operations[0].intendedDigest);
      assert.equal(receipt.idempotencyKey, before.operations[0].idempotencyKey);
      configuration.sourcePolicies[0].event = 'onUpdate';
      configuration.sourcePolicies[0].mode = 'auto-sync';
      const snapshot = await mongo.getMeta('record');
      const saved = await records.updateMeta(
        brand,
        'record',
        {
          ...snapshot,
          metadata: {
            title: changed ? 'Changed remote dossier' : receipt.title,
            description: 'A new source revision',
          },
        },
        user,
        false,
        false
      );
      assert.equal(saved.isComplete(), true, JSON.stringify(saved));
      await publication.dispatch();
      const requested = await store.get(key);
      assert.ok(requested);
      assert.equal(requested.sourceGeneration, 2);
      assert.notEqual(requested.approvalId, before.approvalId);
      if (changed) {
        receipt.dossierDigest = publicationDigest({ title: 'Changed remote dossier' });
        assert.notEqual(receipt.dossierDigest, before.operations[0].intendedDigest);
      }
      remote.decision(receipt.accession, 'accepted');
      await run('archive');
      const refused = await store.get(key);
      assert.ok(refused);
      assert.equal(refused?.status, changed ? 'repair_required' : 'completed');
      assert.deepEqual(refused.operations, requested.operations);
      if (changed) {
        assert.equal(refused.waitingReason, 'publication_operation_evidence_mismatch:intended_digest');
        assert.equal(refused.completion, undefined);
        assert.equal((await current()).record.metadata.archive, undefined);
        assert.equal((await current()).record.workflow.stage, 'queued');
        assert.equal(hookCalls, 0);
        receipt.dossierDigest = before.operations[0].intendedDigest;
        await publication.administer({
          action: 'resume',
          ...key,
          username: 'admin',
          apply: true,
          reason: 'Restored the original operation receipt',
        });
        await run('archive');
        assert.equal((await store.get(key))?.waitingReason, 'accession_dossier_conflict');
        assert.equal((await store.get(key))?.completion, undefined);
        assert.equal((await current()).record.metadata.archive, undefined);
        assert.equal(hookCalls, 0);
      } else {
        assert.equal(refused.completion?.approvalId, requested.approvalId);
        assert.equal(refused.completion?.sourceGeneration, requested.sourceGeneration);
        assert.equal(refused.completion?.remote.objectId, receipt.accession);
        assert.equal(hookCalls, 1);
      }
      assert.equal(remote.submissions, 1);
    });
  }
  it('no-lookup provider accepts an externally receipted CLI attestation with dry-run, CAS, audit and exact replay', async () => {
    const store = await startWithoutLookup();
    remote.loseNextResponse();
    await run('archive');
    const before = await store.get(key);
    assert.ok(before);
    await run('archive');
    assert.equal((await store.get(key))?.waitingReason, 'external_submission_receipt_required');
    assert.equal(remote.operationLookups, 0);
    const externalReceipt = {
      ...remote.accessions[0],
      namespace: `accession:${new URL(remote.endpoint).origin}/research`,
    };
    const proof = { outcome: 'confirmed', externalReceipt };
    const dryBefore = await store.get(key);
    await attest(before.operations[0], proof, false);
    assert.deepEqual(await store.get(key), dryBefore);
    await attest(before.operations[0], proof);
    const repaired = await store.get(key);
    assert.ok(repaired);
    assert.equal(repaired.operations[0].outcome, 'confirmed');
    assert.equal(repaired.operations[0].checkpointed, true);
    assert.equal(repaired.completion, undefined, 'Receipt settlement never manufactures provider completion');
    assert.ok(repaired.operations[0].evidence.operatorAttestation);
    const correction = await client
      .db(database)
      .collection('publicationcorrection')
      .findOne({ id: repaired.correctionReferences.at(-1) });
    assert.equal(correction?.status, 'applied');
    assert.equal(correction?.actor.username, 'admin');
    assert.equal(correction?.reason, 'Investigated the exact external submission');
    assert.equal(correction?.evidenceReference, 'external-investigation/no-lookup');
    await attest(before.operations[0], proof);
    assert.deepEqual((await store.get(key))?.operations, repaired.operations);
    await assert.rejects(
      attest(before.operations[0], { ...proof, externalReceipt: { ...externalReceipt, accession: 'ACC-999' } }),
      /cannot be replaced/
    );
    await publication.administer({
      action: 'resume',
      ...key,
      username: 'admin',
      apply: true,
      reason: 'Resume externally receipted submission',
    });
    remote.decision('ACC-1', 'accepted');
    await run('archive');
    assert.equal((await store.get(key))?.status, 'completed');
    assert.equal(remote.submissions, 1);
    assert.equal(remote.operationLookups, 0);
  });
  it('no-lookup attestation refuses incomplete or conflicting proof and competing ownership', async () => {
    const store = await startWithoutLookup();
    remote.loseNextResponse();
    await run('archive');
    const before = await store.get(key);
    assert.ok(before);
    const receipt = { ...remote.accessions[0], namespace: `accession:${new URL(remote.endpoint).origin}/research` };
    for (const extra of [
      { outcome: 'confirmed' },
      { outcome: 'not_applied' },
      { outcome: 'confirmed', externalReceipt: receipt, priorOperationSettled: false },
      { outcome: 'confirmed', externalReceipt: receipt, intendedDigest: 'wrong' },
      { outcome: 'confirmed', externalReceipt: receipt, idempotencyKey: 'wrong' },
      { outcome: 'confirmed', externalReceipt: { ...receipt, namespace: 'foreign' } },
      { outcome: 'confirmed', externalReceipt: { ...receipt, dossierDigest: 'wrong' } },
    ]) {
      await assert.rejects(attest(before.operations[0], extra));
      assert.deepEqual((await store.get(key))?.operations, before.operations);
    }
    const currentRow = await store.get(key);
    assert.ok(currentRow);
    const lease = await store.claim(key, 'competing-worker', 120000);
    assert.ok(lease?.lease);
    await assert.rejects(
      attest(before.operations[0], { outcome: 'confirmed', externalReceipt: receipt }),
      /active publication worker/
    );
    await store.release(key, lease.lease, lease.revision);
    assert.equal(remote.submissions, 1);
    assert.equal(remote.operationLookups, 0);
  });
  it('scopes external attestations to one destination and refuses an active resource owner', async () => {
    const store = await startWithoutLookup();
    for (const destination of ['archive', 'repository']) {
      remote.loseNextResponse();
      await run(destination);
    }
    const first = await store.get(key);
    const siblingKey = { ...key, destinationId: 'repository' };
    const sibling = await store.get(siblingKey);
    assert.ok(first && sibling);
    const op = first.operations[0];
    const other = sibling.operations[0];
    assert.equal(op.intendedDigest, other.intendedDigest, 'Identical content must still have distinct operations');
    assert.notEqual(op.idempotencyKey, other.idempotencyKey);
    const externalReceipt = {
      ...remote.accessions[0],
      namespace: `accession:${new URL(remote.endpoint).origin}/research`,
    };
    for (const parameters of [
      { operationId: other.id, idempotencyKey: other.idempotencyKey },
      { idempotencyKey: other.idempotencyKey },
      { externalReceipt: { ...externalReceipt, ...remote.accessions[1] } },
    ]) {
      await assert.rejects(attest(op, { outcome: 'confirmed', externalReceipt, ...parameters }));
      assert.deepEqual((await store.get(key))?.operations, first.operations);
      assert.deepEqual((await store.get(siblingKey))?.operations, sibling.operations);
    }
    const resources = new PublicationResourceStore(client.db(database));
    const resourceKey = { providerId: first.providerId, namespace: 'accession:shared', resourceKey: 'review' };
    const owner = await resources.claim(resourceKey, key.brandId, 'active-resource-worker', 120000);
    assert.ok(owner?.lease);
    const owned = await resources.journal(resourceKey, key.brandId, owner.lease, owner.revision, key, {
      ...op,
      outcome: 'submitted',
    });
    await assert.rejects(attest(op, { outcome: 'confirmed', externalReceipt }), /active publication resource lease/);
    assert.deepEqual((await store.get(key))?.operations, first.operations);
    assert.equal(await client.db(database).collection('publicationcorrection').countDocuments({}), 0);
    await resources.release(resourceKey, key.brandId, owner.lease, owned.revision);
    await attest(op, { outcome: 'confirmed', externalReceipt });
    assert.equal((await store.get(key))?.operations[0].outcome, 'confirmed');
    assert.deepEqual((await store.get(siblingKey))?.operations, sibling.operations);
    assert.equal((await store.get(key))?.completion, undefined);
    assert.equal(remote.submissions, 2);
    assert.equal(remote.operationLookups, 0);
  });
  it('no-lookup certified non-application retires only the unsent operation and permits one authorized fresh attempt', async () => {
    const store = await startWithoutLookup();
    const journal = PublicationSyncStore.prototype.journal;
    let stopped = false;
    PublicationSyncStore.prototype.journal = async function (...args: Parameters<typeof journal>) {
      const saved = await journal.apply(this, args);
      if (!stopped && args[0].destinationId === 'archive' && args[3].outcome === 'submitted') {
        stopped = true;
        await this.collection.updateOne(key, { $set: { 'lease.expiresAt': 0 } });
        throw new PublicationLeaseLost();
      }
      return saved;
    };
    try {
      await run('archive');
    } finally {
      PublicationSyncStore.prototype.journal = journal;
    }
    const before = await store.get(key);
    assert.ok(before);
    assert.equal(remote.submissions, 0);
    await run('archive');
    assert.equal((await store.get(key))?.waitingReason, 'external_submission_receipt_required');
    await attest(before.operations[0], { outcome: 'not_applied', nonApplicationVerified: true });
    const repaired = await store.get(key);
    assert.ok(repaired);
    assert.equal(repaired.operations[0].outcome, 'not_applied');
    assert.equal(repaired.completion, undefined);
    await publication.administer({
      action: 'resume',
      ...key,
      username: 'admin',
      apply: true,
      reason: 'Resume certified non-application',
    });
    await run('archive');
    remote.decision('ACC-1', 'accepted');
    await run('archive');
    const completed = await store.get(key);
    assert.ok(completed);
    assert.equal(completed.status, 'completed');
    assert.equal(remote.submissions, 1);
    assert.notEqual(completed.operations[1].id, before.operations[0].id);
    assert.notEqual(completed.operations[1].idempotencyKey, before.operations[0].idempotencyKey);
    assert.equal(remote.operationLookups, 0);
  });
  it('refuses an attestation if the source changes during receipt verification, then safely settles only history', async () => {
    const store = await startWithoutLookup();
    remote.loseNextResponse();
    await run('archive');
    const before = await store.get(key);
    assert.ok(before);
    const externalReceipt = {
      ...remote.accessions[0],
      namespace: `accession:${new URL(remote.endpoint).origin}/research`,
    };
    const verify = attestedAccessionProvider.attestOperation;
    assert.ok(verify);
    let changed = false;
    attestedAccessionProvider.attestOperation = async context => {
      const result = await verify(context);
      const update = await mongo.updateMeta(brand, 'record', { metadata: { title: 'Concurrent draft' } });
      assert.equal(update.success, true);
      changed = true;
      return result;
    };
    try {
      await assert.rejects(attest(before.operations[0], { outcome: 'confirmed', externalReceipt }), /source changed/);
    } finally {
      attestedAccessionProvider.attestOperation = verify;
    }
    assert.equal(changed, true);
    const refused = await store.get(key);
    assert.deepEqual(refused?.operations, before.operations);
    assert.deepEqual(refused?.providerState, before.providerState);
    assert.equal(refused?.lease, null);
    assert.equal(await client.db(database).collection('publicationcorrection').countDocuments({}), 0);
    await attest(before.operations[0], { outcome: 'confirmed', externalReceipt });
    const settled = await store.get(key);
    assert.equal(settled?.operations[0].outcome, 'confirmed');
    assert.equal(settled?.completion, undefined);
    await assert.rejects(
      publication.administer({
        action: 'resume',
        ...key,
        username: 'admin',
        apply: true,
        reason: 'Receipt cannot grant fresh authority',
      }),
      /current unchanged approval/
    );
    assert.equal(remote.submissions, 1);
    assert.equal((await current()).record.metadata.archive, undefined);
    assert.equal(hookCalls, 0);
  });
  it('retains the unresolved operation and interrupted audit after a competing state CAS, then replays the receipt', async () => {
    const store = await startWithoutLookup();
    remote.loseNextResponse();
    await run('archive');
    const before = await store.get(key);
    assert.ok(before);
    const externalReceipt = {
      ...remote.accessions[0],
      namespace: `accession:${new URL(remote.endpoint).origin}/research`,
    };
    const verify = attestedAccessionProvider.attestOperation;
    assert.ok(verify);
    let raced = false;
    attestedAccessionProvider.attestOperation = async context => {
      const result = await verify(context);
      await store.collection.updateOne(key, { $inc: { revision: 1 } });
      raced = true;
      return result;
    };
    try {
      await assert.rejects(
        attest(before.operations[0], { outcome: 'confirmed', externalReceipt }),
        /state changed during repair/
      );
    } finally {
      attestedAccessionProvider.attestOperation = verify;
    }
    assert.equal(raced, true);
    const refused = await store.get(key);
    assert.deepEqual(refused?.operations, before.operations);
    assert.deepEqual(refused?.providerState, before.providerState);
    assert.equal(refused?.lease, null);
    const interrupted = await client.db(database).collection('publicationcorrection').findOne({});
    assert.equal(interrupted?.status, 'interrupted');
    assert.equal(interrupted?.actor.username, 'admin');
    assert.equal(interrupted?.reason, 'Investigated the exact external submission');
    assert.equal(JSON.stringify(interrupted).includes(externalReceipt.title), false);
    await attest(before.operations[0], { outcome: 'confirmed', externalReceipt });
    assert.equal((await store.get(key))?.operations[0].outcome, 'confirmed');
    assert.equal((await store.get(key))?.completion, undefined);
    assert.equal(remote.submissions, 1);
    assert.equal(remote.operationLookups, 0);
  });
  it('resumes from persisted accession state after loading a fresh hook service', async () => {
    const store = await start('any');
    await run('archive');
    remote.decision('ACC-1', 'accepted');
    publication = await loadHook();
    publication.bootstrap();
    globalValue('PublicationService', publication);
    await run('archive');
    assert.equal(remote.submissions, 1);
    assert.equal((await store.get(key))?.status, 'completed');
    assert.equal((await current()).record.workflow.stage, 'published');
  });
  it('executes requested observation through the host without another submission or workflow transition', async () => {
    const store = await start('any');
    await run('archive');
    remote.decision('ACC-1', 'accepted');
    await run('archive');
    const completed = await store.get(key);
    assert.ok(completed);
    await store.request(key, 'observe', completed.revision);
    const before = remote.reads;
    await run('archive');
    const observed = await store.get(key);
    assert.equal(observed?.status, 'completed');
    assert.equal(observed?.work.observe.requested, 1);
    assert.equal(observed?.work.observe.processed, 1);
    assert.equal(remote.reads, before + 1);
    assert.equal(remote.submissions, 1);
    assert.equal(hookCalls, 1);
  });
  it('uses shared binding uniqueness when two destinations receive the same accession', async () => {
    const store = await start();
    await run('archive');
    remote.reuseIdentity('ACC-1');
    await run('repository');
    const sibling = await store.get({ ...key, destinationId: 'repository' });
    assert.equal(sibling?.status, 'repair_required');
    assert.equal(sibling?.binding, undefined);
    assert.equal((await store.get(key))?.binding?.objectId, 'ACC-1');
    assert.equal((await current()).record.workflow.stage, 'queued');
  });
  it('fences a changed source before observing old acceptance or advancing workflow', async () => {
    const store = await start('any');
    await run('archive');
    remote.decision('ACC-1', 'accepted');
    await mongo.updateMeta(brand, 'record', { metadata: { title: 'New draft' } });
    await run('archive');
    assert.equal((await store.get(key))?.status, 'revoked');
    assert.equal((await current()).record.workflow.stage, 'queued');
    assert.equal((await current()).record.metadata.archive, undefined);
    assert.equal(remote.submissions, 1);
  });

  it('PUB-18 retains institutional approval after approver departure but fences a disabled worker before HTTP', async () => {
    const store = await start('any');
    disabledUsers.add('approver');
    await run('archive');
    assert.equal(remote.submissions, 1);
    remote.decision('ACC-1', 'accepted');
    disabledUsers.add('worker');
    const reads = remote.reads;
    await run('archive');
    assert.equal(
      remote.reads,
      reads,
      'disabled current service identity cannot observe/project as an authorised worker'
    );
    assert.equal(remote.submissions, 1);
    assert.equal((await store.get(key))?.completion, undefined);
    const { record, state } = await current();
    assert.equal(state.approvals[0].revokedAt, undefined, 'approver departure does not revoke institutional approval');
    assert.equal(record.workflow.stage, 'queued');
    assert.equal(record.metadata.archive, undefined);
    assert.equal(hookCalls, 0);
  });

  it('PUB-18 rotates runtime credentials between submission and review without changing sealed authority', async () => {
    const store = await start('any');
    const original = (await current()).state;
    await run('archive');
    configuration.destinations.archive.connection.token = 'rotated-fixture-secret';
    remote.authorize('rotated-fixture-secret');
    remote.decision('ACC-1', 'accepted');
    await run('archive');
    const { record, state } = await current();
    assert.equal(remote.submissions, 1);
    assert.equal((await store.get(key))?.status, 'completed');
    assert.deepEqual(state.approvals, original.approvals);
    assert.equal(record.workflow.stage, 'published');
    assert.equal(hookCalls, 1);
    const persisted = JSON.stringify({ source: state, rows: await store.forRecord('brand', 'record') });
    const status = JSON.stringify(await publication.getRecordStatus('brand', 'record'));
    for (const secret of ['fixture-secret', 'rotated-fixture-secret']) {
      assert.equal(persisted.includes(secret), false);
      assert.equal(status.includes(secret), false);
    }
  });

  it('PUB-18 fences a committed source edit while an HTTP submission response is held', async () => {
    const store = await start('any');
    const response = remote.holdNextResponse();
    const execution = run('archive');
    try {
      await response.committed;
      assert.equal(remote.submissions, 1);
      await mongo.updateMeta(brand, 'record', { metadata: { title: 'New unapproved draft' } });
    } finally {
      response.release();
      await execution;
    }
    await run('archive');
    const row = await store.get(key);
    assert.equal(remote.submissions, 1);
    assert.equal(row?.completion, undefined);
    assert.ok(row?.operations.some(operation => ['confirmed', 'uncertain', 'submitted'].includes(operation.outcome)));
    const { record, state } = await current();
    assert.equal(record.metadata.title, 'New unapproved draft');
    assert.equal(record.metadata.archive, undefined);
    assert.equal(record.workflow.stage, 'queued');
    assert.ok(state.approvals[0].revokedAt);
    assert.equal(hookCalls, 0);
    assert.equal(remote.accessions[0].title, 'Approved source');
  });

  it('PUB-18 prevents a sibling first submission when the current worker loses permission after any advancement', async () => {
    const store = await start('any');
    await run('archive');
    remote.decision('ACC-1', 'accepted');
    await run('archive');
    const afterTransition = await current();
    assert.equal(afterTransition.record.workflow.stage, 'published');
    assert.equal(afterTransition.state.approvals[0].revokedAt, undefined);
    disabledUsers.add('worker');
    await run('repository');
    assert.equal(remote.submissions, 1);
    assert.equal((await store.get({ ...key, destinationId: 'repository' }))?.completion, undefined);
    assert.equal((await current()).record.metadata.repository, undefined);
    assert.deepEqual((await current()).state.approvals, afterTransition.state.approvals);
    assert.equal(hookCalls, 1);
  });

  it('PUB-18 fences persisted record edit-permission removal after any advancement', async () => {
    const store = await start('any');
    await run('archive');
    remote.decision('ACC-1', 'accepted');
    await run('archive');
    assert.equal((await current()).record.workflow.stage, 'published');
    const update = await mongo.updateMeta(brand, 'record', {
      authorization: { edit: ['approver'], editRoles: [], view: [], viewRoles: [] },
    });
    assert.equal(update.success, true);
    assert.equal((await current()).record.authorization.edit.includes('worker'), false);
    await run('repository');
    assert.equal(remote.submissions, 1);
    assert.equal((await store.get({ ...key, destinationId: 'repository' }))?.completion, undefined);
    assert.equal((await current()).record.metadata.repository, undefined);
    assert.equal((await store.get(key))?.completion?.remote.objectId, 'ACC-1', 'historical success remains retained');
    assert.equal(hookCalls, 1);
  });

  for (const after of [false, true]) {
    it(`PUB-18 resumes an accepted HTTP receipt after projection failure ${after ? 'after' : 'before'} Mongo persistence`, async () => {
      const store = await start('any');
      await run('archive');
      remote.decision('ACC-1', 'accepted');
      const project = mongo.setPublicationRecordFields.bind(mongo);
      let injected = false;
      mongo.setPublicationRecordFields = async request => {
        if (injected || request.workflowDecision) return project(request);
        injected = true;
        if (after) await project(request);
        throw new Error('PUB-18 projection acknowledgement fault');
      };
      try {
        await run('archive');
      } finally {
        mongo.setPublicationRecordFields = project;
      }
      assert.equal(injected, true);
      assert.equal((await store.get(key))?.completion, undefined);
      assert.equal((await current()).record.workflow.stage, 'queued');
      assert.equal(hookCalls, 0);
      assert.equal(Boolean((await current()).record.metadata.archive?.url), after);
      await run('archive');
      const { record, state } = await current();
      assert.equal((await store.get(key))?.status, 'completed');
      assert.equal(remote.submissions, 1, 'projection recovery must not repeat remote submission');
      assert.equal(record.metadata.archive.url, `${remote.endpoint}repositories/research/accessions/ACC-1`);
      assert.equal(record.workflow.stage, 'published');
      assert.equal(state.workflowDecision?.status, 'completed');
      assert.equal(hookCalls, 1);
      assert.equal(await store.workflowDecisions.countDocuments({}), 1);
    });
  }

  it('excludes credentials from sealed inputs, durable processing state and public status', async () => {
    const store = await start();
    await run('archive');
    const { state } = await current();
    const source = await reopenPublicationSource(
      'brand',
      state.approvals[0].source,
      new PublicationStaging('durable', disk)
    );
    assert.equal(JSON.stringify(source).includes('fixture-secret'), false);
    assert.equal(JSON.stringify(await store.forRecord('brand', 'record')).includes('fixture-secret'), false);
    const status = await publication.getRecordStatus('brand', 'record');
    assert.equal(JSON.stringify(status).includes('fixture-secret'), false);
    assert.equal(JSON.stringify(status).includes('Approved source'), false);
    assert.deepEqual(
      remote.accessions.map(value => value.title),
      ['Approved source']
    );
    await assert.rejects(publication.getRecordStatus('other-brand', 'record'), /brand mismatch/);
  });
});
