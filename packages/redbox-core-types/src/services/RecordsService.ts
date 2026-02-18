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

import { of, from, mergeMap as flatMap, firstValueFrom, throwError } from 'rxjs';
import { concatMap, last, catchError } from 'rxjs/operators';

import { DatastreamService } from '../DatastreamService';
import { Datastream } from '../Datastream';
import { QueueService } from '../QueueService';
import { RecordAuditModel, RecordAuditActionType } from '../model/storage/RecordAuditModel';
import { RecordsService } from '../RecordsService';
import { SearchService } from '../SearchService';
import { Services as services } from '../CoreService';

declare const RedboxJavaStorageService: unknown;
import { StorageService } from '../StorageService';
import { StorageServiceResponse } from '../StorageServiceResponse';
import { RecordAuditParams } from '../RecordAuditParams';
import { RBValidationError } from '../model/RBValidationError';
import { RecordModel } from '../model/storage/RecordModel';
import { RecordTypeModel } from '../model/storage/RecordTypeModel';
import { BrandingModel } from '../model/storage/BrandingModel';

import axios from 'axios';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const luceneEscapeQueryModule = require('lucene-escape-query') as Record<string, unknown> | ((value: string) => string);
const luceneEscapeQuery: (value: string) => string =
  typeof luceneEscapeQueryModule === 'function'
    ? luceneEscapeQueryModule
    : (((luceneEscapeQueryModule as Record<string, unknown>).escape ||
      (luceneEscapeQueryModule as Record<string, unknown>).default) as (value: string) => string);
import { DateTime } from 'luxon';

import { isObservable } from 'rxjs';

import { Readable } from 'stream';
import { FormAttributes } from '../waterline-models';

