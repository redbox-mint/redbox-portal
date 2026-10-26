import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountQueryReadRoutes } from '../../src/http/express/queryReads';
import { AuditReadError } from '../../src/queries/RecordAuditViews';
import { Services as Reports } from '../../src/queries/Reports';

describe('Query HTTP failure boundaries', () => {
  for (const error of [
    new Error('PRIVATE-BACKEND-FAILURE'),
    Object.assign(new Error('PRIVATE-BACKEND-FAILURE'), { status: 401 }),
    'PRIVATE-BACKEND-FAILURE',
  ]) {
    it(`sanitizes untrusted failures (${typeof error}, status ${Reflect.get(Object(error), 'status')}) in both API versions`, async () => {
      const getConfig = sinon.stub().callsFake(async () => {
        throw error;
      });
      const f = await httpRouteFixture((router, input) =>
        mountQueryReadRoutes(router, { ...input, reports: { getConfig } } as any)
      );
      try {
        for (const version of ['1.0', '2.0']) {
          const response = await f.request('/default/portal/api/report-config/test', {
            headers: { 'x-redbox-api-version': version },
          });
          assert.equal(response.status, 500);
          assert.match(response.text, /Internal server error/);
          assert(!response.text.includes('PRIVATE-BACKEND-FAILURE'));
        }
      } finally {
        await f.close();
      }
    });
  }
  for (const [error, path] of [
    [new AuditReadError(403, 'view-error-no-permissions'), '/default/portal/record/viewAudit/record-1/permissions'],
    [new AuditReadError(404, 'Record not found'), '/default/portal/record/viewAudit/record-1/permissions'],
    [new Reports.ReportConfigServiceError(404, 'Report not found'), '/default/portal/api/report-config/test'],
  ] as const) {
    it(`retains controlled ${error.status} domain refusals`, async () => {
      const refuse = async () => {
        throw error;
      };
      const f = await httpRouteFixture((router, input) =>
        mountQueryReadRoutes(router, {
          ...input,
          reports: { getConfig: refuse },
          audit: { permissions: refuse },
        } as any)
      );
      try {
        const response = await f.request(path);
        assert.equal(response.status, error.status);
        assert.equal(response.body.message, error.message);
      } finally {
        await f.close();
      }
    });
  }
  it('retains the report-results failure envelope while sanitizing unexpected messages', async () => {
    const f = await httpRouteFixture((router, input) =>
      mountQueryReadRoutes(router, {
        ...input,
        reports: {
          getResults: async () => {
            throw new Error('PRIVATE-BACKEND-FAILURE');
          },
        },
      } as any)
    );
    try {
      const response = await f.request('/default/portal/admin/getReportResults?name=test');
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { status: false, message: 'Internal server error' });
    } finally {
      await f.close();
    }
  });
});
