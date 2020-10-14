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
import {
    Sails,
    Model
} from "sails";
import services = require('../core/CoreService.js');
import StorageService from '../core/StorageService.js';
import RecordsService from '../core/RecordsService.js';
import DatastreamService from '../core/DatastreamService.js';
const util = require('util');
import * as request from "request-promise";
import { Observable } from "rxjs";
import moment = require('moment');
import { SequenceEqualOperator } from "rxjs/internal/operators/sequenceEqual";
import * as fs from 'fs';


declare var RecordsService, RecordTypesService, FormsService;
declare var sails: Sails;
declare var _;

export module Services {
    /**
     * WorkflowSteps related functions...
     *
     * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
     *
     */
    export class RedboxJavaStorage extends services.Services.Core.Service implements StorageService, DatastreamService {
        recordsService: RecordsService = null;

        constructor() {
            super();
            let that = this;
            sails.on('ready', function() {
                that.recordsService = RecordsService;
            });
        }

        protected _exportedMethods: any = [
            'create',
            'updateMeta',
            'getMeta',
            'createBatch',
            'provideUserAccessAndRemovePendingAccess',
            'getRelatedRecords',
            'delete',
            'updateNotificationLog',
            'getRecords',
            'exportAllPlans',
            'addDatastreams',
            'updateDatastream',
            'removeDatastream',
            'addDatastream',
            'addAndRemoveDatastreams',
            'getDatastream',
            'listDatastreams'
        ];

        public async create(brand, record, recordType = null, user = null, triggerPreSaveTriggers = true, triggerPostSaveTriggers = true) {
            let packageType = recordType.packageType;
            let response = await this.createInternal(brand, record, packageType, recordType, user, triggerPreSaveTriggers);
            if (triggerPostSaveTriggers) {
                if (response && `${response.code}` == "200") {
                    response = await this.recordsService.triggerPostSaveSyncTriggers(response['oid'], record, recordType, 'onCreate', user, response);
                }
                if (response && `${response.code}` == "200") {
                    response.success = true;
                    this.recordsService.triggerPostSaveTriggers(response['oid'], record, recordType, 'onCreate', user);
                }
            }
            return response;
        }

        private async createInternal(brand, record, packageType, recordType = null, user = null, triggerPreSaveTriggers = true) {
            // TODO: validate metadata with the form...
            const options = this.getOptions(sails.config.record.baseUrl.redbox + sails.config.record.api.create.url, null, packageType);
            let response = null;
            if (triggerPreSaveTriggers) {
                record = await this.recordsService.triggerPreSaveTriggers(null, record, recordType, "onCreate", user);
            }
            options.body = record;
            sails.log.verbose(util.inspect(options, {
                showHidden: false,
                depth: null
            }));
            response = await request[sails.config.record.api.create.method](options);
            sails.log.verbose(`Create internal response: `);
            sails.log.verbose(JSON.stringify(response));
            return response;
        }

        public updateMeta(brand, oid, record, user = null, triggerPreSaveTriggers = true, triggerPostSaveTriggers = true): Promise < any > {
            if (brand == null) {
                return this.updateMetaInternal(brand, oid, record, null, user, false);

            } else {
                return RecordTypesService.get(brand, record.metaMetadata.type).flatMap(async (recordType) => {
                    let response = await this.updateMetaInternal(brand, oid, record, recordType, user, triggerPreSaveTriggers)
                    if (triggerPostSaveTriggers) {
                        if (response && `${response.code}` == "200") {
                            response = this.recordsService.triggerPostSaveSyncTriggers(oid, record, recordType, 'onUpdate', user, response);
                        }
                        if (response && `${response.code}` == "200") {
                            response.success = true;
                            this.recordsService.triggerPostSaveTriggers(oid, record, recordType, 'onUpdate', user);
                        }
                    } else {
                        response.success = true;
                    }
                    return response;
                });
            }
        }


        private async updateMetaInternal(brand, oid, record, recordType, user = null, triggerPreSaveTriggers = true) {
            // TODO: validate metadata with the form...
            const options = this.getOptions(sails.config.record.baseUrl.redbox + sails.config.record.api.updateMeta.url, oid);

            if (triggerPreSaveTriggers) {
                record = await this.recordsService.triggerPreSaveTriggers(oid, record, recordType, "onUpdate", user);
                options.body = record;
                return await request[sails.config.record.api.updateMeta.method](options);
            } else {
                options.body = record;
                sails.log.verbose(util.inspect(options, {
                    showHidden: false,
                    depth: null
                }));
                return await request[sails.config.record.api.updateMeta.method](options);
            }
        }

