// This file is generated from internal/sails-ts/api/services/RDMPService.ts. Do not edit directly.
import { Observable, of, from, zip, throwError, isObservable, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap } from 'rxjs/operators';
import {
  QueueService,
  Services as services,
  RBValidationError,
  StorageServiceResponse
} from '../../index';
import {
  Sails,
  Model
} from "sails";
import numeral from 'numeral';

export declare class RDMPS {
  protected queueService: QueueService;
  protected _exportedMethods: any;
  constructor();
  public processRecordCounters(oid: any, record: any, options: any, user: any): any;
  private incrementCounter(record: any, counter: any, newVal: any): any;
  public checkTotalSizeOfFilesInRecord(oid: any, record: any, options: any, user: any): any;
  private formatBytes(bytes: any, decimals?: any): any;
  protected addEmailToList(contributor: any, emailProperty: any, emailList: any, lowerCaseEmailAddresses?: boolean): any;
  protected populateContribList(contribProperties: any, record: any, emailProperty: any, emailList: any): any;
  protected getContribListByRule(contribProperties: any, record: any, rule: any, emailProperty: any, emailList: any): any;
  protected filterPending(users: any, userEmails: any, userList: any): any;
  public queueTriggerCall(oid: any, record: any, options: any, user: any): any;
  public queuedTriggerSubscriptionHandler(job: any): any;
  private convertToObservable(hookResponse: any): any;
  public complexAssignPermissions(oid: any, record: any, options: any): any;
  public assignPermissions(oid: any, record: any, options: any): any;
  private assignContributorRecordPermissions(oid: any, record: any, recordCreatorPermissions: any, editContributorEmails: any, editContributorObs: any, viewContributorEmails: any, viewContributorObs: any): any;
  public stripUserBasedPermissions(oid: any, record: any, options: any, user: any): any;
  public restoreUserBasedPermissions(oid: any, record: any, options: any, user: any): any;
  public runTemplates(oid: any, record: any, options: any, user: any, response?: StorageServiceResponse): any;
  public addWorkspaceToRecord(oid: any, workspaceData: any, options: any, user: any, response: any): any;
  public removeWorkspaceFromRecord(oid: any, workspaceData: any, options: any, user: any, response: any): any;
}

export interface RDMPService {
}
