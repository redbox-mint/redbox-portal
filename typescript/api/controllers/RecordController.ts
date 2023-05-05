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

//<reference path='./../../typings/loader.d.ts'/>
declare var module;
declare var sails;
import {
  Observable
} from 'rxjs/Rx';
import {
  StorageServiceResponse,
  RecordTypeResponseModel,
  DashboardTypeResponseModel
} from '@researchdatabox/redbox-core-types';
import moment = require('moment');
import * as tus from 'tus-node-server';
import * as fs from 'fs';
import * as url from 'url';
const checkDiskSpace = require('check-disk-space').default;
declare var _;

declare var FormsService, WorkflowStepsService, BrandingService, RecordsService, RecordTypesService, TranslationService, User, UsersService, EmailService, RolesService;
declare var DashboardTypesService;
/**
 * Package that contains all Controllers.
 */
import { Controllers as controllers, DatastreamService, RecordsService, SearchService } from '@researchdatabox/redbox-core-types';

export module Controllers {
  /**
   * Responsible for all things related to a Record, includings Forms, etc.
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Record extends controllers.Core.Controller {

    recordsService: RecordsService = RecordsService;
    searchService: SearchService;
    datastreamService: DatastreamService = RecordsService;
    private nameRBValidationError = 'RBValidationError';

    constructor() {
      super();
      let that = this;
      sails.after(['hook:redbox:storage:ready', 'hook:redbox:datastream:ready', 'ready'], function () {
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
    protected _exportedMethods: any = [
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
      'getTransferResponsibilityConfig',
      'updateResponsibilities',
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
      'getDashboardType'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() { }

    public getMeta(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid') ? req.param('oid') : '';
      var obs = Observable.fromPromise(this.recordsService.getMeta(oid));
      return obs.subscribe(record => {
        this.hasViewAccess(brand, req.user, record).subscribe(hasViewAccess => {
          if (hasViewAccess) {
            return res.json(record.metadata);
          } else {
            return res.json({
              status: "Access Denied"
            });
          }

        });
      });
    }

    public edit(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid') ? req.param('oid') : '';
      const recordType = req.param('recordType') ? req.param('recordType') : '';
      const rdmp = req.query.rdmp ? req.query.rdmp : '';
      let localFormName;
      if(!_.isUndefined(req.options.locals) && !_.isNull(req.options.locals)) {
        localFormName = req.options.locals.localFormName;
      }
      const extFormName =  localFormName ? localFormName : '';
      let appSelector = 'dmp-form';
      let appName = 'dmp';
      sails.log.debug('RECORD::APP: ' + appName);
      sails.log.debug('RECORD::APP formName: ' + extFormName);
      if (recordType != '' && extFormName == '') {
        FormsService.getForm(brand.id, recordType, true, true).subscribe(form => {
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
        }, error=> {
          sails.log.error("Failed to load form")
          sails.log.error(error)
          return res.serverError();
        });
      } else {
        Observable.fromPromise(this.recordsService.getMeta(oid)).flatMap(record => {
          const formName = record.metaMetadata.form;
          return FormsService.getFormByName(formName, true);
        }).subscribe(form => {
          sails.log.debug(form);
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
      return Observable.of(this.recordsService.hasEditAccess(brand, user, user.roles, currentRec));
    }

    protected hasViewAccess(brand, user, currentRec) {
      sails.log.verbose("Current Record: ");
      sails.log.verbose(currentRec);
      return Observable.of(this.recordsService.hasViewAccess(brand, user, user.roles, currentRec));
    }

    public getTransferResponsibilityConfig(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      var type = req.param('type');
      var recordTypeConfig = sails.config.recordtype;
      return this.getTransferResponsibilityConfigObject(brand, type).subscribe(transferObject => {
        return res.json(transferObject);
      });
    }



    private getTransferResponsibilityConfigObject(brand, recordType) {
      return RecordTypesService.get(brand, recordType).map(recordType => {

        return recordType["transferResponsibility"];
      });
    }

    protected updateResponsibility(transferConfig, role, record, updateData) {
      const respConfig = transferConfig.fields[role];
      if (respConfig.updateField) {
        // overwrite the whole field instead of 'merging'...
        _.set(record, `metadata.${respConfig.updateField}`, updateData);
        // 'merge' code commented out:
        // _.forOwn(updateData, (val, key) => {
        //   _.set(record, `metadata.${respConfig.updateField}.${key}`, val);
        // });
      }
      if (respConfig.fieldNames) {
        if (respConfig.updateFirstArrayMember) {
          _.forOwn(respConfig.fieldNames, (val, key) => {
            _.set(record, `metadata.${val}`, _.get(updateData, key));
          });
        } else {
          _.forOwn(respConfig.fieldNames, (val, key) => {
            _.set(record, `metadata.${val}`, _.get(updateData, key));
          });
        }
      }
      if (respConfig.updateAlso) {
        _.each(respConfig.updateAlso, (relatedRole) => {
          record = this.updateResponsibility(transferConfig, relatedRole, record, updateData);
        });
      }
      return record;
    }

    public updateResponsibilities(req, res) {
      sails.log.verbose(`updateResponsibilities() -> Starting...`);
      const brand = BrandingService.getBrand(req.session.branding);
      const user = req.user;
      const records = req.body.records;
      const updateData = req.body.updateData;
      var role = req.body.role;
      var toEmail = updateData.email;
      var toName = updateData.text_full_name;
      let recordCtr = 0;
      if (records.length > 0) {
        let completeRecordSet = [];
        let hasError = false;
        _.forEach(records, (rec) => {
          // First: check if this user has edit access to this record, we don't want Gremlins sneaking in on us
          // Not trusting what was posted, retrieving from DB...
          sails.log.verbose(`updateResponsibilities() -> Processing:${rec.oid}`);
          this.getRecord(rec.oid).subscribe(async (recObj) => {
            if (this.recordsService.hasEditAccess(brand, user, user.roles, recObj)) {
              let recType = recObj.metaMetadata.type;
              let relatedRecords = await this.recordsService.getRelatedRecords(rec.oid, brand);
              sails.log.verbose(`updateResponsibilities() -> Related records:`);
              sails.log.verbose(JSON.stringify(relatedRecords));
              let relationships = relatedRecords['processedRelationships'];
              let relatedObjects = relatedRecords['relatedObjects'];

              //If there are no relationships, the record isn't related to any others so manually inject the info needed to have this record processed
              if (relationships.indexOf(recType) == -1) {
                relationships.push(recType);
                relatedObjects[recType] = [{
                  redboxOid: rec.oid
                }];
              }
              let relationshipCount = 0;
              _.each(relationships, relationship => {
                let relationshipObjects = relatedObjects[relationship];
                relationshipCount++;
                let relationshipObjectCount = 0;
                _.each(relationshipObjects, relationshipObject => {

                  const oid = relationshipObject.redboxOid;
                  let record = null;
                  this.getRecord(oid)
                    .flatMap((rec) => {
                      record = rec;
                      return RecordTypesService.get(brand, record.metaMetadata.type);
                    })
                    .subscribe(recordTypeObj => {

                      const transferConfig = recordTypeObj['transferResponsibility'];
                      if (transferConfig) {
                        record = this.updateResponsibility(transferConfig, role, record, updateData);

                        sails.log.verbose(`Updating record ${oid}`);
                        sails.log.verbose(JSON.stringify(record));
                        Observable.fromPromise(this.recordsService.updateMeta(brand, oid, record)).subscribe(response => {
                          relationshipObjectCount++;
                          if (response && response.isSuccessful()) {
                            if (oid == rec.oid) {
                              recordCtr++;
                            }
                            var to = toEmail;
                            var subject = "Ownership transfered";
                            var data = {};
                            data['record'] = record;
                            data['name'] = toName;
                            data['oid'] = oid;
                            EmailService.sendTemplate(to, subject, "transferOwnerTo", data);



                            if (relationshipCount == relationships.length && relationshipObjectCount == relationshipObjects.length) {
                              completeRecordSet.push({
                                success: true,
                                record: record
                              });
                              if (completeRecordSet.length == records.length) {
                                if (hasError) {
                                  return this.ajaxFail(req, res, null, completeRecordSet);
                                } else {
                                  return this.ajaxOk(req, res, null, completeRecordSet);
                                }
                              } else {
                                sails.log.verbose(`Completed record set:`);
                                sails.log.verbose(`${completeRecordSet.length} == ${records.length}`);
                              }
                            } else {
                              sails.log.verbose(`Record counter:`);
                              sails.log.verbose(`${recordCtr} == ${records.length} && ${relationshipCount} == ${relationships.length} && ${relationshipObjectCount} == ${relationshipObjects.length}`);
                            }
                          } else {
                            sails.log.error(`Failed to update authorization:`);
                            sails.log.error(response);
                            hasError = true;
                            completeRecordSet.push({
                              success: false,
                              error: response,
                              record: record
                            });
                            if (completeRecordSet.length == records.length) {
                              if (hasError) {
                                return this.ajaxFail(req, res, null, completeRecordSet);
                              } else {
                                return this.ajaxOk(req, res, null, completeRecordSet);
                              }
                            }
                          }
                        }, error => {
                          sails.log.error("Error updating auth:");
                          sails.log.error(error);
                          hasError = true;
                          completeRecordSet.push({
                            success: false,
                            error: error.message,
                            record: record
                          });
                          if (completeRecordSet.length == records.length) {
                            if (hasError) {
                              return this.ajaxFail(req, res, null, completeRecordSet);
                            } else {
                              return this.ajaxOk(req, res, null, completeRecordSet);
                            }
                          }
                        });

                      }
                    });
                });

              });

            } else {
              const errorMsg = `Attempted to transfer responsibilities, but user: '${user.username}' has no access to record: ${rec.oid}`;
              sails.log.error(errorMsg);
              completeRecordSet.push({
                success: false,
                error: errorMsg,
                record: rec
              });
              // send response in case failures occur in the last entry of the array
              if (completeRecordSet.length == records.length) {
                if (hasError) {
                  return this.ajaxFail(req, res, null, completeRecordSet);
                } else {
                  return this.ajaxOk(req, res, null, completeRecordSet);
                }
              }
            }
          }, e => {
            sails.log.error(`Failed to update responsiblities:`);
            sails.log.error(JSON.stringify(e));
            return this.ajaxFail(req, res, 'Failed to update responsibilities, see server log.');
          });
        });
      } else {
        return this.ajaxFail(req, res, 'No records specified');
      }
    }


    public getForm(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const name = req.param('name');
      const oid = req.param('oid');
      const editMode = req.query.edit == "true";
      const formParam = req.param('formName');
      let obs = null;
      if (_.isEmpty(oid)) {
        obs = FormsService.getForm(brand.id, name, editMode, true).flatMap(form => {
          let mergedForm = this.mergeFields(req, res, form.fields, form.requiredFieldIndicator, name, {}).then(fields => {
            form.fields = fields;
            return form;
          });
          return mergedForm;
        });
      } else {
        // defaults to retrive the form of the current workflow state...
        obs = Observable.fromPromise(this.recordsService.getMeta(oid)).flatMap(currentRec => {
          if (_.isEmpty(currentRec)) {
            return Observable.throw(new Error(`Error, empty metadata for OID: ${oid}`));
          }
          // allow client to set the form name to use
          const formName = _.isUndefined(formParam) || _.isEmpty(formParam) ? currentRec.metaMetadata.form : formParam;
          if (editMode) {
            return this.hasEditAccess(brand, req.user, currentRec)
              .flatMap(hasEditAccess => {
                if (!hasEditAccess) {
                  return Observable.throw(new Error(TranslationService.t('edit-error-no-permissions')));
                }
                return FormsService.getFormByName(formName, editMode).flatMap(form => {
                  if (_.isEmpty(form)) {
                    return Observable.throw(new Error(`Error, getting form ${formName} for OID: ${oid}`));
                  }
                  let mergedForm = this.mergeFields(req, res, form.fields, form.requiredFieldIndicator, currentRec.metaMetadata.type, currentRec).then(fields => {
                    form.fields = fields;

                    return form;
                  });
                  return mergedForm;
                });
              });
          } else {
            return this.hasViewAccess(brand, req.user, currentRec)
              .flatMap(hasViewAccess => {
                if (!hasViewAccess) {
                  return Observable.throw(new Error(TranslationService.t('view-error-no-permissions')));
                }
                return this.hasEditAccess(brand, req.user, currentRec)
              })
              .flatMap(hasEditAccess => {
                return FormsService.getFormByName(formName, editMode).flatMap(form => {
                  if (_.isEmpty(form)) {
                    return Observable.throw(new Error(`Error, getting form ${formName} for OID: ${oid}`));
                  }
                  FormsService.filterFieldsHasEditAccess(form.fields, hasEditAccess);
                  return this.mergeFields(req, res, form.fields, form.requiredFieldIndicator, currentRec.metaMetadata.type, currentRec).then(fields => {
                    form.fields = fields;

                    return form;
                  });
                });
              });
          }
        });
      }
      obs.subscribe(form => {
        if (!_.isEmpty(form)) {
          this.ajaxOk(req, res, null, form);
        } else {
          this.ajaxFail(req, res, null, {
            message: `Failed to get form with name:${name}`
          });
        }
      }, error => {
        sails.log.error("Error getting form definition:");
        sails.log.error(error);
        let message = error.message;
        if (error.error && error.error.code == 500) {
          message = TranslationService.t('missing-record');
        }
        this.ajaxFail(req, res, message);
      });

    }

    public create(req, res) {
      this.createInternal(req, res).then(result => { });
    }

    private async createInternal(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
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
      record.metaMetadata.brandId = brand.id;
      record.metaMetadata.createdBy = req.user.username;
      record.metaMetadata.createdOn = moment().format();
      record.metaMetadata.lastSaveDate = record.metaMetadata.createdOn;
      //TODO: This is currently hardcoded
      record.metaMetadata.type = recType;
      record.metadata = metadata;

      let recordType = await RecordTypesService.get(brand, recType).toPromise();

      if (recordType.packageType) {
        record.metaMetadata.packageType = recordType.packageType;
      }

      if (recordType.packageName) {
        record.metaMetadata.packageName = recordType.packageName;
      }
      let wfStep = await WorkflowStepsService.getFirst(recordType).toPromise();
      if (targetStep) {
        wfStep = await WorkflowStepsService.get(recType, targetStep).toPromise();
      }
      try {
        this.recordsService.updateWorkflowStep(record, wfStep);
        return this.createRecord(record, brand, recordType, req, res);
      } catch (error) {
        this.ajaxFail(req, res, `Failed to save record: ${error}`);
      }

    }

    private async createRecord(record, brand, recordType, req, res) {
      const user = req.user;
      let formDef = null;
      let oid = null;
      const fieldsToCheck = ['location', 'uploadUrl'];
      let form = await FormsService.getFormByName(record.metaMetadata.form, true).toPromise();

      sails.log.verbose(`RecordController - createRecord - enter`);
      formDef = form;
      record.metaMetadata.attachmentFields = form.attachmentFields;
      let updateResponse = await this.recordsService.create(brand, record, recordType, user);

      if (updateResponse && _.isFunction(updateResponse.isSuccessful) && updateResponse.isSuccessful()) {
        oid = updateResponse.oid;
        sails.log.verbose(`RecordController - createRecord - oid ${oid}`);
        if (!_.isEmpty(record.metaMetadata.attachmentFields)) {
          // check if we have any pending-oid elements
          _.each(record.metaMetadata.attachmentFields, (attFieldName) => {
            _.each(_.get(record.metadata, attFieldName), (attFieldEntry, attFieldIdx) => {
              if (!_.isEmpty(attFieldEntry)) {
                _.each(fieldsToCheck, (fldName) => {
                  const fldVal = _.get(attFieldEntry, fldName);
                  if (!_.isEmpty(fldVal)) {
                    sails.log.verbose(`RecordController - createRecord - fldVal ${fldVal}`);
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
            sails.log.verbose(`RecordController - createRecord - before handleUpdateDataStream`);
            let resposeDatastream = await this.handleUpdateDataStream(oid, emptyDatastreamRecord, record.metadata).toPromise();
          } catch (error) {
            throw new Error(`RecordController - createRecord - Failed to save record: ${error}`);
          }

          // update the metadata ...
          updateResponse = await this.recordsService.updateMeta(brand, oid, record, user, false, false);

          if (updateResponse && _.isFunction(updateResponse.isSuccessful) && updateResponse.isSuccessful()) {
            sails.log.verbose(`RecordController - createRecord - before ajaxOk`);
            this.ajaxOk(req, res, null, updateResponse);
            return updateResponse;
          } else {
            this.ajaxFail(req, res, null, updateResponse);
          }
        } else {
          this.ajaxOk(req, res, null, updateResponse);
        }
      } else {
        sails.log.error(`createRecord - createRecord - Failed to save record:`);
        sails.log.error(JSON.stringify(updateResponse));
        this.ajaxFail(req, res, null, updateResponse);
      }
    }

    public delete(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const user = req.user;
      let currentRec = null;
      let message = null;
      this.getRecord(oid).flatMap(cr => {
        currentRec = cr;
        return this.hasEditAccess(brand, user, currentRec);
      })
        .flatMap(hasEditAccess => {
          if (hasEditAccess) {
            return Observable.fromPromise(this.recordsService.delete(oid));
          }
          message = TranslationService.t('edit-error-no-permissions');
          return Observable.throw(new Error(TranslationService.t('edit-error-no-permissions')));
        })
        .subscribe(response => {
          if (response && response.isSuccessful()) {
            const resp = {
              success: true,
              oid: oid
            };
            sails.log.verbose(`Successfully deleted: ${oid}`);
            this.ajaxOk(req, res, null, resp);
          } else {
            this.ajaxFail(req, res, TranslationService.t('failed-delete'), {
              success: false,
              oid: oid,
              message: response.message
            });
          }
        }, error => {
          sails.log.error("Error deleting:");
          sails.log.error(error);
          if (message == null) {
            message = error.message;
          } else
            if (error.error && error.error.code == 500) {
              message = TranslationService.t('missing-record');
            }
          this.ajaxFail(req, res, message);
        });
    }

    public update(req, res) {
      this.updateInternal(req, res).then(result => { });
    }

    private async updateInternal(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const metadata = req.body;
      const oid = req.param('oid');
      const targetStep = req.param('targetStep');
      const user = req.user;
      let currentRec = null;
      let origRecord = null;
      const failedAttachments = [];
      let recType = null;
      sails.log.verbose(`RecordController - updateInternal - enter`);

      let cr = await this.getRecord(oid).toPromise()
      currentRec = cr;
      let hasEditAccess = await this.hasEditAccess(brand, user, currentRec).toPromise();
      if (!hasEditAccess) {
        return res.forbidden();
      }
      let recordType = await RecordTypesService.get(brand, currentRec.metaMetadata.type).toPromise();
      recType = recordType;
      let nextStepResp = null;
      if (targetStep) {
        nextStepResp = await WorkflowStepsService.get(recType, targetStep).toPromise();
      }
      if (!metadata.delete) {

        let nextStep: any = nextStepResp;
        let hasPermissionToTransition = true;
        if (nextStep != undefined) {
          if (nextStep.config != undefined) {
            if (nextStep.config.authorization.transitionRoles != undefined) {
              if (nextStep.config.authorization.transitionRoles.length > 0) {
                let validRoles = _.filter(nextStep.config.authorization.transitionRoles, role => {
                  let val = _.find(user.roles, userRole => {
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
          }
        }
        if (hasPermissionToTransition) {
          sails.log.verbose(`RecordController - updateInternal - hasPermissionToTransition - enter`);
          this.recordsService.updateWorkflowStep(currentRec, nextStep);
        }
        origRecord = _.cloneDeep(currentRec);
        sails.log.verbose(`RecordController - updateInternal - origRecord - cloneDeep`);
        currentRec.metadata = metadata;
      }

      try {
        if (metadata.delete) {
          let response = await this.recordsService.delete(oid);
          if (response && response.isSuccessful()) {
            response.success = true;
            sails.log.verbose(`Successfully deleted: ${oid}`);
            this.ajaxOk(req, res, null, response);
          } else {
            this.ajaxFail(req, res, TranslationService.t('failed-delete'), response);
          }
        }
      } catch (error) {
        sails.log.error(`Error deleting: ${oid}`);
        sails.log.error(error);
        this.ajaxFail(req, res, error.message);
      }

      let form = await FormsService.getFormByName(currentRec.metaMetadata.form, true).toPromise()
      currentRec.metaMetadata.attachmentFields = form.attachmentFields;
      let response;
      let preTriggerResponse = new StorageServiceResponse();
      const failedMessage = "Failed to update record, please check server logs.";
      try {
        // process pre-save
        if (!_.isEmpty(brand)) {
          try {
            preTriggerResponse.oid = oid;
            let recordType = await RecordTypesService.get(brand, currentRec.metaMetadata.type).toPromise();
            currentRec = await this.recordsService.triggerPreSaveTriggers(oid, currentRec, recordType, "onUpdate", user);
          } catch(err) {
            sails.log.verbose(`RecordController - updateInternal - triggerPreSaveTriggers err `+JSON.stringify(err));
            if(err.name == this.nameRBValidationError) {
              sails.log.error(err.message);
              preTriggerResponse.message = err.message;
            } else {
              sails.log.error(JSON.stringify(err));
              preTriggerResponse.message = failedMessage;
            }
            this.ajaxFail(req, res, err.message);
            return preTriggerResponse;
          }
        }
        sails.log.verbose(`RecordController - updateInternal - metadata.dataLocations `+JSON.stringify(metadata.dataLocations));
        sails.log.verbose(`RecordController - updateInternal - origRecord.metadata.dataLocations `+JSON.stringify(origRecord.metadata.dataLocations));
        sails.log.verbose(`RecordController - updateInternal - currentRec.metadata.dataLocations `+JSON.stringify(currentRec.metadata.dataLocations));
        sails.log.verbose(`RecordController - updateInternal - before this.updateMetadata`);
        response = await this.handleUpdateDataStream(oid, origRecord, metadata).toPromise();

        const fieldsToCheck = ['location', 'uploadUrl'];
        if (!_.isEmpty(currentRec.metaMetadata.attachmentFields)) {
          // check if we have any pending-oid elements
          _.each(currentRec.metaMetadata.attachmentFields, (attFieldName) => {
            _.each(_.get(currentRec.metadata, attFieldName), (attFieldEntry, attFieldIdx) => {
              if (!_.isEmpty(attFieldEntry)) {
                _.each(fieldsToCheck, (fldName) => {
                  const fldVal = _.get(attFieldEntry, fldName);
                  if (!_.isEmpty(fldVal)) {
                    sails.log.verbose(`RecordController - updateInternal - fldVal ${fldVal}`);
                    _.set(currentRec.metadata, `${attFieldName}[${attFieldIdx}].${fldName}`, _.replace(fldVal, 'pending-oid', oid));
                  }
                });
              }
            });
          });
        }

        sails.log.verbose(`RecordController - updateInternal - Done with updating streams...`);
        response = await this.updateMetadataWithTriggerSelector(brand, oid, currentRec, user, false, true).toPromise();

        if (response && response.isSuccessful()) {
          sails.log.verbose(`RecordController - updateInternal - before ajaxOk`);
          this.ajaxOk(req, res, null, response);
          return response;
        } else {
          this.ajaxFail(req, res, null, response);
        }
      } catch (error) {
        sails.log.error('RecordController - updateInternal - Failed to run pre-save hooks when onUpdate... or Error updating meta:');
        sails.log.error(error);
        this.ajaxFail(req, res, error.message);
      }
    }

    /**
     * Handles data stream updates, atm, this call is terminal.
     */
    protected updateDataStream(oid, origRecord, metadata, response, req, res) {
      sails.log.verbose(`RecordController - updateDataStream - enter`);
      return this.handleUpdateDataStream(oid, origRecord, metadata)
        .subscribe(whatever => {
          sails.log.verbose(`Done with updating streams and returning response...`);
          response.success = true;
          this.ajaxOk(req, res, null, response);
        }, error => {
          sails.log.error("Error updating datatreams:");
          sails.log.error(error);
          this.ajaxFail(req, res, error.message);
        });
    }

