import { createHash } from 'node:crypto';
import { isProxy } from 'node:util/types';
import {
  RECORD_DEFINITION_KEY_MAX_LENGTH,
  RECORD_DEFINITION_KEY_PATTERN,
  RECORD_DEFINITION_PATH_MAX_LENGTH,
  RECORD_DEFINITION_REDACTION_MARKER,
  RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
  RECORD_VALIDATION_REFERENCE_PATTERN,
  VALIDATION_OPERATION_DESCRIPTION_MAX_LENGTH,
  VALIDATION_OPERATION_LABEL_MAX_LENGTH,
  VALIDATION_OPERATION_NAME_PATTERN,
  parseRecordDefinitionCanonicalHash,
  parseWorkflowStageKey,
  type DraftRecordDefinitionAggregateDto,
  type DraftWorkflowStageDto,
  type DraftWorkflowTransitionDto,
  type FormValidationGroups,
  type PublishableRecordDefinitionAggregateDto,
  type RecordDefinitionActionBindingDto,
  type RecordDefinitionActionContractReferenceDto,
  type RecordDefinitionActionDependencyDto,
  type RecordDefinitionActionParameterValueDto,
  type RecordDefinitionActionParameterValuesDto,
  type RecordDefinitionBrandId,
  type RecordDefinitionCanonicalHash,
  type RecordDefinitionDashboardDto,
  type RecordDefinitionImpactReportDto,
  type RecordDefinitionIssueSeverity,
  type RecordDefinitionKey,
  type RecordDefinitionRedactionDto,
  type RecordDefinitionStageImpactDto,
  type RecordDefinitionStageValidationOperationOverrideDto,
  type RecordDefinitionStructuralChangeDto,
  type RecordDefinitionValidationIssueDto,
  type RecordDefinitionValidationOperationDto,
  type RecordDefinitionValidationReportDto,
  type ValidationOperationDefinition,
  type WorkflowStageKey,
} from '@researchdatabox/sails-ng-common';
import {
  ACTION_PLAN_SCHEMA_VERSION,
  compareCodeUnits,
  validateActionPlan,
  type ActionPlanValidationIssueCode,
  type RedboxActionRegistry,
} from '../action-registry';
import { compileManagedHandlebarsTemplate, compileManagedJsonataExpression } from '../expression-runtime';
import { hasFullRecordStorageConcurrencyCapability, type StorageCapabilityProvider } from '../RecordStorageConcurrency';
import { isRuntimeArray, isRuntimeRecord, type RuntimeValue } from '../runtimeValues';
import { intersectValidationOperationRestrictions } from '../validationOperationPolicy';
import {
  RECORD_DEFINITION_CONTRACT_LIMITS,
  inspectDraftRecordDefinitionAggregate,
  inspectPublishableRecordDefinitionAggregate,
  projectDraftRecordDefinitionAggregate,
  type RecordDefinitionContractInspectionFailure,
} from './validation';

export const RECORD_DEFINITION_VALIDATION_LIMITS = Object.freeze({
  maxIssues: RECORD_DEFINITION_CONTRACT_LIMITS.maxReportIssues,
  maxChanges: RECORD_DEFINITION_CONTRACT_LIMITS.maxReportChanges,
  maxCatalogEntries: 512,
  maxFormCapabilities: 256,
  maxFormValidationOperations: 128,
  maxFormValidationGroups: 256,
});

export type RecordDefinitionValidationIssueCode =
  | ActionPlanValidationIssueCode
  | 'administrative-role-unavailable'
  | 'administrative-stage-lockout'
  | 'automatic-transition-field-not-allowed'
  | 'base-record-type-changed'
  | 'base-record-type-reference-not-found'
  | 'draft-invalid-payload'
  | 'draft-payload-too-complex'
  | 'draft-payload-too-deep'
  | 'draft-payload-too-large'
  | 'draft-payload-unsafe-structure'
  | 'draft-unknown-property'
  | 'duplicate-automatic-priority'
  | 'duplicate-dashboard-column-id'
  | 'duplicate-dashboard-column-order'
  | 'unsupported-dashboard-value'
  | 'duplicate-relationship-id'
  | 'duplicate-role-reference'
  | 'duplicate-search-filter-id'
  | 'duplicate-stage-display-order'
  | 'duplicate-stage-key'
  | 'duplicate-stage-validation-operation'
  | 'duplicate-transfer-field'
  | 'duplicate-transfer-role-rule'
  | 'duplicate-transition-id'
  | 'duplicate-validation-operation'
  | 'duplicate-validation-reference'
  | 'form-not-found'
  | 'form-validation-operation-not-found'
  | 'invalid-handlebars-template'
  | 'invalid-jsonata-expression'
  | 'manual-transition-field-not-allowed'
  | 'manual-transition-role-not-authorized'
  | 'manual-transition-role-required'
  | 'non-terminal-stage-has-no-exit'
  | 'non-terminal-stage-has-no-terminal-path'
  | 'publication-incomplete'
  | 'publication-invalid-payload'
  | 'record-type-reference-not-found'
  | 'referenced-stage-removed'
  | 'referenced-stage-renamed'
  | 'role-not-found'
  | 'stage-edit-role-cannot-view'
  | 'stage-validation-operation-not-found'
  | 'stage-validation-role-broadening'
  | 'stage-validation-target-broadening'
  | 'starting-stage-count-invalid'
  | 'storage-concurrency-capability-unavailable'
  | 'transfer-role-field-not-found'
  | 'transition-action-scope-not-found'
  | 'transition-self-loop'
  | 'transition-source-stage-not-found'
  | 'transition-target-stage-not-found'
  | 'unreachable-stage'
  | 'validation-catalog-invalid'
  | 'validation-group-not-found'
  | 'validation-operation-not-found'
  | 'validation-role-not-authorized'
  | 'validation-target-not-allowed'
  | 'validation-target-stage-not-found';

export interface RecordDefinitionValidationCoordinates {
  readonly brandId: RecordDefinitionBrandId;
  readonly recordTypeKey: RecordDefinitionKey;
  readonly draftVersion: number;
  readonly activeRevisionNumber: number | null;
}

export interface RecordDefinitionDraftPayloadValidationRequest extends RecordDefinitionValidationCoordinates {
  readonly definition: RuntimeValue;
}

export interface RecordDefinitionFormCapability {
  readonly reference: string;
  readonly validationOperations: Readonly<Record<string, ValidationOperationDefinition>>;
  readonly validationGroups: Readonly<FormValidationGroups>;
}

export interface RecordDefinitionStageReferenceCount {
  readonly stageKey: WorkflowStageKey;
  readonly recordCount: number;
}

export interface RecordDefinitionPublicationValidationRequest extends RecordDefinitionValidationCoordinates {
  readonly definition: RuntimeValue;
  readonly actionRegistry: RedboxActionRegistry;
  readonly roles: readonly string[];
  readonly administrativeRole?: string;
  readonly forms: readonly RecordDefinitionFormCapability[];
  readonly availableRecordTypeKeys: readonly RecordDefinitionKey[];
  readonly storageCapabilityProvider?: StorageCapabilityProvider | null;
  readonly activeDefinition: PublishableRecordDefinitionAggregateDto | null;
  readonly stageReferences: readonly RecordDefinitionStageReferenceCount[];
}

export interface ValidatedDraftRecordDefinitionPayload {
  readonly ok: true;
  readonly definition: DraftRecordDefinitionAggregateDto;
  readonly report: RecordDefinitionValidationReportDto;
}

export interface InvalidDraftRecordDefinitionPayload {
  readonly ok: false;
  readonly report: RecordDefinitionValidationReportDto;
}

export type RecordDefinitionDraftPayloadValidationResult =
  | ValidatedDraftRecordDefinitionPayload
  | InvalidDraftRecordDefinitionPayload;

export interface ValidatedRecordDefinitionPublication {
  readonly ok: true;
  readonly definition: PublishableRecordDefinitionAggregateDto;
  readonly canonicalJson: string;
  readonly canonicalHash: RecordDefinitionCanonicalHash;
  readonly actionContracts: readonly RecordDefinitionActionContractReferenceDto[];
  readonly report: RecordDefinitionValidationReportDto;
  readonly impact: RecordDefinitionImpactReportDto;
}

export interface InvalidRecordDefinitionPublication {
  readonly ok: false;
  readonly report: RecordDefinitionValidationReportDto;
  readonly impact: RecordDefinitionImpactReportDto;
}

export type RecordDefinitionPublicationValidationResult =
  | ValidatedRecordDefinitionPublication
  | InvalidRecordDefinitionPublication;

export class RecordDefinitionCanonicalizationError extends Error {
  readonly code = 'record-definition-not-publishable' as const;

  constructor() {
    super('Only a complete publishable record definition can be canonicalized.');
    this.name = 'RecordDefinitionCanonicalizationError';
  }
}

interface MutableIssue {
  readonly code: RecordDefinitionValidationIssueCode;
  readonly path: string;
  readonly severity: RecordDefinitionIssueSeverity;
  readonly message: string;
}

interface ValidationState {
  readonly issues: MutableIssue[];
}

