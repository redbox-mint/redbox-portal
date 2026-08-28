import { isProxy } from 'node:util/types';
import { z } from 'zod';
import {
  RECORD_VALIDATION_REFERENCE_PATTERN,
  VALIDATION_OPERATION_NAME_PATTERN,
} from '@researchdatabox/sails-ng-common';
import {
  ACTION_CONTEXT_SCHEMA_VERSION,
  ACTION_CONTRACT_LIMITS,
  migrateLegacyRecordAction,
  safeActionIdentifierSchema,
  type ActionActor,
  type ActionBindingScope,
  type ActionContext,
  type ActionJsonObject,
} from '../action-registry';
import { boundedValidationPreflight } from '../boundedValidation';
import {
  compileManagedJsonataExpression,
  evaluateManagedCondition,
  projectTransitionConditionContext,
  EXPRESSION_RUNTIME_LIMITS,
  type PreparedJsonataExpression,
} from '../expression-runtime';
import { isRuntimeArray, isRuntimeRecord, type RuntimeValue } from '../runtimeValues';

export const AUTOMATIC_TRANSITION_SCHEMA_VERSION = 1 as const;

export interface AutomaticTransitionDefinition {
  readonly schemaVersion: typeof AUTOMATIC_TRANSITION_SCHEMA_VERSION;
  readonly id: string;
  readonly mode: 'automatic';
  readonly sourceStage: string;
  readonly targetStage: string;
  readonly priority: number;
  readonly condition: string;
  readonly validationOperation?: string;
  readonly targetStageLabelCheck?: string;
  readonly targetFormCheck?: string;
}

interface PreparedAutomaticTransition {
  readonly definition: AutomaticTransitionDefinition;
  readonly preparedCondition: PreparedJsonataExpression;
}

/** @internal */
export interface AutomaticTransitionPlan {
  readonly schemaVersion: typeof AUTOMATIC_TRANSITION_SCHEMA_VERSION;
  readonly recordTypeKey: string;
  readonly transitions: readonly PreparedAutomaticTransition[];
}

/** @internal */
export interface AutomaticTransitionEvaluationInput {
  readonly executionId: string;
  readonly correlationId: string;
  readonly timestamp: string;
  readonly brandId: string;
  readonly recordTypeKey: string;
  readonly actor: ActionActor | null;
  readonly oid?: string;
  readonly current?: ActionJsonObject;
  readonly candidate: ActionJsonObject;
  readonly sourceStage: string;
}

/** @internal */
export interface AutomaticTransitionMatch {
  readonly definition: AutomaticTransitionDefinition;
}

export type AutomaticTransitionConfigurationErrorCode =
  | 'automatic-transition-config-invalid'
  | 'automatic-transition-condition-invalid'
  | 'automatic-transition-id-duplicate'
  | 'automatic-transition-legacy-invalid'
  | 'automatic-transition-priority-duplicate';

/** Bounded configuration failure that never includes an expression or record value. */
export class AutomaticTransitionConfigurationError extends Error {
  readonly code: AutomaticTransitionConfigurationErrorCode;
  readonly path: string;

  constructor(code: AutomaticTransitionConfigurationErrorCode, path: string) {
    super('Automatic transition configuration is invalid.');
    this.name = 'AutomaticTransitionConfigurationError';
    this.code = code;
    this.path = path.length <= ACTION_CONTRACT_LIMITS.maxPatchPathLength ? path : '$';
  }
}

const transitionIdentifierSchema = z.string().refine(value => safeActionIdentifierSchema.safeParse(value).success);
const stageReferenceSchema = z.string().refine(value => RECORD_VALIDATION_REFERENCE_PATTERN.test(value));
const automaticTransitionDefinitionSchema: z.ZodType<AutomaticTransitionDefinition, RuntimeValue> = z
  .object({
    schemaVersion: z.literal(AUTOMATIC_TRANSITION_SCHEMA_VERSION),
    id: transitionIdentifierSchema,
    mode: z.literal('automatic'),
    sourceStage: stageReferenceSchema,
    targetStage: stageReferenceSchema,
    priority: z.number().int().nonnegative().max(ACTION_CONTRACT_LIMITS.maxOrder),
    condition: z.string().trim().min(1).max(EXPRESSION_RUNTIME_LIMITS.maxExpressionLength),
    validationOperation: z
      .string()
      .refine(value => VALIDATION_OPERATION_NAME_PATTERN.test(value))
      .optional(),
    targetStageLabelCheck: z.string().trim().min(1).max(ACTION_CONTRACT_LIMITS.maxTitleLength).optional(),
    targetFormCheck: stageReferenceSchema.optional(),
  })
  .strict()
  .refine(transition => transition.sourceStage !== transition.targetStage);

const automaticTransitionCollectionSchema = z
  .array(automaticTransitionDefinitionSchema)
  .max(ACTION_CONTRACT_LIMITS.maxPlanBindings);

