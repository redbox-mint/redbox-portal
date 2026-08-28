import {
  literalMatchesActionParameter,
  parseActionBinding,
  type ActionBinding,
  type ActionDependency,
  type ActionHandler,
  type ActionJsonObject,
  type ActionJsonValue,
  type ActionParameterValue,
  type ActionParameterValues,
  type ActionProvenance,
  type RuntimeValidationResult,
  type RuntimeValidator,
} from './contracts';
import { ActionContractValidationError } from './errors';
import { boundedValidationPreflight, type BoundedValidationFailure } from '../boundedValidation';
import {
  compareCodeUnits,
  deriveStableActionBindingId,
  safeActionIdentifierSchema,
  sortActionBindings,
  type ActionBindingId,
} from './identifiers';
import { ACTION_CONTRACT_LIMITS, ACTION_PLAN_SCHEMA_VERSION } from './limits';
import {
  RedboxActionRegistry,
  type ActionDescriptorMetadata,
  type ActionRegistryLookup,
  type AvailableActionRegistryLookup,
  type DeepReadonly,
} from './registration';
import {
  createRuntimeValidator,
  isRuntimeArray,
  isRuntimeRecord,
  readRuntimeProperty,
  type RuntimeValue,
} from '../runtimeValues';
import { compileManagedHandlebarsTemplate, compileManagedJsonataExpression } from '../expression-runtime/compile';
import { ManagedExpressionError } from '../expression-runtime/errors';
import type { PreparedActionParameter } from '../expression-runtime/types';

export interface ActionPlan {
  readonly schemaVersion: typeof ACTION_PLAN_SCHEMA_VERSION;
  readonly recordTypeKey: string;
  readonly bindings: readonly ActionBinding[];
}

export type ActionPlanValidationIssueCode =
  | 'invalid-action-plan'
  | 'invalid-action-binding-id'
  | 'duplicate-plan-entry'
  | 'duplicate-action-order'
  | 'unknown-action'
  | 'retired-action'
  | 'unsupported-action'
  | 'unsupported-action-context'
  | 'unsupported-action-mode'
  | 'unsupported-action-phase'
  | 'repeated-action-not-allowed'
  | 'missing-action-parameter'
  | 'invalid-action-parameter'
  | 'invalid-jsonata-expression'
  | 'invalid-handlebars-template'
  | 'unexpected-action-parameter'
  | 'action-policy-exceeds-bounds'
  | 'missing-action-dependency'
  | 'forward-action-dependency'
  | 'cross-attachment-action-dependency'
  | 'cyclic-action-dependency'
  | 'unsafe-prior-output-reference'
  | 'invalid-prior-output-comparison';

export interface ActionPlanIssueAction {
  readonly id: string;
  readonly requestedContractVersion: number;
  readonly registeredContractVersion?: number;
  readonly provenance?: DeepReadonly<ActionProvenance>;
}

export interface ActionPlanValidationIssue {
  readonly code: ActionPlanValidationIssueCode;
  readonly path: string;
  readonly message: string;
  readonly action?: ActionPlanIssueAction;
  readonly bindingId?: ActionBindingId;
}

export interface ActionPlanPriorOutputAccess {
  readonly bindingId: ActionBindingId;
  readonly fields: readonly string[];
}

export interface ResolvedActionPlanBinding {
  readonly sourceIndex: number;
  readonly binding: DeepReadonly<ActionBinding>;
  readonly descriptor: ActionDescriptorMetadata;
  readonly handler: ActionHandler;
  readonly priorOutputs: readonly ActionPlanPriorOutputAccess[];
  readonly preparedParameters: Readonly<Record<string, PreparedActionParameter>>;
}

export interface ResolvedActionPlan {
  readonly schemaVersion: typeof ACTION_PLAN_SCHEMA_VERSION;
  readonly recordTypeKey: string;
  readonly bindings: readonly ResolvedActionPlanBinding[];
}

export interface ValidActionPlan {
  readonly ok: true;
  readonly plan: ResolvedActionPlan;
}

export interface InvalidActionPlan {
  readonly ok: false;
  readonly issues: readonly ActionPlanValidationIssue[];
}

export type ActionPlanValidationResult = ValidActionPlan | InvalidActionPlan;

export class ActionPlanValidationError extends Error {
  readonly code = 'invalid-action-plan';
  readonly issues: readonly ActionPlanValidationIssue[];

  constructor(issues: readonly ActionPlanValidationIssue[]) {
    super('Action plan validation failed.');
    this.name = 'ActionPlanValidationError';
    this.issues = Object.freeze([...issues]);
  }
}

