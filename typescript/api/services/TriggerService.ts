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

import { Observable, of, from } from 'rxjs';
import { concatMap, last } from 'rxjs/operators';
import {
  RBValidationError,
  BrandingModel,
  Services as services,
  PopulateExportedMethods,
} from '@researchdatabox/redbox-core-types';
import { Sails, Model } from "sails";
import moment from '../shims/momentShim';
import numeral from 'numeral';

declare var sails: Sails;
declare var RecordType: Model;
declare var _this;
declare var _;
declare var User;
declare var RecordsService;
declare var TranslationService;
declare var BrandingService;

export module Services {
  /**
   * Trigger related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  @PopulateExportedMethods
  export class Trigger extends services.Core.Service {


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

      return of(record);
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
        return from(hookFnDefArray)
          .pipe(concatMap(hookDef => {
            return hookDef.hookFn(oid, record, hookDef.hookOpt, user);
          })
          ,last());
      } else {
        sails.log.debug(`runHooksSync, no observables to run`);
        return of(record);
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
      // mandatory
      let fieldDBName = _.get(options, 'fieldDBName');
      let errorLanguageCode = _.get(options, 'errorLanguageCode');
      let regexPattern = _.get(options, 'regexPattern');

      // optional
      let fieldLanguageCode = _.get(options, 'fieldLanguageCode');
      let arrayObjFieldDBName = _.get(options, 'arrayObjFieldDBName');

      // trimLeadingAndTrailingSpacesBeforeValidation:
      // Set false by default if not present this option will remove leading and trailing spaces from a none array value
      // then it will modify the value in the record if the regex validation is passed therefore handle with care
      let trimLeadingAndTrailingSpacesBeforeValidation = _.get(options, 'trimLeadingAndTrailingSpacesBeforeValidation') || false;

      // default to true - is only false when set to bool false or string 'false'
      let caseSensitive = _.get(options, 'caseSensitive',true)?.toString() !== 'false';
      // default to true for backwards compatibility - is only false when set to bool false or string 'false'
      let allowNulls = _.get(options, 'allowNulls', true)?.toString() !== 'false';

      // re-usable functions
      const textRegex = function (value) {
        let flags = '';
        if (!caseSensitive) {
          flags += 'i';
        }
        const re = new RegExp(regexPattern, flags);
        return re.test(value);
      }
      const getError = function () {
        let displayErrorDetail = TranslationService.t(errorLanguageCode);
        const displayErrorMeta: Record<string, unknown> = {errorLanguageCode:errorLanguageCode};
        if (fieldLanguageCode) {
          displayErrorDetail = `${TranslationService.t(fieldLanguageCode)} ${displayErrorDetail}`;
          displayErrorMeta.fieldLanguageCode = fieldLanguageCode;
        }
        return new RBValidationError({
          message: `Failed validating field using regex record ${record} options ${options}`,
          displayErrors: [{detail: displayErrorDetail, meta: displayErrorMeta}],
        });
      }
      const hasValue = function (data) {
        return data !== '' &&
            data !== null &&
            data !== undefined &&
            (data?.length !== undefined && data.length > 0);
      }
      const evaluate = function (element, fieldName) {
        let value = _.get(element, fieldName);

        if (trimLeadingAndTrailingSpacesBeforeValidation) {
          value = _.trim(value);
        }

        if (!hasValue(value) && !allowNulls) {
          return false;
        } else if (!hasValue(value) && allowNulls) {
          // this is ok
        } else if (!textRegex(value)) {
          return false;
        }

        if (trimLeadingAndTrailingSpacesBeforeValidation) {
          _.set(element, fieldName, value);
        }

        return true;
      }

      // get the data
      const data = _.get(record, fieldDBName);

      // early checks
      if (!hasValue(data) && !allowNulls) {
        throw getError();
      }
      if (!hasValue(data) && allowNulls) {
        sails.log.debug(
            'validateFieldUsingRegex',
            'data value is null and value is allowed to be null',
            record,
            options);
        return record;
      }
      if (!_.isArray(data) && arrayObjFieldDBName) {
        throw getError();
      }
      if (_.isArray(data) && !arrayObjFieldDBName) {
        throw getError();
      }

      // evaluate the record field against the regex
      if (_.isArray(data)) {
        for (const row of data) {
          if (!evaluate(row, arrayObjFieldDBName)) {
            throw getError() ;
          }
        }
      } else {
        if (!evaluate(record, fieldDBName)) {
          throw getError();
        }
      }
      sails.log.debug(
          'validateFieldUsingRegex',
          'data value passed check',
          record,
          options);
      return record;
    }

    /**
     * Trigger function that will run a lodash template that can be used to validate a record.
     * The trigger expects the template to return an array of error objects of the format:
     *  {
     *   name: 'the field name that is in validation error',
     *   label: 'the human readable label for the field',
     *   error: 'optional error message'
     *  }
     *
     *  An empty array should be returned if no errors are found.
     *
     * @param oid
     * @param record
     * @param options
     * @returns
     */
    public async validateFieldsUsingTemplate(oid, record, options) {
      sails.log.verbose('validateFieldsUsingTemplate - enter');
      if (this.metTriggerCondition(oid, record, options) === "true") {

        sails.log.verbose('validateFieldsUsingTemplate - metTriggerCondition');


        const getErrorMessage = function (errorLanguageCode: string) {
          let baseErrorMessage = TranslationService.t(errorLanguageCode);
          return baseErrorMessage;
        }

        const addError = function (errorFieldList, name, label, errorLabel) {
          let errorField:any = {};
            _.set(errorField,'name', name);
            _.set(errorField,'label',getErrorMessage(label));
            let error = getErrorMessage(errorLabel);
            if(error != '') {
              _.set(errorField,'error',error);
            }
            errorFieldList.push(errorField);
        }

        let template = _.get(options,'template',"<% return []; %>");

        const imports = {
          moment: moment,
          numeral: numeral,
          _ : _,
          TranslationService: TranslationService
        }

        let altErrorMessage = _.get(options,'altErrorMessage',[]);

        if(_.isString(template)) {
          const compiledTemplate = _.template(template, imports);
          options.template = compiledTemplate;
          template = compiledTemplate;
        }

        const errorFieldList = template({oid:oid, record: record, options: options, addError: addError,
          getErrorMessage: getErrorMessage});


        const errorMap = {
                         altErrorMessage: altErrorMessage,
                         errorFieldList: errorFieldList
                       };

        if(!_.isEmpty(errorMap.errorFieldList)) {
          throw new RBValidationError({
            message: `Field validation using template failed: errorMap ${JSON.stringify(errorMap)}`,
            displayErrors: [{title: "Validation failed", meta: errorMap}]
          });
        }

        sails.log.debug('validateFieldsUsingTemplate data value passed check');
      }
      return record;
    }

