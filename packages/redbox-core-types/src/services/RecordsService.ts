// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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
  Observable, of, from, mergeMap as flatMap, firstValueFrom, throwError
} from 'rxjs';
import { concatMap, last, catchError } from 'rxjs/operators';

import { DatastreamService } from '../DatastreamService';
import { QueueService } from '../QueueService';
import { RecordAuditModel, RecordAuditActionType } from '../model/storage/RecordAuditModel';
import { RecordsService } from '../RecordsService';
import { SearchService } from '../SearchService';
import { Services as services } from '../CoreService';
import { StorageService } from '../StorageService';
import { StorageServiceResponse } from '../StorageServiceResponse';
import { RecordAuditParams } from '../RecordAuditParams';
import { RBValidationError } from '../model/RBValidationError';
import { ErrorResponseItemV2 } from '../model/api/APIResponseVersion2';

import axios from 'axios';
const luceneEscapeQueryModule: any = require("lucene-escape-query");
const luceneEscapeQuery: (value: string) => string =
  typeof luceneEscapeQueryModule === 'function'
    ? luceneEscapeQueryModule
    : (luceneEscapeQueryModule?.escape || luceneEscapeQueryModule?.default);
import * as fs from 'fs';
import { DateTime } from 'luxon';

import {
  isObservable
} from 'rxjs';

import {
  Readable
} from 'stream';



const util = require('util');

declare var sails: any;
declare var _: any;
declare var _this: any;
declare var RedboxJavaStorageService: StorageService & DatastreamService;

