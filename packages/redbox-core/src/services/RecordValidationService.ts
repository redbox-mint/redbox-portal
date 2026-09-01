import { firstValueFrom } from 'rxjs';
import { performance } from 'node:perf_hooks';
import _ from 'lodash';
import { metrics, type Attributes } from '@opentelemetry/api';
import {
  calculateValidationGroups,
  ExpressionsConditionKind,
  FormConfigFrame,
  FormConfigOutline,
  FormExpressionsConfigFrame,
  FormExpressionsTargetValidationGroups,
  FormFieldValidationGroup,
  FormValidationGroupsChangeInitial,
  FormValidatorDefinition,
  FormValidatorSummaryErrors,
  getJSONPointerByArrayPaths,
  jsonataCompile,
  jsonataEvaluate,
  JSONataEvaluate,
  RecordSaveIssue,
  RecordValidationDiagnostic,
  ReusableFormDefinitions,
  ValidationMode,
  ValidationOperationDefinition,
  ValidationOperationDiscovery,
  ValidationOperationOverride,
  ValidationOperationPolicyOverride,
  compareRecordValidationIdentifiers,
  RECORD_VALIDATION_REFERENCE_PATTERN,
  sanitizeValidationOperationDiscovery,
  VALIDATION_OPERATION_NAME_PATTERN,
  sanitizeRecordSaveIssue,
  SuggestedValidationSummaryComponentName,
  ValidatorsSupport,
} from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import type { RecordValidationConfig } from '../config/recordValidation.config';
import type { RecordTypeValidationConfig } from '../config/recordtype.config';
import type { WorkflowStageConfig } from '../config/workflow.config';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { RecordMetaMetadata, RecordWorkflow } from '../model/storage/RecordModel';
import type { FormAttributes } from '../waterline-models/Form';
import { ConstructFormConfigVisitor } from '../visitor/construct.visitor';
import {
  ValidatorFormConfigVisitor,
  type FormValueTransformation,
  type ValidatorFormConfigResult,
} from '../visitor/validator.visitor';

export const RECORD_VALIDATION_DIAGNOSTIC_CODES = {
  formReferenceMissing: 'record-validation-form-reference-missing',
  formReferenceMalformed: 'record-validation-form-reference-malformed',
  formNotFound: 'record-validation-form-not-found',
  formConfigurationMissing: 'record-validation-form-configuration-missing',
  formConfigurationMalformed: 'record-validation-form-configuration-malformed',
  formReferenceDivergence: 'record-validation-form-reference-divergence',
  recordTypeReferenceMissing: 'record-validation-record-type-reference-missing',
  recordTypeReferenceMalformed: 'record-validation-record-type-reference-malformed',
  recordTypeNotFound: 'record-validation-record-type-not-found',
  brandReferenceMissing: 'record-validation-brand-reference-missing',
  brandReferenceMalformed: 'record-validation-brand-reference-malformed',
  workflowStepReferenceMissing: 'record-validation-workflow-step-reference-missing',
  workflowStepReferenceMalformed: 'record-validation-workflow-step-reference-malformed',
  workflowStepNotFound: 'record-validation-workflow-step-not-found',
  workflowStepFormMissing: 'record-validation-workflow-step-form-missing',
  operationMalformed: 'record-validation-operation-malformed',
  operationUnknown: 'record-validation-operation-unknown',
  operationRoleUnauthorized: 'record-validation-operation-role-unauthorized',
  operationTargetUnauthorized: 'record-validation-operation-target-unauthorized',
  operationPolicyMalformed: 'record-validation-operation-policy-malformed',
  rolloutModeMalformed: 'record-validation-rollout-mode-malformed',
  expressionUnsupported: 'record-validation-expression-unsupported',
  expressionEvaluationFailed: 'record-validation-expression-evaluation-failed',
  expressionResultMalformed: 'record-validation-expression-result-malformed',
  expressionContextUnsupported: 'record-validation-expression-context-unsupported',
  transformationInapplicable: 'record-validation-transformation-inapplicable',
  validationGroupUnknown: 'record-validation-group-unknown',
  requestParameterDropped: 'record-validation-request-parameter-dropped',
  resolutionFailed: 'record-validation-resolution-failed',
  advisoryConfigurationMalformed: 'record-validation-advisory-configuration-malformed',
  advisoryGroupUnknown: 'record-validation-advisory-group-unknown',
  validationGroupOverlap: 'record-validation-group-overlap',
  blockingExecutionFailed: 'record-validation-execution-failed',
  advisoryExecutionFailed: 'record-validation-advisory-execution-failed',
  blockingTimeout: 'record-validation-timeout',
  advisoryTimeout: 'record-validation-advisory-timeout',
} as const;

export type RecordValidationDiagnosticCode =
  (typeof RECORD_VALIDATION_DIAGNOSTIC_CODES)[keyof typeof RECORD_VALIDATION_DIAGNOSTIC_CODES];

export type RecordValidationOutcome =
  | 'valid'
  | 'invalid'
  | 'request-rejected'
  | 'configuration-error'
  | 'timed-out';

export type RecordValidationTimeoutKind = 'none' | 'blocking' | 'advisory';

export type RecordValidationWriteKind = 'create' | 'update' | 'transition';
export type RecordValidationJSONValue =
  | string
  | number
  | boolean
  | null
  | readonly RecordValidationJSONValue[]
  | { readonly [key: string]: RecordValidationJSONValue };

export interface RecordValidationCandidate {
  readonly redboxOid?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly metaMetadata: Readonly<Partial<RecordMetaMetadata> & Record<string, unknown>>;
  readonly workflow?: Readonly<Partial<RecordWorkflow>>;
  readonly previousWorkflow?: Readonly<Partial<RecordWorkflow>>;
}

export interface RecordValidationActor {
  readonly authenticated: boolean;
  readonly roles?: readonly string[];
}

export interface RecordValidationRequest {
  readonly candidate: RecordValidationCandidate;
  readonly writeKind: RecordValidationWriteKind;
  /** Server-owned validation intent; separate from the CRUD write kind. */
  readonly validationOperation?: string;
  /**
   * Whether to execute conditional groups and form validators after resolving
   * the named operation. RecordsService sets this to false only for write
   * classifications that are explicitly exempt from form validation; operation
   * syntax, existence, and authorization remain authoritative.
   */
  readonly evaluateFormValidators?: boolean;
  /** Requested workflow movement; separate from validationOperation. */
  readonly targetStep?: string;
  /** Current workflow step before a transition, when already known by the caller. */
  readonly currentStep?: string;
  readonly actor: RecordValidationActor;
  readonly requestParameters?: Readonly<Record<string, RecordValidationJSONValue>>;
  /** Optional caller-side narrowing of the server-owned request-parameter allowlist. */
  readonly allowedRequestParameterNames?: readonly string[];
  readonly runtimeContext?: Readonly<Record<string, RecordValidationJSONValue>>;
  /** Validation boundary phase, used only as a safe observability dimension. */
  readonly phase?: 'pre-save' | 'post-save';
  readonly requestId?: string;
}

/**
 * Read-only operation discovery for one authoritative save context.
 *
 * Callers must supply edit and transition decisions produced by the existing
 * record/workflow authorization layer. Operation policy can only narrow those
 * decisions; it can never manufacture record access.
 */
export interface RecordValidationOperationDiscoveryRequest {
  readonly candidate: RecordValidationCandidate;
  readonly writeKind: RecordValidationWriteKind;
  /** Optional narrowing to one actor-authorized transition target. */
  readonly targetStep?: string;
  readonly currentStep?: string;
  readonly actor: RecordValidationActor;
  readonly canEdit: boolean;
  /** Actor-authorized transition targets to evaluate in this single discovery run. */
  readonly authorizedTargetSteps?: readonly string[];
}

export interface RecordValidationExpressionContext {
  readonly formData: Readonly<Record<string, unknown>>;
  readonly operation?: string;
  readonly recordType: string;
  readonly formName: string;
  readonly brand: string;
  readonly workflow: {
    readonly currentStep?: string;
    readonly targetStep?: string;
  };
  readonly requestParams: Readonly<Record<string, RecordValidationJSONValue>>;
  readonly runtimeContext: Readonly<Record<string, RecordValidationJSONValue>>;
  readonly actor: {
    readonly authenticated: boolean;
    readonly roles: readonly string[];
  };
}

export interface EffectiveValidationOperationPolicy {
  readonly name: string;
  readonly enabledValidationGroups: readonly string[];
  readonly label?: string;
  readonly description?: string;
  readonly roles?: readonly string[];
  readonly allowedTargetSteps?: readonly string[];
}

export interface RecordValidationResolvedState {
  readonly constructedForm: FormConfigOutline;
  readonly formName: string;
  readonly recordType: string;
  readonly brand: string;
  readonly workflowStep?: string;
  readonly operationPolicy?: EffectiveValidationOperationPolicy;
  /** Group fold before strict-all/operation exact-group finalization. */
  readonly conditionalGroups: readonly string[];
  /** Present only when conditional groups/form validators were evaluated. */
  readonly expressionContext?: RecordValidationExpressionContext;
}

interface RecordValidationResultBase {
  readonly shouldBlock: boolean;
  readonly mode: ValidationMode;
  readonly formName?: string;
  readonly effectiveOperation?: string;
  readonly diagnostics: readonly RecordValidationDiagnostic[];
}

export interface ResolvedRecordValidationResult extends RecordValidationResultBase {
  readonly status: 'resolved';
  readonly formName: string;
  readonly effectiveGroups: readonly string[];
  readonly resolved: RecordValidationResolvedState;
  /** Safe issues only; raw validator summaries never cross this boundary. */
  readonly blockingErrors: readonly RecordSaveIssue[];
  /** Advisory issues are observable only and never affect shouldBlock. */
  readonly advisoryErrors: readonly RecordSaveIssue[];
  readonly advisoryGroups: readonly string[];
  /** Cloned authoritative candidate after schema-owned value transformations. */
  readonly transformedCandidate: RecordValidationCandidate;
}

export interface UnresolvedRecordValidationResult extends RecordValidationResultBase {
  readonly status: 'unresolved';
  /**
   * Safe cloned candidate available when schema-owned transformations
   * completed before a later resolution failure. It is deliberately absent
   * when resolution stopped before that boundary, avoiding unsafe access to
   * accessor-bearing or cyclic caller data.
   */
  readonly transformedCandidate?: RecordValidationCandidate;
}

export type RecordValidationResult = ResolvedRecordValidationResult | UnresolvedRecordValidationResult;

/** Safe observability payload: it deliberately contains no record or expression values. */
export interface RecordValidationResolutionMetric {
  readonly requestId?: string;
  readonly recordType?: string;
  readonly formName?: string;
  readonly operation?: string;
  readonly writeKind: RecordValidationWriteKind;
  readonly phase: 'pre-save' | 'post-save';
  readonly mode: ValidationMode;
  readonly status: RecordValidationResult['status'];
  readonly shouldBlock: boolean;
  /** Whether this result would reject the candidate under enforcement. */
  readonly wouldBlock: boolean;
  readonly outcome: RecordValidationOutcome;
  readonly durationMs: number;
  readonly blockingErrorCount: number;
  readonly advisoryErrorCount: number;
  readonly timeoutKind: RecordValidationTimeoutKind;
  readonly configurationDiagnosticCount: number;
  readonly diagnosticCodes: readonly string[];
  readonly diagnosticIdentities: readonly RecordValidationDiagnosticIdentity[];
}

export interface RecordValidationDiagnosticIdentity {
  readonly code: string;
  readonly scope: 'diagnostic' | 'blocking-validator' | 'advisory-validator';
  readonly expressionName?: string;
  readonly field?: string;
  readonly pointer?: string;
  readonly validatorClass?: string;
  readonly validatorCode?: string;
  readonly lineage?: string;
}

export interface RecordValidationModeResolution {
  readonly mode: ValidationMode;
  /** Number only: malformed configuration values must not enter diagnostics. */
  readonly malformedModeCount: number;
}

