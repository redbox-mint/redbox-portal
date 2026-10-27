import assert from 'node:assert/strict';
import { of } from 'rxjs';
import { httpRecordReadsFixture } from '../helpers/httpRecordReadsFixture';
import { httpRecordMutationsFixture } from '../helpers/httpRecordMutationsFixture';
import { formatRecordEntityTag } from '../../src/RecordEntityTag';
import { RecordSaveResponse } from '../../src/RecordSaveResponse';

import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountQueryReadRoutes } from '../../src/http/express/queryReads';

const base = '/default/portal';
describe('Pre-retirement browser record response and side-effect contracts (R14)', () => {
  for (const version of ['1.0', '2.0'])
    it(`retains the browser metadata relationship envelope (${version})`, async () => {
      const f = await httpRecordReadsFixture();
      const record = {
        redboxOid: 'oid-1',
        revision: 3,
        metaMetadata: { brandId: 'brand-1' },
        metadata: { title: 'Current' },
        authorization: { view: ['alice'], edit: ['alice'] },
      };
      const graph = { rootOid: 'oid-1', relatedObjects: { dataset: [record] }, edges: [], omittedByAccess: {} };
      f.storage.getMeta.resolves(record);
      f.storage.getRelatedRecords.resolves(graph);
      try {
        const response = await f.request(base + '/record/metadata/oid-1?include=relationships&apiVersion=' + version);
        assert.equal(response.status, 200);
        assert.deepEqual(
          response.body,
          version === '1.0'
            ? { ...record.metadata, relationships: graph }
            : {
                data: record.metadata,
                meta: { oid: 'oid-1', revision: 3, entityTag: formatRecordEntityTag('oid-1', 3), relationships: graph },
              }
        );
        assert.equal(response.headers.get('etag'), formatRecordEntityTag('oid-1', 3));
      } finally {
        await f.close();
      }
    });

  it('keeps browser deletion recoverable even if the REST-only permanent flag is supplied', async () => {
    const f = await httpRecordMutationsFixture();
    try {
      const response = await f.request(base + '/record/delete/record-1?permanent=true', { method: 'DELETE' });
      assert.equal(response.status, 200);
      assert.equal(f.records.delete.firstCall.args[1], false);
      assert.equal(f.records.delete.firstCall.args[5].operation, 'delete');
    } finally {
      await f.close();
    }
  });

  for (const action of ['create', 'update'] as const)
    for (const failure of ['read', 'projection'] as const)
      it(`retains committed ${action} outcome, warning and headers after ${failure} failure`, async () => {
        const f = await httpRecordMutationsFixture();
        const save = action === 'create' ? f.records.create : f.records.updateMeta;
        const result = new RecordSaveResponse('00000000-0000-4000-8000-000000000001');
        result.confirmPrimaryPersistence('record-1');
        result.setConcurrencyMetadata({ revision: 4, entityTag: formatRecordEntityTag('record-1', 4) });
        save.resolves(result);
        if (failure === 'read') {
          if (action === 'create') f.records.getMeta.rejects(new Error('PRIVATE provider read failure'));
          else f.records.getMeta.onSecondCall().rejects(new Error('PRIVATE provider read failure'));
        } else {
          f.forms.getFormByName.returns(of({ configuration: { name: 'dataset-form', fields: [] } }));
          f.forms.buildClientFormConfig.rejects(new Error('PRIVATE projection failure'));
        }
        try {
          const response = await f.request(
            base + (action === 'create' ? '/recordmeta/dataset' : '/recordmeta/record-1') + '?apiVersion=2.0',
            {
              method: action === 'create' ? 'POST' : 'PUT',
              body: { title: 'Saved' },
            }
          );
          assert.equal(response.status, 200);
          assert.equal(response.headers.get('etag'), formatRecordEntityTag('record-1', 4));
          assert.equal(response.body.meta.outcome, 'saved-with-warnings');
          assert.equal(response.body.meta.oid, 'record-1');
          assert.equal(response.body.meta.metadata, null);
          assert.equal(response.body.meta.problems[0].issues[0].code, 'response-projection-failed');
          assert.equal(response.text.includes('PRIVATE'), false);
        } finally {
          await f.close();
        }
      });
  for (const rootContext of ['', '/research'])
    it(`uses the configured public URL for API create Location under root '${rootContext}'`, async () => {
      const publicUrl = 'https://public.example.edu' + rootContext;
      const f = await httpRecordMutationsFixture(rootContext, publicUrl);
      try {
        const response = await f.request(base + '/api/records/metadata/dataset', {
          method: 'POST',
          body: { title: 'Saved' },
          headers: {
            Host: 'internal-service:1500',
            'X-Forwarded-Proto': 'http',
            'X-Forwarded-Host': 'wrong.example.edu',
          },
        });
        assert.equal(response.status, 201);
        assert.equal(response.headers.get('location'), publicUrl + '/default/portal/api/records/metadata/record-1');
      } finally {
        await f.close();
      }
    });

  for (const alias of ['api', 'admin'])
    for (const conflict of [false, true])
      it(`retains POST preview body filter values before query values (${alias}, conflict=${conflict})`, async () => {
        const previewConfig = async (
          _brand: unknown,
          _config: unknown,
          parameters: { param(name: string): unknown }
        ) => ({
          owner: parameters.param('owner'),
          date: parameters.param('changed_fromDate'),
        });
        const f = await httpRouteFixture((router, input) =>
          mountQueryReadRoutes(router, {
            ...input,
            reports: { previewConfig },
          } as never)
        );
        try {
          const response = await f.request(
            base + '/' + alias + '/report-config/preview' + (conflict ? '?owner=query-owner' : ''),
            {
              method: 'POST',
              body: {
                name: 'preview',
                title: 'Preview',
                reportSource: 'database',
                owner: 'body-owner',
                changed_fromDate: '2026-01-02',
              },
            }
          );
          assert.equal(response.status, 200);
          assert.deepEqual(response.body, { owner: 'body-owner', date: '2026-01-02' });
        } finally {
          await f.close();
        }
      });
});
