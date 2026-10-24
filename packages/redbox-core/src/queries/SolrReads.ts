import _ from 'lodash';
import axios from 'axios';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type {
  SolrSearchConfig as SolrConfig,
  SolrCoreConfig as SolrCore,
  SolrCoreOptions as SolrOptions,
} from '../config/solr.config';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { UserModel } from '../model/storage/UserModel';
import type { RoleModel } from '../model/storage/RoleModel';
import type { RecordsService } from '../RecordsService';
import { recordServiceChronicle } from '../utilities/serviceChronicle';
export interface SolrReadsInput {
  readonly config: SolrConfig;
  readonly log: ILogger;
  hasEditAccess: RecordsService['hasEditAccess'];
}
type SearchField = { name: string; value: string | number | null | undefined };
type SolrResponse = {
  response: { numFound: number; docs: Array<Record<string, unknown>> };
  facet_counts?: { facet_fields?: Record<string, Array<string | number>> };
};
type LuceneEscapeQueryModule =
  | ((value: string) => string)
  | { escape?: (value: string) => string; default?: (value: string) => string };
const luceneEscapeQueryModule: LuceneEscapeQueryModule = require('lucene-escape-query');
const luceneEscapeQuery: (value: string) => string =
  typeof luceneEscapeQueryModule === 'function'
    ? luceneEscapeQueryModule
    : luceneEscapeQueryModule?.escape || luceneEscapeQueryModule?.default || ((value: string) => value);

export class SolrReads {
  public constructor(private readonly input: SolrReadsInput) {}
  private updateChronicle(info: Record<string, unknown>): void {
    recordServiceChronicle(this.input.log, info);
  }
  private getBaseUrl(coreOptions: SolrOptions): string {
    return `${coreOptions.https ? 'https' : 'http'}://${coreOptions.host}:${coreOptions.port}/solr/`;
  }
  public async searchAdvanced(
    coreId: string = 'default',
    type: string,
    query: string | URLSearchParams
  ): Promise<Record<string, unknown>> {
    const solrConfig: SolrConfig = this.input.config;
    const core: SolrCore = solrConfig.cores[coreId];
    const coreName = core.options.core;
    const url = `${this.getBaseUrl(core.options)}${coreName}/select`;
    const params = query instanceof URLSearchParams ? query : this.parseQueryFragment(query);
    this.updateChronicle({ solrCore: coreId, solrSearchMode: 'advanced' });
    const response = await axios
      .get(url, { params })
      .then((response: { data: Record<string, unknown> }) => response.data);
    return response;
  }

