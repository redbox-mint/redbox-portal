/// <reference path="../sails.ts" />
import type {
  PublishableRecordDefinitionAggregateDto,
  RecordDefinitionActionContractReferenceDto,
  RecordDefinitionActorDto,
  RecordDefinitionCanonicalHash,
  RecordDefinitionId,
  RecordDefinitionKey,
  RecordDefinitionRevisionId,
  RecordDefinitionRevisionSourceDto,
} from '@researchdatabox/sails-ng-common';
import {
  PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
  publishableRecordDefinitionAggregateSchema,
} from '../record-workflow-administration';
import {
  Attr,
  BeforeCreate,
  BeforeDestroy,
  BeforeUpdate,
  BelongsTo,
  Entity,
  HasMany,
  toWaterlineModelDef,
} from '../decorators';
import type { RuntimeValue } from '../runtimeValues';
import type { BrandingConfigAttributes } from './BrandingConfig';
import type { RecordDefinitionHistoryAttributes } from './RecordDefinitionHistory';
import type { RecordTypeAttributes } from './RecordType';
import {
  assertCanonicalRevisionIdentity,
  isCanonicalHash,
  isPositiveSafeInteger,
  rejectImmutableRow,
  synchronousCreateHook,
} from './recordDefinitionModelSupport';

const beforeCreate = synchronousCreateHook(record => {
  assertCanonicalRevisionIdentity(record, 'RecordDefinitionRevision');
});
const beforeUpdate = rejectImmutableRow('RecordDefinitionRevision', 'updated');
const beforeDestroy = rejectImmutableRow('RecordDefinitionRevision', 'deleted');

@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@BeforeDestroy(beforeDestroy)
@Entity('recorddefinitionrevision', {
  dontUseObjectIds: true,
  indexes: [
    { attributes: { recordType: 1, revisionNumber: 1 }, unique: true },
    { attributes: { recordTypeId: 1, revisionNumber: 1 }, unique: true },
    { attributes: { branding: 1, recordTypeKey: 1, revisionNumber: 1 }, unique: true },
    { attributes: { recordType: 1, canonicalHash: 1 } },
    { attributes: { branding: 1, canonicalHash: 1 } },
  ],
})
export class RecordDefinitionRevisionClass {
  @Attr({ type: 'string', required: true, unique: true })
  public id!: RecordDefinitionRevisionId;

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

  @Attr({ type: 'number', required: true, custom: isPositiveSafeInteger })
  public revisionNumber!: number;

  @Attr({ type: 'string', required: true, custom: isCanonicalHash })
  public canonicalHash!: RecordDefinitionCanonicalHash;

  /** One coherent snapshot containing record settings, workflow, transitions, and bindings. */
  @Attr({
    type: 'json',
    required: true,
    custom: (value: RuntimeValue): boolean =>
      typeof value !== 'function' &&
      publishableRecordDefinitionAggregateSchema.safeParse(value as RuntimeValue).success,
  })
  public definition!: PublishableRecordDefinitionAggregateDto;

  @Attr({ type: 'json', required: true })
  public actionContracts!: readonly RecordDefinitionActionContractReferenceDto[];

  @Attr({ type: 'json', required: true })
  public source!: RecordDefinitionRevisionSourceDto;

  @Attr({ type: 'string' })
  public publicationNote?: string;

  @Attr({ type: 'string', columnType: 'datetime', required: true })
  public publishedAt!: string | Date;

  @Attr({ type: 'json', required: true })
  public publishedBy!: RecordDefinitionActorDto;

  @Attr({ type: 'json', required: true })
  public createdBy!: RecordDefinitionActorDto;

  @HasMany('recorddefinitionhistory', 'revision')
  public historyEvents?: RecordDefinitionHistoryAttributes[];
}

export const RecordDefinitionRevisionWLDef = toWaterlineModelDef(RecordDefinitionRevisionClass);

export interface RecordDefinitionRevisionAttributes extends Sails.WaterlineAttributes {
  actionContracts: readonly RecordDefinitionActionContractReferenceDto[];
  branding: string | number | BrandingConfigAttributes;
  canonicalHash: RecordDefinitionCanonicalHash;
  createdAt?: string;
  createdBy: RecordDefinitionActorDto;
  definition: PublishableRecordDefinitionAggregateDto;
  historyEvents?: RecordDefinitionHistoryAttributes[];
  id: RecordDefinitionRevisionId;
  publicationNote?: string;
  publishedAt: string | Date;
  publishedBy: RecordDefinitionActorDto;
  recordType: string | number | RecordTypeAttributes;
  recordTypeId: RecordDefinitionId;
  recordTypeKey: RecordDefinitionKey;
  revisionNumber: number;
  schemaVersion: number;
  source: RecordDefinitionRevisionSourceDto;
}

export interface RecordDefinitionRevisionWaterlineModel extends Sails.Model<RecordDefinitionRevisionAttributes> {
  attributes: RecordDefinitionRevisionAttributes;
}

declare global {
  const RecordDefinitionRevision: RecordDefinitionRevisionWaterlineModel;
}
