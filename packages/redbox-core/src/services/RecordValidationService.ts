import { firstValueFrom } from 'rxjs';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
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
  QuestionTreeComponentName,
  SuggestedValidationSummaryComponentName,
  ValidatorsSupport,
} from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import {
  DEFAULT_RECORD_VALIDATION_SHADOW_REPORT_MAX_SERIES,
  type RecordValidationConfig,
} from '../config/recordValidation.config';
import {
  isRecordSchemaUnknownProperties,
  resolveRecordSchemaUnknownProperties,
  type RecordTypeRecordSchemaConfig,
} from '../config/recordSchema.config';
import type { RecordTypeValidationConfig } from '../config/recordtype.config';
import type { WorkflowStageConfig } from '../config/workflow.config';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { RecordMetaMetadata, RecordWorkflow } from '../model/storage/RecordModel';
import { RecordContractContextResolutionError } from '../record-contract/record-contract-context';
import type {
  RecordContractContext,
  RecordContractContextActor,
  RecordContractContextFailureKind,
  RecordContractContextRequest,
  RecordContractCreateContext,
  RecordContractReusableFormDefinitions,
  RecordContractSourceForm,
  RecordContractUpdateContext,
} from '../record-contract/record-contract-context';
import type { FormAttributes } from '../waterline-models/Form';
import { ConstructFormConfigVisitor } from '../visitor/construct.visitor';
import {
  ValidatorFormConfigVisitor,
  type FormValueTransformation,
  type ValidatorFormConfigResult,
} from '../visitor/validator.visitor';
import type jsonata from 'jsonata';

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

export interface RecordValidationMetricsHooks {
  resolutionCompleted(metric: RecordValidationResolutionMetric): void | Promise<void>;
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

export interface RecordValidationShadowReportRow {
  readonly recordType: string;
  readonly operation: string;
  readonly writeKind: RecordValidationWriteKind;
  readonly phase: 'pre-save' | 'post-save';
  readonly formName: string;
  readonly code: string;
  readonly scope: RecordValidationDiagnosticIdentity['scope'];
  readonly expressionName?: string;
  readonly field?: string;
  readonly pointer?: string;
  readonly validatorClass?: string;
  readonly validatorCode?: string;
  readonly lineage?: string;
  readonly runs: number;
  readonly wouldReject: number;
  readonly blockingErrors: number;
  readonly advisoryErrors: number;
  readonly timeouts: number;
  readonly configurationDiagnostics: number;
  readonly totalDurationMs: number;
  readonly maximumDurationMs: number;
  readonly averageDurationMs: number;
}

/**
 * Bounded process-local view of shadow observations. Durable dashboards should
 * consume the emitted OpenTelemetry instruments instead of polling this view.
 */
export interface RecordValidationShadowReport {
  readonly generatedAt: string;
  readonly totalRuns: number;
  readonly overflowRuns: number;
  readonly maxSeries: number;
  readonly rows: readonly RecordValidationShadowReportRow[];
}

export interface RecordValidationCacheStats {
  readonly formDefinitions: number;
  readonly compiledExpressions: number;
  readonly validatorMappings: number;
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
  readonly recordSchema?: RecordTypeRecordSchemaConfig;
}

interface WorkflowStepLike {
  readonly name?: string;
  readonly starting?: boolean;
  readonly config?: Readonly<Partial<WorkflowStageConfig> & Record<string, unknown>>;
}

export interface RecordValidationServiceDependencies {
  loadRecord(oid: string): Promise<Readonly<Record<string, unknown>> | null>;
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

interface ResolvedAuthoritativeValidationContext {
  readonly status: 'resolved';
  readonly mode: ValidationMode;
  readonly operation?: string;
  readonly normalized: NormalizedRecordValidationRequest;
  readonly brand: string;
  readonly recordTypeName: string;
  readonly recordType: RecordTypeLike;
  readonly selection: ResolvedFormSelection;
  readonly form: CachedFormDefinition;
  readonly constructedForm: FormConfigOutline;
  readonly operationPolicy?: EffectiveValidationOperationPolicy;
}

interface UnresolvedAuthoritativeValidationContext {
  readonly status: 'unresolved';
  readonly mode: ValidationMode;
  readonly contractFailure?: boolean;
}

type AuthoritativeValidationContextResolution =
  ResolvedAuthoritativeValidationContext | UnresolvedAuthoritativeValidationContext;

type RecordContractPrivateResolutionBase = Omit<RecordContractCreateContext['resolution'], 'oid' | 'existingRecord'>;

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
const CACHE_LIMIT = 128;
const FINGERPRINT_MAX_NODES = 50_000;
const FINGERPRINT_MAX_BYTES = 1_048_576;
const SHADOW_REPORT_MAX_SERIES_LIMIT = 10_000;
const SHADOW_REPORT_NONE_CODE = 'none';
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

interface MutableShadowReportRow {
  recordType: string;
  operation: string;
  writeKind: RecordValidationWriteKind;
  phase: 'pre-save' | 'post-save';
  formName: string;
  code: string;
  scope: RecordValidationDiagnosticIdentity['scope'];
  expressionName?: string;
  field?: string;
  pointer?: string;
  validatorClass?: string;
  validatorCode?: string;
  lineage?: string;
  runs: number;
  wouldReject: number;
  blockingErrors: number;
  advisoryErrors: number;
  timeouts: number;
  configurationDiagnostics: number;
  totalDurationMs: number;
  maximumDurationMs: number;
}

interface CachedFormDefinition {
  readonly fingerprint: string;
  readonly form: FormAttributes;
  readonly reusableFormDefinitions: ReusableFormDefinitions;
  constructed?: FormConfigOutline;
  construction?: Promise<FormConfigOutline>;
  candidateSensitive: boolean;
  candidateSensitivityChecked: boolean;
}

interface ValidationDeadline {
  readonly expiresAt: number;
}

type CandidateTransformationOutcome =
  | {
      readonly status: 'applied';
      readonly transformation: FormValueTransformation;
    }
  | {
      readonly status: 'inapplicable';
      readonly kind: string;
      readonly reason: 'malformed' | 'path-missing-or-mismatched' | 'replacement-mismatched';
    };

interface CandidateTransformationApplication {
  readonly candidate: RecordValidationCandidate;
  readonly outcomes: readonly CandidateTransformationOutcome[];
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

interface BoundedFingerprint {
  readonly value: string;
  readonly cacheable: boolean;
}

/** Hash configuration without invoking accessors or retaining the serialized value. */
function boundedFingerprint(value: unknown): BoundedFingerprint {
  const hash = createHash('sha256');
  const seen = new WeakSet<object>();
  let nodes = 0;
  let bytes = 0;
  let cacheable = true;
  const append = (part: string): void => {
    if (!cacheable) return;
    const size = Buffer.byteLength(part);
    if (bytes + size > FINGERPRINT_MAX_BYTES) {
      cacheable = false;
      return;
    }
    bytes += size;
    hash.update(part);
  };
  const walk = (item: unknown): void => {
    nodes += 1;
    if (nodes > FINGERPRINT_MAX_NODES) {
      cacheable = false;
      return;
    }
    if (item === null || typeof item === 'boolean' || typeof item === 'string') {
      append(JSON.stringify(item));
      return;
    }
    if (typeof item === 'number') {
      append(Number.isFinite(item) ? JSON.stringify(item) : JSON.stringify(String(item)));
      return;
    }
    if (typeof item === 'undefined') {
      append('"[undefined]"');
      return;
    }
    if (typeof item === 'function') {
      append(JSON.stringify(`[function:${Function.prototype.toString.call(item)}]`));
      return;
    }
    if (typeof item !== 'object') {
      append(JSON.stringify(String(item)));
      return;
    }
    if (seen.has(item)) {
      append('"[circular]"');
      return;
    }
    seen.add(item);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(item);
      if (Array.isArray(item)) {
        append('[');
        for (let index = 0; index < item.length && cacheable; index += 1) {
          if (index > 0) append(',');
          const descriptor = descriptors[String(index)];
          if (descriptor && 'value' in descriptor) walk(descriptor.value);
          else append('"[accessor-or-hole]"');
        }
        append(']');
        return;
      }
      append('{');
      let first = true;
      for (const key of Object.keys(descriptors).sort(compareRecordValidationIdentifiers)) {
        const descriptor = descriptors[key];
        if (!descriptor.enumerable) continue;
        if (!first) append(',');
        first = false;
        append(JSON.stringify(key));
        append(':');
        if ('value' in descriptor) walk(descriptor.value);
        else append('"[accessor]"');
        if (!cacheable) break;
      }
      append('}');
    } finally {
      seen.delete(item);
    }
  };
  walk(value);
  return { value: cacheable ? hash.digest('hex') : 'uncacheable', cacheable };
}

function setBounded<K, V>(cache: Map<K, V>, key: K, value: V): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as K);
}

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

