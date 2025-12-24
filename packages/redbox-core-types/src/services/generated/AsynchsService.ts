// This file is generated from internal/sails-ts/api/services/AsynchsService.ts. Do not edit directly.
import { Observable } from 'rxjs';
import {Services as services} from '../../index';
import {Sails, Model} from "sails";
import { DateTime } from 'luxon';

export interface AsynchsService {
  start(progressObj: any): any;
  update(criteria: any, progressObj: any): any;
  finish(progressId: any, progressObj?: any): any;
  get(criteria: any): any;
}
