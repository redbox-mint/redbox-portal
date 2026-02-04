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

import { Observable, zip, from, of, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { Services as services } from '../CoreService';
import { Sails, Model } from "sails";

declare var sails: Sails;
declare var WorkflowStep: Model;
declare var RecordType: Model;
declare var _this;
declare var _;
declare var JSON;

export module Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class WorkflowSteps extends services.Core.Service {

    protected override _exportedMethods: any = [
      'bootstrap',
      'create',
      'get',
      'getFirst',
      'getAllForRecordType'
    ];

    public async bootstrap(recordTypes):Promise<any> {
      let workflows = await WorkflowStep.find({});
      if (sails.config.appmode.bootstrapAlways) {
        await WorkflowStep.destroy({});
        workflows = null;
      }
      
          this.logger.debug(`WorkflowSteps found: ${workflows} and boostrapAlways set to: ${sails.config.appmode.bootstrapAlways}`);
          let wfSteps = workflows;
          if (_.isEmpty(workflows)) {
            this.logger.verbose("Bootstrapping workflow definitions... ");
            const wfSteps = {};
            _.forEach(recordTypes, recordType => {
              this.logger.verbose("Processing recordType: " + recordType.name);
              wfSteps[recordType.name] = []
              _.forOwn(sails.config.workflow[recordType.name], (workflowConf, workflowName) => {
                if (workflowName != null) {
                  this.logger.verbose("workflow step added to list: " + workflowName)
                  wfSteps[recordType.name].push({ "recordType": recordType, "workflow": workflowName });
                }
              });
            });
            
        
          this.logger.verbose(`wfSteps: `);
          this.logger.verbose(JSON.stringify(wfSteps));
          if (_.isArray(wfSteps) && wfSteps[0]["config"] != null) {
            
          } else {
            var workflowSteps = [];
            for(let recordTypeName in wfSteps) {
              let workflowStepsObject = wfSteps[recordTypeName];
              for (let workflowStep of workflowStepsObject){
                let workflowConf = sails.config.workflow[recordTypeName][workflowStep["workflow"]];
                let form = _.get(workflowConf,'config.form','');
                if(form == '') {
                  _.set(workflowConf.config,'form','generated-view-only');
                }
                var obs = await firstValueFrom(this.create(workflowStep["recordType"], workflowStep["workflow"], workflowConf.config, workflowConf.starting == true, workflowConf['hidden']));
                workflowSteps.push(obs);
              };
            }
            
            return workflowSteps;
          }
        }
        return workflows;
    }



    public create(recordType, name, workflowConf, starting, hidden: boolean = false) {
      return super.getObservable(WorkflowStep.create({
        name: name,
        config: workflowConf,
        recordType: recordType.id,
        starting: starting,
        hidden: hidden
      }));
    }

    public get(recordType, name) {
      return super.getObservable(WorkflowStep.findOne({ recordType: recordType.id, name: name }));
    }

    public getAllForRecordType(recordType) {
      return super.getObservable(WorkflowStep.find({ recordType: recordType.id, hidden: { '!=': true } }));
    }

    public getFirst(recordType) {
      return super.getObservable(WorkflowStep.findOne({ recordType: recordType.id, starting: true }));
    }
  }
}

declare global {
  let WorkflowStepsService: Services.WorkflowSteps;
}
