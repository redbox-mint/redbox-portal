/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface WorkspaceAsyncAttributes extends Sails.WaterlineAttributes {
  args: unknown;
  date_completed?: string;
  date_started?: string;
  message?: Record<string, unknown>;
  method: string;
  name: string;
  recordType: string;
  service: string;
  started_by: string;
  status?: string;
}

export interface WorkspaceAsyncWaterlineModel extends Sails.Model<WorkspaceAsyncAttributes> {
  attributes: WorkspaceAsyncAttributes;
}

declare global {
  var WorkspaceAsync: WorkspaceAsyncWaterlineModel;
}
