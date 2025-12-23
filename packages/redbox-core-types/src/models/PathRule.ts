/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { BrandingConfigAttributes } from './BrandingConfig';
import { RoleAttributes } from './Role';

export interface PathRuleAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  can_read?: boolean;
  can_write?: boolean;
  custom?: string;
  path: string;
  role: string | number | RoleAttributes;
}

export interface PathRuleWaterlineModel extends Sails.Model<PathRuleAttributes> {
  attributes: PathRuleAttributes;
}

declare global {
  var PathRule: PathRuleWaterlineModel;
}
