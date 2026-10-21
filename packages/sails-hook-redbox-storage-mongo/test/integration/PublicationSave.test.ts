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
  PublicationService as CorePublication,
  PublicationPublishing,
  publicationRecordDigest,
  reopenPublicationSource,
  PublicationStaging,
  type PublicationObject,
  type PublicationProvider,
  type PublicationProviderOutcome,
  type PublicationConfigurationContext,
  type StorageService,
  type RecordStorageMutationOptions,
} from '@researchdatabox/redbox-core';
import { Services as RecordServices } from '@researchdatabox/redbox-core/dist/services/RecordsService.js';
import { isPublicationObject } from '@researchdatabox/redbox-core/dist/services/publication/builtins.js';
import { Services } from '../../src/services/MongoStorageService';
import { publicationSource } from '../../src/services/publicationSourcePersistence';
import { storage } from '../../src/config/storage';

if (process.env.CI && !process.env.MONGO_TEST_URL)
  throw new Error('CI requires MONGO_TEST_URL for PUB-07 save acceptance');
const describeMongo = process.env.MONGO_TEST_URL ? describe : describe.skip;
describeMongo('Publication record-save integration (PUB-07, real Mongo)', function () {
  this.timeout(30000);
  const database = `publication_saves_${randomUUID().replaceAll('-', '')}`;
  const brand = { id: 'brand', name: 'brand', css: '', roles: [] };
  const user = { username: 'approver', type: 'local', roles: [], disabled: false };
  const recordType = { name: 'dataPublication', searchable: false, hooks: {} };
  const savedGlobals = new Map<string, unknown>();
  let client: MongoClient;
  let mongo: Services.MongoStorageService;
  let records: RecordServices.Records;
  let publication: TestPublication;
  let configuration: PublicationPublishing;
  let directory: string;
  let disk: Disk;
  let providerMutations = 0;
  let preparations = 0;
  let preparationFault: (() => Promise<void>) | undefined;
  let postHook: ((record: Record<string, unknown>) => Promise<Record<string, unknown>>) | undefined;
  let savedConfig: unknown;
  let savedServices: unknown;
  let requesterDisabled = false;
  const objectResult = (value: unknown) =>
    isPublicationObject(value)
      ? { valid: true as const, value }
      : { valid: false as const, issues: [{ path: '', code: 'object', message: 'Object required' }] };
  const mutate = async (): Promise<PublicationProviderOutcome<PublicationObject>> => {
    providerMutations++;
    throw new Error('Provider mutation during save');
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
    targetFingerprint: () => 'verified-target',
    decodeState: objectResult,
    upgradeState: objectResult,
    decodePreparedSource: objectResult,
    prepareSource: async input => {
      preparations++;
      await preparationFault?.();
      if (isPublicationObject(input.configuration.mapping) && input.configuration.mapping.fail === true)
        return { valid: false, issues: [{ path: '/title', code: 'title', message: 'Title is required' }] };
      return { valid: true, value: { title: input.record.metadata, generated: input.generatedValues } };
    },
    synchronise: mutate,
    reconcile: mutate,
    observe: mutate,
    repairs: [],
  };
  class TestPublication extends CorePublication.Services.Publication {
    protected override configureProviders(): void {
      super.configureProviders();
      this.registerProvider(provider);
    }
    protected override async sourceConfigurationContext(
      _brand: string,
      adapter: StorageService
    ): Promise<PublicationConfigurationContext> {
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
      'Record',
      'DeletedRecord',
      'RecordAudit',
      'IntegrationAudit',
      'RecordSchemaArtifact',
      'RecordSchemaReference',
      'PublicationSync',
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
    directory = await mkdtemp(join(tmpdir(), 'pub07-mongo-save-'));
    disk = new Disk(new FSDriver({ location: directory, visibility: 'private' }));
    globalValue('BrandingService', { getBrandById: () => brand, getBrand: () => brand, getDefault: () => brand });
    globalValue('FormsService', {
      getForm: async () => ({ name: 'publication-form', attachmentFields: [] }),
      getFormByName: () => of({ name: 'publication-form', attachmentFields: [] }),
    });
    globalValue('RolesService', { getRole: () => null, getAdminFromBrand: () => ({ id: 'admin', name: 'Admin' }) });
    globalValue('WorkflowStepsService', {
      getFirst: () =>
        of({
          name: 'queued',
          config: {
            workflow: { stage: 'queued' },
            form: 'publication-form',
            authorization: { edit: ['approver'], editRoles: [], viewRoles: [] },
          },
        }),
      get: (_type: unknown, name: string) =>
        of({ name, config: { workflow: { stage: name }, form: 'publication-form' } }),
    });
    globalValue('RecordTypesService', { get: () => of(recordType) });
    globalValue('RecordValidationService', {
      resolve: async () => ({ status: 'unresolved', shouldBlock: false, mode: 'shadow', diagnostics: [] }),
    });
    globalValue('TranslationService', { t: (key: string) => key });
    globalValue('StorageManagerService', { disk: () => disk });
    globalValue('UsersService', {
      getUserWithUsername: (username: string) =>
        of({ username, type: 'local', disabled: requesterDisabled, roles: [] }),
    });
    globalValue('AppConfigService', { getAppConfigurationForBrand: () => ({ publicationPublishing: configuration }) });
    globalValue('__publicationHooks', {
      run: async (_oid: unknown, record: Record<string, unknown>) => (postHook ? postHook(record) : record),
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
    configuration.destinations = { archive: structuredClone(destination), repository: structuredClone(destination) };
    configuration.sourcePolicies = [
      {
        id: 'approve',
        version: 1,
        mode: 'approval',
        recordType: 'dataPublication',
        event: 'onCreate',
        destinations: ['archive', 'repository'],
      },
    ];
    preparations = 0;
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
        authorization: { edit: ['approver'], editRoles: [], view: [], viewRoles: [] },
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
  it('runs a real RecordsService create through atomic persistence and tracker finalisation without provider mutations', async () => {
    const result = await create();
    assert.equal(result.isComplete(), true, JSON.stringify(result));
    const { state } = await current();
    assert.equal(state.revision, 1);
    assert.equal(state.pending, true);
    assert.equal(state.saves.length, 1);
    assert.equal(state.saves[0].outcome, 'ready');
    assert.ok(state.saves[0].successfulSaveEvidence);
    assert.equal(preparations, 4);
    assert.equal(providerMutations, 0);
    assert.deepEqual(state.approvals[0].destinationIds, ['archive', 'repository']);
  });
  it('keeps an ordinary draft save available despite broken publication mappings', async () => {
    configuration.sourcePolicies[0].event = 'onTransitionWorkflow';
    configuration.destinations.archive.mapping.invalidConfig = true;
    const result = await create();
    assert.equal(result.isComplete(), true, JSON.stringify(result));
    const { state } = await current();
    assert.equal(state.approvals.length, 0);
    assert.equal(preparations, 0);
    assert.equal(providerMutations, 0);
  });
  it('rejects explicit approval before record persistence when any selected destination is invalid', async () => {
    configuration.destinations.repository.mapping.invalidConfig = true;
    const result = await create();
    assert.equal(result.wasPersisted(), false, JSON.stringify(result));
    assert.equal(await mongo.recordCol.countDocuments({}), 0);
    assert.equal(providerMutations, 0);
  });
  it('reloads the actual requester and refuses forged active-user fields during a trusted save', async () => {
    requesterDisabled = true;
    const result = await create();
    assert.equal(result.wasPersisted(), false, JSON.stringify(result));
    assert.equal(await mongo.recordCol.countDocuments({}), 0);
    assert.equal(providerMutations, 0);
  });
  it('persists per-destination auto-sync failures while valid sibling work becomes ready', async () => {
    configuration.sourcePolicies[0].mode = 'auto-sync';
    configuration.destinations.repository.mapping.invalidConfig = true;
    const result = await create();
    assert.equal(result.isComplete(), true, JSON.stringify(result));
    const { state } = await current();
    assert.equal(state.saves[0].outcome, 'ready');
    assert.equal(state.intents.archive.pending, true);
    assert.equal(state.intents.repository, undefined);
    assert.equal(state.preparationFailures?.[0].destinationId, 'repository');
    assert.equal(providerMutations, 0);
  });
  it('abandons a failed synchronous save and never recovers it by age', async () => {
    recordType.hooks = { onCreate: { postSync: [{ function: '__publicationHooks.run' }] } };
    postHook = async () => {
      throw new Error('Synchronous failure');
    };
    const result = await create(true);
    assert.equal(result.wasPersisted(), true);
    assert.equal(result.isComplete(), false);
    const recovered = await mongo.recoverPublicationIntents('brand', new Date(Date.now() + 60000).toISOString(), 100);
    assert.equal(recovered.ready, 0);
    const { state } = await current();
    assert.equal(state.saves[0].outcome, 'abandoned');
    assert.equal(state.pending, false);
  });
  it('reprepares and validates content changed by synchronous hooks instead of publishing the earlier snapshot', async () => {
    recordType.hooks = { onCreate: { postSync: [{ function: '__publicationHooks.run' }] } };
    postHook = async record => ({ ...record, metadata: { title: 'Final hook source' } });
    const result = await create(true);
    assert.equal(result.isComplete(), true, JSON.stringify(result));
    const { state } = await current();
    const approval = state.approvals.find(value => !value.revokedAt);
    assert.ok(approval);
    const source = await reopenPublicationSource('brand', approval.source, new PublicationStaging('durable', disk));
    assert.deepEqual(source.metadata.metadata, { title: 'Final hook source' });
    assert.equal(state.revision, 2);
    assert.equal(state.saves.filter(save => save.outcome === 'ready').length, 1);
    assert.equal(providerMutations, 0);
  });
  it('does not turn a competing source edit during finalisation into an approval', async () => {
    preparationFault = async () => {
      if (preparations === 3) await mongo.updateMeta(brand, 'record', { metadata: { title: 'Concurrent edit' } });
    };
    const result = await create();
    assert.equal(result.wasPersisted(), true);
    assert.equal(result.isComplete(), false);
    const { record, state } = await current();
    assert.equal(record.metadata.title, 'Concurrent edit');
    assert.equal(state.pending, false);
    assert.equal(
      state.saves.some(save => save.outcome === 'ready'),
      false
    );
    assert.equal(providerMutations, 0);
  });
  it('ignores forged source authority and hook JSON supplied in a record', async () => {
    configuration.sourcePolicies = [];
    const result = await create(false, {
      publicationSource: { schemaVersion: 1, revision: 999, approvals: [{ id: 'forged' }] },
      publicationIntent: { approvals: [{ id: 'forged' }], readiness: 'ready' },
    });
    assert.equal(result.isComplete(), true, JSON.stringify(result));
    const { state } = await current();
    assert.equal(state.revision, 1);
    assert.equal(state.approvals.length, 0);
    assert.equal(state.pending, false);
  });
  it('invalidates prior approval on a later unapproved content write without losing its recovery evidence', async () => {
    assert.equal((await create()).isComplete(), true);
    const previous = await current();
    const source = previous.state.approvals[0].source;
    const write = await mongo.updateMeta(brand, 'record', { metadata: { title: 'Draft edit' } });
    assert.equal(write.applicationState, 'applied');
    const { state } = await current();
    assert.ok(state.approvals[0].revokedAt);
    assert.equal(state.revision, 2);
    assert.deepEqual(state.approvals[0].source, source);
    assert.equal(state.intents.archive.pending, false);
  });
  it('preserves unchanged authority across save bookkeeping and rejects a forged content-preservation exemption', async () => {
    assert.equal((await create()).isComplete(), true);
    const { record, state } = await current();
    const options: RecordStorageMutationOptions = {
      publicationIntent: {
        kind: 'preserve',
        expectedSourceRevision: state.revision,
        saveToken: randomUUID(),
        approvals: [],
        expectedPriorRecordDigest: publicationRecordDigest(record),
      },
    };
    const result = await mongo.updateMeta(
      brand,
      'record',
      { metaMetadata: { ...record.metaMetadata, lastSavedBy: 'worker', lastSaveDate: 'later' } },
      undefined,
      options
    );
    assert.equal(result.applicationState, 'applied');
    const preserved = await current();
    assert.equal(preserved.state.revision, state.revision);
    assert.equal(preserved.state.approvals[0].revokedAt, undefined);
    await assert.rejects(
      mongo.updateMeta(brand, 'record', { metadata: { title: 'Hidden edit' } }, undefined, {
        publicationIntent: {
          ...options.publicationIntent!,
          expectedPriorRecordDigest: publicationRecordDigest(preserved.record),
        },
      }),
      /cannot change source content/
    );
  });
  it('conditionally authorises standalone compatibility calls using only the committed record', async () => {
    configuration.sourcePolicies = [];
    assert.equal((await create()).isComplete(), true);
    configuration.sourcePolicies = [
      {
        id: 'standalone',
        version: 1,
        mode: 'approval',
        event: 'OniService.exportDataset',
        recordType: 'dataPublication',
        destinations: ['archive'],
      },
    ];
    const snapshot = await mongo.getMeta('record');
    assert.equal(
      await publication.acceptProviderRequest(
        'ledger',
        'OniService.exportDataset',
        'record',
        { ...snapshot, metadata: { title: 'Uncommitted forged snapshot' } },
        { grantCondition: 'true', readiness: 'ready' },
        user
      ),
      true
    );
    const { state } = await current();
    const approval = state.approvals.find(value => !value.revokedAt);
    assert.ok(approval);
    const source = await reopenPublicationSource('brand', approval.source, new PublicationStaging('durable', disk));
    assert.deepEqual(source.metadata.metadata, { title: 'Approved source' });
    assert.equal(providerMutations, 0);
  });
  it('makes a provider compatibility call in a synchronous hook wait for the containing save outcome', async () => {
    configuration.sourcePolicies[0].event = 'OniService.exportDataset';
    recordType.hooks = { onCreate: { pre: [{ function: '__publicationHooks.run' }] } };
    postHook = async record => {
      assert.equal(
        await publication.acceptProviderRequest(
          'ledger',
          'OniService.exportDataset',
          'record',
          record,
          { readiness: 'ready' },
          user
        ),
        true
      );
      assert.equal(await mongo.recordCol.countDocuments({ 'publicationSource.pending': true }), 0);
      return record;
    };
    const result = await records.create(
      brand,
      { redboxOid: 'record', metadata: { title: 'Hook request' }, authorization: { edit: ['approver'] } },
      recordType,
      user,
      true,
      false
    );
    assert.equal(result.isComplete(), true, JSON.stringify(result));
    assert.equal((await current()).state.pending, true);
    assert.equal(providerMutations, 0);
  });
  it('increments a revoked approval epoch conditionally and refuses an older revocation', async () => {
    assert.equal((await create()).isComplete(), true);
    const { record, state } = await current();
    const approval = state.approvals[0];
    const revoke = {
      kind: 'revoke' as const,
      expectedSourceRevision: state.revision,
      saveToken: randomUUID(),
      approvals: [],
      expectedPriorRecordDigest: publicationRecordDigest(record),
      revocations: [{ approvalId: approval.id, epoch: approval.epoch }],
    };
    assert.equal(
      (await mongo.updateMeta(brand, 'record', {}, undefined, { publicationIntent: revoke })).applicationState,
      'applied'
    );
    const revoked = await current();
    assert.equal(revoked.state.approvals[0].epoch, approval.epoch + 1);
    assert.ok(revoked.state.approvals[0].revokedAt);
    assert.equal(revoked.state.intents.archive.pending, false);
    await assert.rejects(
      mongo.updateMeta(brand, 'record', {}, undefined, { publicationIntent: { ...revoke, saveToken: randomUUID() } }),
      /revocation is stale/
    );
  });
  it('rejects a committed-source change while a standalone request is being prepared', async () => {
    configuration.sourcePolicies = [];
    assert.equal((await create()).isComplete(), true);
    configuration.sourcePolicies = [
      {
        id: 'standalone',
        version: 1,
        mode: 'approval',
        event: 'OniService.exportDataset',
        recordType: 'dataPublication',
        destinations: ['archive'],
      },
    ];
    const snapshot = await mongo.getMeta('record');
    preparationFault = async () => {
      if (preparations === 1)
        await mongo.updateMeta(brand, 'record', { metadata: { title: 'Changed during preflight' } });
    };
    await assert.rejects(
      publication.acceptProviderRequest('ledger', 'OniService.exportDataset', 'record', { ...snapshot }, {}, user),
      /changed before acceptance/
    );
    const { state } = await current();
    assert.equal(state.pending, false);
    assert.equal(state.approvals.length, 0);
    assert.equal(providerMutations, 0);
  });
  it('does not ready a compatibility request when a later synchronous hook fails', async () => {
    configuration.sourcePolicies[0].event = 'OniService.exportDataset';
    recordType.hooks = {
      onCreate: { pre: [{ function: '__publicationHooks.run' }], postSync: [{ function: '__publicationHooks.run' }] },
    };
    let calls = 0;
    postHook = async record => {
      if (++calls > 1) throw new Error('Later hook failed');
      await publication.acceptProviderRequest('ledger', 'OniService.exportDataset', 'record', record, {}, user);
      return record;
    };
    const result = await records.create(
      brand,
      { redboxOid: 'record', metadata: { title: 'Hook request' }, authorization: { edit: ['approver'] } },
      recordType,
      user,
      true,
      true
    );
    assert.equal(result.wasPersisted(), true);
    assert.equal(result.isComplete(), false);
    const { state } = await current();
    assert.equal(state.pending, false);
    assert.equal(state.saves[0].outcome, 'abandoned');
    assert.equal(providerMutations, 0);
  });

  it('runs an auto-sync update through the real RecordsService tracker with a fresh source revision', async () => {
    assert.equal((await create()).isComplete(), true);
    configuration.sourcePolicies[0].event = 'onUpdate';
    configuration.sourcePolicies[0].mode = 'auto-sync';
    const snapshot = await mongo.getMeta('record');
    const result = await records.updateMeta(
      brand,
      'record',
      { ...snapshot, metadata: { title: 'Updated source' } },
      user,
      false,
      false
    );
    assert.equal(result.isComplete(), true, JSON.stringify(result));
    const { state } = await current();
    assert.equal(state.revision, 2);
    assert.ok(state.approvals[0].revokedAt);
    assert.equal(state.saves.filter(save => save.sourceRevision === 2 && save.outcome === 'ready').length, 1);
    assert.equal(providerMutations, 0);
  });

  it('invalidates an approved source through an ordinary RecordsService draft update without a replacement request', async () => {
    assert.equal((await create()).isComplete(), true);
    configuration.sourcePolicies = [];
    const snapshot = await mongo.getMeta('record');
    const result = await records.updateMeta(
      brand,
      'record',
      { ...snapshot, metadata: { title: 'Edited draft' } },
      user,
      false,
      false
    );
    assert.equal(result.isComplete(), true, JSON.stringify(result));
    const { state } = await current();
    assert.equal(state.revision, 2);
    assert.ok(state.approvals.every(approval => approval.revokedAt));
    assert.equal(state.intents.archive.pending, false);
    assert.equal(providerMutations, 0);
  });

  it('rejects material configuration changed between preparation and finalisation', async () => {
    preparationFault = async () => {
      if (preparations === 2) configuration.destinations.archive.mapping = { version: 2 };
    };
    const result = await create();
    assert.equal(result.wasPersisted(), true);
    assert.equal(result.isComplete(), false);
    const { state } = await current();
    assert.equal(
      state.saves.some(save => save.outcome === 'ready'),
      false
    );
    assert.equal(state.intents.archive.pending, false);
    assert.equal(providerMutations, 0);
  });
  it('rejects policy edits during finalisation even when the administrator did not bump the policy version', async () => {
    preparationFault = async () => {
      if (preparations === 2) configuration.sourcePolicies[0].destinations = ['archive'];
    };
    const result = await create();
    assert.equal(result.wasPersisted(), true);
    assert.equal(result.isComplete(), false);
    assert.equal((await current()).state.pending, false);
    assert.equal(providerMutations, 0);
  });
  it('rejects changed dependencies during standalone preflight without accepting an approval', async () => {
    configuration.sourcePolicies = [];
    assert.equal((await create()).isComplete(), true);
    configuration.sourcePolicies = [
      {
        id: 'standalone',
        version: 1,
        mode: 'approval',
        event: 'OniService.exportDataset',
        recordType: 'dataPublication',
        destinations: ['archive'],
      },
    ];
    preparationFault = async () => {
      if (preparations === 1) configuration.destinations.archive.mapping = { changed: true };
    };
    const snapshot = await mongo.getMeta('record');
    await assert.rejects(
      publication.acceptProviderRequest('ledger', 'OniService.exportDataset', 'record', { ...snapshot }, {}, user),
      /dependencies or configuration changed/
    );
    const { state } = await current();
    assert.equal(state.pending, false);
    assert.equal(state.approvals.length, 0);
    assert.equal(providerMutations, 0);
  });

  it('recovers a completed save after the Mongo success-marker response is lost without promoting a failed save', async () => {
    const success = mongo.recordPublicationSaveSuccess.bind(mongo);
    mongo.recordPublicationSaveSuccess = async (...args) => {
      await success(...args);
      throw new Error('Lost successful-save response');
    };
    try {
      const result = await create();
      assert.equal(result.wasPersisted(), true);
      assert.equal(result.isComplete(), false);
      const { state } = await current();
      assert.equal(state.saves[0].outcome, 'initialising');
      assert.ok(state.saves[0].successfulSaveEvidence);
    } finally {
      mongo.recordPublicationSaveSuccess = success;
    }
    const independent = new Services.MongoStorageService();
    await independent.init();
    const recovered = await independent.recoverPublicationIntents(
      'brand',
      new Date(Date.now() + 60000).toISOString(),
      100
    );
    assert.equal(recovered.ready, 1);
    assert.equal((await current()).state.saves[0].outcome, 'ready');
    assert.equal(providerMutations, 0);
  });
});
