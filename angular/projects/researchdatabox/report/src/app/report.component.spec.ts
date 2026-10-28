import { LOCALE_ID, inject as inject_1, provideAppInitializer } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common'; 
import { RedboxPortalCoreModule, UtilityService, LoggerService, TranslationService, ConfigService, ReportService, getStubConfigService, getStubTranslationService, getStubReportService } from '@researchdatabox/portal-ng-common';
import { ReportFilterDto, ReportDto, ReportResultDto, RecordPropViewMetaDto } from '@researchdatabox/sails-ng-common';
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
        }
      ]
    });
    await testModule.compileComponents();
  });

  it('keeps actual paginator selection and loaded rows consistent after failure, retry and success', async () => {
    configService.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
    const fixture = TestBed.createComponent(ReportComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();
    component.tableHeaders = [{ property: 'title', label: 'Title' }] as any;
    component.reportResult = { records: [{ title: 'Page one' }], total: 30, pageNum: 1, recordsPerPage: 10 };
    const previous = component.reportResult;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const pageLink = (page: number) => Array.from(fixture.nativeElement.querySelectorAll('pagination .pagination-page a') as NodeListOf<HTMLAnchorElement>)
      .find(link => link.textContent?.trim() === String(page))!;
    const activePage = () => fixture.nativeElement.querySelector('pagination .pagination-page.active')?.textContent.trim();
    let reject!: (reason: unknown) => void;
    const read = spyOn(reportService, 'getReportResult').and.returnValue(new Promise((_resolve, rejectRequest) => { reject = rejectRequest; }));
    expect(activePage()).toBe('1');
    pageLink(2).click();
    fixture.detectChanges();
    // Exercise both disabled DOM clicks and the request guard.
    pageLink(3).click();
    await component.gotoPage(3);
    expect(read).toHaveBeenCalledTimes(1);
    expect(previous.pageNum).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Page one');
    reject({ status: 500 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.reportResult).toBe(previous);
    expect(previous.pageNum).toBe(1);
    expect(activePage()).toBe('1');
    expect(fixture.nativeElement.textContent).toContain('Page one');
    expect(component.loadError).toContain('Unable to load');
    let resolve!: (value: any) => void;
    read.and.returnValue(new Promise(resolveRequest => { resolve = resolveRequest; }));
    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    pageLink(3).click();
    expect(read).toHaveBeenCalledTimes(2);
    expect(read.calls.mostRecent().args[1]).toBe(2);
    resolve({ records: [{ title: 'Page two' }], total: 30, pageNum: 2, recordsPerPage: 10 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.reportResult.pageNum).toBe(2);
    expect(activePage()).toBe('2');
    expect(fixture.nativeElement.textContent).toContain('Page two');
    expect(component.loadError).toBe('');
    expect(read).toHaveBeenCalledTimes(2);
    read.and.resolveTo({ records: [{ title: 'Page three' }], total: 30, pageNum: 3, recordsPerPage: 10 } as any);
    pageLink(3).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.reportResult.pageNum).toBe(3);
    expect(activePage()).toBe('3');
    expect(fixture.nativeElement.textContent).toContain('Page three');
    fixture.destroy();
  });

  it('retains the previous page on failure and retries the requested page', async () => {
    configService.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
    const fixture = TestBed.createComponent(ReportComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();
    const previous = component.reportResult;
    const original = reportService.getReportResult.bind(reportService);
    const read = spyOn(reportService, 'getReportResult').and.rejectWith({ status: 0 });
    await component.gotoPage(2);
    expect(component.initTracker.resultsReturned).toBeTrue();
    expect(component.reportResult).toBe(previous);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Check your connection');
    read.and.callFake(original);
    await component.retryLoad();
    expect(component.loadError).toBe('');
    expect(component.initTracker.resultsReturned).toBeTrue();
    expect(read).toHaveBeenCalledTimes(2);
    fixture.destroy();
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
