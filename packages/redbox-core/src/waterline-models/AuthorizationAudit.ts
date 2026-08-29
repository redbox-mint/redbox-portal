/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, Entity, toWaterlineModelDef } from '../decorators';
import {
  AUTHORIZATION_AUDIT_ACTOR_TYPES,
  AUTHORIZATION_AUDIT_AUTH_METHODS,
  AUTHORIZATION_AUDIT_EVENT_TYPES,
  AUTHORIZATION_AUDIT_OUTCOMES,
  AUTHORIZATION_AUDIT_TARGET_TYPES,
  redactAuthorizationPersistenceValue,
  sanitizeAuthorizationText,
  type AuthorizationAuditActorType,
  type AuthorizationAuditAuthMethod,
  type AuthorizationAuditEventType,
  type AuthorizationAuditOutcome,
  type AuthorizationAuditTargetType,
  type AuthorizationRedactedValue,
} from '../authorization';

const requiredText = (record: Record<string, unknown>, field: string, maxLength: number): void => {
  const value = sanitizeAuthorizationText(record[field], maxLength);
  if (value === undefined) {
    throw new Error(`AuthorizationAudit.${field} is required.`);
  }
  record[field] = value;
};

const optionalText = (record: Record<string, unknown>, field: string, maxLength: number): void => {
  if (!Object.hasOwn(record, field)) {
    return;
  }
  const value = sanitizeAuthorizationText(record[field], maxLength);
  if (value === undefined) {
    delete record[field];
  } else {
    record[field] = value;
  }
};

const prepareAudit = (record: Record<string, unknown>): void => {
  requiredText(record, 'eventId', 128);
  requiredText(record, 'actorId', 128);
  requiredText(record, 'targetType', 64);
  if (!Number.isInteger(record.schemaVersion) || Number(record.schemaVersion) < 1) {
    throw new Error('AuthorizationAudit.schemaVersion must be a positive integer.');
  }
  if (!AUTHORIZATION_AUDIT_EVENT_TYPES.some(eventType => eventType === record.eventType)) {
    throw new Error('AuthorizationAudit.eventType is invalid.');
  }
  if (!AUTHORIZATION_AUDIT_OUTCOMES.some(outcome => outcome === record.outcome)) {
    throw new Error('AuthorizationAudit.outcome is invalid.');
  }
  if (!AUTHORIZATION_AUDIT_ACTOR_TYPES.some(actorType => actorType === record.actorType)) {
    throw new Error('AuthorizationAudit.actorType is invalid.');
  }
  if (!AUTHORIZATION_AUDIT_AUTH_METHODS.some(authMethod => authMethod === record.authMethod)) {
    throw new Error('AuthorizationAudit.authMethod is invalid.');
  }
  if (!AUTHORIZATION_AUDIT_TARGET_TYPES.some(targetType => targetType === record.targetType)) {
    throw new Error('AuthorizationAudit.targetType is invalid.');
  }
  const occurredAt = record.occurredAt instanceof Date ? record.occurredAt : new Date(String(record.occurredAt ?? ''));
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error('AuthorizationAudit.occurredAt must be a valid date.');
  }
  optionalText(record, 'brandId', 128);
  optionalText(record, 'targetId', 128);
  optionalText(record, 'reasonCode', 128);
  optionalText(record, 'reason', 1_000);
  optionalText(record, 'requestId', 128);
  optionalText(record, 'batchId', 128);
  if (Object.hasOwn(record, 'before')) {
    record.before = redactAuthorizationPersistenceValue(record.before);
  }
  if (Object.hasOwn(record, 'after')) {
    record.after = redactAuthorizationPersistenceValue(record.after);
  }
};

const beforeCreate = (record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  try {
    prepareAudit(record);
    proceed();
  } catch (error) {
    proceed(error instanceof Error ? error : new Error(String(error)));
  }
};

const rejectUpdate = (_record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  proceed(new Error('AuthorizationAudit records are append-only and cannot be updated.'));
};

@BeforeCreate(beforeCreate)
@BeforeUpdate(rejectUpdate)
@Entity('authorizationaudit', {
  indexes: [
    { attributes: { eventId: 1 }, unique: true },
    { attributes: { occurredAt: -1 } },
    { attributes: { brandId: 1, occurredAt: -1 } },
    { attributes: { actorId: 1, occurredAt: -1 } },
    { attributes: { targetType: 1, targetId: 1, occurredAt: -1 } },
    { attributes: { eventType: 1, outcome: 1, occurredAt: -1 } },
  ],
})
export class AuthorizationAuditClass {
  @Attr({ type: 'string', required: true })
  public eventId!: string;

  @Attr({ type: 'number', required: true })
  public schemaVersion!: number;

  @Attr({ type: 'string', required: true, isIn: AUTHORIZATION_AUDIT_EVENT_TYPES })
  public eventType!: AuthorizationAuditEventType;

  @Attr({ type: 'string', required: true, isIn: AUTHORIZATION_AUDIT_OUTCOMES })
  public outcome!: AuthorizationAuditOutcome;

  @Attr({ type: 'string', required: true, isIn: AUTHORIZATION_AUDIT_ACTOR_TYPES })
  public actorType!: AuthorizationAuditActorType;

  @Attr({ type: 'string', required: true })
  public actorId!: string;

  @Attr({ type: 'string', required: true, isIn: AUTHORIZATION_AUDIT_AUTH_METHODS })
  public authMethod!: AuthorizationAuditAuthMethod;

  @Attr({ type: 'string' })
  public brandId?: string;

  @Attr({ type: 'string', required: true, isIn: AUTHORIZATION_AUDIT_TARGET_TYPES })
  public targetType!: AuthorizationAuditTargetType;

  @Attr({ type: 'string' })
  public targetId?: string;

  @Attr({ type: 'json' })
  public before?: AuthorizationRedactedValue;

  @Attr({ type: 'json' })
  public after?: AuthorizationRedactedValue;

  @Attr({ type: 'string' })
  public reasonCode?: string;

  @Attr({ type: 'string' })
  public reason?: string;

  @Attr({ type: 'string' })
  public requestId?: string;

  @Attr({ type: 'string' })
  public batchId?: string;

  @Attr({ type: 'string', columnType: 'datetime', required: true })
  public occurredAt!: string | Date;
}

export const AuthorizationAuditWLDef = toWaterlineModelDef(AuthorizationAuditClass);

export interface AuthorizationAuditAttributes extends Sails.WaterlineAttributes {
  actorId: string;
  actorType: AuthorizationAuditActorType;
  after?: AuthorizationRedactedValue;
  authMethod: AuthorizationAuditAuthMethod;
  batchId?: string;
  before?: AuthorizationRedactedValue;
  brandId?: string;
  eventId: string;
  eventType: AuthorizationAuditEventType;
  occurredAt: string | Date;
  outcome: AuthorizationAuditOutcome;
  reason?: string;
  reasonCode?: string;
  requestId?: string;
  schemaVersion: number;
  targetId?: string;
  targetType: AuthorizationAuditTargetType;
}

export type AuthorizationAuditCreateRecord = Omit<AuthorizationAuditAttributes, 'id'>;

export interface AuthorizationAuditWaterlineModel extends Sails.Model<AuthorizationAuditAttributes> {
  attributes: AuthorizationAuditAttributes;
}

declare global {
  const AuthorizationAudit: AuthorizationAuditWaterlineModel;
}