  public async searchFuzzy(
    coreId: string = 'default',
    type: string,
    workflowState: string,
    searchQuery: string,
    exactSearches: SearchField[],
    facetSearches: SearchField[],
    brand: BrandingModel,
    user: UserModel,
    roles: RoleModel[],
    returnFields: string[],
    start: number = 0,
    rows: number = 10
  ): Promise<Record<string, unknown>> {
    const username = user.username;
    const solrConfig: SolrConfig = this.input.config;
    const core: SolrCore = solrConfig.cores[coreId];
    const coreName = core.options.core;
    const baseUrl = `${this.getBaseUrl(core.options)}${coreName}/select`;

    const allParams: Array<{ key: string; value: string }> = [];
    allParams.push({ key: 'fq', value: 'metaMetadata_brandId:' + this.luceneEscape(brand.id) });
    if (type) allParams.push({ key: 'fq', value: `metaMetadata_type:${this.luceneEscape(type)}` });
    if (workflowState) {
      allParams.push({ key: 'fq', value: `workflow_stage:${this.luceneEscape(workflowState)}` });
    }
    allParams.push({ key: 'q', value: `full_text:${searchQuery}` });

    _.forEach(exactSearches, (exactSearch: SearchField) => {
      allParams.push({ key: 'fq', value: `${exactSearch.name}:${this.luceneEscape(exactSearch.value)}` });
    });
    if (facetSearches.length > 0) {
      allParams.push({ key: 'facet', value: 'true' });
      _.forEach(facetSearches, (facetSearch: SearchField) => {
        allParams.push({ key: 'facet.field', value: facetSearch.name });
        if (!_.isEmpty(facetSearch.value)) {
          allParams.push({ key: 'fq', value: `${facetSearch.name}:${this.luceneEscape(facetSearch.value)}` });
        }
      });
    }
    allParams.push({ key: 'start', value: String(start) });
    allParams.push({ key: 'rows', value: String(rows) });
    allParams.push({ key: 'version', value: '2.2' });
    allParams.push({ key: 'wt', value: 'json' });
    allParams.push({ key: 'sort', value: 'date_object_modified desc' });

    this.addAuthParams(allParams, username, roles, brand, false);

    const params = new URLSearchParams();
    for (const param of allParams) {
      params.append(param.key, param.value);
    }

    this.updateChronicle({
      solrCore: coreId,
      solrSearchMode: 'fuzzy',
      solrRecordType: type,
      solrStart: start,
      solrRows: rows,
    });
    const response = await axios.get(baseUrl, { params }).then((response: { data: SolrResponse }) => response.data);
    const customResp: {
      records: Array<Record<string, unknown>>;
      facets?: Array<{ name: string; values: Array<{ value: string; count: number }> }>;
      totalItems?: number;
    } = {
      records: [],
    };
    const totalItems = response.response.numFound;

    _.forEach(response.response.docs, (solrdoc: Record<string, unknown>) => {
      const customDoc: Record<string, unknown> = {};
      _.forEach(returnFields, (retField: string) => {
        const fieldValue = solrdoc[retField];
        if (Array.isArray(fieldValue)) {
          customDoc[retField] = fieldValue[0];
        } else {
          customDoc[retField] = fieldValue;
        }
      });
      customDoc['hasEditAccess'] = this.input.hasEditAccess(
        brand,
        user,
        roles as unknown as Array<Record<string, unknown>>,
        solrdoc
      );
      customResp.records.push(customDoc);
    });
    // check if have facets turned on...
    const facetFields = response.facet_counts?.facet_fields;
    if (facetFields) {
      const facets: Array<{ name: string; values: Array<{ value: string; count: number }> }> = [];
      customResp['facets'] = facets;
      _.forOwn(facetFields, (facet_field: Array<string | number>, facet_name: string) => {
        const numFacetsValues = _.size(facet_field) / 2;
        const facetValues: Array<{ value: string; count: number }> = [];
        for (let i = 0, j = 0; i < numFacetsValues; i++) {
          facetValues.push({
            value: String(facet_field[j++]),
            count: Number(facet_field[j++]),
          });
        }
        facets.push({
          name: facet_name,
          values: facetValues,
        });
      });
    }
    this.updateChronicle({ solrTotalItems: totalItems, solrResultCount: customResp.records.length });
    customResp['totalItems'] = totalItems;
    return customResp;
  }

  public luceneEscape(str: string | number | null | undefined) {
    return luceneEscapeQuery(String(str ?? ''));
  }

  public addAuthParams(
    allParams: Array<{ key: string; value: string }> | URLSearchParams,
    username: string,
    roles: RoleModel[],
    brand: BrandingModel,
    editAccessOnly: boolean | undefined = undefined
  ) {
    let roleString = '';
    let matched = false;
    for (let i = 0; i < roles.length; i++) {
      const role = roles[i];
      const roleBrandId = role.branding as BrandingModel | string | undefined;
      if ((typeof roleBrandId === 'object' ? roleBrandId?.id : roleBrandId) == brand.id) {
        if (matched) {
          roleString += ' OR ';
          matched = false;
        }
        roleString += this.luceneEscape(roles[i].name);
        matched = true;
      }
    }
    const fqValue =
      'authorization_edit:' +
      this.luceneEscape(username) +
      (editAccessOnly
        ? ''
        : ' OR authorization_view:' +
          this.luceneEscape(username) +
          ' OR authorization_viewRoles:(' +
          roleString +
          ')') +
      ' OR authorization_editRoles:(' +
      roleString +
      ')';
    if (allParams instanceof URLSearchParams) {
      allParams.append('fq', fqValue);
    } else {
      allParams.push({ key: 'fq', value: fqValue });
    }
  }

  public parseQueryFragment(query: string): URLSearchParams {
    const params = new URLSearchParams();
    for (const [index, part] of query.split('&').entries()) {
      const separator = part.indexOf('=');
      if (separator < 0) {
        if (index === 0 && part) params.set('q', part);
        continue;
      }
      params.append(part.slice(0, separator), part.slice(separator + 1));
    }
    return params;
  }

  public addAuthFilter(
    url: string,
    username: string,
    roles: RoleModel[],
    brand: BrandingModel,
    editAccessOnly: boolean | undefined = undefined
  ) {
    const allParams: Array<{ key: string; value: string }> = [];
    this.addAuthParams(allParams, username, roles, brand, editAccessOnly);
    return url + allParams.map(param => `&${param.key}=${param.value}`).join('');
  }
}
