import type { RecordConcurrentModificationMode } from './record-concurrency.model';

/**
 * Public v1 record-definition contracts.
 *
 * Consumers reject schema versions they do not implement. A future breaking
 * change must add a parallel versioned contract and an explicit server-side
 * upgrade before this constant changes; persisted v1 snapshots are never
 * reinterpreted in place.
 */
export const RECORD_DEFINITION_API_SCHEMA_VERSION = 1 as const;
export const RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION = 1 as const;
export const RECORD_DEFINITION_STAGE_SCHEMA_VERSION = 1 as const;
export const RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION = 1 as const;
export const RECORD_DEFINITION_REPORT_SCHEMA_VERSION = 1 as const;

export const RECORD_DEFINITION_KEY_MAX_LENGTH = 64;
export const RECORD_DEFINITION_BRAND_ID_MAX_LENGTH = 128;
export const RECORD_DEFINITION_REFERENCE_MAX_LENGTH = 128;
export const RECORD_DEFINITION_LABEL_MAX_LENGTH = 256;
export const RECORD_DEFINITION_DESCRIPTION_MAX_LENGTH = 2_000;
export const RECORD_DEFINITION_NOTE_MAX_LENGTH = 2_000;
export const RECORD_DEFINITION_REASON_MAX_LENGTH = 1_000;
export const RECORD_DEFINITION_PATH_MAX_LENGTH = 512;
export const RECORD_DEFINITION_ISSUE_CODE_MAX_LENGTH = 128;
export const RECORD_DEFINITION_ISSUE_MESSAGE_MAX_LENGTH = 1_000;
export const RECORD_DEFINITION_EXPRESSION_MAX_LENGTH = 8_192;
export const RECORD_DEFINITION_TEMPLATE_MAX_LENGTH = 16_384;

/** Existing camel-case keys remain valid; keys are case-sensitive and never normalized. */
export const RECORD_DEFINITION_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const RECORD_DEFINITION_BRAND_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export const RECORD_DEFINITION_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const RECORD_DEFINITION_FIELD_REFERENCE_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
export const RECORD_DEFINITION_ID_PATTERN = /^rti_[a-f0-9]{32}$/;
export const RECORD_DEFINITION_DRAFT_ID_PATTERN = /^rdd_[a-f0-9]{32}$/;
export const RECORD_DEFINITION_REVISION_ID_PATTERN = /^rdr_[a-f0-9]{32}$/;
export const WORKFLOW_TRANSITION_ID_PATTERN = /^wft_[a-f0-9]{32}$/;
export const RECORD_DEFINITION_CANONICAL_HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;

export const RECORD_DEFINITION_REDACTION_MARKER = '[REDACTED]' as const;

declare const brandIdBrand: unique symbol;
declare const recordDefinitionKeyBrand: unique symbol;
declare const workflowStageKeyBrand: unique symbol;
declare const recordDefinitionIdBrand: unique symbol;
declare const recordDefinitionDraftIdBrand: unique symbol;
declare const recordDefinitionRevisionIdBrand: unique symbol;
declare const workflowTransitionIdBrand: unique symbol;
declare const recordDefinitionCanonicalHashBrand: unique symbol;

export type RecordDefinitionBrandId = string & { readonly [brandIdBrand]: true };
export type RecordDefinitionKey = string & { readonly [recordDefinitionKeyBrand]: true };
export type WorkflowStageKey = string & { readonly [workflowStageKeyBrand]: true };
export type RecordDefinitionId = string & { readonly [recordDefinitionIdBrand]: true };
export type RecordDefinitionDraftId = string & { readonly [recordDefinitionDraftIdBrand]: true };
export type RecordDefinitionRevisionId = string & { readonly [recordDefinitionRevisionIdBrand]: true };
export type WorkflowTransitionId = string & { readonly [workflowTransitionIdBrand]: true };
export type RecordDefinitionCanonicalHash = string & { readonly [recordDefinitionCanonicalHashBrand]: true };

function parseIdentifier<Value extends string>(value: string, pattern: RegExp, message: string): Value {
  if (!pattern.test(value)) {
    throw new TypeError(message);
  }
  return value as Value;
}

export function parseRecordDefinitionBrandId(value: string): RecordDefinitionBrandId {
  return parseIdentifier(value, RECORD_DEFINITION_BRAND_ID_PATTERN, 'Record-definition brand ID is invalid.');
}

