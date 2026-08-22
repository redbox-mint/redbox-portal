import { firstValueFrom } from 'rxjs';
import { createHash } from 'node:crypto';
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
import { ValidatorFormConfigVisitor } from '../visitor/validator.visitor';
import type jsonata from 'jsonata';

export const RECORD_VALIDATION_DIAGNOSTIC_CODES = {
  formReferenceMissing: 'record-validation-form-reference-missing',
  formReferenceMalformed: 'record-validation-form-reference-malformed',
  formNotFound: 'record-validation-form-not-found',
  formConfigurationMissing: 'record-validation-form-configuration-missing',
  formConfigurationMalformed: 'record-validation-form-configuration-malformed',
  recordTypeReferenceMissing: 'record-validation-record-type-reference-missing',
  recordTypeReferenceMalformed: 'record-validation-record-type-reference-malformed',
  recordTypeNotFound: 'record-validation-record-type-not-found',
  brandReferenceMissing: 'record-validation-brand-reference-missing',
  brandReferenceMalformed: 'record-validation-brand-reference-malformed',
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
  /** Requested workflow movement; separate from validationOperation. */
  readonly targetStep?: string;
  /** Current workflow step before a transition, when already known by the caller. */
  readonly currentStep?: string;
  readonly actor: RecordValidationActor;
  readonly requestParameters?: Readonly<Record<string, RecordValidationJSONValue>>;
  /** Optional caller-side narrowing of the server-owned request-parameter allowlist. */
  readonly allowedRequestParameterNames?: readonly string[];
  readonly runtimeContext?: Readonly<Record<string, RecordValidationJSONValue>>;
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
  readonly expressionContext: RecordValidationExpressionContext;
  /** Deterministic identity of effective form/reusable/validator configuration, never candidate data. */
  readonly configFingerprint: string;
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
}

export interface UnresolvedRecordValidationResult extends RecordValidationResultBase {
  readonly status: 'unresolved';
}

export type RecordValidationResult = ResolvedRecordValidationResult | UnresolvedRecordValidationResult;

/** Safe observability payload: it deliberately contains no record or expression values. */
export interface RecordValidationResolutionMetric {
  readonly requestId?: string;
  readonly recordType?: string;
  readonly formName?: string;
  readonly operation?: string;
  readonly mode: ValidationMode;
  readonly status: RecordValidationResult['status'];
  readonly shouldBlock: boolean;
  readonly diagnosticCodes: readonly string[];
}

export interface RecordValidationMetricsHooks {
  resolutionCompleted(metric: RecordValidationResolutionMetric): void;
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
  executeValidators?(
    form: FormConfigOutline,
    enabledValidationGroups: readonly string[],
    validatorDefinitionsMap: ReadonlyMap<string, FormValidatorDefinition>,
    jsonataEvaluatorFactory: (expression: string) => JSONataEvaluate
  ): Promise<FormValidatorSummaryErrors[]>;
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
    }
  | {
      readonly outcome: 'unresolved';
      readonly operation?: string;
      readonly recordType?: string;
      readonly formName?: string;
      readonly contractFailure?: boolean;
    };

