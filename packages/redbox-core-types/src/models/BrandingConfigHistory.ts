/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface BrandingConfigHistoryAttributes {
  branding: string | number;
  css?: string;
  dateCreated?: string;
  hash: string;
  variables?: JsonMap;
  version: number;
}

export interface BrandingConfigHistoryWaterlineModel extends Sails.Model {
  attributes: BrandingConfigHistoryAttributes;
}

declare global {
  var BrandingConfigHistory: BrandingConfigHistoryWaterlineModel;
}