export module Services {
  /**
   * Records related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Records extends services.Core.Service implements RecordsService {

    storageService!: StorageService;
    datastreamService!: DatastreamService;

    searchService!: SearchService;
    protected queueService!: QueueService;


    constructor() {
      super();
      this.logHeader = "RecordsService::";

    }

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    public override init() {
      const that = this;
      this.registerSailsHook('after', ['hook:redbox:storage:ready', 'hook:redbox:datastream:ready', 'ready'], function () {
        that.getStorageService(that);
        that.getDatastreamService(that);
        that.searchService = sails.services[sails.config.search.serviceName];
        that.queueService = sails.services[sails.config.queue.serviceName];
      });
    }

    getStorageService(ref: Records = this) {
      if (_.isEmpty(sails.config.storage) || _.isEmpty(sails.config.storage.serviceName)) {
        ref.storageService = RedboxJavaStorageService;
      } else {
        ref.storageService = sails.services[sails.config.storage.serviceName];
      }
    }

    getDatastreamService(ref: Records = this) {
      if (_.isEmpty(sails.config.record) || _.isEmpty(sails.config.record.datastreamService)) {
        ref.datastreamService = RedboxJavaStorageService;
      } else {
        const datastreamServiceName = sails.config.record.datastreamService as string;
        ref.datastreamService = sails.services[datastreamServiceName];
        sails.log.verbose(`${ref.logHeader} Using datastreamService: ${datastreamServiceName}`);
      }
    }

    getSearchService() {
      if (_.isEmpty(sails.config.storage) || _.isEmpty(sails.config.search.serviceName)) {
        this.searchService = SolrSearchService;
      } else {
        this.searchService = sails.services[sails.config.search.serviceName];
      }
    }

    protected override _exportedMethods: any = [
      'create',
      'updateMeta',
      'getMeta',
      'getRecordAudit',
      'hasEditAccess',
      'hasViewAccess',
      'search',
      'createBatch',
      'provideUserAccessAndRemovePendingAccess',
      'searchFuzzy',
      'deleteFilesFromStageDir',
      'getRelatedRecords',
      'delete',
      'restoreRecord',
      'destroyDeletedRecord',
      'getDeletedRecords',
      'updateNotificationLog',
      'triggerPreSaveTriggers',
      'triggerPostSaveTriggers',
      'triggerPostSaveSyncTriggers',
      'checkRedboxRunning',
      'getAttachments',
      'appendToRecord',
      'removeFromRecord',
      'getRecords',
      'exportAllPlans',
      'storeRecordAudit',
      'exists',
      'transitionWorkflowStep',
      'setWorkflowStepRelatedMetadata',
      'transitionWorkflowStepMetadata',
      'triggerPreSaveTransitionWorkflowTriggers',
      'triggerPostSaveTransitionWorkflowTriggers',
      // 'updateDataStream',
      'handleUpdateDataStream',
      'init'
    ];

    protected initRecordMetaMetadata(brandId: string, username: string, recordType: any, metaMetadataWorkflowStep: any, form: any, dateCreated: string): any {

      let metaMetadata = {};
      if (recordType.packageType) {
        _.set(metaMetadata, 'packageType', recordType.packageType);
      }

      if (recordType.packageName) {
        _.set(metaMetadata, 'packageName', recordType.packageName);
      }
      _.set(metaMetadata, 'brandId', brandId);
      _.set(metaMetadata, 'createdBy', username);
      _.set(metaMetadata, 'type', recordType.name);
      _.set(metaMetadata, 'searchCore', recordType.searchCore);

      if (!_.isEmpty(dateCreated)) {
        _.set(metaMetadata, 'createdOn', dateCreated);
        _.set(metaMetadata, 'lastSaveDate', dateCreated);
      }

      _.set(metaMetadata, 'form', _.get(metaMetadataWorkflowStep, 'config.form'));
      // Fix for ingesting Mint records: form maybe null because it is autogenerated
      _.set(metaMetadata, 'attachmentFields', form?.attachmentFields);

      return metaMetadata;
    }


    async create(brand: any, record: any, recordType: any, user?: any, triggerPreSaveTriggers = true, triggerPostSaveTriggers = true, targetStep = null) {




      let wfStep = await firstValueFrom(WorkflowStepsService.getFirst(recordType));
      let formName = _.get(wfStep, 'config.form');

      let form = await FormsService.getForm(brand, formName, true, recordType.name, record);

      let metaMetadata = this.initRecordMetaMetadata(brand.id, user.username, recordType, wfStep, form, DateTime.local().toISO());
      _.set(record, 'metaMetadata', metaMetadata);
      //set the initial workflow metadata to the first step
      this.setWorkflowStepRelatedMetadata(record, wfStep);

      if (targetStep) {
        wfStep = await firstValueFrom(WorkflowStepsService.get(recordType.name, targetStep));
        record = await this.triggerPreSaveTransitionWorkflowTriggers(null, record, recordType, wfStep, user);
        this.setWorkflowStepRelatedMetadata(record, wfStep);
      }



      let createResponse = new StorageServiceResponse();
      const failedMessage = "Failed to created record, please check server logs.";
      // trigger the pre-save
      if (triggerPreSaveTriggers) {
        try {
          record = await this.triggerPreSaveTriggers(null, record, recordType, 'onCreate', user);
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to run pre-save hooks when onCreate...`);
          sails.log.error(err);
          createResponse.success = false;
          createResponse.message = RBValidationError.displayMessage({ t: TranslationService, errors: [this.asError(err)], defaultMessage: failedMessage });
          return createResponse;
        }
      }

      // save the record ...
      createResponse = await this.storageService.create(brand, record, recordType, user);
      if (createResponse.isSuccessful()) {

        const fieldsToCheck = ['location', 'uploadUrl'];
        let oid = createResponse.oid;
        sails.log.verbose(`RecordsService - create - oid ${oid}`);
        if (!_.isEmpty(record.metaMetadata.attachmentFields)) {
          // check if we have any pending-oid elements
          _.each(record.metaMetadata.attachmentFields, (attFieldName: any) => {
            _.each(_.get(record.metadata, attFieldName), (attFieldEntry: any, attFieldIdx: any) => {
              if (!_.isEmpty(attFieldEntry)) {
                _.each(fieldsToCheck, (fldName: any) => {
                  const fldVal = _.get(attFieldEntry, fldName);
                  if (!_.isEmpty(fldVal)) {
                    sails.log.verbose(`RecordsService - create - fldVal ${fldVal}`);
                    _.set(record.metadata, `${attFieldName}[${attFieldIdx}].${fldName}`, _.replace(fldVal, 'pending-oid', oid));
                  }
                });
              }
            });
          });

          try {
            // handle datastream update
            // we emtpy the data locations in cloned record so we can reuse the same `handleUpdateDataStream` method call
            const emptyDatastreamRecord = _.cloneDeep(record);
            _.each(record.metaMetadata.attachmentFields, (attFieldName: any) => {
              _.set(emptyDatastreamRecord.metadata, attFieldName, []);
            });
            // update the datastreams in RB, this is a terminal call
            sails.log.verbose(`RecordsService - create - before handleUpdateDataStream`);
            let resposeDatastream = await firstValueFrom(this.handleUpdateDataStream(oid, emptyDatastreamRecord, record.metadata));
          } catch (error) {
            sails.log.error(`RecordsService - create - Failed to save record: ${error}`)
            throw new RBValidationError({
              message: `Failed to save record oid ${oid}`,
              options: { cause: error },
              displayErrors: [{ title: 'Failed to save record', meta: { oid } }]
            });
          }

          // update the metadata ...
          createResponse = await this.updateMeta(brand, oid, record, user, false, false);
        }


        if (triggerPostSaveTriggers) {
          // post-save sync
          try {

            createResponse = await this.triggerPostSaveSyncTriggers(createResponse['oid'], record, recordType, 'onCreate', user, createResponse);
            if (this.hasPostSaveSyncHooks(recordType, 'onCreate')) {
              this.storageService.updateMeta(brand, oid, record, user);
            }
          } catch (err) {
            sails.log.error(`${this.logHeader} Exception while running post save sync hooks when creating: ${createResponse['oid']}`);
            sails.log.error(JSON.stringify(err));
            createResponse.success = false;
            createResponse.message = RBValidationError.displayMessage({ t: TranslationService, errors: [this.asError(err)], defaultMessage: failedMessage });
            let metadata = { postSaveSyncWarning: 'true' };
            createResponse.metadata = metadata;
            sails.log.error('RecordsService create - error - createResponse ' + JSON.stringify(createResponse));
            return createResponse;
          }
          // Fire Post-save hooks async ...
          this.triggerPostSaveTriggers(createResponse['oid'], record, recordType, 'onCreate', user);

          if (!_.isEmpty(targetStep)) {
            try {
              createResponse = await this.triggerPostSaveTransitionWorkflowTriggers(createResponse['oid'], record, recordType, wfStep, user, createResponse);
              if (createResponse && createResponse.isSuccessful()) {
                if (this.hasPostSaveSyncHooks(recordType, 'onTransitionWorkflow')) {
                  await this.storageService.updateMeta(brand, oid, record, user);
                }
              } else {
                return createResponse;
              }

            } catch (tErr) {
              sails.log.error('RecordsService - create - Failed to run post-save hooks when onTransitionWorkflow... or Error updating meta:');
              sails.log.error(tErr);
              createResponse.success = false;
              createResponse.message = RBValidationError.displayMessage({ t: TranslationService, errors: [this.asError(tErr)], defaultMessage: failedMessage });
              return createResponse;
            }
          }
        }

        const recordOid = _.get(record, 'redboxOid');
        if (_.isEmpty(recordOid)) {
          sails.log.warn(`recordOid: '${recordOid}' is empty! Using response oid: ${createResponse['oid']} for solr index.`)
          this.searchService.index(createResponse['oid'], record);
        } else {
          if (createResponse['oid'] !== recordOid) {
            sails.log.warn(`response oid: ${createResponse['oid']} is not the same as recordOid: ${recordOid}.`)
          }
          this.searchService.index(recordOid, record);
        }

        this.auditRecord(createResponse['oid'], record, user, RecordAuditActionType.created)

      } else {
        sails.log.error(`${this.logHeader} Failed to create record, storage service response:`);
        sails.log.error(JSON.stringify(createResponse));
        createResponse.message = failedMessage;
      }
      return createResponse;
    }


    async updateMeta(brand: any, oid: any, record: any, user?: any, triggerPreSaveTriggers: boolean = true, triggerPostSaveTriggers: boolean = true, nextStep: any = {}, metadata: any = {}): Promise<StorageServiceResponse> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let updateResponse: any = new StorageServiceResponse();
      let preTriggerResponse = new StorageServiceResponse();
      updateResponse.oid = oid;
      const failedMessage = "Failed to update record, please check server logs.";
      let hasPermissionToTransition = true;
      let origRecord = _.cloneDeep(record);
      sails.log.verbose(`RecordService - updateMeta - origRecord - cloneDeep`);
      //This is done after cloning record to preserve origRecord during processing
      if (!_.isEmpty(metadata)) {
        record.metadata = metadata;
      }

      let recordType = null;
      if (!_.isEmpty(brand)) {
        recordType = await firstValueFrom(RecordTypesService.get(brand, record.metaMetadata.type));
      }

      if (!_.isEmpty(nextStep) && !_.isEmpty(nextStep.config)) {
        if (nextStep.config.authorization.transitionRoles != undefined) {
          if (nextStep.config.authorization.transitionRoles.length > 0) {
            let validRoles = _.filter(nextStep.config.authorization.transitionRoles, (role: any) => {
              let val = _.find(user.roles, (userRole: any) => {
                return role == userRole || role == userRole.name;
              });
              if (val != undefined) {
                return true;
              }
              return false;
            });
            if (validRoles.length == 0) {
              hasPermissionToTransition = false;
            }
          }
        }

        if (hasPermissionToTransition && !_.isEmpty(nextStep) && !_.isEmpty(recordType)) {
          try {
            sails.log.verbose(`RecordService - updateMeta - hasPermissionToTransition - enter`);
            sails.log.verbose(`RecordService - updateMeta triggerPreSaveTransitionWorkflowTriggers - before - nextStep ${JSON.stringify(nextStep)}`);
            record = await this.triggerPreSaveTransitionWorkflowTriggers(updateResponse['oid'], record, recordType, nextStep, user);
            this.transitionWorkflowStepMetadata(record, nextStep);
          } catch (err) {
            sails.log.verbose("RecordService - updateMeta - onTransitionWorkflow triggerPreSaveTriggers error");
            sails.log.error(JSON.stringify(err));
            preTriggerResponse.success = false;
            preTriggerResponse.message = RBValidationError.displayMessage({ t: TranslationService, errors: [this.asError(err)], defaultMessage: failedMessage });
            return preTriggerResponse;
          }
        }
      }

      let form: any = await firstValueFrom(FormsService.getFormByName(record.metaMetadata.form, true))
      record.metaMetadata.attachmentFields = form != undefined ? form.attachmentFields : [];

      // process pre-save
      if (!_.isEmpty(brand) && triggerPreSaveTriggers === true) {
        try {
          sails.log.verbose('RecordService - updateMeta - calling triggerPreSaveTriggers');
          recordType = await firstValueFrom(RecordTypesService.get(brand, record.metaMetadata.type));
          record = await this.triggerPreSaveTriggers(oid, record, recordType, 'onUpdate', user);
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to run pre-save hooks when onUpdate...`);
          sails.log.error(err);
          updateResponse.success = false;
          updateResponse.message = RBValidationError.displayMessage({ t: TranslationService, errors: [this.asError(err)], defaultMessage: failedMessage });
          return updateResponse;
        }
      }

      sails.log.verbose(`RecordService - updateMeta - origRecord.metadata.dataLocations ` + JSON.stringify(origRecord.metadata.dataLocations));
      sails.log.verbose(`RecordService - updateMeta - record.metadata.dataLocations ` + JSON.stringify(record.metadata.dataLocations));
      updateResponse = await firstValueFrom(this.handleUpdateDataStream(oid, origRecord, record.metadata));
      sails.log.verbose(`RecordService - updateMeta - Done with updating streams...`);

      const fieldsToCheck = ['location', 'uploadUrl'];
      if (!_.isEmpty(record.metaMetadata.attachmentFields)) {
        // check if we have any pending-oid elements
        _.each(record.metaMetadata.attachmentFields, (attFieldName: any) => {
          _.each(_.get(record.metadata, attFieldName), (attFieldEntry: any, attFieldIdx: any) => {
            if (!_.isEmpty(attFieldEntry)) {
              _.each(fieldsToCheck, (fldName: any) => {
                const fldVal = _.get(attFieldEntry, fldName);
                if (!_.isEmpty(fldVal)) {
                  sails.log.verbose(`RecordService - updateMeta - fldVal ${fldVal}`);
                  _.set(record.metadata, `${attFieldName}[${attFieldIdx}].${fldName}`, _.replace(fldVal, 'pending-oid', oid));
                }
              });
            }
          });
        });
      }

      // unsetting the ID just to be safe
      _.unset(record, 'id');
      _.unset(record, 'redboxOid');
      sails.log.verbose(`RecordService - updateMeta - before storageService.updateMeta`);
      //Some of the automated tests may be passing undefined or empty user
      if (!_.isUndefined(user) && !_.isEmpty(_.get(user, 'username', ''))) {
        record.metaMetadata.lastSavedBy = _.get(user, 'username');
      }
      record.metaMetadata.lastSaveDate = DateTime.local().toISO();
      // update
      updateResponse = await this.storageService.updateMeta(brand, oid, record, user);
      sails.log.verbose('RecordService - updateMeta - updateResponse.isSuccessful ' + updateResponse.isSuccessful());
      if (updateResponse.isSuccessful()) {
        //if triggerPreSaveTriggers is false recordType will be empty even if triggerPostSaveTriggers is true
        //therefore try to set recordType if triggerPostSaveTriggers is true
        if (_.isEmpty(recordType) && !_.isEmpty(brand) && triggerPostSaveTriggers === true) {
          recordType = await firstValueFrom(RecordTypesService.get(brand, record.metaMetadata.type));
        }
        // post-save async
        if (!_.isEmpty(recordType) && triggerPostSaveTriggers === true) {
          // Trigger Post-save sync hooks ...
          try {

            sails.log.verbose('RecordService - updateMeta - calling triggerPostSaveSyncTriggers');
            updateResponse = await this.triggerPostSaveSyncTriggers(updateResponse['oid'], record, recordType, 'onUpdate', user, updateResponse);
            if (this.hasPostSaveSyncHooks(recordType, 'onUpdate')) {
              await this.storageService.updateMeta(brand, oid, record, user);
            }
          } catch (err) {
            sails.log.error(`${this.logHeader} Exception while running post save sync hooks when updating:`);
            sails.log.error(JSON.stringify(err));
            updateResponse.success = false;
            updateResponse.message = RBValidationError.displayMessage({ t: TranslationService, errors: [this.asError(err)], defaultMessage: failedMessage });
            let metadataRes = { postSaveSyncWarning: 'true' };
            updateResponse.metadata = metadataRes;
            sails.log.error('RecordsService - updateMeta - error - updateResponse ' + JSON.stringify(updateResponse));
            return updateResponse;
          }
          sails.log.verbose('RecordService - updateMeta - calling triggerPostSaveTriggers');
          // Fire Post-save hooks async ...
          this.triggerPostSaveTriggers(updateResponse['oid'], record, recordType, 'onUpdate', user);

          if (hasPermissionToTransition && !_.isEmpty(nextStep)) {
            try {

              updateResponse = await this.triggerPostSaveTransitionWorkflowTriggers(updateResponse['oid'], record, recordType, nextStep, user, updateResponse);

              sails.log.verbose(`RecordService - updateMeta - triggerPostSaveTransitionWorkflowTriggers post save hook enter`);
              sails.log.verbose(JSON.stringify(updateResponse));
              if (updateResponse && updateResponse.isSuccessful()) {
                sails.log.verbose(`RecordService - updateMeta - triggerPostSaveTransitionWorkflowTriggers ajaxOk`);
                if (this.hasPostSaveSyncHooks(recordType, 'onTransitionWorkflow')) {
                  await this.storageService.updateMeta(brand, oid, record, user);
                }
              } else {
                sails.log.verbose(`RecordService - updateMeta - triggerPostSaveTransitionWorkflowTriggers post save hook not successful`);
                return updateResponse;
              }

            } catch (tErr) {
              sails.log.error('RecordService - updateMeta - Failed to run post-save hooks when onTransitionWorkflow... or Error updating meta:');
              sails.log.error(tErr);
              updateResponse.success = false;
              updateResponse.message = RBValidationError.displayMessage({ t: TranslationService, errors: [this.asError(tErr)], defaultMessage: failedMessage });
              return updateResponse;
            }
          }
        }
        this.searchService.index(oid, record);
        this.auditRecord(updateResponse['oid'], record, user, RecordAuditActionType.updated)
      } else {
        sails.log.error(`${this.logHeader} Failed to update record, storage service response:`);
        sails.log.error(JSON.stringify(updateResponse));
        updateResponse.success = false;
        updateResponse.message = failedMessage;
      }
      return updateResponse;
    }

    hasPostSaveSyncHooks(recordType: any, mode: string): boolean {
      let postSaveSyncHooks = _.get(recordType, `hooks.${mode}.postSync`, []);
      if (_.isArray(postSaveSyncHooks) && postSaveSyncHooks.length > 0) {
        return true;
      }
      return false;
    }

    getMeta(oid: any): Promise<any> {
      return this.storageService.getMeta(oid);
    }

    getRecordAudit(params: RecordAuditParams): Promise<any> {
      return this.storageService.getRecordAudit(params);
    }

    createBatch(type: any, data: any, harvestIdFldName: any): Promise<any> {
      return this.storageService.createBatch(type, data, harvestIdFldName);
    }

    provideUserAccessAndRemovePendingAccess(oid: any, userid: any, pendingValue: any): void {
      this.storageService.provideUserAccessAndRemovePendingAccess(oid, userid, pendingValue);
    }

    getRelatedRecords(oid: any, brand: any): Promise<any> {
      return this.storageService.getRelatedRecords(oid, brand);
    }

    async delete(oid: any, permanentlyDelete: boolean, currentRec: any, recordType: any, user: any) {

      let preTriggerResponse = new StorageServiceResponse();
      const failedMessage = "Failed to delete record, please check server logs.";
      try {
        sails.log.verbose('RecordsService - delete - triggerPreSaveTriggers onDelete');
        preTriggerResponse.oid = oid;
        currentRec = await this.triggerPreSaveTriggers(oid, currentRec, recordType, 'onDelete', user);
      } catch (err) {
        sails.log.verbose('RecordsService - delete - triggerPreSaveTriggers onDelete error');
        sails.log.error(JSON.stringify(err));
        preTriggerResponse.success = false;
        preTriggerResponse.message = RBValidationError.displayMessage({ t: TranslationService, errors: [this.asError(err)], defaultMessage: failedMessage });
        return preTriggerResponse;
      }

      let response = await this.storageService.delete(oid, permanentlyDelete);
      if (response.isSuccessful()) {
        let action: RecordAuditActionType = permanentlyDelete ? RecordAuditActionType.destroyed : RecordAuditActionType.deleted;
        this.auditRecord(oid, {}, user, action)
        this.searchService.remove(oid);

        try {
          sails.log.verbose('RecordsService - delete - calling triggerPostSaveSyncTriggers');
          response = await this.triggerPostSaveSyncTriggers(oid, currentRec, recordType, 'onDelete', user, response);
        } catch (err) {
          sails.log.error(`RecordsService - delete - Exception while running post delate sync hooks when updating:`);
          sails.log.error(JSON.stringify(err));
          response.success = false;
          response.message = RBValidationError.displayMessage({ t: TranslationService, errors: [this.asError(err)], defaultMessage: failedMessage });
          let metadata = { postSaveSyncWarning: 'true' };
          response.metadata = metadata;
          sails.log.error('RecordsService - delete - error - triggerPostSaveSyncTriggers ' + JSON.stringify(response));
          return response;
        }
        sails.log.verbose('RecordService - delete - calling triggerPostSaveTriggers');

        this.triggerPostSaveTriggers(oid, currentRec, recordType, 'onDelete', user);
      }
      return response;
    }

    updateNotificationLog(oid: any, record: any, options: any): Promise<any> {
      return this.storageService.updateNotificationLog(oid, record, options);
    }

    public getRecords(workflowState: any, recordType: any = undefined, start: any, rows: any = 10, username: any, roles: any, brand: any, editAccessOnly: any = undefined, packageType: any = undefined, sort: any = undefined, fieldNames: any = undefined, filterString: any = undefined, filterMode: any = undefined, secondarySort: any = undefined): Promise<any> {

      return this.storageService.getRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, fieldNames, filterString, filterMode, secondarySort);
    }

    public exportAllPlans(username: any, roles: any, brand: any, format: any, modBefore: any, modAfter: any, recType: any): Readable {
      return this.storageService.exportAllPlans(username, roles, brand, format, modBefore, modAfter, recType);
    }

    // Gets attachments for this record, will use the `sails.config.record.datastreamService` if set, otherwise will use this service
    //
    // Params:
    // oid - record idea
    // labelFilterStr - set if you want to be selective in your attachments, will just run a simple `.indexOf`
    public async getAttachments(oid: string, labelFilterStr: string | undefined = undefined): Promise<any> {
      sails.log.verbose(`RecordsService::Getting attachments of ${oid}`);
      let datastreams = await this.datastreamService.listDatastreams(oid, '');
      const attachments: any[] = [];
      _.each(datastreams, (datastream: any) => {
        let attachment: Record<string, unknown> = {};
        attachment['dateUpdated'] = DateTime.fromJSDate(new Date(datastream['uploadDate'])).toISO();
        attachment['label'] = _.get(datastream.metadata, 'name');
        attachment['contentType'] = _.get(datastream.metadata, 'mimeType');
        attachment = _.merge(attachment, datastream.metadata);
        if (_.isUndefined(labelFilterStr) && _.isEmpty(labelFilterStr)) {
          attachments.push(attachment);
        } else {
          if (datastream['label'] && datastream['label'].indexOf(labelFilterStr) != -1) {
            attachments.push(attachment);
          }
        }
      });
      return attachments;
    }

    /*
     *
     */
    public async checkRedboxRunning(): Promise<any> {
      // check if a valid storage plugin is loaded....
      if (!_.isEmpty(sails.config.storage)) {
        sails.log.info("ReDBox storage plugin is active!");
        return true;
      }
      let retries = 1000;
      for (let i = 0; i < retries; i++) {
        try {
          let response: any = await this.info();
          if (response['applicationVersion']) {
            return true;
          }
        } catch (err) {
          sails.log.info("ReDBox Storage hasn't started yet. Retrying...")
        }
        await this.sleep(1000);
      }
      return false;
    }


