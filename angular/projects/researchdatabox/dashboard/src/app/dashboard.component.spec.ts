import { TestBed } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { FormsModule } from "@angular/forms";
import { APP_BASE_HREF } from '@angular/common';
import { I18NextModule, I18NEXT_SERVICE } from 'angular-i18next';
import { UtilityService, LoggerService, ConfigService, TranslationService, RecordService, UserService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService, getStubRecordService, getStubUserService } from '@researchdatabox/portal-ng-common';

const username = 'testUser';
const password = 'some-password';
const dashboardTypeOptions: any = ['standard', 'workspace', 'consolidated'];
let recordDataStandard = {
  dashboardType:
  {
    formatRules: {
      filterBy: [],
      filterWorkflowStepsBy: [],
      queryFilters: {
        rdmp: [
          {
            filterType: 'text',
            filterFields: [
              {
                name: 'Title',
                path: 'metadata.title'
              }
            ]
          }
        ]
      },
      groupBy: '',
      sortGroupBy: [],
      hideWorkflowStepTitleForRecordType: []
    }
  },
  step: [{
    name: 'draft',
    config: {
      workflow: {
        stage: 'draft'
      },
      dashboard: {
        table: {
          dummyRowConfig: ['dummy'] //intentionally not using rowConfig to avoid overriding the default but making sure config.dashboard.table is not undefined
        }
      }
    }
  }],
  records: {
    items: [
      {
        oid: '1234567890',
        title: 'test',
        dateCreated: 'dateCreated',
        dateModified: 'dateModified',
        metadata: {
          metaMetadata: {
            type: 'rdmp',
            lastSaveDate: ''
          },
          metadata: { title: 'test' },
          packageType: 'rdmp',
          workflow: '',
          hasEditAccess: '',
          recordType: 'rdmp'
        }
      }
    ],
    totalItems: 0,
    currentPage: 1,
    noItems: 10
  },
  paginationData: {
    itemsPerPage: 10,
    page: 2,
    step: 'draft'
  }
};

