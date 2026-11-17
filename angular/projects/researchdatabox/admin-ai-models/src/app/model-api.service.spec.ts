import { APP_BASE_HREF } from '@angular/common';
import { HTTP_INTERCEPTORS, HttpContext } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfigService } from 'projects/researchdatabox/portal-ng-common/src/lib/config.service';
import { CsrfInterceptor, RB_HTTP_INTERCEPTOR_AUTH_CSRF } from 'projects/researchdatabox/portal-ng-common/src/lib/csrf.interceptor';
import { getStubConfigService } from 'projects/researchdatabox/portal-ng-common/src/lib/helper.spec';
import { LoggerService } from 'projects/researchdatabox/portal-ng-common/src/lib/logger.service';
import { UtilityService } from 'projects/researchdatabox/portal-ng-common/src/lib/utility.service';
import { ModelApiError, ModelApiService } from './model-api.service';
import { connectionDraft, modelDraft } from './model-settings';
import { model, openrouter, overview } from './test-fixtures';

describe('ModelApiService', () => {
  let api: ModelApiService;
  let http: HttpTestingController;
  const base = '/brand/portal/app/ai-models';
  beforeEach(() => {
    const config = { ...getStubConfigService(), csrfToken: 'fresh-csrf' };
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule], providers: [
      ModelApiService, LoggerService, UtilityService, { provide: APP_BASE_HREF, useValue: '' },
      { provide: ConfigService, useValue: config }, { provide: HTTP_INTERCEPTORS, useClass: CsrfInterceptor, multi: true },
    ] });
    api = TestBed.inject(ModelApiService); http = TestBed.inject(HttpTestingController);
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
    { name: 'deletes provider', method: 'DELETE', path: '/connections/id', body: undefined, call: (a: ModelApiService) => a.deleteConnection('id') },
    { name: 'discards draft', method: 'DELETE', path: '/models/id', body: undefined, call: (a: ModelApiService) => a.discardDraft('id') },
    { name: 'deletes model', method: 'DELETE', path: '/models/by-key/key', body: undefined, call: (a: ModelApiService) => a.deleteModel('key') },
    { name: 'creates connection', method: 'POST', path: '/connections', body: connectionDraft(openrouter), call: (a: ModelApiService) => a.saveConnection(connectionDraft(openrouter)) },
    { name: 'updates connection', method: 'PUT', path: '/connections/id%2Fone', body: connectionDraft(openrouter), call: (a: ModelApiService) => a.saveConnection(connectionDraft(openrouter), 'id/one') },
    { name: 'tests unsaved connection', method: 'POST', path: '/connections/test', body: { connection: connectionDraft(openrouter), connectionId: 'id' }, call: (a: ModelApiService) => a.testConnection(connectionDraft(openrouter), 'id') },
    { name: 'creates model', method: 'POST', path: '/models', body: { ...modelDraft(model), key: model.key }, call: (a: ModelApiService) => a.createModel({ ...modelDraft(model), key: model.key }) },
    { name: 'updates with concurrency hash', method: 'PUT', path: '/models/id%2Fone', body: { ...modelDraft(model), expectedContentHash: model.contentHash }, call: (a: ModelApiService) => a.saveModel('id/one', { ...modelDraft(model), expectedContentHash: model.contentHash }) },
    { name: 'copies version', method: 'POST', path: '/models/id/versions', body: undefined, call: (a: ModelApiService) => a.version('id') },
    { name: 'publishes', method: 'POST', path: '/models/id/publish', body: undefined, call: (a: ModelApiService) => a.publish('id') },
    { name: 'retires', method: 'POST', path: '/models/id/retire', body: undefined, call: (a: ModelApiService) => a.retire('id') },
    { name: 'tries prompt', method: 'POST', path: '/try-prompt', body: { draft: modelDraft(model), prompt: 'Synthetic example', mode: 'sample' }, call: (a: ModelApiService) => a.tryPrompt({ draft: modelDraft(model), prompt: 'Synthetic example', mode: 'sample' }) },
  ];
  for (const test of cases) {
    it(test.name + ' with refreshed CSRF and raw JSON', async () => {
      const pending = test.call(api); await Promise.resolve(); const req = http.expectOne(base + test.path);
      expect(req.request.method).toBe(test.method); expect(req.request.body ?? undefined).toEqual(test.body);
      expect(req.request.headers.get('X-CSRF-Token')).toBe('fresh-csrf'); req.flush(model); await pending;
    });
  }
  it('retains stable server message keys and 409 status', async () => {
    const pending = api.saveModel('id', { ...modelDraft(model), expectedContentHash: model.contentHash });
    const assertion = expectAsync(pending).toBeRejectedWith(jasmine.objectContaining({ status: 409, messageKey: 'ai-models-provider-error-generation-target-conflict' }));
    await Promise.resolve(); http.expectOne(base + '/models/id').flush({ error: { messageKey: 'ai-models-provider-error-generation-target-conflict' } }, { status: 409, statusText: 'Conflict' }); await assertion;
  });
  it('normalizes middleware errors without displaying private server bodies', async () => {
    const pending = api.overview(); const assertion = expectAsync(pending).toBeRejectedWith(jasmine.any(ModelApiError));
    await Promise.resolve(); http.expectOne(base + '/overview').flush('private backend details', { status: 403, statusText: 'Forbidden' }); await assertion;
    try { await pending; } catch (error) { expect((error as ModelApiError).messageKey).toBe('ai-models-provider-error-generation-source-forbidden'); }
  });
});
