/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface PathRuleAttributes {
  branding: string | number;
  can_read?: boolean;
  can_write?: boolean;
  custom?: string;
  path: string;
  role: string | number;
}

export interface PathRuleWaterlineModel extends Sails.Model {
  attributes: PathRuleAttributes;
}

declare global {
  var PathRule: PathRuleWaterlineModel;
}
