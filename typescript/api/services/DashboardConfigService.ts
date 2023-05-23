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
import { DashboardConfigModel } from '../typemodel/DashboardConfig'

declare var sails: Sails;
declare var DashboardConfig: Model;
declare var _;

export module Services {

  /**
   * Dashboard Config functions...
   */
  export class DashboardConfigs extends services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'create',
      'get',
      'getAll'
    ];

    protected dashboardTableConfigs;

    public bootstrap = (defBrand) => {
      let startQ = DashboardConfig.find({branding:defBrand.id});
      if (sails.config.appmode.bootstrapAlways) {
        startQ = DashboardConfig.destroy({branding:defBrand.id});
      }
      return super.getObservable(startQ).flatMap(dashboardTableConfigs => {
        if (_.isUndefined(dashboardTableConfigs)) {
          dashboardTableConfigs = [];
        }
        sails.log.verbose(`Dashboard Table Configs found: ${dashboardTableConfigs} and boostrapAlways set to: ${sails.config.appmode.bootstrapAlways}`);
        if (_.isEmpty(dashboardTableConfigs)) {
          var dashTypes = [];
          sails.log.verbose("Bootstrapping DashboardTypes definitions... ");
          _.forOwn(sails.config.dashboardconfig, (config, dashboardConfigName) => {
            const dashboardTableConfig: DashboardConfigModel = new DashboardConfigModel(dashboardConfigName, config)
            dashboardTableConfigs.push();
            var obs = this.create(defBrand, dashboardTableConfig);
            dashTypes.push(obs);
          });
          this.dashboardTableConfigs = dashboardTableConfigs;
          return Observable.zip(...dashTypes);
        } else {
          sails.log.verbose("Default DashboardTypes definition(s) exist.");
          sails.log.verbose(JSON.stringify(dashboardTableConfigs));
          this.dashboardTableConfigs = dashboardTableConfigs;
          return Observable.of(dashboardTableConfigs);
        }
      });
    }

    public create(brand,config:DashboardConfigModel) {
      sails.log.verbose(JSON.stringify(config));
      return super.getObservable(DashboardConfig.create(config.getSailsModel(brand.id)));
    }

    public get(brand, name) {
      const criteria:any = {where: {branding: brand.id, name: name}};
      return super.getObservable(DashboardConfig.findOne(criteria));
    }

    public getAll(brand) {
      const criteria:any = {where: {branding: brand.id}};
      return super.getObservable(DashboardConfig.find(criteria));
    }
  }
}

module.exports = new Services.DashboardConfigs().exports();