/**
 * Keep this guard in sync with components whose construction reads candidate
 * data. Reusable definitions must be expanded before the answer is final.
 */
function hasCandidateSensitiveComponent(form: FormConfigOutline): boolean {
  return schemaOwnedFormNodes(form).some(node =>
    isRecord(node.value.component) && node.value.component.class === QuestionTreeComponentName
  );
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

const BROWSER_ONLY_JSONATA_ROOTS = new Set(['event', 'value', 'querySource']);

/** Inspect JSONata syntax so predicate fields and bound lambda variables are not false positives. */
function referencesBrowserOnlyJSONataContext(source: string): boolean {
  const ast = jsonataCompile(source).ast() as unknown;
  const walk = (node: unknown, bound: ReadonlySet<string>, rootScope: boolean): boolean => {
    if (Array.isArray(node)) return node.some(item => walk(item, bound, rootScope));
    if (!isRecord(node)) return false;
    const type = node.type;
    if (type === 'variable') {
      return typeof node.value === 'string' && BROWSER_ONLY_JSONATA_ROOTS.has(node.value) && !bound.has(node.value);
    }
    if (type === 'lambda') {
      const nextBound = new Set(bound);
      if (Array.isArray(node.arguments)) {
        for (const argument of node.arguments) {
          if (isRecord(argument) && typeof argument.value === 'string') nextBound.add(argument.value);
        }
      }
      return walk(node.body, nextBound, true);
    }
    if (type === 'path') {
      const steps = Array.isArray(node.steps) ? node.steps : [];
      const first = steps[0];
      if (
        rootScope &&
        isRecord(first) &&
        first.type === 'name' &&
        typeof first.value === 'string' &&
        BROWSER_ONLY_JSONATA_ROOTS.has(first.value)
      ) return true;
      for (const step of steps) {
        if (!isRecord(step)) continue;
        if (Array.isArray(step.stages)) {
          for (const stage of step.stages) {
            if (isRecord(stage) && walk(stage.expr, bound, false)) return true;
          }
        }
        // Sort, block, and other computed path steps contain independent
        // expression roots that the path fast-path must not skip.
        if (step.type !== 'name' && walk(step, bound, true)) return true;
      }
      // JSONata attaches object-group expressions beside `steps`.
      if (walk(node.group, bound, true)) return true;
      // Do not assume `group` is the only expression-bearing sibling a
      // JSONata version can attach to a path node. Traverse any additional
      // semantic property while excluding path bookkeeping already handled.
      for (const [key, child] of Object.entries(node)) {
        if (
          ['type', 'value', 'position', 'steps', 'group', 'keepSingletonArray', 'tuple', 'seekingParent', 'ancestor']
            .includes(key)
        ) continue;
        if (walk(child, bound, true)) return true;
      }
      return false;
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'value' || key === 'position' || key === 'type' || key === 'arguments' && type === 'lambda') continue;
      if (Array.isArray(child)) {
        if (child.some(item => walk(item, bound, rootScope))) return true;
      } else if (walk(child, bound, rootScope)) return true;
    }
    return false;
  };
  return walk(ast, new Set(), true);
}

