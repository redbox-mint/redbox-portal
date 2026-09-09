import { z } from 'zod';
import {
  RECORD_CONCURRENT_MODIFICATION_MODES,
  RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION,
  RECORD_DEFINITION_API_SCHEMA_VERSION,
  RECORD_DEFINITION_BRAND_ID_MAX_LENGTH,
  RECORD_DEFINITION_BRAND_ID_PATTERN,
  RECORD_DEFINITION_CANONICAL_HASH_PATTERN,
  RECORD_DEFINITION_DESCRIPTION_MAX_LENGTH,
  RECORD_DEFINITION_DRAFT_ID_PATTERN,
  RECORD_DEFINITION_EXPRESSION_MAX_LENGTH,
  RECORD_DEFINITION_FIELD_REFERENCE_PATTERN,
  RECORD_DEFINITION_ID_PATTERN,
  RECORD_DEFINITION_ISSUE_CODE_MAX_LENGTH,
  RECORD_DEFINITION_ISSUE_MESSAGE_MAX_LENGTH,
  RECORD_DEFINITION_KEY_MAX_LENGTH,
  RECORD_DEFINITION_KEY_PATTERN,
  RECORD_DEFINITION_LABEL_MAX_LENGTH,
  RECORD_DEFINITION_NOTE_MAX_LENGTH,
  RECORD_DEFINITION_PATH_MAX_LENGTH,
  RECORD_DEFINITION_REDACTION_MARKER,
  RECORD_DEFINITION_REFERENCE_MAX_LENGTH,
  RECORD_DEFINITION_REFERENCE_PATTERN,
  RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
  RECORD_DEFINITION_REASON_MAX_LENGTH,
  RECORD_DEFINITION_REVISION_ID_PATTERN,
  RECORD_DEFINITION_STAGE_SCHEMA_VERSION,
  RECORD_DEFINITION_TEMPLATE_MAX_LENGTH,
  RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION,
  WORKFLOW_TRANSITION_ID_PATTERN,
  parseRecordDefinitionBrandId,
  parseRecordDefinitionCanonicalHash,
  parseRecordDefinitionDraftId,
  parseRecordDefinitionId,
  parseRecordDefinitionKey,
  parseRecordDefinitionRevisionId,
  parseWorkflowStageKey,
  parseWorkflowTransitionId,
  type AutomaticWorkflowTransitionDto,
  type DraftRecordDefinitionAggregateDto,
  type DraftRecordTypeAdministrableFieldsDto,
  type DraftWorkflowStageDto,
  type DraftWorkflowTransitionDto,
  type ManualWorkflowTransitionDto,
  type PublishableRecordDefinitionAggregateDto,
  type PublishableRecordTypeAdministrableFieldsDto,
  type PublishableWorkflowStageDto,
  type PublishableWorkflowTransitionDto,
  type RecordDefinitionActionBindingDto,
  type RecordDefinitionActorDto,
  type RecordDefinitionConflictDto,
  type RecordDefinitionDraftDto,
  type RecordDefinitionDraftSaveRequestDto,
  type RecordDefinitionHistorySummaryDto,
  type RecordDefinitionImpactReportDto,
  type RecordDefinitionPublicationRequestDto,
  type RecordDefinitionRedactionDto,
  type RecordDefinitionRetirementRequestDto,
  type RecordDefinitionRevisionDto,
  type RecordDefinitionRollbackRequestDto,
  type RecordDefinitionStageValidationOperationOverrideDto,
  type RecordDefinitionValidationReportDto,
  type RecordTypeIdentityDto,
} from '@researchdatabox/sails-ng-common';
import { ACTION_CONTRACT_LIMITS, actionBindingSchema, actionDefinitionIdZodSchema } from '../action-registry';
import {
  boundedValidationPreflight,
  type BoundedValidationFailure,
  type BoundedValidationResult,
} from '../boundedValidation';
import {
  createRuntimeValidator,
  isRuntimeArray,
  isRuntimeRecord,
  type RuntimeRecord,
  type RuntimeValidationResult,
  type RuntimeValidator,
  type RuntimeValue,
} from '../runtimeValues';
import {
  PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
  type PersistedRecordDefinitionDraft,
  type PersistedRecordDefinitionRevision,
  type PersistedRecordTypeIdentity,
} from './contracts';
import {
  RECORD_DEFINITION_REVISION_NUMBER_MAX,
  deriveRecordDefinitionDraftId,
  deriveRecordDefinitionId,
  deriveRecordDefinitionRevisionId,
} from './identifiers';

export const RECORD_DEFINITION_CONTRACT_LIMITS = Object.freeze({
  maxContractBytes: 1_048_576,
  maxDepth: 32,
  maxValidationWork: 100_000,
  maxObjectProperties: 100,
  maxPropertyNameLength: 128,
  maxStringLength: 32_768,
  maxStages: 100,
  maxTransitions: 500,
  maxActionBindings: ACTION_CONTRACT_LIMITS.maxPlanBindings,
  maxSearchFilters: 64,
  maxRelationships: 64,
  maxTransferFields: 128,
  maxRoles: 64,
  maxValidationOperations: 64,
  maxDashboardColumns: 64,
  maxReportIssues: 100,
  maxReportChanges: 100,
  maxActionContracts: ACTION_CONTRACT_LIMITS.maxPlanBindings,
});

const positiveRevisionSchema = z.number().int().min(1).max(RECORD_DEFINITION_REVISION_NUMBER_MAX);
const versionSchema = z.number().int().min(0).max(RECORD_DEFINITION_REVISION_NUMBER_MAX);
const nullableRevisionSchema = positiveRevisionSchema.nullable();
const timestampSchema = z.iso.datetime({ offset: true });

function displayText(maximum: number): z.ZodString {
  return z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine(value => {
      for (const character of value) {
        const codePoint = character.codePointAt(0);
        if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) {
          return false;
        }
      }
      return true;
    });
}

const labelSchema = displayText(RECORD_DEFINITION_LABEL_MAX_LENGTH);
const descriptionSchema = displayText(RECORD_DEFINITION_DESCRIPTION_MAX_LENGTH);
const noteSchema = displayText(RECORD_DEFINITION_NOTE_MAX_LENGTH);
const reasonSchema = displayText(RECORD_DEFINITION_REASON_MAX_LENGTH);
const referenceSchema = z
  .string()
  .min(1)
  .max(RECORD_DEFINITION_REFERENCE_MAX_LENGTH)
  .regex(RECORD_DEFINITION_REFERENCE_PATTERN);
