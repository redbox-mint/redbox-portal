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

import { Injectable, computed, Signal, Inject } from '@angular/core';
import { get as _get, isEmpty as _isEmpty, isUndefined as _isUndefined, set as _set, isArray as _isArray, clone as _clone, each as _each, isEqual as _isEqual, isNull as _isNull, first as _first, join as _join, extend as _extend, template as _template, concat as _concat, find as _find, trim as _trim } from 'lodash-es';
import { DateTime } from 'luxon';
import { Initable } from './initable.interface';
import { LoggerService } from './logger.service';
import { guessType } from "@researchdatabox/sails-ng-common";
/**
 * Utility service...
 *
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 */
@Injectable()
export class UtilityService {

  private dynamicImportCache: Map<string, any> = new Map();

  constructor(
    @Inject(LoggerService) private loggerService: LoggerService
  ) { }

  /**
   * returns concatenated string
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   * @param  {any} config
   * @return {string}
   */
  public concatenate(data: any, config: any) {
    let result: any = '';
    _each(config.fields, (f: any) => {
      if (_isArray(data)) {
        result = [];
        let itemResult = '';
        _each(data, (d: any) => {
          const fldData = _get(d, f);
          // checking if field has data, otherwise will be skipping concat
          if (fldData) {
            itemResult = `${itemResult}${_isEmpty(itemResult) ? '' : config.delim}${fldData}`;
          }
        });
        result.push(itemResult);
      } else {
        const fldData = _get(data, f);
        if (fldData) {
          result = `${result}${_isEmpty(result) ? '' : config.delim}${fldData}`;
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
  private checkData(valueObject: any, fieldsToMatch: any) {
    let dataOk = true;
    for (let fieldToMatch of fieldsToMatch) {
      let emittedValueToMatch = _get(valueObject, fieldToMatch);
      if (emittedValueToMatch === undefined || emittedValueToMatch === null || _isUndefined(emittedValueToMatch)) {
        dataOk = false;
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
        let fieldValueToMatch = _get(fieldValue, fieldToMatch);
        let emittedValueToMatch = _get(valueObject, fieldToMatch);
        if (_isEqual(fieldValueToMatch, emittedValueToMatch)) {
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
    let fieldValues = _clone(field.formModel.value);
    fieldValues = this.mergeObjectIntoArray(data, fieldValues, fieldsToMatch, fieldsToSet, templateObject);

    return fieldValues;
  }


  public logSubscribeDebugToConsole(data: any, config: any, field: any) {
    this.loggerService.log("Logging subscription information")
    this.loggerService.log("The data is:")
    this.loggerService.log(JSON.stringify(data))
    this.loggerService.log("Config is:")
    this.loggerService.log(JSON.stringify(config))
    this.loggerService.log("Field is:")
    this.loggerService.log(JSON.stringify(field))
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
    let fieldValues = _clone(field.formModel.value);

    for (let dataObject of data) {
      fieldValues = this.mergeObjectIntoArray(dataObject, fieldValues, fieldsToMatch, fieldsToSet, templateObject);
    }
    return fieldValues;
  }

  private mergeObjectIntoArray(data: any, fieldValues: any, fieldsToMatch: any, fieldsToSet: any, templateObject: any) {
    let wrappedData = data;
    if (!_isArray(data)) {
      wrappedData = [data];
    }

    for (let emittedDataValue of wrappedData) {
      //There are cases where the emitter may send null values just after the field
      //gets cleared therefore need to checkDataOk if any of the fields to match are
      //undefined not enter the if block and the same value will be sent back to the
      //subscriber field
      let checkDataOk = this.checkData(emittedDataValue, fieldsToMatch);
      if (checkDataOk) {
        let concatReq = this.checkConcatReq(emittedDataValue, fieldsToMatch, fieldValues);
        if (concatReq) {
          let value = _clone(templateObject);
          for (let fieldToSet of fieldsToSet) {
            let val = _get(emittedDataValue, fieldToSet);
            _set(value, fieldToSet, val);
          }
          //If there is only one item in fieldValues array it may be empty and must be re-used
          //if there is more than one item in the array it's too cumbersome to manage all
          //scenarios and edge cases therefore it's better to add a new item to the array
          if (fieldValues.length == 1) {
            let checkFieldValuesDataOk = this.checkData(fieldValues[0], fieldsToMatch);
            if (checkFieldValuesDataOk) {
              fieldValues.push(value);
            } else {
              fieldValues = [value];
            }
          } else {
            fieldValues.push(value);
          }
          this.loggerService.log(fieldValues);
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
    return _get(data, fieldPath);
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
    const val = _isUndefined(fieldPath) ? data : _get(data, fieldPath);
    const foundMapping = _find(config.mapping, (mapEntry: any) => {
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
    return !_isEmpty(data) && !_isUndefined(data) && !_isNull(data);
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
    const result: any[] = [];
    _each(config.field, (f: any) => {
      const val = _get(data, f);
      if (_isArray(val)) {
        for (const v of val) {
          if (v !== undefined && v !== null) {
            result.push(v);
          }
        }
      } else if (val !== undefined && val !== null) {
        result.push(val);
      }
    });
    return result;
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
      value = _get(data, field);
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
      value = _get(data, field);
    }
    const values: any = [];
    _each(value, (v: any) => {
      if (v) {
        v = v.replace(regTrail, '');
      }
      values.push(v.split(reg).map((item: any) => item.trim()));
    });
    return _concat([], ...values);
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
      value = _get(data, field);
    }
    return _first(value);
  }

  /**
   * Format date with moment from origin to target
   *
   * Author: <a href='https://github.com/moisbo' target='_blank'>Moises Sacal Bonequi</a>
   * @param {any} data
   * @param  {any} config - field, formatOrigin, formatTarget
   * @return {array}
   */
  public convertToDateFormat(data: any, config: any) {
    let field = config.field;
    let formatOrigin = config.formatOrigin || 'DD-MMM-YY';
    let formatTarget = config.formatTarget || 'YYYY-MM-DD';
    let value = data;

    if (field) {
      value = _get(data, field);
    }
    const converted = DateTime.fromFormat(value, formatOrigin).toFormat(formatTarget);
    this.loggerService.log(`convertToDateFormat ${converted}`);
    return converted;
  }

  public joinArray(data: any, config: any, fieldName?: string, fieldSeparator?: string) {
    return _join(_get(data, fieldName ? fieldName : config.field), fieldSeparator ? fieldSeparator : config.separator);
  }

  public numberFormat(number: number, locale: string = '', options: any = undefined): string {
    if (_isEmpty(locale)) {
      return new Intl.NumberFormat().format(number);
    } else {
      return new Intl.NumberFormat(locale, options).format(number);
    }
  }

  public runTemplate(data: any, config: any, field: any = undefined) {
    const imports = _extend({ data: data, config: config, DateTime: DateTime, numberFormat: this.numberFormat, field: field }, this);
    const templateData = { imports: imports };
    const template = _template(config.template, templateData);
    const templateRes = template();
    // added ability to parse the string template result into JSON
    // requirement: template must return a valid JSON string object
    if (config.json == true && !_isEmpty(templateRes)) {
      return JSON.parse(templateRes);
    }
    return templateRes;
  }

  /**
   * Waits for all dependent objects to initialise before proceeding.
   */
  public async waitForDependencies(deps: Initable[]) {
    for (let dep of deps) {
      await dep.waitForInit();
    }
  }

  /**
   * Utility function to ensure a non-empty string value from signals. Allows for trimming of whitespace and arbitrary chars around strings, and default value when empty, i.e. zero length.
   *
   * @param source
   * @param defaultValue
   * @param charsToTrim
   * @returns
   */
  trimStringSignal(source: Signal<string>, defaultValue: string = '', charsToTrim: string | undefined = undefined): Signal<string> {
    return computed(() => {
      // get the source and convert it to a string (use nullish coalescing to convert null & undefined to empty string)
      const value = source()?.toString() ?? '';
      // return the trimmed string, or the default if the resulting string is falsy (logical OR e.g. "", 0, false, etc)
      return _trim(value, charsToTrim) || defaultValue;
    });
  }

  /**
   * Dynamically import the javascript file at the url build from the branding, portal, and path parts.
   * @param brandingAndPortalUrl The branding and portal url.
   * @param urlPath The path parts.
   * @param params The query string parts.
   */
  public async getDynamicImport(brandingAndPortalUrl: string, urlPath: string[], params?: { [key: string]: any }) {
    if (!brandingAndPortalUrl) {
      throw new Error("Must provide brandingAndPortalUrl");
    }
    const path = (urlPath || []).join('/');
    const rawUrl = `${brandingAndPortalUrl}/${path}`;

    if (this.dynamicImportCache.has(rawUrl)) {
      this.loggerService.debug(`getDynamicImport returning cached module for ${rawUrl}`);
      return this.dynamicImportCache.get(rawUrl);
    }

    this.loggerService.debug(`getDynamicImport rawUrl ${rawUrl}`);
    const url = new URL(`${brandingAndPortalUrl}/${path}`);

    const ts = new Date().getTime().toString();
    url.searchParams.set('ts', ts);
    url.searchParams.set('apiVersion', "2.0");

    Object.entries(params ?? {}).forEach(([key, value]) => {
      // Remove any existing url param with matching key, set to the key value pair in params.
      if (guessType(value) === "object") {
        url.searchParams.set(key, JSON.stringify(value));
      } else if (guessType(value) === "array") {
        // Remove any existing param key, and append each array entry as a separate param.
        url.searchParams.delete(key);
        (value as Array<unknown>).forEach(val => url.searchParams.append(key, String(val)));
      } else {
        // For any other type, convert to string.
        url.searchParams.set(key, String(value));
      }
    });

    const module = await import(url.toString());
    this.dynamicImportCache.set(rawUrl, module);
    return module;
  }

  public clearDynamicImportCache() {
    this.dynamicImportCache.clear();
  }

  public formFieldConfigName(compMapEntry: { compConfigJson?: { name?: string }, name?: string } | undefined, defaultName?: string) {
    return compMapEntry?.compConfigJson?.name || compMapEntry?.name || defaultName || "";
  }
}
