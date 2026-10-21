import { createServer } from 'node:http';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { MongoClient, type Db, type CommandStartedEvent } from 'mongodb';
import { of } from 'rxjs';
import sinon from 'sinon';
import {
  PublicationService as CorePublication,
  PublicationMigrationStore,
  PublicationAdminControl,
  PublicationSyncStore,
  publicationOperationEvidence,
  PublicationStaging,
  PublicationStagingFence,
  publicationStagingIsReferenced,
  type PublicationSourceDescriptor,
  migratePublication,
  migrationDestinationId,
  migrationJson,
  convertPublicationConfiguration,
  dispatchPublications,
  runPublicationWorker,
  evaluatePublicationWorkflow,
  applyPublicationContentReplacement,
  cleanupPublicationAttachments,
  cleanupPublicationStaging,
  PublicationPublishing,
  type PublicationMigrationRuntime,
  type PublicationMigrationOptions,
  type PublicationObject,
} from '@researchdatabox/redbox-core';
import { convertPublicationVocabulary } from '@researchdatabox/redbox-core/dist/services/publication-vocabulary/conversion';
import { retainPublicationHistory } from '@researchdatabox/redbox-core/dist/services/publication/history';
import type { DiskConfig } from '@researchdatabox/redbox-core/dist/config/storage.config';
import { Services as Managers } from '@researchdatabox/redbox-core/dist/services/StorageManagerService';
import { OniPublishing } from '@researchdatabox/redbox-core/dist/configmodels/OniPublishing';
import { FigsharePublishing } from '@researchdatabox/redbox-core/dist/configmodels/FigsharePublishing';
import { Services as FigshareServices } from '@researchdatabox/redbox-core/dist/services/FigshareService';
import { emptyFigshareEvidence } from '@researchdatabox/redbox-core/dist/services/figshare-v2/publication-state';
import { Services } from '../../src/services/MongoStorageService';
import { storage } from '../../src/config/storage';

