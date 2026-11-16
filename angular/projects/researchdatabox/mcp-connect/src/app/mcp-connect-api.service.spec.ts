import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { APP_BASE_HREF } from '@angular/common';
import { ConfigService, UtilityService, getStubConfigService } from '@researchdatabox/portal-ng-common';
import { McpConnectApiService } from './mcp-connect-api.service';

describe('MCP admin status endpoint', () => {
  it('requests the branded admin URL and unwraps the standard response', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        McpConnectApiService,
        { provide: APP_BASE_HREF, useValue: '' },
        { provide: UtilityService, useValue: {} },
        { provide: ConfigService, useValue: getStubConfigService() },
      ],
    });
    const service = TestBed.inject(McpConnectApiService);
    spyOn(service, 'waitForInit').and.resolveTo(service);
    Reflect.set(service, 'brandingAndPortalUrl', '/default/rdmp');
    const result = service.status();
    await Promise.resolve();
    const http = TestBed.inject(HttpTestingController);
    const request = http.expectOne('/default/rdmp/admin/mcp/status');
    expect(request.request.method).toBe('GET');
    const data = { state: 'oidc-required', brand: 'default', institutionalLoginUrl: '/default/rdmp/user/login' };
    request.flush({ data });
    expect(await result).toEqual(jasmine.objectContaining(data));
    http.verify();
  });
});
