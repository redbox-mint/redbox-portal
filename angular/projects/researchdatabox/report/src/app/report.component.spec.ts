import { LOCALE_ID, inject as inject_1, provideAppInitializer } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common'; 
import { RedboxPortalCoreModule, UtilityService, LoggerService, TranslationService, ConfigService, ReportService, getStubConfigService, getStubTranslationService, appInit, localeId, getStubReportService } from '@researchdatabox/portal-ng-common';
import { ReportFilterDto, ReportDto, ReportResultDto, RecordPropViewMetaDto } from '@researchdatabox/sails-ng-common';
import { I18NextModule, I18NEXT_SERVICE } from 'angular-i18next';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { FormsModule } from "@angular/forms";
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { ReportComponent } from './report.component';

describe('ReportComponent', () => {
  let configService:any;
  let reportService: any;
  let translationService: any;
  let mockReportData: any;

  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService();
    const mockReportConfigData = {
      title: 'Mock Report',
      name: 'mock-report',
      filter: [
        {
          "paramName": "dateObjectModifiedRange",
          "type": "date-range",
          "property": "date_object_modified",
          "message": "Filter by date modified"
        },
        {
          "paramName": "title",
          "type": "text",
          "property": "title",
          "message": "Filter by title"
        }
      ] as ReportFilterDto[],
      columns: [
        {
          "label": "Chief Investigator",
          "property": "contributor_ci.text_full_name",
          "template" : "${ data['contributor_ci.text_full_name'] }"
        }
      ] as RecordPropViewMetaDto[]
    } as ReportDto;
    let pageNum = 1;
    const mockReportResult = {
      records: [
        {
          id: '123',
          "contributor_ci.text_full_name": "John Doe"
        }
      ],
      total: 10,
      pageNum: pageNum,
      recordsPerPage: 1
    } as ReportResultDto;
    mockReportData = {
      reportConfig: mockReportConfigData,
      reportResult: mockReportResult
    };
    reportService = getStubReportService(mockReportData);
    const testModule = await TestBed.configureTestingModule({
      declarations: [
        ReportComponent
      ],
      imports: [
        FormsModule,
        I18NextModule.forRoot(),
        BsDatepickerModule.forRoot(),
        PaginationModule.forRoot(),
        RedboxPortalCoreModule
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
          provide: ReportService,
          useValue: reportService
        },
        provideAppInitializer(() => {
        const initializerFn = (appInit)(inject(I18NEXT_SERVICE));
        return initializerFn();
      }),
        {
          provide: LOCALE_ID,
          deps: [I18NEXT_SERVICE],
          useValue: localeId
        }
      ]
    });
    TestBed.inject(I18NEXT_SERVICE);
    await testModule.compileComponents();
  });

  it('should create the app, and apply report filters', async function() {
    const fixture = TestBed.createComponent(ReportComponent);
    fixture.debugElement.nativeElement.setAttribute('reportName', mockReportData.reportConfig.name);
    const app = fixture.componentInstance;
    app.reportName = mockReportData.reportConfig.name;

    expect(app).toBeTruthy();
    fixture.autoDetectChanges(true);
    await app.waitForInit();
    await fixture.whenStable();

    expect(app.reportResult.total).toEqual(mockReportData.reportResult.total);
    
    mockReportData.reportResult.total = 2;
    // apply filter
    app.filterParams['dateObjectModifiedRange_fromDate'] = new Date(2023, 0, 1);
    app.filterParams['dateObjectModifiedRange_toDate'] = new Date(2023, 1, 1);
    app.filterParams['title'] = 'test';
    await app.filter(); 
    expect(app.reportResult.total).toEqual(mockReportData.reportResult.total);
    // test download url
    const downloadUrl = app.getDownloadCSVUrl();
    console.log(`Download url: ${downloadUrl}`);
    const expectedUrl = `base/default/rdmp/admin/downloadReportCSV?name=${mockReportData.reportConfig.name}&dateObjectModifiedRange_fromDate=${app.getLuxonDateFromJs(app.filterParams['dateObjectModifiedRange_fromDate'], app.dateParamTz, 'floor')}&dateObjectModifiedRange_toDate=${app.getLuxonDateFromJs(app.filterParams['dateObjectModifiedRange_toDate'], app.dateParamTz, 'ceil')}&title=test`;
    console.log(`Expected Download url: ${expectedUrl}`);
    expect(downloadUrl).toEqual(expectedUrl);
  });
});