type ValidationModeConfigLike = {
  readonly mode?: unknown;
  readonly operations?: unknown;
};

function operationMode(config: ValidationModeConfigLike | null | undefined, operation: string | undefined): unknown {
  if (!operation || !config?.operations || typeof config.operations !== 'object' || Array.isArray(config.operations)) {
    return undefined;
  }
  const operations = config.operations as Record<string, unknown>;
  if (!Object.hasOwn(operations, operation)) return undefined;
  const override = operations[operation];
  return override && typeof override === 'object' && !Array.isArray(override)
    ? (override as Record<string, unknown>).mode
    : undefined;
}

/**
 * Resolve rollout mode with one shared precedence rule:
 * global -> global operation -> record type -> record-type operation.
 */
export function resolveValidationMode(
  globalConfig: Pick<RecordValidationConfig, 'mode' | 'operations'> | ValidationModeConfigLike | null | undefined,
  recordTypeConfig: RecordTypeValidationConfig | ValidationModeConfigLike | null | undefined,
  operation?: string
): RecordValidationModeResolution {
  const configuredValues = [
    globalConfig?.mode,
    operationMode(globalConfig, operation),
    recordTypeConfig?.mode,
    operationMode(recordTypeConfig, operation),
  ];
  let mode: ValidationMode = 'shadow';
  let malformedModeCount = 0;
  for (const configured of configuredValues) {
    if (configured === undefined) continue;
    if (configured === 'shadow' || configured === 'enforce') {
      mode = configured;
    } else {
      malformedModeCount += 1;
    }
  }
  return { mode, malformedModeCount };
}

interface RecordTypeLike {
  readonly id?: string;
  readonly name?: string;
  readonly recordValidation?: RecordTypeValidationConfig;
}

interface WorkflowStepLike {
  readonly name?: string;
  readonly starting?: boolean;
  readonly config?: Readonly<Partial<WorkflowStageConfig> & Record<string, unknown>>;
}

export interface RecordValidationServiceDependencies {
  loadRecordType(brand: string, recordType: string): Promise<RecordTypeLike | null>;
  loadStartingWorkflowStep(recordType: RecordTypeLike): Promise<WorkflowStepLike | null>;
  loadWorkflowStep(recordType: RecordTypeLike, step: string): Promise<WorkflowStepLike | null>;
  loadWorkflowSteps(recordType: RecordTypeLike): Promise<readonly WorkflowStepLike[]>;
  loadForm(formName: string, brand: string): Promise<FormAttributes | null>;
  constructForm(
    form: FormConfigFrame,
    metadata: Readonly<Record<string, unknown>>,
    reusableFormDefinitions: ReusableFormDefinitions
  ): Promise<FormConfigOutline>;
  collectTransformations?(
    form: FormConfigOutline,
    checkDeadline?: () => void
  ): Promise<readonly FormValueTransformation[]>;
  executeValidators?(
    form: FormConfigOutline,
    enabledValidationGroups: readonly string[],
    validatorDefinitionsMap: ReadonlyMap<string, FormValidatorDefinition>,
    jsonataEvaluatorFactory: (expression: string) => JSONataEvaluate,
    excludedOnlyValidationGroups?: readonly string[],
    checkDeadline?: () => void
  ): Promise<ValidatorFormConfigResult>;
}

interface NormalizedRecordValidationRequest {
  readonly source: RecordValidationRequest;
  readonly operation?: string;
  readonly targetStep?: string;
  readonly currentStep?: string;
  readonly actorRoles: readonly string[];
  /** Missing current workflow configuration is fatal for policy discovery. */
  readonly requireResolvedWorkflowStep: boolean;
}

type ParsedOptionalString = { readonly ok: true; readonly value?: string } | { readonly ok: false };

interface ResolvedFormSelection {
  readonly formName: string;
  readonly workflowStep?: string;
  readonly workflowConfig?: Readonly<Partial<WorkflowStageConfig> & Record<string, unknown>>;
}

interface ValidationGroupChange {
  readonly initial?: FormValidationGroupsChangeInitial;
  readonly groups?: FormFieldValidationGroup;
}

interface ResolutionProgress {
  mode: ValidationMode;
  operation?: string;
  recordType?: string;
  formName?: string;
}

type BuildResultOptions =
  | {
      readonly outcome: 'resolved';
      readonly operation?: string;
      readonly recordType?: string;
      readonly effectiveGroups: readonly string[];
      readonly resolved: RecordValidationResolvedState;
      readonly blockingErrors: readonly RecordSaveIssue[];
      readonly advisoryErrors: readonly RecordSaveIssue[];
      readonly advisoryGroups: readonly string[];
      readonly transformedCandidate: RecordValidationCandidate;
    }
  | {
      readonly outcome: 'unresolved';
      readonly operation?: string;
      readonly recordType?: string;
      readonly formName?: string;
      readonly contractFailure?: boolean;
      readonly transformedCandidate?: RecordValidationCandidate;
    };

const SAFE_FIELD_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_VALIDATOR_CLASS_PATTERN = /^[A-Za-z][A-Za-z0-9_.#-]{0,127}$/;
const SAFE_TRANSLATION_KEY_PATTERN = /^@[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const SAFE_DIAGNOSTIC_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
const STRICT_ALL_OPERATION = 'strict-all';
const UNRESOLVED_DIMENSION = 'unresolved';
const UNKNOWN_OPERATION_DIMENSION = 'unknown';
const MALFORMED_OPERATION_DIMENSION = 'malformed';
const VALIDATOR_FAILURE_DIAGNOSTIC_CODE = 'record-validation-validator-failure';
const OTHER_DIAGNOSTIC_CODE = 'record-validation-diagnostic-other';

const openTelemetryDiagnosticCodes = new Set<string>([
  ...Object.values(RECORD_VALIDATION_DIAGNOSTIC_CODES),
  VALIDATOR_FAILURE_DIAGNOSTIC_CODE,
]);

function openTelemetryResolvedDimension(
  metric: RecordValidationResolutionMetric,
  value: string | undefined
): string {
  return metric.status === 'resolved' && value ? value : UNRESOLVED_DIMENSION;
}

function openTelemetryOperationDimension(metric: RecordValidationResolutionMetric): string {
  if (!metric.operation) return STRICT_ALL_OPERATION;
  if (metric.operation === UNKNOWN_OPERATION_DIMENSION || metric.operation === MALFORMED_OPERATION_DIMENSION) {
    return metric.operation;
  }
  return metric.status === 'resolved' ? metric.operation : UNRESOLVED_DIMENSION;
}

function openTelemetryDiagnosticCode(code: string): string {
  return openTelemetryDiagnosticCodes.has(code) ? code : OTHER_DIAGNOSTIC_CODE;
}

const requestRejectionCodes = new Set<string>([
  RECORD_VALIDATION_DIAGNOSTIC_CODES.operationMalformed,
  RECORD_VALIDATION_DIAGNOSTIC_CODES.operationUnknown,
  RECORD_VALIDATION_DIAGNOSTIC_CODES.operationRoleUnauthorized,
  RECORD_VALIDATION_DIAGNOSTIC_CODES.operationTargetUnauthorized,
]);

const recordValidationMeter = metrics.getMeter('redbox.record-validation');
const recordValidationDuration = recordValidationMeter.createHistogram('redbox.record_validation.duration', {
  description: 'Authoritative record-validation resolution duration.',
  unit: 'ms',
});
const recordValidationRuns = recordValidationMeter.createCounter('redbox.record_validation.runs', {
  description: 'Authoritative record-validation resolutions by mode and outcome.',
  unit: '{run}',
});
const recordValidationBlockingErrors = recordValidationMeter.createCounter(
  'redbox.record_validation.blocking_errors',
  { description: 'Blocking validator failures returned by authoritative validation.', unit: '{error}' }
);
const recordValidationAdvisoryErrors = recordValidationMeter.createCounter(
  'redbox.record_validation.advisory_errors',
  { description: 'Advisory validator failures observed by authoritative validation.', unit: '{error}' }
);
const recordValidationTimeouts = recordValidationMeter.createCounter('redbox.record_validation.timeouts', {
  description: 'Blocking or advisory authoritative-validation timeouts.',
  unit: '{timeout}',
});
const recordValidationConfigurationDiagnostics = recordValidationMeter.createCounter(
  'redbox.record_validation.configuration_diagnostics',
  { description: 'Safe authoritative-validation configuration or execution diagnostics.', unit: '{diagnostic}' }
);
const recordValidationDiagnostics = recordValidationMeter.createCounter('redbox.record_validation.diagnostics', {
  description: 'Safe authoritative-validation diagnostics by stable code.',
  unit: '{diagnostic}',
});

interface LoadedFormDefinition {
  readonly form: FormAttributes;
  readonly reusableFormDefinitions: ReusableFormDefinitions;
}

interface ValidationDeadline {
  readonly expiresAt: number;
}

interface CandidateTransformationApplication {
  readonly candidate: RecordValidationCandidate;
  readonly applied: readonly FormValueTransformation[];
  readonly inapplicable: boolean;
}

class ValidationDeadlineExceeded extends Error {
  public constructor() {
    super('Record validation deadline exceeded.');
    this.name = 'ValidationDeadlineExceeded';
  }
}

interface TimedResult<T> {
  readonly status: 'completed';
  readonly value: T;
}

interface TimedFailure {
  readonly status: 'failed';
}

interface TimedOut {
  readonly status: 'timed-out';
}

type TimeoutResult<T> = TimedResult<T> | TimedFailure | TimedOut;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Detach submitted record data without evaluating accessor properties. Record
 * candidates are JSON-shaped, but this boundary also has to reject hostile or
 * malformed in-memory inputs without running caller-owned code while cloning.
 */
function cloneRecordValidationValue(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime());
  const existing = seen.get(value);
  if (existing !== undefined) return existing;
  const clone: unknown[] | Record<PropertyKey, unknown> = Array.isArray(value)
    ? []
    : Object.create(Object.getPrototypeOf(value) === null ? null : Object.prototype);
  seen.set(value, clone);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !('value' in descriptor)) continue;
    Object.defineProperty(clone, key, {
      configurable: true,
      enumerable: true,
      value: cloneRecordValidationValue(descriptor.value, seen),
      writable: true,
    });
  }
  return clone;
}

function cloneRecordValidationCandidate(candidate: RecordValidationCandidate): RecordValidationCandidate {
  return cloneRecordValidationValue(candidate) as RecordValidationCandidate;
}

function isFormValueTransformation(value: unknown): value is FormValueTransformation {
  if (
    !isRecord(value) ||
    value.kind !== 'rich-html-sanitized' ||
    typeof value.sourceValue !== 'string' ||
    typeof value.value !== 'string'
  ) return false;
  if (!Array.isArray(value.dataModelPath) || value.dataModelPath.length === 0 || value.dataModelPath.some(segment =>
    typeof segment !== 'string' && !(typeof segment === 'number' && Number.isSafeInteger(segment) && segment >= 0)
  )) return false;
  const advisory = value.advisorySummary;
  return isRecord(advisory) && Array.isArray(advisory.errors) && advisory.errors.every(error =>
    isRecord(error) && typeof error.message === 'string'
  );
}

function stringProperty(value: unknown, property: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const item = value[property];
  return typeof item === 'string' && item.trim() ? item.trim() : undefined;
}

function normalizeUniqueStrings(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return undefined;
  return [...new Set(value.map(item => item.trim()).filter(Boolean))];
}

function intersectRestrictions(
  existing: readonly string[] | undefined,
  next: readonly string[] | undefined
): string[] | undefined {
  if (next === undefined) return existing === undefined ? undefined : [...existing];
  if (existing === undefined) return [...next];
  const allowed = new Set(next);
  return existing.filter(item => allowed.has(item));
}

function normalizeRoles(roles: readonly string[] | undefined): string[] {
  return [...new Set((roles ?? []).map(role => role.trim()).filter(Boolean))].sort();
}

