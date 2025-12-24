// This file is generated from internal/typescript-models/src/models/WorkflowStep.ts. Do not edit directly.
/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { FormAttributes } from './Form';

export interface WorkflowStepAttributes extends Sails.WaterlineAttributes {
  config: Record<string, unknown>;
  form?: string | number | FormAttributes;
  hidden?: boolean;
  name: string;
  recordType?: string | number;
  starting: boolean;
}

export interface WorkflowStepWaterlineModel extends Sails.Model<WorkflowStepAttributes> {
  attributes: WorkflowStepAttributes;
}

declare global {
  var WorkflowStep: WorkflowStepWaterlineModel;
}
