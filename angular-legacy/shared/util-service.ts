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

import {Injectable} from '@angular/core';
import * as _ from "lodash";
import * as moment from 'moment';
import numeral from 'numeral';
/**
 * Utility service...
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Injectable()
export class UtilityService {

  compiledTemplateMap: any = {};
  /**
   * returns concatenated string
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   * @param  {any} config
   * @return {string}
   */
  public concatenate(data: any, config: any) {
    let result: any = '';
    _.each(config.fields, (f: any) => {
      if (_.isArray(data)) {
        result = [];
        let itemResult = '';
        _.each(data, (d: any) => {
          const fldData = _.get(d, f);
          // checking if field has data, otherwise will be skipping concat
          if (fldData) {
            itemResult = `${itemResult}${_.isEmpty(itemResult) ? '' : config.delim}${fldData}`;
          }
        });
        result.push(itemResult);
      } else {
        const fldData = _.get(data, f);
        if (fldData) {
          result = `${result}${_.isEmpty(result) ? '' : config.delim}${fldData}`;
        }
      }
    });
    return result;
  }

  /**
   * check that all the values to match have values for a given object
   * 
   * Author: <a href='https://github.com/andrewbrazzatti' target='_blank'>Andrew Brazzatti</a>
   * @param  {any} valueObject
   * @param  {any} fieldsToMatch
   * @return {boolean}
   */
  private checkData(valueObject: any, fieldsToMatch: any, fieldsToMatchMustNotBeEmpty: boolean) {
    let dataOk = true;
    for (let fieldToMatch of fieldsToMatch) {
      let emittedValueToMatch = _.get(valueObject, fieldToMatch);
      if(emittedValueToMatch === undefined || emittedValueToMatch === null || _.isUndefined(emittedValueToMatch)){
        dataOk = false;
      } else if(fieldsToMatchMustNotBeEmpty) {
        if(emittedValueToMatch == '' || _.isEmpty(emittedValueToMatch)) {
          dataOk = false;
        }
      }
    }
    return dataOk;
  }

  /**
   * check a given object is not already present in the container list
   * 
   * Author: <a href='https://github.com/andrewbrazzatti' target='_blank'>Andrew Brazzatti</a>
   * @param  {any} valueObject
   * @param  {any} fieldsToMatch
   * @param  {any} fieldValues
   * @return {boolean}
   */
  private checkConcatReq(valueObject: any, fieldsToMatch: any, fieldValues: any) {
    let concatReq = true;
    for (let fieldValue of fieldValues) {
      for (let fieldToMatch of fieldsToMatch) {
        let fieldValueToMatch = _.get(fieldValue, fieldToMatch); 
        let emittedValueToMatch = _.get(valueObject, fieldToMatch);
        if(_.isEqual(fieldValueToMatch,emittedValueToMatch)) {
          concatReq = false;
        }
      }
    }
    return concatReq;
  }

  /**
   * Merges emitted object into the subscriber's array of objects if the emitted object is not present.
   *
   * Author: <a href='https://github.com/andrewbrazzatti' target='_blank'>Andrew Brazzatti</a>
   * @param  {any} data
   * @param  {any} config
   * @param  {any} field
   * @return {array}
   */
  public getMergedObjectAsArray(data: any, config: any, field: any) {
    const fieldsToMatch = config.fieldsToMatch;
    const fieldsToSet = config.fieldsToSet;
    const templateObject = config.templateObject;
    let fieldValues = _.clone(field.formModel.value);
    const fieldsToMatchMustNotBeEmpty = _.get(config, 'fieldsToMatchMustNotBeEmpty', false);
    fieldValues = this.mergeObjectIntoArray(data,fieldValues, fieldsToMatch, fieldsToSet, templateObject, fieldsToMatchMustNotBeEmpty);

    return fieldValues;
  }


  public logSubscribeDebugToConsole(data: any, config: any, field: any) {
    console.log("Logging subscription information" )
    console.log("The data is:" )
    console.log(JSON.stringify(data))
    console.log("Config is:" )
    console.log(JSON.stringify(config))
    console.log("Field is:" )
    console.log(JSON.stringify(field))
    return data;
  }

  /**
   * Merges emitted array of object into the subscriber's array of objects if the emitted object is not present.
   *
   * @param  {any} data
   * @param  {any} config
   * @param  {any} field
   * @return {array}
   */
   public getMergedObjectArrayAsArray(data: any, config: any, field: any) {
    const fieldsToMatch = config.fieldsToMatch;
    const fieldsToSet = config.fieldsToSet;
    const templateObject = config.templateObject;
    const fieldsToMatchMustNotBeEmpty = _.get(config, 'fieldsToMatchMustNotBeEmpty', false);
    let fieldValues = _.clone(field.formModel.value);

    for(let dataObject of data) {
      fieldValues = this.mergeObjectIntoArray(dataObject, fieldValues, fieldsToMatch, fieldsToSet, templateObject, fieldsToMatchMustNotBeEmpty);
    }
    return fieldValues;
  }

  private mergeObjectIntoArray(data, fieldValues, fieldsToMatch, fieldsToSet, templateObject, fieldsToMatchMustNotBeEmpty){
    let wrappedData = data;
    if(!_.isArray(data)) {
      wrappedData = [data];
    }
    
    for (let emittedDataValue of wrappedData) {
      //There are cases where the emitter may send null values just after the field  
      //gets cleared therefore need to checkDataOk if any of the fields to match are  
      //undefined not enter the if block and the same value will be sent back to the 
      //subscriber field 
      let checkDataOk = this.checkData(emittedDataValue,fieldsToMatch, fieldsToMatchMustNotBeEmpty);
      if(checkDataOk){
        let concatReq = this.checkConcatReq(emittedDataValue,fieldsToMatch,fieldValues);
        if(concatReq) {
          let value = _.clone(templateObject);
          for (let fieldToSet of fieldsToSet) {
              let val = _.get(emittedDataValue, fieldToSet); 
              _.set(value, fieldToSet, val);
          }
          //If there is only one item in fieldValues array it may be empty and must be re-used 
          //if there is more than one item in the array it's too cumbersome to manage all  
          //scenarios and edge cases therefore it's better to add a new item to the array 
          if(fieldValues.length == 1) {
            let checkFieldValuesDataOk = this.checkData(fieldValues[0],fieldsToMatch, fieldsToMatchMustNotBeEmpty);
            if(checkFieldValuesDataOk) {
              fieldValues.push(value);
            } else {
              fieldValues = [value];
            }
          } else {
            fieldValues.push(value);
          }
          console.log(fieldValues);
        }
      }
    }
    return fieldValues;
  }

  /**
   * returns a property from the provided object.
   *
   * Author: <a href='https://github.com/andrewbrazzatti' target='_blank'>Andrew Brazzatti</a>
   * @param  {any} config
   * @return {string}
   */
  public getPropertyFromObject(data: any, config: any) {
    const fieldPath = config.field;
    return _.get(data, fieldPath);
  }

  /**
   * returns a property as Array of 1 item from the provided object.
   *
   * Author: <a href='https://github.com/mattRedBox' target='_blank'>Matt Mulholland</a>
   * @param data
   * @param config
   */
  public getPropertyAsArrayFromObject(data: any, config: any) {
    return [this.getPropertyFromObject(data, config)];
  }

  /**
   * returns value based on mapping
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   * @param {any} data
   * @param  {any} config - dict of field: field path of data, mapping - array of dict with 'key', the value and the actual mapping value 'val', 'default' - the value if there's no match
   * @return {any}
   */
  public getPropertyFromObjectMapping(data: any, config: any) {
    const fieldPath = config.field;
    const val = _.isUndefined(fieldPath) ? data : _.get(data, fieldPath);
    const foundMapping = _.find(config.mapping, (mapEntry) => {
      return `${mapEntry.key}` == `${val}`;
    });
    return foundMapping ? foundMapping.value : config.default;
  }

  /**
   * returns true if value is not null, undefined, empty
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   * @param {any} data
   * @param  {any} config
   * @return {string}
   */
  public hasValue(data: any, config: any = null) {
    return !_.isEmpty(data) && !_.isUndefined(data) && !_.isNull(data);
  }

  /**
   * returns an array of concatenated values
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   * @param {any} data
   * @param  {any} config - dict of field: array of field paths to concat
   * @return {string}
   */
  public getPropertyFromObjectConcat(data: any, config: any) {
    let values = [];
    _.each(config.field, (f) => {
      values.push(_.get(data, f));
    });
    return _.concat([], ...values);
  }


  /**
   * Splits a string into an array by it's delimiter
   *
   * Author: <a href='https://github.com/andrewbrazzatti' target='_blank'>Andrew Brazzatti</a>
   * @param {any} data
   * @param  {any} config - The delimiter
   * @return {string}
   */
  public splitStringToArray(data: any, config: any) {
    let delim = config.delim;
    let field = config.field;
    let value = data;
    if (field) {
      value = _.get(data, field);
    }
    return value.split(delim);
  }

  /**
   * Splits a string of arrays into an array by it's delimiter
   *
   * Author: <a href='https://github.com/moisbo' target='_blank'>Moises Sacal Bonequi</a>
   * @param {any} data
   * @param  {any} config - The delimiter
   * @return {array}
   */
  public splitArrayStringsToArray(data: any, config: any) {
    let regex = config.regex || ',';
    let flags = config.flags || 'g';
    const reg = new RegExp(regex, flags);
    let regexTrail = config.regexTrail || '(^,)|(,$)';
    let flagsTrail = config.flagsTrail || 'g';
    const regTrail = new RegExp(regexTrail, flagsTrail);
    let field = config.field;
    let value = data;
    if (field) {
      value = _.get(data, field);
    }
    const values = [];
    _.each(value, (v) => {
      if (v) {
        v = v.replace(regTrail, '');
      }
      values.push(v.split(reg).map(item => item.trim()));
    });
    return _.concat([], ...values);
  }

  /**
   * Splits a string of arrays into an array by it's delimiter
   *
   * Author: <a href='https://github.com/moisbo' target='_blank'>Moises Sacal Bonequi</a>
   * @param {any} data
   * @param  {any} config - The delimiter
   * @return {array}
   */
  public getFirstofArray(data: any, config: any) {
    let delim = config.delim;
    let field = config.field;
    let value = data;
    if (field) {
      value = _.get(data, field);
    }
    return _.first(value);
  }

  /**
   * Format date with moment from origin to target
   *
   * Author: <a href='https://github.com/moisbo' target='_blank'>Moises Sacal Bonequi</a>
   * @param {any} data
   * @param  {any} config - field, formatOrigin, formatTarget
   * @return {array}
   */
  public convertToDateFormat(data:any, config:any) {
    let field = config.field;
    let formatOrigin = config.formatOrigin || 'DD-MMM-YY';
    let formatTarget = config.formatTarget || 'YYYY-MM-DD';
    let value = data;

    if(field) {
      value = _.get(data,field);
    }
    const converted = moment(value, formatOrigin).format(formatTarget);
    console.log(`convertToDateFormat ${converted}`);
    return converted;
  }

  public joinArray(data: any, config: any, fieldName: string = null, fieldSeparator: string = null) {
    return _.join(_.get(data, fieldName ? fieldName : config.field), fieldSeparator ? fieldSeparator : config.separator);
  }

  public runTemplate(data: any, config: any, field: any = undefined) {
    const imports = _.extend({data: data, config: config, moment: moment, numeral:numeral, field: field}, this);
    const templateData = imports;
    let template = this.compiledTemplateMap[config.template]
    if(template === undefined) {
      template = _.template(config.template);
      this.compiledTemplateMap[config.template] = template;
    }
    const templateRes = template(templateData);
    // added ability to parse the string template result into JSON
    // requirement: template must return a valid JSON string object
    if (config.json == true && !_.isEmpty(templateRes)) {
      return JSON.parse(templateRes);
    }
    // Added to allow arbitrary execution of field functions that won't change the value of a field
    return config.returnUndefinedOnEmpty && (_.isUndefined(templateRes) || _.isEmpty(templateRes)) ? undefined : templateRes;
  }
}
