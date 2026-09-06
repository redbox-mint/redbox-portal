/// <reference path="../sails.ts" />
import { Entity, Attr, toWaterlineModelDef } from '../decorators';

export const USER_MUTATION_OPERATION_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;

export type UserMutationOperationStatus = (typeof USER_MUTATION_OPERATION_STATUSES)[number];

export const USER_MUTATION_OPERATION_KINDS = ['create', 'update'] as const;

export type UserMutationOperationKind = (typeof USER_MUTATION_OPERATION_KINDS)[number];

@Entity('usermutationoperation', {
  indexes: [
    // AUTH-SAGA-001 durable user composite saga/outbox key: one row per
    // stable operation ID carries pending/running/completed/failed
    // transitions for bounded idempotent reconciliation and restart-safe
    // recovery. Mirrored in AUTHORIZATION_PERSISTENCE_MODEL_INDEXES.
    { attributes: { operationId: 1 }, unique: true },
    { attributes: { brandId: 1, status: 1 } },
    { attributes: { username: 1, status: 1 } },
  ],
})
export class UserMutationOperationClass {
  @Attr({ type: 'string', required: true })
  public operationId!: string;

  @Attr({ type: 'string', required: true, isIn: USER_MUTATION_OPERATION_KINDS })
  public kind!: UserMutationOperationKind;

  @Attr({ type: 'string', required: true })
  public brandId!: string;

  @Attr({ type: 'string', required: true })
  public username!: string;

  @Attr({ type: 'string' })
  public userId?: string;

  @Attr({ type: 'string', required: true, isIn: USER_MUTATION_OPERATION_STATUSES })
  public status!: UserMutationOperationStatus;

  @Attr({ type: 'number', required: true })
  public attemptCount!: number;

  /**
   * AUTH-SAGA-001 durable plan: bounded intended role IDs validated BEFORE
   * any profile mutation; `createdIsNew` tracks whether this operation
   * created the row (compensable) or merged onto a pre-existing duplicate
   * (never destroy). Recovery consumes ONLY this stored plan.
   */
  @Attr({ type: 'json' })
  public roleIds?: string[];

  @Attr({ type: 'boolean' })
  public createdIsNew?: boolean;

  @Attr({ type: 'string' })
  public requestId?: string;

  @Attr({ type: 'string' })
  public lastError?: string;
}

export const UserMutationOperationWLDef = toWaterlineModelDef(UserMutationOperationClass);

export interface UserMutationOperationAttributes extends Sails.WaterlineAttributes {
  operationId: string;
  kind: UserMutationOperationKind;
  brandId: string;
  username: string;
  userId?: string;
  status: UserMutationOperationStatus;
  attemptCount: number;
  roleIds?: string[];
  createdIsNew?: boolean;
  requestId?: string;
  lastError?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface UserMutationOperationWaterlineModel extends Sails.Model<UserMutationOperationAttributes> {
  attributes: UserMutationOperationAttributes;
}

declare global {
  const UserMutationOperation: UserMutationOperationWaterlineModel;
}
