import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { firstValueFrom } from 'rxjs';
import supertest from 'supertest';
import { MongoClient, ObjectId } from 'mongodb';
import type { ExportJobDto } from '@researchdatabox/sails-ng-common';
import type { ExportJobModel } from '@researchdatabox/redbox-core';
import { Services as StorageServices } from '../../../packages/redbox-core/src/services/StorageManagerService';
import { GridFSDriver } from '../../../packages/redbox-core/src/storage/GridFSDriver';

/** Real application, users, records, Agenda submission, Mongo jobs, and StorageManager disks. */
describe('Background admin CSV export integration', function () {
  this.timeout(90_000);
  const suffix = randomUUID();
  const baseUrl = '/default/rdmp/export/jobs';
  const modifiedAfter = '2026-01-01T00:00:00.000Z';
  const modifiedBefore = '2026-01-01T00:00:30.000Z';
  const recordOids: string[] = [];
  const jobIds: string[] = [];
  const userIds: string[] = [];
  let librarian: supertest.Agent;
  let otherLibrarian: supertest.Agent;
  let researcher: supertest.Agent;
  let anonymous: supertest.Agent;
  let ownerId: string;
  let libRoleIds: string[];

  function collection() {
    return ExportJob.getDatastore().manager.collection<ExportJobModel>(ExportJob.tableName);
  }

  async function csrf(agent: supertest.Agent): Promise<string> {
    if (!sails.config.security.csrf) return '';
    return (await agent.get('/csrfToken').query({ branding: 'default', portal: 'rdmp' }).expect(200)).body._csrf;
  }

  async function createExport(agent = librarian): Promise<ExportJobDto> {
    const token = await csrf(agent);
    const response = await agent
      .post(baseUrl)
      .set('X-Source', 'jsclient')
      .send({
        format: 'csv',
        recType: 'rdmp',
        before: modifiedBefore,
        after: modifiedAfter,
        _csrf: token,
      })
      .expect(202);
    const job: ExportJobDto = response.body;
    jobIds.push(job.id);
    assert.equal(response.headers.location, `${baseUrl}/${job.id}`);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.equal(job.status, 'queued');
    assert.equal(job.downloadUrl, null);
    assert.equal('objectKey' in response.body, false);
    assert.equal('authorizationContext' in response.body, false);
    return job;
  }

  async function waitUntilReady(id: string, agent = librarian): Promise<ExportJobDto> {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const response = await agent.get(`${baseUrl}/${id}`).expect(200);
      const job: ExportJobDto = response.body;
      if (job.status === 'ready') return job;
      assert.notEqual(job.status, 'failed', job.errorMessage ?? 'Export preparation failed');
      assert.ok(job.status === 'queued' || job.status === 'running');
      await new Promise<void>(resolve => setTimeout(resolve, 200));
    }
    throw new Error(`Export ${id} did not complete through the real Agenda worker within 60 seconds.`);
  }

  async function deleteExport(id: string, agent = librarian, status = 204) {
    const token = await csrf(agent);
    return agent.delete(`${baseUrl}/${id}`).set('X-Source', 'jsclient').send({ _csrf: token }).expect(status);
  }

  before(async function () {
    const app = (sails.hooks.http as { app: Parameters<typeof supertest.agent>[0] }).app;
    const brand = BrandingService.getDefault();
    libRoleIds = RolesService.getRoleIds(brand.roles, ['Librarians']);
    assert.ok(libRoleIds.length > 0, 'Librarians role must exist');
    anonymous = supertest.agent(app);
    const agents: supertest.Agent[] = [];
    for (const [name, roles] of [
      ['owner', libRoleIds],
      ['other', libRoleIds],
      ['researcher', RolesService.getRoleIds(brand.roles, ['Researcher'])],
    ] as const) {
      const username = `export-${name}-${suffix}`;
      const user = await firstValueFrom(
        UsersService.addLocalUser(username, `Export ${name}`, `${username}@example.test`, 'RBTest123!')
      );
      userIds.push(String(user.id));
      if (name === 'owner') ownerId = String(user.id);
      await firstValueFrom(UsersService.updateUserRoles(user.id, [...roles]));
      const agent = supertest.agent(app);
      const token = await csrf(agent);
      await agent
        .post('/user/login_local')
        .set('X-Source', 'jsclient')
        .send({
          username,
          password: 'RBTest123!',
          branding: 'default',
          portal: 'rdmp',
          _csrf: token,
        })
        .expect(200);
      agents.push(agent);
    }
    [librarian, otherLibrarian, researcher] = agents;
    for (let index = 0; index < 25; index += 1) {
      const redboxOid = `export-${suffix}-${index}`;
      recordOids.push(redboxOid);
      await Record.create({
        redboxOid,
        metaMetadata: { brandId: brand.id, type: 'rdmp' },
        metadata: {
          title: index === 0 ? '=UNTRUSTED()' : `Ångström ${index}`,
          ...(index === 24 ? { finalPageOnly: 'late column survives' } : {}),
        },
        lastSaveDate: new Date(Date.UTC(2026, 0, 1, 0, 0, 24 - index)).toISOString(),
        authorization: { view: [`export-owner-${suffix}`], edit: [], viewRoles: [], editRoles: [] },
      });
    }
    for (const kind of ['denied', 'foreign'] as const) {
      const redboxOid = `export-${suffix}-${kind}`;
      recordOids.push(redboxOid);
      await Record.create({
        redboxOid,
        metaMetadata: { brandId: kind === 'foreign' ? 'another-brand' : brand.id, type: 'rdmp' },
        metadata: { title: `SECRET ${kind}` },
        lastSaveDate: '2026-01-01T00:00:10.000Z',
        authorization: {
          view: kind === 'foreign' ? [`export-owner-${suffix}`] : [],
          edit: [],
          viewRoles: [],
          editRoles: [],
        },
      });
    }
  });

  after(async function () {
    if (jobIds.length) {
      const jobs = await collection()
        .find({ jobId: { $in: jobIds } })
        .toArray();
      for (const job of jobs) {
        if (job.objectKey && job.cleanedAt === null) {
          const disk = StorageManagerService.disk(job.diskName);
          if (await disk.exists(job.objectKey)) await disk.delete(job.objectKey);
        }
      }
      await collection().deleteMany({ jobId: { $in: jobIds } });
    }
    if (recordOids.length) await Record.destroy({ redboxOid: recordOids });
    if (userIds.length) await User.destroy({ id: userIds });
  });

  it('generates through Agenda, restores status after a new HTTP request, and downloads the complete private CSV', async function () {
    const queued = await createExport();
    const ready = await waitUntilReady(queued.id);
    assert.equal(ready.downloadUrl, `export/jobs/${queued.id}/download`);
    assert.ok(ready.completedAt && ready.expiresAt);
    assert.equal(
      Date.parse(ready.expiresAt) - Date.parse(ready.completedAt),
      sails.config.record.export.background.retentionHours * 3_600_000
    );
    const listed = await librarian.get(baseUrl).expect(200);
    assert.ok(listed.body.some((job: ExportJobDto) => job.id === queued.id));
    const file = await librarian.get(`${baseUrl}/${queued.id}/download`).expect(200);
    assert.equal(file.headers['cache-control'], 'private, no-store');
    assert.match(file.headers['content-disposition'], /attachment; filename=/);
    assert.equal(file.text.charCodeAt(0), 0xfeff);
    assert.equal(Number(file.headers['content-length']), Buffer.byteLength(file.text));
    assert.ok(file.text.includes('metadata.finalPageOnly'));
    assert.ok(file.text.includes('late column survives'));
    assert.ok(file.text.includes("'=UNTRUSTED()"));
    assert.ok(file.text.includes('Ångström'));
    for (const oid of recordOids.slice(0, 25)) assert.ok(file.text.includes(oid), `Missing ${oid}`);
    assert.equal(file.text.includes('SECRET'), false);
  });

  it('denies other owners, researchers, anonymous requests, and jobs in another brand or portal', async function () {
    const queued = await createExport();
    await waitUntilReady(queued.id);
    for (const suffix of ['', '/download']) await otherLibrarian.get(`${baseUrl}/${queued.id}${suffix}`).expect(404);
    await deleteExport(queued.id, otherLibrarian, 404);
    const listed = await otherLibrarian.get(baseUrl).expect(200);
    assert.equal(
      listed.body.some((job: ExportJobDto) => job.id === queued.id),
      false
    );
    for (const agent of [anonymous, researcher]) {
      for (const suffix of ['', `/${queued.id}`, `/${queued.id}/download`]) {
        await agent.get(`${baseUrl}${suffix}`).set('Content-Type', 'application/json').expect(403);
      }
      await agent
        .post(baseUrl)
        .send({ format: 'csv', recType: 'rdmp', _csrf: await csrf(agent) })
        .expect(403);
      await deleteExport(queued.id, agent, 403);
    }
    const row = await collection().findOne({ jobId: queued.id });
    assert.ok(row);
    try {
      await collection().updateOne({ jobId: queued.id }, { $set: { brandId: 'different-brand' } });
      await librarian.get(`${baseUrl}/${queued.id}`).expect(404);
      await librarian.get(`${baseUrl}/${queued.id}/download`).expect(404);
      await deleteExport(queued.id, librarian, 404);
      await collection().updateOne(
        { jobId: queued.id },
        { $set: { brandId: row.brandId, portal: 'different-portal' } }
      );
      await librarian.get(`${baseUrl}/${queued.id}`).expect(404);
      await librarian.get(`${baseUrl}/${queued.id}/download`).expect(404);
      await deleteExport(queued.id, librarian, 404);
    } finally {
      await collection().updateOne({ jobId: queued.id }, { $set: { brandId: row.brandId, portal: row.portal } });
    }
  });

  it('explicitly deletes a downloaded export, removes its private bytes and hides its status', async function () {
    const queued = await createExport();
    await waitUntilReady(queued.id);
    const row = await collection().findOne({ jobId: queued.id });
    assert.ok(row?.objectKey);
    const disk = StorageManagerService.disk(row.diskName);
    await librarian.get(`${baseUrl}/${queued.id}/download`).expect(200);
    assert.equal(await disk.exists(row.objectKey), true, 'Downloading does not delete the retained export');
    assert.equal((await collection().findOne({ jobId: queued.id }))?.expiresAt, row.expiresAt);
    const deleted = await deleteExport(queued.id);
    assert.equal(deleted.text, '');
    assert.equal(deleted.headers['cache-control'], 'private, no-store');
    assert.equal(await disk.exists(row.objectKey), false);
    assert.equal((await collection().findOne({ jobId: queued.id }))?.status, 'deleted');
    const listed = await librarian.get(baseUrl).expect(200);
    assert.equal(
      listed.body.some((job: ExportJobDto) => job.id === queued.id),
      false
    );
    await librarian.get(`${baseUrl}/${queued.id}`).expect(404);
    await librarian.get(`${baseUrl}/${queued.id}/download`).expect(404);
    await deleteExport(queued.id);
    await deleteExport(randomUUID(), librarian, 404);
  });

  it('expires downloads immediately and deletes the artifact through its saved StorageManager disk', async function () {
    const queued = await createExport();
    await waitUntilReady(queued.id);
    const row = await collection().findOne({ jobId: queued.id });
    assert.ok(row?.objectKey);
    const disk = StorageManagerService.disk(row.diskName);
    assert.equal(await disk.exists(row.objectKey), true);
    await collection().updateOne({ jobId: queued.id }, { $set: { expiresAt: Date.now() - 1 } });
    await librarian.get(`${baseUrl}/${queued.id}/download`).expect(410);
    const status = await librarian.get(`${baseUrl}/${queued.id}`).expect(200);
    assert.equal(status.body.status, 'expired');
    assert.equal(status.body.downloadUrl, null);
    assert.equal(await disk.exists(row.objectKey), true, 'Download expiry must not wait for the deletion schedule');
    await ExportService.maintenanceJob();
    assert.equal(await disk.exists(row.objectKey), false);
    assert.equal((await collection().findOne({ jobId: queued.id }))?.status, 'expired');
    await ExportService.maintenanceJob();
    assert.equal(await disk.exists(row.objectKey), false, 'Repeat cleanup must be safe');
  });

  it('recovers crashed GridFS uploads with chunks but no completed file and preserves a live attempt', async function () {
    const diskName = sails.config.record.export.background.diskName ?? 'exports';
    const diskConfig = StorageManagerService.getDiskConfig(diskName);
    assert.equal(diskConfig.driver, 'gridfs', 'The default crash regression exercises the real GridFS driver');
    if (diskConfig.driver !== 'gridfs') return;
    const config = diskConfig.config;
    const url = config.url || sails.config.datastores[config.datastore ?? 'mongodb'].url;
    const client = await MongoClient.connect(url);
    const db = config.databaseName ? client.db(config.databaseName) : client.db();
    const bucketName = config.bucketName ?? 'fs';
    const uploads = db.collection(`${bucketName}.uploads`);
    const chunks = db.collection(`${bucketName}.chunks`);
    const completed = db.collection(`${bucketName}.files`);
    const disk = StorageManagerService.disk(diskName);
    const startedAt = new Date(Date.now() - 10 * 60 * 1000);
    const objects = ['stale', 'orphan', 'live']
      .map(kind => ({
        kind,
        jobId: randomUUID(),
        uploadId: new ObjectId(),
        attemptId: randomUUID(),
      }))
      .map(value => ({ ...value, key: `exports/${value.jobId}/${value.attemptId}.csv` }));
    try {
      const queued = await createExport();
      await waitUntilReady(queued.id);
      const template = await collection().findOne({ jobId: queued.id });
      assert.ok(template);
      for (const object of objects) {
        // This is the durable state left by a process killed after flushing a GridFS chunk:
        // the pending key mapping exists, but GridFS has not created its files document yet.
        await uploads.insertOne({
          _id: object.uploadId,
          filename: object.key,
          startedAt,
          metadata: { visibility: 'private', contentType: 'text/csv' },
        });
        await chunks.insertOne({ files_id: object.uploadId, n: 0, data: Buffer.from('partial CSV') });
        assert.equal(await completed.countDocuments({ _id: object.uploadId }), 0);
        if (object.kind !== 'orphan') {
          const { _id: _ignored, ...fields } = template;
          await collection().insertOne({
            ...fields,
            jobId: object.jobId,
            attemptId: object.attemptId,
            objectKey: object.key,
            status: 'running',
            startedAt: startedAt.getTime(),
            completedAt: null,
            expiresAt: null,
            cleanedAt: null,
            cleanupAfter: null,
            byteLength: null,
            heartbeatAt: object.kind === 'live' ? Date.now() : startedAt.getTime(),
            deadlineAt: object.kind === 'live' ? Date.now() + 60 * 60 * 1000 : startedAt.getTime(),
          });
          jobIds.push(object.jobId);
        }
      }
      const stale = objects[0];
      const orphan = objects[1];
      const live = objects[2];
      // Reconstruct the driver to demonstrate that recovery does not rely on process memory.
      const restartedDriver = new GridFSDriver(config);
      assert.equal(await restartedDriver.exists(stale.key), false);
      assert.equal(Array.from((await disk.listAll(stale.key)).objects).length, 0);
      assert.ok((await disk.listIncompleteUploads?.(stale.key))?.some(upload => upload.key === stale.key));
      await assert.rejects(restartedDriver.getMetaData(stale.key), { code: 'ENOENT' });
      await assert.rejects(restartedDriver.getStream(stale.key), { code: 'ENOENT' });
      await ExportService.maintenanceJob();
      assert.equal((await collection().findOne({ jobId: stale.jobId }))?.status, 'failed');
      assert.equal(
        await uploads.countDocuments({ _id: orphan.uploadId }),
        0,
        'Unreferenced old pending mappings are removed'
      );
      assert.equal(await chunks.countDocuments({ files_id: orphan.uploadId }), 0, 'Orphan chunks are removed by key');
      assert.equal(await uploads.countDocuments({ _id: live.uploadId }), 1, 'A live job still owns its pending upload');
      assert.equal(await chunks.countDocuments({ files_id: live.uploadId }), 1);
      await collection().updateOne({ jobId: stale.jobId }, { $set: { cleanupAfter: Date.now() - 1 } });
      await ExportService.maintenanceJob();
      assert.equal(await uploads.countDocuments({ _id: stale.uploadId }), 0);
      assert.equal(await chunks.countDocuments({ files_id: stale.uploadId }), 0);
      assert.equal(await disk.exists(stale.key), false);
      assert.ok((await collection().findOne({ jobId: stale.jobId }))?.cleanedAt);
    } finally {
      try {
        for (const object of objects) await disk.delete(object.key);
        await collection().deleteMany({ jobId: { $in: objects.map(object => object.jobId) } });
      } finally {
        await client.close();
      }
    }
  });

  it('invalidates a prepared file when the requester gains a different set of brand roles', async function () {
    const queued = await createExport();
    await waitUntilReady(queued.id);
    const brand = BrandingService.getDefault();
    try {
      await firstValueFrom(
        UsersService.updateUserRoles(ownerId, RolesService.getRoleIds(brand.roles, ['Librarians', 'Researcher']))
      );
      await librarian.get(`${baseUrl}/${queued.id}/download`).expect(403);
    } finally {
      await firstValueFrom(UsersService.updateUserRoles(ownerId, libRoleIds));
    }
  });

  it('rejects export preparation without a CSRF token when protection is enabled', async function () {
    if (!sails.config.security.csrf) this.skip();
    const count = await collection().countDocuments({ requestedByUserId: ownerId });
    await librarian.post(baseUrl).set('X-Source', 'jsclient').send({ format: 'csv', recType: 'rdmp' }).expect(403);
    assert.equal(await collection().countDocuments({ requestedByUserId: ownerId }), count);
  });

  it('rejects export deletion without a CSRF token when protection is enabled', async function () {
    if (!sails.config.security.csrf) this.skip();
    const queued = await createExport();
    await waitUntilReady(queued.id);
    await librarian.delete(`${baseUrl}/${queued.id}`).set('X-Source', 'jsclient').expect(403);
    await librarian.get(`${baseUrl}/${queued.id}/download`).expect(200);
    await deleteExport(queued.id);
  });

  it('rejects malformed selections before creating or enqueueing a job', async function () {
    const count = await collection().countDocuments({ requestedByUserId: ownerId });
    for (const input of [
      { format: 'json', recType: 'rdmp' },
      { format: 'csv', recType: 'missing-record-type' },
      { format: 'csv', recType: 'rdmp', before: 'not-a-date' },
      { format: 'csv', recType: 'rdmp', before: '2026-01-01T00:00:00.000Z', after: '2026-02-01T00:00:00.000Z' },
    ])
      await librarian
        .post(baseUrl)
        .send({ ...input, _csrf: await csrf(librarian) })
        .expect(400);
    assert.equal(await collection().countDocuments({ requestedByUserId: ownerId }), count);
  });

  it('downloads and explicitly deletes from the saved private filesystem disk after selection changes', async function () {
    class InitializedStorageManager extends StorageServices.StorageManager {
      async ready(): Promise<void> {
        await this.processDynamicImports();
        await this.bootstrap();
      }
    }
    const root = await mkdtemp(join(tmpdir(), 'redbox-export-integration-'));
    const originalManager = StorageManagerService;
    const originalConfig = sails.config.storage;
    const originalBackground = sails.config.record.export.background;
    const diskName = `exports-test-${suffix}`;
    let artifactKey: string | null = null;
    try {
      sails.config.storage = {
        ...originalConfig,
        disks: { ...originalConfig.disks, [diskName]: { driver: 'fs', config: { root, visibility: 'private' } } },
      };
      const manager = new InitializedStorageManager();
      await manager.ready();
      Reflect.set(globalThis, 'StorageManagerService', manager);
      sails.config.record.export.background = { ...originalBackground, diskName };
      const queued = await createExport();
      await waitUntilReady(queued.id);
      const row = await collection().findOne({ jobId: queued.id });
      assert.ok(row?.objectKey);
      artifactKey = row.objectKey;
      assert.equal(row.diskName, diskName);
      assert.equal(await manager.disk(diskName).exists(artifactKey), true);
      sails.config.record.export.background = originalBackground;
      const file = await librarian.get(`${baseUrl}/${queued.id}/download`).expect(200);
      assert.ok(file.text.includes('late column survives'));
      await deleteExport(queued.id);
      assert.equal(await manager.disk(diskName).exists(artifactKey), false);
    } finally {
      try {
        if (artifactKey && (await StorageManagerService.disk(diskName).exists(artifactKey))) {
          await StorageManagerService.disk(diskName).delete(artifactKey);
        }
        await collection().deleteMany({ jobId: { $in: jobIds }, diskName });
      } finally {
        sails.config.record.export.background = originalBackground;
        sails.config.storage = originalConfig;
        Reflect.set(globalThis, 'StorageManagerService', originalManager);
        await rm(root, { recursive: true, force: true });
      }
    }
  });
});
