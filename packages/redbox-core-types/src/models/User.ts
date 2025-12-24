// This file is generated from internal/typescript-models/src/models/User.ts. Do not edit directly.
/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface UserAttributes extends Sails.WaterlineAttributes {
  additionalAttributes?: Record<string, unknown>;
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

export interface User extends Sails.Model<UserAttributes> {
  attributes: UserAttributes;
}

declare global {
  var User: User;
}