export function parseRecordDefinitionKey(value: string): RecordDefinitionKey {
  return parseIdentifier(value, RECORD_DEFINITION_KEY_PATTERN, 'Record-definition key is invalid.');
}

export function parseWorkflowStageKey(value: string): WorkflowStageKey {
  return parseIdentifier(value, RECORD_DEFINITION_KEY_PATTERN, 'Workflow stage key is invalid.');
}

export function parseRecordDefinitionId(value: string): RecordDefinitionId {
  return parseIdentifier(value, RECORD_DEFINITION_ID_PATTERN, 'Record-definition ID is invalid.');
}

export function parseRecordDefinitionDraftId(value: string): RecordDefinitionDraftId {
  return parseIdentifier(value, RECORD_DEFINITION_DRAFT_ID_PATTERN, 'Record-definition draft ID is invalid.');
}

export function parseRecordDefinitionRevisionId(value: string): RecordDefinitionRevisionId {
  return parseIdentifier(value, RECORD_DEFINITION_REVISION_ID_PATTERN, 'Record-definition revision ID is invalid.');
}

export function parseWorkflowTransitionId(value: string): WorkflowTransitionId {
  return parseIdentifier(value, WORKFLOW_TRANSITION_ID_PATTERN, 'Workflow transition ID is invalid.');
}

export function parseRecordDefinitionCanonicalHash(value: string): RecordDefinitionCanonicalHash {
  return parseIdentifier(value, RECORD_DEFINITION_CANONICAL_HASH_PATTERN, 'Record-definition hash is invalid.');
}

export type RecordDefinitionJsonPrimitive = string | number | boolean | null;
export type RecordDefinitionJsonValue =
  | RecordDefinitionJsonPrimitive
  | readonly RecordDefinitionJsonValue[]
  | RecordDefinitionJsonObject;

export interface RecordDefinitionJsonObject {
  readonly [key: string]: RecordDefinitionJsonValue;
}

export type RecordDefinitionActionParameterValueDto =
  | { readonly kind: 'literal'; readonly value: RecordDefinitionJsonValue }
  | { readonly kind: 'jsonata'; readonly expression: string }
  | { readonly kind: 'handlebars'; readonly template: string }
  | { readonly kind: 'secret'; readonly configured: boolean };

export interface RecordDefinitionActionParameterValuesDto {
  readonly [parameterName: string]: RecordDefinitionActionParameterValueDto;
}

export type RecordDefinitionActionExecutionPhase = 'pre' | 'postSync' | 'post';
export type RecordDefinitionRecordLifecycleMode = 'onCreate' | 'onUpdate' | 'onDelete';

export type RecordDefinitionActionBindingScopeDto =
  | {
      readonly context: 'record-lifecycle';
      readonly mode: RecordDefinitionRecordLifecycleMode;
      readonly phase: RecordDefinitionActionExecutionPhase;
    }
  | {
      readonly context: 'workflow-transition';
      readonly mode: 'onTransitionWorkflow';
      readonly phase: RecordDefinitionActionExecutionPhase;
      readonly scopeId: WorkflowTransitionId;
    };

export type RecordDefinitionActionDependencyDto =
  | {
      readonly bindingId: string;
      readonly condition: 'success';
    }
  | {
      readonly bindingId: string;
      readonly condition: 'output-equals';
      readonly field: string;
      readonly value: RecordDefinitionJsonValue;
    };

export type RecordDefinitionActionRetryScheduleDto =
  | {
      readonly type: 'fixed';
      readonly delayMs: number;
      readonly jitter?: boolean;
    }
  | {
      readonly type: 'exponential';
      readonly delayMs: number;
      readonly maxDelayMs: number;
      readonly jitter?: boolean;
    };

export interface RecordDefinitionActionRetryDto {
  readonly maxAttempts: number;
  readonly retryOn?: readonly (
    | 'configuration'
    | 'validation'
    | 'domain'
    | 'transient'
    | 'timeout'
    | 'interrupted'
    | 'unexpected'
  )[];
  readonly schedule?: RecordDefinitionActionRetryScheduleDto;
  readonly idempotent: true;
}

export interface RecordDefinitionActionExecutionPolicyOverrideDto {
  readonly timeoutMs?: number;
  readonly retry?: RecordDefinitionActionRetryDto;
}

