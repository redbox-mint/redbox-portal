/// <reference path="../sails.ts" />
import { Attr, BeforeCreate, BeforeUpdate, BelongsTo, Entity, toWaterlineModelDef } from '../decorators';
import {
  ROLE_ASSIGNMENT_SOURCES,
  ROLE_ASSIGNMENT_STATUSES,
  type RoleAssignmentSource,
  type RoleAssignmentStatus,
  validateRoleAssignmentPersistenceContext,
} from '../authorization';
import type { BrandingConfigAttributes } from './BrandingConfig';
import type { RoleAttributes } from './Role';

const isAssignmentSource = (value: unknown): value is RoleAssignmentSource =>
  typeof value === 'string' && ROLE_ASSIGNMENT_SOURCES.some(source => source === value);

const isAssignmentStatus = (value: unknown): value is RoleAssignmentStatus =>
  typeof value === 'string' && ROLE_ASSIGNMENT_STATUSES.some(status => status === value);

const optionalDate = (value: unknown): string | Date | null | undefined => {
  if (value == null || typeof value === 'string' || value instanceof Date) {
    return value;
  }
  return undefined;
};

const optionalString = (value: unknown): string | null | undefined => {
  if (value == null || typeof value === 'string') {
    return value;
  }
  return undefined;
};

const associationValue = (value: unknown): string | number | undefined =>
  typeof value === 'string' || typeof value === 'number' ? value : undefined;

const prepareAssignment = (record: Record<string, unknown>): void => {
  for (const optionalField of ['expiresAt', 'reason', 'revokedAt', 'revokedBy', 'suppressedAt', 'suppressedBy']) {
    if (record[optionalField] === '') {
      delete record[optionalField];
    }
  }
  if (record.principalType !== 'user') {
    throw new Error('RoleAssignment.principalType must be user in phase one.');
  }
  if (typeof record.principalId !== 'string' || record.principalId.trim().length === 0) {
    throw new Error('RoleAssignment.principalId is required.');
  }
  if (!isAssignmentSource(record.source) || !isAssignmentStatus(record.status)) {
    throw new Error('RoleAssignment.source or RoleAssignment.status is invalid.');
  }
  if (typeof record.sourceKey !== 'string' || record.sourceKey.trim().length === 0) {
    throw new Error('RoleAssignment.sourceKey is required.');
  }
  if (typeof record.assignedBy !== 'string' || record.assignedBy.trim().length === 0) {
    throw new Error('RoleAssignment.assignedBy is required.');
  }
  if (record.sourcePresent !== true && record.sourcePresent !== false) {
    throw new Error('RoleAssignment.sourcePresent is required.');
  }
  if (!Number.isInteger(record.version) || Number(record.version) < 1) {
    throw new Error('RoleAssignment.version must be a positive integer.');
  }
  const assignedAt = optionalDate(record.assignedAt);
  if (assignedAt == null || Number.isNaN(new Date(assignedAt).getTime())) {
    throw new Error('RoleAssignment.assignedAt must be a valid date.');
  }
  if (record.expiresAt != null) {
    const expiresAt = optionalDate(record.expiresAt);
    if (expiresAt == null || Number.isNaN(new Date(expiresAt).getTime())) {
      throw new Error('RoleAssignment.expiresAt must be a valid date.');
    }
  }
  if (associationValue(record.role) === undefined) {
    throw new Error('RoleAssignment.role is required.');
  }
  validateRoleAssignmentPersistenceContext({
    branding: associationValue(record.branding),
    source: record.source,
    status: record.status,
    revokedAt: optionalDate(record.revokedAt),
    revokedBy: optionalString(record.revokedBy),
    suppressedAt: optionalDate(record.suppressedAt),
    suppressedBy: optionalString(record.suppressedBy),
  });
};

const beforeCreate = (record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  try {
    prepareAssignment(record);
    proceed();
  } catch (error) {
    proceed(error instanceof Error ? error : new Error(String(error)));
  }
};