    protected handleUpdateDataStream(oid, origRecord, metadata) {
      const fileIdsAdded = [];

      return this.datastreamService.updateDatastream(oid, origRecord, metadata, sails.config.record.attachments.stageDir, fileIdsAdded)
        .concatMap(reqs => {
          if (reqs) {
            sails.log.verbose(`Updating data streams...`);
            return Observable.from(reqs);
          } else {
            sails.log.verbose(`No datastreams to update...`);
            return Observable.of(null);
          }
        })
        .concatMap((promise) => {
          if (promise) {
            sails.log.verbose(`Update datastream request is...`);
            sails.log.verbose(JSON.stringify(promise));
            return promise.catch(e => {
              sails.log.verbose(`Error in updating stream::::`);
              sails.log.verbose(JSON.stringify(e));
              return Observable.throwError(new Error(TranslationService.t('attachment-upload-error')));
            });
          } else {
            return Observable.of(null);
          }
        })
        .concatMap(updateResp => {
          if (updateResp) {
            sails.log.verbose(`Got response from update datastream request...`);
            sails.log.verbose(JSON.stringify(updateResp));
          }
          return Observable.of(updateResp);
        })
        .last();
    }

    protected saveMetadata(brand, oid, currentRec, metadata, user): Observable<any> {
      currentRec.metadata = metadata;
      return this.updateMetadata(brand, oid, currentRec, user);
    }

