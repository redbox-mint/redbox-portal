// This file is generated from internal/sails-ts/api/services/DoiService.ts. Do not edit directly.
import {of} from 'rxjs';
import {Services as services, RBValidationError, BrandingModel} from '../../index';
import {Sails} from "sails";
import {DateTime} from 'luxon';
import axios from 'axios';

export interface DoiService {
  publishDoi(oid: any, record: any, event?: any, action?: any): any;
  publishDoiTrigger(oid: any, record: any, options: any): Promise<any>;
  publishDoiTriggerSync(oid: any, record: any, options: any): Promise<any>;
  updateDoiTriggerSync(oid: any, record: any, options: any): Promise<any>;
  deleteDoi(doi: string): Promise<boolean>;
  changeDoiState(doi: string, event: string): Promise<boolean>;
}
