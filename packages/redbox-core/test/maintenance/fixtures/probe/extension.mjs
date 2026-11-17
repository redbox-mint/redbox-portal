await Promise.resolve();
const fail = () => {
  throw new Error('Maintenance executed business work');
};
export function registerRedboxExtension() {
  return {
    apiVersion: 2,
    modules: [
      { name: 'maintenanceProbe', requires: ['records'], create: fail },
      { name: 'records', replaces: true, create: fail },
    ],
    controllers: [{ name: 'MaintenanceInstitution', actions: ['latestPdf'], requires: ['records'], create: fail }],
    routes: [{
      name: 'maintenance-latest-pdf', method: 'get', path: '/institution/:oid/latest-pdf',
      controller: 'MaintenanceInstitution', action: 'latestPdf', access: { kind: 'public' },
    }],
    migrations: [{ name: '000-must-not-run', run: fail }],
    bootstrap: [{ name: 'must-not-bootstrap', run: fail }],
    workflows: { institutionRecord: { draft: { form: 'institution-form' } } },
    forms: { 'institution-form': { name: 'institution-form' } },
    config: { agendaQueue: { jobs: { probe: { fnName: 'unbound', schedule: { method: 'now' } } } } },
  };
}
