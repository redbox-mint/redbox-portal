/// <reference path="../sails.ts" />
import { Entity, Attr, toWaterlineModelDef } from '../decorators';

@Entity('themeconfig')
export class ThemeConfigClass {
  @Attr({ type: 'string' })
  public name?: string;

  @Attr({ type: 'string' })
  public css?: string;
}

// Export the Waterline model definition for runtime use
export const ThemeConfigWLDef = toWaterlineModelDef(ThemeConfigClass);

// Type interface for backwards compatibility
export interface ThemeConfigAttributes extends Sails.WaterlineAttributes {
  css?: string;
  name?: string;
}

export interface ThemeConfigWaterlineModel extends Sails.Model<ThemeConfigAttributes> {
  attributes: ThemeConfigAttributes;
}

declare global {
  const ThemeConfig: ThemeConfigWaterlineModel;
}