describe('DashboardComponent standard', () => {
  beforeEach(async () => {
    let configService = getStubConfigService();
    let translationService = getStubTranslationService();
    let recordService = getStubRecordService(recordDataStandard);
    let userService = getStubUserService(username, password);

    const testModule = TestBed.configureTestingModule({
      declarations: [
        DashboardComponent
      ],
      imports: [
        FormsModule,
        I18NextModule.forRoot()
      ],
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: 'base'
        },
        LoggerService,
        UtilityService,
        {
          provide: TranslationService,
          useValue: translationService
        },
        {
          provide: ConfigService,
          useValue: configService
        },
        {
          provide: RecordService,
          useValue: recordService
        },
        {
          provide: UserService,
          useValue: userService
        }
      ]
    });
    TestBed.inject(RecordService);
    await testModule.compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    expect(dashboardComponent).toBeTruthy();
  });

  it(`should have a set a pre defined dashboard type options`, () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    expect(dashboardComponent.dashboardTypeOptions).toEqual(dashboardTypeOptions);
  });

  it(`should have a default dashboard type`, () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    expect(dashboardComponent.dashboardTypeSelected).toEqual(dashboardComponent.defaultDashboardTypeSelected);
  });

  it(`init view`, async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    await dashboardComponent.initView('rdmp');
    expect(dashboardComponent.defaultRowConfig.length).toBeGreaterThan(0);
    expect(dashboardComponent.dashboardTypeSelected).toEqual('standard');
    let defaultSortObject = {
      sort: 'desc',
      secondarySort: '',
      step: 'draft',
      title: '',
      variable: 'metaMetadata.lastSaveDate'
    };
    await dashboardComponent.initStep('draft', 'draft', 'rdmp', '', 1, defaultSortObject);
    let planTable = dashboardComponent.evaluatePlanTableColumns({}, {}, {}, 'draft', recordDataStandard['records']);
    expect(planTable.items.length).toBeGreaterThan(0);
    expect(dashboardComponent.sortMap['draft']['metaMetadata.lastSaveDate'].sort).toEqual('desc');
    dashboardComponent.pageChanged(recordDataStandard['paginationData'], recordDataStandard['paginationData'].step);
    expect(dashboardComponent.records['draft'].currentPage).toEqual(1);
    expect(dashboardComponent.records['draft'].items.length).toBeGreaterThan(0);
  });

  // getSecondarySortStringFromSortMap tests
  describe('getSecondarySortStringFromSortMap', () => {
    it('returns empty string when sortFields is empty', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = {};
      const secondarySort = dashboardComponent.getSecondarySortStringFromSortMap({}, 'draft');
      expect(secondarySort).toEqual('');
    });

    it('returns empty string when sortFields is undefined', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = undefined;
      const secondarySort = dashboardComponent.getSecondarySortStringFromSortMap({}, 'draft');
      expect(secondarySort).toEqual('');
    });

    it('returns empty string when sortMapAtStep is undefined', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const secondarySort = dashboardComponent.getSecondarySortStringFromSortMap(undefined, 'draft');
      expect(secondarySort).toEqual('');
    });

    it('returns empty string when sortMapAtStep is empty', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const secondarySort = dashboardComponent.getSecondarySortStringFromSortMap({}, 'draft');
      expect(secondarySort).toEqual('');
    });

    it('returns empty string when sortField is not in sortMapAtStep', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'otherField': { sort: 'desc', secondarySort: 'date' } };
      const secondarySort = dashboardComponent.getSecondarySortStringFromSortMap(sortMapAtStep, 'draft');
      expect(secondarySort).toEqual('');
    });

    it('returns descending secondary sort string when sort is desc and secondarySort is set', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'title': { sort: 'desc', secondarySort: 'dateCreated' } };
      const secondarySort = dashboardComponent.getSecondarySortStringFromSortMap(sortMapAtStep, 'draft');
      expect(secondarySort).toEqual('dateCreated:-1');
    });

    it('returns ascending secondary sort string when sort is asc and secondarySort is set', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'title': { sort: 'asc', secondarySort: 'dateCreated' } };
      const secondarySort = dashboardComponent.getSecondarySortStringFromSortMap(sortMapAtStep, 'draft');
      expect(secondarySort).toEqual('dateCreated:1');
    });

    it('returns empty string when sort is desc but secondarySort is empty', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'title': { sort: 'desc', secondarySort: '' } };
      const secondarySort = dashboardComponent.getSecondarySortStringFromSortMap(sortMapAtStep, 'draft');
      expect(secondarySort).toEqual('');
    });

    it('returns empty string when sort is asc but secondarySort is empty', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'title': { sort: 'asc', secondarySort: '' } };
      const secondarySort = dashboardComponent.getSecondarySortStringFromSortMap(sortMapAtStep, 'draft');
      expect(secondarySort).toEqual('');
    });

    it('returns empty string when sort is null', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'title': { sort: null, secondarySort: 'dateCreated' } };
      const secondarySort = dashboardComponent.getSecondarySortStringFromSortMap(sortMapAtStep, 'draft');
      expect(secondarySort).toEqual('');
    });

    it('returns empty string when sortField is empty string', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: [''] };
      const sortMapAtStep = { '': { sort: 'desc', secondarySort: 'dateCreated' } };
      const secondarySort = dashboardComponent.getSecondarySortStringFromSortMap(sortMapAtStep, 'draft');
      expect(secondarySort).toEqual('');
    });

    it('handles step that does not exist in sortFields', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'title': { sort: 'desc', secondarySort: 'dateCreated' } };
      const secondarySort = dashboardComponent.getSecondarySortStringFromSortMap(sortMapAtStep, 'nonexistent');
      expect(secondarySort).toEqual('');
    });

    it('uses first matching field with sort when multiple fields exist', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title', 'date', 'name'] };
      const sortMapAtStep = {
        'title': { sort: null, secondarySort: 'field1' },
        'date': { sort: 'asc', secondarySort: 'field2' },
        'name': { sort: 'desc', secondarySort: 'field3' }
      };
      const secondarySort = dashboardComponent.getSecondarySortStringFromSortMap(sortMapAtStep, 'draft');
      expect(secondarySort).toEqual('field2:1');
    });

    it('returns empty string when secondarySort is undefined', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'title': { sort: 'desc' } };
      const secondarySort = dashboardComponent.getSecondarySortStringFromSortMap(sortMapAtStep, 'draft');
      expect(secondarySort).toEqual('');
    });
  });

  // getSortStringFromSortMap tests
  describe('getSortStringFromSortMap', () => {
    it('returns default sort when sortFields is empty', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = {};
      const sortString = dashboardComponent.getSortStringFromSortMap({}, 'draft');
      expect(sortString).toEqual('metaMetadata.lastSaveDate:-1');
    });

    it('returns default sort when sortFields is undefined', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = undefined;
      const sortString = dashboardComponent.getSortStringFromSortMap({}, 'draft');
      expect(sortString).toEqual('metaMetadata.lastSaveDate:-1');
    });

    it('returns default sort when sortMapAtStep is undefined', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortString = dashboardComponent.getSortStringFromSortMap(undefined, 'draft');
      expect(sortString).toEqual('metaMetadata.lastSaveDate:-1');
    });

    it('returns default sort when sortMapAtStep is empty', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortString = dashboardComponent.getSortStringFromSortMap({}, 'draft');
      expect(sortString).toEqual('metaMetadata.lastSaveDate:-1');
    });

    it('returns default sort when sortField is not in sortMapAtStep', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'otherField': { sort: 'desc' } };
      const sortString = dashboardComponent.getSortStringFromSortMap(sortMapAtStep, 'draft');
      expect(sortString).toEqual('metaMetadata.lastSaveDate:-1');
    });

    it('returns descending sort string when sort is desc', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'title': { sort: 'desc' } };
      const sortString = dashboardComponent.getSortStringFromSortMap(sortMapAtStep, 'draft');
      expect(sortString).toEqual('title:-1');
    });

    it('returns ascending sort string when sort is asc', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'title': { sort: 'asc' } };
      const sortString = dashboardComponent.getSortStringFromSortMap(sortMapAtStep, 'draft');
      expect(sortString).toEqual('title:1');
    });

    it('returns default sort when sort is null', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'title': { sort: null } };
      const sortString = dashboardComponent.getSortStringFromSortMap(sortMapAtStep, 'draft');
      expect(sortString).toEqual('metaMetadata.lastSaveDate:-1');
    });

    it('returns sort string with forceDefault=true and defaultSort=true for desc', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'title': { sort: 'desc', defaultSort: true } };
      const sortString = dashboardComponent.getSortStringFromSortMap(sortMapAtStep, 'draft', true);
      expect(sortString).toEqual('title:-1');
    });

    it('returns sort string with forceDefault=true and defaultSort=true for asc', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'title': { sort: 'asc', defaultSort: true } };
      const sortString = dashboardComponent.getSortStringFromSortMap(sortMapAtStep, 'draft', true);
      expect(sortString).toEqual('title:1');
    });

    it('continues to next field when forceDefault=true but defaultSort=false', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title', 'date'] };
      const sortMapAtStep = {
        'title': { sort: 'desc', defaultSort: false },
        'date': { sort: 'asc', defaultSort: true }
      };
      const sortString = dashboardComponent.getSortStringFromSortMap(sortMapAtStep, 'draft', true);
      expect(sortString).toEqual('date:1');
    });

    it('returns default sort when forceDefault=true but no field has defaultSort=true', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'title': { sort: 'desc', defaultSort: false } };
      const sortString = dashboardComponent.getSortStringFromSortMap(sortMapAtStep, 'draft', true);
      expect(sortString).toEqual('title:-1');
    });

    it('uses last matching field with sort when multiple fields exist', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title', 'date', 'name'] };
      const sortMapAtStep = {
        'title': { sort: null },
        'date': { sort: 'asc' },
        'name': { sort: 'desc' }
      };
      const sortString = dashboardComponent.getSortStringFromSortMap(sortMapAtStep, 'draft');
      expect(sortString).toEqual('name:-1');
    });

    it('returns default sort when sortField is empty string', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: [''] };
      const sortMapAtStep = { '': { sort: 'desc' } };
      const sortString = dashboardComponent.getSortStringFromSortMap(sortMapAtStep, 'draft');
      expect(sortString).toEqual('metaMetadata.lastSaveDate:-1');
    });

    it('handles step that does not exist in sortFields', () => {
      const fixture = TestBed.createComponent(DashboardComponent);
      const dashboardComponent = fixture.componentInstance as any;
      dashboardComponent.sortFields = { draft: ['title'] };
      const sortMapAtStep = { 'title': { sort: 'desc' } };
      const sortString = dashboardComponent.getSortStringFromSortMap(sortMapAtStep, 'nonexistent');
      expect(sortString).toEqual('metaMetadata.lastSaveDate:-1');
    });
  });
});

