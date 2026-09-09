/// <reference path="../sails.ts" />
import type {
  RecordDefinitionDraftDto,
  RecordDefinitionId,
  RecordDefinitionKey,
  RecordTypeIdentityDto,
} from '@researchdatabox/sails-ng-common';
import { Attr, BelongsTo, Entity, toWaterlineModelDef } from '../decorators';
import type { BrandingConfigAttributes } from './BrandingConfig';
import type { RecordTypeAttributes, RecordDefinitionDraftLifecycleOperationKind } from './RecordType';

/**
 * Transient durable evidence that an identity-authorized B04 operation settled.
 * MongoDB expires abandoned acknowledgements; successful requests do not create
 * permanent per-save audit history.
 */
@Entity('recorddefinitiondraftoperationack', {
  dontUseObjectIds: true,
  indexes: [
    { attributes: { recordType: 1, identityVersion: 1 }, unique: true },
    { attributes: { branding: 1, recordTypeKey: 1, identityVersion: 1 }, unique: true },
    { attributes: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
  ],
})
export class RecordDefinitionDraftOperationAckClass {
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

  @Attr({ type: 'string', required: true })
  public kind!: RecordDefinitionDraftLifecycleOperationKind;

  @Attr({ type: 'number', required: true })
  public identityVersion!: number;

  @Attr({ type: 'number', required: true })
  public draftVersion!: number;

  @Attr({ type: 'number', allowNull: true })
  public expectedActiveRevisionNumber!: number | null;

  @Attr({ type: 'json', required: true })
  public draft!: RecordDefinitionDraftDto;

  @Attr({ type: 'json' })
  public cloneIdentity?: RecordTypeIdentityDto | null;

  @Attr({ type: 'ref', columnType: 'datetime', required: true })
  public expiresAt!: Date;
}

export const RecordDefinitionDraftOperationAckWLDef = toWaterlineModelDef(RecordDefinitionDraftOperationAckClass);

export interface RecordDefinitionDraftOperationAckAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  cloneIdentity?: RecordTypeIdentityDto | null;
  draft: RecordDefinitionDraftDto;
  draftVersion: number;
  expectedActiveRevisionNumber: number | null;
  expiresAt: Date;
  id: string;
  identityVersion: number;
  kind: RecordDefinitionDraftLifecycleOperationKind;
  recordType: string | number | RecordTypeAttributes;
  recordTypeId: RecordDefinitionId;
  recordTypeKey: RecordDefinitionKey;
}

export interface RecordDefinitionDraftOperationAckWaterlineModel extends Sails.Model<RecordDefinitionDraftOperationAckAttributes> {
  attributes: RecordDefinitionDraftOperationAckAttributes;
}

declare global {
  const RecordDefinitionDraftOperationAck: RecordDefinitionDraftOperationAckWaterlineModel;
}
