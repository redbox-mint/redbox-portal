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

declare var module;
import {QueueService, SearchService, SolrConfig, SolrCore, SolrOptions, BrandingModel, UserModel, RoleModel, RecordModel, SolrDocument, Services as services}   from '@researchdatabox/redbox-core-types';

import { default as solr } from 'solr-client';
const axios = require('axios');
const util = require('util');
const querystring = require('querystring');
import {
  Sails
} from "sails";
declare var sails: Sails;
declare var _;
declare var _this;
let flat;
import * as luceneEscapeQuery from "lucene-escape-query";

declare var RecordsService;

export module Services {
  /**
   * Service class for adding documents to Solr.
   *
   */
  export class SolrSearchService extends services.Core.Service implements SearchService {
    protected _exportedMethods: any = [
      'index',
      'remove',
      'searchFuzzy',
      'solrAddOrUpdate',
      'solrDelete',
      'searchAdvanced',
      'preIndex'
    ]

    protected queueService: QueueService;
    private clients: {
      [key :string]: any;
    } = {};

    constructor() {
      super();
      let that = this;
      this.logHeader = "SolrIndexer::";
      sails.on('ready', async function () {
        that.queueService = sails.services[sails.config.queue.serviceName];
        that.initClient();
        await that.buildSchema();
      });
    }

    protected async processDynamicImports() {
      flat = await import("flat");
    }

    protected initClient() {
      const solrConfig:SolrConfig = sails.config.solr;
      let coreIds:string[] = Object.keys(solrConfig.cores);
      for(let coreId of coreIds) {
        let solrOpts:SolrOptions = solrConfig.cores[coreId].options;
        let client:any = solr.createClient(solrOpts);
        client.autoCommit = true;
        client.promiseAdd = util.promisify(client.add);
        client.promiseDelete = util.promisify(client.delete);
        client.promiseCommit = util.promisify(client.commit);
        this.clients[coreId]= client;
      }
    }

    protected async buildSchema() {
      const solrConfig:SolrConfig = sails.config.solr;
      let coreNameKeys:string[] = Object.keys(solrConfig.cores);

      // wait for SOLR deafult core to start up
      await this.waitForSolr('default');

      for(let coreId of coreNameKeys) {

        const core:SolrCore = solrConfig.cores[coreId];
        const coreName = core.options.core;

        if(coreId != 'default') {
          await this.waitForSolr(coreId);
        }

        // check if the schema is built....
        try {
          const flagName:string = core.initSchemaFlag.name;
          const schemaInitFlag = await this.getSchemaEntry(coreId, 'fields', flagName);
          if (!_.isEmpty(schemaInitFlag)) {
            sails.log.verbose(`${this.logHeader} Schema flag found: ${flagName}. Schema is already initialised, skipping build.`);
            continue;
          }
        } catch (err) {
          sails.log.verbose(JSON.stringify(err));
        }
        sails.log.verbose(`${this.logHeader} Schema not initialised, building schema...`)
        const schemaUrl = `${this.getBaseUrl(core.options)}${coreName}/schema`;
        try {
          const schemaDef = _.get(sails.config.solr.cores,coreId+'.schema');
          if (_.isEmpty(schemaDef)) {
            sails.log.verbose(`${this.logHeader} Schema definition empty, skipping build.`);
            continue;
          }
          // append the init flag
          if (_.isEmpty(schemaDef['add-field'])) {
            schemaDef['add-field'] = [];
          }
          schemaDef['add-field'].push(_.get(sails.config.solr.cores,coreId+'.initSchemaFlag'));
          sails.log.verbose(`${this.logHeader} sending schema definition:`);
          sails.log.verbose(JSON.stringify(schemaDef));
          const response = await axios.post(schemaUrl,schemaDef).then(response => response.data);
          sails.log.verbose(`${this.logHeader} Schema build successful, response: `);
          sails.log.verbose(JSON.stringify(response));
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to build SOLR schema:`);
          sails.log.error(JSON.stringify(err));
        }
      }
    }

    private async getSchemaEntry(coreId: string, fieldName: string, name: string) {
      const schemaResp = await this.getSchema(coreId);
      return _.find(_.get(schemaResp.schema, fieldName), (schemaDef) => { return schemaDef.name == name });
    }

    private async getSchema(coreId: string) {
      const solrConfig:SolrConfig = sails.config.solr;
      const core:SolrCore = solrConfig.cores[coreId];
      const schemaUrl = `${this.getBaseUrl(core.options)}${core.options.core}/schema?wt=json`;
      return await axios.get(schemaUrl).then(response => response.data);
    }

    private async waitForSolr(coreId: string) {
      const solrConfig:SolrConfig = sails.config.solr;
      const core:SolrCore = solrConfig.cores[coreId];
      let coreName:string = core.options.core;
      let solrUp = false;
      let tryCtr = 0;
      const urlCheck = `${this.getBaseUrl(core.options)}admin/cores?action=STATUS&core=${coreName}`;
      while (!solrUp && tryCtr <= sails.config.solr.maxWaitTries) {
        try {
          tryCtr++;
          sails.log.verbose(`${this.logHeader} Checking if SOLR is up, try #${tryCtr}... ${urlCheck}`);
          const solrStat = await axios.get(urlCheck).then(response => response.data);
          sails.log.verbose(`${this.logHeader} Response is:`);
          sails.log.verbose(JSON.stringify(solrStat));
          if (solrStat.status[coreName].instanceDir) {
            sails.log.info(`${this.logHeader} SOLR core is available: ${coreName}`);
            solrUp = true;
          } else {
            throw new Error(`SOLR core: ${coreName} is still loading.`);
          }
        } catch (err) {
          sails.log.info(`${this.logHeader} SOLR core: ${coreName} is still down, waiting.`);
          sails.log.info(JSON.stringify(err));
          if (tryCtr == sails.config.solr.maxWaitTries) {
            sails.log.error(`${this.logHeader} SOLR seemed to have failed startup, giving up on waiting.`);
            break;
          }
          await this.sleep(sails.config.solr.waitTime);
        }
      }
    }