const SAFE_FIELD_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_VALIDATOR_CLASS_PATTERN = /^[A-Za-z][A-Za-z0-9_.#-]{0,127}$/;
const SAFE_TRANSLATION_KEY_PATTERN = /^@[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const CACHE_LIMIT = 128;

interface CachedFormDefinition {
  readonly fingerprint: string;
  readonly form: FormAttributes;
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

function stableSerialize(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : JSON.stringify(String(value));
  if (typeof value === 'undefined') return '"[undefined]"';
  if (typeof value === 'function') return JSON.stringify(`[function:${Function.prototype.toString.call(value)}]`);
  if (typeof value !== 'object') return JSON.stringify(String(value));
  if (seen.has(value)) return '"[circular]"';
  seen.add(value);
  const serialized = Array.isArray(value)
    ? `[${value.map(item => stableSerialize(item, seen)).join(',')}]`
    : `{${Object.keys(value as Record<string, unknown>)
        .sort()
        .map(key => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key], seen)}`)
        .join(',')}}`;
  seen.delete(value);
  return serialized;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex');
}

function setBounded<K, V>(cache: Map<K, V>, key: K, value: V): void {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as K);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function discoverValidationGroupExpressions(form: FormConfigOutline): FormExpressionsConfigFrame[] {
  const expressions: FormExpressionsConfigFrame[] = [];
  const visited = new WeakSet<object>();
  const walk = (value: unknown): void => {
    if (value === null || typeof value !== 'object' || visited.has(value as object)) return;
    visited.add(value as object);
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    const item = value as Record<string, unknown>;
    if (Array.isArray(item.expressions)) {
      for (const expression of item.expressions) {
        if (isValidationGroupExpression(expression)) expressions.push(expression);
      }
    }
    for (const key of Object.keys(item)) {
      if (key !== 'expressions') walk(item[key]);
    }
  };
  walk(form);
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

function stripExpressionStringLiterals(source: string): string {
  return source.replace(/(['"])(?:\\.|(?!\1)[^\\])*\1/g, '');
}

/** Strip JSONata string literals before checking for browser-only root bindings. */
function referencesBrowserOnlyJSONataContext(source: string): boolean {
  const withoutStrings = stripExpressionStringLiterals(source);
  return /(?:^|[^A-Za-z0-9_$.])\$?(?:event|value|querySource)\b/.test(withoutStrings);
}

export namespace Services {
  /** Side-effect-free authoritative form/policy/context/group resolver. */
  export class RecordValidation extends services.Core.Service {
    protected override _exportedMethods = [
      'resolve',
      'discoverOperations',
      'registerMetricsHooks',
      'clearCaches',
      'getCacheStats',
    ];
    private readonly metricsHooks = new Set<RecordValidationMetricsHooks>();
    private readonly formDefinitionCache = new Map<string, CachedFormDefinition>();
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

    /** Add an observability hook and return a handle that unregisters only that hook. */
    public registerMetricsHooks(hooks: RecordValidationMetricsHooks): () => void {
      this.metricsHooks.add(hooks);
      return () => this.metricsHooks.delete(hooks);
    }

    /** Explicit invalidation surface for form/config reloads and isolated tests. */
    public clearCaches(): void {
      this.formDefinitionCache.clear();
      this.expressionCache.clear();
      this.validatorMappingCache.clear();
    }

    /** Bounded aggregate cache diagnostics; contains no keys or request-derived values. */
    public getCacheStats(): RecordValidationCacheStats {
      return {
        formDefinitions: this.formDefinitionCache.size,
        compiledExpressions: this.expressionCache.size,
        validatorMappings: this.validatorMappingCache.size,
      };
    }

    public async resolve(request: RecordValidationRequest): Promise<RecordValidationResult> {
      const diagnostics: RecordValidationDiagnostic[] = [];
      const progress: ResolutionProgress = { mode: 'shadow' };
      try {
        return await this.resolveRequest(request, diagnostics, progress);
      } catch {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.resolutionFailed,
            'Record validation resolution could not be completed.'
          )
        );
        return this.buildResult(request, progress.mode, diagnostics, {
          outcome: 'unresolved',
          operation: progress.operation,
          recordType: progress.recordType,
          formName: progress.formName,
        });
      }
    }

    /**
     * Resolve public operation metadata without executing expressions or
     * validators. Any incomplete/malformed context fails to an empty list so
     * discovery cannot become an authorization oracle or leak diagnostics.
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
        if (selection) resolvedContexts.push({ request: context, selection });
      }

      const constructedForms = new Map<string, FormConfigOutline | null>();
      const getConstructedForm = async (formName: string): Promise<FormConfigOutline | null> => {
        if (constructedForms.has(formName)) return constructedForms.get(formName) ?? null;
        let constructed: FormConfigOutline | null = null;
        try {
          const loadedForm = await dependencies.loadForm(formName, brand);
          const form = this.cacheResolvedForm(loadedForm, formName, brand);
          if (form?.configuration) {
            constructed = await dependencies.constructForm(
              form.configuration,
              request.candidate.metadata,
              sails.config.reusableFormDefinitions ?? {}
            );
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
        return this.buildResult(request, mode, diagnostics, { outcome: 'unresolved', contractFailure: true });
      }
      const operation = normalized.operation;
      progress.operation = operation;

      const brand = this.requiredReference(request.candidate.metaMetadata.brandId, 'brand', diagnostics);
      const recordTypeName = this.requiredReference(request.candidate.metaMetadata.type, 'recordType', diagnostics);
      progress.recordType = recordTypeName;
      if (!brand || !recordTypeName) {
        return this.buildResult(request, mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
        });
      }

      const dependencies = this.dependencies();
      const recordType = await dependencies.loadRecordType(brand, recordTypeName);
      if (!recordType) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.recordTypeNotFound,
            'The candidate record type could not be resolved.'
          )
        );
        return this.buildResult(request, mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
        });
      }

      const effectiveModeResolution = resolveValidationMode(globalConfig, recordType.recordValidation, operation);
      this.addMalformedModeDiagnostics(
        Math.max(0, effectiveModeResolution.malformedModeCount - initialModeResolution.malformedModeCount),
        diagnostics
      );
      mode = effectiveModeResolution.mode;
      progress.mode = mode;

      const selection = await this.resolveFormSelection(normalized, recordType, diagnostics, dependencies);
      if (!selection)
        return this.buildResult(request, mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
        });
      progress.formName = selection.formName;

      const loadedForm = await dependencies.loadForm(selection.formName, brand);
      const form = this.cacheResolvedForm(loadedForm, selection.formName, brand);
      if (!form) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.formNotFound,
            'The exact configured form could not be resolved.',
            { formName: selection.formName }
          )
        );
        return this.buildResult(request, mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
        });
      }
      if (!form.configuration) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.formConfigurationMissing,
            'The exact configured form has no configuration.',
            { formName: selection.formName }
          )
        );
        return this.buildResult(request, mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
        });
      }

      let constructedForm: FormConfigOutline;
      try {
        constructedForm = await dependencies.constructForm(
          form.configuration,
          request.candidate.metadata,
          sails.config.reusableFormDefinitions ?? {}
        );
      } catch {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.formConfigurationMalformed,
            'The exact configured form could not be constructed.',
            { formName: selection.formName }
          )
        );
        return this.buildResult(request, mode, diagnostics, {
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
        return this.buildResult(request, mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
          contractFailure: true,
        });
      }
      if (policy && !this.authorizeOperation(policy, normalized, diagnostics)) {
        return this.buildResult(request, mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
          contractFailure: true,
        });
      }

      const context = this.buildExpressionContext(
        normalized,
        recordTypeName,
        selection.formName,
        brand,
        globalConfig?.allowedRequestParameters,
        diagnostics
      );
      if (!context) {
        return this.buildResult(request, mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
        });
      }
      const timeoutMs = this.timeoutMs(globalConfig?.timeoutMs);
      const blockingRun = await this.withTimeout(
        (async () => {
          const groupResolution = await this.resolveValidationGroups(constructedForm, policy, context, diagnostics);
          if (!groupResolution) return undefined;
          const advisoryGroups = this.discoverAdvisoryGroups(
            constructedForm,
            groupResolution.effectiveGroups,
            diagnostics
          );
          const validatorDefinitionsMap = this.validatorDefinitions(constructedForm, diagnostics);
          if (!validatorDefinitionsMap) return undefined;
          const summaries = await this.executeValidators(
            constructedForm,
            groupResolution.effectiveGroups,
            validatorDefinitionsMap
          );
          return { groupResolution, advisoryGroups, validatorDefinitionsMap, summaries };
        })(),
        timeoutMs
      );
      if (blockingRun.status === 'timed-out') {
        diagnostics.push(
          createDiagnostic(RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingTimeout, 'Blocking record validation timed out.')
        );
        return this.buildResult(request, mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
        });
      }
      if (blockingRun.status === 'failed') {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingExecutionFailed,
            'Blocking record validation could not be completed.'
          )
        );
        return this.buildResult(request, mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
        });
      }
      if (!blockingRun.value) {
        return this.buildResult(request, mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
        });
      }
      const { groupResolution, advisoryGroups, validatorDefinitionsMap, summaries } = blockingRun.value;
      const blockingErrors = this.mapValidatorSummaries(summaries);
      let advisoryErrors: RecordSaveIssue[] = [];
      if (advisoryGroups.length > 0) {
        const advisoryRun = await this.withTimeout(
          this.executeValidators(constructedForm, advisoryGroups, validatorDefinitionsMap),
          timeoutMs
        );
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
        } else {
          advisoryErrors = this.mapValidatorSummaries(advisoryRun.value);
        }
      }
      const resolved: RecordValidationResolvedState = {
        constructedForm,
        formName: selection.formName,
        recordType: recordTypeName,
        brand,
        workflowStep: selection.workflowStep,
        operationPolicy: policy,
        conditionalGroups: groupResolution.conditionalGroups,
        expressionContext: context,
        configFingerprint: fingerprint({
          formName: selection.formName,
          brand,
          form: form.configuration,
          reusableFormDefinitions: sails.config.reusableFormDefinitions ?? {},
          validatorDefinitions: sails.config.validators?.definitions ?? [],
        }),
      };
      return this.buildResult(request, mode, diagnostics, {
        outcome: 'resolved',
        operation,
        recordType: recordTypeName,
        effectiveGroups: groupResolution.effectiveGroups,
        resolved,
        blockingErrors,
        advisoryErrors,
        advisoryGroups,
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
        executeValidators: async (form, enabledValidationGroups, validatorDefinitionsMap, evaluatorFactory) =>
          await new ValidatorFormConfigVisitor(this.logger).start({
            form,
            enabledValidationGroups: [...enabledValidationGroups],
            validatorDefinitionsMap,
            jsonataEvaluatorFactory: evaluatorFactory,
          }),
      };
      this.resolvedDependencies = { ...defaults, ...this.dependencyOverrides };
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
      const currentStep = this.optionalStepReference(request.currentStep, diagnostics);
      if (!currentStep.ok) return undefined;
      return {
        source: request,
        operation: operation.value,
        targetStep: targetStep.value,
        currentStep: currentStep.value,
        actorRoles: normalizeRoles(request.actor.roles),
        requireResolvedWorkflowStep: requireResolvedWorkflowStep || operation.value !== undefined,
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
      diagnostics: RecordValidationDiagnostic[]
    ): ParsedOptionalString {
      if (value === undefined || value === null) return { ok: true };
      if (typeof value !== 'string' || !RECORD_VALIDATION_REFERENCE_PATTERN.test(value.trim())) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed,
            'The workflow step reference is malformed.'
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
      const parsedWorkflowStep = this.optionalStepReference(request.source.candidate.workflow?.stage, diagnostics);
      if (!parsedWorkflowStep.ok) return undefined;
      const workflowStep = parsedWorkflowStep.value;
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
          if (request.requireResolvedWorkflowStep) return undefined;
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
      const currentStep = this.optionalStepReference(rawCurrentStep, diagnostics);
      if (!currentStep.ok) return undefined;
      return {
        formData: this.cloneExpressionContextValue(request.source.candidate.metadata, 'formData'),
        ...(request.operation ? { operation: request.operation } : {}),
        recordType,
        formName,
        brand,
        workflow: {
          ...(currentStep.value ? { currentStep: currentStep.value } : {}),
          ...(request.targetStep ? { targetStep: request.targetStep } : {}),
        },
        requestParams: this.cloneExpressionContextValue(requestParams, 'requestParams'),
        runtimeContext: this.cloneExpressionContextValue(request.source.runtimeContext ?? {}, 'runtimeContext'),
        actor: { authenticated: request.source.actor.authenticated === true, roles: request.actorRoles },
      };
    }

    private cloneExpressionContextValue<T>(value: T, label: string): T {
      try {
        return structuredClone(value);
      } catch {
        this.logger.warn(`Record validation could not clone ${label}; using the original value.`);
        return value;
      }
    }

    private async resolveValidationGroups(
      form: FormConfigOutline,
      policy: EffectiveValidationOperationPolicy | undefined,
      context: RecordValidationExpressionContext,
      diagnostics: RecordValidationDiagnostic[]
    ): Promise<{ conditionalGroups: string[]; effectiveGroups: string[] } | undefined> {
      // ConstructFormConfigVisitor always materializes this default and validates
      // the built-in `all`/`none` group definitions before resolution reaches here.
      let groups = [...(form.enabledValidationGroups ?? [])];
      const availableGroups = form.validationGroups ?? {};
      for (const expression of discoverValidationGroupExpressions(form)) {
        const change = await this.evaluateGroupExpression(expression, context, diagnostics);
        if (!change) continue;
        const folded = calculateValidationGroups(groups, availableGroups, change.initial, change.groups);
        groups = folded.enabledValidationGroups;
        diagnostics.push(...folded.diagnostics);
      }
      const conditionalGroups = [...groups];

      // A named operation is an exact trusted group set applied last. With no
      // operation, the authoritative conditional fold remains effective; its
      // own empty result retains the shared "all validators" meaning.
      const effectiveGroups = policy
        ? calculateValidationGroups(groups, availableGroups, 'current', undefined, policy.enabledValidationGroups)
            .enabledValidationGroups
        : groups;
      let hasUnknownGroup = false;
      if (effectiveGroups.length > 0) {
        const available = new Set(Object.keys(availableGroups));
        for (const group of effectiveGroups) {
          if (!available.has(group)) {
            hasUnknownGroup = true;
            diagnostics.push(
              createDiagnostic(
                RECORD_VALIDATION_DIAGNOSTIC_CODES.validationGroupUnknown,
                'An effective blocking validation group is not declared by the form.',
                { group }
              )
            );
          }
        }
      }
      if (hasUnknownGroup) return undefined;
      return { conditionalGroups, effectiveGroups };
    }

    private async evaluateGroupExpression(
      expression: FormExpressionsConfigFrame,
      context: RecordValidationExpressionContext,
      diagnostics: RecordValidationDiagnostic[]
    ): Promise<ValidationGroupChange | undefined> {
      const config = expression.config;
      if (config.runOnFormReady === false) {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported,
            'A validation-group expression disabled on form ready is client-interaction-only.'
          )
        );
        return undefined;
      }
      try {
        if (config.condition !== undefined) {
          const conditionKind = config.conditionKind ?? ExpressionsConditionKind.JSONPointer;
          if (conditionKind === ExpressionsConditionKind.JSONPointer) {
            const message = stripExpressionStringLiterals(config.condition).includes('::')
              ? 'A blocking validation-group expression depends on browser event history.'
              : 'A JSONPointer condition routes browser events and has no authoritative server meaning.';
            diagnostics.push(createDiagnostic(RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported, message));
            return undefined;
          }
          if (conditionKind === ExpressionsConditionKind.JSONataQuery) {
            diagnostics.push(
              createDiagnostic(
                RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported,
                'A JSONataQuery condition requires a browser query source.'
              )
            );
            return undefined;
          }
          if (conditionKind !== ExpressionsConditionKind.JSONata) {
            diagnostics.push(
              createDiagnostic(
                RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported,
                'A blocking validation-group expression uses an unsupported condition kind.'
              )
            );
            return undefined;
          }
          if (referencesBrowserOnlyJSONataContext(config.condition)) {
            diagnostics.push(
              createDiagnostic(
                RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported,
                'A blocking validation-group expression requires browser-only context.'
              )
            );
            return undefined;
          }
          const matches = Boolean(await this.evaluateJSONata(config.condition, context));
          if (!matches) return undefined;
        }
        if (typeof config.template !== 'string') {
          diagnostics.push(
            createDiagnostic(
              RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported,
              'An operation-only validation-group expression has no registered server implementation.'
            )
          );
          return undefined;
        }
        if (referencesBrowserOnlyJSONataContext(config.template)) {
          diagnostics.push(
            createDiagnostic(
              RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionUnsupported,
              'A blocking validation-group expression requires browser-only context.'
            )
          );
          return undefined;
        }
        const value = await this.evaluateJSONata(config.template, context);
        const change = parseGroupChange(value);
        if (!change) {
          diagnostics.push(
            createDiagnostic(
              RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionResultMalformed,
              'A blocking validation-group expression returned a malformed group change.'
            )
          );
        }
        return change;
      } catch {
        diagnostics.push(
          createDiagnostic(
            RECORD_VALIDATION_DIAGNOSTIC_CODES.expressionEvaluationFailed,
            'A blocking validation-group expression could not be evaluated.'
          )
        );
        return undefined;
      }
    }

    private cacheResolvedForm(form: FormAttributes | null, formName: string, brand: string): FormAttributes | null {
      if (!form) return null;
      const key = `${brand}\u0000${formName}`;
      const currentFingerprint = fingerprint({
        id: form.id,
        name: form.name,
        branding: form.branding,
        configuration: form.configuration,
      });
      const cached = this.formDefinitionCache.get(key);
      if (cached?.fingerprint === currentFingerprint) {
        this.formDefinitionCache.delete(key);
        this.formDefinitionCache.set(key, cached);
        return cached.form;
      }
      const entry = { fingerprint: currentFingerprint, form };
      setBounded(this.formDefinitionCache, key, entry);
      return form;
    }

    private discoverAdvisoryGroups(
      form: FormConfigOutline,
      blockingGroups: readonly string[],
      diagnostics: RecordValidationDiagnostic[]
    ): string[] {
      const advisoryGroups: string[] = [];
      const visited = new WeakSet<object>();
      const walk = (value: unknown): void => {
        if (value === null || typeof value !== 'object' || visited.has(value as object)) return;
        visited.add(value as object);
        if (Array.isArray(value)) {
          value.forEach(walk);
          return;
        }
        const item = value as Record<string, unknown>;
        const component = isRecord(item.component) ? item.component : undefined;
        if (component?.class === SuggestedValidationSummaryComponentName) {
          const config = isRecord(component.config) ? component.config : undefined;
          const groups = normalizeUniqueStrings(config?.enabledValidationGroups);
          if (!config || groups === undefined || groups.length === 0) {
            diagnostics.push(
              createDiagnostic(
                RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryConfigurationMalformed,
                'An advisory validation summary has malformed validation groups.',
                { severity: 'warning' }
              )
            );
          } else {
            for (const group of groups) if (!advisoryGroups.includes(group)) advisoryGroups.push(group);
          }
        }
        Object.values(item).forEach(walk);
      };
      walk(form);

      const available = new Set(Object.keys(form.validationGroups ?? {}));
      for (const group of advisoryGroups) {
        if (!available.has(group)) {
          diagnostics.push(
            createDiagnostic(
              RECORD_VALIDATION_DIAGNOSTIC_CODES.advisoryGroupUnknown,
              'An advisory validation group is not declared by the form.',
              { severity: 'warning', group }
            )
          );
        }
      }
      const validGroups = advisoryGroups.filter(group => available.has(group));
      const overlap =
        blockingGroups.length === 0 ? validGroups : validGroups.filter(group => blockingGroups.includes(group));
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
      form: FormConfigOutline,
      diagnostics: RecordValidationDiagnostic[]
    ): ReadonlyMap<string, FormValidatorDefinition> | undefined {
      const definitions = sails.config.validators?.definitions;
      const cacheKey = fingerprint({ formIdentity: form.name, definitions });
      const cached = this.validatorMappingCache.get(cacheKey);
      if (cached) {
        this.validatorMappingCache.delete(cacheKey);
        this.validatorMappingCache.set(cacheKey, cached);
        return cached;
      }
      try {
        const mapping = new ValidatorsSupport().createValidatorDefinitionMapping(definitions ?? []);
        setBounded(this.validatorMappingCache, cacheKey, mapping);
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
      mapping: ReadonlyMap<string, FormValidatorDefinition>
    ): Promise<FormValidatorSummaryErrors[]> {
      const execute = this.dependencies().executeValidators;
      if (!execute) throw new Error('Record validation executor is unavailable.');
      return await execute(form, groups, mapping, expression => this.jsonataEvaluator(expression));
    }

    private jsonataEvaluator(expression: string): JSONataEvaluate {
      const compiled = this.compiledExpression(expression);
      return async (value: unknown) => await jsonataEvaluate(compiled, value);
    }

    private compiledExpression(expression: string): jsonata.Expression {
      const key = fingerprint(expression);
      const cached = this.expressionCache.get(key);
      if (cached) {
        this.expressionCache.delete(key);
        this.expressionCache.set(key, cached);
        return cached;
      }
      const compiled = jsonataCompile(expression);
      setBounded(this.expressionCache, key, compiled);
      return compiled;
    }

    private async evaluateJSONata(expression: string, context: unknown): Promise<unknown> {
      return await jsonataEvaluate(this.compiledExpression(expression), context);
    }

    private mapValidatorSummaries(summaries: readonly FormValidatorSummaryErrors[]): RecordSaveIssue[] {
      const issues: RecordSaveIssue[] = [];
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
          issues.push(safe);
        }
      }
      return issues;
    }

    private timeoutMs(value: unknown): number {
      return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 5_000;
    }

    private async withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<TimeoutResult<T>> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settledWork: Promise<TimedResult<T> | TimedFailure> = work.then(
        value => ({ status: 'completed', value }),
        () => ({ status: 'failed' })
      );
      const timeout = new Promise<TimedOut>(resolve => {
        timer = setTimeout(() => resolve({ status: 'timed-out' }), timeoutMs);
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
      request: RecordValidationRequest,
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
            }
          : { ...common, status: 'unresolved' };
      const requestId = safeRequestId(request.requestId);
      const metric: RecordValidationResolutionMetric = {
        ...(requestId ? { requestId } : {}),
        ...(options.recordType ? { recordType: options.recordType } : {}),
        ...(formName ? { formName } : {}),
        ...(options.operation ? { operation: options.operation } : {}),
        mode,
        status: result.status,
        shouldBlock,
        diagnosticCodes: diagnostics.map(item => item.code),
      };
      for (const hooks of this.metricsHooks) {
        try {
          hooks.resolutionCompleted(metric);
        } catch {
          this.logger.warn('Record validation metrics hook failed.');
        }
      }
      this.logger.debug('Record validation resolution completed.', metric);
      return result;
    }
  }
}

declare global {
  let RecordValidationService: Services.RecordValidation;
}
