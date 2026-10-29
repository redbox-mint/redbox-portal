import { APP_BASE_HREF } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import {
  ConfigService,
  UtilityService,
  LoggerService,
  getStubConfigService,
  RB_HTTP_INTERCEPTOR_AUTH_CSRF,
} from '@researchdatabox/portal-ng-common';
import { ReportConfigService } from './report-config.service';

describe('Report assistance API', () => {
  let api: ReportConfigService;
  let http: HttpTestingController;
  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ReportConfigService,
        UtilityService,
        LoggerService,
        { provide: APP_BASE_HREF, useValue: '/base' },
        { provide: ConfigService, useValue: getStubConfigService() },
      ],
    });
    api = TestBed.inject(ReportConfigService);
    http = TestBed.inject(HttpTestingController);
    await api.waitForInit();
  });
  afterEach(() => http.verify());
  for (const envelope of [false, true]) {
    it(`uses the report-owned description route with encoded names (v${envelope ? 2 : 1})`, async () => {
      const pending = api.describeQuery('hook/query');
      const req = http.expectOne(r => r.url.endsWith('/api/report-config/named-query/hook%2Fquery/description'));
      expect(req.request.method).toBe('GET');
      const data = {
        parameters: [{ key: 'createdAfter' }],
        result: { fields: [] },
        templateContexts: { display: {}, csv: {} },
      };
      req.flush(envelope ? { data, meta: {} } : data);
      expect(await pending).toEqual(data as any);
    });
    it(`POSTs an unmodified draft for validation with CSRF context (v${envelope ? 2 : 1})`, async () => {
      const report = { name: 'draft', columns: [], filter: [] } as any;
      const pending = api.validate(report);
      const req = http.expectOne(r => r.url.endsWith('/api/report-config/validate'));
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBe(report);
      expect(req.request.context.get(RB_HTTP_INTERCEPTOR_AUTH_CSRF)).toBe('testCsrfValue');
      const data = { valid: false, diagnostics: [{ field: 'name', severity: 'error' }] };
      req.flush(envelope ? { data } : data);
      expect(await pending).toEqual(data as any);
    });
    it(`POSTs preview drafts and legacy filter values with CSRF (v${envelope ? 2 : 1})`, async () => {
      const report = { name: 'draft' } as any;
      const pending = api.preview(report, { title: 'a&b', dateRange_fromDate: '2026-01-01' });
      const req = http.expectOne(r => r.url.endsWith('/api/report-config/preview'));
      expect(req.request.body).toBe(report);
      expect(req.request.params.get('title')).toBe('a&b');
      expect(req.request.params.get('dateRange_fromDate')).toBe('2026-01-01');
      expect(req.request.context.get(RB_HTTP_INTERCEPTOR_AUTH_CSRF)).toBe('testCsrfValue');
      const data = {
        total: 1,
        renderedRows: [{ cells: [{ untrustedDisplayHtml: '<b>x</b>', export: 'x' }] }],
        deadlineEnforced: false,
      };
      req.flush(envelope ? { data } : data);
      expect(await pending).toEqual(data as any);
    });
  }
  it('preserves the legacy save endpoint and arbitrary report configuration', async () => {
    const report = { name: 'legacy', hook: { untouched: true }, filter: [], columns: [] } as any;
    const pending = api.update(report);
    const req = http.expectOne(r => r.url.endsWith('/admin/report-config/legacy'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toBe(report);
    expect(req.request.context.get(RB_HTTP_INTERCEPTOR_AUTH_CSRF)).toBe('testCsrfValue');
    req.flush(report);
    expect(await pending).toEqual(report);
  });
});