    protected saveAuthorization(brand, oid, currentRec, authorization, user): Observable<any> {
      let editAccessResp: Observable<boolean> = this.hasEditAccess(brand, user, currentRec);
      return editAccessResp
        .map(hasEditAccess => {
          if (hasEditAccess) {
            currentRec.authorization = authorization;
            return this.updateAuthorization(brand, oid, currentRec, user);
          } else {
            return {
              code: 403,
              message: "Not authorized to edit"
            };
          }
        });
    }



    protected getRecord(oid) {
      return Observable.fromPromise(this.recordsService.getMeta(oid)).flatMap(currentRec => {
        if (_.isEmpty(currentRec)) {
          return Observable.throw(new Error(`Failed to update meta, cannot find existing record with oid: ${oid}`));
        }
        return Observable.of(currentRec);
      });
    }

    protected updateMetadata(brand, oid, currentRec, user) {
      if (currentRec.metaMetadata.brandId != brand.id) {
        return Observable.throw(new Error(`Failed to update meta, brand's don't match: ${currentRec.metaMetadata.brandId} != ${brand.id}, with oid: ${oid}`));
      }
      currentRec.metaMetadata.lastSavedBy = user.username;
      currentRec.metaMetadata.lastSaveDate = moment().format();
      sails.log.verbose(`Calling record service...`);
      sails.log.verbose(currentRec);
      return Observable.fromPromise(this.recordsService.updateMeta(brand, oid, currentRec, user));
    }