let recordDataWorkspace = {
  dashboardType:
  {
    formatRules: {
      filterBy: [],
      recordTypeFilterBy: 'existing-locations',
      filterWorkflowStepsBy: ['existing-locations-draft'],
      queryFilters: {
        workspace: [
          {
            filterType: 'text',
            filterFields: [
              {
                name: 'Title',
                path: 'metadata.title'
              }
            ]
          }
        ]
      },
      groupBy: '',
      sortGroupBy: [],
      hideWorkflowStepTitleForRecordType: []
    }
  },
  step: [{
    name: 'existing-locations-draft',
    config: {
      workflow: {
        stage: 'existing-locations-draft'
      },
      dashboard: {
        table: {
          dummyRowConfig: ['dummy'] //intentionally not using rowConfig to avoid overriding the default but making sure config.dashboard.table is not undefined
        }
      }
    }
  }],
  records: {
    items: [
      {
        oid: '1234567890',
        title: 'test',
        dateCreated: 'dateCreated',
        dateModified: 'dateModified',
        metadata: {
          metaMetadata: {
            type: 'rdmp',
            lastSaveDate: ''
          },
          metadata: { title: 'test' },
          packageType: 'workspace',
          workflow: '',
          hasEditAccess: '',
          recordType: 'existing-locations'
        }
      }
    ],
    totalItems: 0,
    currentPage: 1,
    noItems: 10
  },
  paginationData: {
    itemsPerPage: 10,
    page: 2,
    step: 'existing-locations-draft'
  }
};

