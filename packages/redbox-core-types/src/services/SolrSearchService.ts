// Copyright (c) 2020 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { QueueService } from '../QueueService';
import { SearchService } from '../SearchService';
import type { SolrSearchConfig, SolrCoreConfig, SolrCoreOptions, SolrCoreSchema, SolrFieldDefinition } from '../config/solr.config';
import { BrandingModel } from '../model/storage/BrandingModel';
import { UserModel } from '../model/storage/UserModel';
import { RoleModel } from '../model/storage/RoleModel';
import { RecordModel } from '../model/storage/RecordModel';
import { SolrDocument } from '../model/SolrDocument';
import { Services as services } from '../CoreService';
import { RecordsService } from '../RecordsService';

type SolrOptions = SolrCoreOptions;
type SolrCore = SolrCoreConfig;
type SolrConfig = SolrSearchConfig;

const axios = require('axios');
type FlatModule = { flatten: (obj: Record<string, unknown>, options?: Record<string, unknown>) => Record<string, unknown> };
type LuceneEscapeQueryModule = ((value: string) => string) | { escape?: (value: string) => string; default?: (value: string) => string };
let flat: FlatModule | null = null;
const luceneEscapeQueryModule: LuceneEscapeQueryModule = require("lucene-escape-query");
const luceneEscapeQuery: (value: string) => string =
  typeof luceneEscapeQueryModule === 'function'
    ? luceneEscapeQueryModule
    : (luceneEscapeQueryModule?.escape || luceneEscapeQueryModule?.default || ((value: string) => value));



