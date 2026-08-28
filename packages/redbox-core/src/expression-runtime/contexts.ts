import {
  parseActionContext,
  type ActionActor,
  type ActionContext,
  type ActionJsonObject,
  type ActionJsonValue,
} from '../action-registry/contracts';
import type { ActionBindingId, ActionBindingScope } from '../action-registry/identifiers';
import { EXPRESSION_CONTEXT_SCHEMA_VERSION, EXPRESSION_RUNTIME_LIMITS } from './limits';
import { ManagedExpressionError } from './errors';
import type {
  ActionParameterExpressionContext,
  OutputDependencyExpressionContext,
  SafeExpressionJsonObject,
  SafeExpressionJsonValue,
  SafeExpressionPriorOutputProjection,
  SafeExpressionRecordProjection,
  SafeExpressionTransitionProjection,
  TextTemplateContext,
  TransitionConditionContext,
} from './types';

const FORBIDDEN_CONTEXT_KEY_PARTS = Object.freeze([
  'accesskey',
  'apikey',
  'authorization',
  'bearer',
  'cookie',
  'credential',
  'encryptionkey',
  'environment',
  'filesystem',
  'passphrase',
  'password',
  'privatekey',
  'processenv',
  'request',
  'response',
  'secret',
  'service',
  'session',
  'signingkey',
  'token',
]);

const FORBIDDEN_CONTEXT_KEYS = new Set([
  '__proto__',
  'constructor',
  'env',
  'fs',
  'global',
  'globalthis',
  'process',
  'prototype',
  'req',
  'request',
  'res',
  'response',
  'sails',
]);

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_]/g, '');
}

/** Keys with server-internal or secret-bearing semantics never enter a projection. */
export function isForbiddenExpressionContextKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return FORBIDDEN_CONTEXT_KEYS.has(normalized) || FORBIDDEN_CONTEXT_KEY_PARTS.some(part => normalized.includes(part));
}

function projectJsonValue(value: ActionJsonValue): SafeExpressionJsonValue {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map(projectJsonValue));
  }
  return projectJsonObject(value);
}

function projectJsonObject(value: ActionJsonObject): SafeExpressionJsonObject {
  const projected: Record<string, SafeExpressionJsonValue> = {};
  for (const [key, child] of Object.entries(value)) {
    if (!isForbiddenExpressionContextKey(key)) {
      projected[key] = projectJsonValue(child);
    }
  }
  return Object.freeze(projected);
}

function projectActor(actor: ActionActor | null): Readonly<ActionActor> | null {
  if (actor === null) {
    return null;
  }
  const roles = [...actor.roles];
  Object.freeze(roles);
  const projected: ActionActor =
    actor.username === undefined ? { id: actor.id, roles } : { id: actor.id, username: actor.username, roles };
  return Object.freeze(projected);
}

function projectRecord(context: ActionContext): SafeExpressionRecordProjection {
  const current = context.record.current === undefined ? undefined : projectJsonObject(context.record.current);
  const candidate = context.record.candidate === undefined ? undefined : projectJsonObject(context.record.candidate);
  return Object.freeze({
    ...(context.record.oid === undefined ? {} : { oid: context.record.oid }),
    ...(current === undefined ? {} : { current }),
    ...(candidate === undefined ? {} : { candidate }),
  });
}

function projectTransition(context: ActionContext): SafeExpressionTransitionProjection | undefined {
  if (context.transition === undefined) {
    return undefined;
  }
  return Object.freeze({
    id: context.transition.scopeId,
    sourceStage: context.transition.sourceStage,
    targetStage: context.transition.targetStage,
  });
}

function projectScope(scope: ActionBindingScope): Readonly<ActionBindingScope> {
  if (scope.context === 'record-lifecycle') {
    return Object.freeze({ context: scope.context, mode: scope.mode, phase: scope.phase });
  }
  if (scope.context === 'workflow-transition') {
    return Object.freeze({
      context: scope.context,
      mode: scope.mode,
      phase: scope.phase,
      scopeId: scope.scopeId,
    });
  }
  const scopeId = scope.scopeId;
  return Object.freeze({
    context: scope.context,
    mode: scope.mode,
    phase: scope.phase,
    ...(scopeId === undefined ? {} : { scopeId }),
  });
}

