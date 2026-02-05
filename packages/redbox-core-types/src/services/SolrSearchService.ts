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
const util = require('util');
const querystring = require('querystring');
let flat: UnsafeAny;
const luceneEscapeQueryModule: UnsafeAny = require("lucene-escape-query");
const luceneEscapeQuery: (value: string) => string =
  typeof luceneEscapeQueryModule === 'function'
    ? luceneEscapeQueryModule
    : (luceneEscapeQueryModule?.escape || luceneEscapeQueryModule?.default);



class SolrClient {
  options: SolrOptions;
  axios: UnsafeAny = axios;
  autoCommit: boolean = true; 
  constructor(options: SolrOptions) {
    this.options = options;
    const baseUrl = `${this.options.https ? 'https' : 'http'}://${this.options.host}:${this.options.port}/solr/${this.options.core}/`;
    this.axios = axios.create({
      baseURL: baseUrl,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  public async add(doc: UnsafeAny): Promise<void> {
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

  public async delete(field: string, value: UnsafeAny): Promise<void> {
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

export module Services {
  /**
   * Service class for adding documents to Solr.
   *
   */
  export class SolrSearchService extends services.Core.Service implements SearchService {
    protected override _exportedMethods: UnsafeAny = [
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
        that.queueService = sails.services[sails.config.queue.serviceName];
        that.initClient();
        await that.buildSchema(that);
      });
    }

    protected override async processDynamicImports() {
      flat = await import("flat");
    }

    protected initClient(ref: SolrSearchService = this) {
      const solrConfig: SolrConfig = sails.config.solr;
      let coreIds: string[] = Object.keys(solrConfig.cores);
      for (let coreId of coreIds) {
        let solrOpts: SolrOptions = solrConfig.cores[coreId].options;
        let client: SolrClient = Solr.createClient(solrOpts);
        ref.clients[coreId] = client;
      }
    }

    protected async buildSchema(ref: SolrSearchService = this) {
      const solrConfig: SolrConfig = sails.config.solr;
      let coreNameKeys: string[] = Object.keys(solrConfig.cores);

      // wait for SOLR deafult core to start up
      await ref.waitForSolr('default');

      for (let coreId of coreNameKeys) {

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
          const response = await axios.post(schemaUrl, schemaDef).then((response: UnsafeAny) => response.data);
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
      return _.find(_.get(schemaResp.schema, fieldName), (schemaDef: UnsafeAny) => { return schemaDef.name == name });
    }

    private async getSchema(coreId: string, ref: SolrSearchService = this) {
      const solrConfig: SolrConfig = sails.config.solr;
      const core: SolrCore = solrConfig.cores[coreId];
      const schemaUrl = `${ref.getBaseUrl(core.options)}${core.options.core}/schema?wt=json`;
      return await axios.get(schemaUrl).then((response: UnsafeAny) => response.data);
    }

    private async waitForSolr(coreId: string, ref: SolrSearchService = this) {
      const solrConfig: SolrConfig = sails.config.solr;
      const core: SolrCore = solrConfig.cores[coreId];
      let coreName: string = core.options.core;
      let solrUp = false;
      let tryCtr = 0;
      const urlCheck = `${ref.getBaseUrl(core.options)}admin/cores?action=STATUS&core=${coreName}`;
      while (!solrUp && tryCtr <= sails.config.solr.maxWaitTries) {
        try {
          tryCtr++;
          sails.log.verbose(`${ref.logHeader} Checking if SOLR is up, try #${tryCtr}... ${urlCheck}`);
          const solrStat = await axios.get(urlCheck).then((response: UnsafeAny) => response.data);
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
    

    public async searchAdvanced(coreId: string = 'default', type: string, query: string): Promise<UnsafeAny> {
      const solrConfig: SolrConfig = sails.config.solr;
      const core: SolrCore = solrConfig.cores[coreId];
      const coreName = core.options.core;
      let url = `${this.getBaseUrl(core.options)}${coreName}/select?q=${query}`;
      sails.log.verbose(`Searching advanced using: ${url}`);
      const response = await axios.get(url).then((response: UnsafeAny) => response.data);
      return response;
    }

    public async searchFuzzy(coreId: string = 'default', type: string, workflowState: string, searchQuery: string, exactSearches: UnsafeAny, facetSearches: UnsafeAny, brand: BrandingModel, user: UserModel, roles: RoleModel[], returnFields: string[], start: number = 0, rows: number = 10): Promise<UnsafeAny> {
      const username = user.username;
      const solrConfig: SolrConfig = sails.config.solr;
      const core: SolrCore = solrConfig.cores[coreId];
      const coreName = core.options.core;
      let searchParam = workflowState ? ` AND workflow_stage:${workflowState} ` : '';
      searchParam = `${searchParam} AND full_text:${searchQuery}`;
      _.forEach(exactSearches, (exactSearch: UnsafeAny) => {
        searchParam = `${searchParam}&fq=${exactSearch.name}:${this.luceneEscape(exactSearch.value)}`
      });
      if (facetSearches.length > 0) {
        searchParam = `${searchParam}&facet=true`
        _.forEach(facetSearches, (facetSearch: UnsafeAny) => {
          searchParam = `${searchParam}&facet.field=${facetSearch.name}${_.isEmpty(facetSearch.value) ? '' : `&fq=${facetSearch.name}:${this.luceneEscape(facetSearch.value)}`}`
        });
      }
      searchParam = `${searchParam}&start=${start}&rows=${rows}`
      let url = `${this.getBaseUrl(core.options)}${coreName}/select?q=metaMetadata_brandId:${brand.id} AND metaMetadata_type:${type}${searchParam}&version=2.2&wt=json&sort=date_object_modified desc`;
      url = this.addAuthFilter(url, username, roles, brand, false);
      sails.log.verbose(`Searching fuzzy using: ${url}`);
      const response = await axios.get(url).then((response: UnsafeAny) => response.data);
      const customResp: UnsafeAny = {
        records: []
      };
      let totalItems = response.response.numFound;

      _.forEach(response.response.docs, (solrdoc: UnsafeAny) => {
        const customDoc: Record<string, unknown> = {};
        _.forEach(returnFields, (retField: string) => {
          if (_.isArray(solrdoc[retField])) {
            customDoc[retField] = solrdoc[retField][0];
          } else {
            customDoc[retField] = solrdoc[retField];
          }
        });
        customDoc["hasEditAccess"] = RecordsService.hasEditAccess(brand, user, roles, solrdoc);
        customResp.records.push(customDoc);
      });
      // check if have facets turned on...
      if (response.facet_counts) {
        customResp['facets'] = [];
        _.forOwn(response.facet_counts.facet_fields, (facet_field: UnsafeAny[], facet_name: string) => {
          const numFacetsValues = _.size(facet_field) / 2;
          const facetValues: Array<{ value: string; count: number }> = [];
          for (let i = 0, j = 0; i < numFacetsValues; i++) {
            facetValues.push({
              value: facet_field[j++],
              count: facet_field[j++]
            });
          }
          customResp['facets'].push({
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

    public async solrAddOrUpdate(job: UnsafeAny) {
      try {
        let data: RecordModel = job.attrs.data;
        let coreId = _.get(data, 'metaMetadata.searchCore', 'default');
        // storage_id is used as the main ID in searches
        let solrDocument: SolrDocument = new SolrDocument(data);
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
    public preIndex(data: SolrDocument): UnsafeAny {
      let processedData: UnsafeAny = _.cloneDeep(data);

      let coreId = _.get(data, 'metaMetadata.searchCore', 'default');
      let moveObj = _.get(sails.config.solr.cores, coreId + '.preIndex.move');
      // moving
      _.each(moveObj, (moveConfig: UnsafeAny) => {
        const source: string = moveConfig.source;
        const dest: string = moveConfig.dest;
        // the data used will always be the original object
        const moveData: UnsafeAny = _.get(data, source);
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
      let copyObj = _.get(sails.config.solr.cores, coreId + '.preIndex.copy');
      // copying
      _.each(copyObj, (copyConfig: UnsafeAny) => {
        _.set(processedData, copyConfig.dest, _.get(data, copyConfig.source));
      });
      let jsonStringObj = _.get(sails.config.solr.cores, coreId + '.preIndex.jsonString');
      _.each(jsonStringObj, (jsonStringConfig: UnsafeAny) => {
        let setProperty: string = jsonStringConfig.source;
        if (jsonStringConfig.dest != null) {
          setProperty = jsonStringConfig.dest;
        }
        _.set(processedData, setProperty, JSON.stringify(_.get(data, jsonStringConfig.source, undefined)));
      });
      let templateObj = _.get(sails.config.solr.cores, coreId + '.preIndex.template');
      //Evaluate a template to generate a value for the solr document
      _.each(templateObj, (templateConfig: UnsafeAny) => {
        let setProperty: string = templateConfig.source;
        if (templateConfig.dest != null) {
          setProperty = templateConfig.dest;
        }

        // If no source property set, use the whole data object
        let templateData: UnsafeAny;
        if (templateConfig.source != null) {
          templateData = _.get(data, templateConfig.source)
        } else {
          templateData = _.cloneDeep(data);
        }

        let template: UnsafeAny = _.template(templateConfig.template)
        _.set(processedData, setProperty, template({ data: templateData }));
      });

      let flattenSpecialObj = _.get(sails.config.solr.cores, coreId + '.preIndex.flatten.special');
      // flattening...
      // first remove those with special flattening options
      _.each(flattenSpecialObj, (specialFlattenConfig: UnsafeAny) => {
        _.unset(processedData, specialFlattenConfig.field);
      });
      let flattenOptionsObj = _.get(sails.config.solr.cores, coreId + '.preIndex.flatten.options');
      processedData = flat.flatten(processedData, flattenOptionsObj);
      _.each(flattenSpecialObj, (specialFlattenConfig: UnsafeAny) => {
        const dataToFlatten: UnsafeAny = {};
        if (specialFlattenConfig.dest) {
          _.set(dataToFlatten, specialFlattenConfig.dest, _.get(data, specialFlattenConfig.source));
        } else {
          _.set(dataToFlatten, specialFlattenConfig.source, _.get(data, specialFlattenConfig.source));
        }
        let flattened: UnsafeAny = flat.flatten(dataToFlatten, specialFlattenConfig.options);
        _.merge(processedData, flattened);
      });

      // sanitise any empty keys so SOLR doesn't complain
      _.forOwn(processedData, (v: UnsafeAny, k: UnsafeAny) => {
        if (_.isEmpty(k)) {
          _.unset(processedData, k);
        }
      });
      return processedData;
    }

    protected luceneEscape(str: string) {
      return luceneEscapeQuery(str);
    }

    protected addAuthFilter(url: string, username: string, roles: RoleModel[], brand: BrandingModel, editAccessOnly: boolean | undefined = undefined) {

      let roleString = ""
      let matched = false;
      for (let i = 0; i < roles.length; i++) {
        const role = roles[i]
        if ((role as UnsafeAny).branding?.id == brand.id || (role as UnsafeAny).branding == brand.id) {
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

    public async solrDelete(job: UnsafeAny, done: UnsafeAny) {
      try {
        let data = job.attrs.data;
        let coreId = _.get(data, 'searchCore', 'default');
        let solrDocument: SolrDocument = new SolrDocument(data);
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