export function isActionPlanValidationError(value: RuntimeValue): value is ActionPlanValidationError {
  return value instanceof ActionPlanValidationError;
}

type RegisteredActionParameter = ActionDescriptorMetadata['parameterSchema']['parameters'][number];
type ImmutableActionJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly ImmutableActionJsonValue[]
  | ImmutableActionJsonObject;
interface ImmutableActionJsonObject {
  readonly [key: string]: ImmutableActionJsonValue;
}

interface IndexedActionBinding {
  readonly binding: ActionBinding;
  readonly index: number;
}

interface ResolvedBindingCandidate {
  readonly binding: ActionBinding;
  readonly index: number;
  readonly lookup: AvailableActionRegistryLookup;
  readonly parameters: ActionParameterValues;
  readonly preparedParameters: Readonly<Record<string, PreparedActionParameter>>;
}

function bindingPath(index: number, suffix: string): string {
  return `$.bindings[${index}]${suffix}`;
}

function scopeId(binding: ActionBinding): string {
  return 'scopeId' in binding.scope ? (binding.scope.scopeId ?? '') : '';
}

function attachmentKey(binding: ActionBinding): string {
  return JSON.stringify([binding.scope.context, binding.scope.mode, binding.scope.phase, scopeId(binding)]);
}

function sameAttachment(left: ActionBinding, right: ActionBinding): boolean {
  return attachmentKey(left) === attachmentKey(right);
}

function issueAction(binding: ActionBinding, lookup: ActionRegistryLookup): ActionPlanIssueAction {
  if (lookup.status === 'unknown') {
    return Object.freeze({
      id: binding.actionId,
      requestedContractVersion: binding.contractVersion,
    });
  }
  return Object.freeze({
    id: binding.actionId,
    requestedContractVersion: binding.contractVersion,
    registeredContractVersion: lookup.descriptor.contractVersion,
    provenance: lookup.descriptor.provenance,
  });
}

function addBindingIssue(
  issues: ActionPlanValidationIssue[],
  binding: ActionBinding,
  lookup: ActionRegistryLookup,
  index: number,
  code: ActionPlanValidationIssueCode,
  suffix: string,
  message: string
): void {
  if (issues.length >= ACTION_CONTRACT_LIMITS.maxPlanValidationIssues) {
    return;
  }
  issues.push(
    Object.freeze({
      code,
      path: bindingPath(index, suffix),
      message,
      action: issueAction(binding, lookup),
      bindingId: binding.id,
    })
  );
}

function preflightFailure(path: string, message: string): InvalidActionPlan {
  const issue: ActionPlanValidationIssue = Object.freeze({
    code: 'invalid-action-plan',
    path,
    message,
  });
  return Object.freeze({ ok: false, issues: Object.freeze([issue]) });
}

function arrayCardinalityLimit(path: string): number {
  if (path === '$.bindings') {
    return ACTION_CONTRACT_LIMITS.maxPlanBindings;
  }
  if (path.endsWith('.dependencies')) {
    return ACTION_CONTRACT_LIMITS.maxDependencies;
  }
  if (path.endsWith('.retryOn')) {
    return 7;
  }
  return ACTION_CONTRACT_LIMITS.maxArrayItems;
}

function objectCardinalityLimit(path: string): number {
  return path.endsWith('.parameters')
    ? ACTION_CONTRACT_LIMITS.maxParameters
    : ACTION_CONTRACT_LIMITS.maxObjectProperties;
}

function preflightMessage(failure: BoundedValidationFailure): string {
  if (failure.reason === 'bytes') {
    return 'Action plan input exceeds the aggregate byte limit.';
  }
  if (failure.reason === 'depth') {
    return 'Action plan input exceeds the structural depth limit.';
  }
  if (failure.reason === 'cycle') {
    return 'Action plan input must not contain reference cycles.';
  }
  if (failure.reason === 'cardinality') {
    return 'Action plan container exceeds its cardinality limit.';
  }
  if (failure.reason === 'string' || failure.reason === 'property-name') {
    return 'Action plan strings exceed the global size limit.';
  }
  if (failure.reason === 'work') {
    return 'Action plan input exceeds the validation work limit.';
  }
  return 'Action plan structure could not be inspected safely.';
}

function preflightActionPlanStructure(value: RuntimeValue): InvalidActionPlan | undefined {
  const result = boundedValidationPreflight(value, {
    maxBytes: ACTION_CONTRACT_LIMITS.maxJsonBytes,
    maxDepth: ACTION_CONTRACT_LIMITS.maxPlanDepth,
    maxStringLength: ACTION_CONTRACT_LIMITS.maxStringValueLength,
    maxPropertyNameLength: ACTION_CONTRACT_LIMITS.maxIdentifierLength,
    maxWork: ACTION_CONTRACT_LIMITS.maxValidationWork,
    arrayCardinalityLimit,
    objectCardinalityLimit,
  });
  return result.ok ? undefined : preflightFailure(result.path, preflightMessage(result));
}

