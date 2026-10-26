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
    await fixture.whenStable();
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
    await fixture.whenStable();
    await app.filter();
    fixture.detectChanges();
    expect(app.dateRangeError).toContain('enter valid dates');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('report-date-range-error');
    expect(request).not.toHaveBeenCalled();
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
