import { APP_BASE_HREF } from '@angular/common';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService } from './config.service';
import { getStubConfigService } from './helper.spec';
import { LoggerService } from './logger.service';
import { UtilityService } from './utility.service';
import { WorkspaceTypeService } from './workspace-type.service';

describe('WorkspaceTypeService', () => {
  let service: WorkspaceTypeService;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: APP_BASE_HREF, useValue: 'base' },
        { provide: ConfigService, useValue: getStubConfigService() },
        LoggerService,
        UtilityService,
        WorkspaceTypeService,
      ],
    });
    service = TestBed.inject(WorkspaceTypeService);
    http = TestBed.inject(HttpTestingController);
    await service.waitForInit();
  });

  afterEach(() => http.verify());

  it('loads and filters workspace types from the data envelope', async () => {
    const promise = service.getWorkspaceTypes();
    await Promise.resolve();
    const request = http.expectOne(`${service.brandingAndPortalUrl}/workspaces/types`);
    expect(request.request.method).toBe('GET');
    request.flush({
      data: { status: true, workspaceTypes: [{ name: 'gitlab', label: 'GitLab' }, { label: 'invalid' }] },
    });
    await expectAsync(promise).toBeResolvedTo({ status: true, workspaceTypes: [{ name: 'gitlab', label: 'GitLab' }] });
  });

  it('encodes a workspace name and unwraps a single workspace type', async () => {
    const promise = service.getWorkspaceType('cloud space');
    await Promise.resolve();
    const request = http.expectOne(`${service.brandingAndPortalUrl}/workspaces/types/cloud%20space`);
    expect(request.request.method).toBe('GET');
    request.flush({ data: { status: true, workspaceType: { name: 'cloud space' } } });
    await expectAsync(promise).toBeResolvedTo({ name: 'cloud space' });
  });
});
