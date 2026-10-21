import { publicationEvidenceFields, withPublicationEvidenceMismatch } from '../fixtures/publicationEvidence';
import { publicationOperationIdempotencyKey } from '@researchdatabox/redbox-core/dist/services/publication/operations';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { of, firstValueFrom } from 'rxjs';
import { MongoClient } from 'mongodb';
import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import { S3Client, CreateBucketCommand, DeleteBucketCommand } from '@aws-sdk/client-s3';
import {
  PublicationPublishing,
  PublicationProviderRegistry,
  PublicationSyncStore,
  PublicationResourceStore,
  PublicationStaging,
  publicationContentRecord,
  publicationDigest,
  publicationRecordDigest,
  sealPublicationSource,
  runPublicationWorker,
  importPublicationIntents,
  verifyPublicationInputs,
  migratePublication,
  migrationJson,
  administerPublication,
  type PublicationObject,
  type PublicationApproval,
  type PublicationSnapshot,
  type PublicationDispatcherRuntime,
  type PublicationWorkKey,
  type PublicationAttachmentSource,
  type PublicationDestinationInput,
} from '@researchdatabox/redbox-core';
import { Services as OniServices } from '@researchdatabox/redbox-core/dist/services/OniService';
import { Services as Managers } from '@researchdatabox/redbox-core/dist/services/StorageManagerService';
import { createOniPublicationProvider } from '@researchdatabox/redbox-core/dist/services/oni-v2/publication-adapter';
import { prepareOniSource, decodeOniCrate } from '@researchdatabox/redbox-core/dist/services/oni-v2/publication-source';
import {
  oniDestinationConfiguration,
  oniRepositoryIdentity,
} from '@researchdatabox/redbox-core/dist/services/oni-v2/publication-config';
import { isPublicationObject } from '@researchdatabox/redbox-core/dist/services/publication/builtins';
import { PublicationLeaseLost } from '@researchdatabox/redbox-core/dist/services/publication/ownership';
import type {
  OniOcflRecoveryRepository,
  OniPublishInput,
  OniCrateBuildResult,
  ResolvedOniPublishingConfigData,
} from '@researchdatabox/redbox-core/dist/services/oni-v2/types';
import type { OniPublishingSiteConfig } from '@researchdatabox/redbox-core/dist/configmodels/OniPublishing';
import type { DiskConfig } from '@researchdatabox/redbox-core/dist/config/storage.config';
import { Services } from '../../src/services/MongoStorageService';
import { storage } from '../../src/config/storage';

if (process.env.CI && !process.env.MONGO_TEST_URL) throw new Error('CI requires MONGO_TEST_URL for PUB-11');
if (process.env.ONI_OCFL_REQUIRE_S3 === 'true' && !process.env.ONI_OCFL_TEST_S3_ENDPOINT)
  throw new Error('PUB-11 requires S3 endpoint');
