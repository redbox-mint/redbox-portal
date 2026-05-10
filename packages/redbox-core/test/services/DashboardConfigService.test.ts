let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Services } from '../../src/services/DashboardConfigService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { of } from 'rxjs';

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
      standard: { searchFilters: [], formatRules: { filterBy: {} } }
    };
    mockSails.config.workflow = {
      rdmp: {
        draft: {
          config: {
            workflow: { stage: 'draft', stageLabel: 'Draft' },
            authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
            form: 'default-1.0-draft',
            dashboard: {
              table: {
                rowConfig: [
                  { title: 'Record Title', variable: 'metadata.title', template: '<a href="/view/{{oid}}">{{title}}</a>' }
                ],
                formatRules: { sortBy: 'metaMetadata.lastSaveDate' }
              }
            }
          },
          starting: true
        }
      }
    };

    setupServiceTestGlobals(mockSails);

    const mockDeferred = (result: unknown) => {
      const p: any = Promise.resolve(result);
      p.exec = sinon.stub().yields(null, result);
      return p;
    };

    (global as any).RecordType = {
      find: sinon.stub().callsFake(() => mockDeferred([])),
      findOne: sinon.stub().callsFake(() => mockDeferred(null))
    };

    (global as any).WorkflowStep = {
      find: sinon.stub().callsFake(() => mockDeferred([])),
      findOne: sinon.stub().callsFake(() => mockDeferred(null))
    };

    (global as any).DashboardType = {
      find: sinon.stub().callsFake(() => mockDeferred([])),
      findOne: sinon.stub().callsFake(() => mockDeferred(null)),
      create: sinon.stub().callsFake(() => mockDeferred({}))
    };

    (global as any).AppConfig = {
      find: sinon.stub().callsFake(() => mockDeferred([])),
      create: sinon.stub().callsFake((data: any) => mockDeferred(data)),
      updateOne: sinon.stub().returns({ set: sinon.stub().callsFake(() => mockDeferred({ configData: {} })) })
    };

    (global as any).AppConfigService = {
      getAppConfigByBrandAndKey: sinon.stub().resolves({ recordTypes: {}, views: {}, dashboardTypes: {} }),
      createOrUpdateConfig: sinon.stub().resolves({ recordTypes: {}, views: {}, dashboardTypes: {} })
    };

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
      get: sinon.stub().returns(of({ name: 'standard', formatRules: { filterBy: {} } }))
    };

    (global as any).BrandingService = {
      getBrandNameFromReq: sinon.stub().returns('default'),
      getBrand: sinon.stub().returns({ id: 'brand1', name: 'default' }),
      getAvailable: sinon.stub().returns(['default']),
      getDefault: sinon.stub().returns({ id: 'brand1', name: 'default' }),
      getBrandFromReq: sinon.stub().returns({ id: 'brand1', name: 'default' })
    };

    service = new Services.DashboardConfig();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).RecordType;
    delete (global as any).WorkflowStep;
    delete (global as any).DashboardType;
    delete (global as any).AppConfig;
    delete (global as any).AppConfigService;
    delete (global as any).RecordTypesService;
    delete (global as any).WorkflowStepsService;
    delete (global as any).DashboardTypesService;
    delete (global as any).BrandingService;
    sinon.restore();
  });

  describe('getDashboardConfigInfo', function () {
    it('should return config info for a brand', async function () {
      const brand = { id: 'brand1' };
      const info = await service.getDashboardConfigInfo(brand as any);
      expect(info.recordTypes).to.be.an('array');
      expect(info.views).to.be.an('array');
      expect(info.dashboardTypes).to.be.an('array');
    });
  });

  describe('getDashboardOverrides', function () {
    it('should return empty overrides when none exist', async function () {
      const brand = { id: 'brand1' };
      const overrides = await service.getDashboardOverrides(brand as any);
      expect(overrides).to.deep.equal({ recordTypes: {}, views: {}, dashboardTypes: {} });
    });
  });

  describe('saveDashboardOverrides', function () {
    it('should save overrides via AppConfigService', async function () {
      const brand = { id: 'brand1' };
      const newOverrides = { recordTypes: { rdmp: { default: { rowConfig: [] } } }, views: {}, dashboardTypes: {} };
      const saved = await service.saveDashboardOverrides(brand as any, newOverrides);
      expect((global as any).AppConfigService.createOrUpdateConfig.calledOnce).to.be.true;
    });
  });

  describe('getMergedDashboardTableConfig', function () {
    it('should return workflow config when no overrides exist', async function () {
      const brand = { id: 'brand1' };
      const config = await service.getMergedDashboardTableConfig(brand as any, 'rdmp', 'draft');
      expect(config).to.not.be.null;
      expect(config!.rowConfig).to.be.an('array');
      expect(config!.rowConfig![0].title).to.equal('Record Title');
    });

    it('should return default dashboard rows when workflow table config is missing', async function () {
      const brand = { id: 'brand1' };
      (global as any).WorkflowStepsService.get = sinon.stub().returns(of({
        name: 'draft',
        config: {
          workflow: { stage: 'draft', stageLabel: 'Draft' },
          authorization: { viewRoles: ['Admin'], editRoles: ['Admin'] },
          form: 'dataRecord-1.0-draft'
        }
      }));

      const config = await service.getMergedDashboardTableConfig(brand as any, 'dataRecord', 'draft');

      expect(config).to.not.be.null;
      expect(config!.rowConfig).to.be.an('array');
      expect(config!.rowConfig!.length).to.be.greaterThan(0);
      expect(config!.rowConfig![0].title).to.equal('Record Title');
    });

    it('should merge step-level override over workflow config', async function () {
      const brand = { id: 'brand1' };
      (global as any).AppConfigService.getAppConfigByBrandAndKey = sinon.stub().resolves({
        recordTypes: {
          rdmp: {
            steps: {
              draft: {
                rowConfig: [
                  { title: 'Overridden Title', variable: 'metadata.title', template: 'override' }
                ]
              }
            }
          }
        },
        views: {},
        dashboardTypes: {}
      });

      const config = await service.getMergedDashboardTableConfig(brand as any, 'rdmp', 'draft');
      expect(config).to.not.be.null;
      expect(config!.rowConfig![0].title).to.equal('Overridden Title');
    });

    it('should apply record-type default override when no step override exists', async function () {
      const brand = { id: 'brand1' };
      (global as any).AppConfigService.getAppConfigByBrandAndKey = sinon.stub().resolves({
        recordTypes: {
          rdmp: {
            default: {
              rowConfig: [
                { title: 'Default Override', variable: 'metadata.title', template: 'default-override' }
              ]
            }
          }
        },
        views: {},
        dashboardTypes: {}
      });

      const config = await service.getMergedDashboardTableConfig(brand as any, 'rdmp', 'draft');
      expect(config).to.not.be.null;
      expect(config!.rowConfig![0].title).to.equal('Default Override');
    });

    it('should let step override win over record-type default', async function () {
      const brand = { id: 'brand1' };
      (global as any).AppConfigService.getAppConfigByBrandAndKey = sinon.stub().resolves({
        recordTypes: {
          rdmp: {
            default: {
              rowConfig: [{ title: 'Default', variable: 'metadata.title', template: 'default' }]
            },
            steps: {
              draft: {
                rowConfig: [{ title: 'Step Override', variable: 'metadata.title', template: 'step' }]
              }
            }
          }
        },
        views: {},
        dashboardTypes: {}
      });

      const config = await service.getMergedDashboardTableConfig(brand as any, 'rdmp', 'draft');
      expect(config).to.not.be.null;
      expect(config!.rowConfig![0].title).to.equal('Step Override');
    });
  });

  describe('getMergedDashboardViewTableConfig', function () {
    it('should return view config when no overrides exist', async function () {
      const brand = { id: 'brand1' };
      const config = await service.getMergedDashboardViewTableConfig(brand as any, 'consolidated', 'consolidated');
      expect(config).to.not.be.null;
      expect(config!.rowConfig![0].title).to.equal('View Title');
    });

    it('should merge view step override', async function () {
      const brand = { id: 'brand1' };
      (global as any).AppConfigService.getAppConfigByBrandAndKey = sinon.stub().resolves({
        recordTypes: {},
        views: {
          consolidated: {
            steps: {
              consolidated: {
                rowConfig: [{ title: 'View Override', variable: 'metadata.title', template: 'view-override' }]
              }
            }
          }
        },
        dashboardTypes: {}
      });

      const config = await service.getMergedDashboardViewTableConfig(brand as any, 'consolidated', 'consolidated');
      expect(config).to.not.be.null;
      expect(config!.rowConfig![0].title).to.equal('View Override');
    });
  });

  describe('getMergedDashboardTypeFormatRules', function () {
    it('should return dashboard type format rules when no overrides exist', async function () {
      const brand = { id: 'brand1' };
      const rules = await service.getMergedDashboardTypeFormatRules(brand as any, 'standard');
      expect(rules).to.not.be.null;
    });
  });
});