interface ParsedActionPlanShape {
  readonly ok: true;
  readonly plan: ActionPlan;
}

type ActionPlanShapeResult = ParsedActionPlanShape | InvalidActionPlan;

function invalidShapeIssue(path: string): ActionPlanValidationIssue {
  return Object.freeze({
    code: 'invalid-action-plan',
    path,
    message: 'Action plan input does not match the public contract.',
  });
}

function bindingIssuePath(index: number, path: string): string {
  return path === '$' ? `$.bindings[${index}]` : `$.bindings[${index}]${path.slice(1)}`;
}

function parseActionPlanShape(value: RuntimeValue): ActionPlanShapeResult {
  const preflight = preflightActionPlanStructure(value);
  if (preflight !== undefined) {
    return preflight;
  }
  if (!isRuntimeRecord(value)) {
    return preflightFailure('$', 'Action plan input does not match the public contract.');
  }

  const issues: ActionPlanValidationIssue[] = [];
  const allowedKeys = new Set(['schemaVersion', 'recordTypeKey', 'bindings']);
  if (Object.keys(value).some(key => !allowedKeys.has(key))) {
    issues.push(invalidShapeIssue('$'));
  }
  const schemaVersion = readRuntimeProperty(value, 'schemaVersion');
  if (schemaVersion !== ACTION_PLAN_SCHEMA_VERSION) {
    issues.push(invalidShapeIssue('$.schemaVersion'));
  }
  const recordTypeResult = safeActionIdentifierSchema.safeParse(readRuntimeProperty(value, 'recordTypeKey'));
  if (!recordTypeResult.success) {
    issues.push(invalidShapeIssue('$.recordTypeKey'));
  }
  const bindingsValue = readRuntimeProperty(value, 'bindings');
  if (!isRuntimeArray(bindingsValue)) {
    issues.push(invalidShapeIssue('$.bindings'));
  }
  if (!recordTypeResult.success || !isRuntimeArray(bindingsValue) || issues.length > 0) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(issues.slice(0, ACTION_CONTRACT_LIMITS.maxPlanValidationIssues)),
    });
  }

  const bindings: ActionBinding[] = [];
  for (let index = 0; index < bindingsValue.length; index += 1) {
    try {
      bindings.push(parseActionBinding(bindingsValue[index]));
    } catch (error) {
      if (error instanceof ActionContractValidationError) {
        for (const issue of error.issues) {
          if (issues.length >= ACTION_CONTRACT_LIMITS.maxPlanValidationIssues) {
            break;
          }
          issues.push(invalidShapeIssue(bindingIssuePath(index, issue.path)));
        }
      } else {
        issues.push(invalidShapeIssue(`$.bindings[${index}]`));
      }
    }
    if (issues.length >= ACTION_CONTRACT_LIMITS.maxPlanValidationIssues) {
      break;
    }
  }
  if (issues.length > 0) {
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  return Object.freeze({
    ok: true,
    plan: Object.freeze({
      schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
      recordTypeKey: recordTypeResult.data,
      bindings: Object.freeze(bindings),
    }),
  });
}

export const actionPlanSchema: RuntimeValidator<ActionPlan> = createRuntimeValidator(
  (value: RuntimeValue): RuntimeValidationResult<ActionPlan> => {
    const result = parseActionPlanShape(value);
    return result.ok ? Object.freeze({ success: true, data: result.plan }) : Object.freeze({ success: false });
  }
);

function compareIssues(left: ActionPlanValidationIssue, right: ActionPlanValidationIssue): number {
  const pathComparison = compareCodeUnits(left.path, right.path);
  if (pathComparison !== 0) {
    return pathComparison;
  }
  const codeComparison = compareCodeUnits(left.code, right.code);
  if (codeComparison !== 0) {
    return codeComparison;
  }
  return compareCodeUnits(left.action?.id ?? '', right.action?.id ?? '');
}

function invalidSemantics(issues: ActionPlanValidationIssue[]): InvalidActionPlan {
  const ordered = issues.slice(0, ACTION_CONTRACT_LIMITS.maxPlanValidationIssues).sort(compareIssues);
  return Object.freeze({ ok: false, issues: Object.freeze(ordered) });
}

function isImmutableActionJsonArray(value: ImmutableActionJsonValue): value is readonly ImmutableActionJsonValue[] {
  return Array.isArray(value);
}

