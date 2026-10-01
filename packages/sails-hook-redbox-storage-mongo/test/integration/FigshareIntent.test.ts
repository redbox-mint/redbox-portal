import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { Services } from '../../src/services/MongoStorageService';
import { RecordWriteConflict, type RecordWriteOptions } from '@researchdatabox/redbox-core';

if (process.env.CI === 'true' && !process.env.MONGO_TEST_URL) {
  throw new Error('CI requires MONGO_TEST_URL; atomic Figshare intent tests must not be skipped');
}
const describeMongo = process.env.MONGO_TEST_URL ? describe : describe.skip;
describeMongo('Atomic Figshare source intent and guarded record writes', function () {
  this.timeout(20000);
  let client: MongoClient;
  let service: Services.MongoStorageService;
  const database = `figshare_storage_${randomUUID().replaceAll('-', '')}`;
  const brand = { id: 'brand', name: 'brand', css: '', roles: [] };
  const request = (saveToken: string, kind: 'sync' | 'cleanup' = 'sync'): RecordWriteOptions => ({ figshareIntent: {
    saveToken, readiness: 'ready', requestedBy: 'researcher', intents: [{ kind, policyId: kind, condition: '' }]
  } });
  before(async () => {
    client = new MongoClient(process.env.MONGO_TEST_URL!); await client.connect();
    service = new Services.MongoStorageService(); service.recordCol = client.db(database).collection('record');
  });
  beforeEach(async () => {
    await service.recordCol.deleteMany({});
    await service.recordCol.insertOne({ redboxOid: 'record', recordVersion: 0, metadata: { title: 'original', figshare_article_id: '51' }, metaMetadata: { brandId: 'brand' }, workflow: { stage: 'queued' } });
  });
  after(async () => { await client.db(database).dropDatabase(); await client.close(); });
  it('commits source content and obligation together and atomically increments concurrent generations', async () => {
    await Promise.all(Array.from({ length: 15 }, (_, n) => service.updateMeta(brand, 'record', { metadata: { title: `save-${n}` } }, undefined, request(`save-${n}`))));
    const record = await service.recordCol.findOne({ redboxOid: 'record' });
    assert.equal(record!.figshareSyncIntent.generation, 15); assert.equal(record!.recordVersion, 15);
    assert.equal(record!.metadata.title, record!.figshareSyncIntent.saveToken);
    assert.equal((await service.pendingFigshareIntents(100)).length, 1);
  });
  it('paginates pending intents without skipping records when earlier entries remain pending', async () => {
    await service.recordCol.insertMany(['a', 'b', 'c'].map(redboxOid => ({ redboxOid, figshareSyncIntent: { pending: true, readiness: 'ready' } })));
    const first = await service.pendingFigshareIntents(2);
    const second = await service.pendingFigshareIntents(2, first[first.length - 1].redboxOid);
    assert.deepEqual(first.map(record => record.redboxOid), ['a', 'b']);
    assert.deepEqual(second.map(record => record.redboxOid), ['c']);
    assert.equal(await service.recordCol.countDocuments({ 'figshareSyncIntent.pending': true }), 3);
  });
  it('cannot erase or forge protected intent or version with ordinary snapshot writes', async () => {
    await service.updateMeta(brand, 'record', { metadata: { title: 'authorised' } }, undefined, request('one'));
    await service.updateMeta(brand, 'record', { figshareSyncIntent: { generation: 999, pending: false }, recordVersion: 999, metadata: { title: 'maintenance' } });
    const record = await service.recordCol.findOne({ redboxOid: 'record' });
    assert.equal(record!.figshareSyncIntent.generation, 1); assert.equal(record!.figshareSyncIntent.pending, true); assert.equal(record!.recordVersion, 2);
  });
  it('preserves simultaneous sync and cleanup obligations before import', async () => {
    await service.updateMeta(brand, 'record', {}, undefined, request('one'));
    await service.updateMeta(brand, 'record', {}, undefined, request('two', 'cleanup'));
    const record = await service.recordCol.findOne({ redboxOid: 'record' });
    assert.deepEqual(record!.figshareSyncIntent.intents.map((i: { kind: string }) => i.kind).sort(), ['cleanup', 'sync']);
    assert.equal(await service.acknowledgeFigshareIntent('record', 1), false);
    assert.equal(await service.acknowledgeFigshareIntent('record', 2), true);
  });
  it('hides incomplete create/finalisation work and only readies the matching save', async () => {
    const options = request('incomplete'); options.figshareIntent!.readiness = 'initialising';
    await service.updateMeta(brand, 'record', {}, undefined, options);
    assert.equal((await service.pendingFigshareIntents(10)).length, 0);
    assert.equal(await service.readyFigshareIntent('record', 'stale'), false);
    assert.equal(await service.readyFigshareIntent('record', 'incomplete'), true);
    assert.equal((await service.pendingFigshareIntents(10)).length, 1);
  });
  it('recovers only stale initialising intents left by an interrupted save', async () => {
    const options = request('interrupted'); options.figshareIntent!.readiness = 'initialising';
    await service.updateMeta(brand, 'record', {}, undefined, options);
    assert.equal(await service.recoverStaleFigshareIntents(new Date(Date.now() - 60000).toISOString()), 0);
    assert.equal((await service.pendingFigshareIntents(10)).length, 0);
    assert.equal(await service.recoverStaleFigshareIntents(new Date(Date.now() + 1000).toISOString()), 1);
    assert.equal((await service.pendingFigshareIntents(10)).length, 1);
  });
  it('rejects both primary and secondary background writes after an intervening user edit', async () => {
    await service.updateMeta(brand, 'record', { metadata: { title: 'user edit' } });
    await assert.rejects(service.updateMeta(brand, 'record', { metadata: { title: 'stale' } }, undefined, { expectedVersion: 0 }), RecordWriteConflict);
    const primary = await service.updateMeta(brand, 'record', { workflow: { stage: 'published' } }, undefined, { expectedVersion: 1 });
    assert.equal(primary.success, true);
    await service.updateMeta(brand, 'record', { metadata: { title: 'second user edit' } });
    await assert.rejects(service.updateMeta(brand, 'record', { metadata: { title: 'stale post hook' } }, undefined, { expectedVersion: Number(primary.metadata!.recordVersion) }), RecordWriteConflict);
    assert.equal((await service.recordCol.findOne({ redboxOid: 'record' }))!.metadata.title, 'second user edit');
  });
  it('projects only allowed fields and defers a stale projection without clobbering user data', async () => {
    const paths = ['metadata.figshare_article_id'];
    assert.equal((await service.setRecordFields('record', { 'metadata.figshare_article_id': '52' }, 0, paths)).updated, true);
    assert.equal((await service.setRecordFields('record', { 'metadata.figshare_article_id': '53' }, 0, paths)).updated, false);
    await assert.rejects(service.setRecordFields('record', { metadata: {} }, 1, paths), /Unsupported/);
    await assert.rejects(service.setRecordFields('record', { 'metadata.__proto__.polluted': true }, 1, ['metadata.__proto__.polluted']), /Unsupported/);
    assert.equal((await service.recordCol.findOne({ redboxOid: 'record' }))!.metadata.title, 'original');
  });
  it('documents the accepted master limit: a later ordinary stale save can undo a transition', async () => {
    await service.updateMeta(brand, 'record', { workflow: { stage: 'published' } }, undefined, { expectedVersion: 0 });
    await service.updateMeta(brand, 'record', { workflow: { stage: 'queued' } });
    assert.equal((await service.recordCol.findOne({ redboxOid: 'record' }))!.workflow.stage, 'queued');
  });
});