export namespace Services {
  /**
   * Resolves and executes authoritative record validation while exposing only
   * bounded, value-free observability data.
   *
   * @extensionPoint Hooks may replace the service implementation or register a metrics hook; replacements must preserve authoritative form, operation, group, privacy, timeout, and shadow/enforce semantics.
   * @remarks Metrics hooks are observational only. They cannot alter a validation result, and hook failures are isolated from the save boundary.
   * @see https://github.com/redbox-mint/redbox-portal/wiki/Server-Side-Form-Validation-Operations
   */
  export class RecordValidation extends services.Core.Service {
    protected override _exportedMethods = [
      'resolve',
      'resolveContractContext',
      'discoverOperations',
      'registerMetricsHooks',
      'getShadowReport',
      'clearCaches',
      'getCacheStats',
    ];
    private readonly metricsHooks = new Set<RecordValidationMetricsHooks>();
    private readonly shadowReportRows = new Map<string, MutableShadowReportRow>();
    private shadowReportTotalRuns = 0;
    private shadowReportOverflowRuns = 0;
    private readonly formDefinitionCache = new Map<string, CachedFormDefinition>();
    private readonly formLoadGenerations = new Map<string, number>();
    private nextFormLoadGeneration = 0;
    private readonly expressionCache = new Map<string, jsonata.Expression>();
    private readonly validatorMappingCache = new Map<string, ReadonlyMap<string, FormValidatorDefinition>>();
    private resolvedDependencies?: RecordValidationServiceDependencies;

    public constructor(
      private readonly dependencyOverrides?: Partial<RecordValidationServiceDependencies>,
      metricsHooks?: RecordValidationMetricsHooks
    ) {
      super();
      if (metricsHooks) this.metricsHooks.add(metricsHooks);
    }

    /**
     * Add an observability hook without changing validation decisions.
     *
     * @param hooks Observer invoked once after each resolution.
     * @returns A handle that unregisters only this observer.
     */
    public registerMetricsHooks(hooks: RecordValidationMetricsHooks): () => void {
      this.metricsHooks.add(hooks);
      return () => this.metricsHooks.delete(hooks);
    }

    /**
     * Read the process-local shadow aggregate used during rollout review.
     *
     * @returns A safe snapshot bounded by `shadowReportMaxSeries`.
     */
    public getShadowReport(): RecordValidationShadowReport {
      const rows = [...this.shadowReportRows.values()]
        .sort((left, right) =>
          compareRecordValidationIdentifiers(
            `${left.recordType}\u0000${left.writeKind}\u0000${left.phase}\u0000${left.operation}\u0000${left.formName}\u0000${left.code}\u0000${left.scope}\u0000${left.validatorClass ?? ''}\u0000${left.validatorCode ?? ''}\u0000${left.expressionName ?? ''}\u0000${left.pointer ?? ''}\u0000${left.lineage ?? ''}`,
            `${right.recordType}\u0000${right.writeKind}\u0000${right.phase}\u0000${right.operation}\u0000${right.formName}\u0000${right.code}\u0000${right.scope}\u0000${right.validatorClass ?? ''}\u0000${right.validatorCode ?? ''}\u0000${right.expressionName ?? ''}\u0000${right.pointer ?? ''}\u0000${right.lineage ?? ''}`
          )
        )
        .map(row => ({
          ...row,
          averageDurationMs: row.runs === 0 ? 0 : row.totalDurationMs / row.runs,
        }));
      return {
        generatedAt: new Date().toISOString(),
        totalRuns: this.shadowReportTotalRuns,
        overflowRuns: this.shadowReportOverflowRuns,
        maxSeries: this.shadowReportMaxSeries(),
        rows,
      };
    }

    /** Explicit invalidation surface for form/config reloads and isolated tests. */
    public clearCaches(): void {
      this.formDefinitionCache.clear();
      this.formLoadGenerations.clear();
      this.expressionCache.clear();
      this.validatorMappingCache.clear();
    }

