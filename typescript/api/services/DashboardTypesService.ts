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
declare var DashboardType: Model;
declare var _;

export module Services {

  /**
   * Dashboard Types related functions...
   */
  export class DashboardTypes extends services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'create',
      'get',
      'getAll'
    ];

    protected dashboardTypes;

    public bootstrap = (defBrand) => {
      let startQ = DashboardType.find({branding:defBrand.id});
      if (sails.config.appmode.bootstrapAlways) {
        startQ = DashboardType.destroy({branding:defBrand.id});
      }
      return super.getObservable(startQ).flatMap(dashboardTypes => {
        if (_.isUndefined(dashboardTypes)) {
          dashboardTypes = [];
        }
        sails.log.verbose(`DashboardTypes found: ${dashboardTypes} and boostrapAlways set to: ${sails.config.appmode.bootstrapAlways}`);
        if (_.isEmpty(dashboardTypes)) {
          var dashTypes = [];
          sails.log.verbose("Bootstrapping DashboardTypes definitions... ");
          _.forOwn(sails.config.dashboardtype, (config, dashboardType) => {
            dashboardTypes.push(dashboardType);
            var obs = this.create(defBrand, dashboardType, config);
            dashTypes.push(obs);
          });
          this.dashboardTypes = dashboardTypes;
          return Observable.zip(...dashTypes);
        } else {
          sails.log.verbose("Default DashboardTypes definition(s) exist.");
          sails.log.verbose(JSON.stringify(dashboardTypes));
          this.dashboardTypes = dashboardTypes;
          return Observable.of(dashboardTypes);
        }
      });
    }

    public create(brand, name, config) {

      sails.log.verbose(JSON.stringify(config));

      return super.getObservable(DashboardType.create({
        name: name,
        branding: brand.id,
        searchFilters: config.searchFilters,
        formatRules: config.formatRules,
        searchable: config.searchable
      }));
    }

    public get(brand, name) {
      const criteria:any = {where: {branding: brand.id, name: name}};
      return super.getObservable(DashboardType.findOne(criteria));
    }

    public getAll(brand) {
      const criteria:any = {where: {branding: brand.id}};
      return super.getObservable(DashboardType.find(criteria));
    }
  }
}
module.exports = new Services.DashboardTypes().exports();