describe('DashboardComponent workspace', () => {
  beforeEach(async () => {
    let configService = getStubConfigService();
    let translationService = getStubTranslationService();
    let recordService = getStubRecordService(recordDataWorkspace);
    let userService = getStubUserService(username, password);

    const testModule = TestBed.configureTestingModule({
      declarations: [
        DashboardComponent
      ],
      imports: [
        FormsModule,
        I18NextModule.forRoot()
      ],
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: 'base'
        },
        LoggerService,
        UtilityService,
        {
          provide: TranslationService,
          useValue: translationService
        },
        {
          provide: ConfigService,
          useValue: configService
        },
        {
          provide: RecordService,
          useValue: recordService
        },
        {
          provide: UserService,
          useValue: userService
        }
      ]
    });
    TestBed.inject(RecordService);
    await testModule.compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    expect(dashboardComponent).toBeTruthy();
  });

  it(`should have a set a pre defined dashboard type options`, () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    expect(dashboardComponent.dashboardTypeOptions).toEqual(dashboardTypeOptions);
  });

  it(`should have a default dashboard type`, () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    dashboardComponent.dashboardTypeSelected = 'workspace';
    expect(dashboardComponent.dashboardTypeSelected).toEqual('workspace');
  });

  it(`init view`, async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    dashboardComponent.dashboardTypeSelected = 'workspace';
    await dashboardComponent.initView('workspace');
    expect(dashboardComponent.defaultRowConfig.length).toBeGreaterThan(0);
    expect(dashboardComponent.dashboardTypeSelected).toEqual('workspace');
    let defaultSortObject = {
      sort: 'desc',
      secondarySort: '',
      step: 'draft',
      title: '',
      variable: 'metaMetadata.lastSaveDate'
    };
    await dashboardComponent.initStep('', 'existing-locations-draft', '', 'workspace', 1, defaultSortObject);
    let planTable = dashboardComponent.evaluatePlanTableColumns({}, {}, {}, 'existing-locations-draft', recordDataWorkspace['records']);
    expect(planTable.items.length).toBeGreaterThan(0);
    expect(dashboardComponent.sortMap['existing-locations-draft']['metaMetadata.lastSaveDate'].sort).toEqual('desc');
    dashboardComponent.pageChanged(recordDataWorkspace['paginationData'], recordDataWorkspace['paginationData'].step);
    expect(dashboardComponent.records['existing-locations-draft'].currentPage).toEqual(1);
    expect(dashboardComponent.records['existing-locations-draft'].items.length).toBeGreaterThan(0);
  });
});

