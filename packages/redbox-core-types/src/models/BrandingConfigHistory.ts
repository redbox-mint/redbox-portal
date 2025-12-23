/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { BrandingConfigAttributes } from './BrandingConfig';

export interface BrandingConfigHistoryAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  css?: string;
  dateCreated?: string;
  hash: string;
  variables?: Record<string, unknown>;
  version: number;
}

export interface BrandingConfigHistoryWaterlineModel extends Sails.Model<BrandingConfigHistoryAttributes> {
  attributes: BrandingConfigHistoryAttributes;
}

declare global {
  var BrandingConfigHistory: BrandingConfigHistoryWaterlineModel;
}