const beforeUpdate = (record: Record<string, unknown>, proceed: (err?: Error) => void): void => {
  const immutableFields = ['principalType', 'principalId', 'role', 'branding', 'source', 'sourceKey'];
  if (immutableFields.some(field => Object.hasOwn(record, field))) {
    proceed(new Error(`RoleAssignment source tuple fields are immutable: ${immutableFields.join(', ')}.`));
    return;
  }
  proceed();
};

@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@Entity('roleassignment', {
  indexes: [
    {
      attributes: { principalType: 1, principalId: 1, role: 1, source: 1, sourceKey: 1 },
      unique: true,
    },
    { attributes: { principalType: 1, principalId: 1, status: 1, expiresAt: 1 } },
    { attributes: { branding: 1, role: 1, status: 1 } },
    { attributes: { role: 1, status: 1 } },
    { attributes: { source: 1, sourceKey: 1, status: 1, sourcePresent: 1 } },
    { attributes: { expiresAt: 1, status: 1 } },
  ],
})
export class RoleAssignmentClass {
  @Attr({ type: 'string', required: true, isIn: ['user'] })
  public principalType!: 'user';

  @Attr({ type: 'string', required: true })
  public principalId!: string;

  @BelongsTo('role', { required: true })
  public role!: string | number;

  @BelongsTo('brandingconfig')
  public branding?: string | number;

  @Attr({ type: 'string', required: true, isIn: ROLE_ASSIGNMENT_SOURCES })
  public source!: RoleAssignmentSource;

  @Attr({ type: 'string', required: true })
  public sourceKey!: string;

  @Attr({ type: 'string', required: true, isIn: ROLE_ASSIGNMENT_STATUSES })
  public status!: RoleAssignmentStatus;

  @Attr({ type: 'boolean', required: true })
  public sourcePresent!: boolean;

  @Attr({ type: 'string', required: true })
  public assignedBy!: string;

  @Attr({ type: 'string', columnType: 'datetime', required: true })
  public assignedAt!: string | Date;

  @Attr({ type: 'string', columnType: 'datetime', allowNull: true })
  public expiresAt?: string | Date | null;

  @Attr({ type: 'string', allowNull: true })
  public revokedBy?: string | null;

  @Attr({ type: 'string', columnType: 'datetime', allowNull: true })
  public revokedAt?: string | Date | null;

  @Attr({ type: 'string', allowNull: true })
  public suppressedBy?: string | null;

  @Attr({ type: 'string', columnType: 'datetime', allowNull: true })
  public suppressedAt?: string | Date | null;

  @Attr({ type: 'string' })
  public reason?: string;

  @Attr({ type: 'number', required: true })
  public version!: number;
}

export const RoleAssignmentWLDef = toWaterlineModelDef(RoleAssignmentClass);

export interface RoleAssignmentAttributes extends Sails.WaterlineAttributes {
  assignedAt: string | Date;
  assignedBy: string;
  branding?: string | number | BrandingConfigAttributes;
  expiresAt?: string | Date | null;
  principalId: string;
  principalType: 'user';
  reason?: string;
  revokedAt?: string | Date | null;
  revokedBy?: string | null;
  role: string | number | RoleAttributes;
  source: RoleAssignmentSource;
  sourceKey: string;
  sourcePresent: boolean;
  status: RoleAssignmentStatus;
  suppressedAt?: string | Date | null;
  suppressedBy?: string | null;
  version: number;
}

export interface RoleAssignmentCreateRecord {
  assignedAt: string | Date;
  assignedBy: string;
  branding?: string | number;
  expiresAt?: string | Date;
  principalId: string;
  principalType: 'user';
  reason?: string;
  revokedAt?: string | Date;
  revokedBy?: string;
  role: string | number;
  source: RoleAssignmentSource;
  sourceKey: string;
  sourcePresent: boolean;
  status: RoleAssignmentStatus;
  suppressedAt?: string | Date;
  suppressedBy?: string;
  version: number;
}

export interface RoleAssignmentWaterlineModel extends Sails.Model<RoleAssignmentAttributes> {
  attributes: RoleAssignmentAttributes;
}

declare global {
  const RoleAssignment: RoleAssignmentWaterlineModel;
}
