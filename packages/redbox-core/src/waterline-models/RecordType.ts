/// <reference path="../sails.ts" />
import {
  Entity,
  Attr,
  BelongsTo,
  HasMany,
  BeforeCreate,
  BeforeUpdate,
  buildInvalidNewRecordError,
  toWaterlineModelDef,
} from '../decorators';
import { BrandingConfigAttributes } from './BrandingConfig';
import type { RecordTypeValidationConfig, TransferResponsibilityConfig } from '../config/recordtype.config';
import type {
  DraftRecordDefinitionAggregateDto,
  RecordConcurrentModificationConfig,
  RecordDefinitionActorDto,
  RecordDefinitionCanonicalHash,
  RecordDefinitionRevisionId,
  RecordDefinitionId,
  RecordDefinitionRevisionSourceDto,
  RecordDefinitionValidationReportDto,
} from '@researchdatabox/sails-ng-common';
import type { ActionPlan } from '../action-registry';
import type { AutomaticTransitionDefinition } from '../workflow-transition/automatic';
import {
  PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
  deriveRecordDefinitionId,
} from '../record-workflow-administration';
import type { RecordDefinitionDraftAttributes } from './RecordDefinitionDraft';
import type { RecordDefinitionHistoryAttributes } from './RecordDefinitionHistory';
import type { RecordDefinitionRevisionAttributes } from './RecordDefinitionRevision';
import type { ActionSecretAttributes } from './ActionSecret';
import type { WorkflowStepAttributes } from './WorkflowStep';
import type { RuntimeRecord, RuntimeValue } from '../runtimeValues';
import type { RelatedTo, RecordTypeHooks, SearchFilter } from '../model/storage/RecordTypeModel';
import { isNonNegativeSafeInteger, isPositiveSafeInteger, rejectImmutableFields } from './recordDefinitionModelSupport';

export type RecordDefinitionDraftLifecycleOperationKind = 'clone' | 'discard' | 'save';

/** Durable candidate authorized by the stable-identity CAS and materialized into the shared draft. */
export interface RecordDefinitionDraftLifecycleOperation {
  readonly token: string;
  readonly kind: RecordDefinitionDraftLifecycleOperationKind;
  readonly identityVersion: number;
  readonly expectedDraftVersion: number;
  readonly expectedActiveRevisionNumber: number | null;
  readonly state: {
    readonly baseRevisionId: RecordDefinitionRevisionId | null;
    readonly baseRevisionNumber: number | null;
    readonly definition: DraftRecordDefinitionAggregateDto;
    readonly updatedBy: RecordDefinitionActorDto;
    readonly validation: RecordDefinitionValidationReportDto;
    readonly version: number;
  };
}

export type RecordDefinitionLifecycleOperationKind = 'publish' | 'rollback' | 'retire' | 'unretire';

interface RecordDefinitionLifecycleOperationBase {
  readonly token: string;
  readonly kind: RecordDefinitionLifecycleOperationKind;
  readonly phase: 'reserved' | 'activated';
  readonly expectedIdentityVersion: number;
  readonly identityVersion: number;
  readonly expectedActiveRevisionNumber: number | null;
  readonly historyId: string;
  readonly occurredAt: string;
  readonly actor: RecordDefinitionActorDto;
  readonly note?: string;
}

export interface RecordDefinitionRevisionLifecycleOperation extends RecordDefinitionLifecycleOperationBase {
  readonly kind: 'publish' | 'rollback';
  readonly expectedDraftVersion: number | null;
  readonly targetRevisionId: RecordDefinitionRevisionId;
  readonly targetRevisionNumber: number;
  readonly canonicalHash: RecordDefinitionCanonicalHash;
  readonly source: RecordDefinitionRevisionSourceDto;
}

export interface RecordDefinitionRetirementLifecycleOperation extends RecordDefinitionLifecycleOperationBase {
  readonly kind: 'retire' | 'unretire';
  readonly expectedDraftVersion: null;
}

/** Internal durable fence used to roll B05 lifecycle operations forward after ambiguous writes. */
export type RecordDefinitionLifecycleOperation =
  | RecordDefinitionRevisionLifecycleOperation
  | RecordDefinitionRetirementLifecycleOperation;

/** Durable mutual-exclusion proof joining final record creation to definition retirement. */
export interface RecordTypeCreationFence {
  readonly token: string;
  readonly recordOid: string;
  readonly acquiredAt: string;
}

