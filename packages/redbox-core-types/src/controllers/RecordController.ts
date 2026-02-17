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
  Observable, of, from, throwError, firstValueFrom
} from 'rxjs';
import { mergeMap as flatMap, map } from 'rxjs/operators';
import {
  RecordTypeResponseModel,
  DashboardTypeResponseModel,
  Controllers as controllers,
  DatastreamService,
  RecordsService,
  SearchService,
  BrandingModel,
  RecordTypeModel, ErrorResponseItemV2,
  FormModel,
  RecordModel,
  UserModel,
  RoleModel,
} from '../index';
import { DateTime } from 'luxon';
import { Server as TusServer, EVENTS } from '@tus/server';
import type { Upload } from '@tus/server';
import type { DataStore } from '@tus/server';
import { FileStore } from '@tus/file-store';
import * as fs from 'fs';
import { default as checkDiskSpace } from 'check-disk-space';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';

type AnyRecord = Record<string, unknown>;

interface TusRequestExtension {
  _tusBaseUrl?: string;
  _tusOriginalUrl?: string;
}

type HeaderValue = string | number | ReadonlyArray<string>;


/**
 * Package that contains all Controllers.
 */

export namespace Controllers {
  /**
   * Responsible for all things related to a Record, includings Forms, etc.
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Record extends controllers.Core.Controller {

    recordsService!: RecordsService;
    searchService!: SearchService;
    datastreamService!: DatastreamService;

    public init(): void {
      this.recordsService = sails.services.recordsservice as unknown as RecordsService;
      this.datastreamService = sails.services.recordsservice as unknown as DatastreamService;

      const that = this;
      this.registerSailsHook('after', ['hook:redbox:storage:ready', 'hook:redbox:datastream:ready', 'ready'], function () {
        const datastreamServiceName = sails.config.record.datastreamService;
        sails.log.verbose(`RecordController ready, using datastream service: ${datastreamServiceName}`);
        if (datastreamServiceName != undefined) {
          that.datastreamService = sails.services[datastreamServiceName] as unknown as DatastreamService;
        }
        that.searchService = sails.services[sails.config.search.serviceName] as unknown as SearchService;
      });
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
      'init',
      'edit',
      'getForm',
      'create',
      'update',
      'stepTo',
      // 'modifyEditors',
      'search',
      'getType',
      'getWorkflowSteps',
      'getMeta',
      'getMetaDefault',
      'doAttachment',
      'getAttachments',
      'getPermissions',
      'getPermissionsInternal',
      'getDataStream',
      'getAllTypes',
      'delete',
      'getRelatedRecords',
      'render',
      'getRecordList',
      'listWorkspaces',
      'getAllDashboardTypes',
      'getDashboardType',
      'renderDeletedRecords',
      'getDeletedRecordList',
      'restoreRecord',
      'destroyDeletedRecord',
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {
      const attachConfig = sails.config.record.attachments;
      const storeType = attachConfig.store ?? 'file';

      if (storeType === 'file') {
        const targetDir = attachConfig.file?.directory ?? attachConfig.stageDir;
        if (!targetDir) {
          throw new Error('record.attachments.file.directory is required when store is "file"');
        }
        if (attachConfig.stageDir && !attachConfig.file?.directory) {
          sails.log.warn('DEPRECATED: record.attachments.stageDir - use record.attachments.file.directory instead');
        }
      } else if (storeType === 's3') {
        if (!attachConfig.s3?.bucket || !attachConfig.s3?.region) {
          throw new Error('record.attachments.s3.bucket and s3.region are required when store is "s3"');
        }
      }
    }

    private getErrorMessage(error: unknown): string {
      if (error instanceof Error) {
        return error.message;
      }
      return String(error);
    }

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    private getReqBrand(req: Sails.Req): BrandingModel {
      return BrandingService.getBrand(req.session.branding as string ?? '');
    }

    public async getMeta(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = req.param('oid') ?? '';
      if (oid == '') {
        return this.sendResp(req, res, { status: 400 });
      }

      try {
        const record = await this.recordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          return this.sendResp(req, res, { status: 404 });
        }
        const hasViewAccess = await firstValueFrom(this.hasViewAccess(brand, req.user ?? {}, record))
        if (hasViewAccess) {
          return this.sendResp(req, res, { data: record.metadata, meta: { oid: record.redboxOid }, v1: record.metadata });
        } else {
          return this.sendResp(req, res, {
            status: 403,
            displayErrors: [{ code: "error-403-heading" }],
            meta: { oid: record.redboxOid },
            v1: { status: "Access Denied" },
          });
        }
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: "Error retrieving metadata" }],
          meta: { oid: oid },
        });
      }
    }

    public async getMetaDefault(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const recordType = req.param('name') ?? '';
      const editMode = req.query.edit == "true";

      // TODO: is there a permission check needed for the default form config values?

      // get the default data model for the form with 'name'
      const form = await firstValueFrom(FormsService.getFormByStartingWorkflowStep(brand, recordType, editMode));
      const formMode = editMode ? "edit" : "view";
      const reusableFormDefs = sails.config.reusableFormDefinitions;
      const modelDataDefault = FormRecordConsistencyService.buildDataModelDefaultForFormConfig(form as unknown as FormConfigFrame, formMode, reusableFormDefs);

      // return the matching format, return the model data as json
      return this.sendResp(req, res, {
        data: modelDataDefault,
        meta: {
          formName: form?.name,
          recordType: recordType,
          editMode: editMode
        },
        v1: modelDataDefault,
      });
    }

    public edit(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = req.param('oid') ? req.param('oid') : '';
      let recordType = req.param('recordType') ? req.param('recordType') : '';
      const rdmp = req.query.rdmp ? req.query.rdmp : '';
      let localFormName;
      const locals = req.options?.['locals'] as AnyRecord | undefined;
      if (!_.isUndefined(locals) && !_.isNull(locals)) {
        localFormName = locals['localFormName'] as string;
      }
      const extFormName = localFormName ? localFormName : '';
      let appSelector = 'dmp-form';
      let appName = 'dmp';
      sails.log.debug('RECORD::APP: ' + appName);
      sails.log.debug('RECORD::APP formName: ' + extFormName);
      if (recordType != '' && extFormName == '') {
        FormsService.getFormByStartingWorkflowStep(brand, recordType, true).subscribe(form => {
          if (!form) {
            return this.sendResp(req, res, {
              status: 404,
              displayErrors: [{ detail: 'Form not found' }]
            });
          }
          if (form['customAngularApp'] != null) {
            appSelector = form['customAngularApp']['appSelector'];
            appName = form['customAngularApp']['appName'];
          }
          return this.sendView(req, res, 'record/edit', {
            oid: oid,
            rdmp: rdmp,
            recordType: recordType,
            formName: extFormName,
            appSelector: appSelector,
            appName: appName
          });
        });
      } else if (extFormName != '') {
        FormsService.getFormByName(extFormName, true).subscribe(form => {
          if (!form) {
            return this.sendResp(req, res, {
              status: 404,
              displayErrors: [{ detail: 'Form not found' }]
            });
          }
          if (form['customAngularApp'] != null) {
            appSelector = form['customAngularApp']['appSelector'];
            appName = form['customAngularApp']['appName'];
          }
          return this.sendView(req, res, 'record/edit', {
            oid: oid,
            rdmp: rdmp,
            recordType: recordType,
            formName: extFormName,
            appSelector: appSelector,
            appName: appName
          });
        }, error => {
          return this.sendResp(req, res, {
            errors: [this.asError(error)],
            displayErrors: [{ detail: "Failed to load form" }],
          });
        });
      } else {
        from(this.recordsService.getMeta(oid)).pipe(flatMap(record => {
          const formName = record.metaMetadata.form;
          return FormsService.getFormByName(formName, true);
        })).subscribe(form => {
          if (!form) {
            return this.sendResp(req, res, {
              status: 404,
              displayErrors: [{ detail: 'Form not found' }]
            });
          }
          sails.log.debug(form);
          if (form['customAngularApp'] != null) {
            appSelector = form['customAngularApp']['appSelector'];
            appName = form['customAngularApp']['appName'];
          }
          if (!recordType) {
            recordType = form['type'];
          }
          return this.sendView(req, res, 'record/edit', {
            oid: oid,
            rdmp: rdmp,
            recordType: recordType,
            formName: extFormName,
            appSelector: appSelector,
            appName: appName
          });
        }, _error => {
          return this.sendView(req, res, 'record/edit', {
            oid: oid,
            rdmp: rdmp,
            recordType: recordType,
            formName: extFormName,
            appSelector: appSelector,
            appName: appName
          });
        });

      }
    }

    protected hasEditAccess(brand: BrandingModel, user: AnyRecord | undefined, currentRec: AnyRecord): Observable<boolean> {
      sails.log.verbose("Current Record: ");
      sails.log.verbose(currentRec);
      const u = user ?? {};
      return of(this.recordsService.hasEditAccess(brand, u, (u['roles'] ?? []) as AnyRecord[], currentRec));
    }

    protected hasViewAccess(brand: BrandingModel, user: AnyRecord | undefined, currentRec: AnyRecord): Observable<boolean> {
      sails.log.verbose("Current Record: ");
      sails.log.verbose(currentRec);
      const u = user ?? {};
      return of(this.recordsService.hasViewAccess(brand, u, (u['roles'] ?? []) as AnyRecord[], currentRec));
    }

    public async getForm(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const recordType = req.param('name');
      const oid = req.param('oid')?.toString()?.trim() || null;
      const editMode = req.query.edit == "true";
      const formParam = req.param('formName');

      try {
        let form: FormModel | null = null;
        let currentRec: RecordModel | null = null;
        if (!oid) {
          //find form to create a record
          form = await firstValueFrom(FormsService.getFormByStartingWorkflowStep(brand, recordType, editMode));
          if (_.isEmpty(form)) {
            const msg = `Error, getting form for record type: ${recordType}`;
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ detail: msg }],
              v1: { message: msg },
            });
          }

        } else {
          // defaults to retrieve the form of the current workflow state...
          currentRec = await this.recordsService.getMeta(oid);
          if (_.isEmpty(currentRec)) {
            const msg = `Error, empty metadata for OID: ${oid}`;
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ detail: msg }],
              v1: { message: msg },
            });
          }

          // Get current user's access to record
          let hasAccess: boolean;
          if (editMode) {
            //find form to edit a record
            hasAccess = await firstValueFrom(this.hasEditAccess(brand, req.user, currentRec));
          } else {
            //find form to view a record
            hasAccess = await firstValueFrom(this.hasViewAccess(brand, req.user, currentRec));
          }

          // Check user's record access
          if (!hasAccess) {
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ code: 'view-error-no-permissions' }],
              v1: { message: TranslationService.t('view-error-no-permissions') }
            });
          }

          // get the form config
          form = await FormsService.getForm(brand, formParam, editMode, '', currentRec as RecordModel) as FormModel | null;
          if (_.isEmpty(form)) {
            const msg = `Error, getting form ${formParam} for OID: ${oid}`;
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ detail: msg }],
              v1: { message: msg }
            });
          }
          // let hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, req.user, currentRec));
          // FormsService.filterFieldsHasEditAccess(form.fields, hasEditAccess);
        }

        // process the form config to provide only the fields accessible by the current user
        const formMode = editMode ? "edit" : "view";
        const userRoles = ((req.user?.['roles'] ?? []) as AnyRecord[]).map((role: AnyRecord) => String(role['name'] ?? '')).filter((name: string) => !!name);
        const recordData = currentRec;
        const reusableFormDefs = sails.config.reusableFormDefinitions;
        const mergedForm = await FormsService.buildClientFormConfig(
          form as unknown as FormConfigFrame,
          formMode,
          userRoles,
          recordData?.metadata ?? null,
          reusableFormDefs,
          String(brand?.name ?? '')
        );

        // return the form config
        if (!_.isEmpty(mergedForm)) {
          return this.sendResp(req, res, {
            data: mergedForm,
            meta: { formName: formParam, recordType: recordType, oid: oid },
          });
        } else {
          const msg = `Failed to get form with name ${formParam} and record type ${recordType} and oid ${oid}`;
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: msg }],
            v1: { message: msg }
          });
        }

      } catch (error) {
        const displayError: ErrorResponseItemV2 = { title: "Error getting form definition" };
        let msg;
        const typedError = error as { error?: { code?: number }; message?: string };
        if (typedError.error && typedError.error.code == 500) {
          displayError.code = 'missing-record';
          msg = TranslationService.t('missing-record');
        } else {
          displayError.detail = typedError.message;
          msg = typedError.message;
        }
        return this.sendResp(req, res, {
          errors: [this.asError(error)],
          displayErrors: [displayError],
          v1: msg,
        });
      }
    }

    public create(req: Sails.Req, res: Sails.Res) {
      this.createInternal(req, res).then(() => { });
    }

    private async createInternal(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = this.getReqBrand(req);
        const metadata = req.body;
        const record: AnyRecord = {
          metaMetadata: {}
        };
        const recType = req.param('recordType');
        const targetStep = req.param('targetStep');
        record.authorization = {
          view: [req.user!['username']],
          edit: [req.user!['username']]
        };
        record.metadata = metadata;

        const recordType = await firstValueFrom(RecordTypesService.get(brand, recType));
        const user = req.user;

        sails.log.verbose(`RecordController - createRecord - enter`);
        const createResponse = await this.recordsService.create(brand, record, recordType, user, true, true, targetStep);

        if (createResponse && _.isFunction(createResponse.isSuccessful) && createResponse.isSuccessful()) {
          return this.sendResp(req, res, {
            data: await this.recordsService.getMeta(createResponse.oid),
            meta: { ...createResponse },
            v1: createResponse,
          });
        } else {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: createResponse.message }],
            meta: { ...createResponse },
          });
        }

      } catch (error) {
        return this.sendResp(req, res, {
          errors: [this.asError(error)],
          displayErrors: [{ detail: 'Failed to save record' }],
        });
      }
    }

    public async delete(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = req.param('oid');
      const user = req.user;
      const currentRec = await firstValueFrom(this.getRecord(oid));
      if (!_.isEmpty(brand)) {

        const hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, user, currentRec));

        if (hasEditAccess) {

          const recordType = await firstValueFrom(RecordTypesService.get(brand, currentRec.metaMetadata.type));

          const response = await this.recordsService.delete(oid, false, currentRec, recordType, user ?? {});

          if (response && response.isSuccessful()) {
            const resp = {
              success: true,
              oid: oid
            };
            sails.log.verbose(`RecordController - delete - Successfully deleted: ${oid}`);

            return this.sendResp(req, res, { data: resp });
          } else {
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ detail: response.message }]
            });
          }
        } else {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ code: 'edit-error-no-permissions' }]
          });
        }
      } else {
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ code: 'failed-delete' }]
        });
      }
    }

    public async restoreRecord(req: Sails.Req, res: Sails.Res) {
      const oid = req.param('oid');
      const msgFailed = TranslationService.t('failed-restore');
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'failed-restore' }],
          meta: { oid: oid },
          v1: {
            success: false,
            oid: oid,
            message: msgFailed
          },
        });
      }
      const user = req.user;
      const response = await this.recordsService.restoreRecord(oid, user ?? {});
      if (response && response.isSuccessful()) {
        const resp = {
          success: true,
          oid: oid
        };
        sails.log.verbose(`Successfully restored: ${oid}`);
        return this.sendResp(req, res, {
          data: await this.recordsService.getMeta(oid),
          meta: resp,
          v1: resp,
        });
      } else {
        const data = {
          success: false,
          oid: oid,
          message: response.message
        };
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ code: 'failed-restore', detail: response.message }],
          meta: { oid: oid },
          v1: data,
        });
      }
    }

    public async destroyDeletedRecord(req: Sails.Req, res: Sails.Res) {
      const oid = req.param('oid');
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'failed-destroy' }],
          meta: { oid: oid },
          v1: {
            success: false,
            oid: oid,
            message: TranslationService.t('failed-destroy')
          },
        });
      }
      const user = req.user;
      const response = await this.recordsService.destroyDeletedRecord(oid, user ?? {});
      if (response && response.isSuccessful()) {
        const resp = {
          success: true,
          oid: oid
        };
        sails.log.verbose(`Successfully destroyed: ${oid}`);
        return this.sendResp(req, res, { data: resp });
      } else {
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ code: 'failed-destroy' }],
          meta: { oid: oid },
          v1: {
            success: false,
            oid: oid,
            message: response.message
          },
        });
      }
    }

    public update(req: Sails.Req, res: Sails.Res) {
      this.updateInternal(req, res).then(() => { });
    }

    private async updateInternal(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = req.param('oid');
      const targetStep = req.param('targetStep');
      const shouldMerge = req.param('merge', 'false')?.toString() === 'true';
      // If the sync completed before the async is done, maybe the user is cleared?
      // So clone the user for the async triggers.
      const user = _.cloneDeep(req.user);
      let metadata = req.body;
      sails.log.verbose(`RecordController - updateInternal - enter`);

      const currentRec = await firstValueFrom(this.getRecord(oid));
      const hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, user, currentRec));
      if (!hasEditAccess) {
        return this.sendResp(req, res, { status: 403, displayErrors: [{ code: 'not-authorised' }] });
      }
      const recordType = await firstValueFrom(RecordTypesService.get(brand, currentRec.metaMetadata.type));
      let nextStepResp = null;
      if (targetStep) {
        nextStepResp = await firstValueFrom(WorkflowStepsService.get(recordType, targetStep));
      }

      let response;
      try {
        sails.log.verbose(`RecordController - updateInternal - before updateMeta`);
        if (shouldMerge) {
          metadata = this.mergeRecordMetadata(currentRec.metadata, metadata);
        }
        response = await this.recordsService.updateMeta(brand, oid, currentRec, user, true, true, nextStepResp, metadata);
        sails.log.verbose(JSON.stringify(response));
        if (response && response.isSuccessful()) {
          sails.log.verbose(`RecordController - updateInternal - before ajaxOk`);
          return this.sendResp(req, res, {
            data: await this.recordsService.getMeta(oid),
            meta: response ? { ...response } : undefined,
            v1: response,
          });
        } else {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: "Failed to get record data" }],
            meta: response ? { ...response } : undefined,
            v1: response,
          });
        }
      } catch (error) {
        const errorMessage = this.getErrorMessage(error);
        sails.log.error('RecordController - updateInternal - Failed to run post-save hooks when onUpdate... or Error updating meta:');
        return this.sendResp(req, res, {
          errors: [this.asError(error)],
          displayErrors: [{ detail: errorMessage }],
          meta: response ? { ...response } : undefined,
          v1: errorMessage,
        });
      }
    }

    //TODO: check if this deprecated?
    protected saveMetadata(brand: BrandingModel, oid: string, currentRec: AnyRecord, metadata: AnyRecord, user: AnyRecord): Observable<unknown> {
      currentRec.metadata = metadata;
      return this.updateMetadata(brand, oid, currentRec, user);
    }

    protected saveAuthorization(brand: BrandingModel, oid: string, currentRec: AnyRecord, authorization: unknown, user: AnyRecord): Observable<unknown> {
      const editAccessResp: Observable<boolean> = this.hasEditAccess(brand, user, currentRec);
      return editAccessResp
        .pipe(map(hasEditAccess => {
          if (hasEditAccess) {
            currentRec.authorization = authorization;
            return this.updateAuthorization(brand, oid, currentRec, user);
          } else {
            return {
              code: 403,
              message: "Not authorized to edit"
            };
          }
        }));
    }

    protected getRecord(oid: string): Observable<RecordModel> {
      return from(this.recordsService.getMeta(oid)).pipe(flatMap(currentRec => {
        if (_.isEmpty(currentRec)) {
          return throwError(new Error(`Failed to update meta, cannot find existing record with oid: ${oid}`));
        }
        return of(currentRec);
      }));
    }

    //TODO: check if this is deprecated?
    protected updateMetadata(brand: BrandingModel, oid: string, currentRec: AnyRecord, user: AnyRecord | undefined): Observable<unknown> {
      const metaMetadata = currentRec['metaMetadata'] as AnyRecord;
      if (metaMetadata['brandId'] != brand.id) {
        return throwError(new Error(`Failed to update meta, brand's don't match: ${metaMetadata['brandId']} != ${brand.id}, with oid: ${oid}`));
      }
      metaMetadata['lastSavedBy'] = user?.['username'];
      metaMetadata['lastSaveDate'] = DateTime.local().toISO();
      sails.log.verbose(`Calling record service...`);
      sails.log.verbose(currentRec);
      return from(this.recordsService.updateMeta(brand, oid, currentRec, user ?? {}));
    }

    protected updateAuthorization(brand: BrandingModel, oid: string, currentRec: AnyRecord, user: AnyRecord | undefined): Observable<unknown> {
      const metaMetadata = currentRec['metaMetadata'] as AnyRecord;
      if (metaMetadata['brandId'] != brand.id) {
        return throwError(new Error(`Failed to update meta, brand's don't match: ${metaMetadata['brandId']} != ${brand.id}, with oid: ${oid}`));
      }
      return from(this.recordsService.updateMeta(brand, oid, currentRec, user ?? {}));
    }

    public stepTo(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const metadata = req.body;
      const oid = req.param('oid');
      const targetStep = req.param('targetStep');
      let origRecord: RecordModel | null = null;
      return this.getRecord(oid).pipe(flatMap(currentRec => {
        origRecord = _.cloneDeep(currentRec);
        return this.hasEditAccess(brand, req.user, currentRec as AnyRecord)
          .pipe(flatMap(hasEditAccess => {
            if (!hasEditAccess) {
              return throwError(new Error(TranslationService.t('edit-error-no-permissions')));
            }
            return RecordTypesService.get(brand, origRecord!.metaMetadata.type);
          })
            , flatMap(recType => {
              return WorkflowStepsService.get(recType, targetStep)
                .pipe(flatMap(nextStep => {
                  currentRec.metadata = metadata;
                  sails.log.verbose("Current rec:");
                  sails.log.verbose(currentRec);
                  sails.log.verbose("Next step:");
                  sails.log.verbose(nextStep);
                  this.recordsService.setWorkflowStepRelatedMetadata(currentRec, nextStep as globalThis.Record<string, unknown>);
                  return this.updateMetadata(brand, oid, currentRec as AnyRecord, req.user);
                }));
            }))
      }))
        .subscribe((response: unknown) => {
          const responseValue = response as Observable<unknown>;
          return responseValue.subscribe((innerResp: unknown) => {
            const r = innerResp as AnyRecord & { isSuccessful?: () => boolean; success?: boolean };
            sails.log.error(r);
            if (r && r.isSuccessful?.()) {
              r.success = true;
              this.sendResp(req, res, { data: r });
            } else {
              this.sendResp(req, res, {
                status: 500,
                meta: r as AnyRecord,
                v1: r
              });
            }
          }, (error: Error) => {
            this.sendResp(req, res, {
              errors: [this.asError(error)],
              displayErrors: [{ title: "Error updating meta", detail: error.message }],
              v1: error.message
            });
          });
        });
    }

    public async search(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const type = req.param('type');
      let rows: string | number = req.param('rows');
      let page: string | number = req.param('page');
      let core = req.param('core');

      // If a record type is set, fetch from the configuration what core it's being sent from
      if (type != null) {
        const recordType: RecordTypeModel = await firstValueFrom(RecordTypesService.get(brand, type));
        core = recordType.searchCore ?? '';
      }
      if (_.isEmpty(rows)) {
        rows = 10
      }
      if (_.isEmpty(page)) {
        page = 1
      }
      let start = 0
      if (typeof page === 'string' && /^\d+$/.test(page)) {
        page = parseInt(page)
      }
      if (typeof rows === 'string' && /^\d+$/.test(rows)) {
        rows = parseInt(rows)
      }

      start = ((page as number) - 1) * (rows as number);

      const workflow = req.query.workflow;
      const searchString = req.query.searchStr;

      const exactNamesParam = req.query.exactNames;
      const exactSearchNames = _.isEmpty(exactNamesParam) ? [] : String(exactNamesParam).split(',');
      const exactSearches: Array<{ name: string; value: unknown }> = [];
      const facetNamesParam = req.query.facetNames;
      const facetSearchNames = _.isEmpty(facetNamesParam) ? [] : String(facetNamesParam).split(',');
      const facetSearches: Array<{ name: string; value: unknown }> = [];

      _.forEach(exactSearchNames, (exactSearch: string) => {
        exactSearches.push({
          name: exactSearch,
          value: req.query[`exact_${exactSearch}`]
        });
      });
      _.forEach(facetSearchNames, (facetSearch: string) => {
        facetSearches.push({
          name: facetSearch,
          value: req.query[`facet_${facetSearch}`]
        });
      });

      try {
        const user = req.user as UserModel;
        const searchRes = await this.searchService.searchFuzzy(core, type, workflow ?? '', searchString ?? '', exactSearches, facetSearches, brand, user, (user?.roles ?? []) as RoleModel[], sails.config.record.search.returnFields, start, rows as number);
        searchRes['page'] = page
        this.sendResp(req, res, { data: searchRes });
      } catch (error) {
        const errorMessage = this.getErrorMessage(error);
        this.sendResp(req, res, {
          errors: [this.asError(error)],
          v1: errorMessage,
        });
      }
    }
    /**
     * Returns the RecordType configuration based of the response model that is intentionally restricting
     * the object schema and information that is allowed to be sent back in this endpoint
     */
    public getType(req: Sails.Req, res: Sails.Res) {
      const recordType = req.param('recordType');
      const brand: BrandingModel = this.getReqBrand(req);
      RecordTypesService.get(brand, recordType).subscribe(recordType => {
        const recordTypeModel = new RecordTypeResponseModel(_.get(recordType, 'name'), _.get(recordType, 'packageType'), _.get(recordType, 'searchFilters'), _.get(recordType, 'searchable'));
        this.sendResp(req, res, { data: recordTypeModel });
      }, error => {
        this.sendResp(req, res, {
          errors: [this.asError(error)],
          v1: error.message,
        })
      });
    }

