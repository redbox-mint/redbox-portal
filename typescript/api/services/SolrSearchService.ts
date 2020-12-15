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
import services = require('../core/CoreService.js');
import QueueService from '../core/QueueService.js';
import SearchService from '../core/SearchService';
import solr = require('solr-client');
const got = require('got');
const util = require('util');
import {
  Sails
} from "sails";
declare var sails: Sails;
declare var _;
declare var _this;
import * as flat from 'flat';
import * as luceneEscapeQuery from "lucene-escape-query";

declare var RecordsService;

export module Services {
 /**
  * Service class for adding documents to Solr.
  *
  */
 export class SolrSearchService extends services.Services.Core.Service implements SearchService {
      protected _exportedMethods: any = [
       'index',
       'remove',
       'searchFuzzy',
       'solrAddOrUpdate',
       'solrDelete'
      ];

      protected queueService: QueueService;
      private client:any;
      private baseUrl: string;

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

      protected initClient() {
        this.client = solr.createClient(sails.config.solr.options);
        this.client.autoCommit = true;
        this.baseUrl = this.getBaseUrl();
      }

      protected async buildSchema() {
        const coreName = sails.config.solr.options.core;
        // wait for SOLR to start up
        await this.waitForSolr();
        // check if the schema is built....
        try {
          const flagName = sails.config.solr.initSchemaFlag.name;
          const schemaInitFlag = await this.getSchemaEntry(coreName, 'fields', flagName);
          if (!_.isEmpty(schemaInitFlag)) {
            sails.log.verbose(`${this.logHeader} Schema flag found: ${flagName}. Schema is already initialised, skipping build.`);
            return;
          }
        } catch (err) {
          sails.log.verbose(JSON.stringify(err));
        }
        sails.log.verbose(`${this.logHeader} Schema not initialised, building schema...`)
        const schemaUrl = `${this.baseUrl}${coreName}/schema`;
        try {
          const schemaDef = sails.config.solr.schema;
          if (_.isEmpty(schemaDef)) {
            sails.log.verbose(`${this.logHeader} Schema definition empty, skipping build.`);
            return;
          }
          // append the init flag
          if (_.isEmpty(schemaDef['add-field'])) {
            schemaDef['add-field'] = [];
          }
          schemaDef['add-field'].push(sails.config.solr.initSchemaFlag);
          sails.log.verbose(`${this.logHeader} sending schema definition:`);
          sails.log.verbose(JSON.stringify(schemaDef));
          const response = await got.post(schemaUrl, {
            json: schemaDef,
            responseType: 'json'
          }).json();
          sails.log.verbose(`${this.logHeader} Schema build successful, response: `);
          sails.log.verbose(JSON.stringify(response));
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to build SOLR schema:`);
          sails.log.error(JSON.stringify(err));
        }
      }

      private async getSchemaEntry(core: string, fieldName: string, name: string) {
        const schemaResp = await this.getSchema(core);
        return _.find(_.get(schemaResp.schema,fieldName), (schemaDef) => { return schemaDef.name == name });
      }

      private async getSchema(core:string) {
        const schemaUrl = `${this.baseUrl}${core}/schema?wt=json`;
        return await got(schemaUrl).json();
      }

      private async waitForSolr() {
        let solrUp = false;
        let tryCtr = 0;
        const coreName = sails.config.solr.options.core;
        const urlCheck = `${this.baseUrl}admin/cores?action=STATUS&core=${coreName}`;
        while (!solrUp && tryCtr <= sails.config.solr.maxWaitTries) {
          try {
            tryCtr++;
            sails.log.verbose(`${this.logHeader} Checking if SOLR is up, try #${tryCtr}... ${urlCheck}`);
            const solrStat = await got.get(urlCheck).json();
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
            if (tryCtr == sails.config.solr.maxWaitTries)  {
              sails.log.error(`${this.logHeader} SOLR seemed to have failed startup, giving up on waiting.`);
              break;
            }
            await this.sleep(sails.config.solr.waitTime);
          }
        }
      }

      private getBaseUrl(): string {
        return `${sails.config.solr.options.https ? 'https': 'http'}://${sails.config.solr.options.host}:${sails.config.solr.options.port}/solr/`;
      }

      public index(id: string, data: any) {
        sails.log.verbose(`${this.logHeader} adding indexing job: ${id} with data:`);
        // storage_id is used as the main ID in searches
        _.set(data, 'storage_id', id);
        _.set(data, 'id', id);
        sails.log.verbose(JSON.stringify(data));
        this.queueService.now(sails.config.solr.createOrUpdateJobName, data);
      }

