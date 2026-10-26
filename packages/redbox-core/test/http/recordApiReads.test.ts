import * as sinon from 'sinon';
import { httpRecordReadsFixture } from '../helpers/httpRecordReadsFixture';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';
let expect: Chai.ExpectStatic;
before(async () => {
  expect = (await import('chai')).expect;
});

describe('Owned record API read contracts', function () {
  let f: Awaited<ReturnType<typeof httpRecordReadsFixture>>;
  const record = () => ({
    redboxOid: 'oid-1',
    revision: 2,
    metaMetadata: { brandId: 'brand-1' },
    metadata: { title: 'Visible metadata' },
    authorization: { view: ['alice'] },
  });
  const headers = { 'X-ReDBox-Api-Version': '2.0' };
  const base = '/default/portal/api/records';
  beforeEach(async () => {
    f = await httpRecordReadsFixture();
    f.storage.getMeta.resolves(record());
    f.schemas.resolveUpdate.resolves({ kind: 'disabled' });
  });
  afterEach(async () => {
    await f?.close();
    sinon.restore();
  });
  it('returns metadata only with its owned revision when relationships are omitted', async function () {
    const response = await f.request(base + '/metadata/oid-1', { headers });
    expect(response.status).to.equal(200);
    expect(f.storage.getMeta.calledOnceWithExactly('oid-1')).to.equal(true);
    expect(f.storage.getRelatedRecords.called).to.equal(false);
    expect(response.body).to.deep.equal({
      data: record().metadata,
      meta: { oid: 'oid-1', revision: 2, entityTag: formatRecordEntityTag('oid-1', 2) },
    });
    expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('oid-1', 2));
  });
  it('adds caller-effective schema discovery without changing metadata', async function () {
    const digest = 'c'.repeat(64);
    f.schemas.resolveUpdate.resolves({ kind: 'resolved', digest });
    const response = await f.request(base + '/metadata/oid-1', { headers });
    expect(response.status).to.equal(200);
    const request = f.schemas.resolveUpdate.firstCall.args[0];
    expect(request).to.include({ brand: 'brand-1', branding: 'default', portal: 'portal', oid: 'oid-1' });
    expect(request.caller.brand.id).to.equal('brand-1');
    expect(request.caller.user.username).to.equal('alice');
    expect(response.headers.get('Link')).to.equal(
      `</default/portal/api/records/schemas/${digest}>; rel="describedby"; type="application/schema+json"`
    );
    expect(response.body.data).to.deep.equal(record().metadata);
    expect(JSON.stringify(response.body)).not.to.include(digest);
  });
  it('omits discovery and private diagnostics when update context is forbidden', async function () {
    f.schemas.resolveUpdate.resolves({
      kind: 'context-failed',
      failureKind: 'forbidden',
      diagnosticCodes: ['private-field-name'],
    });
    const response = await f.request(base + '/metadata/oid-1', { headers });
    expect(response.status).to.equal(200);
    expect(response.headers.get('Link')).to.equal(null);
    expect(response.body.data).to.deep.equal(record().metadata);
    expect(response.text).not.to.include('private-field-name');
  });
  it('returns permissions only after current view authorization', async function () {
    const response = await f.request(base + '/permissions/oid-1', { headers });
    expect(response.status).to.equal(200);
    expect(response.body.data).to.deep.equal(record().authorization);
    expect(response.body.meta).to.include({ revision: 2, entityTag: formatRecordEntityTag('oid-1', 2) });
    expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('oid-1', 2));
  });
  it('refuses permissions with no view grant', async function () {
    f.storage.getMeta.resolves({ ...record(), authorization: {}, metadata: { secret: 'must-not-return' } });
    const response = await f.request(base + '/permissions/oid-1', { headers });
    expect(response.status).to.equal(403);
    expect(response.text).not.to.include('must-not-return');
    expect(response.headers.get('ETag')).to.equal(null);
  });
  it('returns missing-record 404 for permission reads', async function () {
    f.storage.getMeta.resolves(null);
    expect((await f.request(base + '/permissions/oid-1', { headers })).status).to.equal(404);
  });
  it('filters relationship nodes and edges with actual grants', async function () {
    const root = record(),
      visible = { ...record(), redboxOid: 'oid-2', title: 'Visible' },
      hidden = { ...record(), redboxOid: 'oid-3', title: 'Hidden', authorization: { view: [] } };
    f.storage.getRelatedRecords.resolves({
      rootOid: 'oid-1',
      relatedObjects: { dataset: [root, visible, hidden] },
      edges: [
        { sourceOid: 'oid-1', relationId: 'rel-1', targetOid: 'oid-2' },
        { sourceOid: 'oid-1', relationId: 'rel-2', targetOid: 'oid-3' },
      ],
      omittedByAccess: {},
    });
    const response = await f.request(
      base +
        '/metadata/oid-1?include=relationships&relationshipDepth=2&relationshipIds=rel-1,%20rel-2&recordTypes=dataset,publication&fields=summary',
      { headers }
    );
    expect(response.status).to.equal(200);
    expect(f.storage.getRelatedRecords.firstCall.args[2]).to.deep.equal({
      depth: 2,
      includeRelationIds: ['rel-1', 'rel-2'],
      includeRecordTypes: ['dataset', 'publication'],
      fields: 'summary',
    });
    expect(response.body.data).to.deep.equal({
      metadata: root.metadata,
      relationships: {
        rootOid: 'oid-1',
        relatedObjects: { dataset: [root, visible] },
        edges: [{ sourceOid: 'oid-1', relationId: 'rel-1', targetOid: 'oid-2' }],
        omittedByAccess: { 'rel-2': 1 },
      },
    });
    expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('oid-1', 2));
  });
  it('returns an authorized tombstone with lifecycle revision and only safe operation fields', async function () {
    f.storage.getTombstone.resolves({
      deletedRecordMetadata: record(),
      revision: 9,
      lifecycleState: 'recovery-required',
      lifecycleOperation: {
        kind: 'delete',
        attempts: 2,
        startedAt: '2026-08-24T00:00:00.000Z',
        updatedAt: '2026-08-24T00:00:01.000Z',
        errorCode: 'active-removal-unknown',
        requestId: 'PRIVATE',
      },
    });
    const response = await f.request('/default/portal/api/deletedrecords/oid-1', { headers });
    expect(response.status).to.equal(200);
    expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('oid-1', 9));
    expect(response.body.meta).to.include({ oid: 'oid-1', revision: 9, lifecycleState: 'recovery-required' });
    expect(response.body.meta.lifecycle).to.deep.equal({
      kind: 'delete',
      attempts: 2,
      startedAt: '2026-08-24T00:00:00.000Z',
      updatedAt: '2026-08-24T00:00:01.000Z',
      errorCode: 'active-removal-unknown',
    });
    expect(response.text).not.to.include('PRIVATE');
  });
});
