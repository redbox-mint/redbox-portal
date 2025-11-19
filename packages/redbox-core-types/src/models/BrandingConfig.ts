import '../../sails';
import { JsonMap } from './types';

export interface BrandingConfigAttributes {
  css?: string;
  hash?: string;
  logo?: JsonMap;
  name?: string;
  roles?: unknown[];
  supportAgreementInformation?: JsonMap;
  variables?: JsonMap;
  version?: number;
}

export interface BrandingConfigWaterlineModel extends Sails.Model {
  attributes: BrandingConfigAttributes;
}

declare global {
  var BrandingConfig: BrandingConfigWaterlineModel;
}