/**
 * Serializable action binding projection. Secret parameters deliberately have
 * only a configured-state marker; a secret value is not part of this union.
 */
export interface RecordDefinitionActionBindingDto {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly stableKey: string;
  readonly actionId: string;
  readonly contractVersion: number;
  readonly scope: RecordDefinitionActionBindingScopeDto;
  readonly parameters: RecordDefinitionActionParameterValuesDto;
  readonly order: number;
  readonly dependencies?: readonly RecordDefinitionActionDependencyDto[];
  readonly policyOverrides?: RecordDefinitionActionExecutionPolicyOverrideDto;
}

export interface RecordDefinitionLabelsDto {
  readonly name: string;
  readonly namePlural: string;
}

export interface RecordDefinitionSearchFilterDto {
  readonly id: string;
  readonly field: string;
  readonly title: string;
  readonly kind: 'exact' | 'facet';
  readonly typeLabel: string | null;
  readonly alwaysActive: boolean;
}

export interface RecordDefinitionRelationshipDto {
  readonly id: string;
  readonly label?: string;
  readonly targetRecordTypeKey: RecordDefinitionKey;
  readonly localField: string;
  readonly foreignField: string;
  readonly cardinality: 'one' | 'many';
  readonly direction: 'outbound' | 'inbound';
  readonly includeByDefault: boolean;
}

export interface RecordDefinitionTransferFieldDto {
  readonly field: string;
  readonly label: string;
  readonly updateField?: string;
  readonly updateAlso: readonly string[];
  readonly fieldNames: readonly {
    readonly name: string;
    readonly field: string;
  }[];
}

export interface RecordDefinitionTransferRoleRuleDto {
  readonly role: string;
  readonly editableFields: readonly string[];
}

export interface RecordDefinitionTransferResponsibilityDto {
  readonly fields: readonly RecordDefinitionTransferFieldDto[];
  readonly roleRules: readonly RecordDefinitionTransferRoleRuleDto[];
}

export interface RecordDefinitionValidationOperationDto {
  readonly name: string;
  readonly enabledValidationGroups: readonly string[];
  /** Omission inherits the broader policy; an explicit empty list denies every role. */
  readonly roles?: readonly string[];
  /** Omission inherits the broader policy; an explicit empty list denies every target. */
  readonly allowedTargetStages?: readonly WorkflowStageKey[];
  /** Optional rollout-mode override for this record-type operation. */
  readonly mode?: 'shadow' | 'enforce';
}

/** Stage policy may narrow an operation, but cannot change its record-type rollout mode. */
export type RecordDefinitionStageValidationOperationOverrideDto = Omit<
  RecordDefinitionValidationOperationDto,
  'mode'
> & {
  readonly mode?: never;
};

export interface RecordDefinitionValidationPolicyDto {
  readonly mode: 'shadow' | 'enforce';
  readonly operations: readonly RecordDefinitionValidationOperationDto[];
}

export interface RecordDefinitionConcurrencyPolicyDto {
  readonly mode: RecordConcurrentModificationMode;
}

export type RecordDefinitionDashboardValueDto =
  | { readonly kind: 'path'; readonly path: string }
  | { readonly kind: 'jsonata'; readonly expression: string };

export interface RecordDefinitionDashboardColumnDto {
  readonly id: string;
  readonly title: string;
  readonly value: RecordDefinitionDashboardValueDto;
  readonly render?: { readonly kind: 'handlebars'; readonly template: string };
  readonly displayOrder: number;
}

/** Safe expression-only dashboard subset; legacy Lodash templates are not representable. */
export interface RecordDefinitionDashboardDto {
  readonly schemaVersion: 1;
  readonly showAdminSidebar: boolean;
  readonly columns: readonly RecordDefinitionDashboardColumnDto[];
}

export interface DraftRecordTypeAdministrableFieldsDto {
  readonly labels?: Partial<RecordDefinitionLabelsDto>;
  readonly searchable?: boolean;
  readonly searchFilters?: readonly RecordDefinitionSearchFilterDto[];
  readonly relationships?: readonly RecordDefinitionRelationshipDto[];
  readonly transferResponsibility?: Partial<RecordDefinitionTransferResponsibilityDto>;
  readonly validation?: Partial<RecordDefinitionValidationPolicyDto>;
  readonly concurrency?: Partial<RecordDefinitionConcurrencyPolicyDto>;
  readonly dashboard?: RecordDefinitionDashboardDto;
}