function validatedContext(context: ActionContext, engine: 'jsonata' | 'handlebars'): ActionContext {
  try {
    return parseActionContext(context);
  } catch {
    throw new ManagedExpressionError(engine, 'validation', 'expression-context-invalid');
  }
}

function projectPriorOutputs(context: ActionContext): readonly SafeExpressionPriorOutputProjection[] {
  return Object.freeze(
    context.priorOutputs.map(prior =>
      Object.freeze({
        bindingId: prior.bindingId,
        fields: projectJsonObject(prior.output.fields),
      })
    )
  );
}

export function projectTransitionConditionContext(context: ActionContext): TransitionConditionContext {
  const validated = validatedContext(context, 'jsonata');
  const transition = projectTransition(validated);
  if (transition === undefined) {
    throw new ManagedExpressionError('jsonata', 'validation', 'transition-context-required');
  }
  return Object.freeze({
    schemaVersion: EXPRESSION_CONTEXT_SCHEMA_VERSION,
    purpose: 'transition-condition',
    timestamp: validated.timestamp,
    brandId: validated.brandId,
    recordTypeKey: validated.recordTypeKey,
    actor: projectActor(validated.actor),
    record: projectRecord(validated),
    transition,
  });
}

export function projectActionParameterContext(context: ActionContext): ActionParameterExpressionContext {
  const validated = validatedContext(context, 'jsonata');
  const transition = projectTransition(validated);
  return Object.freeze({
    schemaVersion: EXPRESSION_CONTEXT_SCHEMA_VERSION,
    purpose: 'action-parameter',
    timestamp: validated.timestamp,
    brandId: validated.brandId,
    recordTypeKey: validated.recordTypeKey,
    actor: projectActor(validated.actor),
    executionId: validated.executionId,
    correlationId: validated.correlationId,
    scope: projectScope(validated.scope),
    record: projectRecord(validated),
    ...(transition === undefined ? {} : { transition }),
    priorOutputs: projectPriorOutputs(validated),
  });
}

export function projectTextTemplateContext(context: ActionContext): TextTemplateContext {
  const validated = validatedContext(context, 'handlebars');
  const transition = projectTransition(validated);
  return Object.freeze({
    schemaVersion: EXPRESSION_CONTEXT_SCHEMA_VERSION,
    purpose: 'text-template',
    timestamp: validated.timestamp,
    brandId: validated.brandId,
    recordTypeKey: validated.recordTypeKey,
    actor: projectActor(validated.actor),
    record: projectRecord(validated),
    ...(transition === undefined ? {} : { transition }),
  });
}

export function projectOutputDependencyContext(
  context: ActionContext,
  bindingId: ActionBindingId,
  fields: readonly string[]
): OutputDependencyExpressionContext {
  const validated = validatedContext(context, 'jsonata');
  const prior = validated.priorOutputs.find(output => output.bindingId === bindingId);
  if (prior === undefined) {
    throw new ManagedExpressionError('jsonata', 'validation', 'prior-output-not-found');
  }
  if (fields.length > EXPRESSION_RUNTIME_LIMITS.maxObjectProperties) {
    throw new ManagedExpressionError('jsonata', 'limit', 'prior-output-cardinality-exceeded');
  }
  if (new Set(fields).size !== fields.length) {
    throw new ManagedExpressionError('jsonata', 'validation', 'prior-output-field-duplicate');
  }
  const selected: Record<string, SafeExpressionJsonValue> = {};
  for (const field of fields) {
    if (isForbiddenExpressionContextKey(field)) {
      throw new ManagedExpressionError('jsonata', 'validation', 'prior-output-field-forbidden');
    }
    const value = Object.hasOwn(prior.output.fields, field) ? prior.output.fields[field] : undefined;
    if (value !== undefined) {
      selected[field] = projectJsonValue(value);
    }
  }
  return Object.freeze({
    schemaVersion: EXPRESSION_CONTEXT_SCHEMA_VERSION,
    purpose: 'output-dependency',
    brandId: validated.brandId,
    recordTypeKey: validated.recordTypeKey,
    priorOutput: Object.freeze({ bindingId, fields: Object.freeze(selected) }),
  });
}
