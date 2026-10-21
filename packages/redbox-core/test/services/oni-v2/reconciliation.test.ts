import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { randomUUID, createHash } from 'node:crypto';
import { Disk } from 'flydrive';
import { FSDriver } from 'flydrive/drivers/fs';
import { S3Driver } from 'flydrive/drivers/s3';
import { S3Client, CreateBucketCommand, DeleteBucketCommand } from '@aws-sdk/client-s3';
import * as sinon from 'sinon';
import { OniPublishing } from '../../../src/configmodels/OniPublishing';
import { Services } from '../../../src/services/StorageManagerService';
import { createOniRepository } from '../../../src/services/oni-v2/repository';
import type { OcflDisk } from '../../../src/services/oni-v2/flydriveOcflStore';
import { createOniOcflDesiredContent, sha256 } from '../../../src/services/oni-v2/ocflReconciliation';
import type {
  OniCrateBuildResult,
  OniPublishInput,
  OniOcflDesiredContent,
  OniOcflObjectEvidence,
  ResolvedOniPublishingConfigData,
} from '../../../src/services/oni-v2/types';

const endpoint = process.env.ONI_OCFL_TEST_S3_ENDPOINT;
if (process.env.ONI_OCFL_REQUIRE_S3 === 'true' && !endpoint)
  throw new Error('ONI_OCFL_TEST_S3_ENDPOINT is required for OCFL storage acceptance');

