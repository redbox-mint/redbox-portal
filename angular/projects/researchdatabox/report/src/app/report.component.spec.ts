import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
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
        HttpClientTestingModule,
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

  for (const paginationFails of [false, true]) {
    it(`runs only the latest submitted filter after a pending page ${paginationFails ? 'fails' : 'succeeds'}, and retries its exact criteria`, async () => {
      configService.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
      const fixture = TestBed.createComponent(ReportComponent);
      const component = fixture.componentInstance;
      component.reportName = 'mock-report';
      fixture.detectChanges();
      await component.waitForInit();
      component.tableHeaders = [{ property: 'title', label: 'Title' }] as any;
      component.reportResult = { records: [{ title: 'Original' }], total: 30, pageNum: 1, recordsPerPage: 10 };
      const realService = new ReportService(TestBed.inject(HttpClient), 'base', TestBed.inject(UtilityService), configService, TestBed.inject(LoggerService));
      await realService.waitForInit();
      realService.brandingAndPortalUrl = 'https://portal.example/base/default/rdmp';
      (component as any).reportService = realService;
      const http = TestBed.inject(HttpTestingController);
      const settle = async () => { for (let i = 0; i < 15; i++) { await Promise.resolve(); } };
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const pageTwo = Array.from(fixture.nativeElement.querySelectorAll('pagination .pagination-page a') as NodeListOf<HTMLAnchorElement>)
        .find(link => link.textContent?.trim() === '2')!;
      pageTwo.click();
      fixture.detectChanges();
      const page = http.expectOne(req => req.url.includes('getReportResults'));
      const input = fixture.nativeElement.querySelector('input#title') as HTMLInputElement;
      const submit = fixture.nativeElement.querySelector('a.btn-primary') as HTMLAnchorElement;
      for (const title of ['discarded', 'latest']) {
        input.value = title;
        input.dispatchEvent(new Event('input'));
        submit.click();
      }
      // Editing without submitting must not alter the queued or retry criteria.
      input.value = 'unsubmitted';
      input.dispatchEvent(new Event('input'));
      http.expectNone(req => req.url.includes('getReportResults'));
      if (paginationFails) {
        page.flush('failed', { status: 500, statusText: 'Server Error' });
      } else {
        page.flush({ records: [{ title: 'Page two' }], total: 30, pageNum: 2, recordsPerPage: 10 });
      }
      await settle();
      const latest = http.expectOne(req => req.url.includes('getReportResults'));
      expect(latest.request.urlWithParams).toContain('latest');
      expect(latest.request.urlWithParams).not.toContain('discarded');
      expect(latest.request.urlWithParams).not.toContain('unsubmitted');
      expect(latest.request.method).toBe('GET');
      latest.flush('failed', { status: 500, statusText: 'Server Error' });
      await settle();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.reportResult.pageNum).toBe(paginationFails ? 1 : 2);
      expect(component.loadError).toContain('Unable to load');
      (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
      await settle();
      const retry = http.expectOne(req => req.url.includes('getReportResults'));
      expect(retry.request.urlWithParams).toBe(latest.request.urlWithParams);
      retry.flush({ records: [{ title: 'Latest rows' }], total: 1, pageNum: 1, recordsPerPage: 10 });
      await settle();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.reportResult.pageNum).toBe(1);
      expect(fixture.nativeElement.textContent).toContain('Latest rows');
      expect(component.loadError).toBe('');
      http.verify();
      fixture.destroy();
    });
  }

  it('propagates an initial page failure to bootstrap waiters and recovers through Retry', async () => {
    configService.refreshConfig = jasmine.createSpy('refreshConfig').and.resolveTo({});
    const original = reportService.getReportResult.bind(reportService);
    const read = spyOn(reportService, 'getReportResult').and.rejectWith({ status: 403 });
    const fixture = TestBed.createComponent(ReportComponent);
    const component = fixture.componentInstance;
    const waiting = expectAsync(component.waitForInit()).toBeRejectedWith(jasmine.objectContaining({ status: 403 }));
    fixture.detectChanges();
    await waiting;
    await expectAsync(component.waitForInit()).toBeRejected();
    fixture.detectChanges();
    expect(component.loadPending).toBeFalse();
    expect(component.initTracker.resultsReturned).toBeTrue();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Sign in again');
    read.and.callFake(original);
    (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
    await fixture.whenStable();
    await component.waitForInit();
    fixture.detectChanges();
    expect(configService.refreshConfig).toHaveBeenCalledTimes(1);
    expect(component.loadError).toBe('');
    expect(component.reportResult.pageNum).toBe(1);
    expect(read).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    fixture.destroy();
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