    protected updateMetadataWithTriggerSelector(brand, oid, currentRec, user, triggerPreSaveTriggers, triggerPostSaveTriggers) {
      if (currentRec.metaMetadata.brandId != brand.id) {
        return Observable.throw(new Error(`RecordController - updateMetadataWithTriggerSelector - Failed to update meta, brand's don't match: ${currentRec.metaMetadata.brandId} != ${brand.id}, with oid: ${oid}`));
      }
      currentRec.metaMetadata.lastSavedBy = user.username;
      currentRec.metaMetadata.lastSaveDate = moment().format();
      sails.log.verbose(`RecordController - updateMetadataWithTriggerSelector - Calling record service...`);
      sails.log.verbose(`RecordController - updateMetadataWithTriggerSelector - triggerPreSaveTriggers ${triggerPreSaveTriggers}`);
      sails.log.verbose(`RecordController - updateMetadataWithTriggerSelector - triggerPostSaveTriggers ${triggerPostSaveTriggers}`);
      return Observable.fromPromise(this.recordsService.updateMeta(brand, oid, currentRec, user, triggerPreSaveTriggers, triggerPostSaveTriggers));
    }

    protected updateAuthorization(brand, oid, currentRec, user) {
      if (currentRec.metaMetadata.brandId != brand.id) {
        return Observable.throw(new Error(`Failed to update meta, brand's don't match: ${currentRec.metaMetadata.brandId} != ${brand.id}, with oid: ${oid}`));
      }
      return Observable.fromPromise(this.recordsService.updateMeta(brand, oid, currentRec, user));
    }

