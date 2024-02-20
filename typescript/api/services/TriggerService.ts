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

import { Observable } from 'rxjs/Rx';
import {
  Services as services,
  RBValidationError
} from '@researchdatabox/redbox-core-types';
import { Sails, Model } from "sails";

declare var sails: Sails;
declare var RecordType: Model;
declare var _this;
declare var _;
declare var User;
declare var RecordsService;
declare var TranslationService;

export module Services {
  /**
   * Trigger related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Trigger extends services.Core.Service {

    protected _exportedMethods: any = [
      'transitionWorkflow',
      'runHooksSync',
      'validateFieldUsingRegex',
      'applyFieldLevelPermissions'
    ];

    /**
     * Used in changing the workflow stages automatically based on configuration.
     *
     * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
     * @param  oid
     * @param  record
     * @param  options
     * @return
     */
    public transitionWorkflow(oid, record, options) {
      const triggerCondition = _.get(options, "triggerCondition", "");

      var variables = {};
      variables['imports'] = record;
      var compiled = _.template(triggerCondition, variables);
      const compileResult = compiled();
      sails.log.verbose(`Trigger condition for ${oid} ==> "${triggerCondition}", has result: '${compileResult}'`);
      if (_.isEqual(compileResult, "true")) {
        const workflowStageTarget = _.get(options, "targetWorkflowStageName", _.get(record, 'workflow.stage'));
        const workflowStageLabel = _.get(options, "targetWorkflowStageLabel", _.get(record, 'workflow.stageLabel'));
        sails.log.verbose(`Trigger condition met for ${oid}, transitioning to: ${workflowStageTarget}`);
        _.set(record, "workflow.stage", workflowStageTarget);
        _.set(record, "workflow.stageLabel", workflowStageLabel);
        // we need to update the form too!!!!
        _.set(record, "metaMetadata.form", _.get(options, "targetForm", record.metaMetadata.form));
      }

      return Observable.of(record);
    }

    /**
     *
     * By default, hooks are launched asynch, this method allows for synch running of hooks while not blocking the save request thread.
     * Will work as pre and post hooks.
     *
     *
     * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
     * @param  oid
     * @param  record
     * @param  options
     * map of:
     *   "hooks" - array, same structure as that of hook option's "pre" and "post" fields
     * @return
     */
    public runHooksSync(oid, record, options, user) {
      sails.log.debug(`runHooksSync, starting...`);
      sails.log.debug(JSON.stringify(options));
      const hookFnArray = _.get(options, 'hooks');
      const hookFnDefArray = [];
      _.each(hookFnArray, (hookFnDef) => {
        const hookFnStr = _.get(hookFnDef, "function", null);
        if (!_.isEmpty(hookFnStr) && _.isString(hookFnStr)) {
          const hookFn = eval(hookFnStr);
          const hookOpt = _.get(hookFnDef, "options");
          if (_.isFunction(hookFn)) {
            sails.log.debug(`runHooksSync, adding: ${hookFnStr}`);
            hookFnDefArray.push({ hookFn: hookFn, hookOpt: hookOpt });
          } else {
            sails.log.error(`runHooksSync, this is not a valid function: ${hookFnStr}`);
            sails.log.error(hookFnDef);
          }
        } else {
          sails.log.error(`runHooksSync, expected a string function name, got: ${hookFnStr}`);
          sails.log.error(hookFnDef);
        }
      });
      if (!_.isEmpty(hookFnDefArray)) {
        sails.log.debug(`runHooksSync, running..`);
        return Observable.from(hookFnDefArray)
          .concatMap(hookDef => {
            return hookDef.hookFn(oid, record, hookDef.hookOpt, user);
          })
          .last();
      } else {
        sails.log.debug(`runHooksSync, no observables to run`);
        return Observable.of(record);
      }
    }

