import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Db, MongoClient as MongoClientType } from 'mongodb';
import type { FigshareSyncModel, FigshareSourceIntent } from '../../src/model/storage/FigshareSyncModel';
import type { FigsharePublishingConfigData } from '../../src/configmodels/FigsharePublishing';

const requireTest = createRequire(import.meta.url);
const { createMockSails } = requireTest('./testHelper');
const { MongoClient } = requireTest('mongodb');
const { FigshareSyncStore, FigshareLeaseLost } = requireTest('../../src/services/figshare-v2/sync-store');
const { FigsharePublishing } = requireTest('../../src/configmodels/FigsharePublishing');
const { Services } = requireTest('../../src/services/FigshareService');
const { runFigshareWorker, importRecordIntent, dispatchFigshare } = requireTest('../../src/services/figshare-v2/worker');
const { mapCreateArticleResponse, makeLiveClient } = requireTest('../../src/services/figshare-v2/http');
const { resolveCreationOwner } = requireTest('../../src/services/figshare-v2/identity');
const { figshareExecution } = requireTest('../../src/services/figshare-v2/execution');
const { prepareSourceIntent, currentExecutionEligible } = requireTest('../../src/services/figshare-v2/source-intent');

const { figshareAdmin } = requireTest('../../src/services/figshare-v2/admin');
const { legacyDelayMs } = requireTest('../../src/services/figshare-v2/config');

const intent = (generation = 1): FigshareSourceIntent => ({ generation, pending: true, readiness: 'ready', saveToken: `save-${generation}`,
  requestedAt: new Date().toISOString(), requestedBy: 'researcher', intents: [{ kind: 'sync', policyId: 'onUpdate.pre.0', condition: '<%= record.workflow.stage === "queued" %>' }] });

describe('Figshare queued contracts', () => {
  it('preserves legacy relative delays and requires explicit settings for ambiguous phrases', () => {
    assert.equal(legacyDelayMs('in 2 minutes'), 120000);
    assert.equal(legacyDelayMs('in 3 days'), 259200000);
    assert.throws(() => legacyDelayMs('sometime tomorrow'), /configure processing/);
  });
  it('uses current configured eligibility and does not retain a removed source policy', () => {
    const policies = intent().intents;
    const record = { workflow: { stage: 'queued' } };
    const hook = { function: 'validateFigshareRecord', options: { executionCondition: '<%= record.workflow.stage === "queued" %>' } };
    assert.equal(currentExecutionEligible({ hooks: { onUpdate: { pre: [hook] } } }, policies, 'oid', record), true);
    hook.options.executionCondition = '<%= false %>';
    assert.equal(currentExecutionEligible({ hooks: { onUpdate: { pre: [hook] } } }, policies, 'oid', record), false);
    assert.equal(currentExecutionEligible({ hooks: {} }, policies, 'oid', record), false);
  });
  it('parses every supported create response identity without relying on the title', () => {
    for (const response of [{ data: { id: 51 } }, { data: { entity_id: 51 } }, { data: { location: 'https://api.figshare.com/v2/account/articles/51' } }, { headers: { location: 'https://api.figshare.com/v2/account/articles/51' } }]) {
      assert.equal(String(mapCreateArticleResponse(response).id), '51');
    }
  });
  it('uses the institutional account ID, never the different author user_id', async () => {
    const config = new FigsharePublishing(); config.impersonation.enabled = true;
    const client = { searchInstitutionAccounts: async () => [{ id: 101, user_id: 909, institution_user_id: 'ci-1', email: 'ci@example.org' }] };
    assert.equal(await resolveCreationOwner(client, config, { metadata: { contributor_ci: { dc_identifier: 'ci-1', email: 'ci@example.org' } } }, '1'), '101');
    await assert.rejects(resolveCreationOwner(client, config, { metadata: { contributor_ci: { dc_identifier: 'wrong', email: 'ci@example.org' } } }, '1'), /exactly one/);
    await assert.rejects(resolveCreationOwner(client, config, { metadata: { contributor_ci: { dc_identifier: 'ci-1', email: 'other@example.org' } } }, '1'), /Conflicting/);
    config.impersonation.allowEmailFallback = true;
    assert.equal(await resolveCreationOwner(client, config, { metadata: { contributor_ci: { email: 'ci@example.org' } } }, '1'), '101');
  });
});