    public auditRecord(id: string, record: any, user: any, action: RecordAuditActionType = RecordAuditActionType.updated) {
      if (this.queueService == null) {
        sails.log.verbose(`${this.logHeader} Queue service isn't defined. Skipping auditing`);
        return;
      }
      const auditingEnabled = sails.config.record.auditing.enabled as any;
      if (auditingEnabled !== true && auditingEnabled !== "true") {
        sails.log.verbose(`${this.logHeader} Not enabled. Skipping auditing`);
        return;
      }
      sails.log.verbose(`${this.logHeader} adding record audit job: ${id} with data:`);
      _.unset(user, 'password')
      _.unset(user, 'token')
      // storage_id is used as the main ID in searches
      let data = new RecordAuditModel(id, record, user, action)
      sails.log.verbose(JSON.stringify(data));
      this.queueService.now(sails.config.record.auditing.recordAuditJobName, data);
    }

    public storeRecordAudit(job: any) {
      let data = job.attrs.data;
      sails.log.verbose(`${this.logHeader} Storing record Audit entry: `);
      sails.log.verbose(JSON.stringify(data));
      (this.storageService as any).createRecordAudit(data).then((response: any) => {
        if (response.isSuccessful()) {
          sails.log.verbose(`${this.logHeader} Record Audit stored successfully `);
        } else {
          sails.log.error(`${this.logHeader} Failed to storeRecordAudit for record:`);
          sails.log.verbose(JSON.stringify(response));
        }
      }).catch((err: unknown) => {
        sails.log.error(`${this.logHeader} Failed to storeRecordAudit for record: `);
        sails.log.error(JSON.stringify(err));
      });
    }

