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

import { Observable, firstValueFrom, of, defer } from 'rxjs';
import type { RuntimeValue } from '../runtimeValues';
import { activeRecordDefinitions } from './RecordDefinitionRuntimeService';
import { Services as services } from '../CoreService';
import type { RecordTypeModel } from '../model/storage/RecordTypeModel';
import type { WorkflowStepModel } from '../model/storage/WorkflowStepModel';

type RecordTypeLike = Partial<RecordTypeModel> & { id?: string; name?: string };

export namespace Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class WorkflowSteps extends services.Core.Service {
    protected override _exportedMethods: string[] = ['bootstrap', 'create', 'get', 'getFirst', 'getAllForRecordType'];

    /** Read the caller's brand-scoped identities; only versioned aggregate seeds create definitions. */
    public async bootstrap(recordTypes: RecordTypeLike[]): Promise<WorkflowStepModel[]> {
      const steps: WorkflowStepModel[] = [];
      for (const recordType of recordTypes) {
        if (!recordType.id) continue;
        const activeStages = await activeRecordDefinitions().stages(recordType);
        steps.push(...(activeStages ?? await firstValueFrom(
          super.getObservable<WorkflowStepModel[]>(WorkflowStep.find({ recordType: recordType.id }))
        )));
      }
      return steps;
    }

    public create(
      recordType: RecordTypeLike,
      name: string,
      workflowConf: unknown,
      starting: boolean,
      hidden: boolean = false
    ) {
      const recordTypeId = recordType.id as string;
      return super.getObservable(
        WorkflowStep.create({
          name: name,
          config: workflowConf,
          recordType: recordTypeId,
          starting: starting,
          hidden: hidden,
        })
      );
    }

    public get(recordType: RecordTypeLike, name: string): Observable<RuntimeValue> {
      return defer(async () => {
        const stages = await activeRecordDefinitions().stages(recordType);
        return stages
          ? stages.find(stage => stage.name === name)
          : firstValueFrom(
              super.getObservable<WorkflowStepModel | undefined>(
                WorkflowStep.findOne({ recordType: recordType.id as string, name })
              )
            );
      });
    }

    public getAllForRecordType(recordType?: RecordTypeLike | null): Observable<WorkflowStepModel[]> {
      if (!recordType?.id) {
        this.logger.warn('WorkflowStepsService.getAllForRecordType called without a valid record type id');
        return of([] as WorkflowStepModel[]);
      }
      return defer(
        async () =>
          (await activeRecordDefinitions().stages(recordType)) ??
          firstValueFrom(
            super.getObservable<WorkflowStepModel[]>(
              WorkflowStep.find({ recordType: recordType.id as string, hidden: { '!=': true } })
            )
          )
      );
    }

    public getFirst(recordType: RecordTypeLike): Observable<RuntimeValue> {
      return defer(async () => {
        const stages = await activeRecordDefinitions().stages(recordType);
        return stages
          ? stages.find(stage => stage.starting)
          : firstValueFrom(
              super.getObservable<WorkflowStepModel | undefined>(
                WorkflowStep.findOne({ recordType: recordType.id as string, starting: true })
              )
            );
      });
    }
  }
}

declare global {
  let WorkflowStepsService: Services.WorkflowSteps;
}
