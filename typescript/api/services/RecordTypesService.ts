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
import {Services as services}   from '@researchdatabox/redbox-core-types';
import {Sails, Model} from "sails";

declare var sails: Sails;
declare var RecordType: Model;
declare var _this;
declare var _;

export module Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class RecordTypes extends services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'create',
      'get',
      'getAll',
      'getAllCache'
    ];

    protected recordTypes;

    public async bootstrap (defBrand):Promise<any> {
      let recordTypes = await RecordType.find({branding:defBrand.id});
      if (sails.config.appmode.bootstrapAlways) {
        await RecordType.destroy({branding:defBrand.id});
        recordTypes = null;
      }
        if (_.isUndefined(recordTypes)) {
          recordTypes = [];
        }
        sails.log.debug(`RecordTypes found: ${recordTypes} and boostrapAlways set to: ${sails.config.appmode.bootstrapAlways}`);
        if (_.isEmpty(recordTypes)) {
          // var rTypesObs = [];
          sails.log.verbose("Bootstrapping record type definitions... ");
          // _.forOwn(sails.config.recordtype, (config, recordType) => {
          //   recordTypes.push(recordType);
          //   var obs = this.create(defBrand, recordType, config);
          //   rTypesObs.push(obs);
          // });

          this.recordTypes = recordTypes;
          let rTypes = [];
          for(let recordType in sails.config.recordtype) {
            let config = sails.config.recordtype[recordType];
            rTypes.push(await this.create(defBrand, recordType, config).toPromise())
          }    
          return rTypes;
        } 
          sails.log.verbose("Default recordTypes definition(s) exist.");
          sails.log.verbose(JSON.stringify(recordTypes));
          this.recordTypes = recordTypes;
          return recordTypes;
    }

    public create(brand, name, config) {
      
      let searchCore = _.get(sails.config.solr.cores,'default.options.core','redbox');
      if(config.searchCore) {
        searchCore = config.searchCore;
      }

      return super.getObservable(RecordType.create({
        name: name,
        branding: brand.id,
        packageType: config.packageType,
        searchCore: searchCore,
        searchFilters: config.searchFilters,
        hooks: config.hooks,
        transferResponsibility: config.transferResponsibility,
        relatedTo: config.relatedTo,
        searchable: config.searchable
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