function cloneActionJsonValue(value: ImmutableActionJsonValue): ActionJsonValue {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (isImmutableActionJsonArray(value)) {
    return value.map(cloneActionJsonValue);
  }
  const cloned: ActionJsonObject = {};
  for (const [key, child] of Object.entries(value)) {
    cloned[key] = cloneActionJsonValue(child);
  }
  return cloned;
}

function freezeActionJsonValue(value: ActionJsonValue): void {
  if (value === null || typeof value !== 'object') {
    return;
  }
  const children: ActionJsonValue[] = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    freezeActionJsonValue(child);
  }
  Object.freeze(value);
}

function cloneParameterValue(value: ActionParameterValue): ActionParameterValue {
  if (value.kind === 'literal') {
    const cloned: ActionParameterValue = { kind: 'literal', value: cloneActionJsonValue(value.value) };
    return cloned;
  }
  if (value.kind === 'jsonata') {
    const cloned: ActionParameterValue = { kind: 'jsonata', expression: value.expression };
    return cloned;
  }
  if (value.kind === 'handlebars') {
    const cloned: ActionParameterValue = { kind: 'handlebars', template: value.template };
    return cloned;
  }
  const cloned: ActionParameterValue = { kind: 'secret', configured: value.configured };
  return cloned;
}

function defaultParameterValue(parameter: RegisteredActionParameter): ActionParameterValue | undefined {
  if (parameter.kind === 'string' && parameter.defaultValue !== undefined) {
    const value: ActionParameterValue = { kind: 'literal', value: parameter.defaultValue };
    return value;
  }
  if (parameter.kind === 'number' && parameter.defaultValue !== undefined) {
    const value: ActionParameterValue = { kind: 'literal', value: parameter.defaultValue };
    return value;
  }
  if (parameter.kind === 'boolean' && parameter.defaultValue !== undefined) {
    const value: ActionParameterValue = { kind: 'literal', value: parameter.defaultValue };
    return value;
  }
  if (parameter.kind === 'enum' && parameter.defaultValue !== undefined) {
    const value: ActionParameterValue = { kind: 'literal', value: parameter.defaultValue };
    return value;
  }
  if (parameter.kind === 'object' && parameter.defaultValue !== undefined) {
    const value: ActionParameterValue = {
      kind: 'literal',
      value: cloneActionJsonValue(parameter.defaultValue),
    };
    return value;
  }
  if (parameter.kind === 'array' && parameter.defaultValue !== undefined) {
    const value: ActionParameterValue = {
      kind: 'literal',
      value: cloneActionJsonValue(parameter.defaultValue),
    };
    return value;
  }
  if (parameter.kind === 'jsonata' && parameter.defaultExpression !== undefined) {
    const value: ActionParameterValue = { kind: 'jsonata', expression: parameter.defaultExpression };
    return value;
  }
  if (parameter.kind === 'handlebars' && parameter.defaultTemplate !== undefined) {
    const value: ActionParameterValue = { kind: 'handlebars', template: parameter.defaultTemplate };
    return value;
  }
  return undefined;
}

function parameterValueMatches(parameter: RegisteredActionParameter, value: ActionParameterValue): boolean {
  if (parameter.kind === 'jsonata') {
    return value.kind === 'jsonata';
  }
  if (parameter.kind === 'handlebars') {
    return value.kind === 'handlebars';
  }
  if (parameter.kind === 'secret') {
    return value.kind === 'secret' && (!parameter.required || value.configured);
  }
  return value.kind === 'literal' && literalMatchesActionParameter(parameter, value.value);
}

function outputComparisonMatches(
  field: ActionDescriptorMetadata['outputSchema']['fields'][number],
  value: ActionJsonValue
): boolean {
  if (field.kind === 'string') {
    return typeof value === 'string';
  }
  if (field.kind === 'number') {
    return typeof value === 'number';
  }
  if (field.kind === 'boolean') {
    return typeof value === 'boolean';
  }
  return true;
}

function freezeParameterValues(parameters: ActionParameterValues): void {
  for (const value of Object.values(parameters)) {
    if (value.kind === 'literal') {
      freezeActionJsonValue(value.value);
    }
    Object.freeze(value);
  }
  Object.freeze(parameters);
}

interface ResolvedParameters {
  readonly values: ActionParameterValues;
  readonly prepared: Readonly<Record<string, PreparedActionParameter>>;
}

