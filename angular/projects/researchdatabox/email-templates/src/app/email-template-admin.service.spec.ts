import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ConfigService, UtilityService, getStubConfigService } from '@researchdatabox/portal-ng-common';
import { EmailTemplateAdminService } from './email-template-admin.service';
import { EmailTemplateApiError } from './email-templates.model';
import { editorState } from './email-templates.testing';

const testConfig = { baseUrl: 'http://test', branding: 'default', portal: 'rdmp', csrfToken: 'test-csrf' };
const configStubInstance: any = getStubConfigService();
configStubInstance.getConfig = async () => testConfig;
configStubInstance.config = testConfig;

class UtilityStub {
  async waitForDependencies(deps: any[]) {
    for (const d of deps) {
      if (d && typeof d.waitForInit === 'function') {
        await d.waitForInit();
      }
    }
  }
}

const BASE = 'http://test/default/rdmp/app/email-templates';
const content = { subject: 'Hi', body: '<p>Body</p>', format: 'html' as const };

describe('EmailTemplateAdminService', () => {
  let service: EmailTemplateAdminService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: APP_BASE_HREF, useValue: '' },
        { provide: ConfigService, useValue: configStubInstance },
        { provide: UtilityService, useClass: UtilityStub },
        EmailTemplateAdminService,
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(EmailTemplateAdminService);
    await service.waitForInit();
  });

  afterEach(() => httpMock.verify());

  it('reads the catalogue from the route-scoped API', async () => {
    const promise = service.catalogue();
    const req = httpMock.expectOne(`${BASE}/catalogue`);
    expect(req.request.method).toBe('GET');
    req.flush({ templates: [] });
    expect(await promise).toEqual([]);
    expect(service.brandName).toBe('default');
  });

  it('URL-encodes template IDs and record OIDs as path segments', async () => {
    const state = service.editorState('a/b c');
    httpMock.expectOne(`${BASE}/templates/a%2Fb%20c`).flush(editorState());
    await state;

    const context = service.recordContext('oid/1', 'a/b');
    const req = httpMock.expectOne(r => r.url === `${BASE}/preview-records/oid%2F1/context`);
    expect(req.request.params.get('templateId')).toBe('a/b');
    req.flush({ context: { oid: 'oid/1' } });
    expect(await context).toEqual({ oid: 'oid/1' });
  });

  it('sends draft, discard, from-default and restore bodies with explicit revisions and no brand', async () => {
    const save = service.saveDraft('t1', content, null);
    const saveReq = httpMock.expectOne(`${BASE}/templates/t1/draft`);
    expect(saveReq.request.method).toBe('PUT');
    expect(saveReq.request.body).toEqual({ content, expectedDraftRevision: null });
    saveReq.flush({ draft: {}, diagnostics: [] });
    await save;

    const discard = service.discardDraft('t1', 7);
    const discardReq = httpMock.expectOne(`${BASE}/templates/t1/draft`);
    expect(discardReq.request.method).toBe('DELETE');
    expect(discardReq.request.body).toEqual({ expectedDraftRevision: 7 });
    discardReq.flush({ discarded: true });
    expect(await discard).toEqual({ discarded: true });

    const fromDefault = service.draftFromDefault('t1', 7);
    const fromDefaultReq = httpMock.expectOne(`${BASE}/templates/t1/draft/from-default`);
    expect(fromDefaultReq.request.body).toEqual({ expectedDraftRevision: 7 });
    fromDefaultReq.flush({ draft: {}, diagnostics: [] });
    await fromDefault;

    const restore = service.restore('t1', 3, null);
    const restoreReq = httpMock.expectOne(`${BASE}/templates/t1/history/3/restore`);
    expect(restoreReq.request.method).toBe('POST');
    expect(restoreReq.request.body).toEqual({ expectedDraftRevision: null });
    restoreReq.flush({ draft: {}, diagnostics: [] });
    await restore;

    for (const body of [saveReq.request.body, discardReq.request.body, restoreReq.request.body]) {
      expect(Object.keys(body)).not.toContain('brandId');
      expect(Object.keys(body)).not.toContain('branding');
    }
  });

  it('publishes and resets with the expected live token', async () => {
    const token = { id: 'live-1', revision: 4 };
    const publish = service.publish('t1', 8, token);
    const publishReq = httpMock.expectOne(`${BASE}/templates/t1/publish`);
    expect(publishReq.request.body).toEqual({ expectedDraftRevision: 8, expectedLiveToken: token });
    publishReq.flush({ state: editorState(), draftRetained: false });
    expect((await publish).draftRetained).toBeFalse();

    const reset = service.reset('t1', token);
    const resetReq = httpMock.expectOne(`${BASE}/templates/t1/reset`);
    expect(resetReq.request.body).toEqual({ expectedLiveToken: token });
    resetReq.flush({ state: editorState({ live: null }), draftRetained: false });
    expect((await reset).state.live).toBeNull();
  });

  it('sends preview context as JSON text, not an object', async () => {
    const preview = service.preview('t1', content, '{"oid":"x"}');
    const req = httpMock.expectOne(`${BASE}/templates/t1/preview`);
    expect(req.request.body).toEqual({ content, context: '{"oid":"x"}' });
    expect(typeof req.request.body.context).toBe('string');
    req.flush({ subject: 'Hi', html: '<p>x</p>', sanitiserRemovals: [], diagnostics: [] });
    expect((await preview).html).toBe('<p>x</p>');
  });

  it('resolves validation diagnostics from a 400 instead of throwing', async () => {
    const diagnostics = [
      { code: 'INVALID_TEMPLATE', field: 'body', reason: 'UNKNOWN_CONTEXT_ROOT', line: 7, column: 16 },
    ];
    const validate = service.validate('t1', content);
    httpMock
      .expectOne(`${BASE}/templates/t1/validate`)
      .flush(
        { error: { code: 'INVALID_TEMPLATE', message: 'Template validation failed.' }, diagnostics },
        { status: 400, statusText: 'Bad Request' }
      );
    expect(await validate).toEqual(diagnostics as any);
  });

  it('normalises 409 conflicts with the current state attached', async () => {
    const current = {
      live: { token: { id: 'live-1', revision: 5 }, updatedBy: 'u2', updatedByName: 'Sam Lee', updatedAt: null },
      draft: null,
      latestVersion: 5,
      lastChange: { updatedBy: 'u2', updatedByName: 'Sam Lee', updatedAt: null },
    };
    const save = service.saveDraft('t1', content, 3);
    httpMock
      .expectOne(`${BASE}/templates/t1/draft`)
      .flush(
        { error: { code: 'REVISION_CONFLICT', message: 'x' }, diagnostics: [], current },
        { status: 409, statusText: 'Conflict' }
      );
    try {
      await save;
      fail('expected conflict');
    } catch (error) {
      expect(error instanceof EmailTemplateApiError).toBeTrue();
      const apiError = error as EmailTemplateApiError;
      expect(apiError.isConflict).toBeTrue();
      expect(apiError.code).toBe('REVISION_CONFLICT');
      expect(apiError.current).toEqual(current as any);
    }
  });

  it('treats a bare CSRF 403 string as FORBIDDEN', async () => {
    const catalogue = service.catalogue();
    httpMock.expectOne(`${BASE}/catalogue`).flush('CSRF mismatch', { status: 403, statusText: 'Forbidden' });
    await expectAsync(catalogue).toBeRejectedWith(jasmine.objectContaining({ status: 403, code: 'FORBIDDEN' }));
  });

  it('searches preview records with query and page parameters', async () => {
    const search = service.searchRecords('soil', 2);
    const req = httpMock.expectOne(r => r.url === `${BASE}/preview-records`);
    expect(req.request.params.get('q')).toBe('soil');
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ records: [{ oid: 'r1', title: 'Soil' }], page: 2, hasMore: false });
    expect((await search).records.length).toBe(1);
  });

  it('lists history and reads one version', async () => {
    const history = service.history('t1');
    httpMock.expectOne(`${BASE}/templates/t1/history`).flush({ versions: [] });
    expect(await history).toEqual([]);
    const version = service.historyVersion('t1', 2);
    httpMock.expectOne(`${BASE}/templates/t1/history/2`).flush({ version: 2 });
    expect((await version).version).toBe(2);
  });
});
