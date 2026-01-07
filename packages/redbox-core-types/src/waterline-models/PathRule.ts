/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { Entity, Attr, BelongsTo, toWaterlineModelDef } from '../decorators';
import { BrandingConfigAttributes } from './BrandingConfig';
import { RoleAttributes } from './Role';

@Entity('pathrule')
export class PathRuleClass {
  @Attr({ type: 'string', required: true })
  public path!: string;

  @BelongsTo('role', { required: true })
  public role!: string | number;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'boolean' })
  public can_read?: boolean;

  @Attr({ type: 'boolean' })
  public can_write?: boolean;

  @Attr({ type: 'string' })
  public custom?: string;
}

// Export the Waterline model definition for runtime use
export const PathRuleWLDef = toWaterlineModelDef(PathRuleClass);

// Type interface for backwards compatibility
export interface PathRuleAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  can_read?: boolean;
  can_write?: boolean;
  custom?: string;
  path: string;
  role: string | number | RoleAttributes;
}

export interface PathRuleWaterlineModel extends Sails.Model<PathRuleAttributes> {
  attributes: PathRuleAttributes;
}

declare global {
  var PathRule: PathRuleWaterlineModel;
}
