// This file is generated from internal/sails-ts/api/services/WorkspaceAsyncService.ts. Do not edit directly.
import { Observable } from 'rxjs';
import {Services as services} from '../../index';
import { Sails, Model } from "sails";
import { DateTime } from 'luxon';

declare const util: any;

export interface WorkspaceAsyncService {
  start({name, recordType, username, service, method, args}: any): any;
  update(id: any, obj: any): any;
  pending(): any;
  loop(): any;
  status(status: any, recordType: any): any;
}