function prepareParameter(
  parameter: RegisteredActionParameter,
  value: ActionParameterValue
): PreparedActionParameter | undefined {
  if (parameter.kind === 'jsonata' && value.kind === 'jsonata') {
    return Object.freeze({ kind: 'jsonata', expression: compileManagedJsonataExpression(value.expression) });
  }
  if (parameter.kind === 'handlebars' && value.kind === 'handlebars') {
    return Object.freeze({
      kind: 'handlebars',
      template: compileManagedHandlebarsTemplate(value.template, parameter.destination),
    });
  }
  return undefined;
}

function collectPreparedParameter(
  parameter: RegisteredActionParameter,
  value: ActionParameterValue,
  binding: ActionBinding,
  lookup: AvailableActionRegistryLookup,
  index: number,
  issues: ActionPlanValidationIssue[],
  prepared: Record<string, PreparedActionParameter>
): void {
  try {
    const artifact = prepareParameter(parameter, value);
    if (artifact !== undefined) {
      prepared[parameter.name] = artifact;
    }
  } catch (error) {
    if (!(error instanceof ManagedExpressionError)) {
      throw error;
    }
    addBindingIssue(
      issues,
      binding,
      lookup,
      index,
      parameter.kind === 'jsonata' ? 'invalid-jsonata-expression' : 'invalid-handlebars-template',
      `.parameters.${parameter.name}`,
      parameter.kind === 'jsonata'
        ? 'JSONata parameter does not satisfy the managed expression contract.'
        : 'Handlebars parameter does not satisfy the managed template contract.'
    );
  }
}

function resolvedParameters(
  binding: ActionBinding,
  lookup: AvailableActionRegistryLookup,
  index: number,
  issues: ActionPlanValidationIssue[]
): ResolvedParameters {
  const resolved: ActionParameterValues = {};
  const prepared: Record<string, PreparedActionParameter> = {};
  const definitions = new Map(
    lookup.descriptor.parameterSchema.parameters.map(parameter => [parameter.name, parameter])
  );

  for (const parameter of lookup.descriptor.parameterSchema.parameters) {
    if (issues.length >= ACTION_CONTRACT_LIMITS.maxPlanValidationIssues) {
      break;
    }
    const configured = binding.parameters[parameter.name];
    if (configured !== undefined) {
      if (!parameterValueMatches(parameter, configured)) {
        addBindingIssue(
          issues,
          binding,
          lookup,
          index,
          'invalid-action-parameter',
          `.parameters.${parameter.name}`,
          'Parameter value does not satisfy the registered action schema.'
        );
      } else {
        resolved[parameter.name] = cloneParameterValue(configured);
        collectPreparedParameter(parameter, configured, binding, lookup, index, issues, prepared);
      }
      continue;
    }
    const defaultValue = defaultParameterValue(parameter);
    if (defaultValue !== undefined) {
      resolved[parameter.name] = defaultValue;
      collectPreparedParameter(parameter, defaultValue, binding, lookup, index, issues, prepared);
    } else if (parameter.required) {
      addBindingIssue(
        issues,
        binding,
        lookup,
        index,
        'missing-action-parameter',
        `.parameters.${parameter.name}`,
        'A required registered action parameter is missing.'
      );
    }
  }

  for (const name of Object.keys(binding.parameters).sort()) {
    if (issues.length >= ACTION_CONTRACT_LIMITS.maxPlanValidationIssues) {
      break;
    }
    if (!definitions.has(name)) {
      addBindingIssue(
        issues,
        binding,
        lookup,
        index,
        'unexpected-action-parameter',
        `.parameters.${name}`,
        'Parameter is not declared by the registered action.'
      );
    }
  }
  freezeParameterValues(resolved);
  return Object.freeze({ values: resolved, prepared: Object.freeze(prepared) });
}

function validatePolicyOverrides(
  binding: ActionBinding,
  lookup: AvailableActionRegistryLookup,
  index: number,
  issues: ActionPlanValidationIssue[]
): void {
  const overrides = binding.policyOverrides;
  if (overrides?.timeoutMs !== undefined) {
    const timeout = lookup.descriptor.executionPolicy.timeout;
    if (overrides.timeoutMs < timeout.minMs || overrides.timeoutMs > timeout.maxMs) {
      addBindingIssue(
        issues,
        binding,
        lookup,
        index,
        'action-policy-exceeds-bounds',
        '.policyOverrides.timeoutMs',
        'Timeout override exceeds the registered action bounds.'
      );
    }
  }
  if (overrides?.retry === undefined) {
    return;
  }
  const retryBounds = lookup.descriptor.executionPolicy.retry;
  if (!retryBounds.allowed || overrides.retry.maxAttempts > retryBounds.maxAttempts) {
    addBindingIssue(
      issues,
      binding,
      lookup,
      index,
      'action-policy-exceeds-bounds',
      '.policyOverrides.retry',
      'Retry override exceeds the registered action bounds.'
    );
    return;
  }
  const schedule = overrides.retry.schedule;
  if (schedule === undefined) {
    return;
  }
  const maximumDelay = schedule.type === 'fixed' ? schedule.delayMs : schedule.maxDelayMs;
  if (maximumDelay > retryBounds.maxDelayMs) {
    addBindingIssue(
      issues,
      binding,
      lookup,
      index,
      'action-policy-exceeds-bounds',
      '.policyOverrides.retry.schedule',
      'Retry delay exceeds the registered action bounds.'
    );
  }
}

