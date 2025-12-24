// This file is generated from internal/typescript-models/src/models/ThemeConfig.ts. Do not edit directly.
/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface ThemeConfigAttributes extends Sails.WaterlineAttributes {
  css?: string;
  name?: string;
}

export interface ThemeConfigWaterlineModel extends Sails.Model<ThemeConfigAttributes> {
  attributes: ThemeConfigAttributes;
}

declare global {
  var ThemeConfig: ThemeConfigWaterlineModel;
}