    private info(): Promise<any> {

      const options = this.getOptions(sails.config.record.baseUrl.redbox + sails.config.record.api.info.url, sails.config.record.api.info.method);

      return axios(options);
    }

    protected getOptions(url: string, method: string, oid: string | null = null, packageType: string | null = null, contentType = 'application/json; charset=utf-8') {
      if (!_.isEmpty(oid)) {
        url = url.replace('$oid', String(oid));
      }
      if (!_.isEmpty(packageType)) {
        url = url.replace('$packageType', String(packageType));
      }
      const opts = {
        method: method,
        url: url,
        headers: {
          'Authorization': `Bearer ${(sails.config as any).redbox.apiKey}`,
          'Content-Type': contentType
        }
      };

      return opts;
    }


    /**
     * End of block to move/remove
     */


    /**
     * Sets/appends to a field in the targetRecord
     *
     * @param  targetRecordOid - the record to modify
     * @param  data - the data to set
     * @param  fieldName - the field name to use
     * @param  fieldType - blank for any, 'array' to create an array
     * @param  targetRecord - leave blank, otherwise will use this record for updates...
     * @return - response of the update
     */
    public async appendToRecord(targetRecordOid: string, linkData: any, fieldName: string, fieldType: string | undefined = undefined, targetRecord: any = undefined) {
      sails.log.verbose(`RecordsService::Appending to record:${targetRecordOid}`);
      if (_.isEmpty(targetRecord)) {
        sails.log.verbose(`RecordsService::Getting record metadata:${targetRecordOid}`);
        targetRecord = await this.getMeta(targetRecordOid);
      }
      const existingData = _.get(targetRecord, fieldName);
      if (_.isUndefined(existingData)) {
        if (fieldType == "array") {
          linkData = [linkData];
        }
      } else if (_.isArray(existingData)) {
        existingData.push(linkData);
        linkData = existingData;
      }
      _.set(targetRecord, fieldName, linkData);
      sails.log.verbose(`RecordsService::Updating record:${targetRecordOid}`);

      return await this.updateMeta(null, targetRecordOid, targetRecord);
    }

