import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient, type Document, type CommandStartedEvent } from 'mongodb';
import {
  publicationRecordDigest,
  assertFullPublicationStorageCapability,
  hasFullPublicationStorageCapability,
  PublicationStorageCapabilityError,
  type PublicationApproval,
  type PublicationAcknowledgement,
  type PublicationProjection,
  type RecordStorageMutationOptions,
} from '@researchdatabox/redbox-core';
import { Services } from '../../src/services/MongoStorageService';
import { publicationSource, PUBLICATION_SOURCE_MAX_SAVES } from '../../src/services/publicationSourcePersistence';
import { storage } from '../../src/config/storage';

if (process.env.CI && !process.env.MONGO_TEST_URL)
  throw new Error('CI requires MONGO_TEST_URL; PUB-06 real-Mongo acceptance must run');
const describeMongo = process.env.MONGO_TEST_URL ? describe : describe.skip;
describeMongo('Atomic publication source storage (PUB-06, real Mongo)', function () {
  this.timeout(30000);
  const database = `publication_source_${randomUUID().replaceAll('-', '')}`;
  const brand = { id: 'brand', name: 'brand', css: '', roles: [] };
  let client: MongoClient;
  let service: Services.MongoStorageService;
  let second: Services.MongoStorageService;
  const globals = new Map<string, unknown>();
  let oldStorage: unknown;
  before(async () => {
    client = new MongoClient(process.env.MONGO_TEST_URL!, { serverSelectionTimeoutMS: 10000, monitorCommands: true });
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
    ]) {
      globals.set(name, Reflect.get(globalThis, name));
      Reflect.set(globalThis, name, { tableName: name.toLowerCase(), getDatastore: () => ({ manager: db }) });
    }
    const sails = Reflect.get(globalThis, 'sails');
    oldStorage = sails.config.storage;
    sails.config.storage = storage;
    service = new Services.MongoStorageService();
    await service.init();
    second = new Services.MongoStorageService();
    await second.init();
  });
  after(async () => {
    for (const [name, value] of globals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name);
      else Reflect.set(globalThis, name, value);
    }
    Reflect.get(globalThis, 'sails').config.storage = oldStorage;
    if (client) {
      await client.db(database).dropDatabase();
      await client.close();
    }
  });
  beforeEach(async () => {
    await service.recordCol.deleteMany({});
    await service.recordIdentityCol.deleteMany({});
    await service.deletedRecordCol.deleteMany({});
    await service.recordCol.insertOne({
      redboxOid: 'record',
      revision: 0,
      recordVersion: 0,
      metaMetadata: { brandId: 'brand', type: 'dataPublication' },
      metadata: { title: 'original' },
      workflow: { stage: 'queued' },
    });
  });
  function approval(sourceRevision: number, destinationIds = ['archive', 'repository']): PublicationApproval {
    return {
      id: randomUUID(),
      epoch: 1,
      sourceRevision,
      policy: {
        id: 'approve',
        version: 1,
        mode: 'approval',
        recordType: 'dataPublication',
        event: 'onTransition',
        destinations: destinationIds,
      },
      destinationIds,
      targetFingerprints: Object.fromEntries(destinationIds.map(id => [id, `target-${id}`])),
      configurationDigests: Object.fromEntries(destinationIds.map(id => [id, 'c'.repeat(64)])),
      source: { encodingVersion: 1, disk: 'durable', key: `brand/${randomUUID()}`, digest: 'a'.repeat(64) },
      requester: { username: 'requester', userType: 'local' },
      approver: { username: 'approver', userType: 'local' },
      grantedAt: new Date().toISOString(),
    };
  }
  function options(
    token: string,
    expectedSourceRevision = 0,
    destinations = ['archive', 'repository'],
    kind: 'content' | 'approval' = 'content'
  ): RecordStorageMutationOptions {
    return {
      publicationIntent: {
        kind,
        expectedSourceRevision,
        saveToken: token,
        approvals: [approval(expectedSourceRevision + (kind === 'content' ? 1 : 0), destinations)],
      },
    };
  }
  async function current(oid = 'record') {
    const record = await service.recordCol.findOne({ redboxOid: oid });
    assert.ok(record);
    return { record, state: publicationSource(record.publicationSource) };
  }
  async function write(token: string, opts = options(token), metadata: Document = { title: token }) {
    const result = await service.updateMeta(brand, 'record', { metadata }, undefined, opts);
    assert.equal(result.applicationState, 'applied');
    return current();
  }
  async function success(token: string, instance = service) {
    const { record, state } = await current();
    return instance.recordPublicationSaveSuccess('brand', 'record', token, {
      evidenceId: `complete-${token}`,
      sourceRevision: state.revision,
      recordDigest: publicationRecordDigest(record),
    });
  }
  async function ready(token: string) {
    assert.equal(await success(token), true);
    assert.equal(await service.readyPublicationIntent('brand', 'record', token), true);
  }
  async function ack(destinationId = 'archive'): Promise<PublicationAcknowledgement> {
    const { state } = await current();
    const intent = state.intents[destinationId];
    const grant = state.approvals.find(entry => entry.id === intent.approvalId);
    assert.ok(grant);
    return { ...intent, source: grant.source };
  }
  async function projection(): Promise<PublicationProjection> {
    const { record, state } = await current();
    const intent = state.intents.archive;
    return {
      brandId: 'brand',
      oid: 'record',
      expectedRevision: record.revision,
      sourceRevision: state.revision,
      approvalId: intent.approvalId,
      approvalEpoch: intent.approvalEpoch,
      generation: intent.generation,
      destinationId: 'archive',
      fields: { 'metadata.publication_url': 'https://example.test/object' },
      allowedPaths: ['metadata.publication_url'],
    };
  }
  const cutoff = () => new Date(Date.now() + 60000).toISOString();

  it('requires journaled majority acknowledgement for protected source, readiness and projection writes', async () => {
    const writes: CommandStartedEvent[] = [];
    const capture = (event: CommandStartedEvent) => {
      if (
        ['insert', 'update', 'delete', 'findAndModify'].includes(event.commandName) &&
        event.command[event.commandName] === 'record'
      )
        writes.push(event);
    };
    client.on('commandStarted', capture);
    try {
      await write('durable');
      await ready('durable');
      assert.equal((await service.setPublicationRecordFields(await projection())).updated, true);
    } finally {
      client.off('commandStarted', capture);
    }
    assert.ok(writes.length >= 4);
    for (const entry of writes) assert.deepEqual(entry.command.writeConcern, { w: 'majority', j: true });
  });

  it('declares independent versioned capability only after native initialization', () => {
    assert.equal(hasFullPublicationStorageCapability(service), true);
    assert.equal(hasFullPublicationStorageCapability(service.exports()), true);
    assert.equal(hasFullPublicationStorageCapability(new Services.MongoStorageService()), false);
    assert.throws(
      () => assertFullPublicationStorageCapability({ getCapabilities: () => ({ recordConcurrency: 1 }) }),
      PublicationStorageCapabilityError
    );
    assert.equal(service.getCapabilities().publication, 1);
  });
  it('creates source and metadata atomically while stripping forged source JSON', async () => {
    const result = await service.create(
      brand,
      {
        redboxOid: 'new',
        metaMetadata: { brandId: 'brand' },
        metadata: { title: 'new' },
        publicationSource: { schemaVersion: 900, revision: 999 },
      },
      {},
      undefined,
      options('new')
    );
    assert.equal(result.applicationState, 'applied');
    const { state, record } = await current('new');
    assert.equal(state.revision, 1);
    assert.equal(record.revision, 0);
    assert.equal(state.saves[0].recordDigest, publicationRecordDigest(record));
    assert.equal(state.saves[0].outcome, 'initialising');
    const ordinary = await service.create(brand, { redboxOid: 'ordinary', publicationSource: state }, {});
    assert.equal(ordinary.applicationState, 'applied');
    assert.equal((await service.recordCol.findOne({ redboxOid: 'ordinary' }))?.publicationSource, undefined);
  });
  it('never accepts direct readiness without durable successful-save evidence', async () => {
    await write('one');
    assert.equal(await service.readyPublicationIntent('brand', 'record', 'one'), false);
    assert.equal((await service.pendingPublicationIntents('brand', 10)).length, 0);
    await ready('one');
    assert.equal((await service.pendingPublicationIntents('brand', 10)).length, 1);
    assert.equal((await current()).state.revision, 1);
  });
  it('quarantines an interrupted save with no proof rather than promoting it by age', async () => {
    await write('unknown');
    const result = await second.recoverPublicationIntents('brand', cutoff(), 10);
    assert.equal(result.ready, 0);
    assert.equal(result.quarantined, 1);
    assert.equal((await current()).state.saves[0].outcome, 'quarantined');
    assert.equal(await success('unknown'), false);
    assert.equal((await service.pendingPublicationIntents('brand', 10)).length, 0);
  });
  it('recovers proven successful save after a lost success-marker response in an independent service', async () => {
    await write('interrupted');
    const collection = service.recordCol;
    service.recordCol = new Proxy(collection, {
      get(target, key) {
        if (key === 'updateOne')
          return async (...args: Parameters<typeof collection.updateOne>) => {
            await collection.updateOne(...args);
            throw new Error('simulated process loss after durable completion');
          };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    try {
      await assert.rejects(success('interrupted'), /simulated process loss/);
    } finally {
      service.recordCol = collection;
    }
    assert.equal((await current()).state.saves[0].outcome, 'initialising');
    const result = await second.recoverPublicationIntents('brand', cutoff(), 10);
    assert.equal(result.ready, 1);
    assert.equal(result.quarantined, 0);
    assert.equal((await second.pendingPublicationIntents('brand', 10)).length, 1);
  });
  it('retains a failed entry and never promotes it even when success evidence had been recorded', async () => {
    await write('failed');
    await success('failed');
    assert.equal(await service.abandonPublicationIntent('brand', 'record', 'failed'), true);
    const result = await second.recoverPublicationIntents('brand', cutoff(), 10);
    assert.equal(result.ready, 0);
    assert.equal(await service.readyPublicationIntent('brand', 'record', 'failed'), false);
    assert.equal((await current()).state.saves[0].outcome, 'abandoned');
    assert.equal((await current()).state.approvals[0].revokedAt !== undefined, true);
  });
  it('cannot finalise the wrong token, source revision, digest or brand', async () => {
    const { record } = await write('one');
    const completion = { evidenceId: 'success', sourceRevision: 1, recordDigest: publicationRecordDigest(record) };
    assert.equal(await service.recordPublicationSaveSuccess('other', 'record', 'one', completion), false);
    assert.equal(await service.recordPublicationSaveSuccess('brand', 'record', 'wrong', completion), false);
    assert.equal(
      await service.recordPublicationSaveSuccess('brand', 'record', 'one', { ...completion, sourceRevision: 2 }),
      false
    );
    assert.equal(
      await service.recordPublicationSaveSuccess('brand', 'record', 'one', { ...completion, recordDigest: 'wrong' }),
      false
    );
    assert.equal(await service.abandonPublicationIntent('other', 'record', 'one'), false);
    assert.equal(await service.readyPublicationIntent('other', 'record', 'one'), false);
  });
  it('does not let an older failed save erase a later successful obligation', async () => {
    await write('older');
    await write('later', options('later', 1));
    await ready('later');
    assert.equal(await service.abandonPublicationIntent('brand', 'record', 'older'), true);
    const { record, state } = await current();
    assert.equal(record.metadata.title, 'later');
    assert.equal(state.revision, 2);
    assert.equal(state.intents.archive.generation, 2);
    assert.equal(state.intents.archive.pending, true);
    assert.equal(state.saves.find(save => save.token === 'later')?.outcome, 'ready');
    assert.equal(state.approvals.find(grant => grant.id === state.intents.archive.approvalId)?.revokedAt, undefined);
  });
  it('does not revive an older approval after newer failed content was committed', async () => {
    await write('older');
    await ready('older');
    await write('failed', options('failed', 1));
    await service.abandonPublicationIntent('brand', 'record', 'failed');
    const { state } = await current();
    assert.ok(state.approvals.every(grant => grant.revokedAt));
    assert.equal(state.intents.archive.pending, false);
    assert.equal((await service.setPublicationRecordFields(await projection())).updated, false);
  });
  it('retains independent overlapping approval destinations when one save fails', async () => {
    await write('first', options('first', 0, ['archive'], 'approval'), { title: 'original' });
    await write('second', options('second', 0, ['repository'], 'approval'), { title: 'original' });
    await ready('second');
    await service.abandonPublicationIntent('brand', 'record', 'first');
    const { state } = await current();
    assert.equal(state.intents.repository.pending, true);
    assert.equal(state.approvals.find(grant => grant.id === state.intents.repository.approvalId)?.revokedAt, undefined);
    assert.equal(state.saves.find(save => save.token === 'second')?.outcome, 'ready');
  });
  it('has one prepared writer across two native instances and keeps content/generation coherent', async () => {
    const results = await Promise.all(
      [service, second].map((instance, index) =>
        instance.updateMeta(brand, 'record', { metadata: { title: `writer-${index}` } }, undefined, {
          ...options(`writer-${index}`),
          precondition: { requireRevision: true, expectedRevision: 0 },
        })
      )
    );
    assert.equal(results.filter(result => result.applicationState === 'applied').length, 1);
    assert.equal(results.filter(result => result.applicationState === 'not-applied').length, 1);
    const { record, state } = await current();
    assert.equal(state.saves[0].token, record.metadata.title);
    assert.equal(record.revision, 1);
  });
  it('enforces stale revision, expectedVersion and cross-brand preconditions without changing source', async () => {
    await write('one');
    const before = await current();
    const stale = await service.updateMeta(brand, 'record', { metadata: { title: 'stale' } }, undefined, {
      ...options('two', 1),
      precondition: { requireRevision: true, expectedRevision: 0 },
    });
    assert.equal(stale.nonApplicationReason, 'stale-revision');
    await assert.rejects(service.updateMeta(brand, 'record', {}, undefined, { expectedVersion: 0 }), /Record changed/);
    const wrongBrand = await service.updateMeta(
      { ...brand, id: 'other' },
      'record',
      {},
      undefined,
      options('other', 1)
    );
    assert.equal(wrongBrand.applicationState, 'not-applied');
    assert.deepEqual((await current()).state, before.state);
  });
  it('invalidates authority atomically for ordinary content saves despite forged fields or maintenance flag', async () => {
    await write('one');
    await ready('one');
    await service.updateMeta(
      brand,
      'record',
      { metadata: { title: 'draft edit' }, publicationSource: { revision: 999 } },
      undefined,
      { maintenance: true }
    );
    const { record, state } = await current();
    assert.equal(record.metadata.title, 'draft edit');
    assert.equal(state.revision, 2);
    assert.equal(state.intents.archive.pending, false);
    assert.ok(state.approvals[0].revokedAt);
    assert.equal((await service.setPublicationRecordFields(await projection())).updated, false);
  });
  it('invalidates changed inputs without granting replacement work', async () => {
    await write('one');
    await ready('one');
    const opts = options('invalid', 1);
    opts.publicationIntent!.approvals = [];
    await write('invalid', opts);
    const { state } = await current();
    assert.equal(state.revision, 2);
    assert.equal(state.intents.archive.pending, false);
    assert.ok(state.approvals[0].revokedAt);
  });
  it('requires matching committed identity again at recovery, including out-of-band changes', async () => {
    await write('one');
    await success('one');
    await service.recordCol.updateOne({ redboxOid: 'record' }, { $set: { 'metadata.title': 'changed outside save' } });
    const result = await second.recoverPublicationIntents('brand', cutoff(), 10);
    assert.equal(result.ready, 0);
    assert.equal(result.quarantined, 1);
  });
  it('acknowledges exactly one destination and rejects wrong source/approval/generation', async () => {
    await write('one');
    await ready('one');
    const value = await ack();
    for (const invalid of [
      { ...value, generation: 999 },
      { ...value, approvalEpoch: 2 },
      { ...value, source: { ...value.source, digest: 'b'.repeat(64) } },
    ])
      assert.equal(await service.acknowledgePublicationIntent('brand', 'record', invalid), false);
    assert.equal(await service.acknowledgePublicationIntent('other', 'record', value), false);
    assert.equal(await service.acknowledgePublicationIntent('brand', 'record', value), true);
    const { state } = await current();
    assert.equal(state.intents.archive.pending, false);
    assert.equal(state.intents.repository.pending, true);
    assert.equal((await service.pendingPublicationIntents('brand', 10)).length, 1);
    assert.equal(await service.acknowledgePublicationIntent('brand', 'record', await ack('repository')), true);
    assert.equal((await current()).state.saves.length, 0);
    assert.equal((await service.pendingPublicationIntents('brand', 10)).length, 0);
  });
  it('preserves a newer generation across an old acknowledgement/import race', async () => {
    await write('old');
    await ready('old');
    const oldAck = await ack();
    await write('new', options('new', 1));
    await ready('new');
    assert.equal(await second.acknowledgePublicationIntent('brand', 'record', oldAck), true);
    const { state } = await current();
    assert.equal(state.intents.archive.generation, 2);
    assert.equal(state.intents.archive.pending, true);
    assert.equal(state.saves.find(save => save.token === 'new')?.intents[0].pending, true);
  });
  it('paginates bounded pending and recovery scans by brand without starving later records', async () => {
    await write('one');
    await ready('one');
    const { record } = await current();
    const { _id, ...copy } = record;
    await service.recordCol.insertMany(['a', 'b', 'c'].map(redboxOid => ({ ...copy, redboxOid })));
    await service.recordCol.insertOne({ ...copy, redboxOid: 'foreign', metaMetadata: { brandId: 'other' } });
    const first = await service.pendingPublicationIntents('brand', 2);
    assert.deepEqual(
      first.map(entry => entry.redboxOid),
      ['a', 'b']
    );
    const next = await service.pendingPublicationIntents('brand', 2, 'b');
    assert.deepEqual(
      next.map(entry => entry.redboxOid),
      ['c', 'record']
    );
    for (const limit of [0, -1, 501, 1.5])
      await assert.rejects(service.pendingPublicationIntents('brand', limit), /limit/);
    await service.recordCol.deleteMany({});
    copy.publicationSource.saves[0].outcome = 'initialising';
    copy.publicationSource.initialising = true;
    await service.recordCol.insertMany(['a', 'b', 'c'].map(redboxOid => ({ ...copy, redboxOid })));
    const recovered = await service.recoverPublicationIntents('brand', cutoff(), 2);
    assert.equal(recovered.scanned, 2);
    assert.equal(recovered.afterOid, 'b');
    assert.equal((await service.recoverPublicationIntents('brand', cutoff(), 2, recovered.afterOid)).scanned, 1);
  });
  it('applies only narrow current-generation output projections and preserves source authority', async () => {
    await write('one');
    await ready('one');
    const request = await projection();
    const before = await current();
    assert.equal((await service.setPublicationRecordFields({ ...request, brandId: 'other' })).updated, false);
    assert.equal((await service.setPublicationRecordFields({ ...request, generation: 999 })).updated, false);
    assert.equal(
      (await service.setPublicationRecordFields({ ...request, workflowDecisionId: 'decision-1' })).updated,
      true
    );
    assert.equal((await service.setPublicationRecordFields(request)).updated, false);
    const { record, state } = await current();
    assert.equal(state.revision, before.state.revision);
    assert.equal(state.intents.repository.pending, true);
    assert.equal(state.workflowDecisionId, 'decision-1');
    assert.equal(record.metadata.title, 'one');
    assert.equal(record.revision, before.record.revision + 1);
    await assert.rejects(
      service.setPublicationRecordFields({ ...(await projection()), fields: { metadata: {} } }),
      /Unsupported/
    );
  });
  it('refuses acknowledgements before ready and does not expose uncommitted work', async () => {
    await write('one');
    assert.equal(await service.acknowledgePublicationIntent('brand', 'record', await ack()), false);
    assert.equal((await service.pendingPublicationIntents('brand', 10)).length, 0);
  });
  it('fails closed without overwriting unknown source schemas', async () => {
    await write('one');
    await service.recordCol.updateOne({ redboxOid: 'record' }, { $set: { 'publicationSource.schemaVersion': 2 } });
    await assert.rejects(service.updateMeta(brand, 'record', { metadata: { title: 'wrong' } }), /Unsupported/);
    await assert.rejects(service.readyPublicationIntent('brand', 'record', 'one'), /Unsupported/);
    assert.equal((await service.recordCol.findOne({ redboxOid: 'record' }))?.metadata.title, 'one');
  });
  it('applies backpressure without evicting any unimported obligation', async () => {
    for (let index = 0; index < PUBLICATION_SOURCE_MAX_SAVES; index++)
      await write(`save-${index}`, options(`save-${index}`, 0, ['archive'], 'approval'), { title: 'original' });
    const before = await current();
    await assert.rejects(
      write('overflow', options('overflow', 0, ['archive'], 'approval'), { title: 'original' }),
      /backlog is full/
    );
    assert.deepEqual((await current()).state, before.state);
  });
  it('refuses request acceptance and source operations under missing or future runtime capability', async () => {
    for (const declaration of [{}, { publication: 2 }]) {
      const unsupported = new Proxy(service, {
        get(target, key) {
          if (key === 'getCapabilities') return () => declaration;
          return Reflect.get(target, key);
        },
      });
      await assert.rejects(
        unsupported.updateMeta(brand, 'record', { metadata: { title: 'forbidden' } }, undefined, options('bad')),
        PublicationStorageCapabilityError
      );
      await assert.rejects(unsupported.pendingPublicationIntents('brand', 10), PublicationStorageCapabilityError);
      await assert.rejects(
        unsupported.recoverPublicationIntents('brand', cutoff(), 10),
        PublicationStorageCapabilityError
      );
    }
    assert.equal((await service.recordCol.findOne({ redboxOid: 'record' }))?.metadata.title, 'original');
  });
  it('preserves an unfinished sibling successful save through a registered maintenance projection', async () => {
    await write('archive', options('archive', 0, ['archive'], 'approval'), { title: 'original' });
    await ready('archive');
    await write('repository', options('repository', 0, ['repository'], 'approval'), { title: 'original' });
    await success('repository');
    assert.equal((await service.setPublicationRecordFields(await projection())).updated, true);
    assert.equal(await service.readyPublicationIntent('brand', 'record', 'repository'), true);
    assert.equal((await current()).state.saves.find(save => save.token === 'repository')?.outcome, 'ready');
  });
  it('legacy field writes conservatively invalidate shared approval instead of granting an exemption', async () => {
    await write('one');
    await ready('one');
    assert.equal(
      (await service.setRecordFields('record', { 'metadata.legacy_url': 'url' }, 1, ['metadata.legacy_url'])).updated,
      true
    );
    const { state } = await current();
    assert.equal(state.revision, 2);
    assert.ok(state.approvals[0].revokedAt);
  });
  it('does not resurrect source authority from a lifecycle restore snapshot', async () => {
    await write('one');
    await ready('one');
    const { record } = await current();
    const operationId = randomUUID();
    const incarnationId = randomUUID();
    await service.recordIdentityCol.insertOne({ redboxOid: 'record', incarnationId });
    await service.deletedRecordCol.insertOne({
      redboxOid: 'record',
      revision: 3,
      brandId: 'brand',
      incarnationId,
      lifecycleState: 'restore-pending',
      deletedRecordMetadata: { ...record, incarnationId },
      lifecycleOperation: {
        operationId,
        kind: 'restore',
        requestId: randomUUID(),
        sourceRevision: 2,
        targetRevision: 3,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attempts: 1,
      },
    });
    await service.recordCol.deleteOne({ redboxOid: 'record' });
    assert.equal(await service.readyPublicationIntent('brand', 'record', 'one'), false);
    const result = await service.createActiveRecordFromTombstone(brand, 'record', record, {
      precondition: { requireRevision: true, expectedRevision: 3 },
      lifecycle: { operationId, expectedState: 'restore-pending' },
    });
    assert.equal(result.applicationState, 'applied');
    const { state } = await current();
    assert.equal(state.revision, 2);
    assert.equal(state.pending, false);
    assert.ok(state.approvals.every(grant => grant.revokedAt));
    assert.equal((await service.setPublicationRecordFields(await projection())).updated, false);
  });
  it('leaves no authorisation when source persistence fails before a write', async () => {
    const collection = service.recordCol;
    service.recordCol = new Proxy(collection, {
      get(target, key) {
        if (key === 'findOneAndUpdate')
          return async () => {
            throw new Error('simulated storage rejection');
          };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    try {
      const result = await service.updateMeta(
        brand,
        'record',
        { metadata: { title: 'failed' } },
        undefined,
        options('failed')
      );
      assert.equal(result.applicationState, 'unknown');
    } finally {
      service.recordCol = collection;
    }
    const record = await collection.findOne({ redboxOid: 'record' });
    assert.equal(record?.metadata.title, 'original');
    assert.equal(record?.publicationSource, undefined);
    assert.equal((await second.recoverPublicationIntents('brand', cutoff(), 10)).ready, 0);
  });
  it('quarantines an ambiguous committed source write after the driver response is lost', async () => {
    const collection = service.recordCol;
    service.recordCol = new Proxy(collection, {
      get(target, key) {
        if (key === 'findOneAndUpdate')
          return async (...args: Parameters<typeof collection.findOneAndUpdate>) => {
            await collection.findOneAndUpdate(...args);
            throw new Error('simulated lost source-commit response');
          };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    try {
      const result = await service.updateMeta(
        brand,
        'record',
        { metadata: { title: 'unknown' } },
        undefined,
        options('unknown')
      );
      assert.equal(result.applicationState, 'unknown');
    } finally {
      service.recordCol = collection;
    }
    assert.equal((await current()).record.metadata.title, 'unknown');
    const recovered = await second.recoverPublicationIntents('brand', cutoff(), 10);
    assert.equal(recovered.ready, 0);
    assert.equal(recovered.quarantined, 1);
    assert.equal((await service.pendingPublicationIntents('brand', 10)).length, 0);
  });
  it('recovers durable successful-save proof after the saving process is killed before readiness', async () => {
    await write('killed-process');
    const child = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register',
        '-r',
        './test/setup.ts',
        '-e',
        `
      const { MongoClient } = require('mongodb');
      const { publicationRecordDigest } = require('@researchdatabox/redbox-core');
      const { Services } = require('./src/services/MongoStorageService');
      (async () => {
        const client = await MongoClient.connect(process.env.MONGO_TEST_URL);
        const db = client.db(process.argv[1]);
        for (const name of ['Record', 'DeletedRecord', 'RecordAudit', 'IntegrationAudit', 'RecordSchemaArtifact', 'RecordSchemaReference']) {
          Reflect.set(globalThis, name, { tableName: name.toLowerCase(), getDatastore: () => ({ manager: db }) });
        }
        const service = new Services.MongoStorageService();
        await service.init();
        const record = await service.recordCol.findOne({ redboxOid: 'record' });
        const applied = await service.recordPublicationSaveSuccess('brand', 'record', 'killed-process', {
          evidenceId: 'successful-tracker-decision', sourceRevision: record.publicationSource.revision,
          recordDigest: publicationRecordDigest(record),
        });
        if (!applied) throw new Error('Success evidence was not stored');
        process.kill(process.pid, 'SIGKILL');
      })().catch(error => { console.error(error); process.exit(1); });
    `,
        database,
      ],
      { encoding: 'utf8', timeout: 20000 }
    );
    assert.equal(child.error, undefined, child.stderr);
    assert.equal(child.signal, 'SIGKILL', child.stderr);
    assert.equal((await current()).state.saves[0].outcome, 'initialising');
    const result = await second.recoverPublicationIntents('brand', cutoff(), 10);
    assert.equal(result.ready, 1);
    assert.equal(result.quarantined, 0);
    assert.equal((await second.pendingPublicationIntents('brand', 10)).length, 1);
  });
});
