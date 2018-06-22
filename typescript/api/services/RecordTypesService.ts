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
declare var RecordType: Model;
declare var _this;

export module Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class RecordTypes extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'create',
      'get',
      'getAll',
      'getAllCache'
    ];

    protected recordTypes;

    public bootstrap = (defBrand) => {
      return super.getObservable(RecordType.find({branding:defBrand.id})).flatMap(recordTypes => {
        if (_.isEmpty(recordTypes)) {
          var rTypes = [];
          sails.log.verbose("Bootstrapping record type definitions... ");
          _.forOwn(sails.config.recordtype, (config, recordType) => {
            recordTypes.push(recordType);
            var obs = this.create(defBrand, recordType, config);
            rTypes.push(obs);
          });
          this.recordTypes = recordTypes;
          return Observable.zip(...rTypes);
        } else {
          sails.log.verbose("Default recordTypes definition(s) exist.");
          sails.log.verbose(JSON.stringify(recordTypes));
          this.recordTypes = recordTypes;
          return Observable.of(recordTypes);
        }
      });
    }

    public create(brand, name, config) {
      return super.getObservable(RecordType.create({
        name: name,
        branding: brand.id,
        packageType: config.packageType,
        searchFilters: config.searchFilters,
        hooks: config.hooks,
        transferResponsibility: config.transferResponsibility,
        relatedTo: config.relatedTo
      }));
    }

    public get(brand, name, fields:any[]=null) {
      const criteria:any = {where: {branding: brand.id, name: name}};
      if (fields) {
        criteria.select = fields;
      }
      return super.getObservable(RecordType.findOne(criteria));
    }

    public getAll(brand, fields:any[] = null) {
      const criteria:any = {where: {branding: brand.id}};
      if (fields) {
        criteria.select = fields;
      }
      return super.getObservable(RecordType.find(criteria));
    }

    public getAllCache() {
      return this.recordTypes;
    }
  }
}
module.exports = new Services.RecordTypes().exports();
