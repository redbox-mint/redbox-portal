import { publicationEvidenceFields, withPublicationEvidenceMismatch } from '../fixtures/publicationEvidence';
import { publicationOperationIdempotencyKey } from '@researchdatabox/redbox-core/dist/services/publication/operations';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { MongoClient } from 'mongodb';
import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import {
  PublicationPublishing,
  PublicationLeaseLost,
  FigsharePublishing,
  PublicationProviderRegistry,
  PublicationSyncStore,
  PublicationResourceStore,
  PublicationStaging,
  publicationContentRecord,
  publicationDigest,
  publicationRecordDigest,
  sealPublicationSource,
  reopenPublicationSource,
  runPublicationWorker,
  administerPublication,
  importPublicationIntents,
  applyPublicationContentReplacement,
  cleanupPublicationAttachments,
  PublicationStagingFence,
  publicationOriginalReference,
  dispatchPublications,
  PUBLICATION_COMPLETION_FENCE,
  publicationCompletionReference,
  verifyPublicationInputs,
  migratePublication,
  migrationJson,
  type PublicationObject,
  type PublicationApproval,
  type PublicationSnapshot,
  type PublicationDispatcherRuntime,
  type PublicationWorkKey,
} from '@researchdatabox/redbox-core';
import { Services as FigshareServices } from '@researchdatabox/redbox-core/dist/services/FigshareService';
import { Services as PublicationServices } from '@researchdatabox/redbox-core/dist/services/PublicationService';
import { Services as VocabularyServices } from '@researchdatabox/redbox-core/dist/services/FigshareVocabularyService';
import { createFigsharePublicationProvider } from '@researchdatabox/redbox-core/dist/services/figshare-v2/publication-adapter';
import { prepareFigshareSource } from '@researchdatabox/redbox-core/dist/services/figshare-v2/publication-source';
import {
  emptyFigshareEvidence,
  decodeFigshareLegacy,
} from '@researchdatabox/redbox-core/dist/services/figshare-v2/publication-state';
import { isPublicationObject } from '@researchdatabox/redbox-core/dist/services/publication/builtins';
import type { FigsharePublicationPlan } from '@researchdatabox/redbox-core/dist/services/figshare-v2/types';
import type { ResolvedFigsharePublishingConfigData } from '@researchdatabox/redbox-core/dist/services/figshare-v2/config';
import type { RecordModel } from '@researchdatabox/redbox-core';
import { Services } from '../../src/services/MongoStorageService';
import { storage } from '../../src/config/storage';