        public getMeta(oid): Promise < any > {
            const options = this.getOptions(sails.config.record.baseUrl.redbox + sails.config.record.api.getMeta.url, oid);
            return request[sails.config.record.api.getMeta.method](options);
        }

        public createBatch(type, data, harvestIdFldName): Promise < any > {
            const options = this.getOptions(sails.config.record.baseUrl.redbox + sails.config.record.api.harvest.url, null, type);
            data = _.map(data, dataItem => {
                return {
                    harvest_id: _.get(dataItem, harvestIdFldName, ''),
                    metadata: {
                        metadata: dataItem,
                        metaMetadata: {
                            type: type
                        }
                    }
                };
            });
            options.body = {
                records: data
            };
            sails.log.verbose(`Sending data:`);
            sails.log.verbose(options.body);
            return request[sails.config.record.api.harvest.method](options);
        }

        public provideUserAccessAndRemovePendingAccess(oid, userid, pendingValue) {
            var metadataResponse = this.getMeta(oid);

            Observable.fromPromise(metadataResponse).subscribe(metadata => {
                // remove pending edit access and add real edit access with userid
                var pendingEditArray = metadata['authorization']['editPending'];
                var editArray = metadata['authorization']['edit'];
                for (var i = 0; i < pendingEditArray.length; i++) {
                    if (pendingEditArray[i] == pendingValue) {
                        pendingEditArray = pendingEditArray.filter(e => e !== pendingValue);
                        editArray = editArray.filter(e => e !== userid);
                        editArray.push(userid);
                    }
                }
                metadata['authorization']['editPending'] = pendingEditArray;
                metadata['authorization']['edit'] = editArray;

                var pendingViewArray = metadata['authorization']['viewPending'];
                var viewArray = metadata['authorization']['view'];
                for (var i = 0; i < pendingViewArray.length; i++) {
                    if (pendingViewArray[i] == pendingValue) {
                        pendingViewArray = pendingViewArray.filter(e => e !== pendingValue);
                        viewArray = viewArray.filter(e => e !== userid);
                        viewArray.push(userid);
                    }
                }
                metadata['authorization']['viewPending'] = pendingViewArray;
                metadata['authorization']['view'] = viewArray;

                this.updateMeta(null, oid, metadata);
            }, (error: any) => {
                // swallow !!!!
                sails.log.warn(`Failed to provide access to OID: ${oid}`);
                sails.log.warn(error);
            });

        }

        public async getRelatedRecords(oid, brand) {
            let record = await this.getMeta(oid);

            let recordTypeName = record['metaMetadata']['type'];
            let recordType = await RecordTypesService.get(brand, recordTypeName).toPromise();

            let mappingContext = {
                'processedRelationships': [],
                'relatedObjects': {}
            };
            let relationships = [];
            let processedRelationships = [];
            processedRelationships.push(recordType.name);
            let relatedTo = recordType['relatedTo'];
            if (_.isArray(relatedTo)) {
                _.each(relatedTo, relatedObject => {
                    relationships.push({
                        collection: relatedObject['recordType'],
                        foreignField: relatedObject['foreignField'],
                        localField: relatedObject['localField']
                    });
                });

                const options = this.getOptions(sails.config.record.baseUrl.redbox + sails.config.record.api.getRecordRelationships.url, oid);
                options.body = {
                    oid: oid,
                    relationships: relationships
                };
                let relatedRecords = await request[sails.config.record.api.updateMeta.method](options);

                for (let i = 0; i < relationships.length; i++) {
                    let relationship = relationships[i];
                    let collectionName = relationship['collection'];
                    let recordRelationships = relatedRecords[collectionName];

                    let newRelatedObjects = {};
                    mappingContext['processedRelationships'].push(collectionName);
                    newRelatedObjects[collectionName] = recordRelationships;
                    _.merge(mappingContext, {
                        relatedObjects: newRelatedObjects
                    });
                    for (let j = 0; j < recordRelationships.length; j++) {
                        let recordRelationship = recordRelationships[j];
                        mappingContext = await this.getRelatedRecordsInternal(recordRelationship.redboxOid, collectionName, brand, mappingContext);
                    }
                }

                return mappingContext;
            } else {
                return {};
            }
        }

