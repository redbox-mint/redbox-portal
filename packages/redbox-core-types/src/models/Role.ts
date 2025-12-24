// This file is generated from internal/typescript-models/src/models/Role.ts. Do not edit directly.
/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { BrandingConfigAttributes } from './BrandingConfig';

export interface RoleAttributes extends Sails.WaterlineAttributes {
  branding?: string | number | BrandingConfigAttributes;
  name: string;
  users?: unknown[];
}

export interface RoleWaterlineModel extends Sails.Model<RoleAttributes> {
  attributes: RoleAttributes;
}

declare global {
  var Role: RoleWaterlineModel;
}
