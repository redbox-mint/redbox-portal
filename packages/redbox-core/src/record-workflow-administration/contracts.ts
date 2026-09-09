import type {
  RecordDefinitionActorDto,
  RecordDefinitionBrandId,
  RecordDefinitionDraftDto,
  RecordDefinitionDraftId,
  RecordDefinitionId,
  RecordDefinitionKey,
  RecordDefinitionRevisionDto,
  RecordDefinitionRevisionId,
  RecordTypeDeploymentFieldsDto,
} from '@researchdatabox/sails-ng-common';

/**
 * Persistence envelope version. Breaking storage changes add a new validator
 * and migration; an existing immutable revision is never rewritten as a newer
 * schema version.
 */
export const PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION = 1 as const;

export interface PersistedRecordTypeIdentity {
  readonly schemaVersion: typeof PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION;
  readonly id: RecordDefinitionId;
  readonly brandId: RecordDefinitionBrandId;
  readonly key: RecordDefinitionKey;
  /** Code/deployment-owned and excluded from administrable revision content. */
  readonly deployment: RecordTypeDeploymentFieldsDto;
  /** Optimistic-concurrency counter for pointer and retirement mutations. */
  readonly version: number;
  readonly activeRevisionId: RecordDefinitionRevisionId | null;
  readonly activeRevisionNumber: number | null;
  readonly draftId: RecordDefinitionDraftId | null;
  readonly retirement: {
    readonly retiredAt: string;
    readonly retiredBy: RecordDefinitionActorDto;
    readonly reason?: string;
  } | null;
  readonly createdAt: string;
  readonly createdBy: RecordDefinitionActorDto;
  readonly updatedAt: string;
  readonly updatedBy: RecordDefinitionActorDto;
}

export interface PersistedRecordDefinitionDraft extends RecordDefinitionDraftDto {
  readonly schemaVersion: typeof PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION;
  readonly baseRevisionId: RecordDefinitionRevisionId | null;
  readonly createdAt: string;
  readonly createdBy: RecordDefinitionActorDto;
}

/**
 * Immutable persisted aggregate. The definition is publishable, canonical,
 * and value-free for secret parameters; later changes append a new revision.
 */
export interface PersistedRecordDefinitionRevision extends RecordDefinitionRevisionDto {
  readonly schemaVersion: typeof PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION;
  readonly recordTypeId: RecordDefinitionId;
  readonly createdAt: string;
  readonly createdBy: RecordDefinitionActorDto;
}

export type {
  AutomaticWorkflowTransitionDto,
  DraftRecordDefinitionAggregateDto,
  DraftRecordTypeAdministrableFieldsDto,
  DraftWorkflowStageDto,
  DraftWorkflowTransitionDto,
  ManualWorkflowTransitionDto,
  PublishableRecordDefinitionAggregateDto,
  PublishableRecordTypeAdministrableFieldsDto,
  PublishableWorkflowStageDto,
  PublishableWorkflowTransitionDto,
  RecordDefinitionActionBindingDto,
  RecordDefinitionConflictDto,
  RecordDefinitionDraftDto,
  RecordDefinitionDraftSaveRequestDto,
  RecordDefinitionHistorySummaryDto,
  RecordDefinitionImpactReportDto,
  RecordDefinitionPublicationRequestDto,
  RecordDefinitionRevisionDto,
  RecordDefinitionRollbackRequestDto,
  RecordDefinitionRetirementRequestDto,
  RecordDefinitionValidationReportDto,
  RecordTypeIdentityDto,
} from '@researchdatabox/sails-ng-common';
