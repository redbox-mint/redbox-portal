/// <reference path="../sails.ts" />
import { Entity, Attr, BelongsTo, toWaterlineModelDef } from '../decorators';
import { BrandingConfigAttributes } from './BrandingConfig';

@Entity('workspacetype')
export class WorkspaceTypeClass {
  @Attr({ type: 'string', required: true })
  public name!: string;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'string' })
  public logo?: string;

  @Attr({ type: 'string' })
  public subtitle?: string;

  @Attr({ type: 'string' })
  public description?: string;

  @Attr({ type: 'boolean', defaultsTo: false })
  public externallyProvisioned?: boolean;
}

// Export the Waterline model definition for runtime use
export const WorkspaceTypeWLDef = toWaterlineModelDef(WorkspaceTypeClass);

// Type interface for backwards compatibility
export interface WorkspaceTypeAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  description?: string;
  externallyProvisioned?: boolean;
  logo?: string;
  name: string;
  subtitle?: string;
}

export interface WorkspaceTypeWaterlineModel extends Sails.Model<WorkspaceTypeAttributes> {
  attributes: WorkspaceTypeAttributes;
}

declare global {
  const WorkspaceType: WorkspaceTypeWaterlineModel;
}
