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
declare var WorkspaceType: Model;
declare var _this;

export module Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/moisbo' target='_blank'>moisbo</a>
   *
   */
  export class WorkspaceTypes extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'create',
      'get',
      'getOne'
    ];

    public bootstrap = (defBrand) => {
      return super.getObservable(WorkspaceType.destroy({branding: defBrand.id})).flatMap(whatever => {
        sails.log.debug('WorkspaceTypes::Bootstrap');
        sails.log.debug(sails.config.workspacetype);
         let workspaceTypes = [];
        if (!_.isEmpty(sails.config.workspacetype)) {
          var wTypes = [];
          sails.log.verbose("Bootstrapping workspace type definitions... ");
          _.forOwn(sails.config.workspacetype, (config, workspaceType) => {
            workspaceTypes.push(workspaceType);
            var obs = this.create(defBrand, config);
            wTypes.push(obs);
          });
          return Observable.zip(...wTypes);
        } else {
          sails.log.verbose("Default or no workspaceTypes definition(s).");
          return Observable.of('');
        }
      });
    }

    public create(brand, workspaceType) {
      return super.getObservable(
        WorkspaceType.create({
          name: workspaceType['name'],
          label: workspaceType['label'],
          branding: brand.id,
          subtitle: workspaceType['subtitle'],
          description: workspaceType['description'],
          logo: workspaceType['logo']
        })
      )
    }

    public get(brand) {
      return super.getObservable(WorkspaceType.find({branding: brand.id}));
    }

    public getOne(brand, name) {
      return super.getObservable(WorkspaceType.findOne({branding: brand.id, name: name}));
    }
  }
}
module.exports = new Services.WorkspaceTypes().exports();