function freezeActionDependency(dependency: ActionDependency): void {
  if (dependency.condition === 'output-equals') {
    freezeActionJsonValue(dependency.value);
  }
  Object.freeze(dependency);
}

function freezeActionBinding(binding: ActionBinding): void {
  Object.freeze(binding.scope);
  freezeParameterValues(binding.parameters);
  for (const dependency of binding.dependencies ?? []) {
    freezeActionDependency(dependency);
  }
  if (binding.dependencies !== undefined) {
    Object.freeze(binding.dependencies);
  }
  const overrides = binding.policyOverrides;
  if (overrides?.retry?.schedule !== undefined) {
    Object.freeze(overrides.retry.schedule);
  }
  if (overrides?.retry !== undefined) {
    if (overrides.retry.retryOn !== undefined) {
      Object.freeze(overrides.retry.retryOn);
    }
    Object.freeze(overrides.retry);
  }
  if (overrides !== undefined) {
    Object.freeze(overrides);
  }
  Object.freeze(binding);
}

function effectiveBinding(binding: ActionBinding, parameters: ActionParameterValues): ActionBinding {
  const effective: ActionBinding = {
    ...binding,
    parameters,
  };
  freezeActionBinding(effective);
  return effective;
}

function validateScope(
  indexed: IndexedActionBinding,
  lookup: AvailableActionRegistryLookup,
  issues: ActionPlanValidationIssue[]
): void {
  const binding = indexed.binding;
  if (!lookup.descriptor.contexts.includes(binding.scope.context)) {
    addBindingIssue(
      issues,
      binding,
      lookup,
      indexed.index,
      'unsupported-action-context',
      '.scope.context',
      'Action is not registered for this invocation context.'
    );
  }
  if (!lookup.descriptor.modes.includes(binding.scope.mode)) {
    addBindingIssue(
      issues,
      binding,
      lookup,
      indexed.index,
      'unsupported-action-mode',
      '.scope.mode',
      'Action is not registered for this lifecycle mode.'
    );
  }
  if (!lookup.descriptor.phases.includes(binding.scope.phase)) {
    addBindingIssue(
      issues,
      binding,
      lookup,
      indexed.index,
      'unsupported-action-phase',
      '.scope.phase',
      'Action is not registered for this execution phase.'
    );
  }
}

function detectDependencyCycles(
  bindingsById: ReadonlyMap<ActionBindingId, IndexedActionBinding>,
  lookups: readonly ActionRegistryLookup[],
  issues: ActionPlanValidationIssue[]
): void {
  const states = new Map<ActionBindingId, 'visiting' | 'visited'>();

  const visit = (indexed: IndexedActionBinding): void => {
    if (issues.length >= ACTION_CONTRACT_LIMITS.maxPlanValidationIssues) {
      return;
    }
    states.set(indexed.binding.id, 'visiting');
    const dependencies = indexed.binding.dependencies ?? [];
    for (let dependencyIndex = 0; dependencyIndex < dependencies.length; dependencyIndex += 1) {
      if (issues.length >= ACTION_CONTRACT_LIMITS.maxPlanValidationIssues) {
        return;
      }
      const dependency = dependencies[dependencyIndex];
      const target = bindingsById.get(dependency.bindingId);
      if (target === undefined) {
        continue;
      }
      const state = states.get(target.binding.id);
      if (state === 'visiting') {
        const lookup = lookups[indexed.index];
        if (lookup !== undefined) {
          addBindingIssue(
            issues,
            indexed.binding,
            lookup,
            indexed.index,
            'cyclic-action-dependency',
            `.dependencies[${dependencyIndex}].bindingId`,
            'Action dependencies must form an acyclic graph.'
          );
        }
      } else if (state !== 'visited') {
        visit(target);
      }
    }
    states.set(indexed.binding.id, 'visited');
  };

  for (const indexed of bindingsById.values()) {
    if (issues.length >= ACTION_CONTRACT_LIMITS.maxPlanValidationIssues) {
      break;
    }
    if (states.get(indexed.binding.id) === undefined) {
      visit(indexed);
    }
  }
}