    /**
     * Removes a field in the targetRecord. If field is an array, uses the `_.isEqual` to compare the field value.
     *
     * @param  targetRecordOid - the record to modify
     * @param  dataToRemove - the data to remove
     * @param  fieldName - the field name
     * @param  targetRecord - leave blank, otherwise will use this record for updates...
     * @return - response of the update
     */
    public async removeFromRecord(targetRecordOid: string, dataToRemove: any, fieldName: string, targetRecord: any = undefined) {
      sails.log.verbose(`RecordsService::Removing field from record:${targetRecordOid}`);
      if (_.isEmpty(targetRecord)) {
        sails.log.verbose(`RecordsService::Getting record metadata:${targetRecordOid}`);
        targetRecord = await this.getMeta(targetRecordOid);
      }
      const existingData = _.get(targetRecord, fieldName);
      let removedData = existingData;
      if (_.isUndefined(existingData)) {
        // Data doesn't exist, nothing to remove
      } else if (_.isArray(existingData)) {
        removedData = _.remove(existingData, (dataElem: any) => {
          return _.isEqual(dataElem, dataToRemove);
        });
      } else {
        _.unset(targetRecord, fieldName);
      }
      sails.log.verbose(`RecordsService::Updating record, removing ${_.isString(removedData) ? removedData : JSON.stringify(removedData)} from:${targetRecordOid}`);

      return await this.updateMeta(null, targetRecordOid, targetRecord);
    }

    /**
     * Fine-grained access to the record, converted to sync.
     *
     */
    public hasViewAccess(brand: any, user: any, roles: any, record: any): boolean {
      // merge with the edit user and roles, since editors are viewers too...
      const viewArr = record.authorization ? _.union(record.authorization.view, record.authorization.edit) : _.union(record.authorization_view, record.authorization_edit);
      const viewRolesArr = record.authorization ? _.union(record.authorization.viewRoles, record.authorization.editRoles) : _.union(record.authorization_viewRoles, record.authorization_editRoles);

      const uname = user.username;

      const isInUserView = _.find(viewArr, (username: any) => {
        return uname == username;
      });
      if (!_.isUndefined(isInUserView)) {
        return true;
      }
      const isInRoleView = _.find(viewRolesArr, (roleName: any) => {
        const role = RolesService.getRole(brand, roleName);
        return role && !_.isUndefined(_.find(roles, (r: any) => {
          return role.id == r.id;
        }));
      });
      return !_.isUndefined(isInRoleView);
      // Lines below commented out because we're not checking workflow auths anymore,
      // we're expecting that the workflow auths are bolted into the document on workflow updates.
      //
      // if (isInRoleEdit !== undefined) {
      //   return Observable.of(true);
      // }
      //
      // return WorkflowStepsService.get(brand, record.workflow.stage).flatMap(wfStep => {
      //   const wfHasRoleEdit = _.find(wfStep.config.authorization.editRoles, roleName => {
      //     const role = RolesService.getRole(brand, roleName);
      //     return role && UsersService.hasRole(user, role);
      //   });
      //   return Observable.of(wfHasRoleEdit !== undefined);
      // });
    }