const mongoDescribe = process.env.FIGSHARE_TEST_MONGO_URI ? describe : describe.skip;
mongoDescribe('Figshare durable worker against Mongo and controlled HTTP', function () {
  this.timeout(20000);
  let connection: MongoClientType;
  let db: Db;
  let store: InstanceType<typeof FigshareSyncStore>;
  let server: Server;
  let config: FigsharePublishingConfigData;
  let service: InstanceType<typeof Services.FigshareService>;
  let articles: Array<Record<string, unknown>>;
  let requests: Array<{ method: string; path: string; body: Record<string, unknown>; query: URLSearchParams; authorization?: string }>;
  let createFailure: number | undefined;
  let publishFailure: number | undefined;
  let published = false;
  let hideArticles = false;
  let traceStarts = 0;
  let traceFailures = 0;
  let traceCompletions = 0;
  let mutateOnUpdate: (() => Promise<void>) | undefined;
  const savedGlobals = new Map<string, unknown>();
  function assignGlobals(values: Record<string, unknown>) {
    for (const [key, value] of Object.entries(values)) { if (!savedGlobals.has(key)) savedGlobals.set(key, Reflect.get(globalThis, key)); Reflect.set(globalThis, key, value); }
  }
  async function seed(generation = 1) {
    const record = { redboxOid: 'record-1', recordVersion: generation, metadata: { title: `title-${generation}`, description: 'test', dataLocations: [] },
      metaMetadata: { brandId: 'brand-1', type: 'dataPublication' }, workflow: { stage: 'queued' }, authorization: {}, figshareSyncIntent: intent(generation) };
    await db.collection('records').replaceOne({ redboxOid: record.redboxOid }, record, { upsert: true });
    return record;
  }
  const job = { attrs: { data: { oid: 'record-1', brandId: 'brand-1' } } };
  async function run() { await runFigshareWorker(service, job, store); }
  before(async () => {
    connection = new MongoClient(process.env.FIGSHARE_TEST_MONGO_URI!); await connection.connect();
    db = connection.db(`figshare_queued_test_${process.pid}`);
    server = createServer(async (req, res) => {
      const url = new URL(req.url!, 'http://localhost');
      const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = chunks.length && String(req.headers['content-type']).includes('application/json') ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      requests.push({ method: req.method!, path: url.pathname, body, query: url.searchParams, authorization: req.headers.authorization });
      res.setHeader('Content-Type', 'application/json');
      const send = (value: unknown, status = 200) => { res.statusCode = status; res.end(JSON.stringify(value)); };
      if (url.pathname.startsWith('/upload/')) return send({});
      if (url.pathname === '/account') return send({ id: 1, user_id: 999 });
      if (url.pathname === '/account/institution/accounts/search') return send([{ id: 101, user_id: 909, institution_user_id: 'ci-1', email: 'ci@example.org' }]);
      if (url.pathname === '/account/licenses') return send([]);
      if (url.pathname === '/account/articles' && req.method === 'POST') {
        const article = { ...body, id: articles.length + 51, account_id: body.impersonate ?? 1, files: [], version: 1, is_public: false };
        articles.push(article);
        return createFailure ? send({ message: 'controlled hidden creation' }, createFailure) : send({ entity_id: article.id }, 201);
      }
      if (url.pathname === '/account/articles') return send(url.searchParams.get('page') === '1' && !hideArticles ? articles : []);
      const id = Number(/\/articles\/(\d+)/.exec(url.pathname)?.[1]);
      const article = articles.find(a => a.id === id);
      if (!article) return send({}, 404);
      if (/\/files\/\d+$/.test(url.pathname)) return send((article.files as Array<Record<string, unknown>>).find(f => String(f.id) === url.pathname.split('/').pop()) ?? {});
      if (url.pathname.endsWith('/files')) return send(article.files);
      if (url.pathname.endsWith('/publish')) {
        if (publishFailure) return send({ code: 'BadRequest', message: 'Missing mandatory value: Central Queensland University ROR' }, publishFailure);
        article.is_public = published; if (published) { article.published_date = '2026-01-01'; article.version = Number(article.version) + 1; } return send({});
      }
      if (req.method === 'PUT') { Object.assign(article, body); if (mutateOnUpdate) { const callback = mutateOnUpdate; mutateOnUpdate = undefined; await callback(); } return send({}); }
      return send(article);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  });
  beforeEach(async () => {
    await db.dropDatabase(); store = new FigshareSyncStore(db); await store.ensureIndexes();
    articles = []; requests = []; createFailure = undefined; publishFailure = undefined; published = false; hideArticles = false; mutateOnUpdate = undefined;
    traceStarts = 0; traceFailures = 0; traceCompletions = 0;
    config = new FigsharePublishing(); config.enabled = true;
    config.processing = { ...config.processing!, enabled: true, serviceUsername: 'service', serviceUserType: 'local' };
    config.connection.baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    config.connection.token = 'test-token'; config.connection.retry.maxAttempts = 1;
    config.metadata.license.required = false; config.categories.allowUnmapped = true; config.authors.contributorPaths = [];
    config.embargo.mode = 'none'; config.article.publishMode = 'afterUploadsComplete';
    const records = db.collection('records');
    const storage = {
      acknowledgeFigshareIntent: async (oid: string, generation: number) => (await records.updateOne({ redboxOid: oid, 'figshareSyncIntent.generation': generation }, { $set: { 'figshareSyncIntent.pending': false } })).matchedCount === 1,
      pendingFigshareIntents: async () => records.find({ 'figshareSyncIntent.pending': true, 'figshareSyncIntent.readiness': 'ready' }).toArray(),
      scanFigshareRecords: async () => records.find({}).toArray(),
      findFigshareArticleRecords: async (path: string, id: string) => records.find({ [path]: id }).toArray()
    };
    assignGlobals({
      sails: createMockSails(),
      AppConfigService: { getAppConfigurationForBrand: () => ({ figsharePublishing: config }) },
      BrandingService: { getBrandById: () => ({ id: 'brand-1', name: 'brand' }), getBrand: () => ({ id: 'brand-1', name: 'brand' }) },
      RecordTypesService: { get: () => ({ toPromise: async () => ({ hooks: { onUpdate: { pre: [{ function: 'sails.services.figshareservice.validateFigshareRecord', options: { triggerCondition: '<%= record.workflow.stage === "queued" %>' } }] } } }) }) },
      RolesService: { getAdminFromRoles: () => true },
      AgendaQueueService: { now: async () => {} },
      UsersService: { getUserWithUsername: () => ({ toPromise: async () => ({ username: 'service', type: 'local', roles: [] }) }) },
      RecordsService: { getMeta: (oid: string) => records.findOne({ redboxOid: oid }), getFigshareIntentStorage: () => storage,
        hasEditAccess: async () => true,
        setRecordFields: async (oid: string, fields: Record<string, unknown>, version: number) => ({ updated: (await records.updateOne({ redboxOid: oid, recordVersion: version }, { $set: fields, $inc: { recordVersion: 1 } })).matchedCount === 1 }) },
      IntegrationAuditService: {
        startAudit: () => { traceStarts++; return { traceId: `trace-${traceStarts}`, spanId: 'span', startedAt: new Date().toISOString() }; },
        completeAudit: () => { traceCompletions++; }, failAudit: () => { traceFailures++; }
      },
      FigshareSync: { getDatastore: () => ({ manager: db }) }
    });
    service = new Services.FigshareService(); await seed();
  });
  after(async () => {
    for (const [key, value] of savedGlobals) { if (value === undefined) Reflect.deleteProperty(globalThis, key); else Reflect.set(globalThis, key, value); }
    await db.dropDatabase(); await connection.close(); await new Promise<void>(resolve => server.close(() => resolve()));
  });
  it('allows one claim, rejects stale owners, and preserves new requests at completion', async () => {
    await Promise.all(Array.from({ length: 10 }, () => store.initialise('record-1', 'brand-1')));
    await store.importSource('record-1', 'brand-1', intent());
    const claims = await Promise.all(['a', 'b', 'c'].map(owner => store.claim('record-1', 'brand-1', owner, 5000)));
    assert.equal(claims.filter(Boolean).length, 1);
    const owner = claims.find(Boolean)!.leaseOwner!;
    await assert.rejects(store.change('record-1', () => {}, 'wrong'), FigshareLeaseLost);
    await store.importSource('record-1', 'brand-1', intent(2));
    await store.change('record-1', (s: FigshareSyncModel) => { s.work.sync.processed = 1; }, owner);
    const state = await store.get('record-1'); assert.equal(state.work.sync.requested, 2); assert.ok(state.work.sync.dueAt);
  });
  it('recovers dropped queue delivery and bounds dispatcher duplication without consuming work', async () => {
    let deliveries = 0;
    assignGlobals({ AgendaQueueService: { now: async () => { deliveries++; if (deliveries === 1) throw new Error('queue unavailable'); } } });
    await dispatchFigshare();
    assert.equal((await store.get('record-1')).work.sync.processed, 0);
    await dispatchFigshare(); assert.equal(deliveries, 1);
    await store.change('record-1', (s: FigshareSyncModel) => { s.dispatchUntil = 0; });
    await dispatchFigshare(); assert.equal(deliveries, 2);
    await run(); assert.equal(articles.length, 1);
  });
  it('stops after losing its lease during an HTTP call and lets the successor reconcile', async () => {
    mutateOnUpdate = async () => { await store.collection.updateOne({ oid: 'record-1' }, { $set: { leaseOwner: 'successor', leaseUntil: Date.now() + 60000 }, $inc: { revision: 1 } }); };
    await run();
    assert.equal(requests.filter(r => r.path.endsWith('/publish')).length, 0);
    assert.equal((await store.get('record-1')).leaseOwner, 'successor');
    await store.release('record-1', 'successor');
    await run();
    assert.equal(articles.length, 1); assert.equal(requests.filter(r => r.path.endsWith('/publish')).length, 1);
  });
  it('renews leases and queue visibility throughout a slow remote phase', async () => {
    config.processing!.heartbeatMs = 20; config.processing!.leaseMs = 200;
    let touches = 0;
    mutateOnUpdate = async () => { await new Promise(resolve => setTimeout(resolve, 300)); };
    await runFigshareWorker(service, { ...job, touch: async () => { touches++; } }, store);
    assert.ok(touches >= 3); assert.equal(articles.length, 1);
    assert.equal(requests.filter(r => r.path.endsWith('/publish')).length, 1);
  });
  it('inspects and migrates read-only by default, and rejects wrong-context repairs', async () => {
    await run();
    const before = await store.get('record-1');
    await figshareAdmin({ action: 'inspect', oid: 'record-1', username: 'admin' });
    await figshareAdmin({ action: 'link', oid: 'record-1', articleId: '51', username: 'admin' });
    assert.deepEqual(await store.get('record-1'), before);
    await store.change('record-1', (s: FigshareSyncModel) => { s.binding!.accountId = '999'; });
    await assert.rejects(figshareAdmin({ action: 'resume', oid: 'record-1', username: 'admin', apply: true }), /differs from the persisted binding/);
  });
  it('quarantines uncertain legacy creates and never creates during repeated migration', async () => {
    await db.collection('records').updateOne({ redboxOid: 'record-1' }, { $set: { 'metadata.figshareSyncState': { status: 'syncing' } } });
    await figshareAdmin({ action: 'migrate', username: 'admin' });
    assert.equal(await store.get('record-1'), null);
    await figshareAdmin({ action: 'migrate', username: 'admin', apply: true });
    await figshareAdmin({ action: 'migrate', username: 'admin', apply: true });
    assert.equal((await store.get('record-1')).status, 'repair_required'); assert.equal(articles.length, 0);
    await run(); assert.equal(articles.length, 0);
  });
  it('excludes unbound rows from exclusive namespace/article binding and prevents owner-based duplicates', async () => {
    await store.initialise('a', 'brand-1'); await store.initialise('b', 'brand-1');
    await store.change('a', (s: FigshareSyncModel) => { s.namespace = 'api'; s.articleId = '51'; });
    await assert.rejects(store.change('b', (s: FigshareSyncModel) => { s.namespace = 'api'; s.articleId = '51'; }), /duplicate key/);
  });
  it('replays imported generations idempotently after an acknowledgment crash', async () => {
    const record = await seed(); await store.importSource('record-1', 'brand-1', record.figshareSyncIntent);
    await importRecordIntent(store, record); await importRecordIntent(store, record);
    assert.equal((await store.get('record-1')).work.sync.requested, 1);
  });
  it('coalesces duplicate deliveries into one create and one publish', async () => {
    await Promise.all([run(), run(), run()]);
    assert.equal(articles.length, 1); assert.equal(requests.filter(r => r.path.endsWith('/publish')).length, 1);
    assert.equal((await store.get('record-1')).binding.articleId, '51');
    await run(); assert.equal(articles.length, 1); assert.equal(traceStarts, 1); assert.equal(traceFailures, 0);
  });
  it('recovers an article hidden behind HTTP 400, retains failure, and updates it after correction', async () => {
    createFailure = 400; await run();
    let state = await store.get('record-1'); assert.equal(state.status, 'failed'); assert.equal(state.binding.articleId, '51'); assert.equal(state.create.outcome, 'failed');
    assert.equal(traceFailures, 1); assert.equal(requests.filter(r => r.method === 'PUT').length, 0);
    createFailure = undefined; await seed(2); await run();
    state = await store.get('record-1'); assert.equal(articles.length, 1); assert.equal(articles[0].title, 'title-2'); assert.equal(state.create.outcome, 'failed');
    assert.equal(traceStarts, 2); assert.equal(traceCompletions, 1);
  });
  it('reuses its article after a rejected publish and retries only after a corrected source save', async () => {
    publishFailure = 400;
    await run();
    let state = await store.get('record-1');
    assert.equal(state.status, 'failed');
    assert.equal(state.publish.outcome, 'rejected');
    assert.equal(state.binding.articleId, '51');
    assert.equal(articles.length, 1);

    publishFailure = undefined;
    await seed(2);
    await run();
    state = await store.get('record-1');
    assert.equal(articles.length, 1);
    assert.equal(articles[0].title, 'title-2');
    assert.equal(requests.filter(r => r.path.endsWith('/publish')).length, 2);
    assert.equal(state.status, 'waiting');
    assert.equal(state.publish.outcome, 'accepted');
  });
  it('does not publish a generation superseded during metadata update', async () => {
    mutateOnUpdate = async () => { await seed(2); };
    await run(); assert.equal(requests.filter(r => r.path.endsWith('/publish')).length, 0);
    await run(); assert.equal(articles.length, 1); assert.equal(articles[0].title, 'title-2'); assert.equal(requests.filter(r => r.path.endsWith('/publish')).length, 1);
  });
  it('waits quietly for days of review without repeating publish or creating audit traces', async () => {
    await run();
    for (let day = 0; day < 20; day++) {
      await store.change('record-1', (s: FigshareSyncModel) => { s.work.observe.dueAt = Date.now() - 1; });
      await run();
    }
    assert.equal(traceStarts, 1); assert.equal(traceFailures, 0); assert.equal(traceCompletions, 1);
    assert.equal(requests.filter(r => r.path.endsWith('/publish')).length, 1);
    assert.equal((await store.get('record-1')).waitingReason, 'review');
  });
  it('does no work for an incomplete create save', async () => {
    await db.collection('records').updateOne({ redboxOid: 'record-1' }, { $set: { 'figshareSyncIntent.readiness': 'initialising' } });
    await run(); assert.equal(requests.length, 0); assert.equal(articles.length, 0);
  });
  it('keeps cleanup-only intent from authorising metadata or publication', async () => {
    const source = intent(); source.intents = [{ kind: 'cleanup', policyId: 'cleanup', condition: '' }];
    await db.collection('records').updateOne({ redboxOid: 'record-1' }, { $set: { figshareSyncIntent: source } });
    await run(); assert.equal(requests.filter(r => r.method !== 'GET').length, 0);
  });
  it('creates as the researcher but updates and publishes with the token account', async () => {
    config.impersonation = { ...new FigsharePublishing().impersonation, enabled: true };
    await db.collection('records').updateOne({ redboxOid: 'record-1' }, { $set: { 'metadata.contributor_ci': { dc_identifier: 'ci-1', email: 'ci@example.org' } } });
    await run();
    const create = requests.find(r => r.method === 'POST' && r.path === '/account/articles')!;
    assert.equal(create.body.impersonate, '101');
    for (const request of requests.filter(r => r.method === 'PUT' || r.path.endsWith('/publish'))) assert.equal(request.body.impersonate, undefined);
    const recoveredReads = requests.filter(r => r.method === 'GET' && r.query.has('impersonate'));
    assert.ok(recoveredReads.some(r => r.query.get('impersonate') === '101'));
  });
  it('places owner identity in GET/DELETE queries and JSON bodies, leaving uploader traffic untouched', async () => {
    config.impersonation = { ...new FigsharePublishing().impersonation, enabled: true, operations: { create: 'owner', recovery: 'owner', read: 'owner', metadata: 'owner', assets: 'owner', embargo: 'owner', publish: 'owner' } };
    articles.push({ id: 51, title: 'article', files: [{ id: 11 }] });
    const client = makeLiveClient(config, { oid: 'record-1', brandId: 'brand-1', correlationId: 'transport', triggerSource: 'test' });
    await figshareExecution.run({ binding: { namespace: config.connection.baseUrl, accountId: '1', ownerId: '101', articleId: '51' }, signal: new AbortController().signal,
      guard: async () => {}, metadata: async (_id: string, payload: unknown, send: (value: unknown) => Promise<unknown>) => send(payload)
    }, async () => {
      await client.getArticle('51'); await client.deleteArticleFile('51', '11'); await client.updateArticle('51', { title: 'updated' });
      await client.uploadFilePart(`${config.connection.baseUrl}/upload/token`, 1, Buffer.from('binary payload'));
    });
    for (const request of requests.filter(r => ['GET', 'DELETE'].includes(r.method))) assert.equal(request.query.get('impersonate'), '101');
    assert.equal(requests.find(r => r.method === 'PUT' && r.path.includes('/account/'))!.body.impersonate, '101');
    const upload = requests.find(r => r.path.startsWith('/upload/'))!;
    assert.equal(upload.query.has('impersonate'), false); assert.equal(upload.authorization, undefined);
  });
  it('recovers under the original owner after delayed visibility and a changed CI', async () => {
    config.impersonation = { ...new FigsharePublishing().impersonation, enabled: true };
    await db.collection('records').updateOne({ redboxOid: 'record-1' }, { $set: { 'metadata.contributor_ci': { dc_identifier: 'ci-1' } } });
    createFailure = 400; hideArticles = true; await run();
    assert.equal((await store.get('record-1')).binding.articleId, undefined);
    createFailure = undefined; hideArticles = false; await seed(2);
    await db.collection('records').updateOne({ redboxOid: 'record-1' }, { $set: { 'metadata.contributor_ci': { dc_identifier: 'different-ci' } } });
    await run();
    assert.equal(articles.length, 1); assert.equal((await store.get('record-1')).binding.ownerId, '101');
    assert.ok(requests.some(r => r.path === '/account/articles' && r.method === 'GET' && r.query.get('impersonate') === '101'));
  });
  it('requires matching file evidence and a free lease for an explicit upload repair', async () => {
    await run();
    const md5 = '0123456789abcdef0123456789abcdef';
    articles[0].files = [{ id: 11, size: 10, status: 'created', supplied_md5: md5 }];
    await store.change('record-1', (s: FigshareSyncModel) => { s.receipts.push({ key: 'receipt', articleId: '51', localId: 'local', digest: 'sha256', md5, size: 10, name: 'data', kind: 'hosted', state: 'initialising', desired: true }); });
    await assert.rejects(figshareAdmin({ action: 'bind-file', username: 'admin', oid: 'record-1', receipt: 'receipt', fileId: '11', apply: true }), /resume-upload/);
    await figshareAdmin({ action: 'resume-upload', username: 'admin', oid: 'record-1', receipt: 'receipt', fileId: '11' });
    assert.equal((await store.get('record-1')).receipts[0].fileId, undefined);
    await figshareAdmin({ action: 'resume-upload', username: 'admin', oid: 'record-1', receipt: 'receipt', fileId: '11', apply: true });
    assert.equal((await store.get('record-1')).receipts[0].resumeApproved, true);
    await store.claim('record-1', 'brand-1', 'running', 60000);
    await assert.rejects(figshareAdmin({ action: 'resume-upload', username: 'admin', oid: 'record-1', receipt: 'receipt', fileId: '11', apply: true }), /active worker/);
  });
  it('shows unimported work and terminal sync failure without exposing operation identities', async () => {
    const { figshareLiveSummary } = requireTest('../../src/services/figshare-v2/status');
    let record: Record<string, unknown> = await seed();
    let summary = await figshareLiveSummary('record-1', record);
    assert.equal(summary.outcome.state, 'queued');
    await run();
    await store.change('record-1', (s: FigshareSyncModel) => {
      s.work.sync.requested++; s.status = 'waiting'; s.error = { category: 'repair', message: 'needs repair', count: 1, firstAt: '', lastAt: '', terminal: true };
    });
    record = (await db.collection('records').findOne({ redboxOid: 'record-1' }))!;
    summary = await figshareLiveSummary('record-1', record);
    assert.equal(summary.outcome.state, 'repair_required');
    for (const secret of ['ownerId', 'accountId', 'token', 'receipts']) assert.equal(JSON.stringify(summary).includes(secret), false);
  });
  it('observes manual publication once and does not submit or grow audit history on later polls', async () => {
    config.article.publishMode = 'manual'; await run();
    assert.equal(requests.filter(r => r.path.endsWith('/publish')).length, 0);
    Object.assign(articles[0], { is_public: true, published_date: '2026-01-01', version: 2 });
    for (let observation = 0; observation < 5; observation++) {
      await store.change('record-1', (s: FigshareSyncModel) => { s.work.observe.requested++; s.work.observe.dueAt = Date.now() - 1; });
      await run();
    }
    assert.equal((await store.get('record-1')).status, 'synced'); assert.equal(traceStarts, 2); assert.equal(traceFailures, 0);
    assert.equal(requests.filter(r => r.path.endsWith('/publish')).length, 0);
  });
  it('freezes every mutation while the configured curation lock is present', async () => {
    await run();
    config.article.curationLock = { enabled: true, statusField: 'status', targetValue: 'curating' };
    articles[0].status = 'curating'; await seed(2); const before = requests.filter(r => r.method !== 'GET').length;
    await run(); assert.equal(requests.filter(r => r.method !== 'GET').length, before);
    assert.ok(['curation', 'publication_confirmation'].includes((await store.get('record-1')).waitingReason));
  });
  it('separates source actor authorization from execution conditions and maintenance writes', async () => {
    const record = await seed();
    const recordType = { hooks: { onUpdate: { pre: [{ function: 'sails.services.figshareservice.validateFigshareRecord', options: {
      triggerCondition: '<%= user.username === "researcher" %>', executionCondition: '<%= record.workflow.stage === "queued" %>'
    } }] } } };
    const prepared = prepareSourceIntent(record, recordType, ['onUpdate'], { username: 'researcher' }, false);
    assert.equal(prepared.intents.length, 1); assert.equal(prepared.requestedBy, 'researcher');
    assert.equal(prepareSourceIntent(record, recordType, ['onUpdate'], { username: 'service' }, false).intents.length, 0);
    assert.equal(prepareSourceIntent(record, recordType, ['onUpdate'], { username: 'researcher' }, false, true), undefined);
  });
});
