import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ConfigService, getStubConfigService, LoggerService, UtilityService } from '@researchdatabox/portal-ng-common';
import { RecordPermissionsService } from './record-permissions.service';

const summary = {
  edit: [{ username: 'forms-user', name: 'Forms User', email: 'forms-user@example.invalid' }],
  view: [],
  editPending: [],
  viewPending: ['forms-pending@example.invalid'],
  editRoles: ['Admin'],
  viewRoles: [],
};

describe('RecordPermissionsService', () => {
  let service: RecordPermissionsService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_BASE_HREF, useValue: '' },
        { provide: ConfigService, useValue: getStubConfigService() },
        LoggerService,
        UtilityService,
        provideHttpClient(),
        provideHttpClientTesting(),
        RecordPermissionsService,
      ],
    });
    service = TestBed.inject(RecordPermissionsService);
    http = TestBed.inject(HttpTestingController);
    spyOn(service, 'waitForInit').and.resolveTo(service);
    service.brandingAndPortalUrl = 'http://localhost/default/rdmp';
  });
  afterEach(() => http.verify());

  for (const wrapped of [true, false]) {
    it(`reads the supported summary endpoint (${wrapped ? 'v2' : 'legacy'}) using GET only`, async () => {
      const result = service.getSummary(' forms-oid/1 ');
      await Promise.resolve();
      const request = http.expectOne('http://localhost/default/rdmp/record/forms-oid%2F1/permissions');
      expect(request.request.method).toBe('GET');
      expect(request.request.headers.get('X-ReDBox-Api-Version')).toBe('2.0');
      request.flush(wrapped ? { data: summary, meta: { oid: 'forms-oid/1' } } : summary);
      expect(await result).toEqual(summary);
    });
  }
  it('rejects an empty OID without a request', async () => {
    await expectAsync(service.getSummary(' ')).toBeRejectedWithError('Record oid is required.');
    http.expectNone(() => true);
  });
  it('propagates access denial instead of presenting empty permissions', async () => {
    const result = service.getSummary('forms-denied');
    await Promise.resolve();
    http
      .expectOne('http://localhost/default/rdmp/record/forms-denied/permissions')
      .flush({}, { status: 403, statusText: 'Forbidden' });
    await expectAsync(result).toBeRejected();
  });
  it('rejects malformed summaries instead of showing a successful empty table', async () => {
    const result = service.getSummary('forms-invalid');
    await Promise.resolve();
    http
      .expectOne('http://localhost/default/rdmp/record/forms-invalid/permissions')
      .flush({ data: { ...summary, edit: ['forms-user'] } });
    await expectAsync(result).toBeRejectedWithError('Invalid record permissions summary.');
  });
});