    public stepTo(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const metadata = req.body;
      const oid = req.param('oid');
      const targetStep = req.param('targetStep');
      let origRecord = null;
      return this.getRecord(oid).flatMap(currentRec => {
        origRecord = _.cloneDeep(currentRec);
        return this.hasEditAccess(brand, req.user, currentRec)
          .flatMap(hasEditAccess => {
            if (!hasEditAccess) {
              return Observable.throw(new Error(TranslationService.t('edit-error-no-permissions')));
            }
            return RecordTypesService.get(brand, origRecord.metaMetadata.type);
          })
          .flatMap(recType => {
            return WorkflowStepsService.get(recType, targetStep)
              .flatMap(nextStep => {
                currentRec.metadata = metadata;
                sails.log.verbose("Current rec:");
                sails.log.verbose(currentRec);
                sails.log.verbose("Next step:");
                sails.log.verbose(nextStep);
                this.recordsService.updateWorkflowStep(currentRec, nextStep);
                return this.updateMetadata(brand, oid, currentRec, req.user);
              });
          })
      })
        .subscribe(response => {
          let responseValue: Observable<any> = response;
          return responseValue.subscribe(response => {
            sails.log.error(response);
            if (response && response.isSuccessful()) {
              response.success = true;
              this.ajaxOk(req, res, null, response);
            } else {
              this.ajaxFail(req, res, null, response);
            }
          }, error => {
            sails.log.error("Error updating meta:");
            sails.log.error(error);
            this.ajaxFail(req, res, error.message);
          });
        });
    }

    protected async mergeFields(req, res, fields, requiredFieldIndicator, type, currentRec) {

      let recordType = await RecordTypesService.get(BrandingService.getBrand(req.session.branding), type).toPromise();
      let workflowSteps = await WorkflowStepsService.getAllForRecordType(recordType).toPromise();
      this.mergeFieldsSync(req, res, fields,requiredFieldIndicator, currentRec, workflowSteps);
      return fields;
    }

