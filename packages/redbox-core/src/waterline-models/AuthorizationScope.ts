/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, Entity, toWaterlineModelDef } from '../decorators';
import {
  AUTHORIZATION_SCOPE_RISKS,
  AUTHORIZATION_SCOPE_SOURCE_TYPES,
  AUTHORIZATION_SCOPE_STATUSES,
  asScopeKey,
  getScopeNamespace,
  type AuthorizationScopeRisk,
  type AuthorizationScopeSourceType,
  type AuthorizationScopeStatus,
} from '../authorization';

const prepareScope = (record: Record<string, unknown>, isCreate: boolean): void => {
  if (!isCreate && Object.hasOwn(record, 'key')) {
    throw new Error('AuthorizationScope.key is immutable.');
  }
  if (!isCreate) {
    return;
  }
  if (typeof record.key !== 'string') {
    throw new Error('AuthorizationScope.key is required.');
  }
  const key = asScopeKey(record.key);
  const namespace = getScopeNamespace(key);
  if (record.namespace !== namespace) {
    throw new Error('AuthorizationScope.namespace must match the scope key namespace.');
  }
  if (!Number.isInteger(record.metadataVersion) || Number(record.metadataVersion) < 1) {
    throw new Error('AuthorizationScope.metadataVersion must be a positive integer.');
  }
  if (typeof record.replacementKey === 'string' && record.replacementKey.trim().length === 0) {
    delete record.replacementKey;
  } else if (record.replacementKey != null) {
    if (record.status !== 'deprecated') {
      throw new Error('AuthorizationScope.replacementKey is only valid for deprecated scopes.');
    }
    const replacementKey = asScopeKey(String(record.replacementKey));
    if (replacementKey === key) {
      throw new Error('AuthorizationScope.replacementKey cannot reference itself.');
    }
  }
};

const beforeCreate = (record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  try {
    prepareScope(record, true);
    proceed();
  } catch (error) {
    proceed(error instanceof Error ? error : new Error(String(error)));
  }
};

const beforeUpdate = (record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  try {
    prepareScope(record, false);
    proceed();
  } catch (error) {
    proceed(error instanceof Error ? error : new Error(String(error)));
  }
};

@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@Entity('authorizationscope', {
  indexes: [
    { attributes: { key: 1 }, unique: true },
    { attributes: { namespace: 1, status: 1, key: 1 } },
    { attributes: { sourcePackage: 1, status: 1 } },
  ],
})
export class AuthorizationScopeClass {
  @Attr({ type: 'string', required: true })
  public key!: string;

  @Attr({ type: 'string', required: true })
  public namespace!: string;

  @Attr({ type: 'string', required: true })
  public label!: string;

  @Attr({ type: 'string', required: true })
  public description!: string;

  @Attr({ type: 'string', required: true, isIn: AUTHORIZATION_SCOPE_RISKS })
  public risk!: AuthorizationScopeRisk;

  @Attr({ type: 'string', required: true, isIn: AUTHORIZATION_SCOPE_SOURCE_TYPES })
  public sourceType!: AuthorizationScopeSourceType;

  @Attr({ type: 'string', required: true })
  public sourcePackage!: string;

  @Attr({ type: 'string', required: true })
  public sourceVersion!: string;

  @Attr({ type: 'string', required: true, isIn: AUTHORIZATION_SCOPE_STATUSES })
  public status!: AuthorizationScopeStatus;

  @Attr({ type: 'string' })
  public replacementKey?: string;

  @Attr({ type: 'string', required: true })
  public lastSeenGeneration!: string;

  @Attr({ type: 'number', required: true })
  public metadataVersion!: number;
}

export const AuthorizationScopeWLDef = toWaterlineModelDef(AuthorizationScopeClass);

export interface AuthorizationScopeAttributes extends Sails.WaterlineAttributes {
  description: string;
  key: string;
  label: string;
  lastSeenGeneration: string;
  metadataVersion: number;
  namespace: string;
  replacementKey?: string;
  risk: AuthorizationScopeRisk;
  sourcePackage: string;
  sourceType: AuthorizationScopeSourceType;
  sourceVersion: string;
  status: AuthorizationScopeStatus;
}

export interface AuthorizationScopeWaterlineModel extends Sails.Model<AuthorizationScopeAttributes> {
  attributes: AuthorizationScopeAttributes;
}

declare global {
  const AuthorizationScope: AuthorizationScopeWaterlineModel;
}
