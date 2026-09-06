/// <reference path="../sails.ts" />
import { Entity, Attr, toWaterlineModelDef } from '../decorators';

export const USER_LINK_OPERATION_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;

export type UserLinkOperationStatus = (typeof USER_LINK_OPERATION_STATUSES)[number];

@Entity('userlinkoperation', {
  indexes: [
    // AUTH-TXN-001 durable operation/outbox key (mirrored in
    // `AUTHORIZATION_PERSISTENCE_MODEL_INDEXES` and migration
    // 20260905T120000-account-link-uniqueness).
    { attributes: { operationId: 1 }, unique: true },
    { attributes: { brandId: 1, status: 1 } },
    { attributes: { secondaryUserId: 1, status: 1 } },
  ],
})
export class UserLinkOperationClass {
  @Attr({ type: 'string', required: true })
  public operationId!: string;

  @Attr({ type: 'string', required: true })
  public brandId!: string;

  @Attr({ type: 'string', required: true })
  public primaryUserId!: string;

  @Attr({ type: 'string', required: true })
  public secondaryUserId!: string;

  @Attr({ type: 'string', required: true })
  public primaryUsername!: string;

  @Attr({ type: 'string', required: true })
  public secondaryUsername!: string;

  @Attr({ type: 'string', required: true })
  public secondaryEmail!: string;

  @Attr({ type: 'string', required: true, isIn: USER_LINK_OPERATION_STATUSES })
  public status!: UserLinkOperationStatus;

  @Attr({ type: 'boolean', required: true })
  public recordsPending!: boolean;

  @Attr({ type: 'number', required: true })
  public recordsRewritten!: number;

  @Attr({ type: 'number', required: true })
  public rolesAdopted!: number;

  @Attr({ type: 'number', required: true })
  public rolesRetired!: number;

  @Attr({ type: 'number', required: true })
  public attemptCount!: number;

  /**
   * AUTH-TXN-001 durable plan + proof. The bounded complete record plan
   * (`recordOids`, discovered BEFORE any authority mutation) plus the
   * authority proof that authorized it: the server actors' observed account
   * versions, the confirmation-token hash (never the token), the
   * assignment-snapshot content, and the preview actor identity. Retry
   * consumes ONLY this stored plan/proof and re-verifies the caller proof
   * against it; rows missing proof on a resumable status are rejected as
   * incomplete instead of rebuilt from mutable live users.
   */
  @Attr({ type: 'json' })
  public recordOids?: string[];

  /** Per-record progress: OIDs verified rewritten (durable truth for counts). */
  @Attr({ type: 'json' })
  public recordsCompletedOids?: string[];

  /** Caller-observed account versions bound at preview/apply time. */
  @Attr({ type: 'number' })
  public primaryExpectedVersion?: number;

  @Attr({ type: 'number' })
  public secondaryExpectedVersion?: number;

  /** SHA-256 hex of the pair-bound confirmation token (proof, not secret). */
  @Attr({ type: 'string' })
  public proofHash?: string;

  /** Frozen authoritative assignment snapshot bound into the confirmation. */
  @Attr({ type: 'json' })
  public assignmentSnapshot?: string[];

  /** Preview actor identity the confirmation token was issued to. */
  @Attr({ type: 'string' })
  public proofActorId?: string;
}

export const UserLinkOperationWLDef = toWaterlineModelDef(UserLinkOperationClass);

export interface UserLinkOperationAttributes extends Sails.WaterlineAttributes {
  operationId: string;
  brandId: string;
  primaryUserId: string;
  secondaryUserId: string;
  primaryUsername: string;
  secondaryUsername: string;
  secondaryEmail: string;
  status: UserLinkOperationStatus;
  recordsPending: boolean;
  recordsRewritten: number;
  rolesAdopted: number;
  rolesRetired: number;
  attemptCount: number;
  recordOids?: string[];
  recordsCompletedOids?: string[];
  primaryExpectedVersion?: number;
  secondaryExpectedVersion?: number;
  proofHash?: string;
  assignmentSnapshot?: string[];
  proofActorId?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface UserLinkOperationWaterlineModel extends Sails.Model<UserLinkOperationAttributes> {
  attributes: UserLinkOperationAttributes;
}

declare global {
  const UserLinkOperation: UserLinkOperationWaterlineModel;
}
