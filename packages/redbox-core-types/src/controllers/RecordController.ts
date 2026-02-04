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
  DataResponseV2,
  Controllers as controllers,
  DatastreamService,
  RecordsService,
  SearchService,
  ApiVersion,
  BrandingModel,
  RecordTypeModel, ErrorResponseItemV2,
} from '../index';
import { DateTime } from 'luxon';
import * as tus from 'tus-node-server';
import * as fs from 'fs';
import { default as checkDiskSpace } from 'check-disk-space';

declare var module: any;
declare var sails: any;
declare var _: any;
declare var url: any;

/**
 * Package that contains all Controllers.
 */

export module Controllers {
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
      this.recordsService = sails.services.recordsservice;
      this.datastreamService = sails.services.recordsservice;
      
      let that = this;
      this.registerSailsHook('after', ['hook:redbox:storage:ready', 'hook:redbox:datastream:ready', 'ready'], function () {
        let datastreamServiceName = sails.config.record.datastreamService;
        sails.log.verbose(`RecordController ready, using datastream service: ${datastreamServiceName}`);
        if (datastreamServiceName != undefined) {
          that.datastreamService = sails.services[datastreamServiceName];
        }
        that.searchService = sails.services[sails.config.search.serviceName];
      });
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: any = [
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

    public bootstrap() { }

    public async getMeta(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid') ? req.param('oid') : '';
      if (oid == '') {
        return this.sendResp(req, res, {status: 400});
      }

      try {
        let record: any = await this.recordsService.getMeta(oid);
        if(_.isEmpty(record)) {
          return this.sendResp(req, res, {status: 404});
        }
  let hasViewAccess = await firstValueFrom(this.hasViewAccess(brand, req.user, record))
        if (hasViewAccess) {
          return this.sendResp(req, res, {data: record.metadata, meta: {oid: record.redboxOid}, v1: record.metadata});
        } else {
          return this.sendResp(req, res, {
            status: 403,
            displayErrors: [{code: "error-403-heading"}],
            meta: {oid: record.redboxOid},
            v1: {status: "Access Denied"},
          });
        }
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [err],
          displayErrors: [{detail: "Error retrieving metadata"}],
          meta: {oid: oid},
        });
      }
    }

    public async getMetaDefault(req, res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      const recordType = req.param('name') ?? '';
      const editMode = req.query.edit == "true";

      // TODO: is there a permission check needed for the default form config values?

      // get the default data model for the form with 'name'
      const form = await firstValueFrom<any>(FormsService.getFormByStartingWorkflowStep(brand, recordType, editMode));
      const formMode = editMode ? "edit" : "view";
      const reusableFormDefs = sails.config.reusableFormDefinitions;
      const modelDataDefault = FormRecordConsistencyService.buildDataModelDefaultForFormConfig(form, formMode, reusableFormDefs);

      // return the matching format, return the model data as json
      return this.sendResp(req, res, {
        data: modelDataDefault,
        meta: {
          formName: form.name,
          recordType: recordType,
          editMode: editMode
        },
        v1: modelDataDefault,
      });
    }

    public edit(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid') ? req.param('oid') : '';
      let recordType = req.param('recordType') ? req.param('recordType') : '';
      const rdmp = req.query.rdmp ? req.query.rdmp : '';
      let localFormName;
      if (!_.isUndefined(req.options.locals) && !_.isNull(req.options.locals)) {
        localFormName = req.options.locals.localFormName;
      }
      const extFormName = localFormName ? localFormName : '';
      let appSelector = 'dmp-form';
      let appName = 'dmp';
      sails.log.debug('RECORD::APP: ' + appName);
      sails.log.debug('RECORD::APP formName: ' + extFormName);
      if (recordType != '' && extFormName == '') {
        FormsService.getFormByStartingWorkflowStep(brand, recordType, true).subscribe(form => {
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
            errors: [error],
            displayErrors: [{detail: "Failed to load form"}],
          });
        });
      } else {
        from(this.recordsService.getMeta(oid)).pipe(flatMap(record => {
          const formName = record.metaMetadata.form;
          return FormsService.getFormByName(formName, true);
        })).subscribe(form => {
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
        }, error => {
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

    protected hasEditAccess(brand, user, currentRec): Observable<boolean> {
      sails.log.verbose("Current Record: ");
      sails.log.verbose(currentRec);
      return of(this.recordsService.hasEditAccess(brand, user, user.roles, currentRec));
    }

    protected hasViewAccess(brand, user, currentRec) {
      sails.log.verbose("Current Record: ");
      sails.log.verbose(currentRec);
      return of(this.recordsService.hasViewAccess(brand, user, user.roles, currentRec));
    }

    public async getForm(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const recordType = req.param('name');
      const oid = req.param('oid')?.toString()?.trim() || null;
      const editMode = req.query.edit == "true";
      const formParam = req.param('formName');

      try {
        let form: any = null;
        let currentRec: any = null;
        if (!oid) {
          //find form to create a record
          form = await firstValueFrom(FormsService.getFormByStartingWorkflowStep(brand, recordType, editMode));
          if (_.isEmpty(form)) {
            const msg = `Error, getting form for record type: ${recordType}`;
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{detail: msg}],
              v1: {message: msg},
            });
          }

        } else {
          // defaults to retrieve the form of the current workflow state...
          currentRec = await this.recordsService.getMeta(oid);
          if (_.isEmpty(currentRec)) {
            const msg = `Error, empty metadata for OID: ${oid}`;
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{detail: msg}],
              v1: {message: msg},
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
                displayErrors: [{code: 'view-error-no-permissions'}],
                v1: {message: TranslationService.t('view-error-no-permissions')}
              });
          }

          // get the form config
          form = await FormsService.getForm(brand, formParam, editMode, '', currentRec);
          if (_.isEmpty(form)) {
            const msg = `Error, getting form ${formParam} for OID: ${oid}`;
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{detail: msg}],
              v1: {message: msg}
            });
          }
          // let hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, req.user, currentRec));
          // FormsService.filterFieldsHasEditAccess(form.fields, hasEditAccess);
        }

        // process the form config to provide only the fields accessible by the current user
        const formMode = editMode ? "edit" : "view";
        const userRoles = (req.user?.roles ?? []).map(role => role?.name).filter(name => !!name);
        const recordData = currentRec;
        const reusableFormDefs = sails.config.reusableFormDefinitions;
        const mergedForm = FormsService.buildClientFormConfig(form, formMode, userRoles, recordData?.metadata, reusableFormDefs);

        // return the form config
        if (!_.isEmpty(mergedForm)) {
          return this.sendResp(req, res, {
            data: mergedForm,
            meta: {formName: formParam, recordType: recordType, oid: oid},
          });
        } else {
          const msg = `Failed to get form with name ${formParam} and record type ${recordType} and oid ${oid}`;
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{detail: msg}],
            v1: {message: msg}
          });
        }

      } catch(error) {
        let displayError: ErrorResponseItemV2 = {title: "Error getting form definition"};
        let msg;
        if (error.error && error.error.code == 500) {
          displayError.code = 'missing-record';
          msg = TranslationService.t('missing-record');
        } else {
          displayError.detail = error.message;
          msg = error.message;
        }
        return this.sendResp(req, res, {
          errors: [error],
          displayErrors: [displayError],
          v1: msg,
        });
      }
    }

    public create(req, res) {
      this.createInternal(req, res).then(() => { });
    }

    private async createInternal(req, res) {
      try {
        const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
        const metadata = req.body;
        let record: any = {
          metaMetadata: {}
        };
        var recType = req.param('recordType');
        const targetStep = req.param('targetStep');
        record.authorization = {
          view: [req.user.username],
          edit: [req.user.username]
        };
        record.metadata = metadata;

  let recordType = await firstValueFrom(RecordTypesService.get(brand, recType));
        const user = req.user;

        sails.log.verbose(`RecordController - createRecord - enter`);
        let createResponse = await this.recordsService.create(brand, record, recordType, user, true, true, targetStep);

        if (createResponse && _.isFunction(createResponse.isSuccessful) && createResponse.isSuccessful()) {
          return this.sendResp(req, res, {
            data: await this.recordsService.getMeta(createResponse.oid),
            meta: {...createResponse},
            v1: createResponse,
          });
        } else {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{detail: createResponse.message}],
            meta: {...createResponse},
          });
        }

      } catch (error) {
        return this.sendResp(req, res, {
          errors: [error],
          displayErrors: [{detail: 'Failed to save record'}],
        });
      }
    }

    public async delete(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const user = req.user;
      let message = null;
  let currentRec = await firstValueFrom(this.getRecord(oid));
      if(!_.isEmpty(brand)) {

  let hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, user, currentRec));

        if (hasEditAccess) {

          let recordType = await firstValueFrom(RecordTypesService.get(brand, currentRec.metaMetadata.type));

          let response = await this.recordsService.delete(oid, false, currentRec, recordType, user);

          if (response && response.isSuccessful()) {
            const resp = {
              success: true,
              oid: oid
            };
            sails.log.verbose(`RecordController - delete - Successfully deleted: ${oid}`);

            return this.sendResp(req, res, {data: resp});
          } else {
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{detail: response.message}]
            });
          }
        } else {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{code: 'edit-error-no-permissions'}]
          });
        }
      } else {
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{code: 'failed-delete'}]
        });
      }
    }

    public async restoreRecord(req, res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const msgFailed = TranslationService.t('failed-restore');
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{code: 'failed-restore'}],
          meta: {oid: oid},
          v1: {
            success: false,
            oid: oid,
            message: msgFailed
          },
        });
      }
      const user = req.user;
      const response = await this.recordsService.restoreRecord(oid, user);
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
          displayErrors: [{code: 'failed-restore', detail: response.message}],
          meta: {oid: oid},
          v1: data,
        });
      }
    }

    public async destroyDeletedRecord(req, res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{code: 'failed-destroy'}],
          meta: {oid: oid},
          v1: {
            success: false,
            oid: oid,
            message: TranslationService.t('failed-destroy')
          },
        });
      }
      const user = req.user;
      const response = await this.recordsService.destroyDeletedRecord(oid, user);
      if (response && response.isSuccessful()) {
        const resp = {
          success: true,
          oid: oid
        };
        sails.log.verbose(`Successfully destroyed: ${oid}`);
        return this.sendResp(req, res, {data: resp});
      } else {
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{code: 'failed-destroy'}],
          meta: {oid: oid},
          v1: {
            success: false,
            oid: oid,
            message: response.message
          },
        });
      }
    }

    public update(req, res) {
      this.updateInternal(req, res).then(result => { });
    }

    private async updateInternal(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const targetStep = req.param('targetStep');
      const shouldMerge = req.param('merge', 'false')?.toString() === 'true';
      // If the sync completed before the async is done, maybe the user is cleared?
      // So clone the user for the async triggers.
      const user = _.cloneDeep(req.user);
      let metadata = req.body;
      sails.log.verbose(`RecordController - updateInternal - enter`);

  let currentRec = await firstValueFrom(this.getRecord(oid));
  let hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, user, currentRec));
      if (!hasEditAccess) {
        return this.sendResp(req, res, {status: 403, displayErrors: [{code: 'not-authorised'}]});
      }
  let recordType = await firstValueFrom(RecordTypesService.get(brand, currentRec.metaMetadata.type));
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
            data:  await this.recordsService.getMeta(oid),
            meta: response,
            v1: response,
          });
        } else {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{detail: "Failed to get record data"}],
            meta: response,
            v1: response,
          });
        }
      } catch (error) {
        sails.log.error('RecordController - updateInternal - Failed to run post-save hooks when onUpdate... or Error updating meta:');
        return this.sendResp(req, res, {
          errors: [error],
          displayErrors: [{detail: error.message}],
          meta: response,
          v1: error.message,
        });
      }
    }

    //TODO: check if this deprecated?
    protected saveMetadata(brand, oid, currentRec, metadata, user): Observable<any> {
      currentRec.metadata = metadata;
      return this.updateMetadata(brand, oid, currentRec, user);
    }

    protected saveAuthorization(brand, oid, currentRec, authorization, user): Observable<any> {
      let editAccessResp: Observable<boolean> = this.hasEditAccess(brand, user, currentRec);
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

    protected getRecord(oid) {
      return from(this.recordsService.getMeta(oid)).pipe(flatMap(currentRec => {
        if (_.isEmpty(currentRec)) {
          return throwError(new Error(`Failed to update meta, cannot find existing record with oid: ${oid}`));
        }
        return of(currentRec);
      }));
    }

    //TODO: check if this is deprecated?
    protected updateMetadata(brand, oid, currentRec, user) {
      if (currentRec.metaMetadata.brandId != brand.id) {
        return throwError(new Error(`Failed to update meta, brand's don't match: ${currentRec.metaMetadata.brandId} != ${brand.id}, with oid: ${oid}`));
      }
      currentRec.metaMetadata.lastSavedBy = user.username;
  currentRec.metaMetadata.lastSaveDate = DateTime.local().toISO();
      sails.log.verbose(`Calling record service...`);
      sails.log.verbose(currentRec);
      return from(this.recordsService.updateMeta(brand, oid, currentRec, user));
    }

    protected updateAuthorization(brand, oid, currentRec, user) {
      if (currentRec.metaMetadata.brandId != brand.id) {
        return throwError(new Error(`Failed to update meta, brand's don't match: ${currentRec.metaMetadata.brandId} != ${brand.id}, with oid: ${oid}`));
      }
      return from(this.recordsService.updateMeta(brand, oid, currentRec, user));
    }

    public stepTo(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const metadata = req.body;
      const oid = req.param('oid');
      const targetStep = req.param('targetStep');
      let origRecord = null;
      return this.getRecord(oid).pipe(flatMap(currentRec => {
        origRecord = _.cloneDeep(currentRec);
        return this.hasEditAccess(brand, req.user, currentRec)
          .pipe(flatMap(hasEditAccess => {
            if (!hasEditAccess) {
              return throwError(new Error(TranslationService.t('edit-error-no-permissions')));
            }
            return RecordTypesService.get(brand, origRecord.metaMetadata.type);
          })
          ,flatMap(recType => {
            return WorkflowStepsService.get(recType, targetStep)
              .pipe(flatMap(nextStep => {
                currentRec.metadata = metadata;
                sails.log.verbose("Current rec:");
                sails.log.verbose(currentRec);
                sails.log.verbose("Next step:");
                sails.log.verbose(nextStep);
                this.recordsService.setWorkflowStepRelatedMetadata(currentRec, nextStep);
                return this.updateMetadata(brand, oid, currentRec, req.user);
              }));
          }))
      }))
        .subscribe(response => {
          let responseValue: any= response;
          return responseValue.subscribe(response => {
            sails.log.error(response);
            if (response && response.isSuccessful()) {
              response.success = true;
              this.sendResp(req, res, {data: response});
            } else {
              this.sendResp(req, res, {
                status: 500,
                meta: response,
                v1: response
              });
            }
          }, error => {
            this.sendResp(req, res, {
              errors: [error],
              displayErrors: [{title: "Error updating meta", detail: error.message}],
              v1: error.message
            });
          });
        });
    }

    public async search(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const type = req.param('type');
      let rows = req.param('rows');
      let page = req.param('page');
      let core = req.param('core');

      // If a record type is set, fetch from the configuration what core it's being sent from
      if(type != null) {
  let recordType:RecordTypeModel = await firstValueFrom(RecordTypesService.get(brand, type));
        core = recordType.searchCore;
      }
      if (_.isEmpty(rows)) {
        rows = 10
      }
      if (_.isEmpty(page)) {
        page = 1
      }
      let start = 0
      if (/^\d+$/.test(page)) {
        page = parseInt(page)
      }
      if (/^\d+$/.test(rows)) {
        rows = parseInt(rows)
      }

      start = (page - 1) * rows;

      const workflow = req.query.workflow;
      const searchString = req.query.searchStr;

      const exactSearchNames = _.isEmpty(req.query.exactNames) ? [] : req.query.exactNames.split(',');
      const exactSearches = [];
      const facetSearchNames = _.isEmpty(req.query.facetNames) ? [] : req.query.facetNames.split(',');
      const facetSearches = [];

      _.forEach(exactSearchNames, (exactSearch) => {
        exactSearches.push({
          name: exactSearch,
          value: req.query[`exact_${exactSearch}`]
        });
      });
      _.forEach(facetSearchNames, (facetSearch) => {
        facetSearches.push({
          name: facetSearch,
          value: req.query[`facet_${facetSearch}`]
        });
      });

      try {
        let searchRes = await this.searchService.searchFuzzy(core, type, workflow, searchString, exactSearches, facetSearches, brand, req.user, req.user.roles, sails.config.record.search.returnFields, start, rows);
        searchRes['page'] = page
        this.sendResp(req, res, {data: searchRes});
      } catch (error) {
        this.sendResp(req, res, {
          errors: [error],
          v1: error.message,
        });
      }
    }
    /**
     * Returns the RecordType configuration based of the response model that is intentionally restricting
     * the object schema and information that is allowed to be sent back in this endpoint
     */
    public getType(req, res) {
      const recordType = req.param('recordType');
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      RecordTypesService.get(brand, recordType).subscribe(recordType => {
        let recordTypeModel = new RecordTypeResponseModel(_.get(recordType, 'name'), _.get(recordType, 'packageType'), _.get(recordType, 'searchFilters'), _.get(recordType, 'searchable'));
        this.sendResp(req, res, {data: recordTypeModel});
      }, error => {
        this.sendResp(req, res, {
          errors: [error],
          v1: error.message,
        })
      });
    }

    /**
     * Returns all RecordTypes configuration based of the response model that is intentionally restricting
     * the object schema and information that is allowed to be sent back in this endpoint
     */
    public getAllTypes(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      RecordTypesService.getAll(brand).subscribe(recordTypes => {
        let recordTypeModels = [];
        for (let recType of recordTypes) {
          let recordTypeModel = new RecordTypeResponseModel(_.get(recType, 'name'), _.get(recType, 'packageType'), _.get(recType, 'searchFilters'), _.get(recType, 'searchable'));
          recordTypeModels.push(recordTypeModel);
        }
        this.sendResp(req, res, {data: recordTypeModels});
      }, error => {
        this.sendResp(req, res, {errors: [error], v1: error.message});
      });
    }

    public getDashboardType(req, res) {
      const dashboardTypeParam = req.param('dashboardType');
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      DashboardTypesService.get(brand, dashboardTypeParam).subscribe(dashboardType => {
        let dashboardTypeModel = new DashboardTypeResponseModel(_.get(dashboardType, 'name'), _.get(dashboardType, 'formatRules'));
        this.sendResp(req, res, {data: dashboardTypeModel});
      }, error => {
        this.sendResp(req, res, {errors: [error], v1:error.message});
      });
    }

    public getAllDashboardTypes(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      DashboardTypesService.getAll(brand).subscribe(dashboardTypes => {
        let dashboardTypesModel = { dashboardTypes: [] };
        let dashboardTypesModelList = [];
        for (let dashboardType of dashboardTypes) {
          let dashboardTypeModel = new DashboardTypeResponseModel(_.get(dashboardType, 'name'), _.get(dashboardType, 'formatRules'));
          dashboardTypesModelList.push(dashboardTypeModel);
        }
        _.set(dashboardTypesModel, 'dashboardTypes', dashboardTypesModelList);
        this.sendResp(req, res, {data: dashboardTypesModel});
      }, error => {
        this.sendResp(req, res, {errors: [error], v1: error.message});
      });
    }

    protected tusServer: any;

    protected initTusServer() {
      if (!this.tusServer) {
        let tusServerOptions = {
          path: sails.config.record.attachments.path
        }
        this.tusServer = new tus.Server(tusServerOptions);

        const targetDir = sails.config.record.attachments.stageDir;
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir);
        }
        // path below is appended to the 'Location' header, so it must match the routes for this controller if you want to keep your sanity
        this.tusServer.datastore = new tus.FileStore({
          directory: targetDir
        });
        this.tusServer.on(tus.EVENTS.EVENT_UPLOAD_COMPLETE, (event) => {
          sails.log.verbose(`::: File uploaded to staging:`);
          sails.log.verbose(JSON.stringify(event));
        });
        this.tusServer.on(tus.EVENTS.EVENT_FILE_CREATED, (event) => {
          sails.log.verbose(`::: File created:`);
          sails.log.verbose(JSON.stringify(event));
        });
      }
    }

    protected getTusMetadata(req, field: string): string {
      const entries = {};
      _.each(req.headers['upload-metadata'].split(','), (entry) => {
        const elems = entry.split(' ');
        entries[elems[0]] = elems[1];
      });
      return Buffer.from(entries[field], 'base64').toString('ascii');
    }

    public async doAttachment(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const attachId = req.param('attachId');
      sails.log.verbose(`Have attach Id: ${attachId}`);
      this.initTusServer();
      const method = _.toLower(req.method);
      if (method == 'post') {
        req.baseUrl = `${BrandingService.getBrandAndPortalPath(req)}/record/${oid}`
      } else {
        req.baseUrl = '';
      }
      if (oid == "pending-oid") {
        this.tusServer.handle(req, res);
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
        let found = null;
        _.each(currentRec.metaMetadata.attachmentFields, (attField) => {
          if (!found) {
            const attFieldVal = currentRec.metadata[attField];
            found = _.find(attFieldVal, (attVal) => {
              return attVal.fileId == attachId
            });
            if (found) {
              return false;
            }
          }
        });
        if (!found) {
          sails.log.verbose("Error: Attachment not found in do attachment.");
          return throwError(new Error(TranslationService.t('attachment-not-found')));
        }
        let mimeType = found.mimeType;
        if (_.isEmpty(mimeType)) {
          // Set octet stream as a default
          mimeType = 'application/octet-stream'
        }
        res.set('Content-Type', mimeType);

        let size = found.size;
        if (!_.isEmpty(size)) {
          res.set('Content-Length', size);
        }

        sails.log.verbose("found.name " + found.name);
        res.attachment(found.name);
        sails.log.verbose(`Returning datastream observable of ${oid}: ${found.name}, attachId: ${attachId}`);
        try {
          const response = await that.datastreamService.getDatastream(oid, attachId);
          if (response.readstream) {
            response.readstream.pipe(res);
          } else {
            res.end(Buffer.from(response.body), 'binary');
          }
          return of(oid);
        } catch (error) {
          if (this.isAjax(req)) {
            this.sendResp(req, res, {errors: [error], v1: error.message});
          } else if (error.message == TranslationService.t('edit-error-no-permissions')) {
            this.sendResp(req, res, {status: 403, errors: [error], displayErrors: [{code: 'edit-error-no-permissions'}]});
          } else if (error.message == TranslationService.t('attachment-not-found')) {
            this.sendResp(req, res, {status: 404, errors: [error], displayErrors: [{code: 'attachment-not-found'}]});
          } else {
            this.sendResp(req, res, {status: 500, errors: [error]});
          }
        }
      } else {
  const hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, req.user, currentRec));
        if (!hasEditAccess) {
          sails.log.error("Error: edit error no permissions in do attachment.");
          return throwError(new Error(TranslationService.t('edit-error-no-permissions')));
        }
        sails.log.verbose(req.headers);
        let uploadFileSize = req.headers['Upload-Length'];
        let diskSpaceThreshold = sails.config.record.diskSpaceThreshold;
        if (!_.isUndefined(uploadFileSize) && !_.isUndefined(diskSpaceThreshold)) {
          let diskSpace = await checkDiskSpace(sails.config.record.mongodbDisk);
          //set diskSpaceThreshold to a reasonable amount of space on disk that will be left free as a safety buffer
          let thresholdAppliedFileSize = _.toInteger(uploadFileSize) + diskSpaceThreshold;
          sails.log.verbose('Total File Size ' + thresholdAppliedFileSize + ' Total Free Space ' + diskSpace.free);
          if (diskSpace.free <= thresholdAppliedFileSize) {
            let errorMessage = TranslationService.t('not-enough-disk-space');
            sails.log.error(errorMessage + ' Total File Size ' + thresholdAppliedFileSize + ' Total Free Space ' + diskSpace.free);
            return throwError(new Error(errorMessage));
          }
        }
        // process the upload...
        this.tusServer.handle(req, res);
        return of(oid);
      }
    }

    public getWorkflowSteps(req, res) {
      const recordType = req.param('recordType');
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      return RecordTypesService.get(brand, recordType).subscribe(recordType => {
        return WorkflowStepsService.getAllForRecordType(recordType).subscribe(wfSteps => {
          return this.sendResp(req, res, {data: wfSteps});
        });
      });
    }

    public getRelatedRecords(req, res) {
      return this.getRelatedRecordsInternal(req, res).then(response => {
        return this.sendResp(req, res, {data: response});
      });
    }

    public async getRelatedRecordsInternal(req, res) {
      sails.log.verbose(`getRelatedRecordsInternal - starting...`);
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      //TODO may need to check user authorization like in getPermissionsInternal?
      //let record = await this.getRecord(oid).toPromise();
      //or the permissions may be checked in a parent call that will retrieved record oids that a user has access to
      //plus some additional rules/logic that may be applied to filter the records
      let relatedRecords = await this.recordsService.getRelatedRecords(oid, brand);
      return relatedRecords;
    }

    public async getPermissionsInternal(req, res) {
      const oid = req.param('oid');
  let record = await firstValueFrom(this.getRecord(oid));

      let response = {};

      let editUsers = _.get(record, 'authorization.edit', [])
      let editUserResponse = [];
      if (editUsers != null && editUsers != undefined) {
        for (let i = 0; i < editUsers.length; i++) {
          let editUsername = editUsers[i];
          let user = await firstValueFrom(UsersService.getUserWithUsername(editUsername));
          editUserResponse.push({
            username: editUsername,
            name: _.get(user, "name", ""),
            email: _.get(user, "email", "")
          });
        }
      }
      let viewUsers = _.get(record, 'authorization.view', [])
      let viewUserResponse = [];
      if (viewUsers != null && viewUsers != undefined) {
        for (let i = 0; i < viewUsers.length; i++) {
          let viewUsername = viewUsers[i];
          let user = await firstValueFrom(UsersService.getUserWithUsername(viewUsername));

          viewUserResponse.push({
            username: viewUsername,
            name: _.get(user, "name", ""),
            email: _.get(user, "email", "")
          });
        }
      }
      let editPendingUsers = _.get(record, 'authorization.editPending', [])
      let viewPendingUsers = _.get(record, 'authorization.viewPending', [])

      let editRoles = _.get(record, 'authorization.editRoles', [])
      let viewRoles = _.get(record, 'authorization.viewRoles', [])

      return {
        edit: editUserResponse,
        view: viewUserResponse,
        editRoles: editRoles,
        viewRoles: viewRoles,
        editPending: editPendingUsers,
        viewPending: viewPendingUsers
      };
    }

    public getPermissions(req, res) {
      return this.getPermissionsInternal(req, res).then(response => {
        return this.sendResp(req, res, {data: response});
      });
    }


    public getAttachments(req, res) {
      sails.log.verbose('getting attachments....');
      const oid = req.param('oid');
      from(this.recordsService.getAttachments(oid)).subscribe((attachments: any[]) => {
        return this.sendResp(req, res, {data: attachments});
      });
    }

    public async getDataStream(req, res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const datastreamId = req.param('datastreamId');
  const currentRec = await firstValueFrom(this.getRecord(oid));

  const hasViewAccess = await firstValueFrom(this.hasViewAccess(brand, req.user, currentRec));
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
            res.end(Buffer.from(response.body), 'binary');
          }
          return of(oid);
        } catch (error) {
          if (this.isAjax(req)) {
            this.sendResp(req, res, {errors: [error], v1: error.message});
          } else if (error.message == TranslationService.t('edit-error-no-permissions')) {
            this.sendResp(req, res, {status: 403, errors: [error], displayErrors: [{code: 'edit-error-no-permissions'}]});
          } else if (error.message == TranslationService.t('attachment-not-found')) {
            this.sendResp(req, res, {status: 404, errors: [error], displayErrors: [{code: 'attachment-not-found'}]});
          } else {
            this.sendResp(req, res, {status: 500, errors: [error]});
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

    public listWorkspaces(req, res) {
      const url = `${BrandingService.getFullPath(req)}/dashboard/workspace?packageType=workspace&titleLabel=workspaces`;
      return res.redirect(url);
    }

    public async render(req, res) {
      const recordType = req.param('recordType') ? req.param('recordType') : '';
      let packageType = req.param('packageType') ? req.param('packageType') : '';
      let titleLabel = req.param('titleLabel') ? TranslationService.t(req.param('titleLabel')) : `${TranslationService.t('edit-dashboard')} ${TranslationService.t(recordType + '-title-label')}`;
      if(recordType == 'workspace') {
        if(packageType == '') {
          packageType = 'workspace';
        }
        if(titleLabel == '') {
          titleLabel = 'workspaces';
        }
      }

      // Get dashboard config for the record type to determine if admin sidebar should be shown
      let showAdminSideBar = false;
      if (recordType) {
        try {
          const brand = BrandingService.getBrand(req.session.branding);
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


    public async getRecordList(req, res) {

      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);

      const editAccessOnly = req.query.editOnly;

      var roles = [];
      var username = "guest";
      let user: any = {};
      if (req.isAuthenticated()) {
        roles = req.user.roles;
        user = req.user;
        username = req.user.username;
      } else {
        // assign default role if needed...
        user = { username: username };
        roles = [];
        roles.push(RolesService.getDefUnathenticatedRole(brand));
      }
      const recordType = req.param('recordType');
      const workflowState = req.param('state');
      const start = req.param('start');
      const rows = req.param('rows');
      const packageType = req.param('packageType');
      const sort = req.param('sort');
      const filterFieldString = req.param('filterFields');
      let filterString = req.param('filter');
      let filterFields = undefined;
      const filterModeString = req.param('filterMode');
      let secondarySort = req.param('secondarySort');
      let filterMode = undefined;

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

      if(secondarySort == '') {
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
          this.sendResp(req, res, {data: response});
        } else {
          this.sendResp(req, res, {status: 500, meta: response, v1: response});
        }
      } catch (error) {
        this.sendResp(req, res, {
          errors: [error],
          displayErrors: [{title: "Error updating meta", detail: error.message}],
          v1: error.message
        });
      }
    }

    public async getDeletedRecordList(req, res){
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      const editAccessOnly = req.query.editOnly;

      var roles = [];
      var username = "guest";
      let user: any = {};
      if (req.isAuthenticated()) {
        roles = req.user.roles;
        user = req.user;
        username = req.user.username;
      } else {
        // assign default role if needed...
        user = { username: username };
        roles = [];
        roles.push(RolesService.getDefUnathenticatedRole(brand));
      }
      const recordType = req.param('recordType');
      const workflowState = req.param('state');
      const start = req.param('start');
      const rows = req.param('rows');
      const packageType = req.param('packageType');
      const sort = req.param('sort');
      const filterFieldString = req.param('filterFields');
      let filterString = req.param('filter');
      let filterFields = undefined;
      const filterModeString = req.param('filterMode');
      let filterMode = undefined;

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
          this.sendResp(req, res, {data: response});
        } else {
          this.sendResp(req, res, {status: 500, meta: response, v1: response});
        }
      } catch (error) {
        this.sendResp(req, res, {
          errors: [error],
          displayErrors: [{title: "Error updating meta", detail: error.message}],
          v1: error.message
        });
      }
    }

    public renderDeletedRecords(req, res) {
      return this.sendView(req, res, 'admin/deletedRecords');
    }


    private getDocMetadata(doc) {
      var metadata = {};
      for (var key in doc) {
        if (key.indexOf('authorization_') != 0 && key.indexOf('metaMetadata_') != 0) {
          metadata[key] = doc[key];
        }
        if (key == 'authorization_editRoles') {
          metadata[key] = doc[key];
        }
      }
      return metadata;
    }

    protected async getRecords(workflowState, recordType, start, rows, user, roles, brand, editAccessOnly = undefined, packageType = undefined, sort = undefined, filterFields = undefined, filterString = undefined, filterMode = undefined, secondarySort = undefined) {
      const username = user.username;
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        recordType = recordType.split(',');
      }
      if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
        packageType = packageType.split(',');
      }
      var results = await this.recordsService.getRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, filterFields, filterString, filterMode, secondarySort);
      if (!results.isSuccessful()) {
        sails.log.verbose(`Failed to retrieve records!`);
        return null;
      }

      var totalItems = results.totalItems;
      var startIndex = start;
      var noItems = rows;
      var pageNumber = (startIndex / noItems) + 1;

      var response = {};
      response["totalItems"] = totalItems;
      response["currentPage"] = pageNumber;
      response["noItems"] = noItems;

      var items = [];
      var docs = results.items;

      for (var i = 0; i < docs.length; i++) {
        var doc = docs[i];
        var item = {};
        item["oid"] = doc["redboxOid"];
        item["title"] = doc["metadata"]["title"];
        item["metadata"] = this.getDocMetadata(doc);
        item["dateCreated"] = doc["dateCreated"];
        item["dateModified"] = doc["lastSaveDate"];
        item["hasEditAccess"] = this.recordsService.hasEditAccess(brand, user, roles, doc);
        items.push(item);
      }

      response["items"] = items;
      return response;
    }

    protected async getDeletedRecords(workflowState, recordType, start, rows, user, roles, brand, editAccessOnly = undefined, packageType = undefined, sort = undefined, filterFields = undefined, filterString = undefined, filterMode = undefined) {
      const username = user.username;
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        recordType = recordType.split(',');
      }
      if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
        packageType = packageType.split(',');
      }
      var results = await this.recordsService.getDeletedRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort, filterFields, filterString, filterMode);
      if (!results.isSuccessful()) {
        sails.log.verbose(`Failed to retrieve deleted records!`);
        return null;
      }

      var totalItems = results.totalItems;
      var startIndex = start;
      var noItems = rows;
      var pageNumber = (startIndex / noItems) + 1;

      var response = {};
      response["totalItems"] = totalItems;
      response["currentPage"] = pageNumber;
      response["noItems"] = noItems;

      var items = [];
      var docs = results.items;

      for (var i = 0; i < docs.length; i++) {
        var doc = docs[i];
        var item = {};
        const delRecordMeta= doc["deletedRecordMetadata"]
        item["oid"] = doc["redboxOid"];
        item["title"] = delRecordMeta["metadata"]["title"];
        item["dateCreated"] = delRecordMeta["dateCreated"];
        item["dateModified"] = delRecordMeta["lastSaveDate"];
        item["dateDeleted"]  = doc["dateDeleted"];
        items.push(item);
      }

      response["items"] = items;
      return response;
    }

    private mergeRecordMetadata(currentMetadata: { [key: string]: unknown }, newMetadata: { [key: string]: unknown }): { [key: string]: unknown } {
      // Merge the current and new metadata into a new object, replacing the current metadata property values with the new property values.
      return _.mergeWith({}, currentMetadata, newMetadata, (objValue, srcValue) => {
        if (Array.isArray(objValue)) {
          // Merge behavior for arrays is to replace the existing array with the new array.
          // This has the implicit assumption that arrays are complete, not partial.
          // This makes more sense than concatenating because usually an array will contain all items, not a subset of the items.
          return srcValue;
        }
      });
    }
  }
}