function pointerSegment(segment: string | number): string {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

function pointer(segments: readonly (string | number)[]): string {
  let path = '';
  for (const segment of segments) {
    const candidate = `${path}/${pointerSegment(segment)}`;
    if (candidate.length > RECORD_DEFINITION_PATH_MAX_LENGTH) break;
    path = candidate;
  }
  return path || '/';
}

function isCompletePointerSegment(segment: string): boolean {
  for (let index = 0; index < segment.length; index += 1) {
    if (segment[index] !== '~') continue;
    const escaped = segment[index + 1];
    if (escaped !== '0' && escaped !== '1') return false;
    index += 1;
  }
  return true;
}

function boundedPointerPath(path: string): string {
  if (path === '/') return path;
  if (!path.startsWith('/')) return '/';
  let bounded = '';
  for (const segment of path.slice(1).split('/')) {
    if (!isCompletePointerSegment(segment)) return bounded || '/';
    const candidate = `${bounded}/${segment}`;
    if (candidate.length > RECORD_DEFINITION_PATH_MAX_LENGTH) break;
    bounded = candidate;
  }
  return bounded || '/';
}

function legacyPathToPointer(path: string): string {
  const segments: Array<string | number> = [];
  for (const match of path.matchAll(/\.([^.[\]]+)|\[(\d+)\]/g)) {
    segments.push(match[2] === undefined ? match[1] : Number(match[2]));
  }
  if (segments[0] === 'bindings') {
    segments[0] = 'actionBindings';
  }
  return pointer(segments);
}

function addIssue(
  state: ValidationState,
  code: RecordDefinitionValidationIssueCode,
  path: string,
  message: string,
  severity: RecordDefinitionIssueSeverity = 'error'
): void {
  state.issues.push({ code, path: boundedPointerPath(path), severity, message });
}

function compareIssues(left: MutableIssue, right: MutableIssue): number {
  return (
    compareCodeUnits(left.path, right.path) ||
    compareCodeUnits(left.code, right.code) ||
    compareCodeUnits(left.severity, right.severity) ||
    compareCodeUnits(left.message, right.message)
  );
}

function finalizedIssues(state: ValidationState): {
  readonly issues: readonly RecordDefinitionValidationIssueDto[];
  readonly truncated: boolean;
} {
  const distinct = new Map<string, MutableIssue>();
  for (const issue of state.issues) {
    distinct.set(`${issue.path}\u0000${issue.code}\u0000${issue.severity}`, issue);
  }
  const ordered = [...distinct.values()].sort(compareIssues);
  return Object.freeze({
    issues: Object.freeze(
      ordered.slice(0, RECORD_DEFINITION_VALIDATION_LIMITS.maxIssues).map(issue => Object.freeze({ ...issue }))
    ),
    truncated: ordered.length > RECORD_DEFINITION_VALIDATION_LIMITS.maxIssues,
  });
}

function freezeRuntimeTree(value: RuntimeValue): void {
  if (!isRuntimeRecord(value) && !isRuntimeArray(value)) {
    return;
  }
  const pending: RuntimeValue[] = [value];
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if ((!isRuntimeRecord(current) && !isRuntimeArray(current)) || seen.has(current)) {
      continue;
    }
    seen.add(current);
    pending.push(...Object.values(current));
    Object.freeze(current);
  }
}

function sortedStrings<Value extends string>(values: readonly Value[]): readonly Value[] {
  return Object.freeze([...values].sort(compareCodeUnits));
}

