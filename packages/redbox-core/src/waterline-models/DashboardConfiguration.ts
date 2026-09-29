/// <reference path="../sails.ts" />
import { Attr, Entity, toWaterlineModelDef } from '../decorators';
import type { DashboardConfigurationData } from '../configmodels/DashboardSettings';

/**
 * One aggregate dashboard configuration document per brand.
 *
 * Every writer updates the document conditionally on `revision`, so a
 * multi-target copy is a single atomic database update. The unique `branding`
 * index is created explicitly by DashboardConfigService because the Mongo
 * adapter does not create indexes when models use `migrate: 'safe'`.
 */
@Entity('dashboardconfiguration', {
  indexes: [{ attributes: { branding: 1 }, unique: true }]
})
export class DashboardConfigurationClass {
  @Attr({ type: 'string', required: true, unique: true })
  public branding!: string;

  @Attr({ type: 'number', required: true })
  public revision!: number;

  @Attr({ type: 'json', required: true })
  public configData!: DashboardConfigurationData;

  @Attr({ type: 'json', defaultsTo: {} })
  public provenance?: Record<string, unknown>;
}

export const DashboardConfigurationWLDef = toWaterlineModelDef(DashboardConfigurationClass);

export interface DashboardConfigurationAttributes extends Sails.WaterlineAttributes {
  branding: string;
  revision: number;
  configData: DashboardConfigurationData;
  provenance?: Record<string, unknown>;
}

export interface DashboardConfigurationWaterlineModel extends Sails.Model<DashboardConfigurationAttributes> {
  attributes: DashboardConfigurationAttributes;
}

declare global {
  const DashboardConfiguration: DashboardConfigurationWaterlineModel;
}
