/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface CacheEntryAttributes {
  data?: JsonMap;
  name: string;
  ts_added: number;
}

export interface CacheEntryWaterlineModel extends Sails.Model {
  attributes: CacheEntryAttributes;
}

declare global {
  var CacheEntry: CacheEntryWaterlineModel;
}