function createDiagnostic(
  code: RecordValidationDiagnosticCode,
  message: string,
  extras: Partial<RecordValidationDiagnostic> = {}
): RecordValidationDiagnostic {
  return { code, severity: 'error', message, ...extras };
}

function safeRequestId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= 128 && RECORD_VALIDATION_REFERENCE_PATTERN.test(value)
    ? value
    : undefined;
}

function safeLogReference(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return RECORD_VALIDATION_REFERENCE_PATTERN.test(normalized) ? normalized : 'unavailable';
}

/** Remove repeatable indices before a JSON pointer becomes a metric label. */
function lowCardinalityPointer(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 2_048) return undefined;
  const normalized = value
    .split('/')
    .map((segment, index) => index > 0 && /^(?:0|[1-9][0-9]*)$/.test(segment) ? '*' : segment)
    .join('/');
  return normalized.length <= 2_048 ? normalized : undefined;
}

function applyPolicyLayer(
  policy: EffectiveValidationOperationPolicy,
  layer: ValidationOperationOverride | undefined,
  diagnostics: RecordValidationDiagnostic[]
): EffectiveValidationOperationPolicy {
  if (!layer) return policy;
  const groups =
    layer.enabledValidationGroups === undefined
      ? [...policy.enabledValidationGroups]
      : normalizeUniqueStrings(layer.enabledValidationGroups);
  const roles = normalizeUniqueStrings(layer.roles);
  const targetSteps = normalizeUniqueStrings(layer.allowedTargetSteps);
  if (
    groups === undefined ||
    (layer.roles !== undefined && roles === undefined) ||
    (layer.allowedTargetSteps !== undefined && targetSteps === undefined)
  ) {
    diagnostics.push(
      createDiagnostic(
        RECORD_VALIDATION_DIAGNOSTIC_CODES.operationPolicyMalformed,
        'A validation operation policy layer is malformed.',
        { operation: policy.name }
      )
    );
    return policy;
  }
  return {
    name: policy.name,
    enabledValidationGroups: groups,
    label: layer.label ?? policy.label,
    description: layer.description ?? policy.description,
    roles: intersectRestrictions(policy.roles, roles),
    allowedTargetSteps: intersectRestrictions(policy.allowedTargetSteps, targetSteps),
  };
}

function parseGroupChange(value: unknown): ValidationGroupChange | undefined {
  if (!isRecord(value)) return undefined;
  const initial = value.initial;
  const validInitial =
    initial === undefined || initial === 'all' || initial === 'none' || initial === 'current' || initial === 'empty';
  if (!validInitial) return undefined;
  const rawGroups = value.groups;
  if (rawGroups === undefined) return { initial: initial as FormValidationGroupsChangeInitial | undefined };
  if (!isRecord(rawGroups)) return undefined;
  const include = normalizeUniqueStrings(rawGroups.include);
  const exclude = normalizeUniqueStrings(rawGroups.exclude);
  if (
    (rawGroups.include !== undefined && include === undefined) ||
    (rawGroups.exclude !== undefined && exclude === undefined)
  )
    return undefined;
  return {
    initial: initial as FormValidationGroupsChangeInitial | undefined,
    groups: { ...(include === undefined ? {} : { include }), ...(exclude === undefined ? {} : { exclude }) },
  };
}

interface SchemaOwnedFormNode {
  readonly value: Record<string, unknown>;
  readonly pointer: string;
  readonly field?: string;
}

interface DiscoveredValidationGroupExpression extends SchemaOwnedFormNode {
  readonly expression: FormExpressionsConfigFrame;
  readonly expressionName?: string;
}

/**
 * Traverse only form-schema containment edges. Model values and all other
 * arbitrary object properties are deliberately opaque candidate data.
 */
function schemaOwnedFormNodes(form: FormConfigOutline): SchemaOwnedFormNode[] {
  const nodes: SchemaOwnedFormNode[] = [{ value: form as unknown as Record<string, unknown>, pointer: '' }];
  const visited = new WeakSet<object>();
  const walkDefinition = (value: unknown, pointer: string): void => {
    if (!isRecord(value) || visited.has(value)) return;
    visited.add(value);
    const field = typeof value.name === 'string' && SAFE_FIELD_PATTERN.test(value.name) ? value.name : undefined;
    nodes.push({ value, pointer, ...(field ? { field } : {}) });
    const component = isRecord(value.component) ? value.component : undefined;
    const config = component && isRecord(component.config) ? component.config : undefined;
    if (!config) return;
    for (const key of ['componentDefinitions', 'tabs', 'panels'] as const) {
      const children = config[key];
      if (!Array.isArray(children)) continue;
      children.forEach((child, index) => walkDefinition(
        child,
        `${pointer}/component/config/${key}/${index}`
      ));
    }
    if (isRecord(config.elementTemplate)) {
      walkDefinition(config.elementTemplate, `${pointer}/component/config/elementTemplate`);
    }
  };
  (form.componentDefinitions ?? []).forEach((definition, index) =>
    walkDefinition(definition, `/componentDefinitions/${index}`)
  );
  return nodes;
}

function discoverValidationGroupExpressions(form: FormConfigOutline): DiscoveredValidationGroupExpression[] {
  const expressions: DiscoveredValidationGroupExpression[] = [];
  for (const node of schemaOwnedFormNodes(form)) {
    if (!Array.isArray(node.value.expressions)) continue;
    for (const expression of node.value.expressions) {
      if (!isValidationGroupExpression(expression)) continue;
      const expressionName = SAFE_FIELD_PATTERN.test(expression.name) ? expression.name : undefined;
      expressions.push({ ...node, expression, ...(expressionName ? { expressionName } : {}) });
    }
  }
  return expressions;
}

function isValidationGroupExpression(value: unknown): value is FormExpressionsConfigFrame {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    isRecord(value.config) &&
    value.config.target === FormExpressionsTargetValidationGroups
  );
}

export namespace Services {
  /**
   * Resolves and executes authoritative record validation while exposing only
   * bounded, value-free observability data.
   *
   * @extensionPoint Hooks may replace the service implementation; replacements must preserve authoritative form, operation, group, privacy, timeout, and shadow/enforce semantics.
   * @see https://github.com/redbox-mint/redbox-portal/wiki/Server-Side-Form-Validation-Operations
   */
  export class RecordValidation extends services.Core.Service {
    protected override _exportedMethods = ['resolve', 'discoverOperations'];
    private resolvedDependencies?: RecordValidationServiceDependencies;

    public constructor(private readonly dependencyOverrides?: Partial<RecordValidationServiceDependencies>) {
      super();
    }

