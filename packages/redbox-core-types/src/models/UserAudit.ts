// This file is generated from internal/typescript-models/src/models/UserAudit.ts. Do not edit directly.
/// <reference path="../sails.ts" />
import { JsonMap } from './types';

export interface UserAuditAttributes extends Sails.WaterlineAttributes {
  action: string;
  additionalContext?: Record<string, unknown>;
  user: Record<string, unknown>;
}

export interface UserAuditWaterlineModel extends Sails.Model<UserAuditAttributes> {
  attributes: UserAuditAttributes;
}

declare global {
  var UserAudit: UserAuditWaterlineModel;
}