export namespace Services {
  type AnyRecord = Record<string, unknown>;
  type RecordTypeLike = Partial<RecordTypeModel> & AnyRecord;
  type BootstrapRecordMetadata = Record<string, unknown>;
  type RecordWithMeta = AnyRecord & {
    metaMetadata?: AnyRecord;
    metadata?: AnyRecord;
    authorization?: AnyRecord;
  };
  const DEFAULT_BOOTSTRAP_DATA_PATH = 'bootstrap-data';
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
      this.logHeader = 'RecordsService::';
    }

    private asArray(value: unknown): string[] | undefined {
      if (Array.isArray(value)) {
        return value as string[];
      }
      if (typeof value === 'string') {
        return [value];
      }
      return undefined;
    }

    private normalizeRecord(record: AnyRecord): RecordWithMeta {
      const recordObj = record as RecordWithMeta;
      recordObj.metaMetadata = (recordObj.metaMetadata ?? {}) as AnyRecord;
      recordObj.metadata = (recordObj.metadata ?? {}) as AnyRecord;
      recordObj.authorization = (recordObj.authorization ?? {}) as AnyRecord;

      const authorization = recordObj.authorization as AnyRecord;

      authorization.edit = authorization.edit ?? this.asArray(recordObj.authorization_edit);
      authorization.view = authorization.view ?? this.asArray(recordObj.authorization_view);
      authorization.editRoles = authorization.editRoles ?? this.asArray(recordObj.authorization_editRoles);
      authorization.viewRoles = authorization.viewRoles ?? this.asArray(recordObj.authorization_viewRoles);
      authorization.editPending = authorization.editPending ?? this.asArray(recordObj.authorization_editPending);
      authorization.viewPending = authorization.viewPending ?? this.asArray(recordObj.authorization_viewPending);
      return recordObj;
    }

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    private getBootstrapDataPath(): string {
      const configuredPath = _.get(sails.config, 'bootstrap.bootstrapDataPath', DEFAULT_BOOTSTRAP_DATA_PATH);
      return path.resolve(String(configuredPath), 'records');
    }

    private getRecordTypeFromFileName(fileName: string): string {
      return path.basename(fileName, path.extname(fileName)).trim();
    }

    private getBootstrapOid(recordType: string, index: number, metadata: BootstrapRecordMetadata): string {
      const inputOid = typeof metadata.redboxOid === 'string' ? metadata.redboxOid.trim() : '';
      if (inputOid) {
        return inputOid;
      }
      const safeRecordType = recordType.replace(/[^a-zA-Z0-9_-]/g, '-');
      return `bootstrap-${safeRecordType}-${index + 1}`;
    }

    public async bootstrapData(): Promise<void> {
      this.getStorageService(this);
      const bootstrapPath = this.getBootstrapDataPath();
      let fileNames: string[] = [];

      try {
        const fileEntries = await fs.readdir(bootstrapPath, { withFileTypes: true });
        fileNames = fileEntries
          .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
          .map(entry => entry.name)
          .sort((a, b) => a.localeCompare(b));
      } catch (error) {
        const ioError = error as NodeJS.ErrnoException;
        if (ioError.code === 'ENOENT') {
          sails.log.verbose(`Records bootstrap data path not found: ${bootstrapPath}`);
          return;
        }
        sails.log.error(`Failed to read records bootstrap data path: ${bootstrapPath}`, error);
        return;
      }

      const defaultBrand = BrandingService.getDefault();
      if (!defaultBrand) {
        sails.log.error('Unable to resolve default branding for records bootstrap data');
        return;
      }

      const bootstrapUser = { username: 'bootstrap-data' };
      for (const fileName of fileNames) {
        const recordType = this.getRecordTypeFromFileName(fileName);
        if (!recordType) {
          sails.log.error(`Skipping records bootstrap file with invalid record type name: ${fileName}`);
          continue;
        }
        let recordTypeModel: unknown = null;
        try {
          recordTypeModel = await firstValueFrom(RecordTypesService.get(defaultBrand, recordType));
        } catch (error) {
          sails.log.warn(`Record type lookup failed for '${recordType}', using bootstrap-safe create path.`);
        }
        if (!recordTypeModel) {
          sails.log.warn(`No configured record type found for '${recordType}', using bootstrap-safe create path.`);
        }

        const filePath = path.join(bootstrapPath, fileName);
        let parsed: unknown;
        try {
          const content = await fs.readFile(filePath, 'utf8');
          parsed = JSON.parse(content);
        } catch (error) {
          sails.log.error(`Failed to read records bootstrap file: ${fileName}`, error);
          continue;
        }

        if (!Array.isArray(parsed)) {
          sails.log.error(`Skipping records bootstrap file with invalid format (expected array): ${fileName}`);
          continue;
        }

        for (let index = 0; index < parsed.length; index++) {
          const metadata = parsed[index] as BootstrapRecordMetadata;
          if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
            sails.log.error(`Skipping invalid record metadata entry at index ${index} in ${fileName}`);
            continue;
          }

          const redboxOid = this.getBootstrapOid(recordType, index, metadata);
          const bootstrapSeedId = `${recordType}:${index + 1}`;
          const metadataWithSeed = {
            ...metadata,
            bootstrapSeedId,
          };
          try {
            const existing = await Record.findOne({
              or: [{ redboxOid }, { 'metadata.bootstrapSeedId': bootstrapSeedId }],
            }).meta({ enableExperimentalDeepTargets: true });

            if (existing) {
              sails.log.verbose(`Skipping existing records bootstrap entry: ${redboxOid}`);
              continue;
            }

            const createResponse = await this.create(
              defaultBrand,
              {
                redboxOid,
                metadata: metadataWithSeed,
                metaMetadata: { type: recordType },
              },
              recordTypeModel,
              bootstrapUser,
              true,
              true
            );
            if (createResponse?.isSuccessful?.()) {
              sails.log.verbose(`Created records bootstrap entry: ${redboxOid}`);
            } else {
              sails.log.error(`Failed to create records bootstrap entry: ${redboxOid}`);
            }
          } catch (error) {
            sails.log.error(`Failed to create records bootstrap entry: ${redboxOid}`, error);
          }
        }
      }
    }

    public override init() {
      const that = this;
      this.registerSailsHook(
        'after',
        ['hook:redbox:storage:ready', 'hook:redbox:datastream:ready', 'ready'],
        function () {
          that.getDatastreamService(that);
          that.searchService = sails.services[sails.config.search.serviceName] as unknown as SearchService;
          that.queueService = sails.services[sails.config.queue.serviceName] as unknown as QueueService;
        }
      );
    }

    getStorageService(ref: Records = this) {
      if (_.isEmpty(sails.config.storage) || _.isEmpty(sails.config.storage.serviceName)) {
        ref.storageService = RedboxJavaStorageService as StorageService;
      } else {
        ref.storageService = sails.services[sails.config.storage.serviceName] as unknown as StorageService;
      }
    }

    getDatastreamService(ref: Records = this) {
      if (_.isEmpty(sails.config.record) || _.isEmpty(sails.config.record.datastreamService)) {
        ref.datastreamService = RedboxJavaStorageService as DatastreamService;
      } else {
        const datastreamServiceName = sails.config.record.datastreamService as string;
        ref.datastreamService = sails.services[datastreamServiceName] as unknown as DatastreamService;
        sails.log.verbose(`${ref.logHeader} Using datastreamService: ${datastreamServiceName}`);
      }
    }

    getSearchService() {
      if (_.isEmpty(sails.config.storage) || _.isEmpty(sails.config.search.serviceName)) {
        this.searchService = SolrSearchService;
      } else {
        this.searchService = sails.services[sails.config.search.serviceName] as unknown as SearchService;
      }
    }

    protected override _exportedMethods: string[] = [
      'create',
      'updateMeta',
      'getMeta',
      'getRecordAudit',
      'hasEditAccess',
      'hasViewAccess',
      'createBatch',
      'provideUserAccessAndRemovePendingAccess',
      'searchFuzzy',
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
      'bootstrapData',
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
      'init',
    ];

    protected initRecordMetaMetadata(
      brandId: string,
      username: string,
      recordType: unknown,
      metaMetadataWorkflowStep: unknown,
      form: unknown,
      dateCreated: string
    ): unknown {
      const metaMetadata = {};
      const recordTypeObj = recordType as AnyRecord;
      const formObj = (form ?? {}) as AnyRecord;
      if (recordTypeObj.packageType) {
        _.set(metaMetadata, 'packageType', recordTypeObj.packageType);
      }

      if (recordTypeObj.packageName) {
        _.set(metaMetadata, 'packageName', recordTypeObj.packageName);
      }
      _.set(metaMetadata, 'brandId', brandId);
      _.set(metaMetadata, 'createdBy', username);
      _.set(metaMetadata, 'type', recordTypeObj.name);
      _.set(metaMetadata, 'searchCore', recordTypeObj.searchCore);

      if (!_.isEmpty(dateCreated)) {
        _.set(metaMetadata, 'createdOn', dateCreated);
        _.set(metaMetadata, 'lastSaveDate', dateCreated);
      }

      _.set(metaMetadata, 'form', _.get(metaMetadataWorkflowStep, 'config.form'));
      _.set(metaMetadata, 'attachmentFields', formObj.attachmentFields);

      return metaMetadata;
    }

    async create(
      brand: unknown,
      record: AnyRecord,
      recordType: unknown,
      user: AnyRecord = {},
      triggerPreSaveTriggers = true,
      triggerPostSaveTriggers = true,
      targetStep = null
    ) {
      const brandObj = brand as BrandingModel;
      const recordTypeObj = recordType as RecordTypeLike;
      let recordObj = this.normalizeRecord(record);
      const userObj = user as AnyRecord;
      const recordTypeName = String(recordTypeObj?.name ?? _.get(recordObj, 'metaMetadata.type', '')).trim();

      // Bootstrap-safe path when no configured RecordType/workflow exists.
      if (!recordTypeObj?.name) {
        if (!this.storageService || typeof this.storageService.create !== 'function') {
          throw new Error('RecordsService storageService is not initialized');
        }
        const meta = (recordObj.metaMetadata ?? {}) as AnyRecord;
        const nowIso = String(DateTime.local().toISO());
        meta.brandId = meta.brandId ?? String(brandObj?.id ?? '');
        meta.type = meta.type ?? recordTypeName;
        meta.createdBy = meta.createdBy ?? String(userObj?.username ?? 'unknown');
        meta.createdOn = meta.createdOn ?? nowIso;
        meta.lastSaveDate = meta.lastSaveDate ?? nowIso;
        recordObj.metaMetadata = meta;

        const authorization = (recordObj.authorization ?? {}) as AnyRecord;
        authorization.view = authorization.view ?? [];
        authorization.edit = authorization.edit ?? [];
        authorization.viewRoles = authorization.viewRoles ?? [];
        authorization.editRoles = authorization.editRoles ?? [];
        recordObj.authorization = authorization;
        recordObj.authorization_view = recordObj.authorization_view ?? authorization.view;
        recordObj.authorization_edit = recordObj.authorization_edit ?? authorization.edit;
        recordObj.authorization_viewRoles = recordObj.authorization_viewRoles ?? authorization.viewRoles;
        recordObj.authorization_editRoles = recordObj.authorization_editRoles ?? authorization.editRoles;

        const createResponse = await this.storageService.create(brandObj, recordObj, recordTypeObj, userObj);
        if (createResponse.isSuccessful()) {
          if (this.searchService && typeof this.searchService.index === 'function') {
            this.searchService.index(createResponse['oid'], recordObj);
          }
          await this.auditRecord(createResponse['oid'], recordObj, userObj, RecordAuditActionType.created);
        }
        return createResponse;
      }

      let wfStep = await firstValueFrom(WorkflowStepsService.getFirst(recordTypeObj));
      const formName = String(_.get(wfStep, 'config.form', ''));

      const form = await FormsService.getForm(brandObj, formName, true, recordTypeObj.name as string, recordObj);

      const username = String(userObj?.username ?? 'unknown');
      const brandId = String(brandObj.id ?? '');
      const metaMetadata = this.initRecordMetaMetadata(
        brandId,
        username,
        recordTypeObj,
        wfStep,
        form,
        String(DateTime.local().toISO())
      );
      _.set(recordObj, 'metaMetadata', metaMetadata);
      //set the initial workflow metadata to the first step
      this.setWorkflowStepRelatedMetadata(recordObj, wfStep);

      if (targetStep) {
        wfStep = await firstValueFrom(WorkflowStepsService.get(recordTypeObj, targetStep));
        recordObj = await this.triggerPreSaveTransitionWorkflowTriggers(
          null,
          recordObj,
          recordTypeObj,
          wfStep,
          userObj
        );
        this.setWorkflowStepRelatedMetadata(recordObj, wfStep);
      }

      let createResponse = new StorageServiceResponse();
      const failedMessage = 'Failed to created record, please check server logs.';
      // trigger the pre-save
      if (triggerPreSaveTriggers) {
        try {
          recordObj = await this.triggerPreSaveTriggers(null, recordObj, recordTypeObj, 'onCreate', userObj);
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to run pre-save hooks when onCreate...`);
          sails.log.error(err);
          createResponse.success = false;
          createResponse.message = RBValidationError.displayMessage({
            t: TranslationService,
            errors: [this.asError(err)],
            defaultMessage: failedMessage,
          });
          return createResponse;
        }
      }

      // save the record ...
      sails.log.verbose(`${this.logHeader} create() -> recordObj before save: ${JSON.stringify(recordObj)}`);
      createResponse = await this.storageService.create(brandObj, recordObj, recordTypeObj, userObj);
      if (createResponse.isSuccessful()) {
        const fieldsToCheck = ['location', 'uploadUrl'];
        const oid = createResponse.oid;
        sails.log.verbose(`RecordsService - create - oid ${oid}`);
        const recordMetadata = recordObj.metadata as AnyRecord;
        const attachmentFields = (recordObj.metaMetadata?.attachmentFields ?? []) as unknown[];
        if (!_.isEmpty(attachmentFields)) {
          // check if we have any pending-oid elements
          _.each(attachmentFields, (attFieldName: unknown) => {
            const attFieldKey = String(attFieldName ?? '');
            _.each(_.get(recordMetadata, attFieldKey) as unknown[], (attFieldEntry: unknown, attFieldIdx: unknown) => {
              if (!_.isEmpty(attFieldEntry)) {
                _.each(fieldsToCheck, (fldName: unknown) => {
                  const fldKey = String(fldName ?? '');
                  const fldVal = _.get(attFieldEntry as AnyRecord, fldKey);
                  if (!_.isEmpty(fldVal)) {
                    sails.log.verbose(`RecordsService - create - fldVal ${fldVal}`);
                    _.set(
                      recordMetadata,
                      `${attFieldKey}[${attFieldIdx}].${fldKey}`,
                      _.replace(String(fldVal), 'pending-oid', oid)
                    );
                  }
                });
              }
            });
          });

          try {
            // handle datastream update
            // we emtpy the data locations in cloned record so we can reuse the same `handleUpdateDataStream` method call
            const emptyDatastreamRecord = _.cloneDeep(recordObj);
            const emptyMetadata = emptyDatastreamRecord.metadata as AnyRecord;
            _.each(attachmentFields, (attFieldName: unknown) => {
              const attFieldKey = String(attFieldName ?? '');
              _.set(emptyMetadata, attFieldKey, []);
            });
            // update the datastreams in RB, this is a terminal call
            sails.log.verbose(`RecordsService - create - before handleUpdateDataStream`);
            await firstValueFrom(this.handleUpdateDataStream(oid, emptyDatastreamRecord, recordMetadata));
          } catch (error) {
            sails.log.error(`RecordsService - create - Failed to save record: ${error}`);
            throw new RBValidationError({
              message: `Failed to save record oid ${oid}`,
              options: { cause: error },
              displayErrors: [{ title: 'Failed to save record', meta: { oid } }],
            });
          }

          // update the metadata ...
          createResponse = await this.updateMeta(brandObj, oid, recordObj, userObj, false, false);
        }

        if (triggerPostSaveTriggers) {
          // post-save sync
          try {
            createResponse = (await this.triggerPostSaveSyncTriggers(
              createResponse['oid'],
              recordObj,
              recordTypeObj,
              'onCreate',
              userObj,
              createResponse as unknown as AnyRecord
            )) as unknown as StorageServiceResponse;
            if (this.hasPostSaveSyncHooks(recordTypeObj, 'onCreate')) {
              this.storageService.updateMeta(brandObj, oid, recordObj, userObj);
            }
          } catch (err) {
            sails.log.error(
              `${this.logHeader} Exception while running post save sync hooks when creating: ${createResponse['oid']}`
            );
            sails.log.error(JSON.stringify(err));
            createResponse.success = false;
            createResponse.message = RBValidationError.displayMessage({
              t: TranslationService,
              errors: [this.asError(err)],
              defaultMessage: failedMessage,
            });
            const metadata = { postSaveSyncWarning: 'true' };
            createResponse.metadata = metadata;
            sails.log.error('RecordsService create - error - createResponse ' + JSON.stringify(createResponse));
            return createResponse;
          }
          // Fire Post-save hooks async ...
          this.triggerPostSaveTriggers(createResponse['oid'], recordObj, recordTypeObj, 'onCreate', userObj);

          if (!_.isEmpty(targetStep)) {
            try {
              createResponse = (await this.triggerPostSaveTransitionWorkflowTriggers(
                createResponse['oid'],
                recordObj,
                recordTypeObj,
                wfStep,
                userObj,
                createResponse
              )) as unknown as StorageServiceResponse;
              if (createResponse && createResponse.isSuccessful()) {
                if (this.hasPostSaveSyncHooks(recordTypeObj, 'onTransitionWorkflow')) {
                  await this.storageService.updateMeta(brandObj, oid, recordObj, userObj);
                }
              } else {
                return createResponse;
              }
            } catch (tErr) {
              sails.log.error(
                'RecordsService - create - Failed to run post-save hooks when onTransitionWorkflow... or Error updating meta:'
              );
              sails.log.error(tErr);
              createResponse.success = false;
              createResponse.message = RBValidationError.displayMessage({
                t: TranslationService,
                errors: [this.asError(tErr)],
                defaultMessage: failedMessage,
              });
              return createResponse;
            }
          }
        }

        const recordOid = String(_.get(recordObj, 'redboxOid', ''));
        if (_.isEmpty(recordOid)) {
          sails.log.warn(
            `recordOid: '${recordOid}' is empty! Using response oid: ${createResponse['oid']} for solr index.`
          );
          this.searchService.index(createResponse['oid'], recordObj);
        } else {
          if (createResponse['oid'] !== recordOid) {
            sails.log.warn(`response oid: ${createResponse['oid']} is not the same as recordOid: ${recordOid}.`);
          }
          this.searchService.index(recordOid, recordObj);
        }

        await this.auditRecord(createResponse['oid'], recordObj, userObj, RecordAuditActionType.created);
      } else {
        sails.log.error(`${this.logHeader} Failed to create record, storage service response:`);
        sails.log.error(JSON.stringify(createResponse));
        createResponse.message = failedMessage;
      }
      return createResponse;
    }

    async updateMeta(
      brand: unknown,
      oid: string,
      record: AnyRecord,
      user: AnyRecord = {},
      triggerPreSaveTriggers: boolean = true,
      triggerPostSaveTriggers: boolean = true,
      nextStep: unknown = {},
      metadata: AnyRecord = {}
    ): Promise<StorageServiceResponse> {
      const brandObj = brand as BrandingModel;
      let recordObj = this.normalizeRecord(record);
      const recordMeta = recordObj.metaMetadata as AnyRecord;
      const userObj = user as AnyRecord;
      const nextStepObj = (nextStep ?? {}) as AnyRecord;
      let updateResponse: StorageServiceResponse = new StorageServiceResponse();
      const preTriggerResponse = new StorageServiceResponse();
      updateResponse.oid = oid;
      const failedMessage = 'Failed to update record, please check server logs.';
      let hasPermissionToTransition = true;
      const origRecord = _.cloneDeep(recordObj);
      const origRecordObj = this.normalizeRecord(origRecord as AnyRecord);
      sails.log.verbose(`RecordService - updateMeta - origRecord - cloneDeep`);
      //This is done after cloning record to preserve origRecord during processing
      if (!_.isEmpty(metadata)) {
        recordObj.metadata = metadata;
      }

      let recordType = null;
      if (!_.isEmpty(brand)) {
        recordType = await firstValueFrom(RecordTypesService.get(brandObj, recordMeta.type as string));
      }

      if (!_.isEmpty(nextStepObj) && !_.isEmpty(nextStepObj.config)) {
        const nextStepConfig = (nextStepObj.config ?? {}) as AnyRecord;
        const transitionRoles = (nextStepConfig.authorization as AnyRecord | undefined)?.transitionRoles as
          | unknown[]
          | undefined;
        if (transitionRoles != undefined) {
          if (transitionRoles.length > 0) {
            const validRoles = _.filter(transitionRoles, (role: unknown) => {
              const val = _.find((userObj.roles ?? []) as unknown[], (userRole: unknown) => {
                const userRoleObj = userRole as AnyRecord;
                return role == userRoleObj || role == userRoleObj.name;
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

        if (hasPermissionToTransition && !_.isEmpty(nextStepObj) && !_.isEmpty(recordType)) {
          try {
            sails.log.verbose(`RecordService - updateMeta - hasPermissionToTransition - enter`);
            sails.log.verbose(
              `RecordService - updateMeta triggerPreSaveTransitionWorkflowTriggers - before - nextStep ${JSON.stringify(nextStepObj)}`
            );
            recordObj = await this.triggerPreSaveTransitionWorkflowTriggers(
              updateResponse['oid'],
              recordObj,
              recordType,
              nextStepObj,
              userObj
            );
            this.transitionWorkflowStepMetadata(recordObj, nextStepObj);
          } catch (err) {
            sails.log.verbose('RecordService - updateMeta - onTransitionWorkflow triggerPreSaveTriggers error');
            sails.log.error(JSON.stringify(err));
            preTriggerResponse.success = false;
            preTriggerResponse.message = RBValidationError.displayMessage({
              t: TranslationService,
              errors: [this.asError(err)],
              defaultMessage: failedMessage,
            });
            return preTriggerResponse;
          }
        }
      }

      const brandId = recordMeta.brandId ?? brandObj?.id ? String(recordMeta.brandId ?? brandObj?.id) : undefined;
      const form: FormAttributes | null = await firstValueFrom(FormsService.getFormByName(String(recordMeta.form ?? ''), true, brandId));
      recordMeta.attachmentFields = form != undefined ? form.configuration?.attachmentFields ?? [] : [];

      // process pre-save
      if (!_.isEmpty(brand) && triggerPreSaveTriggers === true) {
        try {
          sails.log.verbose('RecordService - updateMeta - calling triggerPreSaveTriggers');
          recordType = await firstValueFrom(RecordTypesService.get(brandObj, recordMeta.type as string));
          recordObj = await this.triggerPreSaveTriggers(oid, recordObj, recordType, 'onUpdate', userObj);
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to run pre-save hooks when onUpdate...`);
          sails.log.error(err);
          updateResponse.success = false;
          updateResponse.message = RBValidationError.displayMessage({
            t: TranslationService,
            errors: [this.asError(err)],
            defaultMessage: failedMessage,
          });
          return updateResponse;
        }
      }

      sails.log.verbose(
        `RecordService - updateMeta - origRecord.metadata.dataLocations ` +
        JSON.stringify(origRecordObj.metadata?.dataLocations)
      );
      sails.log.verbose(
        `RecordService - updateMeta - record.metadata.dataLocations ` +
        JSON.stringify(recordObj.metadata?.dataLocations)
      );
      updateResponse = (await firstValueFrom(
        this.handleUpdateDataStream(oid, origRecordObj, recordObj.metadata ?? {})
      )) as StorageServiceResponse;
      sails.log.verbose(`RecordService - updateMeta - Done with updating streams...`);

      const fieldsToCheck = ['location', 'uploadUrl'];
      if (!_.isEmpty(recordMeta.attachmentFields)) {
        const recordMetadata = recordObj.metadata as AnyRecord;
        // check if we have any pending-oid elements
        _.each(recordMeta.attachmentFields as unknown[], (attFieldName: unknown) => {
          const attFieldKey = String(attFieldName ?? '');
          _.each(_.get(recordMetadata, attFieldKey) as unknown[], (attFieldEntry: unknown, attFieldIdx: unknown) => {
            if (!_.isEmpty(attFieldEntry)) {
              _.each(fieldsToCheck, (fldName: unknown) => {
                const fldKey = String(fldName ?? '');
                const fldVal = _.get(attFieldEntry as AnyRecord, fldKey);
                if (!_.isEmpty(fldVal)) {
                  sails.log.verbose(`RecordService - updateMeta - fldVal ${fldVal}`);
                  _.set(
                    recordMetadata,
                    `${attFieldKey}[${attFieldIdx}].${fldKey}`,
                    _.replace(String(fldVal), 'pending-oid', oid)
                  );
                }
              });
            }
          });
        });
      }
      // End of potential dead code

      // unsetting the ID just to be safe
      _.unset(recordObj, 'id');
      _.unset(recordObj, 'redboxOid');
      sails.log.verbose(`RecordService - updateMeta - before storageService.updateMeta`);
      //Some of the automated tests may be passing undefined or empty user
      if (!_.isUndefined(userObj) && !_.isEmpty(_.get(userObj, 'username', ''))) {
        recordMeta.lastSavedBy = _.get(userObj, 'username');
      }
      recordMeta.lastSaveDate = DateTime.local().toISO();
      // update
      updateResponse = await this.storageService.updateMeta(brandObj, oid, recordObj, userObj);
      sails.log.verbose('RecordService - updateMeta - updateResponse.isSuccessful ' + updateResponse.isSuccessful());
      if (updateResponse.isSuccessful()) {
        //if triggerPreSaveTriggers is false recordType will be empty even if triggerPostSaveTriggers is true
        //therefore try to set recordType if triggerPostSaveTriggers is true
        if (_.isEmpty(recordType) && !_.isEmpty(brand) && triggerPostSaveTriggers === true) {
          recordType = await firstValueFrom(RecordTypesService.get(brandObj, recordMeta.type as string));
        }
        // post-save async
        if (!_.isEmpty(recordType) && triggerPostSaveTriggers === true) {
          // Trigger Post-save sync hooks ...
          try {
            sails.log.verbose('RecordService - updateMeta - calling triggerPostSaveSyncTriggers');
            updateResponse = (await this.triggerPostSaveSyncTriggers(
              updateResponse['oid'],
              recordObj,
              recordType,
              'onUpdate',
              userObj,
              updateResponse as unknown as AnyRecord
            )) as unknown as StorageServiceResponse;
            if (this.hasPostSaveSyncHooks(recordType, 'onUpdate')) {
              await this.storageService.updateMeta(brandObj, oid, recordObj, userObj);
            }
          } catch (err) {
            sails.log.error(`${this.logHeader} Exception while running post save sync hooks when updating:`);
            sails.log.error(JSON.stringify(err));
            updateResponse.success = false;
            updateResponse.message = RBValidationError.displayMessage({
              t: TranslationService,
              errors: [this.asError(err)],
              defaultMessage: failedMessage,
            });
            const metadataRes = { postSaveSyncWarning: 'true' };
            updateResponse.metadata = metadataRes;
            sails.log.error('RecordsService - updateMeta - error - updateResponse ' + JSON.stringify(updateResponse));
            return updateResponse;
          }
          sails.log.verbose('RecordService - updateMeta - calling triggerPostSaveTriggers');
          // Fire Post-save hooks async ...
          this.triggerPostSaveTriggers(updateResponse['oid'], recordObj, recordType, 'onUpdate', userObj);

          if (hasPermissionToTransition && !_.isEmpty(nextStepObj)) {
            try {
              updateResponse = (await this.triggerPostSaveTransitionWorkflowTriggers(
                updateResponse['oid'],
                recordObj,
                recordType,
                nextStepObj,
                userObj,
                updateResponse
              )) as unknown as StorageServiceResponse;

              sails.log.verbose(
                `RecordService - updateMeta - triggerPostSaveTransitionWorkflowTriggers post save hook enter`
              );
              sails.log.verbose(JSON.stringify(updateResponse));
              if (updateResponse && updateResponse.isSuccessful()) {
                sails.log.verbose(`RecordService - updateMeta - triggerPostSaveTransitionWorkflowTriggers ajaxOk`);
                if (this.hasPostSaveSyncHooks(recordType, 'onTransitionWorkflow')) {
                  await this.storageService.updateMeta(brandObj, oid, recordObj, userObj);
                }
              } else {
                sails.log.verbose(
                  `RecordService - updateMeta - triggerPostSaveTransitionWorkflowTriggers post save hook not successful`
                );
                return updateResponse;
              }
            } catch (tErr) {
              sails.log.error(
                'RecordService - updateMeta - Failed to run post-save hooks when onTransitionWorkflow... or Error updating meta:'
              );
              sails.log.error(tErr);
              updateResponse.success = false;
              updateResponse.message = RBValidationError.displayMessage({
                t: TranslationService,
                errors: [this.asError(tErr)],
                defaultMessage: failedMessage,
              });
              return updateResponse;
            }
          }
        }
        this.searchService.index(oid, record);
        await this.auditRecord(updateResponse['oid'], record, user, RecordAuditActionType.updated);
      } else {
        sails.log.error(`${this.logHeader} Failed to update record, storage service response:`);
        sails.log.error(JSON.stringify(updateResponse));
        updateResponse.success = false;
        updateResponse.message = failedMessage;
      }
      return updateResponse;
    }

    hasPostSaveSyncHooks(recordType: unknown, mode: string): boolean {
      const postSaveSyncHooks = _.get(recordType, `hooks.${mode}.postSync`, []);
      if (_.isArray(postSaveSyncHooks) && postSaveSyncHooks.length > 0) {
        return true;
      }
      return false;
    }

    getMeta(oid: string): Promise<RecordModel> {
      return this.storageService.getMeta(oid) as Promise<RecordModel>;
    }

    async getRecordAudit(params: RecordAuditParams): Promise<Record<string, unknown>[]> {
      const audit = (await this.storageService.getRecordAudit(params)) as Record<string, unknown>[];
      if (Array.isArray(audit) && audit.length === 0) {
        const storageServiceAny = this.storageService as unknown as AnyRecord;
        if (typeof storageServiceAny.createRecordAudit === 'function') {
          try {
            const data = new RecordAuditModel(params.oid, {}, {}, RecordAuditActionType.created);
            await (storageServiceAny.createRecordAudit as (...args: unknown[]) => Promise<unknown>)(data);
            const refreshed = (await this.storageService.getRecordAudit(params)) as Record<string, unknown>[];
            if (Array.isArray(refreshed) && refreshed.length > 0) {
              return refreshed;
            }
          } catch (err) {
            sails.log.error(`${this.logHeader} Failed to create fallback record audit:`);
            sails.log.error(JSON.stringify(err));
          }
        }
        const fallbackDate = new Date();
        const dateFrom = params.dateFrom instanceof Date ? params.dateFrom : null;
        const dateTo = params.dateTo instanceof Date ? params.dateTo : null;
        const inRange = (!dateFrom || fallbackDate >= dateFrom) && (!dateTo || fallbackDate <= dateTo);
        if (!inRange) {
          return [] as Record<string, unknown>[];
        }
        return [
          {
            redboxOid: params.oid,
            action: RecordAuditActionType.created,
            user: {},
            record: {},
            dateCreated: fallbackDate.toISOString(),
          },
        ] as Record<string, unknown>[];
      }
      return audit;
    }

    createBatch(type: unknown, data: AnyRecord, harvestIdFldName: unknown): Promise<unknown> {
      return this.storageService.createBatch(type, data, harvestIdFldName);
    }

    provideUserAccessAndRemovePendingAccess(oid: string, userid: unknown, pendingValue: unknown): void {
      this.storageService.provideUserAccessAndRemovePendingAccess(oid, userid, pendingValue);
    }

    getRelatedRecords(oid: string, brand: unknown): Promise<unknown> {
      return this.storageService.getRelatedRecords(oid, brand);
    }

    async delete(oid: string, permanentlyDelete: boolean, currentRec: unknown, recordType: unknown, user: AnyRecord) {
      let currentRecObj = currentRec as AnyRecord;
      const recordTypeObj = recordType as RecordTypeLike;
      const preTriggerResponse = new StorageServiceResponse();
      const failedMessage = 'Failed to delete record, please check server logs.';
      try {
        sails.log.verbose('RecordsService - delete - triggerPreSaveTriggers onDelete');
        preTriggerResponse.oid = oid;
        currentRecObj = await this.triggerPreSaveTriggers(oid, currentRecObj, recordTypeObj, 'onDelete', user);
      } catch (err) {
        sails.log.verbose('RecordsService - delete - triggerPreSaveTriggers onDelete error');
        sails.log.error(JSON.stringify(err));
        preTriggerResponse.success = false;
        preTriggerResponse.message = RBValidationError.displayMessage({
          t: TranslationService,
          errors: [this.asError(err)],
          defaultMessage: failedMessage,
        });
        return preTriggerResponse;
      }

      let response = await this.storageService.delete(oid, permanentlyDelete);
      if (response.isSuccessful()) {
        const action: RecordAuditActionType = permanentlyDelete
          ? RecordAuditActionType.destroyed
          : RecordAuditActionType.deleted;
        await this.auditRecord(oid, {}, user, action);
        this.searchService.remove(oid);

        try {
          sails.log.verbose('RecordsService - delete - calling triggerPostSaveSyncTriggers');
          response = (await this.triggerPostSaveSyncTriggers(
            oid,
            currentRecObj,
            recordTypeObj,
            'onDelete',
            user,
            response as unknown as AnyRecord
          )) as unknown as StorageServiceResponse;
        } catch (err) {
          sails.log.error(`RecordsService - delete - Exception while running post delate sync hooks when updating:`);
          sails.log.error(JSON.stringify(err));
          response.success = false;
          response.message = RBValidationError.displayMessage({
            t: TranslationService,
            errors: [this.asError(err)],
            defaultMessage: failedMessage,
          });
          const metadata = { postSaveSyncWarning: 'true' };
          response.metadata = metadata;
          sails.log.error('RecordsService - delete - error - triggerPostSaveSyncTriggers ' + JSON.stringify(response));
          return response;
        }
        sails.log.verbose('RecordService - delete - calling triggerPostSaveTriggers');

        this.triggerPostSaveTriggers(oid, currentRecObj, recordTypeObj, 'onDelete', user);
      }
      return response;
    }

    updateNotificationLog(oid: string, record: AnyRecord, options: AnyRecord): Promise<unknown> {
      return this.storageService.updateNotificationLog(oid, record, options);
    }

    public getRecords(
      workflowState: string,
      recordType: unknown = undefined,
      start: unknown,
      rows: unknown = 10,
      username: unknown,
      roles: AnyRecord[],
      brand: unknown,
      editAccessOnly: unknown = undefined,
      packageType: unknown = undefined,
      sort: unknown = undefined,
      fieldNames: unknown = undefined,
      filterString: unknown = undefined,
      filterMode: unknown = undefined,
      secondarySort: unknown = undefined
    ): Promise<StorageServiceResponse> {
      return this.storageService.getRecords(
        workflowState,
        recordType,
        start,
        rows,
        username,
        roles,
        brand,
        editAccessOnly,
        packageType,
        sort,
        fieldNames,
        filterString,
        filterMode,
        secondarySort
      );
    }

    public exportAllPlans(
      username: unknown,
      roles: AnyRecord[],
      brand: unknown,
      format: unknown,
      modBefore: unknown,
      modAfter: unknown,
      recType: unknown
    ): Readable {
      return this.storageService.exportAllPlans(username, roles, brand, format, modBefore, modAfter, recType);
    }

    // Gets attachments for this record, will use the `sails.config.record.datastreamService` if set, otherwise will use this service
    //
    // Params:
    // oid - record idea
    // labelFilterStr - set if you want to be selective in your attachments, will just run a simple `.indexOf`
    public async getAttachments(
      oid: string,
      labelFilterStr: string | undefined = undefined
    ): Promise<Record<string, unknown>[]> {
      sails.log.verbose(`RecordsService::Getting attachments of ${oid}`);
      const datastreams = (await this.datastreamService.listDatastreams(oid, '')) as AnyRecord[];
      const attachments: Record<string, unknown>[] = [];
      _.each(datastreams, (datastream: unknown) => {
        const datastreamObj = datastream as AnyRecord;
        let attachment: Record<string, unknown> = {};
        attachment['dateUpdated'] = DateTime.fromJSDate(
          new Date(datastreamObj['uploadDate'] as string | number | Date)
        ).toISO();
        attachment['label'] = _.get(datastreamObj.metadata, 'name');
        attachment['contentType'] = _.get(datastreamObj.metadata, 'mimeType');
        attachment = _.merge(attachment, datastreamObj.metadata);
        if (_.isUndefined(labelFilterStr) && _.isEmpty(labelFilterStr)) {
          attachments.push(attachment);
        } else {
          if (datastreamObj['label'] && (datastreamObj['label'] as string).indexOf(labelFilterStr as string) != -1) {
            attachments.push(attachment);
          }
        }
      });
      return attachments;
    }

    /*
     *
     */
    public async checkRedboxRunning(): Promise<unknown> {
      // check if a valid storage plugin is loaded....
      if (!_.isEmpty(sails.config.storage)) {
        sails.log.info('ReDBox storage plugin is active!');
        return true;
      }
      const retries = 1000;
      for (let i = 0; i < retries; i++) {
        try {
          const response = (await this.info()) as AnyRecord;
          if (response['applicationVersion']) {
            return true;
          }
        } catch (_err) {
          sails.log.info("ReDBox Storage hasn't started yet. Retrying...");
        }
        await this.sleep(1000);
      }
      return false;
    }

    public async auditRecord(
      id: string,
      record: AnyRecord,
      user: AnyRecord,
      action: RecordAuditActionType = RecordAuditActionType.updated
    ) {
      const auditingEnabled = sails.config.record.auditing.enabled as unknown;
      if (auditingEnabled !== true && auditingEnabled !== 'true') {
        sails.log.verbose(`${this.logHeader} Not enabled. Skipping auditing`);
        return;
      }
      sails.log.verbose(`${this.logHeader} adding record audit job: ${id} with data:`);
      _.unset(user, 'password');
      _.unset(user, 'token');
      // storage_id is used as the main ID in searches
      const data = new RecordAuditModel(id, record, user, action);
      sails.log.verbose(JSON.stringify(data));
      const envName = String((sails.config as AnyRecord).environment ?? process.env.NODE_ENV ?? '');
      if (envName === 'integrationtest') {
        const storageServiceAny = this.storageService as unknown as AnyRecord;
        try {
          await (storageServiceAny.createRecordAudit as (...args: unknown[]) => Promise<unknown>)(data);
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to create record audit in integrationtest:`);
          sails.log.error(JSON.stringify(err));
        }
        return;
      }
      if (this.queueService == null) {
        sails.log.verbose(`${this.logHeader} Queue service isn't defined. Skipping auditing`);
        return;
      }
      this.queueService.now(sails.config.record.auditing.recordAuditJobName, data);
    }

    public storeRecordAudit(job: AnyRecord) {
      const jobObj = job as AnyRecord;
      const jobAttrs = (jobObj.attrs ?? {}) as AnyRecord;
      const data = ((jobAttrs as AnyRecord).data ?? jobAttrs) as AnyRecord;
      sails.log.verbose(`${this.logHeader} Storing record Audit entry: `);
      sails.log.verbose(JSON.stringify(data));
      const storageServiceAny = this.storageService as unknown as AnyRecord;
      (storageServiceAny.createRecordAudit as (...args: unknown[]) => Promise<unknown>)(data)
        .then((response: unknown) => {
          const responseObj = response as StorageServiceResponse;
          if (responseObj.isSuccessful()) {
            sails.log.verbose(`${this.logHeader} Record Audit stored successfully `);
          } else {
            sails.log.error(`${this.logHeader} Failed to storeRecordAudit for record:`);
            sails.log.verbose(JSON.stringify(responseObj));
          }
        })
        .catch((err: unknown) => {
          sails.log.error(`${this.logHeader} Failed to storeRecordAudit for record: `);
          sails.log.error(JSON.stringify(err));
        });
    }

    private info(): Promise<unknown> {
      const options = this.getOptions(
        sails.config.record.baseUrl.redbox + sails.config.record.api.info.url,
        sails.config.record.api.info.method
      );

      return axios(options);
    }

    protected getOptions(
      url: string,
      method: string,
      oid: string | null = null,
      packageType: string | null = null,
      contentType = 'application/json; charset=utf-8'
    ) {
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
          Authorization: `Bearer ${((sails.config as AnyRecord).redbox as AnyRecord)?.apiKey}`,
          'Content-Type': contentType,
        },
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
    public async appendToRecord(
      targetRecordOid: string,
      linkData: unknown,
      fieldName: string,
      fieldType: string | undefined = undefined,
      targetRecord: unknown = undefined
    ) {
      sails.log.verbose(`RecordsService::Appending to record:${targetRecordOid}`);
      let targetRecordObj = targetRecord as AnyRecord;
      if (_.isEmpty(targetRecord)) {
        sails.log.verbose(`RecordsService::Getting record metadata:${targetRecordOid}`);
        targetRecordObj = (await this.getMeta(targetRecordOid)) as AnyRecord;
      }
      const existingData = _.get(targetRecordObj, fieldName);
      if (_.isUndefined(existingData)) {
        if (fieldType == 'array') {
          linkData = [linkData];
        }
      } else if (_.isArray(existingData)) {
        existingData.push(linkData);
        linkData = existingData;
      }
      _.set(targetRecordObj, fieldName, linkData);
      sails.log.verbose(`RecordsService::Updating record:${targetRecordOid}`);

      return await this.updateMeta(null, targetRecordOid, targetRecordObj);
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
    public async removeFromRecord(
      targetRecordOid: string,
      dataToRemove: unknown,
      fieldName: string,
      targetRecord: unknown = undefined
    ) {
      sails.log.verbose(`RecordsService::Removing field from record:${targetRecordOid}`);
      let targetRecordObj = targetRecord as AnyRecord;
      if (_.isEmpty(targetRecord)) {
        sails.log.verbose(`RecordsService::Getting record metadata:${targetRecordOid}`);
        targetRecordObj = (await this.getMeta(targetRecordOid)) as AnyRecord;
      }
      const existingData = _.get(targetRecordObj, fieldName);
      let removedData = existingData;
      if (_.isUndefined(existingData)) {
        // Data doesn't exist, nothing to remove
      } else if (_.isArray(existingData)) {
        removedData = _.remove(existingData, (dataElem: unknown) => {
          return _.isEqual(dataElem, dataToRemove);
        });
      } else {
        _.unset(targetRecordObj, fieldName);
      }
      sails.log.verbose(
        `RecordsService::Updating record, removing ${_.isString(removedData) ? removedData : JSON.stringify(removedData)} from:${targetRecordOid}`
      );

      return await this.updateMeta(null, targetRecordOid, targetRecordObj);
    }

    /**
     * Fine-grained access to the record, converted to sync.
     *
     */
    public hasViewAccess(brand: unknown, user: AnyRecord, roles: AnyRecord[], record: AnyRecord): boolean {
      const auth = record.authorization as AnyRecord | undefined;
      const editArr = auth ? auth.edit : record.authorization_edit;
      const editRolesArr = auth ? auth.editRoles : record.authorization_editRoles;
      const viewArr = auth ? auth.view : record.authorization_view;
      const viewRolesArr = auth ? auth.viewRoles : record.authorization_viewRoles;
      const uname = String(user.username ?? '');
      const brandObj = brand as BrandingModel;

      const combinedViewArr = _.union(this.asArray(viewArr) ?? [], this.asArray(editArr) ?? []);
      const combinedViewRolesArr = _.union(this.asArray(viewRolesArr) ?? [], this.asArray(editRolesArr) ?? []);

      const isInUserView = _.find(combinedViewArr, (username: unknown) => {
        return uname == username;
      });
      if (!_.isUndefined(isInUserView)) {
        return true;
      }
      const isInRoleView = _.find(combinedViewRolesArr, (roleName: unknown) => {
        const role = RolesService.getRole(brandObj, String(roleName));
        return (
          role &&
          !_.isUndefined(
            _.find(roles, (r: AnyRecord) => {
              return role.id == r.id;
            })
          )
        );
      });
      return !_.isUndefined(isInRoleView);
    }

    /**
     * Fine-grained access to the record, converted to sync.
     *
     */
    public hasEditAccess(brand: unknown, user: AnyRecord, roles: AnyRecord[], record: AnyRecord): boolean {
      const auth = record.authorization as AnyRecord | undefined;
      const editArr = auth ? auth.edit : record.authorization_edit;
      const editRolesArr = auth ? auth.editRoles : record.authorization_editRoles;
      const uname = String(user.username ?? '');
      const brandObj = brand as BrandingModel;

      const isInUserEdit = _.find(this.asArray(editArr), (username: unknown) => {
        return uname == username;
      });
      if (!_.isUndefined(isInUserEdit)) {
        return true;
      }
      const isInRoleEdit = _.find(this.asArray(editRolesArr), (roleName: unknown) => {
        const role = RolesService.getRole(brandObj, String(roleName));
        return (
          role &&
          !_.isUndefined(
            _.find(roles, (r: AnyRecord) => {
              return role.id == r.id;
            })
          )
        );
      });
      return !_.isUndefined(isInRoleEdit);
    }

    public searchFuzzy(
      type: unknown,
      workflowState: string,
      searchQuery: unknown,
      exactSearches: unknown,
      facetSearches: unknown,
      brand: unknown,
      user: AnyRecord,
      roles: AnyRecord[],
      returnFields: unknown
    ): Promise<unknown> {
      const username = user.username;
      const brandObj = brand as BrandingModel;
      const typeStr = String(type ?? '');
      const searchQueryStr = String(searchQuery ?? '');
      const exactSearchArr = (exactSearches ?? []) as AnyRecord[];
      const facetSearchArr = (facetSearches ?? []) as AnyRecord[];
      const returnFieldsArr = (returnFields ?? []) as string[];
      // const url = `${this.getSearchTypeUrl(type, searchField, searchStr)}&start=0&rows=${sails.config.record.export.maxRecords}`;
      let searchParam = workflowState ? ` AND workflow_stage:${workflowState} ` : '';
      searchParam = `${searchParam} AND full_text:${searchQueryStr}`;
      _.forEach(exactSearchArr, (exactSearch: AnyRecord) => {
        searchParam = `${searchParam}&fq=${exactSearch.name}:${this.luceneEscape(String(exactSearch.value))}`;
      });
      if (facetSearchArr.length > 0) {
        searchParam = `${searchParam}&facet=true`;
        _.forEach(facetSearchArr, (facetSearch: AnyRecord) => {
          searchParam = `${searchParam}&facet.field=${facetSearch.name}${_.isEmpty(facetSearch.value) ? '' : `&fq=${facetSearch.name}:${this.luceneEscape(String(facetSearch.value))}`}`;
        });
      }

      let url = `${sails.config.record.baseUrl.redbox}${sails.config.record.api.search.url}?q=metaMetadata_brandId:${brandObj.id} AND metaMetadata_type:${typeStr}${searchParam}&version=2.2&wt=json&sort=date_object_modified desc`;
      url = this.addAuthFilter(url, username, roles, brandObj, false);
      sails.log.debug(`Searching fuzzy using: ${url}`);
      const options = this.getOptions(url, sails.config.record.api.search.method);

      return firstValueFrom(
        from(axios(options)).pipe(
          flatMap(resp => {
            const response = resp as unknown as AnyRecord;
            const customResp: AnyRecord = {
              records: [],
            };
            _.forEach(((response.response as AnyRecord)?.docs ?? []) as AnyRecord[], (solrdoc: AnyRecord) => {
              const customDoc: AnyRecord = {};
              _.forEach(returnFieldsArr, (retField: string) => {
                if (_.isArray(solrdoc[retField])) {
                  customDoc[retField] = solrdoc[retField][0];
                } else {
                  customDoc[retField] = solrdoc[retField];
                }
              });
              customDoc['hasEditAccess'] = this.hasEditAccess(brandObj, user, roles, solrdoc);
              (customResp.records as unknown[]).push(customDoc);
            });
            // check if have facets turned on...
            if (response.facet_counts) {
              customResp['facets'] = [];
              _.forOwn(
                (response.facet_counts as AnyRecord).facet_fields,
                (facet_field: unknown, facet_name: unknown) => {
                  const facetFieldArr = facet_field as unknown[];
                  const numFacetsValues = _.size(facetFieldArr) / 2;
                  const facetValues = [];
                  for (let i = 0, j = 0; i < numFacetsValues; i++) {
                    facetValues.push({
                      value: facetFieldArr[j++],
                      count: facetFieldArr[j++],
                    });
                  }
                  (customResp['facets'] as unknown[]).push({
                    name: String(facet_name),
                    values: facetValues,
                  });
                }
              );
            }
            return of(customResp);
          })
        )
      );
    }

    protected addAuthFilter(
      url: unknown,
      username: unknown,
      roles: AnyRecord[],
      brand: unknown,
      editAccessOnly: unknown = undefined
    ) {
      const brandObj = brand as AnyRecord;
      const usernameStr = String(username ?? '');
      let urlStr = String(url ?? '');
      let roleString = '';
      let matched = false;
      for (let i = 0; i < roles.length; i++) {
        const role = roles[i];
        if (role.branding == brandObj.id) {
          if (matched) {
            roleString += ' OR ';
            matched = false;
          }
          roleString += roles[i].name;
          matched = true;
        }
      }
      urlStr =
        urlStr +
        '&fq=authorization_edit:' +
        usernameStr +
        (editAccessOnly
          ? ''
          : ' OR authorization_view:' + usernameStr + ' OR authorization_viewRoles:(' + roleString + ')') +
        ' OR authorization_editRoles:(' +
        roleString +
        ')';
      return urlStr;
    }

    protected getSearchTypeUrl(type: unknown, searchField: string | null = null, searchStr: string | null = null) {
      const searchParam = searchField ? ` AND ${searchField}:${searchStr}*` : '';
      const redboxConfig = (sails.config as AnyRecord).redbox || '';
      return `${sails.config.record.baseUrl.redbox ?? redboxConfig}${sails.config.record.api.search.url}?q=metaMetadata_type:${type}${searchParam}&version=2.2&wt=json&sort=date_object_modified desc`;
    }

    protected luceneEscape(str: string) {
      return luceneEscapeQuery(String(str));
    }

    /**
     *  Pre-save trigger to clear and re-assign permissions based on security config
     *
     */
    public assignPermissions(_oid: string, _record: AnyRecord, _options: AnyRecord, _user: AnyRecord) {
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

    async restoreRecord(oid: string, user: AnyRecord): Promise<StorageServiceResponse> {
      const record = await this.storageService.restoreRecord(oid);
      this.searchService.index(oid, record as unknown as Record<string, unknown>);
      await this.auditRecord(oid, record as unknown as AnyRecord, user, RecordAuditActionType.restored);
      return record;
    }

    async destroyDeletedRecord(oid: string, user: AnyRecord): Promise<StorageServiceResponse> {
      const record = await this.storageService.destroyDeletedRecord(oid);
      await this.auditRecord(oid, record as unknown as AnyRecord, user, RecordAuditActionType.destroyed);
      return record;
    }

    async getDeletedRecords(
      workflowState: string,
      recordType: unknown,
      start: unknown,
      rows: unknown,
      username: unknown,
      roles: AnyRecord[],
      brand: unknown,
      editAccessOnly: unknown,
      packageType: unknown,
      sort: unknown,
      fieldNames?: unknown,
      filterString?: unknown,
      filterMode?: unknown
    ): Promise<StorageServiceResponse> {
      return await this.storageService.getDeletedRecords(
        workflowState,
        recordType,
        start,
        rows,
        username,
        roles,
        brand,
        editAccessOnly,
        packageType,
        sort,
        fieldNames,
        filterString,
        filterMode
      );
    }

    async createRecordAudit(record: AnyRecord): Promise<unknown> {
      const storageServiceAny = this.storageService as unknown as AnyRecord;
      return await (storageServiceAny.createRecordAudit as (...args: unknown[]) => Promise<unknown>)(record);
    }

    public async transitionWorkflowStep(
      _currentRec: unknown,
      _recordType: unknown,
      _nextStep: unknown,
      _user: AnyRecord,
      _triggerPreSaveTriggers: boolean = true,
      _triggerPostSaveTriggers: boolean = true
    ) {
      throw new Error(
        "Use separate calls to 'transitionWorkflowStepMetadata', 'triggerPreSaveTransitionWorkflowTriggers', and 'triggerPostSaveTransitionWorkflowTriggers' instead."
      );
    }

    public setWorkflowStepRelatedMetadata(currentRec: unknown, nextStep: unknown) {
      sails.log.warn('Deprecated call to setWorkflowStepRelatedMetadata. Use transitionWorkflowStepMetadata instead.');
      return this.transitionWorkflowStepMetadata(currentRec, nextStep);
    }

    public transitionWorkflowStepMetadata(currentRec: unknown, nextStep: unknown) {
      const currentRecObj = this.normalizeRecord(currentRec as AnyRecord);
      const nextStepObj = (nextStep ?? {}) as AnyRecord;
      const meta = currentRecObj.metaMetadata as AnyRecord;
      const metadata = currentRecObj.metadata as AnyRecord;
      sails.log.verbose(
        `transitionWorkflowStepMetadata - start - previousWorkflow: ${currentRecObj.previousWorkflow}; workflow: ${currentRecObj.workflow}; nextStep: ${nextStepObj}`
      );
      if (!_.isEmpty(nextStepObj)) {
        const config = nextStepObj.config as AnyRecord;
        currentRecObj.previousWorkflow = currentRecObj.workflow;
        currentRecObj.workflow = config.workflow;
        // TODO: validate data with form fields
        meta.form = config.form;
        // Check for JSON-LD config
        if (sails.config.jsonld.addJsonLdContext) {
          metadata['@context'] = sails.config.jsonld.contexts[meta.form as string];
        }
        //TODO: if this was all typed we probably don't need these sorts of initialisations
        if (currentRecObj.authorization == undefined) {
          currentRecObj.authorization = {
            viewRoles: [],
            editRoles: [],
            edit: [],
            view: [],
          };
        }

        // update authorizations based on workflow...
        const configAuth = config.authorization as AnyRecord;
        currentRecObj.authorization.viewRoles = configAuth.viewRoles;
        currentRecObj.authorization.editRoles = configAuth.editRoles;
      }
      sails.log.verbose(
        `transitionWorkflowStepMetadata - finish - previousWorkflow: ${currentRecObj.previousWorkflow}; workflow: ${currentRecObj.workflow}; nextStep: ${nextStepObj}`
      );
    }

    public async triggerPreSaveTransitionWorkflowTriggers(
      oid: string | null,
      record: AnyRecord,
      recordType: unknown,
      nextStep: unknown,
      user: unknown = {}
    ) {
      if (!_.isEmpty(nextStep)) {
        record = await this.triggerPreSaveTriggers(oid, record, recordType, 'onTransitionWorkflow', user);
      }
      return record;
    }

    public async triggerPostSaveTransitionWorkflowTriggers(
      oid: string | null,
      record: AnyRecord,
      recordType: unknown,
      nextStep: unknown,
      user: unknown = {},
      response: unknown = {}
    ) {
      let responseObj = response as AnyRecord;
      try {
        if (!_.isEmpty(nextStep)) {
          responseObj = (await this.triggerPostSaveSyncTriggers(
            oid,
            record,
            recordType,
            'onTransitionWorkflow',
            user,
            responseObj
          )) as AnyRecord;
        }
      } catch (err) {
        sails.log.error(
          `${this.logHeader} Exception while running post save sync hooks when transitioning workflow: ${JSON.stringify(err)}`
        );
        responseObj.success = false;
        responseObj.message = RBValidationError.displayMessage({
          t: TranslationService,
          errors: [this.asError(err)],
          defaultMessage: 'Failed to transition record workflow, please check server logs.',
        });
        responseObj.metadata = { postSaveSyncWarning: 'true' };
        sails.log.error(
          `RecordsService - triggerPostSaveTransitionWorkflowTriggers - error - response: ${JSON.stringify(responseObj)}`
        );
        return responseObj;
      }

      if (!_.isEmpty(nextStep)) {
        this.triggerPostSaveTriggers(oid, record, recordType, 'onTransitionWorkflow', user);
      }
      return responseObj;
    }

    public async triggerPreSaveTriggers(
      oid: string | null,
      record: AnyRecord,
      recordType: unknown,
      mode: string = 'onUpdate',
      user: unknown = {}
    ) {
      sails.log.verbose('Triggering pre save triggers for record type: ');
      sails.log.verbose(`hooks.${mode}.pre`);
      sails.log.verbose(JSON.stringify(recordType));

      const preSaveUpdateHooks = _.get(recordType, `hooks.${mode}.pre`, null) as AnyRecord[] | null;
      sails.log.debug(preSaveUpdateHooks);

      if (Array.isArray(preSaveUpdateHooks)) {
        for (let i = 0; i < preSaveUpdateHooks.length; i++) {
          const preSaveUpdateHook = preSaveUpdateHooks[i];
          const preSaveUpdateHookFunctionString = _.get(preSaveUpdateHook, 'function', null);
          if (preSaveUpdateHookFunctionString != null) {
            try {
              const preSaveUpdateHookFunction = eval(preSaveUpdateHookFunctionString as string);
              const options = _.get(preSaveUpdateHook, 'options', {}) as AnyRecord;
              sails.log.verbose(`Triggering pre save triggers: ${preSaveUpdateHookFunctionString}`);
              const hookResponse = preSaveUpdateHookFunction(oid, record, options, user);
              record = (await this.resolveHookResponse(hookResponse)) as AnyRecord;
              sails.log.debug(`${preSaveUpdateHookFunctionString} response now is:`);
              sails.log.verbose(JSON.stringify(record));
              sails.log.debug(`pre-save sync trigger ${preSaveUpdateHookFunctionString} completed for ${oid}`);
            } catch (err) {
              sails.log.error(
                `pre-save trigger ${preSaveUpdateHookFunctionString} failed to complete for oid ${oid} mode ${mode} user ${user}`
              );
              sails.log.error(err);
              throw new RBValidationError({
                message: `pre-save trigger ${preSaveUpdateHookFunctionString} failed to complete for oid ${oid} mode ${mode} user ${user}`,
                options: { cause: err },
                displayErrors: [{ title: 'Failed to save record', meta: { oid } }],
              });
            }
          }
        }
      }
      return record;
    }

    public async triggerPostSaveSyncTriggers(
      oid: string | null,
      record: AnyRecord,
      recordType: unknown,
      mode: string = 'onUpdate',
      user: unknown = {},
      response: AnyRecord = {}
    ): Promise<AnyRecord> {
      sails.log.debug('Triggering post save sync triggers ');
      sails.log.debug(`hooks.${mode}.postSync`);
      sails.log.debug(recordType);
      const postSaveSyncHooks = _.get(recordType, `hooks.${mode}.postSync`, null) as AnyRecord[] | null;
      if (Array.isArray(postSaveSyncHooks)) {
        for (let i = 0; i < postSaveSyncHooks.length; i++) {
          const postSaveSyncHook = postSaveSyncHooks[i];
          sails.log.debug(postSaveSyncHooks);
          const postSaveSyncHooksFunctionString = _.get(postSaveSyncHook, 'function', null);
          if (postSaveSyncHooksFunctionString != null) {
            const postSaveSyncHookFunction = eval(postSaveSyncHooksFunctionString as string);
            const options = _.get(postSaveSyncHook, 'options', {}) as AnyRecord;
            if (_.isFunction(postSaveSyncHookFunction)) {
              try {
                sails.log.debug(`Triggering post-save sync trigger: ${postSaveSyncHooksFunctionString}`);
                const hookResponse = postSaveSyncHookFunction(oid, record, options, user, response);
                const returnType = options.returnType == undefined ? 'record' : options.returnType;
                //TODO: response from these functions is not consistent, some return the record, some return the storage response
                if (returnType == 'record') {
                  record = (await this.resolveHookResponse(hookResponse)) as AnyRecord;
                } else {
                  response = (await this.resolveHookResponse(hookResponse)) as AnyRecord;
                }
                sails.log.debug(`${postSaveSyncHooksFunctionString} response now is:`);
                sails.log.verbose(JSON.stringify(response));
                sails.log.debug(`post-save sync trigger ${postSaveSyncHooksFunctionString} completed for ${oid}`);
              } catch (err) {
                sails.log.error(
                  `post-save async trigger ${postSaveSyncHooksFunctionString} failed to complete for oid ${oid} mode ${mode} user ${user}`
                );
                sails.log.error(err);
                throw new RBValidationError({
                  message: `post-save async trigger ${postSaveSyncHooksFunctionString} failed to complete for oid ${oid} mode ${mode} user ${user}`,
                  options: { cause: err },
                  displayErrors: [{ title: 'Failed to run processing after saving record', meta: { oid } }],
                });
              }
            } else {
              sails.log.error(
                `Post save function: '${postSaveSyncHooksFunctionString}' did not resolve to a valid function, what I got:`
              );
              sails.log.error(postSaveSyncHookFunction);
            }
          }
        }
      }
      return response;
    }

    public triggerPostSaveTriggers(
      oid: string | null,
      record: AnyRecord,
      recordType: unknown,
      mode: string = 'onUpdate',
      user: unknown = {}
    ): void {
      sails.log.debug('Triggering post save triggers ');
      sails.log.debug(`hooks.${mode}.post`);
      sails.log.debug(recordType);
      const postSaveCreateHooks = _.get(recordType, `hooks.${mode}.post`, null) as AnyRecord[] | null;
      if (Array.isArray(postSaveCreateHooks)) {
        _.each(postSaveCreateHooks, (postSaveCreateHook: unknown) => {
          sails.log.debug(postSaveCreateHook);
          const postSaveCreateHookFunctionString = _.get(postSaveCreateHook, 'function', null);
          if (postSaveCreateHookFunctionString != null) {
            const postSaveCreateHookFunction = eval(postSaveCreateHookFunctionString);
            const options = _.get(postSaveCreateHook, 'options', {}) as AnyRecord;
            if (_.isFunction(postSaveCreateHookFunction)) {
              //add try/catch just as an extra safety measure in case the function called
              //by the trigger is not correctly implemented (or old). In example: An old
              //function that is not async and retruns and Observable.of instead of a promise
              //and then throws an error. In this case the error is not caught by chained
              //.then().catch() and propagates to the front end and this has to be prevented
              try {
                const hookResponse = postSaveCreateHookFunction(oid, record, options, user);
                this.resolveHookResponse(hookResponse)
                  .then((_result: unknown) => {
                    sails.log.debug(`post-save trigger ${postSaveCreateHookFunctionString} completed for ${oid}`);
                  })
                  .catch((error: unknown) => {
                    sails.log.error(`post-save trigger ${postSaveCreateHookFunctionString} failed to complete`);
                    sails.log.error(error);
                  });
              } catch (err) {
                sails.log.error(
                  `post-save trigger external catch ${postSaveCreateHookFunctionString} failed to complete`
                );
                sails.log.error(err);
              }
            } else {
              sails.log.error(
                `Post save function: '${postSaveCreateHookFunctionString}' did not resolve to a valid function, what I got:`
              );
              sails.log.error(postSaveCreateHookFunction);
            }
          }
        });
      }
    }

    private resolveHookResponse(hookResponse: unknown): Promise<unknown> {
      if (isObservable(hookResponse)) {
        return firstValueFrom(hookResponse);
      }
      return Promise.resolve(hookResponse);
    }

    public async exists(oid: string) {
      return this.storageService.exists(oid);
    }

    public handleUpdateDataStream(oid: string, origRecord: unknown, metadata: AnyRecord) {
      const fileIdsAdded: Datastream[] = [];
      const stagingDisk = StorageManagerService.stagingDisk();
      return this.datastreamService.updateDatastream(oid, origRecord, metadata, stagingDisk, fileIdsAdded).pipe(
        concatMap((reqs: Promise<unknown>[]) => {
          if (Array.isArray(reqs) && reqs.length > 0) {
            sails.log.verbose(`Updating data streams...`);
            return from(reqs);
          }
          sails.log.verbose(`No datastreams to update...`);
          return of(null);
        }),
        concatMap((promise: Promise<unknown> | null) => {
          if (promise) {
            sails.log.verbose(`Update datastream request is...`);
            sails.log.verbose(JSON.stringify(promise));
            return from(promise).pipe(
              catchError((e: unknown) => {
                sails.log.verbose(`Error in updating stream::::`);
                sails.log.verbose(JSON.stringify(e));
                return throwError(new Error(TranslationService.t('attachment-upload-error')));
              })
            );
          }
          return of(null);
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
