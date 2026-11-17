let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import { saveWorkflowDashboardConfigRoute, saveViewDashboardConfigRoute, validateDashboardConfigRoute } from '../../src/api-routes/groups/dashboard-config';
import { builtInDashboardSettings } from '../../src/configmodels/DashboardSettings';

describe('Dashboard page size API contract', () => {
  for (const route of [saveWorkflowDashboardConfigRoute, saveViewDashboardConfigRoute, validateDashboardConfigRoute]) {
    it(`validates optional numeric sizes on ${route.path}`, () => {
      const schema = route.request!.body!.content['application/json'].schema!;
      const settings = builtInDashboardSettings();
      const body = { expectedRevision: 1, target: { kind: 'workflow', recordType: 'rdmp', stage: 'draft' }, settings };
      expect(schema.safeParse(body).success).to.equal(true);
      for (const rowsPerPage of [10, 25, 50, 100]) {
        expect(schema.safeParse({ ...body, settings: { ...settings, rowsPerPage } }).success).to.equal(true);
      }
      for (const rowsPerPage of [null, '25', 11, 0, -1, 25.5]) {
        expect(schema.safeParse({ ...body, settings: { ...settings, rowsPerPage } }).success).to.equal(false);
      }
    });
  }
});
