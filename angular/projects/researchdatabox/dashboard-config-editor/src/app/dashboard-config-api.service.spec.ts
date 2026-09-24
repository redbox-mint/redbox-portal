import { APP_BASE_HREF } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService, RB_HTTP_INTERCEPTOR_AUTH_CSRF, UtilityService } from '@researchdatabox/portal-ng-common';
import { DashboardConfigApiService, WorkflowStateDashboardConfig } from './dashboard-config-api.service';

describe('DashboardConfigApiService save routes', () => {
  let service: DashboardConfigApiService;
  let http: HttpTestingController;
  const apiUrl = 'https://portal.example/redbox/default/rdmp/api/dashboard-config';
  const config: WorkflowStateDashboardConfig = {
    dashboardType: 'standard',
    tableConfig: {
      rowConfig: [{ title: 'Updated title', variable: 'metadata.title', template: '{{metadata.title}}' }]
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

  it('saves workflow overrides through the registered merged configuration route', async () => {
    const result = service.saveWorkflowStateDashboardConfig('rdmp', 'draft', config);
    const request = http.expectOne(`${apiUrl}/merged/rdmp/draft`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(config);
    expect(request.request.context.get(RB_HTTP_INTERCEPTOR_AUTH_CSRF)).toBe('test-csrf-token');
    const overrides = { recordTypes: { rdmp: { steps: { draft: config } } } };
    request.flush({ data: overrides });
    await expectAsync(result).toBeResolvedTo(overrides);
  });

  it('saves view overrides through the registered merged view route', async () => {
    const result = service.saveDashboardViewStepConfig('consolidated', 'consolidated', config);
    const request = http.expectOne(`${apiUrl}/merged-view/consolidated/consolidated`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(config);
    expect(request.request.context.get(RB_HTTP_INTERCEPTOR_AUTH_CSRF)).toBe('test-csrf-token');
    const overrides = { views: { consolidated: { steps: { consolidated: config } } } };
    request.flush(overrides);
    await expectAsync(result).toBeResolvedTo(overrides);
  });

  it('encodes record type and workflow stage as individual path segments', async () => {
    const result = service.saveWorkflowStateDashboardConfig('research plan', 'draft/review', config);
    const request = http.expectOne(`${apiUrl}/merged/research%20plan/draft%2Freview`);
    request.flush({ data: {} });
    await expectAsync(result).toBeResolvedTo({});
  });

  it('encodes view and step names as individual path segments', async () => {
    const result = service.saveDashboardViewStepConfig('project view', 'review/final', config);
    const request = http.expectOne(`${apiUrl}/merged-view/project%20view/review%2Ffinal`);
    request.flush({ data: {} });
    await expectAsync(result).toBeResolvedTo({});
  });
});
