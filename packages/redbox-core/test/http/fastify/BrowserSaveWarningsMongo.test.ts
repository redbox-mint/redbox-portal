import assert from 'node:assert/strict';
import sinon from 'sinon';
import { formatRecordEntityTag } from '../../../src/RecordEntityTag';
import type { RecordSaveResponse } from '../../../src/RecordSaveResponse';
import { mutationDeclarations } from '../../../src/http/mutationRoutes';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';
import { normalizeMutation, session, settleMutationWork, wire } from './mutationDifferentialSupport';
import { assertGolden, goldenControls } from './goldenContracts';

describe('Committed browser record save warnings', function () {
  this.timeout(120000);
  for (const action of ['create', 'update'] as const)
    for (const failure of ['read', 'projection'] as const)
      it(`retains committed ${action} outcome, warning and headers after ${failure} failure`, async () => {
        const f = await referenceProductionFixture(true, undefined, undefined, {
          declarations: mutationDeclarations,
          configuration: { recordSchema: { enabled: false } },
        });
        const sandbox = sinon.createSandbox();
        try {
          const auth = await session(f);
          const records = f.data.records.get();
          const forms = f.data.reference.forms.get();
          let commit: RecordSaveResponse | undefined;
          let faultCalls = 0;
          const title = `Saved ${action} ${failure}`;
          const writer = action === 'create' ? 'create' : 'updateMeta';
          function committed(result: RecordSaveResponse) {
            assert(result.wasPersisted());
            // A provider can return unprojected metadata with the saved result.
            result.setProjectedMetadata({ privateProjection: 'PRIVATE pre-projection fixture' });
            commit = result;
            return result;
          }
          if (writer === 'create') {
            const create = records.create.bind(records);
            sandbox.stub(records, 'create').callsFake(async (...args) => committed(await create(...args)));
          } else {
            const update = records.updateMeta.bind(records);
            sandbox.stub(records, 'updateMeta').callsFake(async (...args) => committed(await update(...args)));
          }
          const reload = records.getMeta.bind(records);
          const project = forms.buildClientFormConfig.bind(forms);
          if (failure === 'read')
            sandbox.stub(records, 'getMeta').callsFake(async oid => {
              if (commit?.oid === oid && faultCalls === 0) {
                faultCalls++;
                throw new Error('PRIVATE provider read failure');
              }
              return reload(oid);
            });
          else
            sandbox.stub(forms, 'buildClientFormConfig').callsFake(async (...args) => {
              if (commit && faultCalls === 0) {
                faultCalls++;
                throw new Error('PRIVATE projection failure');
              }
              return project(...args);
            });
          const response = await wire(
            f.url +
              '/default/rdmp/recordmeta/' +
              (action === 'create' ? 'dataRecord' : 'reference-record') +
              '?apiVersion=2.0',
            action === 'create' ? 'POST' : 'PUT',
            {
              ...auth,
              Origin: referenceOrigin,
              'Content-Type': 'application/json',
              'X-ReDBox-Save-Request-Id': '00000000-0000-4000-8000-000000000001',
            },
            JSON.stringify({ title })
          );
          assert(commit, 'the production writer must succeed before the injected fault');
          assert.equal(faultCalls, 1);
          await settleMutationWork(f);
          const saved = await f.data.storage().getMeta(commit.oid);
          assert(saved);
          assert.equal(saved.metadata.title, title);
          assert.equal(saved.revision, action === 'create' ? 0 : 1);
          assert.equal(response.status, 200);
          assert.equal(response.headers.etag, formatRecordEntityTag(commit.oid, saved.revision));
          const { data, meta } = JSON.parse(response.text);
          assert.equal(meta.outcome, 'saved-with-warnings');
          assert.equal(meta.oid, commit.oid);
          assert.equal(meta.metadata, null);
          assert.deepEqual(
            meta.problems.map((problem: { issues: { code: string }[] }) => problem.issues.map(issue => issue.code)),
            [['response-projection-failed']]
          );
          assert.equal(response.text.includes('PRIVATE'), false);
          if (failure === 'read') assert.equal(data, null);
          else assert.equal(data.metadata.title, title);
          const { wire: envelope, state } = await normalizeMutation(f, response);
          assertGolden('browserSaveWarnings', action + '/' + failure, { wire: envelope, state, faultCalls });
        } finally {
          sandbox.restore();
          await f.close();
        }
      });
});
goldenControls('browserSaveWarnings');