const fieldReferenceSchema = z
  .string()
  .min(1)
  .max(RECORD_DEFINITION_REFERENCE_MAX_LENGTH)
  .regex(RECORD_DEFINITION_FIELD_REFERENCE_PATTERN);
const roleSchema = referenceSchema;
const recordDefinitionKeySchema = z
  .string()
  .min(1)
  .max(RECORD_DEFINITION_KEY_MAX_LENGTH)
  .regex(RECORD_DEFINITION_KEY_PATTERN)
  .transform(value => parseRecordDefinitionKey(value));
const workflowStageKeySchema = z
  .string()
  .min(1)
  .max(RECORD_DEFINITION_KEY_MAX_LENGTH)
  .regex(RECORD_DEFINITION_KEY_PATTERN)
  .transform(value => parseWorkflowStageKey(value));
const brandIdSchema = z
  .string()
  .min(1)
  .max(RECORD_DEFINITION_BRAND_ID_MAX_LENGTH)
  .regex(RECORD_DEFINITION_BRAND_ID_PATTERN)
  .transform(value => parseRecordDefinitionBrandId(value));
const recordDefinitionIdSchemaImplementation = z
  .string()
  .regex(RECORD_DEFINITION_ID_PATTERN)
  .transform(value => parseRecordDefinitionId(value));
const recordDefinitionDraftIdSchemaImplementation = z
  .string()
  .regex(RECORD_DEFINITION_DRAFT_ID_PATTERN)
  .transform(value => parseRecordDefinitionDraftId(value));
const recordDefinitionRevisionIdSchemaImplementation = z
  .string()
  .regex(RECORD_DEFINITION_REVISION_ID_PATTERN)
  .transform(value => parseRecordDefinitionRevisionId(value));
const workflowTransitionIdSchemaImplementation = z
  .string()
  .regex(WORKFLOW_TRANSITION_ID_PATTERN)
  .transform(value => parseWorkflowTransitionId(value));
const canonicalHashSchema = z
  .string()
  .regex(RECORD_DEFINITION_CANONICAL_HASH_PATTERN)
  .transform(value => parseRecordDefinitionCanonicalHash(value));

const actorSchema: z.ZodType<RecordDefinitionActorDto, RuntimeValue> = z
  .object({
    id: referenceSchema,
    displayName: labelSchema.optional(),
  })
  .strict();

const deploymentFieldsSchema = z
  .object({
    packageType: referenceSchema,
    searchCore: referenceSchema,
  })
  .strict();

const labelsSchema = z
  .object({
    name: labelSchema,
    namePlural: labelSchema,
  })
  .strict();

const draftLabelsSchema = z
  .object({
    name: labelSchema.optional(),
    namePlural: labelSchema.optional(),
  })
  .strict();

const searchFilterSchema = z
  .object({
    id: referenceSchema,
    field: fieldReferenceSchema,
    title: labelSchema,
    kind: z.enum(['exact', 'facet']),
    typeLabel: labelSchema.nullable(),
    alwaysActive: z.boolean(),
  })
  .strict();

const relationshipSchema = z
  .object({
    id: referenceSchema,
    label: labelSchema.optional(),
    targetRecordTypeKey: recordDefinitionKeySchema,
    localField: fieldReferenceSchema,
    foreignField: fieldReferenceSchema,
    cardinality: z.enum(['one', 'many']),
    direction: z.enum(['outbound', 'inbound']),
    includeByDefault: z.boolean(),
  })
  .strict();

const transferFieldSchema = z
  .object({
    field: fieldReferenceSchema,
    label: labelSchema,
    updateField: fieldReferenceSchema.optional(),
    updateAlso: z.array(fieldReferenceSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxTransferFields),
    fieldNames: z
      .array(
        z
          .object({
            name: fieldReferenceSchema,
            field: fieldReferenceSchema,
          })
          .strict()
      )
      .max(RECORD_DEFINITION_CONTRACT_LIMITS.maxTransferFields),
  })
  .strict();

const transferRoleRuleSchema = z
  .object({
    role: roleSchema,
    editableFields: z.array(fieldReferenceSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxTransferFields),
  })
  .strict();

const transferResponsibilitySchema = z
  .object({
    fields: z.array(transferFieldSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxTransferFields),
    roleRules: z.array(transferRoleRuleSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxRoles),
  })
  .strict();

const draftTransferResponsibilitySchema = z
  .object({
    fields: z.array(transferFieldSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxTransferFields).optional(),
    roleRules: z.array(transferRoleRuleSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxRoles).optional(),
  })
  .strict();

const validationOperationSchema = z
  .object({
    name: referenceSchema,
    enabledValidationGroups: z.array(referenceSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxRoles),
    roles: z.array(roleSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxRoles).optional(),
    allowedTargetStages: z.array(workflowStageKeySchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxStages).optional(),
    mode: z.enum(['shadow', 'enforce']).optional(),
  })
  .strict();

const stageValidationOperationOverrideSchema: z.ZodType<
  RecordDefinitionStageValidationOperationOverrideDto,
  RuntimeValue
> = z
  .object({
    name: referenceSchema,
    enabledValidationGroups: z.array(referenceSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxRoles),
    roles: z.array(roleSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxRoles).optional(),
    allowedTargetStages: z.array(workflowStageKeySchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxStages).optional(),
  })
  .strict();

const validationPolicySchema = z
  .object({
    mode: z.enum(['shadow', 'enforce']),
    operations: z.array(validationOperationSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxValidationOperations),
  })
  .strict();

const draftValidationPolicySchema = z
  .object({
    mode: z.enum(['shadow', 'enforce']).optional(),
    operations: z
      .array(validationOperationSchema)
      .max(RECORD_DEFINITION_CONTRACT_LIMITS.maxValidationOperations)
      .optional(),
  })
  .strict();

const concurrencyPolicySchema = z
  .object({
    mode: z.enum(RECORD_CONCURRENT_MODIFICATION_MODES),
  })
  .strict();

const draftConcurrencyPolicySchema = z
  .object({
    mode: z.enum(RECORD_CONCURRENT_MODIFICATION_MODES).optional(),
  })
  .strict();

const dashboardValueSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('path'),
      path: fieldReferenceSchema.refine(
        path =>
          path
            .split('.')
            .every(segment => segment.length > 0 && !['__proto__', 'prototype', 'constructor'].includes(segment)),
        'Dashboard paths must contain nonempty, non-prototype property segments.'
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal('jsonata'),
      expression: z.string().trim().min(1).max(RECORD_DEFINITION_EXPRESSION_MAX_LENGTH),
    })
    .strict(),
]);

const dashboardColumnSchema = z
  .object({
    id: referenceSchema,
    title: labelSchema,
    value: dashboardValueSchema,
    render: z
      .object({
        kind: z.literal('handlebars'),
        template: z.string().trim().min(1).max(RECORD_DEFINITION_TEMPLATE_MAX_LENGTH),
      })
      .strict()
      .optional(),
    displayOrder: z.number().int().min(0).max(RECORD_DEFINITION_REVISION_NUMBER_MAX),
  })
  .strict();

const dashboardSchema = z
  .object({
    schemaVersion: z.literal(1),
    showAdminSidebar: z.boolean(),
    columns: z.array(dashboardColumnSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxDashboardColumns),
  })
  .strict();

const draftRecordTypeFieldsSchema: z.ZodType<DraftRecordTypeAdministrableFieldsDto, RuntimeValue> = z
  .object({
    labels: draftLabelsSchema.optional(),
    searchable: z.boolean().optional(),
    searchFilters: z.array(searchFilterSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxSearchFilters).optional(),
    relationships: z.array(relationshipSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxRelationships).optional(),
    transferResponsibility: draftTransferResponsibilitySchema.optional(),
    validation: draftValidationPolicySchema.optional(),
    concurrency: draftConcurrencyPolicySchema.optional(),
    dashboard: dashboardSchema.optional(),
  })
  .strict();

const publishableRecordTypeFieldsSchema: z.ZodType<PublishableRecordTypeAdministrableFieldsDto, RuntimeValue> = z
  .object({
    labels: labelsSchema,
    searchable: z.boolean(),
    searchFilters: z.array(searchFilterSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxSearchFilters),
    relationships: z.array(relationshipSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxRelationships),
    transferResponsibility: transferResponsibilitySchema,
    validation: validationPolicySchema,
    concurrency: concurrencyPolicySchema,
    dashboard: dashboardSchema.optional(),
  })
  .strict();

const draftWorkflowStageSchemaImplementation: z.ZodType<DraftWorkflowStageDto, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_STAGE_SCHEMA_VERSION),
    key: workflowStageKeySchema,
    label: labelSchema.optional(),
    formReference: referenceSchema.optional(),
    viewRoles: z.array(roleSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxRoles).optional(),
    editRoles: z.array(roleSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxRoles).optional(),
    displayOrder: z.number().int().min(0).max(RECORD_DEFINITION_REVISION_NUMBER_MAX).optional(),
    starting: z.boolean().optional(),
    terminal: z.boolean().optional(),
    validationOverrides: z
      .array(stageValidationOperationOverrideSchema)
      .max(RECORD_DEFINITION_CONTRACT_LIMITS.maxValidationOperations)
      .optional(),
    dashboard: dashboardSchema.optional(),
    baseRecordTypeKey: recordDefinitionKeySchema.optional(),
  })
  .strict();

const publishableWorkflowStageSchemaImplementation: z.ZodType<PublishableWorkflowStageDto, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_STAGE_SCHEMA_VERSION),
    key: workflowStageKeySchema,
    label: labelSchema,
    formReference: referenceSchema,
    viewRoles: z.array(roleSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxRoles),
    editRoles: z.array(roleSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxRoles),
    displayOrder: z.number().int().min(0).max(RECORD_DEFINITION_REVISION_NUMBER_MAX),
    starting: z.boolean(),
    terminal: z.boolean(),
    validationOverrides: z
      .array(stageValidationOperationOverrideSchema)
      .max(RECORD_DEFINITION_CONTRACT_LIMITS.maxValidationOperations),
    dashboard: dashboardSchema.optional(),
    baseRecordTypeKey: recordDefinitionKeySchema.optional(),
  })
  .strict();

const draftWorkflowTransitionSchemaImplementation: z.ZodType<DraftWorkflowTransitionDto, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION),
    id: workflowTransitionIdSchemaImplementation,
    sourceStageKey: workflowStageKeySchema.optional(),
    targetStageKey: workflowStageKeySchema.optional(),
    label: labelSchema.optional(),
    description: descriptionSchema.optional(),
    mode: z.enum(['manual', 'automatic']).optional(),
    allowedRoles: z.array(roleSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxRoles).optional(),
    eligibilityCondition: z.string().trim().min(1).max(RECORD_DEFINITION_EXPRESSION_MAX_LENGTH).optional(),
    event: z.enum(['create', 'update']).optional(),
    priority: z.number().int().min(0).max(RECORD_DEFINITION_REVISION_NUMBER_MAX).optional(),
    condition: z.string().trim().min(1).max(RECORD_DEFINITION_EXPRESSION_MAX_LENGTH).optional(),
    validationOperation: referenceSchema.optional(),
  })
  .strict();

const publishableTransitionBase = {
  schemaVersion: z.literal(RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION),
  id: workflowTransitionIdSchemaImplementation,
  sourceStageKey: workflowStageKeySchema,
  targetStageKey: workflowStageKeySchema,
  label: labelSchema,
  description: descriptionSchema.optional(),
  validationOperation: referenceSchema.optional(),
};

const manualWorkflowTransitionSchema: z.ZodType<ManualWorkflowTransitionDto, RuntimeValue> = z
  .object({
    ...publishableTransitionBase,
    mode: z.literal('manual'),
    allowedRoles: z.array(roleSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxRoles),
    eligibilityCondition: z.string().trim().min(1).max(RECORD_DEFINITION_EXPRESSION_MAX_LENGTH).optional(),
  })
  .strict();

const automaticWorkflowTransitionSchema: z.ZodType<AutomaticWorkflowTransitionDto, RuntimeValue> = z
  .object({
    ...publishableTransitionBase,
    mode: z.literal('automatic'),
    event: z.enum(['create', 'update']),
    priority: z.number().int().min(0).max(RECORD_DEFINITION_REVISION_NUMBER_MAX),
    condition: z.string().trim().min(1).max(RECORD_DEFINITION_EXPRESSION_MAX_LENGTH),
  })
  .strict();

