import {
  isRuntimeArray,
  isRuntimeRecord,
  parseJsonText,
  type JsonObject,
  type JsonValue,
  type RuntimeValue,
} from '../runtimeValues';
import { isForbiddenExpressionContextKey } from './contexts';
import { EXPRESSION_CONTEXT_SCHEMA_VERSION, EXPRESSION_RUNTIME_LIMITS } from './limits';
import type { ManagedExpressionEngine, ManagedExpressionFailureKind, ManagedTemplateDestination } from './types';

export interface JsonataWorkerRequest {
  readonly engine: 'jsonata';
  readonly source: string;
  readonly context: JsonObject;
}

export interface HandlebarsWorkerRequest {
  readonly engine: 'handlebars';
  readonly source: string;
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

function jsonObject(value: JsonValue | undefined): JsonObject | undefined {
  return value !== undefined && value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : undefined;
}

function hasOnlyKeys(value: JsonObject, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every(key => keys.has(key));
}

function validDestination(value: JsonValue | undefined): value is ManagedTemplateDestination {
  return value === 'plain-text' || value === 'html-text' || value === 'email-subject' || value === 'url-component';
}

function validFailureKind(value: JsonValue | undefined): value is ManagedExpressionFailureKind {
  return (
    value === 'validation' ||
    value === 'evaluation' ||
    value === 'limit' ||
    value === 'timeout' ||
    value === 'interrupted' ||
    value === 'worker'
  );
}

function validEngine(value: JsonValue | undefined): value is ManagedExpressionEngine {
  return value === 'jsonata' || value === 'handlebars';
}

function containsForbiddenKeys(value: RuntimeValue): boolean {
  const pending: RuntimeValue[] = [value];
  let work = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) {
      return true;
    }
    if (current === null || typeof current !== 'object') {
      continue;
    }
    work += 1;
    if (work > EXPRESSION_RUNTIME_LIMITS.maxValidationWork) {
      return true;
    }
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    for (const [key, child] of Object.entries(current)) {
      if (isForbiddenExpressionContextKey(key)) {
        return true;
      }
      pending.push(child);
    }
  }
  return false;
}

function validContextSchema(value: JsonObject): boolean {
  const schemaVersion = value.schemaVersion;
  const purpose = value.purpose;
  if (
    schemaVersion !== EXPRESSION_CONTEXT_SCHEMA_VERSION ||
    (purpose !== 'transition-condition' &&
      purpose !== 'action-parameter' &&
      purpose !== 'text-template' &&
      purpose !== 'output-dependency')
  ) {
    return false;
  }
  return !containsForbiddenKeys(value);
}

function contextSupportsEngine(value: JsonObject, engine: ManagedExpressionEngine): boolean {
  if (!validContextSchema(value)) {
    return false;
  }
  return engine === 'handlebars'
    ? value.purpose === 'text-template'
    : value.purpose === 'transition-condition' ||
        value.purpose === 'action-parameter' ||
        value.purpose === 'output-dependency';
}

export function encodeWorkerMessage(value: ExpressionWorkerRequest | ExpressionWorkerResponse): string {
  return JSON.stringify(value);
}

export function decodeWorkerRequest(message: string): ExpressionWorkerRequest | undefined {
  let parsed: JsonValue;
  try {
    parsed = parseJsonText(message);
  } catch {
    return undefined;
  }
  const value = jsonObject(parsed);
  if (value === undefined || typeof value.source !== 'string') {
    return undefined;
  }
  const context = jsonObject(value.context);
  if (context === undefined) {
    return undefined;
  }
  if (
    value.engine === 'jsonata' &&
    contextSupportsEngine(context, 'jsonata') &&
    hasOnlyKeys(value, new Set(['engine', 'source', 'context']))
  ) {
    return { engine: 'jsonata', source: value.source, context };
  }
  if (
    value.engine === 'handlebars' &&
    contextSupportsEngine(context, 'handlebars') &&
    validDestination(value.destination) &&
    hasOnlyKeys(value, new Set(['engine', 'source', 'destination', 'context']))
  ) {
    return { engine: 'handlebars', source: value.source, destination: value.destination, context };
  }
  return undefined;
}

export function decodeWorkerResponse(message: RuntimeValue): ExpressionWorkerResponse | undefined {
  if (typeof message !== 'string') {
    return undefined;
  }
  let parsed: JsonValue;
  try {
    parsed = parseJsonText(message);
  } catch {
    return undefined;
  }
  const value = jsonObject(parsed);
  if (value === undefined || typeof value.type !== 'string') {
    return undefined;
  }
  if (value.type === 'ready' && hasOnlyKeys(value, new Set(['type']))) {
    return { type: 'ready' };
  }
  if (value.type === 'json-result' && value.present === false && hasOnlyKeys(value, new Set(['type', 'present']))) {
    return { type: 'json-result', present: false };
  }
  if (
    value.type === 'json-result' &&
    value.present === true &&
    value.value !== undefined &&
    hasOnlyKeys(value, new Set(['type', 'present', 'value']))
  ) {
    return { type: 'json-result', present: true, value: value.value };
  }
  if (
    value.type === 'text-result' &&
    typeof value.value === 'string' &&
    hasOnlyKeys(value, new Set(['type', 'value']))
  ) {
    return { type: 'text-result', value: value.value };
  }
  if (
    value.type === 'failure' &&
    validEngine(value.engine) &&
    validFailureKind(value.kind) &&
    typeof value.code === 'string' &&
    /^[a-z0-9-]+$/.test(value.code) &&
    value.code.length <= EXPRESSION_RUNTIME_LIMITS.maxDiagnosticCodeLength &&
    hasOnlyKeys(value, new Set(['type', 'engine', 'kind', 'code']))
  ) {
    return { type: 'failure', engine: value.engine, kind: value.kind, code: value.code };
  }
  return undefined;
}

export function runtimeValueIsBoundedJson(value: RuntimeValue): value is JsonValue {
  const pending: RuntimeValue[] = [value];
  let work = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) {
      return false;
    }
    work += 1;
    if (work > EXPRESSION_RUNTIME_LIMITS.maxValidationWork) {
      return false;
    }
    if (
      current === null ||
      typeof current === 'string' ||
      typeof current === 'boolean' ||
      (typeof current === 'number' && Number.isFinite(current))
    ) {
      continue;
    }
    if (isRuntimeArray(current)) {
      if (current.length > EXPRESSION_RUNTIME_LIMITS.maxArrayItems) {
        return false;
      }
      pending.push(...current);
      continue;
    }
    if (isRuntimeRecord(current)) {
      if (Object.keys(current).length > EXPRESSION_RUNTIME_LIMITS.maxObjectProperties) {
        return false;
      }
      pending.push(...Object.values(current));
      continue;
    }
    return false;
  }
  return !containsForbiddenKeys(value);
}
