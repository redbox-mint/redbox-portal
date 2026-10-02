import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { type RecordWriteOptions } from '@researchdatabox/redbox-core';
import { FigshareSyncStore } from '@researchdatabox/redbox-core/dist/services/figshare-v2/sync-store';

/** Runs with the lifted application and real configured core/record datastores. */
describe('Figshare durable intent integration', function () {
  this.timeout(30000);
  const created: string[] = [];
  let store: FigshareSyncStore;
  before(async () => {
    store = new FigshareSyncStore(FigshareSync.getDatastore().manager);
    await store.ensureIndexes();
  });
  after(async () => {
    const storage = RecordsService.getFigshareIntentStorage();
    for (const oid of created) { await store.collection.deleteOne({ oid }); await storage.delete(oid, true); }
  });
  it('persists an intent before queue submission, imports it once, and protects partial writes', async () => {
    const storage = RecordsService.getFigshareIntentStorage();
    const brand = BrandingService.getDefault();
    const options: RecordWriteOptions = { figshareIntent: { saveToken: randomUUID(), readiness: 'initialising', requestedBy: 'integration-test', intents: [{ kind: 'sync', policyId: 'test', condition: '' }] } };
    const response = await storage.create(brand, { metadata: { title: 'Figshare integration fixture' }, metaMetadata: { brandId: brand.id, type: 'rdmp' }, workflow: { stage: 'draft' }, authorization: {} }, {}, {}, options);
    assert.equal(response.success, true); created.push(response.oid);
    let record = await storage.getMeta(response.oid);
    assert.equal(record.figshareSyncIntent?.readiness, 'initialising');
    assert.equal(await storage.readyFigshareIntent!(response.oid, options.figshareIntent!.saveToken), true);
    record = await storage.getMeta(response.oid);
    await store.importSource(response.oid, String(brand.id), record.figshareSyncIntent!);
    await store.importSource(response.oid, String(brand.id), record.figshareSyncIntent!);
    assert.equal((await store.get(response.oid))?.work.sync.requested, 1);
    assert.equal(await storage.acknowledgeFigshareIntent!(response.oid, 1), true);
    const results = await Promise.all(['one', 'two'].map(owner => store.claim(response.oid, String(brand.id), owner, 30000)));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal((await storage.setRecordFields!(response.oid, { 'metadata.figshare_article_id': '51' }, record.recordVersion ?? 0, ['metadata.figshare_article_id'])).updated, true);
    assert.equal((await storage.setRecordFields!(response.oid, { 'metadata.figshare_article_id': '52' }, record.recordVersion ?? 0, ['metadata.figshare_article_id'])).updated, false);
    assert.equal((await storage.getMeta(response.oid)).metadata.title, 'Figshare integration fixture');
  });
});
