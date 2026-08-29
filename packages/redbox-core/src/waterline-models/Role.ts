/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, BelongsTo, Entity, HasMany, toWaterlineModelDef } from '../decorators';
import {
  AUTHORIZATION_ROLE_STATUSES,
  PROTECTED_ROLE_KINDS,
  ROLE_CONTEXT_TYPES,
  type AuthorizationRoleStatus,
  type ProtectedRoleKind,
  type RoleContextType,
  validateRolePersistenceContext,
} from '../authorization';
import { BrandingConfigAttributes } from './BrandingConfig';
import type { RoleTemplateAttributes } from './RoleTemplate';

const validatePositiveVersion = (value: unknown): boolean => Number.isInteger(value) && Number(value) >= 1;

const isRoleContextType = (value: unknown): value is RoleContextType =>
  ROLE_CONTEXT_TYPES.some(contextType => contextType === value);

const isProtectedRoleKind = (value: unknown): value is ProtectedRoleKind =>
  PROTECTED_ROLE_KINDS.some(protectedKind => protectedKind === value);

const isAuthorizationRoleStatus = (value: unknown): value is AuthorizationRoleStatus =>
  AUTHORIZATION_ROLE_STATUSES.some(status => status === value);

const roleBrandingIdentity = (value: unknown): string | number | { readonly id: string | number } | undefined => {
  if (typeof value === 'string') {
    return value.length > 0 ? value : undefined;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = value.id;
    if (typeof id === 'string' || typeof id === 'number') {
      return { id };
    }
  }
  return undefined;
};

const IMMUTABLE_IDENTITY_FIELDS = ['name', 'key', 'identityKey'] as const;

const prepareAuthorizationRole = (record: Record<string, unknown>, isCreate: boolean): void => {
  // The identity guard runs before the authorization-field gate: `name` is the legacy
  // compatibility key embedded in record ACLs and Solr, so a legacy-shaped update that
  // touches only `name` must still be rejected.
  if (!isCreate && IMMUTABLE_IDENTITY_FIELDS.some(field => Object.hasOwn(record, field))) {
    throw new Error('Role.name, Role.key, and Role.identityKey are immutable compatibility identity fields.');
  }
  if (!isCreate) {
    return;
  }
  const contextType = record.contextType;
  // `contextType` explicitly opts a row into the additive authorization contract.
  // Legacy bootstrap/config records can contain adapter-supplied defaults for the
  // other optional attributes and must continue to persist without opting in.
  if (!isRoleContextType(contextType)) {
    // Sparse Mongo indexes skip a missing field, not Waterline's empty-string
    // default for optional scalar attributes.
    delete record.identityKey;
    return;
  }
  const name = typeof record.name === 'string' ? record.name : '';
  const key = typeof record.key === 'string' ? record.key : '';
  // Waterline materialises an omitted optional string as `''`, so nullish coalescing
  // alone would never reach the documented `none` default.
  const protectedKind = record.protectedKind === '' || record.protectedKind == null ? 'none' : record.protectedKind;
  const status = record.status;
  if (!isProtectedRoleKind(protectedKind)) {
    throw new Error('Role.protectedKind is invalid.');
  }
  if (typeof record.displayName !== 'string' || record.displayName.trim().length === 0) {
    throw new Error('Role.displayName is required for authorization-aware roles.');
  }
  if (!isAuthorizationRoleStatus(status)) {
    throw new Error('Role.status is required for authorization-aware roles.');
  }
  if (!validatePositiveVersion(record.version)) {
    throw new Error('Role.version must be a positive integer.');
  }
  const hasTemplate = roleBrandingIdentity(record.template) !== undefined;
  const hasTemplateRevision = Number.isInteger(record.templateRevision) && Number(record.templateRevision) >= 1;
  if (hasTemplate !== hasTemplateRevision) {
    throw new Error('Role.template and Role.templateRevision must either both be set or both be absent.');
  }
  if (!hasTemplateRevision) {
    delete record.templateRevision;
  }
  record.identityKey = validateRolePersistenceContext({
    name,
    key,
    contextType,
    branding: roleBrandingIdentity(record.branding),
    protectedKind,
    identityKey:
      typeof record.identityKey === 'string' && record.identityKey.length > 0 ? record.identityKey : undefined,
  });
};

const beforeCreate = (record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  try {
    prepareAuthorizationRole(record, true);
    proceed();
  } catch (error) {
    proceed(error instanceof Error ? error : new Error(String(error)));
  }
};

const beforeUpdate = (record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  try {
    prepareAuthorizationRole(record, false);
    proceed();
  } catch (error) {
    proceed(error instanceof Error ? error : new Error(String(error)));
  }
};

@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@Entity('role', {
  indexes: [
    { attributes: { identityKey: 1 }, unique: true, sparse: true },
    {
      attributes: { branding: 1, key: 1 },
      partialFilterExpression: { key: { $type: 'string' } },
    },
    {
      attributes: { branding: 1, status: 1, displayName: 1 },
      partialFilterExpression: { displayName: { $type: 'string' }, status: { $type: 'string' } },
    },
    {
      attributes: { template: 1, templateRevision: 1 },
      partialFilterExpression: { template: { $exists: true }, templateRevision: { $exists: true } },
    },
  ],
})
export class RoleClass {
  @Attr({ type: 'string', required: true })
  public name!: string;

  @BelongsTo('brandingconfig')
  public branding?: string | number;

  @HasMany('user', 'roles', { dominant: true })
  public users?: unknown[];

  @Attr({ type: 'string' })
  public key?: string;

  @Attr({ type: 'string' })
  public identityKey?: string;

  @Attr({ type: 'string' })
  public displayName?: string;

  @Attr({ type: 'string' })
  public description?: string;

  @Attr({ type: 'string', isIn: ROLE_CONTEXT_TYPES })
  public contextType?: RoleContextType;

  @BelongsTo('roletemplate')
  public template?: string | number;

  @Attr({ type: 'number' })
  public templateRevision?: number;

  @Attr({ type: 'string', isIn: PROTECTED_ROLE_KINDS })
  public protectedKind?: ProtectedRoleKind;

  @Attr({ type: 'string', isIn: AUTHORIZATION_ROLE_STATUSES })
  public status?: AuthorizationRoleStatus;

  @Attr({ type: 'number' })
  public version?: number;

  @Attr({ type: 'string' })
  public createdBy?: string;

  @Attr({ type: 'string' })
  public updatedBy?: string;
}

// Export the Waterline model definition for runtime use
export const RoleWLDef = toWaterlineModelDef(RoleClass);

// Type interface for backwards compatibility
export interface RoleAttributes extends Sails.WaterlineAttributes {
  branding?: string | number | BrandingConfigAttributes;
  contextType?: RoleContextType;
  createdBy?: string;
  description?: string;
  displayName?: string;
  identityKey?: string;
  key?: string;
  name: string;
  protectedKind?: ProtectedRoleKind;
  status?: AuthorizationRoleStatus;
  template?: string | number | RoleTemplateAttributes;
  templateRevision?: number;
  updatedBy?: string;
  users?: unknown[];
  version?: number;
}

export interface RoleWaterlineModel extends Sails.Model<RoleAttributes> {
  attributes: RoleAttributes;
}

declare global {
  const Role: RoleWaterlineModel;
}