    public async validateFieldMapUsingRegex(oid, record, options) {
      sails.log.verbose('validateFieldMapUsingRegex - enter');
      if (this.metTriggerCondition(oid, record, options) === "true") {

        sails.log.verbose('validateFieldMapUsingRegex - metTriggerCondition');

        // re-usable functions
        const textRegex = function (value, regexPattern, caseSensitive) {
          if(regexPattern == '') {
            return true;
          } else {
            let flags = '';
            if (!caseSensitive) {
              flags += 'i';
            }
            const re = new RegExp(regexPattern, flags);
            return re.test(value);
          }
        }
        const getError = function (errorLanguageCode: string) {
          let baseErrorMessage = TranslationService.t(errorLanguageCode);
          sails.log.error('validateFieldMapUsingRegex ' + baseErrorMessage);
          return baseErrorMessage;
        }
        const hasValue = function (data) {
          return data !== '' &&
              data !== null &&
              data !== undefined &&
              (data?.length !== undefined && data.length > 0);
        }
        const evaluate = function (element, fieldName, trim, allowNulls, regexPattern, caseSensitive) {
          let value = '';
          if(_.isString(element) && fieldName == ''){
            value = element;
          } else if(fieldName != '') {
            value = _.get(element, fieldName);
            sails.log.debug('validateFieldMapUsingRegex evaluate fieldName '+fieldName+' value '+value);
          }

          if (trim) {
            value = _.trim(value);
          }

          if (!hasValue(value) && !allowNulls) {
            return false;
          } else if (!hasValue(value) && allowNulls) {
            // this is ok
          } else if (!textRegex(value, regexPattern, caseSensitive)) {
            return false;
          }

          if (trim && _.isObject(element) && fieldName != '') {
            _.set(element, fieldName, value);
          }

          return true;
        }

        let fieldObjectList = _.get(options,'fieldObjectList',[]);
        let altErrorMessage = _.get(options,'altErrorMessage',[]);
        let errorMap = {
                         altErrorMessage: altErrorMessage,
                         errorFieldList: []
                       };

        sails.log.debug('validateFieldMapUsingRegex fieldObjectList '+JSON.stringify(fieldObjectList));

        for(let field of fieldObjectList) {
          // get the data
          const data = _.get(record, 'metadata.'+field.name);
          // caseSensitive default is true - is only false when set to bool false or string 'false'
          let caseSensitive = _.get(field, 'caseSensitive', true)?.toString() !== 'false';
          sails.log.debug('validateFieldMapUsingRegex field.allowNulls '+field.allowNulls);
          let allowNulls = _.get(field,'allowNulls',true);
          sails.log.debug('validateFieldMapUsingRegex allowNulls '+allowNulls);
          let trim = _.get(field,'trim',true);
          let regexPattern = _.get(field,'regexPattern','');

          sails.log.debug('validateFieldMapUsingRegex '+field.name+' data '+JSON.stringify(data));
          // early checks
          if (!hasValue(data) && !allowNulls) {
            let errorField:any = {};
            _.set(errorField,'name',field.name);
            _.set(errorField,'label',getError(field.label));
            let error = getError(field.errorLabel);
            if(error != '') {
              _.set(errorField,'error',error);
            }
            errorMap.errorFieldList.push(errorField);
            sails.log.debug('validateFieldMapUsingRegex !hasValue(data) && !allowNulls');
            continue;
          }

          // evaluate the record field against the regex
          if (_.isArray(data)) {
            for (const row of data) {
              let innerFieldName = _.get(field,'arrayObjFieldDBName','');
              if (!evaluate(row, innerFieldName, trim, allowNulls, regexPattern, caseSensitive)) {
                sails.log.debug('validateFieldMapUsingRegex evaluate arrayObjFieldDBName '+field.name);
                let errorField:any = {};
                _.set(errorField,'name',field.name);
                _.set(errorField,'label',getError(field.label));
                let error = getError(field.errorLabel);
                if(error != '') {
                  _.set(errorField,'error',error);
                }
                errorMap.errorFieldList.push(errorField);
              }
            }
          } else {
            if (!evaluate(data, '', trim, allowNulls, regexPattern, caseSensitive)) {
              sails.log.debug('validateFieldMapUsingRegex evaluate field.name '+field.name);
              let errorField:any = {};
              _.set(errorField,'name',field.name);
              _.set(errorField,'label',getError(field.label));
              let error = getError(field.errorLabel);
              if(error != '') {
                _.set(errorField,'error',error);
              }
              errorMap.errorFieldList.push(errorField);
            }
          }

        }

        sails.log.debug('validateFieldMapUsingRegex errorMap '+JSON.stringify(errorMap));

        if(!_.isEmpty(errorMap.errorFieldList)) {
          throw new RBValidationError({
            message: `Field map validation using regex failed: errorMap ${JSON.stringify(errorMap)}`,
            displayErrors: [{title: "Validation failed", meta: errorMap}]
          });
        }

        sails.log.debug('validateFieldMapUsingRegex data value passed check');
      }
      return record;
    }

