// This file is generated from internal/typescript-models/src/models/Counter.ts. Do not edit directly.
/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { BrandingConfigAttributes } from './BrandingConfig';

export interface CounterAttributes extends Sails.WaterlineAttributes {
  branding?: string | number | BrandingConfigAttributes;
  name: string;
  value?: number;
}

export interface CounterWaterlineModel extends Sails.Model<CounterAttributes> {
  attributes: CounterAttributes;
}

declare global {
  var Counter: CounterWaterlineModel;
}
