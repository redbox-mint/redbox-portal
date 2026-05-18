/// <reference path="../sails.ts" />
import { Entity, Attr, BelongsTo, BeforeCreate, toWaterlineModelDef } from '../decorators';
import { BrandingConfigAttributes } from './BrandingConfig';
import type { DashboardTableConfig } from '../config/workflow.config';

const assignKey = (dashboardType: Record<string, unknown>, cb: (err?: Error) => void) => {
  dashboardType.key = `${dashboardType.branding}_${dashboardType.name}`;
  cb();
};

@BeforeCreate(assignKey)
@Entity('dashboardtype')
export class DashboardTypeClass {
  @Attr({ type: 'string', unique: true })
  public key?: string;

  @Attr({ type: 'string', required: true })
  public name!: string;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'string' })
  public description?: string;

  @Attr({ type: 'json', required: true })
  public formatRules!: Record<string, unknown>;

  @Attr({ type: 'json', defaultsTo: {} })
  public tableConfig!: DashboardTableConfig;

  @Attr({ type: 'boolean', defaultsTo: true })
  public searchable?: boolean;

  @Attr({ type: 'boolean', defaultsTo: false })
  public system?: boolean;
}

// Export the Waterline model definition for runtime use
export const DashboardTypeWLDef = toWaterlineModelDef(DashboardTypeClass);

// Type interface for backwards compatibility
export interface DashboardTypeAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  description?: string;
  formatRules: Record<string, unknown>;
  key?: string;
  name: string;
  tableConfig?: DashboardTableConfig;
  searchable?: boolean;
  system?: boolean;
}

export interface DashboardTypeWaterlineModel extends Sails.Model<DashboardTypeAttributes> {
  attributes: DashboardTypeAttributes;
}

declare global {
  const DashboardType: DashboardTypeWaterlineModel;
}
