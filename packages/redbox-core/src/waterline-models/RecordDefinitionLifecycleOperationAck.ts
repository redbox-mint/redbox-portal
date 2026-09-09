/// <reference path="../sails.ts" />
import { isProxy } from 'node:util/types';
import {
  RECORD_DEFINITION_NOTE_MAX_LENGTH,
  RECORD_DEFINITION_REFERENCE_PATTERN,
  type RecordDefinitionId,
  type RecordDefinitionKey,
  type RecordTypeIdentityDto,
} from '@researchdatabox/sails-ng-common';
import { deriveRecordDefinitionRevisionId, recordTypeIdentitySchema } from '../record-workflow-administration';
import {
  Attr,
  BeforeCreate,
  BeforeDestroy,
  BeforeUpdate,
  BelongsTo,
  buildInvalidNewRecordError,
  Entity,
  toWaterlineModelDef,
} from '../decorators';
import type { RuntimeRecord, RuntimeValue } from '../runtimeValues';
import { isRuntimeRecord } from '../runtimeValues';
import type { BrandingConfigAttributes } from './BrandingConfig';
import type {
  RecordDefinitionLifecycleOperation,
  RecordDefinitionLifecycleOperationKind,
  RecordTypeAttributes,
} from './RecordType';
import {
  canonicalOwner,
  isNonNegativeSafeInteger,
  rejectImmutableRow,
  synchronousCreateHook,
} from './recordDefinitionModelSupport';

const OPERATION_KINDS: readonly RecordDefinitionLifecycleOperationKind[] = [
  'publish',
  'rollback',
  'retire',
  'unretire',
];
const OPERATION_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HISTORY_ID_PATTERN = /^rdh_[a-f0-9]{32}$/u;

function ownDataRecord(value: RuntimeValue): RuntimeRecord | null {
  if (!isRuntimeRecord(value) || isProxy(value)) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (
      Reflect.ownKeys(value).some(key => typeof key !== 'string') ||
      Object.values(descriptors).some(item => !('value' in item))
    ) {
      return null;
    }
    return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value]));
  } catch {
    return null;
  }
}

const beforeCreate = synchronousCreateHook(record => {
  const owner = canonicalOwner(record, 'RecordDefinitionLifecycleOperationAck');
  const identity = recordTypeIdentitySchema.safeParse(record.identity as RuntimeValue);
  if (
    !identity.success ||
    identity.data.id !== owner.recordTypeId ||
    identity.data.brandId !== owner.brandId ||
    identity.data.key !== owner.recordTypeKey ||
    identity.data.version !== record.identityVersion
  ) {
    throw buildInvalidNewRecordError(
      'RecordDefinitionLifecycleOperationAck.identity does not match the operation owner'
    );
  }
  const operationRecord = ownDataRecord(record.operation);
  if (operationRecord === null) {
    throw buildInvalidNewRecordError('RecordDefinitionLifecycleOperationAck.operation is invalid');
  }
  const operation = operationRecord as object as RecordDefinitionLifecycleOperation;
  const expectedRevisionNumber =
    operation.kind === 'publish' || operation.kind === 'rollback' ? operation.targetRevisionNumber : null;
  const occurredAt = new Date(operation.occurredAt);
  const operationActor = ownDataRecord(operation.actor);
  if (
    !OPERATION_TOKEN_PATTERN.test(operation.token) ||
    !HISTORY_ID_PATTERN.test(operation.historyId) ||
    operation.phase !== 'activated' ||
    !isNonNegativeSafeInteger(operation.expectedIdentityVersion) ||
    !isNonNegativeSafeInteger(operation.identityVersion) ||
    (operation.expectedActiveRevisionNumber !== null &&
      (!Number.isSafeInteger(operation.expectedActiveRevisionNumber) || operation.expectedActiveRevisionNumber < 1)) ||
    typeof operation.occurredAt !== 'string' ||
    !Number.isFinite(occurredAt.getTime()) ||
    occurredAt.toISOString() !== operation.occurredAt ||
    operationActor === null ||
    typeof operationActor.id !== 'string' ||
    !RECORD_DEFINITION_REFERENCE_PATTERN.test(operationActor.id) ||
    (operation.note !== undefined &&
      (typeof operation.note !== 'string' ||
        operation.note.trim() !== operation.note ||
        operation.note.length === 0 ||
        operation.note.length > RECORD_DEFINITION_NOTE_MAX_LENGTH)) ||
    operation.token !== record.id ||
    operation.kind !== record.kind ||
    operation.historyId !== record.historyId ||
    operation.identityVersion !== record.identityVersion ||
    operation.expectedIdentityVersion + 1 !== operation.identityVersion ||
    record.revisionNumber !== expectedRevisionNumber
  ) {
    throw buildInvalidNewRecordError(
      'RecordDefinitionLifecycleOperationAck.operation does not prove the acknowledged result'
    );
  }
  if (operation.kind === 'publish' || operation.kind === 'rollback') {
    const expectedRevisionId = deriveRecordDefinitionRevisionId(owner, operation.targetRevisionNumber);
    const source = ownDataRecord(operation.source);
    if (
      source === null ||
      !Number.isSafeInteger(operation.targetRevisionNumber) ||
      operation.targetRevisionNumber < 1 ||
      (operation.kind === 'publish' && !isNonNegativeSafeInteger(operation.expectedDraftVersion)) ||
      (operation.kind === 'rollback' && operation.expectedDraftVersion !== null) ||
      operation.targetRevisionId !== expectedRevisionId ||
      identity.data.activeRevision?.id !== expectedRevisionId ||
      identity.data.activeRevision.revisionNumber !== operation.targetRevisionNumber ||
      identity.data.activeRevision.canonicalHash !== operation.canonicalHash ||
      source.operation !== operation.kind ||
      (operation.kind === 'publish' && source.sourceRevisionNumber !== operation.expectedActiveRevisionNumber) ||
      (operation.kind === 'rollback' &&
        (!Number.isSafeInteger(source.sourceRevisionNumber) || Number(source.sourceRevisionNumber) < 1))
    ) {
      throw buildInvalidNewRecordError(
        'RecordDefinitionLifecycleOperationAck.operation does not prove the acknowledged revision'
      );
    }
  } else if (
    operation.expectedDraftVersion !== null ||
    (identity.data.activeRevision?.revisionNumber ?? null) !== operation.expectedActiveRevisionNumber ||
    (identity.data.retirement !== null) !== (operation.kind === 'retire')
  ) {
    throw buildInvalidNewRecordError(
      'RecordDefinitionLifecycleOperationAck.operation does not prove the acknowledged retirement state'
    );
  }
});
const beforeUpdate = rejectImmutableRow('RecordDefinitionLifecycleOperationAck', 'updated');
const beforeDestroy = rejectImmutableRow('RecordDefinitionLifecycleOperationAck', 'deleted');