function validateDependencies(
  plan: ActionPlan,
  bindingsById: ReadonlyMap<ActionBindingId, IndexedActionBinding>,
  lookups: readonly ActionRegistryLookup[],
  issues: ActionPlanValidationIssue[]
): ReadonlyMap<number, readonly ActionPlanPriorOutputAccess[]> {
  const priorOutputsByIndex = new Map<number, readonly ActionPlanPriorOutputAccess[]>();

  for (let index = 0; index < plan.bindings.length; index += 1) {
    if (issues.length >= ACTION_CONTRACT_LIMITS.maxPlanValidationIssues) {
      break;
    }
    const binding = plan.bindings[index];
    const lookup = lookups[index];
    if (binding === undefined || lookup === undefined) {
      continue;
    }
    const priorOutputs: ActionPlanPriorOutputAccess[] = [];
    const dependencies = binding.dependencies ?? [];
    for (let dependencyIndex = 0; dependencyIndex < dependencies.length; dependencyIndex += 1) {
      if (issues.length >= ACTION_CONTRACT_LIMITS.maxPlanValidationIssues) {
        break;
      }
      const dependency = dependencies[dependencyIndex];
      const source = bindingsById.get(dependency.bindingId);
      const path = `.dependencies[${dependencyIndex}].bindingId`;
      if (source === undefined) {
        addBindingIssue(
          issues,
          binding,
          lookup,
          index,
          'missing-action-dependency',
          path,
          'Dependency references no action binding in this plan.'
        );
        continue;
      }
      if (!sameAttachment(source.binding, binding)) {
        addBindingIssue(
          issues,
          binding,
          lookup,
          index,
          'cross-attachment-action-dependency',
          path,
          'Dependency must remain within one action attachment.'
        );
        continue;
      }
      if (source.binding.order >= binding.order) {
        addBindingIssue(
          issues,
          binding,
          lookup,
          index,
          'forward-action-dependency',
          path,
          'Dependency must reference an earlier action binding.'
        );
      }
      if (dependency.condition !== 'output-equals') {
        continue;
      }
      const sourceLookup = lookups[source.index];
      if (sourceLookup === undefined || sourceLookup.status !== 'available') {
        continue;
      }
      const safeField = sourceLookup.descriptor.outputSchema.safeFields.includes(dependency.field);
      const declaredField = sourceLookup.descriptor.outputSchema.fields.find(field => field.name === dependency.field);
      if (!safeField || declaredField === undefined) {
        addBindingIssue(
          issues,
          binding,
          lookup,
          index,
          'unsafe-prior-output-reference',
          `.dependencies[${dependencyIndex}].field`,
          'Dependency may inspect only a declared safe prior output field.'
        );
        continue;
      }
      if (!outputComparisonMatches(declaredField, dependency.value)) {
        addBindingIssue(
          issues,
          binding,
          lookup,
          index,
          'invalid-prior-output-comparison',
          `.dependencies[${dependencyIndex}].value`,
          'Dependency comparison must match the declared safe output field type.'
        );
        continue;
      }
      priorOutputs.push(
        Object.freeze({
          bindingId: source.binding.id,
          fields: Object.freeze([dependency.field]),
        })
      );
    }
    priorOutputsByIndex.set(index, Object.freeze(priorOutputs));
  }

  if (issues.length < ACTION_CONTRACT_LIMITS.maxPlanValidationIssues) {
    detectDependencyCycles(bindingsById, lookups, issues);
  }
  return priorOutputsByIndex;
}

