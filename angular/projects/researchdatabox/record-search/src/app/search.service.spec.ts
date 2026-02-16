import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { APP_BASE_HREF } from '@angular/common';
import { UtilityService, LoggerService, ConfigService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService } from '@researchdatabox/portal-ng-common';
import { SearchService } from './search.service';
import { RecordSearchParams, RecordSearchRefiner } from './search-models';

describe('SearchService', () => {
  let service: SearchService;
  let httpMock: HttpTestingController;
  let configService: any;

  beforeEach(() => {
    configService = getStubConfigService();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        SearchService,
        {
          provide: APP_BASE_HREF,
          useValue: 'base',
        },
        LoggerService,
        UtilityService,
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    });

    service = TestBed.inject(SearchService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should construct correct search URL with basic search', async () => {
    await service.waitForInit();

    const params = new RecordSearchParams('rdmp');
    params.basicSearch = 'test query';
    params.currentPage = 1;
    params.rows = 10;

    const searchPromise = service.search(params);

    const req = httpMock.expectOne(request => {
      return request.url.includes('/record/search/rdmp/') && request.url.includes('searchStr=test%20query');
    });
    expect(req.request.method).toBe('GET');
    req.flush({ records: [], totalItems: 0, page: 1, facets: [] });

    const result = await searchPromise;
    expect(result.totalItems).toBe(0);
  });

  it('should construct search URL with exact refiners', async () => {
    await service.waitForInit();

    const params = new RecordSearchParams('rdmp');
    params.basicSearch = 'test';
    const exactRefiner = new RecordSearchRefiner({ name: 'author', type: 'exact', alwaysActive: true });
    exactRefiner.value = 'John';
    params.activeRefiners = [exactRefiner];

    const searchPromise = service.search(params);

    const req = httpMock.expectOne(request => {
      return request.url.includes('exactNames=author') && request.url.includes('exact_author=John');
    });
    expect(req.request.method).toBe('GET');
    expect(req.request.url).toContain('exactNames=author');
    expect(req.request.url).toContain('exact_author=John');
    req.flush({ records: [], totalItems: 0, page: 1, facets: [] });

    await searchPromise;
  });

  it('should construct search URL with facet refiners', async () => {
    await service.waitForInit();

    const params = new RecordSearchParams('rdmp');
    params.basicSearch = 'test';
    const facetRefiner = new RecordSearchRefiner({ name: 'category', type: 'facet', alwaysActive: true });
    facetRefiner.activeValue = 'science';
    params.activeRefiners = [facetRefiner];

    const searchPromise = service.search(params);

    const req = httpMock.expectOne(request => {
      return request.url.includes('facetNames=category') && request.url.includes('facet_category=science');
    });
    expect(req.request.method).toBe('GET');
    expect(req.request.url).toContain('facetNames=category');
    expect(req.request.url).toContain('facet_category=science');
    req.flush({ records: [], totalItems: 0, page: 1, facets: [] });

    await searchPromise;
  });

  it('should call getAllTypes', async () => {
    await service.waitForInit();

    const typesPromise = service.getAllTypes();

    const req = httpMock.expectOne(request => {
      return request.url.includes('/record/type');
    });
    expect(req.request.method).toBe('GET');
    req.flush([{ name: 'rdmp', searchable: true }]);

    const result = await typesPromise;
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('rdmp');
  });
});
