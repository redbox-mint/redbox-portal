import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { PaginationModule } from 'ngx-bootstrap/pagination';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF, Location } from '@angular/common';
import { SpyLocation } from '@angular/common/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { ConfigService, I18NextPipe, LoggerService, TranslationService, UtilityService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService } from '@researchdatabox/portal-ng-common';
import { RecordSearchComponent } from './record-search.component';
import { RecordSearchRefinerComponent } from './record-search-refiner/record-search-refiner.component';
import { SearchService } from './search.service';
import { RecordSearchParams } from './search-models';

function getStubSearchService(typeData: any[] = []) {
  return {
    baseUrl: 'base',
    brandingAndPortalUrl: 'base/default/rdmp',
    waitForInit: function () {
      return Promise.resolve(true);
    },
    isInitializing: function () {
      return false;
    },
    getAllTypes: function () {
      return Promise.resolve(typeData);
    },
    search: function () {
      return Promise.resolve({ records: [], totalItems: 0, page: 1, facets: [] });
    },
  };
}

describe('RecordSearchComponent', () => {
  let configService: any;
  let translationService: any;
  let searchService: any;

  beforeEach(async () => {
    configService = getStubConfigService();
    translationService = getStubTranslationService({
      'plan-with-no-title': 'Untitled',
      'record-search-searching': 'Searching...',
      'record-search-results': 'Results: ',
    });
    searchService = getStubSearchService([
      {
        name: 'rdmp',
        searchable: true,
        searchFilters: [{ name: 'title', title: 'Title', type: 'exact' }],
      },
      {
        name: 'dataRecord',
        searchable: true,
        searchFilters: [],
      },
      {
        name: 'hidden',
        searchable: false,
        searchFilters: [],
      },
    ]);

    await TestBed.configureTestingModule({
      declarations: [RecordSearchComponent, RecordSearchRefinerComponent],
      imports: [FormsModule, I18NextPipe, RouterTestingModule.withRoutes([])],
      providers: [
        {
          provide: APP_BASE_HREF,
          useValue: 'base',
        },
        LoggerService,
        UtilityService,
        {
          provide: TranslationService,
          useValue: translationService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: SearchService,
          useValue: searchService,
        },
      ],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(RecordSearchComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should initialize with default record type', () => {
    const fixture = TestBed.createComponent(RecordSearchComponent);
    const component = fixture.componentInstance;
    expect(component.record_type).toBeTruthy();
  });

  it('should initialize with empty plans', () => {
    const fixture = TestBed.createComponent(RecordSearchComponent);
    const component = fixture.componentInstance;
    expect(component.plans).toBeNull();
    expect(component.totalItems).toBe(0);
  });

  it('should filter out non-searchable types after init', async () => {
    const fixture = TestBed.createComponent(RecordSearchComponent);
    const component = fixture.componentInstance;
    component.ngOnInit();
    await component.waitForInit();

    // 'hidden' should be excluded since searchable is false
    expect(component.getRecordTypeNames()).toContain('rdmp');
    expect(component.getRecordTypeNames()).toContain('dataRecord');
    expect(component.getRecordTypeNames()).not.toContain('hidden');
  });

  it('setRecordType should update record_type and params', async () => {
    const fixture = TestBed.createComponent(RecordSearchComponent);
    const component = fixture.componentInstance;
    component.ngOnInit();
    await component.waitForInit();

    component.setRecordType('dataRecord');
    expect(component.record_type).toBe('dataRecord');
    expect(component.params.recordType).toBe('dataRecord');
  });

  it('setRecordType should fallback to first searchable type when invalid type is provided', async () => {
    const fixture = TestBed.createComponent(RecordSearchComponent);
    const component = fixture.componentInstance;
    component.ngOnInit();
    await component.waitForInit();

    component.setRecordType('nonexistent');

    expect(component.record_type).toBe('rdmp');
    expect(component.params.recordType).toBe('rdmp');
  });

  it('resetSearch should clear search state', async () => {
    const fixture = TestBed.createComponent(RecordSearchComponent);
    const component = fixture.componentInstance;
    const location = fixture.debugElement.injector.get(Location);
    const goSpy = spyOn(location, 'go').and.callThrough();
    component.ngOnInit();
    await component.waitForInit();

    component.params.basicSearch = 'test';
    component.plans = [{ id: 1 }];
    component.searchMsg = 'some message';
    component.resetSearch();

    expect(component.params.basicSearch).toBeNull();
    expect(component.plans).toBeNull();
    expect(component.searchMsg).toBe('');
    expect(goSpy).toHaveBeenCalledWith(component.search_url);
    expect(component.totalItems).toBe(0);
  });

  it('starts an amended search on page one while pagination retains its requested page', async () => {
    const requestedPages: number[] = [];
    searchService.search = async (params: RecordSearchParams) => {
      requestedPages.push(params.currentPage);
      return { records: [], totalItems: 20, page: params.currentPage, facets: [] };
    };
    const component = TestBed.createComponent(RecordSearchComponent).componentInstance;
    component.ngOnInit();
    await component.waitForInit();
    component.params.basicSearch = 'owned records';
    component.params.currentPage = 2;

    const refiner = component.params.getRefinerConfig('title')!;
    refiner.value = '07';
    await component.search(refiner);
    await component.pageChanged({ page: 2 });

    expect(requestedPages).toEqual([1, 2]);
  });

  it('keeps pagination mounted while loading a page without emitting repeated searches', async () => {
    await TestBed.configureTestingModule({
      imports: [PaginationModule],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    let resolveSecondPage!: (value: any) => void;
    const search = jasmine.createSpy('search').and.callFake((params: RecordSearchParams) => {
      if (params.currentPage === 1) {
        return Promise.resolve({ records: [{ storage_id: 'first', title: 'First page' }], totalItems: 12, page: 1, facets: [] });
      }
      return new Promise(resolve => { resolveSecondPage = resolve; });
    });
    searchService.search = search;
    const fixture = TestBed.createComponent(RecordSearchComponent);
    const component = fixture.componentInstance;
    fixture.autoDetectChanges();
    await component.waitForInit();
    component.params.basicSearch = 'owned records';
    await component.search();
    await fixture.whenStable();

    const pagination = fixture.nativeElement.querySelector('pagination');
    const pageChanged = spyOn(component, 'pageChanged').and.callThrough();
    const secondPage = Array.from(pagination.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>)
      .find(link => link.textContent?.trim() === '2')!;
    secondPage.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('pagination')).toBe(pagination);

    resolveSecondPage({ records: [{ storage_id: 'second', title: 'Second page' }], totalItems: 12, page: 2, facets: [] });
    await pageChanged.calls.mostRecent().returnValue;
    await fixture.whenStable();
    expect(search).toHaveBeenCalledTimes(2);
    expect(component.params.currentPage).toBe(2);
    expect(fixture.nativeElement.querySelector('h3 a')?.textContent).toContain('Second page');
  });

  it('clears rendered results when browser history returns to an empty search', async () => {
    await TestBed.configureTestingModule({
      imports: [PaginationModule],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    TestBed.overrideComponent(RecordSearchComponent, {
      set: {providers: [{provide: Location, useClass: SpyLocation}]},
    });
    searchService.search = async () => ({
      records: [{storage_id: 'first', title: 'History result'}], totalItems: 1, page: 1, facets: [],
    });
    const fixture = TestBed.createComponent(RecordSearchComponent);
    fixture.autoDetectChanges();
    await fixture.componentInstance.waitForInit();
    fixture.componentInstance.params.basicSearch = 'history';
    await fixture.componentInstance.search();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h3 a')?.textContent).toContain('History result');

    (fixture.debugElement.injector.get(Location) as SpyLocation).simulateUrlPop('/record/search');
    expect(fixture.componentInstance.params.basicSearch).toBeNull();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h3 a')).toBeNull();
    expect(fixture.nativeElement.querySelector('#basic-search-input').value).toBe('');
  });

  it('search should set fallback dashboardTitle when title is missing', async () => {
    searchService.search = function () {
      return Promise.resolve({
        records: [{ storage_id: '1', title: null, dashboardTitle: '' }],
        totalItems: 1,
        page: 1,
        facets: [],
      });
    };

    const fixture = TestBed.createComponent(RecordSearchComponent);
    const component = fixture.componentInstance;
    component.ngOnInit();
    await component.waitForInit();
    component.params.basicSearch = 'test';

    await component.search();

    expect(component.plans?.[0]?.dashboardTitle).toBe('Untitled');
  });

  it('search should focus search message region after success', async () => {
    const focusSpy = jasmine.createSpy('focus');
    spyOn(document, 'getElementById').and.callFake((id: string) => {
      if (id === 'searchMsg') {
        return { focus: focusSpy } as any;
      }
      if (id === 'loading') {
        return { classList: { add: jasmine.createSpy('add') } } as any;
      }
      return null;
    });

    const fixture = TestBed.createComponent(RecordSearchComponent);
    const component = fixture.componentInstance;
    component.ngOnInit();
    await component.waitForInit();
    component.params.basicSearch = 'test';

    await component.search();

    expect(focusSpy).toHaveBeenCalled();
  });
});
