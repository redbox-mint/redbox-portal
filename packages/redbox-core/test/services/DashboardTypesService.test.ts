let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { firstValueFrom, of } from 'rxjs';
import { Services } from '../../src/services/DashboardTypesService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('DashboardTypesService', function () {
  let service: Services.DashboardTypes;

  beforeEach(function () {
    const mockSails = createMockSails();
    mockSails.config.dashboardtype = {
      standard: { formatRules: { filterBy: {} } }
    };
    mockSails.config.dashboardview = {
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
    mockSails.config.appmode = { bootstrapAlways: false };

    setupServiceTestGlobals(mockSails);

    const mockDeferred = (result: unknown) => {
      const p: any = Promise.resolve(result);
      p.exec = sinon.stub().yields(null, result);
      return p;
    };

    (global as any).DashboardType = {
      find: sinon.stub().callsFake(() => mockDeferred([])),
      create: sinon.stub().callsFake((data: unknown) => mockDeferred(data)),
      destroy: sinon.stub().callsFake(() => mockDeferred([])),
      findOne: sinon.stub().callsFake(() => mockDeferred(null)),
      updateOne: sinon.stub().callsFake(() => ({ set: sinon.stub().callsFake((data: unknown) => mockDeferred(data)) }))
    };

    (global as any).AppConfigService = {
      getAppConfigByBrandAndKey: sinon.stub().resolves({ recordTypes: {}, views: {} })
    };

    (global as any).RecordTypesService = {
      get: sinon.stub().returns(of({ name: 'rdmp', id: 'rt1' })),
      getAll: sinon.stub().returns(of([{ name: 'rdmp', id: 'rt1' }]))
    };

    (global as any).WorkflowStepsService = {
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

    (global as any).DashboardConfigService = {
      getMergedDashboardTableConfig: sinon.stub().resolves(null),
      getMergedDashboardViewTableConfig: sinon.stub().resolves(null),
      getMergedDashboardTypeFormatRules: sinon.stub().resolves({ filterBy: {}, queryFilters: {} })
    };

    service = new Services.DashboardTypes();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).DashboardType;
    delete (global as any).AppConfigService;
    delete (global as any).RecordTypesService;
    delete (global as any).WorkflowStepsService;
    delete (global as any).DashboardConfigService;
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
    (global as any).DashboardType.find = sinon.stub().resolves([{ name: 'standard' }]);

    const result = await service.bootstrap({ id: 'brand1' } as any);

    expect(result[0].system).to.equal(true);
  });

  it('rejects deleting assigned dashboard types', async function () {
    (global as any).AppConfigService.getAppConfigByBrandAndKey = sinon.stub().resolves({
      recordTypes: {
        rdmp: {
          default: { dashboardType: 'standard' }
        }
      },
      views: {}
    });
    (global as any).DashboardType.findOne = sinon.stub().callsFake(() => ({
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
    (global as any).sails.config.workflow = {
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
    (global as any).DashboardType.findOne = sinon.stub().callsFake(() => {
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

  it('merges dashboard view templates with merged dashboard config', async function () {
    (global as any).DashboardConfigService.getMergedDashboardViewTableConfig = sinon.stub().resolves({
      dashboardType: 'consolidated',
      inheritedTypeConfig: { rowConfig: [] },
      workflowConfig: { rowConfig: [{ title: 'Override', variable: 'metadata.title', template: 'override' }] },
      overrideConfig: null,
      mergedConfig: { rowConfig: [{ title: 'Override', variable: 'metadata.title', template: 'override' }] },
      formatRules: {}
    });

    const templates = await service.extractDashboardViewTemplates({ id: 'brand1' } as any, 'consolidated', 'consolidated');
    expect(templates).to.be.an('array');
    expect(templates.length).to.be.greaterThan(0);
  });
});
