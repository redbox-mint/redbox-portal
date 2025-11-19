import '../../sails';
import { JsonMap } from './types';

export interface RoleAttributes {
  branding?: string | number;
  name: string;
  users?: unknown[];
}

export interface RoleWaterlineModel extends Sails.Model {
  attributes: RoleAttributes;
}

declare global {
  var Role: RoleWaterlineModel;
}