const assignKey = (recordType: RuntimeRecord, cb: (err?: Error) => void) => {
  try {
    const branding = String(recordType.branding ?? '');
    const name = String(recordType.name ?? '');
    recordType.key = `${branding}_${name}`;
    const expectedDefinitionId = deriveRecordDefinitionId({ brandId: branding, recordTypeKey: name });
    if (
      recordType.definitionId != null &&
      recordType.definitionId !== '' &&
      recordType.definitionId !== expectedDefinitionId
    ) {
      throw buildInvalidNewRecordError('RecordType.definitionId is not canonical for its brand and key');
    }
    recordType.definitionId = expectedDefinitionId;
    cb();
  } catch (error) {
    cb(error instanceof Error ? error : new Error(String(error)));
  }
};

const rejectIdentityUpdate = rejectImmutableFields('RecordType', [
  'schemaVersion',
  'definitionId',
  'branding',
  'name',
  'key',
]);

const customToJSON = function customToJSON(this: RecordTypeAttributes): RecordTypeAttributes {
  const serialized = { ...this };
  delete serialized.draftLifecycleToken;
  delete serialized.draftLifecycleKind;
  delete serialized.draftLifecycleOperation;
  delete serialized.definitionLifecycleToken;
  delete serialized.definitionLifecycleOperation;
  delete serialized.recordCreationToken;
  delete serialized.recordCreationFence;
  return serialized;
};

@BeforeUpdate(rejectIdentityUpdate)
@BeforeCreate(assignKey)
@Entity('recordtype', {
  customToJSON,
  indexes: [
    { attributes: { branding: 1, name: 1 }, unique: true },
    { attributes: { definitionId: 1 }, options: { unique: true, sparse: true } },
    { attributes: { activeRevisionId: 1 } },
    { attributes: { draftId: 1 } },
    { attributes: { branding: 1, retiredAt: 1 } },
  ],
})
export class RecordTypeClass {
  @Attr({ type: 'string', unique: true })
  public key?: string;

  /** Canonical B01 identity; the existing Waterline primary key remains unchanged. */
  @Attr({ type: 'string' })
  public definitionId?: RecordDefinitionId;

  @Attr({
    type: 'number',
    defaultsTo: PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
    custom: (value: RuntimeValue): boolean => value === PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
  })
  public schemaVersion?: number;

  @Attr({ type: 'string', required: true })
  public name!: string;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'string' })
  public packageType?: string;

  @Attr({ type: 'string', defaultsTo: 'default' })
  public searchCore?: string;

  @HasMany('workflowStep', 'recordType')
  public workflowSteps?: WorkflowStepAttributes[];

  @BelongsTo('recorddefinitionrevision')
  public activeRevisionId?: string | number;

  @Attr({
    type: 'number',
    allowNull: true,
    custom: (value: RuntimeValue): boolean => value == null || isPositiveSafeInteger(value),
  })
  public activeRevisionNumber?: number | null;

  @BelongsTo('recorddefinitiondraft')
  public draftId?: string | number;

  @Attr({ type: 'number', defaultsTo: 0, custom: isNonNegativeSafeInteger })
  public version?: number;

  /** Internal B04 recovery marker. A non-null token fences other identity mutations until materialized. */
  @Attr({ type: 'string', allowNull: true })
  public draftLifecycleToken?: string | null;

  @Attr({ type: 'string', allowNull: true })
  public draftLifecycleKind?: RecordDefinitionDraftLifecycleOperationKind | null;

  @Attr({ type: 'json' })
  public draftLifecycleOperation?: RecordDefinitionDraftLifecycleOperation | null;

  /** Internal B05 recovery fence; excluded from serialization and never accepted from an API payload. */
  @Attr({ type: 'string', allowNull: true })
  public definitionLifecycleToken?: string | null;

  @Attr({ type: 'json' })
  public definitionLifecycleOperation?: RecordDefinitionLifecycleOperation | null;

  /** Internal record-create/retirement mutex; excluded from every public serialization. */
  @Attr({ type: 'string', allowNull: true })
  public recordCreationToken?: string | null;

  @Attr({ type: 'json' })
  public recordCreationFence?: RecordTypeCreationFence | null;

  @Attr({ type: 'string', columnType: 'datetime', allowNull: true })
  public retiredAt?: string | Date | null;

  @Attr({ type: 'json' })
  public retiredBy?: RecordDefinitionActorDto | null;

  @Attr({ type: 'string', allowNull: true })
  public retirementReason?: string | null;

  @Attr({ type: 'json' })
  public createdBy?: RecordDefinitionActorDto;

  /** Non-expiring fence shared by secret writes and definition lifecycle CAS. */
  @Attr({ type: 'string', allowNull: true })
  public secretMutationToken?: string | null;

  @Attr({ type: 'json' })
  public updatedBy?: RecordDefinitionActorDto;

  @HasMany('recorddefinitiondraft', 'recordType')
  public definitionDrafts?: RecordDefinitionDraftAttributes[];

  @HasMany('recorddefinitionrevision', 'recordType')
  public definitionRevisions?: RecordDefinitionRevisionAttributes[];

  @HasMany('recorddefinitionhistory', 'recordType')
  public definitionHistory?: RecordDefinitionHistoryAttributes[];

  @HasMany('actionsecret', 'recordType')
  public actionSecrets?: ActionSecretAttributes[];

  @Attr({ type: 'json' })
  public searchFilters?: SearchFilter[];

  @Attr({ type: 'boolean', defaultsTo: true })
  public searchable?: boolean;

  @Attr({ type: 'json' })
  public transferResponsibility?: TransferResponsibilityConfig;

  @Attr({ type: 'json' })
  public relatedTo?: RelatedTo[];

  @Attr({ type: 'json' })
  public hooks?: RecordTypeHooks;

  @Attr({ type: 'json' })
  public actionPlan?: ActionPlan;

  @Attr({ type: 'json' })
  public automaticTransitions?: readonly AutomaticTransitionDefinition[];

  @Attr({ type: 'json' })
  public dashboard?: RuntimeRecord;

  @Attr({ type: 'json' })
  public recordValidation?: RecordTypeValidationConfig;

  @Attr({ type: 'json' })
  public concurrentModification?: RecordConcurrentModificationConfig;
}

