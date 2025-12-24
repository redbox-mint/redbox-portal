// This file is generated from internal/typescript-models/src/models/I18nBundle.ts. Do not edit directly.
/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { BrandingConfigAttributes } from './BrandingConfig';

export interface I18nBundleAttributes extends Sails.WaterlineAttributes {
  branding?: string | number | BrandingConfigAttributes;
  data: Record<string, unknown>;
  displayName?: string;
  enabled?: boolean;
  entries?: unknown[];
  locale: string;
  namespace?: string;
  uid?: string;
}

export interface I18nBundleWaterlineModel extends Sails.Model<I18nBundleAttributes> {
  attributes: I18nBundleAttributes;
}

declare global {
  var I18nBundle: I18nBundleWaterlineModel;
}
