/// <reference path="../sails.ts" />
import type {
  DraftRecordDefinitionAggregateDto,
  RecordDefinitionActorDto,
  RecordDefinitionDraftId,
  RecordDefinitionId,
  RecordDefinitionKey,
  RecordDefinitionValidationReportDto,
  RecordDefinitionRevisionId,
} from '@researchdatabox/sails-ng-common';
import {
  draftRecordDefinitionAggregateSchema,
  PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
  recordDefinitionValidationReportSchema,
} from '../record-workflow-administration';
import { Attr, BeforeCreate, BeforeUpdate, BelongsTo, Entity, toWaterlineModelDef } from '../decorators';
import type { RuntimeValue } from '../runtimeValues';
import type { BrandingConfigAttributes } from './BrandingConfig';
import type { RecordDefinitionRevisionAttributes } from './RecordDefinitionRevision';
import type { RecordTypeAttributes } from './RecordType';
import {
  assertCanonicalDraftIdentity,
  assertReportOwnership,
  isNonNegativeSafeInteger,
  isPositiveSafeInteger,
  rejectImmutableFields,
  synchronousCreateHook,
} from './recordDefinitionModelSupport';

const beforeCreate = synchronousCreateHook(record => {
  const owner = assertCanonicalDraftIdentity(record, 'RecordDefinitionDraft');
  assertReportOwnership(record, 'validation', owner, 'RecordDefinitionDraft');
});

const beforeUpdate = rejectImmutableFields('RecordDefinitionDraft', [
  'id',
  'schemaVersion',
  'branding',
  'recordType',
  'recordTypeId',
  'recordTypeKey',
  'createdBy',
]);

const customToJSON = function customToJSON(this: RecordDefinitionDraftAttributes): RecordDefinitionDraftAttributes {
  const serialized = { ...this };
  delete serialized.lifecycleOperationToken;
  return serialized;
};

@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@Entity('recorddefinitiondraft', {
  customToJSON,
  dontUseObjectIds: true,
  indexes: [
    { attributes: { recordType: 1 }, unique: true },
    { attributes: { recordTypeId: 1 }, unique: true },
    { attributes: { branding: 1, recordTypeKey: 1 }, unique: true },
    { attributes: { recordType: 1, version: 1 } },
    { attributes: { baseRevisionId: 1 } },
  ],
})
export class RecordDefinitionDraftClass {
  @Attr({ type: 'string', required: true, unique: true })
  public id!: RecordDefinitionDraftId;

  @Attr({
    type: 'number',
    defaultsTo: PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
    custom: (value: RuntimeValue): boolean => value === PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
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

  @Attr({ type: 'number', defaultsTo: 0, custom: isNonNegativeSafeInteger })
  public version!: number;

  /** Last identity-authorized lifecycle operation materialized into this row. */
  @Attr({ type: 'string', allowNull: true })
  public lifecycleOperationToken?: string | null;

  @BelongsTo('recorddefinitionrevision')
  public baseRevisionId?: RecordDefinitionRevisionId | null;

  @Attr({
    type: 'number',
    allowNull: true,
    custom: (value: RuntimeValue): boolean => value == null || isPositiveSafeInteger(value),
  })
  public baseRevisionNumber?: number | null;

  @Attr({
    type: 'json',
    required: true,
    custom: (value: RuntimeValue): boolean =>
      typeof value !== 'function' && draftRecordDefinitionAggregateSchema.safeParse(value as RuntimeValue).success,
  })
  public definition!: DraftRecordDefinitionAggregateDto;

  /** A bounded cache only; publication validation remains authoritative. */
  @Attr({
    type: 'json',
    custom: (value: RuntimeValue): boolean =>
      value == null ||
      (typeof value !== 'function' && recordDefinitionValidationReportSchema.safeParse(value as RuntimeValue).success),
  })
  public validation?: RecordDefinitionValidationReportDto | null;

  @Attr({ type: 'json', required: true })
  public createdBy!: RecordDefinitionActorDto;

  @Attr({ type: 'json', required: true })
  public updatedBy!: RecordDefinitionActorDto;
}

export const RecordDefinitionDraftWLDef = toWaterlineModelDef(RecordDefinitionDraftClass);

export interface RecordDefinitionDraftAttributes extends Sails.WaterlineAttributes {
  baseRevisionId?: RecordDefinitionRevisionId | RecordDefinitionRevisionAttributes | null;
  baseRevisionNumber?: number | null;
  branding: string | number | BrandingConfigAttributes;
  createdAt?: string;
  createdBy: RecordDefinitionActorDto;
  definition: DraftRecordDefinitionAggregateDto;
  id: RecordDefinitionDraftId;
  lifecycleOperationToken?: string | null;
  recordType: string | number | RecordTypeAttributes;
  recordTypeId: RecordDefinitionId;
  recordTypeKey: RecordDefinitionKey;
  schemaVersion: number;
  updatedAt?: string;
  updatedBy: RecordDefinitionActorDto;
  validation?: RecordDefinitionValidationReportDto | null;
  version: number;
}

export interface RecordDefinitionDraftWaterlineModel extends Sails.Model<RecordDefinitionDraftAttributes> {
  attributes: RecordDefinitionDraftAttributes;
}

declare global {
  const RecordDefinitionDraft: RecordDefinitionDraftWaterlineModel;
}
