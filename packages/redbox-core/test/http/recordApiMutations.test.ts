import assert from 'node:assert/strict';
import { of } from 'rxjs';
import * as sinon from 'sinon';
import { httpRecordMutationsFixture } from '../helpers/httpRecordMutationsFixture';
import type { RecordSchemaService } from '../../src';
import { isRecordSaveContext, type RecordSaveContext, RecordSaveResponse } from '../../src/RecordSaveResponse';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';
import { RECORD_SCHEMA_WRITE_PRECONDITION_HEADER } from '../../src/api-routes';
import { recordMutationRoutes } from '../../src/http/express/recordMutations';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
type PermissionCase = {
  name: string;
  method: string;
  body: Record<string, unknown>;
  initialAuthorization: Record<string, string[]>;
  expectedFields: Array<[string, string[]]>;
};
const wire = (value: unknown) => JSON.parse(JSON.stringify(value));
function successResult(oid = 'record-1') {
  const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000000');
  result.oid = oid;
  result.success = true;
  result.outcome = 'saved';
  return result;
}

function notSavedResult() {
  const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000099');
  result.success = false;
  result.outcome = 'not-saved';
  result.message = '@record-save-failed';
  return result;
}

function schemaAwareSuccessResult(
  oid: string,
  digest: string,
  immutableUrl = `/default/default/api/records/schemas/${digest}`
): RecordSaveResponse {
  const result = successResult(oid);
  result.message = 'Record saved';
  result.metadata = { title: 'Saved metadata' };
  result.setSchemaOutcome({
    digest,
    immutableUrl,
    completeness: 'complete',
    enforcement: 'shadow',
  });
  return result;
}

function resolvedUpdateSchema(
  digest: string
): Awaited<ReturnType<RecordSchemaService.Services.RecordSchema['resolveUpdate']>> {
  const context = {
    brand: 'brand-1',
    portal: 'tenant portal',
    kind: 'update' as const,
    recordType: 'dataset',
    workflowStep: 'draft',
    form: 'dataset-draft',
    operation: 'strict-all',
    unknownProperties: 'allow' as const,
    enforcement: 'shadow' as const,
  };
  return {
    kind: 'resolved',
    digest,
    document: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: `/brand-1/tenant%20portal/api/records/schemas/${digest}`,
      type: 'object',
      'x-redbox-contract-format': 'redbox-record-contract/1',
      'x-redbox-context': context,
      'x-redbox-completeness': 'complete',
      'x-redbox-validation': [],
      'x-redbox-diagnostics': [],
    },
    metadata: {
      schemaKind: 'update',
      contractFormat: 'redbox-record-contract/1',
      completeness: 'complete',
      byteLength: 1,
      etag: `"sha256:${digest}"`,
      context,
    },
    grant: {
      referenceKey: 'grant-update-read-discovery',
      digest,
      brand: 'brand-1',
      portal: 'tenant portal',
      recordType: 'dataset',
      operation: 'strict-all',
      kind: 'grant',
      schemaKind: 'update',
      oid: 'oid-1',
    },
  };
}

function expectedLegacySaveBody(result: RecordSaveResponse): Record<string, unknown> {
  return {
    success: result.success,
    oid: result.oid,
    message: result.message,
    data: result.data,
    metadata: result.metadata,
    details: result.details,
    totalItems: result.totalItems,
    items: result.items,
  };
}

function schemaPreconditionFailure(code: 'record-schema.precondition-failed' | 'record-schema.invalid-request') {
  const result = notSavedResult();
  result.problems = [
    {
      kind: 'validation',
      source: 'schema',
      phase: 'schema',
      issues: [{ code, message: `@${code}` }],
    },
  ];
  return result;
}

function requireRecordSaveContext(value: unknown): RecordSaveContext {
  assert.equal(isRecordSaveContext(value), true, 'Expected a trusted record save context.');
  if (!isRecordSaveContext(value)) throw new Error('Expected a trusted record save context.');
  return value;
}

function cloneAuthorization(authorization: Record<string, string[]>): Record<string, string[]> {
  return Object.keys(authorization).reduce(
    (acc, key) => {
      acc[key] = [...authorization[key]];
      return acc;
    },
    {} as Record<string, string[]>
  );
}

