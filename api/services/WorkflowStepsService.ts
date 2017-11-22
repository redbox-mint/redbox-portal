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
import { Sails, Model } from "sails";

declare var sails: Sails;
declare var WorkflowStep: Model;
declare var RecordType: Model;
declare var _this;
declare var JSON;

export module Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class WorkflowSteps extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'bootstrap',
      'create',
      'get',
      'getFirst',
      'getAllForRecordType'
    ];

    public bootstrap = (recordType) => {

      return super.getObservable(WorkflowStep.find())
        .flatMap(workflows => {

          if (_.isEmpty(workflows)) {
            sails.log.verbose("Bootstrapping workflow definitions... ");
            const wfSteps = [];
            _.forOwn(sails.config.workflow[recordType.name], (workflowConf, workflowName) => {
              sails.log.verbose("workflow step added to list: " + workflowName)
              wfSteps.push(workflowName);
            });
            return Observable.from(wfSteps);
          } else {
            sails.log.verbose("Default workflow definition(s) exist.");
            return Observable.of(null);
          }
        }).flatMap(stepName => {
          sails.log.verbose("Processing step: " + stepName);
          if (stepName) {
            const workflowConf = sails.config.workflow[recordType.name][stepName];
            sails.log.verbose("Adding: " + stepName);
            var obs = this.create(recordType, stepName, workflowConf.config, workflowConf.starting == true);
            return obs;

          }
          return Observable.of(null);
        }).toArray();
    }

    public create(recordType, name, workflowConf, starting) {
      return super.getObservable(WorkflowStep.create({
        name: name,
        config: workflowConf,
        recordType: recordType.key,
        starting: starting
      }));
    }

    public get(recordType, name) {
      return super.getObservable(WorkflowStep.findOne({ recordType: recordType.key, name: name }));
    }

    public getAllForRecordType(recordType) {
      return super.getObservable(WorkflowStep.find({ recordType: recordType.key }));
    }

    public getFirst(recordType) {
      return super.getObservable(WorkflowStep.findOne({ recordType: recordType.key, starting: true }));
    }
  }
}
module.exports = new Services.WorkflowSteps().exports();