function stableSerialize(value: object): string;
function stableSerialize(value: RuntimeValue): string;
function stableSerialize(value: RuntimeValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (isRuntimeArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (!isRuntimeRecord(value)) return 'null';
  const entries = Object.keys(value)
    .sort(compareCodeUnits)
    .flatMap(key => {
      const child = value[key];
      return child === undefined ? [] : [`${JSON.stringify(key)}:${stableSerialize(child)}`];
    });
  return `{${entries.join(',')}}`;
}

function canonicalDashboard(dashboard: RecordDefinitionDashboardDto): RecordDefinitionDashboardDto {
  return {
    ...dashboard,
    columns: Object.freeze(
      [...dashboard.columns]
        .sort((left, right) => left.displayOrder - right.displayOrder || compareCodeUnits(left.id, right.id))
        .map(column => ({
          ...column,
          value: { ...column.value },
          ...(column.render === undefined ? {} : { render: { ...column.render } }),
        }))
    ),
  };
}

function canonicalValidationOperation(
  operation: RecordDefinitionStageValidationOperationOverrideDto
): RecordDefinitionStageValidationOperationOverrideDto;
function canonicalValidationOperation(
  operation: RecordDefinitionValidationOperationDto
): RecordDefinitionValidationOperationDto;
function canonicalValidationOperation(
  operation: RecordDefinitionValidationOperationDto
): RecordDefinitionValidationOperationDto {
  return {
    ...operation,
    enabledValidationGroups: sortedStrings(operation.enabledValidationGroups),
    ...(operation.roles === undefined ? {} : { roles: sortedStrings(operation.roles) }),
    ...(operation.allowedTargetStages === undefined
      ? {}
      : { allowedTargetStages: Object.freeze([...operation.allowedTargetStages].sort(compareCodeUnits)) }),
  };
}

function canonicalParameter(value: RecordDefinitionActionParameterValueDto): RecordDefinitionActionParameterValueDto {
  return structuredClone(value);
}

function canonicalParameters(
  values: RecordDefinitionActionParameterValuesDto
): RecordDefinitionActionParameterValuesDto {
  const canonical: Record<string, RecordDefinitionActionParameterValueDto> = {};
  for (const name of Object.keys(values).sort(compareCodeUnits)) {
    const value = values[name];
    if (value !== undefined) canonical[name] = canonicalParameter(value);
  }
  return canonical;
}

function canonicalDependency(dependency: RecordDefinitionActionDependencyDto): RecordDefinitionActionDependencyDto {
  return dependency.condition === 'success'
    ? { ...dependency }
    : { ...dependency, value: structuredClone(dependency.value) };
}

function actionScopeKey(binding: RecordDefinitionActionBindingDto): string {
  const scopeId = binding.scope.context === 'workflow-transition' ? binding.scope.scopeId : '';
  return stableSerialize([binding.scope.context, binding.scope.mode, binding.scope.phase, scopeId]);
}

function canonicalActionBinding(binding: RecordDefinitionActionBindingDto): RecordDefinitionActionBindingDto {
  return {
    ...binding,
    parameters: canonicalParameters(binding.parameters),
    ...(binding.dependencies === undefined
      ? {}
      : {
          dependencies: Object.freeze(
            binding.dependencies
              .map(canonicalDependency)
              .sort((left, right) => compareCodeUnits(stableSerialize(left), stableSerialize(right)))
          ),
        }),
    ...(binding.policyOverrides?.retry?.retryOn === undefined
      ? {}
      : {
          policyOverrides: {
            ...binding.policyOverrides,
            retry: {
              ...binding.policyOverrides.retry,
              retryOn: sortedStrings(binding.policyOverrides.retry.retryOn),
            },
          },
        }),
  };
}

/** Returns a deeply frozen semantic ordering without mutating the caller. */
export function canonicalizeRecordDefinition(
  definition: PublishableRecordDefinitionAggregateDto
): PublishableRecordDefinitionAggregateDto {
  const inspected = inspectPublishableRecordDefinitionAggregate(definition);
  if (!inspected.success) throw new RecordDefinitionCanonicalizationError();
  const source = inspected.data;
  const canonical: PublishableRecordDefinitionAggregateDto = {
    ...source,
    recordType: {
      ...source.recordType,
      searchFilters: Object.freeze(source.recordType.searchFilters.map(filter => ({ ...filter }))),
      relationships: Object.freeze([...source.recordType.relationships].sort((a, b) => compareCodeUnits(a.id, b.id))),
      transferResponsibility: {
        fields: Object.freeze(
          [...source.recordType.transferResponsibility.fields]
            .sort((a, b) => compareCodeUnits(a.field, b.field))
            .map(field => ({
              ...field,
              updateAlso: sortedStrings(field.updateAlso),
              fieldNames: Object.freeze(
                [...field.fieldNames].sort(
                  (a, b) => compareCodeUnits(a.name, b.name) || compareCodeUnits(a.field, b.field)
                )
              ),
            }))
        ),
        roleRules: Object.freeze(
          [...source.recordType.transferResponsibility.roleRules]
            .sort((a, b) => compareCodeUnits(a.role, b.role))
            .map(rule => ({ ...rule, editableFields: sortedStrings(rule.editableFields) }))
        ),
      },
      validation: {
        ...source.recordType.validation,
        operations: Object.freeze(
          [...source.recordType.validation.operations]
            .sort((a, b) => compareCodeUnits(a.name, b.name))
            .map(canonicalValidationOperation)
        ),
      },
      ...(source.recordType.dashboard === undefined
        ? {}
        : { dashboard: canonicalDashboard(source.recordType.dashboard) }),
    },
    stages: Object.freeze(
      [...source.stages]
        .sort((a, b) => a.displayOrder - b.displayOrder || compareCodeUnits(a.key, b.key))
        .map(stage => ({
          ...stage,
          viewRoles: sortedStrings(stage.viewRoles),
          editRoles: sortedStrings(stage.editRoles),
          validationOverrides: Object.freeze(
            [...stage.validationOverrides]
              .sort((a, b) => compareCodeUnits(a.name, b.name))
              .map(override => canonicalValidationOperation(override))
          ),
          ...(stage.dashboard === undefined ? {} : { dashboard: canonicalDashboard(stage.dashboard) }),
        }))
    ),
    transitions: Object.freeze(
      [...source.transitions]
        .sort((a, b) => compareCodeUnits(a.id, b.id))
        .map(transition =>
          transition.mode === 'manual'
            ? {
                ...transition,
                allowedRoles: sortedStrings(transition.allowedRoles),
              }
            : { ...transition }
        )
    ),
    actionBindings: Object.freeze(
      [...source.actionBindings]
        .map(canonicalActionBinding)
        .sort(
          (a, b) =>
            compareCodeUnits(actionScopeKey(a), actionScopeKey(b)) || a.order - b.order || compareCodeUnits(a.id, b.id)
        )
    ),
  };
  const verified = inspectPublishableRecordDefinitionAggregate(canonical);
  if (!verified.success) throw new RecordDefinitionCanonicalizationError();
  freezeRuntimeTree(verified.data);
  return verified.data;
}

export function serializeCanonicalRecordDefinition(definition: PublishableRecordDefinitionAggregateDto): string {
  return stableSerialize(canonicalizeRecordDefinition(definition));
}

export function hashRecordDefinition(
  definition: PublishableRecordDefinitionAggregateDto
): RecordDefinitionCanonicalHash {
  const digest = createHash('sha256').update(serializeCanonicalRecordDefinition(definition), 'utf8').digest('hex');
  return parseRecordDefinitionCanonicalHash(`sha256:${digest}`);
}

function shapeFailureCode(failure: RecordDefinitionContractInspectionFailure): RecordDefinitionValidationIssueCode {
  const reason = failure.preflightFailure?.reason;
  if (reason === 'bytes') return 'draft-payload-too-large';
  if (reason === 'depth') return 'draft-payload-too-deep';
  if (reason === 'cardinality' || reason === 'work') return 'draft-payload-too-complex';
  if (reason !== undefined) return 'draft-payload-unsafe-structure';
  return 'draft-invalid-payload';
}

function addShapeIssues(state: ValidationState, failure: RecordDefinitionContractInspectionFailure): void {
  if (failure.preflightFailure !== undefined) {
    addIssue(
      state,
      shapeFailureCode(failure),
      legacyPathToPointer(failure.preflightFailure.path),
      'The draft payload does not satisfy the bounded safe-data contract.'
    );
    return;
  }
  for (const issue of failure.issues) {
    addIssue(
      state,
      issue.kind === 'unknown-property' ? 'draft-unknown-property' : 'draft-invalid-payload',
      pointer(issue.path),
      issue.kind === 'unknown-property'
        ? 'The draft payload contains a property outside the versioned contract.'
        : 'The draft payload value does not satisfy the versioned contract.'
    );
  }
  if (failure.issues.length === 0) {
    addIssue(state, 'draft-invalid-payload', '/', 'The draft payload does not satisfy the versioned contract.');
  }
}

function addExpressionIssue(
  state: ValidationState,
  engine: 'jsonata' | 'handlebars',
  source: string,
  path: string,
  destination: 'plain-text' | 'html-text' = 'plain-text'
): void {
  try {
    if (engine === 'jsonata') compileManagedJsonataExpression(source);
    else compileManagedHandlebarsTemplate(source, destination);
  } catch {
    addIssue(
      state,
      engine === 'jsonata' ? 'invalid-jsonata-expression' : 'invalid-handlebars-template',
      path,
      engine === 'jsonata'
        ? 'The expression does not satisfy the managed JSONata contract.'
        : 'The template does not satisfy the managed Handlebars contract.'
    );
  }
}

function validateDashboardExpressions(
  state: ValidationState,
  dashboard: RecordDefinitionDashboardDto,
  path: string
): void {
  dashboard.columns.forEach((column, index) => {
    if (column.value.kind === 'jsonata') {
      addExpressionIssue(state, 'jsonata', column.value.expression, `${path}/columns/${index}/value/expression`);
    }
    if (column.render !== undefined) {
      addExpressionIssue(
        state,
        'handlebars',
        column.render.template,
        `${path}/columns/${index}/render/template`,
        'html-text'
      );
    }
  });
}

function validatePresentExpressions(state: ValidationState, definition: DraftRecordDefinitionAggregateDto): void {
  definition.transitions.forEach((transition, index) => {
    if (transition.eligibilityCondition !== undefined) {
      addExpressionIssue(
        state,
        'jsonata',
        transition.eligibilityCondition,
        `/transitions/${index}/eligibilityCondition`
      );
    }
    if (transition.condition !== undefined) {
      addExpressionIssue(state, 'jsonata', transition.condition, `/transitions/${index}/condition`);
    }
  });
  if (definition.recordType.dashboard !== undefined) {
    validateDashboardExpressions(state, definition.recordType.dashboard, '/recordType/dashboard');
  }
  definition.stages.forEach((stage, index) => {
    if (stage.dashboard !== undefined)
      validateDashboardExpressions(state, stage.dashboard, `/stages/${index}/dashboard`);
  });
  definition.actionBindings.forEach((binding, bindingIndex) => {
    for (const name of Object.keys(binding.parameters).sort(compareCodeUnits)) {
      const value = binding.parameters[name];
      if (value?.kind === 'jsonata') {
        addExpressionIssue(
          state,
          'jsonata',
          value.expression,
          `/actionBindings/${bindingIndex}/parameters/${pointerSegment(name)}`
        );
      } else if (value?.kind === 'handlebars') {
        addExpressionIssue(
          state,
          'handlebars',
          value.template,
          `/actionBindings/${bindingIndex}/parameters/${pointerSegment(name)}`
        );
      }
    }
  });
}

interface FinalizedRedactions {
  readonly redactions: readonly RecordDefinitionRedactionDto[];
  readonly truncated: boolean;
}

function definitionRedactions(definition: DraftRecordDefinitionAggregateDto): FinalizedRedactions {
  const redactions: RecordDefinitionRedactionDto[] = [];
  let redactionCount = 0;
  definition.actionBindings.forEach((binding, bindingIndex) => {
    for (const name of Object.keys(binding.parameters).sort(compareCodeUnits)) {
      if (binding.parameters[name]?.kind === 'secret') {
        redactionCount += 1;
        if (redactions.length < RECORD_DEFINITION_VALIDATION_LIMITS.maxIssues) {
          redactions.push(
            Object.freeze({
              path: pointer(['actionBindings', bindingIndex, 'parameters', name]),
              reason: 'secret',
              marker: RECORD_DEFINITION_REDACTION_MARKER,
            })
          );
        }
      }
    }
  });
  redactions.sort((left, right) => compareCodeUnits(left.path, right.path));
  return Object.freeze({
    redactions: Object.freeze(redactions),
    truncated: redactionCount > RECORD_DEFINITION_VALIDATION_LIMITS.maxIssues,
  });
}

function validationReport(
  coordinates: RecordDefinitionValidationCoordinates,
  scope: 'draft-save' | 'publication',
  state: ValidationState,
  definitionState: 'draft-incomplete' | 'publishable',
  finalizedRedactions: FinalizedRedactions = Object.freeze({
    redactions: Object.freeze([]),
    truncated: false,
  })
): RecordDefinitionValidationReportDto {
  const finalized = finalizedIssues(state);
  const hasErrors = state.issues.some(issue => issue.severity === 'error');
  return Object.freeze({
    schemaVersion: RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
    brandId: coordinates.brandId,
    recordTypeKey: coordinates.recordTypeKey,
    scope,
    status: hasErrors ? 'invalid' : 'valid',
    definitionState,
    validatedDraftVersion: coordinates.draftVersion,
    validatedActiveRevisionNumber: coordinates.activeRevisionNumber,
    issues: finalized.issues,
    redactions: finalizedRedactions.redactions,
    truncated: finalized.truncated || finalizedRedactions.truncated,
  });
}

export function validateRecordDefinitionDraftPayload(
  request: RecordDefinitionDraftPayloadValidationRequest
): RecordDefinitionDraftPayloadValidationResult {
  const state: ValidationState = { issues: [] };
  const inspected = inspectDraftRecordDefinitionAggregate(request.definition);
  if (!inspected.success) {
    addShapeIssues(state, inspected);
    return Object.freeze({ ok: false, report: validationReport(request, 'draft-save', state, 'draft-incomplete') });
  }
  validatePresentExpressions(state, inspected.data);
  const report = validationReport(
    request,
    'draft-save',
    state,
    'draft-incomplete',
    definitionRedactions(inspected.data)
  );
  if (report.status === 'invalid') return Object.freeze({ ok: false, report });
  freezeRuntimeTree(inspected.data);
  return Object.freeze({ ok: true, definition: inspected.data, report });
}

function requireValue(state: ValidationState, value: RuntimeValue, path: string): boolean {
  if (value !== undefined) return true;
  addIssue(state, 'publication-incomplete', path, 'A value required for publication is missing.');
  return false;
}

function validatePublicationCompleteness(state: ValidationState, definition: DraftRecordDefinitionAggregateDto): void {
  requireValue(state, definition.recordType.labels, '/recordType/labels');
  requireValue(state, definition.recordType.labels?.name, '/recordType/labels/name');
  requireValue(state, definition.recordType.labels?.namePlural, '/recordType/labels/namePlural');
  requireValue(state, definition.recordType.searchable, '/recordType/searchable');
  requireValue(state, definition.recordType.searchFilters, '/recordType/searchFilters');
  requireValue(state, definition.recordType.relationships, '/recordType/relationships');
  requireValue(state, definition.recordType.transferResponsibility, '/recordType/transferResponsibility');
  requireValue(
    state,
    definition.recordType.transferResponsibility?.fields,
    '/recordType/transferResponsibility/fields'
  );
  requireValue(
    state,
    definition.recordType.transferResponsibility?.roleRules,
    '/recordType/transferResponsibility/roleRules'
  );
  requireValue(state, definition.recordType.validation, '/recordType/validation');
  requireValue(state, definition.recordType.validation?.mode, '/recordType/validation/mode');
  requireValue(state, definition.recordType.validation?.operations, '/recordType/validation/operations');
  requireValue(state, definition.recordType.concurrency, '/recordType/concurrency');
  requireValue(state, definition.recordType.concurrency?.mode, '/recordType/concurrency/mode');

  definition.stages.forEach((stage, index) => {
    const base = `/stages/${index}`;
    requireValue(state, stage.label, `${base}/label`);
    requireValue(state, stage.formReference, `${base}/formReference`);
    requireValue(state, stage.viewRoles, `${base}/viewRoles`);
    requireValue(state, stage.editRoles, `${base}/editRoles`);
    requireValue(state, stage.displayOrder, `${base}/displayOrder`);
    requireValue(state, stage.starting, `${base}/starting`);
    requireValue(state, stage.terminal, `${base}/terminal`);
    requireValue(state, stage.validationOverrides, `${base}/validationOverrides`);
  });

  definition.transitions.forEach((transition, index) => {
    const base = `/transitions/${index}`;
    requireValue(state, transition.sourceStageKey, `${base}/sourceStageKey`);
    requireValue(state, transition.targetStageKey, `${base}/targetStageKey`);
    requireValue(state, transition.label, `${base}/label`);
    if (!requireValue(state, transition.mode, `${base}/mode`)) return;
    if (transition.mode === 'manual') {
      requireValue(state, transition.allowedRoles, `${base}/allowedRoles`);
      for (const field of ['event', 'priority', 'condition'] as const) {
        if (transition[field] !== undefined) {
          addIssue(
            state,
            'manual-transition-field-not-allowed',
            `${base}/${field}`,
            'This field is not supported by a manual transition.'
          );
        }
      }
      return;
    }
    requireValue(state, transition.event, `${base}/event`);
    requireValue(state, transition.priority, `${base}/priority`);
    requireValue(state, transition.condition, `${base}/condition`);
    for (const field of ['allowedRoles', 'eligibilityCondition'] as const) {
      if (transition[field] !== undefined) {
        addIssue(
          state,
          'automatic-transition-field-not-allowed',
          `${base}/${field}`,
          'This field is not supported by an automatic transition.'
        );
      }
    }
  });
}

function duplicateValues<Value>(
  state: ValidationState,
  values: readonly Value[],
  identity: (value: Value) => string,
  path: (index: number) => string,
  code: RecordDefinitionValidationIssueCode,
  message: string
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const key = identity(value);
    if (seen.has(key)) addIssue(state, code, path(index), message);
    else seen.add(key);
  });
}