const publishableWorkflowTransitionSchemaImplementation: z.ZodType<PublishableWorkflowTransitionDto, RuntimeValue> =
  z.union([manualWorkflowTransitionSchema, automaticWorkflowTransitionSchema]);

function parseDefinitionActionBinding(value: RuntimeValue): RecordDefinitionActionBindingDto | undefined {
  const result = actionBindingSchema.safeParse(value);
  if (!result.success) {
    return undefined;
  }
  const binding = result.data;
  const scope = binding.scope;
  if (scope.context === 'queued-record-action') {
    return undefined;
  }
  if (scope.context === 'workflow-transition') {
    if (!WORKFLOW_TRANSITION_ID_PATTERN.test(scope.scopeId)) {
      return undefined;
    }
    return {
      ...binding,
      scope: {
        ...scope,
        scopeId: parseWorkflowTransitionId(scope.scopeId),
      },
    };
  }
  return { ...binding, scope };
}

const recordDefinitionActionBindingSchemaImplementation: z.ZodType<RecordDefinitionActionBindingDto, RuntimeValue> = z
  .custom<RuntimeValue>()
  .transform((value, context) => {
    const binding = parseDefinitionActionBinding(value);
    if (binding === undefined) {
      context.addIssue({ code: 'custom', message: 'Record-definition action binding is invalid.' });
      return z.NEVER;
    }
    return binding;
  });

const draftRecordDefinitionAggregateSchemaImplementation: z.ZodType<DraftRecordDefinitionAggregateDto, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION),
    definitionState: z.literal('draft-incomplete'),
    recordType: draftRecordTypeFieldsSchema,
    stages: z.array(draftWorkflowStageSchemaImplementation).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxStages),
    transitions: z
      .array(draftWorkflowTransitionSchemaImplementation)
      .max(RECORD_DEFINITION_CONTRACT_LIMITS.maxTransitions),
    actionBindings: z
      .array(recordDefinitionActionBindingSchemaImplementation)
      .max(RECORD_DEFINITION_CONTRACT_LIMITS.maxActionBindings),
  })
  .strict();

const publishableRecordDefinitionAggregateSchemaImplementation: z.ZodType<
  PublishableRecordDefinitionAggregateDto,
  RuntimeValue
> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION),
    definitionState: z.literal('publishable'),
    recordType: publishableRecordTypeFieldsSchema,
    stages: z.array(publishableWorkflowStageSchemaImplementation).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxStages),
    transitions: z
      .array(publishableWorkflowTransitionSchemaImplementation)
      .max(RECORD_DEFINITION_CONTRACT_LIMITS.maxTransitions),
    actionBindings: z
      .array(recordDefinitionActionBindingSchemaImplementation)
      .max(RECORD_DEFINITION_CONTRACT_LIMITS.maxActionBindings),
  })
  .strict();

const redactionSchema: z.ZodType<RecordDefinitionRedactionDto, RuntimeValue> = z
  .object({
    path: z.string().min(1).max(RECORD_DEFINITION_PATH_MAX_LENGTH),
    reason: z.enum(['secret', 'sensitive-input', 'bounded-output']),
    marker: z.literal(RECORD_DEFINITION_REDACTION_MARKER),
  })
  .strict();

const validationIssueSchema = z
  .object({
    code: z.string().min(1).max(RECORD_DEFINITION_ISSUE_CODE_MAX_LENGTH).regex(RECORD_DEFINITION_REFERENCE_PATTERN),
    path: z.string().min(1).max(RECORD_DEFINITION_PATH_MAX_LENGTH),
    severity: z.enum(['warning', 'error']),
    message: displayText(RECORD_DEFINITION_ISSUE_MESSAGE_MAX_LENGTH),
  })
  .strict();

const validationReportSchemaImplementation: z.ZodType<RecordDefinitionValidationReportDto, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_REPORT_SCHEMA_VERSION),
    brandId: brandIdSchema,
    recordTypeKey: recordDefinitionKeySchema,
    scope: z.enum(['draft-save', 'publication', 'rollback', 'migration']),
    status: z.enum(['valid', 'invalid']),
    definitionState: z.enum(['draft-incomplete', 'publishable']),
    validatedDraftVersion: versionSchema,
    validatedActiveRevisionNumber: nullableRevisionSchema,
    issues: z.array(validationIssueSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxReportIssues),
    redactions: z.array(redactionSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxReportIssues),
    truncated: z.boolean(),
  })
  .strict();

const stageImpactSchema = z
  .object({
    stageKey: workflowStageKeySchema,
    referencedRecordCount: versionSchema,
    effect: z.enum(['unchanged', 'label-only', 'blocked-removal', 'blocked-rename']),
  })
  .strict();

const structuralChangeSchema = z
  .object({
    path: z.string().min(1).max(RECORD_DEFINITION_PATH_MAX_LENGTH),
    kind: z.enum(['added', 'removed', 'changed', 'reordered']),
  })
  .strict();

const impactReportSchemaImplementation: z.ZodType<RecordDefinitionImpactReportDto, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_REPORT_SCHEMA_VERSION),
    brandId: brandIdSchema,
    recordTypeKey: recordDefinitionKeySchema,
    status: z.enum(['clear', 'warning', 'blocked']),
    activeRevisionNumber: nullableRevisionSchema,
    draftVersion: versionSchema,
    affectedRecordCount: versionSchema,
    stageImpacts: z.array(stageImpactSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxStages),
    changes: z.array(structuralChangeSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxReportChanges),
    redactions: z.array(redactionSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxReportIssues),
    truncated: z.boolean(),
  })
  .strict();

const revisionSourceSchema = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.enum(['publish', 'bootstrap', 'migration']),
      sourceRevisionNumber: nullableRevisionSchema,
    })
    .strict(),
  z
    .object({
      operation: z.literal('rollback'),
      sourceRevisionNumber: positiveRevisionSchema,
    })
    .strict(),
]);

const revisionPointerSchema = z
  .object({
    id: recordDefinitionRevisionIdSchemaImplementation,
    revisionNumber: positiveRevisionSchema,
    canonicalHash: canonicalHashSchema,
  })
  .strict();

const draftSummarySchema = z
  .object({
    id: recordDefinitionDraftIdSchemaImplementation,
    version: versionSchema,
    baseRevisionNumber: nullableRevisionSchema,
    updatedAt: timestampSchema,
    updatedBy: actorSchema,
  })
  .strict();

