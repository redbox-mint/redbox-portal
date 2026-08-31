import { APP_BASE_HREF } from '@angular/common';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService, getStubConfigService, LoggerService, UtilityService } from '@researchdatabox/portal-ng-common';
import {
  DashboardConfigApiService,
  DashboardTableOverrideConfigData,
  WorkflowStateDashboardConfig,
} from './dashboard-config-api.service';

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
        { provide: APP_BASE_HREF, useValue: '/base' },
      ],
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
      tableConfig: { rowConfig: [{ title: 'Title', variable: 'metadata.title', template: '{{title}}' }] },
    };
    const saved: DashboardTableOverrideConfigData = {
      recordTypes: { rdmp: { steps: { draft: payload } } },
      views: {},
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
      tableConfig: { formatRules: { sortBy: 'metadata.title' } },
    };
    const saved: DashboardTableOverrideConfigData = {
      recordTypes: {},
      views: { 'review/view': { steps: { 'review step': payload } } },
    };

    const responsePromise = service.saveDashboardViewStepConfig('review/view', 'review step', payload);
    const request = httpMock.expectOne(
      '/base/default/rdmp/api/dashboard-config/merged-view/review%2Fview/review%20step'
    );

    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(payload);
    request.flush({ data: saved });

    await expectAsync(responsePromise).toBeResolvedTo(saved);
  });

  it('reads dashboard configuration resources from their registered routes', async () => {
    await service.waitForInit();

    const info = { recordTypes: [], views: [], dashboardTypes: [] };
    const infoPromise = service.getConfigInfo();
    httpMock.expectOne('/base/default/rdmp/api/dashboard-config/info').flush(info);
    await expectAsync(infoPromise).toBeResolvedTo(info);

    const defaults = { dashboardType: 'standard' };
    const defaultsPromise = service.getDefaults({
      recordType: 'rdmp/type',
      workflowStage: 'draft step',
      viewName: undefined,
    });
    httpMock
      .expectOne('/base/default/rdmp/api/dashboard-config/defaults?recordType=rdmp%2Ftype&workflowStage=draft+step')
      .flush({ data: defaults });
    await expectAsync(defaultsPromise).toBeResolvedTo(defaults);

    const overrides: DashboardTableOverrideConfigData = { recordTypes: {}, views: {} };
    const overridesPromise = service.getOverrides();
    httpMock.expectOne('/base/default/rdmp/api/dashboard-config/overrides').flush({ data: overrides });
    await expectAsync(overridesPromise).toBeResolvedTo(overrides);

    const dashboardType = { name: 'standard', formatRules: {}, tableConfig: {} };
    const dashboardTypesPromise = service.getDashboardTypes();
    httpMock
      .expectOne('/base/default/rdmp/api/dashboard-config/dashboard-types')
      .flush({ data: { dashboardTypes: [dashboardType] } });
    await expectAsync(dashboardTypesPromise).toBeResolvedTo([dashboardType]);

    const dashboardTypePromise = service.getDashboardType('standard/type');
    httpMock
      .expectOne('/base/default/rdmp/api/dashboard-config/dashboard-types/standard%2Ftype')
      .flush({ data: dashboardType });
    await expectAsync(dashboardTypePromise).toBeResolvedTo(dashboardType);

    const mergedPromise = service.getMergedConfig('rdmp/type', 'draft step');
    httpMock.expectOne('/base/default/rdmp/api/dashboard-config/merged/rdmp%2Ftype/draft%20step').flush({ data: null });
    await expectAsync(mergedPromise).toBeResolvedTo(null);

    const mergedViewPromise = service.getMergedViewConfig('review/view', 'review step');
    httpMock
      .expectOne('/base/default/rdmp/api/dashboard-config/merged-view/review%2Fview/review%20step')
      .flush({ data: null });
    await expectAsync(mergedViewPromise).toBeResolvedTo(null);

    const formatRules = { sortBy: 'metadata.title' };
    const formatRulesPromise = service.getMergedTypeFormatRules('standard/type');
    httpMock
      .expectOne('/base/default/rdmp/api/dashboard-config/merged-type/standard%2Ftype')
      .flush({ data: formatRules });
    await expectAsync(formatRulesPromise).toBeResolvedTo(formatRules);
  });

  it('mutates dashboard overrides and dashboard types through their registered routes', async () => {
    await service.waitForInit();

    const overrides: DashboardTableOverrideConfigData = { recordTypes: {}, views: {} };
    const saveOverridesPromise = service.saveOverrides(overrides);
    const saveOverridesRequest = httpMock.expectOne('/base/default/rdmp/api/dashboard-config/overrides');
    expect(saveOverridesRequest.request.method).toBe('PUT');
    expect(saveOverridesRequest.request.body).toEqual(overrides);
    saveOverridesRequest.flush({ data: overrides });
    await expectAsync(saveOverridesPromise).toBeResolvedTo(overrides);

    const dashboardType = { name: 'standard/type', formatRules: {}, tableConfig: {} };
    const createPromise = service.createDashboardType(dashboardType);
    const createRequest = httpMock.expectOne('/base/default/rdmp/api/dashboard-config/dashboard-types');
    expect(createRequest.request.method).toBe('POST');
    createRequest.flush({ data: dashboardType });
    await expectAsync(createPromise).toBeResolvedTo(dashboardType);

    const update = { description: 'Updated dashboard type' };
    const updatedDashboardType = { ...dashboardType, ...update };
    const updatePromise = service.updateDashboardType('standard/type', update);
    const updateRequest = httpMock.expectOne('/base/default/rdmp/api/dashboard-config/dashboard-types/standard%2Ftype');
    expect(updateRequest.request.method).toBe('PUT');
    expect(updateRequest.request.body).toEqual(update);
    updateRequest.flush({ data: updatedDashboardType });
    await expectAsync(updatePromise).toBeResolvedTo(updatedDashboardType);

    const deletePromise = service.deleteDashboardType('standard/type');
    const deleteRequest = httpMock.expectOne('/base/default/rdmp/api/dashboard-config/dashboard-types/standard%2Ftype');
    expect(deleteRequest.request.method).toBe('DELETE');
    deleteRequest.flush({ data: { deleted: true } });
    await expectAsync(deletePromise).toBeResolvedTo({ deleted: true });
  });
});