    protected mergeFieldsSync(req, res, fields,requiredFieldIndicator, currentRec, workflowSteps) {
      const fieldsToDelete = [];
      const metadata = currentRec.metadata;
      const metaMetadata = currentRec.metaMetadata;
      _.forEach(fields, (field: any) => {   
        if (!_.isUndefined(requiredFieldIndicator) && _.isEmpty(field.definition.requiredFieldIndicator) && _.isUndefined(field.definition.requiredFieldIndicator)) {
          _.set(field,'definition.requiredFieldIndicator',requiredFieldIndicator)
        }
        if (!_.isEmpty(field.definition.name) && !_.isUndefined(field.definition.name)) {
          if (_.has(metaMetadata, field.definition.name)) {
            field.definition.value = metaMetadata[field.definition.name];
          } else
            if (_.has(metadata, field.definition.name)) {
              field.definition.value = metadata[field.definition.name];
            }
        }
        this.replaceCustomFields(req, res, field, currentRec);
        const val = field.definition.value;
        if (field.roles) {
          let hasAccess = false;
          _.each(field.roles, (r) => {
            hasAccess = RolesService.getRoleWithName(req.user.roles, r);
            if (hasAccess) return false;
          });
          if (!hasAccess) {
            fieldsToDelete.push(field);
          }
        }

        if (field.class == "SaveButton") {
          if (field.definition.targetStep) {
            let workflowStep = _.filter(workflowSteps, workflowStep => {
              return workflowStep.name == field.definition.targetStep;
            });
            if (workflowStep.length > 0) {
              workflowStep = workflowStep[0];
              if (workflowStep.config.authorization.transitionRoles) {
                let hasAccess = false;
                _.each(workflowStep.config.authorization.transitionRoles, (r) => {
                  hasAccess = RolesService.getRoleWithName(req.user.roles, r);
                  if (hasAccess) return false;
                });
                if (!hasAccess) {
                  fieldsToDelete.push(field);
                }
              }
            } else {
              sails.log.warn("Form configuration contains a target step that doesn't exist for record");
            }
          }
        }
        if (field.definition.fields && _.isObject(val) && !_.isString(val) && !_.isUndefined(val) && !_.isNull(val) && !_.isEmpty(val)) {
          _.each(field.definition.fields, fld => {
            fld.definition.value = _.get(metadata, `${field.definition.name}.${fld.definition.name}`);
          });
        } else
          if (field.definition.fields) {
            this.mergeFieldsSync(req, res, field.definition.fields, requiredFieldIndicator, currentRec, workflowSteps);
          }
      });
      _.remove(fields, (f) => {
        return _.includes(fieldsToDelete, f);
      });
    }

    protected replaceCustomFields(req, res, field, record) {
      let variableSubstitutionFields = field.variableSubstitutionFields;
      if (!_.isEmpty(variableSubstitutionFields)) {
        _.forEach(variableSubstitutionFields, fieldName => {
          _.forOwn(sails.config.record.customFields, (customConfig, customKey) => {
            const fieldTarget = _.get(field.definition, fieldName);
            if (!_.isEmpty(fieldTarget) && _.isString(fieldTarget) && fieldTarget.indexOf(customKey) != -1) {
              let replacement = null;
              if (customConfig.source == 'request') {
                switch (customConfig.type) {
                  case 'session':
                    replacement = req.session[customConfig.field];
                    break;
                  case 'param':
                    replacement = req.param(customConfig.field);
                    break;
                  case 'user':
                    replacement = req.user[customConfig.field];
                    break;
                  case 'header':
                    replacement = req.get(customConfig.field);
                    break;
                }
              }

              if (customConfig.source == 'record' || customConfig.source == "metadata") {
                const startIdx = fieldTarget.indexOf(customKey);
                const endIdx = fieldTarget.indexOf(']', startIdx);
                let metadataField = fieldTarget.substring(startIdx + customKey.length + 1, endIdx);
                customKey = `${customKey}[${metadataField}]`;
                let dataSrc = record.metadata;
                if (customConfig.source == 'record') {
                  // for accessing fields outside of the 'metadata'
                  dataSrc = record;
                  sails.log.verbose(`Replacing custom field: '${customKey}' with record field path: ${metadataField}`);
                } else {
                  // retained for backwards compat
                  sails.log.verbose(`Replacing custom field: '${customKey}' with metadata field path: ${metadataField}`);
                }
                replacement = _.get(dataSrc, metadataField);
              }


              if (!_.isEmpty(replacement)) {
                if (customConfig.parseUrl && customConfig.searchParams) {
                  const urlParsed = new url.URL(replacement);
                  replacement = urlParsed.searchParams.get(customConfig.searchParams);
                }
                _.set(field.definition, fieldName, fieldTarget.replace(customKey, replacement));
              }
            }
          });
        });
      }
    }


    /**
     *  Not currently used as transfer responsibility is configured.
     *  Commenting out so we can reinstate it when more formal "edit permission"
     *    screens are implemented.
     */
    // public modifyEditors(req, res) {
    //   const records = req.body.records;
    //   var toUsername = req.body.username;
    //   var toEmail = req.body.email;
    //   //TODO: Add email to username lookup
    //   const fromUsername = req.user.username;
    //   const brand = BrandingService.getBrand(req.session.branding);
    //   const user = req.user;
    //
    //   let recordCtr = 0;
    //   if (records.length > 0) {
    //     _.forEach(records, rec => {
    //       const oid = rec.oid;
    //       this.getRecord(oid).subscribe(record => {
    //         const authorization = _.cloneDeep(record.authorization);
    //         // current user will lose edit access but will keep read-only access
    //         _.remove(authorization.edit, (username) => {
    //           return username == fromUsername;
    //         });
    //         if (_.isUndefined(_.find(authorization.view, (username) => { return username == fromUsername }))) {
    //           authorization.view.push(fromUsername);
    //         }
    //         if (!_.isEmpty(toUsername)) {
    //           if (_.isUndefined(_.find(authorization.edit, (username) => { return username == toUsername }))) {
    //             authorization.edit.push(toUsername);
    //           }
    //         } else {
    //           if (_.isUndefined(_.find(authorization.editPending, (email) => { return toEmail == email }))) {
    //             if (_.isUndefined(authorization.editPending)) {
    //               authorization.editPending = [];
    //             }
    //             authorization.editPending.push(toEmail);
    //           }
    //         }
    //
    //         this.saveAuthorization(brand, oid, record, authorization, user).subscribe(response => {
    //           if (response && response.code == "200") {
    //             recordCtr++;
    //             if (recordCtr == records.length) {
    //               response.success = true;
    //               this.ajaxOk(req, res, null, response);
    //             }
    //           } else {
    //             sails.log.error(`Failed to update authorization:`);
    //             sails.log.error(response);
    //             this.ajaxFail(req, res, TranslationService.t('auth-update-error'));
    //           }
    //         }, error => {
    //           sails.log.error("Error updating auth:");
    //           sails.log.error(error);
    //           this.ajaxFail(req, res, error.message);
    //         });
    //       });
    //     });
    //   } else {
    //     this.ajaxFail(req, res, 'No records specified');
    //   }
    // }