function validateRoleList(
  state: ValidationState,
  roles: readonly string[],
  path: string,
  availableRoles: ReadonlySet<string>
): void {
  duplicateValues(
    state,
    roles,
    role => role,
    index => `${path}/${index}`,
    'duplicate-role-reference',
    'A role may be referenced only once in this list.'
  );
  roles.forEach((role, index) => {
    if (!availableRoles.has(role)) {
      addIssue(state, 'role-not-found', `${path}/${index}`, 'The referenced role is not available in this brand.');
    }
  });
}

function validateDashboard(state: ValidationState, dashboard: RecordDefinitionDashboardDto, path: string): void {
  duplicateValues(
    state,
    dashboard.columns,
    column => column.id,
    index => `${path}/columns/${index}/id`,
    'duplicate-dashboard-column-id',
    'Dashboard column IDs must be unique within a dashboard.'
  );
  duplicateValues(
    state,
    dashboard.columns,
    column => String(column.displayOrder),
    index => `${path}/columns/${index}/displayOrder`,
    'duplicate-dashboard-column-order',
    'Dashboard column display order must be unique within a dashboard.'
  );
  // Activation must only accept values the dashboard consumer can project.
  // Drafts may retain JSONata for editing, but publication and rollback cannot activate it.
  dashboard.columns.forEach((column, index) => {
    if (column.value.kind === 'jsonata') {
      addIssue(
        state,
        'unsupported-dashboard-value',
        `${path}/columns/${index}/value`,
        'Dashboard values must use a path; JSONata dashboard values are not supported by the runtime.'
      );
    }
  });
  validateDashboardExpressions(state, dashboard, path);
}

interface ValidationCatalog {
  readonly roles: ReadonlySet<string>;
  readonly forms: ReadonlyMap<string, RecordDefinitionFormCapability>;
  readonly recordTypeKeys: ReadonlySet<string>;
  readonly administrativeRole: string;
}

function boundedReferenceList(values: readonly string[] | undefined, maximum: number): boolean {
  return (
    values === undefined ||
    (Array.isArray(values) &&
      values.length <= maximum &&
      values.every(value => typeof value === 'string' && RECORD_VALIDATION_REFERENCE_PATTERN.test(value)))
  );
}

function validFormOperation(operation: ValidationOperationDefinition): boolean {
  return (
    isRuntimeRecord(operation) &&
    boundedReferenceList(
      operation.enabledValidationGroups,
      RECORD_DEFINITION_VALIDATION_LIMITS.maxFormValidationGroups
    ) &&
    operation.enabledValidationGroups !== undefined &&
    boundedReferenceList(operation.roles, RECORD_DEFINITION_VALIDATION_LIMITS.maxCatalogEntries) &&
    boundedReferenceList(operation.allowedTargetSteps, RECORD_DEFINITION_VALIDATION_LIMITS.maxCatalogEntries) &&
    (operation.label === undefined ||
      (typeof operation.label === 'string' &&
        operation.label.trim().length > 0 &&
        operation.label.trim().length <= VALIDATION_OPERATION_LABEL_MAX_LENGTH)) &&
    (operation.description === undefined ||
      (typeof operation.description === 'string' &&
        operation.description.trim().length > 0 &&
        operation.description.trim().length <= VALIDATION_OPERATION_DESCRIPTION_MAX_LENGTH))
  );
}

function boundedCatalog<Value>(
  state: ValidationState,
  values: readonly Value[],
  path: string,
  maximum: number = RECORD_DEFINITION_VALIDATION_LIMITS.maxCatalogEntries
): readonly Value[] {
  if (values.length <= maximum) return values;
  addIssue(state, 'validation-catalog-invalid', path, 'A server-owned validation catalog exceeds its safe bound.');
  return values.slice(0, maximum);
}

function validationCatalog(
  state: ValidationState,
  request: RecordDefinitionPublicationValidationRequest
): ValidationCatalog {
  const roles = boundedCatalog(state, request.roles, '/validationContext/roles');
  const roleSet = new Set<string>();
  for (const role of roles) {
    if (typeof role !== 'string' || role.length === 0 || role.length > 128) {
      addIssue(state, 'validation-catalog-invalid', '/validationContext/roles', 'The role catalog is invalid.');
    } else {
      roleSet.add(role);
    }
  }

  const forms = boundedCatalog(
    state,
    request.forms,
    '/validationContext/forms',
    RECORD_DEFINITION_VALIDATION_LIMITS.maxFormCapabilities
  );
  const formMap = new Map<string, RecordDefinitionFormCapability>();
  for (const form of forms) {
    const operationCatalogValid = isRuntimeRecord(form.validationOperations);
    const validationGroupCatalogValid = isRuntimeRecord(form.validationGroups);
    const operationNames = operationCatalogValid ? Object.keys(form.validationOperations) : [];
    const validationGroupNames = validationGroupCatalogValid ? Object.keys(form.validationGroups) : [];
    const operationsValid =
      operationCatalogValid &&
      operationNames.length <= RECORD_DEFINITION_VALIDATION_LIMITS.maxFormValidationOperations &&
      operationNames.every(
        name => VALIDATION_OPERATION_NAME_PATTERN.test(name) && validFormOperation(form.validationOperations[name])
      );
    const groupsValid =
      validationGroupCatalogValid &&
      validationGroupNames.length <= RECORD_DEFINITION_VALIDATION_LIMITS.maxFormValidationGroups &&
      validationGroupNames.every(name => RECORD_VALIDATION_REFERENCE_PATTERN.test(name));
    if (
      typeof form.reference !== 'string' ||
      form.reference.length === 0 ||
      form.reference.length > 128 ||
      !RECORD_VALIDATION_REFERENCE_PATTERN.test(form.reference) ||
      !operationsValid ||
      !groupsValid ||
      formMap.has(form.reference)
    ) {
      addIssue(state, 'validation-catalog-invalid', '/validationContext/forms', 'The form catalog is invalid.');
      continue;
    }
    formMap.set(form.reference, form);
  }

  const recordTypeKeys = boundedCatalog(
    state,
    request.availableRecordTypeKeys,
    '/validationContext/availableRecordTypeKeys'
  );
  const recordTypeSet = new Set<string>(recordTypeKeys);
  recordTypeSet.add(request.recordTypeKey);
  const administrativeRole = request.administrativeRole ?? 'Admin';
  if (!roleSet.has(administrativeRole)) {
    addIssue(
      state,
      'administrative-role-unavailable',
      '/validationContext/administrativeRole',
      'The configured administrative role is not available in this brand.'
    );
  }
  return Object.freeze({ roles: roleSet, forms: formMap, recordTypeKeys: recordTypeSet, administrativeRole });
}

