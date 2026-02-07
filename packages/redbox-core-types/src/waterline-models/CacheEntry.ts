/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { Entity, Attr, toWaterlineModelDef } from '../decorators';

@Entity('cacheentry')
export class CacheEntryClass {
  @Attr({ type: 'string', required: true, unique: true })
  public name!: string;

  @Attr({ type: 'json' })
  public data?: Record<string, unknown>;

  @Attr({ type: 'number', required: true })
  public ts_added!: number;
}

// Export the Waterline model definition for runtime use
export const CacheEntryWLDef = toWaterlineModelDef(CacheEntryClass);

// Type interface for backwards compatibility
export interface CacheEntryAttributes extends Sails.WaterlineAttributes {
  data?: Record<string, unknown>;
  name: string;
  ts_added: number;
}

export interface CacheEntryWaterlineModel extends Sails.Model<CacheEntryAttributes> {
  attributes: CacheEntryAttributes;
}

declare global {
  const CacheEntry: CacheEntryWaterlineModel;
}
