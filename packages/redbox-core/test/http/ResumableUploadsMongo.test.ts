import assert from 'node:assert/strict';
import { recordWriteFixture } from './recordWriteFixture';
import { ResumableUploads, mountResumableUploadRoutes } from '../../src/http/express/resumableUploads';
import { registerPersistenceResource } from '../../src/persistence/runtime';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { setTimeout as delay } from 'node:timers/promises';

describe('owned tus authorization and persistent resume on actual HTTP Mongo disks', function () {
  this.timeout(45000);
  let f: Awaited<ReturnType<typeof recordWriteFixture>>, uploads: ResumableUploads, oid: string, other: string;
  let createProvider!: () => ResumableUploads;
  let holdAudit: Promise<void> | undefined;
  before(async () => {
    f = await recordWriteFixture(async (router, fixture, bindings) => {
      createProvider = () =>
        new ResumableUploads({
          disk: bindings.disks.stagingDisk(),
          records: bindings.writer,
          maxSize: 1024 * 1024,
          origins: ['http://127.0.0.1'],
          rootContext: '/portal',
          log: nothingLogger,
          authorizePending: async () => false,
          audit: async (actor, action, context) => {
            if (action === 'attachment-upload-patch') await holdAudit;
            return bindings.users.addUserAuditEvent(actor, action, context);
          },
        });
      uploads = createProvider();
      registerPersistenceResource(fixture.owner, 'tus-uploads', {
        quiesce: () => uploads.quiesce(),
        drain: () => uploads.drain(),
        close: () => uploads.close(),
      });
      mountResumableUploadRoutes(router, { ...bindings, uploads: { handle: (req, res) => uploads.handle(req, res) } });
    });
    for (const title of ['Tus', 'Other']) {
      const result = await fetch(f.url + '/default/rdmp/api/records/metadata/dataRecord', {
        method: 'POST',
        headers: { ...f.headers, 'Content-Type': 'application/json', 'X-ReDBox-Api-Version': '2.0' },
        body: JSON.stringify({ metadata: { title } }),
      });
      const json = await result.json();
      assert.equal(result.status, 201, JSON.stringify(json));
      if (oid) other = json.data.oid;
      else oid = json.data.oid;
    }
  });
  after(async () => {
    await f?.close();
  });
  const base = () => f.url + '/default/rdmp/record/' + oid + '/attach';
  async function create(extra: Record<string, string> = {}, headers: Record<string, string> = f.headers) {
    return fetch(base(), {
      method: 'POST',
      headers: {
        ...headers,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': '6',
        'Upload-Metadata': 'filename ' + Buffer.from('file.txt').toString('base64'),
        ...extra,
      },
    });
  }
  it('creates a root-qualified location and resumes in two chunks without parser consumption', async () => {
    const created = await create({ 'X-Forwarded-Host': 'attacker.invalid', 'X-Forwarded-Proto': 'https' });
    assert.equal(created.status, 201, await created.text());
    const location = created.headers.get('location')!;
    assert.match(location, /^\/portal\/default\/rdmp\/record\/.+\/attach\/[a-f0-9]{32}$/);
    const url = new URL(location, f.url).href;
    const patch = async (offset: number, body: string) =>
      fetch(url, {
        method: 'PATCH',
        headers: {
          ...f.headers,
          'Tus-Resumable': '1.0.0',
          'Upload-Offset': String(offset),
          'Content-Type': 'application/offset+octet-stream',
        },
        body,
      });
    assert.equal((await patch(0, 'abc')).status, 204);
    await uploads.close();
    uploads = createProvider();
    const head = await fetch(url, { method: 'HEAD', headers: { ...f.headers, 'Tus-Resumable': '1.0.0' } });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('upload-offset'), '3');
    assert.equal((await patch(0, 'xyz')).status, 409);
    assert.equal((await patch(3, 'def')).status, 204);
    const id = location.split('/').pop()!;
    assert.equal(await f.disks.stagingDisk().get(id), 'abcdef');
    const forbidden = url.replace('/record/' + oid + '/', '/record/' + other + '/');
    assert.equal(
      (await fetch(forbidden, { method: 'HEAD', headers: { ...f.headers, 'Tus-Resumable': '1.0.0' } })).status,
      403
    );
    assert(await f.native.db().collection('useraudit').countDocuments({ action: 'attachment-upload-completed' }));
  });
  it('checks authentication CSRF object ownership limits and cancellation before staging', async () => {
    assert([401, 403].includes((await create({}, {})).status));
    assert.equal((await create({ 'Upload-Length': '1048577' })).status, 413);
    const original = await f.storage.getMeta(oid);
    await f.native
      .db()
      .collection('record')
      .updateOne(
        { redboxOid: oid },
        { $set: { 'authorization.edit': ['someone-else'], 'authorization.editRoles': [] } }
      );
    assert.equal((await create()).status, 403);
    await f.native
      .db()
      .collection('record')
      .updateOne({ redboxOid: oid }, { $set: { authorization: original.authorization } });
    const login = await fetch(f.url + '/__test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
    });
    const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    assert.equal((await create({}, { Cookie: cookie })).status, 403);
    assert.equal((await create({}, { Cookie: cookie, 'X-CSRF-Token': 'invalid' })).status, 403);
    const created = await create(),
      url = new URL(created.headers.get('location')!, f.url).href;
    assert.equal(
      (await fetch(url, { method: 'DELETE', headers: { ...f.headers, 'Tus-Resumable': '1.0.0' } })).status,
      204
    );
    assert.equal(
      (await fetch(url, { method: 'HEAD', headers: { ...f.headers, 'Tus-Resumable': '1.0.0' } })).status,
      404
    );
  });
  it('keeps Companion callback aliases protected by independently verified actor authentication', async () => {
    const url = f.url + '/default/rdmp/companion/record/' + oid + '/attach';
    assert(
      [401, 403].includes(
        (
          await fetch(url, {
            method: 'POST',
            headers: { 'Tus-Resumable': '1.0.0', 'Upload-Length': '6', 'X-Companion-Secret': 'untrusted' },
          })
        ).status
      )
    );
    assert.equal(
      (await fetch(url, { method: 'POST', headers: { ...f.headers, 'Tus-Resumable': '1.0.0', 'Upload-Length': '6' } }))
        .status,
      201
    );
  });
  it('retains admitted post-response auditing through quiesce and refuses new transfers', async () => {
    const created = await create(),
      url = new URL(created.headers.get('location')!, f.url).href;
    let release!: () => void;
    holdAudit = new Promise<void>(resolve => {
      release = resolve;
    });
    try {
      const result = await fetch(url, {
        method: 'PATCH',
        headers: {
          ...f.headers,
          'Tus-Resumable': '1.0.0',
          'Upload-Offset': '0',
          'Content-Type': 'application/offset+octet-stream',
        },
        body: 'abcdef',
      });
      assert.equal(result.status, 204);
      uploads.quiesce();
      let drained = false;
      const draining = uploads.drain().then(() => {
        drained = true;
      });
      await delay(30);
      assert.equal(drained, false);
      assert.equal((await create()).status, 503);
      release();
      await draining;
      assert.equal(await f.disks.stagingDisk().get(url.split('/').pop()!), 'abcdef');
    } finally {
      release();
      holdAudit = undefined;
    }
  });
});