    private getBaseUrl(coreOptions:SolrOptions): string {
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

    public async searchAdvanced(coreId:string = 'default', type: string, query: string): Promise<any> {
      const solrConfig:SolrConfig = sails.config.solr;
      const core:SolrCore = solrConfig.cores[coreId];
      const coreName = core.options.core;
      let url = `${this.getBaseUrl(core.options)}${coreName}/select?q=${query}`;
      sails.log.verbose(`Searching advanced using: ${url}`);
      const response = await axios.get(url).then(response => response.data);
      return response;
    }

    public async searchFuzzy(coreId:string = 'default', type: string, workflowState: string, searchQuery: string, exactSearches: any, facetSearches: any, brand: BrandingModel, user: UserModel, roles: RoleModel[], returnFields: string[], start:number=0, rows:number=10): Promise<any> {
      const username = user.username;
      const solrConfig:SolrConfig = sails.config.solr;
      const core:SolrCore = solrConfig.cores[coreId];
      const coreName = core.options.core;
      let searchParam = workflowState ? ` AND workflow_stage:${workflowState} ` : '';
      searchParam = `${searchParam} AND full_text:${searchQuery}`;
      _.forEach(exactSearches, (exactSearch) => {
        searchParam = `${searchParam}&fq=${exactSearch.name}:${this.luceneEscape(exactSearch.value)}`
      });
      if (facetSearches.length > 0) {
        searchParam = `${searchParam}&facet=true`
        _.forEach(facetSearches, (facetSearch) => {
          searchParam = `${searchParam}&facet.field=${facetSearch.name}${_.isEmpty(facetSearch.value) ? '' : `&fq=${facetSearch.name}:${this.luceneEscape(facetSearch.value)}`}`
        });
      }
      searchParam= `${searchParam}&start=${start}&rows=${rows}`
      let url = `${this.getBaseUrl(core.options)}${coreName}/select?q=metaMetadata_brandId:${brand.id} AND metaMetadata_type:${type}${searchParam}&version=2.2&wt=json&sort=date_object_modified desc`;
      url = this.addAuthFilter(url, username, roles, brand, false);
      sails.log.verbose(`Searching fuzzy using: ${url}`);
      const response = await axios.get(url).then(response => response.data);
      const customResp = {
        records: []
      };
      let totalItems = response.response.numFound;
      
      _.forEach(response.response.docs, solrdoc => {
        const customDoc = {};
        _.forEach(returnFields, retField => {
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
        _.forOwn(response.facet_counts.facet_fields, (facet_field, facet_name) => {
          const numFacetsValues = _.size(facet_field) / 2;
          const facetValues = [];
          for (var i = 0, j = 0; i < numFacetsValues; i++) {
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

    public async solrAddOrUpdate(job: any) {
      try {
        let data:RecordModel = job.attrs.data;
        let coreId = _.get(data,'metaMetadata.searchCore');
        // storage_id is used as the main ID in searches
        let solrDocument:SolrDocument = new SolrDocument(data);
        sails.log.verbose(`${this.logHeader} adding document: ${solrDocument.id} to index`);
        // flatten the JSON
        const processedData = this.preIndex(solrDocument);
        sails.log.verbose(JSON.stringify(processedData));
        await this.clients[coreId].promiseAdd(processedData);
        // intentionally adding the commit call as the client doesn't respect the 'autoCommit' flag
        await this.clients[coreId].promiseCommit();
        await this.clientSleep();

      } catch (err) {
        sails.log.error(`${this.logHeader} Failed to solrAddOrUpdate, while pre-processing index: `);
        sails.log.error(JSON.stringify(err));
      }
    }

    // TODO: This method shouldn't need to be public 
    // but can't unit test it easily if it isn't
    public preIndex(data: SolrDocument): any {
      let processedData:any = _.cloneDeep(data);
      
      let coreId = _.get(data,'metaMetadata.searchCore');
      let moveObj = _.get(sails.config.solr.cores,coreId+'.preIndex.move');
      // moving
      _.each(moveObj, (moveConfig:any) => {
        const source:string = moveConfig.source;
        const dest:string = moveConfig.dest;
        // the data used will always be the original object
        const moveData:any = _.get(data, source);
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
      let copyObj = _.get(sails.config.solr.cores,coreId+'.preIndex.copy');
      // copying
      _.each(copyObj, (copyConfig:any) => {
        _.set(processedData, copyConfig.dest, _.get(data, copyConfig.source));
      });
      let jsonStringObj = _.get(sails.config.solr.cores,coreId+'.preIndex.jsonString');
      _.each(jsonStringObj, (jsonStringConfig:any) => {
        let setProperty:string = jsonStringConfig.source;
        if (jsonStringConfig.dest != null) {
          setProperty = jsonStringConfig.dest;
        }
          _.set(processedData, setProperty, JSON.stringify(_.get(data, jsonStringConfig.source, undefined)));
      });
      let templateObj = _.get(sails.config.solr.cores,coreId+'.preIndex.template');
      //Evaluate a template to generate a value for the solr document
      _.each(templateObj, (templateConfig:any) => {
        let setProperty:string = templateConfig.source;
        if (templateConfig.dest != null) {
          setProperty = templateConfig.dest;
        }

        // If no source property set, use the whole data object
        let templateData:any;
        if(templateConfig.source != null) {
          templateData = _.get(data, templateConfig.source)
        } else {
          templateData = _.cloneDeep(data);
        }

        let template:any = _.template(templateConfig.template)
        _.set(processedData, setProperty, template({data: templateData}) );
      });

      let flattenSpecialObj = _.get(sails.config.solr.cores,coreId+'.preIndex.flatten.special');
      // flattening...
      // first remove those with special flattening options
      _.each(flattenSpecialObj, (specialFlattenConfig:any) => {
        _.unset(processedData, specialFlattenConfig.field);
      });
      let flattenOptionsObj = _.get(sails.config.solr.cores,coreId+'.preIndex.flatten.options');
      processedData = flat.flatten(processedData, flattenOptionsObj);
      _.each(flattenSpecialObj, (specialFlattenConfig:any) => {
        const dataToFlatten:any = {};
        if (specialFlattenConfig.dest) {
          _.set(dataToFlatten, specialFlattenConfig.dest, _.get(data, specialFlattenConfig.source));
        } else {
          _.set(dataToFlatten, specialFlattenConfig.source, _.get(data, specialFlattenConfig.source));
        }
        let flattened:any = flat.flatten(dataToFlatten, specialFlattenConfig.options);
        _.merge(processedData, flattened);
      });

      // sanitise any empty keys so SOLR doesn't complain
      _.forOwn(processedData, (v:any, k:any) => {
        if (_.isEmpty(k)) {
          _.unset(processedData, k);
        }
      });
      return processedData;
    }

    protected luceneEscape(str: string) {
      return luceneEscapeQuery.escape(str);
    }

    protected addAuthFilter(url, username, roles, brand, editAccessOnly = undefined) {

      var roleString = ""
      var matched = false;
      for (var i = 0; i < roles.length; i++) {
        var role = roles[i]
        if (role.branding == brand.id) {
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

    public async solrDelete(job: any, done:any) {
      try {
        let data = job.attrs.data;
        let coreId = _.get(data,'metaMetadata.searchCore');
        let solrDocument:SolrDocument = new SolrDocument(data);
        sails.log.verbose(`${this.logHeader} deleting document: ${solrDocument.id}`);
        await this.clients[coreId].promiseDelete('id', solrDocument.id);
        // intentionally adding the commit call as the client doesn't respect the 'autoCommit' flag
        await this.clients[coreId].promiseCommit();
        await this.clientSleep();
      } catch (err) {
        sails.log.error(`${this.logHeader} Failed to solrDelete:`);
        sails.log.error(JSON.stringify(err));
      }
    }
  }
}

module.exports = new Services.SolrSearchService().exports();
