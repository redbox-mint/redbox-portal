// This file is generated from internal/sails-ts/api/services/AgendaQueueService.ts. Do not edit directly.
import {QueueService, Services as services} from '../../index';
import {Sails, Model} from "sails";
import { Agenda } from 'agenda';

export interface AgendaQueueService {
  every(jobName: string, interval: string, data?: any, options?: any): any;
  schedule(jobName: string, schedule: string, data?: any): any;
  now(jobName: string, data?: any): any;
  jobs(query?: any, sort?: any, limit?: any, skip?: any): any;
  sampleFunctionToDemonstrateHowToDefineAJobFunction(job: any): any;
  defineJob(name: any, options: any, serviceFn: any): any;
  moveCompletedJobsToHistory(job: any): any;
}
