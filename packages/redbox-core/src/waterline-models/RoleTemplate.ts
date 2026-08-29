/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, Entity, HasMany, toWaterlineModelDef } from '../decorators';
import {
  AUTHORIZATION_ROLE_STATUSES,
  PROTECTED_ROLE_KINDS,
  isNewRoleKey,
  type AuthorizationRoleStatus,
  type ProtectedRoleKind,
} from '../authorization';

const prepareTemplate = (record: Record<string, unknown>, isCreate: boolean): void => {
  if (!isCreate && Object.hasOwn(record, 'key')) {
    throw new Error('RoleTemplate.key is immutable.');
  }
  if (!isCreate) {
    return;
  }
  if (typeof record.key !== 'string' || !isNewRoleKey(record.key)) {
    throw new Error('RoleTemplate.key must use the normalized role-key grammar.');
  }
  if (!Number.isInteger(record.currentRevision) || Number(record.currentRevision) < 1) {
    throw new Error('RoleTemplate.currentRevision must be a positive integer.');
  }
  if (!Number.isInteger(record.version) || Number(record.version) < 1) {
    throw new Error('RoleTemplate.version must be a positive integer.');
  }
};

const beforeCreate = (record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  try {
    prepareTemplate(record, true);
    proceed();
  } catch (error) {
    proceed(error instanceof Error ? error : new Error(String(error)));
  }
};

const beforeUpdate = (record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  try {
    prepareTemplate(record, false);
    proceed();
  } catch (error) {
    proceed(error instanceof Error ? error : new Error(String(error)));
  }
};

@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@Entity('roletemplate', {
  indexes: [{ attributes: { key: 1 }, unique: true }, { attributes: { status: 1, displayName: 1 } }],
})
export class RoleTemplateClass {
  @Attr({ type: 'string', required: true })
  public key!: string;

  @Attr({ type: 'string', required: true })
  public displayName!: string;

  @Attr({ type: 'string', required: true })
  public description!: string;

  @Attr({ type: 'number', required: true })
  public currentRevision!: number;

  @Attr({ type: 'string', required: true, isIn: PROTECTED_ROLE_KINDS })
  public protectedKind!: ProtectedRoleKind;

  @Attr({ type: 'string', required: true, isIn: AUTHORIZATION_ROLE_STATUSES })
  public status!: AuthorizationRoleStatus;

  @Attr({ type: 'number', required: true })
  public version!: number;

  @HasMany('roletemplaterevision', 'template')
  public revisions?: unknown[];
}

export const RoleTemplateWLDef = toWaterlineModelDef(RoleTemplateClass);

export interface RoleTemplateAttributes extends Sails.WaterlineAttributes {
  currentRevision: number;
  description: string;
  displayName: string;
  key: string;
  protectedKind: ProtectedRoleKind;
  revisions?: unknown[];
  status: AuthorizationRoleStatus;
  version: number;
}

export interface RoleTemplateWaterlineModel extends Sails.Model<RoleTemplateAttributes> {
  attributes: RoleTemplateAttributes;
}

declare global {
  const RoleTemplate: RoleTemplateWaterlineModel;
}
