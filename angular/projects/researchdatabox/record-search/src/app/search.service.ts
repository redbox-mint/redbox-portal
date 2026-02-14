import { Injectable, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';
import { map, firstValueFrom } from 'rxjs';
import { isEmpty as _isEmpty, forEach as _forEach, size as _size, merge as _merge, clone as _clone } from 'lodash-es';

import { HttpClientService, ConfigService, UtilityService, LoggerService } from '@researchdatabox/portal-ng-common';
import { RecordSearchParams, RecordSearchRefiner } from './search-models';

/**
 * Service for performing record searches against the ReDBox API.
 *
 * Ported from legacy `RecordsService.search()` method.
 */
@Injectable()
export class SearchService extends HttpClientService {
  private requestOptions: any = null as any;

  constructor(
    @Inject(HttpClient) protected override http: HttpClient,
    @Inject(APP_BASE_HREF) public override rootContext: string,
    @Inject(UtilityService) protected override utilService: UtilityService,
    @Inject(ConfigService) protected override configService: ConfigService,
    @Inject(LoggerService) private loggerService: LoggerService
  ) {
    super(http, rootContext, utilService, configService);
    this.requestOptions = { responseType: 'json', observe: 'body' };
  }

  public override async waitForInit(): Promise<any> {
    await super.waitForInit();
    this.enableCsrfHeader();
    this.loggerService.debug('waitForInit SearchService');
    _merge(this.requestOptions, { context: this.httpContext });
    return this;
  }

  /**
   * Execute a search. Constructs the URL with exact/facet refiners
   * and returns the API response.
   */
  public async search(params: RecordSearchParams): Promise<any> {
    let refinedSearchStr = '';
    params.filterActiveRefinersWithNoData();
    if (_size(params.activeRefiners) > 0) {
      let exactSearchNames = '';
      let exactSearchValues = '';
      let facetSearchNames = '';
      let facetSearchValues = '';
      _forEach(params.activeRefiners, (refiner: RecordSearchRefiner) => {
        switch (refiner.type) {
          case 'exact':
            exactSearchNames = `${_isEmpty(exactSearchNames) ? `&exactNames=` : `${exactSearchNames},`}${refiner.name}`;
            exactSearchValues = `${exactSearchValues}&exact_${refiner.name}=${encodeURIComponent(refiner.value ?? '')}`;
            break;
          case 'facet':
            facetSearchNames = `${_isEmpty(facetSearchNames) ? `&facetNames=` : `${facetSearchNames},`}${refiner.name}`;
            if (!_isEmpty(refiner.activeValue)) {
              facetSearchValues = `${facetSearchValues}&facet_${refiner.name}=${encodeURIComponent(refiner.activeValue)}`;
            }
            break;
        }
      });
      refinedSearchStr = `${exactSearchNames}${exactSearchValues}${facetSearchNames}${facetSearchValues}`;
    }
    const searchValue = encodeURIComponent(params.basicSearch ?? '');
    const url = `${this.brandingAndPortalUrl}/record/search/${params.recordType}/?searchStr=${searchValue}&rows=${params.rows}&page=${params.currentPage}${refinedSearchStr}`;
    const result$ = this.http.get(url, this.getHttpOptions()).pipe(map(res => res));
    return await firstValueFrom(result$);
  }

  /**
   * Get all record types.
   */
  public async getAllTypes(): Promise<any> {
    const url = `${this.brandingAndPortalUrl}/record/type`;
    const result$ = this.http.get(url, this.getHttpOptions());
    return await firstValueFrom(result$);
  }

  private getHttpOptions(): any {
    return _clone(this.requestOptions);
  }
}
