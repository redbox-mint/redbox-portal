import { Component, ElementRef, Inject, Input } from '@angular/core';
import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';
import {
  isEmpty as _isEmpty,
  isUndefined as _isUndefined,
  forEach as _forEach,
  toInteger as _toInteger,
} from 'lodash-es';

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
  @Input() record_type: string = 'rdmp';
  @Input() search_str: string = '';
  @Input() search_url: string = 'record/search';

  plans: any[] | null = null;
  params!: RecordSearchParams;
  isSearching: boolean = false;
  searchMsgType: string = '';
  searchMsg: string = '';
  queryStr: string = '';
  paramMap: Record<string, RecordSearchParams> = {};
  recTypeNames: string[] = [];
  totalItems: number = 0;

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
    if (!_isEmpty(urlParts[1])) {
      this.queryStr = urlParts[1];
    }
  }

  protected override async initComponent(): Promise<void> {
    this.brandingAndPortalUrl = this.searchService.brandingAndPortalUrl;

    if (_isEmpty(this.search_str) && !_isEmpty(this.queryStr)) {
      const parsedParams = new URLSearchParams(this.queryStr);
      const queryValue = parsedParams.get('q');
      if (!_isEmpty(queryValue)) {
        this.search_str = queryValue ?? '';
      }
    }

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
    if (!this.params && this.recTypeNames.length > 0) {
      this.setRecordType(this.recTypeNames[0]);
    }

    if (!_isEmpty(this.search_str)) {
      this.params.basicSearch = this.search_str;
    }

    if (!_isEmpty(this.queryStr)) {
      this.params.parseQueryStr(this.queryStr);
      await this.doSearch(null, false);
    } else if (!_isEmpty(this.search_str)) {
      await this.doSearch(null, false);
    }

    this.locationService.subscribe((popState: any) => {
      const queryStr = popState?.url?.split('?')[1] ?? '';
      if (!_isEmpty(queryStr)) {
        this.params.parseQueryStr(queryStr);
        this.doSearch(null, false);
      } else {
        this.params.clear();
        this.plans = null;
        this.totalItems = 0;
        this.searchMsg = '';
        this.searchMsgType = '';
      }
    });

    this.hideLoadingIndicator();
  }

  private hideLoadingIndicator(): void {
    const loadingElem: HTMLElement | null = document.getElementById('loading');
    if (loadingElem?.classList) {
      loadingElem.classList.add('hidden');
    }
  }

  setRecordType(recType: string, e: Event | null = null): void {
    if (e) {
      e.preventDefault();
    }
    const selectedType = this.paramMap[recType] ? recType : this.recTypeNames[0];
    if (!_isEmpty(selectedType) && this.paramMap[selectedType]) {
      this.params = this.paramMap[selectedType];
      this.record_type = selectedType;
    }
  }

  getRecordTypeNames(): string[] {
    return this.recTypeNames;
  }

  resetSearch(): void {
    this.params.clear();
    this.plans = null;
    this.totalItems = 0;
    this.locationService.go(this.search_url);
    this.searchMsg = '';
    this.searchMsgType = '';
  }

  syncLoc(): void {
    this.locationService.go(this.params.getHttpQuery(this.search_url));
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
      this.searchMsg = `${this.translationService.t('record-search-searching') ?? 'Searching...'} <span class="fa fa-spinner fa-spin" aria-hidden="true"></span>`;
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
        this.plans = this.setDashboardTitles(res.records);
        this.focusSearchMessage();
      } catch (err: any) {
        this.isSearching = false;
        this.searchMsg = err?.message ?? String(err);
        this.searchMsgType = 'danger';
        this.focusSearchMessage();
      }
    }
  }

  pageChanged(event: any): void {
    if (!_isEmpty(this.params.basicSearch) && this.params.currentPage !== _toInteger(event.page)) {
      this.params.currentPage = _toInteger(event.page);
      this.doSearch(null, true);
    }
  }

  private focusSearchMessage(): void {
    const searchMsgElem: HTMLElement | null = document.getElementById('searchMsg');
    if (searchMsgElem) {
      searchMsgElem.focus();
    }
  }

  private setDashboardTitles(records: any[] = []): any[] {
    const untitled = this.translationService.t('plan-with-no-title') ?? 'Untitled';
    _forEach(records, (plan: any) => {
      const hasTitle = !(_isUndefined(plan?.title) || _isEmpty(plan?.title) || _isEmpty(plan?.title?.[0]));
      plan.dashboardTitle = hasTitle ? plan.title : untitled;
    });
    return records;
  }
}