    public async search(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const type = req.param('type');
      let rows = req.param('rows');
      let page = req.param('page');
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
        let searchRes = await this.searchService.searchFuzzy(type, workflow, searchString, exactSearches, facetSearches, brand, req.user, req.user.roles, sails.config.record.search.returnFields, start, rows);
        searchRes['page'] = page
        this.ajaxOk(req, res, null, searchRes);
      } catch (error) {
        this.ajaxFail(req, res, error.message);
      }
    }
    /** 
     * Returns the RecordType configuration based of the response model that is intentionally restricting 
     * the object schema and information that is allowed to be sent back in this endpoint
     */
    public getType(req, res) {
      const recordType = req.param('recordType');
      const brand = BrandingService.getBrand(req.session.branding);
      RecordTypesService.get(brand, recordType).subscribe(recordType => {
        let recordTypeModel = new RecordTypeResponseModel(_.get(recordType, 'name'), _.get(recordType, 'packageType'));
        this.ajaxOk(req, res, null, recordTypeModel);
      }, error => {
        this.ajaxFail(req, res, error.message);
      });
    }

    /** 
     * Returns all RecordTypes configuration based of the response model that is intentionally restricting 
     * the object schema and information that is allowed to be sent back in this endpoint
     */
    public getAllTypes(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      RecordTypesService.getAll(brand).subscribe(recordTypes => {
        let recordTypeModels = [];
        for (let recType of recordTypes) {
          let recordTypeModel = new RecordTypeResponseModel(_.get(recType, 'name'), _.get(recType, 'packageType'));
          recordTypeModels.push(recordTypeModel);
        }
        this.ajaxOk(req, res, null, recordTypeModels);
      }, error => {
        this.ajaxFail(req, res, error.message);
      });
    }

    public getDashboardType(req, res) {
      const dashboardTypeParam = req.param('dashboardType');
      const brand = BrandingService.getBrand(req.session.branding);
      DashboardTypesService.get(brand, dashboardTypeParam).subscribe(dashboardType => {
        let dashboardTypeModel = new DashboardTypeResponseModel(_.get(dashboardType, 'name'), _.get(dashboardType,'formatRules'));
        this.ajaxOk(req, res, null, dashboardTypeModel);
      }, error => {
        this.ajaxFail(req, res, error.message);
      });
    }

    public getAllDashboardTypes(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      DashboardTypesService.getAll(brand).subscribe(dashboardTypes => {
        let dashboardTypesModel = { dashboardTypes: [] };
        let dashboardTypesModelList = [];
        for (let dashboardType of dashboardTypes) {
          let dashboardTypeModel = new DashboardTypeResponseModel(_.get(dashboardType, 'name'), _.get(dashboardType,'formatRules'));
          dashboardTypesModelList.push(dashboardTypeModel);
        }
        _.set(dashboardTypesModel, 'dashboardTypes', dashboardTypesModelList);
        this.ajaxOk(req, res, null, dashboardTypesModel);
      }, error => {
        this.ajaxFail(req, res, error.message);
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
      const brand = BrandingService.getBrand(req.session.branding);
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
      const currentRec = await this.getRecord(oid).toPromise();

      if (method == 'get') {
        const hasViewAccess = await this.hasViewAccess(brand, req.user, currentRec).toPromise();

        if (!hasViewAccess) {
          sails.log.error("Error: edit error no permissions in do attachment.");
          return Observable.throwError(new Error(TranslationService.t('edit-error-no-permissions')));
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
          return Observable.throwError(new Error(TranslationService.t('attachment-not-found')));
        }
        let mimeType = found.mimeType;
        if (_.isEmpty(mimeType)) {
          // Set octet stream as a default
          mimeType = 'application/octet-stream'
        }
        res.set('Content-Type', mimeType);
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
          return Observable.of(oid);
        } catch (error) {
          if (this.isAjax(req)) {
            this.ajaxFail(req, res, error.message);
          } else {
            if (error.message == TranslationService.t('edit-error-no-permissions')) {
              res.forbidden();
            } else if (error.message == TranslationService.t('attachment-not-found')) {
              res.notFound();
            } else {
              res.serverError();
            }
          }
        }
      } else {
        const hasEditAccess = await this.hasEditAccess(brand, req.user, currentRec).toPromise();
        if (!hasEditAccess) {
          sails.log.error("Error: edit error no permissions in do attachment.");
          return Observable.throwError(new Error(TranslationService.t('edit-error-no-permissions')));
        }
        sails.log.verbose(req.headers);
        let uploadFileSize = req.headers['Upload-Length'];
        let diskSpaceThreshold = sails.config.record.diskSpaceThreshold;
        if(!_.isUndefined(uploadFileSize) && !_.isUndefined(diskSpaceThreshold)) {
          let diskSpace = await checkDiskSpace(sails.config.record.mongodbDisk);
          //set diskSpaceThreshold to a reasonable amount of space on disk that will be left free as a safety buffer 
          let thresholdAppliedFileSize = _.toInteger(uploadFileSize) + diskSpaceThreshold;
          sails.log.verbose('Total File Size '+thresholdAppliedFileSize+' Total Free Space '+diskSpace.free);
          if(diskSpace.free <= thresholdAppliedFileSize){
            let errorMessage = TranslationService.t('not-enough-disk-space');
            sails.log.error(errorMessage + ' Total File Size '+thresholdAppliedFileSize+' Total Free Space '+diskSpace.free);
            return Observable.throwError(new Error(errorMessage));
          }
        }
        // process the upload...
        this.tusServer.handle(req, res);
        return Observable.of(oid);
      }
    }

    public getWorkflowSteps(req, res) {
      const recordType = req.param('recordType');
      const brand = BrandingService.getBrand(req.session.branding);
      return RecordTypesService.get(brand, recordType).subscribe(recordType => {
        return WorkflowStepsService.getAllForRecordType(recordType).subscribe(wfSteps => {
          return this.ajaxOk(req, res, null, wfSteps);
        });
      });
    }

    public getRelatedRecords(req, res) {
      return this.getRelatedRecordsInternal(req, res).then(response => {
        return this.ajaxOk(req, res, null, response);
      });
    }
    
    public async getRelatedRecordsInternal(req, res) {
      sails.log.verbose(`getRelatedRecordsInternal - starting...`);
      const brand = BrandingService.getBrand(req.session.branding);
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
      let record = await this.getRecord(oid).toPromise();

      let response = {};
      let authorization = record['authorization'];

      let editUsers = authorization['edit']
      let editUserResponse = [];
      for (let i = 0; i < editUsers.length; i++) {
        let editUsername = editUsers[i];
        let user = await UsersService.getUserWithUsername(editUsername).toPromise();
        editUserResponse.push({
          username: editUsername,
          name: user.name,
          email: user.email
        });
      }

      let viewUsers = authorization['view']
      let viewUserResponse = [];
      for (let i = 0; i < viewUsers.length; i++) {
        let viewUsername = viewUsers[i];
        let user = await UsersService.getUserWithUsername(viewUsername).toPromise();
        viewUserResponse.push({
          username: viewUsername,
          name: user.name,
          email: user.email
        });
      }

      let editPendingUsers = authorization['editPending'];
      let viewPendingUsers = authorization['viewPending'];

      let editRoles = authorization['editRoles'];
      let viewRoles = authorization['viewRoles'];

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
        return this.ajaxOk(req, res, null, response);
      });
    }


    public getAttachments(req, res) {
      sails.log.verbose('getting attachments....');
      const oid = req.param('oid');
      Observable.fromPromise(this.recordsService.getAttachments(oid)).subscribe((attachments: any[]) => {
        return this.ajaxOk(req, res, null, attachments);
      });
    }

    public async getDataStream(req, res) {
      const brand = BrandingService.getBrand(req.session.branding);
      const oid = req.param('oid');
      const datastreamId = req.param('datastreamId');
      const currentRec = await this.getRecord(oid).toPromise();

      const hasViewAccess = await this.hasViewAccess(brand, req.user, currentRec).toPromise();
      if (!hasViewAccess) {
        return Observable.throwError(new Error(TranslationService.t('edit-error-no-permissions')));
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
          return Observable.of(oid);
        } catch (error) {
          if (this.isAjax(req)) {
            this.ajaxFail(req, res, error.message);
          } else {
            if (error.message == TranslationService.t('edit-error-no-permissions')) {
              res.forbidden();
            } else if (error.message == TranslationService.t('attachment-not-found')) {
              res.notFound();
            }
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

    public render(req, res) {
      const recordType = req.param('recordType') ? req.param('recordType') : '';
      const packageType = req.param('packageType') ? req.param('packageType') : '';
      const titleLabel = req.param('titleLabel') ? TranslationService.t(req.param('titleLabel')) : `${TranslationService.t('edit-dashboard')} ${TranslationService.t(recordType+'-title-label')}`;
      return this.sendView(req, res, 'dashboard', {recordType: recordType, packageType: packageType, titleLabel: titleLabel });
    }


    public async getRecordList(req, res) {

      const brand = BrandingService.getBrand(req.session.branding);

      const editAccessOnly = req.query.editOnly;

      var roles = [];
      var username = "guest";
      let user = {};
      if (req.isAuthenticated()) {
        roles = req.user.roles;
        user = req.user;
        username = req.user.username;
      } else {
        // assign default role if needed...
        user = {username: username};
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

       if(!_.isEmpty(filterFieldString)) {
         filterFields = filterFieldString.split(',')
       } else {
         filterString = undefined;
       }

       if(!_.isEmpty(filterModeString)) {
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
        const response = await this.getRecords(workflowState, recordType, start,rows,user,roles,brand,editAccessOnly, packageType,sort,filterFields,filterString,filterMode);
        if (response) {
          this.ajaxOk(req, res, null, response);
        } else {
          this.ajaxFail(req, res, null, response);
        }
      } catch (error) {
        sails.log.error("Error updating meta:");
        sails.log.error(error);
        this.ajaxFail(req, res, error.message);
      }
    }

    private getDocMetadata(doc) {
      var metadata = {};
      for(var key in doc){
        if(key.indexOf('authorization_') != 0 && key.indexOf('metaMetadata_') != 0) {
          metadata[key] = doc[key];
        }
        if(key == 'authorization_editRoles') {
          metadata[key] = doc[key];
        }
      }
      return metadata;
    }

    protected async getRecords(workflowState, recordType, start,rows,user, roles, brand, editAccessOnly=undefined, packageType = undefined, sort=undefined, filterFields=undefined, filterString=undefined, filterMode=undefined) {
      const username = user.username;
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        recordType = recordType.split(',');
      }
      if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
        packageType = packageType.split(',');
      }
      var results = await RecordsService.getRecords(workflowState,recordType, start,rows,username,roles,brand,editAccessOnly, packageType, sort,filterFields,filterString, filterMode);
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
        item["metadata"]= this.getDocMetadata(doc);
        item["dateCreated"] =  doc["dateCreated"];
        item["dateModified"] = doc["lastSaveDate"];
        item["hasEditAccess"] = RecordsService.hasEditAccess(brand, user, roles, doc);
        items.push(item);
      }

      response["items"] = items;
      return response;
    }
  }
}

module.exports = new Controllers.Record().exports();