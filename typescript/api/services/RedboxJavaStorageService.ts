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
const util = require('util');
import * as request from "request-promise";
import { Observable } from "rxjs";
import moment = require('moment');
import { SequenceEqualOperator } from "rxjs/internal/operators/sequenceEqual";


declare var RecordsService, RecordTypesService;
declare var sails: Sails;
declare var _;

export module Services {
    /**
     * WorkflowSteps related functions...
     *
     * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
     *
     */
    export class RedboxJavaStorage extends services.Services.Core.Service implements StorageService {
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
            'updateNotificationLog'
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

    }
}

module.exports = new Services.RedboxJavaStorage().exports();