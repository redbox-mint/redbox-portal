import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, readFile, cp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { MongoClient, type Db } from 'mongodb';
import {
  S3Client,
  CreateBucketCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteBucketCommand,
} from '@aws-sdk/client-s3';
import { FigsharePublishing } from '@researchdatabox/redbox-core/dist/configmodels/FigsharePublishing';
import { OniPublishing } from '@researchdatabox/redbox-core/dist/configmodels/OniPublishing';
import { emptyFigshareEvidence } from '@researchdatabox/redbox-core/dist/services/figshare-v2/publication-state';
import { createServer } from 'node:http';
import { PublicationStagingFence } from '@researchdatabox/redbox-core';

if (process.env.CI && !process.env.MONGO_TEST_URL) throw new Error('PUB-20/25 requires MONGO_TEST_URL');
if (process.env.ONI_OCFL_REQUIRE_S3 === 'true' && !process.env.ONI_OCFL_TEST_S3_ENDPOINT)
  throw new Error('PUB-20 requires an S3 endpoint');
const describeMongo = process.env.MONGO_TEST_URL ? describe : describe.skip;
const execute = promisify(execFile);
const root = resolve(__dirname, '../../../..');
const preload = resolve(__dirname, '../fixtures/publication-migration-cli.cjs');
const rehearsal = resolve(root, 'support/publication/rehearse.js');
const admin = resolve(root, 'support/publication/admin.js');

