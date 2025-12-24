// This file is generated from internal/typescript-models/src/models/WorkspaceApp.ts. Do not edit directly.
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
