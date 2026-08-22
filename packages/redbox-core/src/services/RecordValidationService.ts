import { firstValueFrom } from 'rxjs';
import {
  calculateValidationGroups,
  ExpressionsConditionKind,
  FormConfigFrame,
  FormConfigOutline,
  FormExpressionsConfigFrame,
  FormExpressionsTargetValidationGroups,
  FormFieldValidationGroup,
  FormValidationGroupsChangeInitial,
  jsonataCompileAndEvaluate,
  RecordValidationDiagnostic,
  ReusableFormDefinitions,
  ValidationMode,
  ValidationOperationDefinition,
  ValidationOperationOverride,
  ValidationOperationPolicyOverride,
} from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import type { RecordTypeValidationConfig } from '../config/recordtype.config';
import type { WorkflowStageConfig } from '../config/workflow.config';
import type { BrandingModel } from '../model/storage/BrandingModel';
import type { RecordMetaMetadata, RecordWorkflow } from '../model/storage/RecordModel';
import type { FormAttributes } from '../waterline-models/Form';
import { ConstructFormConfigVisitor } from '../visitor/construct.visitor';

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
  loadForm(formName: string, brand: string): Promise<FormAttributes | null>;
  constructForm(
    form: FormConfigFrame,
    metadata: Readonly<Record<string, unknown>>,
    reusableFormDefinitions: ReusableFormDefinitions
  ): Promise<FormConfigOutline>;
}

interface NormalizedRecordValidationRequest {
  readonly source: RecordValidationRequest;
  readonly operation?: string;
  readonly targetStep?: string;
  readonly currentStep?: string;
  readonly actorRoles: readonly string[];
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
    }
  | {
      readonly outcome: 'unresolved';
      readonly operation?: string;
      readonly recordType?: string;
      readonly formName?: string;
      readonly contractFailure?: boolean;
    };

const SAFE_REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_OPERATION_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;

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
  return typeof value === 'string' && value.length <= 128 && SAFE_REFERENCE_PATTERN.test(value) ? value : undefined;
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
    protected override _exportedMethods = ['resolve', 'registerMetricsHooks'];
    private readonly metricsHooks = new Set<RecordValidationMetricsHooks>();
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

    private async resolveRequest(
      request: RecordValidationRequest,
      diagnostics: RecordValidationDiagnostic[],
      progress: ResolutionProgress
    ): Promise<RecordValidationResult> {
      const globalConfig = sails.config.recordValidation;
      let mode = this.readMode(globalConfig?.mode, 'shadow', diagnostics);
      progress.mode = mode;
      const normalized = this.normalizeRequest(request, diagnostics);
      if (!normalized)
        return this.buildResult(request, mode, diagnostics, { outcome: 'unresolved', contractFailure: true });
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

      if (operation) {
        const globalOperation =
          globalConfig?.operations && Object.hasOwn(globalConfig.operations, operation)
            ? globalConfig.operations[operation]
            : undefined;
        const recordTypeOperation =
          recordType.recordValidation?.operations && Object.hasOwn(recordType.recordValidation.operations, operation)
            ? recordType.recordValidation.operations[operation]
            : undefined;
        mode = this.readMode(globalOperation?.mode, mode, diagnostics);
        mode = this.readMode(recordType.recordValidation?.mode, mode, diagnostics);
        mode = this.readMode(recordTypeOperation?.mode, mode, diagnostics);
      } else {
        mode = this.readMode(recordType.recordValidation?.mode, mode, diagnostics);
      }
      progress.mode = mode;

      const selection = await this.resolveFormSelection(normalized, recordType, diagnostics, dependencies);
      if (!selection)
        return this.buildResult(request, mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
        });
      progress.formName = selection.formName;

      const form = await dependencies.loadForm(selection.formName, brand);
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
      const groupResolution = await this.resolveValidationGroups(constructedForm, policy, context, diagnostics);
      if (!groupResolution) {
        return this.buildResult(request, mode, diagnostics, {
          outcome: 'unresolved',
          operation,
          recordType: recordTypeName,
          formName: selection.formName,
        });
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
      };
      return this.buildResult(request, mode, diagnostics, {
        outcome: 'resolved',
        operation,
        recordType: recordTypeName,
        effectiveGroups: groupResolution.effectiveGroups,
        resolved,
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
        loadForm: async (formName, brand) => await firstValueFrom(FormsService.getFormByName(formName, true, brand)),
        constructForm: async (form, metadata, reusableFormDefinitions) =>
          await new ConstructFormConfigVisitor(this.logger).start({
            data: form,
            formMode: 'edit',
            record: metadata,
            reusableFormDefs: reusableFormDefinitions,
          }),
      };
      this.resolvedDependencies = { ...defaults, ...this.dependencyOverrides };
      return this.resolvedDependencies;
    }

    private normalizeRequest(
      request: RecordValidationRequest,
      diagnostics: RecordValidationDiagnostic[]
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
      if (!SAFE_OPERATION_PATTERN.test(operation)) {
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
      if (!SAFE_REFERENCE_PATTERN.test(normalized)) {
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
      if (typeof value !== 'string' || !SAFE_REFERENCE_PATTERN.test(value.trim())) {
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
      if (!SAFE_REFERENCE_PATTERN.test(normalized)) {
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
              { severity: request.operation ? 'error' : 'warning' }
            )
          );
          if (request.operation) return undefined;
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
      if (!SAFE_REFERENCE_PATTERN.test(formName)) {
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
          const matches = Boolean(await jsonataCompileAndEvaluate(config.condition, context));
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
        const value = await jsonataCompileAndEvaluate(config.template, context);
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

    private readMode(
      value: unknown,
      fallback: ValidationMode,
      diagnostics: RecordValidationDiagnostic[]
    ): ValidationMode {
      if (value === undefined) return fallback;
      if (value === 'shadow' || value === 'enforce') return value;
      diagnostics.push(
        createDiagnostic(
          RECORD_VALIDATION_DIAGNOSTIC_CODES.rolloutModeMalformed,
          'A record-validation rollout mode is malformed.'
        )
      );
      return fallback;
    }

    private buildResult(
      request: RecordValidationRequest,
      mode: ValidationMode,
      diagnostics: readonly RecordValidationDiagnostic[],
      options: BuildResultOptions
    ): RecordValidationResult {
      const hasConfigurationError = diagnostics.some(item => item.severity === 'error');
      const shouldBlock =
        (options.outcome === 'unresolved' && options.contractFailure === true) ||
        (mode === 'enforce' && hasConfigurationError);
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
