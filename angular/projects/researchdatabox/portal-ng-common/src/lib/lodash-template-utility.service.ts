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
import { DateTime } from 'luxon';
import { get as _get, set as _set, extend as _extend, isEmpty as _isEmpty, isUndefined as _isUndefined, merge as _merge, trim as _trim, isNull as _isNull, orderBy as _orderBy, map as _map, find as _find, indexOf as _indexOf, isArray as _isArray, forEach as _forEach, join as _join, first as _first, template as _template, toLower as _toLower } from 'lodash-es';

/**
 * Utility functions to run and render loadash templates
 *
 *
 */
@Injectable({
  providedIn: 'platform'
})
export class LoDashTemplateUtilityService {
  presetMap: Record<string, Intl.DateTimeFormatOptions> = {
    DATE_SHORT: DateTime.DATE_SHORT,
    DATE_MED: DateTime.DATE_MED,
    DATE_MED_WITH_WEEKDAY: DateTime.DATE_MED_WITH_WEEKDAY,
    DATE_FULL: DateTime.DATE_FULL,
    DATE_HUGE: DateTime.DATE_HUGE,
    TIME_SIMPLE: DateTime.TIME_SIMPLE,
    TIME_WITH_SECONDS: DateTime.TIME_WITH_SECONDS,
    TIME_WITH_SHORT_OFFSET: DateTime.TIME_WITH_SHORT_OFFSET,
    TIME_WITH_LONG_OFFSET: DateTime.TIME_WITH_LONG_OFFSET,
    TIME_24_SIMPLE: DateTime.TIME_24_SIMPLE,
    TIME_24_WITH_SECONDS: DateTime.TIME_24_WITH_SECONDS,
    TIME_24_WITH_SHORT_OFFSET: DateTime.TIME_24_WITH_SHORT_OFFSET,
    TIME_24_WITH_LONG_OFFSET: DateTime.TIME_24_WITH_LONG_OFFSET,
    DATETIME_SHORT: DateTime.DATETIME_SHORT,
    DATETIME_MED: DateTime.DATETIME_MED,
    DATETIME_FULL: DateTime.DATETIME_FULL,
    DATETIME_HUGE: DateTime.DATETIME_HUGE,
    DATETIME_SHORT_WITH_SECONDS: DateTime.DATETIME_SHORT_WITH_SECONDS,
    DATETIME_MED_WITH_SECONDS: DateTime.DATETIME_MED_WITH_SECONDS,
    DATETIME_FULL_WITH_SECONDS: DateTime.DATETIME_FULL_WITH_SECONDS,
    DATETIME_HUGE_WITH_SECONDS: DateTime.DATETIME_HUGE_WITH_SECONDS
  };

  lodashWrapper: object = {
    get: _get,
    set: _set,
    isEmpty: _isEmpty,
    isUndefined: _isUndefined,
    trim: _trim,
    isNull: _isNull,
    orderBy: _orderBy,
    map: _map,
    find: _find,
    indexOf: _indexOf,
    isArray: _isArray,
    forEach: _forEach,
    join: _join,
    first: _first,
    merge: _merge,
    extend: _extend,
    template: _template,
    toLower: _toLower
  }

  public formatDate(date: Date, format: string): string {
    let dateTime = DateTime.fromJSDate(date);
    return dateTime.toFormat(format);
  }

  public formatDateLocale(date: Date, presetName?: string, locale?: string): string {
    let dateTime = DateTime.fromJSDate(date);
    
    if (locale != undefined) {
      dateTime = dateTime.setLocale(locale);
    } else {
      dateTime = dateTime.setLocale(navigator.language);
    }

    if (presetName != undefined) {
      const preset: Intl.DateTimeFormatOptions = this.presetMap[presetName]
      return dateTime.toLocaleString(preset);
    }
    return dateTime.toLocaleString();
  }

  public parseDateString(dateString: string, format?: string): Date {
    if (format != undefined) {
      const dt = DateTime.fromFormat(dateString, format);
      return dt.toJSDate();
    }
    return new Date(Date.parse(dateString));
  }

  public numberFormat(number: number, locale: string = '', options: any = undefined): string {
    if (_isEmpty(locale)) {
      return new Intl.NumberFormat().format(number);
    } else {
      return new Intl.NumberFormat(locale, options).format(number);
    }
  }

  public runTemplate(data: any, config: any, additionalImports: any = {}, field: any = undefined, model: any = undefined) {
    // TO-DO: deprecate numberFormat as it can be accessed via util
    let imports = _extend({ data: data, config: config, DateTime: DateTime, numberFormat: this.numberFormat, field: field, model: model, util: this, _: this.lodashWrapper }, this);
    imports = _merge(imports, additionalImports);
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
}