    /**
     * Returns all RecordTypes configuration based of the response model that is intentionally restricting
     * the object schema and information that is allowed to be sent back in this endpoint
     */
    public getAllTypes(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      RecordTypesService.getAll(brand).subscribe(recordTypes => {
        const recordTypeModels = [];
        for (const recType of recordTypes) {
          const recordTypeModel = new RecordTypeResponseModel(_.get(recType, 'name'), _.get(recType, 'packageType'), _.get(recType, 'searchFilters'), _.get(recType, 'searchable'));
          recordTypeModels.push(recordTypeModel);
        }
        this.sendResp(req, res, { data: recordTypeModels });
      }, error => {
        this.sendResp(req, res, { errors: [this.asError(error)], v1: error.message });
      });
    }

    public getDashboardType(req: Sails.Req, res: Sails.Res) {
      const dashboardTypeParam = req.param('dashboardType') || '';
      const brand: BrandingModel = this.getReqBrand(req);
      DashboardTypesService.get(brand, dashboardTypeParam).subscribe(dashboardType => {
        const name = String(_.get(dashboardType, 'name', ''));
        const formatRules = (_.get(dashboardType, 'formatRules') ?? {}) as globalThis.Record<string, unknown>;
        const dashboardTypeModel = new DashboardTypeResponseModel(name, formatRules);
        this.sendResp(req, res, { data: dashboardTypeModel });
      }, error => {
        this.sendResp(req, res, { errors: [this.asError(error)], v1: error.message });
      });
    }

