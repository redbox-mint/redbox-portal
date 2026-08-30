import { APP_BASE_HREF } from '@angular/common';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ConfigService,
  getStubConfigService,
  LoggerService,
  RB_HTTP_INTERCEPTOR_AUTH_CSRF,
  UtilityService,
} from '@researchdatabox/portal-ng-common';
import { AuthorizationAdminError, AuthorizationAdminService } from './authorization-admin.service';

describe('AuthorizationAdminService', () => {
  let http: HttpTestingController;
  let service: AuthorizationAdminService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthorizationAdminService,
        { provide: APP_BASE_HREF, useValue: 'base' },
        { provide: ConfigService, useValue: getStubConfigService() },
        LoggerService,
        UtilityService,
      ],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(AuthorizationAdminService);
    await service.waitForInit();
    service.brandingAndPortalUrl = 'http://localhost/default/rdmp';
  });

  afterEach(() => http.verify());

  it('loads /me relative to the active brand and unwraps a v2 response', async () => {
    const promise = service.getMe();
    await Promise.resolve();
    const request = http.expectOne('http://localhost/default/rdmp/api/authorization/me');
    expect(request.request.method).toBe('GET');
    expect(request.request.context.get(RB_HTTP_INTERCEPTOR_AUTH_CSRF)).toBe('testCsrfValue');
    request.flush({
      data: {
        brand: { id: 'brand-1', name: 'Brand one' },
        rolloutMode: 'shadow',
        principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'user-1' },
        roles: [],
        scopeKeys: ['authorization.self.read'],
      },
      meta: {},
    });
    expect((await promise).rolloutMode).toBe('shadow');
  });

  it('sends documented cursor filters and URL-encodes grandfathered role keys', async () => {
    const listPromise = service.listRoles({ search: 'data steward', status: 'active', limit: 25 });
    await Promise.resolve();
    const list = http.expectOne(
      request =>
        request.url.endsWith('/api/authorization/roles') &&
        request.params.get('search') === 'data steward' &&
        request.params.get('status') === 'active' &&
        request.params.get('limit') === '25'
    );
    list.flush({ items: [] });
    await listPromise;

    const rolePromise = service.getRole('Legacy Role');
    await Promise.resolve();
    const role = http.expectOne('http://localhost/default/rdmp/api/authorization/roles/Legacy%20Role');
    role.flush({ key: 'Legacy Role' });
    expect((await rolePromise).key).toBe('Legacy Role');
  });

  it('uses DELETE request bodies for versioned revoke and lifecycle preview', async () => {
    const promise = service.revokeAssignment('researcher', 'user/1', { expectedVersion: 4, reason: 'reviewed' });
    await Promise.resolve();
    const request = http.expectOne(
      'http://localhost/default/rdmp/api/authorization/assignments/researcher/users/user%2F1'
    );
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({ expectedVersion: 4, reason: 'reviewed' });
    request.flush({ data: {}, version: 5, auditEventId: 'audit-1', requestId: 'request-1', changed: true });
    await promise;
  });

  it('maps Problem Details conflicts to a recoverable typed UI error', async () => {
    const promise = service.updateRole('researcher', { expectedVersion: 1, displayName: 'Changed' });
    await Promise.resolve();
    http
      .expectOne(request => request.method === 'PATCH')
      .flush(
        {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          detail: 'bounded detail',
          instance: '/roles/researcher',
          code: 'authorization.version-conflict',
          requestId: 'request-conflict',
        },
        { status: 409, statusText: 'Conflict' }
      );

    try {
      await promise;
      fail('Expected a conflict error');
    } catch (error) {
      expect(error instanceof AuthorizationAdminError).toBeTrue();
      const typed = error as AuthorizationAdminError;
      expect(typed.isConflict).toBeTrue();
      expect(typed.requestId).toBe('request-conflict');
      expect(typed.message).toContain('input is preserved');
    }
  });

  it('does not expose arbitrary server details from a 500 response', async () => {
    const promise = service.getMe();
    await Promise.resolve();
    http
      .expectOne(request => request.url.endsWith('/authorization/me'))
      .flush(
        {
          status: 500,
          code: 'authorization.internal-error',
          detail: 'database-password=should-never-render',
        },
        { status: 500, statusText: 'Server Error' }
      );

    await expectAsync(promise).toBeRejectedWithError(AuthorizationAdminError, /server could not complete/i);
    try {
      await promise;
    } catch (error) {
      expect((error as AuthorizationAdminError).message).not.toContain('database-password');
    }
  });
});