const retirementSchema = z
  .object({
    retiredAt: timestampSchema,
    retiredBy: actorSchema,
    reason: reasonSchema.optional(),
  })
  .strict();

const recordTypeIdentitySchemaImplementation: z.ZodType<RecordTypeIdentityDto, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_API_SCHEMA_VERSION),
    id: recordDefinitionIdSchemaImplementation,
    brandId: brandIdSchema,
    key: recordDefinitionKeySchema,
    deployment: deploymentFieldsSchema,
    version: versionSchema,
    activeRevision: revisionPointerSchema.nullable(),
    draft: draftSummarySchema.nullable(),
    retirement: retirementSchema.nullable(),
  })
  .strict()
  .superRefine((identity, context) => {
    const canonicalInput = { brandId: identity.brandId, recordTypeKey: identity.key };
    if (identity.id !== deriveRecordDefinitionId(canonicalInput)) {
      context.addIssue({ code: 'custom', path: ['id'], message: 'Record-definition ID is not canonical.' });
    }
    if (identity.draft !== null && identity.draft.id !== deriveRecordDefinitionDraftId(canonicalInput)) {
      context.addIssue({ code: 'custom', path: ['draft', 'id'], message: 'Draft ID is not canonical.' });
    }
    if (
      identity.activeRevision !== null &&
      identity.activeRevision.id !==
        deriveRecordDefinitionRevisionId(canonicalInput, identity.activeRevision.revisionNumber)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['activeRevision', 'id'],
        message: 'Active revision ID is not canonical.',
      });
    }
  });

const actionContractReferenceSchema = z
  .object({
    actionId: actionDefinitionIdZodSchema,
    contractVersion: z.number().int().min(1).max(ACTION_CONTRACT_LIMITS.maxContractVersion),
  })
  .strict();

const recordDefinitionDraftSchemaImplementation: z.ZodType<RecordDefinitionDraftDto, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_API_SCHEMA_VERSION),
    id: recordDefinitionDraftIdSchemaImplementation,
    recordTypeId: recordDefinitionIdSchemaImplementation,
    brandId: brandIdSchema,
    recordTypeKey: recordDefinitionKeySchema,
    version: versionSchema,
    baseRevisionNumber: nullableRevisionSchema,
    definition: draftRecordDefinitionAggregateSchemaImplementation,
    updatedAt: timestampSchema,
    updatedBy: actorSchema,
    validation: validationReportSchemaImplementation.nullable(),
  })
  .strict()
  .superRefine((draft, context) => {
    const canonicalInput = { brandId: draft.brandId, recordTypeKey: draft.recordTypeKey };
    if (draft.recordTypeId !== deriveRecordDefinitionId(canonicalInput)) {
      context.addIssue({ code: 'custom', path: ['recordTypeId'], message: 'Record-definition ID is not canonical.' });
    }
    if (draft.id !== deriveRecordDefinitionDraftId(canonicalInput)) {
      context.addIssue({ code: 'custom', path: ['id'], message: 'Draft ID is not canonical.' });
    }
    if (draft.validation !== null && draft.validation.brandId !== draft.brandId) {
      context.addIssue({
        code: 'custom',
        path: ['validation', 'brandId'],
        message: 'Draft validation report brand does not match the draft.',
      });
    }
    if (draft.validation !== null && draft.validation.recordTypeKey !== draft.recordTypeKey) {
      context.addIssue({
        code: 'custom',
        path: ['validation', 'recordTypeKey'],
        message: 'Draft validation report record type does not match the draft.',
      });
    }
  });

const recordDefinitionRevisionSchemaImplementation: z.ZodType<RecordDefinitionRevisionDto, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_API_SCHEMA_VERSION),
    id: recordDefinitionRevisionIdSchemaImplementation,
    brandId: brandIdSchema,
    recordTypeKey: recordDefinitionKeySchema,
    revisionNumber: positiveRevisionSchema,
    canonicalHash: canonicalHashSchema,
    definition: publishableRecordDefinitionAggregateSchemaImplementation,
    actionContracts: z.array(actionContractReferenceSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxActionContracts),
    source: revisionSourceSchema,
    publishedAt: timestampSchema,
    publishedBy: actorSchema,
    publicationNote: noteSchema.optional(),
  })
  .strict()
  .superRefine((revision, context) => {
    if (
      revision.id !==
      deriveRecordDefinitionRevisionId(
        { brandId: revision.brandId, recordTypeKey: revision.recordTypeKey },
        revision.revisionNumber
      )
    ) {
      context.addIssue({ code: 'custom', path: ['id'], message: 'Revision ID is not canonical.' });
    }
  });

const draftSaveRequestSchemaImplementation: z.ZodType<RecordDefinitionDraftSaveRequestDto, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_API_SCHEMA_VERSION),
    expectedDraftVersion: versionSchema,
    expectedActiveRevisionNumber: nullableRevisionSchema,
    definition: draftRecordDefinitionAggregateSchemaImplementation,
  })
  .strict();

const publicationRequestSchemaImplementation: z.ZodType<RecordDefinitionPublicationRequestDto, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_API_SCHEMA_VERSION),
    expectedIdentityVersion: versionSchema,
    expectedDraftVersion: versionSchema,
    expectedActiveRevisionNumber: nullableRevisionSchema,
    publicationNote: noteSchema.optional(),
  })
  .strict();

const rollbackRequestSchemaImplementation: z.ZodType<RecordDefinitionRollbackRequestDto, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_API_SCHEMA_VERSION),
    expectedIdentityVersion: versionSchema,
    expectedActiveRevisionNumber: nullableRevisionSchema,
    sourceRevisionNumber: positiveRevisionSchema,
    reason: reasonSchema,
  })
  .strict();

const retirementRequestSchemaImplementation: z.ZodType<RecordDefinitionRetirementRequestDto, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_API_SCHEMA_VERSION),
    expectedIdentityVersion: versionSchema,
    reason: reasonSchema.optional(),
  })
  .strict();

