import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { MongoClient, type Db } from 'mongodb';
import sinon from 'sinon';
import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import { S3Driver } from 'flydrive/drivers/s3';
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import {
  byteDigest,
  PublicationStaging,
  PublicationService as CorePublication,
  PublicationStagingFence,
  PUBLICATION_COMPLETION_FENCE,
  publicationOriginalReference,
  PublicationSyncStore,
  PublicationResourceStore,
  PublicationProviderRegistry,
  PublicationPublishing,
  cleanupPublicationStaging,
  publicationStagingIsReferenced,
  type PublicationApproval,
  type PublicationSourceReference,
  type PublicationOperation,
} from '@researchdatabox/redbox-core';
import { Services } from '../../src/services/MongoStorageService';
import { createOniPublicationProvider } from '@researchdatabox/redbox-core/dist/services/oni-v2/publication-adapter.js';
import { createFigsharePublicationProvider } from '@researchdatabox/redbox-core/dist/services/figshare-v2/publication-adapter.js';
import {
  emptyFigshareEvidence,
  figshareJson,
} from '@researchdatabox/redbox-core/dist/services/figshare-v2/publication-state.js';
import { storage } from '../../src/config/storage';

if (process.env.CI && !process.env.MONGO_TEST_URL) throw new Error('Staging acceptance requires real Mongo');
if (process.env.ONI_OCFL_REQUIRE_S3 === 'true' && !process.env.ONI_OCFL_TEST_S3_ENDPOINT)
  throw new Error('Staging acceptance requires S3');
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
for (const backend of ['fs', 's3'] as const) {
  const suite =
    process.env.MONGO_TEST_URL && (backend === 'fs' || process.env.ONI_OCFL_TEST_S3_ENDPOINT)
      ? describe
      : describe.skip;
  suite(`Distributed staging reference fence and cleanup (${backend})`, function () {
    this.timeout(30000);
    const database = `publication_staging_${randomUUID().replaceAll('-', '')}`;
    const bucket = `staging-${randomUUID()}`;
    const globals = new Map<string, unknown>();
    let client: MongoClient;
    let second: MongoClient;
    let db: Db;
    let fence: PublicationStagingFence;
    let other: PublicationStagingFence;
    let disk: Disk;
    let staging: PublicationStaging;
    let worker: PublicationStaging;
    let directory: string;
    let s3: S3Client;
    let mongo: Services.MongoStorageService;
    let savedStorage: unknown;
    const key = { brandId: 'brand', oid: 'record', destinationId: 'main' };
    const resource = { providerId: 'oni', namespace: 'repository', resourceKey: 'ingest' };
    const brand = { id: 'brand', name: 'default', css: '', roles: [] };
    const makeApproval = (source: PublicationSourceReference): PublicationApproval => ({
      id: randomUUID(),
      epoch: 1,
      sourceRevision: 1,
      policy: {
        id: 'approve',
        version: 1,
        mode: 'approval',
        recordType: 'dataPublication',
        event: 'onTransition',
        destinations: ['main'],
      },
      destinationIds: ['main'],
      targetFingerprints: { main: 'target' },
      configurationDigests: { main: 'c'.repeat(64) },
      source,
      requester: { username: 'requester', userType: 'local' },
      approver: { username: 'approver', userType: 'local' },
      grantedAt: new Date().toISOString(),
    });
    const nativeRecord = () => ({
      redboxOid: 'native-record',
      metaMetadata: { brandId: 'brand', type: 'dataPublication' },
      metadata: { title: 'title' },
    });
    async function waitForRelease(reference: PublicationSourceReference) {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (!(await fence.collection.findOne({ 'reference.key': reference.key }))?.admissions) return;
        await new Promise<void>(resolve => setTimeout(resolve, 10));
      }
      assert.fail('The closed reader did not release its staging pin');
    }

    const config = () => {
      const result = new PublicationPublishing();
      result.processing.enabled = true;
      result.processing.stagingDisk = 'durable';
      return result;
    };
    const put = async (text = 'sealed input') => (await staging.put('brand', Readable.from([text]))).reference;
    const manifest = (reference: PublicationSourceReference) =>
      staging.putJson('brand', JSON.stringify({ attachments: [{ staged: reference }] }));
    const request = (source: PublicationSourceReference, generation = 1) => ({
      sourceGeneration: generation,
      sourceRevision: generation,
      approvalId: `approval-${generation}`,
      approvalEpoch: 1,
      sourceDigest: 'digest',
      configurationDigest: 'config',
      source,
    });
    const operation = (reference: PublicationSourceReference): PublicationOperation => ({
      id: randomUUID(),
      kind: 'deposit',
      approvalId: 'approval-1',
      approvalEpoch: 1,
      sourceGeneration: 1,
      intendedDigest: reference.digest,
      submittedAt: new Date().toISOString(),
      outcome: 'submitted',
      evidence: { stagedInput: { ...reference } },
    });
    async function clean(enabled = true, age = 7200000) {
      const reports: string[] = [];
      const configuration = config();
      configuration.processing.enabled = enabled;
      await cleanupPublicationStaging({
        db,
        brands: async () => ['brand'],
        configuration: async () => configuration,
        staging: () => worker,
        now: () => Date.now() + age,
        report: category => {
          reports.push(category);
        },
      });
      return reports;
    }
    async function remove(reference: PublicationSourceReference) {
      return other.deleteIfUnreferenced(
        reference,
        () => publicationStagingIsReferenced(db, reference),
        () => disk.delete(reference.key)
      );
    }
    before(async () => {
      client = await MongoClient.connect(process.env.MONGO_TEST_URL!);
      second = await MongoClient.connect(process.env.MONGO_TEST_URL!);
      db = client.db(database);
      await db.createCollection('record');
      directory = await mkdtemp(join(tmpdir(), 'publication-staging-fence-'));
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
      savedStorage = sails.config.storage;
      sails.config.storage = storage;
      mongo = new Services.MongoStorageService();
      await mongo.init();
      if (backend === 's3') {
        s3 = new S3Client({
          endpoint: process.env.ONI_OCFL_TEST_S3_ENDPOINT,
          region: 'us-east-1',
          forcePathStyle: true,
          requestChecksumCalculation: 'WHEN_REQUIRED',
          credentials: { accessKeyId: 'staging-test', secretAccessKey: 'staging-local' },
          maxAttempts: 1,
        });
        await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      }
    });
    beforeEach(async () => {
      for (const name of [
        'record',
        'deletedrecord',
        'tenantrecords',
        'tenantdeletedrecords',
        'recordidentity',
        'publicationsync',
        'publicationdestination',
        'publicationresourcelease',
        'publicationcorrection',
        'publicationhistory',
        'publicationstagingreference',
      ])
        await db.collection(name).deleteMany({});
      fence = new PublicationStagingFence(db);
      other = new PublicationStagingFence(second.db(database));
      const makeDisk = () =>
        new Disk(
          backend === 'fs'
            ? new FSDriver({ location: directory, visibility: 'private' })
            : new S3Driver({ client: s3, bucket, visibility: 'private', supportsACL: false })
        );
      disk = makeDisk();
      staging = new PublicationStaging('durable', disk, fence);
      worker = new PublicationStaging('durable', makeDisk(), other);
    });
    afterEach(async () => {
      await rm(directory, { recursive: true, force: true });
      if (backend === 's3') {
        const listing = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
        if (listing.Contents?.length)
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: { Objects: listing.Contents.map(({ Key }) => ({ Key })) },
            })
          );
      }
    });
    after(async () => {
      for (const [name, value] of globals) {
        if (value === undefined) Reflect.deleteProperty(globalThis, name);
        else Reflect.set(globalThis, name, value);
      }
      Reflect.get(globalThis, 'sails').config.storage = savedStorage;
      await rm(directory, { recursive: true, force: true });
      if (s3) {
        await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
        s3.destroy();
      }
      await db.dropDatabase();
      await second.close();
      await client.close();
    });
    it('uses the staging identity index for original admission on ordinary saves', async () => {
      const release = await fence.pinOriginal('brand', { oid: 'record', fileId: 'file', digest: 'a'.repeat(64) });
      await release();
      const commands: Record<string, unknown>[] = [];
      const monitored = new MongoClient(process.env.MONGO_TEST_URL!, { monitorCommands: true });
      monitored.on('commandStarted', event => {
        if (event.commandName === 'find' && event.command.find === 'publicationstagingreference')
          commands.push(event.command.filter);
      });
      await monitored.connect();
      try {
        await new PublicationStagingFence(monitored.db(database)).admitRecord(
          {
            redboxOid: 'record',
            metaMetadata: { brandId: 'brand' },
            metadata: { files: [{ type: 'attachment', fileId: 'file' }] },
          },
          async () => true
        );
        assert.ok(commands.length);
        assert.ok(
          commands.every(filter => typeof filter._id === 'string'),
          'save admission must use the identity index'
        );
        const plan = await db.collection('publicationstagingreference').find(commands[0]).explain('executionStats');
        assert.equal(plan.executionStats.totalDocsExamined, 1);
      } finally {
        await monitored.close();
      }
    });
    it('reclaims abandoned managed preparation through the enabled scheduled runner', async () => {
      const reference = await put();
      assert.deepEqual(await clean(), []);
      assert.equal(await disk.exists(reference.key), false);
      await assert.rejects(
        fence.admit(reference, async () => {}),
        /fenced for deletion/
      );
    });
    it('does no cleanup while processing is disabled', async () => {
      const reference = await put();
      assert.deepEqual(await clean(false), []);
      assert.equal(await disk.exists(reference.key), true);
    });
    it('scans the actual source-model collection names before reclaiming inputs', async () => {
      const child = await put();
      const root = await manifest(child);
      const abandoned = await put('abandoned');
      await fence.admit(root, () =>
        db.collection('tenantrecords').insertOne({
          publicationSource: { schemaVersion: 1, revision: 1, source: root },
        })
      );
      await cleanupPublicationStaging({
        db,
        sourceCollections: { active: 'tenantrecords', deleted: 'tenantdeletedrecords' },
        brands: async () => ['brand'],
        configuration: async () => config(),
        staging: () => worker,
        now: () => Date.now() + 7200000,
        report: () => assert.fail('Unexpected cleanup error'),
      });
      assert.equal(await disk.exists(child.key), true);
      assert.equal(await disk.exists(root.key), true);
      assert.equal(await disk.exists(abandoned.key), false);
    });
    it('refuses scheduled reclamation when source writers use a different fence datastore', async () => {
      const reference = await put();
      const saved = new Map(['PublicationSync', 'RecordsService'].map(name => [name, Reflect.get(globalThis, name)]));
      try {
        Reflect.set(globalThis, 'PublicationSync', {
          getDatastore: () => ({ manager: second.db(`${database}_other`) }),
        });
        Reflect.set(globalThis, 'RecordsService', { getPublicationStorage: () => mongo });
        const service = new CorePublication.Services.Publication();
        await assert.rejects(service.cleanupStaging(), /must share a datastore/);
        assert.equal(await disk.exists(reference.key), true);
      } finally {
        for (const [name, value] of saved) {
          if (value === undefined) Reflect.deleteProperty(globalThis, name);
          else Reflect.set(globalThis, name, value);
        }
      }
    });
    it('retains young preparation and all unregistered pre-fence objects', async () => {
      const reference = await put();
      const legacy = await new PublicationStaging('durable', disk).putJson('brand', '{}');
      assert.deepEqual(await clean(true, 0), []);
      assert.equal(await disk.exists(reference.key), true);
      assert.deepEqual(await clean(), []);
      assert.equal(await disk.exists(legacy.key), true);
    });
    it('retains managed children when an older referenced manifest has no registered graph', async () => {
      const child = await put();
      const root = await new PublicationStaging('durable', disk).putJson(
        'brand',
        JSON.stringify({ attachments: [{ staged: child }] })
      );
      await fence.admit(root, () =>
        db.collection('record').insertOne({ publicationSource: { schemaVersion: 1, revision: 1, source: root } })
      );
      assert.deepEqual(await clean(), ['staging_cleanup_retained']);
      assert.equal(await disk.exists(child.key), true);
      assert.equal(await disk.exists(root.key), true);
    });
    for (const method of ['verify', 'open', 'readJson'] as const) {
      for (const damage of ['missing', 'corrupt'] as const) {
        it(`releases a finished ${method} reader after ${damage} input fails verification`, async () => {
          const reference = await put('{"safe":true}');
          if (damage === 'missing') await disk.delete(reference.key);
          else await disk.put(reference.key, 'damaged bytes');
          await assert.rejects(worker[method]('brand', reference));
          const row = await fence.collection.findOne({ 'reference.key': reference.key });
          assert.ok(row);
          assert.equal(row.admissions, 0, 'a rejected read has no pending reference write or live stream');
          await disk.put(reference.key, '{"safe":true}');
          assert.equal(await remove(reference), true, 'unreferenced repaired inputs remain reclaimable');
        });
      }
    }
    for (const failure of ['opening', 'reinspection', 'changed bytes'] as const)
      it(`releases the original-byte read pin after attachment preparation fails during ${failure}`, async () => {
        const bytes = Buffer.from('original bytes');
        const original = { oid: 'data', fileId: 'file' };
        let inspections = 0;
        await assert.rejects(
          staging.prepareAttachment('brand', {
            id: 'file',
            logicalPath: 'files/data.bin',
            original,
            inspect: async () => {
              if (++inspections > 1 && failure === 'reinspection') throw new Error('reinspection failed');
              return { size: bytes.length, digest: byteDigest(bytes) };
            },
            open: async () => {
              if (failure === 'opening') throw new Error('opening failed');
              return Readable.from([failure === 'changed bytes' ? Buffer.from('changed bytes!') : bytes]);
            },
          })
        );
        const row = await fence.collection.findOne({ 'reference.disk': 'publication-original-attachments' });
        assert.ok(row);
        assert.equal(row.admissions, 0, 'failed preparation no longer reads the original or admits a source');
        assert.equal(
          await fence.deleteIfUnreferenced(
            row.reference,
            async () => false,
            async () => {}
          ),
          true
        );
      });
    for (const failure of ['original registration', 'completion lookup', 'completion registration'] as const)
      it(`releases a known pin after ${failure} preflight fails`, async () => {
        const original = { oid: 'record', fileId: 'file', digest: byteDigest(Buffer.from('original bytes')) };
        const reference: PublicationSourceReference =
          failure === 'original registration'
            ? publicationOriginalReference('brand', original)
            : {
                encodingVersion: 1,
                disk: 'publication-completion-admission',
                key: byteDigest(Buffer.from(randomUUID())),
                digest: byteDigest(Buffer.from('completion')),
              };
        const collection = failure === 'original registration' ? undefined : PUBLICATION_COMPLETION_FENCE;
        const preflight = new PublicationStagingFence(db, collection);
        if (failure === 'completion lookup') await preflight.registerDecision(reference);
        const updateOne = preflight.collection.updateOne.bind(preflight.collection);
        const failureStub =
          failure === 'completion lookup'
            ? sinon.stub(preflight.collection, 'findOne').rejects(new Error('preflight read failed'))
            : sinon.stub(preflight.collection, 'updateOne').callsFake(async (filter, update, options) => {
                const result = await updateOne(filter, update, options);
                if (!Array.isArray(update) && update.$set?.managed === true)
                  throw new Error('preflight registration acknowledgement lost');
                return result;
              });
        try {
          await assert.rejects(
            failure === 'original registration'
              ? preflight.pinOriginal('brand', original)
              : preflight.pinRegistered(reference),
            /preflight/
          );
        } finally {
          failureStub.restore();
        }
        const row = await preflight.collection.findOne({ 'reference.key': reference.key });
        assert.ok(row);
        assert.equal(row.admissions, 0, 'no reader or containing write started after the failed preflight');
        if (failure !== 'completion lookup') assert.equal(row.managed, true, 'registration was actually applied');
        let decisions = 0;
        assert.equal(
          await new PublicationStagingFence(second.db(database), collection).deleteIfUnreferenced(
            reference,
            async () => false,
            async () => {
              decisions++;
            }
          ),
          true,
          'the failed preflight must not permanently block reclamation or content replacement'
        );
        assert.equal(decisions, 1);
      });
    it('pins the original throughout attachment preparation and releases it after a verified recovery copy', async () => {
      const bytes = Buffer.from('original bytes');
      let inspections = 0;
      const assertPinned = async () => {
        const row = await fence.collection.findOne({ 'reference.disk': 'publication-original-attachments' });
        assert.equal(row?.admissions, 1);
      };
      const attachment = await staging.prepareAttachment('brand', {
        id: 'file',
        logicalPath: 'files/data.bin',
        original: { oid: 'data', fileId: 'file' },
        inspect: async () => {
          if (++inspections > 1) await assertPinned();
          return { size: bytes.length, digest: byteDigest(bytes) };
        },
        open: async () => {
          await assertPinned();
          return Readable.from([bytes]);
        },
      });
      assert.ok(attachment.staged);
      await worker.verify('brand', attachment.staged, bytes.length);
      assert.equal(
        (await fence.collection.findOne({ 'reference.disk': 'publication-original-attachments' }))?.admissions,
        0
      );
    });
    it('pins independent readers until their returned streams close', async () => {
      const reference = await put();
      const stream = await worker.open('brand', reference);
      assert.equal(await remove(reference), false);
      stream.destroy();
      await waitForRelease(reference);
      assert.equal(await remove(reference), true);
    });
    it('fences opaque pre-fence manifests against concurrent child deletion and rejects unknown deleted children', async () => {
      const child = await put();
      const root = await new PublicationStaging('durable', disk).putJson('brand', JSON.stringify({ child }));
      const entered = deferred();
      const resume = deferred();
      const deleting = other.deleteIfUnreferenced(
        child,
        async () => {
          entered.resolve();
          await resume.promise;
          return false;
        },
        () => disk.delete(child.key)
      );
      await entered.promise;
      await fence.admit(root, () =>
        db.collection('record').insertOne({ publicationSource: { schemaVersion: 1, revision: 1, source: root } })
      );
      resume.resolve();
      assert.equal(await deleting, false);
      assert.equal(await disk.exists(child.key), true);
      await db.collection('record').deleteMany({});
      assert.equal(await remove(child), true);
      await assert.rejects(
        fence.admit(root, async () => assert.fail('Opaque graph must be verified')),
        /fenced for deletion/
      );
      // New registered preparations do not inherit an opaque legacy graph.
      const next = await put('new preparation after reclamation');
      assert.equal((await worker.readJson('brand', await manifest(next))) instanceof Object, true);
    });
    it('rejects a descriptor that attempts to admit an already tombstoned attachment', async () => {
      const reference = await put();
      assert.equal(await remove(reference), true);
      await assert.rejects(manifest(reference), /fenced for deletion/);
    });
    it('retains a transitive prepared-source and attachment graph rooted in protected source state', async () => {
      const bytes = await put();
      const child = await manifest(bytes);
      const root = await manifest(child);
      await fence.admit(root, () =>
        db
          .collection('record')
          .insertOne({ publicationSource: { schemaVersion: 1, revision: 1, approvals: [{ source: root }] } })
      );
      assert.deepEqual(await clean(), []);
      for (const reference of [root, child, bytes]) assert.equal(await disk.exists(reference.key), true);
    });
    it('matches reference disk/key regardless of a stale or different digest', async () => {
      const reference = await put();
      await db.collection('record').insertOne({
        publicationSource: { schemaVersion: 1, revision: 1, source: { ...reference, digest: 'b'.repeat(64) } },
      });
      assert.equal(await remove(reference), false);
    });
    it('retains quarantined source saves and deleted-record recovery inputs', async () => {
      const reference = await put();
      const root = await manifest(reference);
      await db.collection('deletedrecord').insertOne({
        deletedRecordMetadata: {
          publicationSource: { schemaVersion: 1, revision: 1, saves: [{ outcome: 'quarantined', source: root }] },
        },
      });
      assert.equal(await remove(reference), false);
    });
    it('retains current and superseded worker recovery descriptors', async () => {
      const old = await manifest(await put('old bytes'));
      const current = await manifest(await put('new bytes'));
      const store = new PublicationSyncStore(db);
      await store.ensureIndexes();
      await store.initialise(key, 'oni', 'target');
      await store.importRequest(key, request(old));
      await store.importRequest(key, request(current, 2));
      assert.deepEqual(await clean(), []);
      assert.equal(await disk.exists(old.key), true);
      assert.equal(await disk.exists(current.key), true);
    });
    it('retains submitted and uncertain resource-operation checkpoint inputs', async () => {
      const reference = await put();
      const resources = new PublicationResourceStore(db);
      await resources.ensureIndexes();
      const claimed = await resources.claim(resource, 'brand', 'worker', 100000);
      assert.ok(claimed?.lease);
      const submitted = operation(reference);
      const saved = await resources.journal(resource, 'brand', claimed.lease, claimed.revision, key, submitted);
      await resources.journal(resource, 'brand', claimed.lease, saved.revision, key, {
        ...submitted,
        outcome: 'uncertain',
      });
      assert.equal(await remove(reference), false);
    });
    it('retains embedded adapter prepared inputs and correction evidence', async () => {
      const first = await put('Figshare input');
      const secondInput = await put('Oni input');
      await db.collection('publicationsync').insertOne({ schemaVersion: 1, providerState: { prepared: first } });
      await db.collection('publicationcorrection').insertOne({ evidence: { input: secondInput } });
      assert.deepEqual(await clean(), []);
      assert.equal(await disk.exists(first.key), true);
      assert.equal(await disk.exists(secondInput.key), true);
    });
    it('loses a deletion decision when an independent admission completes during its reference scan', async () => {
      const reference = await put();
      const entered = deferred();
      const resume = deferred();
      const deleting = other.deleteIfUnreferenced(
        reference,
        async () => {
          entered.resolve();
          await resume.promise;
          return false;
        },
        () => disk.delete(reference.key)
      );
      await entered.promise;
      await fence.admit(reference, () =>
        db.collection('record').insertOne({ publicationSource: { schemaVersion: 1, revision: 1, source: reference } })
      );
      resume.resolve();
      assert.equal(await deleting, false);
      assert.equal(await disk.exists(reference.key), true);
    });
    it('cannot decide deletion while another process admission is in flight', async () => {
      const reference = await put();
      const entered = deferred();
      const resume = deferred();
      const writing = fence.admit(reference, async () => {
        entered.resolve();
        await resume.promise;
      });
      await entered.promise;
      assert.equal(await remove(reference), false);
      resume.resolve();
      await writing;
      assert.equal(await remove(reference), true);
    });
    it('rejects all new admissions after a decision even before object deletion starts', async () => {
      const reference = await put();
      const entered = deferred();
      const resume = deferred();
      const deleting = other.deleteIfUnreferenced(
        reference,
        async () => false,
        async () => {
          entered.resolve();
          await resume.promise;
          await disk.delete(reference.key);
        }
      );
      await entered.promise;
      await assert.rejects(
        fence.admit(reference, () => db.collection('record').insertOne({ source: reference })),
        /fenced for deletion/
      );
      resume.resolve();
      assert.equal(await deleting, true);
      assert.equal(await db.collection('record').countDocuments(), 0);
    });
    it('retains inputs after an interrupted or ambiguous reference write without expiring its pin', async () => {
      const reference = await put();
      await assert.rejects(
        fence.admit(reference, async () => {
          throw new Error('unknown write result');
        }),
        /unknown write/
      );
      assert.deepEqual(await clean(true, 365 * 86400000), []);
      assert.equal(await disk.exists(reference.key), true);
    });
    it('recovers a real process crash between the Mongo deletion decision and the FS/S3 delete', async () => {
      const reference = await put();
      const child = spawnSync(
        process.execPath,
        [
          join(__dirname, '../fixtures/publication-staging-crash.cjs'),
          process.env.MONGO_TEST_URL!,
          database,
          JSON.stringify(reference),
        ],
        { encoding: 'utf8', timeout: 15000 }
      );
      assert.equal(child.status, 23, child.stderr);
      assert.equal(await disk.exists(reference.key), true);
      await assert.rejects(fence.acquire(reference), /fenced for deletion/);
      assert.deepEqual(await clean(), []);
      assert.equal(await disk.exists(reference.key), false);
    });
    it('keeps the tombstone after a failed object-store delete and retries without reopening admission', async () => {
      const reference = await put();
      await assert.rejects(
        fence.deleteIfUnreferenced(
          reference,
          async () => false,
          async () => {
            throw new Error('object store unavailable');
          }
        ),
        /unavailable/
      );
      await assert.rejects(other.acquire(reference), /fenced for deletion/);
      assert.equal(await remove(reference), true);
    });
    it('never deletes if a required reference lookup fails', async () => {
      const reference = await put();
      await assert.rejects(
        fence.deleteIfUnreferenced(
          reference,
          async () => {
            throw new Error('Mongo read unavailable');
          },
          () => disk.delete(reference.key)
        ),
        /unavailable/
      );
      assert.equal(await disk.exists(reference.key), true);
      const release = await other.acquire(reference);
      await release();
    });
    it('fences native source saves against an already decided deletion', async () => {
      const reference = await manifest(await put());
      await remove(reference);
      const approval = makeApproval(reference);
      const result = await mongo.create(
        brand,
        {
          redboxOid: 'native-record',
          metaMetadata: { brandId: 'brand', type: 'dataPublication' },
          metadata: { title: 'title' },
        },
        undefined,
        undefined,
        {
          publicationIntent: {
            kind: 'content',
            expectedSourceRevision: 0,
            saveToken: randomUUID(),
            approvals: [approval],
          },
        }
      );
      assert.equal(result.applicationState, 'not-applied');
      assert.equal(await db.collection('record').countDocuments({ redboxOid: 'native-record' }), 0);
      assert.equal(await db.collection('recordidentity').countDocuments({ redboxOid: 'native-record' }), 0);
    });
    it('retains digest-only attachment staging for the full provider-reader lifetime', async () => {
      const bytes = Buffer.from('approved live attachment');
      const attachment = {
        id: 'attachment',
        logicalPath: 'data/file.txt',
        size: bytes.length,
        digest: byteDigest(bytes),
      };
      const stream = await worker.openAttachment('brand', attachment, {
        ...attachment,
        inspect: async () => ({ size: bytes.length, digest: attachment.digest }),
        open: async () => Readable.from([bytes]),
      });
      const row = await fence.collection.findOne({ managed: true });
      assert.ok(row);
      assert.equal(await remove(row.reference), false);
      stream.destroy();
      await waitForRelease(row.reference);
      assert.equal(await remove(row.reference), true);
    });
    it('fences an actual native source update and all attachment children during a deletion scan', async () => {
      assert.equal((await mongo.create(brand, nativeRecord(), undefined)).applicationState, 'applied');
      const child = await put();
      const root = await manifest(child);
      const entered = deferred();
      const resume = deferred();
      const deleting = other.deleteIfUnreferenced(
        child,
        async () => {
          entered.resolve();
          await resume.promise;
          return false;
        },
        () => disk.delete(child.key)
      );
      await entered.promise;
      const result = await mongo.updateMeta(
        brand,
        'native-record',
        { metadata: { title: 'approved title' } },
        undefined,
        {
          publicationIntent: {
            kind: 'content',
            expectedSourceRevision: 0,
            saveToken: randomUUID(),
            approvals: [makeApproval(root)],
          },
        }
      );
      resume.resolve();
      assert.equal(result.applicationState, 'applied');
      assert.equal(await deleting, false);
      assert.deepEqual(await clean(), []);
      assert.equal(await disk.exists(child.key), true);
    });
    it('refuses a native source update that tries to revive a deleted manifest', async () => {
      assert.equal((await mongo.create(brand, nativeRecord(), undefined)).applicationState, 'applied');
      const root = await manifest(await put());
      assert.equal(await remove(root), true);
      const result = await mongo.updateMeta(
        brand,
        'native-record',
        { metadata: { title: 'unavailable input' } },
        undefined,
        {
          publicationIntent: {
            kind: 'content',
            expectedSourceRevision: 0,
            saveToken: randomUUID(),
            approvals: [makeApproval(root)],
          },
        }
      );
      assert.equal(result.applicationState, 'not-applied');
      assert.equal(
        (await db.collection('record').findOne({ redboxOid: 'native-record' }))?.publicationSource,
        undefined
      );
    });
    it('fences lifecycle snapshot creation and rejects a replacement containing deleted inputs', async () => {
      const child = await put();
      const root = await manifest(child);
      const created = await mongo.create(brand, nativeRecord(), undefined, undefined, {
        publicationIntent: {
          kind: 'content',
          expectedSourceRevision: 0,
          saveToken: randomUUID(),
          approvals: [makeApproval(root)],
        },
      });
      assert.equal(created.applicationState, 'applied');
      const record = await db.collection('record').findOne({ redboxOid: 'native-record' });
      assert.ok(record);
      const operationId = randomUUID();
      const now = new Date().toISOString();
      const snapshot = {
        redboxOid: 'native-record',
        revision: 1,
        brandId: 'brand',
        lifecycleState: 'delete-pending',
        deletedRecordMetadata: record,
        lifecycleOperation: {
          operationId,
          kind: 'delete',
          requestId: randomUUID(),
          sourceRevision: 0,
          targetRevision: 1,
          startedAt: now,
          updatedAt: now,
          attempts: 1,
        },
      };
      const entered = deferred();
      const resume = deferred();
      const deleting = other.deleteIfUnreferenced(
        child,
        async () => {
          entered.resolve();
          await resume.promise;
          return false;
        },
        () => disk.delete(child.key)
      );
      await entered.promise;
      const result = await mongo.createTombstone(brand, 'native-record', snapshot, {
        precondition: { expectedRevision: 0, requireRevision: true },
        lifecycle: { operationId, expectedState: 'delete-pending' },
      });
      resume.resolve();
      assert.equal(result.applicationState, 'applied');
      assert.equal(await deleting, false);
      await db.collection('record').deleteMany({});
      assert.deepEqual(await clean(), []);
      assert.equal(await disk.exists(child.key), true);

      const removed = await put('already deleted');
      assert.equal(await remove(removed), true);
      const rejected = await mongo.updateTombstone(
        brand,
        'native-record',
        {
          ...snapshot,
          deletedRecordMetadata: {
            ...record,
            publicationSource: { ...record.publicationSource, source: removed },
          },
          lifecycleOperation: { ...snapshot.lifecycleOperation, targetRevision: 2 },
        },
        {
          precondition: { expectedRevision: 1, requireRevision: true },
          lifecycle: { operationId, expectedState: 'delete-pending' },
        }
      );
      assert.equal(rejected.applicationState, 'not-applied');
    });
    it('fences restored source evidence while a cleaner scans the old collections', async () => {
      const child = await put();
      const root = await manifest(child);
      assert.equal(
        (
          await mongo.create(brand, nativeRecord(), undefined, undefined, {
            publicationIntent: {
              kind: 'content',
              expectedSourceRevision: 0,
              saveToken: randomUUID(),
              approvals: [makeApproval(root)],
            },
          })
        ).applicationState,
        'applied'
      );
      const record = await db.collection('record').findOne({ redboxOid: 'native-record' });
      assert.ok(record);
      const operationId = randomUUID();
      const now = new Date().toISOString();
      await db.collection('deletedrecord').insertOne({
        redboxOid: 'native-record',
        revision: 3,
        brandId: 'brand',
        incarnationId: record.incarnationId,
        lifecycleState: 'restore-pending',
        deletedRecordMetadata: record,
        lifecycleOperation: {
          operationId,
          kind: 'restore',
          requestId: randomUUID(),
          sourceRevision: 2,
          targetRevision: 3,
          startedAt: now,
          updatedAt: now,
          attempts: 1,
        },
      });
      await db.collection('record').deleteMany({});
      const entered = deferred();
      const resume = deferred();
      const deleting = other.deleteIfUnreferenced(
        child,
        async () => {
          entered.resolve();
          await resume.promise;
          return false;
        },
        () => disk.delete(child.key)
      );
      await entered.promise;
      const restored = await mongo.createActiveRecordFromTombstone(brand, 'native-record', record, {
        precondition: { expectedRevision: 3, requireRevision: true },
        lifecycle: { operationId, expectedState: 'restore-pending' },
      });
      await db.collection('deletedrecord').deleteMany({});
      resume.resolve();
      assert.equal(restored.applicationState, 'applied');
      assert.equal(await deleting, false);
      assert.deepEqual(await clean(), []);
      assert.equal(await disk.exists(child.key), true);
    });
    it('retains a durable admission after its owning process crashes', async () => {
      const reference = await put();
      const child = spawnSync(
        process.execPath,
        [
          join(__dirname, '../fixtures/publication-staging-crash.cjs'),
          process.env.MONGO_TEST_URL!,
          database,
          JSON.stringify(reference),
          'admission',
        ],
        { encoding: 'utf8', timeout: 20000 }
      );
      assert.equal(child.status, 23, child.stderr);
      assert.deepEqual(await clean(true, 365 * 86400000), []);
      assert.equal(await disk.exists(reference.key), true);
    });
    it('retains malformed or future-version fences and changed object bytes', async () => {
      const reference = await put();
      await db
        .collection('publicationstagingreference')
        .updateOne({ 'reference.key': reference.key }, { $set: { schemaVersion: 900 } });
      assert.deepEqual(await clean(), ['staging_cleanup_retained']);
      assert.equal(await disk.exists(reference.key), true);
      await db
        .collection('publicationstagingreference')
        .updateOne({ 'reference.key': reference.key }, { $set: { schemaVersion: 1 } });
      await disk.put(reference.key, 'corrupted staged object');
      assert.deepEqual(await clean(), ['staging_cleanup_retained']);
      assert.equal(await disk.exists(reference.key), true);
    });
    it('retains malformed or future-version reference evidence', async () => {
      const reference = await put();
      await db.collection('publicationsync').insertOne({
        schemaVersion: 1,
        operations: [{ outcome: 'uncertain', source: { ...reference, encodingVersion: 900 } }],
      });
      assert.deepEqual(await clean(), ['staging_cleanup_retained']);
      assert.equal(await disk.exists(reference.key), true);
      await db
        .collection('publicationsync')
        .updateOne({}, { $set: { 'operations.0.source': { ...reference, digest: '' } } });
      assert.deepEqual(await clean(), ['staging_cleanup_retained']);
      assert.equal(await disk.exists(reference.key), true);
    });
    it('retains staged bytes when archived journal evidence has an unsupported encoding', async () => {
      const reference = await put();
      for (const evidence of [
        { schemaVersion: 900, snapshot: { opaque: reference.key } },
        { schemaVersion: 1, snapshot: { schemaVersion: 900, opaque: reference.key } },
        { schemaVersion: 1, snapshot: {} },
      ]) {
        await db.collection('publicationhistory').deleteMany({});
        await db.collection('publicationhistory').insertOne(evidence);
        assert.deepEqual(await clean(), ['staging_cleanup_retained']);
        assert.equal(await disk.exists(reference.key), true);
      }
    });
    it('rechecks processing enablement before each deletion decision', async () => {
      const reference = await put();
      let calls = 0;
      await cleanupPublicationStaging({
        db,
        brands: async () => ['brand'],
        configuration: async () => {
          const result = config();
          result.processing.enabled = ++calls === 1;
          return result;
        },
        staging: () => worker,
        now: () => Date.now() + 7200000,
        report: () => assert.fail('Unexpected cleanup error'),
      });
      assert.equal(await disk.exists(reference.key), true);
    });
    it('fences worker source/recovery imports and provider checkpoints against deletion', async () => {
      const reference = await put();
      const store = new PublicationSyncStore(db);
      await store.ensureIndexes();
      await store.initialise(key, 'oni', 'target');
      await remove(reference);
      await assert.rejects(store.importRequest(key, request(reference)), /fenced for deletion/);
      const source = await put('source');
      await store.importRequest(key, request(source));
      const claimed = await store.claim(key, 'worker', 100000);
      assert.ok(claimed?.lease);
      await assert.rejects(
        store.journal(key, claimed.lease, claimed.revision, operation(reference)),
        /fenced for deletion/
      );
      const registry = new PublicationProviderRegistry();
      registry.register(
        createOniPublicationProvider(() => {
          throw new Error('No provider I/O expected');
        })
      );
      await assert.rejects(
        store.checkpointProviderState(
          key,
          claimed.lease,
          claimed.revision,
          { request: 'approved', staged: { ...reference } },
          registry
        ),
        /fenced for deletion/
      );
      const live = await put('adapter input');
      await store.checkpointProviderState(
        key,
        claimed.lease,
        claimed.revision,
        { request: 'approved', staged: { ...live } },
        registry
      );
      assert.equal(await remove(live), false);
    });
    it('fences decoded Figshare checkpoints containing staged adapter inputs', async () => {
      const store = new PublicationSyncStore(db);
      await store.ensureIndexes();
      await store.initialise(key, 'figshare', 'target', 2);
      await store.importRequest(key, request(await put('approved source')));
      const claimed = await store.claim(key, 'figshare-worker', 100000);
      assert.ok(claimed?.lease);
      const registry = new PublicationProviderRegistry();
      registry.register(
        createFigsharePublicationProvider(() => {
          throw new Error('No provider I/O expected');
        })
      );
      const reference = await put('Figshare adapter input');
      await remove(reference);
      const state = {
        legacy: figshareJson(emptyFigshareEvidence(key.oid, key.brandId)),
        preparedInput: { ...reference },
      };
      await assert.rejects(
        store.checkpointProviderState(key, claimed.lease, claimed.revision, state, registry),
        /fenced for deletion/
      );
      const live = await put('retained Figshare adapter input');
      await store.checkpointProviderState(
        key,
        claimed.lease,
        claimed.revision,
        { ...state, preparedInput: { ...live } },
        registry
      );
      assert.equal(await remove(live), false);
    });
  });
}
