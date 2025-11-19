import '../../sails';
import { JsonMap } from './types';

export interface UserAttributes {
  additionalAttributes?: JsonMap;
  email: string;
  lastLogin?: string;
  name: string;
  password?: string;
  roles?: unknown[];
  token?: string;
  type: string;
  username: string;
  workspaceApps?: unknown[];
}

export interface S extends Sails.Model {
  attributes: UserAttributes;
}

declare global {
  var User: UserWaterlineModel;
}
