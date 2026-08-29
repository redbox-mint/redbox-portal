/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, Entity, toWaterlineModelDef } from '../decorators';
import {
  AUTHORIZATION_DECISION_REASON_CODES,
  AUTHORIZATION_PRINCIPAL_CATEGORIES,
  sanitizeAuthorizationText,
  type AuthorizationDecisionReasonCode,
  type AuthorizationPrincipalCategory,
} from '../authorization';

const OUTCOMES = ['allow', 'deny'] as const;
export type AuthorizationShadowOutcome = (typeof OUTCOMES)[number];

const requiredText = (record: Record<string, unknown>, field: string, maxLength: number): void => {
  const value = sanitizeAuthorizationText(record[field], maxLength);
  if (value === undefined) {
    throw new Error(`AuthorizationShadowMismatch.${field} is required.`);
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

const prepareMismatch = (record: Record<string, unknown>, isCreate: boolean): void => {
  if (!isCreate && Object.hasOwn(record, 'fingerprint')) {
    throw new Error('AuthorizationShadowMismatch.fingerprint is immutable.');
  }
  if (isCreate) {
    requiredText(record, 'fingerprint', 128);
    requiredText(record, 'routeId', 256);
    if (!OUTCOMES.some(outcome => outcome === record.legacyOutcome)) {
      throw new Error('AuthorizationShadowMismatch.legacyOutcome is invalid.');
    }
    if (!OUTCOMES.some(outcome => outcome === record.scopeOutcome)) {
      throw new Error('AuthorizationShadowMismatch.scopeOutcome is invalid.');
    }
    if (!AUTHORIZATION_DECISION_REASON_CODES.some(reasonCode => reasonCode === record.reasonCode)) {
      throw new Error('AuthorizationShadowMismatch.reasonCode is invalid.');
    }
    if (!AUTHORIZATION_PRINCIPAL_CATEGORIES.some(category => category === record.principalCategory)) {
      throw new Error('AuthorizationShadowMismatch.principalCategory is invalid.');
    }
    if (!Number.isInteger(record.count) || Number(record.count) < 1) {
      throw new Error('AuthorizationShadowMismatch.count must be a positive integer.');
    }
  }
  optionalText(record, 'brandId', 128);
  optionalText(record, 'sampleRequestId', 128);
  if (record.resolvedAt === '') {
    delete record.resolvedAt;
  }
};

const beforeCreate = (record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  try {
    prepareMismatch(record, true);
    proceed();
  } catch (error) {
    proceed(error instanceof Error ? error : new Error(String(error)));
  }
};

const beforeUpdate = (record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  try {
    prepareMismatch(record, false);
    proceed();
  } catch (error) {
    proceed(error instanceof Error ? error : new Error(String(error)));
  }
};

@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@Entity('authorizationshadowmismatch', {
  indexes: [
    { attributes: { fingerprint: 1 }, unique: true },
    { attributes: { resolvedAt: 1, lastSeenAt: -1 } },
    { attributes: { brandId: 1, lastSeenAt: -1 } },
  ],
})
export class AuthorizationShadowMismatchClass {
  @Attr({ type: 'string', required: true })
  public fingerprint!: string;

  @Attr({ type: 'string', required: true })
  public routeId!: string;

  @Attr({ type: 'string' })
  public brandId?: string;

  @Attr({ type: 'string', required: true, isIn: OUTCOMES })
  public legacyOutcome!: AuthorizationShadowOutcome;

  @Attr({ type: 'string', required: true, isIn: OUTCOMES })
  public scopeOutcome!: AuthorizationShadowOutcome;

  @Attr({ type: 'string', required: true, isIn: AUTHORIZATION_DECISION_REASON_CODES })
  public reasonCode!: AuthorizationDecisionReasonCode;

  @Attr({ type: 'string', required: true, isIn: AUTHORIZATION_PRINCIPAL_CATEGORIES })
  public principalCategory!: AuthorizationPrincipalCategory;

  @Attr({ type: 'number', required: true })
  public count!: number;

  @Attr({ type: 'string', columnType: 'datetime', required: true })
  public firstSeenAt!: string | Date;

  @Attr({ type: 'string', columnType: 'datetime', required: true })
  public lastSeenAt!: string | Date;

  @Attr({ type: 'string' })
  public sampleRequestId?: string;

  @Attr({ type: 'string', columnType: 'datetime' })
  public resolvedAt?: string | Date;
}

export const AuthorizationShadowMismatchWLDef = toWaterlineModelDef(AuthorizationShadowMismatchClass);

export interface AuthorizationShadowMismatchAttributes extends Sails.WaterlineAttributes {
  brandId?: string;
  count: number;
  fingerprint: string;
  firstSeenAt: string | Date;
  lastSeenAt: string | Date;
  legacyOutcome: AuthorizationShadowOutcome;
  principalCategory: AuthorizationPrincipalCategory;
  reasonCode: AuthorizationDecisionReasonCode;
  resolvedAt?: string | Date;
  routeId: string;
  sampleRequestId?: string;
  scopeOutcome: AuthorizationShadowOutcome;
}

export interface AuthorizationShadowMismatchWaterlineModel extends Sails.Model<AuthorizationShadowMismatchAttributes> {
  attributes: AuthorizationShadowMismatchAttributes;
}

declare global {
  const AuthorizationShadowMismatch: AuthorizationShadowMismatchWaterlineModel;
}