for (const backend of ['fs', 's3'] as const) {
  const suite =
    process.env.MONGO_TEST_URL && (backend === 'fs' || process.env.ONI_OCFL_TEST_S3_ENDPOINT)
      ? describe
      : describe.skip;
  suite(`Oni publication adapter PUB-11 (${backend}, real Mongo/OCFL/HTTP)`, function () {
    this.timeout(45000);
    const database = `pub11_${backend}_${randomUUID().replaceAll('-', '')}`;
    const key: PublicationWorkKey = { brandId: 'brand', oid: 'record', destinationId: 'oni' };
    const brand = { id: 'brand', name: 'brand', css: '', roles: [] };
    const globals = new Map<string, unknown>();
    let client: MongoClient, mongo: Services.MongoStorageService, s3: S3Client, bucket: string;
    let directory: string, disk: Managers.IDisk, staging: PublicationStaging, manager: Managers.StorageManager;
    let runtime: PublicationDispatcherRuntime, config: PublicationPublishing, service: OniServices.OniService;
    let server: Server, url: string, clock: number, payload: Buffer;
    let commits: number, rootCommits: number, projections: number, requests: string[], users: string[];
    let beforeCommit: (() => Promise<void>) | undefined, afterCommit: (() => Promise<void>) | undefined;
    let beforeProjection: (() => Promise<void>) | undefined, afterProjection: (() => Promise<void>) | undefined;
    let failIndex: boolean, lostIndex: boolean, access: boolean;
    let savedStorage: unknown, savedRecord: unknown, savedDatastream: unknown;
    const assign = (name: string, value: unknown) => {
      if (!globals.has(name)) globals.set(name, Reflect.get(globalThis, name));
      Reflect.set(globalThis, name, value);
    };
    before(async () => {
      client = new MongoClient(process.env.MONGO_TEST_URL!);
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
      ])
        assign(name, {
          tableName: name.toLowerCase(),
          getDatastore: () => ({ manager: db }),
          findOne: (criteria: Record<string, unknown>) => db.collection(name.toLowerCase()).findOne(criteria),
        });
      const sails = Reflect.get(globalThis, 'sails');
      savedStorage = sails.config.storage;
      savedRecord = sails.config.record;
      savedDatastream = sails.services.pub11Datastream;
      sails.config.storage = storage;
      mongo = new Services.MongoStorageService();
      await mongo.init();
      if (backend === 's3') {
        bucket = `pub11-${randomUUID()}`;
        s3 = new S3Client({
          endpoint: process.env.ONI_OCFL_TEST_S3_ENDPOINT,
          region: 'us-east-1',
          forcePathStyle: true,
          requestChecksumCalculation: 'WHEN_REQUIRED',
          credentials: { accessKeyId: 'pub11', secretAccessKey: 'pub11-local' },
          maxAttempts: 1,
        });
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      }
      server = createServer(async (req, res) => {
        const route = String(req.url);
        requests.push(`${req.method} ${route}`);
        assert.equal(req.headers.authorization, 'Bearer runtime-secret');
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'POST' && lostIndex) {
          lostIndex = false;
          req.socket.destroy();
          return;
        }
        if (req.method === 'GET' && failIndex) {
          res.statusCode = 503;
          res.end('{}');
          return;
        }
        res.end(JSON.stringify(req.method === 'GET' ? { isIndexed: true, count: 2 } : { accepted: true }));
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    after(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()));
      if (s3) {
        await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
        s3.destroy();
      }
      await client.db(database).dropDatabase();
      await client.close();
      const sails = Reflect.get(globalThis, 'sails');
      sails.config.storage = savedStorage;
      sails.config.record = savedRecord;
      sails.services.pub11Datastream = savedDatastream;
      for (const [name, value] of globals) {
        if (value === undefined) Reflect.deleteProperty(globalThis, name);
        else Reflect.set(globalThis, name, value);
      }
    });
    beforeEach(async () => {
      for (const name of [
        'record',
        'recordidentity',
        'deletedrecord',
        'publicationsync',
        'publicationdestination',
        'publicationresourcelease',
        'publicationmigration',
        'publicationmigrationitem',
        'publicationmigrationinventory',
        'publicationmigrationreview',
        'publicationhistory',
        'publicationadmincontrol',
      ])
        await client.db(database).collection(name).deleteMany({});
      directory = await mkdtemp(join(tmpdir(), 'pub11-'));
      await mkdir(join(directory, 'repository'));
      staging = new PublicationStaging(
        'durable',
        new Disk(new FSDriver({ location: join(directory, 'staging'), visibility: 'private' }))
      );
      const diskConfig: DiskConfig =
        backend === 'fs'
          ? { driver: 'fs', config: { root: directory } }
          : {
              driver: 's3',
              config: {
                bucket,
                endpoint: process.env.ONI_OCFL_TEST_S3_ENDPOINT,
                region: 'us-east-1',
                key: 'pub11',
                secret: 'pub11-local',
                forcePathStyle: true,
                supportsACL: false,
                requestChecksumCalculation: 'WHEN_REQUIRED',
              },
            };
      const preparedManager = new (class extends Managers.StorageManager {
        override getMergedStorageConfig() {
          return {
            serviceName: 'manager',
            primaryDisk: 'repository',
            stagingDisk: 'repository',
            disks: { repository: diskConfig, alias: diskConfig },
          };
        }
        async ready() {
          await this.processDynamicImports();
          await this.bootstrap();
        }
      })();
      await preparedManager.ready();
      manager = preparedManager;
      disk = manager.disk('repository');
      assign('StorageManagerService', manager);
      assign('BrandingService', { getBrandById: () => brand, getBrand: () => brand });
      assign('UsersService', {
        getUserWithUsername: (username: string) => {
          users.push(username);
          return of({
            username,
            type: 'local',
            email: `${username}@example.test`,
            name: `${username} Person`,
            disabled: username === 'approver' && users.filter(value => value === 'approver').length > 1,
            roles: [],
          });
        },
      });
      assign('RecordsService', { getPublicationStorage: () => mongo, hasEditAccess: () => access });
      clock = Date.now();
      payload = Buffer.from('approved binary\x00data');
      commits = rootCommits = projections = 0;
      requests = [];
      users = [];
      beforeCommit = afterCommit = beforeProjection = afterProjection = undefined;
      failIndex = lostIndex = false;
      access = true;
      const sails = Reflect.get(globalThis, 'sails');
      sails.config.record = { ...sails.config.record, datastreamService: 'pub11Datastream' };
      sails.services.pub11Datastream = {
        getDatastream: async () => ({ readstream: Readable.from([payload]) }),
        getDatastreamFingerprint: async () => createHash('sha256').update(payload).digest('hex'),
      };
      service = new (class extends OniServices.OniService {
        protected override createRepository(
          configuration: ResolvedOniPublishingConfigData,
          site: OniPublishingSiteConfig
        ): OniOcflRecoveryRepository {
          const repository = super.createRepository(configuration, site);
          if (!('readObject' in repository) || !('reconcileCommit' in repository)) throw new Error('Missing recovery');
          const recovery = repository as OniOcflRecoveryRepository;
          return {
            ...recovery,
            ensureStorageRoot: () => recovery.ensureStorageRoot(),
            inspectStorageRoot: () => recovery.inspectStorageRoot!(),
            ensureRootCollection: (...args) => recovery.ensureRootCollection(...args),
            readObject: id => recovery.readObject(id),
            reconcileCommit: value => recovery.reconcileCommit(value),
            writerQuiesced: () => recovery.writerQuiesced!(),
            writeDatasetObject: async (crate: OniCrateBuildResult, input: OniPublishInput) => {
              if (crate.rootId !== configuration.rootCollection.rootCollectionId && beforeCommit) {
                const callback = beforeCommit;
                beforeCommit = undefined;
                await callback();
              }
              await recovery.writeDatasetObject(crate, input);
              if (crate.rootId !== configuration.rootCollection.rootCollectionId) {
                commits++;
                if (afterCommit) {
                  const callback = afterCommit;
                  afterCommit = undefined;
                  await callback();
                }
              } else rootCommits++;
            },
          };
        }
        override publicationAdapterHooks() {
          const hooks = super.publicationAdapterHooks();
          return {
            ...hooks,
            project: async (...args: Parameters<typeof hooks.project>) => {
              if (beforeProjection) {
                const callback = beforeProjection;
                beforeProjection = undefined;
                await callback();
              }
              await hooks.project(...args);
              projections++;
              if (afterProjection) {
                const callback = afterProjection;
                afterProjection = undefined;
                await callback();
              }
            },
          };
        }
      })();
      config = new PublicationPublishing();
      config.processing = {
        ...config.processing,
        enabled: true,
        serviceUsername: 'worker',
        stagingDisk: 'durable',
        coalesceMs: 0,
        retryBaseMs: 1,
      };
      config.destinations.oni = {
        provider: 'oni',
        displayName: 'Repository',
        enabled: true,
        archived: false,
        connection: {
          publicUrl: 'https://data.example.test',
          useCleanUrl: true,
          storage: {
            driver: 'flydrive',
            diskName: 'repository',
            prefix: backend === 'fs' ? 'repository' : `repository-${randomUUID()}`,
            rootPath: '/objects',
            workspacePath: '/workspace',
            tempDir: '/unused',
            keyEncoding: 'flydrive',
          },
          ingestion: {
            enabled: true,
            apiUrl: url,
            adminToken: 'runtime-secret',
            pollIntervalMs: 1,
            timeoutMs: 5000,
            forceReindex: false,
          },
        },
        mapping: {},
        attachments: {},
        providerOptions: { rootCollection: { targetRepoNamespace: 'uts_public_data_repo' } },
        writeBack: {
          citationUrlPath: 'metadata.citation_url',
          citationDoiPath: 'metadata.citation_doi',
          publicationErrorPath: 'metadata.publication_error',
        },
      };
      config.sourcePolicies = [
        {
          id: 'approve',
          version: 1,
          mode: 'approval',
          recordType: 'dataPublication',
          event: 'OniService.exportDataset',
          destinations: ['oni'],
        },
      ];
      const registry = new PublicationProviderRegistry();
      registry.register(createOniPublicationProvider(() => service.publicationAdapterHooks()));
      registry.freeze();
      runtime = {
        storage: mongo,
        store: new PublicationSyncStore(client.db(database), () => clock),
        resources: new PublicationResourceStore(client.db(database), () => clock),
        registry,
        now: () => clock,
        random: () => 0,
        configuration: async () => config,
        brands: async () => ['brand'],
        staging: () => staging,
        assertAccess: async () => {
          const worker = await firstValueFrom(UsersService.getUserWithUsername(config.processing.serviceUsername));
          if (!access || !worker || worker.disabled || worker.type !== 'local') throw new Error('No access');
        },
        verifyInputs: (...args) => verifyPublicationInputs(runtime, ...args),
        enqueue: async () => {},
        report: () => {},
      };
      await mongo.recordCol.insertOne({
        redboxOid: 'data',
        revision: 0,
        recordVersion: 0,
        metadata: {},
        metaMetadata: { brandId: 'brand' },
      });
      await runtime.store.ensureIndexes();
      await runtime.resources.ensureIndexes();
    });
    afterEach(async () => {
      if (backend === 's3') await disk.deleteAll();
      await rm(directory, { recursive: true, force: true });
    });
    async function ready(work = key, metadata: PublicationObject = {}, destinationIds = [work.destinationId]) {
      const old = await mongo.getMeta(work.oid),
        revision = old?.publicationSource?.revision ?? 0;
      const candidate = {
        redboxOid: work.oid,
        metadata: {
          title: `Dataset ${revision + 1}`,
          description: 'Approved',
          dataRecord: { oid: 'data' },
          citation_doi: 'https://doi.test/{ID_WILL_BE_HERE}',
          dataLocations: [{ type: 'attachment', selected: true, fileId: 'file', name: 'data.bin' }],
          ...metadata,
        },
        metaMetadata: {
          brandId: 'brand',
          createdBy: 'creator',
          createdOn: '2020-01-02T00:00:00Z',
          type: 'dataPublication',
        },
        workflow: { stage: 'queued' },
      };
      if (!old) await mongo.recordCol.insertOne({ ...candidate, revision: 0, recordVersion: 0 });
      const record = publicationContentRecord(candidate);
      assert.ok(isPublicationObject(record));
      const provider = runtime.registry.get('oni')!;
      const generatedValues: PublicationObject = { publicationTimestamp: '2026-02-03T04:05:06Z' };
      const actor = { username: 'approver', userType: 'local' };
      config.sourcePolicies[0].destinations = [
        ...new Set([...config.sourcePolicies[0].destinations, ...destinationIds]),
      ];
      const requester = { username: 'requester', userType: 'local' };
      const relatedInputs: Record<string, PublicationSnapshot> = {};
      const attachments: PublicationAttachmentSource[] = [];
      const destinations: PublicationDestinationInput[] = [];
      for (const destinationId of destinationIds) {
        const input = {
          ...work,
          destinationId,
          configuration: config.destinations[destinationId],
          record,
          generatedValues,
          requester,
          approver: actor,
        };
        const result = await provider.prepareSource!(input);
        if (!result.valid) await prepareOniSource(input, service.publicationAdapterHooks());
        assert.ok(result.valid);
        if (!result.valid) throw new Error('Preflight failed');
        const dependencies = await provider.describeSource!(input, result.value);
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
        for (const [name, snapshot] of Object.entries(dependencies.relatedInputs))
          relatedInputs[`${destinationId}:${name}`] = snapshot;
        for (const file of dependencies.attachments)
          if (!attachments.some(item => item.id === file.id && item.logicalPath === file.logicalPath))
            attachments.push(file);
        destinations.push({
          id: destinationId,
          provider,
          configuration: config.destinations[destinationId],
          targetFingerprint: provider.targetFingerprint(config.destinations[destinationId]),
          mappingContextVersion: 1,
          managedFields: dependencies.managedFields,
        });
      }
      const sealed = await sealPublicationSource(
        {
          ...work,
          requestId: randomUUID(),
          sourceRevision: revision + 1,
          record,
          generatedValues,
          maintenancePaths: [],
          attachments,
          relatedInputs,
          destinations,
          resolveCrosswalk: async () => {
            throw new Error('No Oni crosswalks');
          },
        },
        staging
      );
      const approval: PublicationApproval = {
        id: randomUUID(),
        epoch: 1,
        sourceRevision: revision + 1,
        policy: { ...config.sourcePolicies[0], destinations: destinationIds },
        destinationIds,
        targetFingerprints: sealed.descriptor.targets,
        configurationDigests: sealed.configurationDigests,
        source: sealed.reference,
        requester,
        approver: actor,
        creator: { username: 'creator', userType: 'local' },
        grantedAt: new Date(clock).toISOString(),
      };
      const token = randomUUID();
      const response = await mongo.updateMeta(brand, work.oid, candidate, undefined, {
        publicationIntent: {
          kind: 'content',
          expectedSourceRevision: revision,
          saveToken: token,
          approvals: [approval],
          expectedRecordDigest: publicationRecordDigest(candidate),
        },
      });
      assert.equal(response.applicationState, 'applied');
      const committed = await mongo.getMeta(work.oid);
      assert.equal(
        await mongo.recordPublicationSaveSuccess('brand', work.oid, token, {
          evidenceId: randomUUID(),
          sourceRevision: revision + 1,
          recordDigest: publicationRecordDigest({ ...committed }),
        }),
        true
      );
      assert.equal(await mongo.readyPublicationIntent('brand', work.oid, token), true);
      await importPublicationIntents(runtime, await mongo.getMeta(work.oid));
      return sealed;
    }
    async function run(work = key) {
      clock = Math.max(clock + 200000, Date.now());
      await runPublicationWorker(runtime, { attrs: { data: { ...work, user: { username: 'attacker' } } } });
    }
    async function row(work = key) {
      const result = await runtime.store.get(work);
      assert.ok(result);
      return result;
    }
    async function repository(work = key) {
      const configuration = oniDestinationConfiguration(config.destinations[work.destinationId]);
      return service.publicationAdapterHooks().repository(configuration, configuration.sites.publication, {
        getDatastream: async () => ({ readstream: Readable.from([payload]) }),
      });
    }
    for (const stage of ['journal', 'completion'] as const)
      for (const field of publicationEvidenceFields) {
        it(`generic evidence rejects ${stage} ${field}`, async () => {
          await ready();
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
    async function crash() {
      await runtime.store.collection.updateOne(key, { $set: { 'lease.expiresAt': 0 } });
      throw new PublicationLeaseLost();
    }
    function crashCheckpoint(predicate: (state: PublicationObject) => boolean, after = false) {
      const original = runtime.store.checkpointProviderState.bind(runtime.store);
      let fired = false;
      runtime.store.checkpointProviderState = async (...args: Parameters<typeof original>) => {
        if (!fired && isPublicationObject(args[3]) && predicate(args[3])) {
          fired = true;
          if (after) await original(...args);
          await crash();
        }
        return original(...args);
      };
      return () => assert.equal(fired, true, 'Crash boundary must be reached');
    }
    for (const deposited of [false, true]) {
      it(`hands historical Oni ${deposited ? 'deposits' : 'links'} to fresh shared approval without adopting historical completion`, async () => {
        const metadata = {
          title: 'Historical dataset',
          dataRecord: { oid: 'data' },
          citation_url: 'https://data.example.test/record',
        };
        const legacyRecord = {
          redboxOid: key.oid,
          revision: 0,
          recordVersion: 0,
          metadata,
          metaMetadata: {
            brandId: key.brandId,
            type: 'dataPublication',
            createdBy: 'creator',
            createdOn: '2020-01-02T00:00:00Z',
          },
          workflow: { stage: 'queued' },
        };
        await mongo.recordCol.insertOne(legacyRecord);
        const resolved = oniDestinationConfiguration(config.destinations.oni);
        if (deposited) {
          const prepared = await prepareOniSource(
            {
              ...key,
              configuration: config.destinations.oni,
              record: migrationJson(publicationContentRecord(legacyRecord)),
              generatedValues: { publicationTimestamp: '2020-01-02T00:00:00Z' },
              requester: { username: 'requester', userType: 'local' },
              approver: { username: 'approver', userType: 'local' },
            },
            service.publicationAdapterHooks()
          );
          const repo = await repository();
          await repo.ensureStorageRoot();
          await repo.ensureRootCollection(resolved, resolved.sites.publication);
          await repo.writeDatasetObject(decodeOniCrate(prepared.crate), {
            oid: key.oid,
            record: legacyRecord,
            options: {},
            user: { username: 'approver' },
            creator: { username: 'creator' },
          });
        }
        config.processing.enabled = false;
        config.processing.coalesceMs = 1;
        config.destinations.oni.enabled = false;
        const legacy = migrationJson({
          oniPublishing: { ...resolved, sites: { publication: resolved.sites.publication } },
          publicationPublishing: config,
        });
        const result = await migratePublication(
          {
            db: client.db(database),
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
            reason: 'disposable Oni handoff',
            parameters: {
              useExistingConfiguration: true,
              assignments: { 'oni:publication': 'oni' },
              consumersStopped: true,
              evidenceReference: 'stopped/oni',
            },
          }
        );
        assert.equal(migrationJson(result).authority, 'shared', JSON.stringify(result));
        const migrated = await row();
        assert.deepEqual(migrated.providerState, {});
        assert.equal(migrated.source, null);
        assert.equal(migrated.sourceGeneration, 0);
        assert.equal(migrated.completion, undefined);
        assert.equal(migrated.waitingReason, 'historical_observation_only');
        assert.equal(requests.length, 0, 'Migration cannot infer ingestion from a link or deposit');
        const retained = await client.db(database).collection('publicationmigrationitem').find({}).toArray();
        config.processing.enabled = true;
        config.destinations.oni.enabled = true;
        await ready();
        assert.equal((await row()).sourceGeneration, 1);
        await run();
        const current = await row();
        assert.equal(current.status, 'completed', JSON.stringify(current));
        assert.equal(commits, deposited ? 2 : 1, 'Exactly one new approved deposit');
        assert.equal(current.binding?.objectId, migrated.binding?.objectId);
        assert.equal(current.completion?.sourceGeneration, 1);
        assert.equal(current.completion?.ingestion.state, 'confirmed');
        assert.equal(current.completion?.visibility, 'unverified');
        const object = await (await repository()).readObject(current.binding!.objectId);
        assert.equal(object.kind, 'present');
        if (object.kind === 'present') assert.equal(object.head, deposited ? 'v2' : 'v1');
        assert.deepEqual(
          requests.filter(value => value.startsWith('POST')),
          ['POST /admin/index/structural', 'POST /admin/index/search']
        );
        assert.deepEqual(await client.db(database).collection('publicationmigrationitem').find({}).toArray(), retained);
      });
    }
    it('seals stable history/bytes, completes all checkpoints, persists using the current worker and reports unverified visibility', async () => {
      const sealed = await ready();
      const attachment = sealed.descriptor.attachments[0];
      assert.deepEqual(attachment.original, { oid: 'data', fileId: 'file', digest: attachment.digest });
      assert.ok(attachment.staged, 'Oni recovery must survive cleanup of a shared original');
      await staging.verify(key.brandId, attachment.staged, payload.length);
      assert.equal(commits, 0);
      assert.equal(requests.length, 0);
      await Promise.all([run(), run()]);
      const result = await row();
      assert.equal(result.status, 'completed', JSON.stringify(result));
      assert.equal(commits, 1);
      assert.equal(rootCommits, 1);
      assert.equal(result.completion?.visibility, 'unverified');
      assert.equal(result.completion?.ingestion.state, 'confirmed');
      assert.equal(result.providerState.projection !== undefined, true);
      assert.equal((await mongo.getMeta('record')).metadata.citation_url, 'https://data.example.test/record');
      assert.deepEqual(
        users.filter(value => value === 'approver'),
        ['approver']
      );
      assert.ok(users.includes('worker'));
      assert.equal(JSON.stringify(sealed.descriptor).includes('runtime-secret'), false);
      const prepared = sealed.descriptor.relatedInputs['oni:prepared'];
      assert.ok(isPublicationObject(prepared));
      assert.ok(JSON.stringify(prepared).includes('approver@example.test'));
      assert.ok(JSON.stringify(prepared).includes('creator@example.test'));
      assert.equal(JSON.stringify(prepared).includes('worker@example.test'), false);
      assert.deepEqual(
        requests.filter(value => value.startsWith('POST')),
        ['POST /admin/index/structural', 'POST /admin/index/search']
      );
      assert.equal((await repository()).writerQuiesced !== undefined, true);
    });
    for (const [name, predicate, after] of [
      ['prepared-before', (state: PublicationObject) => !!state.prepared, false],
      ['prepared-after', (state: PublicationObject) => !!state.prepared, true],
      ['submitted-before', (state: PublicationObject) => !!state.submitted, false],
      ['submitted-after', (state: PublicationObject) => !!state.submitted, true],
      ['confirmed-before', (state: PublicationObject) => !!state.confirmed, false],
      ['confirmed-after', (state: PublicationObject) => !!state.confirmed, true],
      ['ingestion-before', (state: PublicationObject) => !!state.ingestion, false],
      ['ingestion-after', (state: PublicationObject) => !!state.ingestion, true],
      [
        'structural-request-before',
        (state: PublicationObject) => isPublicationObject(state.ingestion) && !!state.ingestion.structural,
        false,
      ],
      [
        'structural-request-after',
        (state: PublicationObject) => isPublicationObject(state.ingestion) && !!state.ingestion.structural,
        true,
      ],
      [
        'structural-ready-before',
        (state: PublicationObject) =>
          isPublicationObject(state.ingestion) &&
          isPublicationObject(state.ingestion.structural) &&
          state.ingestion.structural.ready === true,
        false,
      ],
      [
        'structural-ready-after',
        (state: PublicationObject) =>
          isPublicationObject(state.ingestion) &&
          isPublicationObject(state.ingestion.structural) &&
          state.ingestion.structural.ready === true,
        true,
      ],
      [
        'search-ready-before',
        (state: PublicationObject) =>
          isPublicationObject(state.ingestion) &&
          isPublicationObject(state.ingestion.search) &&
          state.ingestion.search.ready === true,
        false,
      ],
      [
        'search-ready-after',
        (state: PublicationObject) =>
          isPublicationObject(state.ingestion) &&
          isPublicationObject(state.ingestion.search) &&
          state.ingestion.search.ready === true,
        true,
      ],
      [
        'search-request-before',
        (state: PublicationObject) => isPublicationObject(state.ingestion) && !!state.ingestion.search,
        false,
      ],
      [
        'search-request-after',
        (state: PublicationObject) => isPublicationObject(state.ingestion) && !!state.ingestion.search,
        true,
      ],
      [
        'ingestion-confirmed-before',
        (state: PublicationObject) => isPublicationObject(state.ingestion) && state.ingestion.state === 'confirmed',
        false,
      ],
      [
        'ingestion-confirmed-after',
        (state: PublicationObject) => isPublicationObject(state.ingestion) && state.ingestion.state === 'confirmed',
        true,
      ],
      ['projection-before', (state: PublicationObject) => !!state.projection, false],
      ['projection-after', (state: PublicationObject) => !!state.projection, true],
    ] as const)
      it(`resumes a crash at ${name} without an extra OCFL version or index request`, async () => {
        await ready();
        const check = crashCheckpoint(predicate, after);
        await run();
        check();
        for (let attempt = 0; attempt < 4 && (await row()).status !== 'completed'; attempt++) await run();
        const result = await row();
        assert.equal(result.status, 'completed', JSON.stringify(result));
        assert.equal(commits, 1);
        const observed = await (await repository()).readObject('arcp://name,uts_public_data_repo/record');
        assert.equal(observed.kind, 'present');
        if (observed.kind === 'present') assert.equal(observed.head, 'v1');
        assert.equal(requests.filter(value => value === 'POST /admin/index/structural').length, 1);
        assert.equal(requests.filter(value => value === 'POST /admin/index/search').length, 1);
      });
    for (const boundary of ['deposit', 'archived-index', 'interrupted-index']) {
      it(`reconciles historical confirmed ${boundary} after a later approved deposit`, async () => {
        await ready();
        await run();
        assert.equal((await row()).status, 'completed');
        const old = (await row()).operations.find(
          op => op.kind === (boundary === 'deposit' ? 'oni.commit' : 'oni.index.structural')
        );
        assert.ok(old);
        await ready(key, { title: 'Second approved title' });
        await run();
        assert.equal((await row()).status, 'completed');
        assert.equal(commits, 2);
        if (boundary !== 'deposit') {
          const resourceKey = {
            providerId: 'oni',
            namespace: oniRepositoryIdentity(config.destinations.oni),
            resourceKey: 'repository',
          };
          const resource = await runtime.resources.get(resourceKey);
          assert.ok(resource);
          await runtime.resources.collection.updateOne(resourceKey, {
            $set: { operations: resource.operations.filter(entry => entry.operation.id !== old.id) },
          });
        }
        await runtime.store.collection.updateOne(
          key,
          { $unset: { 'operations.$[operation].checkpointed': '' } },
          { arrayFilters: [{ 'operation.id': old.id }] }
        );
        await ready(key, { title: 'Third approved title' });
        if (boundary === 'interrupted-index') {
          const original = runtime.resources.restoreConfirmed.bind(runtime.resources);
          let interrupted = false;
          runtime.resources.restoreConfirmed = async (...args) => {
            const result = await original(...args);
            if (!interrupted && args[5].id === old.id) {
              interrupted = true;
              await crash();
            }
            return result;
          };
          await run();
          assert.equal(interrupted, true);
          assert.notEqual((await row()).operations.find(op => op.id === old.id)?.checkpointed, true);
        }
        await run();
        assert.equal((await row()).waitingReason, 'oni_reconciled_resume');
        assert.equal((await row()).operations.find(op => op.id === old.id)?.checkpointed, true);
        assert.equal(commits, 2, 'Historical reconciliation cannot repeat a commit');
        assert.equal(requests.filter(value => value === 'POST /admin/index/structural').length, 2);
        await run();
        assert.equal((await row()).status, 'completed');
        assert.equal(commits, 3);
        assert.equal(requests.filter(value => value === 'POST /admin/index/structural').length, 3);
      });
    }
    it('resumes a record-only index acknowledgement installed by the recovery CLI', async () => {
      await ready();
      crashCheckpoint(
        state =>
          isPublicationObject(state.ingestion) &&
          isPublicationObject(state.ingestion.structural) &&
          state.ingestion.structural.ready === false,
        true
      );
      await run();
      const old = (await row()).operations.find(op => op.kind === 'oni.index.structural');
      assert.ok(old);
      assert.equal(old.outcome, 'confirmed');
      assert.equal(typeof old.evidence.acceptedAt, 'string');
      assert.equal(old.evidence.readyAt, undefined);
      const resourceKey = {
        providerId: 'oni',
        namespace: oniRepositoryIdentity(config.destinations.oni),
        resourceKey: 'repository',
      };
      const resource = await runtime.resources.get(resourceKey);
      assert.ok(resource);
      await runtime.resources.collection.updateOne(resourceKey, {
        $set: { operations: resource.operations.filter(entry => entry.operation.id !== old.id) },
      });
      const admin = {
        ...runtime,
        db: client.db(database),
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
        repair: 'reconcile-ingestion',
        apply: true,
        reason: 'Verified exact index acceptance receipt',
        parameters: {
          operationId: old.id,
          acknowledgementVerified: true,
          acceptedAt: old.evidence.acceptedAt,
          evidenceReference: 'incident:verified-index-acceptance',
        },
      });
      assert.equal((await row()).operations.find(op => op.id === old.id)?.checkpointed, true);
      await administerPublication(admin, {
        action: 'resume',
        ...key,
        username: 'admin',
        apply: true,
        reason: 'Resume after verified acknowledgement',
      });
      await run();
      assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
      assert.equal(commits, 1);
      assert.equal(requests.filter(value => value === 'POST /admin/index/structural').length, 1);
      const restored = (await runtime.resources.get(resourceKey))?.operations.find(
        entry => entry.operation.id === old.id
      );
      assert.equal(restored?.operation.outcome, 'confirmed');
      assert.equal(typeof restored?.operation.evidence.readyAt, 'string');
    });
    for (const mismatch of ['inventory-digest', 'missing-acceptance', 'uncertain-acceptance']) {
      it(`refuses historical Oni evidence with ${mismatch}`, async () => {
        await ready();
        await run();
        const old = (await row()).operations.find(
          op => op.kind === (mismatch === 'inventory-digest' ? 'oni.commit' : 'oni.index.structural')
        );
        assert.ok(old);
        await ready(key, { title: 'Second title' });
        await run();
        assert.equal((await row()).status, 'completed');
        if (mismatch !== 'inventory-digest') {
          const resourceKey = {
            providerId: 'oni',
            namespace: oniRepositoryIdentity(config.destinations.oni),
            resourceKey: 'repository',
          };
          const resource = await runtime.resources.get(resourceKey);
          assert.ok(resource);
          await runtime.resources.collection.updateOne(resourceKey, {
            $set: { operations: resource.operations.filter(entry => entry.operation.id !== old.id) },
          });
        }
        await runtime.store.collection.updateOne(
          key,
          { $unset: { 'operations.$[operation].checkpointed': '' } },
          { arrayFilters: [{ 'operation.id': old.id }] }
        );
        if (mismatch === 'inventory-digest')
          await runtime.store.collection.updateOne(
            key,
            { $set: { 'operations.$[operation].evidence.confirmed.inventoryDigest': '0'.repeat(64) } },
            { arrayFilters: [{ 'operation.id': old.id }] }
          );
        if (mismatch === 'missing-acceptance')
          await runtime.store.collection.updateOne(
            key,
            { $unset: { 'operations.$[operation].evidence.acceptedAt': '' } },
            { arrayFilters: [{ 'operation.id': old.id }] }
          );
        if (mismatch === 'uncertain-acceptance')
          await runtime.store.collection.updateOne(
            key,
            { $set: { 'operations.$[operation].outcome': 'uncertain' } },
            { arrayFilters: [{ 'operation.id': old.id }] }
          );
        await ready(key, { title: 'Third title' });
        await run();
        assert.equal((await row()).status, 'repair_required');
        assert.notEqual((await row()).operations.find(op => op.id === old.id)?.checkpointed, true);
        assert.equal(commits, 2);
        assert.equal(requests.filter(value => value === 'POST /admin/index/structural').length, 2);
      });
    }
    it('repairs an initialization intent stopped before sending into an empty repository', async () => {
      await ready();
      const journal = runtime.store.journal.bind(runtime.store);
      let stopped = false;
      runtime.store.journal = async (...args) => {
        const result = await journal(...args);
        if (!stopped && args[3].kind === 'oni.initialize' && args[3].outcome === 'submitted') {
          stopped = true;
          await crash();
        }
        return result;
      };
      await run();
      assert.equal(stopped, true);
      await run();
      const before = await row();
      assert.equal(before.status, 'repair_required');
      assert.equal(before.waitingReason, 'oni_storage_root_unverified');
      assert.equal(commits, 0);
      assert.equal(rootCommits, 0);
      const operation = before.operations.find(op => op.kind === 'oni.initialize');
      assert.ok(operation);
      const admin = {
        ...runtime,
        db: client.db(database),
        administrator: async () => ({ username: 'admin', userType: 'local' }),
        revoke: async () => {
          throw new Error('No revocation expected');
        },
      };
      const options = {
        action: 'repair' as const,
        ...key,
        username: 'admin',
        repair: 'reconcile-initialization',
        reason: 'Verified stopped initializer and empty storage root',
        parameters: {
          operationId: operation.id,
          priorOperationSettled: true,
          evidenceReference: 'incident:initializer-stopped',
        },
      };
      clock = Date.now();
      await assert.rejects(
        administerPublication(admin, { ...options, parameters: { operationId: operation.id } }),
        /initializer has settled/
      );
      await administerPublication(admin, options);
      assert.deepEqual((await row()).operations, before.operations);
      await administerPublication(admin, { ...options, apply: true });
      const settled = await row();
      assert.equal(settled.operations[0].outcome, 'not_applied');
      assert.deepEqual(settled.work, before.work);
      assert.equal(settled.completion, undefined);
      await administerPublication(admin, { ...options, apply: true });
      assert.deepEqual((await row()).operations, settled.operations);
      assert.equal(rootCommits, 0, 'Read-only repair cannot initialize the root');
      await administerPublication(admin, {
        action: 'resume',
        ...key,
        username: 'admin',
        apply: true,
        reason: options.reason,
      });
      await run();
      assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
      assert.equal(commits, 1);
      assert.equal(rootCommits, 1);
      const resource = await runtime.resources.get({
        providerId: 'oni',
        namespace: oniRepositoryIdentity(config.destinations.oni),
        resourceKey: 'repository',
      });
      assert.equal(
        resource?.operations.find(entry => entry.operation.id === operation.id)?.operation.outcome,
        'not_applied'
      );
    });
    for (const path of ['objects', 'workspace']) {
      it(`refuses initialization recovery with retained ${path} content`, async () => {
        await ready();
        const journal = runtime.store.journal.bind(runtime.store);
        let stopped = false;
        runtime.store.journal = async (...args) => {
          const result = await journal(...args);
          if (!stopped && args[3].kind === 'oni.initialize' && args[3].outcome === 'submitted') {
            stopped = true;
            await crash();
          }
          return result;
        };
        await run();
        assert.equal(stopped, true);
        const before = await row();
        const operation = before.operations.find(op => op.kind === 'oni.initialize');
        assert.ok(operation);
        const storage = oniDestinationConfiguration(config.destinations.oni).sites.publication.storage;
        await disk.put(`${storage.prefix}/${path}/partial-initialization`, 'retained evidence');
        clock = Date.now();
        await assert.rejects(
          administerPublication(
            {
              ...runtime,
              db: client.db(database),
              administrator: async () => ({ username: 'admin', userType: 'local' }),
              revoke: async () => {
                throw new Error('No revocation expected');
              },
            },
            {
              action: 'repair',
              ...key,
              username: 'admin',
              apply: true,
              repair: 'reconcile-initialization',
              reason: 'Verify retained initialization evidence',
              parameters: {
                operationId: operation.id,
                priorOperationSettled: true,
                evidenceReference: 'incident:initializer-stopped',
              },
            }
          ),
          /unverified content/
        );
        assert.deepEqual((await row()).operations, before.operations);
        assert.equal(rootCommits, 0);
        assert.equal(commits, 0);
      });
    }
    for (const kind of ['oni.initialize', 'oni.root', 'oni.commit', 'oni.index.structural', 'oni.index.search']) {
      for (const boundary of ['intent-unsent', 'submitted', 'uncertain', 'confirmed'] as const) {
        it(`state matrix ${kind}/${boundary}: exact evidence, repair and one mutation`, async () => {
          await ready();
          const localJournal = runtime.store.journal.bind(runtime.store);
          const resourceJournal = runtime.resources.journal.bind(runtime.resources);
          let stopped = false;
          runtime.store.journal = async (...args) => {
            const op = args[3];
            const result = await localJournal(...args);
            if (op.outcome === 'submitted') {
              assert.match(op.idempotencyKey ?? '', /^rbpub-v1-[a-f0-9]{64}$/);
              assert.equal(result.operations.find(value => value.id === op.id)?.idempotencyKey, op.idempotencyKey);
              const repository = await runtime.resources.collection.findOne({ 'operations.operation.id': op.id });
              assert.equal(
                repository?.operations.find(entry => entry.operation.id === op.id)?.operation.idempotencyKey,
                op.idempotencyKey
              );
            }
            if (
              !stopped &&
              op.kind === kind &&
              ((boundary === 'intent-unsent' && op.outcome === 'submitted') ||
                (boundary === 'confirmed' && op.outcome === 'confirmed'))
            ) {
              stopped = true;
              await crash();
            }
            return result;
          };
          runtime.resources.journal = async (...args) => {
            const op = args[5];
            if (
              !stopped &&
              op.kind === kind &&
              op.outcome === 'confirmed' &&
              (boundary === 'submitted' || boundary === 'uncertain')
            ) {
              stopped = true;
              if (boundary === 'uncertain') {
                const uncertain = { ...op, outcome: 'uncertain' as const };
                await resourceJournal(args[0], args[1], args[2], args[3], args[4], uncertain);
                const current = await row();
                assert.ok(current.lease);
                await localJournal(key, current.lease, current.revision, uncertain);
              }
              await crash();
            }
            return resourceJournal(...args);
          };
          try {
            await run();
          } finally {
            runtime.store.journal = localJournal;
            runtime.resources.journal = resourceJournal;
          }
          assert.equal(stopped, true, 'Selected operation boundary must execute');
          // The fault can lose the resource journal CAS response. Model the killed
          // process's expired resource lease separately from outcome settlement.
          await runtime.resources.collection.updateMany({ lease: { $ne: null } }, { $set: { 'lease.expiresAt': 0 } });
          const interrupted = await row();
          const op = interrupted.operations.findLast(value => value.kind === kind);
          assert.ok(op);
          const operationKey = publicationOperationIdempotencyKey(interrupted, op);
          assert.equal(op.idempotencyKey, operationKey);
          assert.match(operationKey, /^rbpub-v1-[a-f0-9]{64}$/);
          assert.equal(runtime.registry.get('oni')?.mutationRecovery.mode, 'no-remote-lookup');
          assert.equal(op.outcome, boundary === 'intent-unsent' ? 'submitted' : boundary);
          assert.notEqual(op.checkpointed, true);
          assert.equal(interrupted.completion, undefined);
          const counts = () => [rootCommits, commits, requests.filter(value => value.startsWith('POST ')).length];
          const priorCounts = counts();
          const admin = {
            ...runtime,
            db: client.db(database),
            administrator: async () => ({ username: 'admin', userType: 'local' }),
            revoke: async () => {
              throw new Error('No revocation expected');
            },
          };
          const repair = async (id: string, parameters: PublicationObject) => {
            clock = Date.now();
            const options: import('@researchdatabox/redbox-core').PublicationAdminOptions = {
              ...key,
              action: 'repair' as const,
              repair: id,
              username: 'admin',
              reason: 'Exact stopped operation and authoritative provider receipt verified',
              parameters: { operationId: op.id, ...parameters, evidenceReference: `matrix:${kind}:${boundary}` },
            };
            if (kind.startsWith('oni.index.')) {
              options.parameters = {
                ...options.parameters,
                providerRepair: id,
                idempotencyKey: operationKey,
                intendedDigest: op.intendedDigest,
                priorOperationSettled: true,
                ...(id === 'settle-unapplied-ingestion'
                  ? { outcome: 'not_applied', nonApplicationVerified: true }
                  : {
                      outcome: 'confirmed',
                      externalReceipt: {
                        operationId: op.id,
                        intendedDigest: op.intendedDigest,
                        acceptedAt: parameters.acceptedAt,
                      },
                    }),
              };
              options.repair = 'attest-operation';
            }
            const before = await row();
            if (id === 'reconcile-ingestion') {
              for (const externalReceipt of [
                { operationId: 'different', intendedDigest: op.intendedDigest, acceptedAt: parameters.acceptedAt },
                { operationId: op.id, intendedDigest: 'different', acceptedAt: parameters.acceptedAt },
                { operationId: op.id, intendedDigest: op.intendedDigest, acceptedAt: 'different' },
              ]) {
                await assert.rejects(
                  administerPublication(admin, {
                    ...options,
                    apply: true,
                    parameters: { ...options.parameters, externalReceipt },
                  }),
                  /External receipt must identify the exact operation/
                );
                assert.deepEqual((await row()).operations, before.operations);
                assert.deepEqual((await row()).providerState, before.providerState);
                assert.deepEqual(counts(), priorCounts);
              }
            }
            if (id === 'settle-unapplied-ingestion') {
              for (const invalid of [
                { priorOperationSettled: false },
                { nonApplicationVerified: false },
                { intendedDigest: 'wrong-digest' },
                { evidenceReference: '' },
              ]) {
                await assert.rejects(
                  administerPublication(admin, {
                    ...options,
                    apply: true,
                    parameters: { ...options.parameters, ...invalid },
                  }),
                  /non-application|settlement|digest/i
                );
                assert.deepEqual((await row()).operations, before.operations);
                assert.deepEqual((await row()).providerState, before.providerState);
              }
            }
            await administerPublication(admin, options);
            assert.deepEqual((await row()).operations, before.operations);
            assert.deepEqual((await row()).providerState, before.providerState);
            if (id === 'settle-unapplied-ingestion') {
              const replace = runtime.store.collection.replaceOne.bind(runtime.store.collection);
              let interruptedRepair = false;
              runtime.store.collection.replaceOne = async (...args) => {
                if (
                  !interruptedRepair &&
                  args[1].operations.some(value => value.id === op.id && value.outcome === 'not_applied')
                ) {
                  interruptedRepair = true;
                  throw new Error('Simulated record repair CAS failure after resource settlement');
                }
                return replace(...args);
              };
              try {
                await assert.rejects(
                  administerPublication(admin, { ...options, apply: true }),
                  /record repair CAS failure/
                );
              } finally {
                runtime.store.collection.replaceOne = replace;
              }
              assert.equal(interruptedRepair, true);
              assert.deepEqual((await row()).operations, before.operations);
              const resources = await runtime.resources.collection.find({}).toArray();
              assert.ok(
                resources.some(value =>
                  value.operations.some(
                    entry => entry.operation.id === op.id && entry.operation.outcome === 'not_applied'
                  )
                )
              );
            }
            await administerPublication(admin, { ...options, apply: true });
            await administerPublication(admin, { ...options, apply: true });
            assert.equal((await row()).completion, undefined);
            assert.deepEqual(counts(), priorCounts);
          };
          if (kind.startsWith('oni.index.') && boundary === 'confirmed') {
            clock = Date.now();
            const before = await row();
            await assert.rejects(
              administerPublication(admin, {
                ...key,
                action: 'repair',
                repair: 'settle-unapplied-ingestion',
                username: 'admin',
                apply: true,
                reason: 'Confirmed rebuild must retain its acknowledgement',
                parameters: {
                  operationId: op.id,
                  intendedDigest: op.intendedDigest,
                  priorOperationSettled: true,
                  nonApplicationVerified: true,
                  evidenceReference: 'contradictory-receipt',
                },
              }),
              /Exact indexing request\/deposit\/digest and referenced non-application/
            );
            assert.deepEqual((await row()).operations, before.operations);
            assert.deepEqual(counts(), priorCounts);
          }
          if (boundary === 'intent-unsent') {
            await run();
            assert.equal((await row()).status, 'repair_required');
            assert.equal((await row()).operations.find(value => value.id === op.id)?.outcome, 'submitted');
            assert.deepEqual(counts(), priorCounts);
            if (kind === 'oni.initialize') await repair('reconcile-initialization', { priorOperationSettled: true });
            else if (kind === 'oni.root' || kind === 'oni.commit')
              await repair('reconcile-ocfl', { priorOperationSettled: true });
            else
              await repair('settle-unapplied-ingestion', {
                priorOperationSettled: true,
                nonApplicationVerified: true,
                intendedDigest: op.intendedDigest,
              });
          } else if (kind.startsWith('oni.index.') && boundary !== 'confirmed') {
            await run();
            assert.equal((await row()).status, 'repair_required');
            assert.equal((await row()).completion, undefined);
            assert.deepEqual(counts(), priorCounts);
            // This fake remote recorded the exact POST; readiness by itself is not acceptance.
            await repair('reconcile-ingestion', {
              acknowledgementVerified: true,
              acceptedAt: op.evidence.acceptedAt ?? new Date().toISOString(),
            });
          }
          clock = Date.now();
          await administerPublication(admin, {
            ...key,
            action: 'resume',
            username: 'admin',
            apply: true,
            reason: 'Resume exact approved request',
          });
          for (let attempt = 0; attempt < 4 && (await row()).status !== 'completed'; attempt++) await run();
          const completed = await row();
          assert.equal(completed.status, 'completed', completed.waitingReason);
          assert.equal(
            completed.operations.find(value => value.id === op.id)?.outcome,
            boundary === 'intent-unsent' ? 'not_applied' : 'confirmed'
          );
          const settledOperation = completed.operations.find(value => value.id === op.id);
          assert.ok(settledOperation);
          assert.equal(publicationOperationIdempotencyKey(completed, settledOperation), operationKey);
          assert.equal(
            new Set(completed.operations.map(value => publicationOperationIdempotencyKey(completed, value))).size,
            completed.operations.length
          );
          assert.equal(rootCommits, 1);
          assert.equal(commits, 1);
          assert.equal(requests.filter(value => value === 'POST /admin/index/structural').length, 1);
          assert.equal(requests.filter(value => value === 'POST /admin/index/search').length, 1);
          assert.equal(completed.completion?.visibility, 'unverified');
        });
      }
    }
    for (const kind of ['oni.initialize', 'oni.root', 'oni.commit', 'oni.index.structural', 'oni.index.search']) {
      for (const after of [false, true])
        it(`retains ${kind} evidence across a crash ${after ? 'after' : 'before'} the resource acknowledgement`, async () => {
          await ready();
          const journal = runtime.resources.journal.bind(runtime.resources);
          let fired = false;
          runtime.resources.journal = async (...args: Parameters<typeof journal>) => {
            if (!fired && isPublicationObject(args[5]) && args[5].kind === kind && args[5].outcome === 'confirmed') {
              fired = true;
              if (after) await journal(...args);
              await crash();
            }
            return journal(...args);
          };
          await run();
          assert.equal(fired, true);
          for (
            let attempt = 0;
            attempt < 4 && !['completed', 'repair_required'].includes((await row()).status);
            attempt++
          )
            await run();
          const unacknowledgedIndex = !after && kind.startsWith('oni.index.');
          assert.equal(
            (await row()).status,
            unacknowledgedIndex ? 'repair_required' : 'completed',
            JSON.stringify(await row())
          );
          assert.equal(commits, 1);
          assert.equal(requests.filter(value => value === 'POST /admin/index/structural').length, 1);
          assert.equal(
            requests.filter(value => value === 'POST /admin/index/search').length,
            unacknowledgedIndex && kind === 'oni.index.structural' ? 0 : 1
          );
          if (unacknowledgedIndex) assert.equal((await row()).completion, undefined);
        });
      for (const after of [false, true])
        it(`recovers ${kind} acknowledgement ${after ? 'after' : 'before'} the record journal write`, async () => {
          await ready();
          const journal = runtime.store.journal.bind(runtime.store);
          let fired = false;
          runtime.store.journal = async (...args: Parameters<typeof journal>) => {
            if (!fired && isPublicationObject(args[3]) && args[3].kind === kind && args[3].outcome === 'confirmed') {
              fired = true;
              if (after) await journal(...args);
              await crash();
            }
            return journal(...args);
          };
          await run();
          assert.equal(fired, true);
          for (let attempt = 0; attempt < 4 && (await row()).status !== 'completed'; attempt++) await run();
          assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
          assert.equal(commits, 1);
          assert.equal(requests.filter(value => value === 'POST /admin/index/structural').length, 1);
          assert.equal(requests.filter(value => value === 'POST /admin/index/search').length, 1);
        });
      it(`recovers ${kind} resource-only intent using the host's durable no-send ordering`, async () => {
        await ready();
        const journal = runtime.store.journal.bind(runtime.store);
        let fired = false;
        runtime.store.journal = async (...args: Parameters<typeof journal>) => {
          if (!fired && isPublicationObject(args[3]) && args[3].kind === kind && args[3].outcome === 'submitted') {
            fired = true;
            await crash();
          }
          return journal(...args);
        };
        await run();
        assert.equal(fired, true);
        for (let attempt = 0; attempt < 4 && (await row()).status !== 'completed'; attempt++) await run();
        assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
        assert.equal(commits, 1);
      });
    }
    for (const kind of ['oni.initialize', 'oni.root', 'oni.commit', 'oni.index.structural', 'oni.index.search']) {
      it(`split journal ${kind}: retains host-certified non-application after losing the record settlement`, async () => {
        await ready();
        const journal = runtime.store.journal.bind(runtime.store);
        let denied = false;
        let stopped = false;
        runtime.store.journal = async (...args) => {
          const op = args[3];
          if (op.kind === kind && op.outcome === 'not_applied' && denied && !stopped) {
            stopped = true;
            await crash();
          }
          const result = await journal(...args);
          if (op.kind === kind && op.outcome === 'submitted' && !denied) {
            denied = true;
            access = false;
          }
          return result;
        };
        try {
          await assert.rejects(run(), PublicationLeaseLost);
        } finally {
          runtime.store.journal = journal;
          access = true;
        }
        assert.equal(denied, true);
        assert.equal(stopped, true);
        await runtime.resources.collection.updateMany({ lease: { $ne: null } }, { $set: { 'lease.expiresAt': 0 } });
        const interrupted = await row();
        const operation = interrupted.operations.findLast(op => op.kind === kind);
        assert.ok(operation);
        assert.equal(operation.outcome, 'submitted');
        assert.equal(interrupted.completion, undefined);
        const resource = await runtime.resources.get({
          providerId: 'oni',
          namespace: oniRepositoryIdentity(config.destinations.oni),
          resourceKey: 'repository',
        });
        const settled = resource?.operations.find(entry => entry.operation.id === operation.id)?.operation;
        assert.ok(settled);
        assert.equal(settled.outcome, 'not_applied');
        const counts = () => [rootCommits, commits, requests.filter(value => value.startsWith('POST ')).length];
        const before = counts();
        await run();
        const recovered = await row();
        assert.equal(recovered.operations.find(op => op.id === operation.id)?.outcome, 'not_applied');
        assert.equal(recovered.completion, undefined);
        assert.deepEqual(counts(), before, 'Incorporating a host no-send receipt must be read-only');
        for (let attempt = 0; attempt < 4 && (await row()).status !== 'completed'; attempt++) await run();
        assert.equal((await row()).status, 'completed', (await row()).waitingReason);
        assert.equal(rootCommits, 1);
        assert.equal(commits, 1);
        assert.equal(requests.filter(value => value === 'POST /admin/index/structural').length, 1);
        assert.equal(requests.filter(value => value === 'POST /admin/index/search').length, 1);
      });
    }
    for (const kind of ['oni.index.structural', 'oni.index.search'])
      for (const layer of ['resource', 'record'] as const)
        for (const after of [false, true])
          it(`recovers ${kind} readiness ${after ? 'after' : 'before'} the ${layer} journal write`, async () => {
            await ready();
            let fired = false;
            if (layer === 'resource') {
              const journal = runtime.resources.journal.bind(runtime.resources);
              runtime.resources.journal = async (...args: Parameters<typeof journal>) => {
                if (
                  !fired &&
                  isPublicationObject(args[5]) &&
                  args[5].kind === kind &&
                  isPublicationObject(args[5].evidence) &&
                  typeof args[5].evidence.readyAt === 'string'
                ) {
                  fired = true;
                  if (after) await journal(...args);
                  await crash();
                }
                return journal(...args);
              };
            } else {
              const journal = runtime.store.journal.bind(runtime.store);
              runtime.store.journal = async (...args: Parameters<typeof journal>) => {
                if (
                  !fired &&
                  isPublicationObject(args[3]) &&
                  args[3].kind === kind &&
                  isPublicationObject(args[3].evidence) &&
                  typeof args[3].evidence.readyAt === 'string'
                ) {
                  fired = true;
                  if (after) await journal(...args);
                  await crash();
                }
                return journal(...args);
              };
            }
            await run();
            assert.equal(fired, true);
            for (let attempt = 0; attempt < 4 && (await row()).status !== 'completed'; attempt++) await run();
            assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
            assert.equal(commits, 1);
            assert.equal(requests.filter(value => value === 'POST /admin/index/structural').length, 1);
            assert.equal(requests.filter(value => value === 'POST /admin/index/search').length, 1);
          });
    it('recovers a lost provider checkpoint response from the actual Mongo state', async () => {
      await ready();
      const original = runtime.store.checkpointProviderState.bind(runtime.store);
      let fired = false;
      runtime.store.checkpointProviderState = async (...args: Parameters<typeof original>) => {
        const saved = await original(...args);
        if (!fired && isPublicationObject(args[3]) && args[3].confirmed) {
          fired = true;
          throw new Error('Mongo response lost after persistence');
        }
        return saved;
      };
      await run();
      assert.equal(fired, true);
      assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
      assert.equal(commits, 1);
      assert.equal(Reflect.get((await mongo.getMeta('record')).metaMetadata, 'lastSavedBy'), 'worker');
    });
    it('preserves an existing citation URL and OCFL identity across an approved update', async () => {
      const historical = 'https://historic.example.test/object?id=arcp%3A%2F%2Fname%2Cuts_public_data_repo%2Frecord';
      await ready(key, { citation_url: historical });
      await run();
      assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
      assert.equal((await mongo.getMeta('record')).metadata.citation_url, historical);
      assert.equal((await row()).binding?.objectId, 'arcp://name,uts_public_data_repo/record');
      await ready(key, { citation_url: historical });
      await run();
      assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
      const observed = await (await repository()).readObject('arcp://name,uts_public_data_repo/record');
      assert.equal(observed.kind, 'present');
      if (observed.kind === 'present') assert.equal(observed.head, 'v2');
    });
    it('reconciles a successful commit with a lost response before ingesting and never repeats REPLACE', async () => {
      await ready();
      afterCommit = async () => {
        throw new Error('lost commit response');
      };
      await run();
      assert.equal((await row()).status, 'retrying');
      assert.equal(commits, 1);
      assert.equal(requests.length, 0);
      await run();
      await run();
      assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
      assert.equal(commits, 1);
    });
    it('proves non-application using a positive settled-writer receipt before retrying a commit', async () => {
      await ready();
      beforeCommit = async () => {
        throw new Error('Local failure before writing');
      };
      await run();
      assert.equal(
        (await row()).operations.some(value => value.kind === 'oni.commit' && value.evidence.writerQuiesced === true),
        true
      );
      await run();
      await run();
      assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
      assert.equal(commits, 1);
    });
    it('requires repair for an interrupted unsubmitted commit when the former writer cannot be proved quiescent', async () => {
      await ready();
      beforeCommit = crash;
      await run();
      await run();
      assert.equal((await row()).status, 'repair_required');
      assert.equal(commits, 0);
      assert.equal(requests.length, 0);
    });
    it('confirms exact read-back without manufacturing a positive writer-quiescence receipt', async () => {
      await ready();
      const hooks = service.publicationAdapterHooks();
      service.publicationAdapterHooks = () => ({
        ...hooks,
        repository: (...args) => ({ ...hooks.repository(...args), writerQuiesced: async () => false }),
      });
      await run();
      const result = await row();
      assert.equal(result.status, 'completed', JSON.stringify(result));
      const commit = result.operations.find(operation => operation.kind === 'oni.commit');
      assert.ok(commit);
      assert.equal(commit.outcome, 'confirmed');
      assert.equal(commit.evidence.writerQuiesced, false);
      assert.equal(commits, 1);
    });
    it('resumes ingestion failure after the confirmed deposit without another commit or rebuild submission', async () => {
      await ready();
      failIndex = true;
      await run();
      assert.equal((await row()).status, 'retrying');
      assert.equal(commits, 1);
      failIndex = false;
      await run();
      assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
      assert.equal(commits, 1);
      assert.equal(requests.filter(value => value === 'POST /admin/index/structural').length, 1);
    });
    it('settles an acknowledged rebuild after a failed readiness poll before another record mutates the repository', async () => {
      await ready();
      const other = { ...key, oid: 'other' };
      await ready(other);
      failIndex = true;
      await run();
      assert.equal((await row()).status, 'retrying');
      assert.equal(commits, 1);
      assert.equal(requests.filter(value => value.startsWith('POST')).length, 1);
      await run(other);
      assert.equal(commits, 1, 'An unfinished repository rebuild must fence the next deposit');
      assert.equal(requests.filter(value => value.startsWith('POST')).length, 1, 'Do not overlap rebuilds');
      assert.equal((await row(other)).completion, undefined);
      failIndex = false;
      await run();
      assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
      await run(other);
      assert.equal((await row(other)).status, 'completed', JSON.stringify(await row(other)));
      assert.equal(commits, 2);
      assert.equal(requests.filter(value => value.startsWith('POST')).length, 4);
    });
    for (const changed of [false, true])
      it(`reconciles legacy rebuild receipts only against their sealed endpoint (${changed ? 'changed' : 'unchanged'})`, async () => {
        await ready();
        const journal = runtime.store.journal.bind(runtime.store);
        let fired = false;
        runtime.store.journal = async (...args: Parameters<typeof journal>) => {
          if (
            !fired &&
            isPublicationObject(args[3]) &&
            args[3].kind === 'oni.index.structural' &&
            args[3].outcome === 'confirmed'
          ) {
            fired = true;
            await crash();
          }
          return journal(...args);
        };
        await run();
        assert.equal(fired, true);
        // Simulate durable receipts written by the adapter before endpoint identities were journaled.
        await client
          .db(database)
          .collection('publicationsync')
          .updateMany(
            {},
            {
              $unset: { 'operations.$[operation].evidence.ingestionIdentity': '' },
            },
            { arrayFilters: [{ 'operation.kind': 'oni.index.structural' }] }
          );
        await client
          .db(database)
          .collection('publicationresourcelease')
          .updateMany(
            {},
            {
              $unset: { 'operations.$[entry].operation.evidence.ingestionIdentity': '' },
            },
            { arrayFilters: [{ 'entry.operation.kind': 'oni.index.structural' }] }
          );
        if (changed) {
          const ingestion = config.destinations.oni.connection.ingestion;
          assert.ok(isPublicationObject(ingestion));
          ingestion.apiUrl = `${url}/changed`;
        }
        await run();
        if (changed) {
          assert.equal(
            requests.some(path => path.includes('/changed/')),
            false,
            'Another endpoint cannot settle the old rebuild'
          );
          assert.equal((await row()).status, 'superseded');
          assert.equal((await row()).operations.find(op => op.kind === 'oni.index.structural')?.outcome, 'submitted');
          assert.equal((await row()).completion, undefined);
        } else {
          for (let attempt = 0; attempt < 4 && (await row()).status !== 'completed'; attempt++) await run();
          assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
        }
        assert.equal(commits, 1);
        assert.equal(requests.filter(path => path === 'POST /admin/index/structural').length, 1);
      });
    it('does not treat old repository readiness as proof of a lost ingestion request', async () => {
      await ready();
      lostIndex = true;
      await run();
      await run();
      assert.equal((await row()).status, 'repair_required');
      assert.equal(commits, 1);
      assert.equal(requests.filter(value => value.startsWith('POST')).length, 1);
      assert.equal((await row()).completion, undefined);
    });
    for (const after of [false, true])
      it(`resumes projection failure ${after ? 'after' : 'before'} Mongo persistence without a new OCFL version`, async () => {
        await ready();
        const fault = async () => {
          throw new Error('projection failure');
        };
        if (after) afterProjection = fault;
        else beforeProjection = fault;
        await run();
        assert.equal((await row()).status, 'retrying', JSON.stringify(await row()));
        await run();
        assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
        assert.equal(commits, 1);
        assert.equal(requests.filter(value => value.startsWith('POST')).length, 2);
      });
    it('serializes root/deposit/indexing across records in one physical repository and indexes after each deposit', async () => {
      await ready();
      const other = { ...key, oid: 'other' };
      await ready(other);
      let enter!: () => void, release!: () => void;
      const entered = new Promise<void>(resolve => {
        enter = resolve;
      });
      const held = new Promise<void>(resolve => {
        release = resolve;
      });
      afterCommit = async () => {
        enter();
        await held;
      };
      const first = run();
      await entered;
      await runPublicationWorker(runtime, { attrs: { data: other } });
      try {
        assert.equal((await row(other)).status, 'waiting');
        assert.equal(requests.length, 0);
      } finally {
        release();
      }
      await first;
      await run(other);
      assert.equal((await row(other)).status, 'completed', JSON.stringify(await row(other)));
      assert.equal(rootCommits, 1);
      assert.equal(requests.filter(value => value.startsWith('POST')).length, 4);
    });
    it('keeps repositories and canonical physical disk aliases separate from destination labels', async () => {
      const original = oniRepositoryIdentity(config.destinations.oni);
      const alias = structuredClone(config.destinations.oni);
      assert.ok(isPublicationObject(alias.connection) && isPublicationObject(alias.connection.storage));
      alias.connection.storage.diskName = 'alias';
      alias.connection.storage.rootPath = '/another-virtual-root';
      assert.equal(oniRepositoryIdentity(alias), original);
      alias.connection.storage.prefix = backend === 'fs' ? 'other-repo' : 'separate-prefix';
      if (backend === 'fs') await mkdir(join(directory, 'other-repo'));
      assert.notEqual(oniRepositoryIdentity(alias), original);
      if (backend === 's3') {
        alias.connection.storage.prefix = 'repository//objects';
        const repeatedSeparator = oniRepositoryIdentity(alias);
        alias.connection.storage.prefix = 'repository/objects';
        assert.notEqual(oniRepositoryIdentity(alias), repeatedSeparator);
        alias.connection.storage.prefix = '';
        const bucketRoot = oniRepositoryIdentity(alias);
        alias.connection.storage.prefix = '/';
        assert.equal(oniRepositoryIdentity(alias), bucketRoot);
      }
    });
    it('stops later mutations after source supersession while retaining confirmed historical OCFL evidence', async () => {
      await ready();
      afterCommit = async () => {
        const record = await mongo.getMeta('record');
        await mongo.updateMeta(brand, 'record', {
          ...record,
          metadata: { ...record.metadata, title: 'new unapproved source' },
        });
      };
      await run();
      assert.equal(commits, 1);
      assert.equal(requests.length, 0);
      assert.equal((await row()).completion, undefined);
      assert.equal((await row()).status, 'revoked');
      await run();
      assert.equal(commits, 1);
    });
    for (const enabled of [true, false])
      for (const credentials of ['userinfo', 'query', 'fragment'] as const)
        it(`rejects ingestion URL ${credentials} credentials before sealing a publication source (enabled ${enabled})`, async () => {
          const ingestion = config.destinations.oni.connection.ingestion;
          assert.ok(isPublicationObject(ingestion));
          ingestion.enabled = enabled;
          ingestion.apiUrl =
            credentials === 'userinfo'
              ? url.replace('http://', 'http://private-user:private-password@')
              : `${url}${credentials === 'query' ? '?' : '#'}token=private-token`;
          await assert.rejects(ready(), /Invalid Oni ingestion endpoint/);
          assert.equal(await runtime.store.collection.countDocuments({}), 0);
          assert.equal(commits, 0);
          assert.equal(requests.length, 0);
        });
    it('rejects a service override placing ingestion credentials in sealed source evidence', async () => {
      const hooks = service.publicationAdapterHooks();
      service.publicationAdapterHooks = () => ({
        ...hooks,
        configuration: (...args) => {
          const value = hooks.configuration(...args);
          value.sites.publication.ingestion.apiUrl = `${url}?token=private-token`;
          return value;
        },
      });
      await assert.rejects(ready(), /Invalid Oni ingestion endpoint/);
      assert.equal(await runtime.store.collection.countDocuments({}), 0);
      assert.equal(commits, 0);
      assert.equal(requests.length, 0);
    });
    it('rejects cross-brand attachment sources during approval without creating work', async () => {
      await mongo.recordCol.updateOne({ redboxOid: 'data' }, { $set: { 'metaMetadata.brandId': 'foreign-brand' } });
      await assert.rejects(ready(), /another brand/);
      assert.equal(await runtime.store.collection.countDocuments({}), 0);
      assert.equal(commits, 0);
    });
    it('rejects a service override redirecting the approved repository during preparation', async () => {
      const hooks = service.publicationAdapterHooks();
      service.publicationAdapterHooks = () => ({
        ...hooks,
        configuration: (...args) => {
          const value = hooks.configuration(...args);
          value.sites.publication.storage.prefix = 'unapproved-repository';
          return value;
        },
      });
      await assert.rejects(ready(), /changed the approved physical repository/);
      assert.equal(await runtime.store.collection.countDocuments({}), 0);
      assert.equal(commits, 0);
    });
    it('rejects changed attachment bytes before sending any repository mutation', async () => {
      await ready();
      payload = Buffer.from('unapproved replacement');
      await run();
      assert.equal((await row()).status, 'superseded');
      assert.equal(commits, 0);
      assert.equal(rootCommits, 0);
    });
    it('commits verified sealed bytes when the live attachment changes after opening, then stops ingestion', async () => {
      const sealed = await ready();
      const open = staging.openAttachment.bind(staging);
      staging.openAttachment = async (...args: Parameters<typeof open>) => {
        const stream = await open(...args);
        payload = Buffer.from('changed after sealed stream opened');
        return stream;
      };
      await run();
      assert.equal(commits, 1);
      assert.equal(requests.length, 0);
      assert.equal((await row()).completion, undefined);
      const observed = await (await repository()).readObject('arcp://name,uts_public_data_repo/record');
      assert.equal(observed.kind, 'present');
      if (observed.kind === 'present')
        assert.equal(
          observed.content.files.find(file => file.logicalPath === sealed.descriptor.attachments[0].logicalPath)
            ?.sha256,
          sealed.descriptor.attachments[0].digest
        );
    });
    it('reloads and retries a projection revision conflict without repeating the deposit or replacing metadata', async () => {
      await ready();
      const project = mongo.setPublicationRecordFields.bind(mongo);
      let attempts = 0;
      mongo.setPublicationRecordFields = async (...args: Parameters<typeof project>) => {
        if (attempts++ === 0)
          await mongo.recordCol.updateOne(
            { redboxOid: 'record' },
            { $inc: { revision: 1 }, $set: { 'metaMetadata.lastSavedBy': 'concurrent-worker' } }
          );
        return project(...args);
      };
      await run();
      assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
      assert.equal(attempts, 2);
      assert.equal(commits, 1);
      const record = await mongo.getMeta('record');
      assert.equal(record.metadata.title, 'Dataset 1');
      assert.equal(Reflect.get(record.metaMetadata, 'lastSavedBy'), 'worker');
    });
    it('rechecks current service edit access before projecting a confirmed deposit', async () => {
      await ready();
      beforeProjection = async () => {
        access = false;
      };
      await run();
      assert.equal((await row()).status, 'revoked');
      assert.equal(commits, 1);
      assert.equal((await mongo.getMeta('record')).metadata.citation_url, undefined);
      assert.equal((await row()).completion, undefined);
    });
    it('stops after a related data-record edit instead of committing a changed dependency', async () => {
      await ready();
      await mongo.recordCol.updateOne({ redboxOid: 'data' }, { $inc: { revision: 1 } });
      await run();
      assert.equal(commits, 0);
      assert.equal((await row()).status, 'superseded');
    });
    it('resumes a different record after reconciling a prior repository writer and preserves both journals', async () => {
      await ready();
      const other = { ...key, oid: 'other' };
      await ready(other);
      afterCommit = crash;
      await run();
      assert.equal(commits, 1);
      await run(other);
      assert.equal((await row(other)).status, 'completed', JSON.stringify(await row(other)));
      await run();
      await run();
      assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
      assert.equal(commits, 2);
      assert.equal((await row()).operations.filter(op => op.kind === 'oni.commit').length, 1);
    });
    it('rejects a second destination managing the same canonical repository/object', async () => {
      await ready();
      await run();
      config.destinations.copy = structuredClone(config.destinations.oni);
      config.destinations.copy.writeBack = {
        citationUrlPath: 'metadata.copy_url',
        citationDoiPath: 'metadata.copy_doi',
        publicationErrorPath: 'metadata.copy_error',
      };
      config.sourcePolicies[0].destinations = ['oni', 'copy'];
      const other = { ...key, destinationId: 'copy' };
      await ready(other);
      const before = await row(other);
      await run(other);
      assert.equal((await row(other)).status, 'repair_required', JSON.stringify(await row(other)));
      assert.equal((await row(other)).waitingReason, 'oni_remote_binding_conflict');
      assert.deepEqual((await row(other)).providerState, before.providerState);
      assert.deepEqual((await row(other)).operations, before.operations);
      assert.equal((await row(other)).binding, undefined);
      assert.equal((await row(other)).completion, undefined);
      assert.equal(commits, 1);
    });
    it('projects two Oni destinations from one approval without cancelling the remaining sibling', async () => {
      config.destinations.second = structuredClone(config.destinations.oni);
      const connection = config.destinations.second.connection;
      assert.ok(isPublicationObject(connection.storage));
      connection.storage.prefix = `${connection.storage.prefix}-second`;
      connection.publicUrl = 'https://second.example.test';
      config.destinations.second.writeBack = {
        citationUrlPath: 'metadata.second_url',
        citationDoiPath: 'metadata.second_doi',
        publicationErrorPath: 'metadata.second_error',
      };
      await ready(key, {}, ['oni', 'second']);
      await run();
      const sibling = { ...key, destinationId: 'second' };
      await run(sibling);
      assert.equal((await row()).status, 'completed');
      assert.equal((await row(sibling)).status, 'completed', JSON.stringify(await row(sibling)));
      assert.equal((await row()).approvalId, (await row(sibling)).approvalId);
      const record = await mongo.getMeta('record');
      assert.equal(record.metadata.citation_url, 'https://data.example.test/record');
      assert.equal(record.metadata.second_url, 'https://second.example.test/record');
      assert.equal(record.publicationSource?.revision, 1);
      assert.equal(commits, 2);
    });
    it('keeps processing disabled by default and distinguishes no-ingestion completion from object visibility', async () => {
      assert.equal(new PublicationPublishing().processing.enabled, false);
      const connection = config.destinations.oni.connection;
      assert.ok(isPublicationObject(connection.ingestion));
      connection.ingestion.enabled = false;
      await ready();
      await run();
      assert.equal((await row()).status, 'completed', JSON.stringify(await row()));
      assert.equal((await row()).completion?.ingestion.state, 'not_required');
      assert.equal((await row()).completion?.visibility, 'unverified');
      assert.equal(requests.length, 0);
    });
  });
}
