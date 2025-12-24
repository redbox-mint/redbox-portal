// This file is generated from internal/sails-ts/api/services/SolrSearchService.ts. Do not edit directly.
import { QueueService, SearchService, SolrConfig, SolrCore, SolrOptions, BrandingModel, UserModel, RoleModel, RecordModel, SolrDocument, Services as services, RecordsService } from '../../index';
import {
  Sails
} from "sails";
import * as luceneEscapeQuery from "lucene-escape-query";

declare const axios: any;
declare const util: any;
declare const querystring: any;
declare const flat: any;
declare class SolrClient {
  options: SolrOptions;
  axios: any;
  autoCommit: boolean;
  constructor(options: SolrOptions);
  public add(doc: any): Promise<void>;
  public delete(field: string, value: any): Promise<void>;
  public commit(): any;
}
declare class Solr {
  static createClient(options: SolrOptions): any;
}

export interface SolrSearchService {
  index(id: string, data: RecordModel): void;
  remove(id: string): void;
  searchFuzzy(coreId: string | undefined, type: string, workflowState: string, searchQuery: string, exactSearches: any, facetSearches: any, brand: BrandingModel, user: UserModel, roles: RoleModel[], returnFields: string[], start?: number, rows?: number): Promise<any>;
  solrAddOrUpdate(job: any): any;
  solrDelete(job: any, done: any): any;
  searchAdvanced(coreId: string | undefined, type: string, query: string): Promise<any>;
  preIndex(data: SolrDocument): any;
}