function validateRecordTypeCollections(
  state: ValidationState,
  definition: DraftRecordDefinitionAggregateDto,
  catalog: ValidationCatalog
): void {
  const recordType = definition.recordType;
  const searchFilters = recordType.searchFilters ?? [];
  duplicateValues(
    state,
    searchFilters,
    filter => filter.id,
    index => `/recordType/searchFilters/${index}/id`,
    'duplicate-search-filter-id',
    'Search-filter IDs must be unique.'
  );
  const relationships = recordType.relationships ?? [];
  duplicateValues(
    state,
    relationships,
    relationship => relationship.id,
    index => `/recordType/relationships/${index}/id`,
    'duplicate-relationship-id',
    'Relationship IDs must be unique.'
  );
  relationships.forEach((relationship, index) => {
    if (!catalog.recordTypeKeys.has(relationship.targetRecordTypeKey)) {
      addIssue(
        state,
        'record-type-reference-not-found',
        `/recordType/relationships/${index}/targetRecordTypeKey`,
        'The referenced record type is not available in this brand.'
      );
    }
  });

  const transfer = recordType.transferResponsibility;
  const fields = transfer?.fields ?? [];
  duplicateValues(
    state,
    fields,
    field => field.field,
    index => `/recordType/transferResponsibility/fields/${index}/field`,
    'duplicate-transfer-field',
    'Transfer-responsibility fields must be unique.'
  );
  const fieldSet = new Set(fields.map(field => field.field));
  const roleRules = transfer?.roleRules ?? [];
  duplicateValues(
    state,
    roleRules,
    rule => rule.role,
    index => `/recordType/transferResponsibility/roleRules/${index}/role`,
    'duplicate-transfer-role-rule',
    'Transfer-responsibility role rules must be unique.'
  );
  roleRules.forEach((rule, ruleIndex) => {
    if (!catalog.roles.has(rule.role)) {
      addIssue(
        state,
        'role-not-found',
        `/recordType/transferResponsibility/roleRules/${ruleIndex}/role`,
        'The referenced role is not available in this brand.'
      );
    }
    duplicateValues(
      state,
      rule.editableFields,
      field => field,
      index => `/recordType/transferResponsibility/roleRules/${ruleIndex}/editableFields/${index}`,
      'duplicate-validation-reference',
      'A field may be referenced only once in this list.'
    );
    rule.editableFields.forEach((field, fieldIndex) => {
      if (!fieldSet.has(field)) {
        addIssue(
          state,
          'transfer-role-field-not-found',
          `/recordType/transferResponsibility/roleRules/${ruleIndex}/editableFields/${fieldIndex}`,
          'The editable field is not declared by transfer-responsibility fields.'
        );
      }
    });
  });
  if (recordType.dashboard !== undefined) validateDashboard(state, recordType.dashboard, '/recordType/dashboard');
}

interface StageIndex {
  readonly byKey: ReadonlyMap<string, { readonly stage: DraftWorkflowStageDto; readonly index: number }>;
  readonly starting: readonly { readonly stage: DraftWorkflowStageDto; readonly index: number }[];
}

function validateStages(
  state: ValidationState,
  definition: DraftRecordDefinitionAggregateDto,
  catalog: ValidationCatalog,
  activeDefinition: PublishableRecordDefinitionAggregateDto | null
): StageIndex {
  duplicateValues(
    state,
    definition.stages,
    stage => stage.key,
    index => `/stages/${index}/key`,
    'duplicate-stage-key',
    'Workflow stage keys must be unique.'
  );
  const stagesWithOrder = definition.stages.filter(
    (stage): stage is DraftWorkflowStageDto & { readonly displayOrder: number } => stage.displayOrder !== undefined
  );
  duplicateValues(
    state,
    stagesWithOrder,
    stage => String(stage.displayOrder),
    stageIndex => {
      const index = definition.stages.indexOf(stagesWithOrder[stageIndex]);
      return `/stages/${index}/displayOrder`;
    },
    'duplicate-stage-display-order',
    'Workflow stage display order must be unique.'
  );

  const byKey = new Map<string, { readonly stage: DraftWorkflowStageDto; readonly index: number }>();
  const starting: { readonly stage: DraftWorkflowStageDto; readonly index: number }[] = [];
  definition.stages.forEach((stage, index) => {
    if (!byKey.has(stage.key)) byKey.set(stage.key, { stage, index });
    if (stage.starting === true) starting.push({ stage, index });
    if (stage.baseRecordTypeKey !== undefined && !catalog.recordTypeKeys.has(stage.baseRecordTypeKey)) {
      addIssue(
        state,
        'base-record-type-reference-not-found',
        `/stages/${index}/baseRecordTypeKey`,
        'The base record type is not available in this brand.'
      );
    }
    const activeStage = activeDefinition?.stages.find(candidate => candidate.key === stage.key);
    if (activeStage !== undefined && stage.baseRecordTypeKey !== activeStage.baseRecordTypeKey) {
      addIssue(
        state,
        'base-record-type-changed',
        `/stages/${index}/baseRecordTypeKey`,
        'A published stage base record type is immutable.'
      );
    }
    if (stage.viewRoles !== undefined) {
      validateRoleList(state, stage.viewRoles, `/stages/${index}/viewRoles`, catalog.roles);
    }
    if (stage.editRoles !== undefined) {
      validateRoleList(state, stage.editRoles, `/stages/${index}/editRoles`, catalog.roles);
      const viewRoles = new Set(stage.viewRoles ?? []);
      stage.editRoles.forEach((role, roleIndex) => {
        if (!viewRoles.has(role)) {
          addIssue(
            state,
            'stage-edit-role-cannot-view',
            `/stages/${index}/editRoles/${roleIndex}`,
            'A stage edit role must also have view access.'
          );
        }
      });
    }
    if (
      stage.viewRoles !== undefined &&
      stage.editRoles !== undefined &&
      (!stage.viewRoles.includes(catalog.administrativeRole) || !stage.editRoles.includes(catalog.administrativeRole))
    ) {
      addIssue(
        state,
        'administrative-stage-lockout',
        `/stages/${index}`,
        'The administrative role must retain view and edit access to every stage.'
      );
    }
    if (stage.dashboard !== undefined) validateDashboard(state, stage.dashboard, `/stages/${index}/dashboard`);
  });
  if (starting.length !== 1) {
    addIssue(state, 'starting-stage-count-invalid', '/stages', 'Exactly one starting workflow stage is required.');
  }
  return Object.freeze({ byKey, starting: Object.freeze(starting) });
}

interface TransitionIndex {
  readonly outgoing: ReadonlyMap<string, readonly string[]>;
}

function validateTransitions(
  state: ValidationState,
  definition: DraftRecordDefinitionAggregateDto,
  stages: StageIndex,
  catalog: ValidationCatalog
): TransitionIndex {
  duplicateValues(
    state,
    definition.transitions,
    transition => transition.id,
    index => `/transitions/${index}/id`,
    'duplicate-transition-id',
    'Workflow transition IDs must be unique.'
  );
  const priorities = new Set<string>();
  const outgoing = new Map<string, string[]>();
  definition.transitions.forEach((transition, index) => {
    const base = `/transitions/${index}`;
    const source = transition.sourceStageKey;
    const target = transition.targetStageKey;
    if (source !== undefined && !stages.byKey.has(source)) {
      addIssue(
        state,
        'transition-source-stage-not-found',
        `${base}/sourceStageKey`,
        'The source stage does not exist.'
      );
    }
    if (target !== undefined && !stages.byKey.has(target)) {
      addIssue(
        state,
        'transition-target-stage-not-found',
        `${base}/targetStageKey`,
        'The target stage does not exist.'
      );
    }
    if (source !== undefined && target !== undefined && source === target) {
      addIssue(
        state,
        'transition-self-loop',
        `${base}/targetStageKey`,
        'A workflow transition cannot target its source stage.'
      );
    }
    if (source !== undefined && target !== undefined && stages.byKey.has(source) && stages.byKey.has(target)) {
      const targets = outgoing.get(source) ?? [];
      targets.push(target);
      outgoing.set(source, targets);
    }
    if (
      transition.mode === 'automatic' &&
      source !== undefined &&
      transition.event !== undefined &&
      transition.priority !== undefined
    ) {
      const key = stableSerialize([source, transition.event, transition.priority]);
      if (priorities.has(key)) {
        addIssue(
          state,
          'duplicate-automatic-priority',
          `${base}/priority`,
          'Automatic transition priority must be unique for each source stage and event.'
        );
      } else priorities.add(key);
    }
    if (transition.mode === 'manual' && transition.allowedRoles !== undefined) {
      validateRoleList(state, transition.allowedRoles, `${base}/allowedRoles`, catalog.roles);
      if (transition.allowedRoles.length === 0) {
        addIssue(
          state,
          'manual-transition-role-required',
          `${base}/allowedRoles`,
          'A manual transition requires at least one allowed role.'
        );
      }
      const sourceRoles = new Set(source === undefined ? [] : (stages.byKey.get(source)?.stage.editRoles ?? []));
      transition.allowedRoles.forEach((role, roleIndex) => {
        if (!sourceRoles.has(role)) {
          addIssue(
            state,
            'manual-transition-role-not-authorized',
            `${base}/allowedRoles/${roleIndex}`,
            'A manual transition role must have edit access to its source stage.'
          );
        }
      });
    }
  });
  return Object.freeze({
    outgoing: new Map([...outgoing].map(([key, targets]) => [key, Object.freeze(targets)])),
  });
}

