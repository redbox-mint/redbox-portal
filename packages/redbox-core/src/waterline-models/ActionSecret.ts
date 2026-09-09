/// <reference path="../sails.ts" />
import type {
  RecordDefinitionActorDto,
  RecordDefinitionId,
  RecordDefinitionKey,
} from '@researchdatabox/sails-ng-common';
import type { ActionBindingId, ActionSecretSlotId } from '../action-registry';
import { Attr, BeforeCreate, BeforeUpdate, BelongsTo, Entity, toWaterlineModelDef } from '../decorators';
import type { BrandingConfigAttributes } from './BrandingConfig';
import type { RecordTypeAttributes } from './RecordType';
import type { RuntimeValue } from '../runtimeValues';
import {
  assertCanonicalSecretIdentity,
  rejectImmutableFields,
  synchronousCreateHook,
} from './recordDefinitionModelSupport';

import { isProtectedActionSecretEnvelope } from '../services/action-secrets/envelope';

const ACTION_SECRET_STORAGE_SCHEMA_VERSION = 1 as const;

const customToJSON = function customToJSON(
  this: ActionSecretAttributes
): Omit<ActionSecretAttributes, 'protectedValue'> {
  const { protectedValue: _protectedValue, ...serialized } = this;
  return serialized;
};

const beforeCreate = synchronousCreateHook(record => {
  if (record.protectedValue !== null && !isProtectedActionSecretEnvelope(record.protectedValue))
    throw new Error('Invalid protected action secret.');
  assertCanonicalSecretIdentity(record, 'ActionSecret');
});
const immutableUpdate = rejectImmutableFields('ActionSecret', [
  'id',
  'schemaVersion',
  'branding',
  'recordType',
  'recordTypeId',
  'recordTypeKey',
  'bindingId',
  'parameterName',
  'createdBy',
]);

const beforeUpdate: typeof immutableUpdate = (record, proceed) => {
  if (
    Object.hasOwn(record, 'protectedValue') &&
    record.protectedValue !== null &&
    !isProtectedActionSecretEnvelope(record.protectedValue)
  ) {
    return proceed(new Error('Invalid protected action secret.'));
  }
  return immutableUpdate(record, proceed);
};

@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@Entity('actionsecret', {
  customToJSON,
  dontUseObjectIds: true,
  indexes: [
    { attributes: { branding: 1, recordType: 1, bindingId: 1, parameterName: 1 }, unique: true },
    { attributes: { recordTypeId: 1, bindingId: 1, parameterName: 1 }, unique: true },
    { attributes: { recordType: 1, bindingId: 1 } },
  ],
})
export class ActionSecretClass {
  @Attr({ type: 'string', required: true, unique: true })
  public id!: ActionSecretSlotId;

  @Attr({
    type: 'number',
    defaultsTo: ACTION_SECRET_STORAGE_SCHEMA_VERSION,
    custom: (value: RuntimeValue): boolean => value === ACTION_SECRET_STORAGE_SCHEMA_VERSION,
  })
  public schemaVersion!: number;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @BelongsTo('recordtype', { required: true })
  public recordType!: string | number;

  @Attr({ type: 'string', required: true })
  public recordTypeId!: RecordDefinitionId;

  @Attr({ type: 'string', required: true })
  public recordTypeKey!: RecordDefinitionKey;

  @Attr({ type: 'string', required: true })
  public bindingId!: ActionBindingId;

  @Attr({ type: 'string', required: true })
  public parameterName!: string;

  /** Opaque provider-owned representation. APIs and model serialization never return it. */
  @Attr({ type: 'string', allowNull: true })
  public protectedValue!: string | null;

  /** Native administration CAS counter. Null ciphertext is a clear tombstone, retaining this counter. */
  @Attr({
    type: 'number',
    defaultsTo: 0,
    custom: (value: RuntimeValue): boolean =>
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2_147_483_647,
  })
  public adminVersion!: number;

  @Attr({ type: 'json', required: true })
  public createdBy!: RecordDefinitionActorDto;

  @Attr({ type: 'json', required: true })
  public updatedBy!: RecordDefinitionActorDto;
}

export const ActionSecretWLDef = toWaterlineModelDef(ActionSecretClass);

export interface ActionSecretAttributes extends Sails.WaterlineAttributes {
  bindingId: ActionBindingId;
  branding: string | number | BrandingConfigAttributes;
  createdAt?: string;
  createdBy: RecordDefinitionActorDto;
  id: ActionSecretSlotId;
  parameterName: string;
  protectedValue: string | null;
  adminVersion?: number;
  recordType: string | number | RecordTypeAttributes;
  recordTypeId: RecordDefinitionId;
  recordTypeKey: RecordDefinitionKey;
  schemaVersion: number;
  updatedAt?: string;
  updatedBy: RecordDefinitionActorDto;
}

export interface ActionSecretWaterlineModel extends Sails.Model<ActionSecretAttributes> {
  attributes: ActionSecretAttributes;
}

declare global {
  const ActionSecret: ActionSecretWaterlineModel;
}