const LEGACY_MODES = ['onCreate', 'onUpdate', 'onDelete', 'onTransitionWorkflow'] as const;
const LEGACY_PHASES = ['pre', 'postSync', 'post'] as const;
const LEGACY_AUTOMATIC_TRANSITION = 'sails.services.triggerservice.transitionWorkflow';

function configurationError(
  code: AutomaticTransitionConfigurationErrorCode,
  path = '$.automaticTransitions'
): AutomaticTransitionConfigurationError {
  return new AutomaticTransitionConfigurationError(code, path);
}

function ownDataValue(container: RuntimeValue, key: string, path: string): RuntimeValue {
  if (container === null || typeof container !== 'object' || isProxy(container)) {
    throw configurationError('automatic-transition-config-invalid', path);
  }
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(container, key);
  } catch {
    throw configurationError('automatic-transition-config-invalid', path);
  }
  if (descriptor === undefined) {
    return undefined;
  }
  if (!('value' in descriptor)) {
    throw configurationError('automatic-transition-config-invalid', path);
  }
  return descriptor.value;
}

function preflightConfiguration(value: RuntimeValue, path: string): void {
  const result = boundedValidationPreflight(value, {
    maxBytes: ACTION_CONTRACT_LIMITS.maxJsonBytes,
    maxDepth: ACTION_CONTRACT_LIMITS.maxPlanDepth,
    maxStringLength: ACTION_CONTRACT_LIMITS.maxStringValueLength,
    maxPropertyNameLength: ACTION_CONTRACT_LIMITS.maxIdentifierLength,
    maxWork: ACTION_CONTRACT_LIMITS.maxValidationWork,
    arrayCardinalityLimit: () => ACTION_CONTRACT_LIMITS.maxPlanBindings,
    objectCardinalityLimit: () => ACTION_CONTRACT_LIMITS.maxObjectProperties,
  });
  if (!result.ok) {
    throw configurationError('automatic-transition-config-invalid', path);
  }
}

function explicitTransitions(recordType: RuntimeValue): readonly AutomaticTransitionDefinition[] {
  const value = ownDataValue(recordType, 'automaticTransitions', '$.automaticTransitions');
  if (value === undefined) {
    return Object.freeze([]);
  }
  preflightConfiguration(value, '$.automaticTransitions');
  const parsed = automaticTransitionCollectionSchema.safeParse(value);
  if (!parsed.success) {
    throw configurationError('automatic-transition-config-invalid');
  }
  return Object.freeze(parsed.data.map(transition => Object.freeze(transition)));
}

function legacyScope(mode: (typeof LEGACY_MODES)[number], phase: (typeof LEGACY_PHASES)[number]): ActionBindingScope {
  if (mode === 'onTransitionWorkflow') {
    return { context: 'workflow-transition', mode, phase, scopeId: 'legacy-transition' };
  }
  return { context: 'record-lifecycle', mode, phase };
}

function legacyTransitions(recordType: RuntimeValue, recordTypeKey: string): readonly AutomaticTransitionDefinition[] {
  const hooks = ownDataValue(recordType, 'hooks', '$.hooks');
  if (hooks === undefined || hooks === null) {
    return Object.freeze([]);
  }
  preflightConfiguration(hooks, '$.hooks');
  if (!isRuntimeRecord(hooks)) {
    throw configurationError('automatic-transition-config-invalid', '$.hooks');
  }
  const transitions: AutomaticTransitionDefinition[] = [];
  for (const mode of LEGACY_MODES) {
    const modeValue = ownDataValue(hooks, mode, `$.hooks.${mode}`);
    if (modeValue === undefined || modeValue === null) {
      continue;
    }
    if (!isRuntimeRecord(modeValue)) {
      throw configurationError('automatic-transition-config-invalid', `$.hooks.${mode}`);
    }
    for (const phase of LEGACY_PHASES) {
      const phaseValue = ownDataValue(modeValue, phase, `$.hooks.${mode}.${phase}`);
      if (phaseValue === undefined || phaseValue === null) {
        continue;
      }
      if (!isRuntimeArray(phaseValue) || phaseValue.length > ACTION_CONTRACT_LIMITS.maxArrayItems) {
        throw configurationError('automatic-transition-config-invalid', `$.hooks.${mode}.${phase}`);
      }
      for (let index = 0; index < phaseValue.length; index += 1) {
        const sourcePath = `$.hooks.${mode}.${phase}[${index}]`;
        const definition = ownDataValue(phaseValue, String(index), sourcePath);
        const expression = ownDataValue(definition, 'function', `${sourcePath}.function`);
        if (expression !== LEGACY_AUTOMATIC_TRANSITION) {
          continue;
        }
        if (phase !== 'pre' || mode === 'onDelete') {
          throw configurationError('automatic-transition-legacy-invalid', sourcePath);
        }
        try {
          const migrated = migrateLegacyRecordAction({
            schemaVersion: 1,
            recordTypeKey,
            scope: legacyScope(mode, phase),
            stableKey: `legacy-${mode}-${phase}-${index}`,
            order: index,
            sourcePath,
            definition,
          });
          if (migrated.kind !== 'automatic-transition') {
            throw configurationError('automatic-transition-legacy-invalid', sourcePath);
          }
          transitions.push(
            Object.freeze({
              schemaVersion: AUTOMATIC_TRANSITION_SCHEMA_VERSION,
              id: migrated.id,
              mode: migrated.mode,
              sourceStage: migrated.sourceStage,
              targetStage: migrated.targetStage,
              priority: migrated.priority,
              condition: migrated.condition,
              ...(migrated.targetStageLabelCheck === undefined
                ? {}
                : { targetStageLabelCheck: migrated.targetStageLabelCheck }),
              ...(migrated.targetFormCheck === undefined ? {} : { targetFormCheck: migrated.targetFormCheck }),
            })
          );
        } catch (error) {
          if (error instanceof AutomaticTransitionConfigurationError) {
            throw error;
          }
          throw configurationError('automatic-transition-legacy-invalid', sourcePath);
        }
      }
    }
  }
  return Object.freeze(transitions);
}

