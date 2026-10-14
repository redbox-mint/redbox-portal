import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { APP_BASE_HREF } from '@angular/common';
import { ConfigService, LoggerService, UtilityService, getStubConfigService } from '@researchdatabox/portal-ng-common';
import {
  FigshareCrosswalkApiService,
  FigshareCrosswalkOption,
  FigshareLocalVocabularyOption
} from './figshare-crosswalk-api.service';

/**
 * The memoisation here is load-bearing: a Figshare publishing config renders one binding
 * editor per bound field, so a regression that drops the cached promise fires dozens of
 * identical requests per page load.
 */
describe('FigshareCrosswalkApiService', () => {
  let service: FigshareCrosswalkApiService;
  let httpMock: HttpTestingController;

  function crosswalk(overrides: Partial<FigshareCrosswalkOption> = {}): FigshareCrosswalkOption {
    return {
      id: 'crosswalk-1',
      name: 'figgy → Figshare taxonomy 100',
      status: 'approved',
      workingRevision: 1,
      approvedRevision: 1,
      localVocabularyId: 'vocab-1',
      localVocabularyName: 'figgy',
      figshareSourceId: 'source-1',
      figshareSourceName: 'Figshare taxonomy 100',
      scope: 'public',
      taxonomyId: '100',
      approvedMappingCount: 50,
      workingMappingCount: 50,
      historicalTargetCount: 0,
      ...overrides
    };
  }

  function vocabulary(overrides: Partial<FigshareLocalVocabularyOption> = {}): FigshareLocalVocabularyOption {
    return { id: 'vocab-1', name: 'figgy', slug: 'figgy', source: 'local', ...overrides };
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        FigshareCrosswalkApiService,
        LoggerService,
        UtilityService,
        { provide: ConfigService, useValue: getStubConfigService() },
        { provide: APP_BASE_HREF, useValue: '/base' }
      ]
    });

    service = TestBed.inject(FigshareCrosswalkApiService);
    httpMock = TestBed.inject(HttpTestingController);
    await service.waitForInit();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('requests approved crosswalks with the default paging', async () => {
    const promise = service.listApprovedCrosswalks();

    const req = httpMock.expectOne((request) => request.url.includes('/api/figshare-crosswalks'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('status')).toBe('approved');
    expect(req.request.params.get('limit')).toBe('200');
    expect(req.request.params.get('localVocabularyId')).toBeNull();
    req.flush({ data: { summary: { numFound: 1 }, records: [crosswalk()] } });

    expect(await promise).toEqual([crosswalk()]);
  });

  it('restricts the request to one local vocabulary when supplied', async () => {
    const promise = service.listApprovedCrosswalks('  vocab-2  ');

    const req = httpMock.expectOne((request) => request.url.includes('/api/figshare-crosswalks'));
    expect(req.request.params.get('localVocabularyId')).toBe('vocab-2');
    req.flush({ data: { records: [] } });

    await promise;
  });

  it('ignores a blank local vocabulary filter', async () => {
    const promise = service.listApprovedCrosswalks('   ');

    const req = httpMock.expectOne((request) => request.url.includes('/api/figshare-crosswalks'));
    expect(req.request.params.get('localVocabularyId')).toBeNull();
    req.flush({ data: { records: [] } });

    await promise;
  });

  it('unwraps an unenveloped list response', async () => {
    const promise = service.listApprovedCrosswalks();

    httpMock.expectOne((request) => request.url.includes('/api/figshare-crosswalks')).flush({
      summary: { numFound: 1 },
      records: [crosswalk()]
    });

    expect(await promise).toEqual([crosswalk()]);
  });

  it('returns an empty list for a response with no records', async () => {
    const promise = service.listApprovedCrosswalks();

    httpMock.expectOne((request) => request.url.includes('/api/figshare-crosswalks')).flush({ data: {} });

    expect(await promise).toEqual([]);
  });

  it('returns an empty list for a null response', async () => {
    const promise = service.listApprovedCrosswalks();

    httpMock.expectOne((request) => request.url.includes('/api/figshare-crosswalks')).flush(null);

    expect(await promise).toEqual([]);
  });

  it('drops external mirrors from the local vocabulary options', async () => {
    const promise = service.listLocalVocabularies();

    const req = httpMock.expectOne((request) => request.url.includes('/api/vocabulary'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('limit')).toBe('200');
    req.flush({
      data: {
        records: [
          vocabulary({ id: 'vocab-1', source: 'local' }),
          vocabulary({ id: 'vocab-2', source: 'rva' }),
          vocabulary({ id: 'vocab-3', source: 'external' })
        ]
      }
    });

    const result = await promise;
    expect(result.map((option) => option.id)).toEqual(['vocab-1', 'vocab-2']);
  });

  it('memoises the crosswalk list across callers', async () => {
    const first = service.listAllApprovedCrosswalks();
    const second = service.listAllApprovedCrosswalks();

    httpMock.expectOne((request) => request.url.includes('/api/figshare-crosswalks')).flush({
      data: { records: [crosswalk()] }
    });

    expect(await first).toEqual([crosswalk()]);
    expect(await second).toEqual([crosswalk()]);
    httpMock.expectNone((request) => request.url.includes('/api/figshare-crosswalks'));
  });

  it('memoises the local vocabulary list across callers', async () => {
    const first = service.listAllLocalVocabularies();
    const second = service.listAllLocalVocabularies();

    httpMock.expectOne((request) => request.url.includes('/api/vocabulary')).flush({
      data: { records: [vocabulary()] }
    });

    expect(await first).toEqual([vocabulary()]);
    expect(await second).toEqual([vocabulary()]);
    httpMock.expectNone((request) => request.url.includes('/api/vocabulary'));
  });

  it('re-fetches both lists after refresh', async () => {
    const initial = service.listAllApprovedCrosswalks();
    httpMock.expectOne((request) => request.url.includes('/api/figshare-crosswalks')).flush({
      data: { records: [crosswalk()] }
    });
    await initial;

    service.refresh();

    const refetched = service.listAllApprovedCrosswalks();
    httpMock.expectOne((request) => request.url.includes('/api/figshare-crosswalks')).flush({
      data: { records: [crosswalk({ id: 'crosswalk-2' })] }
    });

    expect((await refetched).map((option) => option.id)).toEqual(['crosswalk-2']);

    const vocabs = service.listAllLocalVocabularies();
    httpMock.expectOne((request) => request.url.includes('/api/vocabulary')).flush({ data: { records: [] } });
    expect(await vocabs).toEqual([]);
  });

  it('builds the brand scoped crosswalk admin url', () => {
    expect(service.getCrosswalkAdminUrl()).toContain('/admin/integrations/figshare/vocabularies');
  });
});
