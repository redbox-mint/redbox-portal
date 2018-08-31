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

    public bootstrap = (recordTypes) => {
      let startQ = WorkflowStep.find({});
      if (sails.config.appmode.bootstrapAlways) {
        startQ = WorkflowStep.destroy({});
      }
      return super.getObservable(startQ)
        .flatMap(workflows => {
          sails.log.debug(`WorkflowSteps found: ${workflows} and boostrapAlways set to: ${sails.config.appmode.bootstrapAlways}`);
          if (_.isEmpty(workflows)) {
            sails.log.verbose("Bootstrapping workflow definitions... ");
            const wfSteps = {};
            _.forEach(recordTypes, recordType => {
              sails.log.verbose("Processing recordType: " + recordType.name);
              wfSteps[recordType.name] = []
              _.forOwn(sails.config.workflow[recordType.name], (workflowConf, workflowName) => {
                if (workflowName != null) {
                  sails.log.verbose("workflow step added to list: " + workflowName)
                  wfSteps[recordType.name].push({ "recordType": recordType, "workflow": workflowName });
                }
              });
            });
            return Observable.of(wfSteps);
          } else {
            return Observable.of(workflows);
          }
        }).flatMap(wfSteps => {
          sails.log.verbose(`wfSteps: `);
          sails.log.verbose(JSON.stringify(wfSteps));
          if (_.isArray(wfSteps) && wfSteps[0]["config"] != null) {
            sails.log.verbose(`return as Observable of`);
            return Observable.from(wfSteps);
          } else {
            var workflowSteps = [];
            _.forOwn(wfSteps, (workflowStepsObject, recordTypeName) => {
              _.forEach(workflowStepsObject, workflowStep => {
                const workflowConf = sails.config.workflow[recordTypeName][workflowStep["workflow"]];
                var obs = this.create(workflowStep["recordType"], workflowStep["workflow"], workflowConf.config, workflowConf.starting == true);
                workflowSteps.push(obs);
              });
            });
            return Observable.zip(...workflowSteps);
          }
        });
    }



    public create(recordType, name, workflowConf, starting) {
      return super.getObservable(WorkflowStep.create({
        name: name,
        config: workflowConf,
        recordType: recordType.id,
        starting: starting
      }));
    }

    public get(recordType, name) {
      return super.getObservable(WorkflowStep.findOne({recordType: recordType.id, name: name }));
    }

    public getAllForRecordType(recordType) {
      return super.getObservable(WorkflowStep.find({recordType: recordType.id }));
    }

    public getFirst(recordType) {
      return super.getObservable(WorkflowStep.findOne({recordType: recordType.id, starting: true }));
    }
  }
}
module.exports = new Services.WorkflowSteps().exports();
