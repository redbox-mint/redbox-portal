import { APP_BASE_HREF } from '@angular/common';
import { HttpContext } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService, getStubConfigService, LoggerService, UtilityService } from '@researchdatabox/portal-ng-common';
import { SiemAdminApiService, SiemConfiguration } from './siem-admin-api.service';

const sampleConfig: SiemConfiguration = {
  enabled: true,
  destinations: [
    { id: 'dest-1', name: 'Splunk', enabled: true, adapterType: 'splunk-hec-json', endpointUrl: 'https://splunk.example', token: '__REDACTED__' }
  ],
  events: { categories: { authentication: true, authorization: true, userManagement: true, recordLifecycle: true, integrationAudit: true, attachmentAccess: true }, severity: {} },
  redaction: { denylistedPaths: ['password'], maxPayloadBytes: 65536, includeActorEmail: false, includeIpAddress: false, includeUserAgent: false },
  delivery: { batchSize: 50, maxAttempts: 3, retryDelayMs: 60000, retryBackoffMultiplier: 2, deadLetterRetentionDays: 30, nonBlocking: true }
};

describe('SiemAdminApiService', () => {
  let httpTestingController: HttpTestingController;
  let service: SiemAdminApiService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: APP_BASE_HREF, useValue: 'base' },
        { provide: ConfigService, useValue: getStubConfigService() },
        LoggerService,
        UtilityService,
        SiemAdminApiService
      ]
    });

    httpTestingController = TestBed.inject(HttpTestingController);
    service = TestBed.inject(SiemAdminApiService);
    spyOn(service, 'waitForInit').and.resolveTo(service);
    (service as any).brandingAndPortalUrl = 'http://localhost/default/rdmp';
    (service as any).httpContext = new HttpContext();
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('unwraps the config from a data envelope', async () => {
    const responsePromise = service.getSiemConfig();
    await Promise.resolve();

    const request = httpTestingController.expectOne(req => req.method === 'GET' && req.url === 'http://localhost/default/rdmp/api/siem/config');
    request.flush({ data: sampleConfig });

    await expectAsync(responsePromise).toBeResolvedTo(sampleConfig);
  });

  it('sends the full config on save via PUT', async () => {
    const responsePromise = service.saveSiemConfig(sampleConfig);
    await Promise.resolve();

    const request = httpTestingController.expectOne(req => req.method === 'PUT' && req.url === 'http://localhost/default/rdmp/api/siem/config');
    expect(request.request.body).toEqual(sampleConfig);
    request.flush({ data: sampleConfig });

    await expectAsync(responsePromise).toBeResolvedTo(sampleConfig);
  });

  it('builds event requests using the supported params', async () => {
    const responsePromise = service.getEvents({ category: 'authentication', deliveryState: 'failed', eventType: 'authentication.login.failure', limit: 25, skip: 50 });
    await Promise.resolve();

    const request = httpTestingController.expectOne(req =>
      req.method === 'GET'
      && req.url === 'http://localhost/default/rdmp/api/siem/events'
      && req.params.get('category') === 'authentication'
      && req.params.get('deliveryState') === 'failed'
      && req.params.get('eventType') === 'authentication.login.failure'
      && req.params.get('limit') === '25'
      && req.params.get('skip') === '50'
    );
    request.flush({ data: { rows: [{ eventId: 'e1' }], total: 1 } });

    await expectAsync(responsePromise).toBeResolvedTo({ rows: [{ eventId: 'e1' }], total: 1 });
  });

  it('builds delivery status requests using the supported params', async () => {
    const responsePromise = service.getDeliveryStatus({ destinationId: 'dest-1', status: 'failed', limit: 25, skip: 0 });
    await Promise.resolve();

    const request = httpTestingController.expectOne(req =>
      req.method === 'GET'
      && req.url === 'http://localhost/default/rdmp/api/siem/delivery-status'
      && req.params.get('destinationId') === 'dest-1'
      && req.params.get('status') === 'failed'
      && req.params.get('limit') === '25'
    );
    request.flush({ data: { rows: [], total: 0 } });

    await expectAsync(responsePromise).toBeResolvedTo({ rows: [], total: 0 });
  });

  it('posts the destination draft when testing', async () => {
    const destination = sampleConfig.destinations[0];
    const responsePromise = service.testDestination({ destination, redaction: sampleConfig.redaction });
    await Promise.resolve();

    const request = httpTestingController.expectOne(req => req.method === 'POST' && req.url === 'http://localhost/default/rdmp/api/siem/test');
    expect(request.request.body).toEqual({ destination, redaction: sampleConfig.redaction });
    request.flush({ data: { status: 'success', httpStatusCode: 200, durationMs: 120 } });

    await expectAsync(responsePromise).toBeResolvedTo({ status: 'success', httpStatusCode: 200, durationMs: 120 });
  });
});
