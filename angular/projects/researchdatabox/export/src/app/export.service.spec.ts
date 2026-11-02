import { APP_BASE_HREF } from '@angular/common';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService, RB_HTTP_INTERCEPTOR_AUTH_CSRF, UtilityService } from '@researchdatabox/portal-ng-common';
import { ExportJobDto } from '@researchdatabox/sails-ng-common';
import { ExportService } from './export.service';

function readyJob(overrides: Partial<ExportJobDto> = {}): ExportJobDto {
  return {
    id: 'export-1', recordType: 'rdmp', format: 'csv', modifiedBefore: null, modifiedAfter: null,
    status: 'ready', createdAt: '2026-01-01T00:00:00.000Z', startedAt: '2026-01-01T00:00:01.000Z',
    completedAt: '2026-01-01T00:00:02.000Z', expiresAt: new Date(Date.now() + 86400000).toISOString(),
    filename: 'Plan - Exported Records.csv', byteLength: 123, downloadUrl: 'export/jobs/export-1/download',
    errorCode: null, errorMessage: null, ...overrides
  };
}

describe('ExportService', () => {
  let service: ExportService;
  let http: HttpTestingController;
  const base = 'https://portal.example/context/custom/rdmp';
  let csrfToken: string;

  beforeEach(async () => {
    csrfToken = 'csrf-original';
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        ExportService,
        { provide: APP_BASE_HREF, useValue: '/context' },
        { provide: ConfigService, useValue: { getConfig: async () => ({ baseUrl: 'https://portal.example', branding: 'custom', portal: 'rdmp', csrfToken }) } },
        { provide: UtilityService, useValue: { waitForDependencies: async () => undefined } }
      ]
    });
    service = TestBed.inject(ExportService);
    http = TestBed.inject(HttpTestingController);
    await service.waitForInit();
  });

  afterEach(() => http.verify());

  it('lists scoped jobs using the explicit v2 response envelope', async () => {
    const response = service.list();
    const request = http.expectOne(`${base}/export/jobs`);
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('X-ReDBox-Api-Version')).toBe('2.0');
    request.flush({ data: [readyJob()], meta: {} });
    expect((await response)[0].id).toBe('export-1');
  });

  it('submits the selected options with CSRF opt-in and unwraps acceptance', async () => {
    const input = { format: 'csv' as const, recType: 'dataRecord', after: '2026-01-01T00:00:00.000Z' };
    const response = service.create(input);
    const request = http.expectOne(`${base}/export/jobs`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(input);
    expect(request.request.context.get(RB_HTTP_INTERCEPTOR_AUTH_CSRF)).toBe('csrf-original');
    expect(request.request.headers.get('X-ReDBox-Api-Version')).toBe('2.0');
    request.flush({ data: readyJob({ status: 'queued', downloadUrl: null }), meta: {} }, { status: 202, statusText: 'Accepted' });
    expect((await response).status).toBe('queued');
  });

  it('refreshes the CSRF context when dependencies are initialized after session recovery', async () => {
    csrfToken = 'csrf-renewed';
    await service.waitForInit();
    const response = service.create({ format: 'csv', recType: 'rdmp' });
    const request = http.expectOne(`${base}/export/jobs`);
    expect(request.request.context.get(RB_HTTP_INTERCEPTOR_AUTH_CSRF)).toBe('csrf-renewed');
    request.flush({ data: readyJob(), meta: {} });
    await response;
  });

  it('encodes opaque job identifiers in status URLs', async () => {
    const response = service.get('id /?#');
    const request = http.expectOne(`${base}/export/jobs/id%20%2F%3F%23`);
    expect(request.request.method).toBe('GET');
    request.flush({ data: readyJob(), meta: {} });
    expect((await response).id).toBe('export-1');
  });

  it('deletes an encoded job identifier using CSRF and the v2 API', async () => {
    const response = service.remove('id /?#');
    const request = http.expectOne(`${base}/export/jobs/id%20%2F%3F%23`);
    expect(request.request.method).toBe('DELETE');
    expect(request.request.context.get(RB_HTTP_INTERCEPTOR_AUTH_CSRF)).toBe('csrf-original');
    expect(request.request.headers.get('X-ReDBox-Api-Version')).toBe('2.0');
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(await response).toBeUndefined();
  });

  it('passes deletion failures to the component for visible recovery', async () => {
    const result = expectAsync(service.remove('export-1')).toBeRejectedWith(jasmine.objectContaining({ status: 503 }));
    http.expectOne(`${base}/export/jobs/export-1`).flush({ errors: [{ detail: 'Unavailable' }] }, { status: 503, statusText: 'Unavailable' });
    await result;
  });

  it('passes request failures to the component for visible recovery', async () => {
    const result = expectAsync(service.list()).toBeRejected();
    http.expectOne(`${base}/export/jobs`).flush({ errors: [{ detail: 'Unavailable' }] }, { status: 503, statusText: 'Unavailable' });
    await result;
  });

  it('builds same-portal download links only for unexpired ready jobs', () => {
    expect(service.downloadUrl(readyJob())).toBe(`${base}/export/jobs/export-1/download`);
    expect(service.downloadUrl(readyJob({ id: 'id /?#', downloadUrl: 'https://untrusted.example' }))).toBe(`${base}/export/jobs/id%20%2F%3F%23/download`);
    expect(service.downloadUrl(readyJob({ status: 'running' }))).toBeNull();
    expect(service.downloadUrl(readyJob({ downloadUrl: null }))).toBeNull();
    expect(service.downloadUrl(readyJob({ expiresAt: new Date(Date.now() - 1).toISOString() }))).toBeNull();
    expect(service.downloadUrl(readyJob({ expiresAt: 'invalid' }))).toBeNull();
  });
});