function validateGraph(
  state: ValidationState,
  definition: DraftRecordDefinitionAggregateDto,
  stages: StageIndex,
  transitions: TransitionIndex
): void {
  const start = stages.starting.length === 1 ? stages.starting[0]?.stage.key : undefined;
  if (start !== undefined) {
    const reachable = new Set<string>();
    const pending: string[] = [start];
    while (pending.length > 0) {
      const stage = pending.shift();
      if (stage === undefined || reachable.has(stage)) continue;
      reachable.add(stage);
      pending.push(...(transitions.outgoing.get(stage) ?? []));
    }
    definition.stages.forEach((stage, index) => {
      if (!reachable.has(stage.key)) {
        addIssue(
          state,
          'unreachable-stage',
          `/stages/${index}/key`,
          'This stage is unreachable from the starting stage.'
        );
      }
    });
  }

  const terminalKeys = new Set<string>(
    definition.stages.filter(stage => stage.terminal === true).map(stage => stage.key)
  );
  const reverse = new Map<string, string[]>();
  for (const [source, targets] of transitions.outgoing) {
    for (const target of targets) {
      const sources = reverse.get(target) ?? [];
      sources.push(source);
      reverse.set(target, sources);
    }
  }
  const terminalReachable = new Set<string>();
  const pending = [...terminalKeys];
  while (pending.length > 0) {
    const stage = pending.shift();
    if (stage === undefined || terminalReachable.has(stage)) continue;
    terminalReachable.add(stage);
    pending.push(...(reverse.get(stage) ?? []));
  }
  definition.stages.forEach((stage, index) => {
    if (stage.terminal !== false) return;
    const exits = transitions.outgoing.get(stage.key) ?? [];
    if (exits.length === 0) {
      addIssue(
        state,
        'non-terminal-stage-has-no-exit',
        `/stages/${index}/terminal`,
        'A non-terminal stage requires an outgoing transition.'
      );
    } else if (!terminalReachable.has(stage.key)) {
      addIssue(
        state,
        'non-terminal-stage-has-no-terminal-path',
        `/stages/${index}/terminal`,
        'A non-terminal stage requires a path to a terminal stage.'
      );
    }
  });
}

function validateReferenceList(state: ValidationState, values: readonly string[], path: string): void {
  duplicateValues(
    state,
    values,
    value => value,
    index => `${path}/${index}`,
    'duplicate-validation-reference',
    'A validation reference may occur only once in this list.'
  );
}

function formOperation(form: RecordDefinitionFormCapability, name: string): ValidationOperationDefinition | undefined {
  return Object.hasOwn(form.validationOperations, name) ? form.validationOperations[name] : undefined;
}

function formGroupSet(form: RecordDefinitionFormCapability): ReadonlySet<string> {
  return new Set(
    Object.keys(form.validationGroups).slice(0, RECORD_DEFINITION_VALIDATION_LIMITS.maxFormValidationGroups)
  );
}

function validateOperationGroups(
  state: ValidationState,
  operation: Pick<RecordDefinitionValidationOperationDto, 'enabledValidationGroups'>,
  form: RecordDefinitionFormCapability,
  path: string
): void {
  const groups = formGroupSet(form);
  validateReferenceList(state, operation.enabledValidationGroups, `${path}/enabledValidationGroups`);
  operation.enabledValidationGroups.forEach((group, index) => {
    if (group !== 'all' && group !== 'none' && !groups.has(group)) {
      addIssue(
        state,
        'validation-group-not-found',
        `${path}/enabledValidationGroups/${index}`,
        'The validation group is not available on the referenced form.'
      );
    }
  });
}

interface EffectiveDefinitionValidationOperationPolicy {
  readonly enabledValidationGroups: readonly string[];
  readonly roles?: readonly string[];
  readonly allowedTargetStages?: readonly string[];
}

function effectiveValidationOperationPolicy(
  form: ValidationOperationDefinition,
  recordType: RecordDefinitionValidationOperationDto,
  stage: RecordDefinitionStageValidationOperationOverrideDto | undefined
): EffectiveDefinitionValidationOperationPolicy {
  const recordRoles = intersectValidationOperationRestrictions(form.roles, recordType.roles);
  const recordTargets = intersectValidationOperationRestrictions(
    form.allowedTargetSteps,
    recordType.allowedTargetStages
  );
  const roles = intersectValidationOperationRestrictions(recordRoles, stage?.roles);
  const targets = intersectValidationOperationRestrictions(recordTargets, stage?.allowedTargetStages);
  return Object.freeze({
    enabledValidationGroups: stage?.enabledValidationGroups ?? recordType.enabledValidationGroups,
    ...(roles === undefined ? {} : { roles }),
    ...(targets === undefined ? {} : { allowedTargetStages: targets }),
  });
}

function validateValidationPolicies(
  state: ValidationState,
  definition: DraftRecordDefinitionAggregateDto,
  stages: StageIndex,
  catalog: ValidationCatalog
): void {
  const operations = definition.recordType.validation?.operations ?? [];
  duplicateValues(
    state,
    operations,
    operation => operation.name,
    index => `/recordType/validation/operations/${index}/name`,
    'duplicate-validation-operation',
    'Record-type validation operation names must be unique.'
  );
  const operationsByName = new Map<
    string,
    { readonly operation: RecordDefinitionValidationOperationDto; readonly index: number }
  >();
  operations.forEach((operation, index) => {
    if (!operationsByName.has(operation.name)) operationsByName.set(operation.name, { operation, index });
    if (operation.roles !== undefined) {
      validateRoleList(state, operation.roles, `/recordType/validation/operations/${index}/roles`, catalog.roles);
    }
    if (operation.allowedTargetStages !== undefined) {
      validateReferenceList(
        state,
        operation.allowedTargetStages,
        `/recordType/validation/operations/${index}/allowedTargetStages`
      );
      operation.allowedTargetStages.forEach((target, targetIndex) => {
        if (!stages.byKey.has(target)) {
          addIssue(
            state,
            'validation-target-stage-not-found',
            `/recordType/validation/operations/${index}/allowedTargetStages/${targetIndex}`,
            'The validation operation target stage does not exist.'
          );
        }
      });
    }
    const resolvedSomewhere = definition.stages.some(stage => {
      if (stage.formReference === undefined) return false;
      const form = catalog.forms.get(stage.formReference);
      return form !== undefined && formOperation(form, operation.name) !== undefined;
    });
    if (!resolvedSomewhere) {
      addIssue(
        state,
        'form-validation-operation-not-found',
        `/recordType/validation/operations/${index}/name`,
        'The validation operation is not exposed by any referenced form.'
      );
    }
  });

  definition.stages.forEach((stage, stageIndex) => {
    const overrides = stage.validationOverrides ?? [];
    duplicateValues(
      state,
      overrides,
      override => override.name,
      index => `/stages/${stageIndex}/validationOverrides/${index}/name`,
      'duplicate-stage-validation-operation',
      'Stage validation operation overrides must be unique.'
    );
    const form = stage.formReference === undefined ? undefined : catalog.forms.get(stage.formReference);
    if (form !== undefined) {
      for (const entry of operationsByName.values()) {
        const formPolicy = formOperation(form, entry.operation.name);
        if (formPolicy !== undefined) {
          validateOperationGroups(
            state,
            effectiveValidationOperationPolicy(formPolicy, entry.operation, undefined),
            form,
            `/recordType/validation/operations/${entry.index}`
          );
        }
      }
    }
    overrides.forEach((override, overrideIndex) => {
      const path = `/stages/${stageIndex}/validationOverrides/${overrideIndex}`;
      const base = operationsByName.get(override.name)?.operation;
      if (base === undefined) {
        addIssue(
          state,
          'stage-validation-operation-not-found',
          `${path}/name`,
          'The stage override does not reference a record-type validation operation.'
        );
      }
      if (override.roles !== undefined) {
        validateRoleList(state, override.roles, `${path}/roles`, catalog.roles);
      }
      if (override.allowedTargetStages !== undefined) {
        validateReferenceList(state, override.allowedTargetStages, `${path}/allowedTargetStages`);
        override.allowedTargetStages.forEach((target, targetIndex) => {
          if (!stages.byKey.has(target)) {
            addIssue(
              state,
              'validation-target-stage-not-found',
              `${path}/allowedTargetStages/${targetIndex}`,
              'The validation operation target stage does not exist.'
            );
          }
        });
      }
      if (base?.roles !== undefined && override.roles !== undefined) {
        const baseRoles = new Set(base.roles);
        override.roles.forEach((role, roleIndex) => {
          if (!baseRoles.has(role)) {
            addIssue(
              state,
              'stage-validation-role-broadening',
              `${path}/roles/${roleIndex}`,
              'A stage override cannot broaden record-type operation roles.'
            );
          }
        });
      }
      if (base?.allowedTargetStages !== undefined && override.allowedTargetStages !== undefined) {
        const baseTargets = new Set<string>(base.allowedTargetStages);
        override.allowedTargetStages.forEach((target, targetIndex) => {
          if (!baseTargets.has(target)) {
            addIssue(
              state,
              'stage-validation-target-broadening',
              `${path}/allowedTargetStages/${targetIndex}`,
              'A stage override cannot broaden record-type operation targets.'
            );
          }
        });
      }
      if (form !== undefined) {
        const formPolicy = formOperation(form, override.name);
        if (formPolicy === undefined) {
          addIssue(
            state,
            'form-validation-operation-not-found',
            `${path}/name`,
            'The stage form does not expose this validation operation.'
          );
        } else if (base !== undefined) {
          validateOperationGroups(state, effectiveValidationOperationPolicy(formPolicy, base, override), form, path);
        }
      }
    });
  });

  definition.transitions.forEach((transition, transitionIndex) => {
    if (transition.validationOperation === undefined) return;
    const path = `/transitions/${transitionIndex}/validationOperation`;
    const base = operationsByName.get(transition.validationOperation)?.operation;
    if (base === undefined) {
      addIssue(state, 'validation-operation-not-found', path, 'The transition validation operation is not declared.');
      return;
    }
    const target = transition.targetStageKey === undefined ? undefined : stages.byKey.get(transition.targetStageKey);
    const form = target?.stage.formReference === undefined ? undefined : catalog.forms.get(target.stage.formReference);
    const formPolicy = form === undefined ? undefined : formOperation(form, transition.validationOperation);
    if (form !== undefined && formPolicy === undefined) {
      addIssue(
        state,
        'form-validation-operation-not-found',
        path,
        'The target-stage form does not expose this validation operation.'
      );
    }
    const override = target?.stage.validationOverrides?.find(
      candidate => candidate.name === transition.validationOperation
    );
    const effective =
      formPolicy === undefined ? undefined : effectiveValidationOperationPolicy(formPolicy, base, override);
    if (
      effective !== undefined &&
      transition.targetStageKey !== undefined &&
      effective.allowedTargetStages !== undefined &&
      !effective.allowedTargetStages.includes(transition.targetStageKey)
    ) {
      addIssue(
        state,
        'validation-target-not-allowed',
        path,
        'The validation operation does not permit this transition target.'
      );
    }
    if (transition.mode === 'manual' && transition.allowedRoles !== undefined && effective?.roles !== undefined) {
      const operationRoles = new Set(effective.roles);
      transition.allowedRoles.forEach((role, roleIndex) => {
        if (!operationRoles.has(role)) {
          addIssue(
            state,
            'validation-role-not-authorized',
            `/transitions/${transitionIndex}/allowedRoles/${roleIndex}`,
            'The validation operation does not authorize this transition role.'
          );
        }
      });
    }
    if (form !== undefined && effective !== undefined) {
      validateOperationGroups(
        state,
        effective,
        form,
        override === undefined
          ? `/recordType/validation/operations/${operationsByName.get(base.name)?.index ?? 0}`
          : `/stages/${target?.index ?? 0}/validationOverrides/${target?.stage.validationOverrides?.indexOf(override) ?? 0}`
      );
    }
  });
}