let recordDataConsolidated = {
  dashboardType:
  {
    formatRules: {
      filterBy: [],
      filterWorkflowStepsBy: ['consolidated'],
      queryFilters: {
        rdmp: [
          {
            filterType: 'text',
            filterFields: [
              {
                name: 'Title',
                path: 'metadata.title'
              }
            ]
          }
        ]
      },
      sortBy: '',
      groupBy: 'groupedByRecordType',
      sortGroupBy: [{ rowLevel: 0, compareFieldValue: 'rdmp' }],
      hideWorkflowStepTitleForRecordType: []
    }
  },
  step: [{
    name: 'consolidated',
    config: {
      workflow: {
        stage: 'consolidated'
      },
      baseRecordType: 'rdmp',
      dashboard: {
        table: {
          rowRulesConfig: [
            {
              ruleSetName: 'dashboardActionsPerRow',
              applyRuleSet: true,
              type: 'multi-item-rendering',
              rules: [
                {
                  name: 'Edit',
                  action: 'show',
                  renderItemTemplate: `<%= name %>`,
                  evaluateRulesTemplate: `<%= true %>`
                }
              ]
            }
          ],
          groupRowConfig: [
            {
              title: 'Actions',
              variable: '',
              template: `<%= rulesService.evaluateGroupRowRules(groupRulesConfig, groupedItems, 'dashboardActionsPerGroupRow') %>`
            }
          ],
          groupRowRulesConfig: [
            {
              ruleSetName: 'dashboardActionsPerGroupRow',
              applyRuleSet: true,
              rules: [
                {
                  name: 'Send for Conferral',
                  action: 'show',
                  mode: 'alo',
                  renderItemTemplate: `<%= name %>`,
                  evaluateRulesTemplate: `<%= true %>`
                }
              ]
            }
          ]
        }
      }
    }
  }],
  records: {
    items: [
      {
        oid: '1234567890',
        title: 'test',
        dateCreated: 'dateCreated',
        dateModified: 'dateModified',
        metadata: {
          metaMetadata: {
            type: 'rdmp',
            lastSaveDate: ''
          },
          metadata: { title: 'test' },
          packageType: 'rdmp',
          workflow: '',
          hasEditAccess: '',
          recordType: 'rdmp'
        }
      }
    ],
    totalItems: 0,
    currentPage: 1,
    noItems: 10
  },
  groupedRecords: {
    totalItems: 1,
    currentPage: 1,
    noItems: 10,
    itemsByGroup: true,
    groupedItems:
      [
        {
          items: [
            {
              oid: '1234567890',
              title: 'test',
              dateCreated: 'dateCreated',
              dateModified: 'dateModified',
              metadata: {
                metaMetadata: {
                  type: 'rdmp',
                  lastSaveDate: ''
                },
                metadata: { title: 'test' },
                packageType: 'rdmp',
                workflow: '',
                hasEditAccess: '',
                recordType: 'rdmp'
              }
            }
          ]
        }
      ]
  },
  paginationData: {
    itemsPerPage: 10,
    page: 2,
    step: 'consolidated'
  }
};

