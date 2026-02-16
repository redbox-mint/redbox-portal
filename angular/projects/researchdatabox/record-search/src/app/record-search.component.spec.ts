import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF, Location } from '@angular/common';
import { RouterTestingModule } from '@angular/router/testing';
import { I18NextModule } from 'angular-i18next';
import { UtilityService, LoggerService, ConfigService, TranslationService } from '@researchdatabox/portal-ng-common';
import { getStubConfigService, getStubTranslationService } from '@researchdatabox/portal-ng-common';
import { RecordSearchComponent } from './record-search.component';
import { RecordSearchRefinerComponent } from './record-search-refiner/record-search-refiner.component';
import { SearchService } from './search.service';

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
      imports: [FormsModule, I18NextModule.forRoot(), RouterTestingModule.withRoutes([])],
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
