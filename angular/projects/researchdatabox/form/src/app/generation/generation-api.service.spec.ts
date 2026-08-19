import { APP_BASE_HREF } from '@angular/common';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ConfigService,
  getStubConfigService,
  LoggerService,
  UtilityService,
} from '@researchdatabox/portal-ng-common';
import { provideHttpClient } from '@angular/common/http';
import { GenerationApiService } from './generation-api.service';

describe('GenerationApiService', () => {
  let service: GenerationApiService;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_BASE_HREF, useValue: 'base' },
        { provide: ConfigService, useValue: getStubConfigService() },
        LoggerService,
        UtilityService,
        GenerationApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(GenerationApiService);
    http = TestBed.inject(HttpTestingController);
    await service.waitForInit();
  });

  afterEach(() => http.verify());

  async function settleRequest(): Promise<void> {
    // generationBaseUrl() and waitForInit() are both asynchronous boundaries.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  function expectRequest(url: string, method: string, body: unknown, response: unknown): void {
    const request = http.expectOne(`${service.brandingAndPortalUrl}${url}`);
    expect(request.request.method).toBe(method);
    expect(request.request.headers.get('X-ReDBox-Api-Version')).toBe('2.0');
    if (body !== undefined) expect(request.request.body).toEqual(body);
    request.flush({ data: response });
  }

  it('launches, executes, polls, cancels, and commits through branded v2 AJAX routes', async () => {
    const launchBody = { bindingKey: 'activity-to-rdmp', sourceOid: 'activity-1' };
    const launchPromise = service.launch(launchBody);
    await settleRequest();
    expectRequest('/generation/launch', 'POST', launchBody, { runId: 'run-1', targetUrl: '/target' });
    await expectAsync(launchPromise).toBeResolvedTo({ runId: 'run-1', targetUrl: '/target' });

    const executeBody = {
      answers: [{ id: 'purpose', value: 'Synthetic research' }],
      targetForm: { recordType: 'rdmp', mode: 'create' as const },
      targetDraft: { title: 'Draft' },
    };
    const executePromise = service.execute('run /1', executeBody);
    await settleRequest();
    expectRequest('/generation/runs/run%20%2F1/execute', 'POST', executeBody, {
      runId: 'run /1', status: 'queued', phase: 'provider', attemptCount: 0, retryable: false, questions: [], result: null,
    });
    expect((await executePromise).status).toBe('queued');

    const getPromise = service.getRun('run /1');
    await settleRequest();
    expectRequest('/generation/runs/run%20%2F1', 'GET', undefined, {
      runId: 'run /1', status: 'running', phase: 'provider', attemptCount: 1, retryable: false, questions: [], result: null,
    });
    expect((await getPromise).status).toBe('running');

    const cancelPromise = service.cancel('run /1');
    await settleRequest();
    expectRequest('/generation/runs/run%20%2F1/cancel', 'POST', {}, {
      runId: 'run /1', status: 'cancelRequested', phase: 'provider', attemptCount: 1, retryable: false, questions: [], result: null,
    });
    expect((await cancelPromise).status).toBe('cancelRequested');

    const commitBody = { targetOid: 'target-1', candidateDigest: 'digest', reviewedFieldIds: ['sharing'] };
    const commitPromise = service.commit('run-1', commitBody);
    await settleRequest();
    expectRequest('/generation/runs/run-1/commit', 'POST', commitBody, {
      runId: 'run-1', targetOid: 'target-1', committed: true, provenanceCount: 2,
    });
    expect((await commitPromise).committed).toBeTrue();
  });

  it('loads and reviews provenance with encoded identifiers', async () => {
    const provenancePromise = service.provenance('record /1');
    await settleRequest();
    expectRequest('/record/record%20%2F1/generation-provenance', 'GET', undefined, {
      recordOid: 'record /1', fields: [],
    });
    await expectAsync(provenancePromise).toBeResolvedTo({ recordOid: 'record /1', fields: [] });

    const reviewPromise = service.review('provenance /1');
    await settleRequest();
    expectRequest('/generation/provenance/provenance%20%2F1/review', 'POST', {}, {
      id: 'provenance /1', runId: 'run-1', profileFieldId: 'summary', metadataPointer: '/summary',
      displayState: 'generated', groundingState: 'sourceBacked', reviewRequired: false,
      rationale: 'Synthetic.', evidence: [], generatedAt: new Date(0).toISOString(),
    });
    expect((await reviewPromise).reviewRequired).toBeFalse();
  });

  it('propagates only the server-safe translated error detail', async () => {
    const promise = service.getRun('run-1');
    await settleRequest();
    const request = http.expectOne(`${service.brandingAndPortalUrl}/generation/runs/run-1`);
    request.flush({
      errors: [{ detail: 'generation-error-generation-provider-unavailable' }],
      diagnostic: 'private provider response',
    }, { status: 503, statusText: 'Unavailable' });

    await expectAsync(promise).toBeRejectedWithError('generation-error-generation-provider-unavailable');
  });
});
