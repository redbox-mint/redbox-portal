/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface I18nTranslationAttributes {
  branding?: string | number;
  bundle?: string | number;
  category?: string;
  description?: string;
  key: string;
  locale: string;
  namespace?: string;
  uid?: string;
  value?: JsonMap;
}

export interface I18nTranslationWaterlineModel extends Sails.Model {
  attributes: I18nTranslationAttributes;
}

declare global {
  var I18nTranslation: I18nTranslationWaterlineModel;
}
