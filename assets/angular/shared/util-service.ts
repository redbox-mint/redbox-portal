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
import * as _ from "lodash-lib";
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
          itemResult = `${itemResult}${_.isEmpty(itemResult) ? '' : config.delim}${_.get(d, f)}`;
        });
        result.push(itemResult);
      } else {
        result = `${result}${_.isEmpty(result) ? '' : config.delim}${_.get(data, f)}`;
      }
    });
    return result;
  }
}
