/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface BrandingConfigAttributes extends Sails.WaterlineAttributes {
  css?: string;
  hash?: string;
  logo?: Record<string, unknown>;
  name?: string;
  roles?: unknown[];
  supportAgreementInformation?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  version?: number;
}

export interface BrandingConfigWaterlineModel extends Sails.Model<BrandingConfigAttributes> {
  attributes: BrandingConfigAttributes;
}

declare global {
  var BrandingConfig: BrandingConfigWaterlineModel;
}