    /**
     * Read aggregate cache diagnostics without exposing cache keys.
     *
     * @returns Counts for each bounded service cache.
     */
    public getCacheStats(): RecordValidationCacheStats {
      return {
        formDefinitions: this.formDefinitionCache.size,
        compiledExpressions: this.expressionCache.size,
        validatorMappings: this.validatorMappingCache.size,
      };
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
     * Resolve the authoritative validation context without executing validators.
     *
     * This is the shared selection boundary for form-facing and schema-facing
     * consumers. Private record, actor, and source-form data remains separated
     * from the allowlisted public schema context by the Phase5A1 result types.
     *
     * @param request Authoritative create or update context request.
     * @returns The selected public context and private construction inputs.
     */
    public async resolveContractContext(request: RecordContractContextRequest): Promise<RecordContractContext> {
      try {
        return await this.resolveContractContextOrThrow(request);
      } catch (error) {
        if (error instanceof RecordContractContextResolutionError) {
          throw error;
        }
        throw this.contractContextError('unavailable');
      }
    }

    private async resolveContractContextOrThrow(request: RecordContractContextRequest): Promise<RecordContractContext> {
      const brand = this.contractReference(request.brand, 'brand');
      const portal = this.contractReference(request.portal, 'portal');
      if (typeof request.actor.authenticated !== 'boolean') {
        throw this.contractContextError('invalid-request');
      }
      const actor: RecordContractContextActor = Object.freeze({
        authenticated: request.actor.authenticated,
        roles: Object.freeze(normalizeRoles(request.actor.roles)),
      });

      let candidate: RecordValidationCandidate;
      let resolvedOid: string | undefined;
      let existingRecord: Readonly<Record<string, unknown>> | undefined;
      if (request.kind === 'create') {
        candidate = {
          metadata: {},
          metaMetadata: { brandId: brand, type: request.recordType },
        };
      } else {
        resolvedOid = this.contractReference(request.oid, 'oid');
        const loadedRecord = await this.dependencies().loadRecord(resolvedOid);
        if (!loadedRecord) throw this.contractContextError('not-found');
        existingRecord = _.cloneDeep(loadedRecord);
        candidate = this.recordContractCandidate(resolvedOid, existingRecord);
      }

      const validationRequest: RecordValidationRequest = {
        candidate,
        writeKind: request.kind,
        validationOperation: request.operation,
        evaluateFormValidators: false,
        ...(request.kind === 'create' && request.targetStep !== undefined ? { targetStep: request.targetStep } : {}),
        actor,
      };
      const diagnostics: RecordValidationDiagnostic[] = [];
      const progress: ResolutionProgress = { mode: 'shadow' };
      const authoritative = await this.resolveAuthoritativeContext(validationRequest, diagnostics, progress, false);
      if (authoritative.status !== 'resolved') {
        throw this.contractContextError(this.contractContextFailureKind(diagnostics), diagnostics);
      }
      if (authoritative.brand !== brand) {
        throw this.contractContextError('not-resolvable');
      }
      const workflowStep = authoritative.selection.workflowStep;
      if (!workflowStep) throw this.contractContextError('not-resolvable');

      const configuredUnknownProperties = sails.config.recordSchema?.unknownProperties;
      if (!isRecordSchemaUnknownProperties(configuredUnknownProperties)) {
        throw this.contractContextError('unavailable');
      }
      const unknownProperties = resolveRecordSchemaUnknownProperties(
        configuredUnknownProperties,
        authoritative.recordType.recordSchema
      );
      const privateResolution = this.recordContractPrivateResolution(authoritative, actor);
      const publicFields = {
        brand,
        portal,
        recordType: authoritative.recordTypeName,
        workflowStep,
        form: authoritative.selection.formName,
        operation: authoritative.operation ?? STRICT_ALL_OPERATION,
        unknownProperties,
        enforcement: authoritative.mode,
      } as const;

      if (request.kind === 'create') {
        const context: RecordContractCreateContext = Object.freeze({
          publicContext: Object.freeze({ ...publicFields, kind: 'create' }),
          resolution: Object.freeze(privateResolution),
        });
        return context;
      }
      if (!existingRecord || !resolvedOid) {
        throw new Error('The authoritative record-contract update record is unavailable.');
      }
      const context: RecordContractUpdateContext = Object.freeze({
        publicContext: Object.freeze({ ...publicFields, kind: 'update' }),
        resolution: Object.freeze({
          ...privateResolution,
          oid: resolvedOid,
          existingRecord,
        }),
      });
      return context;
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
          const form = await this.loadCachedForm(formName, brand);
          if (form?.form.configuration) {
            constructed = await this.constructCachedForm(form, request.candidate.metadata);
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

    private async resolveAuthoritativeContext(
      request: RecordValidationRequest,
      diagnostics: RecordValidationDiagnostic[],
      progress: ResolutionProgress,
      validateCandidateFormReference: boolean
    ): Promise<AuthoritativeValidationContextResolution> {
      const globalConfig = sails.config.recordValidation;
      const normalized = this.normalizeRequest(request, diagnostics);
      const initialModeResolution = resolveValidationMode(globalConfig, undefined, normalized?.operation);
      this.addMalformedModeDiagnostics(initialModeResolution.malformedModeCount, diagnostics);
      let mode = initialModeResolution.mode;
      progress.mode = mode;
      if (!normalized) return { status: 'unresolved', mode, contractFailure: true };

      const operation = normalized.operation;
      progress.operation = operation;
      const brand = this.requiredReference(request.candidate.metaMetadata.brandId, 'brand', diagnostics);
      const recordTypeName = this.requiredReference(request.candidate.metaMetadata.type, 'recordType', diagnostics);
      progress.recordType = recordTypeName;
      if (!brand || !recordTypeName) return { status: 'unresolved', mode };

      // Resolve configured rollout before the model lookup so an enforce-only
      // record type cannot fail open when its runtime model is unavailable.
      const configuredRecordType = sails.config.recordtype?.[recordTypeName];
      const configuredModeResolution = resolveValidationMode(
        globalConfig,
        configuredRecordType?.recordValidation,
        operation
      );
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
        return { status: 'unresolved', mode };
      }

      const effectiveModeResolution = resolveValidationMode(globalConfig, recordType.recordValidation, operation);
      this.addMalformedModeDiagnostics(
        Math.max(0, effectiveModeResolution.malformedModeCount - configuredModeResolution.malformedModeCount),
        diagnostics
      );
      mode = effectiveModeResolution.mode;
      progress.mode = mode;

      const selection = await this.resolveFormSelection(normalized, recordType, diagnostics, dependencies);
      if (!selection) return { status: 'unresolved', mode };
      progress.formName = selection.formName;

      if (validateCandidateFormReference && (request.writeKind === 'create' || request.writeKind === 'transition')) {
        const candidateForm = request.candidate.metaMetadata.form;
        const normalizedCandidateForm = typeof candidateForm === 'string' ? candidateForm.trim() : '';
        if (
          !RECORD_VALIDATION_REFERENCE_PATTERN.test(normalizedCandidateForm) ||
          normalizedCandidateForm !== selection.formName
        ) {
          diagnostics.push(
            createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceDivergence,
            'The final candidate form diverges from the authoritative workflow form.',
            { formName: selection.formName }
            )
          );
        }
      }

      const form = await this.loadCachedForm(selection.formName, brand);
      if (!form) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.formNotFound,
            'The exact configured form could not be resolved.',
            { formName: selection.formName }
          )
        );
        return { status: 'unresolved', mode };
      }
      if (!form.form.configuration) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.formConfigurationMissing,
            'The exact configured form has no configuration.',
            { formName: selection.formName }
          )
        );
        return { status: 'unresolved', mode };
      }

      let constructedForm: FormConfigOutline;
      try {
        constructedForm = await this.constructCachedForm(form, request.candidate.metadata);
      } catch {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.formConfigurationMalformed,
            'The exact configured form could not be constructed.',
            { formName: selection.formName }
          )
        );
        return { status: 'unresolved', mode };
      }

      const operationPolicy = this.resolveOperationPolicy(
        operation,
        constructedForm.validationOperations,
        recordType.recordValidation?.operations,
        this.workflowOperationOverrides(selection.workflowConfig),
        diagnostics
      );
      if (operation && !operationPolicy) return { status: 'unresolved', mode, contractFailure: true };
      if (operationPolicy && !this.authorizeOperation(operationPolicy, normalized, diagnostics)) {
        return { status: 'unresolved', mode, contractFailure: true };
      }

      return {
        status: 'resolved',
        mode,
          operation,
        normalized,
        brand,
        recordTypeName,
        recordType,
        selection,
        form,
        constructedForm,
        operationPolicy,
      };
      }

    private async resolveRequest(
      request: RecordValidationRequest,
      diagnostics: RecordValidationDiagnostic[],
      progress: ResolutionProgress
    ): Promise<RecordValidationResult> {
      const authoritative = await this.resolveAuthoritativeContext(request, diagnostics, progress, true);
      if (authoritative.status !== 'resolved') {
        return this.buildResult(authoritative.mode, diagnostics, {
          outcome: 'unresolved',
          operation: progress.operation,
          recordType: progress.recordType,
          formName: progress.formName,
          contractFailure: authoritative.contractFailure,
        });
      }
      const {
        mode,
        operation,
        normalized,
        brand,
        recordTypeName,
        selection,
        form,
        constructedForm,
        operationPolicy: policy,
      } = authoritative;
      const globalConfig = sails.config.recordValidation;

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
          const transformationOutcomes = [...transformationApplication.outcomes];
          persistenceCandidate = transformedCandidate;
          if (transformationApplication.outcomes.some(outcome => outcome.status === 'inapplicable')) {
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
          const validationForm = transformationApplication.outcomes.some(outcome => outcome.status === 'applied')
            ? await this.constructCachedForm(form, transformedCandidate.metadata)
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
          transformationOutcomes.push(...validatorTransformationApplication.outcomes);
          if (validatorTransformationApplication.outcomes.some(outcome => outcome.status === 'inapplicable')) {
            transformationContractFailed = true;
            return undefined;
          }
          this.checkDeadline(deadline);
          const mappedIssues = this.mapValidatorSummaries(validation.summaries);
          const transformationAdvisories = this.mapTransformationAdvisories(transformationOutcomes);
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
          if (advisoryTransformationApplication.outcomes.some(outcome => outcome.status === 'inapplicable')) {
            transformationContractFailed = true;
            return undefined;
          }
          advisoryErrors = [
            ...advisoryErrors,
            ...this.mapTransformationAdvisories(advisoryTransformationApplication.outcomes),
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

    private contractReference(value: string, _kind: 'brand' | 'portal' | 'oid'): string {
      const normalized = typeof value === 'string' ? value.trim() : '';
      if (!RECORD_VALIDATION_REFERENCE_PATTERN.test(normalized)) {
        throw this.contractContextError('invalid-request');
      }
      return normalized;
    }

    private contractContextFailureKind(
      diagnostics: readonly RecordValidationDiagnostic[]
    ): RecordContractContextFailureKind {
      const codes = new Set(diagnostics.map(diagnostic => diagnostic.code));
      if (
        codes.has(RECORD_VALIDATION_DIAGNOSTIC_CODES.operationRoleUnauthorized) ||
        codes.has(RECORD_VALIDATION_DIAGNOSTIC_CODES.operationTargetUnauthorized)
      ) {
        return 'forbidden';
      }
      if (codes.has(RECORD_VALIDATION_DIAGNOSTIC_CODES.recordTypeNotFound)) {
        return 'not-found';
      }
      if (
        codes.has(RECORD_VALIDATION_DIAGNOSTIC_CODES.brandReferenceMissing) ||
        codes.has(RECORD_VALIDATION_DIAGNOSTIC_CODES.brandReferenceMalformed) ||
        codes.has(RECORD_VALIDATION_DIAGNOSTIC_CODES.recordTypeReferenceMissing) ||
        codes.has(RECORD_VALIDATION_DIAGNOSTIC_CODES.recordTypeReferenceMalformed) ||
        codes.has(RECORD_VALIDATION_DIAGNOSTIC_CODES.operationMalformed) ||
        codes.has(RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed)
      ) {
        return 'invalid-request';
      }
      return 'not-resolvable';
    }

    private contractContextError(
      failureKind: RecordContractContextFailureKind,
      diagnostics: readonly RecordValidationDiagnostic[] = []
    ): RecordContractContextResolutionError {
      return new RecordContractContextResolutionError(
        failureKind,
        diagnostics.map(diagnostic => diagnostic.code)
      );
    }

    private recordContractCandidate(
      oid: string,
      existingRecord: Readonly<Record<string, unknown>>
    ): RecordValidationCandidate {
      const storedOid = stringProperty(existingRecord, 'redboxOid');
      if (storedOid && storedOid !== oid) {
        throw new Error('The loaded record OID does not match the record-contract request.');
      }
      const metadata = existingRecord.metadata;
      const rawMetaMetadata = existingRecord.metaMetadata;
      if (!isRecord(metadata) || !isRecord(rawMetaMetadata)) {
        throw new Error('The record-contract update record is malformed.');
      }
      const metaMetadata: Partial<RecordMetaMetadata> & Record<string, unknown> = {};
      for (const field of ['brandId', 'type', 'form'] as const) {
        const value = stringProperty(rawMetaMetadata, field);
        if (value) metaMetadata[field] = value;
      }

      const rawWorkflow = existingRecord.workflow;
      const workflow: Partial<RecordWorkflow> = {};
      if (isRecord(rawWorkflow)) {
        const stage = stringProperty(rawWorkflow, 'stage');
        const stageLabel = stringProperty(rawWorkflow, 'stageLabel');
        if (stage) workflow.stage = stage;
        if (stageLabel) workflow.stageLabel = stageLabel;
      }
      return {
        redboxOid: storedOid ?? oid,
        metadata: _.cloneDeep(metadata),
        metaMetadata,
        ...(Object.keys(workflow).length > 0 ? { workflow } : {}),
      };
    }

    private recordContractPrivateResolution(
      authoritative: ResolvedAuthoritativeValidationContext,
      actor: RecordContractContextActor
    ): RecordContractPrivateResolutionBase {
      const configuration = authoritative.form.form.configuration;
      if (!configuration) throw this.contractContextError('not-resolvable');
      const sourceFormSnapshot = _.cloneDeep(configuration);
      const sourceForm: RecordContractSourceForm = Object.freeze({
        ...sourceFormSnapshot,
        componentDefinitions: Object.freeze([...(sourceFormSnapshot.componentDefinitions ?? [])]),
      });
      const reusableFormDefinitions: RecordContractReusableFormDefinitions = Object.freeze(
        _.cloneDeep(authoritative.form.reusableFormDefinitions)
      );
      return {
        sourceFormFingerprint: authoritative.form.fingerprint,
        sourceForm,
        reusableFormDefinitions,
        actor,
        formMode: 'edit',
        contextVariables: Object.freeze({}),
      };
    }

    private dependencies(): RecordValidationServiceDependencies {
      if (this.resolvedDependencies) return this.resolvedDependencies;
      const defaults: RecordValidationServiceDependencies = {
        loadRecord: oid => RecordsService.getMeta(oid),
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
      const seen = new WeakSet<object>();
      let nodes = 0;
      let omitted = false;
      let failed = false;
      const project = (candidate: unknown, depth: number): RecordValidationJSONValue | undefined => {
        nodes += 1;
        if (nodes > 20_000 || depth > 64) {
          failed = true;
          return undefined;
        }
        if (candidate === null || typeof candidate === 'boolean' || typeof candidate === 'string') return candidate;
        if (typeof candidate === 'number') {
          return Number.isFinite(candidate) ? candidate : null;
        }
        if (typeof candidate !== 'object') {
          omitted = true;
          return undefined;
        }
        if (candidate instanceof Date) {
          if (!Number.isFinite(candidate.getTime())) {
            omitted = true;
            return undefined;
          }
          return candidate.toISOString();
        }
        if (seen.has(candidate)) {
          failed = true;
          return undefined;
        }
        seen.add(candidate);
        try {
          let descriptors: PropertyDescriptorMap;
          try {
            descriptors = Object.getOwnPropertyDescriptors(candidate);
          } catch {
            failed = true;
            return undefined;
          }
          if (Array.isArray(candidate)) {
            const result: RecordValidationJSONValue[] = [];
            for (let index = 0; index < Math.min(candidate.length, 10_000); index += 1) {
              const descriptor = descriptors[index.toString()];
              if (!descriptor || !('value' in descriptor)) {
                result.push(null);
                continue;
              }
              result.push(project(descriptor.value, depth + 1) ?? null);
            }
            if (candidate.length > 10_000) failed = true;
            return result;
          }
          const result: Record<string, RecordValidationJSONValue> = Object.create(null) as Record<
            string,
            RecordValidationJSONValue
          >;
          let accepted = 0;
          for (const [key, descriptor] of Object.entries(descriptors)) {
            if (!descriptor.enumerable) continue;
            if (accepted >= 2_000 || key === '__proto__' || key === 'prototype' || key === 'constructor') {
              if (accepted >= 2_000) failed = true;
              else omitted = true;
              continue;
            }
            if (!('value' in descriptor)) {
              omitted = true;
              continue;
            }
            const projected = project(descriptor.value, depth + 1);
            if (projected !== undefined) {
              result[key] = projected;
              accepted += 1;
            }
          }
          return result;
        } finally {
          seen.delete(candidate);
        }
      };
      const projected = project(value, 0);
      if (omitted) {
        diagnostics.push(createDiagnostic(
          RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionContextUnsupported,
          `The ${label} validation-expression context omitted values that have no JSON representation.`,
          { severity: 'warning' }
        ));
      }
      if (failed || !isRecord(projected)) {
        diagnostics.push(createDiagnostic(
          RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionContextUnsupported,
          `The ${label} validation-expression context could not be projected safely.`
        ));
        return undefined;
      }
      return projected as Record<string, RecordValidationJSONValue>;
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
          this.checkDeadline(deadline);
          const browserOnlyCondition = referencesBrowserOnlyJSONataContext(config.condition);
          this.checkDeadline(deadline);
          if (browserOnlyCondition) {
            diagnostics.push(
              createDiagnostic(
                RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported,
                'A blocking validation-group expression requires browser-only context.',
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
        this.checkDeadline(deadline);
        const browserOnlyTemplate = referencesBrowserOnlyJSONataContext(config.template);
        this.checkDeadline(deadline);
        if (browserOnlyTemplate) {
          diagnostics.push(
            createDiagnostic(
              RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported,
              'A blocking validation-group expression requires browser-only context.',
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

    private async loadCachedForm(formName: string, brand: string): Promise<CachedFormDefinition | null> {
      const key = `${brand}\u0000${formName}`;
      const generation = ++this.nextFormLoadGeneration;
      setBounded(this.formLoadGenerations, key, generation);
      const form = await this.dependencies().loadForm(formName, brand);
      if (!form) {
        if (this.formLoadGenerations.get(key) === generation) this.formDefinitionCache.delete(key);
        return null;
      }
      const formSnapshot = _.cloneDeep(form);
      const reusableFormDefinitions = _.cloneDeep(sails.config.reusableFormDefinitions ?? {}) as ReusableFormDefinitions;
      const candidateSensitive = formSnapshot.configuration
        ? hasCandidateSensitiveComponent(formSnapshot.configuration as unknown as FormConfigOutline)
        : false;
      const reusableFingerprint = boundedFingerprint(reusableFormDefinitions);
      const formFingerprint = boundedFingerprint({
        id: formSnapshot.id,
        name: formSnapshot.name,
        branding: formSnapshot.branding,
        reusableDefinitions: reusableFingerprint.value,
        configuration: formSnapshot.configuration,
      });
      const cacheable = reusableFingerprint.cacheable && formFingerprint.cacheable;
      const cached = cacheable ? this.formDefinitionCache.get(key) : undefined;
      if (cached?.fingerprint === formFingerprint.value) {
        this.formDefinitionCache.delete(key);
        this.formDefinitionCache.set(key, cached);
        return cached;
      }
      const entry: CachedFormDefinition = {
        fingerprint: formFingerprint.value,
        form: formSnapshot,
        reusableFormDefinitions,
        candidateSensitive,
        candidateSensitivityChecked: candidateSensitive,
      };
      // An older in-flight load may still serve its own exact snapshot, but
      // it cannot replace a newer version installed for this brand/form key.
      if (cacheable && this.formLoadGenerations.get(key) === generation) {
        this.formDefinitionCache.delete(key);
        setBounded(this.formDefinitionCache, key, entry);
      }
      return entry;
    }

    private async constructCachedForm(
      entry: CachedFormDefinition,
      metadata: Readonly<Record<string, unknown>>
    ): Promise<FormConfigOutline> {
      if (!entry.form.configuration) throw new Error('Form configuration is unavailable.');
      const construct = async (candidate: Readonly<Record<string, unknown>>): Promise<FormConfigOutline> =>
        await this.dependencies().constructForm(
          _.cloneDeep(entry.form.configuration as FormConfigFrame),
          candidate,
          _.cloneDeep(entry.reusableFormDefinitions)
        );
      if (entry.candidateSensitive) {
        return await construct(metadata);
      }
      if (!entry.candidateSensitivityChecked) {
        entry.construction ??= construct({});
        let expanded: FormConfigOutline;
        try {
          expanded = await entry.construction;
        } catch (error) {
          entry.construction = undefined;
          throw error;
        }
        if (hasCandidateSensitiveComponent(expanded)) {
          entry.candidateSensitive = true;
          entry.candidateSensitivityChecked = true;
          entry.constructed = undefined;
          entry.construction = undefined;
          return await construct(metadata);
        }
        entry.constructed = expanded;
        entry.candidateSensitivityChecked = true;
        entry.construction = undefined;
      }
      if (!entry.constructed) {
        entry.constructed = await construct({});
      }
      const constructed = _.cloneDeep(entry.constructed);
      this.hydrateConstructedForm(constructed, metadata);
      return constructed;
    }

    /** Apply candidate values to a cached constructed schema without traversing arbitrary data branches. */
    private hydrateConstructedForm(
      form: FormConfigOutline,
      metadata: Readonly<Record<string, unknown>>
    ): void {
      const hydrate = (definition: unknown, parentValue: unknown): void => {
        if (!isRecord(definition)) return;
        const component = isRecord(definition.component) ? definition.component : undefined;
        const className = component?.class;
        const model = isRecord(definition.model) ? definition.model : undefined;
        const name = typeof definition.name === 'string' ? definition.name : '';
        const consumesNamedValue = Boolean(name) && (model !== undefined || className === 'GroupComponent');
        const value = consumesNamedValue && isRecord(parentValue) ? parentValue[name] : parentValue;
        if (model) {
          const modelConfig = isRecord(model.config) ? model.config : {};
          model.config = modelConfig;
          modelConfig.value = value;
        }
        const config = component && isRecord(component.config) ? component.config : undefined;
        if (!config) return;
        // Row values are applied by ValidatorFormConfigVisitor when it expands
        // each repeatable elementTemplate with an indexed lineage.
        if (className === 'RepeatableComponent') return;
        for (const key of ['componentDefinitions', 'tabs', 'panels'] as const) {
          const children = config[key];
          if (Array.isArray(children)) children.forEach(child => hydrate(child, value));
        }
      };
      (form.componentDefinitions ?? []).forEach(definition => hydrate(definition, metadata));
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
      const definitionsFingerprint = boundedFingerprint(definitions ?? []);
      const cached = definitionsFingerprint.cacheable
        ? this.validatorMappingCache.get(definitionsFingerprint.value)
        : undefined;
      if (cached && definitionsFingerprint.cacheable) {
        this.validatorMappingCache.delete(definitionsFingerprint.value);
        this.validatorMappingCache.set(definitionsFingerprint.value, cached);
        return cached;
      }
      try {
        const mapping = new ValidatorsSupport().createValidatorDefinitionMapping(definitions ?? []);
        if (definitionsFingerprint.cacheable) {
          setBounded(this.validatorMappingCache, definitionsFingerprint.value, mapping);
        }
        return mapping;
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
      const outcomes: CandidateTransformationOutcome[] = [];
      for (const candidateTransformation of transformations) {
        if (!isFormValueTransformation(candidateTransformation)) {
          outcomes.push({
            status: 'inapplicable',
            kind: isRecord(candidateTransformation) && typeof candidateTransformation.kind === 'string'
              ? candidateTransformation.kind
              : 'malformed',
            reason: 'malformed',
          });
          diagnostics.push(createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.transformationInapplicable,
            'A malformed schema-owned candidate transformation could not be safely applied.'
          ));
          continue;
        }
        switch (candidateTransformation.kind) {
          case 'rich-html-sanitized':
            if (!this.isCanonicalRichHtmlTransformation(candidateTransformation)) {
              outcomes.push({
                status: 'inapplicable',
                kind: candidateTransformation.kind,
                reason: 'replacement-mismatched',
              });
              diagnostics.push(createDiagnostic(
                RECORD_VALIDATION_DIAGNOSTIC_CODES.transformationInapplicable,
                'A schema-owned candidate transformation did not contain the canonical sanitized value.'
              ));
              break;
            }
            if (this.replaceCandidateMetadataValue(
              metadata,
              candidateTransformation.dataModelPath,
              candidateTransformation.sourceValue,
              candidateTransformation.value
            )) {
              outcomes.push({ status: 'applied', transformation: candidateTransformation });
            } else {
              outcomes.push({
                status: 'inapplicable',
                kind: candidateTransformation.kind,
                reason: 'path-missing-or-mismatched',
              });
              diagnostics.push(createDiagnostic(
                RECORD_VALIDATION_DIAGNOSTIC_CODES.transformationInapplicable,
                'A schema-owned candidate transformation no longer matched the submitted form data.'
              ));
            }
            break;
        }
      }
      return { candidate: transformedCandidate, outcomes };
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
      if (path.length === 0) return false;
      let current: unknown = metadata;
      for (let index = 0; index < path.length - 1; index += 1) {
        const segment = path[index];
        if (typeof segment === 'string' && ['__proto__', 'prototype', 'constructor'].includes(segment)) return false;
        if (Array.isArray(current)) {
          if (typeof segment !== 'number' || !Number.isInteger(segment) || segment < 0 || segment >= current.length) {
            return false;
          }
          current = current[segment];
        } else if (isRecord(current) && typeof segment === 'string' && Object.hasOwn(current, segment)) {
          current = current[segment];
        } else {
          return false;
        }
      }
      const finalSegment = path[path.length - 1];
      if (typeof finalSegment === 'string' && ['__proto__', 'prototype', 'constructor'].includes(finalSegment)) {
        return false;
      }
      if (Array.isArray(current)) {
        if (
          typeof finalSegment !== 'number' ||
          !Number.isInteger(finalSegment) ||
          finalSegment < 0 ||
          finalSegment >= current.length
        ) {
          return false;
        }
        if (typeof current[finalSegment] !== 'string' || current[finalSegment] !== sourceValue) return false;
        current[finalSegment] = value;
        return true;
      }
      if (isRecord(current) && typeof finalSegment === 'string' && Object.hasOwn(current, finalSegment)) {
        if (typeof current[finalSegment] !== 'string' || current[finalSegment] !== sourceValue) return false;
        current[finalSegment] = value;
        return true;
      }
      return false;
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

    private compiledExpression(expression: string): jsonata.Expression {
      const cached = this.expressionCache.get(expression);
      if (cached) {
        this.expressionCache.delete(expression);
        this.expressionCache.set(expression, cached);
        return cached;
      }
      const compiled = jsonataCompile(expression);
      setBounded(this.expressionCache, expression, compiled);
      return compiled;
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
      outcomes: readonly CandidateTransformationOutcome[]
    ): RecordSaveIssue[] {
      const advisories: RecordSaveIssue[] = [];
      for (const outcome of outcomes) {
        if (outcome.status !== 'applied') continue;
        switch (outcome.transformation.kind) {
          case 'rich-html-sanitized':
            advisories.push(
              ...this.mapValidatorSummaries([outcome.transformation.advisorySummary]).blocking
            );
            break;
        }
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
      this.recordShadowReport(metric);
      for (const hooks of this.metricsHooks) {
        try {
          const observation = hooks.resolutionCompleted(metric);
          if (observation && typeof observation.then === 'function') {
            void observation.catch(() => this.warnObservabilityFailure('Record validation metrics hook failed.'));
          }
        } catch {
          this.warnObservabilityFailure('Record validation metrics hook failed.');
        }
      }
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

    private recordShadowReport(metric: RecordValidationResolutionMetric): void {
      if (metric.mode !== 'shadow') return;
      this.shadowReportTotalRuns += 1;
      const recordType = metric.recordType ?? UNRESOLVED_DIMENSION;
      const operation = metric.operation ?? STRICT_ALL_OPERATION;
      const formName = metric.formName ?? UNRESOLVED_DIMENSION;
      const identities = metric.diagnosticIdentities.length > 0
        ? metric.diagnosticIdentities
        : [{ code: SHADOW_REPORT_NONE_CODE, scope: 'diagnostic' as const }];
      const uniqueIdentities = [...new Map(identities.map(identity => [
        `${identity.code}\u0000${identity.scope}\u0000${identity.validatorClass ?? ''}\u0000${identity.validatorCode ?? ''}\u0000${identity.expressionName ?? ''}\u0000${identity.field ?? ''}\u0000${identity.pointer ?? ''}\u0000${identity.lineage ?? ''}`,
        identity,
      ])).values()];
      const keys = uniqueIdentities.map(identity =>
        `${recordType}\u0000${metric.writeKind}\u0000${metric.phase}\u0000${operation}\u0000${formName}\u0000${identity.code}\u0000${identity.scope}\u0000${identity.validatorClass ?? ''}\u0000${identity.validatorCode ?? ''}\u0000${identity.expressionName ?? ''}\u0000${identity.field ?? ''}\u0000${identity.pointer ?? ''}\u0000${identity.lineage ?? ''}`
      );
      const missingSeries = keys.filter(key => !this.shadowReportRows.has(key)).length;
      if (this.shadowReportRows.size + missingSeries > this.shadowReportMaxSeries()) {
        this.shadowReportOverflowRuns += 1;
        return;
      }
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        const identity = uniqueIdentities[index];
        const row = this.shadowReportRows.get(key) ?? {
          recordType,
          operation,
          writeKind: metric.writeKind,
          phase: metric.phase,
          formName,
          code: identity.code,
          scope: identity.scope,
          ...(identity.expressionName ? { expressionName: identity.expressionName } : {}),
          ...(identity.field ? { field: identity.field } : {}),
          ...(identity.pointer ? { pointer: identity.pointer } : {}),
          ...(identity.validatorClass ? { validatorClass: identity.validatorClass } : {}),
          ...(identity.validatorCode ? { validatorCode: identity.validatorCode } : {}),
          ...(identity.lineage ? { lineage: identity.lineage } : {}),
          runs: 0,
          wouldReject: 0,
          blockingErrors: 0,
          advisoryErrors: 0,
          timeouts: 0,
          configurationDiagnostics: 0,
          totalDurationMs: 0,
          maximumDurationMs: 0,
        };
        row.runs += 1;
        row.wouldReject += metric.wouldBlock ? 1 : 0;
        row.blockingErrors += metric.blockingErrorCount;
        row.advisoryErrors += metric.advisoryErrorCount;
        row.timeouts += metric.timeoutKind === 'none' ? 0 : 1;
        row.configurationDiagnostics += metric.configurationDiagnosticCount;
        row.totalDurationMs += metric.durationMs;
        row.maximumDurationMs = Math.max(row.maximumDurationMs, metric.durationMs);
        this.shadowReportRows.set(key, row);
      }
    }

    private shadowReportMaxSeries(): number {
      const configured = sails.config.recordValidation?.shadowReportMaxSeries;
      return typeof configured === 'number' &&
        Number.isSafeInteger(configured) &&
        configured > 0 &&
        configured <= SHADOW_REPORT_MAX_SERIES_LIMIT
        ? configured
        : DEFAULT_RECORD_VALIDATION_SHADOW_REPORT_MAX_SERIES;
    }
  }
}

declare global {
  let RecordValidationService: Services.RecordValidation;
}
