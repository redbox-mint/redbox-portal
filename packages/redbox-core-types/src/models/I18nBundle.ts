import '../../sails';
import { JsonMap } from './types';

export interface I18nBundleAttributes {
  branding?: string | number;
  data: JsonMap;
  displayName?: string;
  enabled?: boolean;
  entries?: unknown[];
  locale: string;
  namespace?: string;
  uid?: string;
}

export interface I18nBundleWaterlineModel extends Sails.Model {
  attributes: I18nBundleAttributes;
}

declare global {
  var I18nBundle: I18nBundleWaterlineModel;
}