class SolrClient {
  options: SolrOptions;
  axios: { post: (url: string, body: unknown) => Promise<unknown> };
  autoCommit: boolean = true; 
  constructor(options: SolrOptions) {
    this.options = options;
    const baseUrl = `${this.options.https ? 'https' : 'http'}://${this.options.host}:${this.options.port}/solr/${this.options.core}/`;
    this.axios = axios.create({
      baseURL: baseUrl,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  public async add(doc: Record<string, unknown>): Promise<void> {
    try {
      await this.axios.post('/update', [doc]);
      if (this.autoCommit) {
        await this.commit();
      }
    } catch (err) {
      console.error('Failed to add document to Solr:', err);
      throw err;
    }
  }

  public async delete(field: string, value: string | number): Promise<void> {
    try {
      const deleteQuery = { delete: { query: `${field}:"${value}"` } };
      await this.axios.post('/update', deleteQuery);
      if (this.autoCommit) {
        await this.commit();
      }
    } catch (err) {
      console.error('Failed to delete document from Solr:', err);
      throw err;
    }
  }

  public async commit() {
    try {
      await this.axios.post('/update', { commit: {} });
    } catch (err) {
      console.error('Failed to commit changes to Solr:', err);
      throw err;
    }
  }

}
// Create a minimal SolrClient class if not already available
class Solr {
  static createClient(options: SolrOptions) {
    return new SolrClient(options);
  }
}

export namespace Services {
  type SolrFacetFields = Record<string, Array<string | number>>;
  type SolrResponse = {
    response: { numFound: number; docs: Array<Record<string, unknown>> };
    facet_counts?: { facet_fields: SolrFacetFields };
  };
  type SearchField = { name: string; value?: string | number | null };
  type QueueJob<T = unknown> = { attrs: { data: T } };
  type PreIndexMoveConfig = { source: string; dest?: string };
  type PreIndexCopyConfig = { source: string; dest: string };
  type PreIndexJsonStringConfig = { source: string; dest?: string };
  type PreIndexTemplateConfig = { source?: string; dest?: string; template: string };
  type PreIndexFlattenSpecialConfig = { field: string; source: string; dest?: string; options?: Record<string, unknown> };

  /**
   * Service class for adding documents to Solr.
   *
   */
  export class SolrSearchService extends services.Core.Service implements SearchService {
    protected override _exportedMethods: string[] = [
      'index',
      'remove',
      'searchFuzzy',
      'solrAddOrUpdate',
      'solrDelete',
      'searchAdvanced',
      'preIndex',
      'init'
    ]

    protected queueService!: QueueService;
    private clients: {
      [key: string]: SolrClient;
    } = {};

    constructor() {
      super();
      this.logHeader = "SolrIndexer::";
    }

    public override init() {
      const that = this;
      this.registerSailsHook('on', 'ready', async function () {
        that.queueService = sails.services[sails.config.queue.serviceName] as unknown as QueueService;
        that.initClient();
        await that.buildSchema(that);
      });
    }

    protected override async processDynamicImports() {
      flat = await import("flat");
    }

    protected initClient(ref: SolrSearchService = this) {
      const solrConfig: SolrConfig = sails.config.solr;
      const coreIds: string[] = Object.keys(solrConfig.cores);
      for (const coreId of coreIds) {
        const solrOpts: SolrOptions = solrConfig.cores[coreId].options;
        const client: SolrClient = Solr.createClient(solrOpts);
        ref.clients[coreId] = client;
      }
    }

    protected async buildSchema(ref: SolrSearchService = this) {
      const solrConfig: SolrConfig = sails.config.solr;
      const coreNameKeys: string[] = Object.keys(solrConfig.cores);

      // wait for SOLR deafult core to start up
      await ref.waitForSolr('default');

      for (const coreId of coreNameKeys) {

        const core: SolrCore = solrConfig.cores[coreId];
        const coreName = core.options.core;

        if (coreId != 'default') {
          await ref.waitForSolr(coreId, ref);
        }

        // check if the schema is built....
        try {
          if (core.initSchemaFlag) {
            const flagName: string = core.initSchemaFlag.name;
            const schemaInitFlag = await ref.getSchemaEntry(coreId, 'fields', flagName, ref);
            if (!_.isEmpty(schemaInitFlag)) {
              sails.log.verbose(`${ref.logHeader} Schema flag found: ${flagName}. Schema is already initialised, skipping build.`);
              continue;
            }
          }
        } catch (err) {
          sails.log.verbose(JSON.stringify(err));
        }
        sails.log.verbose(`${ref.logHeader} Schema not initialised, building schema...`)
        const schemaUrl = `${ref.getBaseUrl(core.options)}${coreName}/schema`;
        try {
          const schemaDef = _.get(sails.config.solr.cores, coreId + '.schema') as unknown as SolrCoreSchema;
          if (_.isEmpty(schemaDef)) {
            sails.log.verbose(`${ref.logHeader} Schema definition empty, skipping build.`);
            continue;
          }
          // append the init flag
          if (_.isEmpty(schemaDef['add-field'])) {
            schemaDef['add-field'] = [];
          }
          const initSchemaFlag = _.get(sails.config.solr.cores, coreId + '.initSchemaFlag') as unknown as SolrFieldDefinition;
          schemaDef['add-field'].push(initSchemaFlag);
          sails.log.verbose(`${ref.logHeader} sending schema definition:`);
          sails.log.verbose(JSON.stringify(schemaDef));
          const response = await axios.post(schemaUrl, schemaDef).then((response: { data: unknown }) => response.data);
          sails.log.verbose(`${ref.logHeader} Schema build successful, response: `);
          sails.log.verbose(JSON.stringify(response));
        } catch (err) {
          sails.log.error(`${ref.logHeader} Failed to build SOLR schema:`);
          sails.log.error(JSON.stringify(err));
        }
      }
    }

    private async getSchemaEntry(coreId: string, fieldName: string, name: string, ref: SolrSearchService = this) {
      const schemaResp = await ref.getSchema(coreId);
      return _.find(_.get(schemaResp.schema, fieldName), (schemaDef: Record<string, unknown>) => { return schemaDef.name == name });
    }

    private async getSchema(coreId: string, ref: SolrSearchService = this) {
      const solrConfig: SolrConfig = sails.config.solr;
      const core: SolrCore = solrConfig.cores[coreId];
      const schemaUrl = `${ref.getBaseUrl(core.options)}${core.options.core}/schema?wt=json`;
      return await axios.get(schemaUrl).then((response: { data: unknown }) => response.data);
    }

    private async waitForSolr(coreId: string, ref: SolrSearchService = this) {
      const solrConfig: SolrConfig = sails.config.solr;
      const core: SolrCore = solrConfig.cores[coreId];
      const coreName: string = core.options.core;
      let solrUp = false;
      let tryCtr = 0;
      const urlCheck = `${ref.getBaseUrl(core.options)}admin/cores?action=STATUS&core=${coreName}`;
      while (!solrUp && tryCtr <= sails.config.solr.maxWaitTries) {
        try {
          tryCtr++;
          sails.log.verbose(`${ref.logHeader} Checking if SOLR is up, try #${tryCtr}... ${urlCheck}`);
          const solrStat = await axios.get(urlCheck).then((response: { data: { status: Record<string, { instanceDir?: string }> } }) => response.data);
          sails.log.verbose(`${ref.logHeader} Response is:`);
          sails.log.verbose(JSON.stringify(solrStat));
          if (solrStat.status[coreName].instanceDir) {
            sails.log.info(`${ref.logHeader} SOLR core is available: ${coreName}`);
            solrUp = true;
          } else {
            throw new Error(`SOLR core: ${coreName} is still loading.`);
          }
        } catch (err) {
          sails.log.info(`${ref.logHeader} SOLR core: ${coreName} is still down, waiting.`);
          sails.log.info(JSON.stringify(err));
          if (tryCtr == sails.config.solr.maxWaitTries) {
            sails.log.error(`${ref.logHeader} SOLR seemed to have failed startup, giving up on waiting.`);
            break;
          }
          await ref.sleep(sails.config.solr.waitTime);
        }
      }
    }

    private getBaseUrl(coreOptions: SolrOptions): string {
      return `${coreOptions.https ? 'https' : 'http'}://${coreOptions.host}:${coreOptions.port}/solr/`;
    }

    public index(id: string, data: RecordModel): void {
      sails.log.verbose(`${this.logHeader} adding indexing job: ${id} with data:`);
      data.id = id;
      sails.log.verbose(JSON.stringify(data));
      this.queueService.now(sails.config.solr.createOrUpdateJobName, data);
    }

    public remove(id: string): void {
      sails.log.verbose(`${this.logHeader} adding delete-index job: ${id} with data:`);
      const data = { id: id };
      
      sails.log.verbose(JSON.stringify(data));
      this.queueService.now(sails.config.solr.deleteJobName, data);
    }
    

    public async searchAdvanced(coreId: string = 'default', type: string, query: string): Promise<Record<string, unknown>> {
      const solrConfig: SolrConfig = sails.config.solr;
      const core: SolrCore = solrConfig.cores[coreId];
      const coreName = core.options.core;
      const url = `${this.getBaseUrl(core.options)}${coreName}/select?q=${query}`;
      sails.log.verbose(`Searching advanced using: ${url}`);
      const response = await axios.get(url).then((response: { data: Record<string, unknown> }) => response.data);
      return response;
    }

    public async searchFuzzy(coreId: string = 'default', type: string, workflowState: string, searchQuery: string, exactSearches: SearchField[], facetSearches: SearchField[], brand: BrandingModel, user: UserModel, roles: RoleModel[], returnFields: string[], start: number = 0, rows: number = 10): Promise<Record<string, unknown>> {
      const username = user.username;
      const solrConfig: SolrConfig = sails.config.solr;
      const core: SolrCore = solrConfig.cores[coreId];
      const coreName = core.options.core;
      let searchParam = workflowState ? ` AND workflow_stage:${workflowState} ` : '';
      searchParam = `${searchParam} AND full_text:${searchQuery}`;
      _.forEach(exactSearches, (exactSearch: SearchField) => {
        searchParam = `${searchParam}&fq=${exactSearch.name}:${this.luceneEscape(exactSearch.value)}`
      });
      if (facetSearches.length > 0) {
        searchParam = `${searchParam}&facet=true`
        _.forEach(facetSearches, (facetSearch: SearchField) => {
          searchParam = `${searchParam}&facet.field=${facetSearch.name}${_.isEmpty(facetSearch.value) ? '' : `&fq=${facetSearch.name}:${this.luceneEscape(facetSearch.value)}`}`
        });
      }
      searchParam = `${searchParam}&start=${start}&rows=${rows}`
      let url = `${this.getBaseUrl(core.options)}${coreName}/select?q=metaMetadata_brandId:${brand.id} AND metaMetadata_type:${type}${searchParam}&version=2.2&wt=json&sort=date_object_modified desc`;
      url = this.addAuthFilter(url, username, roles, brand, false);
      sails.log.verbose(`Searching fuzzy using: ${url}`);
      const response = await axios.get(url).then((response: { data: SolrResponse }) => response.data);
      const customResp: { records: Array<Record<string, unknown>>; facets?: Array<{ name: string; values: Array<{ value: string; count: number }> }>; totalItems?: number } = {
        records: []
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
        customDoc["hasEditAccess"] = RecordsService.hasEditAccess(brand, user, roles as unknown as Array<Record<string, unknown>>, solrdoc);
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
              count: Number(facet_field[j++])
            });
          }
          facets.push({
            name: facet_name,
            values: facetValues
          });
        });
      }
      customResp['totalItems'] = totalItems;
      return customResp;
    }

    private clientSleep() {
      if (!_.isUndefined(sails.config.solr.clientSleepTimeMillis)) {
        sails.log.verbose(`${this.logHeader} sleeping for: ${sails.config.solr.clientSleepTimeMillis}`);
        return this.sleep(sails.config.solr.clientSleepTimeMillis);
      } else {
        return Promise.resolve();
      }
    }

    public async solrAddOrUpdate(job: QueueJob<RecordModel>) {
      try {
        const data: RecordModel = job.attrs.data as RecordModel;
        const coreId = String(_.get(data, 'metaMetadata.searchCore', 'default'));
        // storage_id is used as the main ID in searches
        const solrDocument: SolrDocument = new SolrDocument(data);
        sails.log.verbose(`${this.logHeader} adding document: ${solrDocument.id} to index`);
        // flatten the JSON
        const processedData = this.preIndex(solrDocument);
        sails.log.verbose(JSON.stringify(processedData));
        await this.clients[coreId].add(processedData);
        // intentionally adding the commit call as the client doesn't respect the 'autoCommit' flag
        await this.clients[coreId].commit();
        await this.clientSleep();

      } catch (err) {
        sails.log.error(`${this.logHeader} Failed to solrAddOrUpdate, while pre-processing index: `);
        sails.log.error(JSON.stringify(err));
      }
    }

    // TODO: This method shouldn't need to be public 
    // but can't unit test it easily if it isn't
    public preIndex(data: SolrDocument): Record<string, unknown> {
      let processedData: Record<string, unknown> = _.cloneDeep(data) as unknown as Record<string, unknown>;

      const coreId = _.get(data, 'metaMetadata.searchCore', 'default');
      const moveObj = _.get(sails.config.solr.cores, coreId + '.preIndex.move') as unknown as PreIndexMoveConfig[];
      // moving
      _.each(moveObj, (moveConfig: PreIndexMoveConfig) => {
        const source: string = moveConfig.source;
        const dest: string = moveConfig.dest ?? '';
        // the data used will always be the original object
        const moveData: unknown = _.get(data, source);
        if (!_.isEmpty(moveData)) {
          _.unset(processedData, source);
          if (_.isEmpty(dest)) {
            // empty destination means the root object
            _.merge(processedData, moveData);
          } else {
            _.set(processedData, dest, moveData);
          }
        } else {
          sails.log.verbose(`${this.logHeader} no data to move from: ${moveConfig.source}, ignoring.`);
        }
      });
      const copyObj = _.get(sails.config.solr.cores, coreId + '.preIndex.copy') as unknown as PreIndexCopyConfig[];
      // copying
      _.each(copyObj, (copyConfig: PreIndexCopyConfig) => {
        _.set(processedData, copyConfig.dest, _.get(data, copyConfig.source));
      });
      const jsonStringObj = _.get(sails.config.solr.cores, coreId + '.preIndex.jsonString') as unknown as PreIndexJsonStringConfig[];
      _.each(jsonStringObj, (jsonStringConfig: PreIndexJsonStringConfig) => {
        let setProperty: string = jsonStringConfig.source;
        if (jsonStringConfig.dest != null) {
          setProperty = jsonStringConfig.dest;
        }
        _.set(processedData, setProperty, JSON.stringify(_.get(data, jsonStringConfig.source, undefined)));
      });
      const templateObj = _.get(sails.config.solr.cores, coreId + '.preIndex.template') as unknown as PreIndexTemplateConfig[];
      //Evaluate a template to generate a value for the solr document
      _.each(templateObj, (templateConfig: PreIndexTemplateConfig) => {
        let setProperty: string = templateConfig.source ?? '';
        if (templateConfig.dest != null) {
          setProperty = templateConfig.dest;
        }

        // If no source property set, use the whole data object
        let templateData: unknown;
        if (templateConfig.source != null) {
          templateData = _.get(data, templateConfig.source)
        } else {
          templateData = _.cloneDeep(data);
        }

        const template = _.template(templateConfig.template)
        _.set(processedData, setProperty, template({ data: templateData }));
      });

      const flattenSpecialObj = _.get(sails.config.solr.cores, coreId + '.preIndex.flatten.special') as unknown as PreIndexFlattenSpecialConfig[];
      // flattening...
      // first remove those with special flattening options
      _.each(flattenSpecialObj, (specialFlattenConfig: PreIndexFlattenSpecialConfig) => {
        _.unset(processedData, specialFlattenConfig.field);
      });
      const flattenOptionsObj = _.get(sails.config.solr.cores, coreId + '.preIndex.flatten.options') as unknown as Record<string, unknown> | undefined;
      const flatModule = flat;
      if (!flatModule) {
        throw new Error('flat module not loaded');
      }
      processedData = flatModule.flatten(processedData, flattenOptionsObj);
      _.each(flattenSpecialObj, (specialFlattenConfig: PreIndexFlattenSpecialConfig) => {
        const dataToFlatten: Record<string, unknown> = {};
        if (specialFlattenConfig.dest) {
          _.set(dataToFlatten, specialFlattenConfig.dest, _.get(data, specialFlattenConfig.source));
        } else {
          _.set(dataToFlatten, specialFlattenConfig.source, _.get(data, specialFlattenConfig.source));
        }
        const flattened = flatModule.flatten(dataToFlatten, specialFlattenConfig.options);
        _.merge(processedData, flattened);
      });

      // sanitise any empty keys so SOLR doesn't complain
      _.forOwn(processedData, (_v: unknown, k: string) => {
        if (_.isEmpty(k)) {
          _.unset(processedData, k);
        }
      });
      return processedData;
    }

    protected luceneEscape(str: string | number | null | undefined) {
      return luceneEscapeQuery(String(str ?? ''));
    }

    protected addAuthFilter(url: string, username: string, roles: RoleModel[], brand: BrandingModel, editAccessOnly: boolean | undefined = undefined) {

      let roleString = ""
      let matched = false;
      for (let i = 0; i < roles.length; i++) {
        const role = roles[i]
        const roleBrandId = (role.branding as BrandingModel | string | undefined);
        if ((typeof roleBrandId === 'object' ? roleBrandId?.id : roleBrandId) == brand.id) {
          if (matched) {
            roleString += " OR ";
            matched = false;
          }
          roleString += roles[i].name;
          matched = true;
        }
      }
      url = url + "&fq=authorization_edit:" + username + (editAccessOnly ? "" : (" OR authorization_view:" + username + " OR authorization_viewRoles:(" + roleString + ")")) + " OR authorization_editRoles:(" + roleString + ")";
      return url;
    }

    public async solrDelete(job: QueueJob<RecordModel>, _done: unknown) {
      try {
        const data = job.attrs.data;
        const coreId = String(_.get(data, 'searchCore', 'default'));
        const solrDocument: SolrDocument = new SolrDocument(data);
        sails.log.verbose(`${this.logHeader} deleting document: ${solrDocument.id}`);
        await this.clients[coreId].delete('id', solrDocument.id);
        // intentionally adding the commit call as the client doesn't respect the 'autoCommit' flag
        await this.clients[coreId].commit();
        await this.clientSleep();
      } catch (err) {
        sails.log.error(`${this.logHeader} Failed to solrDelete:`);
        sails.log.error(JSON.stringify(err));
      }
    }
  }
}

declare global {
  let SolrSearchService: Services.SolrSearchService;
}
