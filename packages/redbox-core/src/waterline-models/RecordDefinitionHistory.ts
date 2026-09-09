/// <reference path="../sails.ts" />
import type {
  RecordDefinitionActorDto,
  RecordDefinitionCanonicalHash,
  RecordDefinitionId,
  RecordDefinitionImpactReportDto,
  RecordDefinitionKey,
  RecordDefinitionStructuralChangeDto,
  RecordDefinitionValidationReportDto,
  RecordDefinitionRedactionDto,
  RecordDefinitionRevisionId,
  RecordDefinitionRevisionSourceDto,
} from '@researchdatabox/sails-ng-common';
import { RECORD_DEFINITION_REPORT_SCHEMA_VERSION } from '@researchdatabox/sails-ng-common';
import {
  recordDefinitionImpactReportSchema,
  recordDefinitionValidationReportSchema,
} from '../record-workflow-administration';
import {
  Attr,
  BeforeCreate,
  BeforeDestroy,
  BeforeUpdate,
  BelongsTo,
  buildInvalidNewRecordError,
  Entity,
  toWaterlineModelDef,
} from '../decorators';
import type { RuntimeValue } from '../runtimeValues';
import type { BrandingConfigAttributes } from './BrandingConfig';
import type { RecordDefinitionRevisionAttributes } from './RecordDefinitionRevision';
import type { RecordTypeAttributes } from './RecordType';
import {
  assertCanonicalRevisionIdentity,
  assertReportOwnership,
  canonicalOwner,
  isCanonicalHash,
  isNonNegativeSafeInteger,
  rejectImmutableRow,
  synchronousCreateHook,
} from './recordDefinitionModelSupport';

export type RecordDefinitionHistoryOperation =
  | 'publish'
  | 'rollback'
  | 'migration'
  | 'bootstrap'
  | 'retire'
  | 'unretire';

const HISTORY_OPERATIONS: readonly RecordDefinitionHistoryOperation[] = [
  'publish',
  'rollback',
  'migration',
  'bootstrap',
  'retire',
  'unretire',
];

const beforeCreate = synchronousCreateHook(record => {
  const owner = canonicalOwner(record, 'RecordDefinitionHistory');
  assertReportOwnership(record, 'validation', owner, 'RecordDefinitionHistory');
  assertReportOwnership(record, 'impact', owner, 'RecordDefinitionHistory');
  const hasRevision = record.revision != null;
  const hasRevisionNumber = record.revisionNumber != null;
  if (hasRevision !== hasRevisionNumber) {
    throw buildInvalidNewRecordError('RecordDefinitionHistory.revision and revisionNumber must be present together');
  }
  if (hasRevision) {
    assertCanonicalRevisionIdentity(record, 'RecordDefinitionHistory', 'revision');
  }
  if (
    !isNonNegativeSafeInteger(record.expectedIdentityVersion) ||
    !isNonNegativeSafeInteger(record.resultingIdentityVersion) ||
    Number(record.resultingIdentityVersion) !== Number(record.expectedIdentityVersion) + 1
  ) {
    throw buildInvalidNewRecordError(
      'RecordDefinitionHistory identity versions must describe one atomic lifecycle advance'
    );
  }
});
const beforeUpdate = rejectImmutableRow('RecordDefinitionHistory', 'updated');
const beforeDestroy = rejectImmutableRow('RecordDefinitionHistory', 'deleted');

@BeforeCreate(beforeCreate)
@BeforeUpdate(beforeUpdate)
@BeforeDestroy(beforeDestroy)
@Entity('recorddefinitionhistory', {
  dontUseObjectIds: true,
  indexes: [
    { attributes: { operationId: 1 }, unique: true },
    { attributes: { recordType: 1, resultingIdentityVersion: 1 }, unique: true },
    { attributes: { recordType: 1, occurredAt: -1 } },
    { attributes: { recordTypeId: 1, occurredAt: -1 } },
    { attributes: { branding: 1, recordTypeKey: 1, occurredAt: -1 } },
    { attributes: { revision: 1 } },
    { attributes: { operation: 1, occurredAt: -1 } },
  ],
})
export class RecordDefinitionHistoryClass {
  @Attr({ type: 'string', required: true, unique: true })
  public id!: string;

