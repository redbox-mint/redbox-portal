// This file is generated from internal/typescript-models/src/models/CacheEntry.ts. Do not edit directly.
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
