/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface WorkspaceAsyncAttributes {
  args: JsonMap;
  date_completed?: string;
  date_started?: string;
  message?: JsonMap;
  method: string;
  name: string;
  recordType: string;
  service: string;
  started_by: string;
  status?: string;
}

export interface WorkspaceAsyncWaterlineModel extends Sails.Model {
  attributes: WorkspaceAsyncAttributes;
}

declare global {
  var WorkspaceAsync: WorkspaceAsyncWaterlineModel;
}
