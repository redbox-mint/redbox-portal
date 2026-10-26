import * as sinon from 'sinon';
import { of } from 'rxjs';
import { httpRecordPagesFixture } from '../helpers/httpRecordPagesFixture';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';
let expect: Chai.ExpectStatic;
before(async () => {
  expect = (await import('chai')).expect;
});
describe('Owned record browser form delivery', function () {
  let f: Awaited<ReturnType<typeof httpRecordPagesFixture>>;
  const base = '/default/portal';
  beforeEach(async () => {
    f = await httpRecordPagesFixture();
  });
  afterEach(async () => {
    await f?.close();
    sinon.restore();
  });
  for (const version of ['1.0', '2.0'])
    for (const edit of ['true', 'false']) {
      const query = `?apiVersion=${version}&edit=${edit}`;
      it(`returns missing form record404 (${version},edit=${edit})`, async function () {
        f.loadRecord.resolves(undefined);
        const response = await f.request(base + '/record/form/auto/deleted-oid' + query);
        expect(response.status).to.equal(404);
        expect(version === '1.0' ? response.body.message : response.body.errors[0].code).to.equal('missing-record');
        expect(f.delivery.canView.called).to.equal(false);
        expect(f.delivery.canEdit.called).to.equal(false);
      });
      it(`rechecks disappearing records after ${edit === 'true' ? 'edit' : 'view'} page (${version})`, async function () {
        f.loadRecord.onSecondCall().resolves(undefined);
        const page = await f.request(base + '/record/' + (edit === 'true' ? 'edit' : 'view') + '/oid-1', {
          headers: { Accept: 'text/html' },
        });
        expect(page.status).to.equal(200);
        const response = await f.request(base + '/record/form/auto/oid-1' + query);
        expect(response.status).to.equal(404);
        expect(version === '1.0' ? response.body.message : response.body.errors[0].code).to.equal('missing-record');
        expect(f.loadRecord.calledTwice).to.equal(true);
        expect(f.forms.getForm.called).to.equal(false);
        expect(f.delivery.canEdit.called).to.equal(false);
        expect(f.delivery.canView.called).to.equal(false);
      });
      for (const lookup of ['record', 'form'])
        it(`keeps ${lookup} code500 as an operational failure (${version},edit=${edit})`, async function () {
          const failure = { error: { code: 500 }, message: 'Storage unavailable PRIVATE' };
          if (lookup === 'record') f.loadRecord.rejects(failure);
          else f.forms.getForm.rejects(failure);
          const response = await f.request(base + '/record/form/auto/oid-1' + query);
          expect(response.status).to.equal(500);
          expect(response.text).not.to.include('missing-record');
          expect(response.text).not.to.include('PRIVATE');
          expect(f.forms.discoverValidationOperations.called).to.equal(false);
        });
      it(`retains existing form permission error (${version},edit=${edit})`, async function () {
        const permission = edit === 'true' ? f.delivery.canEdit : f.delivery.canView;
        permission.resolves(false);
        const response = await f.request(base + '/record/form/auto/oid-1' + query);
        expect(response.status).to.equal(500);
        expect(version === '1.0' ? response.body.message : response.body.errors[0].code).to.equal(
          'view-error-no-permissions'
        );
        expect(permission.calledOnce).to.equal(true);
        expect(f.forms.getForm.called).to.equal(false);
      });
    }
  it('returns a stable W04 fingerprint for a create based on its starting workflow', async function () {
    const response = await f.request(base + '/record/form/rdmp?edit=true&apiVersion=2.0');
    expect(response.status).to.equal(200);
    expect(response.body.meta).to.include({ formFingerprint: 'form-fingerprint-1', recordType: 'rdmp', oid: null });
    const args = f.delivery.fingerprint.firstCall.args;
    expect(args[0]).to.deep.equal({
      metaMetadata: { brandId: 'brand-1', type: 'rdmp', form: 'saved-form' },
      workflow: { stage: 'draft' },
    });
    expect(args[1]).to.deep.equal({ name: 'rdmp' });
    expect(args[2]).to.equal(f.form);
  });
  it('fingerprints the authoritative delivered form independently of target intent', async function () {
    f.delivery.fingerprint.resolves('form-fingerprint-2');
    const response = await f.request(
      base + '/record/form/rdmp/oid-1?edit=true&targetStep=published&formName=saved-form&apiVersion=2.0'
    );
    expect(response.status).to.equal(200);
    const args = f.delivery.fingerprint.firstCall.args;
    expect(args[0]).to.equal(f.record);
    expect(args[1]).to.deep.equal({ name: 'rdmp' });
    expect(args[2]).to.equal(f.form);
    expect(response.body.meta).to.include({
      formFingerprint: 'form-fingerprint-2',
      revision: 3,
      entityTag: formatRecordEntityTag('oid-1', 3),
    });
    expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('oid-1', 3));
    expect(f.forms.discoverValidationOperations.firstCall.args[0].targetStep).to.equal('published');
  });
  it('rejects caller-selected form drift before form loading or fingerprinting', async function () {
    const response = await f.request(
      base + '/record/form/rdmp/oid-1?edit=true&formName=client-selected&apiVersion=2.0'
    );
    expect(response.status).to.equal(409);
    expect(response.body).to.deep.equal({ errors: [{ code: 'form-definition-changed' }], meta: {} });
    expect(f.forms.getForm.called).to.equal(false);
    expect(f.delivery.fingerprint.called).to.equal(false);
  });
  it('rejects missing form configuration before operation discovery', async function () {
    f.forms.getFormByStartingWorkflowStep.returns(of({ name: 'saved-form', configuration: null }));
    const response = await f.request(base + '/record/form/rdmp?edit=true&formName=saved-form');
    expect(response.status).to.equal(500);
    expect(response.body.message).to.equal(
      'Form configuration not found for form saved-form, record type rdmp, oid null'
    );
    expect(f.forms.buildClientFormConfig.called).to.equal(false);
    expect(f.forms.discoverValidationOperations.called).to.equal(false);
  });
});