    private validateRegex(data, regexPattern, fieldLanguageCode, errorMessageCode, caseSensitive) {
      let re;
      if (caseSensitive) {
        re = new RegExp(regexPattern);
      } else {
        re = new RegExp(regexPattern, 'i');
      }
      sails.log.verbose('validateFieldUsingRegex data.toString() ' + data.toString());
      let reTest = re.test(data.toString());
      sails.log.verbose('validateFieldUsingRegex caseSensitive ' + caseSensitive + ' reTest ' + reTest);
      if (!reTest) {
        let customError: RBValidationError;
        if (!_.isUndefined(fieldLanguageCode)) {
          let fieldName = TranslationService.t(fieldLanguageCode);
          let baseErrorMessage = TranslationService.t(errorMessageCode);
          customError = new RBValidationError(fieldName + ' ' + baseErrorMessage);
        } else {
          let baseErrorMessage = TranslationService.t(errorMessageCode);
          customError = new RBValidationError(baseErrorMessage);
        }
        throw customError;
      }
    }

    public async applyFieldLevelPermissions(oid, record, options, user) {
      // mandatory
      let fieldDBNames = _.get(options, 'fieldDBNames', []);
      // Allow a certain user to edit
      let userWithPermissionToEdit = _.get(options, 'userWithPermissionToEdit');
      let roleEditPermission = _.get(options, 'roleEditPermission');

      if (user.username != userWithPermissionToEdit && !this.userHasRoleEditPermission(user, roleEditPermission)) {
        let previousRecord = await RecordsService.getMeta(oid);
        for (let fieldDBName of fieldDBNames) {
          let data = _.get(record, fieldDBName);
          sails.log.debug(`field name ${fieldDBName} value is ${data}`)
          let previousData = _.get(previousRecord, fieldDBName);
          sails.log.debug(`previous field name ${fieldDBName} value is ${previousData}`);
          if (previousData != null && previousData.trim() != '') {
            _.set(record, fieldDBName, previousData);
            sails.log.info(`Setting field name ${fieldDBName} of record with OID ${oid} to ${previousData}`);
          }
        }
      }

      return record;
    }

    private userHasRoleEditPermission(user, roleEditPermission) {
      for (let role of user.roles) {
        if (role.name === roleEditPermission) {
          return true;
        }
      }
      return false;
    }

    public async validateFieldUsingRegex(oid, record, options) {
      //mandatory
      let fieldDBName = _.get(options, 'fieldDBName');
      let errorMessageCode = _.get(options, 'errorLanguageCode');
      let regexPattern = _.get(options, 'regexPattern');
      //optional
      let fieldLanguageCode = _.get(options, 'fieldLanguageCode');
      let arrayObjFieldDBName = _.get(options, 'arrayObjFieldDBName');
      //Set false by default if not present this option will remove leading and trailing spaces from a none array value
      //then it will modify the value in the record if the the regex validation is passed therefore handle with care
      let trimLeadingAndTrailingSpacesBeforeValidation = _.get(options, 'trimLeadingAndTrailingSpacesBeforeValidation') || false;
      let caseSensitive = _.get(options, 'caseSensitive') || true;

      let data = _.get(record, fieldDBName);

      if (_.isArray(data) && !_.isUndefined(arrayObjFieldDBName)) {

        sails.log.verbose(`validateFieldUsingRegex is array ${fieldDBName} ` + JSON.stringify(data));
        sails.log.verbose('validateFieldUsingRegex is array regexPattern ' + regexPattern);
        for (let row of data) {

          let objField = _.get(row, arrayObjFieldDBName);

          if (!_.isUndefined(objField) && objField != null && objField != '' && !_.isUndefined(regexPattern) && !_.isUndefined(errorMessageCode)) {

            this.validateRegex(objField, regexPattern, fieldLanguageCode, errorMessageCode, caseSensitive);
          }
        }

      } else {

        sails.log.verbose(`validateFieldUsingRegex ${fieldDBName} ` + data);
        sails.log.verbose('validateFieldUsingRegex regexPattern ' + regexPattern);
        if (!_.isUndefined(data) && data != null && data != '' && !_.isUndefined(regexPattern) && !_.isUndefined(errorMessageCode)) {

          if (trimLeadingAndTrailingSpacesBeforeValidation) {
            let trimData = _.trim(data);
            data = trimData;
          }

          this.validateRegex(data, regexPattern, fieldLanguageCode, errorMessageCode, caseSensitive);

          if (trimLeadingAndTrailingSpacesBeforeValidation) {
            _.set(record, fieldDBName, data);
          }
        }
      }

      return record;
    }

  }
}
module.exports = new Services.Trigger().exports();