export interface PublishableRecordTypeAdministrableFieldsDto {
  readonly labels: RecordDefinitionLabelsDto;
  readonly searchable: boolean;
  readonly searchFilters: readonly RecordDefinitionSearchFilterDto[];
  readonly relationships: readonly RecordDefinitionRelationshipDto[];
  readonly transferResponsibility: RecordDefinitionTransferResponsibilityDto;
  readonly validation: RecordDefinitionValidationPolicyDto;
  readonly concurrency: RecordDefinitionConcurrencyPolicyDto;
  readonly dashboard?: RecordDefinitionDashboardDto;
}

export interface DraftWorkflowStageDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_STAGE_SCHEMA_VERSION;
  readonly key: WorkflowStageKey;
  readonly label?: string;
  readonly formReference?: string;
  readonly viewRoles?: readonly string[];
  readonly editRoles?: readonly string[];
  readonly displayOrder?: number;
  readonly starting?: boolean;
  readonly terminal?: boolean;
  readonly validationOverrides?: readonly RecordDefinitionStageValidationOperationOverrideDto[];
  readonly dashboard?: RecordDefinitionDashboardDto;
  readonly baseRecordTypeKey?: RecordDefinitionKey;
}

export interface PublishableWorkflowStageDto extends DraftWorkflowStageDto {
  readonly label: string;
  readonly formReference: string;
  readonly viewRoles: readonly string[];
  readonly editRoles: readonly string[];
  readonly displayOrder: number;
  readonly starting: boolean;
  readonly terminal: boolean;
  readonly validationOverrides: readonly RecordDefinitionStageValidationOperationOverrideDto[];
}

export interface DraftWorkflowTransitionDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION;
  readonly id: WorkflowTransitionId;
  readonly sourceStageKey?: WorkflowStageKey;
  readonly targetStageKey?: WorkflowStageKey;
  readonly label?: string;
  readonly description?: string;
  readonly mode?: 'manual' | 'automatic';
  readonly allowedRoles?: readonly string[];
  readonly eligibilityCondition?: string;
  readonly event?: 'create' | 'update';
  readonly priority?: number;
  readonly condition?: string;
  readonly validationOperation?: string;
}

interface PublishableWorkflowTransitionBaseDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_TRANSITION_SCHEMA_VERSION;
  readonly id: WorkflowTransitionId;
  readonly sourceStageKey: WorkflowStageKey;
  readonly targetStageKey: WorkflowStageKey;
  readonly label: string;
  readonly description?: string;
  readonly validationOperation?: string;
}

export interface ManualWorkflowTransitionDto extends PublishableWorkflowTransitionBaseDto {
  readonly mode: 'manual';
  readonly allowedRoles: readonly string[];
  readonly eligibilityCondition?: string;
}

export interface AutomaticWorkflowTransitionDto extends PublishableWorkflowTransitionBaseDto {
  readonly mode: 'automatic';
  readonly event: 'create' | 'update';
  readonly priority: number;
  readonly condition: string;
}

export type PublishableWorkflowTransitionDto = ManualWorkflowTransitionDto | AutomaticWorkflowTransitionDto;

/**
 * Mutable draft input. The discriminator is a trust label: even a
 * semantically complete draft remains draft-incomplete until authoritative
 * publication validation promotes a copy to the publishable contract.
 */
export interface DraftRecordDefinitionAggregateDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION;
  readonly definitionState: 'draft-incomplete';
  readonly recordType: DraftRecordTypeAdministrableFieldsDto;
  readonly stages: readonly DraftWorkflowStageDto[];
  readonly transitions: readonly DraftWorkflowTransitionDto[];
  readonly actionBindings: readonly RecordDefinitionActionBindingDto[];
}

/** Immutable canonical aggregate admitted to a published revision. */
export interface PublishableRecordDefinitionAggregateDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_AGGREGATE_SCHEMA_VERSION;
  readonly definitionState: 'publishable';
  readonly recordType: PublishableRecordTypeAdministrableFieldsDto;
  readonly stages: readonly PublishableWorkflowStageDto[];
  readonly transitions: readonly PublishableWorkflowTransitionDto[];
  readonly actionBindings: readonly RecordDefinitionActionBindingDto[];
}

