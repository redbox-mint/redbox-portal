import * as sinon from 'sinon';
import { mkdtemp, rm, access, readdir, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import path from 'node:path';
import os from 'node:os';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountDatastreamReadRoutes, datastreamReadRoutes } from '../../src/http/express/datastreamReads';
import { mountDatastreamWriteRoutes, datastreamWriteRoutes } from '../../src/http/express/datastreamWrites';
import { StreamingMultipart } from '../../src/http/express/multipart';
import { RecordSaveResponse } from '../../src/RecordSaveResponse';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';
let expect: Chai.ExpectStatic;
before(async () => {
  expect = (await import('chai')).expect;
});

describe('Owned datastream HTTP contracts', function () {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>, directory: string, multipart: StreamingMultipart;
  let records: Record<string, sinon.SinonStub>,
    datastream: Record<string, sinon.SinonStub>,
    disk: { putStream: sinon.SinonStub; delete: sinon.SinonStub; exists: (key: string) => Promise<boolean> };
  const activeRecord = () => ({
    redboxOid: 'record-1',
    revision: 5,
    metadata: { title: 'Existing title' },
    metaMetadata: { attachmentFields: [], brandId: 'brand-1', type: 'dataset' },
    authorization: { view: ['alice'], edit: ['alice'] },
  });
  function saved() {
    const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000000');
    result.oid = 'record-1';
    result.success = true;
    result.outcome = 'saved';
    result.setConcurrencyMetadata({ revision: 6, entityTag: formatRecordEntityTag('record-1', 6) });
    return result;
  }
  function refused(code: string) {
    const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000099');
    result.outcome = 'not-saved';
    result.problems = [{ kind: 'conflict', phase: 'pre-save', issues: [{ code, message: '@' + code }] }];
    return result;
  }
  const routePath = (action: string) => {
    const route = [...datastreamReadRoutes, ...datastreamWriteRoutes].find(r => r.action === action)!;
    return route.path
      .replace(':branding', 'default')
      .replace(':portal', 'portal')
      .replace(':oid', 'record-1')
      .replace(':datastreamId', 'file-1');
  };
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'sr-p8-datastream-'));
    disk = {
      putStream: sinon
        .stub()
        .callsFake((key: string, stream: Readable) => pipeline(stream, createWriteStream(path.join(directory, key)))),
      delete: sinon.stub().callsFake((key: string) => unlink(path.join(directory, key))),
      exists: async (key: string) =>
        access(path.join(directory, key)).then(
          () => true,
          () => false
        ),
    };
    multipart = new StreamingMultipart(disk, { files: 10, fileSize: 1024, fields: 10, fieldSize: 1024 });
    records = {
      getMeta: sinon.stub().resolves(activeRecord()),
      hasViewAccess: sinon.stub().returns(true),
      hasEditAccess: sinon.stub().returns(true),
      getAttachments: sinon.stub().resolves([{ fileId: 'file-1', name: 'safe.txt' }]),
      updateMeta: sinon.stub().resolves(saved()),
    };
    datastream = {
      getDatastream: sinon.stub().resolves({ body: 'safe bytes' }),
      addDatastreams: sinon.stub().resolves({ success: true, message: 'uploaded', isSuccessful: () => true }),
    };
    f = await httpRouteFixture((router, input) => {
      mountDatastreamReadRoutes(router, { ...input, records: records as any, datastream: datastream as any });
      mountDatastreamWriteRoutes(router, {
        ...input,
        records: records as any,
        datastream: datastream as any,
        multipart,
      });
    });
  });
  afterEach(async () => {
    try {
      await f?.close();
      await multipart?.close();
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
      sinon.restore();
    }
  });
  async function upload(headers: Record<string, string> = {}) {
    const form = new FormData();
    form.append('attachmentFields', new Blob(['staged bytes'], { type: 'text/plain' }), 'attachment.txt');
    const response = await fetch(f.url + routePath('addDataStreams'), {
      method: 'POST',
      headers: { 'X-ReDBox-Api-Version': '2.0', ...headers },
      body: form,
    });
    return { status: response.status, headers: response.headers, body: (await response.json()) as any };
  }
  for (const action of ['getDataStream', 'listDatastreams'])
    it(`authorizes ${action} before attachment access with non-disclosing 404/403`, async function () {
      records.getMeta.resolves({
        ...activeRecord(),
        metaMetadata: { brandId: 'different-brand' },
        metadata: { privateValue: 'must-not-return' },
      });
      const foreign = await f.request(routePath(action));
      expect(foreign.status).to.equal(404);
      expect(foreign.text).not.to.include('must-not-return');
      expect(records.getAttachments.called).to.equal(false);
      records.getMeta.resolves({ ...activeRecord(), metadata: { privateValue: 'must-not-return' } });
      records.hasViewAccess.returns(false);
      const denied = await f.request(routePath(action));
      expect(denied.status).to.equal(403);
      expect(denied.text).not.to.include('must-not-return');
      expect(records.getAttachments.called).to.equal(false);
      expect(datastream.getDatastream.called).to.equal(false);
    });
  it('lists attachments only after current active-brand authorization', async function () {
    const response = await f.request(routePath('listDatastreams'), { headers: { 'X-ReDBox-Api-Version': '2.0' } });
    expect(response.status).to.equal(200);
    expect(records.getAttachments.calledOnceWithExactly('record-1', undefined, { username: 'alice' })).to.equal(true);
    expect(response.body.data.records).to.deep.equal([{ fileId: 'file-1', name: 'safe.txt' }]);
  });
  it('rejects malformed preconditions and missing edit authority before accepting bytes', async function () {
    const malformed = await upload({ 'If-Match': '*' });
    expect(malformed.status).to.equal(400);
    expect(records.getMeta.called).to.equal(false);
    expect(disk.putStream.called).to.equal(false);
    records.hasEditAccess.returns(false);
    const denied = await upload({ 'If-Match': formatRecordEntityTag('record-1', 5) });
    expect(denied.status).to.equal(403);
    expect(disk.putStream.called).to.equal(false);
    expect(records.updateMeta.called).to.equal(false);
  });
  it('claims the record through CAS before finalizing staged bytes and always cleans staging', async function () {
    const response = await upload({ 'If-Match': formatRecordEntityTag('record-1', 5) });
    expect(response.status).to.equal(200);
    expect(records.getMeta.callCount).to.equal(2);
    expect(records.updateMeta.calledOnce).to.equal(true);
    const args = records.updateMeta.firstCall.args;
    expect(args[0]).to.include({ id: 'brand-1' });
    expect(args[1]).to.equal('record-1');
    expect(args[2]).to.equal(await records.getMeta.secondCall.returnValue);
    expect(args[4]).to.equal(false);
    expect(args[5]).to.equal(false);
    expect(args[7]).to.deep.equal({ metadata: {}, mode: 'merge' });
    expect(args[8].concurrency).to.deep.equal({ entityTagSupplied: true, expectedRevision: 5 });
    expect(datastream.addDatastreams.calledAfter(records.updateMeta)).to.equal(true);
    expect(disk.delete.calledOnce).to.equal(true);
    expect(disk.delete.calledAfter(datastream.addDatastreams)).to.equal(true);
    expect(await readdir(directory)).to.deep.equal([]);
    expect(response.body.meta.outcome).to.equal('saved');
    expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('record-1', 6));
  });
  it('reloads tokenless metadata after upload and skips the onUpdate hook chain', async function () {
    const latest = {
      ...activeRecord(),
      revision: 6,
      metadata: { title: 'Concurrent title', concurrentValue: 'must survive' },
    };
    records.getMeta.onSecondCall().resolves(latest);
    expect((await upload()).status).to.equal(200);
    const args = records.updateMeta.firstCall.args;
    expect(records.getMeta.callCount).to.equal(2);
    expect(args[2]).to.equal(latest);
    expect(args[4]).to.equal(false);
    expect(args[5]).to.equal(false);
    expect(args[7]).to.deep.equal({ metadata: {}, mode: 'merge' });
    expect(args[8].concurrency).to.deep.equal({ entityTagSupplied: false });
    expect(datastream.addDatastreams.calledAfter(records.updateMeta)).to.equal(true);
  });
  it('retains supplied stale revision after upload reload and removes staging', async function () {
    const latest = {
      ...activeRecord(),
      revision: 6,
      metadata: { title: 'Concurrent title', concurrentValue: 'must survive' },
    };
    records.getMeta.onSecondCall().resolves(latest);
    records.updateMeta.resolves(refused('record-revision-stale'));
    const response = await upload({ 'If-Match': formatRecordEntityTag('record-1', 5) });
    expect(response.status).to.equal(412);
    expect(records.updateMeta.firstCall.args[2]).to.equal(latest);
    expect(records.updateMeta.firstCall.args[8].concurrency).to.deep.equal({
      entityTagSupplied: true,
      expectedRevision: 5,
    });
    expect(datastream.addDatastreams.called).to.equal(false);
    expect(disk.delete.calledOnce).to.equal(true);
    expect(await readdir(directory)).to.deep.equal([]);
  });
  it('rechecks edit permission after bytes arrive without disclosing record state', async function () {
    records.getMeta.onSecondCall().resolves({ ...activeRecord(), metadata: { privateValue: 'must-not-return' } });
    records.hasEditAccess.onSecondCall().returns(false);
    const response = await upload();
    expect(response.status).to.equal(403);
    expect(records.updateMeta.called).to.equal(false);
    expect(datastream.addDatastreams.called).to.equal(false);
    expect(disk.delete.calledOnce).to.equal(true);
    expect(await readdir(directory)).to.deep.equal([]);
    expect(JSON.stringify(response.body)).not.to.include('must-not-return');
  });
  it('never finalizes strict missing or stale claims and cleans each certified abandoned upload', async function () {
    for (const testCase of [
      { headers: {} as Record<string, string>, code: 'record-precondition-required', status: 428 },
      { headers: { 'If-Match': formatRecordEntityTag('record-1', 4) }, code: 'record-revision-stale', status: 412 },
    ]) {
      records.updateMeta.resolves(refused(testCase.code));
      const response = await upload(testCase.headers);
      expect(response.status).to.equal(testCase.status);
      expect(datastream.addDatastreams.called).to.equal(false);
      expect(await readdir(directory)).to.deep.equal([]);
    }
    expect(disk.putStream.callCount).to.equal(2);
    expect(disk.delete.callCount).to.equal(2);
  });
});