const historySummarySchemaImplementation: z.ZodType<RecordDefinitionHistorySummaryDto, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_REPORT_SCHEMA_VERSION),
    id: referenceSchema,
    brandId: brandIdSchema,
    recordTypeKey: recordDefinitionKeySchema,
    revision: revisionPointerSchema,
    source: revisionSourceSchema,
    publishedAt: timestampSchema,
    publishedBy: actorSchema,
    publicationNote: noteSchema.optional(),
    validation: z
      .object({
        status: z.enum(['valid', 'invalid']),
        errorCount: versionSchema,
        warningCount: versionSchema,
      })
      .strict(),
    impact: z
      .object({
        status: z.enum(['clear', 'warning', 'blocked']),
        affectedRecordCount: versionSchema,
      })
      .strict(),
    changes: z.array(structuralChangeSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxReportChanges),
    redactions: z.array(redactionSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxReportIssues),
    truncated: z.boolean(),
  })
  .strict()
  .superRefine((summary, context) => {
    const canonicalRevisionId = deriveRecordDefinitionRevisionId(
      { brandId: summary.brandId, recordTypeKey: summary.recordTypeKey },
      summary.revision.revisionNumber
    );
    if (summary.revision.id !== canonicalRevisionId) {
      context.addIssue({
        code: 'custom',
        path: ['revision', 'id'],
        message: 'History revision ID is not canonical for this record definition.',
      });
    }
  });

const conflictSchemaImplementation: z.ZodType<RecordDefinitionConflictDto, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(RECORD_DEFINITION_REPORT_SCHEMA_VERSION),
    code: z.enum(['identity-version-conflict', 'draft-version-conflict', 'active-revision-conflict']),
    resource: z.enum(['identity', 'draft', 'active-revision']),
    brandId: brandIdSchema,
    recordTypeKey: recordDefinitionKeySchema,
    expectedVersion: versionSchema.nullable(),
    currentVersion: versionSchema.nullable(),
    expectedActiveRevisionNumber: nullableRevisionSchema,
    currentActiveRevisionNumber: nullableRevisionSchema,
    message: displayText(RECORD_DEFINITION_ISSUE_MESSAGE_MAX_LENGTH),
  })
  .strict();

const persistedIdentitySchemaImplementation: z.ZodType<PersistedRecordTypeIdentity, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION),
    id: recordDefinitionIdSchemaImplementation,
    brandId: brandIdSchema,
    key: recordDefinitionKeySchema,
    deployment: deploymentFieldsSchema,
    version: versionSchema,
    activeRevisionId: recordDefinitionRevisionIdSchemaImplementation.nullable(),
    activeRevisionNumber: nullableRevisionSchema,
    draftId: recordDefinitionDraftIdSchemaImplementation.nullable(),
    retirement: retirementSchema.nullable(),
    createdAt: timestampSchema,
    createdBy: actorSchema,
    updatedAt: timestampSchema,
    updatedBy: actorSchema,
  })
  .strict()
  .superRefine((identity, context) => {
    const canonicalInput = { brandId: identity.brandId, recordTypeKey: identity.key };
    if (identity.id !== deriveRecordDefinitionId(canonicalInput)) {
      context.addIssue({ code: 'custom', path: ['id'], message: 'Record-definition ID is not canonical.' });
    }
    if (identity.draftId !== null && identity.draftId !== deriveRecordDefinitionDraftId(canonicalInput)) {
      context.addIssue({ code: 'custom', path: ['draftId'], message: 'Draft ID is not canonical.' });
    }
    if ((identity.activeRevisionId === null) !== (identity.activeRevisionNumber === null)) {
      context.addIssue({
        code: 'custom',
        path: ['activeRevisionId'],
        message: 'Active revision ID and number must be present together.',
      });
    } else if (
      identity.activeRevisionId !== null &&
      identity.activeRevisionNumber !== null &&
      identity.activeRevisionId !== deriveRecordDefinitionRevisionId(canonicalInput, identity.activeRevisionNumber)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['activeRevisionId'],
        message: 'Active revision ID is not canonical.',
      });
    }
  });

const persistedDraftShape = {
  schemaVersion: z.literal(PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION),
  id: recordDefinitionDraftIdSchemaImplementation,
  recordTypeId: recordDefinitionIdSchemaImplementation,
  brandId: brandIdSchema,
  recordTypeKey: recordDefinitionKeySchema,
  version: versionSchema,
  baseRevisionId: recordDefinitionRevisionIdSchemaImplementation.nullable(),
  baseRevisionNumber: nullableRevisionSchema,
  definition: draftRecordDefinitionAggregateSchemaImplementation,
  createdAt: timestampSchema,
  createdBy: actorSchema,
  updatedAt: timestampSchema,
  updatedBy: actorSchema,
};

function persistedDraftIdentifiersCanonical(draft: PersistedRecordDefinitionDraft): boolean {
  const canonicalInput = { brandId: draft.brandId, recordTypeKey: draft.recordTypeKey };
  if (
    draft.recordTypeId !== deriveRecordDefinitionId(canonicalInput) ||
    draft.id !== deriveRecordDefinitionDraftId(canonicalInput) ||
    (draft.baseRevisionId === null) !== (draft.baseRevisionNumber === null)
  ) {
    return false;
  }
  return (
    draft.baseRevisionId === null ||
    (draft.baseRevisionNumber !== null &&
      draft.baseRevisionId === deriveRecordDefinitionRevisionId(canonicalInput, draft.baseRevisionNumber))
  );
}

const persistedDraftSchemaImplementation: z.ZodType<PersistedRecordDefinitionDraft, RuntimeValue> = z
  .object({
    ...persistedDraftShape,
    validation: validationReportSchemaImplementation.nullable(),
  })
  .strict()
  .refine(persistedDraftIdentifiersCanonical, { message: 'Persisted draft identifiers are not canonical.' })
  .superRefine((draft, context) => {
    if (draft.validation !== null && draft.validation.brandId !== draft.brandId) {
      context.addIssue({
        code: 'custom',
        path: ['validation', 'brandId'],
        message: 'Persisted draft validation report brand does not match the draft.',
      });
    }
    if (draft.validation !== null && draft.validation.recordTypeKey !== draft.recordTypeKey) {
      context.addIssue({
        code: 'custom',
        path: ['validation', 'recordTypeKey'],
        message: 'Persisted draft validation report record type does not match the draft.',
      });
    }
  });

