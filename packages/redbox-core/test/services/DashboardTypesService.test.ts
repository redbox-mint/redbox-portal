import { referenceFixtures, configurationFixtures } from '../helpers/serviceRepositories';
const collaborators: any = {};
let fixture: any;
import { repositoryFixtures } from '../helpers/repositoryFixtures';
let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { firstValueFrom, of } from 'rxjs';
import { Services } from '../../src/services/DashboardTypesService';
import { installRepositoryFixtures, restoreRepositoryFixtures, createDomainFixture } from './testHelper';

describe('DashboardTypesService', function () {
  let service: Services.DashboardTypes;

  beforeEach(function () {
    fixture = createDomainFixture();
    fixture.config.dashboardtype = {
      standard: { formatRules: { filterBy: {} } }
    };
    fixture.config.dashboardview = {
      consolidated: {
        name: 'consolidated',
        titleLabelKey: 'consolidated',
        dashboardType: 'consolidated',
        sourceRecordType: 'rdmp',
        steps: [
          {
            name: 'consolidated',
            sourceRecordType: 'rdmp',
            fetchMode: 'allForRecordType',
            dashboardTable: { rowConfig: [{ title: 'Record Title', variable: 'metadata.title', template: '{{metadata.title}}' }] }
          }
        ]
      }
    };
    fixture.config.appmode = { bootstrapAlways: false };

    installRepositoryFixtures();

    const mockDeferred = (result: unknown) => {
      const p: any = Promise.resolve(result);
      p.exec = sinon.stub().yields(null, result);
      return p;
    };

    repositoryFixtures.DashboardType = {
      find: sinon.stub().callsFake(() => mockDeferred([])),
      create: sinon.stub().callsFake((data: unknown) => mockDeferred(data)),
      destroy: sinon.stub().callsFake(() => mockDeferred([])),
      findOne: sinon.stub().callsFake(() => mockDeferred(null)),
      updateOne: sinon.stub().callsFake(() => ({ set: sinon.stub().callsFake((data: unknown) => mockDeferred(data)) }))
    };

    repositoryFixtures.AppConfig = {
      find: sinon.stub().resolves([])
    };

    collaborators.RecordTypesService = {
      get: sinon.stub().returns(of({ name: 'rdmp', id: 'rt1' })),
      getAll: sinon.stub().returns(of([{ name: 'rdmp', id: 'rt1' }]))
    };

    collaborators.WorkflowStepsService = {
      get: sinon.stub().returns(of({
        config: {
          dashboard: {
            table: {
              rowConfig: [{ title: 'Record Title', variable: 'metadata.title', template: '{{metadata.title}}' }]
            }
          }
        }
      })),
      getAllForRecordType: sinon.stub().returns(of([{ name: 'draft' }]))
    };

    collaborators.DashboardConfigService = {
      getRuntimeTargetSettings: sinon.stub().resolves(null)
    };

    service = new Services.DashboardTypes({ references: referenceFixtures(), configuration: configurationFixtures(), config: fixture.config, log: fixture.log, get recordTypes() { return collaborators.RecordTypesService; }, get dashboardConfig() { return collaborators.DashboardConfigService; } });
  });

  afterEach(function () {
    restoreRepositoryFixtures();
    delete repositoryFixtures.DashboardType;
    delete repositoryFixtures.AppConfig;
    delete collaborators.RecordTypesService;
    delete collaborators.WorkflowStepsService;
    delete collaborators.DashboardConfigService;
    sinon.restore();
  });

  it('bootstraps dashboard types from config', async function () {
    const result = await service.bootstrap({ id: 'brand1' } as any);
    expect(result).to.have.length(1);
    expect(result[0].name).to.equal('standard');
    expect(result[0].system).to.equal(true);
  });

  it('creates dashboard types', async function () {
    const created = await firstValueFrom(service.createDashboardType({ id: 'brand1', name: 'default' } as any, {
      name: 'default',
      formatRules: { filterBy: {} },
      tableConfig: { rowConfig: [] },
      searchable: true,
      system: false
    }));

    expect(created?.name).to.equal('default');
  });

  it('treats existing config-backed dashboard types as system types', async function () {
    repositoryFixtures.DashboardType.find = sinon.stub().resolves([{ name: 'standard' }]);

    const result = await service.bootstrap({ id: 'brand1' } as any);

    expect(result[0].system).to.equal(true);
  });

  it('rejects deleting assigned dashboard types', async function () {
    repositoryFixtures.AppConfig.find = sinon.stub().resolves([
      {
        updatedAt: '2026-02-01T00:00:00.000Z',
        configData: {
          recordTypes: {
            rdmp: {
              default: { dashboardType: 'standard' }
            }
          },
          views: {}
        }
      },
      { updatedAt: '2026-01-01T00:00:00.000Z', configData: { recordTypes: {}, views: {} } }
    ]);
    repositoryFixtures.DashboardType.findOne = sinon.stub().callsFake(() => ({
      exec: (cb: (err: any, result: any) => void) => cb(null, {
        branding: { id: 'brand1', name: 'default' },
        name: 'standard',
        formatRules: { filterBy: {} },
        tableConfig: { rowConfig: [] },
        searchable: true,
        system: false
      }),
      then: (onFulfilled: any) => Promise.resolve(onFulfilled({
        branding: { id: 'brand1', name: 'default' },
        name: 'standard',
        formatRules: { filterBy: {} },
        tableConfig: { rowConfig: [] },
        searchable: true,
        system: false
      }))
    }));

    try {
      await firstValueFrom(service.deleteDashboardType({ id: 'brand1', name: 'default' } as any, 'standard'));
      expect.fail('delete should have failed');
    } catch (err) {
      expect(String(err)).to.contain('workflow states or dashboard views');
    }
  });

  it('rejects deleting dashboard types assigned by static workflow config', async function () {
    fixture.config.workflow = {
      rdmp: {
        draft: {
          config: {
            dashboard: {
              dashboardType: 'standard',
              table: { rowConfig: [] }
            }
          }
        }
      }
    };
    repositoryFixtures.DashboardType.findOne = sinon.stub().callsFake(() => {
      const result = {
        branding: { id: 'brand1', name: 'default' },
        name: 'standard',
        formatRules: { filterBy: {} },
        tableConfig: { rowConfig: [] },
        searchable: true,
        system: false
      };
      const p: any = Promise.resolve(result);
      p.exec = sinon.stub().yields(null, result);
      return p;
    });

    try {
      await firstValueFrom(service.deleteDashboardType({ id: 'brand1', name: 'default' } as any, 'standard'));
      expect.fail('delete should have failed');
    } catch (err) {
      expect(String(err)).to.contain('workflow states or dashboard views');
    }
  });

  describe('template extraction from independent settings', function () {
    const settings = {
      searchable: true,
      showStageTitle: true,
      tableConfig: {
        rowConfig: [{ title: 'Title', variable: 'metadata.title', template: '{{metadata.title}}' }, { title: 'Blank', variable: 'x', template: '' }],
        rowRulesConfig: [{ ruleSetName: 'actions', applyRuleSet: true, rules: [{ name: 'Edit', action: 'show', renderItemTemplate: 'edit', evaluateRulesTemplate: 'true' }] }],
        groupRowConfig: [],
        groupRowRulesConfig: [],
        formatRules: { queryFilters: { rdmp: [{ filterType: 'text', filterFields: [{ name: 'Title', path: 'metadata.title', template: '{{value}}*' }] }] } }
      }
    };

    it('keys templates by brand, target and settings fingerprint', async function () {
      collaborators.DashboardConfigService.getRuntimeTargetSettings = sinon.stub().resolves({ settings, fingerprint: 'abcdef0123456789ffff' });

      const templates = await service.extractDashboardTemplates({ id: 'brand1', name: 'default' } as any, 'rdmp', 'draft', 'abcdef0123456789ffff');
      const keys = templates.map((t) => t.key.join('|'));

      expect(collaborators.DashboardConfigService.getRuntimeTargetSettings.firstCall.args.slice(1)).to.deep.equal([{ kind: 'workflow', recordType: 'rdmp', stage: 'draft' }, 'abcdef0123456789ffff']);
      expect(keys).to.include('default|workflow|rdmp|draft|abcdef0123456789|rowConfig|0|metadata.title');
      expect(keys).to.include('default|workflow|rdmp|draft|abcdef0123456789|rowRules|actions|0|render');
      expect(keys).to.include('default|workflow|rdmp|draft|abcdef0123456789|rowRules|actions|0|evaluate');
      expect(keys).to.include('default|workflow|rdmp|draft|abcdef0123456789|filters|rdmp|0|fields|0|template');
      // Empty templates stay empty rather than being replaced.
      expect(keys.some((k) => k.includes('rowConfig|1'))).to.equal(false);
    });

    it('does not substitute built-in columns for an empty column list', async function () {
      collaborators.DashboardConfigService.getRuntimeTargetSettings = sinon.stub().resolves({
        settings: { ...settings, tableConfig: { ...settings.tableConfig, rowConfig: [], rowRulesConfig: [], formatRules: {} } },
        fingerprint: 'ffff'
      });
      const templates = await service.extractDashboardTemplates({ id: 'brand1', name: 'default' } as any, 'rdmp', 'draft');
      expect(templates).to.deep.equal([]);
    });

    it('extracts view step templates under the view target', async function () {
      collaborators.DashboardConfigService.getRuntimeTargetSettings = sinon.stub().resolves({ settings, fingerprint: '1234' });
      const templates = await service.extractDashboardViewTemplates({ id: 'brand1', name: 'default' } as any, 'consolidated', 'consolidated');
      expect(templates[0].key.slice(0, 5)).to.deep.equal(['default', 'view', 'consolidated', 'consolidated', '1234']);
    });

    it('returns nothing for an unknown view step', async function () {
      const templates = await service.extractDashboardViewTemplates({ id: 'brand1', name: 'default' } as any, 'consolidated', 'missing');
      expect(templates).to.deep.equal([]);
      expect(collaborators.DashboardConfigService.getRuntimeTargetSettings.called).to.equal(false);
    });
  });
});