describe('Owned record API mutations', function () {
  let f: Awaited<ReturnType<typeof httpRecordMutationsFixture>>;
  const base = '/default/portal/api/records';
  const headers = (version = '2.0') => ({ 'X-ReDBox-Api-Version': version });
  beforeEach(async () => {
    f = await httpRecordMutationsFixture();
  });
  afterEach(async () => {
    await f?.close();
    sinon.restore();
  });
  describe('save response schema discovery', function () {
    it('builds successful create/update discovery from route context under a deployment root', async function () {
      await f.close();
      f = await httpRecordMutationsFixture('/redbox');
      f.getBrand.resolves({ id: 'brand-1', name: 'public-brand' });
      const updateDigest = 'a'.repeat(64),
        createDigest = 'b'.repeat(64),
        tag = `"sha256:${updateDigest}"`;
      f.records.updateMeta.callsFake(async (...args: unknown[]) => {
        expect(requireRecordSaveContext(args[8])).to.include({ portal: 'other', ifMatch: tag });
        return schemaAwareSuccessResult('record-1', updateDigest);
      });
      f.records.create.callsFake(async (...args: unknown[]) => {
        expect(requireRecordSaveContext(args[7]).portal).to.equal('other');
        return schemaAwareSuccessResult('created-record', createDigest);
      });
      const root = '/public-brand/other/api/records';
      const update = await f.request(root + '/metadata/record-1?merge=true', {
        method: 'PUT',
        headers: { ...headers(), [RECORD_SCHEMA_WRITE_PRECONDITION_HEADER]: tag },
        body: { title: 'Updated' },
      });
      expect(update.status).to.equal(200);
      expect(update.headers.get('Link')).to.equal(
        `</redbox/public-brand/other/api/records/schemas/${updateDigest}>; rel="describedby"; type="application/schema+json"`
      );
      expect(update.body.data.outcome).to.equal('saved');
      const create = await f.request(root + '/metadata/dataset', {
        method: 'POST',
        headers: headers(),
        body: { title: 'Created' },
      });
      expect(create.status).to.equal(201);
      expect(create.headers.get('Location')).to.equal(
        f.url + '/redbox/public-brand/other/api/records/metadata/created-record'
      );
      expect(create.headers.get('Link')).to.equal(
        `</redbox/public-brand/other/api/records/schemas/${createDigest}>; rel="describedby"; type="application/schema+json"`
      );
      expect(create.body.data.outcome).to.equal('saved');
    });
    for (const version of ['1.0', '2.0'])
      it(`adds exact create/update described-by links without changing ${version} bodies`, async function () {
        const updateDigest = 'a'.repeat(64),
          createDigest = 'b'.repeat(64);
        const updateResult = schemaAwareSuccessResult('record-1', updateDigest),
          createResult = schemaAwareSuccessResult('created-record', createDigest);
        updateResult.setConcurrencyMetadata({ revision: 3, entityTag: formatRecordEntityTag('record-1', 3) });
        createResult.setConcurrencyMetadata({ revision: 0, entityTag: formatRecordEntityTag('created-record', 0) });
        f.records.updateMeta.resolves(updateResult);
        f.records.create.resolves(createResult);
        const update = await f.request(base + '/metadata/record-1', {
          method: 'PUT',
          headers: headers(version),
          body: { title: 'Saved metadata' },
        });
        expect(update.status).to.equal(200);
        expect(update.headers.get('ETag')).to.equal(formatRecordEntityTag('record-1', 3));
        expect(update.headers.get('Link')).to.equal(
          `</default/portal/api/records/schemas/${updateDigest}>; rel="describedby"; type="application/schema+json"`
        );
        if (version === '1.0') {
          expect(update.body).to.deep.equal(wire(expectedLegacySaveBody(updateResult)));
          expect(update.text).not.to.contain(updateDigest);
        } else expect(update.body).to.deep.equal(wire({ data: updateResult, meta: { ...updateResult } }));
        const create = await f.request(base + '/metadata/dataset', {
          method: 'POST',
          headers: headers(version),
          body: { metadata: { title: 'Saved metadata' } },
        });
        expect(create.status).to.equal(201);
        expect(create.headers.get('ETag')).to.equal(formatRecordEntityTag('created-record', 0));
        expect(create.headers.get('Location')).to.equal(f.url + base + '/metadata/created-record');
        expect(create.headers.get('Link')).to.equal(
          `</default/portal/api/records/schemas/${createDigest}>; rel="describedby"; type="application/schema+json"`
        );
        if (version === '1.0') {
          expect(create.body).to.deep.equal(wire(expectedLegacySaveBody(createResult)));
          expect(create.text).not.to.contain(createDigest);
        } else expect(create.body).to.deep.equal(wire({ data: createResult, meta: { ...createResult } }));
      });
    it('keeps successful create/update headers unchanged when no schema outcome was resolved', async function () {
      f.records.create.resolves(successResult('created-record'));
      const update = await f.request(base + '/metadata/record-1', { method: 'PUT', body: {} });
      const create = await f.request(base + '/metadata/dataset', { method: 'POST', body: { metadata: {} } });
      expect(update.status).to.equal(200);
      expect(create.status).to.equal(201);
      expect(update.headers.get('Link')).to.equal(null);
      expect(create.headers.get('Link')).to.equal(null);
      expect(update.headers.get('ETag')).to.equal(null);
      expect(create.headers.get('Location')).to.equal(f.url + base + '/metadata/created-record');
    });
  });
  it('restores and permanently destroys deleted records in the active brand', async function () {
    const restore = await f.request('/default/portal/api/deletedrecords/record-1', { method: 'PUT', body: {} });
    const destroy = await f.request('/default/portal/api/deletedrecords/record-1', { method: 'DELETE' });
    expect(restore.status).to.equal(200);
    expect(destroy.status).to.equal(200);
    expect(f.records.getDeletedRecordMeta.callCount).to.equal(2);
    expect(f.records.getDeletedRecordMeta.firstCall.args[0]).to.equal('record-1');
    expect(f.records.getDeletedRecordMeta.firstCall.args[1]).to.include({ id: 'brand-1' });
    expect(f.records.restoreRecord.calledWith('record-1')).to.equal(true);
    expect(f.records.destroyDeletedRecord.calledWith('record-1')).to.equal(true);
  });
  it('does not mutate deleted records outside the active brand', async function () {
    f.records.getDeletedRecordMeta.resolves({
      ...f.record,
      metaMetadata: { ...f.record.metaMetadata, brandId: 'other' },
    });
    const response = await f.request('/default/portal/api/deletedrecords/record-1', { method: 'PUT', body: {} });
    expect(response.status).to.equal(404);
    expect(f.records.restoreRecord.called).to.equal(false);
  });
  describe('permission handlers', function () {
    const userPermissionCases: PermissionCase[] = [
      {
        name: 'addUserEdit',
        method: 'addUserEdit',
        body: { users: ['new-editor'], pendingUsers: ['queued-editor'] },
        initialAuthorization: {
          edit: ['existing-editor'],
          editPending: ['existing-editor-pending'],
          view: ['existing-view'],
          viewPending: ['existing-view-pending'],
        },
        expectedFields: [
          ['edit', ['existing-editor', 'new-editor']],
          ['editPending', ['existing-editor-pending', 'queued-editor']],
        ],
      },
      {
        name: 'addUserView',
        method: 'addUserView',
        body: { users: ['new-viewer'], pendingUsers: ['queued-viewer'] },
        initialAuthorization: {
          edit: ['existing-editor'],
          editPending: ['existing-editor-pending'],
          view: ['existing-view'],
          viewPending: ['existing-view-pending'],
        },
        expectedFields: [
          ['view', ['existing-view', 'new-viewer']],
          ['viewPending', ['existing-view-pending', 'queued-viewer']],
        ],
      },
      {
        name: 'removeUserEdit',
        method: 'removeUserEdit',
        body: { users: ['existing-editor'], pendingUsers: ['existing-editor-pending'] },
        initialAuthorization: {
          edit: ['existing-editor'],
          editPending: ['existing-editor-pending'],
          view: ['existing-view'],
          viewPending: ['existing-view-pending'],
        },
        expectedFields: [
          ['edit', []],
          ['editPending', []],
        ],
      },
      {
        name: 'removeUserView',
        method: 'removeUserView',
        body: { users: ['existing-view'], pendingUsers: ['existing-view-pending'] },
        initialAuthorization: {
          edit: ['existing-editor'],
          editPending: ['existing-editor-pending'],
          view: ['existing-view'],
          viewPending: ['existing-view-pending'],
        },
        expectedFields: [
          ['view', []],
          ['viewPending', []],
        ],
      },
    ];

    const rolePermissionCases: PermissionCase[] = [
      {
        name: 'addRoleEdit',
        method: 'addRoleEdit',
        body: { roles: ['new-edit-role'] },
        initialAuthorization: {
          editRoles: ['existing-edit-role'],
          viewRoles: ['existing-view-role'],
        },
        expectedFields: [['editRoles', ['existing-edit-role', 'new-edit-role']]],
      },
      {
        name: 'addRoleView',
        method: 'addRoleView',
        body: { roles: ['new-view-role'] },
        initialAuthorization: {
          editRoles: ['existing-edit-role'],
          viewRoles: ['existing-view-role'],
        },
        expectedFields: [['viewRoles', ['existing-view-role', 'new-view-role']]],
      },
      {
        name: 'removeRoleEdit',
        method: 'removeRoleEdit',
        body: { roles: ['existing-edit-role'] },
        initialAuthorization: {
          editRoles: ['existing-edit-role'],
          viewRoles: ['existing-view-role'],
        },
        expectedFields: [['editRoles', []]],
      },
      {
        name: 'removeRoleView',
        method: 'removeRoleView',
        body: { roles: ['existing-view-role'] },
        initialAuthorization: {
          editRoles: ['existing-edit-role'],
          viewRoles: ['existing-view-role'],
        },
        expectedFields: [['viewRoles', []]],
      },
    ];

    function permissionRequest(testCase: PermissionCase, version = '1.0') {
      const route = recordMutationRoutes.find(r => r.action === testCase.method)!;
      return f.request(
        route.path.replace(':branding', 'default').replace(':portal', 'portal').replace(':oid', 'record-1'),
        { method: route.method.toUpperCase(), headers: headers(version), body: testCase.body }
      );
    }
    for (const testCase of [...userPermissionCases, ...rolePermissionCases])
      it(`uses validated HTTP body in ${testCase.name}`, async function () {
        f.record.authorization = cloneAuthorization(testCase.initialAuthorization) as any;
        const response = await permissionRequest(testCase);
        expect(response.status).to.equal(200);
        expect(f.records.updateMeta.calledOnce).to.equal(true);
        expect(f.records.getMeta.callCount).to.equal(2);
        const updated = f.records.updateMeta.firstCall.args[2];
        for (const [field, values] of testCase.expectedFields)
          expect(updated.authorization[field]).to.deep.equal(values);
        expect(response.body).to.deep.equal(f.record.authorization);
      });
    it('does not disclose permissions after a successful mutation removes current view access', async function () {
      const result = successResult();
      result.setConcurrencyMetadata({ revision: 4, entityTag: formatRecordEntityTag('record-1', 4) });
      f.records.updateMeta.resolves(result);
      f.records.hasViewAccess.returns(false);
      const response = await permissionRequest(userPermissionCases[0]);
      expect(response.status).to.equal(200);
      expect(response.body).to.equal(null);
      expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('record-1', 4));
      expect(f.records.hasViewAccess.calledOnce).to.equal(true);
    });
    it('preserves the literal v1 error body for all permission mutation failures', async function () {
      f.records.updateMeta.resolves(notSavedResult());
      for (const testCase of [...userPermissionCases, ...rolePermissionCases]) {
        f.record.authorization = cloneAuthorization(testCase.initialAuthorization) as any;
        const response = await permissionRequest(testCase);
        expect(response.status, testCase.name).to.equal(500);
        expect(response.body).to.deep.equal({ message: 'Failed to update record with oid record-1.' });
      }
    });
  });
  const update = (body: unknown = {}, query = '', extra: Record<string, string> = {}, version = '2.0') =>
    f.request(base + '/metadata/record-1' + query, { method: 'PUT', headers: { ...headers(version), ...extra }, body });
  const transition = (extra: Record<string, string> = {}, query = '', version = '2.0') =>
    f.request(base + '/workflow/step/published/record-1' + query, {
      method: 'POST',
      headers: { ...headers(version), ...extra },
      body: {},
    });
  it('passes only requested-brand roles into workflow authorization', async () => {
    f.authenticate.resolves({ ...f.actor, roles: [
      { id: 'a-reader', brandId: f.brand.id, name: 'Researcher' },
      { id: 'b-publisher', brandId: 'foreign-brand', name: 'Publisher' },
    ] });
    const response = await transition();
    expect(response.status).to.equal(200);
    const actor = f.records.updateMeta.firstCall.args[3];
    expect(actor.roles.map((role: { name: string }) => role.name)).to.deep.equal(['Researcher']);
    const { hasTransitionRoleAuthorization } = require('../../src/records/access');
    expect(hasTransitionRoleAuthorization({ config: { authorization: { transitionRoles: ['Publisher'] } } }, actor)).to.equal(false);
  });
  function refusal(kind: 'conflict' | 'authorization' | 'validation', code: string, revision?: number) {
    const result = notSavedResult();
    result.problems = [{ kind, phase: 'pre-save', issues: [{ code, message: '@' + code }] }];
    if (revision !== undefined)
      result.setConcurrencyMetadata({
        revision,
        currentRevision: revision,
        entityTag: formatRecordEntityTag('record-1', revision),
      });
    return result;
  }
  describe('metadata submission and concurrency', function () {
    for (const merge of [false, true])
      it(`preserves detached ${merge ? 'recursive merge with array concatenation' : 'complete replacement'} submission`, async function () {
        const stored = {
          title: 'Stored',
          retained: 'keep',
          nested: { stored: true, values: [{ id: 'stored' }] },
          values: [{ id: 'stored' }],
        };
        f.record.metadata = stored as any;
        const body = {
          title: 'Incoming',
          merge: 'ordinary metadata field',
          nested: { incoming: true, values: [{ id: 'incoming' }] },
          values: [{ id: 'incoming' }],
        };
        const snapshot = structuredClone(body);
        const response = await update(body, '?merge=' + merge);
        expect(response.status).to.equal(200);
        expect(f.records.updateMeta.firstCall.args[7]).to.deep.equal({
          metadata: body,
          mode: merge ? 'merge' : 'replace',
        });
        expect(f.records.updateMeta.firstCall.args[2].metadata).to.deep.equal(stored);
        expect(stored.values).to.deep.equal([{ id: 'stored' }]);
        expect(body).to.deep.equal(snapshot);
      });
    it('keeps attachment metadata separate from its persisted baseline and normalizes operation', async function () {
      const body = {
        title: 'Validated title',
        tags: ['incoming'],
        nested: { value: 2 },
        enabledValidationGroups: ['client-selected-group'],
      };
      f.record.revision = 5;
      f.record.metadata = { tags: ['existing'], nested: { value: 1 } } as any;
      const response = await update(body, '?merge=true&datastreams=true&operation=%20submit%20', {
        'If-Match': formatRecordEntityTag('record-1', 5),
      });
      expect(response.status).to.equal(200);
      const args = f.records.updateMeta.firstCall.args;
      expect(args[2].metadata.tags).to.deep.equal(['existing']);
      expect(args[7]).to.deep.equal({ metadata: body, mode: 'merge' });
      expect(args[8]).to.include({ operation: 'update', validationOperation: 'submit' });
      expect(args[8].concurrency).to.deep.equal({ entityTagSupplied: true, expectedRevision: 5 });
      expect(args[8]).not.to.have.property('enabledValidationGroups');
    });
    it('rejects malformed, weak, list and wildcard tags in both API versions before lookup', async function () {
      const tag = formatRecordEntityTag('record-1', 5);
      for (const version of ['1.0', '2.0'])
        for (const value of ['W/' + tag, '*', tag + ', ' + tag, tag.slice(1, -1)]) {
          const response = await update({ title: 'Rejected' }, '?merge=true', { 'If-Match': value }, version);
          expect(response.status).to.equal(400);
          expect(response.body).to.deep.equal(
            version === '1.0'
              ? { message: 'Invalid record concurrency request.' }
              : { errors: [{ code: 'record-if-match-invalid', source: { header: 'If-Match' } }], meta: {} }
          );
        }
      expect(f.records.getMeta.called).to.equal(false);
      expect(f.records.updateMeta.called).to.equal(false);
    });
    for (const mode of ['last-write-wins', 'observe'] as const)
      it(`keeps tokenless ${mode} updates compatible with final tags`, async function () {
        const result = successResult();
        result.setConcurrencyMetadata({
          mode,
          revision: 6,
          currentRevision: 6,
          entityTag: formatRecordEntityTag('record-1', 6),
        });
        f.records.updateMeta.resolves(result);
        const response = await update({ title: 'Updated' });
        expect(response.status).to.equal(200);
        expect(f.records.updateMeta.firstCall.args[8].concurrency).to.deep.equal({ entityTagSupplied: false });
        expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('record-1', 6));
        expect(response.body.meta.concurrency.mode).to.equal(mode);
      });
    for (const version of ['1.0', '2.0'])
      it(`preserves strict 428 and the ${version} contract`, async function () {
        f.record.revision = 5;
        const result = refusal('conflict', 'record-precondition-required', 5);
        f.records.updateMeta.resolves(result);
        const response = await update({ title: 'Rejected' }, '', {}, version);
        expect(response.status).to.equal(428);
        expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('record-1', 5));
        if (version === '1.0') expect(response.body).to.deep.equal({ message: 'Update Metadata failed' });
        else {
          expect(response.body.meta.outcome).to.equal('not-saved');
          expect(response.body.errors).to.deep.equal([
            { code: 'record-precondition-required', title: '@record-precondition-required' },
          ]);
        }
      });
    it('returns latest safe v2 projection for a stale tag', async function () {
      f.record.revision = 6;
      f.record.metadata = { title: 'Latest' };
      f.records.updateMeta.resolves(refusal('conflict', 'record-revision-stale', 6));
      const response = await update({ title: 'Rejected' }, '', { 'If-Match': formatRecordEntityTag('record-1', 5) });
      expect(response.status).to.equal(412);
      expect(response.body.meta.metadata).to.deep.equal({ title: 'Latest' });
      expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('record-1', 6));
    });
    it('redacts stale conflicts after current view access is lost', async function () {
      const result = refusal('conflict', 'record-revision-stale', 6);
      result.setProjectedMetadata({ submitted: 'must-not-return' });
      f.record.metadata = { privateValue: 'must-not-return' } as any;
      f.records.hasViewAccess.returns(false);
      f.records.updateMeta.resolves(result);
      const response = await update({ title: 'Rejected' }, '', { 'If-Match': formatRecordEntityTag('record-1', 5) });
      expect(response.status).to.equal(403);
      expect(response.text).not.to.include('must-not-return');
      expect(response.headers.get('ETag')).to.equal(null);
      expect(response.body).to.deep.equal({ errors: [{ code: 'not-authorised' }], meta: {} });
      expect(result.metadata).to.equal(null);
      expect(result.concurrency).to.equal(undefined);
    });
    it('redacts lifecycle conflict when tombstone view permission is revoked', async function () {
      const result = refusal('conflict', 'record-lifecycle-operation-conflict', 7);
      result.setProjectedMetadata({ staleDeletedValue: 'must-not-return' });
      f.records.getMeta.resolves(null);
      f.records.hasViewAccess.returns(false);
      f.records.restoreRecord.resolves(result);
      const response = await f.request('/default/portal/api/deletedrecords/record-1', {
        method: 'PUT',
        headers: headers(),
        body: {},
      });
      expect(response.status).to.equal(403);
      expect(response.text).not.to.include('must-not-return');
      expect(result.metadata).to.equal(null);
      expect(result.concurrency).to.equal(undefined);
    });
    it('returns latest authorized projection when edit access is lost but view remains', async function () {
      f.record.revision = 6;
      f.record.metadata = { title: 'Latest authorized value' };
      f.records.hasEditAccess.onFirstCall().returns(true);
      f.records.hasEditAccess.onSecondCall().returns(false);
      const result = refusal('authorization', 'record-edit-unauthorized');
      result.setProjectedMetadata({ submitted: 'must-not-return' });
      f.records.updateMeta.resolves(result);
      const response = await update({ title: 'Rejected' }, '', { 'If-Match': formatRecordEntityTag('record-1', 5) });
      expect(response.status).to.equal(403);
      expect(response.body.meta.metadata).to.deep.equal({ title: 'Latest authorized value' });
      expect(response.body.meta.concurrency).to.include({
        revision: 6,
        entityTag: formatRecordEntityTag('record-1', 6),
      });
      expect(response.text).not.to.include('must-not-return');
    });
    for (const version of ['1.0', '2.0'])
      it(`retains ${version} confirmed non-save status and envelope`, async function () {
        const result = refusal('validation', 'validation-failed');
        result.problems[0].issues[0].message = '@dmpt-form-save-error';
        f.records.updateMeta.resolves(result);
        const response = await update({ title: 'Rejected' }, '?merge=false&datastreams=false', {}, version);
        expect(response.status).to.equal(version === '1.0' ? 500 : 400);
        if (version === '1.0') expect(response.body).to.deep.equal({ message: 'Update Metadata failed' });
        else {
          expect(response.body.meta.outcome).to.equal('not-saved');
          expect(response.body.errors).to.deep.equal([{ code: 'validation-failed', title: '@dmpt-form-save-error' }]);
        }
      });
    it('uses validated object metadata independently', async function () {
      const body = { kind: 'object-meta', source: 'validated' };
      const route = recordMutationRoutes.find(r => r.action === 'updateObjectMeta')!;
      const response = await f.request(
        route.path.replace(':branding', 'default').replace(':portal', 'portal').replace(':oid', 'record-1'),
        { method: 'PUT', body }
      );
      expect(response.status).to.equal(200);
      expect(f.records.updateMeta.firstCall.args[2].metaMetadata).to.deep.equal(body);
    });
    it('preserves literal v1 object-metadata failure', async function () {
      f.records.updateMeta.resolves(notSavedResult());
      const route = recordMutationRoutes.find(r => r.action === 'updateObjectMeta')!;
      const response = await f.request(
        route.path.replace(':branding', 'default').replace(':portal', 'portal').replace(':oid', 'record-1'),
        { method: 'PUT', body: { type: 'dataset' } }
      );
      expect(response.status).to.equal(500);
      expect(response.body).to.deep.equal({ message: 'Update Object Metadata failed' });
    });
    it('isolates create metadata and authorization from forged trusted context', async function () {
      const body = {
        validationBypass: { mode: 'bypass' },
        schemaOperation: 'forged-operation',
        ifMatch: '"sha256:' + 'b'.repeat(64) + '"',
        schemaOutcome: { digest: 'b'.repeat(64) },
        authorization: { edit: ['creator'], view: ['reader'], editPending: [], viewPending: [] },
        metadata: { title: 'Validated record', enabledValidationGroups: ['client-selected-group'] },
      };
      f.records.create.resolves(successResult('created-record'));
      const response = await f.request('/default/other/api/records/metadata/dataset?operation=publish', {
        method: 'POST',
        headers: headers(),
        body,
      });
      expect(response.status).to.equal(201);
      const args = f.records.create.firstCall.args;
      expect(args[1]).to.deep.equal({ metadata: body.metadata, authorization: body.authorization });
      const context = requireRecordSaveContext(args[7]);
      expect(context).to.include({
        operation: 'create',
        validationOperation: 'publish',
        schemaOperation: 'publish',
        portal: 'other',
      });
      expect(context.ifMatch).to.equal(undefined);
      expect(context.validationBypass).to.equal(undefined);
      expect(context).not.to.have.property('schemaOutcome');
      expect(context).not.to.have.property('enabledValidationGroups');
      expect(response.headers.get('Location')).to.equal(f.url + '/default/other/api/records/metadata/created-record');
    });
    it('preserves targeted-create intent before workflow resolution', async function () {
      f.records.create.resolves(notSavedResult());
      await f.request(base + '/metadata/dataset', {
        method: 'POST',
        body: { workflowStage: 'missing-step', metadata: { title: 'Target must resolve at service boundary' } },
      });
      expect(f.records.create.firstCall.args[6]).to.equal('missing-step');
      expect(f.records.create.firstCall.args[7]).to.include({
        routeFamily: 'api',
        operation: 'transition',
        targetStep: 'missing-step',
      });
    });
    for (const enabled of [true, false])
      it(`detaches unwrapped create metadata with schema ${enabled ? 'enabled' : 'disabled'}`, async function () {
        f.settings.schemaEnabled = enabled;
        const body = { title: 'Raw unwrapped submission' },
          snapshot = structuredClone(body);
        const response = await f.request(base + '/metadata/dataset', { method: 'POST', body });
        expect(response.status).to.equal(201);
        const request = f.records.create.firstCall.args[1];
        expect(request.metadata).to.deep.equal(enabled ? snapshot : { ...snapshot, authorization: [] });
        expect(request.authorization).to.deep.equal({ edit: ['alice'], view: ['alice'] });
        expect(request.metadata).not.to.equal(body);
        expect(body).to.deep.equal(snapshot);
      });
    it('keeps omitted validation operations optional on create and update', async function () {
      const created = await f.request(base + '/metadata/dataset', {
        method: 'POST',
        body: { metadata: { title: 'Created' } },
      });
      const updated = await update({ title: 'Updated' });
      expect(created.status).to.equal(201);
      expect(updated.status).to.equal(200);
      expect(f.records.create.firstCall.args[7].validationOperation).to.equal(undefined);
      expect(f.records.updateMeta.firstCall.args[8].validationOperation).to.equal(undefined);
    });
    it('maps transition operation independently and preserves authorization refusal', async function () {
      f.workflows.get.returns(of({ name: 'published', config: { form: 'dataset-published' } }));
      f.records.updateMeta.resolves(refusal('authorization', 'record-validation-operation-unauthorized'));
      const response = await transition({}, '?operation=publish');
      expect(response.status).to.equal(403);
      expect(f.records.updateMeta.firstCall.args[8]).to.include({
        operation: 'transition',
        targetStep: 'published',
        validationOperation: 'publish',
      });
      expect(f.records.updateMeta.firstCall.args[6]).to.include({ name: 'published' });
      expect(response.body.meta.problems[0].kind).to.equal('authorization');
    });
    it('rejects transition outside the active brand before authority or workflow lookup', async function () {
      f.record.metaMetadata.brandId = 'other';
      const response = await transition({}, '?operation=publish');
      expect(response.status).to.equal(404);
      expect(f.records.hasEditAccess.called).to.equal(false);
      expect(f.workflows.get.called).to.equal(false);
      expect(f.records.updateMeta.called).to.equal(false);
    });
    it('retains literal v1 transition refusal as an HTTP 200 result', async function () {
      const result = notSavedResult();
      result.problems = [{ kind: 'authorization', phase: 'pre-save', issues: [{ message: '@not-authorised' }] }];
      f.records.updateMeta.resolves(result);
      const response = await transition({}, '?operation=publish', '1.0');
      expect(response.status).to.equal(200);
      expect(response.body).to.deep.equal(wire(expectedLegacySaveBody(result)));
    });
    it('retains typed v1 transition conflict and its legacy result', async function () {
      f.record.revision = 6;
      f.record.metadata = { title: 'Latest' };
      const result = refusal('conflict', 'record-revision-stale', 6);
      f.records.updateMeta.resolves(result);
      const response = await transition({ 'If-Match': formatRecordEntityTag('record-1', 5) }, '', '1.0');
      expect(response.status).to.equal(412);
      expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('record-1', 6));
      expect(response.body).to.deep.include({
        success: false,
        message: '@record-save-failed',
        metadata: { title: 'Latest' },
      });
      expect(response.body).not.to.have.property('meta');
    });
    it('keeps omitted transition operation optional', async function () {
      const response = await transition();
      expect(response.status).to.equal(200);
      expect(f.records.updateMeta.firstCall.args[8]).to.include({ operation: 'transition', targetStep: 'published' });
      expect(f.records.updateMeta.firstCall.args[8].validationOperation).to.equal(undefined);
    });
    it('sanitizes operation contract failures with the v1 literal', async function () {
      f.records.updateMeta.resolves(refusal('validation', 'record-validation-operation-invalid'));
      const response = await update({ title: 'Rejected' }, '?operation=UnknownCaseSensitiveName', {}, '1.0');
      expect(response.status).to.equal(500);
      expect(response.body).to.deep.equal({ message: 'Update Metadata failed' });
      expect(response.text).not.to.include('UnknownCaseSensitiveName');
    });
  });
  describe('lifecycle mutation boundaries', function () {
    const tombstone = '/default/portal/api/deletedrecords/record-1';
    it('passes exact revision and fresh resolution linkage to restore', async function () {
      const requestId = '11111111-1111-4111-8111-111111111111',
        prior = '22222222-2222-4222-8222-222222222222';
      const result = successResult();
      result.setConcurrencyMetadata({ revision: 11, entityTag: formatRecordEntityTag('record-1', 11) });
      f.records.restoreRecord.resolves(result);
      const response = await f.request(tombstone, {
        method: 'PUT',
        headers: {
          'If-Match': formatRecordEntityTag('record-1', 9),
          'X-ReDBox-Save-Request-Id': requestId,
          'X-ReDBox-Concurrency-Resolution': 'client-manually-resolved',
          'X-ReDBox-Resolution-Of-Request-Id': prior,
        },
        body: {},
      });
      const context = f.records.restoreRecord.firstCall.args[3];
      expect(context).to.include({ requestId, operation: 'restore', routeFamily: 'api' });
      expect(context.concurrency).to.include({
        expectedRevision: 9,
        resolution: 'client-manually-resolved',
        resolutionOfRequestId: prior,
      });
      expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('record-1', 11));
    });
    for (const mode of ['last-write-wins', 'observe'] as const)
      it(`keeps tokenless ${mode} lifecycle requests compatible`, async function () {
        const result = successResult();
        result.setConcurrencyMetadata({
          mode,
          revision: 11,
          currentRevision: 11,
          entityTag: formatRecordEntityTag('record-1', 11),
        });
        f.records.restoreRecord.resolves(result);
        const response = await f.request(tombstone, { method: 'PUT', headers: headers(), body: {} });
        expect(response.status).to.equal(200);
        expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('record-1', 11));
        expect(response.body.meta.concurrency.mode).to.equal(mode);
        expect(f.records.restoreRecord.firstCall.args[3].concurrency).to.deep.equal({ entityTagSupplied: false });
      });
    it('retains strict 428 and the tombstone revision', async function () {
      f.record.revision = 9;
      f.records.getMeta.resolves(null);
      f.records.restoreRecord.resolves(refusal('conflict', 'record-precondition-required', 9));
      const response = await f.request(tombstone, { method: 'PUT', headers: headers(), body: {} });
      expect(response.status).to.equal(428);
      expect(response.headers.get('ETag')).to.equal(formatRecordEntityTag('record-1', 9));
      expect(response.body.errors).to.deep.equal([
        { code: 'record-precondition-required', title: '@record-precondition-required' },
      ]);
    });
    it('rejects malformed lifecycle tags before lookup or mutation', async function () {
      const response = await f.request(tombstone, {
        method: 'PUT',
        headers: { ...headers(), 'If-Match': '*' },
        body: {},
      });
      expect(response.status).to.equal(400);
      expect(response.body).to.deep.equal({
        errors: [{ code: 'record-if-match-invalid', source: { header: 'If-Match' } }],
        meta: {},
      });
      expect(f.records.getDeletedRecordMeta.called).to.equal(false);
      expect(f.records.restoreRecord.called).to.equal(false);
    });
    it('maps permanent deletion to purge intent', async function () {
      const response = await f.request(base + '/metadata/record-1?permanent=true', {
        method: 'DELETE',
        headers: { 'If-Match': formatRecordEntityTag('record-1', 7) },
      });
      expect(response.status).to.equal(200);
      expect(f.records.delete.firstCall.args[1]).to.equal(true);
      expect(f.records.delete.firstCall.args[5]).to.include({ operation: 'purge', routeFamily: 'api' });
    });
    for (const [method, owner] of [
      ['PUT', 'restoreRecord'],
      ['DELETE', 'destroyDeletedRecord'],
    ] as const) {
      it(`does not ${owner} an active record without a tombstone`, async function () {
        f.records.getDeletedRecordMeta.resolves(null);
        const response = await f.request(tombstone, { method, body: method === 'PUT' ? {} : undefined });
        expect(response.status).to.equal(404);
        expect(f.records.getDeletedRecordMeta.calledOnce && f.records.getDeletedRecordMeta.calledWithMatch('record-1', { id: 'brand-1' })).to.equal(true);
        expect(f.records.getMeta.called).to.equal(false);
        expect(f.records[owner].called).to.equal(false);
      });
      it(`rejects ${owner} across brands`, async function () {
        f.record.metaMetadata.brandId = 'other';
        const response = await f.request(tombstone, { method, body: method === 'PUT' ? {} : undefined });
        expect(response.status).to.equal(404);
        expect(f.records[owner].called).to.equal(false);
      });
    }
    it('returns sanitized 500 for tombstone storage failures', async function () {
      f.records.getDeletedRecordMeta.rejects(new Error('storage unavailable PRIVATE'));
      const response = await f.request(tombstone, { method: 'PUT', body: {} });
      expect(response.status).to.equal(500);
      expect(response.text).not.to.include('PRIVATE');
      expect(f.records.restoreRecord.called).to.equal(false);
    });
  });
  describe('schema digest request boundary', function () {
    it('returns typed stale-schema 412 with retained failure metadata', async function () {
      const tag = '"sha256:' + 'a'.repeat(64) + '"',
        result = schemaPreconditionFailure('record-schema.precondition-failed');
      f.records.updateMeta.resolves(result);
      const response = await update({ title: 'Stale update' }, '?merge=false&datastreams=false', {
        [RECORD_SCHEMA_WRITE_PRECONDITION_HEADER]: tag,
      });
      expect(requireRecordSaveContext(f.records.updateMeta.firstCall.args[8])).to.include({
        portal: 'portal',
        ifMatch: tag,
      });
      expect(response.status).to.equal(412);
      expect(response.body.meta.problems).to.deep.equal(result.problems);
      expect(response.body.errors).to.deep.equal([
        { code: 'record-schema.precondition-failed', title: '@record-schema.precondition-failed' },
      ]);
    });
    it('keeps omitted schema precondition compatible', async function () {
      const response = await update({ title: 'Compatible update' });
      expect(response.status).to.equal(200);
      expect(requireRecordSaveContext(f.records.updateMeta.firstCall.args[8]).ifMatch).to.equal(undefined);
    });
    it('keeps API create free of record revision preconditions', async function () {
      const response = await f.request(base + '/metadata/dataset', {
        method: 'POST',
        headers: { ...headers(), 'If-Match': formatRecordEntityTag('record-1', 0) },
        body: { metadata: { title: 'Created' } },
      });
      expect(response.status).to.equal(400);
      expect(response.body).to.deep.equal({
        errors: [{ code: 'record-if-match-invalid', source: { header: 'If-Match' } }],
        meta: {},
      });
      expect(f.records.create.called).to.equal(false);
      expect(f.recordTypes.get.called).to.equal(false);
    });
    it('keeps record revision and schema digest independent for update and transition', async function () {
      const tag = '"sha256:' + 'a'.repeat(64) + '"',
        both = { 'If-Match': formatRecordEntityTag('record-1', 7), [RECORD_SCHEMA_WRITE_PRECONDITION_HEADER]: tag };
      expect((await update({ title: 'Updated' }, '', both)).status).to.equal(200);
      expect((await transition(both)).status).to.equal(200);
      for (const call of f.records.updateMeta.getCalls()) {
        const context = requireRecordSaveContext(call.args[8]);
        expect(context.ifMatch).to.equal(tag);
        expect(context.concurrency?.expectedRevision).to.equal(7);
      }
    });
    it('does not accept a body-forged schema digest without the validated header', async function () {
      const response = await update({ title: 'Updated', ifMatch: '"sha256:' + 'c'.repeat(64) + '"' });
      expect(response.status).to.equal(200);
      expect(requireRecordSaveContext(f.records.updateMeta.firstCall.args[8]).ifMatch).to.equal(undefined);
    });
    it('keeps stale, malformed and multi-value schema failures typed in v1 update and transition', async function () {
      for (const testCase of [
        { header: '"sha256:' + 'b'.repeat(64) + '"', code: 'record-schema.precondition-failed' as const, status: 412 },
        { header: 'malformed-etag', code: 'record-schema.invalid-request' as const, status: 400 },
        {
          header: '"sha256:' + 'a'.repeat(64) + '", "sha256:' + 'b'.repeat(64) + '"',
          code: 'record-schema.invalid-request' as const,
          status: 400,
        },
      ])
        for (const action of ['update', 'transition']) {
          const result = schemaPreconditionFailure(testCase.code);
          f.records.updateMeta.resolves(result);
          const h = { [RECORD_SCHEMA_WRITE_PRECONDITION_HEADER]: testCase.header };
          const response =
            action === 'update' ? await update({ title: 'Changed' }, '', h, '1.0') : await transition(h, '', '1.0');
          expect(response.status, action).to.equal(testCase.status);
          expect(requireRecordSaveContext(f.records.updateMeta.lastCall.args[8]).ifMatch).to.equal(testCase.header);
          expect(response.body).to.deep.equal(
            action === 'update' ? { message: 'Update Metadata failed' } : wire(expectedLegacySaveBody(result))
          );
        }
    });
  });
});
