import { expect } from 'chai';
import * as sinon from 'sinon';
import { Readable, Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { mountDatastreamReadRoutes } from '../../src/http/express/datastreamReads';
import * as policies from '../../src/http/express/policies';
import * as middleware from '../../src/http/express/middleware';

describe('RecordController datastream downloads', () => {
  let controller: any;
  let req: any;
  let res: any;
  let sendResp: sinon.SinonSpy;
  let records: any;
  let datastreams: any;
  let params: Record<string, unknown>;
  let chunks: Buffer[];
  const latest = 'dataset-pdf-record-a-200.pdf';
  const historical = 'dataset-pdf-record-a-100.pdf';
  const pdf = Buffer.from('%PDF-1.7\nrecord a\n');

  beforeEach(() => {
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
    let handler: any;
    sinon.stub(middleware, 'httpAction').callsFake(action => action as any);
    sinon.stub(policies, 'requestContext').returns({ actor: { id: 'alice-id', username: 'alice', roles: [] }, brand: { id: 'brand-a' } } as any);
    mountDatastreamReadRoutes({ get: (path, ...handlers) => { if (path.includes('datastream{')) handler = handlers.at(-1); } } as any,
      { records, datastream: datastreams, policies: {}, policyConfiguration: { '*': true }, log: { error: sinon.stub() } as any });
    controller = { getDataStream: (...args) => handler(...args), isAjax: sinon.stub().returns(false) };
    params = { oid: 'record-a', datastreamId: latest, fileName: 'datarecord.pdf' };
    req = {
      get params() { return { oid: params.oid }; },
      get query() { return { datastreamId: params.datastreamId, fileName: params.fileName }; },
      get: () => controller.isAjax() ? 'jsclient' : undefined,
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
    res.set = sinon.stub().returnsThis();
    res.attachment = sinon.stub();
    res.status = sinon.stub().returns(res);
    res.json = sinon.stub().returns(res);
    sendResp = res.json;
  });

  afterEach(() => {
    sinon.restore();
  });

  async function expectFailure(status: number) {
    await controller.getDataStream(req, res);
    expect(sendResp.calledOnce).to.equal(true);
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
    expect(datastreams.getDatastream.calledOnceWithExactly('record-a', latest, { username: 'alice', actorId: 'alice-id', brandId: 'brand-a' })).to.equal(true);
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

  for (const fileName of [['a.pdf', 'b.pdf'], { name: 'a.pdf' }, 42]) {
    it(`rejects a nonscalar filename before opening storage: ${JSON.stringify(fileName)}`, async () => {
      params.fileName = fileName;
      await expectFailure(400);
      expect(records.getAttachments.called).to.equal(false);
      expect(datastreams.getDatastream.called).to.equal(false);
    });
  }

  for (const method of ['set', 'attachment']) {
    it(`destroys an opened storage stream if ${method} throws before piping`, async () => {
      const source = new Readable({ read() {} });
      datastreams.getDatastream.resolves({ readstream: source });
      res[method].onFirstCall().throws(new Error('invalid response header'));
      await controller.getDataStream(req, res);
      expect(source.destroyed).to.equal(true);
      expect(Buffer.concat(chunks).length).to.equal(0);
      expect(sendResp.calledOnce).to.equal(true);
      expect(res.status.lastCall.args[0]).to.equal(500);
      expect(res.json.calledOnce).to.equal(true);
    });
  }

  it('drains a legacy storage stream without destroy if header setup fails', async () => {
    const source = { resume: sinon.stub() };
    datastreams.getDatastream.resolves({ readstream: source });
    res.attachment.throws(new Error('invalid response header'));
    await controller.getDataStream(req, res);
    expect(source.resume.calledOnce).to.equal(true);
    expect(res.status.lastCall.args[0]).to.equal(500);
  });

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
