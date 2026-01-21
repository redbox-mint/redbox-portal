/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { Entity, Attr, BelongsTo, toWaterlineModelDef } from '../decorators';
import { BrandingConfigAttributes } from './BrandingConfig';

@Entity('counter')
export class CounterClass {
  @Attr({ type: 'string', required: true, unique: true })
  public name!: string;

  @BelongsTo('brandingconfig')
  public branding?: string | number;

  @Attr({ type: 'number' })
  public value?: number;
}

// Export the Waterline model definition for runtime use
export const CounterWLDef = toWaterlineModelDef(CounterClass);

// Type interface for backwards compatibility
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
