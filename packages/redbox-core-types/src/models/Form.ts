// This file is generated from internal/typescript-models/src/models/Form.ts. Do not edit directly.
/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface FormAttributes extends Sails.WaterlineAttributes {
  attachmentFields?: Record<string, unknown>;
  customAngularApp?: Record<string, unknown>;
  editCssClasses?: string;
  fields?: Record<string, unknown>;
  messages?: Record<string, unknown>;
  name: string;
  requiredFieldIndicator?: string;
  skipValidationOnSave?: boolean;
  type?: string;
  viewCssClasses?: string;
  workflowStep?: string | number;
}

export interface FormWaterlineModel extends Sails.Model<FormAttributes> {
  attributes: FormAttributes;
}

declare global {
  var Form: FormWaterlineModel;
}