const persistedRevisionShape = {
  schemaVersion: z.literal(PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION),
  id: recordDefinitionRevisionIdSchemaImplementation,
  recordTypeId: recordDefinitionIdSchemaImplementation,
  brandId: brandIdSchema,
  recordTypeKey: recordDefinitionKeySchema,
  revisionNumber: positiveRevisionSchema,
  canonicalHash: canonicalHashSchema,
  definition: publishableRecordDefinitionAggregateSchemaImplementation,
  actionContracts: z.array(actionContractReferenceSchema).max(RECORD_DEFINITION_CONTRACT_LIMITS.maxActionContracts),
  source: revisionSourceSchema,
  publicationNote: noteSchema.optional(),
  createdAt: timestampSchema,
  createdBy: actorSchema,
  publishedAt: timestampSchema,
  publishedBy: actorSchema,
};

function persistedRevisionIdentifiersCanonical(revision: PersistedRecordDefinitionRevision): boolean {
  const canonicalInput = { brandId: revision.brandId, recordTypeKey: revision.recordTypeKey };
  return (
    revision.recordTypeId === deriveRecordDefinitionId(canonicalInput) &&
    revision.id === deriveRecordDefinitionRevisionId(canonicalInput, revision.revisionNumber)
  );
}

const persistedRevisionSchemaImplementation: z.ZodType<PersistedRecordDefinitionRevision, RuntimeValue> = z
  .object(persistedRevisionShape)
  .strict()
  .refine(persistedRevisionIdentifiersCanonical, {
    message: 'Persisted revision identifiers are not canonical.',
  });

function arrayCardinalityLimit(path: string): number {
  if (path.endsWith('.stages') || path.endsWith('.stageImpacts')) {
    return RECORD_DEFINITION_CONTRACT_LIMITS.maxStages;
  }
  if (path.endsWith('.transitions')) {
    return RECORD_DEFINITION_CONTRACT_LIMITS.maxTransitions;
  }
  if (path.endsWith('.actionBindings') || path.endsWith('.actionContracts')) {
    return RECORD_DEFINITION_CONTRACT_LIMITS.maxActionBindings;
  }
  if (path.endsWith('.issues') || path.endsWith('.redactions')) {
    return RECORD_DEFINITION_CONTRACT_LIMITS.maxReportIssues;
  }
  if (path.endsWith('.changes')) {
    return RECORD_DEFINITION_CONTRACT_LIMITS.maxReportChanges;
  }
  return Math.max(RECORD_DEFINITION_CONTRACT_LIMITS.maxTransferFields, RECORD_DEFINITION_CONTRACT_LIMITS.maxRoles);
}

function preflightRecordDefinition(value: RuntimeValue): BoundedValidationResult {
  return boundedValidationPreflight(value, {
    maxBytes: RECORD_DEFINITION_CONTRACT_LIMITS.maxContractBytes,
    maxDepth: RECORD_DEFINITION_CONTRACT_LIMITS.maxDepth,
    maxStringLength: RECORD_DEFINITION_CONTRACT_LIMITS.maxStringLength,
    maxPropertyNameLength: RECORD_DEFINITION_CONTRACT_LIMITS.maxPropertyNameLength,
    maxWork: RECORD_DEFINITION_CONTRACT_LIMITS.maxValidationWork,
    arrayCardinalityLimit,
    objectCardinalityLimit: () => RECORD_DEFINITION_CONTRACT_LIMITS.maxObjectProperties,
  });
}

/** @internal */
export interface RecordDefinitionContractInspectionIssue {
  readonly kind: 'invalid-value' | 'unknown-property';
  readonly path: readonly (string | number)[];
}

/** @internal */
export interface RecordDefinitionContractInspectionSuccess<Value> {
  readonly success: true;
  readonly data: Value;
}

/** @internal */
export interface RecordDefinitionContractInspectionFailure {
  readonly success: false;
  readonly preflightFailure?: BoundedValidationFailure;
  readonly issues: readonly RecordDefinitionContractInspectionIssue[];
}

/** @internal */
export type RecordDefinitionContractInspection<Value> =
  | RecordDefinitionContractInspectionSuccess<Value>
  | RecordDefinitionContractInspectionFailure;

function inspectionPath(path: readonly PropertyKey[]): readonly (string | number)[] {
  return Object.freeze(path.map(segment => (typeof segment === 'number' ? segment : String(segment))));
}

function inspectRecordDefinitionContract<Value>(
  schema: z.ZodType<Value, RuntimeValue>,
  value: RuntimeValue
): RecordDefinitionContractInspection<Value> {
  const preflight = preflightRecordDefinition(value);
  if (!preflight.ok) {
    return Object.freeze({ success: false, preflightFailure: preflight, issues: Object.freeze([]) });
  }
  const result = schema.safeParse(value);
  if (result.success) {
    return Object.freeze({ success: true, data: result.data });
  }
  const issues: RecordDefinitionContractInspectionIssue[] = [];
  for (const issue of result.error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of [...issue.keys].sort()) {
        issues.push(
          Object.freeze({
            kind: 'unknown-property',
            path: Object.freeze([...inspectionPath(issue.path), key]),
          })
        );
      }
      continue;
    }
    issues.push(Object.freeze({ kind: 'invalid-value', path: inspectionPath(issue.path) }));
  }
  return Object.freeze({ success: false, issues: Object.freeze(issues) });
}

function cloneProjectionValue(value: RuntimeValue): RuntimeValue {
  if (isRuntimeArray(value)) {
    return value.map(cloneProjectionValue);
  }
  if (!isRuntimeRecord(value)) {
    return value;
  }
  const clone = Object.create(null) as RuntimeRecord;
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable === true && descriptor.get === undefined && descriptor.set === undefined) {
      clone[key] = cloneProjectionValue(descriptor.value);
    }
  }
  return clone;
}

function deleteProjectionPath(root: RuntimeValue, path: readonly PropertyKey[]): boolean {
  if (path.length === 0) return false;
  let parent = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (isRuntimeArray(parent) && typeof segment === 'number' && segment >= 0 && segment < parent.length) {
      parent = parent[segment];
    } else if (isRuntimeRecord(parent) && typeof segment === 'string' && Object.hasOwn(parent, segment)) {
      parent = parent[segment];
    } else {
      return false;
    }
  }
  const finalSegment = path[path.length - 1];
  if (isRuntimeArray(parent) && typeof finalSegment === 'number' && finalSegment >= 0 && finalSegment < parent.length) {
    parent.splice(finalSegment, 1);
    return true;
  }
  if (isRuntimeRecord(parent) && typeof finalSegment === 'string' && Object.hasOwn(parent, finalSegment)) {
    return delete parent[finalSegment];
  }
  return false;
}

