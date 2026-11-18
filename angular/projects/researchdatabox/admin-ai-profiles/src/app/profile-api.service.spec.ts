import { APP_BASE_HREF } from '@angular/common';
import { HTTP_INTERCEPTORS, HttpContext } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService } from 'projects/researchdatabox/portal-ng-common/src/lib/config.service';
import { CsrfInterceptor, RB_HTTP_INTERCEPTOR_AUTH_CSRF } from 'projects/researchdatabox/portal-ng-common/src/lib/csrf.interceptor';
import { getStubConfigService } from 'projects/researchdatabox/portal-ng-common/src/lib/helper.spec';
import { LoggerService } from 'projects/researchdatabox/portal-ng-common/src/lib/logger.service';
import { UtilityService } from 'projects/researchdatabox/portal-ng-common/src/lib/utility.service';
import { ProfileApiError, ProfileApiService } from './profile-api.service';

import { version, overview } from './test-fixtures';

describe('ProfileApiService', () => {
  let api: ProfileApiService;
  let http: HttpTestingController;
  const base = '/brand/portal/app/ai-profiles';
  beforeEach(() => {
    const config = { ...getStubConfigService(), csrfToken: 'fresh-csrf' };
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [
      ProfileApiService, LoggerService, UtilityService, { provide: APP_BASE_HREF, useValue: '' },
      { provide: ConfigService, useValue: config }, { provide: HTTP_INTERCEPTORS, useClass: CsrfInterceptor, multi: true },
    ] });
    api = TestBed.inject(ProfileApiService); http = TestBed.inject(HttpTestingController);
    spyOn(api, 'waitForInit').and.resolveTo(api); api.brandingAndPortalUrl = '/brand/portal';
    (api as any).httpContext = new HttpContext().set(RB_HTTP_INTERCEPTOR_AUTH_CSRF, 'old-csrf');
  });
  afterEach(() => http.verify());
  it('reads the raw overview once without unwrapping', async () => {
    const pending = api.overview(); await Promise.resolve();
    const req = http.expectOne(base + '/overview'); expect(req.request.method).toBe('GET'); req.flush(overview);
    await expectAsync(pending).toBeResolvedTo(overview);
  });
  const cases = [
    { name: 'discard draft', method: 'DELETE', path: '/versions/id', body: undefined, call: (a: ProfileApiService) => a.discard('id') },
    { name: 'delete profile', method: 'DELETE', path: '/profiles/key', body: undefined, call: (a: ProfileApiService) => a.remove('key') },
    { name: 'publish saved hash', method: 'POST', path: '/versions/id/publish', body: { expectedContentHash: 'hash' }, call: (a: ProfileApiService) => a.publish('id', 'hash') },
    { name: 'run synthetic cases', method: 'POST', path: '/versions/id/tests', body: undefined, call: (a: ProfileApiService) => a.tests('id') },
  ];
  for (const test of cases) {
    it(test.name + ' with refreshed CSRF and raw JSON', async () => {
      const pending = test.call(api); await Promise.resolve(); const req = http.expectOne(base + test.path);
      expect(req.request.method).toBe(test.method); expect(req.request.body ?? undefined).toEqual(test.body);
      expect(req.request.headers.get('X-CSRF-Token')).toBe('fresh-csrf'); req.flush(version); await pending;
    });
  }
  it('retains stable server message keys and 409 status', async () => {
    const pending = api.save('id', { name: 'Plan', definition: version.definition, expectedContentHash: version.contentHash });
    const assertion = expectAsync(pending).toBeRejectedWith(jasmine.objectContaining({ status: 409, messageKey: 'ai-profiles-error-generation-target-conflict' }));
    await Promise.resolve(); http.expectOne(base + '/versions/id').flush({ error: { messageKey: 'ai-profiles-error-generation-target-conflict' } }, { status: 409, statusText: 'Conflict' }); await assertion;
  });
  it('normalizes middleware errors without displaying private server bodies', async () => {
    const pending = api.overview(); const assertion = expectAsync(pending).toBeRejectedWith(jasmine.any(ProfileApiError));
    await Promise.resolve(); http.expectOne(base + '/overview').flush('private backend details', { status: 403, statusText: 'Forbidden' }); await assertion;
    try { await pending; } catch (error) { expect((error as ProfileApiError).messageKey).toBe('ai-profiles-error-generation-source-forbidden'); }
  });
});
