import {
  RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
  RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
  parseWorkflowStageKey,
  type DraftRecordDefinitionAggregateDto,
  type DraftRecordTypeAdministrableFieldsDto,
  type DraftWorkflowStageDto,
  type PublishableRecordDefinitionAggregateDto,
  type PublishableWorkflowStageDto,
  type RecordDefinitionActionParameterValueDto,
  type RecordDefinitionRevisionDto,
  type RecordDefinitionStageValidationOperationOverrideDto,
  type RecordDefinitionValidationPolicyDto,
  type WorkflowStageKey,
} from '@researchdatabox/sails-ng-common';
import {
  draftRecordDefinitionAggregateSchema as publicDraftRecordDefinitionAggregateSchema,
  type PersistedRecordDefinitionRevision,
} from '../dist';

export const exportedDraftValidator = publicDraftRecordDefinitionAggregateSchema;

export function acceptPersistedRevision(
  revision: PersistedRecordDefinitionRevision
): PersistedRecordDefinitionRevision {
  return revision;
}

export const configuredSecretMarker: RecordDefinitionActionParameterValueDto = {
  kind: 'secret',
  configured: true,
};

export const forbiddenSecretValue: RecordDefinitionActionParameterValueDto = {
  kind: 'secret',
  configured: true,
  // @ts-expect-error Secret values are not part of the public binding declaration.
  value: 'must-not-compile',
};

export const administrableFields: DraftRecordTypeAdministrableFieldsDto = {
  labels: { name: 'Data record' },
  // @ts-expect-error Deployment fields are read-only identity metadata, not administrable fields.
  packageType: 'dataRecord',
};

export const operationSpecificRolloutMode: RecordDefinitionValidationPolicyDto = {
  mode: 'shadow',
  operations: [
    {
      name: 'publish',
      enabledValidationGroups: ['publication'],
      roles: ['Admin'],
      allowedTargetStages: [parseWorkflowStageKey('published')],
      mode: 'enforce',
    },
  ],
};

export const stageValidationOverride: RecordDefinitionStageValidationOperationOverrideDto = {
  name: 'publish',
  enabledValidationGroups: ['publication'],
  roles: ['Admin'],
  allowedTargetStages: [parseWorkflowStageKey('published')],
};

export const forbiddenStageRolloutMode: RecordDefinitionStageValidationOperationOverrideDto = {
  ...stageValidationOverride,
  // @ts-expect-error Rollout mode remains record-type scoped, not stage scoped.
  mode: 'enforce',
};

// @ts-expect-error Publishable stages require the complete publication shape.
export const incompletePublishedStage: PublishableWorkflowStageDto = {
  schemaVersion: RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
  key: parseWorkflowStageKey('draft'),
};

export const incompleteDraft: DraftRecordDefinitionAggregateDto = {
  schemaVersion: RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
  definitionState: 'draft-incomplete',
  recordType: {},
  stages: [],
  transitions: [],
  actionBindings: [],
};

// @ts-expect-error A draft-incomplete declaration is not a publishable definition.
export const draftAsPublishable: PublishableRecordDefinitionAggregateDto = incompleteDraft;

export const unknownDraftField: DraftRecordDefinitionAggregateDto = {
  ...incompleteDraft,
  // @ts-expect-error Public aggregate declarations are closed to unknown fields.
  executable: 'service.method',
};

export const unsupportedStageVersion: DraftWorkflowStageDto = {
  // @ts-expect-error Stage declarations accept only the implemented schema version.
  schemaVersion: 2,
  key: parseWorkflowStageKey('draft'),
};

// @ts-expect-error Canonical keys must pass the parser before entering public declarations.
export const unparsedStageKey: WorkflowStageKey = 'draft';

export function assertImmutableRevision(revision: RecordDefinitionRevisionDto): void {
  // @ts-expect-error Public revisions are immutable declarations.
  revision.revisionNumber = 2;
}

export const manualTransitionRequest: import('../dist').WorkflowTransitionService.ManualTransitionRequest = {
  oid: 'record-1',
  transitionId: 'submit',
  expectedRevision: 4,
  // @ts-expect-error Clients cannot supply target authority.
  targetStage: 'forged',
};
