/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface DashboardTypeAttributes {
  branding: string | number;
  formatRules: JsonMap;
  key?: string;
  name: string;
  searchable?: boolean;
}

export interface DashboardTypeWaterlineModel extends Sails.Model {
  attributes: DashboardTypeAttributes;
}

declare global {
  var DashboardType: DashboardTypeWaterlineModel;
}
