// This file is generated from internal/sails-ts/api/services/WorkflowStepsService.ts. Do not edit directly.
import { Observable, zip, from, of, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import { Services as services } from '../../index';
import { Sails, Model } from "sails";

export interface WorkflowStepsService {
  bootstrap(recordTypes: any): Promise<any>;
  create(recordType: any, name: any, workflowConf: any, starting: any, hidden?: boolean): any;
  get(recordType: any, name: any): any;
  getFirst(recordType: any): any;
  getAllForRecordType(recordType: any): any;
}
