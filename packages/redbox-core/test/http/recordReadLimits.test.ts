import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountRecordReadRoutes, type RecordReadHttpInput } from '../../src/http/express/recordReads';

describe('Record list and search limit configuration', () => {
  // Baseline API lists read api.max_requests; browser lists and search accept
  // larger pages and retain the standalone host's record.search bound.
  for (const [path, rows, status, operation] of [
    ['/api/records/list', 20, 200, 'list'],
    ['/api/records/list', 21, 400, undefined],
    ['/listRecords', 20, 200, 'list'],
    ['/listRecords', 21, 200, 'list'],
    ['/listRecords', 50, 200, 'list'],
    ['/listRecords', 100, 200, 'list'],
    ['/listRecords', 101, 400, undefined],
    ['/api/deletedrecords/list', 20, 200, 'list'],
    ['/api/deletedrecords/list', 21, 400, undefined],
    ['/listDeletedRecords', 50, 200, 'list'],
    ['/listDeletedRecords', 100, 200, 'list'],
    ['/listDeletedRecords', 101, 400, undefined],
    ['/record/search/dataRecord', 50, 200, 'search'],
    ['/record/search/dataRecord', 100, 200, 'search'],
    ['/record/search/dataRecord', 101, 400, undefined],
  ] as const) {
    it(`applies the selected limit to ${path}?rows=${rows}`, async () => {
      const getRecords = sinon.stub().resolves({ isSuccessful: () => true, totalItems: 0, items: [] });
      const searchFuzzy = sinon.stub().resolves({ records: [], total: 0 });
      const fixture = await httpRouteFixture((router, input) =>
        mountRecordReadRoutes(router, {
          ...input,
          storage: { getRecords, getDeletedRecords: getRecords },
          recordTypes: { get: () => of({ searchCore: 'default' }) },
          search: { searchFuzzy },
          maxRows: 20,
          maxSearchRows: 100,
          returnFields: [],
        } as unknown as RecordReadHttpInput)
      );
      try {
        const response = await fixture.request('/default/portal' + path + '?rows=' + rows);
        assert.equal(response.status, status, response.text);
        assert.equal(getRecords.callCount, operation === 'list' ? 1 : 0);
        assert.equal(searchFuzzy.callCount, operation === 'search' ? 1 : 0);
        if (operation === 'list') assert.equal(getRecords.firstCall.args[3], rows);
        if (operation === 'search') assert.equal(searchFuzzy.firstCall.args[11], rows);
      } finally {
        await fixture.close();
      }
    });
  }
});