describe('DashboardComponent consolidated group by record type', () => {
  beforeEach(async () => {
    let configService = getStubConfigService();
    let translationService = getStubTranslationService();
    let recordService = getStubRecordService(recordDataConsolidated);
    let userService = getStubUserService(username, password);

    const testModule = TestBed.configureTestingModule({
      declarations: [
        DashboardComponent
      ],
      imports: [
        FormsModule,
        I18NextModule.forRoot()
      ],
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: 'base'
        },
        LoggerService,
        UtilityService,
        {
          provide: TranslationService,
          useValue: translationService
        },
        {
          provide: ConfigService,
          useValue: configService
        },
        {
          provide: RecordService,
          useValue: recordService
        },
        {
          provide: UserService,
          useValue: userService
        }
      ]
    });
    TestBed.inject(RecordService);
    await testModule.compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    expect(dashboardComponent).toBeTruthy();
  });

  it(`should have a set a pre defined dashboard type options`, () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    expect(dashboardComponent.dashboardTypeOptions).toEqual(dashboardTypeOptions);
  });

  it(`should have a default dashboard type`, () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    dashboardComponent.dashboardTypeSelected = 'consolidated';
    expect(dashboardComponent.dashboardTypeSelected).toEqual('consolidated');
  });

  it(`init view`, async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    dashboardComponent.dashboardTypeSelected = 'consolidated';
    await dashboardComponent.initView('consolidated');
    console.log('===================== DashboardComponent consolidated group by record type =========================');
    console.log('==============================================');
    console.log('==============================================');
    console.log(JSON.stringify(dashboardComponent.sortFields));
    console.log(JSON.stringify(dashboardComponent.sortMap));
    console.log('==============================================');
    console.log('==============================================');
    console.log('==============================================');
    expect(dashboardComponent.workflowSteps.length).toBeGreaterThan(0);
    expect(dashboardComponent.defaultRowConfig.length).toBeGreaterThan(0);
    expect(dashboardComponent.dashboardTypeSelected).toEqual('consolidated');
    let defaultSortObject = {};
    await dashboardComponent.initStep('', 'consolidated', 'rdmp', '', 1, defaultSortObject);
    let groupedRecords = recordDataConsolidated['groupedRecords'];
    let planTable = dashboardComponent.evaluatePlanTableColumns(dashboardComponent.groupRowConfig,
      dashboardComponent.groupRowRules,
      dashboardComponent.rowLevelRules,
      'consolidated',
      groupedRecords);
    expect(planTable.items.length).toBeGreaterThan(0);
    dashboardComponent.evaluateRowLevelRules(dashboardComponent.rowLevelRules,
      recordDataConsolidated['records'].items[0].metadata.metadata,
      recordDataConsolidated['records'].items[0].metadata.metaMetadata,
      recordDataConsolidated['records'].items[0].metadata.workflow,
      recordDataConsolidated['records'].items[0].oid,
      'dashboardActionsPerRow');
    dashboardComponent.evaluateGroupRowRules(dashboardComponent.groupRowRules, groupedRecords['groupedItems'][0].items, 'dashboardActionsPerGroupRow');
    dashboardComponent.pageChanged(recordDataConsolidated['paginationData'], recordDataConsolidated['paginationData'].step);
    expect(dashboardComponent.records['consolidated'].currentPage).toEqual(1);
    expect(dashboardComponent.records['consolidated'].items.length).toBeGreaterThan(0);
  });
});

let recordDataConsolidatedRelationships = {
  dashboardType:
  {
    formatRules: {
      filterBy: [],
      filterWorkflowStepsBy: ['consolidated'],
      queryFilters: {
        rdmp: [
          {
            filterType: 'text',
            filterFields: [
              {
                name: 'Title',
                path: 'metadata.title'
              }
            ]
          }
        ]
      },
      sortBy: '',
      groupBy: 'groupedByRelationships',
      sortGroupBy: [{ rowLevel: 0, compareFieldValue: 'rdmp' }],
      hideWorkflowStepTitleForRecordType: []
    }
  },
  step: [{
    name: 'consolidated',
    config: {
      workflow: {
        stage: 'consolidated'
      },
      baseRecordType: 'rdmp',
      dashboard: {
        table: {
          rowRulesConfig: [
            {
              ruleSetName: 'dashboardActionsPerRow',
              applyRuleSet: true,
              type: 'multi-item-rendering',
              rules: [
                {
                  name: 'Edit',
                  action: 'show',
                  renderItemTemplate: `<%= name %>`,
                  evaluateRulesTemplate: `<%= true %>`
                }
              ]
            }
          ],
          groupRowConfig: [
            {
              title: 'Actions',
              variable: '',
              template: `<%= rulesService.evaluateGroupRowRules(groupRulesConfig, groupedItems, 'dashboardActionsPerGroupRow') %>`
            }
          ],
          groupRowRulesConfig: [
            {
              ruleSetName: 'dashboardActionsPerGroupRow',
              applyRuleSet: true,
              rules: [
                {
                  name: 'Send for Conferral',
                  action: 'show',
                  mode: 'alo',
                  renderItemTemplate: `<%= name %>`,
                  evaluateRulesTemplate: `<%= true %>`
                }
              ]
            }
          ]
        }
      }
    }
  }],
  records: {
    items: [
      {
        oid: '1234567890',
        title: 'test',
        dateCreated: 'dateCreated',
        dateModified: 'dateModified',
        metadata: {
          metaMetadata: {
            type: 'rdmp',
            lastSaveDate: ''
          },
          metadata: { title: 'test' },
          packageType: 'rdmp',
          workflow: '',
          hasEditAccess: '',
          recordType: 'rdmp'
        }
      }
    ],
    totalItems: 0,
    currentPage: 1,
    noItems: 10
  },
  groupedRecords: {
    totalItems: 1,
    currentPage: 1,
    noItems: 10,
    itemsByGroup: true,
    groupedItems:
      [
        {
          items: [
            {
              oid: '1234567890',
              title: 'test',
              dateCreated: 'dateCreated',
              dateModified: 'dateModified',
              metadata: {
                metaMetadata: {
                  type: 'rdmp',
                  lastSaveDate: ''
                },
                metadata: { title: 'test' },
                packageType: 'rdmp',
                workflow: '',
                hasEditAccess: '',
                recordType: 'rdmp'
              }
            }
          ]
        }
      ]
  },
  paginationData: {
    itemsPerPage: 10,
    page: 2,
    step: 'consolidated'
  },
  relatedRecords: {
    items: [{
      oid: '1234567890',
      title: 'test',
      dateCreated: 'dateCreated',
      dateModified: 'dateModified',
      metadata: {
        metaMetadata: {
          type: 'rdmp',
          lastSaveDate: ''
        },
        metadata: { title: 'test' },
        packageType: 'rdmp',
        workflow: '',
        hasEditAccess: '',
        recordType: 'rdmp'
      }
    }]
  }
};

