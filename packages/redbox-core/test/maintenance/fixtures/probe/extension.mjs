await Promise.resolve();
const fail = () => {
  throw new Error('Maintenance executed business work');
};
export function registerRedboxExtension() {
  return {
    apiVersion: 1,
    modules: [{ name: 'maintenanceProbe', create: fail }],
    migrations: [{ name: '000-must-not-run', run: fail }],
    bootstrap: [{ name: 'must-not-bootstrap', run: fail }],
    workflows: { institutionRecord: { draft: { form: 'institution-form' } } },
    forms: { 'institution-form': { name: 'institution-form' } },
    config: { agendaQueue: { jobs: { probe: { fnName: 'unbound', schedule: { method: 'now' } } } } },
  };
}