function prepareTransitions(
  definitions: readonly AutomaticTransitionDefinition[]
): readonly PreparedAutomaticTransition[] {
  const ids = new Set<string>();
  const prioritiesBySource = new Map<string, Set<number>>();
  const prepared: PreparedAutomaticTransition[] = [];
  for (const [index, definition] of definitions.entries()) {
    const path = `$.automaticTransitions[${index}]`;
    if (ids.has(definition.id)) {
      throw configurationError('automatic-transition-id-duplicate', `${path}.id`);
    }
    ids.add(definition.id);
    const priorities = prioritiesBySource.get(definition.sourceStage) ?? new Set<number>();
    if (priorities.has(definition.priority)) {
      throw configurationError('automatic-transition-priority-duplicate', `${path}.priority`);
    }
    priorities.add(definition.priority);
    prioritiesBySource.set(definition.sourceStage, priorities);
    let preparedCondition: PreparedJsonataExpression;
    try {
      preparedCondition = compileManagedJsonataExpression(definition.condition);
    } catch {
      throw configurationError('automatic-transition-condition-invalid', `${path}.condition`);
    }
    prepared.push(Object.freeze({ definition, preparedCondition }));
  }
  const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
  prepared.sort(
    (left, right) =>
      compareText(left.definition.sourceStage, right.definition.sourceStage) ||
      left.definition.priority - right.definition.priority ||
      compareText(left.definition.id, right.definition.id)
  );
  return Object.freeze(prepared);
}

/** Resolve and precompile every explicit or allowlisted legacy edge before record side effects begin. @internal */
export function resolveAutomaticTransitionPlan(
  recordType: RuntimeValue,
  recordTypeKey: string
): AutomaticTransitionPlan {
  if (!safeActionIdentifierSchema.safeParse(recordTypeKey).success) {
    throw configurationError('automatic-transition-config-invalid', '$.recordTypeKey');
  }
  const definitions = [...explicitTransitions(recordType), ...legacyTransitions(recordType, recordTypeKey)];
  return Object.freeze({
    schemaVersion: AUTOMATIC_TRANSITION_SCHEMA_VERSION,
    recordTypeKey,
    transitions: prepareTransitions(definitions),
  });
}

function conditionContext(
  input: AutomaticTransitionEvaluationInput,
  definition: AutomaticTransitionDefinition
): ActionContext {
  return {
    schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
    executionId: input.executionId,
    correlationId: input.correlationId,
    timestamp: input.timestamp,
    brandId: input.brandId,
    recordTypeKey: input.recordTypeKey,
    scope: {
      context: 'workflow-transition',
      mode: 'onTransitionWorkflow',
      phase: 'pre',
      scopeId: definition.id,
    },
    actor: input.actor,
    record: {
      ...(input.oid === undefined ? {} : { oid: input.oid }),
      ...(input.current === undefined ? {} : { current: input.current }),
      candidate: input.candidate,
    },
    transition: {
      scopeId: definition.id,
      sourceStage: definition.sourceStage,
      targetStage: definition.targetStage,
    },
    priorOutputs: [],
  };
}

/** Evaluate one source-stage snapshot once, in priority order, and return only its first match. @internal */
export async function evaluateAutomaticTransitionPlan(
  plan: AutomaticTransitionPlan,
  input: AutomaticTransitionEvaluationInput
): Promise<AutomaticTransitionMatch | null> {
  for (const transition of plan.transitions) {
    if (transition.definition.sourceStage !== input.sourceStage) {
      continue;
    }
    const context = projectTransitionConditionContext(conditionContext(input, transition.definition));
    if (await evaluateManagedCondition(transition.preparedCondition, context)) {
      return Object.freeze({ definition: transition.definition });
    }
  }
  return null;
}