/** Deployment-owned fields are visible but are never part of an administrable aggregate. */
export interface RecordTypeDeploymentFieldsDto {
  readonly packageType: string;
  readonly searchCore: string;
}

export interface RecordDefinitionActorDto {
  readonly id: string;
  readonly displayName?: string;
}

export interface RecordDefinitionRevisionPointerDto {
  readonly id: RecordDefinitionRevisionId;
  readonly revisionNumber: number;
  readonly canonicalHash: RecordDefinitionCanonicalHash;
}

export interface RecordDefinitionDraftSummaryDto {
  readonly id: RecordDefinitionDraftId;
  readonly version: number;
  readonly baseRevisionNumber: number | null;
  readonly updatedAt: string;
  readonly updatedBy: RecordDefinitionActorDto;
}

export interface RecordDefinitionRetirementDto {
  readonly retiredAt: string;
  readonly retiredBy: RecordDefinitionActorDto;
  readonly reason?: string;
}

export interface RecordTypeIdentityDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_API_SCHEMA_VERSION;
  readonly id: RecordDefinitionId;
  readonly brandId: RecordDefinitionBrandId;
  readonly key: RecordDefinitionKey;
  readonly deployment: RecordTypeDeploymentFieldsDto;
  readonly version: number;
  readonly activeRevision: RecordDefinitionRevisionPointerDto | null;
  readonly draft: RecordDefinitionDraftSummaryDto | null;
  readonly retirement: RecordDefinitionRetirementDto | null;
}

export interface RecordDefinitionDraftDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_API_SCHEMA_VERSION;
  readonly id: RecordDefinitionDraftId;
  readonly recordTypeId: RecordDefinitionId;
  readonly brandId: RecordDefinitionBrandId;
  readonly recordTypeKey: RecordDefinitionKey;
  readonly version: number;
  readonly baseRevisionNumber: number | null;
  readonly definition: DraftRecordDefinitionAggregateDto;
  readonly updatedAt: string;
  readonly updatedBy: RecordDefinitionActorDto;
  readonly validation: RecordDefinitionValidationReportDto | null;
}

/** Draft mutation preconditions are explicit and are never inferred from a payload timestamp. */
export interface RecordDefinitionDraftSaveRequestDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_API_SCHEMA_VERSION;
  readonly expectedDraftVersion: number;
  readonly expectedActiveRevisionNumber: number | null;
  readonly definition: DraftRecordDefinitionAggregateDto;
}

export interface RecordDefinitionPublicationRequestDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_API_SCHEMA_VERSION;
  readonly expectedIdentityVersion: number;
  readonly expectedDraftVersion: number;
  readonly expectedActiveRevisionNumber: number | null;
  readonly publicationNote?: string;
}

export interface RecordDefinitionRollbackRequestDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_API_SCHEMA_VERSION;
  readonly expectedIdentityVersion: number;
  readonly expectedActiveRevisionNumber: number | null;
  readonly sourceRevisionNumber: number;
  readonly reason: string;
}

export interface RecordDefinitionRetirementRequestDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_API_SCHEMA_VERSION;
  readonly expectedIdentityVersion: number;
  readonly reason?: string;
}

export interface RecordDefinitionActionContractReferenceDto {
  readonly actionId: string;
  readonly contractVersion: number;
}

export type RecordDefinitionRevisionSourceDto =
  | {
      readonly operation: 'publish' | 'bootstrap' | 'migration';
      readonly sourceRevisionNumber: number | null;
    }
  | {
      readonly operation: 'rollback';
      readonly sourceRevisionNumber: number;
    };

/** Public immutable revision; it contains secret configured-state markers only. */
export interface RecordDefinitionRevisionDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_API_SCHEMA_VERSION;
  readonly id: RecordDefinitionRevisionId;
  readonly brandId: RecordDefinitionBrandId;
  readonly recordTypeKey: RecordDefinitionKey;
  readonly revisionNumber: number;
  readonly canonicalHash: RecordDefinitionCanonicalHash;
  readonly definition: PublishableRecordDefinitionAggregateDto;
  readonly actionContracts: readonly RecordDefinitionActionContractReferenceDto[];
  readonly source: RecordDefinitionRevisionSourceDto;
  readonly publishedAt: string;
  readonly publishedBy: RecordDefinitionActorDto;
  readonly publicationNote?: string;
}

