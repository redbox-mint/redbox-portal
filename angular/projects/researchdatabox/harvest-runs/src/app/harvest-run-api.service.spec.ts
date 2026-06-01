import { APP_BASE_HREF } from '@angular/common';
import { HttpContext } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService, getStubConfigService, LoggerService, UtilityService } from '@researchdatabox/portal-ng-common';
import { HarvestRunApiService } from './harvest-run-api.service';

describe('HarvestRunApiService', () => {
  let httpTestingController: HttpTestingController;
  let service: HarvestRunApiService;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: 'base'
        },
        {
          provide: ConfigService,
          useValue: getStubConfigService()
        },
        LoggerService,
        UtilityService,
        HarvestRunApiService
      ]
    });

    httpTestingController = TestBed.inject(HttpTestingController);
    service = TestBed.inject(HarvestRunApiService);
    spyOn(service, 'waitForInit').and.resolveTo(service);
    (service as any).brandingAndPortalUrl = 'http://localhost/default/rdmp';
    (service as any).httpContext = new HttpContext();
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('builds list run requests with query parameters', async () => {
    const responsePromise = service.listRuns({ status: 'running', page: 2, pageSize: 10, sourceName: 'source-a' });
    await Promise.resolve();

    const request = httpTestingController.expectOne(req =>
      req.method === 'GET'
      && req.url.includes('/default/rdmp/api/harvest-runs')
      && req.params.get('status') === 'running'
      && req.params.get('page') === '2'
      && req.params.get('pageSize') === '10'
      && req.params.get('sourceName') === 'source-a'
    );
    request.flush({
      summary: { numFound: 1, page: 2, start: 10 },
      records: [{ id: 'run-1', sourceRunId: 'run-a', sourceName: 'source-a', recordType: 'rdmp', status: 'running', totalProcessed: 3, created: 1, updated: 1, deleted: 0, unchanged: 1, failed: 0, chunksProcessed: 1, duplicateChunks: 0 }]
    });

    await expectAsync(responsePromise).toBeResolvedTo({
      summary: { numFound: 1, page: 2, start: 10 },
      records: [{ id: 'run-1', sourceRunId: 'run-a', sourceName: 'source-a', recordType: 'rdmp', status: 'running', totalProcessed: 3, created: 1, updated: 1, deleted: 0, unchanged: 1, failed: 0, chunksProcessed: 1, duplicateChunks: 0 }]
    });
  });

  it('unwraps run detail responses from a v2-style data envelope', async () => {
    const responsePromise = service.getRun('run-1');
    await Promise.resolve();

    const request = httpTestingController.expectOne(req => req.method === 'GET' && req.url.includes('/default/rdmp/api/harvest-runs/run-1'));
    expect(request.request.method).toBe('GET');
    request.flush({
      data: {
        run: { id: 'run-1', sourceRunId: 'run-a', sourceName: 'source-a', recordType: 'rdmp', status: 'running', totalProcessed: 1, created: 1, updated: 0, deleted: 0, unchanged: 0, failed: 0, chunksProcessed: 1, duplicateChunks: 0 },
        chunks: [],
        events: [],
        aggregateCounts: { totalProcessed: 1, created: 1, updated: 0, deleted: 0, unchanged: 0, failed: 0, chunksProcessed: 1, duplicateChunks: 0 }
      }
    });

    await expectAsync(responsePromise).toBeResolvedTo({
      run: { id: 'run-1', sourceRunId: 'run-a', sourceName: 'source-a', recordType: 'rdmp', status: 'running', totalProcessed: 1, created: 1, updated: 0, deleted: 0, unchanged: 0, failed: 0, chunksProcessed: 1, duplicateChunks: 0 },
      chunks: [],
      events: [],
      aggregateCounts: { totalProcessed: 1, created: 1, updated: 0, deleted: 0, unchanged: 0, failed: 0, chunksProcessed: 1, duplicateChunks: 0 }
    });
  });

  it('builds paginated event requests', async () => {
    const responsePromise = service.listRunEvents('run-1', { page: 3, pageSize: 5, harvestId: 'harvest-1' });
    await Promise.resolve();

    const request = httpTestingController.expectOne(req =>
      req.method === 'GET'
      && req.url.includes('/default/rdmp/api/harvest-runs/run-1/events')
      && req.params.get('page') === '3'
      && req.params.get('pageSize') === '5'
      && req.params.get('harvestId') === 'harvest-1'
    );
    request.flush({
      summary: { numFound: 1, page: 3, start: 10 },
      records: [{ id: 'event-1', harvestId: 'harvest-1', operation: 'upsert', outcome: 'updated', status: true, createdAt: '2026-05-25T10:00:00Z' }]
    });

    await expectAsync(responsePromise).toBeResolvedTo({
      summary: { numFound: 1, page: 3, start: 10 },
      records: [{ id: 'event-1', harvestId: 'harvest-1', operation: 'upsert', outcome: 'updated', status: true, createdAt: '2026-05-25T10:00:00Z' }]
    });
  });
});