for (const backend of ['fs', 's3'] as const)
  for (const keyEncoding of ['flydrive', 'raw'] as const) {
    const suite = backend === 's3' && !endpoint ? describe.skip : describe;
    suite(`Oni OCFL reconciliation PUB-10 (${backend}, ${keyEncoding} keys)`, function () {
      this.timeout(30000);
      let directory: string;
      let bucket: string;
      let client: S3Client;
      let disk: Disk;
      let io: OcflDisk;
      let sandbox: sinon.SinonSandbox;
      let oldSails: unknown;
      const config: ResolvedOniPublishingConfigData = new OniPublishing();
      const objectId = 'dataset';
      const storage = {
        driver: 'flydrive' as const,
        diskName: 'oni',
        rootPath: '/objects',
        workspacePath: '/workspace',
        tempDir: '/unused',
        prefix: 'fixture',
        keyEncoding,
      };
      const site = { ...config.sites.public, storage };
      const attachment = Buffer.from([0, 255, 1, 13, 10, 200]);
      const attachmentPath = 'files/a=b%20.bin';
      const input: OniPublishInput = {
        oid: 'source',
        record: { metadata: {} },
        options: {},
        user: { username: 'worker' },
        creator: { username: 'creator' },
      };
      function crate(title = 'sealed'): OniCrateBuildResult {
        return {
          datasetUrl: 'https://example.test/dataset',
          rootId: objectId,
          rootCollectionId: 'collection',
          dataRecordOid: 'data',
          crateJson: { '@graph': [{ '@id': './', name: title, datePublished: '2026-02-03T04:05:06Z' }] },
          attachments: [{ fileId: 'file', name: 'binary', logicalPath: attachmentPath, source: {} }],
        };
      }
      function desired(value = crate()): OniOcflDesiredContent {
        const metadata = Buffer.from(JSON.stringify(value.crateJson, null, 2));
        return createOniOcflDesiredContent(config.metadata.jsonldFilename, [
          { logicalPath: config.metadata.jsonldFilename, size: metadata.length, sha256: sha256(metadata) },
          { logicalPath: attachmentPath, size: attachment.length, sha256: sha256(attachment) },
        ]);
      }
      function repository(payload = attachment) {
        const manager = new (class extends Services.StorageManager {
          override isBootstrapped() {
            return true;
          }
          override disk() {
            return disk;
          }
        })();
        return createOniRepository(
          config,
          site,
          { getDatastream: async () => ({ readstream: Readable.from([payload]) }) },
          manager
        );
      }
      function key(relative: string, workspace = false) {
        const raw = `${storage.prefix}/${workspace ? '__workspace__/' : ''}dataset/__object__/${relative}`;
        return keyEncoding === 'raw' ? raw : raw.replace(/%/g, '%25').replace(/=/g, '%3D');
      }
      async function seed() {
        await repository().writeDatasetObject(crate('prior'), input);
        return repository().readObject(objectId);
      }
      async function reconcile(prior: OniOcflObjectEvidence, content = desired(), quiesced = true) {
        return repository().reconcileCommit({ prior, desired: content, priorWriterQuiesced: quiesced });
      }
      async function editInventory(edit: (data: Record<string, unknown>) => void) {
        const data: Record<string, unknown> = JSON.parse(await io.get(key('inventory.json')));
        edit(data);
        const raw = JSON.stringify(data);
        await io.put(key('inventory.json'), raw);
        await io.put(key('inventory.json.sha512'), `${createHash('sha512').update(raw).digest('hex')} inventory.json`);
      }
      before(async () => {
        if (backend !== 's3') return;
        bucket = `pub10-${randomUUID()}`;
        client = new S3Client({
          endpoint,
          region: 'us-east-1',
          forcePathStyle: true,
          requestChecksumCalculation: 'WHEN_REQUIRED',
          credentials: { accessKeyId: 'pub10-test', secretAccessKey: 'pub10-test-local' },
          maxAttempts: 1,
        });
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      });
      after(async () => {
        if (backend !== 's3') return;
        await client.send(new DeleteBucketCommand({ Bucket: bucket }));
        client.destroy();
      });
      beforeEach(async () => {
        storage.prefix = `fixture-${randomUUID()}`;
        sandbox = sinon.createSandbox();
        oldSails = Reflect.get(globalThis, 'sails');
        Reflect.set(globalThis, 'sails', { log: { verbose() {} }, config: {} });
        if (backend === 'fs') {
          directory = await mkdtemp(join(tmpdir(), 'pub10-ocfl-'));
          const driver = new FSDriver({ location: directory, visibility: 'private' });
          disk = new Disk(driver);
          io = driver;
        } else {
          const driver = new S3Driver({ client, bucket, visibility: 'private', supportsACL: false });
          disk = new Disk(driver);
          io = driver;
        }
        await repository().ensureStorageRoot();
      });
      afterEach(async () => {
        sandbox.restore();
        if (backend === 'fs' && directory) await rm(directory, { recursive: true, force: true });
        if (backend === 's3' && client) {
          await io.deleteAll();
        }
        Reflect.set(globalThis, 'sails', oldSails);
      });

      it('reads absent objects, inventory/head and exact streamed crate/attachment bytes using the pinned library', async () => {
        const absent = await repository().readObject(objectId);
        assert.equal(absent.kind, 'absent');
        await repository().writeDatasetObject(crate(), input);
        const present = await repository().readObject(objectId);
        assert.equal(present.kind, 'present');
        if (present.kind !== 'present') assert.fail();
        assert.equal(present.head, 'v1');
        assert.equal(present.versionInventoryDigests.v1, present.inventoryDigest);
        assert.deepEqual(present.content, desired());
      });
      it('confirms a first commit after a lost response without another REPLACE', async () => {
        const prior = await repository().readObject(objectId);
        await assert.rejects(async () => {
          await repository().writeDatasetObject(crate(), input);
          throw new Error('lost response');
        }, /lost response/);
        const put = sandbox.spy(io, 'put');
        const move = sandbox.spy(io, 'move');
        const result = await reconcile(prior, desired(), false);
        assert.equal(result.kind, 'confirmed');
        assert.equal(put.callCount + move.callCount, 0);
        if (result.kind === 'confirmed') assert.equal(result.evidence.head, 'v1');
      });
      it('confirms a matching successor after a lost response in a fresh repository instance', async () => {
        const prior = await seed();
        await assert.rejects(async () => {
          await repository().writeDatasetObject(crate(), input);
          throw new Error('lost response');
        }, /lost response/);
        const result = await reconcile(prior);
        assert.equal(result.kind, 'confirmed');
        if (result.kind === 'confirmed') {
          assert.equal(result.evidence.head, 'v2');
          if (prior.kind === 'present') assert.equal(result.evidence.versionInventoryDigests.v1, prior.inventoryDigest);
        }
        assert.equal((await repository().readObject(objectId)).kind, 'present');
      });
      it('recognises desired content already at the prior head and the library no-op commit', async () => {
        await repository().writeDatasetObject(crate(), input);
        const prior = await repository().readObject(objectId);
        await repository().writeDatasetObject(crate(), input);
        const result = await reconcile(prior);
        assert.equal(result.kind, 'confirmed');
        if (result.kind === 'confirmed') assert.equal(result.evidence.head, 'v1');
      });
      it('proves non-application at an unchanged complete head only with positive writer quiescence', async () => {
        const prior = await seed();
        assert.equal((await reconcile(prior)).kind, 'not_applied');
        // A caller with current authority can now submit exactly one new version.
        await repository().writeDatasetObject(crate(), input);
        const result = await reconcile(prior);
        assert.equal(result.kind, 'confirmed');
        if (result.kind === 'confirmed') assert.equal(result.evidence.head, 'v2');
      });
      it('refuses retry at an unchanged head when the previous writer may still be running', async () => {
        assert.deepEqual((await reconcile(await seed(), desired(), false)).kind, 'repair_required');
        const result = await reconcile(await repository().readObject(objectId), desired(), false);
        assert.equal(result.kind === 'repair_required' && result.reason, 'writer_not_quiesced');
      });
      it('proves initial non-application only from empty object/workspace listings and writer quiescence', async () => {
        const prior = await repository().readObject(objectId);
        assert.equal((await reconcile(prior)).kind, 'not_applied');
        assert.equal((await reconcile(prior, desired(), false)).kind, 'repair_required');
      });
      it('requires repair for a competing successor with different content', async () => {
        const prior = await seed();
        await repository().writeDatasetObject(crate('competitor'), input);
        const result = await reconcile(prior);
        assert.equal(result.kind === 'repair_required' && result.reason, 'unexpected_head');
      });
      it('does not confirm matching crate metadata when the selected attachment bytes differ', async () => {
        const prior = await seed();
        await repository(Buffer.from('different attachment')).writeDatasetObject(crate(), input);
        const result = await reconcile(prior);
        assert.equal(result.kind === 'repair_required' && result.reason, 'unexpected_head');
      });
      it('reads complete paginated listings from the real driver', async () => {
        await repository().writeDatasetObject(crate(), input);
        const list = io.listAll.bind(io);
        let continuations = 0;
        sandbox.stub(io, 'listAll').callsFake(async (prefix, options) => {
          if (options?.paginationToken) continuations++;
          const pageOptions = { ...options, maxResults: 2 };
          return list(prefix, pageOptions);
        });
        const observed = await repository().readObject(objectId);
        assert.equal(observed.kind, 'present');
        if (observed.kind === 'present') assert.deepEqual(observed.content, desired());
        if (backend === 's3') assert.ok(continuations > 0);
      });
      it('requires repair if another commit changes the head during content read-back', async () => {
        const prior = await seed();
        await repository().writeDatasetObject(crate(), input);
        const getStream = io.getStream.bind(io);
        let changed = false;
        sandbox.stub(io, 'getStream').callsFake(async path => {
          const stream = await getStream(path);
          if (!changed) {
            changed = true;
            await repository().writeDatasetObject(crate('competing during read'), input);
          }
          return stream;
        });
        const result = await reconcile(prior);
        assert.equal(changed, true);
        assert.equal(result.kind === 'repair_required' && result.reason, 'unreadable_evidence');
      });
      it('requires repair for unexplained extra versions even if the latest content matches', async () => {
        const prior = await seed();
        await repository().writeDatasetObject(crate('competitor'), input);
        await repository().writeDatasetObject(crate(), input);
        const result = await reconcile(prior);
        assert.equal(result.kind === 'repair_required' && result.reason, 'unexpected_head');
      });
      it('requires repair after version files move but root inventory replacement fails, despite unchanged head', async () => {
        const prior = await seed();
        const copy = io.copy.bind(io);
        sandbox.stub(io, 'copy').callsFake(async (source, target, options) => {
          if (target === key('inventory.json.tmp')) throw new Error('lost before root replacement');
          await copy(source, target, options);
        });
        await assert.rejects(repository().writeDatasetObject(crate(), input), /lost before root/);
        sandbox.restore();
        assert.equal(JSON.parse(await io.get(key('inventory.json'))).head, 'v1');
        assert.equal(await io.exists(key('v2/inventory.json')), true);
        const result = await reconcile(prior);
        assert.equal(result.kind === 'repair_required' && result.reason, 'unreadable_evidence');
        assert.equal(JSON.parse(await io.get(key('inventory.json'))).head, 'v1');
      });
      it('requires repair for a leftover workspace even with an unchanged head', async () => {
        const prior = await seed();
        await io.put(key('v2/content/partial', true), 'partial');
        const result = await reconcile(prior);
        assert.equal(result.kind === 'repair_required' && result.reason, 'unreadable_evidence');
      });
      it('does not interpret a missing root inventory with stored version files as absence', async () => {
        const prior = await seed();
        await io.delete(key('inventory.json'));
        assert.equal((await reconcile(prior)).kind, 'repair_required');
      });
      it('requires repair for missing inventory sidecars', async () => {
        const prior = await seed();
        await io.delete(key('inventory.json.sha512'));
        assert.equal((await reconcile(prior)).kind, 'repair_required');
      });
      it('requires repair for missing version inventory evidence even with a valid root inventory', async () => {
        const prior = await seed();
        await io.delete(key('v1/inventory.json'));
        assert.equal((await reconcile(prior)).kind, 'repair_required');
      });
      it('requires repair for a torn root inventory/sidecar pair', async () => {
        const prior = await seed();
        await io.put(key('inventory.json.sha512'), `${'0'.repeat(128)} inventory.json`);
        assert.equal((await reconcile(prior)).kind, 'repair_required');
      });
      it('requires repair for correctly checksummed but incomplete inventories', async () => {
        const prior = await seed();
        await editInventory(data => {
          data.versions = {};
        });
        assert.equal((await reconcile(prior)).kind, 'repair_required');
      });
      it('requires repair for disagreement between root and version inventories', async () => {
        const prior = await seed();
        await editInventory(data => {
          data.message = 'changed outside a commit';
        });
        assert.equal((await reconcile(prior)).kind, 'repair_required');
      });
      it('requires repair for corrupt attachment bytes despite a matching inventory', async () => {
        const prior = await repository().readObject(objectId);
        await repository().writeDatasetObject(crate(), input);
        await io.put(key(`v1/content/${attachmentPath}`), 'corrupt');
        assert.equal((await reconcile(prior)).kind, 'repair_required');
      });
      it('requires repair for missing content bytes', async () => {
        const prior = await seed();
        await io.delete(key(`v1/content/${attachmentPath}`));
        assert.equal((await reconcile(prior)).kind, 'repair_required');
      });
      it('requires repair for files outside the complete inventory', async () => {
        const prior = await seed();
        await io.put(key('v2/content/untracked'), 'untracked');
        assert.equal((await reconcile(prior)).kind, 'repair_required');
      });
      it('propagates denied/unavailable reads instead of treating generic Flydrive errors as missing files', async () => {
        const prior = await seed();
        sandbox.stub(io, 'get').rejects(
          Object.assign(new Error('cannot read file'), {
            code: 'E_CANNOT_READ_FILE',
            cause: new Error('access denied'),
          })
        );
        const result = await reconcile(prior);
        assert.equal(result.kind === 'repair_required' && result.reason, 'unreadable_evidence');
      });
      it('requires repair when storage listing is unavailable, including for an absent object', async () => {
        const prior = await repository().readObject(objectId);
        sandbox.stub(io, 'listAll').rejects(new Error('listing unavailable'));
        const result = await reconcile(prior);
        assert.equal(result.kind === 'repair_required' && result.reason, 'unreadable_evidence');
      });
      it('requires repair rather than treating malformed listing entries as an empty object', async () => {
        const prior = await repository().readObject(objectId);
        sandbox.stub(io, 'listAll').resolves({ objects: [{}] });
        const result = await reconcile(prior);
        assert.equal(result.kind === 'repair_required' && result.reason, 'unreadable_evidence');
      });
      it('fails closed on repeated pagination tokens rather than looping or trusting a partial listing', async () => {
        const prior = await repository().readObject(objectId);
        sandbox.stub(io, 'listAll').resolves({ objects: [], paginationToken: 'repeated' });
        const result = await reconcile(prior);
        assert.equal(result.kind === 'repair_required' && result.reason, 'unreadable_evidence');
      });
      it('refuses a corrupt persisted desired manifest before performing any read or write', async () => {
        const prior = await seed();
        const get = sandbox.spy(io, 'get');
        const result = await reconcile(prior, { ...desired(), digest: 'invalid' });
        assert.equal(result.kind === 'repair_required' && result.reason, 'invalid_expectation');
        assert.equal(get.callCount, 0);
      });
    });
  }

