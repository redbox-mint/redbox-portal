/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { Entity, Attr, toWaterlineModelDef } from '../decorators';

@Entity('useraudit')
export class UserAuditClass {
  @Attr({ type: 'json', required: true })
  public user!: Record<string, unknown>;

  @Attr({ type: 'string', required: true })
  public action!: string;

  @Attr({ type: 'json' })
  public additionalContext?: Record<string, unknown>;
}

// Export the Waterline model definition for runtime use
export const UserAuditWLDef = toWaterlineModelDef(UserAuditClass);

// Type interface for backwards compatibility
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