    /**
     * Fine-grained access to the record, converted to sync.
     *
     */
    public hasEditAccess(brand: any, user: any, roles: any, record: any): boolean {
      const editArr = record.authorization ? record.authorization.edit : record.authorization_edit;
      const editRolesArr = record.authorization ? record.authorization.editRoles : record.authorization_editRoles;
      const uname = user.username;

      const isInUserEdit = _.find(editArr, (username: any) => {
        // sails.log.verbose(`Username: ${uname} == ${username}`);
        return uname == username;
      });
      // sails.log.verbose(`isInUserEdit: ${isInUserEdit}`);
      if (!_.isUndefined(isInUserEdit)) {
        return true;
      }
      const isInRoleEdit = _.find(editRolesArr, (roleName: any) => {
        const role = RolesService.getRole(brand, roleName);
        return role && !_.isUndefined(_.find(roles, (r: any) => {
          return role.id == r.id;
        }));
      });
      return !_.isUndefined(isInRoleEdit);

    }


    public searchFuzzy(type: any, workflowState: any, searchQuery: any, exactSearches: any, facetSearches: any, brand: any, user: any, roles: any, returnFields: any): Promise<any> {

      const username = user.username;
      // const url = `${this.getSearchTypeUrl(type, searchField, searchStr)}&start=0&rows=${sails.config.record.export.maxRecords}`;
      let searchParam = workflowState ? ` AND workflow_stage:${workflowState} ` : '';
      searchParam = `${searchParam} AND full_text:${searchQuery}`;
      _.forEach(exactSearches, (exactSearch: any) => {
        searchParam = `${searchParam}&fq=${exactSearch.name}:${this.luceneEscape(exactSearch.value)}`
      });
      if (facetSearches.length > 0) {
        searchParam = `${searchParam}&facet=true`
        _.forEach(facetSearches, (facetSearch: any) => {
          searchParam = `${searchParam}&facet.field=${facetSearch.name}${_.isEmpty(facetSearch.value) ? '' : `&fq=${facetSearch.name}:${this.luceneEscape(facetSearch.value)}`}`
        });
      }

      let url = `${sails.config.record.baseUrl.redbox}${sails.config.record.api.search.url}?q=metaMetadata_brandId:${brand.id} AND metaMetadata_type:${type}${searchParam}&version=2.2&wt=json&sort=date_object_modified desc`;
      url = this.addAuthFilter(url, username, roles, brand, false)
      sails.log.debug(`Searching fuzzy using: ${url}`);
      const options = this.getOptions(url, sails.config.record.api.search.method);

      return firstValueFrom(from(axios(options))
        .pipe(flatMap(resp => {
          let response: any = resp;
          const customResp: any = {
            records: []
          };
          _.forEach(response.response.docs, (solrdoc: any) => {
            const customDoc: any = {};
            _.forEach(returnFields, (retField: any) => {
              if (_.isArray(solrdoc[retField])) {
                customDoc[retField] = solrdoc[retField][0];
              } else {
                customDoc[retField] = solrdoc[retField];
              }
            });
            customDoc["hasEditAccess"] = this.hasEditAccess(brand, user, roles, solrdoc);
            customResp.records.push(customDoc);
          });
          // check if have facets turned on...
          if (response.facet_counts) {
            customResp['facets'] = [];
            _.forOwn(response.facet_counts.facet_fields, (facet_field: any, facet_name: any) => {
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
          return of(customResp);
        })));
    }

    protected addAuthFilter(url: any, username: any, roles: any, brand: any, editAccessOnly: any = undefined) {

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


    protected getSearchTypeUrl(type: any, searchField: string | null = null, searchStr: string | null = null) {
      const searchParam = searchField ? ` AND ${searchField}:${searchStr}*` : '';
      const redboxConfig = (sails.config as any).redbox || '';
      return `${sails.config.record.baseUrl.redbox ?? redboxConfig}${sails.config.record.api.search.url}?q=metaMetadata_type:${type}${searchParam}&version=2.2&wt=json&sort=date_object_modified desc`;
    }


    protected luceneEscape(str: string) {
      return luceneEscapeQuery(String(str));
    }


    /**
     *  Pre-save trigger to clear and re-assign permissions based on security config
     *
     */
    public assignPermissions(oid: any, record: any, options: any, user: any) {

      // sails.log.verbose(`Assign Permissions executing on oid: ${oid}, using options:`);
      // sails.log.verbose(JSON.stringify(options));
      // sails.log.verbose(`With record: `);
      // sails.log.verbose(record);
      // const emailProperty = _.get(options, "emailProperty", "email");
      // const editContributorProperties = _.get(options, "editContributorProperties", []);
      // const viewContributorProperties = _.get(options, "viewContributorProperties", []);
      // let authorization = _.get(record, "authorization", {});
      // let editContributorObs = [];
      // let viewContributorObs = [];
      // let editContributorEmails = [];
      // let viewContributorEmails = [];
      //
      // // get the new editor list...
      // editContributorEmails = this.populateContribList(editContributorProperties, record, emailProperty, editContributorEmails);
      // // get the new viewer list...
      // viewContributorEmails = this.populateContribList(viewContributorProperties, record, emailProperty, viewContributorEmails);
      //
      // if (_.isEmpty(editContributorEmails)) {
      //   sails.log.error(`No editors for record: ${oid}`);
      // }
      // if (_.isEmpty(viewContributorEmails)) {
      //   sails.log.error(`No viewers for record: ${oid}`);
      // }
      // _.each(editContributorEmails, editorEmail => {
      //   editContributorObs.push(this.getObservable(User.findOne({email: editorEmail})));
      // });
      // _.each(viewContributorEmails, viewerEmail => {
      //   viewContributorObs.push(this.getObservable(User.findOne({email: viewerEmail})));
      // });
      //
      // return Observable.zip(...editContributorObs)
      // .flatMap(editContributorUsers => {
      //   let newEditList = [];
      //   this.filterPending(editContributorUsers, editContributorEmails, newEditList);
      //   record.authorization.edit = newEditList;
      //   record.authorization.editPending = editContributorEmails;
      //   return Observable.zip(...viewContributorObs);
      // })
      // .flatMap(viewContributorUsers => {
      //   let newviewList = [];
      //   this.filterPending(viewContributorUsers, editContributorEmails, newviewList);
      //   record.authorization.view = newviewList;
      //   record.authorization.viewPending = viewContributorEmails;
      //   return Observable.of(record);
      // });
    }



    async restoreRecord(oid: any, user: any): Promise<any> {
      let record = await this.storageService.restoreRecord(oid);
      this.searchService.index(oid, record);
      this.auditRecord(oid, record, user, RecordAuditActionType.restored)
      return record
    }

    async destroyDeletedRecord(oid: any, user: any): Promise<any> {
      let record = await this.storageService.destroyDeletedRecord(oid);
      this.auditRecord(oid, record, user, RecordAuditActionType.destroyed)
      return record
    }

    async getDeletedRecords(workflowState: any, recordType: any, start: any, rows: any, username: any, roles: any, brand: any, editAccessOnly: any, packageType: any, sort: any, fieldNames?: any, filterString?: any, filterMode?: any): Promise<any> {
      return await this.storageService.getDeletedRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, fieldNames, filterString, filterMode);
    }

    async createRecordAudit(record: any): Promise<any> {
      return await (this.storageService as any).createRecordAudit(record);
    }

    public async transitionWorkflowStep(currentRec: any, recordType: any, nextStep: any, user: any, triggerPreSaveTriggers: boolean = true, triggerPostSaveTriggers: boolean = true) {
      throw new Error("Use separate calls to 'transitionWorkflowStepMetadata', 'triggerPreSaveTransitionWorkflowTriggers', and 'triggerPostSaveTransitionWorkflowTriggers' instead.")
    }

    public setWorkflowStepRelatedMetadata(currentRec: any, nextStep: any) {
      sails.log.warn('Deprecated call to setWorkflowStepRelatedMetadata. Use transitionWorkflowStepMetadata instead.');
      return this.transitionWorkflowStepMetadata(currentRec, nextStep);
    }

    public transitionWorkflowStepMetadata(currentRec: any, nextStep: any) {
      sails.log.verbose(`transitionWorkflowStepMetadata - start - previousWorkflow: ${currentRec.previousWorkflow}; workflow: ${currentRec.workflow}; nextStep: ${nextStep}`);
      if (!_.isEmpty(nextStep)) {
        currentRec.previousWorkflow = currentRec.workflow;
        currentRec.workflow = nextStep.config.workflow;
        // TODO: validate data with form fields
        currentRec.metaMetadata.form = nextStep.config.form;
        // Check for JSON-LD config
        if (sails.config.jsonld.addJsonLdContext) {
          currentRec.metadata['@context'] = sails.config.jsonld.contexts[currentRec.metaMetadata.form];
        }
        //TODO: if this was all typed we probably don't need these sorts of initialisations
        if (currentRec.authorization == undefined) {
          currentRec.authorization = {
            viewRoles: [],
            editRoles: [],
            edit: [],
            view: []
          };
        }

        // update authorizations based on workflow...
        currentRec.authorization.viewRoles = nextStep.config.authorization.viewRoles;
        currentRec.authorization.editRoles = nextStep.config.authorization.editRoles;
      }
      sails.log.verbose(`transitionWorkflowStepMetadata - finish - previousWorkflow: ${currentRec.previousWorkflow}; workflow: ${currentRec.workflow}; nextStep: ${nextStep}`);
    }

    public async triggerPreSaveTransitionWorkflowTriggers(oid: string | null, record: any, recordType: any, nextStep: any, user: any = undefined) {
      if (!_.isEmpty(nextStep)) {
        record = await this.triggerPreSaveTriggers(oid, record, recordType, 'onTransitionWorkflow', user);
      }
      return record;
    }

    public async triggerPostSaveTransitionWorkflowTriggers(oid: string | null, record: any, recordType: any, nextStep: any, user: any = undefined, response: any = {}) {
      try {
        if (!_.isEmpty(nextStep)) {
          response = await this.triggerPostSaveSyncTriggers(oid, record, recordType, 'onTransitionWorkflow', user, response);
        }
      } catch (err) {
        sails.log.error(`${this.logHeader} Exception while running post save sync hooks when transitioning workflow: ${JSON.stringify(err)}`);
        response.success = false;
        response.message = RBValidationError.displayMessage({ t: TranslationService, errors: [this.asError(err)], defaultMessage: "Failed to transition record workflow, please check server logs." });
        response.metadata = { postSaveSyncWarning: 'true' };
        sails.log.error(`RecordsService - triggerPostSaveTransitionWorkflowTriggers - error - response: ${JSON.stringify(response)}`);
        return response;
      }

      if (!_.isEmpty(nextStep)) {
        this.triggerPostSaveTriggers(oid, record, recordType, 'onTransitionWorkflow', user);
      }
      return response;
    }

    public async triggerPreSaveTriggers(oid: string | null, record: any, recordType: any, mode: string = 'onUpdate', user: any = undefined) {
      sails.log.verbose("Triggering pre save triggers for record type: ");
      sails.log.verbose(`hooks.${mode}.pre`);
      sails.log.verbose(JSON.stringify(recordType));

      let preSaveUpdateHooks = _.get(recordType, `hooks.${mode}.pre`, null);
      sails.log.debug(preSaveUpdateHooks);

      if (_.isArray(preSaveUpdateHooks)) {

        for (var i = 0; i < preSaveUpdateHooks.length; i++) {
          let preSaveUpdateHook = preSaveUpdateHooks[i];
          let preSaveUpdateHookFunctionString = _.get(preSaveUpdateHook, "function", null);
          if (preSaveUpdateHookFunctionString != null) {
            try {
              let preSaveUpdateHookFunction = eval(preSaveUpdateHookFunctionString);
              let options = _.get(preSaveUpdateHook, "options", {});
              sails.log.verbose(`Triggering pre save triggers: ${preSaveUpdateHookFunctionString}`);
              let hookResponse = preSaveUpdateHookFunction(oid, record, options, user);
              record = await this.resolveHookResponse(hookResponse);
              sails.log.debug(`${preSaveUpdateHookFunctionString} response now is:`);
              sails.log.verbose(JSON.stringify(record));
              sails.log.debug(`pre-save sync trigger ${preSaveUpdateHookFunctionString} completed for ${oid}`);
            } catch (err) {
              sails.log.error(`pre-save trigger ${preSaveUpdateHookFunctionString} failed to complete for oid ${oid} mode ${mode} user ${user}`);
              sails.log.error(err);
              throw new RBValidationError({
                message: `pre-save trigger ${preSaveUpdateHookFunctionString} failed to complete for oid ${oid} mode ${mode} user ${user}`,
                options: { cause: err },
                displayErrors: [{ title: "Failed to save record", meta: { oid } }],
              });
            }
          }
        }
      }
      return record;
    }

    public async triggerPostSaveSyncTriggers(oid: string | null, record: any, recordType: any, mode: string = 'onUpdate', user: any = undefined, response: any = {}) {
      sails.log.debug("Triggering post save sync triggers ");
      sails.log.debug(`hooks.${mode}.postSync`);
      sails.log.debug(recordType);
      let postSaveSyncHooks = _.get(recordType, `hooks.${mode}.postSync`, null);
      if (_.isArray(postSaveSyncHooks)) {
        for (var i = 0; i < postSaveSyncHooks.length; i++) {
          let postSaveSyncHook = postSaveSyncHooks[i];
          sails.log.debug(postSaveSyncHooks);
          let postSaveSyncHooksFunctionString = _.get(postSaveSyncHook, "function", null);
          if (postSaveSyncHooksFunctionString != null) {
            let postSaveSyncHookFunction = eval(postSaveSyncHooksFunctionString);
            let options = _.get(postSaveSyncHook, "options", {});
            if (_.isFunction(postSaveSyncHookFunction)) {
              try {
                sails.log.debug(`Triggering post-save sync trigger: ${postSaveSyncHooksFunctionString}`);
                let hookResponse = postSaveSyncHookFunction(oid, record, options, user, response);
                const returnType = options.returnType == undefined ? 'record' : options.returnType;
                //TODO: response from these functions is not consistent, some return the record, some return the storage response
                if (returnType == 'record') {
                  record = await this.resolveHookResponse(hookResponse);
                } else {
                  response = await this.resolveHookResponse(hookResponse);
                }
                sails.log.debug(`${postSaveSyncHooksFunctionString} response now is:`);
                sails.log.verbose(JSON.stringify(response));
                sails.log.debug(`post-save sync trigger ${postSaveSyncHooksFunctionString} completed for ${oid}`);
              } catch (err) {
                sails.log.error(`post-save async trigger ${postSaveSyncHooksFunctionString} failed to complete for oid ${oid} mode ${mode} user ${user}`);
                sails.log.error(err);
                throw new RBValidationError({
                  message: `post-save async trigger ${postSaveSyncHooksFunctionString} failed to complete for oid ${oid} mode ${mode} user ${user}`,
                  options: { cause: err },
                  displayErrors: [{ title: "Failed to run processing after saving record", meta: { oid } }],
                });
              }
            } else {
              sails.log.error(`Post save function: '${postSaveSyncHooksFunctionString}' did not resolve to a valid function, what I got:`);
              sails.log.error(postSaveSyncHookFunction);
            }
          }
        }
      }
      return response;
    }


    public triggerPostSaveTriggers(oid: string | null, record: any, recordType: any, mode: string = 'onUpdate', user: any = undefined): void {
      sails.log.debug("Triggering post save triggers ");
      sails.log.debug(`hooks.${mode}.post`);
      sails.log.debug(recordType);
      let postSaveCreateHooks = _.get(recordType, `hooks.${mode}.post`, null);
      if (_.isArray(postSaveCreateHooks)) {
        _.each(postSaveCreateHooks, (postSaveCreateHook: any) => {
          sails.log.debug(postSaveCreateHook);
          let postSaveCreateHookFunctionString = _.get(postSaveCreateHook, "function", null);
          if (postSaveCreateHookFunctionString != null) {
            let postSaveCreateHookFunction = eval(postSaveCreateHookFunctionString);
            let options = _.get(postSaveCreateHook, "options", {});
            if (_.isFunction(postSaveCreateHookFunction)) {
              //add try/catch just as an extra safety measure in case the function called
              //by the trigger is not correctly implemented (or old). In example: An old
              //function that is not async and retruns and Observable.of instead of a promise
              //and then throws an error. In this case the error is not caught by chained
              //.then().catch() and propagates to the front end and this has to be prevented
              try {
                let hookResponse = postSaveCreateHookFunction(oid, record, options, user);
                this.resolveHookResponse(hookResponse).then((result: any) => {
                  sails.log.debug(`post-save trigger ${postSaveCreateHookFunctionString} completed for ${oid}`);
                }).catch((error: any) => {
                  sails.log.error(`post-save trigger ${postSaveCreateHookFunctionString} failed to complete`);
                  sails.log.error(error);
                });
              } catch (err) {
                sails.log.error(`post-save trigger external catch ${postSaveCreateHookFunctionString} failed to complete`);
                sails.log.error(err);
              }
            } else {
              sails.log.error(`Post save function: '${postSaveCreateHookFunctionString}' did not resolve to a valid function, what I got:`);
              sails.log.error(postSaveCreateHookFunction);
            }
          }
        });
      }
    }

    private resolveHookResponse(hookResponse: any) {
      let response = hookResponse;
      if (isObservable(hookResponse)) {
        response = firstValueFrom(hookResponse);
      } else {
        response = Promise.resolve(hookResponse);
      }
      return response;
    }

    public async exists(oid: string) {
      return this.storageService.exists(oid);
    }

    public handleUpdateDataStream(oid: any, origRecord: any, metadata: any) {
      const fileIdsAdded: any[] = [];
      return this.datastreamService
        .updateDatastream(oid, origRecord, metadata, sails.config.record.attachments.stageDir, fileIdsAdded)
        .pipe(
          concatMap((reqs: any) => {
            if (reqs) {
              sails.log.verbose(`Updating data streams...`);
              return from(reqs as any[]);
            } else {
              sails.log.verbose(`No datastreams to update...`);
              return of(null);
            }
          }),
          concatMap((promise: any) => {
            if (promise) {
              sails.log.verbose(`Update datastream request is...`);
              sails.log.verbose(JSON.stringify(promise));
              return from(promise).pipe(
                catchError((e: any) => {
                  sails.log.verbose(`Error in updating stream::::`);
                  sails.log.verbose(JSON.stringify(e));
                  return throwError(new Error(TranslationService.t('attachment-upload-error')));
                })
              );
            } else {
              return of(null);
            }
          }),
          concatMap(updateResp => {
            if (updateResp) {
              sails.log.verbose(`Got response from update datastream request...`);
              sails.log.verbose(JSON.stringify(updateResp));
            }
            return of(updateResp);
          }),
          last()
        );
    }
  }
}

declare global {
  let RecordsService: Services.Records;
}
