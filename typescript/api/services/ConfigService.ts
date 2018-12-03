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
import services = require('../core/CoreService.js');
import {Sails, Model} from "sails";
declare var sails: Sails;
declare var _;
declare var CacheEntry: Model;

export module Services {
  /**
   * Dynamic Configuration related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Config extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'getBrand'
    ];

    public getBrand(brandName:string, configBlock:string) {
      let configVal = sails.config[configBlock][brandName];
      if (_.isUndefined(configVal)) {
        brandName = sails.config.auth.defaultBrand;
        configVal = sails.config[configBlock][brandName];
      }
      return configVal;
    }

  }
}
module.exports = new Services.Config().exports();
