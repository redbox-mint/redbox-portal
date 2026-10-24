import * as sinon from 'sinon';
import { of } from 'rxjs';
import { httpRecordReadsFixture } from '../helpers/httpRecordReadsFixture';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';
import { FormProjection } from '../../src/forms/FormProjection';
import { dataRecordProjectedMetadata, dataRecordProjectionForm } from '../fixtures/metadata-projection.fixtures';
let expect: Chai.ExpectStatic;
before(async () => {
  expect = (await import('chai')).expect;
});
describe('Owned browser record reads', function () {
  let f: Awaited<ReturnType<typeof httpRecordReadsFixture>>;
  const base = '/default/portal';
  const record = () => ({
    redboxOid: 'oid-1',
    revision: 3,
    metaMetadata: { brandId: 'brand-1' },
    metadata: { title: 'Current' },
    authorization: { view: ['alice'], edit: ['alice'] },
  });
  beforeEach(async () => {
    f = await httpRecordReadsFixture();
    f.storage.getMeta.resolves(record());
  });
  afterEach(async () => {
    await f?.close();
    sinon.restore();
  });
  for (const missing of ['oid', 'brand', 'brand ID'])
    it(`returns serializable404 before deleted lookup without ${missing}`, async function () {
      if (missing !== 'oid') f.getBrand.resolves(missing === 'brand' ? undefined : {});
      const response = await f.request(base + '/record/delete' + (missing === 'oid' ? '' : '/deleted-oid'));
      expect(response.status).to.equal(404);
      expect(f.storage.getTombstone.called).to.equal(false);
    });
  for (const version of ['1.0', '2.0']) {
    it(`returns serializable404 for purged deleted records (${version})`, async function () {
      f.storage.getTombstone.resolves(null);
      const response = await f.request(base + '/record/delete/purged-oid?apiVersion=' + version);
      expect(response.status).to.equal(404);
      expect(f.forms.buildClientFormConfig.called).to.equal(false);
    });
    it(`refuses deleted metadata without current permission (${version})`, async function () {
      f.storage.getTombstone.resolves({
        revision: 3,
        deletedRecordMetadata: { ...record(), authorization: {}, metadata: { secret: 'private-deleted-value' } },
      });
      const response = await f.request(base + '/record/delete/deleted-oid?apiVersion=' + version);
      expect(response.status).to.equal(403);
      expect(response.text).not.to.include('private-deleted-value');
      expect(f.forms.getFormByName.called).to.equal(false);
    });
  }
  it('returns resolved browser permission summary after view authorization', async function () {
    f.audit.getResolvedPermissionsSummary.resolves({ edit: true, view: true });
    const response = await f.request(base + '/record/oid-1/permissions?apiVersion=2.0');
    expect(response.status).to.equal(200);
    expect(f.audit.getResolvedPermissionsSummary.calledOnceWithExactly('oid-1')).to.equal(true);
    expect(response.body.data).to.deep.equal({ edit: true, view: true });
  });
  it('returns revision metadata and strong tag for authorized browser reads', async function () {
    const response = await f.request(base + '/record/metadata/oid-1?apiVersion=2.0');
    expect(response.status).to.equal(200);
    expect(response.body).to.deep.equal({
      data: record().metadata,
      meta: { oid: 'oid-1', revision: 3, entityTag: formatRecordEntityTag('oid-1', 3) },
    });
    expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('oid-1', 3));
  });
  function prepareProjection() {
    const data = {
      ...record(),
      redboxOid: 'representative-data-record',
      metaMetadata: { type: 'dataRecord', form: dataRecordProjectionForm.name, brandId: 'brand-1' },
      metadata: { ...dataRecordProjectedMetadata, serverOnly: { credentials: 'hidden' } },
    };
    f.storage.getMeta.resolves(data);
    f.forms.getFormByName.returns(of({ configuration: dataRecordProjectionForm }));
    f.forms.buildClientFormConfig.resolves(dataRecordProjectionForm);
    return data;
  }
  it('projects Data Locations and Data Manager with the actual projection and HTTP response', async function () {
    prepareProjection();
    const response = await f.request(base + '/record/metadata/representative-data-record');
    expect(response.status).to.equal(200);
    expect(response.body).to.deep.equal(dataRecordProjectedMetadata);
    expect(f.forms.buildClientFormConfig.firstCall.args.slice(1, 3)).to.deep.equal(['edit', ['Admin']]);
  });
  it('does not build a client form when current view access is denied', async function () {
    const data = prepareProjection();
    data.authorization = { view: [], edit: [] };
    const response = await f.request(base + '/record/metadata/representative-data-record');
    expect(response.status).to.equal(403);
    expect(f.forms.buildClientFormConfig.called).to.equal(false);
    expect(response.text).not.to.include('serverOnly');
  });
  it('never discloses raw metadata after projection failure', async function () {
    prepareProjection();
    sinon
      .stub(FormProjection.prototype, 'projectMetadataClientFormConfig')
      .rejects(new Error('Invalid form schema PRIVATE'));
    const response = await f.request(base + '/record/metadata/representative-data-record');
    expect(response.status).to.equal(500);
    expect(response.text).not.to.include('serverOnly');
    expect(response.text).not.to.include('PRIVATE');
  });
  it('refuses resolved permissions without view access', async function () {
    f.storage.getMeta.resolves({ ...record(), authorization: {} });
    const response = await f.request(base + '/record/oid-1/permissions');
    expect(response.status).to.equal(403);
    expect(f.audit.getResolvedPermissionsSummary.called).to.equal(false);
  });
  it('returns404 for missing permission record metadata', async function () {
    f.storage.getMeta.resolves(null);
    expect((await f.request(base + '/record/oid-1/permissions')).status).to.equal(404);
  });
  for (const deleted of [false, true])
    it(`retains authoritative revision on ${deleted ? 'deleted' : 'actionable'} browser list rows`, async function () {
      const value = deleted
        ? {
            redboxOid: 'oid-1',
            revision: 12,
            deletedRecordMetadata: { metadata: { title: 'Deleted record' } },
            dateDeleted: '2026-01-03T00:00:00Z',
          }
        : { ...record(), revision: 11, dateCreated: '2026-01-01T00:00:00Z', lastSaveDate: '2026-01-02T00:00:00Z' };
      const storage = deleted ? f.storage.getDeletedRecords : f.storage.getRecords;
      storage.resolves({ isSuccessful: () => true, totalItems: 1, items: [value] });
      const response = await f.request(
        base + (deleted ? '/listDeletedRecords' : '/listRecords') + '?recordType=dataset'
      );
      expect(response.status).to.equal(200);
      expect(response.body.items[0]).to.include({ oid: 'oid-1', revision: deleted ? 12 : 11 });
      if (!deleted) expect(response.body.items[0].hasEditAccess).to.equal(true);
    });
  it('builds effective client forms using the current record brand and role context', async function () {
    const data = { ...record(), metaMetadata: { brandId: 'brand-1', form: 'form-1' } };
    f.storage.getMeta.resolves(data);
    const configuration = dataRecordProjectionForm;
    f.forms.getFormByName.returns(of({ configuration }));
    f.forms.buildClientFormConfig.resolves(configuration);
    const response = await f.request(base + '/record/metadata/oid-1');
    expect(response.status).to.equal(200);
    expect(f.forms.getFormByName.calledOnceWithExactly('form-1', true, 'brand-1')).to.equal(true);
    const args = f.forms.buildClientFormConfig.firstCall.args;
    expect(args[0]).to.equal(configuration);
    expect(args[1]).to.equal('edit');
    expect(args[2]).to.deep.equal(['Admin']);
    expect(args[3]).to.equal(data.metadata);
    expect(args[5]).to.equal('default');
    expect(args[7].brand.id).to.equal('brand-1');
    expect(args[7].user.username).to.equal('alice');
  });
});