const REQUIRED_DRAFT_ROOT_PROPERTIES: ReadonlySet<PropertyKey> = new Set([
  'schemaVersion',
  'definitionState',
  'recordType',
  'stages',
  'transitions',
  'actionBindings',
]);

function removeInvalidProjectionValue(root: RuntimeValue, path: readonly PropertyKey[]): boolean {
  if (deleteProjectionPath(root, path)) return true;
  for (let length = path.length - 1; length > 0; length -= 1) {
    const ancestorPath = path.slice(0, length);
    if (ancestorPath.length === 1 && REQUIRED_DRAFT_ROOT_PROPERTIES.has(ancestorPath[0])) continue;
    if (deleteProjectionPath(root, ancestorPath)) return true;
  }
  return false;
}

function compareProjectionRemovalPaths(left: readonly PropertyKey[], right: readonly PropertyKey[]): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftSegment = left[index];
    const rightSegment = right[index];
    if (leftSegment === rightSegment) continue;
    if (typeof leftSegment === 'number' && typeof rightSegment === 'number') {
      return rightSegment - leftSegment;
    }
    return String(rightSegment) < String(leftSegment) ? -1 : 1;
  }
  return right.length - left.length;
}

/**
 * Produce a semantically inspectable draft from preflight-safe input by
 * removing only invalid leaves or unusable collection entries. The original
 * strict inspection remains authoritative and its shape issues are retained;
 * this projection exists only so independent graph and impact checks can run.
 *
 * @internal
 */
export function projectDraftRecordDefinitionAggregate(
  value: RuntimeValue
): DraftRecordDefinitionAggregateDto | undefined {
  if (!preflightRecordDefinition(value).ok) return undefined;
  const projection = cloneProjectionValue(value);
  for (let attempt = 0; attempt <= RECORD_DEFINITION_CONTRACT_LIMITS.maxDepth; attempt += 1) {
    const result = draftRecordDefinitionAggregateSchemaImplementation.safeParse(projection);
    if (result.success) return result.data;
    let removed = false;
    const invalidPaths: PropertyKey[][] = [];
    for (const issue of result.error.issues) {
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) {
          removed = deleteProjectionPath(projection, [...issue.path, key]) || removed;
        }
      } else {
        invalidPaths.push([...issue.path]);
      }
    }
    invalidPaths.sort(compareProjectionRemovalPaths);
    for (const path of invalidPaths) {
      removed = removeInvalidProjectionValue(projection, path) || removed;
    }
    if (!removed) return undefined;
  }
  return undefined;
}

/** @internal */
export function inspectDraftRecordDefinitionAggregate(
  value: RuntimeValue
): RecordDefinitionContractInspection<DraftRecordDefinitionAggregateDto> {
  return inspectRecordDefinitionContract(draftRecordDefinitionAggregateSchemaImplementation, value);
}

/** @internal */
export function inspectPublishableRecordDefinitionAggregate(
  value: RuntimeValue
): RecordDefinitionContractInspection<PublishableRecordDefinitionAggregateDto> {
  return inspectRecordDefinitionContract(publishableRecordDefinitionAggregateSchemaImplementation, value);
}

function runtimeValidator<Value>(schema: z.ZodType<Value, RuntimeValue>): RuntimeValidator<Value> {
  return createRuntimeValidator((value: RuntimeValue): RuntimeValidationResult<Value> => {
    if (!preflightRecordDefinition(value).ok) {
      return Object.freeze({ success: false });
    }
    const result = schema.safeParse(value);
    return result.success ? Object.freeze({ success: true, data: result.data }) : Object.freeze({ success: false });
  });
}

export const recordDefinitionIdSchema = runtimeValidator(recordDefinitionIdSchemaImplementation);
export const recordDefinitionDraftIdSchema = runtimeValidator(recordDefinitionDraftIdSchemaImplementation);
export const recordDefinitionRevisionIdSchema = runtimeValidator(recordDefinitionRevisionIdSchemaImplementation);
export const workflowTransitionIdSchema = runtimeValidator(workflowTransitionIdSchemaImplementation);
export const draftWorkflowStageSchema = runtimeValidator(draftWorkflowStageSchemaImplementation);
export const publishableWorkflowStageSchema = runtimeValidator(publishableWorkflowStageSchemaImplementation);
export const draftWorkflowTransitionSchema = runtimeValidator(draftWorkflowTransitionSchemaImplementation);
export const publishableWorkflowTransitionSchema = runtimeValidator(publishableWorkflowTransitionSchemaImplementation);
export const recordDefinitionActionBindingSchema = runtimeValidator(recordDefinitionActionBindingSchemaImplementation);
export const draftRecordDefinitionAggregateSchema = runtimeValidator(
  draftRecordDefinitionAggregateSchemaImplementation
);
export const publishableRecordDefinitionAggregateSchema = runtimeValidator(
  publishableRecordDefinitionAggregateSchemaImplementation
);
export const recordTypeIdentitySchema = runtimeValidator(recordTypeIdentitySchemaImplementation);
export const recordDefinitionDraftSchema = runtimeValidator(recordDefinitionDraftSchemaImplementation);
export const recordDefinitionRevisionSchema = runtimeValidator(recordDefinitionRevisionSchemaImplementation);
export const recordDefinitionDraftSaveRequestSchema = runtimeValidator(draftSaveRequestSchemaImplementation);
export const recordDefinitionPublicationRequestSchema = runtimeValidator(publicationRequestSchemaImplementation);
export const recordDefinitionRollbackRequestSchema = runtimeValidator(rollbackRequestSchemaImplementation);
export const recordDefinitionRetirementRequestSchema = runtimeValidator(retirementRequestSchemaImplementation);
export const recordDefinitionValidationReportSchema = runtimeValidator(validationReportSchemaImplementation);
export const recordDefinitionImpactReportSchema = runtimeValidator(impactReportSchemaImplementation);
export const recordDefinitionHistorySummarySchema = runtimeValidator(historySummarySchemaImplementation);
export const recordDefinitionConflictSchema = runtimeValidator(conflictSchemaImplementation);
export const persistedRecordTypeIdentitySchema = runtimeValidator(persistedIdentitySchemaImplementation);
export const persistedRecordDefinitionDraftSchema = runtimeValidator(persistedDraftSchemaImplementation);
export const persistedRecordDefinitionRevisionSchema = runtimeValidator(persistedRevisionSchemaImplementation);
