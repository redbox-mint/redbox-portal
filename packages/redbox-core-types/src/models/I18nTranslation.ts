// This file is generated from internal/typescript-models/src/models/I18nTranslation.ts. Do not edit directly.
/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { BrandingConfigAttributes } from './BrandingConfig';
import { I18nBundleAttributes } from './I18nBundle';

export interface I18nTranslationAttributes extends Sails.WaterlineAttributes {
  branding?: string | number | BrandingConfigAttributes;
  bundle?: string | number | I18nBundleAttributes;
  category?: string;
  description?: string;
  key: string;
  locale: string;
  namespace?: string;
  uid?: string;
  value?: unknown;
}

export interface I18nTranslationWaterlineModel extends Sails.Model<I18nTranslationAttributes> {
  attributes: I18nTranslationAttributes;
}

declare global {
  var I18nTranslation: I18nTranslationWaterlineModel;
}
