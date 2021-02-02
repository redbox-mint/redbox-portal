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
  Observable
} from 'rxjs/Rx';
import services = require('../core/CoreService.js');
import DatastreamService from '../core/DatastreamService.js';
import {StorageServiceResponse} from '../core/StorageServiceResponse';
import {
  Sails,
  Model
} from "sails";
import * as request from "request-promise";
import * as luceneEscapeQuery from "lucene-escape-query";
import * as fs from 'fs';
import moment = require('moment');
import RecordsService from '../core/RecordsService.js';
import SearchService from '../core/SearchService.js';
import {
  isObservable
} from 'rxjs';
import StorageService from '../core/StorageService.js';
import {Readable}  from 'stream';

const util = require('util');

declare var FormsService, RolesService, UsersService, WorkflowStepsService, RecordTypesService, RedboxJavaStorageService;
declare var sails: Sails;
declare var _;
declare var _this;

export module Services {
  /**
   * Records related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Records extends services.Services.Core.Service implements RecordsService {

    storageService: StorageService = null;
    datastreamService: DatastreamService = null;
    searchService:SearchService = null;

    constructor() {
      super();
      this.logHeader = "RecordsService::";
      let that = this;
      sails.on('ready', function () {
        that.getStorageService();
        that.getDatastreamService();
        that.searchService = sails.services[sails.config.search.serviceName];
      });
    }

    getStorageService() {
      if (_.isEmpty(sails.config.storage) || _.isEmpty(sails.config.storage.serviceName)) {
        this.storageService = RedboxJavaStorageService;
      } else {
        this.storageService = sails.services[sails.config.storage.serviceName];
      }
    }

    getDatastreamService() {
      if (_.isEmpty(sails.config.record) || _.isEmpty(sails.config.record.datastreamService)) {
        this.datastreamService = RedboxJavaStorageService;
      } else {
        this.datastreamService = sails.services[sails.config.storage.serviceName];
      }
    }

    protected _exportedMethods: any = [
      'create',
      'updateMeta',
      'getMeta',
      'hasEditAccess',
      'hasViewAccess',
      'search',
      'createBatch',
      'provideUserAccessAndRemovePendingAccess',
      'searchFuzzy',
      'deleteFilesFromStageDir',
      'getRelatedRecords',
      'delete',
      'updateNotificationLog',
      'updateWorkflowStep',
      'triggerPreSaveTriggers',
      'triggerPostSaveTriggers',
      'triggerPostSaveSyncTriggers',
      'checkRedboxRunning',
      'getAttachments',
      'appendToRecord',
      'getRecords',
      'exportAllPlans'
    ];



    async create(brand: any, record: any, recordType: any, user ? : any, triggerPreSaveTriggers = true, triggerPostSaveTriggers = true) {
      let createResponse = new StorageServiceResponse();
      const failedMessage = "Failed to created record, please check server logs.";
      // trigger the pre-save
      if (triggerPreSaveTriggers) {
        try {
          record = await this.triggerPreSaveTriggers(null, record, recordType, "onCreate", user);
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to run pre-save hooks when updating..`);
          sails.log.error(JSON.stringify(err));
          createResponse.message = failedMessage;
          return createResponse;
        }
      }
      // save the record ...
      createResponse = await this.storageService.create(brand, record, recordType, user);
      if (createResponse.isSuccessful()) {
        if (triggerPostSaveTriggers) {
          // post-save sync
          try {
            createResponse = await this.triggerPostSaveSyncTriggers(createResponse['oid'], record, recordType, 'onCreate', user, createResponse);
          } catch (err) {
            sails.log.error(`${this.logHeader} Exception while running post save sync hooks when creating: ${createResponse['oid']}`);
            sails.log.error(JSON.stringify(err));
            createResponse.success = false;
            createResponse.message = failedMessage;
            return createResponse;
          }
          // Fire Post-save hooks async ...
          this.triggerPostSaveTriggers(createResponse['oid'], record, recordType, 'onCreate', user);
        }
        this.searchService.index(createResponse['oid'], record);
        // TODO: fire-off audit message
      } else {
        sails.log.error(`${this.logHeader} Failed to create record, storage service response:`);
        sails.log.error(JSON.stringify(createResponse));
        createResponse.message = failedMessage;
      }
      return createResponse;
    }

    async updateMeta(brand: any, oid: any, record: any, user ? : any, triggerPreSaveTriggers = true, triggerPostSaveTriggers = true) {
      let updateResponse = new StorageServiceResponse();
      updateResponse.oid = oid;
      let recordType = null;
      const failedMessage = "Failed to update record, please check server logs.";
      // process pre-save
      if (!_.isEmpty(brand) && triggerPreSaveTriggers === true) {
        try {
          recordType = await RecordTypesService.get(brand, record.metaMetadata.type).toPromise();
          record = await this.triggerPreSaveTriggers(oid, record, recordType, "onUpdate", user);
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to run pre-save hooks when updating..`);
          sails.log.error(JSON.stringify(err));
          updateResponse.message = failedMessage;
          return updateResponse;
        }
      }
      // unsetting the ID just to be safe
      _.unset(record, 'id');
      _.unset(record, 'redboxOid');
      // update
      updateResponse = await this.storageService.updateMeta(brand, oid, record, user);
      if (updateResponse.isSuccessful()) {
        // post-save async
        if (!_.isEmpty(recordType) && triggerPostSaveTriggers === true) {
          // Trigger Post-save sync hooks ...
          try {
            updateResponse = await this.triggerPostSaveSyncTriggers(updateResponse['oid'], record, recordType, 'onCreate', user, updateResponse);
          } catch (err) {
            sails.log.error(`${this.logHeader} Exception while running post save sync hooks when updating:`);
            sails.log.error(JSON.stringify(err));
            updateResponse.success = false;
            updateResponse.message = failedMessage;
            return updateResponse;
          }
          // Fire Post-save hooks async ...
          this.triggerPostSaveTriggers(updateResponse['oid'], record, recordType, 'onCreate', user);
        }
        this.searchService.index(oid, record);
        // TODO: fire-off audit message
      } else {
        sails.log.error(`${this.logHeader} Failed to update record, storage service response:`);
        sails.log.error(JSON.stringify(updateResponse));
        updateResponse.message = failedMessage;
      }
      return updateResponse;
    }

    getMeta(oid: any): Promise < any > {
      return this.storageService.getMeta(oid);
    }
    createBatch(type: any, data: any, harvestIdFldName: any): Promise < any > {
      return this.storageService.createBatch(type, data, harvestIdFldName);
    }
    provideUserAccessAndRemovePendingAccess(oid: any, userid: any, pendingValue: any): void {
      this.storageService.provideUserAccessAndRemovePendingAccess(oid, userid, pendingValue);
    }
    getRelatedRecords(oid: any, brand: any): Promise < any > {
      return this.storageService.getRelatedRecords(oid, brand);
    }
    async delete(oid: any) {
      const response = await this.storageService.delete(oid);
      if (response.isSuccessful()) {
        this.searchService.remove(oid);
      }
      return response;
    }
    updateNotificationLog(oid: any, record: any, options: any): Promise < any > {
      return this.storageService.updateNotificationLog(oid, record, options);
    }

    public getRecords(workflowState, recordType = undefined, start, rows = 10, username, roles, brand, editAccessOnly = undefined, packageType = undefined, sort=undefined) : Promise<any> {
      return this.storageService.getRecords(workflowState, recordType, start, rows, username, roles, brand, editAccessOnly, packageType, sort);
    }

    public exportAllPlans(username, roles, brand, format, modBefore, modAfter, recType) : Readable {
      return this.storageService.exportAllPlans(username, roles, brand, format, modBefore, modAfter, recType);
    }

    // Gets attachments for this record, will use the `sails.config.record.datastreamService` if set, otherwise will use this service
    //
    // Params:
    // oid - record idea
    // labelFilterStr - set if you want to be selective in your attachments, will just run a simple `.indexOf`
    public async getAttachments(oid: string, labelFilterStr: string = undefined): Promise < any > {
      let datastreams = await this.datastreamService.listDatastreams(oid, null);
      let attachments = [];
      _.each(datastreams, (datastream) => {
        let attachment = {};
        attachment['dateUpdated'] = moment(datastream['uploadDate']).format();
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
    public async checkRedboxRunning(): Promise < any > {
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

    private info(): Promise < any > {

      const options = this.getOptions(sails.config.record.baseUrl.redbox + sails.config.record.api.info.url);
      return request[sails.config.record.api.info.method](options)
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
    public async appendToRecord(targetRecordOid: string, linkData: any, fieldName: string, fieldType: string = undefined, targetRecord: any = undefined) {
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
     * Fine-grained access to the record, converted to sync.
     *
     */
    public hasViewAccess(brand, user, roles, record): boolean {
      // merge with the edit user and roles, since editors are viewers too...
      const viewArr = record.authorization ? _.union(record.authorization.view, record.authorization.edit) : _.union(record.authorization_view, record.authorization_edit);
      const viewRolesArr = record.authorization ? _.union(record.authorization.viewRoles, record.authorization.editRoles) : _.union(record.authorization_viewRoles, record.authorization_editRoles);

      const uname = user.username;

      const isInUserView = _.find(viewArr, username => {
        return uname == username;
      });
      if (!_.isUndefined(isInUserView)) {
        return true;
      }
      const isInRoleView = _.find(viewRolesArr, roleName => {
        const role = RolesService.getRole(brand, roleName);
        return role && !_.isUndefined(_.find(roles, r => {
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
    public hasEditAccess(brand, user, roles, record): boolean {
      const editArr = record.authorization ? record.authorization.edit : record.authorization_edit;
      const editRolesArr = record.authorization ? record.authorization.editRoles : record.authorization_editRoles;
      const uname = user.username;

      const isInUserEdit = _.find(editArr, username => {
        sails.log.verbose(`Username: ${uname} == ${username}`);
        return uname == username;
      });
      // sails.log.verbose(`isInUserEdit: ${isInUserEdit}`);
      if (!_.isUndefined(isInUserEdit)) {
        return true;
      }
      const isInRoleEdit = _.find(editRolesArr, roleName => {
        const role = RolesService.getRole(brand, roleName);
        return role && !_.isUndefined(_.find(roles, r => {
          return role.id == r.id;
        }));
      });
      return !_.isUndefined(isInRoleEdit);
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


    public searchFuzzy(type, workflowState, searchQuery, exactSearches, facetSearches, brand, user, roles, returnFields): Promise < any > {

      const username = user.username;
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

      let url = `${sails.config.record.baseUrl.redbox}${sails.config.record.api.search.url}?q=metaMetadata_brandId:${brand.id} AND metaMetadata_type:${type}${searchParam}&version=2.2&wt=json&sort=date_object_modified desc`;
      url = this.addAuthFilter(url, username, roles, brand, false)
      sails.log.error(`Searching fuzzy using: ${url}`);
      const options = this.getOptions(url);
      return Observable.fromPromise(request[sails.config.record.api.search.method](options))
        .flatMap(resp => {
          let response: any = resp;
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
            customDoc["hasEditAccess"] = this.hasEditAccess(brand, user, roles, solrdoc);
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
          return Observable.of(customResp);
        }).toPromise();
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


    protected getSearchTypeUrl(type, searchField = null, searchStr = null) {
      const searchParam = searchField ? ` AND ${searchField}:${searchStr}*` : '';
      return `${sails.config.record.baseUrl.redbox}${sails.config.record.api.search.url}?q=metaMetadata_type:${type}${searchParam}&version=2.2&wt=json&sort=date_object_modified desc`;
    }



    protected luceneEscape(str: string) {
      return luceneEscapeQuery.escape(str);
    }





    /**
     *  Pre-save trigger to clear and re-assign permissions based on security config
     *
     */
    public assignPermissions(oid, record, options, user) {

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

    public updateWorkflowStep(currentRec, nextStep): void {
      if (!_.isEmpty(nextStep)) {
        currentRec.previousWorkflow = currentRec.workflow;
        currentRec.workflow = nextStep.config.workflow;
        // TODO: validate data with form fields
        currentRec.metaMetadata.form = nextStep.config.form;
        // Check for JSON-LD config
        if (sails.config.jsonld.addJsonLdContext) {
          currentRec.metadata['@context'] = sails.config.jsonld.contexts[currentRec.metaMetadata.form];
        }
        // update authorizations based on workflow...
        currentRec.authorization.viewRoles = nextStep.config.authorization.viewRoles;
        currentRec.authorization.editRoles = nextStep.config.authorization.editRoles;
      }
    }

    public async triggerPreSaveTriggers(oid: string, record: any, recordType: object, mode: string = 'onUpdate', user: object = undefined) {
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
            let preSaveUpdateHookFunction = eval(preSaveUpdateHookFunctionString);
            let options = _.get(preSaveUpdateHook, "options", {});


            sails.log.verbose(`Triggering pre save triggers: ${preSaveUpdateHookFunctionString}`);
            let hookResponse = preSaveUpdateHookFunction(oid, record, options, user);
            record = await this.resolveHookResponse(hookResponse);

          }
        }
      }
      return record;
    }

    public async triggerPostSaveSyncTriggers(oid: string, record: any, recordType: any, mode: string = 'onUpdate', user: object = undefined, response: any = {}) {
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
              sails.log.debug(`Triggering post-save sync trigger: ${postSaveSyncHooksFunctionString}`)
              let hookResponse = postSaveSyncHookFunction(oid, record, options, user, response);
              response = await this.resolveHookResponse(hookResponse);
              sails.log.debug(`${postSaveSyncHooksFunctionString} response now is:`);
              sails.log.verbose(JSON.stringify(response));
              sails.log.debug(`post-save trigger ${postSaveSyncHooksFunctionString} completed for ${oid}`)
            } else {
              sails.log.error(`Post save function: '${postSaveSyncHooksFunctionString}' did not resolve to a valid function, what I got:`);
              sails.log.error(postSaveSyncHookFunction);
            }
          }
        }
      }
      return response;
    }



    public triggerPostSaveTriggers(oid: string, record: any, recordType: any, mode: string = 'onUpdate', user: object = undefined): void {
      sails.log.debug("Triggering post save triggers ");
      sails.log.debug(`hooks.${mode}.post`);
      sails.log.debug(recordType);
      let postSaveCreateHooks = _.get(recordType, `hooks.${mode}.post`, null);
      if (_.isArray(postSaveCreateHooks)) {
        _.each(postSaveCreateHooks, postSaveCreateHook => {
          sails.log.debug(postSaveCreateHook);
          let postSaveCreateHookFunctionString = _.get(postSaveCreateHook, "function", null);
          if (postSaveCreateHookFunctionString != null) {
            let postSaveCreateHookFunction = eval(postSaveCreateHookFunctionString);
            let options = _.get(postSaveCreateHook, "options", {});
            if (_.isFunction(postSaveCreateHookFunction)) {
              postSaveCreateHookFunction(oid, record, options, user).subscribe(result => {
                sails.log.debug(`post-save trigger ${postSaveCreateHookFunctionString} completed for ${oid}`)
              });
            } else {
              sails.log.error(`Post save function: '${postSaveCreateHookFunctionString}' did not resolve to a valid function, what I got:`);
              sails.log.error(postSaveCreateHookFunction);
            }
          }
        });
      }
    }

    private resolveHookResponse(hookResponse) {
      let response = hookResponse;
      if (isObservable(hookResponse)) {
        response = hookResponse.toPromise();
      } else {
        response = Promise.resolve(hookResponse);
      }
      return response;
    }



  }
}
module.exports = new Services.Records().exports();