function validateForms(
  state: ValidationState,
  definition: DraftRecordDefinitionAggregateDto,
  catalog: ValidationCatalog
): void {
  definition.stages.forEach((stage, index) => {
    if (stage.formReference !== undefined && !catalog.forms.has(stage.formReference)) {
      addIssue(state, 'form-not-found', `/stages/${index}/formReference`, 'The referenced form is not available.');
    }
  });
}

function validateActions(
  state: ValidationState,
  definition: DraftRecordDefinitionAggregateDto,
  recordTypeKey: RecordDefinitionKey,
  registry: RedboxActionRegistry
): void {
  const transitionIds = new Set(definition.transitions.map(transition => transition.id));
  definition.actionBindings.forEach((binding, index) => {
    if (binding.scope.context === 'workflow-transition' && !transitionIds.has(binding.scope.scopeId)) {
      addIssue(
        state,
        'transition-action-scope-not-found',
        `/actionBindings/${index}/scope/scopeId`,
        'The action binding references no transition in this definition.'
      );
    }
  });
  const actionResult = validateActionPlan(registry, {
    schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
    recordTypeKey,
    bindings: definition.actionBindings,
  });
  if (!actionResult.ok) {
    for (const issue of actionResult.issues) {
      addIssue(state, issue.code, legacyPathToPointer(issue.path), issue.message);
    }
  }
}

function validateStorageCapability(
  state: ValidationState,
  definition: DraftRecordDefinitionAggregateDto,
  provider: StorageCapabilityProvider | null | undefined
): void {
  if (definition.recordType.concurrency?.mode === 'strict' && !hasFullRecordStorageConcurrencyCapability(provider)) {
    addIssue(
      state,
      'storage-concurrency-capability-unavailable',
      '/recordType/concurrency/mode',
      'Strict concurrency requires the complete storage concurrency capability.'
    );
  }
}

function withoutProperty<Value extends object>(value: Value, property: keyof Value): object {
  const copy = { ...value };
  delete copy[property];
  return copy;
}

function collectionChanges<Value extends object>(
  changes: RecordDefinitionStructuralChangeDto[],
  active: readonly Value[],
  draft: readonly Value[],
  identity: (value: Value) => string,
  path: string,
  orderProperty?: keyof Value
): void {
  const activeById = new Map(active.map((value, index) => [identity(value), { value, index }]));
  const draftById = new Map(draft.map((value, index) => [identity(value), { value, index }]));
  for (const [id, entry] of activeById) {
    const candidate = draftById.get(id);
    if (candidate === undefined) {
      changes.push(Object.freeze({ path: `${path}/${entry.index}`, kind: 'removed' }));
      continue;
    }
    if (stableSerialize(entry.value) === stableSerialize(candidate.value)) continue;
    const reorderedOnly =
      orderProperty !== undefined &&
      stableSerialize(withoutProperty(entry.value, orderProperty)) ===
        stableSerialize(withoutProperty(candidate.value, orderProperty));
    changes.push(Object.freeze({ path: `${path}/${candidate.index}`, kind: reorderedOnly ? 'reordered' : 'changed' }));
  }
  for (const [id, entry] of draftById) {
    if (!activeById.has(id)) changes.push(Object.freeze({ path: `${path}/${entry.index}`, kind: 'added' }));
  }
}

function structuralChanges(
  active: PublishableRecordDefinitionAggregateDto | null,
  draft: DraftRecordDefinitionAggregateDto
): { readonly changes: readonly RecordDefinitionStructuralChangeDto[]; readonly truncated: boolean } {
  const changes: RecordDefinitionStructuralChangeDto[] = [];
  if (active === null) {
    changes.push(Object.freeze({ path: '/', kind: 'added' }));
  } else {
    const recordTypeKeys = new Set([...Object.keys(active.recordType), ...Object.keys(draft.recordType)]);
    for (const key of [...recordTypeKeys].sort(compareCodeUnits)) {
      const activeValue = active.recordType[key as keyof typeof active.recordType];
      const draftValue = draft.recordType[key as keyof typeof draft.recordType];
      if (stableSerialize(activeValue) === stableSerialize(draftValue)) continue;
      changes.push(
        Object.freeze({
          path: `/recordType/${pointerSegment(key)}`,
          kind: draftValue === undefined ? 'removed' : activeValue === undefined ? 'added' : 'changed',
        })
      );
    }
    collectionChanges<DraftWorkflowStageDto>(
      changes,
      active.stages,
      draft.stages,
      stage => stage.key,
      '/stages',
      'displayOrder'
    );
    collectionChanges<DraftWorkflowTransitionDto>(
      changes,
      active.transitions,
      draft.transitions,
      transition => transition.id,
      '/transitions'
    );
    collectionChanges<RecordDefinitionActionBindingDto>(
      changes,
      active.actionBindings,
      draft.actionBindings,
      binding => binding.id,
      '/actionBindings',
      'order'
    );
  }
  const ordered = changes
    .map(change => Object.freeze({ ...change, path: boundedPointerPath(change.path) }))
    .sort((left, right) => compareCodeUnits(left.path, right.path) || compareCodeUnits(left.kind, right.kind));
  return Object.freeze({
    changes: Object.freeze(ordered.slice(0, RECORD_DEFINITION_VALIDATION_LIMITS.maxChanges)),
    truncated: ordered.length > RECORD_DEFINITION_VALIDATION_LIMITS.maxChanges,
  });
}

