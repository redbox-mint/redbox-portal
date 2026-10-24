import * as sinon from 'sinon';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { httpPagesFixture } from '../helpers/httpPagesFixture';
import { preparePage } from '../../src/http/express/pages';
import { ResumableUploads, mountResumableUploadRoutes } from '../../src/http/express/resumableUploads';
import { mountDatastreamReadRoutes } from '../../src/http/express/datastreamReads';
let expect: Chai.ExpectStatic;
before(async () => {
  expect = (await import('chai')).expect;
});
describe('Owned resumable attachment contracts', function () {
  let directory: string, f: Awaited<ReturnType<typeof httpRouteFixture>>, uploads: ResumableUploads;
  let checkSpace: sinon.SinonStub,
    records: Record<string, sinon.SinonStub>,
    datastream: Record<string, sinon.SinonStub>;
  let filesystem: boolean;
  const base = '/default/portal/record/oid-1/attach';
  async function start() {
    const { Disk } = await import('flydrive'),
      { FSDriver } = await import('flydrive/drivers/fs');
    const disk = new Disk(new FSDriver({ location: directory, visibility: 'private' }));
    f = await httpPagesFixture((input, router) => {
      uploads = new ResumableUploads({
        disk,
        records: records as any,
        maxSize: 1024 * 1024,
        origins: ['http://127.0.0.1'],
        log: input.log,
        authorizePending: async () => false,
        audit: async () => {},
        ...(filesystem ? { stagingFilesystem: { root: directory, reserveBytes: 100 } } : {}),
      });
      mountDatastreamReadRoutes(router, {
        ...input,
        records: records as any,
        datastream: datastream as any,
        notFound: async (req, res) => {
          (await preparePage(req, res, input)).error(404);
        },
      });
      mountResumableUploadRoutes(router, { ...input, uploads });
    });
    return disk;
  }
  const create = (suffix = '') =>
    fetch(f.url + base + suffix, {
      method: 'POST',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Length': '1000',
        'Upload-Metadata': 'filename ' + Buffer.from('file.txt').toString('base64'),
      },
    });
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'sr-p8-resumable-'));
    filesystem = true;
    checkSpace = sinon
      .stub(require('check-disk-space'), 'default')
      .resolves({ free: 10000, size: 20000, diskPath: directory });
    records = {
      getMeta: sinon.stub().resolves({
        redboxOid: 'oid-1',
        metaMetadata: { brandId: 'brand-1' },
        authorization: { view: ['alice'], edit: ['alice'] },
      }),
      hasEditAccess: sinon.stub().returns(true),
      hasViewAccess: sinon.stub().returns(true),
      getAttachments: sinon.stub().resolves([]),
    };
    datastream = { getDatastream: sinon.stub() };
  });
  afterEach(async () => {
    try {
      await f?.close();
      await uploads?.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
      sinon.restore();
    }
  });
  it('returns routed attachment URLs from the actual tus server', async function () {
    await start();
    const response = await create();
    expect(response.status).to.equal(201);
    expect(response.headers.get('Location')).to.match(/^\/default\/portal\/record\/oid-1\/attach\/[a-f0-9]{32}$/);
  });
  it('normalizes trailing slash upload locations', async function () {
    await start();
    const response = await create('/');
    expect(response.status).to.equal(201);
    expect(response.headers.get('Location')).to.match(/^\/default\/portal\/record\/oid-1\/attach\/[a-f0-9]{32}$/);
    expect(response.headers.get('Location')).not.to.include('//');
  });
  it('never exposes the internal tus mount in generated public locations', async function () {
    await start();
    const response = await create();
    expect(response.status).to.equal(201);
    expect(response.headers.get('Location')).not.to.include('/uploads/attachments');
    expect(response.headers.get('Location')).to.include('/default/portal/record/oid-1/attach/');
  });
  it('stores resume state on the explicitly supplied StorageManager disk', async function () {
    const disk = await start();
    const response = await create();
    expect(response.status).to.equal(201);
    const id = response.headers.get('Location')!.split('/').pop()!;
    expect(await disk.exists('.tus/' + id + '/info.json')).to.equal(true);
  });
  it('needs only the supplied disk and no legacy attachment-directory configuration', async function () {
    await start();
    const response = await create();
    expect(response.status).to.equal(201);
    expect(await readdir(directory)).not.to.deep.equal([]);
  });
  it('checks free space against the selected filesystem staging root', async function () {
    await start();
    expect((await create()).status).to.equal(201);
    expect(checkSpace.calledOnceWithExactly(directory)).to.equal(true);
  });
  it('does not query local free space for non-filesystem staging configuration', async function () {
    filesystem = false;
    await start();
    expect((await create()).status).to.equal(201);
    expect(checkSpace.called).to.equal(false);
  });
  it('uses the staging root independently of unrelated database disk configuration', async function () {
    await start();
    expect((await create()).status).to.equal(201);
    expect(checkSpace.firstCall.args[0]).to.equal(directory);
    expect(checkSpace.firstCall.args[0]).not.to.equal('/legacy/mongodb-disk');
  });
  it('returns browser404 when attachment is not in the authorized record', async function () {
    await start();
    const response = await f.request(base + '/file-missing', { headers: { Accept: 'text/html' } });
    expect(response.status).to.equal(404);
    expect(response.headers.get('Content-Type')).to.include('text/html');
    expect(datastream.getDatastream.called).to.equal(false);
  });
  it('retains JSON404 for attachment API clients', async function () {
    await start();
    const response = await f.request(base + '/file-missing', {
      headers: { 'X-Source': 'jsclient', Accept: 'application/json' },
    });
    expect(response.status).to.equal(404);
    expect(response.body.message).to.equal('Attachment not found');
    expect(datastream.getDatastream.called).to.equal(false);
  });
  it('returns404 without attachment response headers when a registered stream is missing', async function () {
    await start();
    records.getAttachments.resolves([{ fileId: 'file-missing', name: 'missing.txt', mimeType: 'text/plain', size: 1 }]);
    datastream.getDatastream.rejects(new Error('attachment-not-found'));
    const response = await f.request(base + '/file-missing', { headers: { Accept: 'text/html' } });
    expect(response.status).to.equal(404);
    expect(response.headers.get('Content-Disposition')).to.equal(null);
    expect(response.text).not.to.include('attachment-not-found');
  });
  it('refuses uploads when the configured reserve would be consumed', async function () {
    await start();
    checkSpace.resolves({ free: 1100, size: 20000, diskPath: directory });
    const response = await create();
    expect(response.status).to.equal(500);
    expect(await readdir(directory)).to.deep.equal([]);
  });
  it('returns a sanitized server error when attachment listing fails', async function () {
    await start();
    records.getAttachments.rejects(new Error('boom PRIVATE'));
    const response = await f.request('/default/portal/record/oid-1/attachments');
    expect(response.status).to.equal(500);
    expect(response.text).not.to.include('PRIVATE');
    expect(datastream.getDatastream.called).to.equal(false);
  });
});
