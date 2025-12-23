/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface FormAttributes {
  attachmentFields?: JsonMap;
  customAngularApp?: JsonMap;
  editCssClasses?: string;
  fields?: JsonMap;
  messages?: JsonMap;
  name: string;
  requiredFieldIndicator?: string;
  skipValidationOnSave?: boolean;
  type?: string;
  viewCssClasses?: string;
  workflowStep?: string | number;
}

export interface FormWaterlineModel extends Sails.Model {
  attributes: FormAttributes;
}

declare global {
  var Form: FormWaterlineModel;
}