    public getAllDashboardTypes(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      DashboardTypesService.getAll(brand).subscribe(dashboardTypes => {
        const dashboardTypesModel = { dashboardTypes: [] };
        const dashboardTypesModelList = [];
        for (const dashboardType of dashboardTypes) {
          const dashboardTypeModel = new DashboardTypeResponseModel(_.get(dashboardType, 'name'), _.get(dashboardType, 'formatRules'));
          dashboardTypesModelList.push(dashboardTypeModel);
        }
        _.set(dashboardTypesModel, 'dashboardTypes', dashboardTypesModelList);
        this.sendResp(req, res, { data: dashboardTypesModel });
      }, error => {
        this.sendResp(req, res, { errors: [this.asError(error)], v1: error.message });
      });
    }

    protected tusServer: TusServer | null = null;

    protected initTusServer() {
      if (this.tusServer) {
        return;
      }

      const attachConfig = sails.config.record.attachments;
      const storeType = attachConfig.store ?? 'file';

      let datastore: DataStore;
      if (storeType === 's3') {
        const { S3Store } = require('@tus/s3-store') as { S3Store: new (config: unknown) => DataStore };
        const s3Config = attachConfig.s3;
        const accessKeyId = s3Config?.accessKeyId;
        const secretAccessKey = s3Config?.secretAccessKey;
        if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
          throw new Error('Invalid record.attachments.s3 credentials: accessKeyId and secretAccessKey must both be provided when using static credentials.');
        }
        datastore = new S3Store({
          partSize: s3Config?.partSize ?? 8 * 1024 * 1024,
          s3ClientConfig: {
            bucket: s3Config?.bucket,
            region: s3Config?.region,
            credentials: accessKeyId && secretAccessKey ? {
              accessKeyId,
              secretAccessKey,
            } : undefined,
            endpoint: s3Config?.endpoint,
          },
        });
      } else {
        const targetDir = attachConfig.file?.directory ?? attachConfig.stageDir;
        if (!targetDir) {
          throw new Error('Missing attachment directory configuration: set record.attachments.file.directory or record.attachments.stageDir before starting upload handlers (bootstrap() should initialize this).');
        }
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }
        datastore = new FileStore({ directory: targetDir });
      }

      this.tusServer = new TusServer({
        path: attachConfig.path,
        datastore,
        respectForwardedHeaders: true,
        disableTerminationForFinishedUploads: true,
        generateUrl(req, { host, path, id }) {
          const tusReq = req as unknown as TusRequestExtension;
          const baseUrl = (tusReq._tusBaseUrl ?? '').replace(/\/+$/, '');
          const cleanPath = path.startsWith('/') ? path : `/${path}`;
          // Preserve historical behavior expected by integration clients/tests (scheme-relative URL).
          return `//${host}${baseUrl}${cleanPath}/${id}`;
        },
      });

      this.tusServer.on(EVENTS.POST_FINISH, (_req, _res, upload: Upload) => {
        sails.log.verbose(`::: TUS upload completed: id=${upload.id}, size=${upload.size}`);
      });
      this.tusServer.on(EVENTS.POST_CREATE, (_req, _res, upload: Upload) => {
        sails.log.verbose(`::: TUS upload created: id=${upload.id}`);
      });
    }

    protected getTusMetadata(req: Sails.Req, field: string): string {
      const entries: { [key: string]: string } = {};
      _.each(String(req.headers['upload-metadata']).split(','), (entry: string) => {
        const elems = entry.split(' ');
        entries[elems[0]] = elems[1];
      });
      return Buffer.from(entries[field], 'base64').toString('ascii');
    }

    protected normalizeTusLocationHeader(locationHeader: HeaderValue, requestHost: string, prefix: string): string {
      const firstValue = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;
      const rawLocation = typeof firstValue === 'string' ? firstValue.trim() : String(firstValue);
      const cleanPrefix = prefix.replace(/\/+$/, '');
      const host = requestHost.trim().replace(/\/+$/, '');

      const ensurePrefix = (pathname: string): string => {
        if (pathname.startsWith(`${cleanPrefix}/attach/`)) {
          return pathname;
        }
        if (pathname.startsWith('/attach/')) {
          return `${cleanPrefix}${pathname}`;
        }
        return pathname;
      };

      if (/^https?:\/\//i.test(rawLocation)) {
        const parsed = new URL(rawLocation);
        const normalizedPath = ensurePrefix(parsed.pathname);
        return `//${parsed.host}${normalizedPath}${parsed.search}`;
      }

      if (rawLocation.startsWith('//')) {
        const parsed = new URL(`http:${rawLocation}`);
        const normalizedPath = ensurePrefix(parsed.pathname);
        return `//${parsed.host}${normalizedPath}${parsed.search}`;
      }

      if (rawLocation.startsWith('/')) {
        const normalizedPath = ensurePrefix(rawLocation);
        return host ? `//${host}${normalizedPath}` : normalizedPath;
      }

      if (rawLocation.startsWith('attach/')) {
        const normalizedPath = ensurePrefix(`/${rawLocation}`);
        return host ? `//${host}${normalizedPath}` : normalizedPath;
      }

      return rawLocation;
    }

    public async doAttachment(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = req.param('oid');
      const attachId = req.param('attachId');
      sails.log.verbose(`Have attach Id: ${attachId}`);
      this.initTusServer();
      const method = _.toLower(req.method);

      const brandPortalPrefix = BrandingService.getBrandAndPortalPath(req);
      const defaultAttachmentPrefix = `${brandPortalPrefix}/record/${oid}`;
      const companionAttachmentPrefix = `${brandPortalPrefix}/companion/record/${oid}`;
      const prefix = [defaultAttachmentPrefix, companionAttachmentPrefix]
        .find((candidatePrefix) => req.url.startsWith(candidatePrefix) || req.path.startsWith(candidatePrefix))
        ?? defaultAttachmentPrefix;
      const tusReq = req as unknown as TusRequestExtension;
      tusReq._tusOriginalUrl = req.url;
      tusReq._tusBaseUrl = prefix;
      if (req.url.startsWith(prefix)) {
        req.url = req.url.slice(prefix.length);
      }

      if (method == 'post') {
        const originalSetHeader = res.setHeader.bind(res);
        const requestHost = String(req.headers.host ?? '');
        res.setHeader = ((name: string, value: HeaderValue) => {
          if (_.toLower(name) == 'location') {
            const normalizedLocation = this.normalizeTusLocationHeader(value, requestHost, prefix);
            return originalSetHeader(name, normalizedLocation);
          }
          return originalSetHeader(name, value);
        }) as typeof res.setHeader;
      }

      if (method != 'get') {
        // Wrap res.end to normalize the overloaded call signatures:
        //   end(cb?), end(chunk, cb?), end(chunk, encoding, cb?)
        // The TUS server and srvx may call any of these forms.
        // express-session's res.end wrapper only accepts (chunk, encoding)
        // and does NOT handle callback arguments — passing a function as
        // the first arg causes it to be treated as chunk data, crashing
        // with ERR_INVALID_ARG_TYPE.  Strip callbacks and deliver them
        // via the 'finish' event instead.
        const originalEnd = res.end.bind(res);
        res.end = ((...args: unknown[]) => {
          const [first, second, third] = args;
          if (typeof first === 'function') {
            // end(cb)
            res.once('finish', first as () => void);
            return originalEnd();
          }
          if (typeof second === 'function') {
            // end(chunk, cb)
            res.once('finish', second as () => void);
            return originalEnd(first as string | Uint8Array);
          }
          if (typeof third === 'function') {
            // end(chunk, encoding, cb)
            res.once('finish', third as () => void);
            return originalEnd(first as string | Uint8Array, second as BufferEncoding);
          }
          if (second !== undefined) {
            return originalEnd(first as string | Uint8Array, second as BufferEncoding);
          }
          if (first !== undefined) {
            return originalEnd(first as string | Uint8Array);
          }
          return originalEnd();
        }) as typeof res.end;
      }

      if (oid == "pending-oid") {
        this.tusServer!.handle(req, res);
        return;
      }
      const that = this;
      const currentRec = await firstValueFrom(this.getRecord(oid));

      if (method == 'get') {
        const hasViewAccess = await firstValueFrom(this.hasViewAccess(brand, req.user, currentRec));

        if (!hasViewAccess) {
          sails.log.error("Error: edit error no permissions in do attachment.");
          return throwError(new Error(TranslationService.t('edit-error-no-permissions')));
        }
        // check if this attachId exists in the record
        let found: AnyRecord | null = null;
        _.each(currentRec.metaMetadata.attachmentFields, (attField: string) => {
          if (!found) {
            const attFieldVal = currentRec.metadata[attField];
            found = _.find(attFieldVal as AnyRecord[], (attVal: AnyRecord) => {
              return attVal['fileId'] == attachId
            }) ?? null;
            if (found) {
              return false;
            }
          }
          return undefined;
        });
        if (!found) {
          sails.log.verbose("Error: Attachment not found in do attachment.");
          return throwError(new Error(TranslationService.t('attachment-not-found')));
        }
        let mimeType = found['mimeType'] as string;
        if (_.isEmpty(mimeType)) {
          // Set octet stream as a default
          mimeType = 'application/octet-stream'
        }
        res.set('Content-Type', mimeType);

        const size = found['size'] as string;
        if (!_.isEmpty(size)) {
          res.set('Content-Length', size);
        }

        sails.log.verbose("found.name " + found['name']);
        res.attachment(found['name'] as string);
        sails.log.verbose(`Returning datastream observable of ${oid}: ${found['name']}, attachId: ${attachId}`);
        try {
          const response = await that.datastreamService.getDatastream(oid, attachId);
          if (response.readstream) {
            response.readstream.pipe(res);
          } else {
            const body = response.body ?? '';
            const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
            res.end(buffer, 'binary');
          }
          return of(oid);
        } catch (error) {
          const errorMessage = this.getErrorMessage(error);
          if (this.isAjax(req)) {
            return this.sendResp(req, res, { errors: [this.asError(error)], v1: errorMessage });
          } else if (errorMessage == TranslationService.t('edit-error-no-permissions')) {
            return this.sendResp(req, res, { status: 403, errors: [this.asError(error)], displayErrors: [{ code: 'edit-error-no-permissions' }] });
          } else if (errorMessage == TranslationService.t('attachment-not-found')) {
            return this.sendResp(req, res, { status: 404, errors: [this.asError(error)], displayErrors: [{ code: 'attachment-not-found' }] });
          } else {
            return this.sendResp(req, res, { status: 500, errors: [this.asError(error)] });
          }
        }
      } else {
        // Trust boundary: this flag must only be set by server-side companionAttachmentUploadAuth policy
        // after validating the configured shared secret and request locality. Never trust client input.
        const requestPath = String(req.path ?? '').toLowerCase();
        const isCompanionAttachmentRoute = /^\/[^/]+\/[^/]+\/companion\/record\/[^/]+\/attach(?:\/[^/]+)?$/.test(requestPath);
        const rawCompanionAttachmentUploadAuthorized = (req as Sails.Req & { companionAttachmentUploadAuthorized?: boolean }).companionAttachmentUploadAuthorized === true;
        const companionAttachmentUploadAuthorized = rawCompanionAttachmentUploadAuthorized && isCompanionAttachmentRoute;
        if (rawCompanionAttachmentUploadAuthorized && !isCompanionAttachmentRoute) {
          sails.log.warn('Ignoring companionAttachmentUploadAuthorized bypass flag for non-companion attachment route.', { path: req.path });
        }
        if (companionAttachmentUploadAuthorized) {
          const requestUser = req.user as { id?: unknown; username?: unknown; email?: unknown } | undefined;
          sails.log.notice('Companion attachment bypass authorized', {
            oid,
            method: req.method,
            path: req.path,
            userId: requestUser?.id,
            username: requestUser?.username,
            email: requestUser?.email,
            remoteAddress: (req as Sails.Req & { socket?: { remoteAddress?: string } }).socket?.remoteAddress,
            requestId: req.headers?.['x-request-id']
          });
        }
        if (!companionAttachmentUploadAuthorized) {
          const hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, req.user, currentRec as AnyRecord));
          if (!hasEditAccess) {
            sails.log.error("Error: edit error no permissions in do attachment.");
            return throwError(new Error(TranslationService.t('edit-error-no-permissions')));
          }
        }
        sails.log.verbose(req.headers);
        const uploadFileSize = req.headers['upload-length'];
        const diskSpaceThreshold = sails.config.record.diskSpaceThreshold;
        const storeType = sails.config.record.attachments.store ?? 'file';
        if (storeType === 'file' && !_.isUndefined(uploadFileSize) && !_.isUndefined(diskSpaceThreshold)) {
          const diskSpace = await checkDiskSpace(sails.config.record.mongodbDisk);
          //set diskSpaceThreshold to a reasonable amount of space on disk that will be left free as a safety buffer
          const thresholdAppliedFileSize = _.toInteger(uploadFileSize) + diskSpaceThreshold;
          sails.log.verbose('Total File Size ' + thresholdAppliedFileSize + ' Total Free Space ' + diskSpace.free);
          if (diskSpace.free <= thresholdAppliedFileSize) {
            const errorMessage = TranslationService.t('not-enough-disk-space');
            sails.log.error(errorMessage + ' Total File Size ' + thresholdAppliedFileSize + ' Total Free Space ' + diskSpace.free);
            return throwError(new Error(errorMessage));
          }
        }
        // process the upload...
        this.tusServer!.handle(req, res);
        return of(oid);
      }
    }

    public getWorkflowSteps(req: Sails.Req, res: Sails.Res) {
      const recordType = req.param('recordType');
      const brand: BrandingModel = this.getReqBrand(req);
      return RecordTypesService.get(brand, recordType).subscribe(recordType => {
        return WorkflowStepsService.getAllForRecordType(recordType).subscribe(wfSteps => {
          return this.sendResp(req, res, { data: wfSteps });
        });
      });
    }

    public getRelatedRecords(req: Sails.Req, res: Sails.Res) {
      return this.getRelatedRecordsInternal(req, res).then(response => {
        return this.sendResp(req, res, { data: response });
      });
    }

    public async getRelatedRecordsInternal(req: Sails.Req, _res: Sails.Res) {
      sails.log.verbose(`getRelatedRecordsInternal - starting...`);
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = req.param('oid');
      //TODO may need to check user authorization like in getPermissionsInternal?
      //let record = await this.getRecord(oid).toPromise();
      //or the permissions may be checked in a parent call that will retrieved record oids that a user has access to
      //plus some additional rules/logic that may be applied to filter the records
      const relatedRecords = await this.recordsService.getRelatedRecords(oid, brand);
      return relatedRecords;
    }

    public async getPermissionsInternal(req: Sails.Req, _res: Sails.Res) {
      const oid = req.param('oid');
      const record = await firstValueFrom(this.getRecord(oid));

      const editUsers = _.get(record, 'authorization.edit', []) as string[]
      const editUserResponse = [];
      if (editUsers != null && editUsers != undefined) {
        for (let i = 0; i < editUsers.length; i++) {
          const editUsername = editUsers[i];
          const user = await firstValueFrom(UsersService.getUserWithUsername(editUsername));
          editUserResponse.push({
            username: editUsername,
            name: _.get(user, "name", ""),
            email: _.get(user, "email", "")
          });
        }
      }
      const viewUsers = _.get(record, 'authorization.view', []) as string[]
      const viewUserResponse = [];
      if (viewUsers != null && viewUsers != undefined) {
        for (let i = 0; i < viewUsers.length; i++) {
          const viewUsername = viewUsers[i];
          const user = await firstValueFrom(UsersService.getUserWithUsername(viewUsername));

          viewUserResponse.push({
            username: viewUsername,
            name: _.get(user, "name", ""),
            email: _.get(user, "email", "")
          });
        }
      }
      const editPendingUsers = _.get(record, 'authorization.editPending', [])
      const viewPendingUsers = _.get(record, 'authorization.viewPending', [])

      const editRoles = _.get(record, 'authorization.editRoles', [])
      const viewRoles = _.get(record, 'authorization.viewRoles', [])

      return {
        edit: editUserResponse,
        view: viewUserResponse,
        editRoles: editRoles,
        viewRoles: viewRoles,
        editPending: editPendingUsers,
        viewPending: viewPendingUsers
      };
    }

    public getPermissions(req: Sails.Req, res: Sails.Res) {
      return this.getPermissionsInternal(req, res).then(response => {
        return this.sendResp(req, res, { data: response });
      });
    }


    public getAttachments(req: Sails.Req, res: Sails.Res) {
      sails.log.verbose('getting attachments....');
      const oid = req.param('oid');
      from(this.recordsService.getAttachments(oid)).subscribe((attachments: unknown[]) => {
        return this.sendResp(req, res, { data: attachments });
      });
    }

    public async getDataStream(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = req.param('oid');
      const datastreamId = req.param('datastreamId');
      const currentRec = await firstValueFrom(this.getRecord(oid));

      const hasViewAccess = await firstValueFrom(this.hasViewAccess(brand, req.user, currentRec as AnyRecord));
      if (!hasViewAccess) {
        return throwError(new Error(TranslationService.t('edit-error-no-permissions')));
      } else {
        const fileName = req.param('fileName') ? req.param('fileName') : datastreamId;
        res.set('Content-Type', 'application/octet-stream');
        sails.log.verbose("fileName " + fileName);
        res.attachment(fileName);
        sails.log.verbose(`Returning datastream observable of ${oid}: ${fileName}, datastreamId: ${datastreamId}`);
        try {
          const response = await this.datastreamService.getDatastream(oid, datastreamId);
          if (response.readstream) {
            response.readstream.pipe(res);
          } else {
            const body = response.body ?? '';
            const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
            res.end(buffer, 'binary');
          }
          return of(oid);
        } catch (error) {
          const errorMessage = this.getErrorMessage(error);
          if (this.isAjax(req)) {
            return this.sendResp(req, res, { errors: [this.asError(error)], v1: errorMessage });
          } else if (errorMessage == TranslationService.t('edit-error-no-permissions')) {
            return this.sendResp(req, res, { status: 403, errors: [this.asError(error)], displayErrors: [{ code: 'edit-error-no-permissions' }] });
          } else if (errorMessage == TranslationService.t('attachment-not-found')) {
            return this.sendResp(req, res, { status: 404, errors: [this.asError(error)], displayErrors: [{ code: 'attachment-not-found' }] });
          } else {
            return this.sendResp(req, res, { status: 500, errors: [this.asError(error)] });
          }
        }
      }
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */


    /** Dashboard Controller functions */

    public listWorkspaces(req: Sails.Req, res: Sails.Res) {
      const url = `${BrandingService.getFullPath(req)}/dashboard/workspace?packageType=workspace&titleLabel=workspaces`;
      return res.redirect(url);
    }

    public async render(req: Sails.Req, res: Sails.Res) {
      const recordType = req.param('recordType') ? req.param('recordType') : '';
      let packageType = req.param('packageType') ? req.param('packageType') : '';
      let titleLabel = req.param('titleLabel') ? TranslationService.t(req.param('titleLabel')) : `${TranslationService.t('edit-dashboard')} ${TranslationService.t(recordType + '-title-label')}`;
      if (recordType == 'workspace') {
        if (packageType == '') {
          packageType = 'workspace';
        }
        if (titleLabel == '') {
          titleLabel = 'workspaces';
        }
      }

      // Get dashboard config for the record type to determine if admin sidebar should be shown
      let showAdminSideBar = false;
      if (recordType) {
        try {
          const brand = this.getReqBrand(req);
          const dashboardConfig = await DashboardTypesService.getRecordTypeDashboardConfig(brand, recordType);
          if (dashboardConfig && dashboardConfig.showAdminSideBar === true) {
            showAdminSideBar = true;
          }
        } catch (error) {
          sails.log.warn(`Error fetching dashboard config for record type ${recordType}:`, error);
        }
      }

      return this.sendView(req, res, 'dashboard', {
        recordType: recordType,
        packageType: packageType,
        titleLabel: titleLabel,
        showAdminSideBar: showAdminSideBar
      });
    }


    public async getRecordList(req: Sails.Req, res: Sails.Res) {

      const brand: BrandingModel = this.getReqBrand(req);

      const editAccessOnly = req.query.editOnly;

      let roles: AnyRecord[] = [];
      let username = "guest";
      let user: AnyRecord = {};
      if (req.isAuthenticated()) {
        roles = (req.user!['roles'] ?? []) as AnyRecord[];
        user = req.user!;
        username = req.user!['username'] as string;
      } else {
        // assign default role if needed...
        user = { username: username };
        roles = [];
        const defRole = RolesService.getDefUnathenticatedRole(brand);
        if (defRole) roles.push(defRole as unknown as AnyRecord);
      }
      const recordType = req.param('recordType');
      const workflowState = req.param('state');
      const start = req.param('start');
      const rows = req.param('rows');
      const packageType = req.param('packageType');
      const sort = req.param('sort');
      const filterFieldString = req.param('filterFields');
      let filterString: string | undefined = req.param('filter');
      let filterFields: string[] | undefined = undefined;
      const filterModeString = req.param('filterMode');
      let secondarySort: string | undefined = req.param('secondarySort');
      let filterMode: string[] | undefined = undefined;

      if (!_.isEmpty(filterFieldString)) {
        filterFields = filterFieldString.split(',')
      } else {
        filterString = undefined;
      }

      if (!_.isEmpty(filterModeString)) {
        filterMode = filterModeString.split(',')
      } else {
        filterMode = undefined;
      }

      if (secondarySort == '') {
        secondarySort = undefined;
      }

      // sails.log.error('-------------Record Controller getRecordList------------------------');
      // sails.log.error('filterFields '+ filterFields);
      // sails.log.error('filterString '+ filterString);
      // sails.log.error('filterMode '+ filterMode);
      // sails.log.error('----------------------------------------------------------');

      try {
        const response = await this.getRecords(workflowState, recordType, start, rows, user, roles, brand, editAccessOnly, packageType, sort, filterFields, filterString, filterMode, secondarySort);
        if (response) {
          this.sendResp(req, res, { data: response });
        } else {
          this.sendResp(req, res, { status: 500, meta: {}, v1: response });
        }
      } catch (error) {
        const errorMessage = this.getErrorMessage(error);
        this.sendResp(req, res, {
          errors: [this.asError(error)],
          displayErrors: [{ title: "Error updating meta", detail: errorMessage }],
          v1: errorMessage
        });
      }
    }

    public async getDeletedRecordList(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const editAccessOnly = req.query.editOnly;

      let roles: AnyRecord[] = [];
      let username = "guest";
      let user: AnyRecord = {};
      if (req.isAuthenticated()) {
        roles = (req.user!['roles'] ?? []) as AnyRecord[];
        user = req.user!;
        username = req.user!['username'] as string;
      } else {
        // assign default role if needed...
        user = { username: username };
        roles = [];
        const defRole = RolesService.getDefUnathenticatedRole(brand);
        if (defRole) roles.push(defRole as unknown as AnyRecord);
      }
      const recordType = req.param('recordType');
      const workflowState = req.param('state');
      const start = req.param('start');
      const rows = req.param('rows');
      const packageType = req.param('packageType');
      const sort = req.param('sort');
      const filterFieldString = req.param('filterFields');
      let filterString: string | undefined = req.param('filter');
      let filterFields: string[] | undefined = undefined;
      const filterModeString = req.param('filterMode');
      let filterMode: string[] | undefined = undefined;

      if (!_.isEmpty(filterFieldString)) {
        filterFields = filterFieldString.split(',')
      } else {
        filterString = undefined;
      }

      if (!_.isEmpty(filterModeString)) {
        filterMode = filterModeString.split(',')
      } else {
        filterMode = undefined;
      }

      // sails.log.error('-------------Record Controller getRecordList------------------------');
      // sails.log.error('filterFields '+ filterFields);
      // sails.log.error('filterString '+ filterString);
      // sails.log.error('filterMode '+ filterMode);
      // sails.log.error('----------------------------------------------------------');

      try {
        const response = await this.getDeletedRecords(workflowState, recordType, start, rows, user, roles, brand, editAccessOnly, packageType, sort, filterFields, filterString, filterMode);
        if (response) {
          this.sendResp(req, res, { data: response });
        } else {
          this.sendResp(req, res, { status: 500, meta: {}, v1: response });
        }
      } catch (error) {
        const errorMessage = this.getErrorMessage(error);
        this.sendResp(req, res, {
          errors: [this.asError(error)],
          displayErrors: [{ title: "Error updating meta", detail: errorMessage }],
          v1: errorMessage
        });
      }
    }

    public renderDeletedRecords(req: Sails.Req, res: Sails.Res) {
      return this.sendView(req, res, 'admin/deletedRecords');
    }


    private getDocMetadata(doc: { [key: string]: unknown }): { [key: string]: unknown } {
      const metadata: { [key: string]: unknown } = {};
      for (const key in doc) {
        if (key.indexOf('authorization_') != 0 && key.indexOf('metaMetadata_') != 0) {
          metadata[key] = doc[key];
        }
        if (key == 'authorization_editRoles') {
          metadata[key] = doc[key];
        }
      }
      return metadata;
    }

    protected async getRecords(workflowState: unknown, recordType: unknown, start: unknown, rows: unknown, user: AnyRecord, roles: AnyRecord[], brand: BrandingModel, editAccessOnly: unknown = undefined, packageType: unknown = undefined, sort: unknown = undefined, filterFields: unknown = undefined, filterString: unknown = undefined, filterMode: unknown = undefined, secondarySort: unknown = undefined) {
      const username = user['username'] as string;
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        recordType = (recordType as string).split(',');
      }
      if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
        packageType = (packageType as string).split(',');
      }
      const results = await this.recordsService.getRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, filterFields, filterString, filterMode, secondarySort);
      if (!results.isSuccessful()) {
        sails.log.verbose(`Failed to retrieve records!`);
        return null;
      }

      const totalItems = results.totalItems;
      const startIndex = start as number;
      const noItems = rows as number;
      const pageNumber = (startIndex / noItems) + 1;

      const response: { [key: string]: unknown } = {};
      response["totalItems"] = totalItems;
      response["currentPage"] = pageNumber;
      response["noItems"] = noItems;

      const items = [];
      const docs = results.items;

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i] as globalThis.Record<string, unknown>;
        const item: { [key: string]: unknown } = {};
        item["oid"] = doc["redboxOid"];
        const docMetadata = (doc["metadata"] ?? {}) as globalThis.Record<string, unknown>;
        item["title"] = docMetadata["title"];
        item["metadata"] = this.getDocMetadata(doc);
        item["dateCreated"] = doc["dateCreated"];
        item["dateModified"] = doc["lastSaveDate"];
        item["hasEditAccess"] = this.recordsService.hasEditAccess(brand, user, roles, doc);
        items.push(item);
      }

      response["items"] = items;
      return response;
    }

    protected async getDeletedRecords(workflowState: unknown, recordType: unknown, start: unknown, rows: unknown, user: AnyRecord, roles: AnyRecord[], brand: BrandingModel, editAccessOnly: unknown = undefined, packageType: unknown = undefined, sort: unknown = undefined, filterFields: unknown = undefined, filterString: unknown = undefined, filterMode: unknown = undefined) {
      const username = user['username'] as string;
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        recordType = (recordType as string).split(',');
      }
      if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
        packageType = (packageType as string).split(',');
      }
      const results = await this.recordsService.getDeletedRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, filterFields, filterString, filterMode);
      if (!results.isSuccessful()) {
        sails.log.verbose(`Failed to retrieve deleted records!`);
        return null;
      }

      const totalItems = results.totalItems;
      const startIndex = start as number;
      const noItems = rows as number;
      const pageNumber = (startIndex / noItems) + 1;

      const response: { [key: string]: unknown } = {};
      response["totalItems"] = totalItems;
      response["currentPage"] = pageNumber;
      response["noItems"] = noItems;

      const items = [];
      const docs = results.items;

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i] as globalThis.Record<string, unknown>;
        const item: { [key: string]: unknown } = {};
        const delRecordMeta = (doc["deletedRecordMetadata"] ?? {}) as globalThis.Record<string, unknown>;
        item["oid"] = doc["redboxOid"];
        const delRecordMetadata = (delRecordMeta["metadata"] ?? {}) as globalThis.Record<string, unknown>;
        item["title"] = delRecordMetadata["title"];
        item["dateCreated"] = delRecordMeta["dateCreated"];
        item["dateModified"] = delRecordMeta["lastSaveDate"];
        item["dateDeleted"] = doc["dateDeleted"];
        items.push(item);
      }

      response["items"] = items;
      return response;
    }

    private mergeRecordMetadata(currentMetadata: { [key: string]: unknown }, newMetadata: { [key: string]: unknown }): { [key: string]: unknown } {
      // Merge the current and new metadata into a new object, replacing the current metadata property values with the new property values.
      return _.mergeWith({}, currentMetadata, newMetadata, (objValue: unknown, srcValue: unknown) => {
        if (Array.isArray(objValue)) {
          // Merge behavior for arrays is to replace the existing array with the new array.
          // This has the implicit assumption that arrays are complete, not partial.
          // This makes more sense than concatenating because usually an array will contain all items, not a subset of the items.
          return srcValue;
        }
        return undefined;
      });
    }
  }
}