if (process.env.CI && !process.env.MONGO_TEST_URL) throw new Error('CI requires MONGO_TEST_URL for PUB-09');
const describeMongo = process.env.MONGO_TEST_URL ? describe : describe.skip;
describeMongo('Figshare adapter through shared publication worker (PUB-09, real Mongo and HTTP)', function () {
  this.timeout(30000);
  const database = `publication_figshare_${randomUUID().replaceAll('-', '')}`;
  const key: PublicationWorkKey = { brandId: 'brand', oid: 'record', destinationId: 'main' };
  const brand = { id: 'brand', name: 'brand', css: '', roles: [] };
  const globals = new Map<string, unknown>();
  let mongoClient: MongoClient;
  let mongo: Services.MongoStorageService;
  let server: Server;
  let url: string;
  let directory: string;
  let disk: Disk;
  let staging: PublicationStaging;
  let config: PublicationPublishing;
  let service: FigshareServices.FigshareService;
  let runtime: PublicationDispatcherRuntime;
  let clock: number;
  let articles: PublicationObject[];
  let requests: Array<{
    method: string;
    path: string;
    body: PublicationObject;
    query: URLSearchParams;
    token?: string;
  }>;
  let createFailure: boolean;
  let hidden: boolean;
  let publishLost: boolean;
  let embargoLost: boolean;
  let publishNow: boolean;
  let afterUpdate: (() => Promise<void>) | undefined;
  let afterCreate: (() => Promise<void>) | undefined;
  let afterFileInit: (() => Promise<void>) | undefined;
  let failPartOnce: boolean;
  let bytes: Buffer;
  let partBytes: Map<string, Buffer>;
  let previousStorage: unknown;
  let previousRecordConfig: unknown;
  let previousDatastream: unknown;
  let localRemoved = false;
  const assign = (name: string, value: unknown) => {
    if (!globals.has(name)) globals.set(name, Reflect.get(globalThis, name));
    Reflect.set(globalThis, name, value);
  };
  const hashes = (data: Buffer) => ({
    sha: createHash('sha256').update(data).digest('hex'),
    md5: createHash('md5').update(data).digest('hex'),
  });
  before(async () => {
    mongoClient = new MongoClient(process.env.MONGO_TEST_URL!);
    await mongoClient.connect();
    const db = mongoClient.db(database);
    await db.createCollection('record');
    for (const name of [
      'Record',
      'DeletedRecord',
      'RecordAudit',
      'IntegrationAudit',
      'RecordSchemaArtifact',
      'RecordSchemaReference',
    ])
      assign(name, {
        tableName: name.toLowerCase(),
        getDatastore: () => ({ manager: db }),
        findOne: (criteria: Record<string, unknown>) => db.collection(name.toLowerCase()).findOne(criteria),
      });
    for (const name of [
      'VocabularyEntry',
      'FigshareVocabularyCrosswalk',
      'FigshareVocabularySource',
      'FigshareVocabularyCategory',
      'FigshareVocabularyCrosswalkMapping',
    ])
      assign(name, {
        findOne: (criteria: Record<string, unknown>) => db.collection(name.toLowerCase()).findOne(criteria),
        find: (criteria: Record<string, unknown>) =>
          db
            .collection(name.toLowerCase())
            .find(
              Object.fromEntries(
                Object.entries(criteria).map(([field, value]) => [field, Array.isArray(value) ? { $in: value } : value])
              )
            )
            .toArray(),
      });
    assign('FigshareVocabularyService', new VocabularyServices.FigshareVocabularyService().exports());
    const sails = Reflect.get(globalThis, 'sails');
    previousStorage = sails.config.storage;
    previousRecordConfig = sails.config.record;
    previousDatastream = sails.services.testDatastream;
    sails.config.storage = storage;
    mongo = new Services.MongoStorageService();
    await mongo.init();
    directory = await mkdtemp(join(tmpdir(), 'pub09-figshare-'));
    disk = new Disk(new FSDriver({ location: directory, visibility: 'private' }));
    staging = new PublicationStaging('durable', disk, new PublicationStagingFence(db));
    server = createServer(async (req, res) => {
      try {
        const target = new URL(req.url!, 'http://localhost');
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const content = Buffer.concat(chunks);
        const parsed: unknown =
          content.length && String(req.headers['content-type']).includes('application/json')
            ? JSON.parse(content.toString())
            : {};
        assert.ok(isPublicationObject(parsed));
        const body = parsed;
        requests.push({
          method: req.method!,
          path: target.pathname,
          body,
          query: target.searchParams,
          token: req.headers.authorization,
        });
        res.setHeader('Content-Type', 'application/json');
        const send = (value: unknown, status = 200) => {
          res.statusCode = status;
          res.end(JSON.stringify(value));
        };
        if (target.pathname === '/account') return send({ id: 1, user_id: 999 });
        if (target.pathname === '/account/licenses') return send([{ id: 1, value: 1, name: 'Open' }]);
        if (target.pathname === '/account/institution/accounts/search')
          return send([{ id: 101, user_id: 909, institution_user_id: 'ci', email: 'ci@example.test' }]);
        if (target.pathname === '/account/articles' && req.method === 'POST') {
          const article: PublicationObject = {
            ...body,
            id: articles.length + 51,
            account_id: body.impersonate ?? 1,
            files: [],
            version: 1,
            is_public: false,
          };
          articles.push(article);
          if (afterCreate) {
            const callback = afterCreate;
            afterCreate = undefined;
            await callback();
          }
          return createFailure
            ? send({ message: 'created despite response failure' }, 400)
            : send({ entity_id: article.id }, 201);
        }
        if (target.pathname === '/account/articles')
          return send(!hidden && target.searchParams.get('page') === '1' ? articles : []);
        const upload = /^\/upload\/(\d+)(?:\/(\d+))?$/.exec(target.pathname);
        if (upload) {
          if (req.method === 'PUT') {
            partBytes.set(upload[1], content);
            if (failPartOnce) {
              failPartOnce = false;
              req.socket.destroy();
              return;
            }
            return send({ accepted: true });
          }
          return send({
            parts: [
              {
                partNo: 1,
                startOffset: 0,
                endOffset: bytes.length - 1,
                status: partBytes.has(upload[1]) ? 'COMPLETE' : 'PENDING',
              },
            ],
          });
        }
        const id = Number(/\/articles\/(\d+)/.exec(target.pathname)?.[1]);
        const article = articles.find(value => value.id === id);
        if (!article) return send({}, 404);
        assert.ok(Array.isArray(article.files));
        const files = article.files.filter(isPublicationObject);
        const filePath = /\/files\/(\d+)$/.exec(target.pathname);
        if (filePath) {
          const file = files.find(value => String(value.id) === filePath[1]);
          if (!file) return send({}, 404);
          if (req.method === 'DELETE') {
            article.files = files.filter(value => value !== file);
            return send({ deleted: true });
          }
          if (req.method === 'POST') {
            const uploaded = partBytes.get(filePath[1]) ?? Buffer.alloc(0);
            file.status = 'available';
            file.computed_md5 = hashes(uploaded).md5;
            return send(file);
          }
          return send({ ...file, upload_url: `${url}/upload/${file.id}` });
        }
        if (target.pathname.endsWith('/files')) {
          if (req.method === 'POST') {
            const file: PublicationObject = {
              ...body,
              id: 501 + files.length,
              ...(typeof body.md5 === 'string' ? { supplied_md5: body.md5 } : {}),
              status: body.link ? 'available' : 'created',
              download_url: body.link ?? `https://download.test/${501 + files.length}`,
              is_link_only: !!body.link,
            };
            article.files.push(file);
            if (afterFileInit) {
              const callback = afterFileInit;
              afterFileInit = undefined;
              await callback();
            }
            return send({ entity_id: file.id, location: `${url}/account/articles/${id}/files/${file.id}` });
          }
          return send(files);
        }
        if (target.pathname.endsWith('/publish')) {
          if (publishNow) {
            article.is_public = true;
            article.published_date = '2026-10-19';
            article.version = Number(article.version) + 1;
          }
          if (publishLost) {
            req.socket.destroy();
            return;
          }
          return send({ accepted: true });
        }
        if (target.pathname.endsWith('/embargo')) {
          if (req.method === 'DELETE') article.is_embargoed = false;
          else Object.assign(article, body);
          if (embargoLost) {
            embargoLost = false;
            req.socket.destroy();
            return;
          }
          return send({ acknowledged: true });
        }
        if (req.method === 'PUT') {
          Object.assign(article, body);
          if (body.license != null) article.license = { value: body.license, name: 'Open' };
          if (typeof body.defined_type === 'string') {
            article.defined_type_name = body.defined_type;
            article.defined_type = 3;
          }
          if (Array.isArray(body.categories)) article.categories = body.categories.map(id => ({ id }));
          if (isPublicationObject(body.custom_fields))
            article.custom_fields = Object.entries(body.custom_fields).map(([name, value]) => ({ name, value }));
          if (Array.isArray(body.authors))
            article.authors = body.authors.map((value, index) =>
              isPublicationObject(value) && typeof value.name === 'string'
                ? { id: 300 + index, full_name: value.name }
                : value
            );
          if (afterUpdate) {
            const callback = afterUpdate;
            afterUpdate = undefined;
            await callback();
          }
          return send({});
        }
        return send(article);
      } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(error) }));
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    const sails = Reflect.get(globalThis, 'sails');
    sails.config.storage = previousStorage;
    sails.config.record = previousRecordConfig;
    sails.services.testDatastream = previousDatastream;
    for (const [name, value] of globals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name);
      else Reflect.set(globalThis, name, value);
    }
    await mongoClient.db(database).dropDatabase();
    await mongoClient.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  beforeEach(async () => {
    await rm(join(directory, 'figshare'), { recursive: true, force: true });
    await mkdir(join(directory, 'figshare'), { recursive: true });
    for (const name of [
      'record',
      'recordidentity',
      'deletedrecord',
      'publicationsync',
      'publicationdestination',
      'publicationresourcelease',
      'publicationstagingreference',
      'publicationcontentadmission',
      'publicationcorrection',
      'publicationmigration',
      'publicationmigrationitem',
      'publicationmigrationinventory',
      'publicationmigrationreview',
      'publicationhistory',
      'figsharesync',
      'vocabularyentry',
      'figsharevocabularycrosswalk',
      'figsharevocabularysource',
      'figsharevocabularycategory',
      'figsharevocabularycrosswalkmapping',
    ])
      await mongoClient.db(database).collection(name).deleteMany({});
    clock = Date.now();
    articles = [];
    requests = [];
    createFailure = false;
    hidden = false;
    publishLost = false;
    embargoLost = false;
    publishNow = true;
    afterUpdate = undefined;
    afterCreate = undefined;
    afterFileInit = undefined;
    failPartOnce = false;
    localRemoved = false;
    bytes = Buffer.from('sealed attachment bytes');
    partBytes = new Map();
    service = new FigshareServices.FigshareService();
    config = new PublicationPublishing();
    config.processing = {
      ...config.processing,
      enabled: true,
      serviceUsername: 'worker',
      stagingDisk: 'durable',
      coalesceMs: 0,
      retryBaseMs: 1,
    };
    config.destinations.main = {
      provider: 'figshare',
      displayName: 'Main',
      enabled: true,
      archived: false,
      connection: {
        baseUrl: url,
        frontEndUrl: 'https://figshare.test',
        accountId: '1',
        token: 'private-token',
        retry: { maxAttempts: 1 },
      },
      mapping: {
        metadata: {
          title: { kind: 'path', path: 'metadata.title' },
          description: { kind: 'path', path: 'metadata.description' },
          license: { required: false },
        },
        categories: { allowUnmapped: true },
      },
      attachments: {},
      writeBack: { articleId: 'metadata.figshare_id' },
      providerOptions: { embargo: { mode: 'none' } },
    };
    config.sourcePolicies = [
      {
        id: 'approve',
        version: 1,
        mode: 'approval',
        recordType: 'dataPublication',
        event: 'onTransition',
        destinations: ['main'],
        grantCondition: '<%= record.workflow.stage === "queued" %>',
      },
    ];
    const provider = createFigsharePublicationProvider(() => service.publicationAdapterHooks());
    const registry = new PublicationProviderRegistry();
    registry.register(provider);
    registry.freeze();
    const db = mongoClient.db(database);
    runtime = {
      storage: mongo,
      store: new PublicationSyncStore(db, () => clock),
      resources: new PublicationResourceStore(db, () => clock),
      registry,
      now: () => clock,
      random: () => 0,
      configuration: async () => config,
      brands: async () => ['brand'],
      staging: () => staging,
      assertAccess: async () => {},
      verifyInputs: (work, record, source, approval, configuration) =>
        verifyPublicationInputs(runtime, work, record, source, approval, configuration),
      enqueue: async () => {},
      report: () => {},
    };
    assign('BrandingService', { getBrandById: () => brand, getBrand: () => brand });
    assign('StorageManagerService', { disk: () => disk });
    const sails = Reflect.get(globalThis, 'sails');
    sails.config.record = { ...sails.config.record, datastreamService: 'testDatastream' };
    sails.services.testDatastream = {
      getDatastream: async () => {
        if (localRemoved) throw new Error('Original attachment was removed');
        return { readstream: Readable.from([bytes]), size: bytes.length };
      },
      getDatastreamFingerprint: async () => hashes(bytes).sha,
    };
    await runtime.store.ensureIndexes();
    await runtime.resources.ensureIndexes();
  });

  async function legacyBoundary(authority: 'shared' | 'preparing') {
    const db = mongoClient.db(database);
    await mongo.recordCol.insertOne({
      redboxOid: key.oid,
      metadata: { title: 'Committed', figshare_article_id: '51' },
      metaMetadata: { brandId: key.brandId, type: 'dataPublication' },
    });
    await db.collection('publicationmigration').insertOne({
      schemaVersion: 1,
      brandId: key.brandId,
      authority,
      phase: authority === 'shared' ? 'committed' : 'paused',
      revision: 0,
      assignments: {},
      usedDestinations: {},
      verifiedTargets: {},
      globalFailures: [],
      counts: { sources: 0, converted: 0, quarantined: 0 },
      ...(authority === 'shared' ? { committedAt: new Date().toISOString() } : {}),
    });
    assign('PublicationSync', { getDatastore: () => ({ manager: db }) });
    assign('RecordsService', { getPublicationStorage: () => mongo, getMeta: (oid: string) => mongo.getMeta(oid) });
    const publication = new PublicationServices.Publication();
    assign('PublicationService', publication);
    const defaults = new FigsharePublishing();
    const legacy: ResolvedFigsharePublishingConfigData = {
      ...defaults,
      enabled: true,
      processing: { ...defaults.processing, enabled: false },
      connection: { ...defaults.connection, baseUrl: url, token: 'legacy-token' },
      runtime: { mode: 'live' },
    };
    service.getConfig = () => legacy;
    const record = await mongo.getMeta(key.oid);
    assert.ok(record);
    return { publication, legacy, record };
  }

  for (const authority of ['shared', 'preparing'] as const) {
    it(`fences direct live Figshare clients under ${authority} authority with legacy processing disabled`, async () => {
      const { record, legacy } = await legacyBoundary(authority);
      articles.push({ id: 51, title: 'Unchanged', files: [] });
      await assert.rejects(
        service.makeClient(legacy, record).updateArticle('51', { title: 'Unauthorized' }),
        /authority|cutover/i
      );
      assert.equal(articles[0].title, 'Unchanged');
      assert.equal(requests.length, 0);
    });
  }

  it('fences public Figshare phases before invoking a custom client after cutover', async () => {
    const { record } = await legacyBoundary('shared');
    let clients = 0;
    service.makeClient = () => {
      clients++;
      throw new Error('Custom client reached');
    };
    await assert.rejects(service.syncMetadata(record), /authority/i);
    await assert.rejects(service.syncAssets(record, { id: 51 }), /authority/i);
    await assert.rejects(service.syncEmbargo(record, '51'), /authority/i);
    await assert.rejects(service.publishIfNeeded(record, '51'), /authority/i);
    assert.equal(clients, 0);
  });

  it('refuses a forged legacy brand at the common mutation guard and standalone provider entry', async () => {
    const { publication, record } = await legacyBoundary('shared');
    await assert.rejects(publication.assertLegacyPublicationAllowed('legacy', key.oid), /brand mismatch/i);
    await assert.rejects(
      publication.acceptProviderRequest(
        'oni',
        'OniService.exportDataset',
        key.oid,
        { ...record, metaMetadata: { ...record.metaMetadata, brandId: 'legacy' } },
        {},
        { username: 'approver' }
      ),
      /brand mismatch/i
    );
    assert.equal(requests.length, 0);
  });
  async function ready(metadata: PublicationObject = {}, destinations = ['main']) {
    const requestCount = requests.length;
    const old = await mongo.getMeta(key.oid);
    const revision = old?.publicationSource?.revision ?? 0;
    const candidate = {
      redboxOid: key.oid,
      metadata: { title: `title-${revision + 1}`, description: 'Test', dataLocations: [], ...metadata },
      metaMetadata: { brandId: 'brand', type: 'dataPublication' },
      workflow: { stage: 'queued' },
    };
    if (!old) await mongo.recordCol.insertOne({ ...candidate, revision: 0, recordVersion: 0 });
    const record = publicationContentRecord(candidate);
    assert.ok(isPublicationObject(record));
    config.sourcePolicies[0] = { ...config.sourcePolicies[0], destinations };
    const actor = { username: 'approver', userType: 'local' };
    const generatedValues = { publicationTimestamp: '2026-10-19T00:00:00Z' };
    const relatedInputs: Record<string, PublicationSnapshot> = {};
    const attachments = [];
    const destinationInputs = [];
    const crosswalks = new Map<string, PublicationObject>();
    for (const destinationId of destinations) {
      const provider = runtime.registry.get('figshare')!;
      const input = {
        ...key,
        destinationId,
        configuration: config.destinations[destinationId],
        record,
        requester: actor,
        approver: actor,
        generatedValues,
      };
      const result = await provider.prepareSource!(input);
      if (!result.valid) await prepareFigshareSource(input, service.publicationAdapterHooks());
      assert.ok(result.valid, JSON.stringify(result));
      if (!result.valid) throw new Error('Preflight');
      const dependencies = await provider.describeSource!(input, result.value);
      if (isPublicationObject(result.value.crosswalks))
        for (const [id, snapshot] of Object.entries(result.value.crosswalks)) {
          assert.ok(isPublicationObject(snapshot));
          crosswalks.set(id, snapshot);
        }
      relatedInputs[`${destinationId}:prepared`] = {
        brandId: 'brand',
        id: destinationId,
        version: publicationDigest(result.value),
        value: result.value,
      };
      const selection = { attachments: dependencies.attachments.map(({ id, logicalPath }) => ({ id, logicalPath })) };
      relatedInputs[`${destinationId}:selection`] = {
        brandId: 'brand',
        id: destinationId,
        version: publicationDigest(selection),
        value: selection,
      };
      for (const attachment of dependencies.attachments)
        if (!attachments.some(item => item.id === attachment.id && item.logicalPath === attachment.logicalPath))
          attachments.push(attachment);
      destinationInputs.push({
        id: destinationId,
        provider,
        configuration: config.destinations[destinationId],
        targetFingerprint: provider.targetFingerprint(config.destinations[destinationId]),
        mappingContextVersion: dependencies.mappingContextVersion,
        managedFields: dependencies.managedFields,
      });
    }
    assert.equal(requests.length, requestCount, 'Preflight must perform no Figshare API calls');
    const sealed = await sealPublicationSource(
      {
        ...key,
        requestId: randomUUID(),
        sourceRevision: revision + 1,
        record,
        maintenancePaths: [],
        generatedValues,
        relatedInputs,
        attachments,
        destinations: destinationInputs,
        resolveCrosswalk: async request => {
          const snapshot = crosswalks.get(request.crosswalkId);
          assert.ok(snapshot && typeof snapshot.revision === 'string');
          assert.equal(request.brandId, key.brandId);
          assert.equal(snapshot.sourceVocabularyId, request.sourceVocabularyId);
          return {
            brandId: request.brandId,
            crosswalkId: request.crosswalkId,
            revisionId: snapshot.revision,
            value: snapshot,
          };
        },
      },
      staging
    );
    const approval: PublicationApproval = {
      id: randomUUID(),
      epoch: 1,
      sourceRevision: revision + 1,
      policy: config.sourcePolicies[0],
      destinationIds: destinations,
      targetFingerprints: sealed.descriptor.targets,
      configurationDigests: sealed.configurationDigests,
      source: sealed.reference,
      requester: actor,
      approver: { username: 'departed', userType: 'local' },
      grantedAt: new Date(clock).toISOString(),
    };
    const saveToken = randomUUID();
    const result = await mongo.updateMeta(brand, key.oid, candidate, undefined, {
      publicationIntent: {
        kind: 'content',
        expectedSourceRevision: revision,
        saveToken,
        approvals: [approval],
        expectedRecordDigest: publicationRecordDigest(candidate),
      },
    });
    assert.equal(result.applicationState, 'applied');
    const committed = await mongo.getMeta(key.oid);
    assert.equal(
      await mongo.recordPublicationSaveSuccess('brand', key.oid, saveToken, {
        evidenceId: randomUUID(),
        sourceRevision: revision + 1,
        recordDigest: publicationRecordDigest({ ...committed }),
      }),
      true
    );
    assert.equal(await mongo.readyPublicationIntent('brand', key.oid, saveToken), true);
    await importPublicationIntents(runtime, await mongo.getMeta(key.oid));
    return sealed;
  }
  const run = async (work = key) => {
    clock = Math.max(clock + 200000, Date.now());
    await runPublicationWorker(runtime, {
      attrs: { data: { ...work, articleId: '999', user: { username: 'attacker' } } },
    });
  };
  const row = async (work = key) => {
    const value = await runtime.store.get(work);
    assert.ok(value);
    return value;
  };
  const evidence = async () => decodeFigshareLegacy((await row()).providerState.legacy);
  const posts = (suffix: string) => requests.filter(value => value.method === 'POST' && value.path.endsWith(suffix));

  for (const stage of ['journal', 'completion'] as const)
    for (const field of publicationEvidenceFields) {
      it(`generic evidence rejects ${stage} ${field}`, async () => {
        await ready();
        publishNow = true;
        await withPublicationEvidenceMismatch(stage, field, async () => {
          await run();
        });
        const result = await row();
        assert.equal(result.status, 'repair_required');
        assert.match(result.waitingReason ?? '', /publication_operation_evidence_mismatch/);
        assert.equal(result.completion, undefined);
        assert.equal(result.operationEvidenceFailures?.length, 1);
        assert.equal(result.operationEvidenceFailures[0].field, field.startsWith('remote.') ? 'remote' : field);
        assert.ok(result.operationEvidenceFailures[0].reported);
        assert.ok(result.operations.length > 0);
        if (stage === 'journal') assert.ok(result.operations.some(op => op.outcome === 'submitted'));
      });
    }
  for (const outcome of ['rejected', 'accepted', 'uncertain'] as const) {
    it(`handles migrated ${outcome} publication with a higher legacy generation before a fresh shared approval`, async () => {
      const db = mongoClient.db(database);
      articles.push({ id: 51, account_id: 1, title: 'Legacy article', files: [], version: 1, is_public: false });
      await mongo.recordCol.insertOne({
        redboxOid: key.oid,
        revision: 0,
        recordVersion: 0,
        metadata: { title: 'Legacy', figshare_id: '51' },
        metaMetadata: { brandId: key.brandId, type: 'dataPublication' },
        workflow: { stage: 'queued' },
      });
      const historical = emptyFigshareEvidence(key.oid, key.brandId);
      historical.binding = { namespace: url, accountId: '1', ownerId: '1', articleId: '51' };
      historical.importedGeneration = 40;
      historical.publish = {
        generation: 40,
        hash: 'rejected-legacy-payload',
        previousVersion: 1,
        outcome,
        submittedAt: new Date(clock).toISOString(),
      };
      await db.collection('figsharesync').insertOne({ ...historical });
      const legacyConfig = new FigsharePublishing();
      legacyConfig.connection.baseUrl = url;
      legacyConfig.record.articleIdPath = 'metadata.figshare_id';
      legacyConfig.workflow.transitionJob.enabled = false;
      config.processing.coalesceMs = 1;
      config.processing.enabled = false;
      config.destinations.main.enabled = false;
      const legacy = migrationJson({ figsharePublishing: legacyConfig, publicationPublishing: config });
      const result = await migratePublication(
        {
          db,
          storage: mongo,
          registry: runtime.registry,
          administrator: async () => ({ username: 'admin', userType: 'local' }),
          legacyConfiguration: async () => legacy,
          recordTypes: async () => [],
          persistConfiguration: async (_brand, prepared) => {
            legacy.publicationPublishing = migrationJson(prepared);
          },
          verifyConfiguration: async (_brand, prepared) =>
            Object.fromEntries(
              Object.entries(prepared.destinations).map(([id, destination]) => [
                id,
                runtime.registry.get(destination.provider)!.targetFingerprint(destination),
              ])
            ),
        },
        {
          brandId: key.brandId,
          username: 'admin',
          apply: true,
          reason: 'Retain settled legacy publication',
          parameters: {
            useExistingConfiguration: true,
            assignments: { figshare: key.destinationId },
            consumersStopped: true,
            evidenceReference: 'stopped/legacy',
          },
        }
      );
      assert.equal(migrationJson(result).authority, 'shared', JSON.stringify(result));
      const migrated = await row();
      assert.equal(migrated.source, null);
      assert.equal(migrated.operations[0].evidence.outcome, outcome);
      assert.equal(await db.collection('figsharesync').countDocuments(), 1);
      assert.equal(
        migrated.waitingReason,
        outcome === 'rejected' ? 'historical_observation_only' : 'migration_quarantine'
      );
      config.processing.enabled = true;
      config.destinations.main.enabled = true;
      await ready({ figshare_id: '51' });
      assert.equal((await row()).sourceGeneration, 1);
      await run();
      assert.equal(posts('/publish').length, outcome === 'rejected' ? 1 : 0);
      assert.equal((await row()).status, outcome === 'rejected' ? 'completed' : 'repair_required');
      if (outcome !== 'rejected') assert.equal((await row()).completion, undefined);
      assert.equal(articles.length, 1);
      assert.deepEqual(await db.collection('figsharesync').findOne({ oid: key.oid }), {
        _id: (await db.collection('figsharesync').findOne({ oid: key.oid }))!._id,
        ...historical,
      });
      assert.ok(
        (await row()).operations.some(
          operation =>
            operation.sourceGeneration === 40 &&
            operation.outcome === (outcome === 'rejected' ? 'rejected' : 'uncertain')
        )
      );
    });
  }

  const localLocations = [{ type: 'attachment', selected: true, fileId: 'local', name: 'bytes.csv' }];
  async function temporaryUploadExists() {
    const entries = await readdir(join(directory, 'figshare'), { recursive: true, withFileTypes: true });
    return entries.some(entry => entry.isFile());
  }
  const cleanup = () =>
    cleanupPublicationAttachments({
      ...runtime,
      db: mongoClient.db(database),
      removeOriginal: async () => {
        if (await disk.exists('original-local')) await disk.delete('original-local');
        localRemoved = true;
      },
    });
  function sibling() {
    config.destinations.other = {
      ...structuredClone(config.destinations.main),
      displayName: 'Other',
      writeBack: {
        articleId: 'metadata.other_id',
        articleUrls: ['metadata.other_url'],
        status: 'metadata.other_status',
        error: 'metadata.other_error',
        syncState: 'metadata.other_sync',
      },
    };
  }
  async function replacementRecord() {
    const record = await mongo.getMeta(key.oid);
    assert.ok(record?.publicationSource);
    return record;
  }
  it('post-completion cleanup replaces attachments exactly once, preserves approval and never republishes', async () => {
    await ready({
      dataLocations: [
        ...localLocations,
        { type: 'url', location: 'https://original.test', description: 'preserved' },
        { type: 'attachment', selected: false, fileId: 'unselected', name: 'retained.csv' },
      ],
    });
    const approved = (await replacementRecord()).publicationSource!;
    await run();
    const record = await replacementRecord();
    assert.equal((await row()).status, 'completed');
    assert.equal(record.metadata.dataLocations[0].type, 'url');
    assert.equal(record.metadata.dataLocations[0].location, 'https://download.test/501');
    assert.ok(Array.isArray(record.metadata.dataLocations));
    assert.deepEqual(record.metadata.dataLocations.slice(1), [
      { type: 'url', location: 'https://original.test', description: 'preserved' },
      { type: 'attachment', selected: false, fileId: 'unselected', name: 'retained.csv' },
    ]);
    assert.equal(record.publicationSource!.revision, approved.revision);
    assert.deepEqual(record.publicationSource!.approvals, approved.approvals);
    assert.equal(record.publicationSource!.contentReplacements?.length, 1);
    const revision = record.revision;
    await dispatchPublications(runtime);
    await applyPublicationContentReplacement(runtime, key);
    await run();
    assert.equal((await replacementRecord()).revision, revision);
    assert.equal(posts('/publish').length, 1);
    assert.equal(localRemoved, false);
    assert.equal(await temporaryUploadExists(), false);
  });
  it('post-completion cleanup waits for a current sibling, then dispatcher applies it without remote replay', async () => {
    sibling();
    await ready({ dataLocations: localLocations }, ['main', 'other']);
    await run();
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'attachment');
    assert.equal((await row()).workflowPending, true);
    config.destinations.other.enabled = false;
    await dispatchPublications(runtime);
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'attachment');
    config.destinations.other.enabled = true;
    await run({ ...key, destinationId: 'other' });
    await dispatchPublications(runtime);
    const record = await replacementRecord();
    assert.equal(record.metadata.dataLocations[0].type, 'url');
    assert.equal(record.publicationSource!.contentReplacements?.length, 1);
    assert.ok(record.publicationSource!.approvals.every(approval => !approval.revokedAt));
    assert.equal(posts('/publish').length, 2);
  });
  it('post-completion cleanup reloads after a revision conflict and preserves unrelated maintenance', async () => {
    const original = mongo.setPublicationRecordFields.bind(mongo);
    let attempts = 0;
    mongo.setPublicationRecordFields = async projection => {
      if (projection.contentReplacement && attempts++ === 0)
        await mongo.recordCol.updateOne(
          { redboxOid: key.oid },
          { $set: { 'metadata.figshareStatus': 'concurrent status' }, $inc: { revision: 1 } }
        );
      return original(projection);
    };
    try {
      await ready({ dataLocations: localLocations });
      await run();
      assert.equal(attempts, 2);
      assert.equal((await replacementRecord()).metadata.figshareStatus, 'concurrent status');
      assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'url');
    } finally {
      mongo.setPublicationRecordFields = original;
    }
  });
  it('post-completion cleanup retains attachments for an unimported current sibling obligation', async () => {
    sibling();
    await ready({ dataLocations: localLocations }, ['main', 'other']);
    await runtime.store.collection.deleteOne({ ...key, destinationId: 'other' });
    const record = await replacementRecord();
    const state = record.publicationSource!;
    const intent = { ...state.intents.other, pending: true };
    const source = {
      ...state,
      pending: true,
      intents: { ...state.intents, other: intent },
      saves: [
        {
          token: randomUUID(),
          outcome: 'ready',
          intents: [intent],
          requestedAt: new Date(clock).toISOString(),
          sourceRevision: state.revision,
          recordDigest: publicationRecordDigest({ ...record }),
          successfulSaveEvidence: {
            id: randomUUID(),
            recordedAt: new Date(clock).toISOString(),
            sourceRevision: state.revision,
            recordDigest: publicationRecordDigest({ ...record }),
          },
        },
      ],
    };
    await mongo.recordCol.updateOne(
      { redboxOid: key.oid },
      {
        $set: {
          publicationSource: source,
        },
      }
    );
    await run();
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'attachment');
    await dispatchPublications(runtime);
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'attachment');
    await run({ ...key, destinationId: 'other' });
    await dispatchPublications(runtime);
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'url');
    assert.equal(posts('/publish').length, 2);
  });
  it('post-completion cleanup defers embargoed downloads without withholding completion or republishing', async () => {
    afterUpdate = async () => {
      articles[0].is_embargoed = true;
    };
    await ready({ dataLocations: localLocations });
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'attachment');
    assert.equal((await row()).work.maintenance.requested, 1);
    articles[0].is_embargoed = false;
    clock += config.processing.cleanupMs;
    await run();
    await dispatchPublications(runtime);
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'url');
    assert.equal(posts('/publish').length, 1);
  });
  it('post-completion cleanup revalidates a concurrent user edit and refuses to overwrite it', async () => {
    const original = mongo.setPublicationRecordFields.bind(mongo);
    let attempts = 0;
    mongo.setPublicationRecordFields = async projection => {
      if (projection.contentReplacement && attempts++ === 0) {
        const current = await mongo.getMeta(key.oid);
        current.metadata.title = 'Concurrent user title';
        await mongo.updateMeta(brand, key.oid, current);
      }
      return original(projection);
    };
    try {
      await ready({ dataLocations: localLocations });
      await run();
      const record = await replacementRecord();
      assert.equal(record.metadata.title, 'Concurrent user title');
      assert.equal(record.metadata.dataLocations[0].type, 'attachment');
      assert.equal(record.publicationSource!.contentReplacements?.length ?? 0, 0);
      assert.equal(posts('/publish').length, 1);
    } finally {
      mongo.setPublicationRecordFields = original;
    }
  });
  it('post-completion cleanup rechecks newly pending sibling work inside conditional storage', async () => {
    const original = mongo.setPublicationRecordFields.bind(mongo);
    let intercepted = false;
    mongo.setPublicationRecordFields = async projection => {
      if (projection.contentReplacement && !intercepted) {
        intercepted = true;
        const current = await row({ ...key, destinationId: 'other' });
        await runtime.store.request(current, 'synchronise', current.revision, clock);
      }
      return original(projection);
    };
    try {
      sibling();
      await ready({ dataLocations: localLocations }, ['main', 'other']);
      await run();
      await run({ ...key, destinationId: 'other' });
      assert.equal(intercepted, true);
      assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'attachment');
      await run({ ...key, destinationId: 'other' });
      await dispatchPublications(runtime);
      assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'url');
      assert.equal(posts('/publish').length, 2);
    } finally {
      mongo.setPublicationRecordFields = original;
    }
  });
  it('post-completion cleanup waits for obligation admission pins and fences requests racing the final record CAS', async () => {
    await ready({ dataLocations: localLocations });
    const fence = new PublicationStagingFence(mongoClient.db(database), PUBLICATION_COMPLETION_FENCE);
    const release = await fence.pinRegistered(publicationCompletionReference(await row()));
    await run();
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'attachment');
    await release();
    const original = PublicationStagingFence.prototype.deleteIfUnreferenced;
    let checked = false;
    PublicationStagingFence.prototype.deleteIfUnreferenced = async function (reference, referenced, remove) {
      const applied = await original.call(this, reference, referenced, remove);
      if (applied && this.collection.collectionName === PUBLICATION_COMPLETION_FENCE && !checked) {
        checked = true;
        const current = await row();
        await assert.rejects(runtime.store.request(current, 'synchronise', current.revision), /fenced for deletion/);
      }
      return applied;
    };
    try {
      await dispatchPublications(runtime);
    } finally {
      PublicationStagingFence.prototype.deleteIfUnreferenced = original;
    }
    assert.equal(checked, true);
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'url');
    assert.equal(posts('/publish').length, 1);
    const current = await row();
    await runtime.store.request(current, 'observe', current.revision, clock);
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal(posts('/publish').length, 1);
  });
  it('post-completion cleanup recovers a lost conditional-write response idempotently', async () => {
    const original = mongo.setPublicationRecordFields.bind(mongo);
    let lost = false;
    mongo.setPublicationRecordFields = async projection => {
      const result = await original(projection);
      if (projection.contentReplacement && result.updated && !lost) {
        lost = true;
        throw new Error('lost response after commit');
      }
      return result;
    };
    try {
      await ready({ dataLocations: localLocations });
      await run();
    } finally {
      mongo.setPublicationRecordFields = original;
    }
    assert.equal(lost, true);
    await dispatchPublications(runtime);
    assert.equal((await replacementRecord()).publicationSource!.contentReplacements?.length, 1);
    assert.equal((await row()).workflowPending, false);
    assert.equal(posts('/publish').length, 1);
  });
  it('post-completion cleanup resumes a crash before the local write and never repeats publication', async () => {
    const original = mongo.setPublicationRecordFields.bind(mongo);
    mongo.setPublicationRecordFields = async projection => {
      if (projection.contentReplacement) throw new Error('process stopped before local commit');
      return original(projection);
    };
    try {
      await ready({ dataLocations: localLocations });
      await run();
    } finally {
      mongo.setPublicationRecordFields = original;
    }
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'attachment');
    await dispatchPublications(runtime);
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'url');
    assert.equal(posts('/publish').length, 1);
  });
  it('post-completion cleanup cannot be forged as arbitrary content maintenance and ordinary edits revoke approval', async () => {
    await ready({ dataLocations: localLocations });
    await run();
    const record = await replacementRecord();
    const change = record.publicationSource!.contentReplacements![0];
    await assert.rejects(
      mongo.setPublicationRecordFields({
        ...key,
        expectedRevision: record.revision ?? 0,
        sourceRevision: change.sourceRevision,
        approvalId: change.approvalId,
        approvalEpoch: change.approvalEpoch,
        generation: change.generation,
        fields: { 'metadata.title': 'Forged' },
        allowedPaths: ['metadata.title'],
        contentReplacement: structuredClone(change),
      }),
      /Unregistered/
    );
    record.metadata.title = 'Later draft';
    assert.equal((await mongo.updateMeta(brand, key.oid, record)).applicationState, 'applied');
    assert.ok((await replacementRecord()).publicationSource!.approvals.every(approval => approval.revokedAt));
    await dispatchPublications(runtime);
    await run();
    assert.equal(posts('/publish').length, 1);
  });
  it('post-completion cleanup retains pinned originals and staged recovery bytes, then deletes only through the tombstone fence', async () => {
    await disk.put('original-local', bytes);
    const sealed = await ready({ dataLocations: localLocations });
    await run();
    const attachment = sealed.descriptor.attachments[0];
    assert.ok(attachment.original && attachment.staged);
    const fence = new PublicationStagingFence(mongoClient.db(database));
    const reference = publicationOriginalReference(key.brandId, attachment.original);
    const release = await fence.acquire(reference);
    clock += 3600001;
    assert.equal((await cleanup()).retained, 1);
    assert.equal(localRemoved, false);
    assert.equal(await disk.exists('original-local'), true);
    await release();
    const unknown = await mongoClient
      .db(database)
      .collection('publicationresourcelease')
      .insertOne({ schemaVersion: 2 });
    assert.equal((await cleanup()).retained, 1);
    assert.equal(await disk.exists('original-local'), true);
    await mongoClient.db(database).collection('publicationresourcelease').deleteOne({ _id: unknown.insertedId });
    assert.equal((await cleanup()).removed, 1);
    assert.equal(localRemoved, true);
    assert.equal(await disk.exists('original-local'), false);
    await assert.rejects(fence.acquire(reference), /fenced for deletion/);
    await staging.verify(key.brandId, attachment.staged, attachment.size);
    await cleanup();
    await applyPublicationContentReplacement(runtime, key);
    assert.equal((await replacementRecord()).publicationSource!.contentReplacements?.length, 1);
    assert.equal(posts('/publish').length, 1);
    const current = await mongo.getMeta(key.oid);
    current.metadata.dataLocations = localLocations;
    const result = await mongo.updateMeta(brand, key.oid, current);
    assert.notEqual(result.applicationState, 'applied', 'tombstones fence later attachment reference admission');
  });
  for (const damage of ['missing', 'corrupt'] as const) {
    it(`retains original attachment bytes when staged recovery is ${damage}`, async () => {
      await disk.put('original-local', bytes);
      const sealed = await ready({ dataLocations: localLocations });
      await run();
      const attachment = sealed.descriptor.attachments[0];
      assert.ok(attachment.original && attachment.staged);
      if (damage === 'missing') await disk.delete(attachment.staged.key);
      else await disk.put(attachment.staged.key, Buffer.from('corrupted recovery bytes'));
      clock += 3600001;
      assert.equal((await cleanup()).retained, 1);
      assert.equal(localRemoved, false);
      assert.equal(await disk.exists('original-local'), true);
      // Failed verification must not tombstone the original or prevent later recovery.
      const release = await new PublicationStagingFence(mongoClient.db(database)).pinOriginal(
        key.brandId,
        attachment.original
      );
      await release();
      await disk.put(attachment.staged.key, bytes);
      assert.equal((await cleanup()).removed, 1);
      assert.equal(await disk.exists('original-local'), false);
    });
  }
  it('verifies recovery bytes again before resuming an interrupted original deletion', async () => {
    await disk.put('original-local', bytes);
    const sealed = await ready({ dataLocations: localLocations });
    await run();
    clock += 3600001;
    const attachment = sealed.descriptor.attachments[0];
    assert.ok(attachment.staged);
    assert.equal(
      (
        await cleanupPublicationAttachments({
          ...runtime,
          db: mongoClient.db(database),
          removeOriginal: async () => {
            throw new Error('interrupted before disk deletion');
          },
        })
      ).retained,
      1
    );
    await disk.delete(attachment.staged.key);
    assert.equal((await cleanup()).retained, 1);
    assert.equal(localRemoved, false);
    assert.equal(await disk.exists('original-local'), true);
    await disk.put(attachment.staged.key, bytes);
    assert.equal((await cleanup()).removed, 1);
  });
  it('post-completion cleanup retains originals required by an older unstaged recovery source', async () => {
    const sealed = await ready({ dataLocations: localLocations });
    await run();
    const recovery = structuredClone(sealed.descriptor);
    recovery.attachments = recovery.attachments.map(
      ({ staged: _staged, original: _original, ...attachment }) => attachment
    );
    const reference = await staging.putJson(key.brandId, JSON.stringify(recovery));
    await mongoClient
      .db(database)
      .collection('publicationcorrection')
      .insertOne({ brandId: key.brandId, source: reference });
    clock += 3600001;
    assert.equal((await cleanup()).retained, 1);
    assert.equal(localRemoved, false);
  });
  it('post-completion cleanup retains originals referenced by a legacy Oni composite attachment identity', async () => {
    await disk.put('original-local', bytes);
    const sealed = await ready({ dataLocations: localLocations });
    await run();
    const recovery = structuredClone(sealed.descriptor);
    recovery.oid = 'related-oni-publication';
    recovery.attachments = recovery.attachments.map(({ staged: _staged, original: _original, ...attachment }) => ({
      ...attachment,
      id: JSON.stringify([key.oid, 'local']),
    }));
    const reference = await staging.putJson(key.brandId, JSON.stringify(recovery));
    await mongoClient
      .db(database)
      .collection('publicationcorrection')
      .insertOne({ brandId: key.brandId, source: reference });
    clock += 3600001;
    assert.equal((await cleanup()).retained, 1);
    assert.equal(localRemoved, false);
    assert.equal(await disk.exists('original-local'), true);
  });
  it('post-completion cleanup resumes an interrupted original-byte deletion under its irreversible tombstone', async () => {
    await disk.put('original-local', bytes);
    const sealed = await ready({ dataLocations: localLocations });
    await run();
    clock += 3600001;
    let lost = false;
    const cleanupRuntime = {
      ...runtime,
      db: mongoClient.db(database),
      removeOriginal: async () => {
        if (await disk.exists('original-local')) await disk.delete('original-local');
        if (!lost) {
          lost = true;
          throw new Error('lost disk delete acknowledgement');
        }
      },
    };
    assert.equal((await cleanupPublicationAttachments(cleanupRuntime)).retained, 1);
    assert.equal(lost, true);
    assert.equal(await disk.exists('original-local'), false);
    const original = sealed.descriptor.attachments[0].original;
    assert.ok(original);
    const fence = new PublicationStagingFence(mongoClient.db(database));
    await assert.rejects(fence.pinOriginal(key.brandId, original), /fenced for deletion/);
    assert.equal((await cleanupPublicationAttachments(cleanupRuntime)).removed, 1);
    await staging.verify(key.brandId, sealed.descriptor.attachments[0].staged!);
  });
  it('post-completion cleanup preserves hosted-file off and staging retainForRetry semantics', async () => {
    config.destinations.main.attachments = {
      assets: { enableHostedFiles: false, staging: { cleanupPolicy: 'retainForRetry' } },
    };
    await ready({ dataLocations: localLocations });
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'attachment');
    assert.equal(posts('/files').length, 0);
    config.destinations.main.attachments = {
      assets: { enableHostedFiles: true, staging: { cleanupPolicy: 'retainForRetry' } },
    };
    await ready({ dataLocations: localLocations });
    await run();
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'url');
    assert.equal(await temporaryUploadExists(), true);
  });
  it('post-completion cleanup retains the legacy failed-upload temporary cleanup policy', async () => {
    config.destinations.main.attachments = {
      assets: { enableHostedFiles: true, staging: { cleanupPolicy: 'retainForRetry' } },
    };
    failPartOnce = true;
    await ready({ dataLocations: localLocations });
    await run();
    assert.notEqual((await row()).status, 'completed');
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'attachment');
    assert.equal(await temporaryUploadExists(), false);
  });
  it('post-completion cleanup settles without requesting maintenance when every attachment is unselected', async () => {
    await ready({ dataLocations: [{ ...localLocations[0], selected: false }] });
    await run();
    const current = await row();
    assert.equal(current.status, 'completed');
    assert.equal(current.workflowPending, false);
    assert.equal(current.work.maintenance.requested, 0);
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'attachment');
    assert.equal(posts('/files').length, 0);
    await dispatchPublications(runtime);
    assert.equal(posts('/publish').length, 1);
  });
  it('post-completion cleanup permits freshly approved bytes under the same live attachment ID', async () => {
    await ready({ dataLocations: localLocations });
    bytes = Buffer.from('A new approved attachment version');
    const approved = await ready({ dataLocations: localLocations });
    assert.equal(approved.descriptor.attachments[0].original?.digest, hashes(bytes).sha);
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal((await replacementRecord()).metadata.dataLocations[0].type, 'url');
    assert.equal(posts('/publish').length, 1);
  });

  it('PUB-18 fences a persisted crosswalk revision change and publishes only a freshly approved mapping', async () => {
    const db = mongoClient.db(database);
    await db.collection('figsharevocabularycrosswalk').insertOne({
      id: 'crosswalk',
      branding: 'brand',
      status: 'approved',
      localVocabulary: 'local',
      figshareSource: 'source',
      approvedRevision: 1,
    });
    await db.collection('figsharevocabularysource').insertOne({ id: 'source', branding: 'brand', archived: false });
    await db.collection('vocabularyentry').insertOne({ id: 'local-entry', vocabulary: 'local', value: '0101' });
    await db.collection('figsharevocabularycategory').insertMany([
      { id: 'category-v1', categoryId: 10, sourceId: '10', historical: false },
      { id: 'category-v2', categoryId: 20, sourceId: '20', historical: false },
    ]);
    await db.collection('figsharevocabularycrosswalkmapping').insertMany(
      [1, 2].map(revision => ({
        crosswalk: 'crosswalk',
        revision,
        status: 'approved',
        localEntry: 'local-entry',
        figshareCategory: `category-v${revision}`,
      }))
    );
    const metadata = config.destinations.main.mapping.metadata;
    assert.ok(isPublicationObject(metadata));
    metadata.categories = {
      source: {
        kind: 'crosswalk',
        crosswalkId: 'crosswalk',
        sourceVocabularyId: 'local',
        source: { kind: 'path', path: 'metadata.codes' },
      },
    };
    const first = await ready({ codes: ['0101'] });
    assert.equal(first.descriptor.crosswalkRevisions[0].revisionId, '1');
    await db
      .collection('figsharevocabularycrosswalk')
      .updateOne({ id: 'crosswalk' }, { $set: { approvedRevision: 2 } });
    await run();
    assert.equal(requests.length, 0, 'an obsolete crosswalk cannot start even a remote lookup');
    assert.equal((await row()).status, 'superseded');
    assert.equal((await row()).completion, undefined);
    const retained = await reopenPublicationSource('brand', first.reference, staging);
    assert.equal(retained.crosswalkRevisions[0].revisionId, '1');
    const fresh = await ready({ codes: ['0101'] });
    assert.equal(fresh.descriptor.crosswalkRevisions[0].revisionId, '2');
    assert.notEqual(fresh.contentDigest, first.contentDigest);
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal(articles.length, 1);
    assert.deepEqual(articles[0].categories, [{ id: 20 }]);
    assert.equal(posts('/account/articles').length, 1);
    assert.equal(
      (await reopenPublicationSource('brand', first.reference, staging)).crosswalkRevisions[0].revisionId,
      '1'
    );
  });

  it('uses shared ownership/journals for a verified publication and never publishes on save', async () => {
    await ready();
    assert.equal(articles.length, 0);
    await Promise.all([run(), run()]);
    const current = await row();
    assert.equal(current.status, 'completed');
    assert.equal(current.providerStateVersion, 2);
    assert.equal(articles.length, 1);
    assert.equal(posts('/publish').length, 1);
    assert.equal(current.completion?.deposit.publication, 'published');
    assert.equal(current.work.synchronise.processed, 1);
    assert.ok(current.operations.every(value => value.outcome === 'confirmed'));
    assert.equal(current.remoteObjectId, '51');
    assert.ok(!JSON.stringify(current).includes('private-token'));
  });
  it('requires verified migration of a nested legacy identity before creating or managing an article', async () => {
    config.destinations.main.writeBack.articleId = 'metadata.legacy.article';
    await ready({ legacy: { article: 'historical-id' } });
    await run();
    assert.equal((await row()).status, 'repair_required');
    assert.equal(articles.length, 0);
    assert.equal(posts('/account/articles').length, 0);
  });
  it('preserves actual customer payload, configuration and client override seams', async () => {
    let clients = 0;
    let accountReads = 0;
    class Custom extends FigshareServices.FigshareService {
      override getConfig(record?: RecordModel) {
        const config = super.getConfig(record);
        if (config) config.metadata.description = { kind: 'handlebars', template: 'Customer configuration' };
        return config;
      }
      override makeClient(...args: Parameters<FigshareServices.FigshareService['makeClient']>) {
        clients++;
        const client = super.makeClient(...args);
        return {
          ...client,
          getAccount: async () => {
            accountReads++;
            return client.getAccount!();
          },
        };
      }
      override async buildMetadataPayload(
        config: ResolvedFigsharePublishingConfigData,
        record: RecordModel
      ): Promise<Record<string, unknown>> {
        return {
          ...(await super.buildMetadataPayload(config, record)),
          title: 'Customer title',
          categories: [10],
          custom_fields: { managed: 'custom' },
        };
      }
    }
    service = new Custom();
    await ready();
    afterCreate = async () => {
      articles[0].custom_fields = [{ name: 'foreign', value: 'Retain' }];
    };
    await run();
    const current = await row();
    assert.equal(current.status, 'completed');
    assert.equal(articles[0].title, 'Customer title');
    assert.equal(articles[0].description, 'Customer configuration');
    assert.deepEqual(articles[0].custom_fields, [
      { name: 'foreign', value: 'Retain' },
      { name: 'managed', value: 'custom' },
    ]);
    assert.ok(clients >= 2);
    assert.ok(accountReads > 0);
    const state = (await row()).providerState;
    assert.ok(isPublicationObject(state.payload));
    assert.equal(state.payload.title, 'Customer title');
    assert.deepEqual(state.payload.categories, [10]);
    assert.ok((await evidence()).checkpoints.metadata);
  });
  it('journals the outgoing syncMetadata override and reconciles its lost response without replacing that payload', async () => {
    class Custom extends FigshareServices.FigshareService {
      override async syncMetadata(record: RecordModel, plan?: FigsharePublicationPlan) {
        assert.ok(plan?.articleId);
        const config = this.getConfig(record)!;
        const client = this.makeClient(config, record);
        return client.updateArticle(plan.articleId, {
          ...(await this.buildMetadataPayload(config, record)),
          title: 'Actual overridden title',
        });
      }
    }
    service = new Custom();
    await ready();
    afterUpdate = async () => {
      throw new Error('Lost metadata response');
    };
    await run();
    assert.equal(articles[0].title, 'Actual overridden title');
    await run();
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal(requests.filter(value => value.method === 'PUT').length, 1);
    const payload = (await row()).providerState.payload;
    assert.ok(isPublicationObject(payload));
    assert.equal(payload.title, 'Actual overridden title');
  });
  it('creates as the owner account and keeps author user identity distinct from token identity', async () => {
    config.destinations.main.providerOptions.impersonation = {
      enabled: true,
      institutionalIdPath: 'metadata.ci.id',
      emailPath: 'metadata.ci.email',
      operations: {
        create: 'owner',
        recovery: 'owner',
        read: 'owner',
        metadata: 'token',
        assets: 'token',
        embargo: 'token',
        publish: 'token',
      },
    };
    config.destinations.main.mapping.authors = {
      contributorPaths: ['metadata.ci'],
      lookup: [{ matchBy: 'email', value: { kind: 'path', path: 'email' } }],
    };
    await ready({ ci: { id: 'ci', email: 'ci@example.test' } });
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal(posts('/account/articles')[0].body.impersonate, '101');
    assert.equal(posts('/publish')[0].body.impersonate, undefined);
    assert.deepEqual(articles[0].authors, [{ id: 909 }]);
    assert.equal((await evidence()).binding?.ownerId, '101');
  });
  it('confirms external contributor names and license IDs against expanded Figshare responses', async () => {
    config.destinations.main.mapping.authors = { contributorPaths: ['metadata.people'], lookup: [] };
    const metadata = config.destinations.main.mapping.metadata;
    assert.ok(isPublicationObject(metadata));
    metadata.license = { source: { kind: 'path', path: 'metadata.license' }, matchBy: 'nameExact', required: true };
    await ready({ people: [{ name: 'External Contributor' }], license: 'Open' });
    await run();
    assert.equal((await row()).status, 'completed');
    assert.deepEqual(articles[0].authors, [{ id: 300, full_name: 'External Contributor' }]);
    const payload = (await row()).providerState.payload;
    assert.ok(isPublicationObject(payload));
    assert.deepEqual(payload.authors, [{ name: 'External Contributor' }]);
    assert.equal(payload.license, 1);
    assert.deepEqual(articles[0].license, { value: 1, name: 'Open' });
  });
  it('recovers a hidden HTTP-400 create token without a second POST and retains its failed evidence', async () => {
    createFailure = true;
    hidden = true;
    await ready();
    await run();
    assert.equal(articles.length, 1);
    assert.equal((await evidence()).create?.outcome, 'failed');
    await run();
    assert.equal((await row()).status, 'repair_required');
    assert.equal(articles.length, 1);
    hidden = false;
    await runtime.store.request(key, 'synchronise', (await row()).revision, clock);
    await run();
    assert.equal((await evidence()).binding?.articleId, '51');
    assert.equal(articles.length, 1);
    assert.equal(posts('/publish').length, 0);
    await run();
    assert.equal((await row()).status, 'repair_required');
    assert.equal(posts('/publish').length, 0);
    assert.equal((await evidence()).create?.outcome, 'failed');
    createFailure = false;
    await ready({ title: 'corrected' });
    await run();
    assert.equal(articles.length, 1);
    assert.equal((await row()).status, 'completed');
  });
  it('refuses a recovered exact create token with conflicting owner-account evidence', async () => {
    createFailure = true;
    await ready();
    await run();
    articles[0].account_id = 777;
    await run();
    assert.equal((await row()).status, 'repair_required');
    assert.equal((await evidence()).binding?.articleId, undefined);
    assert.equal(articles.length, 1);
    assert.equal(posts('/publish').length, 0);
  });
  it('reconciles an applied publication after a lost response without resubmitting it', async () => {
    publishLost = true;
    await ready();
    await run();
    assert.equal(posts('/publish').length, 1);
    await run();
    assert.equal((await evidence()).publish?.outcome, 'observed');
    publishLost = false;
    await run();
    await run();
    assert.equal(posts('/publish').length, 1);
    assert.equal((await row()).status, 'completed');
  });
  for (const lostResponse of [true, false])
    it(`retains an earlier pending publication across a newer approval (${lostResponse ? 'lost' : 'acknowledged'} response)`, async () => {
      publishNow = false;
      publishLost = lostResponse;
      await ready();
      await run();
      const previous = await evidence();
      assert.ok(previous.publish);
      assert.equal(posts('/publish').length, 1);
      const operation = (await row()).operations.find(value => value.kind === 'figshare:publish');
      assert.ok(operation);

      await ready({ title: 'New approved content' });
      publishLost = false;
      await run();
      assert.equal(posts('/publish').length, 1, 'A private read cannot settle an earlier asynchronous publish');
      assert.deepEqual((await evidence()).publish, previous.publish);
      assert.equal((await row()).operations.find(value => value.id === operation.id)?.outcome, operation.outcome);
      assert.equal((await row()).status, lostResponse ? 'repair_required' : 'waiting');
      assert.equal((await row()).completion, undefined);

      // The original request may finish after the private read. Reconcile that
      // historical outcome before allowing publication of the newly approved content.
      articles[0].is_public = true;
      articles[0].published_date = '2026-10-20';
      articles[0].version = 2;
      if (lostResponse) {
        const pending = await row();
        await runtime.store.request(key, 'synchronise', pending.revision, clock);
      }
      await run();
      if (lostResponse) {
        assert.equal((await row()).operations.find(value => value.id === operation.id)?.outcome, 'confirmed');
        assert.equal(posts('/publish').length, 1);
      }
    });

  it('resumes the same approval after two settled accepted publication resets', async () => {
    publishNow = false;
    await ready();
    await run();
    assign('RecordsService', { getMeta: (oid: string) => mongo.getMeta(oid) });
    const admin = {
      ...runtime,
      db: mongoClient.db(database),
      administrator: async () => ({ username: 'admin', userType: 'local' }),
      revoke: async () => {
        throw new Error('No revocation expected');
      },
    };
    const original = await row();
    for (let attempt = 1; attempt <= 2; attempt++) {
      assert.equal(posts('/publish').length, attempt);
      assert.equal((await evidence()).publish?.outcome, 'accepted');
      const pending = (await row()).operations.findLast(op => op.kind === 'figshare:publish');
      assert.ok(pending);
      clock = Date.now(); // Administrative leases use wall time; the worker fixture advances its due-work clock.
      await administerPublication(admin, {
        action: 'repair',
        ...key,
        username: 'admin',
        repair: 'reset-publish',
        apply: true,
        reason: 'Prior asynchronous publication settled without application',
        parameters: { priorOperationSettled: true, evidenceReference: `incident:accepted-${attempt}` },
      });
      assert.equal((await row()).operations.find(op => op.id === pending.id)?.outcome, 'confirmed');
      assert.equal((await row()).completion, undefined);
      await administerPublication(admin, {
        action: 'resume',
        ...key,
        username: 'admin',
        apply: true,
        reason: 'Retry settled approved publication',
      });
      await run();
      assert.equal(posts('/publish').length, attempt + 1, 'Resume must retry the unchanged approved publication');
      assert.equal((await row()).approvalId, original.approvalId);
      assert.equal((await row()).sourceGeneration, original.sourceGeneration);
    }
    publishNow = true;
    articles[0].is_public = true;
    articles[0].published_date = '2026-10-20';
    articles[0].version = 2;
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal(posts('/publish').length, 3);
    const retired = (await row()).providerState.retiredPublications;
    assert.ok(Array.isArray(retired));
    assert.equal(retired.length, 2);
  });

  it('requires repair for a private uncertain publication instead of repeating a POST', async () => {
    publishNow = false;
    publishLost = true;
    await ready();
    await run();
    await run();
    assert.equal((await row()).status, 'repair_required');
    assert.equal(posts('/publish').length, 1);
    assert.ok((await row()).operations.some(value => value.outcome === 'uncertain'));
  });
  for (const mode of ['immediate', 'afterUploadsComplete', 'manual'])
    it(`waits for confirmed publication in ${mode} mode without consuming failure attempts`, async () => {
      config.destinations.main.providerOptions.article = { publishMode: mode };
      publishNow = false;
      await ready();
      await run();
      await run();
      assert.equal((await row()).status, 'waiting');
      assert.equal((await row()).retry, undefined);
      assert.equal(posts('/publish').length, mode === 'manual' ? 0 : 1);
      articles[0].is_public = true;
      articles[0].published_date = '2026-10-19';
      articles[0].version = 2;
      await run();
      assert.equal((await row()).status, 'completed');
    });
  it('freezes metadata, files, embargo and publication under a curation lock', async () => {
    config.destinations.main.providerOptions.article = {
      curationLock: { enabled: true, statusField: 'curation', targetValue: 'locked' },
    };
    afterCreate = async () => {
      articles[0].curation = 'locked';
    };
    await ready();
    await run();
    assert.equal((await row()).waitingReason, 'curation');
    assert.equal(requests.filter(value => value.method === 'PUT').length, 0);
    assert.equal(posts('/publish').length, 0);
    articles[0].curation = 'open';
    await run();
    assert.equal((await row()).status, 'completed');
  });
  it('uploads sealed bytes, retains receipts, leaves foreign files and strips uploader credentials', async () => {
    config.destinations.main.attachments = { assets: { enableHostedFiles: true } };
    afterCreate = async () => {
      articles[0].files = [{ id: 800, name: 'foreign', size: 1, status: 'available' }];
    };
    await ready({ dataLocations: [{ type: 'attachment', selected: true, fileId: 'local', name: 'bytes.csv' }] });
    await run();
    assert.equal((await row()).status, 'completed');
    assert.deepEqual([...partBytes.values()], [bytes]);
    const receipts = (await evidence()).receipts;
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].digest, hashes(bytes).sha);
    assert.equal(receipts[0].state, 'available');
    assert.ok(
      Array.isArray(articles[0].files) &&
        articles[0].files.some(value => isPublicationObject(value) && value.id === 800)
    );
    assert.ok(
      requests
        .filter(value => value.path.startsWith('/upload'))
        .every(value => !value.token && !value.query.has('impersonate'))
    );
  });
  it('skips unchanged uploads across fresh approvals and deletes only deselected receipt-owned files', async () => {
    config.destinations.main.attachments = { assets: { enableHostedFiles: true } };
    afterCreate = async () => {
      articles[0].files = [{ id: 800, name: 'foreign', size: 1, status: 'available' }];
    };
    const dataLocations = [{ type: 'attachment', selected: true, fileId: 'local', name: 'bytes.csv' }];
    await ready({ dataLocations });
    await run();
    const original = (await evidence()).receipts[0];
    await ready({ dataLocations });
    await run();
    assert.equal(posts('/files').length, 1);
    assert.equal((await evidence()).receipts[0].fileId, original.fileId);
    await ready({ dataLocations: [] });
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal((await evidence()).receipts[0].state, 'removed');
    const deleted = requests.filter(value => value.method === 'DELETE');
    assert.equal(deleted.length, 1);
    assert.ok(deleted[0].path.endsWith(`/files/${original.fileId}`));
    assert.ok(
      Array.isArray(articles[0].files) &&
        articles[0].files.some(value => isPublicationObject(value) && value.id === 800)
    );
  });
  it('never initializes a second file after losing its lease across the initialization response', async () => {
    config.destinations.main.attachments = { assets: { enableHostedFiles: true } };
    await ready({ dataLocations: [{ type: 'attachment', selected: true, fileId: 'local', name: 'bytes.csv' }] });
    afterFileInit = async () => {
      await runtime.store.collection.updateOne(key, {
        $set: { 'lease.token': 'other', 'lease.expiresAt': clock + 1000000 },
        $inc: { revision: 1 },
      });
    };
    await run();
    assert.equal(posts('/files').length, 1);
    await runtime.store.collection.updateOne(key, { $set: { 'lease.expiresAt': clock - 1 } });
    await run();
    assert.equal((await row()).status, 'repair_required');
    assert.equal(posts('/files').length, 1);
    assert.equal((await evidence()).receipts[0].state, 'initialising');
  });
  it('verifies multipart completion before resuming its own interrupted upload without a second file', async () => {
    config.destinations.main.attachments = { assets: { enableHostedFiles: true } };
    await ready({ dataLocations: [{ type: 'attachment', selected: true, fileId: 'local', name: 'bytes.csv' }] });
    failPartOnce = true;
    await run();
    assert.equal((await evidence()).receipts[0].resumeApproved, true);
    await run();
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal(posts('/files').length, 1);
    assert.equal(requests.filter(value => value.path.startsWith('/upload') && value.method === 'PUT').length, 1);
    assert.equal((await evidence()).receipts[0].state, 'available');
  });
  // Enumerate actual journal/send/checkpoint interruptions, rather than synthesizing
  // combinations that cannot occur under the host's reconciliation barrier.
  for (const kind of [
    'create',
    'metadata',
    'embargo',
    'embargo_clear',
    'file_init',
    'upload_part',
    'file_complete',
    'file_delete',
    'publish',
  ] as const) {
    for (const boundary of ['intent-unsent', 'submitted', 'uncertain', 'confirmed'] as const) {
      it(`state matrix ${kind}/${boundary}: identity, repair, progress and exactly one send`, async () => {
        config.destinations.main.attachments = { assets: { enableHostedFiles: true } };
        config.destinations.main.providerOptions.embargo = {
          mode: 'recordDriven',
          accessRights: {
            accessRights: { kind: 'path', path: 'metadata.embargoed' },
            embargoType: { kind: 'path', path: 'metadata.embargoType' },
            fullEmbargoUntil: { kind: 'path', path: 'metadata.until' },
            reason: { kind: 'path', path: 'metadata.reason' },
          },
        };
        const metadata = {
          title: 'Approved matrix content',
          embargoed: true,
          embargoType: 'file',
          until: '2030-01-01',
          reason: 'Approved',
          dataLocations: [{ type: 'attachment', selected: true, fileId: 'local', name: 'bytes.csv' }],
        };
        if (kind === 'file_delete' || kind === 'embargo_clear') {
          await ready(metadata);
          await run();
          assert.equal((await row()).status, 'completed');
          await ready({ ...metadata, embargoed: false, dataLocations: [] });
        } else await ready(metadata);
        const priorCompletion = (await row()).completion;
        const journal = runtime.store.journal.bind(runtime.store);
        let interrupted = false;
        runtime.store.journal = async (...args) => {
          const operation = args[3];
          if (
            !interrupted &&
            operation.kind === `figshare:${kind}` &&
            operation.outcome === (boundary === 'intent-unsent' ? 'submitted' : 'confirmed')
          ) {
            interrupted = true;
            if (boundary === 'intent-unsent' || boundary === 'confirmed') await journal(...args);
            // The uncertain outcome represents a lost response after the remote effect.
            if (boundary === 'uncertain')
              await journal(args[0], args[1], args[2], { ...operation, outcome: 'uncertain' });
            await runtime.store.collection.updateOne(key, { $set: { 'lease.expiresAt': 0 } });
            throw new PublicationLeaseLost();
          }
          const saved = await journal(...args);
          if (operation.outcome === 'submitted') {
            assert.match(operation.idempotencyKey ?? '', /^rbpub-v1-[a-f0-9]{64}$/);
            assert.equal(saved.operations.find(op => op.id === operation.id)?.idempotencyKey, operation.idempotencyKey);
          }
          return saved;
        };
        try {
          await run();
        } finally {
          runtime.store.journal = journal;
        }
        assert.equal(interrupted, true, 'The selected real interruption boundary must execute');
        let pending = (await row()).operations.findLast(op => op.kind === `figshare:${kind}`);
        assert.ok(pending);
        const operationKey = publicationOperationIdempotencyKey(await row(), pending);
        assert.equal(pending.idempotencyKey, operationKey);
        assert.match(operationKey, /^rbpub-v1-[a-f0-9]{64}$/);
        assert.equal(runtime.registry.get('figshare')?.mutationRecovery.mode, 'no-remote-lookup');
        assert.equal(pending.outcome, boundary === 'intent-unsent' ? 'submitted' : boundary);
        assert.notEqual(pending.checkpointed, true);
        assert.deepEqual((await row()).completion, priorCompletion);
        assign('RecordsService', { getMeta: (oid: string) => mongo.getMeta(oid) });
        const admin = {
          ...runtime,
          db: mongoClient.db(database),
          administrator: async () => ({ username: 'admin', userType: 'local' }),
          revoke: async () => {
            throw new Error('No revocation expected');
          },
        };
        const mutations = () => requests.filter(request => !['GET', 'HEAD'].includes(request.method)).length;
        const beforeRecovery = mutations();
        const blockedOperations = (await row()).operations;
        // Owner transfer is observable independently of the matching payload/file/version.
        // A token account and a successful read do not establish the retained owner.
        if (articles.length) {
          for (const owner of [999, undefined]) {
            if (owner === undefined) delete articles[0].account_id;
            else articles[0].account_id = owner;
            await run();
            assert.equal((await row()).status, 'repair_required');
            assert.deepEqual(
              (await row()).operations,
              blockedOperations,
              'Identity mismatch must not confirm any operation'
            );
            assert.notEqual((await row()).operations.find(op => op.id === pending!.id)?.checkpointed, true);
            assert.equal(mutations(), beforeRecovery);
            assert.deepEqual((await row()).completion, priorCompletion);
          }
          articles[0].account_id = 1;
        }
        const repair = async (id: string, parameters: PublicationObject) => {
          clock = Date.now();
          const options = {
            ...key,
            action: 'repair' as const,
            repair: id,
            username: 'admin',
            reason: 'Exact stopped operation and provider evidence verified',
            parameters: {
              ...parameters,
              priorOperationSettled: true,
              evidenceReference: `matrix:${kind}:${boundary}`,
            },
          };
          const before = await row();
          if (boundary === 'intent-unsent' && ['metadata', 'embargo', 'embargo_clear'].includes(kind)) {
            const attestation = {
              ...options,
              repair: 'attest-operation',
              parameters: {
                ...options.parameters,
                providerRepair: id,
                operationId: pending!.id,
                intendedDigest: pending!.intendedDigest,
                idempotencyKey: operationKey,
                outcome: 'not_applied',
                nonApplicationVerified: true,
              },
            };
            await assert.rejects(
              administerPublication(admin, {
                ...attestation,
                apply: true,
                parameters: { ...attestation.parameters, intendedDigest: 'wrong-digest' },
              }),
              /exact operation/
            );
            await administerPublication(admin, attestation);
            assert.deepEqual((await row()).operations, before.operations);
            await administerPublication(admin, { ...attestation, apply: true });
            assert.ok((await row()).operations.find(op => op.id === pending!.id)?.evidence.operatorAttestation);
            assert.equal(mutations(), beforeRecovery);
          }
          const beforeDirectRepair = await row();
          await administerPublication(admin, options);
          assert.deepEqual((await row()).providerState, beforeDirectRepair.providerState);
          assert.deepEqual((await row()).operations, beforeDirectRepair.operations);
          await administerPublication(admin, { ...options, apply: true });
          const applied = await row();
          if (id === 'abandon-create' || id === 'reset-publish') {
            await assert.rejects(
              administerPublication(admin, { ...options, apply: true }),
              /No unbound uncertain create|No unconfirmed publication/
            );
            assert.deepEqual((await row()).providerState, applied.providerState);
            assert.deepEqual((await row()).operations, applied.operations);
          } else await administerPublication(admin, { ...options, apply: true });
          assert.equal(mutations(), beforeRecovery, 'Repairs are read-only at the provider');
          assert.deepEqual((await row()).completion, priorCompletion);
        };
        const receipt = (await evidence()).receipts.find(value => value.key === pending.evidence.receiptKey);
        if (boundary === 'intent-unsent') {
          if (kind === 'create') await repair('abandon-create', {});
          else if (kind === 'publish') await repair('reset-publish', {});
          else if (['metadata', 'embargo', 'embargo_clear'].includes(kind))
            await repair('settle-unapplied-update', {
              operationId: pending.id,
              intendedDigest: pending.intendedDigest,
              nonApplicationVerified: true,
            });
          else if (kind !== 'upload_part') {
            assert.ok(receipt);
            await repair('settle-file-operation', { operationId: pending.id, receipt: receipt.key });
          }
        }
        if ((kind === 'file_init' && boundary !== 'intent-unsent') || kind === 'upload_part') {
          assert.ok(receipt);
          assert.ok(Array.isArray(articles[0].files));
          const initialized = articles[0].files.find(isPublicationObject);
          const fileId = receipt.fileId ?? pending.evidence.fileId ?? String(initialized?.id ?? '');
          assert.equal(typeof fileId, 'string');
          // The same operator command must also refuse a changed owner.
          articles[0].account_id = 999;
          clock = Date.now();
          await assert.rejects(
            administerPublication(admin, {
              ...key,
              action: 'repair',
              repair: 'resume-upload',
              username: 'admin',
              apply: true,
              reason: 'Owner mismatch must refuse',
              parameters: {
                receipt: receipt.key,
                fileId,
                priorOperationSettled: true,
                evidenceReference: 'wrong-owner',
              },
            }),
            /owner|identity/i
          );
          articles[0].account_id = 1;
          await repair('resume-upload', { receipt: receipt.key, fileId });
        }
        // Read-back incorporates applied operations; unsent intents need the exact
        // supported non-application repair above. Resume cannot bypass either gate.
        clock = Date.now();
        await administerPublication(admin, {
          ...key,
          action: 'resume',
          username: 'admin',
          apply: true,
          reason: 'Continue verified request',
        });
        for (let attempt = 0; attempt < 4 && (await row()).status !== 'completed'; attempt++) await run();
        const final = await row();
        assert.equal(final.status, 'completed', final.waitingReason);
        pending = final.operations.find(op => op.id === pending!.id);
        assert.ok(pending);
        assert.equal(pending.outcome, boundary === 'intent-unsent' ? 'not_applied' : 'confirmed');
        assert.equal(publicationOperationIdempotencyKey(final, pending), operationKey);
        assert.equal(
          new Set(final.operations.map(op => publicationOperationIdempotencyKey(final, op))).size,
          final.operations.length
        );
        if (pending.outcome === 'confirmed') assert.equal(pending.checkpointed, true);
        assert.equal(articles.length, 1);
        assert.equal(posts('/files').length, 1);
        assert.equal(
          requests.filter(request => request.method === 'PUT' && request.path.startsWith('/upload')).length,
          1
        );
        assert.equal(posts('/publish').length, ['file_delete', 'embargo_clear'].includes(kind) ? 2 : 1);
        const second = ['file_delete', 'embargo_clear'].includes(kind);
        assert.equal(
          requests.filter(request => request.method === 'PUT' && /^\/account\/articles\/\d+$/.test(request.path))
            .length,
          1
        );
        assert.equal(
          requests.filter(request => request.method === 'PUT' && request.path.endsWith('/embargo')).length,
          1
        );
        assert.equal(
          requests.filter(request => request.method === 'DELETE' && request.path.endsWith('/embargo')).length,
          second ? 1 : 0
        );
        assert.equal(
          requests.filter(request => request.method === 'DELETE' && request.path.includes('/files/')).length,
          second ? 1 : 0
        );
        assert.equal(
          requests.filter(request => request.method === 'POST' && /\/files\/\d+$/.test(request.path)).length,
          1
        );
      });
    }
  }
  it('resumes an incomplete upload after losing the confirmed initialization checkpoint', async () => {
    config.destinations.main.attachments = { assets: { enableHostedFiles: true } };
    await ready({ dataLocations: [{ type: 'attachment', selected: true, fileId: 'local', name: 'bytes.csv' }] });
    const checkpoint = runtime.store.checkpointProviderState.bind(runtime.store);
    runtime.store.checkpointProviderState = async (...args) => {
      const current = await row();
      if (current.operations.some(op => op.kind === 'figshare:file_init' && op.outcome === 'confirmed'))
        throw new Error('Simulated checkpoint outage after file initialization');
      return checkpoint(...args);
    };
    try {
      await run();
    } finally {
      runtime.store.checkpointProviderState = checkpoint;
    }
    const pending = (await row()).operations.find(op => op.kind === 'figshare:file_init');
    assert.ok(pending);
    assert.equal(pending.outcome, 'confirmed');
    assert.equal(pending.checkpointed, undefined);
    assert.equal((await evidence()).receipts[0].fileId, undefined);
    assert.equal(posts('/files').length, 1);
    assert.equal(partBytes.size, 0);
    await run();
    assert.equal((await row()).status, 'repair_required');
    assign('RecordsService', { getMeta: (oid: string) => mongo.getMeta(oid) });
    const admin = {
      ...runtime,
      db: mongoClient.db(database),
      administrator: async () => ({ username: 'admin', userType: 'local' }),
      revoke: async () => {
        throw new Error('No revocation expected');
      },
    };
    const options = {
      action: 'repair' as const,
      ...key,
      username: 'admin',
      repair: 'resume-upload',
      reason: 'Verified stopped uploader and exact initialized file',
      parameters: {
        receipt: (await evidence()).receipts[0].key,
        fileId: String(pending.evidence.fileId),
        priorOperationSettled: true,
        evidenceReference: 'incident:initialization',
      },
    };
    clock = Date.now();
    assert.ok(Array.isArray(articles[0].files));
    const initialized = articles[0].files.find(isPublicationObject);
    assert.ok(initialized);
    articles[0].files.push({ ...initialized, id: 999, status: 'available', computed_md5: initialized.supplied_md5 });
    const beforeConflict = await row();
    for (const apply of [false, true]) {
      await assert.rejects(
        administerPublication(admin, {
          ...options,
          apply,
          parameters: { ...options.parameters, fileId: '999' },
        }),
        /initialization journal/
      );
      assert.deepEqual((await row()).providerState, beforeConflict.providerState);
      assert.deepEqual((await row()).operations, beforeConflict.operations);
    }
    await administerPublication(admin, options);
    assert.equal((await row()).operations.find(op => op.id === pending.id)?.checkpointed, undefined);
    await administerPublication(admin, { ...options, apply: true });
    assert.equal((await row()).operations.find(op => op.id === pending.id)?.checkpointed, true);
    assert.equal((await evidence()).receipts[0].fileId, String(pending.evidence.fileId));
    assert.equal((await row()).completion, undefined);
    await administerPublication(admin, { ...options, apply: true });
    await administerPublication(admin, {
      ...key,
      action: 'resume',
      username: 'admin',
      apply: true,
      reason: options.reason,
    });
    await run();
    assert.equal((await row()).status, 'completed');
    assert.ok(
      articles[0].files.some(file => isPublicationObject(file) && file.id === 999),
      'Foreign identical file is retained'
    );
    assert.equal(posts('/files').length, 1);
    assert.equal(requests.filter(value => value.path.startsWith('/upload') && value.method === 'PUT').length, 1);
    assert.deepEqual([...partBytes.values()], [bytes]);
    const corrections = await mongoClient
      .db(database)
      .collection('publicationcorrection')
      .find({ ...key, action: 'repair' })
      .toArray();
    assert.equal(corrections.length, 2);
    assert.ok(
      corrections.every(
        correction =>
          correction.status === 'applied' && correction.evidenceReference === options.parameters.evidenceReference
      )
    );
  });
  for (const kind of ['file_init', 'file_complete', 'file_delete']) {
    it(`repairs a stopped-before-send ${kind} only after exact settled non-application`, async () => {
      config.destinations.main.attachments = { assets: { enableHostedFiles: true } };
      const dataLocations = [{ type: 'attachment', selected: true, fileId: 'local', name: 'bytes.csv' }];
      await ready({ dataLocations });
      if (kind === 'file_delete') {
        await run();
        assert.equal((await row()).status, 'completed');
        await ready({ dataLocations: [] });
      }
      const journal = runtime.store.journal.bind(runtime.store);
      let intercepted = false;
      runtime.store.journal = async (...args) => {
        const saved = await journal(...args);
        if (!intercepted && args[3].kind === `figshare:${kind}` && args[3].outcome === 'submitted') {
          intercepted = true;
          await runtime.store.collection.updateOne(key, {
            $set: { 'lease.token': 'stopped-before-send', 'lease.expiresAt': clock + 1000000 },
            $inc: { revision: 1 },
          });
        }
        return saved;
      };
      try {
        await run();
      } finally {
        runtime.store.journal = journal;
      }
      assert.equal(intercepted, true);
      const operation = (await row()).operations.find(
        op => op.kind === `figshare:${kind}` && op.outcome === 'submitted'
      );
      assert.ok(operation);
      const receipt = (await evidence()).receipts[0];
      const sentBefore = requests.filter(request => request.method !== 'GET').length;
      await runtime.store.collection.updateOne(key, { $set: { 'lease.expiresAt': clock - 1 } });
      await run();
      assert.equal((await row()).status, 'repair_required');
      assert.equal((await row()).operations.find(op => op.id === operation.id)?.outcome, 'submitted');
      assert.equal(requests.filter(request => request.method !== 'GET').length, sentBefore);
      assign('RecordsService', { getMeta: (oid: string) => mongo.getMeta(oid) });
      const admin = {
        ...runtime,
        db: mongoClient.db(database),
        administrator: async () => ({ username: 'admin', userType: 'local' }),
        revoke: async () => {
          throw new Error('No revocation expected');
        },
      };
      const options = {
        action: 'repair' as const,
        ...key,
        username: 'admin',
        repair: 'settle-file-operation',
        reason: 'Verified former request settled without application',
        parameters: {
          operationId: operation.id,
          receipt: receipt.key,
          priorOperationSettled: true,
          evidenceReference: `incident:${kind}-not-sent`,
        },
      };
      clock = Date.now();
      await assert.rejects(
        administerPublication(admin, {
          ...options,
          apply: true,
          parameters: { ...options.parameters, priorOperationSettled: false },
        }),
        /settlement evidence/
      );
      const beforeRepair = await row();
      await assert.rejects(
        administerPublication(admin, {
          ...options,
          apply: true,
          parameters: { ...options.parameters, receipt: 'foreign' },
        }),
        /consistent owned receipt/
      );
      assert.ok(Array.isArray(articles[0].files));
      const retainedFiles = articles[0].files;
      if (kind === 'file_init') articles[0].files = [{ name: receipt.name, id: 999, status: 'created' }];
      else
        articles[0].files = retainedFiles
          .filter(isPublicationObject)
          .map(file => ({ ...file, size: receipt.size + 1 }));
      await assert.rejects(
        administerPublication(admin, { ...options, apply: true }),
        kind === 'file_init' ? /possible initialized file/ : /does not prove non-application/
      );
      articles[0].files = retainedFiles;
      await runtime.store.collection.updateOne(
        key,
        { $set: { 'operations.$[op].outcome': 'confirmed' } },
        { arrayFilters: [{ 'op.id': operation.id }] }
      );
      await assert.rejects(
        administerPublication(admin, { ...options, apply: true }),
        /exact unresolved file operation/
      );
      await runtime.store.collection.updateOne(
        key,
        { $set: { 'operations.$[op].outcome': 'submitted' } },
        { arrayFilters: [{ 'op.id': operation.id }] }
      );
      assert.deepEqual((await row()).providerState, beforeRepair.providerState);
      assert.deepEqual((await row()).operations, beforeRepair.operations);
      await administerPublication(admin, options);
      assert.equal((await row()).operations.find(op => op.id === operation.id)?.outcome, 'submitted');
      await administerPublication(admin, { ...options, apply: true });
      assert.equal((await row()).operations.find(op => op.id === operation.id)?.outcome, 'not_applied');
      await administerPublication(admin, { ...options, apply: true });
      assert.equal(requests.filter(request => request.method !== 'GET').length, sentBefore);
      assert.deepEqual((await row()).completion, beforeRepair.completion);
      await administerPublication(admin, {
        ...key,
        action: 'resume',
        username: 'admin',
        apply: true,
        reason: options.reason,
      });
      await run();
      assert.equal((await row()).status, 'completed');
      assert.equal(posts('/files').length, 1);
      assert.equal(
        requests.filter(request => request.path.startsWith('/upload') && request.method === 'PUT').length,
        1
      );
      assert.equal(requests.filter(request => request.method === 'DELETE').length, kind === 'file_delete' ? 1 : 0);
      assert.equal(posts('/publish').length, kind === 'file_delete' ? 2 : 1);
      if (kind === 'file_init') assert.ok(Array.isArray((await row()).providerState.retiredFileInitializations));
      const correction = await mongoClient
        .db(database)
        .collection('publicationcorrection')
        .findOne({ ...key, evidenceReference: options.parameters.evidenceReference });
      assert.equal(correction?.status, 'applied');
    });
  }
  it('repairs a linked-file initialization intent stopped before its host journal', async () => {
    config.destinations.main.attachments = { assets: { enableHostedFiles: false, enableLinkFiles: true } };
    const link = 'https://approved.test/stopped-before-journal';
    await ready({ dataLocations: [{ type: 'url', location: link, selected: true }] });
    const checkpoint = runtime.store.checkpointProviderState.bind(runtime.store);
    let stopped = false;
    runtime.store.checkpointProviderState = async (...args) => {
      const saved = await checkpoint(...args);
      if (
        !stopped &&
        decodeFigshareLegacy(saved.providerState.legacy).receipts.some(receipt => receipt.state === 'initialising')
      ) {
        stopped = true;
        await runtime.store.collection.updateOne(key, {
          $set: { 'lease.token': 'stopped-before-journal', 'lease.expiresAt': clock + 1000000 },
          $inc: { revision: 1 },
        });
      }
      return saved;
    };
    try {
      await run();
    } finally {
      runtime.store.checkpointProviderState = checkpoint;
    }
    assert.equal(stopped, true);
    assert.equal(
      (await row()).operations.some(op => op.kind === 'figshare:file_init'),
      false
    );
    assert.equal(posts('/files').length, 0);
    await runtime.store.collection.updateOne(key, { $set: { 'lease.expiresAt': clock - 1 } });
    await run();
    assert.equal((await row()).status, 'repair_required');
    assign('RecordsService', { getMeta: (oid: string) => mongo.getMeta(oid) });
    const admin = {
      ...runtime,
      db: mongoClient.db(database),
      administrator: async () => ({ username: 'admin', userType: 'local' }),
      revoke: async () => {
        throw new Error('No revocation expected');
      },
    };
    const options = {
      ...key,
      action: 'repair' as const,
      username: 'admin',
      repair: 'settle-file-operation',
      reason: 'Verified initialization intent stopped before host journal',
      parameters: {
        receipt: (await evidence()).receipts[0].key,
        priorOperationSettled: true,
        evidenceReference: 'incident:before-file-journal',
      },
    };
    clock = Date.now();
    const before = await row();
    await administerPublication(admin, options);
    assert.deepEqual((await row()).providerState, before.providerState);
    await administerPublication(admin, { ...options, apply: true });
    assert.equal((await evidence()).receipts.length, 0);
    assert.deepEqual((await row()).operations, before.operations);
    await administerPublication(admin, { ...options, apply: true });
    await administerPublication(admin, {
      ...key,
      action: 'resume',
      username: 'admin',
      apply: true,
      reason: options.reason,
    });
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal(posts('/files').length, 1);
    assert.equal(posts('/publish').length, 1);
    assert.equal(partBytes.size, 0);
  });
  for (const kind of ['metadata', 'embargo', 'embargo_clear']) {
    it(`settles a stopped-before-send ${kind} with an exact external non-application receipt`, async () => {
      if (kind !== 'metadata')
        config.destinations.main.providerOptions.embargo = {
          mode: 'recordDriven',
          accessRights: {
            accessRights: { kind: 'path', path: 'metadata.embargoed' },
            embargoType: { kind: 'path', path: 'metadata.embargoType' },
            fullEmbargoUntil: { kind: 'path', path: 'metadata.until' },
            reason: { kind: 'path', path: 'metadata.reason' },
          },
        };
      if (kind === 'embargo_clear')
        afterCreate = async () => {
          articles[0].is_embargoed = true;
        };
      await ready({
        embargoed: kind !== 'embargo_clear',
        embargoType: 'file',
        until: '2030-01-01',
        reason: 'Approved embargo',
      });
      const journal = runtime.store.journal.bind(runtime.store);
      let stopped = false;
      runtime.store.journal = async (...args) => {
        const saved = await journal(...args);
        if (!stopped && args[3].kind === `figshare:${kind}` && args[3].outcome === 'submitted') {
          stopped = true;
          await runtime.store.collection.updateOne(key, {
            $set: { 'lease.token': 'update-stopped-before-send', 'lease.expiresAt': clock + 1000000 },
            $inc: { revision: 1 },
          });
        }
        return saved;
      };
      try {
        await run();
      } finally {
        runtime.store.journal = journal;
      }
      assert.equal(stopped, true);
      const operation = (await row()).operations.find(
        op => op.kind === `figshare:${kind}` && op.outcome === 'submitted'
      );
      assert.ok(operation);
      await runtime.store.collection.updateOne(key, { $set: { 'lease.expiresAt': clock - 1 } });
      await run();
      assert.equal((await row()).status, 'repair_required');
      const before = await row();
      const mutations = requests.filter(request => request.method !== 'GET').length;
      assign('RecordsService', { getMeta: (oid: string) => mongo.getMeta(oid) });
      const admin = {
        ...runtime,
        db: mongoClient.db(database),
        administrator: async () => ({ username: 'admin', userType: 'local' }),
        revoke: async () => {
          throw new Error('No revocation expected');
        },
      };
      const options = {
        ...key,
        action: 'repair' as const,
        username: 'admin',
        repair: 'settle-unapplied-update',
        reason: 'Verified exact external receipt proving request did not apply',
        parameters: {
          operationId: operation.id,
          intendedDigest: operation.intendedDigest,
          priorOperationSettled: true,
          nonApplicationVerified: true,
          evidenceReference: `incident:${kind}-not-applied`,
        },
      };
      clock = Date.now();
      await assert.rejects(
        administerPublication(admin, {
          ...options,
          apply: true,
          parameters: { ...options.parameters, nonApplicationVerified: false },
        }),
        /verified non-application/
      );
      await assert.rejects(
        administerPublication(admin, {
          ...options,
          apply: true,
          parameters: { ...options.parameters, intendedDigest: 'foreign' },
        }),
        /verified non-application/
      );
      await runtime.store.collection.updateOne(
        key,
        { $set: { 'operations.$[op].outcome': 'confirmed' } },
        { arrayFilters: [{ 'op.id': operation.id }] }
      );
      await assert.rejects(administerPublication(admin, { ...options, apply: true }), /confirmed operation/);
      await runtime.store.collection.updateOne(
        key,
        { $set: { 'operations.$[op].outcome': 'submitted' } },
        { arrayFilters: [{ 'op.id': operation.id }] }
      );
      await administerPublication(admin, options);
      assert.deepEqual((await row()).operations, before.operations);
      await administerPublication(admin, { ...options, apply: true });
      await administerPublication(admin, { ...options, apply: true });
      assert.equal((await row()).operations.find(op => op.id === operation.id)?.outcome, 'not_applied');
      assert.deepEqual((await row()).providerState, before.providerState);
      assert.deepEqual((await row()).completion, before.completion);
      assert.equal(requests.filter(request => request.method !== 'GET').length, mutations);
      await administerPublication(admin, {
        ...key,
        action: 'resume',
        username: 'admin',
        apply: true,
        reason: options.reason,
      });
      await run();
      assert.equal((await row()).status, 'completed');
      assert.equal(posts('/publish').length, 1);
      const updateRequests = requests.filter(request =>
        kind === 'metadata'
          ? request.path === '/account/articles/51' && request.method === 'PUT'
          : request.path.endsWith('/embargo') && request.method === (kind === 'embargo' ? 'PUT' : 'DELETE')
      );
      assert.equal(updateRequests.length, 1);
      const correction = await mongoClient
        .db(database)
        .collection('publicationcorrection')
        .findOne({ ...key, evidenceReference: options.parameters.evidenceReference });
      assert.equal(correction?.status, 'applied');
    });
  }
  it('rejects selected bytes changed after approval before creating an article', async () => {
    config.destinations.main.attachments = { assets: { enableHostedFiles: true } };
    await ready({ dataLocations: [{ type: 'attachment', selected: true, fileId: 'local', name: 'bytes.csv' }] });
    bytes = Buffer.alloc(bytes.length, 'x');
    await run();
    assert.equal((await row()).status, 'superseded');
    assert.equal(articles.length, 0);
  });
  it('fences publication after source change during metadata HTTP', async () => {
    await ready();
    afterUpdate = async () => {
      const record = await mongo.getMeta(key.oid);
      record.metadata.title = 'new source';
      await mongo.updateMeta(brand, key.oid, record);
    };
    await run();
    assert.equal(posts('/publish').length, 0);
    assert.equal((await row()).status, 'revoked');
    assert.equal(articles.length, 1);
  });
  it('prevents the replaced lease owner from publishing and lets its successor reconcile metadata', async () => {
    await ready();
    afterUpdate = async () => {
      await runtime.store.collection.updateOne(key, {
        $set: { 'lease.token': 'replacement', 'lease.expiresAt': clock + 1000000 },
        $inc: { revision: 1 },
      });
    };
    await run();
    assert.equal(posts('/publish').length, 0);
    await runtime.store.collection.updateOne(key, { $set: { 'lease.expiresAt': clock - 1 } });
    await run();
    await run();
    assert.equal(articles.length, 1);
    assert.equal(posts('/publish').length, 1);
    assert.equal((await row()).status, 'completed');
  });
  it('settles historical metadata while a later repaired upload remains incomplete', async () => {
    config.destinations.main.attachments = { assets: { enableHostedFiles: true } };
    await ready({ title: 'First title', dataLocations: [] });
    await run();
    const old = (await row()).operations.find(op => op.kind === 'figshare:metadata');
    assert.ok(old);
    await ready({
      title: 'Second title',
      dataLocations: [{ type: 'attachment', selected: true, fileId: 'local', name: 'bytes.csv' }],
    });
    const checkpoint = runtime.store.checkpointProviderState.bind(runtime.store);
    runtime.store.checkpointProviderState = async (...args) => {
      if ((await row()).operations.some(op => op.kind === 'figshare:file_init' && op.outcome === 'confirmed'))
        throw new Error('Lost initialization checkpoint');
      return checkpoint(...args);
    };
    try {
      await run();
    } finally {
      runtime.store.checkpointProviderState = checkpoint;
    }
    const init = (await row()).operations.find(op => op.kind === 'figshare:file_init');
    assert.ok(init);
    assign('RecordsService', { getMeta: (oid: string) => mongo.getMeta(oid) });
    const admin = {
      ...runtime,
      db: mongoClient.db(database),
      administrator: async () => ({ username: 'admin', userType: 'local' }),
      revoke: async () => {
        throw new Error('No revocation expected');
      },
    };
    clock = Date.now();
    await administerPublication(admin, {
      action: 'repair',
      ...key,
      username: 'admin',
      repair: 'resume-upload',
      apply: true,
      reason: 'Stopped uploader and verified initialized file',
      parameters: {
        receipt: (await evidence()).receipts[0].key,
        fileId: String(init.evidence.fileId),
        priorOperationSettled: true,
        evidenceReference: 'incident:later-upload',
      },
    });
    assert.equal((await evidence()).receipts[0].state, 'uploading');
    await runtime.store.collection.updateOne(
      key,
      { $unset: { 'operations.$[operation].checkpointed': '' } },
      { arrayFilters: [{ 'operation.id': old.id }] }
    );
    await administerPublication(admin, {
      action: 'resume',
      ...key,
      username: 'admin',
      apply: true,
      reason: 'Continue approved upload after correction',
    });
    await run();
    assert.equal((await row()).waitingReason, 'reconciled');
    assert.equal((await row()).operations.find(op => op.id === old.id)?.checkpointed, true);
    assert.equal(partBytes.size, 0);
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal(posts('/files').length, 1);
    assert.equal(requests.filter(value => value.path.startsWith('/upload') && value.method === 'PUT').length, 1);
  });
  it('settles an older observed publication while a newer publication still awaits its version', async () => {
    await ready({ title: 'First title' });
    await run();
    const old = (await row()).operations.find(op => op.kind === 'figshare:publish');
    assert.ok(old);
    publishNow = false;
    await ready({ title: 'Second title' });
    await run();
    assert.equal((await row()).waitingReason, 'publication_confirmation');
    assert.equal((await evidence()).publish?.outcome, 'accepted');
    await runtime.store.collection.updateOne(
      key,
      { $unset: { 'operations.$[operation].checkpointed': '' } },
      { arrayFilters: [{ 'operation.id': old.id }] }
    );
    await run();
    assert.equal((await row()).waitingReason, 'reconciled');
    assert.equal((await row()).operations.find(op => op.id === old.id)?.checkpointed, true);
    await run();
    assert.equal((await row()).waitingReason, 'publication_confirmation');
    assert.equal(posts('/publish').length, 2);
    articles[0].version = Number(articles[0].version) + 1;
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal(posts('/publish').length, 2);
  });
  for (const cli of [false, true]) {
    it(`recovers linked-file initialization without a checksum (${cli ? 'CLI' : 'automatic'})`, async () => {
      config.destinations.main.attachments = { assets: { enableHostedFiles: false, enableLinkFiles: true } };
      const link = 'https://approved.test/data.csv';
      await ready({ dataLocations: [{ type: 'url', location: link, selected: true }] });
      const checkpoint = runtime.store.checkpointProviderState.bind(runtime.store);
      runtime.store.checkpointProviderState = async (...args) => {
        if ((await row()).operations.some(op => op.kind === 'figshare:file_init' && op.outcome === 'confirmed'))
          throw new Error('Lost linked-file initialization checkpoint');
        return checkpoint(...args);
      };
      try {
        await run();
      } finally {
        runtime.store.checkpointProviderState = checkpoint;
      }
      const init = (await row()).operations.find(op => op.kind === 'figshare:file_init');
      assert.ok(init);
      assert.equal((await evidence()).receipts[0].fileId, undefined);
      if (cli) {
        assign('RecordsService', { getMeta: (oid: string) => mongo.getMeta(oid) });
        const admin = {
          ...runtime,
          db: mongoClient.db(database),
          administrator: async () => ({ username: 'admin', userType: 'local' }),
          revoke: async () => {
            throw new Error('No revocation expected');
          },
        };
        const options = {
          action: 'repair' as const,
          ...key,
          username: 'admin',
          repair: 'bind-file',
          reason: 'Verified exact initialized link identity',
          parameters: { receipt: (await evidence()).receipts[0].key, fileId: String(init.evidence.fileId) },
        };
        assert.ok(Array.isArray(articles[0].files));
        const file = articles[0].files.find(isPublicationObject);
        assert.ok(file);
        file.download_url = 'https://foreign.test/other';
        clock = Date.now();
        await assert.rejects(administerPublication(admin, { ...options, apply: true }), /does not match/);
        assert.equal((await row()).operations.find(op => op.id === init.id)?.checkpointed, undefined);
        file.download_url = link;
        await administerPublication(admin, options);
        assert.equal((await evidence()).receipts[0].fileId, undefined);
        await administerPublication(admin, { ...options, apply: true });
        await administerPublication(admin, {
          action: 'resume',
          ...key,
          username: 'admin',
          apply: true,
          reason: options.reason,
        });
      } else {
        await run();
        assert.equal((await row()).waitingReason, 'reconciled');
      }
      assert.equal((await evidence()).receipts[0].fileId, String(init.evidence.fileId));
      assert.equal((await row()).operations.find(op => op.id === init.id)?.checkpointed, true);
      await run();
      assert.equal((await row()).status, 'completed');
      assert.equal(posts('/files').length, 1);
      assert.equal(posts('/publish').length, 1);
    });
  }
  it('reconciles historical confirmed metadata superseded by a later verified publication', async () => {
    await ready({ title: 'First approved title' });
    await run();
    assert.equal((await row()).status, 'completed');
    const first = (await row()).operations.find(op => op.kind === 'figshare:metadata');
    assert.ok(first);
    await ready({ title: 'Second approved title' });
    await run();
    assert.equal((await row()).status, 'completed');
    await runtime.store.collection.updateOne(
      key,
      { $unset: { 'operations.$[operation].checkpointed': '' } },
      { arrayFilters: [{ 'operation.id': first.id }] }
    );
    await ready({ title: 'Third approved title' });
    await run();
    assert.equal((await row()).waitingReason, 'reconciled');
    assert.equal((await row()).operations.find(op => op.id === first.id)?.checkpointed, true);
    assert.equal(posts('/publish').length, 2);
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal(articles.length, 1);
    assert.equal(posts('/publish').length, 3);
  });
  it('incorporates confirmed historical embargo and removed-file journals without replay', async () => {
    config.destinations.main.attachments = { assets: { enableHostedFiles: true } };
    config.destinations.main.providerOptions.embargo = {
      mode: 'recordDriven',
      accessRights: {
        accessRights: { kind: 'path', path: 'metadata.embargoed' },
        embargoType: { kind: 'path', path: 'metadata.embargoType' },
        fullEmbargoUntil: { kind: 'path', path: 'metadata.until' },
        reason: { kind: 'path', path: 'metadata.reason' },
      },
    };
    await ready({
      title: 'First title',
      embargoed: true,
      embargoType: 'file',
      until: '2030-01-01',
      reason: 'Approved',
      dataLocations: [{ type: 'attachment', selected: true, fileId: 'local', name: 'bytes.csv' }],
    });
    await run();
    assert.equal((await row()).status, 'completed');
    await ready({ title: 'Second title', embargoed: false, dataLocations: [] });
    await run();
    assert.equal((await row()).status, 'completed');
    const historical = (await row()).operations.filter(op => op.outcome === 'confirmed');
    for (const kind of [
      'create',
      'metadata',
      'file_init',
      'upload_part',
      'file_complete',
      'file_delete',
      'embargo',
      'embargo_clear',
      'publish',
    ])
      assert.ok(
        historical.some(op => op.kind === `figshare:${kind}`),
        kind
      );
    await runtime.store.collection.updateOne(key, { $unset: { 'operations.$[].checkpointed': '' } });
    await ready({ title: 'Third title', embargoed: false, dataLocations: [] });
    const mutations = () => requests.filter(value => !['GET', 'HEAD'].includes(value.method)).length;
    const before = mutations();
    await run();
    assert.equal((await row()).waitingReason, 'reconciled');
    for (const old of historical)
      assert.equal((await row()).operations.find(op => op.id === old.id)?.checkpointed, true, old.kind);
    assert.equal(mutations(), before);
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal(articles.length, 1);
    assert.equal(posts('/files').length, 1);
    assert.equal(requests.filter(value => value.method === 'DELETE' && value.path.includes('/files/')).length, 1);
  });
  for (const mismatch of ['uncertain', 'missing-watermark', 'owner']) {
    it(`refuses historical metadata incorporation with ${mismatch}`, async () => {
      await ready({ title: 'First title' });
      await run();
      const old = (await row()).operations.find(op => op.kind === 'figshare:metadata');
      assert.ok(old);
      await ready({ title: 'Second title' });
      await run();
      assert.equal((await row()).status, 'completed');
      await runtime.store.collection.updateOne(
        key,
        { $unset: { 'operations.$[operation].checkpointed': '' } },
        { arrayFilters: [{ 'operation.id': old.id }] }
      );
      if (mismatch === 'uncertain')
        await runtime.store.collection.updateOne(
          key,
          { $set: { 'operations.$[operation].outcome': 'uncertain' } },
          { arrayFilters: [{ 'operation.id': old.id }] }
        );
      if (mismatch === 'missing-watermark')
        await runtime.store.collection.updateOne(key, {
          $unset: { 'providerState.syncedGeneration': '', 'providerState.syncedApproval': '' },
        });
      if (mismatch === 'owner') articles[0].account_id = 999;
      await ready({ title: 'Third title' });
      await run();
      assert.equal((await row()).status, 'repair_required');
      assert.notEqual((await row()).operations.find(op => op.id === old.id)?.checkpointed, true);
      assert.equal(posts('/publish').length, 2);
    });
  }
  for (const pending of [false, true]) {
    it(`verifies relink after confirmed creation (${pending ? 'pending acknowledgement' : 'settled and retired'})`, async () => {
      await ready({ title: 'Original publication' });
      await run();
      assert.equal((await row()).status, 'completed');
      const old = (await row()).operations;
      const create = old.find(op => op.kind === 'figshare:create');
      assert.ok(create);
      articles.push({ ...articles[0], id: 52, title: 'Replacement article', files: [] });
      assign('RecordsService', { getMeta: (oid: string) => mongo.getMeta(oid) });
      const admin = {
        ...runtime,
        db: mongoClient.db(database),
        administrator: async () => ({ username: 'admin', userType: 'local' }),
        revoke: async () => {
          throw new Error('No revocation expected');
        },
      };
      const options = {
        action: 'repair' as const,
        ...key,
        username: 'admin',
        repair: 'relink',
        apply: true,
        reason: 'Verified replacement article after settled creation',
        parameters: { articleId: '52', ownerId: '1' },
      };
      clock = Date.now();
      if (pending) {
        await runtime.store.collection.updateOne(
          key,
          { $unset: { 'operations.$[operation].checkpointed': '' } },
          { arrayFilters: [{ 'operation.id': create.id }] }
        );
        await assert.rejects(administerPublication(admin, options), /Reconcile.*operations before linking/);
        assert.equal((await row()).binding?.objectId, '51');
        return;
      }
      await administerPublication(admin, options);
      assert.equal((await row()).binding?.objectId, '52');
      assert.equal((await evidence()).create, undefined);
      assert.ok(Array.isArray((await row()).providerState.retiredBindings));
      // Simulate a pre-acknowledgement retired binding without rewriting its immutable evidence.
      await runtime.store.collection.updateOne(key, { $unset: { 'operations.$[].checkpointed': '' } });
      await ready({ title: 'Approved replacement content' });
      const before = posts('/publish').length;
      await run();
      assert.equal((await row()).waitingReason, 'reconciled');
      for (const operation of old)
        assert.equal((await row()).operations.find(op => op.id === operation.id)?.checkpointed, true);
      assert.equal((await row()).binding?.objectId, '52');
      assert.equal(posts('/publish').length, before);
      await run();
      assert.equal((await row()).status, 'completed');
      assert.equal(articles.length, 2);
      assert.equal(posts('/publish').length, before + 1);
    });
  }
  it('recovers pre-acknowledgement confirmed creation after its provisional title has been replaced', async () => {
    await ready();
    await run();
    assert.equal((await row()).status, 'completed');
    const create = (await row()).operations.find(op => op.kind === 'figshare:create');
    assert.ok(create);
    assert.equal(create.outcome, 'confirmed');
    assert.ok(articles[0].title !== `ReDBox draft ${String(create.evidence.token)}`);
    await runtime.store.collection.updateOne(
      key,
      { $unset: { 'operations.$[operation].checkpointed': '' } },
      { arrayFilters: [{ 'operation.id': create.id }] }
    );
    await ready();
    await run();
    assert.equal((await row()).waitingReason, 'reconciled');
    assert.equal((await row()).operations.find(op => op.id === create.id)?.checkpointed, true);
    assert.equal(articles.length, 1);
    assert.equal(posts('/publish').length, 1, 'Recovery cannot publish the newer approval');
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal(articles.length, 1);
    assert.equal(posts('/publish').length, 2);
  });
  for (const mismatch of ['owner', 'missing-owner', 'journal-identity', 'shared-binding']) {
    it(`refuses pre-acknowledgement creation with mismatched ${mismatch}`, async () => {
      await ready();
      await run();
      const create = (await row()).operations.find(op => op.kind === 'figshare:create');
      assert.ok(create);
      await runtime.store.collection.updateOne(
        key,
        { $unset: { 'operations.$[operation].checkpointed': '' } },
        { arrayFilters: [{ 'operation.id': create.id }] }
      );
      if (mismatch === 'owner') articles[0].account_id = 999;
      if (mismatch === 'missing-owner') delete articles[0].account_id;
      if (mismatch === 'journal-identity')
        await runtime.store.collection.updateOne(
          key,
          { $set: { 'operations.$[operation].evidence.articleId': '999' } },
          { arrayFilters: [{ 'operation.id': create.id }] }
        );
      if (mismatch === 'shared-binding')
        await runtime.store.collection.updateOne(key, { $set: { 'binding.objectId': '999' } });
      await ready();
      await run();
      assert.equal((await row()).status, 'repair_required');
      assert.notEqual((await row()).operations.find(op => op.id === create.id)?.checkpointed, true);
      assert.equal(articles.length, 1);
      assert.equal(posts('/publish').length, 1);
    });
  }
  it('keeps two same-provider destinations independent and rejects one remote object managed twice', async () => {
    config.destinations.other = {
      ...structuredClone(config.destinations.main),
      displayName: 'Other',
      writeBack: {
        articleId: 'metadata.other_id',
        articleUrls: ['metadata.other_url'],
        status: 'metadata.other_status',
        error: 'metadata.other_error',
        syncState: 'metadata.other_sync',
      },
    };
    await ready({}, ['main', 'other']);
    await run();
    await run({ ...key, destinationId: 'other' });
    assert.equal(articles.length, 2);
    assert.equal((await row()).status, 'completed');
    assert.equal((await row({ ...key, destinationId: 'other' })).status, 'completed');
    const current = await row({ ...key, destinationId: 'other' });
    assert.equal(current.lease, null);
    await runtime.store.request(current, 'observe', current.revision, clock);
    const leased = await runtime.store.claim({ ...key, destinationId: 'other' }, 'repair', 30000);
    assert.ok(leased?.lease);
    await assert.rejects(
      runtime.store.bind(leased, leased.lease, leased.revision, (await row()).binding!),
      /binding|owned|manag/i
    );
  });
  it('retains embargo evidence while requiring a provider-confirmed public article', async () => {
    config.destinations.main.providerOptions.embargo = {
      mode: 'recordDriven',
      accessRights: {
        accessRights: { kind: 'path', path: 'metadata.embargoed' },
        embargoType: { kind: 'path', path: 'metadata.embargoType' },
        fullEmbargoUntil: { kind: 'path', path: 'metadata.until' },
        reason: { kind: 'path', path: 'metadata.reason' },
      },
    };
    await ready({ embargoed: true, embargoType: 'file', until: '2030-01-01', reason: 'Approved embargo' });
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal((await row()).completion?.embargoed, true);
    assert.equal((await row()).completion?.accessible, false);
    assert.equal(requests.filter(value => value.path.endsWith('/embargo') && value.method === 'PUT').length, 1);
  });
  it('reconciles an applied embargo after a lost response before continuing publication', async () => {
    config.destinations.main.providerOptions.embargo = {
      mode: 'recordDriven',
      accessRights: {
        accessRights: { kind: 'path', path: 'metadata.embargoed' },
        embargoType: { kind: 'path', path: 'metadata.embargoType' },
        fullEmbargoUntil: { kind: 'path', path: 'metadata.until' },
        reason: { kind: 'path', path: 'metadata.reason' },
      },
    };
    await ready({ embargoed: true, embargoType: 'file', until: '2030-01-01', reason: 'Approved embargo' });
    embargoLost = true;
    await run();
    assert.equal(posts('/publish').length, 0);
    await run();
    await run();
    assert.equal((await row()).status, 'completed');
    assert.equal((await row()).completion?.embargoed, true);
    assert.equal(requests.filter(value => value.path.endsWith('/embargo') && value.method === 'PUT').length, 1);
    assert.ok(
      (await row()).operations.some(value => value.kind === 'figshare:embargo' && value.evidence.readBack === true)
    );
  });
});