export type RecordDefinitionValidationScope = 'draft-save' | 'publication' | 'rollback' | 'migration';
export type RecordDefinitionIssueSeverity = 'warning' | 'error';

export interface RecordDefinitionValidationIssueDto {
  readonly code: string;
  readonly path: string;
  readonly severity: RecordDefinitionIssueSeverity;
  readonly message: string;
}

export interface RecordDefinitionRedactionDto {
  readonly path: string;
  readonly reason: 'secret' | 'sensitive-input' | 'bounded-output';
  readonly marker: typeof RECORD_DEFINITION_REDACTION_MARKER;
}

export interface RecordDefinitionValidationReportDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_REPORT_SCHEMA_VERSION;
  readonly brandId: RecordDefinitionBrandId;
  readonly recordTypeKey: RecordDefinitionKey;
  readonly scope: RecordDefinitionValidationScope;
  readonly status: 'valid' | 'invalid';
  readonly definitionState: 'draft-incomplete' | 'publishable';
  readonly validatedDraftVersion: number;
  readonly validatedActiveRevisionNumber: number | null;
  readonly issues: readonly RecordDefinitionValidationIssueDto[];
  readonly redactions: readonly RecordDefinitionRedactionDto[];
  readonly truncated: boolean;
}

export interface RecordDefinitionStageImpactDto {
  readonly stageKey: WorkflowStageKey;
  readonly referencedRecordCount: number;
  readonly effect: 'unchanged' | 'label-only' | 'blocked-removal' | 'blocked-rename';
}

export interface RecordDefinitionStructuralChangeDto {
  readonly path: string;
  readonly kind: 'added' | 'removed' | 'changed' | 'reordered';
}

export interface RecordDefinitionImpactReportDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_REPORT_SCHEMA_VERSION;
  readonly brandId: RecordDefinitionBrandId;
  readonly recordTypeKey: RecordDefinitionKey;
  readonly status: 'clear' | 'warning' | 'blocked';
  readonly activeRevisionNumber: number | null;
  readonly draftVersion: number;
  readonly affectedRecordCount: number;
  readonly stageImpacts: readonly RecordDefinitionStageImpactDto[];
  readonly changes: readonly RecordDefinitionStructuralChangeDto[];
  readonly redactions: readonly RecordDefinitionRedactionDto[];
  readonly truncated: boolean;
}

export interface RecordDefinitionHistoryValidationSummaryDto {
  readonly status: 'valid' | 'invalid';
  readonly errorCount: number;
  readonly warningCount: number;
}

export interface RecordDefinitionHistoryImpactSummaryDto {
  readonly status: 'clear' | 'warning' | 'blocked';
  readonly affectedRecordCount: number;
}

export interface RecordDefinitionHistorySummaryDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_REPORT_SCHEMA_VERSION;
  readonly id: string;
  readonly brandId: RecordDefinitionBrandId;
  readonly recordTypeKey: RecordDefinitionKey;
  readonly revision: RecordDefinitionRevisionPointerDto;
  readonly source: RecordDefinitionRevisionSourceDto;
  readonly publishedAt: string;
  readonly publishedBy: RecordDefinitionActorDto;
  readonly publicationNote?: string;
  readonly validation: RecordDefinitionHistoryValidationSummaryDto;
  readonly impact: RecordDefinitionHistoryImpactSummaryDto;
  readonly changes: readonly RecordDefinitionStructuralChangeDto[];
  readonly redactions: readonly RecordDefinitionRedactionDto[];
  readonly truncated: boolean;
}

export type RecordDefinitionConflictCode =
  | 'identity-version-conflict'
  | 'draft-version-conflict'
  | 'active-revision-conflict';

/** Safe 409/412 conflict body; it never echoes a submitted definition. */
export interface RecordDefinitionConflictDto {
  readonly schemaVersion: typeof RECORD_DEFINITION_REPORT_SCHEMA_VERSION;
  readonly code: RecordDefinitionConflictCode;
  readonly resource: 'identity' | 'draft' | 'active-revision';
  readonly brandId: RecordDefinitionBrandId;
  readonly recordTypeKey: RecordDefinitionKey;
  readonly expectedVersion: number | null;
  readonly currentVersion: number | null;
  readonly expectedActiveRevisionNumber: number | null;
  readonly currentActiveRevisionNumber: number | null;
  readonly message: string;
}
