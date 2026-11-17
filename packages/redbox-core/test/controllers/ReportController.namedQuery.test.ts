import * as assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { Controllers } from '../../src/controllers/webservice/ReportController';

describe('ReportController authenticated named queries', () => {
  it('passes the authenticated user to relation-filter execution', async () => {
    const names = ['BrandingService', 'NamedQueryService'];
    const previous = names.map(name => (global as any)[name]);
    const user = { username: 'caller' };
    const config = { relatedRecordFilters: [{ relationId: 'activities' }] };
    (global as any).BrandingService = { getBrand: () => ({ id: 'brand-1' }) };
    const execute = sinon.stub().callsFake(async (...args: any[]) => {
      assert.equal(args[5], user);
      return { total: 1, records: [{ title: 'Authorized match' }] };
    });
    (global as any).NamedQueryService = { getNamedQueryConfig: async () => config, performNamedQueryFromConfig: execute };
    try {
      const controller = new Controllers.Report();
      sinon.stub(controller as any, 'updateChronicle');
      sinon.stub(controller as any, 'getNoCacheHeaders').returns({});
      const send = sinon.stub(controller as any, 'sendResp');
      await controller.executeNamedQuery({ user, session: { branding: 'default' }, apiRequest: { query: { queryName: 'related' } } } as any, {} as any);
      assert.equal(execute.callCount, 1);
      assert.equal(send.firstCall.args[2].status, 200);
    } finally {
      names.forEach((name, i) => (global as any)[name] = previous[i]);
      sinon.restore();
    }
  });
});