        private async getRelatedRecordsInternal(oid, recordTypeName, brand, mappingContext) {
            sails.log.debug("Getting related Records for oid: " + oid);
            let record = await this.getMeta(oid);

            let recordType = await RecordTypesService.get(brand, recordTypeName).toPromise();

            let relationships = [];
            let processedRelationships = [];
            processedRelationships.push(recordType.name);
            let relatedTo = recordType['relatedTo'];
            if (_.isArray(relatedTo)) {
                _.each(relatedTo, relatedObject => {
                    relationships.push({
                        collection: relatedObject['recordType'],
                        foreignField: relatedObject['foreignField'],
                        localField: relatedObject['localField']
                    });
                });

                const options = this.getOptions(sails.config.record.baseUrl.redbox + sails.config.record.api.getRecordRelationships.url, oid);
                options.body = {
                    oid: oid,
                    relationships: relationships
                };
                let relatedRecords = await request[sails.config.record.api.updateMeta.method](options);

                for (let i = 0; i < relationships.length; i++) {
                    let relationship = relationships[i];
                    let collectionName = relationship['collection'];
                    let recordRelationships = relatedRecords[collectionName];

                    let newRelatedObjects = {};
                    newRelatedObjects[collectionName] = recordRelationships;
                    _.merge(mappingContext, {
                        relatedObjects: newRelatedObjects
                    });
                    if (_.indexOf(mappingContext['processedRelationships'], collectionName) < 0) {
                        mappingContext['processedRelationships'].push(collectionName);
                        for (let j = 0; j < recordRelationships.length; j++) {
                            let recordRelationship = recordRelationships[j];
                            mappingContext = await this.getRelatedRecordsInternal(recordRelationship.redboxOid, collectionName, brand, mappingContext);
                        }
                    }
                }

            }
            return mappingContext;
        }

        public delete(oid): Promise < any > {
            const options = this.getOptions(sails.config.record.baseUrl.redbox + sails.config.record.api.delete.url, oid);
            return request[sails.config.record.api.delete.method](options);
        }

        updateNotificationLog(oid, record, options): Promise<any> {
            if (this.metTriggerCondition(oid, record, options) == "true") {
              sails.log.verbose(`Updating notification log for oid: ${oid}`);
              const logName = _.get(options, 'logName', null);
              if (logName) {
                let log = _.get(record, logName, null);
                const entry = { date: moment().format('YYYY-MM-DDTHH:mm:ss') };
                if (log) {
                  log.push(entry);
                } else {
                  log = [entry];
                }
                _.set(record, logName, log);
              }
              const updateFlagName = _.get(options, 'flagName', null);
              if (updateFlagName) {
                _.set(record, updateFlagName, _.get(options, 'flagVal', null));
              }
              sails.log.verbose(`======== Notification log updates =========`);
              sails.log.verbose(JSON.stringify(record));
              sails.log.verbose(`======== End update =========`);
              // ready to update
              if (_.get(options, "saveRecord", false)) {
                const updateOptions = this.getOptions(sails.config.record.baseUrl.redbox + sails.config.record.api.updateMeta.url, oid);
                updateOptions.body = record;
                return Observable.fromPromise(request[sails.config.record.api.updateMeta.method](updateOptions))
                  .flatMap(resp => {
                    let response: any = resp;
                    if (response && response.code != "200") {
                      sails.log.error(`Error updating notification log: ${oid}`);
                      sails.log.error(JSON.stringify(response));
                      return Observable.throw(new Error('Failed to update notification log'));
                    }
                    return Observable.of(record);
                  }).toPromise();
              }
            } else {
              sails.log.verbose(`Notification log name: '${options.name}', for oid: ${oid}, not running, condition not met: ${options.triggerCondition}`);
              sails.log.verbose(JSON.stringify(record));
            }
            // no updates or condition not met ... just return the record
            return Observable.of(record).toPromise();
          }

        protected getOptions(url, oid = null, packageType = null, isJson: boolean = true) {
            if (!_.isEmpty(oid)) {
                url = url.replace('$oid', oid);
            }
            if (!_.isEmpty(packageType)) {
                url = url.replace('$packageType', packageType);
            }
            const opts: any = {
                url: url,
                headers: {
                    'Authorization': `Bearer ${sails.config.redbox.apiKey}`
                }
            };
            if (isJson == true) {
                opts.json = true;
                opts.headers['Content-Type'] = 'application/json; charset=utf-8';
            } else {
                opts.encoding = null;
            }
            return opts;
        }