    /**
     * Resolve the authoritative form and execute its blocking/advisory validators.
     *
     * @param request Complete server-owned candidate and save intent.
     * @returns The authoritative decision plus safe diagnostics and resolved context.
     */
    public async resolve(request: RecordValidationRequest): Promise<RecordValidationResult> {
      const startedAt = performance.now();
      const diagnostics: RecordValidationDiagnostic[] = [];
      const progress: ResolutionProgress = { mode: 'shadow' };
      let result: RecordValidationResult;
      try {
        result = await this.resolveRequest(request, diagnostics, progress);
      } catch (error: unknown) {
        this.logger.warn(
          `Record validation resolution could not be completed` +
          ` (recordType=${safeLogReference(request.candidate.metaMetadata.type)},` +
          ` form=${safeLogReference(request.candidate.metaMetadata.form)},` +
          ` errorType=${safeLogReference(error instanceof Error ? error.name : typeof error)}).`
        );
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.resolutionFailed,
            'Record validation resolution could not be completed.'
          )
        );
        result = this.buildResult(progress.mode, diagnostics, {
          outcome: 'unresolved',
          operation: progress.operation,
          recordType: progress.recordType,
          formName: progress.formName,
        });
      }
      try {
        this.observeResolution(request, result, progress, performance.now() - startedAt);
      } catch {
        // Observability must never change the validation decision or save path.
        try {
          this.logger.warn('Record validation observability failed.');
        } catch {
          // A failed logger is observational too; preserve the resolved result.
        }
      }
      return result;
    }

    /**
     * Resolve public operation metadata without executing expressions or
     * validators. Any incomplete/malformed context fails to an empty list so
     * discovery cannot become an authorization oracle or leak diagnostics.
     *
     * @param request Authorized server-owned discovery context.
     * @returns Operations visible to the actor for the exact resolved form.
     */
    public async discoverOperations(
      request: RecordValidationOperationDiscoveryRequest
    ): Promise<ValidationOperationDiscovery[]> {
      if (!request.canEdit || !request.actor.authenticated) return [];
      try {
        return await this.discoverOperationsForContext(request);
      } catch (error: unknown) {
        const type = error instanceof Error ? error.name : typeof error;
        const recordType = safeLogReference(request.candidate.metaMetadata.type);
        const form = safeLogReference(request.candidate.metaMetadata.form);
        this.logger.warn(
          `Record validation operation discovery could not be completed` +
          ` (recordType=${recordType}, form=${form}, errorType=${type}).`
        );
        return [];
      }
    }

    private async discoverOperationsForContext(
      request: RecordValidationOperationDiscoveryRequest
    ): Promise<ValidationOperationDiscovery[]> {
      const diagnostics: RecordValidationDiagnostic[] = [];
      const normalized = this.normalizeRequest(
        {
          candidate: request.candidate,
          writeKind: request.writeKind,
          targetStep: request.targetStep,
          currentStep: request.currentStep,
          actor: request.actor,
        },
        diagnostics,
        true
      );
      if (!normalized) return [];
      if (request.writeKind === 'transition' && !normalized.targetStep) return [];

      const brand = this.requiredReference(request.candidate.metaMetadata.brandId, 'brand', diagnostics);
      const recordTypeName = this.requiredReference(request.candidate.metaMetadata.type, 'recordType', diagnostics);
      if (!brand || !recordTypeName) return [];

      const dependencies = this.dependencies();
      const recordType = await dependencies.loadRecordType(brand, recordTypeName);
      if (!recordType) return [];
      const authorizedTargets = new Set(
        normalizeUniqueStrings(request.authorizedTargetSteps)
          ?.filter(step => RECORD_VALIDATION_REFERENCE_PATTERN.test(step)) ?? []
      );
      if (normalized.targetStep && !authorizedTargets.has(normalized.targetStep)) return [];

      // Load workflow configuration once, then resolve the base and all
      // actor-authorized targets against the in-memory set. This bounds query
      // work independently of the number of authorized transitions.
      const workflowSteps = await dependencies.loadWorkflowSteps(recordType);
      const workflowStepByName = new Map<string, WorkflowStepLike>();
      for (const step of workflowSteps) {
        const name = typeof step.name === 'string' ? step.name.trim() : '';
        if (RECORD_VALIDATION_REFERENCE_PATTERN.test(name)) workflowStepByName.set(name, step);
      }
      const workflowStepLookups = new Map<string, Promise<WorkflowStepLike | null>>();
      for (const [name, step] of workflowStepByName) {
        workflowStepLookups.set(name, Promise.resolve(step));
      }
      const fallbackWorkflowSteps = new Set<string>();
      const candidateWorkflowStep = request.candidate.workflow?.stage;
      if (
        typeof candidateWorkflowStep === 'string' &&
        RECORD_VALIDATION_REFERENCE_PATTERN.test(candidateWorkflowStep.trim())
      ) {
        fallbackWorkflowSteps.add(candidateWorkflowStep.trim());
      }
      if (normalized.targetStep) fallbackWorkflowSteps.add(normalized.targetStep);
      const loadWorkflowStep = async (step: string): Promise<WorkflowStepLike | null> => {
        const cached = workflowStepLookups.get(step);
        if (cached) return await cached;
        if (!fallbackWorkflowSteps.has(step)) {
          workflowStepLookups.set(step, Promise.resolve(null));
          return null;
        }
        const lookup = dependencies.loadWorkflowStep(recordType, step);
        workflowStepLookups.set(step, lookup);
        return await lookup;
      };
      const discoveryDependencies: RecordValidationServiceDependencies = {
        ...dependencies,
        loadWorkflowStep: async (_recordType, step) => await loadWorkflowStep(step),
        loadStartingWorkflowStep: async () =>
          workflowSteps.find(step => step.starting === true) ?? dependencies.loadStartingWorkflowStep(recordType),
      };
      const contexts: NormalizedRecordValidationRequest[] = normalized.targetStep
        ? [normalized]
        : [
            normalized,
            ...[...authorizedTargets]
              .sort(compareRecordValidationIdentifiers)
              .map(targetStep => ({
                ...normalized,
                source: {
                  ...normalized.source,
                  writeKind: request.writeKind === 'create' ? 'create' as const : 'transition' as const,
                  targetStep,
                },
                targetStep,
              })),
          ];

      const resolvedContexts: Array<{
        request: NormalizedRecordValidationRequest;
        selection: ResolvedFormSelection;
      }> = [];
      for (const context of contexts) {
        const contextDiagnostics: RecordValidationDiagnostic[] = [];
        const selection = await this.resolveFormSelection(
          context,
          recordType,
          contextDiagnostics,
          discoveryDependencies
        );
        // Discovery is an authorization-sensitive presentation surface. A
        // partially resolved workflow may still be validated in shadow mode,
        // but must not advertise operations from an unauthoritative stage.
        if (selection && !contextDiagnostics.some(item => item.severity === 'error')) {
          resolvedContexts.push({ request: context, selection });
        }
      }

      const constructedForms = new Map<string, FormConfigOutline | null>();
      const getConstructedForm = async (formName: string): Promise<FormConfigOutline | null> => {
        if (constructedForms.has(formName)) return constructedForms.get(formName) ?? null;
        let constructed: FormConfigOutline | null = null;
        try {
          const form = await this.loadFormDefinition(formName, brand);
          if (form?.form.configuration) {
            constructed = await this.constructForm(form, request.candidate.metadata);
          }
        } catch (error: unknown) {
          const errorType = safeLogReference(error instanceof Error ? error.name : typeof error);
          this.logger.warn(
            `Validation operation discovery form construction was safely omitted` +
            ` (recordType=${safeLogReference(recordTypeName)},` +
            ` form=${safeLogReference(formName)}, errorType=${errorType}).`
          );
          constructed = null;
        }
        constructedForms.set(formName, constructed);
        return constructed;
      };

      const merged = new Map<string, {
        operation: ValidationOperationDiscovery;
        metadataPrecedence: string;
      }>();
      for (const context of resolvedContexts) {
        const constructedForm = await getConstructedForm(context.selection.formName);
        const formOperations = constructedForm?.validationOperations;
        if (!formOperations || typeof formOperations !== 'object' || Array.isArray(formOperations)) continue;
        for (const name of Object.keys(formOperations).sort(compareRecordValidationIdentifiers)) {
          if (!VALIDATION_OPERATION_NAME_PATTERN.test(name)) continue;
          const operationDiagnostics: RecordValidationDiagnostic[] = [];
          const policy = this.resolveOperationPolicy(
            name,
            formOperations,
            recordType.recordValidation?.operations,
            this.workflowOperationOverrides(context.selection.workflowConfig),
            operationDiagnostics
          );
          if (!policy || operationDiagnostics.some(item => item.severity === 'error')) continue;
          const operationRequest: NormalizedRecordValidationRequest = { ...context.request, operation: name };
          if (!this.authorizeOperation(policy, operationRequest, operationDiagnostics)) continue;

          // A target is advertised only from that target's authoritative form
          // context. The base update/create context keeps the operation
          // discoverable without implying that every actor-authorized target
          // defines it.
          const contextTargets = new Set(
            context.request.targetStep ? [context.request.targetStep] : []
          );
          const policyTargets = policy.allowedTargetSteps === undefined
            ? [...contextTargets]
            : policy.allowedTargetSteps.filter(step => contextTargets.has(step));
          const safeOperation = sanitizeValidationOperationDiscovery({
            name,
            label: policy.label,
            description: policy.description,
            allowedTargetSteps: policyTargets,
          }, authorizedTargets);
          if (!safeOperation) continue;
          const existing = merged.get(name);
          // Prefer the current/base form's presentation metadata. If an
          // operation exists only on target forms, the lexically first target
          // wins. Target lists are still unioned across every defining form.
          const metadataPrecedence = context.request.targetStep
            ? `1:${context.request.targetStep}:${context.selection.formName}`
            : `0:${context.selection.formName}`;
          const presentation = !existing || metadataPrecedence < existing.metadataPrecedence
            ? safeOperation
            : existing.operation;
          const mergedTargets = [...new Set([
            ...(existing?.operation.allowedTargetSteps ?? []),
            ...(safeOperation.allowedTargetSteps ?? []),
          ])].sort(compareRecordValidationIdentifiers);
          merged.set(name, {
            operation: {
              ...presentation,
              ...(mergedTargets.length > 0 ? { allowedTargetSteps: mergedTargets } : {}),
            },
            metadataPrecedence: existing && existing.metadataPrecedence < metadataPrecedence
              ? existing.metadataPrecedence
              : metadataPrecedence,
          });
        }
      }
      return [...merged.values()].map(({ operation }) => operation).sort((left, right) =>
        compareRecordValidationIdentifiers(left.name, right.name)
      );
    }

    private async resolveRequest(
      request: RecordValidationRequest,
      diagnostics: RecordValidationDiagnostic[],
      progress: ResolutionProgress
    ): Promise<RecordValidationResult> {
      const globalConfig = sails.config.recordValidation;
      const normalized = this.normalizeRequest(request, diagnostics);
      const initialModeResolution = resolveValidationMode(globalConfig, undefined, normalized?.operation);
      this.addMalformedModeDiagnostics(initialModeResolution.malformedModeCount, diagnostics);
      let mode = initialModeResolution.mode;
      progress.mode = mode;
      if (!normalized) {
        return this.buildResult(mode, diagnostics, { outcome: 'unresolved', contractFailure: true });
      }
      const operation = normalized.operation;
      progress.operation = operation;

      const brand = this.requiredReference(request.candidate.metaMetadata.brandId, 'brand', diagnostics);
      const recordTypeName = this.requiredReference(request.candidate.metaMetadata.type, 'recordType', diagnostics);
      progress.recordType = recordTypeName;
      if (!brand || !recordTypeName) {
        return this.buildResult(mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
        });
      }

      // Resolve the configured record-type rollout layer before depending on
      // the runtime model lookup. Otherwise an enforce-only type could fail
      // open precisely when its model is unavailable or malformed.
      const configuredRecordType = sails.config.recordtype?.[recordTypeName];
      const configuredRecordTypeValidation = configuredRecordType?.recordValidation;
      const configuredModeResolution = resolveValidationMode(globalConfig, configuredRecordTypeValidation, operation);
      this.addMalformedModeDiagnostics(
        Math.max(0, configuredModeResolution.malformedModeCount - initialModeResolution.malformedModeCount),
        diagnostics
      );
      mode = configuredModeResolution.mode;
      progress.mode = mode;

      const dependencies = this.dependencies();
      const recordType = await dependencies.loadRecordType(brand, recordTypeName);
      if (!recordType) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.recordTypeNotFound,
            'The candidate record type could not be resolved.'
          )
        );
        return this.buildResult(mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
        });
      }

      const effectiveModeResolution = resolveValidationMode(globalConfig, recordType.recordValidation, operation);
      this.addMalformedModeDiagnostics(Math.max(
        0,
        effectiveModeResolution.malformedModeCount - configuredModeResolution.malformedModeCount
      ), diagnostics);
      mode = effectiveModeResolution.mode;
      progress.mode = mode;

      const selection = await this.resolveFormSelection(normalized, recordType, diagnostics, dependencies);
      if (!selection)
        return this.buildResult(mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
        });
      progress.formName = selection.formName;

      if (request.writeKind === 'create' || request.writeKind === 'transition') {
        const candidateForm = request.candidate.metaMetadata.form;
        const normalizedCandidateForm = typeof candidateForm === 'string' ? candidateForm.trim() : '';
        if (!RECORD_VALIDATION_REFERENCE_PATTERN.test(normalizedCandidateForm) ||
          normalizedCandidateForm !== selection.formName) {
          diagnostics.push(createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceDivergence,
            'The final candidate form diverges from the authoritative workflow form.',
            { formName: selection.formName }
          ));
        }
      }

      const form = await this.loadFormDefinition(selection.formName, brand);
      if (!form) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.formNotFound,
            'The exact configured form could not be resolved.',
            { formName: selection.formName }
          )
        );
        return this.buildResult(mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
        });
      }
      if (!form.form.configuration) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.formConfigurationMissing,
            'The exact configured form has no configuration.',
            { formName: selection.formName }
          )
        );
        return this.buildResult(mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
        });
      }

      let constructedForm: FormConfigOutline;
      try {
        constructedForm = await this.constructForm(form, request.candidate.metadata);
      } catch {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.formConfigurationMalformed,
            'The exact configured form could not be constructed.',
            { formName: selection.formName }
          )
        );
        return this.buildResult(mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
        });
      }

      const policy = this.resolveOperationPolicy(
        operation,
        constructedForm.validationOperations,
        recordType.recordValidation?.operations,
        this.workflowOperationOverrides(selection.workflowConfig),
        diagnostics
      );
      if (operation && !policy) {
        return this.buildResult(mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
          contractFailure: true,
        });
      }
      if (policy && !this.authorizeOperation(policy, normalized, diagnostics)) {
        return this.buildResult(mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
          contractFailure: true,
        });
      }

      if (request.evaluateFormValidators === false) {
        const resolved: RecordValidationResolvedState = {
          constructedForm,
          formName: selection.formName,
          recordType: recordTypeName,
          brand,
          workflowStep: selection.workflowStep,
          operationPolicy: policy,
          conditionalGroups: [],
        };
        return this.buildResult(mode, diagnostics, {
          outcome: 'resolved',
          operation,
          recordType: recordTypeName,
          effectiveGroups: [],
          resolved,
          blockingErrors: [],
          advisoryErrors: [],
          advisoryGroups: [],
          transformedCandidate: cloneRecordValidationCandidate(request.candidate),
        });
      }
      const timeoutMs = this.timeoutMs(globalConfig?.timeoutMs);
      const deadline = this.createDeadline(timeoutMs);
      let persistenceCandidate: RecordValidationCandidate | undefined;
      // Until the schema-owned transformation pass completes, shadow mode must
      // not treat the raw submitted candidate as safe for persistence.
      let transformationContractFailed = true;
      const blockingRun = await this.withDeadline(
        async () => {
          const transformations = await this.collectCandidateTransformations(
            _.cloneDeep(constructedForm),
            deadline
          );
          const transformationApplication = this.applyCandidateTransformations(
            request.candidate,
            transformations,
            diagnostics
          );
          let transformedCandidate = transformationApplication.candidate;
          const appliedTransformations = [...transformationApplication.applied];
          persistenceCandidate = transformedCandidate;
          if (transformationApplication.inapplicable) {
            return undefined;
          }
          transformationContractFailed = false;
          this.checkDeadline(deadline);
          const normalizedForContext: NormalizedRecordValidationRequest = {
            ...normalized,
            source: { ...normalized.source, candidate: transformedCandidate },
          };
          const context = this.buildExpressionContext(
            normalizedForContext,
            recordTypeName,
            selection.formName,
            brand,
            globalConfig?.allowedRequestParameters,
            diagnostics
          );
          if (!context) return undefined;
          const validationForm = transformationApplication.applied.length > 0
            ? await this.constructForm(form, transformedCandidate.metadata)
            : constructedForm;
          const groupResolution = await this.resolveValidationGroups(
            validationForm,
            policy,
            context,
            diagnostics,
            deadline
          );
          if (!groupResolution) return undefined;
          const advisoryGroups = this.discoverAdvisoryGroups(
            validationForm,
            groupResolution.effectiveGroups,
            diagnostics
          );
          const validatorDefinitionsMap = this.validatorDefinitions(validationForm, diagnostics);
          if (!validatorDefinitionsMap) return undefined;
          const validation = await this.executeValidators(
            validationForm,
            groupResolution.effectiveGroups,
            validatorDefinitionsMap,
            advisoryGroups,
            deadline
          );
          const validatorTransformationApplication = this.applyCandidateTransformations(
            transformedCandidate,
            validation.transformations,
            diagnostics
          );
          transformedCandidate = validatorTransformationApplication.candidate;
          persistenceCandidate = transformedCandidate;
          appliedTransformations.push(...validatorTransformationApplication.applied);
          if (validatorTransformationApplication.inapplicable) {
            transformationContractFailed = true;
            return undefined;
          }
          this.checkDeadline(deadline);
          const mappedIssues = this.mapValidatorSummaries(validation.summaries);
          const transformationAdvisories = this.mapTransformationAdvisories(appliedTransformations);
          this.checkDeadline(deadline);
          return {
            context,
            validationForm,
            groupResolution,
            advisoryGroups,
            validatorDefinitionsMap,
            mappedIssues,
            transformationAdvisories,
            transformedCandidate,
          };
        },
        deadline
      );
      if (blockingRun.status === 'timed-out') {
        diagnostics.push(
          createDiagnostic(RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingTimeout, 'Blocking record validation timed out.')
        );
        return this.buildResult(mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
          contractFailure: transformationContractFailed,
          ...(persistenceCandidate ? { transformedCandidate: persistenceCandidate } : {}),
        });
      }
      if (blockingRun.status === 'failed') {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingExecutionFailed,
            'Blocking record validation could not be completed.'
          )
        );
        return this.buildResult(mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
          contractFailure: transformationContractFailed,
          ...(persistenceCandidate ? { transformedCandidate: persistenceCandidate } : {}),
        });
      }
      if (!blockingRun.value) {
        return this.buildResult(mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
          contractFailure: transformationContractFailed,
          ...(persistenceCandidate ? { transformedCandidate: persistenceCandidate } : {}),
        });
      }
      const {
        context,
        validationForm,
        groupResolution,
        advisoryGroups,
        validatorDefinitionsMap,
        mappedIssues,
        transformationAdvisories,
        transformedCandidate: blockingTransformedCandidate,
      } = blockingRun.value;
      const blockingErrors = mappedIssues.blocking;
      let advisoryErrors: RecordSaveIssue[] = [...transformationAdvisories];
      let transformedCandidate = blockingTransformedCandidate;
      if (advisoryGroups.length > 0) {
        const advisoryRun = await this.withDeadline(async () => {
          const validation = await this.executeValidators(
            validationForm,
            advisoryGroups,
            validatorDefinitionsMap,
            [],
            deadline
          );
          const advisoryTransformationApplication = this.applyCandidateTransformations(
            transformedCandidate,
            validation.transformations,
            diagnostics
          );
          transformedCandidate = advisoryTransformationApplication.candidate;
          persistenceCandidate = transformedCandidate;
          if (advisoryTransformationApplication.inapplicable) {
            transformationContractFailed = true;
            return undefined;
          }
          advisoryErrors = [
            ...advisoryErrors,
            ...this.mapTransformationAdvisories(advisoryTransformationApplication.applied),
          ];
          this.checkDeadline(deadline);
          const issues = this.mapValidatorSummaries(validation.summaries);
          this.checkDeadline(deadline);
          return {
            issues: issues.blocking,
          };
        }, deadline);
        if (advisoryRun.status === 'timed-out') {
          diagnostics.push(
            createDiagnostic(
              RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryTimeout,
              'Advisory record validation timed out.',
              { severity: 'warning' }
            )
          );
        } else if (advisoryRun.status === 'failed') {
          diagnostics.push(
            createDiagnostic(
              RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryExecutionFailed,
              'Advisory record validation could not be completed.',
              { severity: 'warning' }
            )
          );
        } else if (!advisoryRun.value) {
          return this.buildResult(mode, diagnostics, {
            outcome: 'unresolved',
            operation,
            recordType: recordTypeName,
            formName: selection.formName,
            contractFailure: transformationContractFailed,
            ...(persistenceCandidate ? { transformedCandidate: persistenceCandidate } : {}),
          });
        } else {
          advisoryErrors = [...advisoryErrors, ...advisoryRun.value.issues];
        }
      }
      const resolved: RecordValidationResolvedState = {
        constructedForm: validationForm,
        formName: selection.formName,
        recordType: recordTypeName,
        brand,
        workflowStep: selection.workflowStep,
        operationPolicy: policy,
        conditionalGroups: groupResolution.conditionalGroups,
        expressionContext: context,
      };
      return this.buildResult(mode, diagnostics, {
        outcome: 'resolved',
        operation,
        recordType: recordTypeName,
        effectiveGroups: groupResolution.effectiveGroups,
        resolved,
        blockingErrors,
        advisoryErrors,
        advisoryGroups,
        transformedCandidate,
      });
    }

    private dependencies(): RecordValidationServiceDependencies {
      if (this.resolvedDependencies) return this.resolvedDependencies;
      const defaults: RecordValidationServiceDependencies = {
        loadRecordType: async (brand, recordType) =>
          (await firstValueFrom(
            RecordTypesService.get({ id: brand } as BrandingModel, recordType)
          )) as RecordTypeLike | null,
        loadStartingWorkflowStep: async recordType =>
          (await firstValueFrom(WorkflowStepsService.getFirst(recordType))) as WorkflowStepLike | null,
        loadWorkflowStep: async (recordType, step) =>
          (await firstValueFrom(WorkflowStepsService.get(recordType, step))) as WorkflowStepLike | null,
        loadWorkflowSteps: async recordType =>
          (await firstValueFrom(WorkflowStepsService.getAllForRecordType(recordType))) as WorkflowStepLike[],
        loadForm: async (formName, brand) => await firstValueFrom(FormsService.getFormByName(formName, true, brand)),
        constructForm: async (form, metadata, reusableFormDefinitions) =>
          await new ConstructFormConfigVisitor(this.logger).start({
            data: form,
            formMode: 'edit',
            record: metadata,
            reusableFormDefs: reusableFormDefinitions,
          }),
        collectTransformations: async (form, checkDeadline) =>
          (await new ValidatorFormConfigVisitor(this.logger).startWithResult({
            form,
            transformationOnly: true,
            checkDeadline,
          })).transformations,
        executeValidators: async (
          form,
          enabledValidationGroups,
          validatorDefinitionsMap,
          evaluatorFactory,
          excludedOnlyValidationGroups,
          checkDeadline
        ) =>
          await new ValidatorFormConfigVisitor(this.logger).startWithResult({
            form,
            enabledValidationGroups: [...enabledValidationGroups],
            validatorDefinitionsMap,
            jsonataEvaluatorFactory: evaluatorFactory,
            excludedOnlyValidationGroups: [...(excludedOnlyValidationGroups ?? [])],
            checkDeadline,
          }),
      };
      this.resolvedDependencies = { ...defaults, ...this.dependencyOverrides };
      // A custom validator executor owns its preprocessing contract as well.
      // Legacy/test executors that do not expose a collector are explicitly
      // transformation-free instead of being traversed as framework forms.
      if (this.dependencyOverrides?.executeValidators && !this.dependencyOverrides.collectTransformations) {
        this.resolvedDependencies.collectTransformations = async () => [];
      }
      return this.resolvedDependencies;
    }

    private normalizeRequest(
      request: RecordValidationRequest,
      diagnostics: RecordValidationDiagnostic[],
      requireResolvedWorkflowStep = false
    ): NormalizedRecordValidationRequest | undefined {
      const operation = this.normalizeOperation(request.validationOperation, diagnostics);
      const targetStep = this.optionalStepReference(request.targetStep, diagnostics);
      if (!operation.ok || !targetStep.ok) return undefined;
      const mustResolveWorkflowStep = requireResolvedWorkflowStep || operation.value !== undefined;
      const currentStep = this.optionalStepReference(
        request.currentStep,
        diagnostics,
        mustResolveWorkflowStep ? 'error' : 'warning'
      );
      return {
        source: request,
        operation: operation.value,
        targetStep: targetStep.value,
        // currentStep can come from an already-stored legacy record. Keep the
        // diagnostic mode-aware instead of turning it into an unconditional
        // public-request contract rejection; shadow mode must remain neutral so
        // an operator can repair the record.
        currentStep: currentStep.ok ? currentStep.value : undefined,
        actorRoles: normalizeRoles(request.actor.roles),
        requireResolvedWorkflowStep: mustResolveWorkflowStep,
      };
    }

    private normalizeOperation(value: unknown, diagnostics: RecordValidationDiagnostic[]): ParsedOptionalString {
      if (value === undefined || value === null) return { ok: true };
      if (typeof value !== 'string') {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.operationMalformed,
            'The validation operation has an invalid format.'
          )
        );
        return { ok: false };
      }
      const operation = value.trim();
      if (!VALIDATION_OPERATION_NAME_PATTERN.test(operation)) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.operationMalformed,
            'The validation operation has an invalid format.'
          )
        );
        return { ok: false };
      }
      return { ok: true, value: operation };
    }

    private requiredReference(
      value: unknown,
      kind: 'brand' | 'recordType',
      diagnostics: RecordValidationDiagnostic[]
    ): string | undefined {
      const missingCode =
        kind === 'brand'
          ? RECORD_VALIDATION_DIAGNOSTIC_CODES.brandReferenceMissing
          : RECORD_VALIDATION_DIAGNOSTIC_CODES.recordTypeReferenceMissing;
      const malformedCode =
        kind === 'brand'
          ? RECORD_VALIDATION_DIAGNOSTIC_CODES.brandReferenceMalformed
          : RECORD_VALIDATION_DIAGNOSTIC_CODES.recordTypeReferenceMalformed;
      if (typeof value !== 'string' || !value.trim()) {
        diagnostics.push(createDiagnostic(missingCode, `The candidate ${kind} reference is missing.`));
        return undefined;
      }
      const normalized = value.trim();
      if (!RECORD_VALIDATION_REFERENCE_PATTERN.test(normalized)) {
        diagnostics.push(createDiagnostic(malformedCode, `The candidate ${kind} reference is malformed.`));
        return undefined;
      }
      return normalized;
    }

    private optionalStepReference(
      value: string | undefined,
      diagnostics: RecordValidationDiagnostic[],
      severity: RecordValidationDiagnostic['severity'] = 'error'
    ): ParsedOptionalString {
      if (value === undefined || value === null) return { ok: true };
      if (typeof value !== 'string' || !RECORD_VALIDATION_REFERENCE_PATTERN.test(value.trim())) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed,
            'The workflow step reference is malformed.',
            { severity }
          )
        );
        return { ok: false };
      }
      return { ok: true, value: value.trim() };
    }

    private async resolveFormSelection(
      request: NormalizedRecordValidationRequest,
      recordType: RecordTypeLike,
      diagnostics: RecordValidationDiagnostic[],
      dependencies: RecordValidationServiceDependencies
    ): Promise<ResolvedFormSelection | undefined> {
      const { targetStep } = request;
      if (request.source.writeKind === 'transition' && !targetStep) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed,
            'A transition requires a target workflow step.'
          )
        );
        return undefined;
      }
      if ((request.source.writeKind === 'transition' || request.source.writeKind === 'create') && targetStep) {
        const step = await dependencies.loadWorkflowStep(recordType, targetStep);
        if (!step) {
          diagnostics.push(
            createDiagnostic(
              RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepNotFound,
              'The exact requested workflow step could not be resolved.'
            )
          );
          return undefined;
        }
        return this.selectionFromWorkflowStep(step, diagnostics);
      }
      if (request.source.writeKind === 'create') {
        const step = await dependencies.loadStartingWorkflowStep(recordType);
        if (!step) {
          diagnostics.push(
            createDiagnostic(
              RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepNotFound,
              'The starting workflow step could not be resolved.'
            )
          );
          return undefined;
        }
        return this.selectionFromWorkflowStep(step, diagnostics);
      }
      const formName = request.source.candidate.metaMetadata.form;
      if (typeof formName !== 'string' || !formName.trim()) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceMissing,
            'The candidate form reference is missing.'
          )
        );
        return undefined;
      }
      const normalized = formName.trim();
      if (!RECORD_VALIDATION_REFERENCE_PATTERN.test(normalized)) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceMalformed,
            'The candidate form reference is malformed.'
          )
        );
        return undefined;
      }
      const rawWorkflowStep = request.source.candidate.workflow?.stage;
      if ((rawWorkflowStep === undefined || rawWorkflowStep === null || rawWorkflowStep === '') &&
        request.requireResolvedWorkflowStep) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMissing,
            'A named validation operation requires a resolved current workflow step.'
          )
        );
      }
      const parsedWorkflowStep = this.optionalStepReference(
        rawWorkflowStep as string | undefined,
        diagnostics,
        request.requireResolvedWorkflowStep ? 'error' : 'warning'
      );
      // A malformed stored stage is configuration state, not a malformed
      // operation request. Continue with the exact form and non-stage policy
      // so form and record-type operation restrictions remain authoritative.
      const workflowStep = parsedWorkflowStep.ok ? parsedWorkflowStep.value : undefined;
      let workflowConfig: Readonly<Partial<WorkflowStageConfig> & Record<string, unknown>> | undefined;
      if (workflowStep) {
        const step = await dependencies.loadWorkflowStep(recordType, workflowStep);
        if (!step) {
          diagnostics.push(
            createDiagnostic(
              RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepNotFound,
              'The candidate workflow step could not be resolved.',
              { severity: request.requireResolvedWorkflowStep ? 'error' : 'warning' }
            )
          );
        } else {
          workflowConfig = step.config;
        }
      }
      return { formName: normalized, workflowStep, workflowConfig };
    }

    private selectionFromWorkflowStep(
      step: WorkflowStepLike,
      diagnostics: RecordValidationDiagnostic[]
    ): ResolvedFormSelection | undefined {
      const formName = stringProperty(step.config, 'form');
      if (!formName) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepFormMissing,
            'The resolved workflow step has no form reference.'
          )
        );
        return undefined;
      }
      if (!RECORD_VALIDATION_REFERENCE_PATTERN.test(formName)) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceMalformed,
            'The resolved workflow step form reference is malformed.'
          )
        );
        return undefined;
      }
      return { formName, workflowStep: step.name, workflowConfig: step.config };
    }

    private workflowOperationOverrides(
      config: Readonly<Partial<WorkflowStageConfig> & Record<string, unknown>> | undefined
    ): Readonly<Record<string, ValidationOperationPolicyOverride>> | undefined {
      return config?.recordValidation?.operations;
    }

    private resolveOperationPolicy(
      operation: string | undefined,
      formOperations: Readonly<Record<string, ValidationOperationDefinition>> | undefined,
      recordTypeOperations: Readonly<Record<string, ValidationOperationOverride>> | undefined,
      workflowOperations: Readonly<Record<string, ValidationOperationPolicyOverride>> | undefined,
      diagnostics: RecordValidationDiagnostic[]
    ): EffectiveValidationOperationPolicy | undefined {
      if (!operation) return undefined;
      const formPolicy =
        formOperations && Object.hasOwn(formOperations, operation) ? formOperations[operation] : undefined;
      if (!formPolicy) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.operationUnknown,
            'The validation operation is not defined by the exact resolved form.',
            { operation }
          )
        );
        return undefined;
      }
      const groups = normalizeUniqueStrings(formPolicy.enabledValidationGroups);
      const roles = normalizeUniqueStrings(formPolicy.roles);
      const targetSteps = normalizeUniqueStrings(formPolicy.allowedTargetSteps);
      if (
        groups === undefined ||
        (formPolicy.roles !== undefined && roles === undefined) ||
        (formPolicy.allowedTargetSteps !== undefined && targetSteps === undefined)
      ) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.operationPolicyMalformed,
            'The form validation operation policy is malformed.',
            { operation }
          )
        );
        return undefined;
      }
      let policy: EffectiveValidationOperationPolicy = {
        name: operation,
        enabledValidationGroups: groups,
        label: formPolicy.label,
        description: formPolicy.description,
        roles,
        allowedTargetSteps: targetSteps,
      };
      policy = applyPolicyLayer(
        policy,
        recordTypeOperations && Object.hasOwn(recordTypeOperations, operation)
          ? recordTypeOperations[operation]
          : undefined,
        diagnostics
      );
      policy = applyPolicyLayer(
        policy,
        workflowOperations && Object.hasOwn(workflowOperations, operation) ? workflowOperations[operation] : undefined,
        diagnostics
      );
      return policy;
    }

    private authorizeOperation(
      policy: EffectiveValidationOperationPolicy,
      request: NormalizedRecordValidationRequest,
      diagnostics: RecordValidationDiagnostic[]
    ): boolean {
      const actorRoles = new Set(request.actorRoles);
      if (policy.roles !== undefined && !policy.roles.some(role => actorRoles.has(role))) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.operationRoleUnauthorized,
            'The actor is not authorized for this validation operation.',
            { operation: policy.name }
          )
        );
        return false;
      }
      if (
        request.targetStep !== undefined &&
        policy.allowedTargetSteps !== undefined &&
        !policy.allowedTargetSteps.includes(request.targetStep)
      ) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.operationTargetUnauthorized,
            'The target workflow step is not authorized for this validation operation.',
            { operation: policy.name }
          )
        );
        return false;
      }
      return true;
    }

    private buildExpressionContext(
      request: NormalizedRecordValidationRequest,
      recordType: string,
      formName: string,
      brand: string,
      configuredAllowedRequestParameters: readonly string[] | undefined,
      diagnostics: RecordValidationDiagnostic[]
    ): RecordValidationExpressionContext | undefined {
      const requestParams: Record<string, RecordValidationJSONValue> = {};
      const serverAllowed = new Set(normalizeUniqueStrings(configuredAllowedRequestParameters) ?? []);
      const callerNames = normalizeUniqueStrings(request.source.allowedRequestParameterNames);
      const callerNarrowing =
        request.source.allowedRequestParameterNames === undefined ? serverAllowed : new Set(callerNames ?? []);
      let droppedRequestParameter = false;
      for (const [name, value] of Object.entries(request.source.requestParameters ?? {})) {
        if (
          serverAllowed.has(name) &&
          callerNarrowing.has(name) &&
          name !== '__proto__' &&
          name !== 'prototype' &&
          name !== 'constructor'
        ) {
          requestParams[name] = value;
        } else {
          droppedRequestParameter = true;
        }
      }
      if (droppedRequestParameter) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.requestParameterDropped,
            'One or more request parameters are unavailable to validation expressions.',
            { severity: 'warning' }
          )
        );
      }
      const rawCurrentStep =
        request.currentStep ??
        request.source.candidate.previousWorkflow?.stage ??
        request.source.candidate.workflow?.stage;
      const currentStep = this.optionalStepReference(
        rawCurrentStep,
        diagnostics,
        request.requireResolvedWorkflowStep ? 'error' : 'warning'
      );
      const formData = this.projectExpressionContextObject(
        request.source.candidate.metadata,
        'formData',
        diagnostics
      );
      const projectedRequestParams = this.projectExpressionContextObject(
        requestParams,
        'requestParams',
        diagnostics
      );
      const runtimeContext = this.projectExpressionContextObject(
        request.source.runtimeContext ?? {},
        'runtimeContext',
        diagnostics
      );
      if (!formData || !projectedRequestParams || !runtimeContext) return undefined;
      return {
        formData,
        ...(request.operation ? { operation: request.operation } : {}),
        recordType,
        formName,
        brand,
        workflow: {
          ...(currentStep.ok && currentStep.value ? { currentStep: currentStep.value } : {}),
          ...(request.targetStep ? { targetStep: request.targetStep } : {}),
        },
        requestParams: projectedRequestParams,
        runtimeContext,
        actor: { authenticated: request.source.actor.authenticated === true, roles: request.actorRoles },
      };
    }

    private projectExpressionContextObject(
      value: unknown,
      label: 'formData' | 'requestParams' | 'runtimeContext',
      diagnostics: RecordValidationDiagnostic[]
    ): Record<string, RecordValidationJSONValue> | undefined {
      try {
        const serialized = JSON.stringify(value);
        const projected = serialized === undefined ? undefined : JSON.parse(serialized) as unknown;
        if (isRecord(projected)) {
          return projected as Record<string, RecordValidationJSONValue>;
        }
      } catch {
        // Report the same bounded configuration diagnostic below.
      }
      diagnostics.push(createDiagnostic(
        RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionContextUnsupported,
        `The ${label} validation-expression context could not be projected safely.`
      ));
      return undefined;
    }

    private async resolveValidationGroups(
      form: FormConfigOutline,
      policy: EffectiveValidationOperationPolicy | undefined,
      context: RecordValidationExpressionContext,
      diagnostics: RecordValidationDiagnostic[],
      deadline: ValidationDeadline
    ): Promise<{ conditionalGroups: string[]; effectiveGroups: string[] } | undefined> {
      // ConstructFormConfigVisitor always materializes this default and validates
      // the built-in `all`/`none` group definitions before resolution reaches here.
      let groups = [...(form.enabledValidationGroups ?? [])];
      const availableGroups = form.validationGroups ?? {};
      const available = new Set(Object.keys(availableGroups));
      const diagnoseUnknownGroups = (names: readonly string[]): boolean => {
        let unknown = false;
        for (const group of names) {
          if (available.has(group)) continue;
          unknown = true;
          diagnostics.push(
            createDiagnostic(
              RECORD_VALIDATION_DIAGNOSTIC_CODES.validationGroupUnknown,
              'An effective blocking validation group is not declared by the form.',
              { group }
            )
          );
        }
        return unknown;
      };
      if (diagnoseUnknownGroups(groups)) return undefined;
      for (const expression of discoverValidationGroupExpressions(form)) {
        this.checkDeadline(deadline);
        const change = await this.evaluateGroupExpression(expression, context, diagnostics, deadline);
        this.checkDeadline(deadline);
        if (!change) continue;
        if (diagnoseUnknownGroups([
          ...(change.groups?.include ?? []),
          ...(change.groups?.exclude ?? []),
        ])) return undefined;
        const folded = calculateValidationGroups(groups, availableGroups, change.initial, change.groups);
        groups = folded.enabledValidationGroups;
        diagnostics.push(...folded.diagnostics);
      }
      const conditionalGroups = [...groups];

      // A named operation is an exact trusted group set applied last. Omission
      // is the explicit strict-all compatibility path: conditional browser
      // groups remain observable but cannot suppress a blocking validator.
      if (policy && diagnoseUnknownGroups(policy.enabledValidationGroups)) return undefined;
      const effectiveGroups = policy
        ? calculateValidationGroups(groups, availableGroups, 'current', undefined, policy.enabledValidationGroups)
            .enabledValidationGroups
        : [];
      return { conditionalGroups, effectiveGroups };
    }

    private async evaluateGroupExpression(
      discovered: DiscoveredValidationGroupExpression,
      context: RecordValidationExpressionContext,
      diagnostics: RecordValidationDiagnostic[],
      deadline: ValidationDeadline
    ): Promise<ValidationGroupChange | undefined> {
      const config = discovered.expression.config;
      const identity = {
        ...(discovered.expressionName ? { expressionName: discovered.expressionName } : {}),
        ...(discovered.field ? { field: discovered.field } : {}),
        ...(discovered.pointer ? { pointer: discovered.pointer } : {}),
      };
      if (config.runOnFormReady === false) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported,
            'A validation-group expression disabled on form ready is client-interaction-only.',
            identity
          )
        );
        return undefined;
      }
      try {
        this.checkDeadline(deadline);
        if (config.condition !== undefined) {
          const conditionKind = config.conditionKind ?? ExpressionsConditionKind.JSONPointer;
          if (conditionKind === ExpressionsConditionKind.JSONPointer) {
            const message = config.condition.includes('::')
              ? 'A blocking validation-group expression depends on browser event history.'
              : 'A JSONPointer condition routes browser events and has no authoritative server meaning.';
            diagnostics.push(createDiagnostic(RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported, message, identity));
            return undefined;
          }
          if (conditionKind === ExpressionsConditionKind.JSONataQuery) {
            diagnostics.push(
              createDiagnostic(
                RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported,
                'A JSONataQuery condition requires a browser query source.',
                identity
              )
            );
            return undefined;
          }
          if (conditionKind !== ExpressionsConditionKind.JSONata) {
            diagnostics.push(
              createDiagnostic(
                RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported,
                'A blocking validation-group expression uses an unsupported condition kind.',
                identity
              )
            );
            return undefined;
          }
          const matches = Boolean(await this.evaluateJSONata(config.condition, context, deadline));
          if (!matches) return undefined;
        }
        if (typeof config.template !== 'string') {
          diagnostics.push(
            createDiagnostic(
              RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported,
              'An operation-only validation-group expression has no registered server implementation.',
              identity
            )
          );
          return undefined;
        }
        const value = await this.evaluateJSONata(config.template, context, deadline);
        const change = parseGroupChange(value);
        if (!change) {
          diagnostics.push(
            createDiagnostic(
              RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionResultMalformed,
              'A blocking validation-group expression returned a malformed group change.',
              identity
            )
          );
        }
        return change;
      } catch (error) {
        if (error instanceof ValidationDeadlineExceeded) throw error;
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionEvaluationFailed,
            'A blocking validation-group expression could not be evaluated.',
            identity
          )
        );
        return undefined;
      }
    }

    private async loadFormDefinition(formName: string, brand: string): Promise<LoadedFormDefinition | null> {
      const form = await this.dependencies().loadForm(formName, brand);
      return form ? {
        form: _.cloneDeep(form),
        reusableFormDefinitions: _.cloneDeep(
          sails.config.reusableFormDefinitions ?? {}
        ) as ReusableFormDefinitions,
      } : null;
    }

    private async constructForm(
      entry: LoadedFormDefinition,
      metadata: Readonly<Record<string, unknown>>
    ): Promise<FormConfigOutline> {
      if (!entry.form.configuration) throw new Error('Form configuration is unavailable.');
      return await this.dependencies().constructForm(
        _.cloneDeep(entry.form.configuration as FormConfigFrame),
        metadata,
        _.cloneDeep(entry.reusableFormDefinitions)
      );
    }

    private discoverAdvisoryGroups(
      form: FormConfigOutline,
      blockingGroups: readonly string[],
      diagnostics: RecordValidationDiagnostic[]
    ): string[] {
      const advisoryGroups: string[] = [];
      for (const node of schemaOwnedFormNodes(form)) {
        const component = isRecord(node.value.component) ? node.value.component : undefined;
        if (component?.class === SuggestedValidationSummaryComponentName) {
          const config = isRecord(component.config) ? component.config : undefined;
          const groups = normalizeUniqueStrings(config?.enabledValidationGroups);
          if (!config || groups === undefined || groups.length === 0) {
            diagnostics.push(
              createDiagnostic(
                RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryConfigurationMalformed,
                'An advisory validation summary has malformed validation groups.'
              )
            );
          } else {
            for (const group of groups) if (!advisoryGroups.includes(group)) advisoryGroups.push(group);
          }
        }
      }

      const available = new Set(Object.keys(form.validationGroups ?? {}));
      const malformedInitialAllGroups = new Set<string>();
      for (const group of advisoryGroups) {
        if (!available.has(group)) {
          diagnostics.push(
            createDiagnostic(
              RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryGroupUnknown,
              'An advisory validation group is not declared by the form.',
              { group }
            )
          );
        } else if (form.validationGroups?.[group]?.initialMembership === 'all') {
          malformedInitialAllGroups.add(group);
          diagnostics.push(
            createDiagnostic(
              RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryConfigurationMalformed,
              'An advisory validation group cannot use all initial membership.',
              { group }
            )
          );
        }
      }
      const validGroups = advisoryGroups.filter(
        group => available.has(group) && !malformedInitialAllGroups.has(group)
      );
      // Empty blocking groups is the established strict-all sentinel. It is
      // not a named group intersection and advisory-only validators are
      // removed from that pass by ValidatorFormConfigVisitor.
      const overlap = validGroups.filter(group => blockingGroups.includes(group));
      for (const group of overlap) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.validationGroupOverlap,
            'A validation group is configured as both blocking and advisory.',
            { group }
          )
        );
      }
      return validGroups;
    }

    private validatorDefinitions(
      _form: FormConfigOutline,
      diagnostics: RecordValidationDiagnostic[]
    ): ReadonlyMap<string, FormValidatorDefinition> | undefined {
      const definitions = sails.config.validators?.definitions;
      try {
        return new ValidatorsSupport().createValidatorDefinitionMapping(definitions ?? []);
      } catch {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingExecutionFailed,
            'Validator definitions could not be prepared.'
          )
        );
        return undefined;
      }
    }

    private async executeValidators(
      form: FormConfigOutline,
      groups: readonly string[],
      mapping: ReadonlyMap<string, FormValidatorDefinition>,
      excludedOnlyGroups: readonly string[],
      deadline: ValidationDeadline
    ): Promise<ValidatorFormConfigResult> {
      const execute = this.dependencies().executeValidators;
      if (!execute) throw new Error('Record validation executor is unavailable.');
      this.checkDeadline(deadline);
      const result = await execute(
        form,
        groups,
        mapping,
        expression => this.jsonataEvaluator(expression, deadline),
        excludedOnlyGroups,
        () => this.checkDeadline(deadline)
      );
      return result;
    }

    private async collectCandidateTransformations(
      form: FormConfigOutline,
      deadline: ValidationDeadline
    ): Promise<readonly FormValueTransformation[]> {
      const collect = this.dependencies().collectTransformations;
      if (!collect) throw new Error('Record validation transformation collector is unavailable.');
      this.checkDeadline(deadline);
      const transformations = await collect(form, () => this.checkDeadline(deadline));
      return transformations;
    }

    private applyCandidateTransformations(
      candidate: RecordValidationCandidate,
      transformations: readonly unknown[],
      diagnostics: RecordValidationDiagnostic[]
    ): CandidateTransformationApplication {
      // Always detach the returned candidate, including the empty
      // transformation path, so callers never receive their own object back.
      const detachedCandidate = cloneRecordValidationCandidate(candidate);
      const metadata: Record<string, unknown> = cloneRecordValidationValue(
        detachedCandidate.metadata ?? {}
      ) as Record<string, unknown>;
      const transformedCandidate: RecordValidationCandidate = {
        ...detachedCandidate,
        metadata,
      };
      const applied: FormValueTransformation[] = [];
      let inapplicable = false;
      for (const candidateTransformation of transformations) {
        if (!isFormValueTransformation(candidateTransformation)) {
          inapplicable = true;
          diagnostics.push(createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.transformationInapplicable,
            'A malformed schema-owned candidate transformation could not be safely applied.'
          ));
          continue;
        }
        if (!this.isCanonicalRichHtmlTransformation(candidateTransformation)) {
          inapplicable = true;
          diagnostics.push(createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.transformationInapplicable,
            'A schema-owned candidate transformation did not contain the canonical sanitized value.'
          ));
          continue;
        }
        if (this.replaceCandidateMetadataValue(
          metadata,
          candidateTransformation.dataModelPath,
          candidateTransformation.sourceValue,
          candidateTransformation.value
        )) {
          applied.push(candidateTransformation);
        } else {
          inapplicable = true;
          diagnostics.push(createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.transformationInapplicable,
            'A schema-owned candidate transformation no longer matched the submitted form data.'
          ));
        }
      }
      return { candidate: transformedCandidate, applied, inapplicable };
    }

    private isCanonicalRichHtmlTransformation(transformation: FormValueTransformation): boolean {
      try {
        return transformation.value === DomSanitizerService.sanitizeWithProfile(transformation.sourceValue, 'html');
      } catch {
        return false;
      }
    }

    private replaceCandidateMetadataValue(
      metadata: Record<string, unknown>,
      path: readonly (string | number)[],
      sourceValue: string,
      value: string
    ): boolean {
      if (path.length === 0 || !_.has(metadata, path) || _.get(metadata, path) !== sourceValue) return false;
      _.set(metadata, path, value);
      return true;
    }

    private jsonataEvaluator(expression: string, deadline: ValidationDeadline): JSONataEvaluate {
      this.checkDeadline(deadline);
      const compiled = this.compiledExpression(expression);
      this.checkDeadline(deadline);
      return async (value: unknown) => {
        this.checkDeadline(deadline);
        const result = await jsonataEvaluate(compiled, value);
        this.checkDeadline(deadline);
        return result;
      };
    }

    private compiledExpression(expression: string) {
      return jsonataCompile(expression);
    }

    private async evaluateJSONata(
      expression: string,
      context: unknown,
      deadline: ValidationDeadline
    ): Promise<unknown> {
      this.checkDeadline(deadline);
      const compiled = this.compiledExpression(expression);
      this.checkDeadline(deadline);
      const result = await jsonataEvaluate(compiled, context);
      this.checkDeadline(deadline);
      return result;
    }

    private mapValidatorSummaries(summaries: readonly FormValidatorSummaryErrors[]): {
      blocking: RecordSaveIssue[];
    } {
      const blocking: RecordSaveIssue[] = [];
      for (const summary of summaries) {
        for (const error of summary.errors ?? []) {
          const pointer = summary.lineagePaths?.angularComponentsJsonPointer;
          const dataPointer = summary.lineagePaths?.dataModel
            ? getJSONPointerByArrayPaths(summary.lineagePaths.dataModel)
            : undefined;
          const safe = sanitizeRecordSaveIssue({
            message: SAFE_TRANSLATION_KEY_PATTERN.test(error.message)
              ? error.message
              : '@validator-error-record-validation',
            ...(typeof summary.id === 'string' && SAFE_FIELD_PATTERN.test(summary.id) ? { field: summary.id } : {}),
            ...(typeof pointer === 'string'
              ? { pointer }
              : typeof dataPointer === 'string'
                ? { pointer: dataPointer }
                : {}),
            ...(typeof error.class === 'string' && SAFE_VALIDATOR_CLASS_PATTERN.test(error.class)
              ? { class: error.class }
              : {}),
            params: error.params,
            targetField: error.targetField,
            lineagePaths: summary.lineagePaths,
          });
          blocking.push(safe);
        }
      }
      return { blocking };
    }

    private mapTransformationAdvisories(
      transformations: readonly FormValueTransformation[]
    ): RecordSaveIssue[] {
      const advisories: RecordSaveIssue[] = [];
      for (const transformation of transformations) {
        advisories.push(...this.mapValidatorSummaries([transformation.advisorySummary]).blocking);
      }
      return advisories;
    }

    private timeoutMs(value: unknown): number {
      return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 5_000;
    }

    private createDeadline(timeoutMs: number): ValidationDeadline {
      return { expiresAt: performance.now() + timeoutMs };
    }

    private checkDeadline(deadline: ValidationDeadline): void {
      if (performance.now() >= deadline.expiresAt) throw new ValidationDeadlineExceeded();
    }

    private remainingBudgetMs(deadline: ValidationDeadline): number {
      return Math.max(0, deadline.expiresAt - performance.now());
    }

    private async withDeadline<T>(work: () => Promise<T>, deadline: ValidationDeadline): Promise<TimeoutResult<T>> {
      const remainingBudgetMs = this.remainingBudgetMs(deadline);
      if (remainingBudgetMs <= 0) return { status: 'timed-out' };
      let timer: ReturnType<typeof setTimeout> | undefined;
      // Install the timer before invoking work. Promise.resolve() defers the
      // first unit until after the timer exists, and explicit elapsed checks
      // still classify synchronous event-loop blocking as a timeout.
      const settledWork = (async (): Promise<TimedResult<T> | TimedFailure | TimedOut> => {
        await Promise.resolve();
        try {
          this.checkDeadline(deadline);
          const value = await work();
          this.checkDeadline(deadline);
          return { status: 'completed', value };
        } catch (error) {
          return error instanceof ValidationDeadlineExceeded
            ? { status: 'timed-out' }
            : { status: 'failed' };
        }
      })();
      const timeout = new Promise<TimedOut>(resolve => {
        timer = setTimeout(() => resolve({ status: 'timed-out' }), remainingBudgetMs);
      });
      try {
        return await Promise.race([settledWork, timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    private addMalformedModeDiagnostics(malformedModeCount: number, diagnostics: RecordValidationDiagnostic[]): void {
      for (let index = 0; index < malformedModeCount; index += 1) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.rolloutModeMalformed,
            'A record-validation rollout mode is malformed.'
          )
        );
      }
    }

    private buildResult(
      mode: ValidationMode,
      diagnostics: readonly RecordValidationDiagnostic[],
      options: BuildResultOptions
    ): RecordValidationResult {
      const hasConfigurationError = diagnostics.some(item => item.severity === 'error');
      const hasBlockingErrors = options.outcome === 'resolved' && options.blockingErrors.length > 0;
      const shouldBlock =
        (options.outcome === 'unresolved' && options.contractFailure === true) ||
        (mode === 'enforce' && (hasConfigurationError || hasBlockingErrors));
      const formName = options.outcome === 'resolved' ? options.resolved.formName : options.formName;
      const common = {
        shouldBlock,
        mode,
        ...(formName ? { formName } : {}),
        ...(options.operation ? { effectiveOperation: options.operation } : {}),
        diagnostics: [...diagnostics],
      };
      const result: RecordValidationResult =
        options.outcome === 'resolved'
          ? {
              ...common,
              status: 'resolved',
              formName: options.resolved.formName,
              effectiveGroups: [...options.effectiveGroups],
              resolved: options.resolved,
              blockingErrors: [...options.blockingErrors],
              advisoryErrors: [...options.advisoryErrors],
              advisoryGroups: [...options.advisoryGroups],
              transformedCandidate: cloneRecordValidationCandidate(options.transformedCandidate),
            }
          : {
              ...common,
              status: 'unresolved',
              ...(options.transformedCandidate
                ? { transformedCandidate: cloneRecordValidationCandidate(options.transformedCandidate) }
                : {}),
            };
      return result;
    }

    private validatorFailureIdentities(
      issues: readonly RecordSaveIssue[],
      scope: 'blocking-validator' | 'advisory-validator'
    ): RecordValidationDiagnosticIdentity[] {
      return issues.slice(0, 128).map(issue => {
        const validatorClass = typeof issue.class === 'string' && SAFE_VALIDATOR_CLASS_PATTERN.test(issue.class)
          ? issue.class
          : undefined;
        const explicitCode = typeof issue.code === 'string' && SAFE_DIAGNOSTIC_CODE_PATTERN.test(issue.code)
          ? issue.code
          : undefined;
        const translatedCode = typeof issue.message === 'string' && issue.message.startsWith('@')
          ? issue.message.slice(1)
          : undefined;
        const validatorCode = explicitCode ?? (
          translatedCode && SAFE_DIAGNOSTIC_CODE_PATTERN.test(translatedCode) ? translatedCode : undefined
        );
        const field = typeof issue.field === 'string' && SAFE_FIELD_PATTERN.test(issue.field)
          ? issue.field
          : undefined;
        const pointer = lowCardinalityPointer(issue.pointer);
        const lineageParts = (['formConfig', 'dataModel', 'angularComponents', 'layout'] as const).flatMap(key => {
          const path = issue.lineagePaths?.[key];
          if (!Array.isArray(path)) return [];
          const lineagePointer = lowCardinalityPointer(getJSONPointerByArrayPaths(path));
          return lineagePointer ? [`${key}=${lineagePointer}`] : [];
        });
        const lineageValue = lineageParts.join('|');
        const lineage = lineageValue && lineageValue.length <= 2_048 ? lineageValue : undefined;
        return {
          code: VALIDATOR_FAILURE_DIAGNOSTIC_CODE,
          scope,
          ...(validatorClass ? { validatorClass } : {}),
          ...(validatorCode ? { validatorCode } : {}),
          ...(field ? { field } : {}),
          ...(pointer ? { pointer } : {}),
          ...(lineage ? { lineage } : {}),
        };
      });
    }

    private observeResolution(
      request: RecordValidationRequest,
      result: RecordValidationResult,
      progress: ResolutionProgress,
      rawDurationMs: number
    ): void {
      const requestId = safeRequestId(request.requestId);
      const diagnosticCodes = result.diagnostics
        .map(item => item.code)
        .filter(code => SAFE_DIAGNOSTIC_CODE_PATTERN.test(code))
        .slice(0, 128);
      const configurationIdentities = result.diagnostics.slice(0, 128).flatMap(diagnostic => {
        if (!SAFE_DIAGNOSTIC_CODE_PATTERN.test(diagnostic.code)) return [];
        const expressionName = typeof diagnostic.expressionName === 'string' && SAFE_FIELD_PATTERN.test(diagnostic.expressionName)
          ? diagnostic.expressionName
          : undefined;
        const field = typeof diagnostic.field === 'string' && SAFE_FIELD_PATTERN.test(diagnostic.field)
          ? diagnostic.field
          : undefined;
        const pointer = lowCardinalityPointer(diagnostic.pointer);
        return [{
          code: diagnostic.code,
          scope: 'diagnostic' as const,
          ...(expressionName ? { expressionName } : {}),
          ...(field ? { field } : {}),
          ...(pointer ? { pointer } : {}),
        }];
      });
      const diagnosticCodeSet = new Set(diagnosticCodes);
      const blockingErrorCount = result.status === 'resolved' ? result.blockingErrors.length : 0;
      const advisoryErrorCount = result.status === 'resolved' ? result.advisoryErrors.length : 0;
      const diagnosticIdentities = result.status === 'resolved'
        ? [
            ...configurationIdentities,
            ...this.validatorFailureIdentities(result.blockingErrors, 'blocking-validator'),
            ...this.validatorFailureIdentities(result.advisoryErrors, 'advisory-validator'),
          ].slice(0, 128)
        : configurationIdentities;
      const timeoutKind: RecordValidationTimeoutKind = diagnosticCodeSet.has(
        RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingTimeout
      )
        ? 'blocking'
        : diagnosticCodeSet.has(RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryTimeout)
          ? 'advisory'
          : 'none';
      const requestRejected = [...diagnosticCodeSet].some(code => requestRejectionCodes.has(code));
      const configurationDiagnosticCount = result.diagnostics.filter(
        diagnostic =>
          SAFE_DIAGNOSTIC_CODE_PATTERN.test(diagnostic.code) &&
          !requestRejectionCodes.has(diagnostic.code) &&
          diagnostic.code !== RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingTimeout &&
          diagnostic.code !== RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryTimeout &&
          diagnostic.code !== RECORD_VALIDATION_DIAGNOSTIC_CODES.requestParameterDropped
      ).length;
      const outcome: RecordValidationOutcome =
        timeoutKind === 'blocking'
          ? 'timed-out'
          : requestRejected
            ? 'request-rejected'
            : configurationDiagnosticCount > 0 && result.diagnostics.some(item => item.severity === 'error')
              ? 'configuration-error'
              : blockingErrorCount > 0
                ? 'invalid'
                : 'valid';
      const durationMs = Number.isFinite(rawDurationMs) && rawDurationMs >= 0 ? rawDurationMs : 0;
      const wouldBlock =
        outcome === 'invalid' ||
        outcome === 'request-rejected' ||
        outcome === 'configuration-error' ||
        outcome === 'timed-out';
      const formName = result.formName ?? progress.formName;
      const operation = diagnosticCodeSet.has(RECORD_VALIDATION_DIAGNOSTIC_CODES.operationUnknown)
        ? UNKNOWN_OPERATION_DIMENSION
        : diagnosticCodeSet.has(RECORD_VALIDATION_DIAGNOSTIC_CODES.operationMalformed)
          ? MALFORMED_OPERATION_DIMENSION
          : result.effectiveOperation ?? progress.operation;
      const metric: RecordValidationResolutionMetric = Object.freeze({
        ...(requestId ? { requestId } : {}),
        ...(progress.recordType ? { recordType: progress.recordType } : {}),
        ...(formName ? { formName } : {}),
        ...(operation ? { operation } : {}),
        writeKind: request.writeKind,
        phase: request.phase ?? 'pre-save',
        mode: result.mode,
        status: result.status,
        shouldBlock: result.shouldBlock,
        wouldBlock,
        outcome,
        durationMs,
        blockingErrorCount,
        advisoryErrorCount,
        timeoutKind,
        configurationDiagnosticCount,
        diagnosticCodes: Object.freeze([...diagnosticCodes]),
        diagnosticIdentities: Object.freeze(diagnosticIdentities.map(identity => Object.freeze(identity))),
      });
      this.emitOpenTelemetry(metric);
      this.logger.info('record_validation_completed', {
        event: 'record_validation_completed',
        request_id: metric.requestId ?? 'unavailable',
        record_type: metric.recordType ?? UNRESOLVED_DIMENSION,
        form: metric.formName ?? UNRESOLVED_DIMENSION,
        validation_operation: metric.operation ?? STRICT_ALL_OPERATION,
        write_kind: metric.writeKind,
        phase: metric.phase,
        mode: metric.mode,
        status: metric.status,
        outcome: metric.outcome,
        should_block: metric.shouldBlock,
        would_block: metric.wouldBlock,
        blocking_error_count: metric.blockingErrorCount,
        advisory_error_count: metric.advisoryErrorCount,
        timeout_kind: metric.timeoutKind,
        configuration_diagnostic_count: metric.configurationDiagnosticCount,
        diagnostic_codes: metric.diagnosticCodes,
        diagnostic_identities: metric.diagnosticIdentities,
        duration_ms: metric.durationMs,
      });
    }

    private warnObservabilityFailure(message: string): void {
      try {
        this.logger.warn(message);
      } catch {
        // Logging is observational too and must not reject a detached observer.
      }
    }

    private emitOpenTelemetry(metric: RecordValidationResolutionMetric): void {
      const attributes: Attributes = {
        'record_validation.mode': metric.mode,
        'record_validation.outcome': metric.outcome,
        'record_validation.status': metric.status,
        'record_validation.record_type': openTelemetryResolvedDimension(metric, metric.recordType),
        'record_validation.form': openTelemetryResolvedDimension(metric, metric.formName),
        'record_validation.operation': openTelemetryOperationDimension(metric),
        'record_validation.write_kind': metric.writeKind,
        'record_validation.phase': metric.phase,
      };
      try {
        recordValidationDuration.record(metric.durationMs, attributes);
        recordValidationRuns.add(1, attributes);
        if (metric.blockingErrorCount > 0) recordValidationBlockingErrors.add(metric.blockingErrorCount, attributes);
        if (metric.advisoryErrorCount > 0) recordValidationAdvisoryErrors.add(metric.advisoryErrorCount, attributes);
        if (metric.timeoutKind !== 'none') {
          recordValidationTimeouts.add(1, { ...attributes, 'record_validation.timeout_kind': metric.timeoutKind });
        }
        if (metric.configurationDiagnosticCount > 0) {
          recordValidationConfigurationDiagnostics.add(metric.configurationDiagnosticCount, attributes);
        }
        for (const diagnostic of metric.diagnosticIdentities) {
          recordValidationDiagnostics.add(1, {
            ...attributes,
            'record_validation.code': openTelemetryDiagnosticCode(diagnostic.code),
            'record_validation.failure_scope': diagnostic.scope,
          });
        }
      } catch {
        this.warnObservabilityFailure('Record validation OpenTelemetry emission failed.');
      }
    }

  }
}

declare global {
  let RecordValidationService: Services.RecordValidation;
}
