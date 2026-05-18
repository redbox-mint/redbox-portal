let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Services } from '../../src/services/DashboardConfigService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('DashboardConfigService', function () {
  let service: Services.DashboardConfig;
  let mockSails: any;

  beforeEach(function () {
    mockSails = createMockSails();
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
            dashboardTable: {
              rowConfig: [
                { title: 'View Title', variable: 'metadata.title', template: '{{title}}' }
              ]
            }
          }
        ]
      }
    };
    mockSails.config.dashboardtype = {
      standard: { formatRules: { filterBy: {} }, tableConfig: { rowConfig: [] } },
      consolidated: { formatRules: { filterBy: {} }, tableConfig: { rowConfig: [] } }
    };
    setupServiceTestGlobals(mockSails);

    (global as any).RecordTypesService = {
      get: sinon.stub().returns(of({ name: 'rdmp', id: 'rt1' })),
      getAll: sinon.stub().returns(of([{ name: 'rdmp', id: 'rt1' }]))
    };

    (global as any).WorkflowStepsService = {
      get: sinon.stub().returns(of({
        name: 'draft',
        config: {
          dashboard: {
            table: {
              rowConfig: [
                { title: 'Record Title', variable: 'metadata.title', template: '<a href="/view/{{oid}}">{{title}}</a>' }
              ],
              formatRules: { sortBy: 'metaMetadata.lastSaveDate' }
            }
          }
        }
      })),
      getAllForRecordType: sinon.stub().returns(of([{ name: 'draft' }]))
    };

    (global as any).DashboardTypesService = {
      getDashboardTypeDefinition: sinon.stub().resolves({
        name: 'standard',
        formatRules: { filterBy: {}, queryFilters: { rdmp: [{ filterFields: [{ template: '{{metadata.title}}' }] }] } },
        tableConfig: { rowConfig: [{ title: 'Type Title', variable: 'metadata.title', template: '{{metadata.title}}' }] }
      }),
      getAllDashboardTypeDefinitions: sinon.stub().resolves([
        {
          name: 'standard',
          formatRules: { filterBy: {} },
          tableConfig: { rowConfig: [] },
          searchable: true,
          system: true
        }
      ]),
      getMergedDashboardTypeFormatRules: sinon.stub().resolves({ filterBy: {}, queryFilters: { rdmp: [{ filterFields: [{ template: '{{metadata.title}}' }] }] } })
    };

    (global as any).AppConfigService = {
      getAppConfigByBrandAndKey: sinon.stub().resolves({ recordTypes: {}, views: {} }),
      createOrUpdateConfig: sinon.stub().resolves({ recordTypes: {}, views: {} })
    };

    (global as any).BrandingService = {
      getBrandFromReq: sinon.stub().returns({ id: 'brand1', name: 'default' }),
      getDefault: sinon.stub().returns({ id: 'brand1', name: 'default' })
    };

    service = new Services.DashboardConfig();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).RecordTypesService;
    delete (global as any).WorkflowStepsService;
    delete (global as any).DashboardTypesService;
    delete (global as any).AppConfigService;
    delete (global as any).BrandingService;
    sinon.restore();
  });

  it('returns dashboard config info with dashboard types', async function () {
    const info = await service.getDashboardConfigInfo({ id: 'brand1' } as any);
    expect(info.recordTypes).to.have.length(1);
    expect(info.views).to.have.length(1);
    expect(info.dashboardTypes).to.have.length(1);
  });

  it('returns strict empty overrides by default', async function () {
    const overrides = await service.getDashboardOverrides({ id: 'brand1' } as any);
    expect(overrides).to.deep.equal({ recordTypes: {}, views: {} });
  });

  it('saves strict overrides without dashboardTypes', async function () {
    const saved = await service.saveDashboardOverrides({ id: 'brand1' } as any, {
      recordTypes: {
        rdmp: {
          default: { dashboardType: 'standard' }
        }
      }
    });

    expect(saved.recordTypes?.rdmp?.default?.dashboardType).to.equal('standard');
    expect((global as any).AppConfigService.createOrUpdateConfig.calledOnce).to.be.true;
  });

  it('merges dashboard type, workflow config, and workflow override', async function () {
    (global as any).AppConfigService.getAppConfigByBrandAndKey = sinon.stub().resolves({
      recordTypes: {
        rdmp: {
          default: { dashboardType: 'standard', tableConfig: { rowConfig: [{ title: 'Default', variable: 'metadata.title', template: 'default' }] } },
          steps: {
            draft: { dashboardType: 'standard', tableConfig: { rowConfig: [{ title: 'Override', variable: 'metadata.title', template: 'override' }] } }
          }
        }
      },
      views: {}
    });

    const result = await service.getMergedDashboardTableConfig({ id: 'brand1' } as any, 'rdmp', 'draft');
    expect(result).to.not.be.null;
    expect(result!.dashboardType).to.equal('standard');
    expect(result!.inheritedTypeConfig.rowConfig).to.be.an('array');
    expect(result!.workflowConfig).to.not.be.null;
    expect(result!.overrideConfig).to.not.be.null;
    expect(result!.mergedConfig.rowConfig?.[0].title).to.equal('Override');
  });

  it('merges dashboard view type and override config', async function () {
    (global as any).AppConfigService.getAppConfigByBrandAndKey = sinon.stub().resolves({
      recordTypes: {},
      views: {
        consolidated: {
          default: { dashboardType: 'consolidated', tableConfig: { rowConfig: [{ title: 'View Default', variable: 'metadata.title', template: 'view-default' }] } },
          steps: {
            consolidated: { dashboardType: 'consolidated', tableConfig: { rowConfig: [{ title: 'View Override', variable: 'metadata.title', template: 'view-override' }] } }
          }
        }
      }
    });

    const result = await service.getMergedDashboardViewTableConfig({ id: 'brand1' } as any, 'consolidated', 'consolidated');
    expect(result).to.not.be.null;
    expect(result!.dashboardType).to.equal('consolidated');
    expect(result!.workflowConfig).to.not.be.null;
    expect(result!.overrideConfig).to.not.be.null;
    expect(result!.mergedConfig.rowConfig?.[0].title).to.equal('View Override');
  });

  it('returns merged dashboard type format rules', async function () {
    const rules = await service.getMergedDashboardTypeFormatRules({ id: 'brand1' } as any, 'standard');
    expect(rules).to.not.be.null;
    expect(rules?.filterBy).to.deep.equal({});
  });
});
