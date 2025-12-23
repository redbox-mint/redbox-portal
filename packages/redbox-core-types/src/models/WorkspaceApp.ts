/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { UserAttributes } from './User';

export interface WorkspaceAppAttributes extends Sails.WaterlineAttributes {
  app: string;
  info?: Record<string, unknown>;
  user: string | number | UserAttributes;
}

export interface WorkspaceAppWaterlineModel extends Sails.Model<WorkspaceAppAttributes> {
  attributes: WorkspaceAppAttributes;
}

declare global {
  var WorkspaceApp: WorkspaceAppWaterlineModel;
}