describeMongo('Publication release rehearsals (PUB-20/21/25, real Mongo + CLI)', function () {
  this.timeout(120000);
  let client: MongoClient;
  let db: Db;
  let directory: string;
  let baseUrl: string;
  const server = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ id: 12 }));
  });
  before(async () => {
    client = await new MongoClient(process.env.MONGO_TEST_URL!).connect();
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    baseUrl = `http://127.0.0.1:${address.port}/v2`;
  });
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'publication-release-'));
    db = client.db(`publication_release_${randomUUID().replaceAll('-', '')}`);
  });
  afterEach(async () => {
    await db.dropDatabase();
    await rm(directory, { recursive: true, force: true });
  });
  after(async () => {
    await client?.close();
    await new Promise<void>((done, reject) => server.close(error => (error ? reject(error) : done())));
  });
  function environment(configuration: object, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return {
      ...process.env,
      PUB16_CLI_DATABASE: db.databaseName,
      PUB16_CLI_CLOSED: join(directory, 'closed'),
      PUB16_CLI_DIRECTORY: directory,
      PUB16_CLI_CONFIGURATION: JSON.stringify(configuration),
      ...extra,
    };
  }
  const cli = (entry: string, args: string[], env: NodeJS.ProcessEnv) =>
    execute(process.execPath, ['--require', preload, entry, ...args], { env, timeout: 60000, maxBuffer: 1024 * 1024 });
  async function seed() {
    for (const [index, oid] of [
      'pending',
      'failed',
      'uncertain',
      'duplicate-a',
      'duplicate-b',
      'historical',
    ].entries()) {
      const articleId = oid.startsWith('duplicate') ? '77' : String(100 + index);
      await db.collection('record').insertOne({
        redboxOid: oid,
        revision: 1,
        recordVersion: 1,
        metaMetadata: { brandId: 'brand', type: 'data' },
        authorization: { edit: ['admin', 'worker'] },
        metadata: { figshare_article_id: articleId, citation_url: `https://repository.test/${oid}` },
        ...(oid === 'failed'
          ? {
              figshareSyncIntent: {
                readiness: 'abandoned',
                requestedBy: 'failed-requester',
                saveToken: 'failed-save',
              },
            }
          : {}),
      });
      const state = emptyFigshareEvidence(oid, 'brand');
      state.binding = { namespace: baseUrl, accountId: '12', ownerId: '13', articleId };
      if (oid === 'pending') state.work.sync.requested = 1;
      if (oid === 'uncertain')
        state.create = {
          token: 'original-create',
          binding: { ...state.binding },
          startedAt: '2026-01-01T00:00:00Z',
          outcome: 'uncertain',
        };
      await db.collection('figsharesync').insertOne({ ...state });
      await db.collection('integrationaudit').insertOne({
        brandId: 'brand',
        redboxOid: oid,
        traceId: `trace-${oid}`,
        status: oid === 'failed' ? 'failed' : 'success',
        originalEvidence: { oid },
      });
    }
    await db.collection('record').insertOne({
      redboxOid: 'foreign',
      metaMetadata: { brandId: 'foreign' },
      metadata: { secret: 'foreign-private' },
    });
  }
  for (const backend of ['fs', 's3']) {
    const run = backend === 's3' && !process.env.ONI_OCFL_TEST_S3_ENDPOINT ? it.skip : it;
    run(
      `replays interrupted stage-1 CLI conversion with mixed evidence on ${backend}, then verifies read-only readiness`,
      async () => {
        const bucket = `publication-release-${randomUUID()}`;
        const s3 =
          backend === 's3'
            ? new S3Client({
                endpoint: process.env.ONI_OCFL_TEST_S3_ENDPOINT,
                region: 'us-east-1',
                forcePathStyle: true,
                credentials: { accessKeyId: 'release-test', secretAccessKey: 'release-test' },
              })
            : undefined;
        if (s3) await s3.send(new CreateBucketCommand({ Bucket: bucket }));
        try {
          await seed();
          const figshare = new FigsharePublishing();
          figshare.connection.baseUrl = baseUrl;
          figshare.connection.token = 'PRIVATE-RELEASE-TOKEN';
          figshare.workflow.transitionJob.enabled = false;
          const oni = new OniPublishing();
          oni.sites = { public: oni.sites.public };
          oni.sites.public.storage.diskName = 'repository';
          const env = environment(
            { figsharePublishing: figshare, oniPublishing: oni },
            backend === 's3'
              ? {
                  PUB_RELEASE_DISK: JSON.stringify({
                    driver: 's3',
                    config: {
                      bucket,
                      endpoint: process.env.ONI_OCFL_TEST_S3_ENDPOINT,
                      region: 'us-east-1',
                      key: 'release-test',
                      secret: 'release-test',
                      supportsACL: false,
                      forcePathStyle: true,
                    },
                  }),
                }
              : {}
          );
          const parameters = join(directory, 'parameters.json');
          const dryArgs = [
            'migrate',
            '--brand',
            'brand',
            '--username',
            'admin',
            '--parameters',
            JSON.stringify({ figshareAccountId: '12', serviceUsername: 'worker', stagingDisk: 'durable' }),
          ];
          const dry = JSON.parse((await cli(admin, dryArgs, env)).stdout);
          const params = {
            figshareAccountId: '12',
            serviceUsername: 'worker',
            stagingDisk: 'durable',
            consumersStopped: true,
            evidenceReference: 'rehearsal/drain',
            reviews: Object.fromEntries(
              dry.manualReviews.map((review: { id: string }) => [review.id, 'rehearsal/hook-review'])
            ),
          };
          await writeFile(parameters, JSON.stringify(params));
          const args = [
            '--disposable-copy',
            '--brand',
            'brand',
            '--username',
            'admin',
            '--parameters',
            parameters,
            '--evidence',
            join(directory, 'interrupted'),
            '--apply',
            '--reason',
            'Disposable release rehearsal',
          ];
          await assert.rejects(
            cli(rehearsal, args, { ...env, PUB_RELEASE_FAULT: 'evidence_written' }),
            /Rehearsal interruption/
          );
          const fenced = await db.collection('publicationmigration').findOne({ brandId: 'brand' });
          assert.equal(fenced?.authority, 'preparing');
          assert.ok(await db.collection('publicationmigrationitem').countDocuments());
          const resumedArgs = args.map(arg =>
            arg === join(directory, 'interrupted') ? join(directory, 'resumed') : arg
          );
          resumedArgs.push('--baseline', join(directory, 'interrupted/before.json'));
          const report = JSON.parse((await cli(rehearsal, resumedArgs, env)).stdout);
          assert.equal(report.legacyUnchanged, true);
          assert.equal(report.replayUnchanged, true);
          const repeated = await cli(
            rehearsal,
            resumedArgs.map(arg => (arg === join(directory, 'resumed') ? join(directory, 'repeated') : arg)),
            env
          );
          assert.equal(JSON.parse(repeated.stdout).replayUnchanged, true);
          const items = await db.collection('publicationmigrationitem').find({ brandId: 'brand' }).toArray();
          assert.ok(items.some(item => item.quarantine.includes('pending_source_requires_sealed_approval')));
          assert.ok(items.some(item => item.quarantine.includes('uncertain_create')));
          assert.equal(new Set(items.filter(item => item.conflictGroup).map(item => item.oid)).size, 2);
          const failed = items.find(item => item.oid === 'failed' && item.evidence.kind === 'figshare');
          assert.deepEqual(failed?.evidence.intent, {
            readiness: 'abandoned',
            requestedBy: 'failed-requester',
            saveToken: 'failed-save',
          });
          for (const row of await db.collection('publicationsync').find({ brandId: 'brand' }).toArray()) {
            assert.equal(row.sourceGeneration, 0);
            assert.equal(row.approvalId, '');
            assert.equal(row.completion, undefined);
            assert.equal(row.work.synchronise.requested, 0);
          }
          const reference = await new PublicationStagingFence(db).collection.findOne({});
          assert.ok(reference, 'Migration verified actual durable staging read-back');
          if (s3) assert.ok((await s3.send(new ListObjectsV2Command({ Bucket: bucket }))).KeyCount);
          const ready = JSON.parse(
            (await cli(admin, ['readiness', '--brand', 'brand', '--username', 'admin'], env)).stdout
          );
          assert.equal(ready.ready, true, JSON.stringify(ready));
          assert.ok(ready.quarantined > 0);
          assert.equal(ready.processingEnabled, false);
          await db.collection('publicationsync').dropIndex('providerId_1_remoteNamespace_1_remoteObjectId_1');
          await assert.rejects(cli(admin, ['readiness', '--brand', 'brand', '--username', 'admin'], env), error => {
            assert.ok(error && typeof error === 'object' && 'stdout' in error);
            assert.ok(String(error.stdout).includes('unsafe_or_missing_indexes'));
            return true;
          });
          const evidence = await readFile(join(directory, 'resumed/summary.json'), 'utf8');
          assert.ok(!evidence.includes('PRIVATE-RELEASE-TOKEN') && !evidence.includes('foreign-private'));
          if (process.env.PUBLICATION_REHEARSAL_EVIDENCE) {
            await mkdir(process.env.PUBLICATION_REHEARSAL_EVIDENCE, { recursive: true, mode: 0o700 });
            await cp(join(directory, 'resumed'), join(process.env.PUBLICATION_REHEARSAL_EVIDENCE, backend), {
              recursive: true,
            });
          }
        } finally {
          if (s3) {
            const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
            if (listed.Contents?.length)
              await s3.send(
                new DeleteObjectsCommand({
                  Bucket: bucket,
                  Delete: { Objects: listed.Contents.map(row => ({ Key: row.Key! })) },
                })
              );
            await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
            s3.destroy();
          }
        }
      }
    );
  }
});
