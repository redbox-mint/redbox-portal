import '../../sails';
import { JsonMap } from './types';

export interface WorkspaceTypeAttributes {
  branding: string | number;
  description?: string;
  externallyProvisioned?: boolean;
  logo?: string;
  name: string;
  subtitle?: string;
}

export interface WorkspaceTypeWaterlineModel extends Sails.Model {
  attributes: WorkspaceTypeAttributes;
}

declare global {
  var WorkspaceType: WorkspaceTypeWaterlineModel;
}
