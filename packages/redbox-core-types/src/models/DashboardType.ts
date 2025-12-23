/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { BrandingConfigAttributes } from './BrandingConfig';

export interface DashboardTypeAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  formatRules: Record<string, unknown>;
  key?: string;
  name: string;
  searchable?: boolean;
}

export interface DashboardTypeWaterlineModel extends Sails.Model<DashboardTypeAttributes> {
  attributes: DashboardTypeAttributes;
}

declare global {
  var DashboardType: DashboardTypeWaterlineModel;
}
