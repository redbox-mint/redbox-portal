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


type RecordTypeLike = UnsafeAny;

export module Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class WorkflowSteps extends services.Core.Service {

    protected override _exportedMethods: UnsafeAny = [
      'bootstrap',
      'create',
      'get',
      'getFirst',
      'getAllForRecordType'
    ];

    public async bootstrap(recordTypes: RecordTypeLike[]): Promise<UnsafeAny> {
      let workflows = await WorkflowStep.find({});
      if (sails.config.appmode.bootstrapAlways) {
        await WorkflowStep.destroy({});
        workflows = [];
      }
      
          this.logger.debug(`WorkflowSteps found: ${workflows} and boostrapAlways set to: ${sails.config.appmode.bootstrapAlways}`);
          let wfSteps: Record<string, Array<{ recordType: RecordTypeLike; workflow: string }>> | any = workflows;
          if (_.isEmpty(workflows)) {
            this.logger.verbose("Bootstrapping workflow definitions... ");
            wfSteps = {};
            _.forEach(recordTypes, (recordType: RecordTypeLike) => {
              const recordTypeName = recordType.name;
              if (!recordTypeName) {
                return;
              }
              this.logger.verbose("Processing recordType: " + recordTypeName);
              wfSteps[recordTypeName] = []
              _.forOwn(sails.config.workflow[recordTypeName], (_workflowConf: UnsafeAny, workflowName: string) => {
                if (workflowName != null) {
                  this.logger.verbose("workflow step added to list: " + workflowName)
                  wfSteps[recordTypeName].push({ "recordType": recordType, "workflow": workflowName });
                }
              });
            });
            
        
          this.logger.verbose(`wfSteps: `);
          this.logger.verbose(JSON.stringify(wfSteps));
          if (_.isArray(wfSteps) && wfSteps[0]["config"] != null) {
            
          } else {
            var workflowSteps: UnsafeAny[] = [];
            for(let recordTypeName in wfSteps) {
              let workflowStepsObject = wfSteps[recordTypeName] as Array<{ recordType: RecordTypeLike; workflow: string }>;
              for (let workflowStep of workflowStepsObject){
                let workflowConf = sails.config.workflow[recordTypeName][workflowStep["workflow"]] as UnsafeAny;
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



    public create(recordType: RecordTypeLike, name: string, workflowConf: unknown, starting: boolean, hidden: boolean = false) {
      return super.getObservable(WorkflowStep.create({
        name: name,
        config: workflowConf,
        recordType: recordType.id,
        starting: starting,
        hidden: hidden
      }));
    }

    public get(recordType: RecordTypeLike, name: string) {
      return super.getObservable(WorkflowStep.findOne({ recordType: recordType.id, name: name }));
    }

    public getAllForRecordType(recordType: RecordTypeLike) {
      return super.getObservable(WorkflowStep.find({ recordType: recordType.id, hidden: { '!=': true } }));
    }

    public getFirst(recordType: RecordTypeLike) {
      return super.getObservable(WorkflowStep.findOne({ recordType: recordType.id, starting: true }));
    }
  }
}

declare global {
  let WorkflowStepsService: Services.WorkflowSteps;
}
