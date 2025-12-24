// This file is generated from internal/typescript-models/src/models/Report.ts. Do not edit directly.
/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { BrandingConfigAttributes } from './BrandingConfig';

export interface ReportColumn {
  label: string;
  property: string;
  exportTemplate?: string;
  hide?: boolean;
  template?: string;
}

export interface ReportAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  columns: ReportColumn[];
  databaseQuery?: Record<string, unknown>;
  filter: Record<string, unknown>;
  key?: string;
  name: string;
  reportSource?: string;
  solrQuery?: Record<string, unknown>;
  title: string;
}

export interface ReportWaterlineModel extends Sails.Model<ReportAttributes> {
  attributes: ReportAttributes;
}

declare global {
  var Report: ReportWaterlineModel;
}