describe('DashboardComponent consolidated group by relationships', () => {
  beforeEach(async () => {
    let configService = getStubConfigService();
    let translationService = getStubTranslationService();
    let recordService = getStubRecordService(recordDataConsolidatedRelationships);
    let userService = getStubUserService(username, password);

    const testModule = TestBed.configureTestingModule({
      declarations: [
        DashboardComponent
      ],
      imports: [
        FormsModule,
        I18NextModule.forRoot()
      ],
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: 'base'
        },
        LoggerService,
        UtilityService,
        {
          provide: TranslationService,
          useValue: translationService
        },
        {
          provide: ConfigService,
          useValue: configService
        },
        {
          provide: RecordService,
          useValue: recordService
        },
        {
          provide: UserService,
          useValue: userService
        }
      ]
    });
    TestBed.inject(RecordService);
    await testModule.compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    expect(dashboardComponent).toBeTruthy();
  });

  it(`should have a set a pre defined dashboard type options`, () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    expect(dashboardComponent.dashboardTypeOptions).toEqual(dashboardTypeOptions);
  });

  it(`should have a default dashboard type`, () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    dashboardComponent.dashboardTypeSelected = 'consolidated';
    expect(dashboardComponent.dashboardTypeSelected).toEqual('consolidated');
  });

  it(`init view`, async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    const dashboardComponent = fixture.componentInstance;
    dashboardComponent.dashboardTypeSelected = 'consolidated';
    await dashboardComponent.initView('consolidated');
    expect(dashboardComponent.workflowSteps.length).toBeGreaterThan(0);
    expect(dashboardComponent.defaultRowConfig.length).toBeGreaterThan(0);
    expect(dashboardComponent.dashboardTypeSelected).toEqual('consolidated');
    let defaultSortObject = {};
    await dashboardComponent.initStep('', 'consolidated', 'rdmp', '', 1, defaultSortObject);
    let groupedRecords = recordDataConsolidatedRelationships['groupedRecords'];
    let planTable = dashboardComponent.evaluatePlanTableColumns(dashboardComponent.groupRowConfig,
      dashboardComponent.groupRowRules,
      dashboardComponent.rowLevelRules,
      'consolidated',
      groupedRecords);
    expect(planTable.items.length).toBeGreaterThan(0);
    dashboardComponent.evaluateRowLevelRules(dashboardComponent.rowLevelRules,
      recordDataConsolidatedRelationships['records'].items[0].metadata.metadata,
      recordDataConsolidatedRelationships['records'].items[0].metadata.metaMetadata,
      recordDataConsolidatedRelationships['records'].items[0].metadata.workflow,
      recordDataConsolidatedRelationships['records'].items[0].oid,
      'dashboardActionsPerRow');
    dashboardComponent.evaluateGroupRowRules(dashboardComponent.groupRowRules, groupedRecords['groupedItems'][0].items, 'dashboardActionsPerGroupRow');
    dashboardComponent.pageChanged(recordDataConsolidatedRelationships['paginationData'], recordDataConsolidatedRelationships['paginationData'].step);
    expect(dashboardComponent.records['consolidated'].currentPage).toEqual(1);
    expect(dashboardComponent.records['consolidated'].items.length).toBeGreaterThan(0);
  });
});
