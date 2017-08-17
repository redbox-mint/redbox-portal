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
import services = require('../../typescript/services/CoreService.js');
import {Sails, Model} from "sails";

declare var sails: Sails;
declare var WorkflowStep: Model;
declare var _this;

export module Services {
  /**
   * WorkflowSteps related functions...
   *
   * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
   *
   */
  export class WorkflowSteps extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'create',
      'get',
      'getFirst'
    ];

    public bootstrap = (defBrand) => {
      return super.getObservable(WorkflowStep.find({branding:defBrand.id})).flatMap(workflows => {
        if (_.isEmpty(workflows)) {
          sails.log.verbose("Bootstrapping workflow definitions... ");
          const wfSteps = [];
          _.forOwn(sails.config.workflow.default, (workflowConf, workflowName) => {
            wfSteps.push(workflowName);
          });
          return Observable.from(wfSteps);
        } else {
          sails.log.verbose("Default workflow definition(s) exist.");
          return Observable.of(null);
        }
      }).flatMap(stepName => {
        if (stepName) {
          const workflowConf = sails.config.workflow.default[stepName];
          return this.create(defBrand, stepName, workflowConf.config, workflowConf.starting == true);
        }
        return Observable.of(null);
      })
      .last();
    }

    public create(brand, name, workflowConf, starting) {
      return super.getObservable(WorkflowStep.create({
        name: name,
        config: workflowConf,
        branding: brand.id,
        starting: starting
      }));
    }

    public get(brand, name) {
      return super.getObservable(WorkflowStep.findOne({branding: brand.id, name: name}));
    }

    public getFirst(brand) {
      return super.getObservable(WorkflowStep.findOne({branding: brand.id, starting: true}));
    }
  }
}
module.exports = new Services.WorkflowSteps().exports();
