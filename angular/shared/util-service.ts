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

import { Injectable } from '@angular/core';
import * as _ from "lodash";
/**
 * Utility service...
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Injectable()
export class UtilityService {

  /**
   * returns concatenated string
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   * @param  {any} config
   * @return {string}
   */
  public concatenate(data: any, config: any) {
    let result:any = '';
    _.each(config.fields, (f:any) => {
      if (_.isArray(data)) {
        result = [];
        let itemResult = '';
        _.each(data, (d:any) => {
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
   * returns a property from the provided object.
   *
   * Author: <a href='https://github.com/andrewbrazzatti' target='_blank'>Andrew Brazzatti</a>
   * @param  {any} config
   * @return {string}
   */
  public getPropertyFromObject(data: any, config: any) {
    const fieldPath = config.field;
    return _.get(data,fieldPath);
  }
  /**
   * returns value based on mapping
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   * @param {any} data
   * @param  {any} config - dict of field: field path of data, mapping - array of dict with 'key', the value and the actual mapping value 'val', 'default' - the value if there's no match
   * @return {any}
   */
  public getPropertyFromObjectMapping(data: any, config:any) {
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
  public hasValue(data: any, config:any = null) {
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
  public getPropertyFromObjectConcat(data:any, config:any) {
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
  public splitStringToArray(data:any, config:any) {
    let delim = config.delim;
    let field = config.field;
    let value = data;
    if(field) {
      value = _.get(data,field);
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
   public splitArrayStringsToArray(data:any, config:any) {
     let regex = config.regex;
     let flags = config.flags;
     const reg = new RegExp(regex, flags);
     let field = config.field;
     let value = data;
     if(field) {
       value = _.get(data,field);
     }
     const values = [];
     _.each(value, (v) => {
       values.push(v.split(reg));
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
    public getFirstofArray(data:any, config:any) {
      let delim = config.delim;
      let field = config.field;
      let value = data;
      if(field) {
        value = _.get(data,field);
      }
      return _.first(value);
    }
}