        public getRecords(workflowState, recordType = undefined, start, rows = 10, username, roles, brand, editAccessOnly = undefined, packageType = undefined, sort=undefined) {

          var url = sails.config.record.baseUrl.redbox + sails.config.record.api.query.url + "?collection=metadataDocuments";
          url = this.addPaginationParams(url, start, rows);
          if(sort) {
            url = url+`&sort=${sort}`
          }

          let roleNames = this.getRoleNames(roles, brand);
          let andArray = [];
          let permissions = {
            "$or": [{ "authorization.view": username },
            { "authorization.edit": username },
            { "authorization.editRoles": { "$in": roleNames } },
            { "authorization.viewRoles": { "$in": roleNames } }]
          };
          andArray.push(permissions);
          if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
            let typeArray = [];
            _.each(recordType, rType => {
              typeArray.push({ "metaMetadata.type": rType });
            });
            let types = { "$or": typeArray };
            andArray.push(types);
          }
          if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
            let typeArray = [];
            _.each(packageType, rType => {
              typeArray.push({ "packageType": rType });
            });
            let types = { "$or": typeArray };
            andArray.push(types);
          }

          let query = {
            "metaMetadata.brandId": brand.id,
            "$and":andArray,
          };

          if (workflowState != undefined) {
            query["workflow.stage"] = workflowState;
          }

          sails.log.verbose(JSON.stringify(query));
          var options = this.getOptions(url);
          options['body'] = query;