  @Attr({
    type: 'number',
    defaultsTo: RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
    custom: (value: RuntimeValue): boolean => value === RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
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

  @Attr({ type: 'string', required: true, isIn: HISTORY_OPERATIONS })
  public operation!: RecordDefinitionHistoryOperation;

  /** Stable recovery correlation; it contains no request body or secret material. */
  @Attr({ type: 'string', required: true })
  public operationId!: string;

  @Attr({ type: 'number', required: true, custom: isNonNegativeSafeInteger })
  public expectedIdentityVersion!: number;

  @Attr({ type: 'number', required: true, custom: isNonNegativeSafeInteger })
  public resultingIdentityVersion!: number;

  @Attr({ type: 'number', allowNull: true })
  public expectedDraftVersion!: number | null;

  @Attr({ type: 'number', allowNull: true })
  public expectedActiveRevisionNumber!: number | null;

  @BelongsTo('recorddefinitionrevision')
  public revision?: RecordDefinitionRevisionId | null;

  @Attr({ type: 'number', allowNull: true })
  public revisionNumber?: number | null;

  @Attr({
    type: 'string',
    allowNull: true,
    custom: (value: RuntimeValue): boolean => value == null || isCanonicalHash(value),
  })
  public canonicalHash?: RecordDefinitionCanonicalHash | null;

  @Attr({ type: 'json' })
  public source?: RecordDefinitionRevisionSourceDto;

  @Attr({ type: 'string', columnType: 'datetime', required: true })
  public occurredAt!: string | Date;

  @Attr({ type: 'json', required: true })
  public actor!: RecordDefinitionActorDto;

  @Attr({ type: 'string' })
  public note?: string;

  @Attr({
    type: 'json',
    custom: (value: RuntimeValue): boolean =>
      typeof value !== 'function' && recordDefinitionValidationReportSchema.safeParse(value as RuntimeValue).success,
  })
  public validation?: RecordDefinitionValidationReportDto;

  @Attr({
    type: 'json',
    custom: (value: RuntimeValue): boolean =>
      typeof value !== 'function' && recordDefinitionImpactReportSchema.safeParse(value as RuntimeValue).success,
  })
  public impact?: RecordDefinitionImpactReportDto;

  @Attr({ type: 'json' })
  public changes?: readonly RecordDefinitionStructuralChangeDto[];

  @Attr({ type: 'json' })
  public redactions?: readonly RecordDefinitionRedactionDto[];

  @Attr({ type: 'boolean', defaultsTo: false })
  public truncated?: boolean;
}

export const RecordDefinitionHistoryWLDef = toWaterlineModelDef(RecordDefinitionHistoryClass);

export interface RecordDefinitionHistoryAttributes extends Sails.WaterlineAttributes {
  actor: RecordDefinitionActorDto;
  branding: string | number | BrandingConfigAttributes;
  canonicalHash?: RecordDefinitionCanonicalHash | null;
  changes?: readonly RecordDefinitionStructuralChangeDto[];
  createdAt?: string;
  impact?: RecordDefinitionImpactReportDto;
  note?: string;
  operationId: string;
  expectedActiveRevisionNumber: number | null;
  expectedDraftVersion: number | null;
  expectedIdentityVersion: number;
  occurredAt: string | Date;
  operation: RecordDefinitionHistoryOperation;
  recordType: string | number | RecordTypeAttributes;
  recordTypeId: RecordDefinitionId;
  recordTypeKey: RecordDefinitionKey;
  redactions?: readonly RecordDefinitionRedactionDto[];
  resultingIdentityVersion: number;
  revision?: RecordDefinitionRevisionId | RecordDefinitionRevisionAttributes | null;
  revisionNumber?: number | null;
  schemaVersion: number;
  source?: RecordDefinitionRevisionSourceDto;
  truncated?: boolean;
  validation?: RecordDefinitionValidationReportDto;
}

export interface RecordDefinitionHistoryWaterlineModel extends Sails.Model<RecordDefinitionHistoryAttributes> {
  attributes: RecordDefinitionHistoryAttributes;
}

declare global {
  const RecordDefinitionHistory: RecordDefinitionHistoryWaterlineModel;
}
