import { APP_BASE_HREF } from '@angular/common';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService } from './config.service';
import { getStubConfigService } from './helper.spec';
import { LoggerService } from './logger.service';
import { RecordActionResult, RecordService } from './record.service';
import { UtilityService } from './utility.service';

describe('RecordService', () => {
  let httpTestingController: HttpTestingController;
  let recordService: RecordService;
  const entityTag = (revision: number, digest = 'a') => `"rb-record-v1.${revision}.${digest.repeat(43)}"`;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: 'base',
        },
        {
          provide: ConfigService,
          useValue: getStubConfigService(),
        },
        LoggerService,
        UtilityService,
        RecordService,
      ],
    });

    httpTestingController = TestBed.inject(HttpTestingController);
    recordService = TestBed.inject(RecordService);

    await recordService.waitForInit();
  });

  afterEach(() => {
    httpTestingController.verify();
  });

  it('creates a UUID save request header', async () => {
    const createPromise = recordService.create({ title: 'Test record' }, 'rdmp');
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/rdmp`);
    const requestId = request.request.headers.get('X-ReDBox-Save-Request-Id');

    expect(request.request.method).toBe('POST');
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

    request.flush({ meta: { outcome: 'saved', success: true, oid: 'oid-123' } });
    await expectAsync(createPromise).toBeResolvedTo(
      jasmine.objectContaining({
        outcome: 'saved',
        oid: 'oid-123',
      })
    );
  });

  it('requests API v2 and keeps the CSRF context on saves', async () => {
    const updatePromise = recordService.update('oid-123', { title: 'Test record' }, '', undefined, {
      entityTag: entityTag(4),
      formFingerprint: 'sha256:form_1',
    });
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/oid-123`);

    expect(request.request.method).toBe('PUT');
    expect(request.request.headers.get('X-ReDBox-Api-Version')).toBe('2.0');
    expect(request.request.headers.get('If-Match')).toBe(entityTag(4));
    expect(request.request.headers.get('X-ReDBox-Form-Fingerprint')).toBe('sha256:form_1');
    expect(request.request.context).toBeTruthy();

    request.flush({ meta: { outcome: 'saved', success: true, oid: 'oid-123' } });
    await updatePromise;
  });

  it('keeps create precondition-free while sending its generated-form fingerprint', async () => {
    const createPromise = recordService.create({ title: 'Test record' }, 'rdmp', '', undefined, {
      formFingerprint: 'sha256:create_form',
    });
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/rdmp`);

    expect(request.request.headers.has('If-Match')).toBeFalse();
    expect(request.request.headers.get('X-ReDBox-Form-Fingerprint')).toBe('sha256:create_form');
    request.flush({ meta: { outcome: 'saved', success: true, oid: 'oid-created' } });

    expect((await createPromise).outcome).toBe('saved');
  });

  it('links a client resolution to the failed request while generating a fresh request ID', async () => {
    const failedRequestId = '11111111-1111-4111-8111-111111111111';
    const retryPromise = recordService.update('oid-123', { title: 'Resolved' }, '', undefined, {
      entityTag: entityTag(9),
      formFingerprint: 'sha256:form_1',
      resolution: 'client-auto-merged',
      resolutionOfRequestId: failedRequestId,
    });
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/oid-123`);
    const retryRequestId = request.request.headers.get('X-ReDBox-Save-Request-Id');

    expect(retryRequestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(retryRequestId).not.toBe(failedRequestId);
    expect(request.request.headers.get('X-ReDBox-Concurrency-Resolution')).toBe('client-auto-merged');
    expect(request.request.headers.get('X-ReDBox-Resolution-Of-Request-Id')).toBe(failedRequestId);
    expect(request.request.headers.get('If-Match')).toBe(entityTag(9));
    request.flush({ meta: { outcome: 'saved', success: true, oid: 'oid-123' } });

    await retryPromise;
  });

  it('sends a manual resolution as an ordinary conditional update with no force or bypass parameter', async () => {
    const failedRequestId = '11111111-1111-4111-8111-111111111111';
    const resolutionPromise = recordService.update('oid-123', { title: 'Mine' }, '', undefined, {
      entityTag: entityTag(10),
      formFingerprint: 'sha256:form_1',
      resolution: 'client-manually-resolved',
      resolutionOfRequestId: failedRequestId,
    });
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/oid-123`);

    expect(request.request.method).toBe('PUT');
    expect(request.request.headers.get('If-Match')).toBe(entityTag(10));
    expect(request.request.headers.get('X-ReDBox-Concurrency-Resolution')).toBe('client-manually-resolved');
    expect(request.request.headers.get('X-ReDBox-Resolution-Of-Request-Id')).toBe(failedRequestId);
    expect(request.request.params.has('force')).toBeFalse();
    expect(request.request.params.has('bypass')).toBeFalse();
    expect(request.request.headers.has('X-ReDBox-Force')).toBeFalse();
    expect(request.request.headers.has('X-ReDBox-Bypass')).toBeFalse();
    request.flush({ meta: { outcome: 'saved', success: true, oid: 'oid-123' } });

    await resolutionPromise;
  });

  it('sends operation intent on create, update, and target-step transition requests', async () => {
    const createPromise = recordService.create({ title: 'Draft' }, 'rdmp', '', 'draft');
    const createRequest = httpTestingController.expectOne(
      request =>
        request.url === `${recordService.brandingAndPortalUrl}/recordmeta/rdmp` &&
        request.params.get('operation') === 'draft' &&
        !request.params.has('targetStep')
    );
    expect(createRequest.request.method).toBe('POST');
    expect(createRequest.request.params.keys()).toEqual(['operation']);
    createRequest.flush({ meta: { outcome: 'saved', success: true, oid: 'oid-created' } });
    await createPromise;

    const updatePromise = recordService.update('oid-123', { title: 'Saved' }, '', 'save');
    const updateRequest = httpTestingController.expectOne(
      request =>
        request.url === `${recordService.brandingAndPortalUrl}/recordmeta/oid-123` &&
        request.params.get('operation') === 'save' &&
        !request.params.has('targetStep')
    );
    expect(updateRequest.request.method).toBe('PUT');
    updateRequest.flush({ meta: { outcome: 'saved', success: true, oid: 'oid-123' } });
    await updatePromise;

    const transitionPromise = recordService.update('oid-123', { title: 'Submitted' }, 'review', 'submit');
    const transitionRequest = httpTestingController.expectOne(
      request =>
        request.url === `${recordService.brandingAndPortalUrl}/recordmeta/oid-123` &&
        request.params.get('targetStep') === 'review' &&
        request.params.get('operation') === 'submit'
    );
    expect(transitionRequest.request.method).toBe('PUT');
    expect(transitionRequest.request.params.has('enabledValidationGroups')).toBeFalse();
    transitionRequest.flush({ meta: { outcome: 'saved', success: true, oid: 'oid-123' } });
    await transitionPromise;
  });

  it('keeps no-operation save requests compatible', async () => {
    const updatePromise = recordService.update('oid-123', { title: 'Legacy' }, 'review');
    const request = httpTestingController.expectOne(
      request =>
        request.url === `${recordService.brandingAndPortalUrl}/recordmeta/oid-123` &&
        request.params.get('targetStep') === 'review' &&
        !request.params.has('operation')
    );
    expect(request.request.method).toBe('PUT');
    expect(request.request.params.has('operation')).toBeFalse();

    request.flush({ meta: { outcome: 'saved', success: true, oid: 'oid-123' } });
    await updatePromise;
  });

  it('normalises a persisted warning without losing the oid', async () => {
    const updatePromise = recordService.update('oid-123', { title: 'Test record' });
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/oid-123`);
    const originatingRequestId = request.request.headers.get('X-ReDBox-Save-Request-Id')!;
    request.flush({
      data: { oid: 'oid-123' },
      meta: {
        outcome: 'saved-with-warnings',
        success: true,
        oid: 'oid-123',
        requestId: '11111111-1111-4111-8111-111111111111',
        problems: [{ kind: 'processing', phase: 'post-save', issues: [{ message: 'hook failed' }] }],
        completion: { attachments: { status: 'incomplete', items: [] } },
      },
    });

    const result = await updatePromise;
    expect(result.outcome).toBe('saved-with-warnings');
    expect(result.wasPersisted()).toBeTrue();
    expect(result.isComplete()).toBeFalse();
    expect(result.oid).toBe('oid-123');
    expect(result.requestId).toBe(originatingRequestId);
    expect(result.problems.length).toBe(1);
  });

  it('normalises only bounded concurrency result metadata', async () => {
    const updatePromise = recordService.update('oid-123', { title: 'Test record' });
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/oid-123`);
    request.flush({
      meta: {
        outcome: 'saved',
        success: true,
        oid: 'oid-123',
        concurrency: {
          mode: 'strict',
          revision: 9,
          entityTag: `"rb-record-v1.9.${'a'.repeat(43)}"`,
          formFingerprint: 'sha256:form_1',
          resolution: 'direct',
          resolutionOfRequestId: '11111111-1111-4111-8111-111111111111',
          rawRequest: { authorization: 'secret' },
        },
      },
    });

    const result = await updatePromise;
    expect(result.outcome).toBe('saved');
    expect(result.concurrency).toEqual({
      mode: 'strict',
      revision: 9,
      entityTag: `"rb-record-v1.9.${'a'.repeat(43)}"`,
      formFingerprint: 'sha256:form_1',
      resolution: 'direct',
      resolutionOfRequestId: '11111111-1111-4111-8111-111111111111',
    });
    expect(JSON.stringify(result.concurrency)).not.toContain('secret');
  });

  it('keeps untyped precondition rejections unknown', async () => {
    for (const status of [409, 412, 428]) {
      const updatePromise = recordService.update('oid-123', { title: 'Test record' });
      const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/oid-123`);
      request.flush(
        { errors: [{ code: 'record-revision-stale', detail: 'The record changed.' }] },
        { status, statusText: 'Conflict' }
      );

      const result = await updatePromise;
      expect(result.outcome).toBe('unknown');
      expect(result.problems.length).toBe(1);
      expect(result.problems[0].kind).toBe('system');
      expect(result.problems[0].phase).toBe('transport');
      expect(result.problems[0].issues[0].code).toBe('record-revision-stale');
    }
  });

  it('keeps a typed conflict envelope verbatim rather than re-deriving it from the status', async () => {
    const updatePromise = recordService.update('oid-123', { title: 'Test record' });
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/oid-123`);
    request.flush(
      {
        errors: [{ code: 'record-revision-stale', detail: 'The record changed.' }],
        meta: {
          outcome: 'not-saved',
          success: false,
          oid: 'oid-123',
          problems: [
            { kind: 'conflict', phase: 'persistence', issues: [{ code: 'record-revision-stale', message: 'stale' }] },
          ],
          concurrency: { mode: 'strict', expectedRevision: 7, currentRevision: 9 },
        },
      },
      { status: 412, statusText: 'Precondition Failed' }
    );

    const result = await updatePromise;
    expect(result.outcome).toBe('not-saved');
    expect(result.concurrencyOutcome).toBe('stale');
    expect(result.isDefinitiveConflict()).toBeTrue();
    expect(result.problems[0].phase).toBe('persistence');
    expect(result.concurrency).toEqual({ mode: 'strict', expectedRevision: 7, currentRevision: 9 });
  });

  it('normalises the typed stale, missing-precondition, and form-drift matrix with latest safe state', async () => {
    const cases = [
      { status: 412, code: 'record-revision-stale', expected: 'stale' },
      { status: 428, code: 'record-precondition-required', expected: 'precondition-required' },
      { status: 409, code: 'form-definition-changed', expected: 'form-changed' },
    ] as const;

    for (const [index, testCase] of cases.entries()) {
      const updatePromise = recordService.update('oid-123', { title: 'Local' });
      const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/oid-123`);
      request.flush(
        {
          errors: [{ code: testCase.code, detail: 'The request is stale.' }],
          meta: {
            outcome: 'not-saved',
            success: false,
            oid: 'oid-123',
            requestId: `00000000-0000-4000-8000-00000000000${index}`,
            metadata: { title: 'Latest' },
            problems: [
              {
                kind: 'conflict',
                phase: 'pre-save',
                issues: [{ code: testCase.code, message: 'The request is stale.' }],
              },
            ],
            concurrency: {
              expectedRevision: 4,
              currentRevision: 5,
              revision: 5,
              entityTag: entityTag(5, 'b'),
              formFingerprint: 'sha256:latest_form',
            },
          },
        },
        {
          status: testCase.status,
          statusText: 'Conflict',
          headers: { ETag: entityTag(5, 'b') },
        }
      );

      const result = await updatePromise;
      expect(result.outcome).toBe('not-saved');
      expect(result.concurrencyOutcome).toBe(testCase.expected);
      expect(result.metadata).toEqual({ title: 'Latest' });
      expect(result.concurrency).toEqual(
        jasmine.objectContaining({
          revision: 5,
          currentRevision: 5,
          entityTag: entityTag(5, 'b'),
          formFingerprint: 'sha256:latest_form',
        })
      );
    }
  });

  it('keeps nominally typed but status-inconsistent precondition failures unknown', async () => {
    const updatePromise = recordService.update('oid-123', { title: 'Local' });
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/oid-123`);
    request.flush(
      {
        meta: {
          outcome: 'not-saved',
          metadata: { title: 'Must not be adopted' },
          problems: [
            {
              kind: 'conflict',
              phase: 'pre-save',
              issues: [{ code: 'form-definition-changed', message: 'wrong status' }],
            },
          ],
          concurrency: { revision: 5, entityTag: entityTag(5) },
        },
      },
      { status: 412, statusText: 'Precondition Failed' }
    );

    const result = await updatePromise;
    expect(result.outcome).toBe('unknown');
    expect(result.concurrencyOutcome).toBe('unknown');
    expect(result.metadata).toBeNull();
    expect(result.concurrency).toBeUndefined();
  });

  it('keeps a typed conflict with inconsistent tag coordinates unknown', async () => {
    const updatePromise = recordService.update('oid-123', { title: 'Local' });
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/oid-123`);
    request.flush(
      {
        meta: {
          outcome: 'not-saved',
          oid: 'oid-123',
          metadata: { title: 'Must not be adopted' },
          problems: [
            {
              kind: 'conflict',
              phase: 'pre-save',
              issues: [{ code: 'record-revision-stale', message: 'stale' }],
            },
          ],
          concurrency: { revision: 5, currentRevision: 5, entityTag: entityTag(5, 'a') },
        },
      },
      { status: 412, statusText: 'Precondition Failed', headers: { ETag: entityTag(6, 'b') } }
    );

    const result = await updatePromise;
    expect(result.outcome).toBe('unknown');
    expect(result.metadata).toBeNull();
    expect(result.concurrency).toBeUndefined();
  });

  it('never accepts a typed-looking status-zero result as saved or retryable', () => {
    const result = RecordActionResult.fromResponse(
      {
        meta: {
          outcome: 'not-saved',
          metadata: { title: 'Untrusted' },
          problems: [
            {
              kind: 'conflict',
              phase: 'pre-save',
              issues: [{ code: 'record-revision-stale', message: 'stale' }],
            },
          ],
        },
      },
      0,
      '11111111-1111-4111-8111-111111111111'
    );

    expect(result.outcome).toBe('unknown');
    expect(result.isUnknown()).toBeTrue();
    expect(result.isDefinitiveConflict()).toBeFalse();
    expect(result.metadata).toBeNull();
  });

  it('synthesises a confirmed non-save for a policy-level 403', async () => {
    const createPromise = recordService.create({ title: 'Test record' }, 'rdmp');
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/rdmp`);
    request.flush({ errors: [{ detail: 'Not allowed' }] }, { status: 403, statusText: 'Forbidden' });

    const result = await createPromise;
    expect(result.outcome).toBe('not-saved');
    expect(result.wasPersisted()).toBeFalse();
    expect(result.problems[0].kind).toBe('authorization');
    expect(result.problems[0].issues[0].message).toBe('Not allowed');
  });

  it('maps a validation 400 onto safe field issues', async () => {
    const createPromise = recordService.create({ title: 'Test record' }, 'rdmp');
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/rdmp`);
    request.flush(
      { errors: [{ detail: 'Title is required', code: 'required', source: { pointer: '/metadata/title' } }] },
      { status: 400, statusText: 'Bad Request' }
    );

    const result = await createPromise;
    expect(result.outcome).toBe('not-saved');
    expect(result.problems[0].kind).toBe('validation');
    expect(result.problems[0].issues[0].pointer).toBe('/metadata/title');
    expect(result.problems[0].issues[0].code).toBe('required');
  });

  it('preserves safe validator ownership and lineage from validation errors', async () => {
    const createPromise = recordService.create({ title: 'Test record' }, 'rdmp', '', 'submit');
    const request = httpTestingController.expectOne(
      request =>
        request.url === `${recordService.brandingAndPortalUrl}/recordmeta/rdmp` &&
        request.params.get('operation') === 'submit'
    );
    request.flush(
      {
        errors: [
          {
            detail: '@validator-error-required',
            code: 'record-validation-failed',
            class: 'required',
            params: { required: true },
            targetField: { dataModel: ['title'] },
            lineagePaths: {
              dataModel: ['contributors', 0, 'name'],
              angularComponents: ['contributors', 0, 'name'],
            },
            rawException: 'must not survive',
          },
        ],
      },
      { status: 400, statusText: 'Bad Request' }
    );

    const issue = (await createPromise).problems[0].issues[0];
    expect(issue).toEqual({
      message: '@validator-error-required',
      code: 'record-validation-failed',
      class: 'required',
      params: { required: true },
      targetField: { dataModel: ['title'] },
      lineagePaths: {
        dataModel: ['contributors', 0, 'name'],
        angularComponents: ['contributors', 0, 'name'],
      },
    });
    expect(JSON.stringify(issue)).not.toContain('must not survive');
  });

  it('keeps a dispatched save uncertain when the response cannot be interpreted', async () => {
    const requestIds: string[] = [];

    const networkPromise = recordService.create({ title: 'Test record' }, 'rdmp');
    const networkRequest = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/rdmp`);
    requestIds.push(networkRequest.request.headers.get('X-ReDBox-Save-Request-Id')!);
    networkRequest.error(new ProgressEvent('network error'));
    const networkResult = await networkPromise;
    expect(networkResult.outcome).toBe('unknown');
    expect(networkResult.problems[0].kind).toBe('network');
    expect(networkResult.requestId).toBe(requestIds[0]);

    const serverPromise = recordService.create({ title: 'Test record' }, 'rdmp');
    const serverRequest = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/rdmp`);
    requestIds.push(serverRequest.request.headers.get('X-ReDBox-Save-Request-Id')!);
    serverRequest.flush('gateway exploded', { status: 502, statusText: 'Bad Gateway' });
    const serverResult = await serverPromise;
    // A 5xx without a typed result proves nothing about persistence.
    expect(serverResult.outcome).toBe('unknown');
    expect(serverResult.problems[0].kind).toBe('system');

    expect(requestIds[0]).not.toBe(requestIds[1]);
  });

  it('treats a legacy success envelope as a complete save', async () => {
    const updatePromise = recordService.update('oid-123', { title: 'Test record' });
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/oid-123`);
    request.flush({ success: true, oid: 'oid-123', message: 'ok' });

    const result = await updatePromise;
    expect(result.outcome).toBe('saved');
    expect(result.isComplete()).toBeTrue();
    expect(result.completion.attachments.status).toBe('completed');
  });

  it("normalises a legacy post-save warning as persisted but incomplete", () => {
    const result = RecordActionResult.fromResponse({
      success: true,
      oid: "oid-warning",
      metadata: { postSaveSyncWarning: "true" }
    }, 200, "request-warning");

    expect(result.outcome).toBe("saved-with-warnings");
    expect(result.wasPersisted()).toBeTrue();
    expect(result.isComplete()).toBeFalse();
    expect(result.completion.attachments.status).toBe("unknown");
    expect(result.requestId).toBe("request-warning");
  });

  it("keeps malformed dispatched responses uncertain and maps safe issue fields", () => {
    const result = RecordActionResult.fromResponse({
      errors: [
        { title: "Title is invalid", field: "title" },
        { detail: "Pointer is invalid", pointer: "/metadata/description", code: "invalid" },
        { detail: "Nested pointer is invalid", source: { pointer: "/metadata/summary" } },
        { detail: "Ignored unsafe fields", field: 42, pointer: null }
      ]
    }, 500, "request-malformed");

    expect(result.outcome).toBe("unknown");
    expect(result.problems[0].kind).toBe("system");
    expect(result.problems[0].issues).toEqual([
      { message: "Title is invalid", field: "title" },
      { message: "Pointer is invalid", code: "invalid", pointer: "/metadata/description" },
      { message: "Nested pointer is invalid", pointer: "/metadata/summary" },
      { message: "Ignored unsafe fields" }
    ]);
  });

  it("uses a safe fallback message for an error without detail or title", () => {
    const result = RecordActionResult.fromResponse({ errors: [{ field: "title" }] }, 500, "request-fallback");

    expect(result.outcome).toBe("unknown");
    expect(result.problems[0].issues).toEqual([{ message: "The submitted value is invalid.", field: "title" }]);
  });

  it("normalises an update transport error as an uncertain save", async () => {
    const updatePromise = recordService.update("oid-transport", { title: "Test record" });
    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/recordmeta/oid-transport`);
    request.error(new ProgressEvent("network error"));

    const result = await updatePromise;
    expect(result.outcome).toBe("unknown");
    expect(result.problems[0].kind).toBe("network");
  });

  it("normalises pre-dispatch failures and non-HTTP errors", () => {
    const notDispatched = RecordActionResult.notDispatched("Could not build request", "oid-1", "request-1");
    expect(notDispatched.outcome).toBe("not-saved");
    expect(notDispatched.oid).toBe("oid-1");
    expect(notDispatched.message).toBe("Could not build request");
    expect(notDispatched.requestId).toBe("request-1");
    expect(notDispatched.problems[0].phase).toBe("transport");

    const nonHttpError = RecordActionResult.fromHttpError(new Error("request failed"), "request-2");
    expect(nonHttpError.outcome).toBe("unknown");
    expect(nonHttpError.requestId).toBe("request-2");
    expect(nonHttpError.problems[0].kind).toBe("network");
  });

  it('uses selected list revisions to fetch and send exact lifecycle entity tags', async () => {
    const restorePromise = recordService.restoreDeletedRecord('deleted-1', 12);
    const restoreRead = httpTestingController.expectOne(
      `${recordService.brandingAndPortalUrl}/record/delete/deleted-1`
    );
    expect(restoreRead.request.headers.get('X-ReDBox-Api-Version')).toBe('2.0');
    restoreRead.flush(
      { data: { title: 'Deleted' }, meta: { revision: 12, entityTag: entityTag(12, 'b') } },
      { headers: { ETag: entityTag(12, 'b') } }
    );
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const restoreRequest = httpTestingController.expectOne(
      `${recordService.brandingAndPortalUrl}/record/delete/deleted-1`
    );
    expect(restoreRequest.request.method).toBe('PUT');
    expect(restoreRequest.request.headers.get('If-Match')).toBe(entityTag(12, 'b'));
    expect(restoreRequest.request.headers.get('X-ReDBox-Api-Version')).toBe('2.0');
    expect(restoreRequest.request.headers.get('X-ReDBox-Save-Request-Id')).toMatch(/^[0-9a-f-]{36}$/i);
    restoreRequest.flush({ meta: { outcome: 'saved', success: true, oid: 'deleted-1' } });
    expect((await restorePromise).outcome).toBe('saved');

    const deletePromise = recordService.delete('active-1', 7);
    const deleteRead = httpTestingController.expectOne(
      `${recordService.brandingAndPortalUrl}/record/metadata/active-1`
    );
    deleteRead.flush({ data: { title: 'Active' }, meta: { revision: 7 } }, { headers: { ETag: entityTag(7, 'c') } });
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const deleteRequest = httpTestingController.expectOne(
      `${recordService.brandingAndPortalUrl}/record/delete/active-1`
    );
    expect(deleteRequest.request.method).toBe('DELETE');
    expect(deleteRequest.request.headers.get('If-Match')).toBe(entityTag(7, 'c'));
    deleteRequest.flush({ meta: { outcome: 'saved', success: true, oid: 'active-1' } });
    expect((await deletePromise).outcome).toBe('saved');
  });

  it('does not dispatch a list mutation after the selected row revision is stale', async () => {
    const restorePromise = recordService.restoreDeletedRecord('deleted-1', 11);
    const read = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/record/delete/deleted-1`);
    read.flush({ data: { title: 'Latest' }, meta: { revision: 12 } }, { headers: { ETag: entityTag(12) } });

    const result = await restorePromise;
    expect(result.outcome).toBe('not-saved');
    expect(result.concurrencyOutcome).toBe('stale');
    expect(result.concurrency).toEqual(
      jasmine.objectContaining({ expectedRevision: 11, currentRevision: 12, entityTag: entityTag(12) })
    );
    httpTestingController.expectNone(
      request => request.method === 'PUT' && request.url.endsWith('/record/delete/deleted-1')
    );
  });

  it('does not dispatch a lifecycle mutation without an exact tag or selected revision', async () => {
    const result = await recordService.restoreDeletedRecord('deleted-1');

    expect(result.outcome).toBe('not-saved');
    expect(result.oid).toBe('deleted-1');
    expect(result.problems[0].kind).toBe('system');
    httpTestingController.expectNone(request => request.url.endsWith('/record/delete/deleted-1'));
  });

  it('unwraps attachment responses from the backend data envelope', async () => {
    const attachmentsPromise = recordService.getAttachments('oid-123');

    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/record/oid-123/attachments`);
    expect(request.request.method).toBe('GET');
    request.flush({
      data: [{ label: 'rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf', dateUpdated: '2024-03-01T09:00:00Z' }],
    });

    await expectAsync(attachmentsPromise).toBeResolvedTo([
      { label: 'rdmp-pdf-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-1.pdf', dateUpdated: '2024-03-01T09:00:00Z' },
    ]);
  });

  it('accepts attachment responses returned as a raw array', async () => {
    const attachmentsPromise = recordService.getAttachments('oid-456');

    const request = httpTestingController.expectOne(`${recordService.brandingAndPortalUrl}/record/oid-456/attachments`);
    expect(request.request.method).toBe('GET');
    request.flush([{ label: 'rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf', dateUpdated: '2024-03-02T09:00:00Z' }]);

    await expectAsync(attachmentsPromise).toBeResolvedTo([
      { label: 'rdmp-pdf-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-2.pdf', dateUpdated: '2024-03-02T09:00:00Z' },
    ]);
  });

  it('unwraps record audit tab responses', async () => {
    const auditPromise = recordService.getRecordAuditTab('oid-789');

    const request = httpTestingController.expectOne(
      `${recordService.brandingAndPortalUrl}/record/viewAudit/oid-789/audit`
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      data: {
        summary: { returnedCount: 1 },
        rawAuditUrl: '/default/rdmp/api/records/audit/oid-789',
        records: [{ id: 'audit-1', action: 'updated' }],
      },
    });

    await expectAsync(auditPromise).toBeResolvedTo({
      summary: { returnedCount: 1 },
      rawAuditUrl: '/default/rdmp/api/records/audit/oid-789',
      records: [{ id: 'audit-1', action: 'updated' }],
    } as any);
  });

  it('accepts record audit tab responses returned without the data envelope', async () => {
    const auditPromise = recordService.getRecordAuditTab('oid-790');

    const request = httpTestingController.expectOne(
      `${recordService.brandingAndPortalUrl}/record/viewAudit/oid-790/audit`
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      summary: { returnedCount: 1 },
      rawAuditUrl: '/default/rdmp/api/records/audit/oid-790',
      records: [{ id: 'audit-2', action: 'created' }],
    });

    await expectAsync(auditPromise).toBeResolvedTo({
      summary: { returnedCount: 1 },
      rawAuditUrl: '/default/rdmp/api/records/audit/oid-790',
      records: [{ id: 'audit-2', action: 'created' }],
    } as any);
  });

  it('includes filter query parameters for record audit requests', async () => {
    const auditPromise = recordService.getRecordAuditTab('oid-791', {
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
      action: 'updated',
      workflowState: 'Draft',
    });

    const request = httpTestingController.expectOne(
      req =>
        req.url === `${recordService.brandingAndPortalUrl}/record/viewAudit/oid-791/audit` &&
        req.params.get('dateFrom') === '2026-03-01' &&
        req.params.get('dateTo') === '2026-03-31' &&
        req.params.get('action') === 'updated' &&
        req.params.get('workflowState') === 'Draft'
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      data: {
        summary: { returnedCount: 0 },
        rawAuditUrl: '/default/rdmp/api/records/audit/oid-791',
        records: [],
      },
    });

    await expectAsync(auditPromise).toBeResolvedTo({
      summary: { returnedCount: 0 },
      rawAuditUrl: '/default/rdmp/api/records/audit/oid-791',
      records: [],
    } as any);
  });

  it('unwraps record permissions responses', async () => {
    const permissionsPromise = recordService.getRecordPermissionsTab('oid-321');

    const request = httpTestingController.expectOne(
      `${recordService.brandingAndPortalUrl}/record/viewAudit/oid-321/permissions`
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      data: {
        edit: [{ username: 'editor', name: 'Editor', email: 'editor@example.com' }],
        view: [],
        editPending: ['pending-editor'],
        viewPending: [],
        editRoles: ['Admin'],
        viewRoles: ['Researcher'],
      },
    });

    await expectAsync(permissionsPromise).toBeResolvedTo({
      edit: [{ username: 'editor', name: 'Editor', email: 'editor@example.com' }],
      view: [],
      editPending: ['pending-editor'],
      viewPending: [],
      editRoles: ['Admin'],
      viewRoles: ['Researcher'],
    });
  });

  it('accepts record permissions responses returned without the data envelope', async () => {
    const permissionsPromise = recordService.getRecordPermissionsTab('oid-322');

    const request = httpTestingController.expectOne(
      `${recordService.brandingAndPortalUrl}/record/viewAudit/oid-322/permissions`
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      edit: [{ username: 'editor', name: 'Editor', email: 'editor@example.com' }],
      view: [],
      editPending: ['pending-editor'],
      viewPending: [],
      editRoles: ['Admin'],
      viewRoles: ['Researcher'],
    });

    await expectAsync(permissionsPromise).toBeResolvedTo({
      edit: [{ username: 'editor', name: 'Editor', email: 'editor@example.com' }],
      view: [],
      editPending: ['pending-editor'],
      viewPending: [],
      editRoles: ['Admin'],
      viewRoles: ['Researcher'],
    });
  });

  it('includes paging query parameters for integration audit requests', async () => {
    const integrationPromise = recordService.getRecordIntegrationAuditTab('oid-654', {
      page: 2,
      pageSize: 15,
      status: 'success',
      integrationName: 'figshare',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });

    const request = httpTestingController.expectOne(
      req =>
        req.url === `${recordService.brandingAndPortalUrl}/record/viewAudit/oid-654/integration-audit` &&
        req.params.get('page') === '2' &&
        req.params.get('pageSize') === '15' &&
        req.params.get('status') === 'success' &&
        req.params.get('integrationName') === 'figshare' &&
        req.params.get('dateFrom') === '2026-01-01' &&
        req.params.get('dateTo') === '2026-01-31'
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      data: {
        summary: { numFound: 3, page: 2, pageSize: 15, totalPages: 1 },
        records: [
          {
            id: 'trace-1',
            traceId: 'trace-1',
            startedAt: '2026-01-01T00:00:00Z',
            status: 'success',
            actions: ['publish'],
            eventCount: 1,
            events: [
              {
                id: 'integration-1',
                redboxOid: 'oid-654',
                startedAt: '2026-01-01T00:00:00Z',
                status: 'success',
                integrationAction: 'publish',
                traceId: 'trace-1',
                spanId: 'span-1',
                depth: 0,
                hasChildren: false,
              },
            ],
          },
        ],
      },
    });

    await expectAsync(integrationPromise).toBeResolvedTo({
      summary: { numFound: 3, page: 2, pageSize: 15, totalPages: 1 },
      records: [
        {
          id: 'trace-1',
          traceId: 'trace-1',
          startedAt: '2026-01-01T00:00:00Z',
          status: 'success',
          actions: ['publish'],
          eventCount: 1,
          events: [
            {
              id: 'integration-1',
              redboxOid: 'oid-654',
              startedAt: '2026-01-01T00:00:00Z',
              status: 'success',
              integrationAction: 'publish',
              traceId: 'trace-1',
              spanId: 'span-1',
              depth: 0,
              hasChildren: false,
            },
          ],
        },
      ],
    } as any);
  });

  it('accepts integration audit responses returned without the data envelope', async () => {
    const integrationPromise = recordService.getRecordIntegrationAuditTab('oid-655');

    const request = httpTestingController.expectOne(
      req => req.url === `${recordService.brandingAndPortalUrl}/record/viewAudit/oid-655/integration-audit`
    );
    expect(request.request.method).toBe('GET');
    request.flush({
      summary: { numFound: 1, page: 1, pageSize: 20, totalPages: 1 },
      records: [
        {
          id: 'trace-2',
          traceId: 'trace-2',
          startedAt: '2026-01-01T00:00:00Z',
          status: 'success',
          actions: ['publish'],
          eventCount: 1,
          events: [
            {
              id: 'integration-2',
              redboxOid: 'oid-655',
              startedAt: '2026-01-01T00:00:00Z',
              status: 'success',
              integrationAction: 'publish',
              traceId: 'trace-2',
              spanId: 'span-2',
              depth: 0,
              hasChildren: false,
            },
          ],
        },
      ],
    });

    await expectAsync(integrationPromise).toBeResolvedTo({
      summary: { numFound: 1, page: 1, pageSize: 20, totalPages: 1 },
      records: [
        {
          id: 'trace-2',
          traceId: 'trace-2',
          startedAt: '2026-01-01T00:00:00Z',
          status: 'success',
          actions: ['publish'],
          eventCount: 1,
          events: [
            {
              id: 'integration-2',
              redboxOid: 'oid-655',
              startedAt: '2026-01-01T00:00:00Z',
              status: 'success',
              integrationAction: 'publish',
              traceId: 'trace-2',
              spanId: 'span-2',
              depth: 0,
              hasChildren: false,
            },
          ],
        },
      ],
    } as any);
  });
});
