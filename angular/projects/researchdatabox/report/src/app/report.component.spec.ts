import { By } from '@angular/platform-browser';
import { HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { LOCALE_ID, inject as inject_1, provideAppInitializer } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common'; 
import { RedboxPortalCoreServicesModule, RedboxPortalReportsModule, RedboxPortalRecordTableModule, RecordTableComponent, UtilityService, LoggerService, TranslationService, ConfigService, ReportService, getStubConfigService, getStubTranslationService, getStubReportService } from '@researchdatabox/portal-ng-common';
import { ReportFilterDto, ReportDto, ReportResultDto, RecordPropViewMetaDto } from '@researchdatabox/sails-ng-common';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { FormsModule } from "@angular/forms";
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { ReportComponent } from './report.component';

describe('ReportComponent', () => {
  async function settleView(fixture: any): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
    await fixture.whenStable();
    const table = fixture.debugElement.query(By.directive(RecordTableComponent));
    if (table) await table.componentInstance.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();
  }

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
        BsDatepickerModule,
        PaginationModule,
        RedboxPortalCoreServicesModule, RedboxPortalReportsModule, RedboxPortalRecordTableModule
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
      await settleView(fixture);
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
      await settleView(fixture);
      fixture.detectChanges();
      expect(component.reportResult.pageNum).toBe(paginationFails ? 1 : 2);
      expect(component.loadError).toContain('Unable to load');
      (fixture.nativeElement.querySelector('[role="alert"] button') as HTMLButtonElement).click();
      await settle();
      const retry = http.expectOne(req => req.url.includes('getReportResults'));
      expect(retry.request.urlWithParams).toBe(latest.request.urlWithParams);
      retry.flush({ records: [{ title: 'Latest rows' }], total: 1, pageNum: 1, recordsPerPage: 10 });
      await settle();
      await settleView(fixture);
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
    component.reportName = 'mock-report';
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
    await settleView(fixture);
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
    await settleView(fixture);
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
    await settleView(fixture);
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
    await settleView(fixture);
    fixture.detectChanges();
    expect(component.reportResult.pageNum).toBe(2);
    expect(activePage()).toBe('2');
    expect(fixture.nativeElement.textContent).toContain('Page two');
    expect(component.loadError).toBe('');
    expect(read).toHaveBeenCalledTimes(2);
    read.and.resolveTo({ records: [{ title: 'Page three' }], total: 30, pageNum: 3, recordsPerPage: 10 } as any);
    pageLink(3).click();
    await settleView(fixture);
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
    await settleView(fixture);

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
    const expectedQuery = new URLSearchParams({
      name: mockReportData.reportConfig.name,
      dateObjectModifiedRange_fromDate: app.getLuxonDateFromJs(app.filterParams['dateObjectModifiedRange_fromDate'], app.dateParamTz, 'floor').toISO()!,
      dateObjectModifiedRange_toDate: app.getLuxonDateFromJs(app.filterParams['dateObjectModifiedRange_toDate'], app.dateParamTz, 'ceil').toISO()!,
      title: 'test',
    });
    const expectedUrl = `base/default/rdmp/admin/downloadReportCSV?${expectedQuery}`;
    console.log(`Expected Download url: ${expectedUrl}`);
    expect(downloadUrl).toEqual(expectedUrl);
  });

  async function readyReport() {
    const fixture = TestBed.createComponent(ReportComponent);
    fixture.componentInstance.reportName = mockReportData.reportConfig.name;
    fixture.autoDetectChanges(true);
    await fixture.componentInstance.waitForInit();
    await settleView(fixture);
    return fixture;
  }

  it('round-trips CSV filters with URL delimiters, Unicode and an unconfigured positive-offset date zone', async () => {
    const fixture = await readyReport();
    const app = fixture.componentInstance;
    app.dateParamTz = 'Australia/Brisbane';
    app.filterParams = {
      dateObjectModifiedRange_fromDate: new Date(2028, 5, 20),
      dateObjectModifiedRange_toDate: new Date(2028, 5, 21),
      title: 'R&D + #研究 "quoted"',
    };
    const request = spyOn(reportService, 'getReportResult').and.callThrough();
    await app.filter();
    const params = app.getParams();
    expect(request.calls.mostRecent().args[2]).toEqual(params);
    expect(params.dateObjectModifiedRange_fromDate).toMatch(/\+10:00$/);
    const csv = new URL(app.getDownloadCSVUrl()!, 'https://example.invalid');
    expect(csv.pathname).toBe('/base/default/rdmp/admin/downloadReportCSV');
    expect(csv.hash).toBe('');
    const decoded: Record<string, string> = {};
    csv.searchParams.forEach((value, key) => { decoded[key] = value; });
    expect(decoded).toEqual({ name: app.reportName, ...params });
  });

  for (const day of [
    { month: 0, day: 1, from: '2027-12-31T13:00:00.000Z', to: '2028-01-01T12:59:59.999Z', hours: 24 },
    { month: 6, day: 1, from: '2028-06-30T14:00:00.000Z', to: '2028-07-01T13:59:59.999Z', hours: 24 },
    { month: 3, day: 2, from: '2028-04-01T13:00:00.000Z', to: '2028-04-02T13:59:59.999Z', hours: 25 },
    { month: 9, day: 1, from: '2028-09-30T14:00:00.000Z', to: '2028-10-01T12:59:59.999Z', hours: 23 },
  ]) {
    it(`uses Sydney calendar bounds for Created/Modified on 2028-${day.month + 1}-${day.day} in both requests and CSV`, async () => {
      const fixture = await readyReport();
      const app = fixture.componentInstance;
      app.dateParamTzByFilter = { [app.reportName]: { dateObjectCreatedRange: 'Australia/Sydney', dateObjectModifiedRange: 'Australia/Sydney' } };
      app.report.filter.unshift({ paramName: 'dateObjectCreatedRange', type: 'date-range', property: 'date_object_created', message: 'Created' });
      const from = new Date(2028, day.month, day.day, 23, 30);
      const to = new Date(2028, day.month, day.day, 0, 30);
      const original = [from.getTime(), to.getTime()];
      app.filterParams = {
        dateObjectCreatedRange_fromDate: from, dateObjectCreatedRange_toDate: to,
        dateObjectModifiedRange_fromDate: from, dateObjectModifiedRange_toDate: to,
      };
      const request = spyOn(reportService, 'getReportResult').and.callThrough();
      await app.filter();
      const params = {
        dateObjectCreatedRange_fromDate: day.from, dateObjectCreatedRange_toDate: day.to,
        dateObjectModifiedRange_fromDate: day.from, dateObjectModifiedRange_toDate: day.to,
      };
      expect(app.dateRangeError).toBeNull();
      expect(request.calls.mostRecent().args[2]).toEqual(params);
      const csv = new URL(app.getDownloadCSVUrl()!, 'https://example.invalid');
      const csvParams: Record<string, string> = {};
      csv.searchParams.forEach((value, key) => { if (key !== 'name') csvParams[key] = value; });
      expect(csvParams).toEqual(params);
      expect(Date.parse(day.to) - Date.parse(day.from) + 1).toBe(day.hours * 3600000);
      expect([from.getTime(), to.getTime()]).toEqual(original);
      expect([from.getFullYear(), from.getMonth(), from.getDate()]).toEqual([2028, day.month, day.day]);
    });
  }

  it('loads filter-specific zones from app config while keeping unconfigured embargo boundaries unchanged', async () => {
    const config = await configService.getConfig();
    config.app = { ...config.app, report: { ...config.app?.report, dateParamTzByFilter: { 'mock-report': { dateObjectModifiedRange: 'Australia/Sydney' } } } };
    spyOn(configService, 'getConfig').and.resolveTo(config);
    const fixture = await readyReport();
    const app = fixture.componentInstance;
    expect(app.dateParamTzByFilter).toEqual({ 'mock-report': { dateObjectModifiedRange: 'Australia/Sydney' } });
    app.report.filter.push({ paramName: 'dateEmbargoedRange', type: 'date-range', property: 'date_embargoed', message: 'Embargo' });
    const date = new Date(2028, 5, 15, 12);
    app.filterParams = { dateObjectModifiedRange_fromDate: date, dateEmbargoedRange_fromDate: date };
    expect(app.getParams()).toEqual({
      dateObjectModifiedRange_fromDate: '2028-06-14T14:00:00.000Z',
      dateEmbargoedRange_fromDate: app.getLuxonDateFromJs(date, app.dateParamTz, 'floor').toISO(),
    });
    app.filterParams['dateObjectModifiedRange_fromDate'] = null;
    app.filterParams['dateObjectModifiedRange_toDate'] = date;
    expect(app.getParams().dateObjectModifiedRange_toDate).toBe('2028-06-15T13:59:59.999Z');
    delete app.filterParams['dateObjectModifiedRange_toDate'];
    expect(Object.keys(app.getParams())).toEqual(['dateEmbargoedRange_fromDate']);
    // A different report may reuse this parameter name for Last Login.
    app.reportName = 'user';
    app.filterParams = { dateObjectModifiedRange_fromDate: date };
    expect(app.getParams().dateObjectModifiedRange_fromDate)
      .toBe(app.getLuxonDateFromJs(date, app.dateParamTz, 'floor').toISO());
  });

  it('blocks invalid dates from filter, paging and CSV while preserving the previous result', async () => {
    const fixture = await readyReport();
    const app = fixture.componentInstance;
    const previousResult = app.reportResult;
    const request = spyOn(reportService, 'getReportResult').and.callThrough();
    for (const invalid of [new Date(NaN), 'nonsense', '31/02/2028']) {
      app.filterParams['dateObjectModifiedRange_fromDate'] = invalid;
      await app.filter();
      await app.gotoPage(2);
      fixture.detectChanges();
      expect(app.getParams()).toBeNull();
      expect(app.getDownloadCSVUrl()).toBeNull();
      expect(app.reportResult).toBe(previousResult);
      expect(app.initTracker.resultsReturned).toBeTrue();
      const alert = fixture.nativeElement.querySelector('[role="alert"]');
      expect(alert.textContent).toContain('enter valid dates in dd/mm/yyyy format');
      const download = fixture.nativeElement.querySelector('a[aria-disabled="true"]');
      expect(download.hasAttribute('href')).toBeFalse();
      const click = new MouseEvent('click', { cancelable: true });
      download.dispatchEvent(click);
      expect(click.defaultPrevented).toBeTrue();
    }
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent calendar date entered through the datepicker input', async () => {
    const fixture = await readyReport();
    const app = fixture.componentInstance;
    const request = spyOn(reportService, 'getReportResult').and.callThrough();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#dateObjectModifiedRange_fromDate');
    input.value = '31/02/2028';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('change'));
    input.dispatchEvent(new Event('blur'));
    await settleView(fixture);
    await app.filter();
    fixture.detectChanges();
    expect(app.dateRangeError).toContain('enter valid dates');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('report-date-range-error');
    expect(request).not.toHaveBeenCalled();
  });

  for (const configPath of ['override', 'fallback']) {
    for (const bounds of ['from-only', 'to-only', 'both']) {
      it(`blocks ${bounds} requests with an invalid ${configPath} time zone and recovers after correction`, async () => {
        const fixture = await readyReport();
        const app = fixture.componentInstance;
        const previousResult = app.reportResult;
        const request = spyOn(reportService, 'getReportResult').and.callThrough();
        const translate = spyOn(translationService, 't').and.callThrough();
        const param = 'dateObjectModifiedRange';
        if (configPath === 'override') {
          app.dateParamTzByFilter = { [app.reportName]: { [param]: 'Australia/Sydny' } };
        } else {
          app.dateParamTz = 'Australia/Sydny';
        }
        app.filterParams = {};
        if (bounds !== 'to-only') app.filterParams[param + '_fromDate'] = new Date(2028, 5, 20);
        if (bounds !== 'from-only') app.filterParams[param + '_toDate'] = new Date(2028, 5, 21);
        await app.filter();
        await app.gotoPage(2);
        fixture.detectChanges();
        expect(request).not.toHaveBeenCalled();
        expect(app.getParams()).toBeNull();
        expect(app.getDownloadCSVUrl()).toBeNull();
        expect(app.reportResult).toBe(previousResult);
        expect(app.initTracker.resultsReturned).toBeTrue();
        expect(fixture.nativeElement.querySelector('[role="alert"]').textContent)
          .toContain('date filter time zone is not configured correctly');
        expect(translate.calls.allArgs().some(args => args[0] === 'report-filter-invalid-timezone')).toBeTrue();
        const download = fixture.nativeElement.querySelector('a[aria-disabled="true"]');
        expect(download).not.toBeNull();
        if (download) {
          expect(download.hasAttribute('href')).toBeFalse();
          const click = new MouseEvent('click', { cancelable: true });
          download.dispatchEvent(click);
          expect(click.defaultPrevented).toBeTrue();
        }

        if (configPath === 'override') {
          app.dateParamTzByFilter[app.reportName][param] = 'Australia/Sydney';
        } else {
          app.dateParamTz = 'Australia/Sydney';
        }
        await app.filter();
        await app.gotoPage(2);
        fixture.detectChanges();
        expect(app.dateRangeError).toBeNull();
        expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
        expect(fixture.nativeElement.querySelector('a[aria-disabled="true"]')).toBeNull();
        expect(request).toHaveBeenCalledTimes(2);
        expect(request.calls.allArgs().map(args => args[1])).toEqual([1, 2]);
        const params = app.getParams();
        expect(request.calls.mostRecent().args[2]).toEqual(params);
        const csv = new URL(app.getDownloadCSVUrl()!, 'https://example.invalid');
        expect(Object.keys(params).length).toBe(bounds === 'both' ? 2 : 1);
        for (const key of Object.keys(params)) {
          expect(Number.isFinite(Date.parse(params[key]))).toBeTrue();
          expect(csv.searchParams.get(key)).toBe(params[key]);
        }
      });
    }
  }

  it('allows reports with no selected date bounds even when configured time zones are invalid', async () => {
    const fixture = await readyReport();
    const app = fixture.componentInstance;
    app.dateParamTz = 'Invalid/Fallback';
    app.dateParamTzByFilter = { [app.reportName]: { dateObjectModifiedRange: 'Invalid/Override' } };
    app.filterParams = { title: 'research' };
    const request = spyOn(reportService, 'getReportResult').and.callThrough();
    await app.filter();
    fixture.detectChanges();
    expect(app.dateRangeError).toBeNull();
    expect(request.calls.mostRecent().args[2]).toEqual({ title: 'research' });
    expect(app.getDownloadCSVUrl()).toContain('title=research');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('uses a valid filter override when an invalid fallback is unused, including by other unbounded filters', async () => {
    const fixture = await readyReport();
    const app = fixture.componentInstance;
    app.dateParamTz = 'Invalid/Fallback';
    app.dateParamTzByFilter = { [app.reportName]: { dateObjectModifiedRange: 'Australia/Sydney' } };
    app.report.filter.push({ paramName: 'otherDate', type: 'date-range', property: 'otherDate', message: 'Other date' });
    app.filterParams = { dateObjectModifiedRange_fromDate: new Date(2028, 5, 20) };
    const request = spyOn(reportService, 'getReportResult').and.callThrough();
    await app.filter();
    fixture.detectChanges();
    const params = { dateObjectModifiedRange_fromDate: '2028-06-19T14:00:00.000Z' };
    expect(app.dateRangeError).toBeNull();
    expect(request.calls.mostRecent().args[2]).toEqual(params);
    expect(new URL(app.getDownloadCSVUrl()!, 'https://example.invalid').searchParams.get('dateObjectModifiedRange_fromDate'))
      .toBe(params.dateObjectModifiedRange_fromDate);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('explains reversed ranges and allows filtering and downloading after correction', async () => {
    const fixture = await readyReport();
    const app = fixture.componentInstance;
    const request = spyOn(reportService, 'getReportResult').and.callThrough();
    app.filterParams['dateObjectModifiedRange_fromDate'] = new Date(2028, 5, 20);
    app.filterParams['dateObjectModifiedRange_toDate'] = new Date(2028, 5, 10);
    await app.filter();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent)
      .toContain('From date must be on or before the To date');
    expect(request).not.toHaveBeenCalled();
    expect(app.getDownloadCSVUrl()).toBeNull();

    app.filterParams['dateObjectModifiedRange_toDate'] = new Date(2028, 5, 21);
    await app.filter();
    fixture.detectChanges();
    expect(app.dateRangeError).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.calls.mostRecent().args[1]).toBe(1);
    expect(app.getDownloadCSVUrl()).toContain('dateObjectModifiedRange_fromDate=');
  });

  it('preserves valid, same-day and open-ended parameters without mutating the date models', async () => {
    const fixture = await readyReport();
    const app = fixture.componentInstance;
    const from = new Date(2028, 5, 20, 23, 30);
    const to = new Date(2028, 5, 20, 0, 30);
    const original = [from.getTime(), to.getTime()];
    app.filterParams = { dateObjectModifiedRange_fromDate: from, dateObjectModifiedRange_toDate: to, title: 'test' };
    expect(app.dateRangeError).toBeNull();
    const params = app.getParams();
    expect(params).toEqual({
      dateObjectModifiedRange_fromDate: app.getLuxonDateFromJs(from, app.dateParamTz, 'floor').toISO(),
      dateObjectModifiedRange_toDate: app.getLuxonDateFromJs(to, app.dateParamTz, 'ceil').toISO(),
      title: 'test',
    });
    expect([from.getTime(), to.getTime()]).toEqual(original);
    for (const empty of [null, undefined, '']) {
      app.filterParams['dateObjectModifiedRange_toDate'] = empty;
      expect(app.getParams()).toEqual({ dateObjectModifiedRange_fromDate: params.dateObjectModifiedRange_fromDate, title: 'test' });
      app.filterParams['dateObjectModifiedRange_fromDate'] = empty;
      expect(app.getParams()).toEqual({ title: 'test' });
      app.filterParams['dateObjectModifiedRange_fromDate'] = from;
    }
  });
});
