import assert from 'node:assert/strict';
import sinon from 'sinon';
import { formatRecordEntityTag } from '../../../src/RecordEntityTag';
import { mutationDeclarations } from '../../../src/http/mutationRoutes';
import { recordQueryReadDeclarations } from '../../../src/http/readRoutes';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';
import { normalizeMutation, session, settleMutationWork, wire } from './mutationDifferentialSupport';
import { assertGolden, goldenControls } from './goldenContracts';

const bearer = { Authorization: 'Bearer pilot-api-token', 'Content-Type': 'application/json' };
describe('Restored R14 browser and API record contracts', function () {
  this.timeout(120000);
  for (const version of ['1.0', '2.0'])
    it(`retains the browser metadata relationship envelope (${version})`, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, {
        declarations: recordQueryReadDeclarations,
      });
      try {
        const stored = f.client.db().collection('record');
        assert.equal(
          (await stored.updateOne({ redboxOid: 'reference-record' }, { $set: { revision: 3 } })).modifiedCount,
          1
        );
        const { Cookie } = await session(f);
        const response = await wire(
          f.url + `/default/rdmp/record/metadata/reference-record?include=relationships&apiVersion=${version}`,
          'GET',
          { Cookie }
        );
        assert.equal(response.status, 200, response.text);
        const tag = formatRecordEntityTag('reference-record', 3);
        assert.equal(response.headers.etag, tag);
        const body = JSON.parse(response.text);
        if (version === '1.0') {
          assert.equal(body.title, 'Reference');
          assert.equal(body.relationships.rootOid, 'reference-record');
        } else {
          assert.equal(body.data.title, 'Reference');
          assert.equal(body.meta.relationships.rootOid, 'reference-record');
          assert.equal(body.meta.entityTag, tag);
          assert.equal(body.meta.revision, 3);
        }
        assertGolden(
          'retirementRecords',
          `browser-relationship-envelope/${version}`,
          await normalizeMutation(f, response)
        );
      } finally {
        await f.close();
      }
    });

  it('keeps browser deletion recoverable even if the REST-only permanent flag is supplied', async () => {
    const f = await referenceProductionFixture(true, undefined, undefined, { declarations: mutationDeclarations });
    const sandbox = sinon.createSandbox();
    try {
      const auth = await session(f);
      const remove = sandbox.spy(f.data.records.get(), 'delete');
      const response = await wire(f.url + '/default/rdmp/record/delete/reference-record?permanent=true', 'DELETE', {
        ...auth,
        Origin: referenceOrigin,
      });
      assert.equal(response.status, 200, response.text);
      assert.equal(remove.callCount, 1);
      const [, permanent, , , , context] = remove.firstCall.args;
      assert.equal(permanent, false);
      assert.equal(context?.operation, 'delete');
      await settleMutationWork(f);
      const db = f.client.db();
      assert.equal(await db.collection('record').countDocuments({ redboxOid: 'reference-record' }), 0);
      assert.equal(await db.collection('deletedrecord').countDocuments({ redboxOid: 'reference-record' }), 1);
      assertGolden('retirementRecords', 'recoverable-browser-delete', {
        ...(await normalizeMutation(f, response)),
        calls: { permanent, operation: context?.operation },
      });
    } finally {
      sandbox.restore();
      await f.close();
    }
  });
  for (const rootContext of ['', '/research'])
    it(`uses the configured public URL for API create Location under root '${rootContext}'`, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, {
        declarations: mutationDeclarations,
        configuration: {
          server: {
            rootContext,
            hostname: '127.0.0.1',
            port: 0,
            trustProxy: true,
            stopDeadlineMs: 30000,
            publicUrl: referenceOrigin + rootContext,
          },
        },
      });
      try {
        const response = await wire(
          f.url + '/default/rdmp/api/records/metadata/dataRecord',
          'POST',
          {
            ...bearer,
            Host: 'internal-service:1500',
            'X-Forwarded-Proto': 'http',
            'X-Forwarded-Host': 'wrong.example.edu',
            'X-ReDBox-Save-Request-Id': '00000000-0000-4000-8000-000000000027',
          },
          JSON.stringify({ title: 'Canonical Location' })
        );
        assert.equal(response.status, 201, response.text);
        await settleMutationWork(f);
        const saved = await f.client.db().collection('record').findOne({ 'metadata.title': 'Canonical Location' });
        assert(saved);
        assert.equal(
          response.headers.location,
          referenceOrigin + rootContext + '/default/rdmp/api/records/metadata/' + encodeURIComponent(saved.redboxOid)
        );
        assertGolden('retirementRecords', 'canonical-location' + rootContext, await normalizeMutation(f, response));
      } finally {
        await f.close();
      }
    });
  for (const alias of ['api', 'admin'])
    for (const conflict of [false, true])
      it(`retains POST preview body filter values before query values (${alias}, conflict=${conflict})`, async () => {
        const f = await referenceProductionFixture(true, undefined, undefined, {
          declarations: recordQueryReadDeclarations,
        });
        const sandbox = sinon.createSandbox();
        try {
          const auth = await session(f);
          const calls: unknown[] = [];
          sandbox
            .stub(f.data.reference.reports.get(), 'previewConfig')
            .callsFake(async (brand, _config, parameters) => {
              const filters = { owner: parameters.param('owner'), date: parameters.param('changed_fromDate') };
              calls.push({ brand: brand.id, ...filters });
              return filters as never;
            });
          const response = await wire(
            f.url + `/default/rdmp/${alias}/report-config/preview` + (conflict ? '?owner=query-owner' : ''),
            'POST',
            {
              ...auth,
              Origin: referenceOrigin,
              'Content-Type': 'application/json',
              ...(alias === 'api' ? bearer : {}),
            },
            JSON.stringify({
              name: 'preview',
              title: 'Preview',
              reportSource: 'database',
              owner: 'body-owner',
              changed_fromDate: '2026-01-02',
            })
          );
          assert.equal(response.status, 200, response.text);
          const expected = { owner: 'body-owner', date: '2026-01-02' };
          assert.deepEqual(JSON.parse(response.text), expected);
          assert.deepEqual(calls, [{ brand: f.brand.id, ...expected }]);
          assertGolden('retirementRecords', `preview/${alias}/${conflict}`, {
            ...(await normalizeMutation(f, response)),
            calls,
          });
        } finally {
          sandbox.restore();
          await f.close();
        }
      });
});
goldenControls('retirementRecords');