describe('Oni OCFL desired content manifest PUB-10', () => {
  const metadata = { logicalPath: 'ro-crate-metadata.json', size: 2, sha256: sha256('{}') };
  it('normalizes file order and retains exact bytes, paths, sizes and metadata identity', () => {
    const file = { logicalPath: 'data/file', size: 1, sha256: sha256('x') };
    assert.deepEqual(
      createOniOcflDesiredContent(metadata.logicalPath, [metadata, file]),
      createOniOcflDesiredContent(metadata.logicalPath, [file, metadata])
    );
    assert.notEqual(
      createOniOcflDesiredContent(metadata.logicalPath, [metadata]).digest,
      createOniOcflDesiredContent(metadata.logicalPath, [metadata, file]).digest
    );
  });
  it('rejects duplicate/unsafe/overlapping paths, missing metadata and unidentifiable bytes', () => {
    for (const files of [
      [metadata, metadata],
      [{ ...metadata, logicalPath: '../escape' }],
      [metadata, { ...metadata, logicalPath: `${metadata.logicalPath}/child` }],
      [{ ...metadata, size: -1 }],
      [{ ...metadata, sha256: 'missing' }],
      [],
    ]) {
      assert.throws(() => createOniOcflDesiredContent(metadata.logicalPath, files));
    }
  });
});