    public async runTemplatesOnRelatedRecord(relatedOid, relatedRecord, options, user) {

      if (this.metTriggerCondition(relatedOid, relatedRecord, options) === "true") {

        sails.log.verbose('runTemplatesOnRelatedRecord - metTriggerCondition');
        sails.log.verbose(`runTemplatesOnRelatedRecord config: ${JSON.stringify(options.templates)}`);
        sails.log.verbose(`runTemplatesOnRelatedRecord to oid: ${relatedOid} with user: ${JSON.stringify(user)}`);

        let pathToRelatedOid = _.get(options,'pathToRelatedOid');
        let innerPathToRelatedOid = _.get(options,'innerPathToRelatedOid','');
        let runPreSaveTriggers = _.get(options,'runPreSaveTriggers',false);
        let runPostSaveTriggers = _.get(options,'runPostSaveTriggers',false);
        let parseObject = _.get(options, 'parseObject', false);
        let oidStringOrArray = _.get(relatedRecord,pathToRelatedOid,'');
        let record = null;
        let oidList = [];

        if(!_.isArray(oidStringOrArray) && _.isString(oidStringOrArray)) {
          oidList.push(oidStringOrArray);
        } else if (_.isArray(oidStringOrArray)) {
          if(innerPathToRelatedOid != '') {
            for(let oidObj of oidStringOrArray) {
              let tmpOid = _.get(oidObj,innerPathToRelatedOid,'');
              if(tmpOid != '' && _.isString(tmpOid)) {
                oidList.push(tmpOid);
              }
            }
          } else {
            for(let oid of oidStringOrArray) {
              if(_.isString(oid)) {
                oidList.push(oid);
              }
            }
          }
        }

        if(!_.isEmpty(oidList)) {
          for(let oid of oidList) {
            sails.log.verbose(`runTemplatesOnRelatedRecord trying to find related record with oid: ${oid}`);
            let tmplConfig = null;
            try {
              record = await RecordsService.getMeta(oid);
              if(_.isObject(record)) {
                sails.log.verbose(`runTemplatesOnRelatedRecord related record found and will run templates...`);
                _.each(options.templates, (templateConfig) => {
                  tmplConfig = templateConfig;
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
                  if (_.isString(templateConfig.template)) {
                    const compiledTemplate = _.template(templateConfig.template, templateImportsData);
                    templateConfig.template = compiledTemplate;
                  }
                  const data = templateConfig.template(templateData);
                  if (parseObject) {
                    let obj = JSON.parse(data);
                    _.set(record, templateConfig.field, obj);
                  } else {
                    _.set(record, templateConfig.field, data);
                  }
                });
                let brandId = _.get(record,'metaMetadata.brandId');
                const brand:BrandingModel = BrandingService.getBrandById(brandId);
                sails.log.verbose(`runTemplatesOnRelatedRecord Brand: ${JSON.stringify(brand)}`);
                await RecordsService.updateMeta(brand, oid, record, user, runPreSaveTriggers, runPostSaveTriggers);
              } else {
                sails.log.verbose(`runTemplatesOnRelatedRecord did't find related record using oid: ${oid} - object retrived is: ${JSON.stringify(record)}`);
              }
            } catch (e) {
              throw new RBValidationError({
                message: `Failed to run one of the string templates for oid ${oid} relatedOid ${relatedOid}: ${JSON.stringify(tmplConfig)}`,
                options: {cause: e},
                displayErrors: [{title: "Processing failed", meta: {oid: oid, relatedOid: relatedOid}}]
              });
            }
          }
        } else {
          sails.log.verbose(`runTemplatesOnRelatedRecord did't find related oid list: ${JSON.stringify(oidList)} - in specified path: ${pathToRelatedOid} - and inner path ${innerPathToRelatedOid}`);
        }
      }
      return relatedRecord;
    }
  }
}
module.exports = new Services.Trigger().exports();
