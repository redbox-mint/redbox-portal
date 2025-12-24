// This file is generated from internal/typescript-models/src/models/AppConfig.ts. Do not edit directly.
/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { BrandingConfigAttributes } from './BrandingConfig';

export interface AppConfigAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  configData?: Record<string, unknown>;
  configKey: string;
}

export interface AppConfigWaterlineModel extends Sails.Model<AppConfigAttributes> {
  attributes: AppConfigAttributes;
}

declare global {
  var AppConfig: AppConfigWaterlineModel;
}
