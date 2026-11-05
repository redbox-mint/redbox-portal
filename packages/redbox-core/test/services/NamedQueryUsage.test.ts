import { expect } from 'chai';
import * as sinon from 'sinon';
import { Services } from '../../src/services/NamedQueryService';
import { buildNamedQueryUsage, configuredQueryNames } from '../../src/services/named-query/usage';

const empty = () => ({ reports: [], dashboards: {}, dashboardTypes: [], recordTypes: [], workflowSteps: [], views: {}, vocabularies: {}, forms: [], appConfigs: [] });

describe('Named query usage', () => {
  it('finds database reports, never Solr or partial-name matches', () => {
    const usage = buildNamedQueryUsage({ ...empty(), reports: [
      { name: 'one', title: 'One', reportSource: 'database', databaseQuery: { queryName: 'query' } },
      { name: 'two', reportSource: 'database', databaseQuery: { queryName: 'query-long' } },
      { name: 'solr', reportSource: 'solr', databaseQuery: { queryName: 'query' } }
    ] });
    expect(usage.query).to.deep.equal([{ type: 'report', name: 'One', path: '/admin/report/one' }]);
    expect(usage['query-long']).to.have.length(1);
    expect(usage.quer).to.equal(undefined);
  });

  it('finds workflow, view-step and dashboard-type data sources and deduplicates a target', () => {
    const source = { dataSource: { type: 'namedQuery', name: 'query' } };
    const usage = buildNamedQueryUsage({ ...empty(),
      dashboards: { workflows: { party: { draft: source } }, views: { parties: { all: source } } },
      dashboardTypes: [{ name: 'party', ...source }], recordTypes: [{ id: 'rt', name: 'party' }],
      workflowSteps: [{ recordType: 'rt', name: 'draft', config: source }],
    });
    expect(usage.query.map(consumer => consumer.name)).to.deep.equal(['party · draft', 'parties · all', 'party']);
    expect(decodeURIComponent(usage.query[0].path)).to.include('["workflow","party","draft"]');
  });

  it('finds vocabulary aliases, form typeaheads and integration settings', () => {
    const usage = buildNamedQueryUsage({ ...empty(),
      vocabularies: { alias: { querySource: 'database', databaseQuery: { queryName: 'query' } }, solr: { querySource: 'solr', databaseQuery: { queryName: 'query' } } },
      forms: [{ name: 'form', configuration: { fields: [{ sourceType: 'namedQuery', queryId: 'alias' }, { sourceType: 'static', queryId: 'alias' }] } }],
      appConfigs: [{ configKey: 'figshare', configData: { workflow: { transitionJob: { namedQuery: 'query' } } } }],
    });
    expect(usage.query.map(consumer => consumer.type)).to.deep.equal(['vocabulary', 'form', 'configuration']);
    expect(JSON.stringify(usage)).not.to.include('transitionJob');
  });

  it('ignores incidental text and query bodies', () => {
    expect(configuredQueryNames({ title: 'query', template: 'query', queryName: 'query', mongoQuery: { namedQuery: 'query' }, dataSource: { type: 'solr', name: 'query' } })).to.deep.equal([]);
  });

  it('loads all persisted consumer types with brand criteria, and workflow steps with brand-owned ids', async () => {
    const globals = global as any;
    const names = ['sails', 'RBReport', 'DashboardConfiguration', 'DashboardType', 'RecordType', 'WorkflowStep', 'Form', 'AppConfigService'];
    const originals = names.map(name => globals[name]);
    try {
      globals.sails = { config: {} };
      for (const name of names.slice(1)) globals[name] = { find: sinon.stub().resolves([]), findOne: sinon.stub().resolves(null) };
      globals.AppConfigService = { getMaskedAppConfigurationForBrand: sinon.stub().callsFake((brand: string) => ({ integration: { namedQuery: brand + 'Query' } })) };
      globals.RecordType.find.callsFake(async ({ branding }: any) => [{ id: `${branding}-rt`, name: branding }]);
      globals.RBReport.find.callsFake(async ({ branding }: any) => [{ name: branding, reportSource: 'database', databaseQuery: { queryName: 'query' } }]);
      const service = new Services.NamedQueryService();
      const a = await service.getUsage({ id: 'a', name: 'a' } as any);
      const b = await service.getUsage({ id: 'b', name: 'b' } as any);
      expect(a.query[0].name).to.equal('a');
      expect(b.query[0].name).to.equal('b');
      for (const name of ['RBReport', 'DashboardType', 'RecordType', 'Form']) {
        expect(globals[name].find.firstCall.args[0]).to.deep.equal({ branding: 'a' });
        expect(globals[name].find.callCount).to.equal(2);
      }
      expect(a.aQuery[0].type).to.equal('configuration');
      expect(b.aQuery).to.equal(undefined);
      expect(globals.AppConfigService.getMaskedAppConfigurationForBrand.calledWithExactly('a')).to.equal(true);
      expect(globals.DashboardConfiguration.findOne.firstCall.args[0]).to.deep.equal({ branding: 'a' });
      expect(globals.WorkflowStep.find.firstCall.args[0]).to.deep.equal({ recordType: { in: ['a-rt'] } });
    } finally { names.forEach((name, index) => { globals[name] = originals[index]; }); }
  });
});
