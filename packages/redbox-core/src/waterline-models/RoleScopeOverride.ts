/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, BelongsTo, Entity, toWaterlineModelDef } from '../decorators';
import { ROLE_SCOPE_EFFECTS, asScopeKey, type RoleScopeEffect } from '../authorization';
import type { RoleAttributes } from './Role';

const beforeCreate = (record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  try {
    if (typeof record.scopeKey !== 'string') {
      throw new Error('RoleScopeOverride.scopeKey is required.');
    }
    record.scopeKey = asScopeKey(record.scopeKey);
    proceed();
  } catch (error) {
    proceed(error instanceof Error ? error : new Error(String(error)));
  }
};

const beforeUpdate = (record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  if (Object.hasOwn(record, 'role') || Object.hasOwn(record, 'scopeKey')) {
    proceed(new Error('RoleScopeOverride.role and RoleScopeOverride.scopeKey are immutable.'));
    return;
  }
  proceed();
};

@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@Entity('rolescopeoverride', {
  indexes: [{ attributes: { role: 1, scopeKey: 1 }, unique: true }, { attributes: { scopeKey: 1, effect: 1 } }],
})
export class RoleScopeOverrideClass {
  @BelongsTo('role', { required: true })
  public role!: string | number;

  @Attr({ type: 'string', required: true })
  public scopeKey!: string;

  @Attr({ type: 'string', required: true, isIn: ROLE_SCOPE_EFFECTS })
  public effect!: RoleScopeEffect;

  @Attr({ type: 'string', required: true })
  public createdBy!: string;

  @Attr({ type: 'string' })
  public reason?: string;
}

export const RoleScopeOverrideWLDef = toWaterlineModelDef(RoleScopeOverrideClass);

export interface RoleScopeOverrideAttributes extends Sails.WaterlineAttributes {
  createdBy: string;
  effect: RoleScopeEffect;
  reason?: string;
  role: string | number | RoleAttributes;
  scopeKey: string;
}

export interface RoleScopeOverrideWaterlineModel extends Sails.Model<RoleScopeOverrideAttributes> {
  attributes: RoleScopeOverrideAttributes;
}

declare global {
  const RoleScopeOverride: RoleScopeOverrideWaterlineModel;
}