      public remove(id: string) {
        sails.log.verbose(`${this.logHeader} adding delete-index job: ${id} with data:`);
        const data = {id: id};
        sails.log.verbose(JSON.stringify(data));
        this.queueService.now(sails.config.solr.deleteJobName, data);
      }

      public async searchFuzzy(type, workflowState, searchQuery, exactSearches, facetSearches, brand, user, roles, returnFields): Promise<any> {
        const username = user.username;
        const coreName = sails.config.solr.options.core;
        // const url = `${this.getSearchTypeUrl(type, searchField, searchStr)}&start=0&rows=${sails.config.record.export.maxRecords}`;
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

        let url = `${this.baseUrl}${coreName}/select?q=metaMetadata_brandId:${brand.id} AND metaMetadata_type:${type}${searchParam}&version=2.2&wt=json&sort=date_object_modified desc`;
        url = this.addAuthFilter(url, username, roles, brand, false)
        sails.log.verbose(`Searching fuzzy using: ${url}`);
        const response = await got(url).json();
        const customResp = {
          records: []
        };
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
        return customResp;
      }

      public async solrAddOrUpdate(job:any) {
        try {
          let data = job.attrs.data;
          sails.log.verbose(`${this.logHeader} adding document: ${data.id} to index`);
          // flatten the JSON
          const processedData = this.preIndex(data);
          sails.log.verbose(JSON.stringify(processedData));
          this.client.add(processedData, (err, obj) => {
            if (err) {
              sails.log.error(`${this.logHeader} Failed to add document: `);
              sails.log.error(err);
              return;
            }
            this.client.commit((commitErr, commitObj) => {
              sails.log.verbose(`${this.logHeader} document added to SOLR: ${data.id}`);
              sails.log.verbose(obj);
            });
          });
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to solrAddOrUpdate, while pre-processing index: `);
          sails.log.error(JSON.stringify(err));
        }
      }

      private preIndex(data: any) {
        let processedData = _.cloneDeep(data);
        // moving
        _.each(sails.config.solr.preIndex.move, (moveConfig) => {
          const source = moveConfig.source;
          const dest = moveConfig.dest;
          // the data used will always be the original object
          const moveData = _.get(data, source);
          if (!_.isEmpty(moveData)) {
            _.unset(processedData, source);
            if (_.isEmpty(dest)) {
              // empty destination means the root object
              _.merge(processedData, moveData);
            } else {
              _.set(processedData, dest);
            }
          } else {
            sails.log.verbose(`${this.logHeader} no data to move from: ${moveConfig.source}, ignoring.`);
          }
        });
        // copying
        _.each(sails.config.solr.preIndex.copy, (copyConfig) => {
          _.set(processedData, copyConfig.dest, _.get(data, copyConfig.source));
        });
        // flattening...
        // first remove those with special flattening options
        _.each(sails.config.solr.preIndex.flatten.special, (specialFlattenConfig) =>  {
          _.unset(processedData, specialFlattenConfig.field);
        });
        processedData = flat.flatten(processedData, sails.config.solr.preIndex.flatten.options);
        _.each(sails.config.solr.preIndex.flatten.special, (specialFlattenConfig) =>  {
          const dataToFlatten = {};
          if (specialFlattenConfig.dest) {
            _.set(dataToFlatten, specialFlattenConfig.dest, _.get(data, specialFlattenConfig.source));
          } else {
            _.set(dataToFlatten, specialFlattenConfig.source, _.get(data, specialFlattenConfig.source));
          }
          let flattened = flat.flatten(dataToFlatten, specialFlattenConfig.options);
          _.merge(processedData, flattened);
        });
        // sanitise any empty keys so SOLR doesn't complain
        _.forOwn(processedData, (v, k) => {
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

      public solrDelete(job:any) {
        try {
          let data = job.attrs.data;
          sails.log.verbose(`${this.logHeader} deleting document: ${data.id}`);
          this.client.delete('id', data.id, (err, obj) => {
            if (err) {
              sails.log.error(`${this.logHeader} Failed to delete document: ${data.id}`);
              sails.log.error(err);
              return;
            }
            this.client.commit((commitErr, commitObj) => {
              sails.log.verbose(`${this.logHeader} document deleted in SOLR: ${data.id}`);
              sails.log.verbose(obj);
            });
          });
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to solrDelete:`);
          sails.log.error(JSON.stringify(err));
        }
      }
   }
}

module.exports = new Services.SolrSearchService().exports();
