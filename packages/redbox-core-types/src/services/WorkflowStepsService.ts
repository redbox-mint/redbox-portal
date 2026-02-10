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

import { firstValueFrom } from 'rxjs';
import { Services as services } from '../CoreService';
import type { WorkflowStageDefinition } from '../config/workflow.config';
import type { RecordTypeModel } from '../model/storage/RecordTypeModel';


type RecordTypeLike = Partial<RecordTypeModel> & { id?: string; name?: string };

export namespace Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class WorkflowSteps extends services.Core.Service {

    protected override _exportedMethods: string[] = [
      'bootstrap',
      'create',
      'get',
      'getFirst',
      'getAllForRecordType'
    ];

    public async bootstrap(recordTypes: RecordTypeLike[]): Promise<unknown[]> {
      let workflows = await WorkflowStep.find({}) as unknown as unknown[];
      if (sails.config.appmode.bootstrapAlways) {
        await WorkflowStep.destroy({});
        workflows = [];
      }
      
          this.logger.debug(`WorkflowSteps found: ${workflows} and boostrapAlways set to: ${sails.config.appmode.bootstrapAlways}`);
          if (_.isEmpty(workflows)) {
            this.logger.verbose("Bootstrapping workflow definitions... ");
            const wfSteps: Record<string, Array<{ recordType: RecordTypeLike; workflow: string }>> = {};
            _.forEach(recordTypes, (recordType: RecordTypeLike) => {
              const recordTypeName = recordType.name;
              if (!recordTypeName) {
                return;
              }
              this.logger.verbose("Processing recordType: " + recordTypeName);
              wfSteps[recordTypeName] = []
              _.forOwn(sails.config.workflow[recordTypeName], (_workflowConf: unknown, workflowName: string) => {
                if (workflowName != null) {
                  this.logger.verbose("workflow step added to list: " + workflowName)
                  wfSteps[recordTypeName].push({ "recordType": recordType, "workflow": workflowName });
                }
              });
            });
            
        
          this.logger.verbose(`wfSteps: `);
          this.logger.verbose(JSON.stringify(wfSteps));
          const workflowSteps: unknown[] = [];
          for(const recordTypeName in wfSteps) {
            const workflowStepsObject = wfSteps[recordTypeName] as Array<{ recordType: RecordTypeLike; workflow: string }>;
            for (const workflowStep of workflowStepsObject){
              const workflowConf = sails.config.workflow[recordTypeName][workflowStep["workflow"]] as WorkflowStageDefinition & { hidden?: boolean };
              const form = _.get(workflowConf,'config.form','');
              if(form == '') {
                _.set(workflowConf.config,'form','generated-view-only');
              }
              const obs = await firstValueFrom(this.create(workflowStep["recordType"], workflowStep["workflow"], workflowConf.config, workflowConf.starting == true, workflowConf.hidden));
              workflowSteps.push(obs);
            };
          }
          
          return workflowSteps;
        }
        return workflows;
    }



    public create(recordType: RecordTypeLike, name: string, workflowConf: unknown, starting: boolean, hidden: boolean = false) {
      const recordTypeId = recordType.id as string;
      return super.getObservable(WorkflowStep.create({
        name: name,
        config: workflowConf,
        recordType: recordTypeId,
        starting: starting,
        hidden: hidden
      }));
    }

    public get(recordType: RecordTypeLike, name: string) {
      return super.getObservable(WorkflowStep.findOne({ recordType: recordType.id as string, name: name }));
    }

    public getAllForRecordType(recordType: RecordTypeLike) {
      return super.getObservable(WorkflowStep.find({ recordType: recordType.id as string, hidden: { '!=': true } }));
    }

    public getFirst(recordType: RecordTypeLike) {
      return super.getObservable(WorkflowStep.findOne({ recordType: recordType.id as string, starting: true }));
    }
  }
}

declare global {
  let WorkflowStepsService: Services.WorkflowSteps;
}