// Export the Waterline model definition for runtime use
export const RecordTypeWLDef = toWaterlineModelDef(RecordTypeClass);

// Type interface for backwards compatibility
export interface RecordTypeAttributes extends Sails.WaterlineAttributes {
  actionSecrets?: ActionSecretAttributes[];
  activeRevisionId?: string | number | RecordDefinitionRevisionAttributes;
  activeRevisionNumber?: number | null;
  branding: string | number | BrandingConfigAttributes;
  createdBy?: RecordDefinitionActorDto;
  dashboard?: RuntimeRecord;
  definitionDrafts?: RecordDefinitionDraftAttributes[];
  definitionHistory?: RecordDefinitionHistoryAttributes[];
  definitionId?: RecordDefinitionId;
  definitionRevisions?: RecordDefinitionRevisionAttributes[];
  draftId?: string | number | RecordDefinitionDraftAttributes;
  draftLifecycleKind?: RecordDefinitionDraftLifecycleOperationKind | null;
  draftLifecycleOperation?: RecordDefinitionDraftLifecycleOperation | null;
  draftLifecycleToken?: string | null;
  definitionLifecycleOperation?: RecordDefinitionLifecycleOperation | null;
  definitionLifecycleToken?: string | null;
  secretMutationToken?: string | null;
  recordCreationFence?: RecordTypeCreationFence | null;
  recordCreationToken?: string | null;
  hooks?: RecordTypeHooks;
  actionPlan?: ActionPlan;
  automaticTransitions?: readonly AutomaticTransitionDefinition[];
  key?: string;
  name: string;
  packageType?: string;
  relatedTo?: RelatedTo[];
  recordValidation?: RecordTypeValidationConfig;
  concurrentModification?: RecordConcurrentModificationConfig;
  retiredAt?: string | Date | null;
  retiredBy?: RecordDefinitionActorDto | null;
  retirementReason?: string | null;
  searchable?: boolean;
  schemaVersion?: number;
  searchCore?: string;
  searchFilters?: SearchFilter[];
  transferResponsibility?: TransferResponsibilityConfig;
  updatedBy?: RecordDefinitionActorDto;
  version?: number;
  workflowSteps?: WorkflowStepAttributes[];
}

export interface RecordTypeWaterlineModel extends Sails.Model<RecordTypeAttributes> {
  attributes: RecordTypeAttributes;
}

declare global {
  const RecordType: RecordTypeWaterlineModel;
}
