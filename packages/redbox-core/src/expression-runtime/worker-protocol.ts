import { z } from 'zod';
import { boundedValidationPreflight } from '../boundedValidation';
import type { JsonObject, JsonValue, RuntimeValue } from '../runtimeValues';
import { isForbiddenExpressionContextKey } from './contexts';
import { EXPRESSION_CONTEXT_SCHEMA_VERSION, EXPRESSION_RUNTIME_LIMITS } from './limits';
import type { ManagedExpressionEngine, ManagedExpressionFailureKind, ManagedTemplateDestination } from './types';

export interface JsonataWorkerRequest {
  readonly engine: 'jsonata';
  readonly source: string;
  readonly astNodes: number;
  readonly context: JsonObject;
}

export interface HandlebarsWorkerRequest {
  readonly engine: 'handlebars';
  readonly source: string;
  readonly astNodes: number;
  readonly destination: ManagedTemplateDestination;
  readonly context: JsonObject;
}

export type ExpressionWorkerRequest = JsonataWorkerRequest | HandlebarsWorkerRequest;

export type ExpressionWorkerResponse =
  | { readonly type: 'ready' }
  | { readonly type: 'json-result'; readonly present: false }
  | { readonly type: 'json-result'; readonly present: true; readonly value: JsonValue }
  | { readonly type: 'text-result'; readonly value: string }
  | {
      readonly type: 'failure';
      readonly engine: ManagedExpressionEngine;
      readonly kind: ManagedExpressionFailureKind;
      readonly code: string;
    };

function containsForbiddenKeys(value: JsonValue): boolean {
  const pending: JsonValue[] = [value];
  let work = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || current === null || typeof current !== 'object') continue;
    work += 1;
    if (work > EXPRESSION_RUNTIME_LIMITS.maxValidationWork) return true;
    if (Array.isArray(current)) pending.push(...current);
    else {
      for (const [key, child] of Object.entries(current)) {
        if (isForbiddenExpressionContextKey(key)) return true;
        pending.push(child);
      }
    }
  }
  return false;
}

const jsonObjectSchema = z.record(z.string(), z.json());
const recordSchema = z
  .object({
    oid: z.string().optional(),
    current: jsonObjectSchema.optional(),
    candidate: jsonObjectSchema.optional(),
  })
  .strict();
const transitionSchema = z
  .object({
    id: z.string(),
    sourceStage: z.string(),
    targetStage: z.string(),
  })
  .strict();
const priorOutputSchema = z.object({ bindingId: z.string(), fields: jsonObjectSchema }).strict();
const base = {
  schemaVersion: z.literal(EXPRESSION_CONTEXT_SCHEMA_VERSION),
  timestamp: z.string(),
  brandId: z.string(),
  recordTypeKey: z.string(),
  actor: z
    .object({ id: z.string(), username: z.string().optional(), roles: z.array(z.string()) })
    .strict()
    .nullable(),
};
const contextSchema = z
  .discriminatedUnion('purpose', [
    z
      .object({
        ...base,
        purpose: z.literal('transition-condition'),
        record: recordSchema,
        transition: transitionSchema,
      })
      .strict(),
    z
      .object({
        ...base,
        purpose: z.literal('text-template'),
        record: recordSchema,
        transition: transitionSchema.optional(),
      })
      .strict(),
    z
      .object({
        ...base,
        purpose: z.literal('action-parameter'),
        executionId: z.string(),
        correlationId: z.string(),
        scope: z
          .object({ context: z.string(), mode: z.string(), phase: z.string(), scopeId: z.string().optional() })
          .strict(),
        record: recordSchema,
        transition: transitionSchema.optional(),
        priorOutputs: z.array(priorOutputSchema),
      })
      .strict(),
    z
      .object({
        schemaVersion: z.literal(EXPRESSION_CONTEXT_SCHEMA_VERSION),
        purpose: z.literal('output-dependency'),
        brandId: z.string(),
        recordTypeKey: z.string(),
        priorOutput: priorOutputSchema,
      })
      .strict(),
  ])
  .refine(context => !containsForbiddenKeys(context));

const jsonataRequestSchema = z
  .object({
    engine: z.literal('jsonata'),
    source: z.string().max(EXPRESSION_RUNTIME_LIMITS.maxExpressionLength),
    astNodes: z.number().int().positive().max(EXPRESSION_RUNTIME_LIMITS.maxAstNodes),
    context: contextSchema.refine(context => context.purpose !== 'text-template'),
  })
  .strict();

const handlebarsRequestSchema = z
  .object({
    engine: z.literal('handlebars'),
    source: z.string().max(EXPRESSION_RUNTIME_LIMITS.maxTemplateLength),
    astNodes: z.number().int().positive().max(EXPRESSION_RUNTIME_LIMITS.maxAstNodes),
    destination: z.enum(['plain-text', 'html-text', 'email-subject', 'url-component']),
    context: contextSchema.refine(context => context.purpose === 'text-template'),
  })
  .strict();

const requestSchema = z.discriminatedUnion('engine', [jsonataRequestSchema, handlebarsRequestSchema]);
const responseSchema = z.union([
  z.object({ type: z.literal('ready') }).strict(),
  z.object({ type: z.literal('json-result'), present: z.literal(false) }).strict(),
  z.object({ type: z.literal('json-result'), present: z.literal(true), value: z.json() }).strict(),
  z.object({ type: z.literal('text-result'), value: z.string() }).strict(),
  z
    .object({
      type: z.literal('failure'),
      engine: z.enum(['jsonata', 'handlebars']),
      kind: z.enum(['validation', 'evaluation', 'limit', 'timeout', 'interrupted', 'worker']),
      code: z
        .string()
        .max(EXPRESSION_RUNTIME_LIMITS.maxDiagnosticCodeLength)
        .regex(/^[a-z0-9-]+$/),
    })
    .strict(),
]);

function protocolPreflight(value: RuntimeValue): boolean {
  return boundedValidationPreflight(value, {
    maxBytes: EXPRESSION_RUNTIME_LIMITS.maxInputBytes + EXPRESSION_RUNTIME_LIMITS.maxTemplateLength * 6 + 1024,
    maxDepth: EXPRESSION_RUNTIME_LIMITS.maxInputDepth + 2,
    maxStringLength: EXPRESSION_RUNTIME_LIMITS.maxInputBytes,
    maxPropertyNameLength: EXPRESSION_RUNTIME_LIMITS.maxPropertyNameLength,
    maxWork: EXPRESSION_RUNTIME_LIMITS.maxValidationWork,
    arrayCardinalityLimit: () => EXPRESSION_RUNTIME_LIMITS.maxArrayItems,
    objectCardinalityLimit: () => EXPRESSION_RUNTIME_LIMITS.maxObjectProperties,
  }).ok;
}

export function decodeWorkerRequest(message: RuntimeValue): ExpressionWorkerRequest | undefined {
  if (!protocolPreflight(message)) return undefined;
  const result = requestSchema.safeParse(message);
  return result.success ? (result.data as ExpressionWorkerRequest) : undefined;
}

export function decodeWorkerResponse(message: RuntimeValue): ExpressionWorkerResponse | undefined {
  if (!protocolPreflight(message)) return undefined;
  const result = responseSchema.safeParse(message);
  return result.success ? (result.data as ExpressionWorkerResponse) : undefined;
}

export function runtimeValueIsJson(value: RuntimeValue): value is JsonValue {
  return protocolPreflight(value) && z.json().safeParse(value).success;
}
