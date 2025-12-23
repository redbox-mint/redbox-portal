/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface WorkspaceAppAttributes {
  app: string;
  info?: JsonMap;
  user: string | number;
}

export interface WorkspaceAppWaterlineModel extends Sails.Model {
  attributes: WorkspaceAppAttributes;
}

declare global {
  var WorkspaceApp: WorkspaceAppWaterlineModel;
}
