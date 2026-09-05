import { APP_BASE_HREF } from '@angular/common';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthorizationProjection } from './authorization-projection.models';
import { AuthorizationProjectionService } from './authorization-projection.service';
import { ConfigService } from './config.service';
import { LoggerService } from './logger.service';
import { UtilityService } from './utility.service';

describe('AuthorizationProjectionService', () => {
  let service: AuthorizationProjectionService;
  let configService: ConfigService;
  let http: HttpTestingController;

  const projection: AuthorizationProjection = {
    brand: { id: 'brand-1', name: 'default' },
    rolloutMode: 'enforce',
    principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'user-1' },
    roles: [],
    scopeKeys: ['authorization.role.read'],
  };

  // load() unconditionally awaits waitForInit(), so the HTTP request is issued a
  // microtask later; a macrotask reliably flushes every pending continuation.
  const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: APP_BASE_HREF, useValue: '/redbox' },
        ConfigService,
        LoggerService,
        UtilityService,
        AuthorizationProjectionService,
      ],
    });
    service = TestBed.inject(AuthorizationProjectionService);
    configService = TestBed.inject(ConfigService);
    http = TestBed.inject(HttpTestingController);

    http.expectOne(configService.csrfTokenUrl).flush({ _csrf: 'csrf-token' });
    http.expectOne(configService.configUrl).flush({ baseUrl: '', branding: 'default', portal: 'rdmp' });
    await service.waitForInit();
  });

  afterEach(() => http.verify());

  it('loads /me once, exposes synchronous scope checks, and shares the cached projection', async () => {
    const first = service.load();
    const second = service.load();
    await tick();
    expect(service.state.status).toBe('loading');

    http.expectOne('/redbox/default/rdmp/api/authorization/me').flush(projection);

    await expectAsync(first).toBeResolvedTo(projection);
    await expectAsync(second).toBeResolvedTo(projection);
    expect(service.state.status).toBe('loaded');
    expect(service.hasScope('authorization.role.read')).toBeTrue();
    expect(service.hasScope('authorization.role.manage')).toBeFalse();

    await expectAsync(service.load()).toBeResolvedTo(projection);
    http.expectNone('/redbox/default/rdmp/api/authorization/me');
  });

  it('fails closed and removes stale scopes when refresh fails', async () => {
    const first = service.load();
    await tick();
    http.expectOne('/redbox/default/rdmp/api/authorization/me').flush({ data: projection });
    await first;
    expect(service.hasScope('authorization.role.read')).toBeTrue();

    const refresh = service.refresh();
    await tick();
    http
      .expectOne('/redbox/default/rdmp/api/authorization/me')
      .flush({ code: 'authorization.unavailable' }, { status: 503, statusText: 'Unavailable' });

    await expectAsync(refresh).toBeRejected();
    expect(service.state.status).toBe('error');
    expect(service.projection).toBeUndefined();
    expect(service.hasScope('authorization.role.read')).toBeFalse();
  });

  it('invalidates cached authority after session or context mutation', async () => {
    const load = service.load();
    await tick();
    http.expectOne('/redbox/default/rdmp/api/authorization/me').flush(projection);
    await load;

    service.invalidate();

    expect(service.state).toEqual({ status: 'idle' });
    expect(service.hasScope('authorization.role.read')).toBeFalse();
    const reloaded = service.load();
    await tick();
    http.expectOne('/redbox/default/rdmp/api/authorization/me').flush(projection);
    await reloaded;
  });

  it('rejects malformed responses without granting scopes', async () => {
    const load = service.load();
    await tick();
    http.expectOne('/redbox/default/rdmp/api/authorization/me').flush({ scopeKeys: ['system.authorization.manage'] });

    await expectAsync(load).toBeRejectedWithError('The authorization projection response was invalid.');
    expect(service.state.status).toBe('error');
    expect(service.hasScope('system.authorization.manage')).toBeFalse();
  });
});
