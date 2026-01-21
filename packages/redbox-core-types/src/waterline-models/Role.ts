/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { Entity, Attr, BelongsTo, HasMany, toWaterlineModelDef } from '../decorators';
import { BrandingConfigAttributes } from './BrandingConfig';

@Entity('role')
export class RoleClass {
  @Attr({ type: 'string', required: true })
  public name!: string;

  @BelongsTo('brandingconfig')
  public branding?: string | number;

  @HasMany('user', 'roles', { dominant: true })
  public users?: unknown[];
}

// Export the Waterline model definition for runtime use
export const RoleWLDef = toWaterlineModelDef(RoleClass);

// Type interface for backwards compatibility
export interface RoleAttributes extends Sails.WaterlineAttributes {
  branding?: string | number | BrandingConfigAttributes;
  name: string;
  users?: unknown[];
}

export interface RoleWaterlineModel extends Sails.Model<RoleAttributes> {
  attributes: RoleAttributes;
}

declare global {
  var Role: RoleWaterlineModel;
}