function validateParsedActionPlan(registry: RedboxActionRegistry, plan: ActionPlan): ActionPlanValidationResult {
  const issues: ActionPlanValidationIssue[] = [];
  const lookups: ActionRegistryLookup[] = [];
  const bindingsById = new Map<ActionBindingId, IndexedActionBinding>();
  const orders = new Map<string, IndexedActionBinding>();
  const repetitions = new Map<string, IndexedActionBinding>();
  const candidates: ResolvedBindingCandidate[] = [];

  for (let index = 0; index < plan.bindings.length; index += 1) {
    if (issues.length >= ACTION_CONTRACT_LIMITS.maxPlanValidationIssues) {
      break;
    }
    const binding = plan.bindings[index];
    if (binding === undefined) {
      continue;
    }
    const lookup = registry.lookup(binding.actionId, binding.contractVersion);
    lookups.push(lookup);
    const indexed: IndexedActionBinding = { binding, index };

    const existingBinding = bindingsById.get(binding.id);
    if (existingBinding !== undefined) {
      addBindingIssue(
        issues,
        binding,
        lookup,
        index,
        'duplicate-plan-entry',
        '.id',
        'Action binding ID occurs more than once in this plan.'
      );
    } else {
      bindingsById.set(binding.id, indexed);
    }

    const expectedId = deriveStableActionBindingId({
      recordTypeKey: plan.recordTypeKey,
      scope: binding.scope,
      actionId: binding.actionId,
      contractVersion: binding.contractVersion,
      stableKey: binding.stableKey,
    });
    if (binding.id !== expectedId) {
      addBindingIssue(
        issues,
        binding,
        lookup,
        index,
        'invalid-action-binding-id',
        '.id',
        'Action binding ID does not match its stable code-owned identity inputs.'
      );
    }

    const orderKey = JSON.stringify([attachmentKey(binding), binding.order]);
    if (orders.has(orderKey)) {
      addBindingIssue(
        issues,
        binding,
        lookup,
        index,
        'duplicate-action-order',
        '.order',
        'Action binding order must be unique within one attachment.'
      );
    } else {
      orders.set(orderKey, indexed);
    }

    if (lookup.status === 'unknown') {
      addBindingIssue(
        issues,
        binding,
        lookup,
        index,
        'unknown-action',
        '.actionId',
        'Action ID is not registered on this application node.'
      );
      continue;
    }
    if (lookup.status === 'unsupported') {
      addBindingIssue(
        issues,
        binding,
        lookup,
        index,
        'unsupported-action',
        '.contractVersion',
        'Requested action contract version is not supported on this application node.'
      );
      continue;
    }
    if (lookup.status === 'retired') {
      addBindingIssue(
        issues,
        binding,
        lookup,
        index,
        'retired-action',
        '.actionId',
        'Action contract has been retired and cannot appear in an executable plan.'
      );
      continue;
    }

    validateScope(indexed, lookup, issues);
    const repetitionKey = JSON.stringify([attachmentKey(binding), binding.actionId, binding.contractVersion]);
    if (!lookup.descriptor.allowRepeatedBindings && repetitions.has(repetitionKey)) {
      addBindingIssue(
        issues,
        binding,
        lookup,
        index,
        'repeated-action-not-allowed',
        '.actionId',
        'Registered action does not permit repeated bindings in one attachment.'
      );
    } else {
      repetitions.set(repetitionKey, indexed);
    }
    const parameters = resolvedParameters(binding, lookup, index, issues);
    validatePolicyOverrides(binding, lookup, index, issues);
    candidates.push({
      binding,
      index,
      lookup,
      parameters: parameters.values,
      preparedParameters: parameters.prepared,
    });
  }

  const priorOutputsByIndex =
    issues.length < ACTION_CONTRACT_LIMITS.maxPlanValidationIssues
      ? validateDependencies(plan, bindingsById, lookups, issues)
      : new Map<number, readonly ActionPlanPriorOutputAccess[]>();
  if (issues.length > 0) {
    return invalidSemantics(issues);
  }

  const resolvedBindings = candidates.map<ResolvedActionPlanBinding>(candidate => {
    const binding = effectiveBinding(candidate.binding, candidate.parameters);
    const priorOutputs = priorOutputsByIndex.get(candidate.index) ?? Object.freeze([]);
    return Object.freeze({
      sourceIndex: candidate.index,
      binding,
      descriptor: candidate.lookup.descriptor,
      handler: candidate.lookup.handler,
      priorOutputs,
      preparedParameters: candidate.preparedParameters,
    });
  });
  const sortable = resolvedBindings.map(entry => ({
    id: entry.binding.id,
    order: entry.binding.order,
    scope: entry.binding.scope,
    entry,
  }));
  const orderedBindings = sortActionBindings(sortable).map(item => item.entry);
  const resolvedPlan: ResolvedActionPlan = Object.freeze({
    schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
    recordTypeKey: plan.recordTypeKey,
    bindings: Object.freeze(orderedBindings),
  });
  return Object.freeze({ ok: true, plan: resolvedPlan });
}

/**
 * Parses and validates an entire persisted action plan without invoking a
 * handler. Every registry lookup is an exact ID/version map lookup.
 */
export function validateActionPlan(registry: RedboxActionRegistry, value: RuntimeValue): ActionPlanValidationResult {
  const parsed = parseActionPlanShape(value);
  return parsed.ok ? validateParsedActionPlan(registry, parsed.plan) : parsed;
}

/** Resolves a prevalidated execution plan or throws one safe structured error. */
export function resolveActionPlan(registry: RedboxActionRegistry, value: RuntimeValue): ResolvedActionPlan {
  const result = validateActionPlan(registry, value);
  if (!result.ok) {
    throw new ActionPlanValidationError(result.issues);
  }
  return result.plan;
}
