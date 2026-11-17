import { expect } from 'chai';
import { dashboardRecordFilters, dashboardRecordsApiRoutes } from '../../src/api-routes/groups/dashboard-records';
import { validateApiRequest } from '../../src/api-routes';
describe('dashboard record filter contract', () => {
  it('validates OR opt-in, legacy modes and literal search input', () => {
    for (const filterMode of [undefined, '', 'all', 'regex', 'equal', 'any']) {
      expect(dashboardRecordFilters.safeParse({ filterMode, filterFields: 'metadata.fullName,metadata.email', filter: 'a+.*(b)' }).success).to.equal(true);
    }
    for (const query of [{ filterMode: ['any'] }, { filterMode: 'or' }, { filterFields: '$where' }, { filterFields: 'metadata.__proto__' }, { filter: 'x'.repeat(1025) }]) {
      expect(dashboardRecordFilters.safeParse(query).success).to.equal(false);
    }
  });
});
