import * as sinon from 'sinon';
import { of } from 'rxjs';
import { httpRecordMutationsFixture } from '../helpers/httpRecordMutationsFixture';
import { RecordSaveResponse, isRecordSaveContext } from '../../src/RecordSaveResponse';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';
import { FormProjection } from '../../src/forms/FormProjection';
import { dataRecordProjectionForm, dataRecordProjectedMetadata } from '../fixtures/metadata-projection.fixtures';
let expect: Chai.ExpectStatic;
before(async () => {
  expect = (await import('chai')).expect;
});
describe('Owned browser record mutations', function () {
  let f: Awaited<ReturnType<typeof httpRecordMutationsFixture>>;
  const base = '/default/portal',
    headers = { 'X-ReDBox-Api-Version': '2.0' };
  const request = (body: unknown = {}, extra: Record<string, string> = {}, query = '') =>
    f.request(base + '/recordmeta/record-1' + query, { method: 'PUT', headers: { ...headers, ...extra }, body });
  const tags = {
    'If-Match': formatRecordEntityTag('record-1', 3),
    'X-ReDBox-Form-Fingerprint': 'current-form-fingerprint',
  };
  function failure(kind: 'conflict' | 'validation' = 'conflict', code = 'record-revision-stale') {
    const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000013');
    result.outcome = 'not-saved';
    result.problems = [{ kind, phase: 'pre-save', issues: [{ code, message: '@' + code }] }];
    return result;
  }
  beforeEach(async () => {
    f = await httpRecordMutationsFixture();
    f.forms.getFormByName.returns(of({ configuration: dataRecordProjectionForm }));
    f.forms.buildClientFormConfig.resolves(dataRecordProjectionForm);
  });
  afterEach(async () => {
    await f?.close();
    sinon.restore();
  });
  it('uses only query operation and route intent for trusted validation context', async function () {
    const body = {
      operation: 'body-operation',
      portal: 'forged-body-portal',
      targetStep: 'body-step',
      validationBypass: { mode: 'bypass' },
      schemaOperation: 'forged-operation',
      ifMatch: '"sha256:' + 'b'.repeat(64) + '"',
      schemaOutcome: { digest: 'b'.repeat(64) },
    };
    const response = await f.request(base + '/record/workflow/step/route-step/record-1?operation=%20submit%20', {
      method: 'POST',
      headers: { ...headers, ...tags },
      body,
    });
    expect(response.status).to.equal(200);
    const context = f.records.updateMeta.firstCall.args[8];
    expect(isRecordSaveContext(context)).to.equal(true);
    expect(context).to.include({
      operation: 'transition',
      validationOperation: 'submit',
      schemaOperation: 'submit',
      portal: 'portal',
      targetStep: 'route-step',
    });
    expect(context.ifMatch).to.equal(undefined);
    expect(context.validationBypass).to.equal(undefined);
    expect(context).not.to.have.property('schemaOutcome');
    expect(context.validationRequestParameters).to.deep.equal({ targetStep: 'route-step' });
    f.records.updateMeta.resetHistory();
    expect((await request({}, {}, '?operation=bad%20operation')).status).to.equal(400);
    expect(f.records.updateMeta.called).to.equal(false);
  });
  it('keeps the literal v1 save failure while exposing typed v2 problems', async function () {
    for (const version of ['1.0', '2.0']) {
      f.records.updateMeta.resolves(failure('validation', 'validation-failed'));
      const response = await request({}, { 'X-ReDBox-Api-Version': version });
      expect(response.status).to.equal(version === '1.0' ? 500 : 400);
      if (version === '1.0') expect(response.body).to.deep.equal({ message: 'Failed to get record data' });
      else expect(response.body.errors).to.deep.equal([{ code: 'validation-failed', title: '@validation-failed' }]);
    }
  });
  it('normalizes tags, form fingerprints and fresh resolution linkage once', async function () {
    const requestId = '00000000-0000-4000-8000-000000000011',
      prior = '00000000-0000-4000-8000-000000000012';
    const response = await request(
      {},
      {
        ...tags,
        'X-ReDBox-Save-Request-Id': requestId,
        'X-ReDBox-Concurrency-Resolution': 'client-manually-resolved',
        'X-ReDBox-Resolution-Of-Request-Id': prior,
      }
    );
    expect(response.status).to.equal(200);
    const context = f.records.updateMeta.firstCall.args[8];
    expect(context.requestId).to.equal(requestId);
    expect(context.concurrency).to.deep.equal({
      entityTagSupplied: true,
      expectedRevision: 3,
      formFingerprint: 'current-form-fingerprint',
      resolution: 'client-manually-resolved',
      resolutionOfRequestId: prior,
    });
    expect((await request({}, { 'If-Match': 'W/' + tags['If-Match'] })).status).to.equal(400);
  });
  it('maps certified concurrency refusals and unknown outcomes without status inference', async function () {
    for (const [code, status] of [
      ['record-precondition-required', 428],
      ['record-revision-stale', 412],
      ['form-definition-changed', 409],
    ] as const) {
      const result = failure('conflict', code);
      result.setConcurrencyMetadata({
        revision: 3,
        currentRevision: 3,
        entityTag: formatRecordEntityTag('record-1', 3),
      });
      f.records.updateMeta.resolves(result);
      const response = await request();
      expect(response.status).to.equal(status);
      expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('record-1', 3));
      expect(response.body.errors).to.deep.equal([{ code, title: '@' + code }]);
      expect(response.body.meta.outcome).to.equal('not-saved');
    }
    const unknown = new RecordSaveResponse('00000000-0000-4000-8000-000000000014');
    unknown.outcome = 'unknown';
    f.records.updateMeta.resolves(unknown);
    expect((await request()).status).to.equal(500);
  });
  it('projects latest conflicts only while current view permission remains', async function () {
    const result = failure();
    result.setProjectedMetadata({ attackerCandidate: 'must-not-return' });
    f.record.revision = 4;
    f.record.metadata = { title: 'Latest', hidden: 'must-not-return' } as any;
    const visibleForm = {
      name: 'safe-view',
      componentDefinitions: [
        {
          name: 'title',
          constraints: { allowModes: ['view', 'edit'] },
          component: { class: 'SimpleInputComponent' },
          model: { class: 'SimpleInputModel', config: {} },
        },
      ],
    };
    f.forms.getFormByName.returns(of({ configuration: visibleForm }));
    f.forms.buildClientFormConfig.resolves(visibleForm);
    f.records.updateMeta.resolves(result);
    f.records.hasEditAccess.onFirstCall().returns(true);
    f.records.hasEditAccess.onSecondCall().returns(false);
    f.records.hasEditAccess.onThirdCall().returns(false);
    const response = await request({}, tags);
    expect(response.status).to.equal(403);
    expect(result.metadata).to.deep.equal({ title: 'Latest' });
    expect(result.oid).to.equal('record-1');
    expect(result.concurrency?.revision).to.equal(4);
    expect(f.forms.buildClientFormConfig.firstCall.args[1]).to.equal('view');
    expect(response.text).not.to.include('must-not-return');
    f.records.hasEditAccess.returns(true);
    f.records.hasViewAccess.returns(false);
    result.setProjectedMetadata({ attackerCandidate: 'must-not-return' });
    const revoked = await request();
    expect(revoked.status).to.equal(403);
    expect(result.metadata).to.equal(null);
    expect(result.concurrency).to.equal(undefined);
    expect(revoked.text).not.to.include('must-not-return');
  });
  it('never falls back to unrestricted conflict metadata when safe form projection is unavailable', async function () {
    const result = failure();
    result.setProjectedMetadata({ candidateSecret: true });
    f.record.revision = 5;
    f.record.metadata = { unrestrictedSecret: true } as any;
    f.forms.getFormByName.returns(of(undefined));
    f.records.updateMeta.resolves(result);
    const response = await request();
    expect(response.status).to.equal(412);
    expect(result.metadata).to.equal(null);
    expect(result.concurrency?.revision).to.equal(5);
    expect(response.text).not.to.include('unrestrictedSecret');
    expect(response.text).not.to.include('candidateSecret');
  });
  it('keeps browser lifecycle conflicts private after tombstone view revocation', async function () {
    const result = failure('conflict', 'record-lifecycle-operation-conflict');
    result.setProjectedMetadata({ staleDeletedValue: 'must-not-return' });
    result.setConcurrencyMetadata({ revision: 7, entityTag: formatRecordEntityTag('record-1', 7) });
    f.records.getMeta.resolves(null);
    f.records.hasViewAccess.returns(false);
    f.records.restoreRecord.resolves(result);
    const response = await f.request(base + '/record/delete/record-1', { method: 'PUT', headers, body: {} });
    expect(response.status).to.equal(403);
    expect(result.metadata).to.equal(null);
    expect(result.concurrency).to.equal(undefined);
    expect(response.text).not.to.include('must-not-return');
  });
  it('omits post-save projection when there is no record, a transition, no form, or syncing is disabled', async function () {
    for (const mode of ['missing', 'transition', 'no-form', 'disabled']) {
      f.forms.buildClientFormConfig.resetHistory();
      if (mode === 'missing') f.records.getMeta.onSecondCall().resolves(null);
      if (mode === 'no-form') f.record.metaMetadata.form = '';
      if (mode === 'disabled') f.settings.returnMetadataOnSave = false;
      const response =
        mode === 'transition'
          ? await f.request(base + '/record/workflow/step/next/record-1', { method: 'POST', headers, body: {} })
          : await request();
      expect(response.status).to.equal(200);
      expect(response.body.meta.metadata).to.equal(null);
      expect(f.forms.buildClientFormConfig.called).to.equal(false);
      f.records.getMeta.resetBehavior();
      f.records.getMeta.resolves(f.record);
      f.record.metaMetadata.form = 'dataset-form';
    }
  });
  it('projects post-save metadata and records safe projection failures', async function () {
    f.record.metadata = dataRecordProjectedMetadata as any;
    const success = await request();
    expect(success.status).to.equal(200);
    expect(success.body.meta.metadata).to.deep.equal(dataRecordProjectedMetadata);
    sinon
      .stub(FormProjection.prototype, 'projectMetadataClientFormConfig')
      .rejects(new Error('projection failed PRIVATE'));
    const response = await request();
    expect(response.status).to.equal(200);
    expect(response.body.meta.metadata).to.equal(null);
    expect(f.log.error.calledOnce).to.equal(true);
    expect(JSON.stringify(f.log.error.args)).not.to.include('PRIVATE');
  });
  it('routes browser stepTo through the authoritative transition save boundary without pre-mutation', async function () {
    Object.assign(f.record, { workflow: { stage: 'draft' } });
    const next = {
      name: 'review',
      config: {
        form: 'dataset-review',
        workflow: { stage: 'review' },
        authorization: { transitionRoles: ['Researcher'] },
      },
    };
    f.workflows.get.returns(of(next));
    const body = { title: 'After', targetStep: 'body-step', operation: 'body-operation' };
    const response = await f.request(base + '/record/workflow/step/review/record-1?operation=submit', {
      method: 'POST',
      headers: { ...tags },
      body,
    });
    expect(response.status).to.equal(200);
    const args = f.records.updateMeta.firstCall.args;
    expect(args[2]).to.equal(f.record);
    expect(args[4]).to.equal(true);
    expect(args[5]).to.equal(true);
    expect(args[6]).to.equal(next);
    expect(args[7]).to.deep.equal({ metadata: body, mode: 'replace', arrayMergeMode: 'replace' });
    expect((f.record as any).workflow.stage).to.equal('draft');
    expect(f.record.metaMetadata.form).to.equal('dataset-form');
    expect(args[8]).to.include({
      routeFamily: 'browser',
      operation: 'transition',
      targetStep: 'review',
      validationOperation: 'submit',
    });
    expect(args[8].validationRequestParameters).to.deep.equal({ targetStep: 'review' });
    expect(args[8].concurrency).to.deep.equal({
      entityTagSupplied: true,
      expectedRevision: 3,
      formFingerprint: 'current-form-fingerprint',
    });
    expect(response.body).to.deep.include({ success: true, oid: 'record-1', metadata: null });
  });
  it('keeps body metadata from initiating transitions or validation operations on update', async function () {
    const body = { title: 'After', targetStep: 'published', operation: 'publish' };
    const response = await request(body);
    expect(response.status).to.equal(200);
    expect(f.workflows.get.called).to.equal(false);
    const args = f.records.updateMeta.firstCall.args;
    expect(args[7]).to.deep.equal({ metadata: body, mode: 'replace', arrayMergeMode: 'replace' });
    expect(args[8]).to.include({ routeFamily: 'browser', operation: 'update' });
    expect(args[8].concurrency).to.deep.equal({ entityTagSupplied: false });
    expect(args[8].targetStep).to.equal(undefined);
    expect(args[8].validationOperation).to.equal(undefined);
    expect(args[8].validationRequestParameters).to.deep.equal({});
  });
  it('retains strict, stale and form-drift statuses on browser update', async function () {
    for (const [code, status, h] of [
      ['record-precondition-required', 428, {}],
      ['record-revision-stale', 412, tags],
      ['form-definition-changed', 409, { ...tags, 'X-ReDBox-Form-Fingerprint': 'old-form-fingerprint' }],
    ] as const) {
      f.records.updateMeta.resolves(failure('conflict', code));
      const response = await request({ title: 'Rejected' }, h);
      expect(response.status, code).to.equal(status);
      expect(response.body.meta.outcome).to.equal('not-saved');
      expect(f.records.updateMeta.lastCall.args[8].concurrency.entityTagSupplied).to.equal(
        code !== 'record-precondition-required'
      );
    }
  });
  it('rejects malformed and wildcard browser tags before record work', async function () {
    for (const tag of ['W/' + tags['If-Match'], '*']) {
      const response = await request({ title: 'Rejected' }, { 'If-Match': tag });
      expect(response.status).to.equal(400);
      expect(response.body).to.deep.equal({
        errors: [{ code: 'record-if-match-invalid', source: { header: 'If-Match' } }],
        meta: {},
      });
    }
    expect(f.records.getMeta.called).to.equal(false);
    expect(f.records.updateMeta.called).to.equal(false);
  });
  it('passes raw merge deltas with browser array replacement while preserving stored metadata', async function () {
    const stored = {
        retained: 'keep',
        nested: { retained: true, values: [{ id: 'stored-nested' }] },
        values: [{ id: 'stored' }],
      },
      body = { nested: { incoming: true, values: [{ id: 'incoming-nested' }] }, values: [{ id: 'incoming' }] };
    f.record.metadata = stored as any;
    const response = await request(body, {}, '?merge=true');
    expect(response.status).to.equal(200);
    expect(f.records.updateMeta.firstCall.args[7]).to.deep.equal({
      metadata: body,
      mode: 'merge',
      arrayMergeMode: 'replace',
    });
    expect(f.record.metadata).to.deep.equal(stored);
  });
  it('keeps create body metadata from initiating transitions', async function () {
    const body = { title: 'Created', targetStep: 'published', operation: 'publish' };
    const response = await f.request(base + '/recordmeta/dataset', { method: 'POST', headers, body });
    expect(response.status).to.equal(200);
    const args = f.records.create.firstCall.args;
    expect(args[6]).to.equal(undefined);
    expect(args[7]).to.include({ routeFamily: 'browser', operation: 'create' });
    expect(args[7].targetStep).to.equal(undefined);
    expect(args[7].validationOperation).to.equal(undefined);
    expect(args[7].validationRequestParameters).to.deep.equal({ recordType: 'dataset' });
  });
  it('returns safe missing, storage-failure and authorization outcomes on update and delete', async function () {
    for (const outcome of ['missing', 'storage', 'denied']) {
      if (outcome === 'missing') f.records.getMeta.resolves(null);
      else if (outcome === 'storage') f.records.getMeta.rejects(new Error('private lookup failure'));
      else {
        f.records.getMeta.resolves(f.record);
        f.records.hasEditAccess.returns(false);
      }
      const updated = await request({ title: 'Rejected' }),
        deleted = await f.request(base + '/record/delete/record-1', { method: 'DELETE', headers });
      expect(updated.status).to.equal(outcome === 'missing' ? 404 : outcome === 'storage' ? 500 : 403);
      expect(deleted.status).to.equal(updated.status);
      expect(updated.text + deleted.text).not.to.include('private lookup failure');
      expect(f.records.updateMeta.called).to.equal(false);
      expect(f.records.delete.called).to.equal(false);
    }
  });
  it('sanitizes unexpected update and transition failures and their logs', async function () {
    f.records.updateMeta.rejects(new Error('database password is secret'));
    const updated = await request(),
      transition = await f.request(base + '/record/workflow/step/review/record-1', {
        method: 'POST',
        headers,
        body: {},
      });
    expect(updated.status).to.equal(500);
    expect(transition.status).to.equal(500);
    expect(updated.text + transition.text + JSON.stringify(f.log.error.args)).not.to.include('database password');
  });
});
