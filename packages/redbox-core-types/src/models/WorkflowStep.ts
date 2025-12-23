/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface WorkflowStepAttributes {
  config: JsonMap;
  form?: string | number;
  hidden?: boolean;
  name: string;
  recordType?: string | number;
  starting: boolean;
}

export interface WorkflowStepWaterlineModel extends Sails.Model {
  attributes: WorkflowStepAttributes;
}

declare global {
  var WorkflowStep: WorkflowStepWaterlineModel;
}
