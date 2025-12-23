/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface CacheEntryAttributes extends Sails.WaterlineAttributes {
  data?: Record<string, unknown>;
  name: string;
  ts_added: number;
}

export interface CacheEntryWaterlineModel extends Sails.Model<CacheEntryAttributes> {
  attributes: CacheEntryAttributes;
}

declare global {
  var CacheEntry: CacheEntryWaterlineModel;
}
