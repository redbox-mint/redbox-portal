// This file is generated from internal/sails-ts/api/services/WorkspaceService.ts. Do not edit directly.
import { Observable, from } from 'rxjs';
import {Services as services} from '../../index';
import { Sails, Model } from "sails";
import axios from 'axios';

export interface WorkspaceService {
  createWorkspaceRecord(config: any, username: string, project: any, recordType: string, workflowStage: string): any;
  getRecordMeta(config: any, rdmp: string): any;
  updateRecordMeta(config: any, record: any, id: string): any;
  registerUserApp(...args: any[]): any;
  userInfo(userId: string): any;
  provisionerUser(username: string): any;
  infoFormUserId(userId: any): any;
  createWorkspaceInfo(userId: any, appName: any, info: any): any;
  updateWorkspaceInfo(id: any, info: any): any;
  workspaceAppFromUserId(userId: any, appName: any): any;
  removeAppFromUserId(userId: any, id: any): any;
  mapToRecord(obj: any, recordMap: any): any;
  addWorkspaceToRecord(targetRecordOid: string, workspaceOid: string, workspaceData?: any, targetRecord?: any): any;
  removeWorkspaceFromRecord(targetRecordOid: string, workspaceOid: string, workspaceData?: any, targetRecord?: any): any;
  getWorkspaces(targetRecordOid: string, targetRecord?: any): any;
}