/**
 * Short-lived durable proof that a B05 identity CAS completed. The immutable
 * revision/history rows remain the permanent evidence; this row only resolves
 * lost acknowledgements without guessing from later active state.
 */
@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@BeforeDestroy(beforeDestroy)
@Entity('recorddefinitionlifecycleoperationack', {
  dontUseObjectIds: true,
  indexes: [
    { attributes: { recordType: 1, identityVersion: 1 }, unique: true },
    { attributes: { branding: 1, recordTypeKey: 1, identityVersion: 1 }, unique: true },
    { attributes: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
  ],
})
export class RecordDefinitionLifecycleOperationAckClass {
  @Attr({ type: 'string', required: true, unique: true })
  public id!: string;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @BelongsTo('recordtype', { required: true })
  public recordType!: string | number;

  @Attr({ type: 'string', required: true })
  public recordTypeId!: RecordDefinitionId;

  @Attr({ type: 'string', required: true })
  public recordTypeKey!: RecordDefinitionKey;

  @Attr({ type: 'string', required: true, isIn: OPERATION_KINDS })
  public kind!: RecordDefinitionLifecycleOperationKind;

  @Attr({ type: 'number', required: true, custom: isNonNegativeSafeInteger })
  public identityVersion!: number;

  @Attr({ type: 'string', required: true })
  public historyId!: string;

  @Attr({ type: 'number', allowNull: true })
  public revisionNumber!: number | null;

  @Attr({ type: 'json', required: true })
  public identity!: RecordTypeIdentityDto;

  @Attr({ type: 'json', required: true })
  public operation!: RecordDefinitionLifecycleOperation;

  @Attr({ type: 'ref', columnType: 'datetime', required: true })
  public expiresAt!: Date;
}

export const RecordDefinitionLifecycleOperationAckWLDef = toWaterlineModelDef(
  RecordDefinitionLifecycleOperationAckClass
);

export interface RecordDefinitionLifecycleOperationAckAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  expiresAt: Date;
  historyId: string;
  identity: RecordTypeIdentityDto;
  identityVersion: number;
  kind: RecordDefinitionLifecycleOperationKind;
  operation: RecordDefinitionLifecycleOperation;
  recordType: string | number | RecordTypeAttributes;
  recordTypeId: RecordDefinitionId;
  recordTypeKey: RecordDefinitionKey;
  revisionNumber: number | null;
}

export interface RecordDefinitionLifecycleOperationAckWaterlineModel extends Sails.Model<RecordDefinitionLifecycleOperationAckAttributes> {
  attributes: RecordDefinitionLifecycleOperationAckAttributes;
}

declare global {
  const RecordDefinitionLifecycleOperationAck: RecordDefinitionLifecycleOperationAckWaterlineModel;
}
