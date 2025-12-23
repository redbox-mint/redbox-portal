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
