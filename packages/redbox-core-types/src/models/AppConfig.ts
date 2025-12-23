/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface AppConfigAttributes {
  branding: string | number;
  configData?: JsonMap;
  configKey: string;
}

export interface AppConfigWaterlineModel extends Sails.Model {
  attributes: AppConfigAttributes;
}

declare global {
  var AppConfig: AppConfigWaterlineModel;
}
