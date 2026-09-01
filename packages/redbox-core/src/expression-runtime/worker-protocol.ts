import { z } from 'zod';
import type { JsonObject, JsonValue } from '../runtimeValues';
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

const purposeSchema = z.enum(['transition-condition', 'action-parameter', 'text-template', 'output-dependency']);

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

const contextSchema = z
  .intersection(
    z.json(),
    z.looseObject({
      schemaVersion: z.literal(EXPRESSION_CONTEXT_SCHEMA_VERSION),
      purpose: purposeSchema,
    })
  )
  .refine(context => !containsForbiddenKeys(context as JsonObject));

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

export function decodeWorkerRequest(message: unknown): ExpressionWorkerRequest | undefined {
  const result = requestSchema.safeParse(message);
  return result.success ? (result.data as ExpressionWorkerRequest) : undefined;
}

export function decodeWorkerResponse(message: unknown): ExpressionWorkerResponse | undefined {
  const result = responseSchema.safeParse(message);
  return result.success ? (result.data as ExpressionWorkerResponse) : undefined;
}

export function runtimeValueIsJson(value: unknown): value is JsonValue {
  return z.json().safeParse(value).success;
}
