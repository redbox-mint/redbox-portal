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

import { Observable, ObservableInput, of, from, zip, throwError, isObservable, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { Services as services } from '../CoreService';
import { QueueService } from '../QueueService';
import { RBValidationError } from '../model/RBValidationError';
import { StorageServiceResponse } from '../StorageServiceResponse';
import { momentShim as moment } from '../shims/momentShim';
import numeral from 'numeral';

// removed duplicate isObservable import


export namespace Services {
  type AnyRecord = Record<string, unknown>;
  type RecordWithMeta = {
    metaMetadata: AnyRecord;
    metadata?: AnyRecord;
    authorization?: AnyRecord;
    [key: string]: unknown;
  };

  type UserLike = {
    username?: string;
    email?: string;
    roles?: unknown[];
    [key: string]: unknown;
  };
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class RDMPS extends services.Core.Service {

    protected queueService!: QueueService;

    protected override _exportedMethods: string[] = [
      'assignPermissions',
      'complexAssignPermissions',
      'processRecordCounters',
      'stripUserBasedPermissions',
      'restoreUserBasedPermissions',
      'runTemplates',
      'addWorkspaceToRecord',
      'queuedTriggerSubscriptionHandler',
      'queueTriggerCall',
      'checkTotalSizeOfFilesInRecord',
      'removeWorkspaceFromRecord'
    ];

    constructor() {
      super();
      this.logHeader = "TriggerService::";
      const that = this;
      this.registerSailsHook('on', 'ready', function () {
        that.queueService = sails.services[sails.config.queue.serviceName] as unknown as QueueService;
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
    public async processRecordCounters(oid: string, record: RecordWithMeta, options: unknown, _user: unknown) {
      const recordData = record as RecordWithMeta;
      const optionsData = options as { counters?: unknown[] };

      const brandId = recordData.metaMetadata.brandId as string;
      let processRecordCountersLogLevel = 'verbose';
      if (sails.config.record.processRecordCountersLogLevel != null) {
        processRecordCountersLogLevel = sails.config.record.processRecordCountersLogLevel;
        sails.log.info(`processRecordCounters - log level ${sails.config.record.processRecordCountersLogLevel}`);
      } else {
        sails.log.info(`processRecordCounters - log level ${processRecordCountersLogLevel}`);
      }

      //For all projects that don't set environment variable "sails_record__processRecordCountersLogLevel" in docker-compose.yml
      //the log level of this function is going to be verbose which is the standard but in example for CQU it will be set to
      //error to make it so this function always prints logging until the RDMPs missing IDs issue is fixed
      sails.log[processRecordCountersLogLevel](`processRecordCounters - brandId: ${recordData.metaMetadata.brandId}`);
      sails.log[processRecordCountersLogLevel]('processRecordCounters - options:');
      sails.log[processRecordCountersLogLevel](options);
      // get the counters
      for (const counter of optionsData.counters ?? []) {
        const counterData = counter as { field_name?: string; strategy?: string; source_field?: string };
        sails.log[processRecordCountersLogLevel](`processRecordCounters - counter.strategy: ${counterData.strategy}`);

        if (counterData.strategy == "global") {

          sails.log[processRecordCountersLogLevel]('processRecordCounters - before - counter:');
          sails.log[processRecordCountersLogLevel](counter);

          const promiseCounter = await firstValueFrom(this.getObservable<Array<{ id?: string | number; value: number }>>(Counter.findOrCreate({
            name: counterData.field_name,
            branding: brandId
          }, {
            name: counterData.field_name,
            branding: brandId,
            value: 0
          })));

          if (_.isEmpty(promiseCounter)) {
            sails.log[processRecordCountersLogLevel]('processRecordCounters - promiseCounter isEmpty');
            sails.log[processRecordCountersLogLevel](promiseCounter);

          } else {
            sails.log[processRecordCountersLogLevel]('processRecordCounters - promiseCounter:');
            sails.log[processRecordCountersLogLevel](promiseCounter);
            sails.log[processRecordCountersLogLevel]('processRecordCounters - after - counter:');
            sails.log[processRecordCountersLogLevel](counter);
            const newVal = promiseCounter[0].value + 1;
            sails.log[processRecordCountersLogLevel]('processRecordCounters - newVal:');
            sails.log[processRecordCountersLogLevel](newVal);

            //increment counter to get new value for the record's field associated to the counter
            this.incrementCounter(recordData, counterData, newVal);

            //Update global counter
            const updateOnePromise = await firstValueFrom(this.getObservable<Record<string, unknown>>(Counter.updateOne({
              id: promiseCounter[0].id
            }, {
              value: newVal
            })));
            sails.log[processRecordCountersLogLevel]('processRecordCounters - updateOnePromise:');
            sails.log[processRecordCountersLogLevel](updateOnePromise);
          }

        } else if (counterData.strategy == "field") {
          sails.log[processRecordCountersLogLevel]('processRecordCounters - field - enter');
          let srcVal = (recordData.metadata ?? {})[counterData.field_name ?? ''];
          if (!_.isEmpty(counterData.source_field)) {
            srcVal = (recordData.metadata ?? {})[counterData.source_field ?? ''];
          }
          const newVal = _.isUndefined(srcVal) || _.isEmpty(srcVal) ? 1 : _.toNumber(srcVal) + 1;
          sails.log[processRecordCountersLogLevel](`processRecordCounters - field - newVal: ${newVal}`);
          this.incrementCounter(recordData, counterData, newVal);
        }
      }

      sails.log[processRecordCountersLogLevel]('processRecordCounters - end');
      return record;
    }

    private incrementCounter(record: RecordWithMeta, counter: unknown, newVal: unknown) {
      const counterData = counter as { template?: unknown; prefix?: string; field_name?: string; add_value_to_array?: string };
      const metadata = record.metadata ?? {};

      let processRecordCountersLogLevel = 'verbose';
      if (sails.config.record.processRecordCountersLogLevel != null) {
        processRecordCountersLogLevel = sails.config.record.processRecordCountersLogLevel;
        sails.log.info(`incrementCounter - log level ${sails.config.record.processRecordCountersLogLevel}`);
      } else {
        sails.log.info(`incrementCounter - log level ${processRecordCountersLogLevel}`);
      }

      //For all projects that don't set environment variable "sails_record__processRecordCountersLogLevel" in docker-compose.yml
      //the log level of this function is going to be verbose which is the standard but in example for CQU it will be set to
      //error to make it so this function always prints logging until the RDMPs missing IDs issue is fixed
      sails.log[processRecordCountersLogLevel]('incrementCounter - enter');

      if (!_.isEmpty(counterData.template)) {
        sails.log[processRecordCountersLogLevel](`incrementCounter - newVal: ${newVal}`);
        sails.log[processRecordCountersLogLevel]('incrementCounter - counter:');
        sails.log[processRecordCountersLogLevel](counter);
        const templateData = _.extend({ newVal: newVal }, counterData);
        const templateImportData = {
          imports: {
            moment: moment,
            numeral: numeral
          }
        };
        if (_.isString(counterData.template)) {
          const compiledTemplate = _.template(counterData.template, templateImportData);
          counterData.template = compiledTemplate;
        }
        newVal = (counterData.template as (data: unknown) => unknown)(templateData);
      }
      const recVal = `${TranslationService.t(counterData.prefix ?? '')}${newVal}`;
      sails.log[processRecordCountersLogLevel](`incrementCounter - recVal: ${recVal}`);
      const fieldName = counterData.field_name ?? '';
      if (fieldName) {
        _.set(metadata, fieldName, recVal);
      }
      record.metadata = metadata;
      const arrayPath = counterData.add_value_to_array ?? '';
      if (!_.isEmpty(arrayPath)) {
        const arrayVal = _.get(record, arrayPath, []) as unknown[];
        arrayVal.push(recVal);
        _.set(record, arrayPath, arrayVal);
        sails.log[processRecordCountersLogLevel]('incrementCounter - arrayVal:');
        sails.log[processRecordCountersLogLevel](arrayVal);
      }
      sails.log[processRecordCountersLogLevel]('incrementCounter - end');
    }

    public checkTotalSizeOfFilesInRecord(oid: string, record: RecordWithMeta, options: unknown, user: unknown) {
      let functionLogLevel = 'verbose';
      const optionsObj = options as AnyRecord;
      const triggerCondition = _.get(optionsObj, "triggerCondition", "");
      if (_.isEmpty(triggerCondition) || this.metTriggerCondition(oid, record, optionsObj, user as AnyRecord) === "true") {
        if (sails.config.record.checkTotalSizeOfFilesInRecordLogLevel != null) {
          functionLogLevel = sails.config.record.checkTotalSizeOfFilesInRecordLogLevel;
          sails.log.info(`checkTotalSizeOfFilesInRecord - log level ${sails.config.record.checkTotalSizeOfFilesInRecordLogLevel}`);
        } else {
          sails.log.info(`checkTotalSizeOfFilesInRecord - log level ${functionLogLevel}`);
        }
        const dataLocations = _.get(record, 'metadata.dataLocations', []) as AnyRecord[];
        sails.log[functionLogLevel]('checkTotalSizeOfFilesInRecord - dataLocations');
        sails.log[functionLogLevel](dataLocations);
        if (Array.isArray(dataLocations)) {
          let foundAttachment = false;

          for (const attachmentFile of dataLocations) {
            const attachmentObj = attachmentFile as AnyRecord;
            if (!_.isUndefined(attachmentObj) && !_.isEmpty(attachmentObj) && attachmentObj.type == 'attachment' && _.toInteger(attachmentObj.size) > 0) {
              foundAttachment = true;
              break;
            }
          }

          sails.log[functionLogLevel]('checkTotalSizeOfFilesInRecord - foundAttachment ' + foundAttachment);
          if (foundAttachment) {
            let totalSizeOfFilesInRecord = 0;
            for (const attachmentFile of dataLocations) {
              const attachmentObj = attachmentFile as AnyRecord;
              sails.log[functionLogLevel](attachmentObj);
              if (!_.isUndefined(attachmentObj.size)) {
                totalSizeOfFilesInRecord = totalSizeOfFilesInRecord + _.toInteger(attachmentObj.size);
              }
            }

            sails.log[functionLogLevel]('checkTotalSizeOfFilesInRecord - totalSizeOfFilesInRecord ' + totalSizeOfFilesInRecord);
            const maxUploadSize = sails.config.record.maxUploadSize;
            if (totalSizeOfFilesInRecord > maxUploadSize) {

              let maxUploadSizeMessage = TranslationService.t('max-total-files-upload-size-validation-error');
              const alternativeMessageCode = optionsObj['maxUploadSizeMessageCode'];

              if (!_.isUndefined(alternativeMessageCode)) {
                let replaceOrAppend = optionsObj['replaceOrAppend'];
                if (_.isUndefined(replaceOrAppend)) {
                  replaceOrAppend = 'append';
                }
                if (replaceOrAppend == 'replace') {
                  maxUploadSizeMessage = TranslationService.t(String(alternativeMessageCode));
                } else if (replaceOrAppend == 'append') {
                  const tmpMaxUploadSizeMessage = maxUploadSizeMessage + ' ' + TranslationService.t(String(alternativeMessageCode));
                  maxUploadSizeMessage = tmpMaxUploadSizeMessage;
                }
              }
              const maxSizeFormatted = this.formatBytes(maxUploadSize);
              const interMessage = TranslationService.tInter(maxUploadSizeMessage, { maxUploadSize: maxSizeFormatted });
              throw new RBValidationError({
                message: `Total size of files ${totalSizeOfFilesInRecord} was more then the max upload size ${maxUploadSize}`,
                displayErrors: [{ detail: interMessage, meta: { totalSizeOfFilesInRecord, maxUploadSize } }],
              });
            }
          }
        }

        sails.log[functionLogLevel]('checkTotalSizeOfFilesInRecord - end');
      }
      return record;
    }

    //Fixed version, unminified and ES6'ed
    //taken from SO
    //https://stackoverflow.com/questions/15900485/correct-way-to-convert-size-in-bytes-to-kb-mb-gb-in-javascript
    private formatBytes(bytes: number, decimals = 2) {
      if (bytes === 0) return '0 Bytes';

      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

      const i = Math.floor(Math.log(bytes) / Math.log(k));

      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    protected addEmailToList(contributor: unknown, emailProperty: string, emailList: string[], lowerCaseEmailAddresses: boolean = true) {
      let contributorEmailAddress = _.get(contributor as AnyRecord, emailProperty);
      if (!contributorEmailAddress) {
        if (!contributor) {
          return;
        }
        contributorEmailAddress = contributor;
      }
      if (!_.isEmpty(contributorEmailAddress) && !_.isUndefined(contributorEmailAddress)) {
        if (Array.isArray(contributorEmailAddress) && contributorEmailAddress.length > 0) {
          contributorEmailAddress = contributorEmailAddress[0];
        }
        if (_.isString(contributorEmailAddress)) {
          sails.log.verbose(`Pushing contrib email address ${contributorEmailAddress}`);
          if (lowerCaseEmailAddresses) {
            contributorEmailAddress = contributorEmailAddress.toLowerCase()
          }
          emailList.push(contributorEmailAddress as string);
        }
      }
    }

    protected populateContribList(contribProperties: unknown[], record: RecordWithMeta, emailProperty: string, emailList: string[]) {
      _.each(contribProperties, (editContributorProperty: unknown) => {
        const editContributorPath = String(editContributorProperty ?? '');
        const editContributor = _.get(record, editContributorPath, null);

        if (editContributor) {
          sails.log.verbose(`Contributor:`);
          sails.log.verbose(JSON.stringify(editContributor));
          if (_.isArray(editContributor)) {
            _.each(editContributor, (contributor: unknown) => {
              this.addEmailToList(contributor, emailProperty, emailList);
            });
          } else {
            this.addEmailToList(editContributor, emailProperty, emailList);
          }
        }
      });
      return _.uniq(emailList);
    }

    protected getContribListByRule(contribProperties: unknown[], record: RecordWithMeta, rule: unknown, emailProperty: string, emailList: string[]) {
      const compiledRule = _.template(String(rule ?? ''));
      _.each(contribProperties, (contributorProperty: unknown) => {
        sails.log.verbose(`Processing contributor property ${contributorProperty}`)
        const contributorPath = String(contributorProperty ?? '');
        const contributor = _.get(record, contributorPath, null);
        if (contributor) {
          sails.log.verbose(`Contributor:`);
          sails.log.verbose(JSON.stringify(contributor));
          if (_.isArray(contributor)) {
            _.each(contributor, (individualContributor: unknown) => {
              const compiledResult = String(compiledRule(individualContributor as AnyRecord));
              if (compiledResult === "true") {
                this.addEmailToList(individualContributor, emailProperty, emailList);
              }
            });
          } else {
            const compiledResult = String(compiledRule(contributor as AnyRecord));
            if (compiledResult === "true") {
              this.addEmailToList(contributor, emailProperty, emailList);
            }
          }
        }
      });
      return _.uniq(emailList);
    }

    protected filterPending(users: unknown[], userEmails: string[], userList: string[]) {
      _.each(users, (user: unknown) => {
        if (user != null) {
          const userObj = user as AnyRecord;
          _.remove(userEmails, (email: string) => {
            return email == userObj['email'];
          });
          const username = userObj['username'];
          if (_.isString(username) && !_.isEmpty(username)) {
            userList.push(username);
          }
        }
      });
    }

    public queueTriggerCall(oid: string, record: RecordWithMeta, options: unknown, user: unknown) {
      const optionsObj = options as AnyRecord;
      const triggerCondition = _.get(optionsObj, "triggerCondition", "");
      if (_.isEmpty(triggerCondition) || this.metTriggerCondition(oid, record, optionsObj) === "true") {
        const jobName = String(_.get(optionsObj, "jobName", ""));
        const triggerConfiguration = _.get(optionsObj, "triggerConfiguration", null);
        const queueMessage = {
          oid: oid,
          record: record,
          triggerConfiguration: triggerConfiguration,
          user: user
        };
        sails.log.debug(`${this.logHeader} Queueing up trigger using job name ${jobName}`);
        sails.log.verbose(queueMessage);
        this.queueService.now(jobName, queueMessage);
      }
      return of(record);
    }

    public queuedTriggerSubscriptionHandler(job: unknown) {
      const jobObj = job as AnyRecord;
      const data = (jobObj.attrs ?? {}) as AnyRecord;
      const oid = _.get(data, "oid", null);
      const triggerConfiguration = _.get(data, "triggerConfiguration", null);
      const record = _.get(data, "record", null);
      const user = _.get(data, "user", null);
      sails.log.verbose('queuedTriggerSubscriptionHandler Consuming job:');
      sails.log.verbose(data);
      const hookFunctionString = _.get(triggerConfiguration, "function", null);
      sails.log.verbose(`Found hook function string ${hookFunctionString}`);
      if (hookFunctionString != null) {
        const hookFunction = eval(hookFunctionString);
        const options = _.get(triggerConfiguration, "options", {});
        if (_.isFunction(hookFunction)) {
          sails.log.debug(`Triggering queuedtrigger: ${hookFunctionString}`)
          const hookResponse = hookFunction(oid, record, options, user);
          const response = this.convertToObservable(hookResponse);
          return firstValueFrom(response);

        } else {
          sails.log.error(`queued trigger function: '${hookFunctionString}' did not resolve to a valid function, what I got:`);
          sails.log.error(hookFunction);
        }
      }
      return of(record);
    }

    private convertToObservable(hookResponse: unknown): Observable<unknown> {
      if (isObservable(hookResponse)) {
        return hookResponse as Observable<unknown>;
      }
      return from(hookResponse as ObservableInput<unknown>);
    }

    /**
     * Assign editor and viewer permissions to the record using rules.
     * @param oid {string} The identifier.
     * @param record The record to update.
     * @param options The options for modifying the record.
     */
    public complexAssignPermissions(oid: string, record: RecordWithMeta, options: unknown) {
      const optionsObj = options as AnyRecord;
      const triggerCondition = _.get(optionsObj, "triggerCondition", "");
      if (_.isEmpty(triggerCondition) || this.metTriggerCondition(oid, record, optionsObj) === "true") {
        sails.log.verbose(`Complex Assign Permissions executing on oid: ${oid}, using options:`);
        sails.log.verbose(JSON.stringify(options));
        sails.log.verbose(`With record: `);
        sails.log.verbose(JSON.stringify(record));

        const emailProperty = String(_.get(optionsObj, "emailProperty", "email"));
        const userProperties = _.get(optionsObj, "userProperties", []);
        const viewPermissionRule = _.get(optionsObj, "viewPermissionRule");
        const editPermissionRule = _.get(optionsObj, "editPermissionRule");
        const recordCreatorPermissions = _.get(optionsObj, "recordCreatorPermissions");

        const editContributorObs: Array<Observable<unknown>> = [];
        const viewContributorObs: Array<Observable<unknown>> = [];
        let editContributorEmails: string[] = [];
        let viewContributorEmails: string[] = [];

        // get the new editor list...
        editContributorEmails = this.getContribListByRule(userProperties as unknown[], record, editPermissionRule, emailProperty, editContributorEmails);
        // get the new viewer list...
        viewContributorEmails = this.getContribListByRule(userProperties as unknown[], record, viewPermissionRule, emailProperty, viewContributorEmails);

        return this.assignContributorRecordPermissions(
          oid, record, recordCreatorPermissions,
          editContributorEmails, editContributorObs,
          viewContributorEmails, viewContributorObs
        );
      }
      return of(record);
    }

    /**
     * Assign editor and viewer permissions to the record using properties.
     * @param oid {string} The identifier.
     * @param record The record to update.
     * @param options The options for modifying the record.
     */
    public assignPermissions(oid: string, record: RecordWithMeta, options: unknown, user: UserLike) {
      const optionsObj = options as AnyRecord;
      const triggerCondition = _.get(optionsObj, "triggerCondition", "");
      if (_.isEmpty(triggerCondition) || this.metTriggerCondition(oid, record, optionsObj) === "true") {
        sails.log.verbose(`Assign Permissions executing on oid: ${oid}, using options:`);
        sails.log.verbose(JSON.stringify(options));
        sails.log.verbose(`With record: `);
        sails.log.verbose(JSON.stringify(record));

        const emailProperty = String(_.get(optionsObj, "emailProperty", "email"));
        const editContributorProperties = _.get(optionsObj, "editContributorProperties", []);
        const viewContributorProperties = _.get(optionsObj, "viewContributorProperties", []);
        const recordCreatorPermissions = _.get(optionsObj, "recordCreatorPermissions");
        const editContributorObs: Array<Observable<unknown>> = [];
        const viewContributorObs: Array<Observable<unknown>> = [];
        let editContributorEmails: string[] = [];
        let viewContributorEmails: string[] = [];

        // get the new editor list...
        editContributorEmails = this.populateContribList(editContributorProperties as unknown[], record, emailProperty, editContributorEmails);
        // get the new viewer list...
        viewContributorEmails = this.populateContribList(viewContributorProperties as unknown[], record, emailProperty, viewContributorEmails);

        return this.assignContributorRecordPermissions(
          oid, record, recordCreatorPermissions,
          editContributorEmails, editContributorObs,
          viewContributorEmails, viewContributorObs, 
          user
        );
      }
      return of(record);
    }

    /**
     * Assign contributor permissions to the record.
     * @param oid The identifier.
     * @param record The record to update.
     * @param recordCreatorPermissions {string} The creator permission from the options.
     * @param editContributorEmails {Array<string>} The list of editor emails.
     * @param editContributorObs {Array<Observable>} The list of editor observables.
     * @param viewContributorEmails {Array<string>} The list of viewer emails.
     * @param viewContributorObs {Array<Observable>} The list of viewer observables.
     * @private
     */
    private assignContributorRecordPermissions(
oid: string, record: RecordWithMeta, recordCreatorPermissions: unknown, editContributorEmails: string[], editContributorObs: Array<Observable<unknown>>, viewContributorEmails: string[], viewContributorObs: Array<Observable<unknown>>, user?: UserLike) {
      const auth = (record.authorization ?? {}) as AnyRecord;
      record.authorization = auth;
      const createdBy = record.metaMetadata?.createdBy ?? user?.username;
      const hasContributors = !_.isEmpty(editContributorEmails) || !_.isEmpty(viewContributorEmails);
      if (_.isEmpty(editContributorEmails)) {
        sails.log.error(`No editors for record: ${oid}`);
      }
      if (_.isEmpty(viewContributorEmails)) {
        sails.log.error(`No viewers for record: ${oid}`);
      }
      const useDefaultViewList = _.isEmpty(viewContributorEmails)
        && (recordCreatorPermissions == "view" || recordCreatorPermissions == "view&edit")
        && !(_.isEmpty(editContributorEmails) && _.isEmpty(viewContributorEmails));
      if (useDefaultViewList) {
        if (createdBy) {
          auth.view = [createdBy] as string[];
        } else {
          auth.view = [];
        }
        auth.viewPending = viewContributorEmails;
      }
      // when both are empty, simpy return the record
      if (_.isEmpty(editContributorEmails) && _.isEmpty(viewContributorEmails)) {
        return of(record);
      }
      _.each(editContributorEmails, (editorEmail: string) => {
        editContributorObs.push(this.getObservable(User.findOne({
          email: editorEmail.toLowerCase()
        })));
      });
      _.each(viewContributorEmails, (viewerEmail: string) => {
        viewContributorObs.push(this.getObservable(User.findOne({
          email: viewerEmail.toLowerCase()
        })));
      });
      if (editContributorObs.length === 0 && viewContributorObs.length === 0) {
        return of(record);
      }
      let zippedViewContributorUsers: Observable<unknown>;
      if (editContributorObs.length == 0) {
        const newEditList: string[] = [];
        if (recordCreatorPermissions == "edit" || recordCreatorPermissions == "view&edit") {
          if (hasContributors && createdBy) {
            newEditList.push(createdBy as string);
          }
        }
        auth.edit = newEditList;
        auth.editPending = editContributorEmails;
        zippedViewContributorUsers = zip(...viewContributorObs);
      } else {
        zippedViewContributorUsers = zip(...editContributorObs)
          .pipe(flatMap((editContributorUsers: unknown[]) => {
            const newEditList: string[] = [];
            this.filterPending(editContributorUsers, editContributorEmails, newEditList);
            if (recordCreatorPermissions == "edit" || recordCreatorPermissions == "view&edit") {
              if (createdBy) {
                newEditList.push(createdBy as string);
              }
            }
            auth.edit = newEditList;
            auth.editPending = editContributorEmails;
            if (viewContributorObs.length === 0) {
              return of(record);
            } else {
              return zip(...viewContributorObs);
            }
          }));
      }
      return zippedViewContributorUsers.pipe(flatMap((viewContributorUsers: unknown) => {
        if (useDefaultViewList) {
          return of(record);
        }
        const viewUsers = viewContributorUsers as unknown[];
        const newViewList: string[] = [];
        this.filterPending(viewUsers, viewContributorEmails, newViewList);
        if (recordCreatorPermissions == "view" || recordCreatorPermissions == "view&edit") {
          if (createdBy) {
            newViewList.push(createdBy as string);
          }
        }
        auth.view = newViewList;
        auth.viewPending = viewContributorEmails;
        return of(record);
      }));
    }

    public stripUserBasedPermissions(oid: string, record: RecordWithMeta, options: unknown, _user: unknown) {
      const optionsObj = options as AnyRecord;
      const auth = (record.authorization ?? {}) as AnyRecord;
      record.authorization = auth;
      if (this.metTriggerCondition(oid, record, optionsObj) === "true") {
        let mode = optionsObj.permissionTypes;
        if (mode == null) {
          mode = "edit"
        }
        const stored = (auth.stored ?? {}) as AnyRecord;
        auth.stored = stored;
        if (stored == undefined) {
          auth.stored = {};
        }
        if (mode == "edit" || mode == "view&edit") {

          stored.edit = (auth.edit as AnyRecord[] ?? []).slice()

          if (auth.editPending != undefined) {
            stored.editPending = (auth.editPending as AnyRecord[]).slice()
          }

          auth.edit = [];
          if (auth.editPending != undefined) {
            auth.editPending = [];
          }
        }

        if (mode == "view" || mode == "view&edit") {

          if (auth.view != undefined) {
            stored.view = (auth.view as AnyRecord[]).slice()
          }

          if (auth.viewPending != undefined) {
            stored.viewPending = (auth.viewPending as AnyRecord[]).slice()
          }

          auth.view = [];
          if (auth.viewPending != undefined) {
            auth.viewPending = [];
          }
        }
      }
      return of(record);
    }

    public restoreUserBasedPermissions(oid: string, record: RecordWithMeta, options: unknown, _user: unknown) {
      const auth = (record.authorization ?? {}) as AnyRecord;
      record.authorization = auth;
      if (this.metTriggerCondition(oid, record, options as AnyRecord) === "true") {
        const stored = (auth.stored ?? {}) as AnyRecord;
        auth.stored = stored;
        if (!_.isEmpty(stored)) {
          if (stored.edit != undefined) {
            auth.edit = _.map(stored.edit as AnyRecord[], _.clone);
          }
          if (stored.view != undefined) {
            auth.view = _.map(stored.view as AnyRecord[], _.clone);
          }
          if (stored.editPending != undefined) {
            auth.editPending = _.map(stored.editPending as AnyRecord[], _.clone);
          }
          if (stored.viewPending != undefined) {
            auth.viewPending = _.map(stored.viewPending as AnyRecord[], _.clone);
          }
          delete auth.stored;
        }
      }
      return of(record);
    }

    public runTemplates(oid: string, record: RecordWithMeta, options: unknown, user: unknown, _response: StorageServiceResponse | null = null) {

      sails.log.verbose(`runTemplates config:`);
      sails.log.verbose(JSON.stringify((options as AnyRecord).templates));
      sails.log.verbose(`runTemplates oid: ${oid} with user: ${JSON.stringify(user)}`);
      sails.log.verbose(JSON.stringify(record));

      const optionsObj = options as AnyRecord;
      const parseObject = _.get(optionsObj, 'parseObject', false);
      let tmplConfig = null;
      try {
        const templates = (optionsObj.templates ?? []) as AnyRecord[];
        _.each(templates, (templateConfig: unknown) => {
          const templateConfigObj = templateConfig as AnyRecord;
          tmplConfig = templateConfigObj;
          const imports = _.extend({

            moment: moment,
            numeral: numeral
          }, this);
          const templateImportsData = {
            imports: imports
          };
          const templateData = {
            oid: oid,
            record: record,
            user: user,
            options: options
          }
          if (_.isString(templateConfigObj.template)) {
            const compiledTemplate = _.template(templateConfigObj.template, templateImportsData);
            templateConfigObj.template = compiledTemplate;
          }
          const data = (templateConfigObj.template as (data: AnyRecord) => string)(templateData as AnyRecord);
          if (parseObject) {
            const obj = JSON.parse(data);
            _.set(record, templateConfigObj.field as string, obj);
          } else {
            _.set(record, templateConfigObj.field as string, data);
          }
        });
      } catch (e) {
        const errLog = `Failed to run one of the string templates: ${JSON.stringify(tmplConfig)}`
        sails.log.error(errLog);
        sails.log.error(e);
        return throwError(new Error(errLog));
      }

      return of(record);

    }

    public async addWorkspaceToRecord(oid: string, workspaceData: unknown, options: unknown, user: unknown, response: unknown) {
      const optionsObj = options as AnyRecord;
      const workspaceObj = workspaceData as AnyRecord;
      const workspaceMetadata = (workspaceObj.metadata ?? {}) as AnyRecord;
      const rdmpOidField = _.get(optionsObj, 'rdmpOidField', 'rdmpOid') as string;
      const rdmpOid = _.get(workspaceMetadata, rdmpOidField, null) as string | null;
      sails.log.verbose(`Generic adding workspace ${oid} to record: ${rdmpOid}`);
      if (_.isEmpty(rdmpOid)) {
        sails.log.error(`No RDMP OID found in workspace data: ${JSON.stringify(workspaceData)}`);
        return workspaceData;
      }
      await WorkspaceService.addWorkspaceToRecord(workspaceMetadata.rdmpOid as string, oid);
      _.set(response as AnyRecord, 'workspaceOid', oid);
      _.set(response as AnyRecord, 'workspaceData', workspaceData);
      return workspaceData;
    }

    public async removeWorkspaceFromRecord(oid: string, workspaceData: unknown, options: unknown, user: unknown, response: unknown) {
      const optionsObj = options as AnyRecord;
      const workspaceObj = workspaceData as AnyRecord;
      const workspaceMetadata = (workspaceObj.metadata ?? {}) as AnyRecord;
      const rdmpOidField = _.get(optionsObj, 'rdmpOidField', 'rdmpOid') as string;
      const rdmpOid = _.get(workspaceMetadata, rdmpOidField, null) as string | null;
      sails.log.verbose(`Generic removing workspace ${oid} from record: ${rdmpOid}`);
      if (_.isEmpty(rdmpOid)) {
        sails.log.error(`No RDMP OID found in workspace data: ${JSON.stringify(workspaceData)}`);
        return workspaceData;
      }
      await WorkspaceService.removeWorkspaceFromRecord(rdmpOid as string, oid);
      _.set(response as AnyRecord, 'workspaceOid', oid);
      _.set(response as AnyRecord, 'workspaceData', workspaceData);
      return workspaceData;
    }
  }
}

declare global {
  let RDMPService: Services.RDMPS;
}
