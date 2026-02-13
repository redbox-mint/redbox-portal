import { Component, ElementRef, Inject } from '@angular/core';
import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';
import { isEmpty as _isEmpty, forEach as _forEach, toInteger as _toInteger } from 'lodash-es';

import { BaseComponent, TranslationService } from '@researchdatabox/portal-ng-common';
import { SearchService } from './search.service';
import { RecordSearchParams, RecordSearchRefiner } from './search-models';

/**
 * Record Search component - migrated from legacy angular-legacy/record_search.
 */
@Component({
  selector: 'record-search',
  templateUrl: './record-search.component.html',
  styleUrls: ['./record-search.component.scss'],
  providers: [Location, { provide: LocationStrategy, useClass: PathLocationStrategy }],
  standalone: false,
})
export class RecordSearchComponent extends BaseComponent {
  record_type: string = 'rdmp';
  search_str: string = '';
  search_url: string = 'record/search';

  plans: any[] | null = null;
  params!: RecordSearchParams;
  isSearching: boolean = false;
  searchMsgType: string = '';
  searchMsg: string = '';
  queryStr: string = '';
  paramMap: Record<string, RecordSearchParams> = {};
  recTypeNames: string[] = [];
  totalItems: number = 0;
  private currentSearchPath: string = '/record/search';

  constructor(
    private elm: ElementRef,
    @Inject(Location) private locationService: Location,
    @Inject(SearchService) public searchService: SearchService,
    @Inject(TranslationService) public translationService: TranslationService
  ) {
    super();
    this.initDependencies = [translationService, searchService];
    this.record_type = elm.nativeElement.getAttribute('record_type') || 'rdmp';
    this.search_str = elm.nativeElement.getAttribute('search_str') || '';
    this.search_url = elm.nativeElement.getAttribute('search_url') || 'record/search';
    const fullUrl = elm.nativeElement.getAttribute('full_url') || '';
    const urlParts = fullUrl.split('?');
    if (!_isEmpty(urlParts[0])) {
      this.currentSearchPath = urlParts[0].startsWith('/') ? urlParts[0] : `/${urlParts[0]}`;
    } else if (typeof window !== 'undefined' && !_isEmpty(window.location.pathname)) {
      this.currentSearchPath = window.location.pathname;
    }
    if (!_isEmpty(urlParts[1])) {
      this.queryStr = urlParts[1];
    }
  }

  protected override async initComponent(): Promise<void> {
    this.brandingAndPortalUrl = this.searchService.brandingAndPortalUrl;

    const typeConfs: any[] = await this.searchService.getAllTypes();
    _forEach(typeConfs, (typeConf: any) => {
      // check if we want this record type showing up in the search UI
      if (typeConf.searchable === false) {
        return;
      }
      this.recTypeNames.push(typeConf.name);
      const searchParam = new RecordSearchParams(typeConf.name);
      const searchFilterConfig: RecordSearchRefiner[] = [];
      _forEach(typeConf.searchFilters, (searchConfig: any) => {
        searchFilterConfig.push(new RecordSearchRefiner(searchConfig));
      });
      searchParam.setRefinerConfig(searchFilterConfig);
      this.paramMap[typeConf.name] = searchParam;
    });

    this.setRecordType(this.record_type);

    if (!_isEmpty(this.queryStr)) {
      this.params.parseQueryStr(this.queryStr);
      await this.doSearch(null, false);
    }

    this.locationService.subscribe((popState: any) => {
      const queryStr = popState.url.split('?')[1];
      if (queryStr) {
        this.params.parseQueryStr(queryStr);
        this.doSearch(null, false);
      }
    });

    this.hideLoadingIndicator();
  }

  private hideLoadingIndicator(): void {
    const loadingElem: HTMLElement | null = document.getElementById('loading');
    if (loadingElem) {
      loadingElem.classList.add('hidden');
    }
  }

  setRecordType(recType: string, e: Event | null = null): void {
    if (e) {
      e.preventDefault();
    }
    this.params = this.paramMap[recType];
    this.record_type = recType;
  }

  getRecordTypeNames(): string[] {
    return this.recTypeNames;
  }

  resetSearch(): void {
    this.params.clear();
    this.plans = null;
    this.locationService.go(this.currentSearchPath);
    this.searchMsg = '';
  }

  syncLoc(): void {
    this.locationService.go(this.params.getHttpQuery(this.currentSearchPath));
  }

  async search(refinerConfig: RecordSearchRefiner | null = null): Promise<void> {
    await this.doSearch(refinerConfig, true);
  }

  async doSearch(refinerConfig: RecordSearchRefiner | null = null, shouldSyncLoc: boolean = true): Promise<void> {
    if (!_isEmpty(this.params.basicSearch)) {
      if (refinerConfig) {
        this.params.addActiveRefiner(refinerConfig);
      }
      this.isSearching = true;
      this.plans = null;
      this.searchMsgType = 'info';
      this.searchMsg = this.translationService.t('record-search-searching') ?? 'Searching...';
      if (shouldSyncLoc) {
        this.syncLoc();
      }
      try {
        const res: any = await this.searchService.search(this.params);
        this.params.currentPage = res.page;
        this.totalItems = res.totalItems;
        this.isSearching = false;
        this.searchMsgType = 'success';
        this.searchMsg = `${this.translationService.t('record-search-results') ?? 'Results: '}${this.totalItems}`;
        this.params.setFacetValues(res.facets);
        this.plans = res.records;
      } catch (err: any) {
        this.isSearching = false;
        this.searchMsg = err?.message ?? String(err);
        this.searchMsgType = 'danger';
      }
    }
  }

  pageChanged(event: any): void {
    if (!_isEmpty(this.params.basicSearch) && this.params.currentPage !== _toInteger(event.page)) {
      this.params.currentPage = _toInteger(event.page);
      this.doSearch(null, true);
    }
  }
}