          return request[sails.config.record.api.query.method](options);
        }

        protected addQueryParams(url, workflowState) {
          url = url + "?q=metaMetadata_type:rdmp AND workflow_stage:" + workflowState + "&sort=date_object_modified desc&version=2.2"
          return url;
        }

        protected addPaginationParams(url, start, rows) {
          url = url + "&start=" + start + "&rows=" + rows + "&wt=json";
          return url;
        }

        protected getRoleNames(roles, brand) {
          var roleNames = [];

          for (var i = 0; i < roles.length; i++) {
            var role = roles[i]
            if (role.branding == brand.id) {
              roleNames.push(roles[i].name);
            }
          }

          return roleNames;
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

        exportAllPlans(username, roles, brand, format, modBefore, modAfter, recType) {
          const dateQ = modBefore || modAfter ? ` AND date_object_modified:[${modAfter ? `${modAfter}T00:00:00Z` : '*'} TO ${modBefore ? `${modBefore}T23:59:59Z` : '*'}]` : '';
          var url = sails.config.record.baseUrl.redbox;
          url = `${url}${sails.config.record.api.search.url}?q=metaMetadata_type:${recType}${dateQ}&sort=date_object_modified desc&version=2.2&wt=${format}`;
          url = `${url}&start=0&rows=${sails.config.record.export.maxRecords}`;
          url = this.addAuthFilter(url, username, roles, brand)
          url = url + "&fq=metaMetadata_brandId:" + brand.id
          var options = this.getOptions(url);
          sails.log.verbose("Query URL is: " + url);
          return request[sails.config.record.api.search.method](options);
        }

        public addDatastream(oid, fileId) {
          const apiConfig = sails.config.record.api.addDatastream;
          const opts = this.getOptions(`${sails.config.record.baseUrl.redbox}${apiConfig.url}`, oid);
          opts.url = `${opts.url}?skipReindex=true&datastreamId=${fileId}`;
          const fpath = `${sails.config.record.attachments.stageDir}/${fileId}`;
          opts['formData'] = {
            content: fs.createReadStream(fpath)
          };
          return request[apiConfig.method](opts);
        }

        public getDatastream(oid, fileId) {
          const apiConfig = sails.config.record.api.getDatastream;
          const opts: any = this.getOptions(`${sails.config.record.baseUrl.redbox}${apiConfig.url}`, oid, null, false);
          opts.url = `${opts.url}?datastreamId=${fileId}`;
          opts.headers['Content-Type'] = 'application/octet-stream';
          opts.headers['accept'] = 'application/octet-stream';
          opts.resolveWithFullResponse = true;
          opts.timeout = apiConfig.readTimeout;
          sails.log.verbose(`Getting datastream using: `);
          sails.log.verbose(JSON.stringify(opts));
          return Observable.fromPromise(request[apiConfig.method](opts));
        }

        public addAndRemoveDatastreams(oid, addIds: any[], removeIds: any[]) {
          const apiConfig = sails.config.record.api.addAndRemoveDatastreams;
          const opts = this.getOptions(`${sails.config.record.baseUrl.redbox}${apiConfig.url}`, oid);
          opts.url = `${opts.url}?skipReindex=false`;
          if (!_.isEmpty(removeIds)) {
            const removeDataStreamIds = removeIds.join(',');
            opts.url = `${opts.url}&removePayloadIds=${removeDataStreamIds}`;
          }
          if (!_.isEmpty(addIds)) {
            const formData = {};
            _.each(addIds, fileId => {
              const fpath = `${sails.config.record.attachments.stageDir}/${fileId}`;
              formData[fileId] = fs.createReadStream(fpath);
            });
            opts['formData'] = formData;
            opts.json = false;
            opts.headers['Content-Type'] = 'application/octet-stream';
          }
          if (_.size(addIds) > 0 || _.size(removeIds) > 0) {
            return request[apiConfig.method](opts);
          }
        }

        public addDatastreams(oid, fileIds: any[]) {
          const apiConfig = sails.config.record.api.addDatastreams;
          const opts = this.getOptions(`${sails.config.record.baseUrl.redbox}${apiConfig.url}`, oid);
          opts.url = `${opts.url}?skipReindex=false&datastreamIds=${fileIds.join(',')}`;
          const formData = {};
          _.each(fileIds, fileId => {
            const fpath = `${sails.config.record.attachments.stageDir}/${fileId}`;
            formData[fileId] = fs.createReadStream(fpath);
          });
          opts['formData'] = formData;

          return request[apiConfig.method](opts);
        }

        /**
         * Compares existing record metadata with new metadata and either removes or deletes the datastream from the record
         */
        public updateDatastream(oid, record, newMetadata, fileRoot, fileIdsAdded) {
          // loop thru the attachment fields and determine if we need to add or remove
          return FormsService.getFormByName(record.metaMetadata.form, true).flatMap(form => {
            const reqs = [];
            record.metaMetadata.attachmentFields = form.attachmentFields;
            _.each(form.attachmentFields, (attField) => {
              const oldAttachments = record.metadata[attField];
              const newAttachments = newMetadata[attField];
              const removeIds = [];
              // process removals
              if (!_.isUndefined(oldAttachments) && !_.isNull(oldAttachments) && !_.isNull(newAttachments)) {
                const toRemove = _.differenceBy(oldAttachments, newAttachments, 'fileId');
                _.each(toRemove, (removeAtt) => {
                  if (removeAtt.type == 'attachment') {
                    removeIds.push(removeAtt.fileId);
                  }
                });
              }
              // process additions
              if (!_.isUndefined(newAttachments) && !_.isNull(newAttachments)) {
                const toAdd = _.differenceBy(newAttachments, oldAttachments, 'fileId');
                _.each(toAdd, (addAtt) => {
                  if (addAtt.type == 'attachment') {
                    fileIdsAdded.push(addAtt.fileId);
                  }
                });
              }
              const req = this.addAndRemoveDatastreams(oid, fileIdsAdded, removeIds);
              if (req) {
                reqs.push(req);
              }
            });
            if (!_.isEmpty(reqs)) {
              return Observable.of(reqs);
            } else {
              return Observable.of(null);
            }
          });
        }

        public removeDatastream(oid, fileId) {
          const apiConfig = sails.config.record.api.removeDatastream;
          const opts = this.getOptions(`${sails.config.record.baseUrl.redbox}${apiConfig.url}`, oid);
          opts.url = `${opts.url}?skipReindex=true&datastreamId=${fileId}`;
          return request[apiConfig.method](opts);
        }

        public listDatastreams(oid, fileId) {
          const apiConfig = sails.config.record.api.listDatastreams;
          const opts: any = this.getOptions(`${sails.config.record.baseUrl.redbox}${apiConfig.url}`, oid);

          return Observable.fromPromise(request[apiConfig.method](opts));
        }

    }
}

module.exports = new Services.RedboxJavaStorage().exports();