function safeRecordCount(value: number): number | undefined {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

interface InspectedStageReference {
  readonly stageKey: RuntimeValue;
  readonly recordCount: RuntimeValue;
}

interface RuntimeDataPropertyDescriptor extends PropertyDescriptor {
  readonly value: RuntimeValue;
}

function isDataPropertyDescriptor(
  descriptor: PropertyDescriptor | undefined
): descriptor is RuntimeDataPropertyDescriptor {
  return descriptor !== undefined && Object.hasOwn(descriptor, 'value');
}

function inspectStageReference(reference: RuntimeValue): InspectedStageReference | undefined {
  if (reference === null || typeof reference !== 'object' || isProxy(reference)) return undefined;

  try {
    if (!isRuntimeRecord(reference)) return undefined;
    const prototype = Object.getPrototypeOf(reference);
    if (prototype !== Object.prototype && prototype !== null) return undefined;

    // Inspect only the two catalog fields, so work is fixed and caller-owned
    // accessors are never invoked.
    const stageKey = Object.getOwnPropertyDescriptor(reference, 'stageKey');
    const recordCount = Object.getOwnPropertyDescriptor(reference, 'recordCount');
    if (!isDataPropertyDescriptor(stageKey) || !isDataPropertyDescriptor(recordCount)) return undefined;

    return Object.freeze({
      stageKey: stageKey.value,
      recordCount: recordCount.value,
    });
  } catch {
    return undefined;
  }
}

function impactReport(
  state: ValidationState,
  request: RecordDefinitionPublicationValidationRequest,
  draft: DraftRecordDefinitionAggregateDto,
  active: PublishableRecordDefinitionAggregateDto | null,
  redactions: FinalizedRedactions,
  incomplete: boolean
): RecordDefinitionImpactReportDto {
  let impactIncomplete = incomplete || request.stageReferences.length > RECORD_DEFINITION_CONTRACT_LIMITS.maxStages;
  const references = boundedCatalog(
    state,
    request.stageReferences,
    '/validationContext/stageReferences',
    RECORD_DEFINITION_CONTRACT_LIMITS.maxStages
  );
  const referenceCounts = new Map<WorkflowStageKey, number>();
  for (const [referenceIndex, reference] of references.entries()) {
    const inspectedReference = inspectStageReference(reference);
    if (inspectedReference === undefined) {
      impactIncomplete = true;
      addIssue(
        state,
        'validation-catalog-invalid',
        `/validationContext/stageReferences/${referenceIndex}`,
        'A referenced-stage entry is invalid.'
      );
      continue;
    }
    const stageKey = inspectedReference.stageKey;
    if (
      typeof stageKey !== 'string' ||
      stageKey.length > RECORD_DEFINITION_KEY_MAX_LENGTH ||
      !RECORD_DEFINITION_KEY_PATTERN.test(stageKey)
    ) {
      impactIncomplete = true;
      addIssue(
        state,
        'validation-catalog-invalid',
        `/validationContext/stageReferences/${referenceIndex}/stageKey`,
        'A referenced-stage key is invalid.'
      );
      continue;
    }
    const count =
      typeof inspectedReference.recordCount === 'number' ? safeRecordCount(inspectedReference.recordCount) : undefined;
    if (count === undefined) {
      impactIncomplete = true;
      addIssue(
        state,
        'validation-catalog-invalid',
        `/validationContext/stageReferences/${referenceIndex}/recordCount`,
        'A referenced-stage count is invalid.'
      );
      continue;
    }
    const parsedStageKey = parseWorkflowStageKey(stageKey);
    if (referenceCounts.has(parsedStageKey)) {
      impactIncomplete = true;
      addIssue(
        state,
        'validation-catalog-invalid',
        `/validationContext/stageReferences/${referenceIndex}/stageKey`,
        'Referenced-stage counts must have unique stage keys.'
      );
    }
    referenceCounts.set(
      parsedStageKey,
      Math.min(Number.MAX_SAFE_INTEGER, (referenceCounts.get(parsedStageKey) ?? 0) + count)
    );
  }

  const activeStages = new Map<string, PublishableRecordDefinitionAggregateDto['stages'][number]>(
    (active?.stages ?? []).map(stage => [stage.key, stage])
  );
  const draftStages = new Map<string, { readonly stage: DraftWorkflowStageDto; readonly index: number }>(
    draft.stages.map((stage, index) => [stage.key, { stage, index }])
  );
  const stageImpacts: RecordDefinitionStageImpactDto[] = [];
  let affectedRecordCount = 0;
  for (const [stageKey, count] of [...referenceCounts].sort((a, b) => compareCodeUnits(a[0], b[0]))) {
    if (count === 0) continue;
    const activeStage = activeStages.get(stageKey);
    const draftStage = draftStages.get(stageKey)?.stage;
    let effect: RecordDefinitionStageImpactDto['effect'] = 'unchanged';
    if (draftStage === undefined) {
      effect = 'blocked-removal';
      addIssue(
        state,
        'referenced-stage-removed',
        '/stages',
        'A workflow stage referenced by existing records cannot be removed.'
      );
    } else if (activeStage !== undefined && draftStage.label !== activeStage.label) {
      effect = 'label-only';
    }
    if (effect !== 'unchanged') {
      affectedRecordCount = Math.min(Number.MAX_SAFE_INTEGER, affectedRecordCount + count);
    }
    stageImpacts.push(Object.freeze({ stageKey, referencedRecordCount: count, effect }));
  }
  const changes = structuralChanges(active, draft);
  const blocked = stageImpacts.some(
    impact => impact.effect === 'blocked-removal' || impact.effect === 'blocked-rename'
  );
  const warning = affectedRecordCount > 0 || changes.changes.length > 0;
  return Object.freeze({
    schemaVersion: RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
    brandId: request.brandId,
    recordTypeKey: request.recordTypeKey,
    status: blocked || impactIncomplete ? 'blocked' : warning ? 'warning' : 'clear',
    activeRevisionNumber: request.activeRevisionNumber,
    draftVersion: request.draftVersion,
    affectedRecordCount,
    stageImpacts: Object.freeze(stageImpacts),
    changes: changes.changes,
    redactions: redactions.redactions,
    truncated: changes.truncated || redactions.truncated || impactIncomplete,
  });
}

function inspectActiveDefinition(
  state: ValidationState,
  active: PublishableRecordDefinitionAggregateDto | null
): PublishableRecordDefinitionAggregateDto | null {
  if (active === null) return null;
  const inspected = inspectPublishableRecordDefinitionAggregate(active);
  if (inspected.success) return inspected.data;
  addIssue(
    state,
    'validation-catalog-invalid',
    '/validationContext/activeDefinition',
    'The active-definition validation context is invalid.'
  );
  return null;
}

function promoteDraft(
  state: ValidationState,
  definition: DraftRecordDefinitionAggregateDto
): PublishableRecordDefinitionAggregateDto | undefined {
  const candidate = { ...definition, definitionState: 'publishable' as const };
  const inspected = inspectPublishableRecordDefinitionAggregate(candidate);
  if (inspected.success) return inspected.data;
  for (const issue of inspected.issues) {
    addIssue(
      state,
      'publication-invalid-payload',
      pointer(issue.path),
      'The complete definition does not satisfy the publishable contract.'
    );
  }
  if (inspected.issues.length === 0) {
    addIssue(state, 'publication-invalid-payload', '/', 'The definition does not satisfy the publishable contract.');
  }
  return undefined;
}

function actionContractReferences(
  definition: PublishableRecordDefinitionAggregateDto
): readonly RecordDefinitionActionContractReferenceDto[] {
  const references = new Map<string, RecordDefinitionActionContractReferenceDto>();
  for (const binding of definition.actionBindings) {
    const key = `${binding.actionId}\u0000${binding.contractVersion}`;
    references.set(key, Object.freeze({ actionId: binding.actionId, contractVersion: binding.contractVersion }));
  }
  return Object.freeze(
    [...references.values()].sort(
      (left, right) => compareCodeUnits(left.actionId, right.actionId) || left.contractVersion - right.contractVersion
    )
  );
}

function incompleteImpact(request: RecordDefinitionPublicationValidationRequest): RecordDefinitionImpactReportDto {
  return Object.freeze({
    schemaVersion: RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
    brandId: request.brandId,
    recordTypeKey: request.recordTypeKey,
    status: 'blocked',
    activeRevisionNumber: request.activeRevisionNumber,
    draftVersion: request.draftVersion,
    affectedRecordCount: 0,
    stageImpacts: Object.freeze([]),
    changes: Object.freeze([]),
    redactions: Object.freeze([]),
    truncated: true,
  });
}

export function validateRecordDefinitionForPublication(
  request: RecordDefinitionPublicationValidationRequest
): RecordDefinitionPublicationValidationResult {
  const inspected = inspectDraftRecordDefinitionAggregate(request.definition);
  const state: ValidationState = { issues: [] };
  let definition: DraftRecordDefinitionAggregateDto | undefined;
  if (!inspected.success) {
    addShapeIssues(state, inspected);
    if (inspected.preflightFailure === undefined) {
      definition = projectDraftRecordDefinitionAggregate(request.definition);
    }
    if (definition === undefined) {
      return Object.freeze({
        ok: false,
        report: validationReport(request, 'publication', state, 'draft-incomplete'),
        impact: incompleteImpact(request),
      });
    }
  } else {
    definition = inspected.data;
  }

  validatePresentExpressions(state, definition);
  const active = inspectActiveDefinition(state, request.activeDefinition);
  const activeInspectionIncomplete = request.activeDefinition !== null && active === null;
  const catalog = validationCatalog(state, request);
  validatePublicationCompleteness(state, definition);
  validateRecordTypeCollections(state, definition, catalog);
  const stages = validateStages(state, definition, catalog, active);
  const transitions = validateTransitions(state, definition, stages, catalog);
  validateGraph(state, definition, stages, transitions);
  validateForms(state, definition, catalog);
  validateValidationPolicies(state, definition, stages, catalog);
  validateActions(state, definition, request.recordTypeKey, request.actionRegistry);
  validateStorageCapability(state, definition, request.storageCapabilityProvider);
  const redactions = definitionRedactions(definition);
  const impact = impactReport(state, request, definition, active, redactions, activeInspectionIncomplete);
  const promoted = promoteDraft(state, definition);
  const preliminaryReport = validationReport(request, 'publication', state, 'draft-incomplete', redactions);
  if (preliminaryReport.status === 'invalid' || promoted === undefined) {
    return Object.freeze({ ok: false, report: preliminaryReport, impact });
  }

  const canonical = canonicalizeRecordDefinition(promoted);
  const canonicalJson = stableSerialize(canonical);
  const digest = createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
  const canonicalHash = parseRecordDefinitionCanonicalHash(`sha256:${digest}`);
  const report = validationReport(request, 'publication', state, 'publishable', redactions);
  return Object.freeze({
    ok: true,
    definition: canonical,
    canonicalJson,
    canonicalHash,
    actionContracts: actionContractReferences(canonical),
    report,
    impact,
  });
}
