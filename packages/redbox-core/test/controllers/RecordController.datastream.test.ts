import { expect } from 'chai';
import * as sinon from 'sinon';
import { Readable, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { Controllers } from '../../src/controllers/RecordController';

describe('RecordController datastream downloads', () => {
  let controller: Controllers.Record;
  let req: any;
  let res: any;
  let sendResp: sinon.SinonSpy;
  let records: any;
  let datastreams: any;
  let params: Record<string, unknown>;
  let chunks: Buffer[];
  let originals: Record<string, unknown>;
  const latest = 'dataset-pdf-record-a-200.pdf';
  const historical = 'dataset-pdf-record-a-100.pdf';
  const pdf = Buffer.from('%PDF-1.7\nrecord a\n');

  beforeEach(() => {
    originals = Object.fromEntries(['sails', 'BrandingService', 'TranslationService'].map(key => [key, global[key]]));
    (global as any).sails = {
      config: {},
      log: { verbose: sinon.stub(), error: sinon.stub() },
    };
    (global as any).BrandingService = { getBrand: () => ({ id: 'brand-a' }) };
    (global as any).TranslationService = { t: (key: string) => key };
    records = {
      getMeta: sinon.stub().resolves({
        redboxOid: 'record-a',
        metaMetadata: { brandId: 'brand-a' },
        metadata: { latestPdf: latest },
      }),
      hasViewAccess: sinon.stub().returns(true),
      // Membership includes stored historical versions and files outside current form metadata.
      getAttachments: sinon.stub().resolves([{ fileId: latest }, { fileId: historical }, { fileId: 'legacy.txt' }]),
    };
    datastreams = { getDatastream: sinon.stub().resolves({ body: pdf }) };
    controller = new Controllers.Record();
    controller.recordsService = records;
    controller.datastreamService = datastreams;
    params = { oid: 'record-a', datastreamId: latest, fileName: 'datarecord.pdf' };
    req = {
      param: (key: string) => params[key],
      user: { username: 'alice', roles: [] },
      session: { branding: 'default' },
    };
    chunks = [];
    res = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    });
    res.set = sinon.stub();
    res.attachment = sinon.stub();
    res.status = sinon.stub().returns(res);
    res.json = sinon.stub().returns(res);
    sendResp = sinon.spy(controller as any, 'sendResp');
    sinon.stub(controller as any, 'isAjax').returns(false);
  });

  afterEach(() => {
    sinon.restore();
    Object.assign(global, originals);
  });

  async function expectFailure(status: number) {
    await controller.getDataStream(req, res);
    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2].status).to.equal(status);
    expect(res.attachment.called).to.equal(false);
    expect(res.set.calledWith('Content-Type', 'application/octet-stream')).to.equal(false);
    expect(res.status.lastCall.args[0]).to.equal(status);
    expect(res.json.calledOnce).to.equal(true);
    expect(Buffer.concat(chunks).length).to.equal(0);
  }

  it('downloads the current PDF bytes with a friendly filename and the caller context', async () => {
    await controller.getDataStream(req, res);
    await finished(res);
    expect(Buffer.concat(chunks)).to.deep.equal(pdf);
    expect(res.attachment.calledOnceWithExactly('datarecord.pdf')).to.equal(true);
    expect(datastreams.getDatastream.calledOnceWithExactly('record-a', latest, { username: 'alice' })).to.equal(true);
    expect(records.getAttachments.calledOnceWithExactly('record-a', undefined, { username: 'alice' })).to.equal(true);
    expect(sendResp.called).to.equal(false);
  });

  it('streams a matching historical PDF using the datastream ID as the default filename', async () => {
    params.datastreamId = historical;
    delete params.fileName;
    datastreams.getDatastream.resolves({ readstream: Readable.from(pdf) });
    await controller.getDataStream(req, res);
    await finished(res);
    expect(Buffer.concat(chunks)).to.deep.equal(pdf);
    expect(res.attachment.calledOnceWithExactly(historical)).to.equal(true);
    expect(datastreams.getDatastream.firstCall.args[1]).to.equal(historical);
    expect(sendResp.called).to.equal(false);
  });

  it('keeps stored legacy attachments downloadable without matching a generated filename pattern', async () => {
    params.datastreamId = 'legacy.txt';
    datastreams.getDatastream.resolves({ body: 'legacy bytes' });
    await controller.getDataStream(req, res);
    await finished(res);
    expect(Buffer.concat(chunks).toString()).to.equal('legacy bytes');
  });

  for (const id of ['dataset-pdf-record-b-200.pdf', 'dataset-pdf-record-a-absent.pdf', '../record-b/private.pdf']) {
    it(`returns 404 without retrieving bytes for a nonmember ID: ${id}`, async () => {
      params.datastreamId = id;
      await expectFailure(404);
      expect(datastreams.getDatastream.called).to.equal(false);
    });
  }

  it('returns 404 for a mismatch on AJAX requests as well', async () => {
    (controller as any).isAjax.returns(true);
    params.datastreamId = 'dataset-pdf-record-b-200.pdf';
    await expectFailure(404);
    expect(datastreams.getDatastream.called).to.equal(false);
  });

  for (const missing of [undefined, '', ['ambiguous.pdf']]) {
    it(`rejects an absent or ambiguous datastream ID: ${JSON.stringify(missing)}`, async () => {
      params.datastreamId = missing;
      await expectFailure(400);
      expect(datastreams.getDatastream.called).to.equal(false);
    });
  }

  it('returns a usable 400 JSON response to API v2 clients with an omitted ID', async () => {
    req.headers = { 'x-redbox-api-version': '2.0' };
    delete params.datastreamId;
    await expectFailure(400);
    expect(res.json.firstCall.args[0].errors).to.have.length(1);
  });

  it('rejects a missing OID without querying records or storage', async () => {
    delete params.oid;
    await expectFailure(400);
    expect(records.getMeta.called).to.equal(false);
    expect(records.getAttachments.called).to.equal(false);
    expect(datastreams.getDatastream.called).to.equal(false);
  });

  for (const missing of [null, undefined, {}]) {
    it(`returns 404 for a missing record: ${JSON.stringify(missing)}`, async () => {
      records.getMeta.resolves(missing);
      await expectFailure(404);
      expect(records.hasViewAccess.called).to.equal(false);
      expect(records.getAttachments.called).to.equal(false);
      expect(datastreams.getDatastream.called).to.equal(false);
    });
  }

  it('does not disclose membership or download bytes when view access is denied', async () => {
    records.hasViewAccess.returns(false);
    await expectFailure(403);
    expect(records.getAttachments.called).to.equal(false);
    expect(datastreams.getDatastream.called).to.equal(false);
  });

  it('checks view access before validating a missing datastream ID', async () => {
    records.hasViewAccess.returns(false);
    delete params.datastreamId;
    await expectFailure(403);
    expect(records.getAttachments.called).to.equal(false);
  });

  it('returns 404 for a record in another brand before listing its files', async () => {
    records.getMeta.resolves({ redboxOid: 'record-a', metaMetadata: { brandId: 'brand-b' } });
    await expectFailure(404);
    expect(records.hasViewAccess.called).to.equal(false);
    expect(records.getAttachments.called).to.equal(false);
    expect(datastreams.getDatastream.called).to.equal(false);
  });

  it('retains the translated attachment-not-found contract without download headers', async () => {
    datastreams.getDatastream.rejects(new Error('attachment-not-found'));
    await expectFailure(404);
  });

  for (const operation of ['getMeta', 'getAttachments', 'getDatastream']) {
    it(`returns 500 for an unexpected ${operation} failure without PDF headers`, async () => {
      (operation === 'getDatastream' ? datastreams : records)[operation].rejects(new Error('storage unavailable'));
      await expectFailure(500);
    });
  }
});
