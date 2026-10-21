import { TestBed } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import {
  ConfigService,
  LoggerService,
  UtilityService,
  PublicationVocabularyApiService,
  RB_HTTP_INTERCEPTOR_AUTH_CSRF,
  getStubConfigService,
} from '@researchdatabox/portal-ng-common';

describe('Shared vocabulary API transport (PUB-24)', () => {
  let api: PublicationVocabularyApiService;
  let http: HttpTestingController;
  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PublicationVocabularyApiService,
        UtilityService,
        LoggerService,
        { provide: ConfigService, useValue: getStubConfigService() },
        { provide: APP_BASE_HREF, useValue: '/portal-root' },
      ],
    });
    api = TestBed.inject(PublicationVocabularyApiService);
    http = TestBed.inject(HttpTestingController);
    await api.waitForInit();
  });
  afterEach(() => http.verify());
  it('retains branding, portal, root context, CSRF and string target identities in mapping writes', async () => {
    const operation = api.saveMappings('crosswalk/opaque', 7, [
      {
        id: 'edge',
        localEntryId: 'CaseSensitive',
        targetId: 'subjects:https%3A%2F%2Fexample.org%2FMath',
        status: 'proposed',
        matchType: 'manual',
      },
    ]);
    const req = http.expectOne(request =>
      request.url.includes('/publication-vocabularies/crosswalks/crosswalk%2Fopaque/mappings')
    );
    expect(req.request.url).toContain('/portal-root/');
    expect(req.request.headers.get('X-ReDBox-Api-Version')).toBe('2.0');
    expect(req.request.context.get(RB_HTTP_INTERCEPTOR_AUTH_CSRF)).toBeTruthy();
    expect(req.request.body.version).toBe(7);
    expect(req.request.body.mappings[0].targetId).toBe('subjects:https%3A%2F%2Fexample.org%2FMath');
    expect(req.request.body.brandId).toBeUndefined();
    req.flush({ data: { id: 'crosswalk/opaque', version: 8 } });
    expect((await operation).version).toBe(8);
  });
  it('requests explicitly historical, paged targets without replacing the target identity', async () => {
    const operation = api.targets('source', 'opaque:ABC', 50, true);
    const req = http.expectOne(request => request.url.endsWith('/sources/source/terms'));
    expect(req.request.headers.get('X-ReDBox-Api-Version')).toBe('2.0');
    expect(req.request.params.get('offset')).toBe('50');
    expect(req.request.params.get('q')).toBe('opaque:ABC');
    expect(req.request.params.get('includeHistorical')).toBe('true');
    req.flush({ data: { data: [{ id: 'source:opaque%3AABC' }], meta: { total: 51, offset: 50, limit: 50 } } });
    expect((await operation).data[0].id).toBe('source:opaque%3AABC');
  });
  it('requests v2 local vocabulary envelopes and excludes provider mirrors', async () => {
    const operation = api.localVocabularies();
    const req = http.expectOne(request => request.url.endsWith('/api/vocabulary'));
    expect(req.request.headers.get('X-ReDBox-Api-Version')).toBe('2.0');
    req.flush({
      data: {
        records: [
          { id: 'local', source: 'local' },
          { id: 'mirror', source: 'external' },
        ],
        summary: { numFound: 2 },
      },
    });
    expect((await operation).map(row => row.id)).toEqual(['local']);
  });
});