if (process.env.CI && !process.env.MONGO_TEST_URL) throw new Error('CI requires MONGO_TEST_URL for PUB-16');
const describeMongo = process.env.MONGO_TEST_URL ? describe : describe.skip;
describeMongo('One-way publication migration (PUB-16, real Mongo)', function () {
  this.timeout(30000);
  const database = `publication_migration_${randomUUID().replaceAll('-', '')}`;
  const brand = { id: 'brand', name: 'brand', css: '', roles: [] };
  const destinationId = migrationDestinationId('brand', 'figshare');
  const key = { brandId: 'brand', oid: 'record', destinationId };
  const globals = new Map<string, unknown>();
  let client: MongoClient;
  let databaseHandle: Db;
  let mongo: Services.MongoStorageService;
  let service: TestPublication;
  let runtime: PublicationMigrationRuntime;
  let legacy: PublicationObject;
  let options: PublicationMigrationOptions;
  let fault: string | undefined;
  let edit: boolean;
  let directory: string;
  let savedConfig: unknown;
  let savedServices: unknown;
  let consumerServer: ReturnType<typeof createServer>;
  let consumerUrl: string;
  let consumerShape: string;
  let consumerMutations: number;
  class TestPublication extends CorePublication.Services.Publication {
    registry() {
      this.getProviders();
      return this.providerRegistry;
    }
    async context() {
      return this.sourceConfigurationContext('brand', mongo);
    }
    consumerRuntime() {
      return this.publicationRuntime(false);
    }
  }
  function globalValue(name: string, value: unknown) {
    if (!globals.has(name)) globals.set(name, Reflect.get(globalThis, name));
    Reflect.set(globalThis, name, value);
  }
  function result(value: unknown): PublicationObject {
    return migrationJson(value);
  }
  async function run(patch: Partial<PublicationMigrationOptions> = {}) {
    return result(await migratePublication(runtime, { ...options, ...patch }));
  }
  const db = () => databaseHandle;
  const journal = () => new PublicationMigrationStore(db());
  before(async () => {
    client = new MongoClient(process.env.MONGO_TEST_URL!, { monitorCommands: true });
    await client.connect();
    databaseHandle = client.db(database);
    directory = await mkdtemp(join(tmpdir(), 'publication-pub16-'));
    const diskConfig: DiskConfig = { driver: 'fs', config: { root: directory } };
    const manager = new (class extends Managers.StorageManager {
      override getMergedStorageConfig() {
        return {
          serviceName: 'manager',
          primaryDisk: 'repository',
          stagingDisk: 'durable',
          disks: { repository: diskConfig, durable: diskConfig },
        };
      }
      async ready() {
        await this.processDynamicImports();
        await this.bootstrap();
      }
    })();
    await manager.ready();
    globalValue('StorageManagerService', manager);
    const sails = Reflect.get(globalThis, 'sails');
    savedConfig = sails.config;
    savedServices = sails.services;
    consumerServer = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.method !== 'GET') {
        consumerMutations++;
        res.statusCode = 405;
        res.end('{}');
        return;
      }
      const path = new URL(req.url!, 'http://localhost').pathname;
      res.end(
        JSON.stringify(
          path === '/account'
            ? { id: 12 }
            : path === '/account/articles'
              ? []
              : {
                  id: 55,
                  account_id: 13,
                  version: 2,
                  is_public: consumerShape === 'publish:observed',
                  ...(consumerShape === 'publish:observed' ? { published_date: '2026-10-01' } : {}),
                }
        )
      );
    });
    await new Promise<void>(done => consumerServer.listen(0, '127.0.0.1', done));
    const address = consumerServer.address();
    assert.ok(address && typeof address === 'object');
    consumerUrl = `http://127.0.0.1:${address.port}`;
  });
  beforeEach(async () => {
    await db().dropDatabase();
    await db().createCollection('record');
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
        getDatastore: () => ({ manager: db() }),
        findOne: (filter: Record<string, unknown>) => db().collection(name.toLowerCase()).findOne(filter),
      });
    const sails = Reflect.get(globalThis, 'sails');
    sails.config = { ...sails.config, storage };
    mongo = new Services.MongoStorageService();
    await mongo.init();
    sails.services = { ...sails.services, [storage.serviceName]: mongo };
    const config = new FigsharePublishing();
    config.connection.baseUrl = 'https://api.figshare.test/v2';
    config.connection.token = 'DO-NOT-LEAK-SECRET';
    config.workflow.transitionJob.enabled = false;
    legacy = migrationJson({ figsharePublishing: config });
    options = {
      brandId: 'brand',
      username: 'admin',
      apply: true,
      reason: 'Verified one-way rehearsal',
      parameters: {
        figshareAccountId: '12',
        serviceUsername: 'worker',
        stagingDisk: 'durable',
        consumersStopped: true,
        evidenceReference: 'incident/settlement/1',
      },
    };
    edit = true;
    fault = undefined;
    globalValue('BrandingService', { getBrandById: (id: string) => (id === 'brand' ? brand : undefined) });
    globalValue('RecordsService', { getPublicationStorage: () => mongo, hasEditAccess: () => edit });
    globalValue('AppConfigService', { getAppConfigurationForBrand: () => legacy });
    globalValue('UsersService', {
      getUserWithUsername: (username: string) =>
        of({
          username,
          type: 'local',
          roles: [{ name: 'Admin', branding: username === 'admin' ? 'brand' : 'foreign' }],
        }),
    });
    globalValue('RolesService', {
      getAdminFromRoles: (roles: Array<{ name: string }>) => roles.find(role => role.name === 'Admin'),
    });
    service = new TestPublication();
    globalValue('PublicationService', service);
    await db()
      .collection('record')
      .insertOne({
        redboxOid: 'record',
        revision: 1,
        recordVersion: 1,
        metadata: { figshare_article_id: '55' },
        metaMetadata: { brandId: 'brand', type: 'data' },
        authorization: { edit: ['admin', 'worker'] },
      });
    const state = emptyFigshareEvidence('record', 'brand');
    state.binding = { namespace: 'https://api.figshare.test/v2', accountId: '12', ownerId: '13', articleId: '55' };
    state.receipts = [
      {
        key: 'receipt',
        localId: 'file',
        digest: 'sha',
        md5: 'md5',
        size: 12,
        name: 'asset',
        articleId: '55',
        fileId: '99',
        kind: 'hosted',
        state: 'available',
        desired: true,
      },
    ];
    state.checkpoints.metadata = 'original-payload-hash';
    await db()
      .collection('figsharesync')
      .insertOne({ ...state });
    await db()
      .collection('integrationaudit')
      .insertOne({ redboxOid: 'record', brandId: 'brand', traceId: 'original-trace', status: 'success' });
    runtime = {
      db: db(),
      storage: mongo,
      registry: service.registry(),
      administrator: async (username, brandId, record) => {
        if (username !== 'admin' || brandId !== 'brand' || (record && !edit))
          throw new Error('Current administrator/edit access required');
        return { username, userType: 'local' };
      },
      legacyConfiguration: async () => legacy,
      recordTypes: async () => [],
      persistConfiguration: async (_brand, config) => {
        await db()
          .collection('appconfig')
          .updateOne(
            { branding: 'brand', configKey: 'publicationPublishing' },
            { $set: { configData: config } },
            { upsert: true }
          );
        legacy.publicationPublishing = migrationJson(config);
      },
      verifyConfiguration: async (_brand, config) =>
        Object.fromEntries(
          Object.entries(config.destinations).map(([id, destination]) => [
            id,
            service.registry().get(destination.provider)!.targetFingerprint(destination),
          ])
        ),
      afterWrite: async boundary => {
        if (fault === boundary) {
          fault = undefined;
          throw new Error(`Interrupted after ${boundary}`);
        }
      },
    };
  });
  after(async () => {
    await new Promise<void>((done, reject) => consumerServer.close(error => (error ? reject(error) : done())));
    Reflect.get(globalThis, 'sails').config = savedConfig;
    Reflect.get(globalThis, 'sails').services = savedServices;
    for (const [name, value] of globals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name);
      else Reflect.set(globalThis, name, value);
    }
    await db().dropDatabase();
    await client.close();
    await rm(directory, { recursive: true, force: true });
  });
  it('produces deterministic secret-free dry-runs without writing any progress, config or operations', async () => {
    const first = await run({ apply: false });
    assert.deepEqual(await run({ apply: false }), first);
    const encoded = JSON.stringify(first);
    assert.ok(!encoded.includes('DO-NOT-LEAK-SECRET'));
    assert.ok(!encoded.includes('original-payload-hash'));
    assert.ok(!encoded.includes('md5'));
    assert.equal(await db().collection('publicationmigration').countDocuments(), 0);
    assert.equal(await db().collection('appconfig').countDocuments(), 0);
    assert.equal(await db().collection('publicationsync').countDocuments(), 0);
  });
  it('PUB-21 reads readiness without modifying state and refuses unsafe resource indexes before authority commit', async () => {
    await db()
      .collection('publicationresourcelease')
      .createIndex({ providerId: 1, namespace: 1, resourceKey: 1 }, { unique: false });
    assert.equal((await run()).blocked, true);
    assert.equal((await journal().get('brand'))?.authority, 'preparing');
    await db().collection('publicationresourcelease').dropIndex('providerId_1_namespace_1_resourceKey_1');
    await run();
    const snapshot = async () => {
      const rows: Record<string, unknown> = {};
      for (const { name } of await db().listCollections().toArray())
        rows[name] = await db().collection(name).find({}).sort({ _id: 1 }).toArray();
      return result(rows);
    };
    const before = await snapshot();
    const ready = result(await service.readiness({ brandId: 'brand', username: 'admin' }));
    assert.equal(ready.ready, true, JSON.stringify(ready));
    assert.equal(ready.processingEnabled, false);
    assert.deepEqual(await snapshot(), before);
    await assert.rejects(service.readiness({ brandId: 'brand', username: 'foreign' }), /administrator/);
    edit = false;
    assert.ok(
      JSON.stringify(await service.readiness({ brandId: 'brand', username: 'admin' })).includes('service_access')
    );
    edit = true;
    await db()
      .collection('publicationsync')
      .updateOne(key, { $set: { providerStateVersion: 999 } });
    const broken = await service.readiness({ brandId: 'brand', username: 'admin' });
    assert.ok(JSON.stringify(broken).includes('invalid_destination_state'));
    assert.ok(!JSON.stringify(broken).includes('DO-NOT-LEAK-SECRET'));
    assert.equal(
      (await journal().items.updateOne(key, { $set: { quarantine: ['invalid_provider_evidence'] } })).matchedCount,
      1
    );
    assert.ok(
      JSON.stringify(await service.readiness({ brandId: 'brand', username: 'admin' })).includes(
        'invalid_destination_state'
      )
    );
    await db()
      .collection('publicationsync')
      .updateOne(key, { $set: { providerStateVersion: 1 } });
    await db()
      .collection('record')
      .updateOne({ redboxOid: 'record' }, { $set: { publicationSource: { schemaVersion: 999, revision: 1 } } });
    assert.ok(
      JSON.stringify(await service.readiness({ brandId: 'brand', username: 'admin' })).includes('invalid_source_state')
    );
    await db()
      .collection('record')
      .updateOne({ redboxOid: 'record' }, { $unset: { publicationSource: '' } });
    const control = new PublicationAdminControl(db());
    const admission = await control.admit('brand');
    assert.ok(
      JSON.stringify(await service.readiness({ brandId: 'brand', username: 'admin' })).includes(
        'unsettled_source_admissions'
      )
    );
    await control.finishAdmission('brand', admission);
  });
  it('copies receipts, checkpoints, intent provenance and audit references while preserving every legacy row', async () => {
    await db()
      .collection('record')
      .updateOne(
        { redboxOid: 'record' },
        {
          $set: {
            figshareSyncIntent: {
              generation: 3,
              pending: true,
              readiness: 'ready',
              requestedBy: 'departed-approver',
              intents: [{ kind: 'sync', policyId: 'original', condition: '' }],
            },
          },
        }
      );
    await db()
      .collection('record')
      .updateOne(
        { redboxOid: 'record' },
        { $set: { 'metadata.figshare_article_location': 'https://figshare.test/historical' } }
      );
    const before = await db().collection('figsharesync').findOne({ oid: 'record' });
    assert.equal((await run()).authority, 'shared');
    assert.deepEqual(await db().collection('figsharesync').findOne({ oid: 'record' }), before);
    const item = await journal().items.findOne({ brandId: 'brand', oid: 'record' });
    assert.ok(item?.evidence.intent && typeof item.evidence.intent === 'object');
    assert.equal(Reflect.get(item.evidence.intent, 'requestedBy'), 'departed-approver');
    assert.equal((item?.evidence.auditReferences as Array<PublicationObject>).length, 1);
    const row = await new PublicationSyncStore(db()).get(key);
    assert.deepEqual(row?.providerState.legacy, migrationJson(before));
    assert.equal(row?.links.article1, 'https://figshare.test/historical');
    assert.equal(row?.approvalId, '');
    assert.equal(row?.source, null);
    assert.equal(row?.completion, undefined);
    assert.equal(row?.work.synchronise.requested, 0);
    assert.equal(row?.waitingReason, 'migration_quarantine');
    assert.equal(await journal().quarantineCount('brand', 'record'), 1);
  });
  for (const boundary of [
    'authority_fenced',
    'reviews_written',
    'configuration_written',
    'prepared',
    'evidence_written',
    'destination_initialised',
    'destination_written',
    'item_converted',
    'converted',
    'verified',
    'committed',
  ]) {
    it(`resumes after ${boundary} without regenerating IDs, evidence or operations`, async () => {
      fault = boundary;
      await assert.rejects(run(), new RegExp(boundary));
      const first = await journal().get('brand');
      assert.ok(first);
      if (boundary !== 'committed') {
        assert.equal(first.authority, 'preparing');
        await assert.rejects(service.hasSharedAuthority('brand'), /cutover/);
      }
      await run();
      const committed = await journal().get('brand');
      assert.equal(committed?.authority, 'shared');
      assert.equal(committed?.migrationId, first.migrationId);
      assert.equal(committed?.assignments.figshare, destinationId);
      assert.equal(await journal().items.countDocuments({ brandId: 'brand' }), 1);
      const before = await new PublicationSyncStore(db()).get(key);
      await run();
      assert.deepEqual(await new PublicationSyncStore(db()).get(key), before);
      assert.equal(before?.operations.length, 0);
      assert.equal((await db().collection('appconfig').findOne())?.configData.processing.enabled, false);
    });
  }
  it('converts uncertain operations once with stable IDs and no new authority, retaining original audit rows', async () => {
    await db()
      .collection('figsharesync')
      .updateOne(
        { oid: 'record' },
        {
          $set: {
            create: {
              token: 'original-token',
              binding: { namespace: 'https://api.figshare.test/v2', accountId: '12', ownerId: '13' },
              startedAt: '2025-01-01T00:00:00Z',
              outcome: 'uncertain',
            },
            publish: {
              generation: 2,
              hash: 'original-hash',
              previousVersion: 1,
              outcome: 'accepted',
              submittedAt: '2025-01-02T00:00:00Z',
            },
          },
        }
      );
    fault = 'destination_written';
    await assert.rejects(run());
    const first = await new PublicationSyncStore(db()).get(key);
    assert.equal(first?.operations.length, 2);
    assert.ok(first?.operations.every(op => op.outcome === 'uncertain' && op.approvalId === ''));
    assert.equal(first?.operations[0].evidence.token, 'original-token');
    await run();
    await run();
    assert.deepEqual((await new PublicationSyncStore(db()).get(key))?.operations, first?.operations);
    assert.equal(await db().collection('integrationaudit').countDocuments(), 1);
    const item = await journal().items.findOne({ oid: 'record' });
    assert.equal((item?.evidence.audits as PublicationObject[])[0].traceId, 'original-trace');
  });
  it('retains Oni object and citation provenance as observation-only with unknown ingestion', async () => {
    const oni = new OniPublishing();
    oni.sites = { public: oni.sites.public };
    oni.sites.public.storage.diskName = 'repository';
    legacy.oniPublishing = migrationJson(oni);
    await db()
      .collection('record')
      .updateOne(
        { redboxOid: 'record' },
        {
          $set: {
            'metadata.citation_url': 'https://repository.test/historical',
            'metadata.citation_doi': '10.1234/historical',
          },
        }
      );
    await run();
    const destination = migrationDestinationId('brand', 'oni', 'public');
    const item = await journal().items.findOne({ destinationId: destination });
    assert.equal(item?.evidence.ingestion, 'unknown');
    assert.equal(item?.evidence.classification, 'observation-only');
    assert.equal(item?.evidence.objectId, 'arcp://name,uts_public_data_repo/record');
    const row = await new PublicationSyncStore(db()).get({ ...key, destinationId: destination });
    assert.equal(row?.links.url, 'https://repository.test/historical');
    assert.equal(row?.source, null);
    assert.equal(row?.completion, undefined);
    assert.equal(row?.work.observe.requested, 0);
    assert.equal(row?.approvalId, '');
  });
  it('blocks multi-site output collisions instead of guessing a historical Oni site', async () => {
    const oni = new OniPublishing();
    oni.sites.second = structuredClone(oni.sites.public);
    for (const site of Object.values(oni.sites)) site.storage.diskName = 'repository';
    legacy.oniPublishing = migrationJson(oni);
    await db()
      .collection('record')
      .updateOne({ redboxOid: 'record' }, { $set: { 'metadata.citation_url': 'https://repository.test/old' } });
    const dry = await run({ apply: false });
    assert.ok(JSON.stringify(dry).includes('ambiguous_historical_oni_site'));
    assert.equal((await run()).blocked, true);
  });
  it('records a failed target/service/staging verification and resumes without erasing it', async () => {
    const verify = runtime.verifyConfiguration;
    runtime.verifyConfiguration = async () => {
      throw new Error('PRIVATE-CONNECTION-DETAIL');
    };
    fault = 'verification_failure_recorded';
    await assert.rejects(run(), /verification_failure_recorded/);
    assert.ok((await journal().get('brand'))?.globalFailures.includes('target_service_or_staging_verification'));
    runtime.verifyConfiguration = verify;
    await run();
    assert.equal((await journal().get('brand'))?.authority, 'shared');
  });
  it('refuses persisted configuration drift or enablement before committing authority', async () => {
    fault = 'configuration_written';
    await assert.rejects(run());
    const persisted = legacy.publicationPublishing;
    assert.ok(persisted && typeof persisted === 'object');
    Reflect.get(persisted, 'processing').enabled = true;
    fault = 'prepared';
    // A replay before preparation rewrites disabled config. Drift after preparation is refused.
    await assert.rejects(run(), /prepared/);
    Reflect.get(legacy.publicationPublishing as object, 'processing').enabled = true;
    await assert.rejects(run(), /configuration changed or became enabled/);
    assert.equal((await journal().get('brand'))?.authority, 'preparing');
  });
  it('interlocks source admissions with administration and refuses direct acceptance under a preparing fence', async () => {
    const control = new PublicationAdminControl(db());
    const admission = await control.admit('brand');
    await assert.rejects(run(), /already active/);
    await control.finishAdmission('brand', admission);
    fault = 'authority_fenced';
    await assert.rejects(run());
    await assert.rejects(
      mongo.updateMeta(brand, 'record', {}, undefined, {
        figshareIntent: { saveToken: 'late', readiness: 'ready', requestedBy: 'admin', intents: [] },
      }),
      /cutover/
    );
    await assert.rejects(
      mongo.updateMeta(brand, 'record', {}, undefined, {
        publicationIntent: { kind: 'content', saveToken: 'late', expectedSourceRevision: 0, approvals: [] },
      }),
      /cutover/
    );
    const before = await db().collection('record').findOne({ redboxOid: 'record' });
    const draft = await mongo.updateMeta(brand, 'record', { metadata: { title: 'ordinary draft' } });
    assert.equal(draft.applicationState, 'applied');
    assert.equal(
      (await db().collection('record').findOne({ redboxOid: 'record' }))?.figshareSyncIntent,
      before?.figshareSyncIntent
    );
  });
  for (const boundary of ['conflict_writer_written', 'conflict_group_written']) {
    it(`resumes a conflicting-writer group interrupted after ${boundary}`, async () => {
      await db()
        .collection('record')
        .insertOne({
          redboxOid: 'foreign-record',
          revision: 1,
          recordVersion: 1,
          metadata: {},
          metaMetadata: { brandId: 'foreign', type: 'data' },
          authorization: { edit: ['admin', 'worker'] },
        });
      await service.assertLegacyPublicationAllowed('foreign', 'foreign-record');
      await db()
        .collection('figsharesync')
        .insertOne({
          ...emptyFigshareEvidence('foreign-record', 'foreign'),
          binding: { namespace: 'https://api.figshare.test/v2', accountId: '12', ownerId: '13', articleId: '55' },
        });
      fault = boundary;
      await assert.rejects(run());
      await run();
      await run();
      assert.equal(await journal().quarantineCount('foreign', 'foreign-record'), 1);
      await assert.rejects(service.assertLegacyPublicationAllowed('foreign', 'foreign-record'), /quarantine/);
      assert.equal(await journal().items.countDocuments({ brandId: 'foreign' }), 1);
    });
  }
  it('blocks incomplete Figshare account configuration with a safe report and durable fence', async () => {
    options.parameters = { ...options.parameters, figshareAccountId: '' };
    assert.equal((await run()).blocked, true);
    assert.equal((await journal().get('brand'))?.authority, 'preparing');
  });
  it('pins copied recovery graphs, keeps journal-only references live and refuses tombstoned sources', async () => {
    const fence = new PublicationStagingFence(db());
    const staging = new PublicationStaging(
      'durable',
      Reflect.get(globalThis, 'StorageManagerService').disk('durable'),
      fence
    );
    const reference = await staging.putJson('brand', JSON.stringify({ original: 'recovery' }));
    await db()
      .collection('figsharesync')
      .updateOne({ oid: 'record' }, { $set: { recoveryInput: reference } });
    fault = 'evidence_written';
    await assert.rejects(run());
    const item = await journal().items.findOne({ oid: 'record' });
    assert.ok(item);
    assert.equal(await publicationStagingIsReferenced(db(), reference), true);
    assert.equal(
      await fence.deleteIfUnreferenced(
        reference,
        () => publicationStagingIsReferenced(db(), reference),
        async () => {
          assert.fail('Referenced recovery deleted');
        }
      ),
      false
    );
    await run();
    const before = await journal().items.findOne({ oid: 'record' });
    await run();
    assert.deepEqual(await journal().items.findOne({ oid: 'record' }), before);
    const stale = await staging.putJson('brand', JSON.stringify({ old: true }));
    assert.equal(
      await fence.deleteIfUnreferenced(
        stale,
        async () => false,
        async () => {}
      ),
      true
    );
    await assert.rejects(
      journal().retain({
        ...item,
        id: 'tombstoned-evidence',
        fingerprint: 'new',
        evidence: { input: migrationJson(stale) },
      }),
      /fenced for deletion/
    );
    assert.equal(await journal().items.countDocuments({ id: 'tombstoned-evidence' }), 0);
  });
  it('reads cutover authority without backfilling brand sources on legacy hot paths', async () => {
    const reads: CommandStartedEvent[] = [];
    const capture = (event: CommandStartedEvent) => reads.push(event);
    client.on('commandStarted', capture);
    try {
      assert.equal(await service.hasSharedAuthority('brand'), false);
      assert.equal(await service.hasSharedAuthority('brand'), false);
    } finally {
      client.off('commandStarted', capture);
    }
    assert.equal(reads.filter(event => ['record', 'deletedrecord'].includes(event.command.find)).length, 0);
    assert.equal(reads.filter(event => event.command.find === 'publicationstagingreference').length, 0);
    assert.equal(await db().collection('publicationdestinationledger').countDocuments(), 0);
  });
  for (const authority of ['legacy', 'shared'])
    it(`polls ${authority} record status without scanning retained brand approvals before ledger backfill`, async () => {
      if (authority === 'shared') await run();
      const reads: CommandStartedEvent[] = [];
      const capture = (event: CommandStartedEvent) => reads.push(event);
      client.on('commandStarted', capture);
      try {
        const first = await service.getRecordStatus('brand', 'record');
        const second = await new TestPublication().getRecordStatus('brand', 'record');
        assert.equal(first.shared, authority === 'shared');
        assert.equal(second.shared, authority === 'shared');
      } finally {
        client.off('commandStarted', capture);
      }
      const backfillReads = reads.filter(
        event =>
          ['record', 'deletedrecord'].includes(event.command.find) &&
          Object.keys(event.command.filter).some(path => path.endsWith('publicationSource.approvals.0'))
      );
      assert.equal(backfillReads.length, 0);
      assert.equal(reads.filter(event => event.command.find === 'publicationstagingreference').length, 0);
      assert.equal(await db().collection('publicationdestinationledger').countDocuments(), 0);
    });
  for (const lifecycle of ['record', 'deletedrecord', 'removedrecord', 'purgedrecord'])
    it(`makes targets referenced by ${lifecycle} approvals immutable before dispatcher import`, async () => {
      const sourceCollection = ['record', 'removedrecord'].includes(lifecycle) ? 'record' : 'deletedrecord';
      const config = new PublicationPublishing();
      config.destinations.archive = {
        provider: 'figshare',
        displayName: 'Archive',
        enabled: false,
        archived: false,
        connection: { baseUrl: 'https://api.figshare.test/v2', accountId: '12' },
        mapping: {},
        attachments: {},
        writeBack: {},
        providerOptions: {},
      };
      const target = service.registry().get('figshare')!.targetFingerprint(config.destinations.archive);
      const source: PublicationSourceDescriptor = {
        encodingVersion: 1,
        brandId: 'brand',
        oid: 'record',
        requestId: 'original-approval',
        sourceRevision: 1,
        metadata: {},
        relatedInputs: {},
        destinationIds: ['archive'],
        targets: { archive: target },
        materialConfiguration: { archive: {} },
        crosswalkRevisions: [],
        attachments: [],
        generatedValues: {},
        adapterContracts: { archive: { providerId: 'figshare', contractVersion: 1, mappingContextVersion: 1 } },
        managedFields: { archive: [] },
      };
      const staging = new PublicationStaging(
        'durable',
        Reflect.get(globalThis, 'StorageManagerService').disk('durable'),
        new PublicationStagingFence(db())
      );
      const reference = await staging.putJson('brand', JSON.stringify(source));
      const actor = { username: 'departed-approver', userType: 'local' };
      await db()
        .collection('record')
        .updateOne(
          { redboxOid: 'record' },
          {
            $set: {
              publicationSource: {
                schemaVersion: 1,
                revision: 1,
                pending: false,
                initialising: false,
                intents: {},
                saves: [],
                approvals: [
                  {
                    id: 'original-approval',
                    epoch: 1,
                    sourceRevision: 1,
                    policy: {
                      id: 'original-policy',
                      version: 1,
                      mode: 'approval',
                      recordType: 'data',
                      event: 'onTransition',
                      destinations: ['archive'],
                    },
                    destinationIds: ['archive'],
                    targetFingerprints: { archive: target },
                    configurationDigests: { archive: 'config' },
                    source: reference,
                    requester: actor,
                    approver: actor,
                    grantedAt: '2025-01-01T00:00:00Z',
                  },
                ],
              },
            },
          }
        );
      if (sourceCollection === 'deletedrecord') {
        const deletedRecordMetadata = await db().collection('record').findOne({ redboxOid: 'record' });
        assert.ok(deletedRecordMetadata);
        await db().collection('deletedrecord').insertOne({ redboxOid: 'record', deletedRecordMetadata });
        await db().collection('record').deleteOne({ redboxOid: 'record' });
      }
      if (lifecycle === 'removedrecord') {
        const reserve = PublicationSyncStore.prototype.reserveDestination;
        const lostAcknowledgement = sinon
          .stub(PublicationSyncStore.prototype, 'reserveDestination')
          .callsFake(async (...args) => {
            await reserve.call(new PublicationSyncStore(db()), ...args);
            throw new Error('Reservation acknowledgement lost');
          });
        try {
          const blocked = await mongo.removeActiveRecord(brand, 'record', {
            precondition: { expectedRevision: 1, requireRevision: true },
          });
          assert.equal(blocked.applicationState, 'unknown');
          assert.equal(await db().collection('record').countDocuments({ redboxOid: 'record' }), 1);
          assert.equal(await db().collection('publicationdestinationledger').countDocuments(), 0);
        } finally {
          lostAcknowledgement.restore();
        }
        const removed = await mongo.removeActiveRecord(brand, 'record', {
          precondition: { expectedRevision: 1, requireRevision: true },
        });
        assert.equal(removed.applicationState, 'applied');
        assert.equal(await db().collection('record').countDocuments({ redboxOid: 'record' }), 0);
      }
      if (lifecycle === 'purgedrecord') {
        const operationId = randomUUID();
        await db()
          .collection('deletedrecord')
          .updateOne(
            { redboxOid: 'record' },
            {
              $set: {
                revision: 2,
                brandId: 'brand',
                lifecycleState: 'purge-pending',
                lifecycleOperation: {
                  operationId,
                  requestId: randomUUID(),
                  kind: 'purge',
                  sourceRevision: 1,
                  targetRevision: 2,
                  startedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  attempts: 1,
                },
              },
            }
          );
        const reserve = PublicationSyncStore.prototype.reserveDestination;
        const lostAcknowledgement = sinon
          .stub(PublicationSyncStore.prototype, 'reserveDestination')
          .callsFake(async (...args) => {
            await reserve.call(new PublicationSyncStore(db()), ...args);
            throw new Error('Reservation acknowledgement lost');
          });
        try {
          const blocked = await mongo.removeTombstone(brand, 'record', {
            precondition: { expectedRevision: 2, requireRevision: true },
            lifecycle: { expectedState: 'purge-pending', operationId },
          });
          assert.equal(blocked.applicationState, 'unknown');
          assert.equal(await db().collection('deletedrecord').countDocuments({ redboxOid: 'record' }), 1);
          assert.equal(await db().collection('publicationdestinationledger').countDocuments(), 0);
        } finally {
          lostAcknowledgement.restore();
        }
        const removed = await mongo.removeTombstone(brand, 'record', {
          precondition: { expectedRevision: 2, requireRevision: true },
          lifecycle: { expectedState: 'purge-pending', operationId },
        });
        assert.equal(removed.applicationState, 'applied');
        assert.equal(await db().collection('deletedrecord').countDocuments({ redboxOid: 'record' }), 0);
      }
      assert.equal(await db().collection('publicationsync').countDocuments(), 0);
      const scans: CommandStartedEvent[] = [];
      const capture = (event: CommandStartedEvent) => {
        if (event.command.find === sourceCollection) scans.push(event);
      };
      client.on('commandStarted', capture);
      try {
        await service.validateConfigurationForSave('brand', config, {});
      } finally {
        client.off('commandStarted', capture);
      }
      assert.ok(scans.length > 0, `${sourceCollection} must be included in destination identity backfill`);
      for (const scan of scans) {
        assert.deepEqual(scan.command.projection, {
          [sourceCollection === 'record' ? 'publicationSource' : 'deletedRecordMetadata.publicationSource']: 1,
        });
        assert.equal(scan.command.batchSize, 20);
        const plan = await db().collection(sourceCollection).find(scan.command.filter).explain('executionStats');
        assert.ok(!JSON.stringify(plan.queryPlanner.winningPlan).includes('COLLSCAN'));
      }
      // After the first trusted save/worker configuration has backfilled identities,
      // restarted processes must use the ledger without reopening every brand source.
      await service.context();
      const reads: CommandStartedEvent[] = [];
      const captureReads = (event: CommandStartedEvent) => reads.push(event);
      client.on('commandStarted', captureReads);
      try {
        await new TestPublication().context();
        await new TestPublication().context();
      } finally {
        client.off('commandStarted', captureReads);
      }
      assert.equal(reads.filter(event => ['record', 'deletedrecord'].includes(event.command.find)).length, 0);
      assert.equal(reads.filter(event => event.command.find === 'publicationstagingreference').length, 0);
      config.destinations.archive.connection.accountId = '99';
      await assert.rejects(
        new TestPublication().validateConfigurationForSave('brand', config, {}),
        /used-target-change/
      );
      delete config.destinations.archive;
      await assert.rejects(new TestPublication().validateConfigurationForSave('brand', config, {}), /used-destination/);
    });
  it('releases only settled migration quarantine through an audited dry-run/apply repair without granting work', async () => {
    await db()
      .collection('record')
      .updateOne(
        { redboxOid: 'record' },
        { $set: { figshareSyncIntent: { pending: true, readiness: 'initialising' } } }
      );
    await run();
    const repair = {
      action: 'repair' as const,
      brandId: 'brand',
      oid: 'record',
      destinationId,
      username: 'admin',
      repair: 'release-migration-quarantine',
      parameters: { abandonHistoricalAuthority: true, evidenceReference: 'settlement/approved' },
      reason: 'Abandon old eligible-save authority; request fresh approval',
    };
    assert.equal(result(await service.administer(repair)).dryRun, true);
    assert.equal(await journal().quarantineCount('brand', 'record'), 1);
    await service.administer({ ...repair, apply: true });
    assert.equal(await journal().quarantineCount('brand', 'record'), 0);
    const item = await journal().items.findOne({ oid: 'record' });
    assert.ok(item?.resolution);
    assert.ok(item.quarantine.includes('unverified_save_outcome'));
    assert.equal(
      (await db().collection('publicationcorrection').findOne({ id: item.resolution.correctionId }))?.actor.username,
      'admin'
    );
    const row = await new PublicationSyncStore(db()).get(key);
    assert.equal(row?.source, null);
    assert.equal(row?.approvalId, '');
    assert.equal(row?.work.synchronise.requested, 0);
    assert.equal(
      (await service.getRecordStatus('brand', 'record', { includeSignals: true })).signals?.migrationQuarantineCount,
      0
    );
  });
  it('does not expire interrupted admissions and audits explicit stopped-writer settlement', async () => {
    const control = new PublicationAdminControl(db());
    const token = await control.admit('brand');
    await control.collection.updateOne({ brandId: 'brand' }, { $set: { 'admissions.0.expiresAt': 0 } });
    const dry = await run({ apply: false });
    assert.equal((dry.sourceAdmissions as PublicationObject[])[0].token, token);
    await assert.rejects(run(), /already active/);
    options.parameters = { ...options.parameters, settledAdmissions: [token] };
    assert.equal((await run()).authority, 'shared');
    assert.equal((await db().collection('publicationadmissionsettlement').findOne())?.actor.username, 'admin');
  });
  it('does not grow the authority journal when an unchanged blocked migration is retried', async () => {
    await db()
      .collection('figsharesync')
      .updateOne({ oid: 'record' }, { $set: { leaseUntil: Date.now() + 60000 } });
    assert.equal((await run()).blocked, true);
    const before = await journal().get('brand');
    assert.equal((await run()).blocked, true);
    const after = await journal().get('brand');
    assert.deepEqual(after, before);
  });
  it('resumes after recording global failure without losing its historical categories', async () => {
    await db()
      .collection('figsharesync')
      .updateOne({ oid: 'record' }, { $set: { leaseUntil: Date.now() + 60000 } });
    fault = 'global_failure_recorded';
    await assert.rejects(run(), /global_failure_recorded/);
    await db()
      .collection('figsharesync')
      .updateOne({ oid: 'record' }, { $set: { leaseUntil: 0 } });
    await run();
    assert.ok(
      (await journal().get('brand'))?.history?.some(entry => entry.globalFailures.includes('active_legacy_lease'))
    );
  });
  it('refuses shared and repository owners before preparation, then rolls forward after drain', async () => {
    const sync = new PublicationSyncStore(db());
    await sync.initialise(
      { ...key, oid: 'other' },
      'figshare',
      service
        .registry()
        .get('figshare')!
        .targetFingerprint(
          convertPublicationConfiguration('brand', legacy, [], options.parameters!).config.destinations[destinationId]
        ),
      2
    );
    await sync.collection.updateOne(
      { ...key, oid: 'other' },
      { $set: { lease: { owner: 'worker', token: 'active', expiresAt: Date.now() + 60000 } } }
    );
    await db()
      .collection('publicationresourcelease')
      .insertOne({ lease: { brandId: 'brand', expiresAt: Date.now() + 60000 } });
    const blocked = await run();
    assert.ok(JSON.stringify(blocked).includes('active_shared_lease'));
    assert.ok(JSON.stringify(blocked).includes('active_resource_lease'));
    await sync.collection.updateOne({ ...key, oid: 'other' }, { $set: { lease: null } });
    await db().collection('publicationresourcelease').deleteMany({});
    assert.equal((await run()).authority, 'shared');
  });
  it('replays an interrupted inventory write before any authority/configuration conversion', async () => {
    fault = 'inventory_written';
    await assert.rejects(run(), /inventory_written/);
    assert.equal(await journal().get('brand'), null);
    assert.equal(await db().collection('appconfig').countDocuments(), 0);
    assert.equal(await db().collection('publicationmigrationinventory').countDocuments(), 1);
    assert.equal((await run()).authority, 'shared');
    assert.equal(await db().collection('publicationmigrationinventory').countDocuments(), 1);
  });
  it('retains the complete duplicate-state evidence without choosing a managing binding', async () => {
    await db()
      .collection('figsharesync')
      .insertOne({
        ...emptyFigshareEvidence('record', 'brand'),
        binding: { namespace: 'https://api.figshare.test/v2', accountId: '12', ownerId: '13', articleId: '66' },
      });
    await run();
    const item = await journal().items.findOne({ oid: 'record' });
    assert.ok(item?.quarantine.includes('duplicate_legacy_state'));
    assert.equal((item?.evidence.legacyRows as PublicationObject[]).length, 2);
    assert.equal((await new PublicationSyncStore(db()).get(key))?.binding, undefined);
  });
  it('refuses ambiguous, malformed and future brand authority without changing evidence', async () => {
    fault = 'authority_fenced';
    await assert.rejects(run());
    const original = await journal().collection.findOne({ brandId: 'brand' });
    assert.ok(original);
    await db()
      .collection('publicationmigration')
      .updateOne({ brandId: 'brand' }, { $set: { schemaVersion: 900 } });
    await assert.rejects(run(), /Unsupported/);
    await journal().collection.replaceOne({ brandId: 'brand' }, original);
    await db()
      .collection('publicationmigration')
      .updateOne({ brandId: 'brand' }, { $set: { phase: 'unknown' } });
    await assert.rejects(run(), /Invalid/);
    await journal().collection.replaceOne({ brandId: 'brand' }, original);
    await journal().collection.dropIndex('brandId_1');
    const { _id: _id, ...duplicate } = original;
    await journal().collection.insertOne(duplicate);
    await assert.rejects(run(), /Ambiguous/);
    assert.equal(await journal().collection.countDocuments(), 2);
    assert.equal(await db().collection('publicationsync').countDocuments(), 0);
  });
  it('keeps committed authority after AppConfig deletion and refuses legacy fallback', async () => {
    await run();
    delete legacy.publicationPublishing;
    assert.equal(await service.hasSharedAuthority('brand'), true);
    assert.throws(() => service.getConfiguration('brand', { authority: 'shared' }), /missing/);
    assert.equal((await run()).alreadyCommitted, true);
  });
  it('never overwrites newer converted worker or repair evidence on replay', async () => {
    fault = 'destination_written';
    await assert.rejects(run());
    await db()
      .collection('publicationsync')
      .updateOne(key, {
        $set: { providerState: { repaired: true }, operations: [{ id: 'retained' }] },
        $inc: { revision: 1 },
      });
    await run();
    const row = await db().collection('publicationsync').findOne(key);
    assert.deepEqual(row?.providerState, { repaired: true });
    assert.deepEqual(row?.operations, [{ id: 'retained' }]);
  });
  it('blocks activation after source drift and retains the preparing fence', async () => {
    fault = 'prepared';
    await assert.rejects(run());
    await db()
      .collection('record')
      .updateOne({ redboxOid: 'record' }, { $set: { 'metadata.title': 'Changed' } });
    await assert.rejects(run(), /inventory changed/);
    assert.equal((await journal().get('brand'))?.authority, 'preparing');
  });
  it('quarantines every duplicate remote writer and allows unaffected destinations to migrate', async () => {
    const record = await db().collection('record').findOne({ redboxOid: 'record' });
    assert.ok(record);
    const { _id: _id, ...copy } = record;
    await db()
      .collection('record')
      .insertOne({ ...copy, redboxOid: 'duplicate' });
    await db()
      .collection('record')
      .insertOne({ ...copy, redboxOid: 'unaffected', metadata: { figshare_article_id: '77' } });
    await run();
    assert.equal(await journal().quarantineCount('brand', 'record'), 1);
    assert.equal(await journal().quarantineCount('brand', 'duplicate'), 1);
    assert.equal(await journal().quarantineCount('brand', 'unaffected'), 0);
    const unaffected = await new PublicationSyncStore(db()).get({ ...key, oid: 'unaffected' });
    assert.equal(unaffected?.binding?.objectId, '77');
    assert.equal(unaffected?.waitingReason, 'historical_observation_only');
    assert.equal(unaffected?.approvalId, '');
    const rows = await db()
      .collection('publicationsync')
      .find({ oid: { $ne: 'unaffected' } })
      .toArray();
    assert.ok(rows.every(row => !row.binding));
    assert.equal(
      new Set(
        (
          await journal()
            .items.find({ oid: { $ne: 'unaffected' } })
            .toArray()
        ).map(item => item.conflictGroup)
      ).size,
      1
    );
  });
  it('fences existing cross-brand shared owners in the entire writer group', async () => {
    const sync = new PublicationSyncStore(db());
    await sync.ensureIndexes();
    await sync.initialise({ ...key, brandId: 'foreign' }, 'figshare', 'foreign-target', 2);
    await sync.collection.updateOne(
      { ...key, brandId: 'foreign' },
      { $set: { remoteNamespace: 'https://api.figshare.test/v2', remoteObjectId: '55' } }
    );
    await run();
    assert.equal(await journal().quarantineCount('foreign', 'record', destinationId), 1);
    await assert.rejects(journal().assertNotQuarantined('foreign', 'record', destinationId), /quarantine/);
  });
  it('refuses active legacy/shared leases and resumes after verified drain', async () => {
    await db()
      .collection('figsharesync')
      .updateOne({ oid: 'record' }, { $set: { leaseUntil: Date.now() + 60000 } });
    const blocked = await run();
    assert.equal(blocked.blocked, true);
    assert.ok(JSON.stringify(blocked).includes('active_legacy_lease'));
    await db()
      .collection('figsharesync')
      .updateOne({ oid: 'record' }, { $set: { leaseUntil: 0 } });
    assert.equal((await run()).authority, 'shared');
    assert.equal(await db().collection('publicationmigrationinventory').countDocuments(), 2);
  });
  it('blocks a brand with unsafe indexes without fabricating committed authority', async () => {
    await db()
      .collection('publicationsync')
      .insertMany([
        {
          brandId: 'x',
          oid: 'x',
          destinationId: 'one',
          providerId: 'figshare',
          remoteNamespace: 'x',
          remoteObjectId: 'x',
        },
        {
          brandId: 'y',
          oid: 'y',
          destinationId: 'two',
          providerId: 'figshare',
          remoteNamespace: 'x',
          remoteObjectId: 'x',
        },
      ]);
    assert.equal((await run()).blocked, true);
    assert.equal((await journal().get('brand'))?.authority, 'preparing');
  });
  it('requires explicit settlement, administrator, edit permission and correction reason', async () => {
    await assert.rejects(run({ username: 'foreign' }), /administrator/);
    await assert.rejects(run({ reason: '' }), /reason/);
    await assert.rejects(run({ parameters: {} }), /consumersStopped/);
    edit = false;
    await assert.rejects(run(), /edit access/);
    assert.notEqual((await journal().get('brand'))?.authority, 'shared');
  });
  it('translates known hooks and retains arbitrary conditions for explicit manual review', async () => {
    runtime.recordTypes = async () => [
      {
        name: 'data',
        hooks: {
          onUpdate: {
            post: [
              {
                function: 'FigshareService.wakeFigshareRecord',
                options: { triggerCondition: '<%= record.workflow.stage === "queued" %>' },
              },
            ],
          },
        },
      },
    ];
    const dry = await run({ apply: false });
    assert.equal((dry.translations as PublicationObject[])[0].mode, 'auto-sync');
    assert.equal((await run()).blocked, true);
    const reviews = dry.manualReviews as Array<PublicationObject>;
    options.parameters = {
      ...options.parameters,
      reviews: Object.fromEntries(reviews.map(review => [String(review.id), 'review/accepted'])),
    };
    assert.equal((await run()).authority, 'shared');
  });
  it('preserves crosswalk IDs, approved revisions, history and editor references byte-for-byte', async () => {
    await db()
      .collection('figsharevocabularycrosswalk')
      .insertOne({
        brandId: 'brand',
        id: 'crosswalk-original',
        approvedRevision: 'revision-original',
        history: [{ actor: 'approver' }],
      });
    const before = await db().collection('figsharevocabularycrosswalk').findOne();
    await run();
    assert.deepEqual(await db().collection('figsharevocabularycrosswalk').findOne(), before);
  });
  it('reports real record/destination quarantine totals through the status service with brand isolation', async () => {
    await db()
      .collection('record')
      .updateOne(
        { redboxOid: 'record' },
        { $set: { figshareSyncIntent: { pending: true, readiness: 'initialising' } } }
      );
    await run();
    const response = await service.getRecordStatus('brand', 'record', { includeSignals: true });
    assert.equal(response.signals?.migrationQuarantineCount, 1);
    const filtered = await service.getRecordStatus('brand', 'record', {
      includeSignals: true,
      destinationId: 'missing',
    });
    assert.equal(filtered.signals?.migrationQuarantineCount, 0);
    assert.equal(await journal().quarantineCount('foreign', 'record'), 0);
    await assert.rejects(service.getRecordStatus('foreign', 'record', { includeSignals: true }), /brand mismatch/);
  });
  for (const quarantined of [false, true]) {
    it(`preserves ${quarantined ? 'quarantine' : 'historical observation'} status without a shared source`, async () => {
      if (quarantined)
        await db()
          .collection('record')
          .updateOne(
            { redboxOid: 'record' },
            { $set: { figshareSyncIntent: { pending: true, readiness: 'initialising' } } }
          );
      await run();
      const response = await service.getRecordStatus('brand', 'record', { includeSignals: true });
      assert.equal(response.integrations.length, 1);
      const status = response.integrations[0];
      assert.equal(status.workStatus, quarantined ? 'repair_required' : 'paused');
      assert.equal(status.waitingReason, quarantined ? 'migration_quarantine' : 'historical_observation_only');
      assert.equal(status.completion, undefined);
      assert.equal(status.observation?.current, false);
      assert.equal(response.signals?.repairRequired, quarantined ? 1 : 0);
      assert.equal(response.signals?.migrationQuarantineCount, quarantined ? 1 : 0);
    });
  }
  // Orthogonal shapes are generated by the actual converter, not manually seeded shared rows.
  const consumerShapes = [
    'link-only',
    'shared-binding-only',
    'snapshot-only',
    'unbound',
    'settled',
    'invalid-state',
    'pending-work',
    'pending-intent',
    'initialising-save',
    'conflicting-record',
    'target-mismatch',
    'duplicate-state',
    'conflicting-writers',
    'orphan',
    ...['submitted', 'uncertain', 'failed', 'confirmed'].map(outcome => `create:${outcome}`),
    ...['submitted', 'accepted', 'uncertain', 'rejected', 'observed'].map(outcome => `publish:${outcome}`),
    ...['initialising', 'uploading', 'completing', 'available', 'deleting', 'removed'].map(state => `receipt:${state}`),
    'oni-history',
    'oni-ambiguous-site',
    'pre-existing-source',
    'retained-archive',
    'pre-fence-recovery',
  ];
  for (const shape of consumerShapes) {
    it(`migration consumer matrix: ${shape}`, async () => {
      consumerShape = shape;
      consumerMutations = 0;
      const figshare = result(legacy.figsharePublishing);
      assert.ok(figshare.connection && typeof figshare.connection === 'object' && !Array.isArray(figshare.connection));
      figshare.connection.baseUrl = consumerUrl;
      legacy.figsharePublishing = figshare;
      await db()
        .collection('figsharesync')
        .updateOne({ oid: 'record' }, { $set: { 'binding.namespace': consumerUrl } });
      globalValue('FigshareService', new FigshareServices.FigshareService());
      globalValue('RecordsService', {
        getPublicationStorage: () => mongo,
        hasEditAccess: () => edit,
        getMeta: (oid: string) => mongo.getMeta(oid),
      });
      const fence = new PublicationStagingFence(db());
      const staging = new PublicationStaging(
        'durable',
        Reflect.get(globalThis, 'StorageManagerService').disk('durable'),
        fence
      );
      const recovery = await staging.putJson('brand', JSON.stringify({ retained: shape }));
      if (shape === 'pre-fence-recovery') await db().collection('publicationstagingreference').deleteMany({});
      if (shape === 'pre-existing-source')
        await db()
          .collection('record')
          .updateOne(
            { redboxOid: 'record' },
            {
              $set: {
                publicationSource: {
                  schemaVersion: 1,
                  revision: 1,
                  pending: false,
                  initialising: false,
                  approvals: [],
                  intents: {},
                  saves: [],
                },
              },
            }
          );
      await db()
        .collection('figsharesync')
        .updateOne({ oid: 'record' }, { $set: { recoveryInput: recovery } });
      if (['link-only', 'snapshot-only', 'oni-history', 'oni-ambiguous-site'].includes(shape)) {
        await db().collection('figsharesync').deleteMany({});
        await db()
          .collection('record')
          .updateOne(
            { redboxOid: 'record' },
            { $set: { figshareSyncIntent: { pending: false, recoveryInput: recovery } } }
          );
      }
      if (shape === 'shared-binding-only')
        await db()
          .collection('figsharesync')
          .updateOne({ oid: 'record' }, { $unset: { binding: '' } });
      if (shape === 'snapshot-only')
        await db()
          .collection('record')
          .updateOne(
            { redboxOid: 'record' },
            { $set: { metadata: { figshareSyncState: { recoveryInput: recovery } } } }
          );
      if (shape === 'unbound') {
        await db()
          .collection('figsharesync')
          .updateOne({ oid: 'record' }, { $unset: { binding: '' }, $set: { receipts: [] } });
        await db()
          .collection('record')
          .updateOne({ redboxOid: 'record' }, { $set: { metadata: {} } });
      }
      const changes: PublicationObject = {};
      if (shape === 'invalid-state') changes.receipts = 'invalid-retained-evidence';
      if (shape === 'pending-work') changes['work.sync.requested'] = 9;
      if (shape === 'conflicting-record')
        await db()
          .collection('record')
          .updateOne({ redboxOid: 'record' }, { $set: { 'metadata.figshare_article_id': '77' } });
      if (shape === 'target-mismatch') changes['binding.accountId'] = '99';
      if (shape === 'pending-intent' || shape === 'initialising-save')
        await db()
          .collection('record')
          .updateOne(
            { redboxOid: 'record' },
            {
              $set: {
                figshareSyncIntent: { pending: true, readiness: shape === 'pending-intent' ? 'ready' : 'initialising' },
              },
            }
          );
      if (shape.startsWith('create:')) {
        changes.create = {
          token: 'legacy-create',
          binding: { namespace: consumerUrl, accountId: '12', ownerId: '13' },
          outcome: shape.split(':')[1],
          startedAt: '2026-10-01T00:00:00Z',
        };
        if (shape !== 'create:confirmed') {
          await db()
            .collection('figsharesync')
            .updateOne({ oid: 'record' }, { $unset: { binding: '' } });
          await db()
            .collection('record')
            .updateOne({ redboxOid: 'record' }, { $set: { metadata: {} } });
        } else if (typeof changes.create === 'object' && !Array.isArray(changes.create))
          changes.create.verifiedId = '55';
      }
      if (shape.startsWith('publish:'))
        changes.publish = {
          generation: 40,
          hash: 'legacy-payload',
          previousVersion: 1,
          outcome: shape.split(':')[1],
          submittedAt: '2026-10-01T00:00:00Z',
        };
      if (shape.startsWith('receipt:')) changes['receipts.0.state'] = shape.split(':')[1];
      if (Object.keys(changes).length)
        await db().collection('figsharesync').updateOne({ oid: 'record' }, { $set: changes });
      if (shape === 'orphan') await db().collection('record').deleteMany({});
      if (shape === 'duplicate-state' || shape === 'conflicting-writers') {
        const original = await db().collection('figsharesync').findOne({ oid: 'record' });
        assert.ok(original);
        const { _id, ...copy } = original;
        await db()
          .collection('figsharesync')
          .insertOne({ ...copy, ...(shape === 'conflicting-writers' ? { oid: 'peer' } : {}) });
      }
      let selected = key;
      if (shape.startsWith('oni-')) {
        delete legacy.figsharePublishing;
        await db()
          .collection('record')
          .updateOne(
            { redboxOid: 'record' },
            {
              $set: { metadata: { citation_url: 'https://repository.test/history', citation_doi: '10.1234/history' } },
              $unset: { figshareSyncIntent: '' },
            }
          );
        const oni = new OniPublishing();
        oni.sites = { public: oni.sites.public };
        oni.sites.public.storage.diskName = 'repository';
        oni.sites.public.ingestion.enabled = false;
        if (shape === 'oni-ambiguous-site') oni.sites.second = { ...oni.sites.public };
        const converted = convertPublicationConfiguration(
          'brand',
          migrationJson({ oniPublishing: oni }),
          [],
          options.parameters!
        );
        // Distinct outputs allow the real ambiguous-site classification past the global collision gate.
        for (const [i, destination] of Object.values(converted.config.destinations).entries())
          destination.writeBack = {
            citationUrlPath: `metadata.oni${i}_url`,
            citationDoiPath: `metadata.oni${i}_doi`,
            publicationErrorPath: `metadata.oni${i}_error`,
          };
        // Inventory reads the configured historical paths too.
        for (const [i] of Object.values(converted.config.destinations).entries())
          await db()
            .collection('record')
            .updateOne(
              { redboxOid: 'record' },
              { $set: { [`metadata.oni${i}_url`]: 'https://repository.test/history' } }
            );
        legacy.oniPublishing = migrationJson(oni);
        legacy.publicationPublishing = migrationJson(converted.config);
        options.parameters = {
          ...options.parameters,
          useExistingConfiguration: true,
          assignments: converted.assignments,
        };
        selected = { ...key, destinationId: converted.assignments['oni:public'] };
      }
      const migrated = await run();
      assert.equal(migrated.authority, 'shared', JSON.stringify(migrated));
      const work = service.consumerRuntime();
      work.recordAudit = undefined;
      work.brands = async () => ['brand'];
      work.enqueue = async () => {
        assert.fail('Migration must not dispatch historical authority');
      };
      work.prepareWorkflowTransition = async () => {
        assert.fail('Historical evidence must not transition workflow');
      };
      const initial = await work.store.get(selected);
      assert.ok(initial);
      const retained = await journal().items.find(selected).toArray();
      const quarantined = retained.some(item => item.quarantine.length);
      assert.equal(initial.source, null);
      assert.equal(initial.approvalId, '');
      assert.equal(initial.completion, undefined);
      if (shape === 'retained-archive') await retainPublicationHistory(db(), initial);
      assert.ok(
        Object.values(initial.work).every(item => item.requested === 0 && item.processed === 0 && item.dueAt === null)
      );
      await dispatchPublications(work);
      assert.deepEqual(await work.store.get(selected), initial);
      const readiness = result(await service.readiness({ brandId: 'brand', username: 'admin' }));
      assert.equal(readiness.ready, true, JSON.stringify(readiness));
      if (shape === 'orphan') {
        await assert.rejects(service.getRecordStatus('brand', 'record'), /brand mismatch/);
        await assert.rejects(
          service.administer({ action: 'inspect', ...selected, username: 'admin' }),
          /brand mismatch/
        );
      } else {
        const status = (await service.getRecordStatus('brand', 'record')).integrations.find(
          item => item.destinationId === selected.destinationId
        );
        assert.ok(status);
        assert.equal(status.workStatus, shape === 'invalid-state' || quarantined ? 'repair_required' : 'paused');
        assert.equal(status.completion, undefined);
        assert.equal(status.observation?.current ?? false, false);
        const inspected = result(await service.administer({ action: 'inspect', ...selected, username: 'admin' }));
        assert.equal(inspected.configurationAvailable, true);
        await assert.rejects(
          service.administer({ action: 'resume', ...selected, username: 'admin' }),
          /current unchanged approval/
        );
        await assert.rejects(
          service.administer({ action: 'revoke', ...selected, username: 'admin', approvalId: 'legacy' }),
          /current approval/
        );
        const cannotReconcile = [
          'link-only',
          'shared-binding-only',
          'invalid-state',
          'target-mismatch',
          'create:submitted',
          'create:uncertain',
          'create:failed',
          'publish:submitted',
          'publish:accepted',
          'publish:uncertain',
          'publish:rejected',
          'oni-history',
          'oni-ambiguous-site',
        ].includes(shape);
        const reconcile = service.administer({ action: 'reconcile', ...selected, username: 'admin' });
        if (cannotReconcile) await assert.rejects(reconcile, /binding|repair input|account|token|uncertain|read-only/i);
        else assert.equal(result(await reconcile).readOnly, true);
        assert.deepEqual(await work.store.get(selected), initial);
        const release = service.administer({
          action: 'repair',
          ...selected,
          username: 'admin',
          repair: 'release-migration-quarantine',
          parameters: { abandonHistoricalAuthority: true, evidenceReference: 'matrix/settlement' },
        });
        const blocked = [
          'invalid-state',
          'target-mismatch',
          'duplicate-state',
          'conflicting-writers',
          'create:submitted',
          'create:uncertain',
          'create:failed',
          'create:confirmed',
          'publish:submitted',
          'publish:accepted',
          'publish:uncertain',
          'publish:observed',
          'receipt:initialising',
          'receipt:uploading',
          'receipt:completing',
          'receipt:deleting',
          'oni-ambiguous-site',
        ].includes(shape);
        if (blocked) await assert.rejects(release, /uncertain|uncertainty|receipt|state|target|owner|orphan/i);
        else assert.equal(result(await release).dryRun, true);
        assert.deepEqual(await work.store.get(selected), initial);
      }
      const enabled = result(legacy.publicationPublishing);
      assert.ok(enabled.processing && typeof enabled.processing === 'object' && !Array.isArray(enabled.processing));
      enabled.processing.enabled = true;
      assert.ok(
        enabled.destinations && typeof enabled.destinations === 'object' && !Array.isArray(enabled.destinations)
      );
      for (const destination of Object.values(enabled.destinations)) {
        assert.ok(destination && typeof destination === 'object' && !Array.isArray(destination));
        destination.enabled = true;
      }
      legacy.publicationPublishing = enabled;
      // Both workflow policies and local content settlement are harmless without a fresh source.
      const configuration = await work.configuration('brand');
      assert.ok(configuration);
      for (const completion of ['all', 'any'] as const) {
        configuration.workflow.rules = [
          {
            id: 'history',
            version: 1,
            recordType: 'data',
            targetStage: 'published',
            completion,
            destinations: [selected.destinationId],
          },
        ];
        const current = { ...work, configuration: async () => configuration };
        assert.equal(await evaluatePublicationWorkflow(current, selected), true);
        assert.equal(await applyPublicationContentReplacement(current, selected), true);
      }
      // A stale/administrative observation wake-up still cannot turn history into source authority.
      const requested = await work.store.request(selected, 'observe', initial.revision);
      await runPublicationWorker(work, { attrs: { data: selected } });
      const refused = await work.store.get(selected);
      assert.ok(refused);
      assert.equal(refused.waitingReason, shape === 'orphan' ? 'record_deleted' : 'source_unavailable');
      assert.equal(refused.work.observe.requested, requested.work.observe.requested);
      assert.equal(refused.work.observe.processed, 0);
      assert.deepEqual(refused.operations, initial.operations);
      assert.deepEqual(refused.providerState, initial.providerState);
      assert.deepEqual(refused.binding, initial.binding);
      assert.equal(refused.completion, undefined);
      await cleanupPublicationAttachments({
        ...work,
        db: db(),
        removeOriginal: async () => {
          assert.fail('History cannot authorize attachment removal');
        },
      });
      // Every shape retains migration evidence through independent stage-2 conversion.
      const beforeConversion = await work.store.get(selected);
      await convertPublicationVocabulary(db(), {
        brandId: 'brand',
        actor: 'admin',
        apply: true,
        reason: 'Independent stage 2',
      });
      await convertPublicationVocabulary(db(), {
        brandId: 'brand',
        actor: 'admin',
        apply: true,
        reason: 'Replay stage 2',
      });
      assert.deepEqual(await work.store.get(selected), beforeConversion);
      assert.deepEqual(await journal().items.find(selected).toArray(), retained);
      assert.equal(consumerMutations, 0);
      if (!shape.startsWith('oni-')) {
        if (shape === 'pre-fence-recovery')
          await assert.rejects(
            publicationStagingIsReferenced(db(), recovery),
            /Publication staging graph is unregistered; inputs retained/
          );
        else assert.equal(await publicationStagingIsReferenced(db(), recovery), true);
        await cleanupPublicationStaging({ ...work, db: db(), now: () => Date.now() + 7200000 });
        // Verify the bytes without registering the deliberately pre-fence graph.
        await new PublicationStaging(
          'durable',
          Reflect.get(globalThis, 'StorageManagerService').disk('durable')
        ).verify('brand', recovery);
      } else {
        // Oni-only history has no reference to this unrelated staged object.
        assert.equal(await publicationStagingIsReferenced(db(), recovery), false);
        await cleanupPublicationStaging({ ...work, db: db(), now: () => Date.now() + 7200000 });
        await assert.rejects(readFile(join(directory, recovery.key)), { code: 'ENOENT' });
      }
      if (shape === 'create:confirmed' || shape === 'publish:observed') {
        // Copied transport confirmations have no host acknowledgement. Verify them through
        // the supported source-less repair before permitting historical quarantine release.
        const beforeRepair = await work.store.get(selected);
        assert.ok(beforeRepair);
        assert.equal(initial.operations.length, 1);
        assert.notEqual(initial.operations[0].checkpointed, true);
        assert.equal(
          result(
            await service.administer({
              action: 'repair',
              ...selected,
              username: 'admin',
              repair: 'reconcile-evidence',
              apply: true,
              reason: 'Verify copied confirmation',
            })
          ).applied,
          true
        );
        const acknowledged = await work.store.get(selected);
        assert.ok(acknowledged);
        assert.deepEqual(
          acknowledged.operations,
          initial.operations.map(operation => ({
            ...operation,
            checkpointed: true,
            confirmation: publicationOperationEvidence(beforeRepair, operation, beforeRepair.binding),
            evidence: {
              ...operation.evidence,
              articleId: '55',
              ...(shape === 'create:confirmed' ? { tokenVerified: true } : { version: 2, published: true }),
            },
          }))
        );
        assert.deepEqual(acknowledged.work, beforeRepair.work);
        assert.equal(acknowledged.source, null);
        assert.equal(acknowledged.approvalId, '');
        assert.equal(acknowledged.completion, undefined);
        assert.equal(
          result(
            await service.administer({
              action: 'repair',
              ...selected,
              username: 'admin',
              repair: 'release-migration-quarantine',
              apply: true,
              reason: 'Release verified historical confirmation',
              parameters: { abandonHistoricalAuthority: true, evidenceReference: 'matrix/verified-confirmation' },
            })
          ).applied,
          true
        );
        const released = await work.store.get(selected);
        assert.ok(released);
        assert.deepEqual(released.operations, acknowledged.operations);
        assert.deepEqual(released.work, beforeRepair.work);
        assert.equal(released.source, null);
        assert.equal(released.approvalId, '');
        assert.equal(released.completion, undefined);
        const resolved = await journal().items.find(selected).toArray();
        assert.deepEqual(
          resolved.map(({ resolution: _resolution, ...item }) => item),
          retained
        );
        assert.ok(resolved.every(item => item.resolution?.evidenceReference === 'matrix/verified-confirmation'));
        assert.equal(consumerMutations, 0);
      }
    });
  }
  for (const boundary of [
    'authority_fenced',
    'prepared',
    'destination_initialised',
    'destination_written',
    'converted',
    'verified',
  ]) {
    it(`fences consumers while migration is interrupted after ${boundary}`, async () => {
      const staging = new PublicationStaging(
        'durable',
        Reflect.get(globalThis, 'StorageManagerService').disk('durable'),
        new PublicationStagingFence(db())
      );
      const recovery = await staging.putJson('brand', JSON.stringify({ boundary }));
      await db()
        .collection('figsharesync')
        .updateOne({ oid: 'record' }, { $set: { recoveryInput: recovery } });
      fault = boundary;
      await assert.rejects(run(), /Interrupted/);
      const before = await journal().get('brand');
      assert.equal(before?.authority, 'preparing');
      const work = service.consumerRuntime();
      work.recordAudit = undefined;
      work.brands = async () => ['brand'];
      work.enqueue = async () => {
        assert.fail('Preparing authority cannot dispatch');
      };
      await assert.rejects(
        runPublicationWorker(work, { attrs: { data: key } }),
        /Publication brand cutover is in progress/
      );
      await dispatchPublications(work);
      const inspect = result(await service.administer({ action: 'inspect', ...key, username: 'admin' }));
      assert.equal(inspect.configurationAvailable, false);
      await assert.rejects(
        service.administer({ action: 'reconcile', ...key, username: 'admin' }),
        /Publication brand cutover is in progress/
      );
      assert.equal(result(await service.readiness({ brandId: 'brand', username: 'admin' })).ready, false);
      const status = await service.getRecordStatus('brand', 'record');
      assert.ok(status.integrations.every(item => item.status !== 'success'));
      const retained = await work.store.get(key);
      await assert.rejects(evaluatePublicationWorkflow(work, key), /Publication brand cutover is in progress/);
      if (retained)
        await assert.rejects(applyPublicationContentReplacement(work, key), /Publication brand cutover is in progress/);
      else assert.equal(await applyPublicationContentReplacement(work, key), true);
      await cleanupPublicationAttachments({
        ...work,
        db: db(),
        removeOriginal: async () => assert.fail('Preparing authority cannot remove attachments'),
      });
      await cleanupPublicationStaging({ ...work, db: db(), now: () => Date.now() + 7200000 });
      await staging.verify('brand', recovery);
      await convertPublicationVocabulary(db(), { brandId: 'brand', actor: 'admin', apply: true, reason: 'Stage 2' });
      assert.deepEqual(await work.store.get(key), retained);
      assert.deepEqual(await journal().get('brand'), before);
      assert.equal((await run()).authority, 'shared');
    });
  }
  it('preserves a foreign conflict-only migration fence across consumers without a sync row', async () => {
    const foreign = { ...key, brandId: 'foreign', oid: 'foreign-record' };
    const peer = emptyFigshareEvidence(foreign.oid, foreign.brandId);
    peer.binding = {
      namespace: 'https://api.figshare.test/v2',
      accountId: '12',
      ownerId: '13',
      articleId: '55',
    };
    await db()
      .collection('figsharesync')
      .insertOne({ ...peer });
    await db()
      .collection('record')
      .insertOne({
        redboxOid: foreign.oid,
        revision: 1,
        recordVersion: 1,
        metadata: {},
        metaMetadata: { brandId: foreign.brandId, type: 'data' },
      });
    globalValue('BrandingService', {
      getBrandById: (id: string) => ({ ...brand, id, name: id }),
    });
    globalValue('UsersService', {
      getUserWithUsername: (username: string) =>
        of({ username, type: 'local', roles: [{ name: 'Admin', branding: foreign.brandId }] }),
    });
    assert.equal((await run()).authority, 'shared');
    const retained = await journal().items.find(foreign).toArray();
    assert.equal(retained.length, 1);
    assert.equal(retained[0].converted, true);
    assert.deepEqual(retained[0].evidence, { conflictGroup: retained[0].conflictGroup, origin: 'brand' });
    assert.equal(await journal().get(foreign.brandId), null);
    const work = service.consumerRuntime();
    work.recordAudit = undefined;
    work.brands = async () => [foreign.brandId];
    work.enqueue = async () => assert.fail('A conflict stub must not dispatch work');
    assert.equal(await work.store.get(foreign), null);
    await runPublicationWorker(work, { attrs: { data: foreign } });
    await dispatchPublications(work);
    const status = await service.getRecordStatus(foreign.brandId, foreign.oid, { includeSignals: true });
    assert.equal(status.shared, true);
    assert.deepEqual(status.integrations, []);
    assert.equal(status.signals?.migrationQuarantineCount, 1);
    const inspect = result(await service.administer({ action: 'inspect', ...foreign, username: 'admin' }));
    assert.equal(inspect.configurationAvailable, false);
    assert.deepEqual(inspect.rows, []);
    assert.ok(Array.isArray(inspect.migrationQuarantines) && inspect.migrationQuarantines.length === 1);
    for (const action of ['reconcile', 'resume', 'revoke', 'repair'] as const)
      await assert.rejects(
        service.administer({
          action,
          ...foreign,
          username: 'admin',
          approvalId: 'absent',
          repair: 'release-migration-quarantine',
        }),
        /Shared publication configuration is unavailable/
      );
    assert.equal(result(await service.readiness({ brandId: foreign.brandId, username: 'admin' })).ready, false);
    assert.equal(await evaluatePublicationWorkflow(work, foreign), false);
    assert.equal(await applyPublicationContentReplacement(work, foreign), true);
    await cleanupPublicationAttachments({
      ...work,
      db: db(),
      removeOriginal: async () => assert.fail('A conflict stub cannot authorize attachment removal'),
    });
    await cleanupPublicationStaging({ ...work, db: db() });
    await convertPublicationVocabulary(db(), {
      brandId: foreign.brandId,
      actor: 'admin',
      apply: true,
      reason: 'Stage 2',
    });
    await convertPublicationVocabulary(db(), {
      brandId: foreign.brandId,
      actor: 'admin',
      apply: true,
      reason: 'Replay stage 2',
    });
    assert.deepEqual(await journal().items.find(foreign).toArray(), retained);
    assert.equal(await work.store.get(foreign), null);
    await assert.rejects(
      journal().assertNotQuarantined(foreign.brandId, foreign.oid, foreign.destinationId),
      /quarantine/
    );
  });
  it('allows changing/removing unused targets and keeps durable migrated targets immutable across restart', async () => {
    const config = new PublicationPublishing();
    config.destinations.unused = {
      provider: 'figshare',
      displayName: 'Unused',
      enabled: false,
      archived: false,
      connection: { baseUrl: 'https://api.figshare.test/v2', accountId: '12' },
      mapping: {},
      attachments: {},
      writeBack: {},
      providerOptions: {},
    };
    await service.validateConfigurationForSave('brand', config, {});
    const prior = migrationJson(config);
    config.destinations.unused.connection.accountId = '13';
    await service.validateConfigurationForSave('brand', config, prior);
    delete config.destinations.unused;
    await service.validateConfigurationForSave('brand', config, prior);
    await run();
    const used = migrationJson(legacy.publicationPublishing);
    assert.ok(used.destinations && typeof used.destinations === 'object');
    const changed = migrationJson(used);
    const destinations = changed.destinations;
    assert.ok(destinations && typeof destinations === 'object');
    const destination = Reflect.get(destinations, destinationId);
    Reflect.get(destination, 'connection').accountId = '99';
    await assert.rejects(
      new TestPublication().validateConfigurationForSave('brand', changed, used),
      /used-target-change/
    );
    delete Reflect.get(destinations, destinationId).connection.token;
    await assert.rejects(
      new TestPublication().validateConfigurationForSave('brand', changed, used),
      /used-target-change/
    );
  });
  it('exercises the migration CLI entry module against real Mongo, including dry-run/apply and shutdown', async () => {
    const cli = require(resolve(__dirname, '../../../../support/publication/admin.js'));
    let closed = 0;
    const load = async () => ({
      service: { migrate: (input: PublicationMigrationOptions) => migratePublication(runtime, input) },
      close: async () => {
        closed++;
      },
    });
    const args = [
      'migrate',
      '--brand',
      'brand',
      '--username',
      'admin',
      '--parameters',
      JSON.stringify(options.parameters),
    ];
    await cli.main(args, load, () => {});
    assert.equal(await journal().collection.countDocuments(), 0);
    await cli.main([...args, '--apply', '--reason', 'CLI rehearsal'], load, () => {});
    assert.equal((await journal().get('brand'))?.authority, 'shared');
    assert.equal(closed, 2);
  });
  it('runs the executable migration CLI in child processes with real Mongo, denial, replay and queue-disabled loading', async () => {
    const entry = resolve(__dirname, '../../../../support/publication/admin.js');
    const preload = resolve(__dirname, '../fixtures/publication-migration-cli.cjs');
    const marker = join(directory, `closed-${randomUUID()}`);
    const server = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 12 }));
    });
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}/v2`;
    const figshare = legacy.figsharePublishing;
    assert.ok(figshare && typeof figshare === 'object');
    Reflect.get(figshare, 'connection').baseUrl = baseUrl;
    await db()
      .collection('figsharesync')
      .updateOne({ oid: 'record' }, { $set: { 'binding.namespace': baseUrl } });
    const env = {
      ...process.env,
      PUB16_CLI_DATABASE: database,
      PUB16_CLI_CLOSED: marker,
      PUB16_CLI_CONFIGURATION: JSON.stringify(legacy),
      PUB16_CLI_DIRECTORY: directory,
    };
    const args = [
      '--require',
      preload,
      entry,
      'migrate',
      '--brand',
      'brand',
      '--username',
      'admin',
      '--parameters',
      JSON.stringify(options.parameters),
    ];
    const execute = promisify(execFile);
    try {
      const dry = await execute(process.execPath, args, { env, timeout: 30000 });
      assert.equal(JSON.parse(dry.stdout).dryRun, true);
      assert.equal(await readFile(marker, 'utf8'), 'closed');
      assert.equal(await journal().collection.countDocuments(), 0);
      const apply = await execute(process.execPath, [...args, '--apply', '--reason', 'Executable migration verified'], {
        env,
        timeout: 30000,
      });
      assert.equal(JSON.parse(apply.stdout).applied, true, apply.stdout);
      const replay = await execute(process.execPath, [...args, '--apply', '--reason', 'Executable migration replay'], {
        env,
        timeout: 30000,
      });
      assert.equal(JSON.parse(replay.stdout).alreadyCommitted, true);
      await assert.rejects(
        execute(
          process.execPath,
          args.map(arg => (arg === 'admin' ? 'foreign' : arg)),
          { env, timeout: 30000 }
        ),
        /administrator/
      );
      assert.equal(await readFile(marker, 'utf8'), 'closed');
    } finally {
      await new Promise<void>((done, reject) => server.close(error => (error ? reject(error) : done())));
    }
  });
});
