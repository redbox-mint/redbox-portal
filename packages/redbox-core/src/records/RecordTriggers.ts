import type { CounterRepository } from '../persistence/storage/StorageRepositories';
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

import { Observable, ObservableInput, of, from, zip, throwError, isObservable, firstValueFrom, defer } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import _ from 'lodash';
import { logAtLevel, type ILogger } from '@researchdatabox/sails-ng-common';
import type { IdentityRepositories } from '../persistence/identity/IdentityRepositories';
import type { RecordConfig } from '../config/record.config';
import { recordServiceChronicle } from '../utilities/serviceChronicle';
import { metTriggerCondition } from '../utilities/metTriggerCondition';
import { convertToType } from '../utilities/convertToType';
import type { QueueService } from '../QueueService';
import { RBValidationError } from '../model/RBValidationError';
import type { StorageServiceResponse } from '../StorageServiceResponse';
import { momentShim as moment } from '../shims/momentShim';
import numeral from 'numeral';

export interface RecordTriggersInput {
  readonly config: Pick<
    RecordConfig,
    'processRecordCountersLogLevel' | 'checkTotalSizeOfFilesInRecordLogLevel' | 'maxUploadSize'
  >;
  readonly log: ILogger;
  readonly identities: Pick<IdentityRepositories, 'list'>;
  readonly counters: CounterRepository;
  readonly queue: Pick<QueueService, 'now'>;
  effectiveUser(user: unknown): Promise<unknown>;
  translate(key: string): string;
  interpolate(message: string, values: Record<string, unknown>): string;
  resolveHook(name: string): unknown;
  readonly workspaces: {
    addWorkspaceToRecord(
      recordOid: string,
      workspaceOid: string,
      options: Record<string, unknown>,
      unused: undefined,
      user: unknown
    ): Promise<unknown>;
    removeWorkspaceFromRecord(
      recordOid: string,
      workspaceOid: string,
      options: Record<string, unknown>,
      unused: undefined,
      user: unknown
    ): Promise<unknown>;
  };
}

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
export class RecordTriggers {
  public constructor(private readonly input: RecordTriggersInput) {}

  protected updateChronicle(
    info: Record<string, unknown>,
    errors: unknown[] = [],
    level: 'debug' | 'info' | 'warn' = 'debug'
  ): void {
    recordServiceChronicle(this.input.log, info, errors, level);
  }
  protected logAtLevel(level: string, ...args: unknown[]): void {
    logAtLevel(this.input.log, level, ...args);
  }
  protected metTriggerCondition(
    oid: string | null,
    record: Record<string, unknown>,
    options: Record<string, unknown>,
    user?: unknown
  ): string {
    return metTriggerCondition(oid, record, options, user);
  }
  protected getObservable<T>(operation: () => Promise<unknown>): Observable<T> {
    let pending: Promise<T> | undefined;
    return defer(() => (pending ??= Promise.resolve().then(operation) as Promise<T>));
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
    if (this.input.config.processRecordCountersLogLevel != null) {
      processRecordCountersLogLevel = this.input.config.processRecordCountersLogLevel;
      this.input.log.info(`processRecordCounters - log level ${this.input.config.processRecordCountersLogLevel}`);
    } else {
      this.input.log.info(`processRecordCounters - log level ${processRecordCountersLogLevel}`);
    }

    //For all projects that don't set environment variable "sails_record__processRecordCountersLogLevel" in docker-compose.yml
    //the log level of this function is going to be verbose which is the standard but in example for CQU it will be set to
    //error to make it so this function always prints logging until the RDMPs missing IDs issue is fixed
    this.logAtLevel(
      processRecordCountersLogLevel,
      `processRecordCounters - brandId: ${recordData.metaMetadata.brandId}`
    );
    this.updateChronicle({ rdmpCountersOid: oid, rdmpCounterCount: _.size(optionsData.counters) });
    // get the counters
    for (const counter of optionsData.counters ?? []) {
      const counterData = counter as { field_name?: string; strategy?: string; source_field?: string };
      this.logAtLevel(
        processRecordCountersLogLevel,
        `processRecordCounters - counter.strategy: ${counterData.strategy}`
      );

      if (counterData.strategy == 'global') {
        const repository = this.input.counters;
        const value = await repository.incrementGlobal(counterData.field_name, brandId);
        this.incrementCounter(recordData, counterData, value);
        this.updateChronicle({ rdmpCounterUpdateOutcome: 'success' });
      } else if (counterData.strategy == 'field') {
        this.logAtLevel(processRecordCountersLogLevel, 'processRecordCounters - field - enter');
        let srcVal = (recordData.metadata ?? {})[counterData.field_name ?? ''];
        if (!_.isEmpty(counterData.source_field)) {
          srcVal = (recordData.metadata ?? {})[counterData.source_field ?? ''];
        }
        const newVal = _.isUndefined(srcVal) || _.isEmpty(srcVal) ? 1 : _.toNumber(srcVal) + 1;
        this.logAtLevel(processRecordCountersLogLevel, `processRecordCounters - field - newVal: ${newVal}`);
        this.incrementCounter(recordData, counterData, newVal);
      }
    }

    this.logAtLevel(processRecordCountersLogLevel, 'processRecordCounters - end');
    return record;
  }

