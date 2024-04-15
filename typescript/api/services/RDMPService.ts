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
import {
  QueueService,
  Services as services,
  RBValidationError
} from '@researchdatabox/redbox-core-types';
import {
  Sails,
  Model
} from "sails";
import { default as moment } from 'moment';
import numeral from 'numeral';

import {
  isObservable
} from 'rxjs';

declare var sails: Sails;
declare var RecordType, Counter: Model;
declare var _this;
declare var User;
declare var _;
declare var TranslationService, WorkspaceService;

export module Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class RDMPS extends services.Core.Service {

    protected queueService: QueueService = null;

    protected _exportedMethods: any = [
      'assignPermissions',
      'complexAssignPermissions',
      'processRecordCounters',
      'stripUserBasedPermissions',
      'restoreUserBasedPermissions',
      'runTemplates',
      'addWorkspaceToRecord',
      'queuedTriggerSubscriptionHandler',
      'queueTriggerCall',
      'processQueuedFileUploadToFigshare',
      'checkTotalSizeOfFilesInRecord'
    ];

    constructor() {
      super();
      this.logHeader = "TriggerService::";
      let that = this;
      sails.on('ready', function () {
        that.queueService = sails.services[sails.config.queue.serviceName];
      });
    }

    /**
     * This is a trigger service method to bump all configured increment counters.
     *
     *
     * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
     * @param  oid
     * @param  record
     * @param  options
     *  expects:
     *  {
     *    "counters": [
     *       {
     *        "field_name": "<name of the field to increment in the record>"
     *        "strategy": "<strategy of the increment>",
     *                      possible values:
     *                      - "field": increase the previous value by one
     *                      - "global": increase the previous value of the global counter document identified by the record's brandingId and field_name
     *         "prefix": "<the language key entry to prefix the value>"
     *       }
     *    ]
     *  }
     * @param  user
     * @return
     */
    public async processRecordCounters(oid, record, options, user) {

      const brandId = record.metaMetadata.brandId;
      let processRecordCountersLogLevel = 'verbose';
      if(sails.config.record.processRecordCountersLogLevel != null) {
        processRecordCountersLogLevel = sails.config.record.processRecordCountersLogLevel;
        sails.log.info(`processRecordCounters - log level ${sails.config.record.processRecordCountersLogLevel}`);
      } else {
        sails.log.info(`processRecordCounters - log level ${processRecordCountersLogLevel}`);
      }
      
      //For all projects that don't set environment variable "sails_record__processRecordCountersLogLevel" in docker-compose.yml  
      //the log level of this function is going to be verbose which is the standard but in example for CQU it will be set to 
      //error to make it so this function always prints logging until the RDMPs missing IDs issue is fixed  
      sails.log[processRecordCountersLogLevel](`processRecordCounters - brandId: ${record.metaMetadata.brandId}`);
      sails.log[processRecordCountersLogLevel]('processRecordCounters - options:');
      sails.log[processRecordCountersLogLevel](options);
      // get the counters
      for(let counter of options.counters) {
        sails.log[processRecordCountersLogLevel](`processRecordCounters - counter.strategy: ${counter.strategy}`);

        if (counter.strategy == "global") {

          sails.log[processRecordCountersLogLevel]('processRecordCounters - before - counter:');
          sails.log[processRecordCountersLogLevel](counter);

          const promiseCounter = await this.getObservable(Counter.findOrCreate({
            name: counter.field_name,
            branding: brandId
          }, {
            name: counter.field_name,
            branding: brandId,
            value: 0
          })).toPromise();

          if (_.isEmpty(promiseCounter)) {
            sails.log[processRecordCountersLogLevel]('processRecordCounters - promiseCounter isEmpty');
            sails.log[processRecordCountersLogLevel](promiseCounter);

          } else {
            sails.log[processRecordCountersLogLevel]('processRecordCounters - promiseCounter:');
            sails.log[processRecordCountersLogLevel](promiseCounter);
            sails.log[processRecordCountersLogLevel]('processRecordCounters - after - counter:');
            sails.log[processRecordCountersLogLevel](counter);
            let newVal = promiseCounter[0].value + 1;
            sails.log[processRecordCountersLogLevel]('processRecordCounters - newVal:');
            sails.log[processRecordCountersLogLevel](newVal);

            //increment counter to get new value for the record's field associated to the counter
            this.incrementCounter(record, counter, newVal);

            //Update global counter
            const updateOnePromise = await this.getObservable(Counter.updateOne({
              id: promiseCounter[0].id
            }, {
              value: newVal
            })).toPromise();
            sails.log[processRecordCountersLogLevel]('processRecordCounters - updateOnePromise:');
            sails.log[processRecordCountersLogLevel](updateOnePromise);
          }

        } else if (counter.strategy == "field") {
          sails.log[processRecordCountersLogLevel]('processRecordCounters - field - enter');
          let srcVal = record.metadata[counter.field_name];
          if (!_.isEmpty(counter.source_field)) {
            srcVal = record.metadata[counter.source_field];
          }
          let newVal = _.isUndefined(srcVal) || _.isEmpty(srcVal) ? 1 : _.toNumber(srcVal) + 1;
          sails.log[processRecordCountersLogLevel](`processRecordCounters - field - newVal: ${newVal}`);
          this.incrementCounter(record, counter, newVal);
        }
      }
      
      sails.log[processRecordCountersLogLevel]('processRecordCounters - end');
      return record;
    }

    private incrementCounter(record: any, counter: any, newVal: any) {

      let processRecordCountersLogLevel = 'verbose';
      if(sails.config.record.processRecordCountersLogLevel != null) {
        processRecordCountersLogLevel = sails.config.record.processRecordCountersLogLevel;
        sails.log.info(`incrementCounter - log level ${sails.config.record.processRecordCountersLogLevel}`);
      } else {
        sails.log.info(`incrementCounter - log level ${processRecordCountersLogLevel}`);
      }
      
      //For all projects that don't set environment variable "sails_record__processRecordCountersLogLevel" in docker-compose.yml  
      //the log level of this function is going to be verbose which is the standard but in example for CQU it will be set to 
      //error to make it so this function always prints logging until the RDMPs missing IDs issue is fixed  
      sails.log[processRecordCountersLogLevel]('incrementCounter - enter');

      if (!_.isEmpty(counter.template)) {
        sails.log[processRecordCountersLogLevel](`incrementCounter - newVal: ${newVal}`);
        sails.log[processRecordCountersLogLevel]('incrementCounter - counter:');
        sails.log[processRecordCountersLogLevel](counter);
        const imports = _.extend({
          moment: moment,
          numeral: numeral,
          newVal: newVal
        }, counter);
        const templateData = {
          imports: imports
        };
        const template = _.template(counter.template, templateData);
        newVal = template();
      }
      const recVal = `${TranslationService.t(counter.prefix)}${newVal}`;
      sails.log[processRecordCountersLogLevel](`incrementCounter - recVal: ${recVal}`);
      _.set(record.metadata, counter.field_name, recVal);
      if (!_.isEmpty(counter.add_value_to_array)) {
        const arrayVal = _.get(record, counter.add_value_to_array, []);
        arrayVal.push(recVal);
        _.set(record, counter.add_value_to_array, arrayVal);
        sails.log[processRecordCountersLogLevel]('incrementCounter - arrayVal:'); 
        sails.log[processRecordCountersLogLevel](arrayVal);
      }
      sails.log[processRecordCountersLogLevel]('incrementCounter - end');
    }

    public checkTotalSizeOfFilesInRecord(oid, record, options, user) {
      let functionLogLevel = 'verbose';
      if(sails.config.record.checkTotalSizeOfFilesInRecordLogLevel != null) {
        functionLogLevel = sails.config.record.checkTotalSizeOfFilesInRecordLogLevel;
        sails.log.info(`checkTotalSizeOfFilesInRecord - log level ${sails.config.record.checkTotalSizeOfFilesInRecordLogLevel}`);
      } else {
        sails.log.info(`checkTotalSizeOfFilesInRecord - log level ${functionLogLevel}`);
      }
      let dataLocations = record['metadata']['dataLocations'];
      sails.log[functionLogLevel]('checkTotalSizeOfFilesInRecord - dataLocations');
      sails.log[functionLogLevel](dataLocations);
      if(!_.isUndefined(dataLocations)) {
        let foundAttachment = false;

        for(let attachmentFile of dataLocations) {
          if(!_.isUndefined(attachmentFile) && !_.isEmpty(attachmentFile) && attachmentFile.type == 'attachment' && _.toInteger(attachmentFile.size) > 0) {
            foundAttachment = true;
            break;
          }
        }
  
        sails.log[functionLogLevel]('checkTotalSizeOfFilesInRecord - foundAttachment '+foundAttachment);
        if(foundAttachment) {
          let totalSizeOfFilesInRecord = 0;
          for(let attachmentFile of dataLocations) {
            sails.log[functionLogLevel](attachmentFile);
            if(!_.isUndefined(attachmentFile.size)) {
              totalSizeOfFilesInRecord = totalSizeOfFilesInRecord + _.toInteger(attachmentFile.size);
            }
          }
          
          sails.log[functionLogLevel]('checkTotalSizeOfFilesInRecord - totalSizeOfFilesInRecord '+totalSizeOfFilesInRecord);
          if(totalSizeOfFilesInRecord > sails.config.record.maxUploadSize) {
            
            let maxUploadSizeMessage = TranslationService.t('max-total-files-upload-size-validation-error');
            let alternativeMessageCode = options['maxUploadSizeMessageCode'];
            
            if(!_.isUndefined(alternativeMessageCode)) {
              let replaceOrAppend = options['replaceOrAppend'];
              if(_.isUndefined(replaceOrAppend)) {
                replaceOrAppend = 'append';
              }
              if(replaceOrAppend == 'replace'){
                maxUploadSizeMessage = TranslationService.t(alternativeMessageCode);
              } else if (replaceOrAppend == 'append') {
                let tmpMaxUploadSizeMessage = maxUploadSizeMessage + ' ' + TranslationService.t(alternativeMessageCode);
                maxUploadSizeMessage = tmpMaxUploadSizeMessage;
              }
            }
            let maxSizeFormatted = this.formatBytes(sails.config.record.maxUploadSize);
            let interMessage = TranslationService.tInter(maxUploadSizeMessage,{maxUploadSize: maxSizeFormatted});
            maxUploadSizeMessage = interMessage;
            let customError: RBValidationError = new RBValidationError(maxUploadSizeMessage);
            throw customError;
          }
        }
      }

      sails.log[functionLogLevel]('checkTotalSizeOfFilesInRecord - end');
      return record;
    }

    //Fixed version, unminified and ES6'ed 
    //taken from SO
    //https://stackoverflow.com/questions/15900485/correct-way-to-convert-size-in-bytes-to-kb-mb-gb-in-javascript
    private formatBytes(bytes, decimals = 2) {
      if (bytes === 0) return '0 Bytes';
  
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
      const i = Math.floor(Math.log(bytes) / Math.log(k));
  
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    protected addEmailToList(contributor, emailProperty, emailList, lowerCaseEmailAddresses:boolean = true) {
      let contributorEmailAddress = _.get(contributor, emailProperty, null);
      if (!contributorEmailAddress) {
        if (!contributor) {
          return;
        }
        contributorEmailAddress = contributor;
      }
      if (!_.isEmpty(contributorEmailAddress) && !_.isUndefined(contributorEmailAddress)) {
        if (_.isArray(contributorEmailAddress) && contributorEmailAddress.length > 0) {
          contributorEmailAddress = contributorEmailAddress[0];
        }
        if (_.isString(contributorEmailAddress)) {
          sails.log.verbose(`Pushing contrib email address ${contributorEmailAddress}`);
          if(lowerCaseEmailAddresses) {
            contributorEmailAddress = contributorEmailAddress.toLowerCase()
          }
          emailList.push(contributorEmailAddress);
        }
      }
    }

    protected populateContribList(contribProperties, record, emailProperty, emailList) {
      _.each(contribProperties, contributorProperty => {
        let contributor = _.get(record, contributorProperty, null);

        if (contributor) {
          sails.log.verbose(`Contributor:`);
          sails.log.verbose(JSON.stringify(contributor));
          if (_.isArray(contributor)) {
            _.each(contributor, contributor => {
              this.addEmailToList(contributor, emailProperty, emailList);
            });
          } else {
            this.addEmailToList(contributor, emailProperty, emailList);
          }
        }
      });
      return _.uniq(emailList);
    }

    protected getContribListByRule(contribProperties, record, rule, emailProperty, emailList) {
      let compiledRule = _.template(rule);
      _.each(contribProperties, contributorProperty => {
        sails.log.verbose(`Processing contributor property ${contributorProperty}`)
        let contributor = _.get(record, contributorProperty, null);
        if (contributor) {
          sails.log.verbose(`Contributor:`);
          sails.log.verbose(JSON.stringify(contributor));
          if (_.isArray(contributor)) {
            _.each(contributor, individualContributor => {
              if (compiledRule(individualContributor) == true || compiledRule(individualContributor) == "true") {
                this.addEmailToList(individualContributor, emailProperty, emailList);
              }
            });
          } else {
            if (compiledRule(contributor) == true || compiledRule(contributor) == "true") {
              this.addEmailToList(contributor, emailProperty, emailList);
            }
          }
        }
      });
      return _.uniq(emailList);
    }

    protected filterPending(users, userEmails, userList) {
      _.each(users, user => {
        if (user != null) {
          _.remove(userEmails, email => {
            return email == user['email'];
          });
          userList.push(user['username']);
        }
      });
    }

    public queueTriggerCall(oid, record, options, user) {
      let jobName = _.get(options, "jobName", null);
      let triggerConfiguration = _.get(options, "triggerConfiguration", null);
      let queueMessage = {
        oid: oid,
        record: record,
        triggerConfiguration: triggerConfiguration,
        user: user
      };
      sails.log.debug(`${this.logHeader} Queueing up trigger using job name ${jobName}`);
      sails.log.verbose(queueMessage);
      this.queueService.now(jobName, queueMessage);
      return Observable.of(record);
    }

    public queuedTriggerSubscriptionHandler(job: any) {
      let data = job.attrs.data;
      let oid = _.get(data, "oid", null);
      let triggerConfiguration = _.get(data, "triggerConfiguration", null);
      let record = _.get(data, "record", null);
      let user = _.get(data, "user", null);
      sails.log.verbose('queuedTriggerSubscriptionHandler Consuming job:');
      sails.log.verbose(data);
      let hookFunctionString = _.get(triggerConfiguration, "function", null);
      sails.log.verbose(`Found hook function string ${hookFunctionString}`);
      if (hookFunctionString != null) {
        let hookFunction = eval(hookFunctionString);
        let options = _.get(triggerConfiguration, "options", {});
        if (_.isFunction(hookFunction)) {
          sails.log.debug(`Triggering queuedtrigger: ${hookFunctionString}`)
          let hookResponse = hookFunction(oid, record, options, user);
          let response = this.convertToObservable(hookResponse);
          return response.toPromise();

        } else {
          sails.log.error(`queued trigger function: '${hookFunctionString}' did not resolve to a valid function, what I got:`);
          sails.log.error(hookFunction);
        }
      }
    }

    public processQueuedFileUploadToFigshare(job: any) {
      let data = job.attrs.data;
      let oid = _.get(data, "oid", null);
      let attachId = _.get(data, "attachId", null);
      let articleId = _.get(data, "articleId", null);
      let dataPublicationRecord = _.get(data, "dataPublicationRecord", null);
      let fileName = _.get(data, "fileName", null);
      let fileSize = _.get(data, "fileSize", null);
      let figshareUploadHookFunctionString = _.get(data, "function", null);
      sails.log.verbose(`Found hook function string ${figshareUploadHookFunctionString}`);
      if (figshareUploadHookFunctionString != null) {
        let figshareUploadHookFunction = eval(figshareUploadHookFunctionString);
        if (_.isFunction(figshareUploadHookFunction)) {
          sails.log.debug(`Triggering queuedtrigger: ${figshareUploadHookFunctionString}`)
          let hookResponse = figshareUploadHookFunction(oid, attachId, articleId, dataPublicationRecord, fileName, fileSize);
          let response = this.convertToObservable(hookResponse);
          return response.toPromise();

        } else {
          sails.log.error(`queued trigger function: '${figshareUploadHookFunctionString}' did not resolve to a valid function, what I got:`);
          sails.log.error(figshareUploadHookFunction);
        }
      }
    }

    private convertToObservable(hookResponse) {
      let response = hookResponse;
      if (isObservable(hookResponse)) {
        return hookResponse;
      } else {
        response = Observable.fromPromise(hookResponse);
      }
      return response;
    }

    public complexAssignPermissions(oid, record, options) {
      sails.log.verbose(`Complex Assign Permissions executing on oid: ${oid}, using options:`);
      sails.log.verbose(JSON.stringify(options));
      sails.log.verbose(`With record: `);
      sails.log.verbose(JSON.stringify(record));

      const emailProperty = _.get(options, "emailProperty", "email");
      const userProperties = _.get(options, "userProperties", []);
      const viewPermissionRule = _.get(options, "viewPermissionRule");
      const editPermissionRule = _.get(options, "editPermissionRule");
      const recordCreatorPermissions = _.get(options, "recordCreatorPermissions");

      let editContributorObs = [];
      let viewContributorObs = [];
      let editContributorEmails = [];
      let viewContributorEmails = [];

      // get the new editor list...
      editContributorEmails = this.getContribListByRule(userProperties, record, editPermissionRule, emailProperty, editContributorEmails);
      // get the new viewer list...
      viewContributorEmails = this.getContribListByRule(userProperties, record, viewPermissionRule, emailProperty, viewContributorEmails);


      if (_.isEmpty(editContributorEmails)) {
        sails.log.error(`No editors for record: ${oid}`);
      }
      if (_.isEmpty(viewContributorEmails)) {
        sails.log.error(`No viewers for record: ${oid}`);
      }
      // when both are empty, simpy return the record
      if (_.isEmpty(editContributorEmails) && _.isEmpty(viewContributorEmails)) {
        return Observable.of(record);
      }
      _.each(editContributorEmails, editorEmail => {
        editContributorObs.push(this.getObservable(User.findOne({
          email: editorEmail.toLowerCase()
        })));
      });
      _.each(viewContributorEmails, viewerEmail => {
        viewContributorObs.push(this.getObservable(User.findOne({
          email: viewerEmail.toLowerCase()
        })));
      });
      let zippedViewContributorUsers = null;
      if (editContributorObs.length == 0) {
        zippedViewContributorUsers = Observable.zip(...viewContributorObs);
      } else {
        zippedViewContributorUsers = Observable.zip(...editContributorObs)
          .flatMap(editContributorUsers => {
            let newEditList = [];
            this.filterPending(editContributorUsers, editContributorEmails, newEditList);
            if (recordCreatorPermissions == "edit" || recordCreatorPermissions == "view&edit") {
              newEditList.push(record.metaMetadata.createdBy);
            }
            record.authorization.edit = newEditList;
            record.authorization.editPending = editContributorEmails;
            return Observable.zip(...viewContributorObs);
          })
      }
      if (zippedViewContributorUsers.length == 0) {
        return Observable.of(record);
      } else {
        return zippedViewContributorUsers.flatMap(viewContributorUsers => {
          let newviewList = [];
          this.filterPending(viewContributorUsers, viewContributorEmails, newviewList);
          if (recordCreatorPermissions == "view" || recordCreatorPermissions == "view&edit") {
            newviewList.push(record.metaMetadata.createdBy);
          }
          record.authorization.view = newviewList;
          record.authorization.viewPending = viewContributorEmails;
          return Observable.of(record);
        });
      }
    }

    public assignPermissions(oid, record, options) {
      sails.log.verbose(`Assign Permissions executing on oid: ${oid}, using options:`);
      sails.log.verbose(JSON.stringify(options));
      sails.log.verbose(`With record: `);
      sails.log.verbose(JSON.stringify(record));

      const emailProperty = _.get(options, "emailProperty", "email");
      const editContributorProperties = _.get(options, "editContributorProperties", []);
      const viewContributorProperties = _.get(options, "viewContributorProperties", []);
      const recordCreatorPermissions = _.get(options, "recordCreatorPermissions");
      let editContributorObs = [];
      let viewContributorObs = [];
      let editContributorEmails = [];
      let viewContributorEmails = [];

      // get the new editor list...
      editContributorEmails = this.populateContribList(editContributorProperties, record, emailProperty, editContributorEmails);
      // get the new viewer list...
      viewContributorEmails = this.populateContribList(viewContributorProperties, record, emailProperty, viewContributorEmails);


      if (_.isEmpty(editContributorEmails)) {
        sails.log.error(`No editors for record: ${oid}`);
      }
      if (_.isEmpty(viewContributorEmails)) {
        sails.log.error(`No viewers for record: ${oid}`);
      }
      // when both are empty, simpy return the record
      if (_.isEmpty(editContributorEmails) && _.isEmpty(viewContributorEmails)) {
        return Observable.of(record);
      }
      _.each(editContributorEmails, editorEmail => {
        editContributorObs.push(this.getObservable(User.findOne({
          email: editorEmail.toLowerCase()
        })));
      });
      _.each(viewContributorEmails, viewerEmail => {
        viewContributorObs.push(this.getObservable(User.findOne({
          email: viewerEmail.toLowerCase()
        })));
      });
      let zippedViewContributorUsers = null;
      if (editContributorObs.length == 0) {
        zippedViewContributorUsers = Observable.zip(...viewContributorObs);
      } else {
        zippedViewContributorUsers = Observable.zip(...editContributorObs)
          .flatMap(editContributorUsers => {
            let newEditList = [];
            this.filterPending(editContributorUsers, editContributorEmails, newEditList);
            if (recordCreatorPermissions == "edit" || recordCreatorPermissions == "view&edit") {
              newEditList.push(record.metaMetadata.createdBy);
            }
            record.authorization.edit = newEditList;
            record.authorization.editPending = editContributorEmails;
            return Observable.zip(...viewContributorObs);
          })
      }
      if (zippedViewContributorUsers.length == 0) {
        return Observable.of(record);
      } else {
        return zippedViewContributorUsers.flatMap(viewContributorUsers => {
          let newviewList = [];
          this.filterPending(viewContributorUsers, viewContributorEmails, newviewList);
          if (recordCreatorPermissions == "view" || recordCreatorPermissions == "view&edit") {
            newviewList.push(record.metaMetadata.createdBy);
          }
          record.authorization.view = newviewList;
          record.authorization.viewPending = viewContributorEmails;
          return Observable.of(record);
        });
      }
    }

    public stripUserBasedPermissions(oid, record, options, user) {
      if (this.metTriggerCondition(oid, record, options) === "true") {
        let mode = options.permissionTypes;
        if (mode == null) {
          mode = "edit"
        }
        if (record.authorization.stored == undefined) {
          record.authorization.stored = {}
        }
        if (mode == "edit" || mode == "view&edit") {

          record.authorization.stored.edit = record.authorization.edit.slice()

          if (record.authorization.editPending != undefined) {
            record.authorization.stored.editPending = record.authorization.editPending.slice()
          }

          record.authorization.edit = [];
          if (record.authorization.editPending != undefined) {
            record.authorization.editPending = [];
          }
        }

        if (mode == "view" || mode == "view&edit") {

          if (record.authorization.view != undefined) {
            record.authorization.stored.view = record.authorization.view.slice()
          }

          if (record.authorization.viewPending != undefined) {
            record.authorization.stored.viewPending = record.authorization.viewPending.slice()
          }

          record.authorization.view = [];
          if (record.authorization.viewPending != undefined) {
            record.authorization.viewPending = [];
          }
        }
      }
      return Observable.of(record);
    }

    public restoreUserBasedPermissions(oid, record, options, user) {
      if (this.metTriggerCondition(oid, record, options) === "true") {
        if (record.authorization.stored != undefined) {
          record.authorization.edit = _.map(record.authorization.stored.edit, _.clone);
          record.authorization.view = _.map(record.authorization.stored.view, _.clone);
          if (record.authorization.stored.editPending != undefined) {
            record.authorization.editPending = _.map(record.authorization.stored.editPending, _.clone);
          }
          if (record.authorization.stored.viewPending != undefined) {
            record.authorization.viewPending = _.map(record.authorization.stored.viewPending, _.clone);
          }
          delete record.authorization.stored
        }
      }
      return Observable.of(record);
    }

    public runTemplates(oid, record, options, user) {
      sails.log.verbose(`runTemplates config:`);
      sails.log.verbose(JSON.stringify(options.templates));
      sails.log.verbose(`runTemplates oid: ${oid} with user: ${JSON.stringify(user)}`);
      sails.log.verbose(JSON.stringify(record));

      let parseObject = _.get(options, 'parseObject', false);
      let tmplConfig = null;
      try {
        _.each(options.templates, (templateConfig) => {
          tmplConfig = templateConfig;
          const imports = _.extend({
            oid: oid,
            record: record,
            user: user,
            options: options,
            moment: moment,
            numeral: numeral
          }, this);
          const templateData = {
            imports: imports
          };
          const data = _.template(templateConfig.template, templateData)();
          if(parseObject) {
            let obj = JSON.parse(data);
            _.set(record, templateConfig.field, obj);
          } else {
            _.set(record, templateConfig.field, data);
          }
        });
      } catch (e) {
        const errLog = `Failed to run one of the string templates: ${JSON.stringify(tmplConfig)}`
        sails.log.error(errLog);
        sails.log.error(e);
        return Observable.throw(new Error(errLog));
      }
      return Observable.of(record);
    }

    public async addWorkspaceToRecord(oid, workspaceData, options, user, response) {
      const rdmpOid = workspaceData.metadata.rdmpOid;
      sails.log.verbose(`Generic adding workspace ${oid} to record: ${rdmpOid}`);
      response = await WorkspaceService.addWorkspaceToRecord(workspaceData.metadata.rdmpOid, oid);
      _.set(response, 'workspaceOid', oid);
      _.set(response, 'workspaceData', workspaceData);
      return response;
    }
  }
}
module.exports = new Services.RDMPS().exports();