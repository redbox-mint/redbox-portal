import { APP_BASE_HREF } from '@angular/common';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService, getStubConfigService, LoggerService, UtilityService } from '@researchdatabox/portal-ng-common';
import { DashboardConfigApiService, DashboardTableOverrideConfigData, WorkflowStateDashboardConfig } from './dashboard-config-api.service';

describe('DashboardConfigApiService', () => {
  let service: DashboardConfigApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        DashboardConfigApiService,
        LoggerService,
        UtilityService,
        { provide: ConfigService, useValue: getStubConfigService() },
        { provide: APP_BASE_HREF, useValue: '/base' }
      ]
    });

    service = TestBed.inject(DashboardConfigApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('saves a workflow state override through the merged config route', async () => {
    await service.waitForInit();
    const payload: WorkflowStateDashboardConfig = {
      dashboardType: 'standard',
      tableConfig: { rowConfig: [{ title: 'Title', variable: 'metadata.title', template: '{{title}}' }] }
    };
    const saved: DashboardTableOverrideConfigData = {
      recordTypes: { rdmp: { steps: { draft: payload } } },
      views: {}
    };

    const responsePromise = service.saveWorkflowStateDashboardConfig('rdmp/type', 'draft step', payload);
    const request = httpMock.expectOne('/base/default/rdmp/api/dashboard-config/merged/rdmp%2Ftype/draft%20step');

    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(payload);
    request.flush({ data: saved });

    await expectAsync(responsePromise).toBeResolvedTo(saved);
  });

  it('saves a view step override through the merged view route', async () => {
    await service.waitForInit();
    const payload: WorkflowStateDashboardConfig = {
      dashboardType: 'consolidated',
      tableConfig: { formatRules: { sortBy: 'metadata.title' } }
    };
    const saved: DashboardTableOverrideConfigData = {
      recordTypes: {},
      views: { 'review/view': { steps: { 'review step': payload } } }
    };

    const responsePromise = service.saveDashboardViewStepConfig('review/view', 'review step', payload);
    const request = httpMock.expectOne('/base/default/rdmp/api/dashboard-config/merged-view/review%2Fview/review%20step');

    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(payload);
    request.flush({ data: saved });

    await expectAsync(responsePromise).toBeResolvedTo(saved);
  });
});
