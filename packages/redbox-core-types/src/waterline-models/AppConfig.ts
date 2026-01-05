/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { Entity, Attr, BelongsTo, toWaterlineModelDef } from '../decorators';
import { BrandingConfigAttributes } from './BrandingConfig';

@Entity('appconfig')
export class AppConfigClass {
  @Attr({ type: 'string', required: true })
  public configKey!: string;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'json' })
  public configData?: Record<string, unknown>;
}

// Export the Waterline model definition for runtime use
export const AppConfigWLDef = toWaterlineModelDef(AppConfigClass);

// Type interface for backwards compatibility
export interface AppConfigAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  configData?: Record<string, unknown>;
  configKey: string;
}

export interface AppConfigWaterlineModel extends Sails.Model<AppConfigAttributes> {
  attributes: AppConfigAttributes;
}

declare global {
  var AppConfig: AppConfigWaterlineModel;
}
