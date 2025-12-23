/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { BrandingConfigAttributes } from './BrandingConfig';

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
  var WorkspaceType: WorkspaceTypeWaterlineModel;
}