  private incrementCounter(record: RecordWithMeta, counter: unknown, newVal: unknown) {
    const counterData = counter as {
      template?: unknown;
      prefix?: string;
      field_name?: string;
      add_value_to_array?: string;
    };
    const metadata = record.metadata ?? {};

    let processRecordCountersLogLevel = 'verbose';
    if (this.input.config.processRecordCountersLogLevel != null) {
      processRecordCountersLogLevel = this.input.config.processRecordCountersLogLevel;
      this.input.log.info(`incrementCounter - log level ${this.input.config.processRecordCountersLogLevel}`);
    } else {
      this.input.log.info(`incrementCounter - log level ${processRecordCountersLogLevel}`);
    }

    //For all projects that don't set environment variable "sails_record__processRecordCountersLogLevel" in docker-compose.yml
    //the log level of this function is going to be verbose which is the standard but in example for CQU it will be set to
    //error to make it so this function always prints logging until the RDMPs missing IDs issue is fixed
    this.logAtLevel(processRecordCountersLogLevel, 'incrementCounter - enter');

    if (!_.isEmpty(counterData.template)) {
      this.logAtLevel(processRecordCountersLogLevel, `incrementCounter - newVal: ${newVal}`);
      const templateData = _.extend({ newVal: newVal }, counterData);
      const templateImportData = {
        imports: {
          moment: moment,
          numeral: numeral,
        },
      };
      if (_.isString(counterData.template)) {
        const compiledTemplate = _.template(counterData.template, templateImportData);
        newVal = compiledTemplate(templateData);
      } else newVal = (counterData.template as (data: unknown) => unknown)(templateData);
    }
    const recVal = `${this.input.translate(counterData.prefix ?? '')}${newVal}`;
    this.updateChronicle({ rdmpCounterValueLength: recVal.length });
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
      this.updateChronicle({ rdmpCounterArrayCount: arrayVal.length });
    }
    this.logAtLevel(processRecordCountersLogLevel, 'incrementCounter - end');
  }

  public checkTotalSizeOfFilesInRecord(oid: string, record: RecordWithMeta, options: unknown, user: unknown) {
    let functionLogLevel = 'verbose';
    const optionsObj = options as AnyRecord;
    const triggerCondition = _.get(optionsObj, 'triggerCondition', '');
    if (
      _.isEmpty(triggerCondition) ||
      this.metTriggerCondition(oid, record, optionsObj, user as AnyRecord) === 'true'
    ) {
      if (this.input.config.checkTotalSizeOfFilesInRecordLogLevel != null) {
        functionLogLevel = this.input.config.checkTotalSizeOfFilesInRecordLogLevel;
        this.input.log.info(
          `checkTotalSizeOfFilesInRecord - log level ${this.input.config.checkTotalSizeOfFilesInRecordLogLevel}`
        );
      } else {
        this.input.log.info(`checkTotalSizeOfFilesInRecord - log level ${functionLogLevel}`);
      }
      const dataLocations = _.get(record, 'metadata.dataLocations', []) as AnyRecord[];
      this.updateChronicle({ rdmpAttachmentOid: oid, rdmpDataLocationCount: _.size(dataLocations) });
      if (Array.isArray(dataLocations)) {
        let foundAttachment = false;

        for (const attachmentFile of dataLocations) {
          const attachmentObj = attachmentFile as AnyRecord;
          if (
            !_.isUndefined(attachmentObj) &&
            !_.isEmpty(attachmentObj) &&
            attachmentObj.type == 'attachment' &&
            _.toInteger(attachmentObj.size) > 0
          ) {
            foundAttachment = true;
            break;
          }
        }

        this.logAtLevel(functionLogLevel, 'checkTotalSizeOfFilesInRecord - foundAttachment ' + foundAttachment);
        if (foundAttachment) {
          let totalSizeOfFilesInRecord = 0;
          for (const attachmentFile of dataLocations) {
            const attachmentObj = attachmentFile as AnyRecord;
            if (!_.isUndefined(attachmentObj.size)) {
              totalSizeOfFilesInRecord = totalSizeOfFilesInRecord + _.toInteger(attachmentObj.size);
            }
          }

          this.logAtLevel(
            functionLogLevel,
            'checkTotalSizeOfFilesInRecord - totalSizeOfFilesInRecord ' + totalSizeOfFilesInRecord
          );
          const maxUploadSize = this.input.config.maxUploadSize;
          if (totalSizeOfFilesInRecord > maxUploadSize) {
            let maxUploadSizeMessage = this.input.translate('max-total-files-upload-size-validation-error');
            const alternativeMessageCode = optionsObj['maxUploadSizeMessageCode'];

            if (!_.isUndefined(alternativeMessageCode)) {
              let replaceOrAppend = optionsObj['replaceOrAppend'];
              if (_.isUndefined(replaceOrAppend)) {
                replaceOrAppend = 'append';
              }
              if (replaceOrAppend == 'replace') {
                maxUploadSizeMessage = this.input.translate(String(alternativeMessageCode));
              } else if (replaceOrAppend == 'append') {
                const tmpMaxUploadSizeMessage =
                  maxUploadSizeMessage + ' ' + this.input.translate(String(alternativeMessageCode));
                maxUploadSizeMessage = tmpMaxUploadSizeMessage;
              }
            }
            const maxSizeFormatted = this.formatBytes(maxUploadSize);
            const interMessage = this.input.interpolate(maxUploadSizeMessage, { maxUploadSize: maxSizeFormatted });
            throw new RBValidationError({
              message: `Total size of files ${totalSizeOfFilesInRecord} was more then the max upload size ${maxUploadSize}`,
              displayErrors: [{ detail: interMessage, meta: { totalSizeOfFilesInRecord, maxUploadSize } }],
            });
          }
        }
      }

      this.logAtLevel(functionLogLevel, 'checkTotalSizeOfFilesInRecord - end');
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

  protected addEmailToList(
    contributor: unknown,
    emailProperty: string,
    emailList: string[],
    lowerCaseEmailAddresses: boolean = true
  ) {
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
        if (lowerCaseEmailAddresses) {
          contributorEmailAddress = contributorEmailAddress.toLowerCase();
        }
        emailList.push(contributorEmailAddress as string);
      }
    }
  }

  protected populateContribList(
    contribProperties: unknown[],
    record: RecordWithMeta,
    emailProperty: string,
    emailList: string[]
  ) {
    _.each(contribProperties, (editContributorProperty: unknown) => {
      const editContributorPath = String(editContributorProperty ?? '');
      const editContributor = _.get(record, editContributorPath, null);

      if (editContributor) {
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

  protected getContribListByRule(
    contribProperties: unknown[],
    record: RecordWithMeta,
    rule: unknown,
    emailProperty: string,
    emailList: string[]
  ) {
    const compiledRule = _.template(String(rule ?? ''));
    _.each(contribProperties, (contributorProperty: unknown) => {
      const contributorPath = String(contributorProperty ?? '');
      const contributor = _.get(record, contributorPath, null);
      if (contributor) {
        if (_.isArray(contributor)) {
          _.each(contributor, (individualContributor: unknown) => {
            const compiledResult = String(compiledRule(individualContributor as AnyRecord));
            if (compiledResult === 'true') {
              this.addEmailToList(individualContributor, emailProperty, emailList);
            }
          });
        } else {
          const compiledResult = String(compiledRule(contributor as AnyRecord));
          if (compiledResult === 'true') {
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

  private async resolvePermissionUser(users: unknown[]): Promise<unknown | null> {
    const candidates = users.filter((user: unknown) => !_.isEmpty(user));
    if (_.isEmpty(candidates)) {
      return null;
    }

    const effectiveUsers = await Promise.all(
      candidates.map(async (candidate: unknown) => {
        try {
          const effectiveUser = await this.input.effectiveUser(candidate);
          return effectiveUser ?? candidate;
        } catch {
          this.updateChronicle({ rdmpPermissionUserResolution: 'fallback' }, [], 'warn');
          return candidate;
        }
      })
    );

    // Permissions are stored by username. Multiple users with the same email
    // are therefore safe to resolve only when every candidate resolves to the
    // same username. In that case the first candidate is sufficient because
    // all candidates produce the same permission value; otherwise leave the
    // email pending rather than selecting an arbitrary username.
    if (candidates.length > 1) {
      const effectiveUsernames = effectiveUsers.map((user: unknown) => {
        const username = (user as AnyRecord)?.username;
        return _.isString(username) && !_.isEmpty(username) ? username : null;
      });
      if (
        _.isEmpty(effectiveUsernames) ||
        effectiveUsernames.some((username: string | null) => username !== effectiveUsernames[0])
      ) {
        return null;
      }
    }

    return effectiveUsers[0] ?? null;
  }

  private findPermissionUser(email: string): Observable<unknown> {
    return this.getObservable<unknown[]>(() =>
      this.input.identities.list('user', {
        email: email.toLowerCase(),
      })
    ).pipe(flatMap((users: unknown[]) => from(this.resolvePermissionUser(users))));
  }

  public queueTriggerCall(oid: string, record: RecordWithMeta, options: unknown, user: unknown) {
    const optionsObj = options as AnyRecord;
    const triggerCondition = _.get(optionsObj, 'triggerCondition', '');
    if (_.isEmpty(triggerCondition) || this.metTriggerCondition(oid, record, optionsObj) === 'true') {
      const jobName = String(_.get(optionsObj, 'jobName', ''));
      const triggerConfiguration = _.get(optionsObj, 'triggerConfiguration', null);
      const queueMessage = {
        oid: oid,
        record: record,
        triggerConfiguration: triggerConfiguration,
        user: user,
      };
      this.updateChronicle({ rdmpTriggerOid: oid, rdmpTriggerJobName: jobName, rdmpTriggerPhase: 'queued' });
      return this.getObservable(() => this.input.queue.now(jobName, queueMessage)).pipe(flatMap(() => of(record)));
    }
    return of(record);
  }

  public queuedTriggerSubscriptionHandler(job: unknown) {
    const jobObj = job as AnyRecord;
    const attrs = (jobObj.attrs ?? {}) as AnyRecord;
    const data = (_.get(attrs, 'data', attrs) ?? {}) as AnyRecord;
    const oid = _.get(data, 'oid', null);
    const jobName = typeof attrs.name === 'string' ? attrs.name : undefined;
    const triggerConfiguration = _.get(data, 'triggerConfiguration', null);
    const record = _.get(data, 'record', null);
    const user = _.get(data, 'user', null);
    this.updateChronicle({ rdmpTriggerOid: oid, rdmpTriggerJobName: jobName, rdmpTriggerPhase: 'processing' });
    const hookFunctionString = _.get(triggerConfiguration, 'function', null);
    if (hookFunctionString != null) {
      const hookFunction = this.input.resolveHook(String(hookFunctionString));
      const options = _.get(triggerConfiguration, 'options', {});
      if (_.isFunction(hookFunction)) {
        const hookResponse = hookFunction(oid, record, options, user);
        const response = this.convertToObservable(hookResponse);
        return firstValueFrom(response);
      } else {
        this.updateChronicle(
          { rdmpTriggerOid: oid, rdmpTriggerJobName: jobName, rdmpTriggerOutcome: 'invalid-function' },
          [],
          'warn'
        );
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
    const triggerCondition = _.get(optionsObj, 'triggerCondition', '');
    if (_.isEmpty(triggerCondition) || this.metTriggerCondition(oid, record, optionsObj) === 'true') {
      this.updateChronicle({ rdmpPermissionOid: oid, rdmpPermissionMode: 'rules' });

      const emailProperty = String(_.get(optionsObj, 'emailProperty', 'email'));
      const userProperties = _.get(optionsObj, 'userProperties', []);
      const viewPermissionRule = _.get(optionsObj, 'viewPermissionRule');
      const editPermissionRule = _.get(optionsObj, 'editPermissionRule');
      const recordCreatorPermissions = _.get(optionsObj, 'recordCreatorPermissions');

      const editContributorObs: Array<Observable<unknown>> = [];
      const viewContributorObs: Array<Observable<unknown>> = [];
      let editContributorEmails: string[] = [];
      let viewContributorEmails: string[] = [];

      // get the new editor list...
      editContributorEmails = this.getContribListByRule(
        userProperties as unknown[],
        record,
        editPermissionRule,
        emailProperty,
        editContributorEmails
      );
      // get the new viewer list...
      viewContributorEmails = this.getContribListByRule(
        userProperties as unknown[],
        record,
        viewPermissionRule,
        emailProperty,
        viewContributorEmails
      );

      return this.assignContributorRecordPermissions(
        oid,
        record,
        recordCreatorPermissions,
        editContributorEmails,
        editContributorObs,
        viewContributorEmails,
        viewContributorObs
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
    const triggerCondition = _.get(optionsObj, 'triggerCondition', '');
    if (_.isEmpty(triggerCondition) || this.metTriggerCondition(oid, record, optionsObj) === 'true') {
      this.updateChronicle({ rdmpPermissionOid: oid, rdmpPermissionMode: 'properties' });

      const emailProperty = String(_.get(optionsObj, 'emailProperty', 'email'));
      const editContributorProperties = _.get(optionsObj, 'editContributorProperties', []);
      const viewContributorProperties = _.get(optionsObj, 'viewContributorProperties', []);
      const recordCreatorPermissions = _.get(optionsObj, 'recordCreatorPermissions');
      const editContributorObs: Array<Observable<unknown>> = [];
      const viewContributorObs: Array<Observable<unknown>> = [];
      let editContributorEmails: string[] = [];
      let viewContributorEmails: string[] = [];

      // get the new editor list...
      editContributorEmails = this.populateContribList(
        editContributorProperties as unknown[],
        record,
        emailProperty,
        editContributorEmails
      );
      // get the new viewer list...
      viewContributorEmails = this.populateContribList(
        viewContributorProperties as unknown[],
        record,
        emailProperty,
        viewContributorEmails
      );

      return this.assignContributorRecordPermissions(
        oid,
        record,
        recordCreatorPermissions,
        editContributorEmails,
        editContributorObs,
        viewContributorEmails,
        viewContributorObs,
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
    oid: string,
    record: RecordWithMeta,
    recordCreatorPermissions: unknown,
    editContributorEmails: string[],
    editContributorObs: Array<Observable<unknown>>,
    viewContributorEmails: string[],
    viewContributorObs: Array<Observable<unknown>>,
    user?: UserLike
  ) {
    const auth = (record.authorization ?? {}) as AnyRecord;
    record.authorization = auth;
    const createdBy = record.metaMetadata?.createdBy ?? user?.username;
    const hasContributors = !_.isEmpty(editContributorEmails) || !_.isEmpty(viewContributorEmails);
    this.updateChronicle(
      {
        rdmpPermissionOid: oid,
        rdmpEditorCount: editContributorEmails.length,
        rdmpViewerCount: viewContributorEmails.length,
      },
      [],
      _.isEmpty(editContributorEmails) || _.isEmpty(viewContributorEmails) ? 'warn' : 'debug'
    );
    const useDefaultViewList =
      _.isEmpty(viewContributorEmails) &&
      (recordCreatorPermissions == 'view' || recordCreatorPermissions == 'view&edit') &&
      !(_.isEmpty(editContributorEmails) && _.isEmpty(viewContributorEmails));
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
      if (recordCreatorPermissions == 'edit' || recordCreatorPermissions == 'view&edit') {
        auth.edit = createdBy ? [createdBy] : [];
        auth.editPending = [];
      }
      if (recordCreatorPermissions == 'view' || recordCreatorPermissions == 'view&edit') {
        auth.view = createdBy ? [createdBy] : [];
        auth.viewPending = [];
      }
      return of(record);
    }
    _.each(editContributorEmails, (editorEmail: string) => {
      editContributorObs.push(this.findPermissionUser(editorEmail));
    });
    _.each(viewContributorEmails, (viewerEmail: string) => {
      viewContributorObs.push(this.findPermissionUser(viewerEmail));
    });
    if (editContributorObs.length === 0 && viewContributorObs.length === 0) {
      return of(record);
    }
    const normalizeResolvedUsers = (resolvedUsers: unknown): unknown[] => {
      if (_.isNil(resolvedUsers)) {
        return [];
      }
      return _.isArray(resolvedUsers) ? resolvedUsers : [resolvedUsers];
    };
    let zippedViewContributorUsers: Observable<unknown>;
    if (editContributorObs.length == 0) {
      const newEditList: string[] = [];
      if (recordCreatorPermissions == 'edit' || recordCreatorPermissions == 'view&edit') {
        if (hasContributors && createdBy) {
          newEditList.push(createdBy as string);
        }
      }
      auth.edit = _.uniq(newEditList);
      auth.editPending = editContributorEmails;
      zippedViewContributorUsers = zip(...viewContributorObs);
    } else {
      zippedViewContributorUsers = zip(...editContributorObs).pipe(
        flatMap((editContributorUsers: unknown) => {
          return of(normalizeResolvedUsers(editContributorUsers)).pipe(
            flatMap((effectiveEditUsers: unknown[]) => {
              const newEditList: string[] = [];
              this.filterPending(effectiveEditUsers, editContributorEmails, newEditList);
              if (recordCreatorPermissions == 'edit' || recordCreatorPermissions == 'view&edit') {
                const createdByUsername = createdBy as string | undefined;
                if (createdByUsername && !newEditList.includes(createdByUsername)) {
                  newEditList.push(createdByUsername);
                }
              }
              auth.edit = _.uniq(newEditList);
              auth.editPending = editContributorEmails;
              if (viewContributorObs.length === 0) {
                if (!useDefaultViewList) {
                  auth.view = [];
                  auth.viewPending = viewContributorEmails;
                }
                return of({ __skipViewResolution: true });
              }
              return zip(...viewContributorObs);
            })
          );
        })
      );
    }
    return zippedViewContributorUsers.pipe(
      flatMap((viewContributorUsers: unknown) => {
        if (
          _.isPlainObject(viewContributorUsers) &&
          (viewContributorUsers as AnyRecord).__skipViewResolution === true
        ) {
          return of(record);
        }
        if (useDefaultViewList) {
          return of(record);
        }
        return of(normalizeResolvedUsers(viewContributorUsers)).pipe(
          flatMap((viewUsers: unknown[]) => {
            const newViewList: string[] = [];
            this.filterPending(viewUsers, viewContributorEmails, newViewList);
            if (recordCreatorPermissions == 'view' || recordCreatorPermissions == 'view&edit') {
              const createdByUsername = createdBy as string | undefined;
              if (createdByUsername && !newViewList.includes(createdByUsername)) {
                newViewList.push(createdByUsername);
              }
            }
            auth.view = _.uniq(newViewList);
            auth.viewPending = viewContributorEmails;
            return of(record);
          })
        );
      })
    );
  }

  public stripUserBasedPermissions(oid: string, record: RecordWithMeta, options: unknown, _user: unknown) {
    const optionsObj = options as AnyRecord;
    const auth = (record.authorization ?? {}) as AnyRecord;
    record.authorization = auth;
    if (this.metTriggerCondition(oid, record, optionsObj) === 'true') {
      let mode = optionsObj.permissionTypes;
      if (mode == null) {
        mode = 'edit';
      }
      const stored = (auth.stored ?? {}) as AnyRecord;
      auth.stored = stored;
      if (stored == undefined) {
        auth.stored = {};
      }
      if (mode == 'edit' || mode == 'view&edit') {
        stored.edit = ((auth.edit as AnyRecord[]) ?? []).slice();

        if (auth.editPending != undefined) {
          stored.editPending = (auth.editPending as AnyRecord[]).slice();
        }

        auth.edit = [];
        if (auth.editPending != undefined) {
          auth.editPending = [];
        }
      }

      if (mode == 'view' || mode == 'view&edit') {
        if (auth.view != undefined) {
          stored.view = (auth.view as AnyRecord[]).slice();
        }

        if (auth.viewPending != undefined) {
          stored.viewPending = (auth.viewPending as AnyRecord[]).slice();
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
    if (this.metTriggerCondition(oid, record, options as AnyRecord) === 'true') {
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

  public runTemplates(
    oid: string,
    record: RecordWithMeta,
    options: unknown,
    user: unknown,
    _response: StorageServiceResponse | null = null
  ) {
    const summary = { rdmpTemplateOid: oid, rdmpTemplateCount: _.size(_.get(options, 'templates')) };
    this.updateChronicle(summary);

    const optionsObj = options as AnyRecord;
    const parseObject = _.get(optionsObj, 'parseObject', false);
    let templateIndex = 0;
    try {
      const templates = (optionsObj.templates ?? []) as AnyRecord[];
      _.each(templates, (templateConfig: unknown, index: number) => {
        const templateConfigObj = templateConfig as AnyRecord;
        templateIndex = index;
        const imports = {
          moment: moment,
          numeral: numeral,
          convertToType,
        };
        const templateImportsData = {
          imports: imports,
        };
        const templateData = {
          oid: oid,
          record: record,
          user: user,
          options: options,
        };
        const template = _.isString(templateConfigObj.template)
          ? _.template(templateConfigObj.template, templateImportsData)
          : (templateConfigObj.template as (data: AnyRecord) => string);
        const data = template(templateData);
        _.set(record, templateConfigObj.field as string, parseObject ? JSON.parse(data) : data);
      });
    } catch {
      // Template source and exception messages can contain private record or user values.
      const error = new Error('Failed to run one of the string templates.');
      this.updateChronicle({ ...summary, rdmpTemplateOutcome: 'failed', rdmpTemplateIndex: templateIndex }, [error]);
      return throwError(() => error);
    }

    this.updateChronicle({ ...summary, rdmpTemplateOutcome: 'success' });
    return of(record);
  }

  public async addWorkspaceToRecord(
    oid: string,
    workspaceData: unknown,
    options: unknown,
    user: unknown,
    response: unknown
  ) {
    const optionsObj = options as AnyRecord;
    const workspaceObj = workspaceData as AnyRecord;
    const workspaceMetadata = (workspaceObj.metadata ?? {}) as AnyRecord;
    const rdmpOidField = _.get(optionsObj, 'rdmpOidField', 'rdmpOid') as string;
    const rdmpOid = String(_.get(workspaceMetadata, rdmpOidField, '') ?? '').trim();
    this.updateChronicle({ rdmpWorkspaceOid: oid, rdmpWorkspaceRecordOid: rdmpOid, rdmpWorkspaceOperation: 'add' });
    if (_.isEmpty(rdmpOid)) {
      this.updateChronicle(
        { rdmpWorkspaceOid: oid, rdmpWorkspaceOperation: 'add', rdmpWorkspaceOutcome: 'missing-record-oid' },
        [],
        'warn'
      );
      return workspaceData;
    }
    await this.input.workspaces.addWorkspaceToRecord(rdmpOid, oid, {}, undefined, user);
    _.set(response as AnyRecord, 'workspaceOid', oid);
    _.set(response as AnyRecord, 'workspaceData', workspaceData);
    return workspaceData;
  }

  public async removeWorkspaceFromRecord(
    oid: string,
    workspaceData: unknown,
    options: unknown,
    user: unknown,
    response: unknown
  ) {
    const optionsObj = options as AnyRecord;
    const workspaceObj = workspaceData as AnyRecord;
    const workspaceMetadata = (workspaceObj.metadata ?? {}) as AnyRecord;
    const rdmpOidField = _.get(optionsObj, 'rdmpOidField', 'rdmpOid') as string;
    const rdmpOid = String(_.get(workspaceMetadata, rdmpOidField, '') ?? '').trim();
    this.updateChronicle({ rdmpWorkspaceOid: oid, rdmpWorkspaceRecordOid: rdmpOid, rdmpWorkspaceOperation: 'remove' });
    if (_.isEmpty(rdmpOid)) {
      this.updateChronicle(
        { rdmpWorkspaceOid: oid, rdmpWorkspaceOperation: 'remove', rdmpWorkspaceOutcome: 'missing-record-oid' },
        [],
        'warn'
      );
      return workspaceData;
    }
    await this.input.workspaces.removeWorkspaceFromRecord(rdmpOid, oid, {}, undefined, user);
    _.set(response as AnyRecord, 'workspaceOid', oid);
    _.set(response as AnyRecord, 'workspaceData', workspaceData);
    return workspaceData;
  }
}
export const rdmpExportedMethods = [
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
  'removeWorkspaceFromRecord',
  'init',
] as const;
