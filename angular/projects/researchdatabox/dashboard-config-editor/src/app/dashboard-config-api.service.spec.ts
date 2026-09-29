import { APP_BASE_HREF } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService, RB_HTTP_INTERCEPTOR_AUTH_CSRF, UtilityService } from '@researchdatabox/portal-ng-common';
import { DashboardConfigApiError, DashboardConfigApiService, DashboardSettings } from './dashboard-config-api.service';

describe('DashboardConfigApiService', () => {
  let service: DashboardConfigApiService;
  let http: HttpTestingController;
  const baseUrl = 'https://portal.example/redbox/default/rdmp/admin/dashboard-config';
  const settings: DashboardSettings = {
    searchable: true,
    showStageTitle: true,
    tableConfig: {
      rowConfig: [{ title: 'Title', variable: 'metadata.title', template: '{{metadata.title}}' }],
      rowRulesConfig: [],
      groupRowConfig: [],
      groupRowRulesConfig: [],
      formatRules: {}
    }
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        DashboardConfigApiService,
        { provide: APP_BASE_HREF, useValue: '/redbox' },
        { provide: UtilityService, useValue: { waitForDependencies: async () => undefined } },
        {
          provide: ConfigService,
          useValue: {
            getConfig: async () => ({
              baseUrl: 'https://portal.example', branding: 'default', portal: 'rdmp', csrfToken: 'test-csrf-token'
            })
          }
        }
      ]
    });
    service = await TestBed.inject(DashboardConfigApiService).waitForInit();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('saves stage settings through the CSRF-protected session route with the base revision', async () => {
    const result = service.save({ kind: 'workflow', recordType: 'rdmp', stage: 'draft' }, { expectedRevision: 3, settings });
    const request = http.expectOne(`${baseUrl}/workflows/rdmp/draft`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ expectedRevision: 3, settings });
    expect(request.request.headers.get('X-ReDBox-Api-Version')).toBe('2.0');
    expect(request.request.context.get(RB_HTTP_INTERCEPTOR_AUTH_CSRF)).toBe('test-csrf-token');
    request.flush({ data: { revision: 4 } });
    await expectAsync(result).toBeResolvedTo({ revision: 4 } as any);
  });

  it('encodes owner and step names as individual path segments', async () => {
    const result = service.getSettings({ kind: 'view', view: 'project view', step: 'review/final' });
    http.expectOne(`${baseUrl}/views/project%20view/review%2Ffinal`).flush({ data: {} });
    await expectAsync(result).toBeResolvedTo({} as any);
    const fields = service.getFields({ kind: 'workflow', recordType: 'research plan', stage: 'draft' });
    http.expectOne(`${baseUrl}/workflows/research%20plan/draft/fields`).flush({ data: { status: 'unavailable' } });
    await expectAsync(fields).toBeResolvedTo({ status: 'unavailable' } as any);
  });

  it('surfaces typed errors with their structured details', async () => {
    const result = service.save({ kind: 'workflow', recordType: 'rdmp', stage: 'draft' }, { expectedRevision: 1, settings });
    http.expectOne(`${baseUrl}/workflows/rdmp/draft`).flush(
      { errors: [{ code: 'stale-revision', detail: 'Changed by someone else', meta: { currentRevision: 2 } }], meta: {} },
      { status: 409, statusText: 'Conflict' }
    );
    await expectAsync(result).toBeRejectedWith(jasmine.objectContaining({ code: 'stale-revision', status: 409, details: { currentRevision: 2 } }));
    await result.catch((e) => expect(e).toEqual(jasmine.any(DashboardConfigApiError)));
  });
});
