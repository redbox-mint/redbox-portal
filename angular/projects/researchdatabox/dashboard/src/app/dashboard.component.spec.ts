import { TestBed } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { FormsModule } from "@angular/forms";
import { APP_BASE_HREF } from '@angular/common'; 
import { I18NextModule, I18NEXT_SERVICE } from 'angular-i18next';
import { UtilityService, LoggerService, ConfigService, TranslationService, RecordService, UserService } from '@researchdatabox/redbox-portal-core';
import { getStubConfigService, getStubTranslationService, getStubRecordService, getStubUserService } from '@researchdatabox/redbox-portal-core';

const username = 'testUser';
const password = 'some-password';
const dashboardTypeOptions: any = ['standard', 'workspace', 'consolidated'];
let recordDataStandard = { 
  dashboardType: 
  { 
    formatRules: {
      filterBy: [], 
      filterWorkflowStepsBy: [], 
      sortBy: '',
      groupBy: '', 
      sortGroupBy: [], 
    }
  },
  step: {
    rdmp: {
      draft: {
        config: {
          workflow: {
            stage: 'draft'
          }
        }
      }
    }
  },
  records: {
    items: [],
    totalItems: 0,
    currentPage: 1,
    noItems: 10
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
    expect(dashboardComponent.workflowSteps.length).toBeGreaterThan(0);
    expect(dashboardComponent.defaultTableConfig.length).toBeGreaterThan(0);
    await dashboardComponent.initStep('draft','draft','rdmp','',1);
    let planTable = dashboardComponent.evaluatePlanTableColumns({}, {}, {}, 'draft', recordDataStandard['records']);
    expect(planTable.items.length).toEqual(0);
    expect(dashboardComponent.dashboardTypeSelected).toEqual('standard');
  });

});
