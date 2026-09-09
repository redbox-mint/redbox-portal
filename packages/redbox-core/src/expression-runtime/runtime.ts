import path from 'node:path';
import { isProxy, isSet } from 'node:util/types';
import { Worker } from 'node:worker_threads';
import { boundedValidationPreflight } from '../boundedValidation';
import { parseJsonText, type JsonObject, type JsonValue, type RuntimeValue } from '../runtimeValues';
import { ManagedExpressionError } from './errors';
import { EXPRESSION_ARTIFACT_SCHEMA_VERSION, EXPRESSION_RUNTIME_LIMITS } from './limits';
import { decodeWorkerResponse, type ExpressionWorkerRequest, type ExpressionWorkerResponse } from './worker-protocol';
import type {
  ManagedEvaluationOptions,
  ManagedExpressionContext,
  ManagedExpressionEngine,
  ManagedJsonataContext,
  ManagedJsonataResult,
  ManagedJsonataValueContext,
  PreparedHandlebarsTemplate,
  PreparedJsonataExpression,
  TextTemplateContext,
  TransitionConditionContext,
} from './types';

/** Copy only preflight-validated own data, with no inherited serialization hooks. */
function serializationContext(value: RuntimeValue): RuntimeValue {
  // JSON.stringify also consults BigInt.prototype.toJSON for primitive bigints.
  if (typeof value === 'bigint') throw new TypeError();
  if (value === null || typeof value !== 'object') return value;
  const copy: object = Array.isArray(value) ? [] : Object.create(null);
  Object.setPrototypeOf(copy, null);
  for (const key of Object.keys(value)) {
    const child: RuntimeValue = Object.getOwnPropertyDescriptor(value, key)?.value;
    Object.defineProperty(copy, key, {
      value: serializationContext(child),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return copy;
}

function contextAsJsonObject(context: ManagedExpressionContext, engine: ManagedExpressionEngine): JsonObject {
  const preflight = boundedValidationPreflight(context, {
    maxBytes: EXPRESSION_RUNTIME_LIMITS.maxInputBytes,
    maxDepth: EXPRESSION_RUNTIME_LIMITS.maxInputDepth,
    maxStringLength: EXPRESSION_RUNTIME_LIMITS.maxInputBytes,
    maxPropertyNameLength: EXPRESSION_RUNTIME_LIMITS.maxPropertyNameLength,
    maxWork: EXPRESSION_RUNTIME_LIMITS.maxValidationWork,
    arrayCardinalityLimit: () => EXPRESSION_RUNTIME_LIMITS.maxArrayItems,
    objectCardinalityLimit: () => EXPRESSION_RUNTIME_LIMITS.maxObjectProperties,
  });
  if (!preflight.ok) {
    throw new ManagedExpressionError(engine, 'limit', 'expression-input-limit-exceeded');
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(serializationContext(context));
  } catch {
    throw new ManagedExpressionError(engine, 'validation', 'expression-context-invalid');
  }
  let parsed: JsonValue;
  try {
    parsed = parseJsonText(serialized);
  } catch {
    throw new ManagedExpressionError(engine, 'validation', 'expression-context-invalid');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ManagedExpressionError(engine, 'validation', 'expression-context-invalid');
  }
  return parsed;
}

function validateArtifact(
  value: PreparedJsonataExpression | PreparedHandlebarsTemplate,
  engine: ManagedExpressionEngine
): void {
  const maxSourceLength =
    engine === 'jsonata' ? EXPRESSION_RUNTIME_LIMITS.maxExpressionLength : EXPRESSION_RUNTIME_LIMITS.maxTemplateLength;
  const invalid = (): never => {
    throw new ManagedExpressionError(engine, 'validation', `${engine}-artifact-invalid`);
  };
  if (value === null || typeof value !== 'object' || isProxy(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const fields = ['schemaVersion', 'engine', 'source', 'astNodes'];
  if (engine === 'handlebars') fields.push('destination');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) invalid();
  for (const key of keys) {
    if (typeof key !== 'string' || !fields.includes(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) invalid();
  }
  // Every subsequent read is now guaranteed to resolve to an own data field.
  if (
    value.engine !== engine ||
    value.schemaVersion !== EXPRESSION_ARTIFACT_SCHEMA_VERSION ||
    typeof value.source !== 'string' ||
    value.source.length === 0 ||
    value.source.length > maxSourceLength ||
    !Number.isInteger(value.astNodes) ||
    value.astNodes < 1 ||
    value.astNodes > EXPRESSION_RUNTIME_LIMITS.maxAstNodes ||
    (value.engine === 'handlebars' &&
      !['plain-text', 'html-text', 'email-subject', 'url-component'].includes(value.destination))
  )
    invalid();
}

function optionValue(
  options: ManagedEvaluationOptions,
  key: 'timeoutMs' | 'signal',
  engine: ManagedExpressionEngine
): RuntimeValue {
  if (options === null || typeof options !== 'object' || isProxy(options)) {
    throw new ManagedExpressionError(engine, 'validation', 'expression-options-invalid');
  }
  const descriptor = Object.getOwnPropertyDescriptor(options, key);
  if (descriptor !== undefined && !Object.hasOwn(descriptor, 'value')) {
    throw new ManagedExpressionError(engine, 'validation', 'expression-options-invalid');
  }
  return descriptor?.value;
}

const nativeSignalShape = new AbortController().signal;
const nativeAbortedKey = Object.getOwnPropertySymbols(nativeSignalShape).find(key => key.description === 'kAborted')!;
const nativeCompositeKey = Object.getOwnPropertySymbols(nativeSignalShape).find(
  key => key.description === 'kComposite'
)!;
const nativeCompositeShape = AbortSignal.any([nativeSignalShape]);
const nativeSourcesKey = Object.getOwnPropertySymbols(nativeCompositeShape).find(
  key => key.description === 'kSourceSignals'
)!;
const nativeSources: Set<WeakRef<object>> = Object.getOwnPropertyDescriptor(
  nativeCompositeShape,
  nativeSourcesKey
)?.value;
const nativeSourcesPrototype: object = Object.getPrototypeOf(nativeSources);
const nativeSourceRefPrototype: object = Object.getPrototypeOf(Set.prototype.values.call(nativeSources).next().value);
const nativeReasonKey = Object.getOwnPropertySymbols(nativeSignalShape).find(key => key.description === 'kReason')!;
const nativeSignalPrototype = AbortSignal.prototype;
const setValues = Set.prototype.values;
const weakRefDeref = WeakRef.prototype.deref;

/**
 * Node exposes signal state through mutable symbols, not an unforgeable brand.
 * Normalize only descriptor-validated cancellation state. Never register on the
 * supplied EventTarget: even intrinsic listener methods reach mutable nested
 * event lists and dispatch hooks. Polling leaves that entire graph untouched.
 * The reason is opaque and is never read, classified, or transferred.
 */
function signalAborted(signal: object, budget = { remaining: 1000 }, sourceDepth = 0): boolean {
  if (--budget.remaining < 0 || sourceDepth > 8 || isProxy(signal)) throw new Error();
  if (Object.getPrototypeOf(signal) !== nativeSignalPrototype) throw new Error();
  for (const nativeKey of Reflect.ownKeys(nativeSignalShape)) {
    const own = Object.getOwnPropertyDescriptor(signal, nativeKey);
    if (own === undefined || !Object.hasOwn(own, 'value')) throw new Error();
    const expected: RuntimeValue = Object.getOwnPropertyDescriptor(nativeSignalShape, nativeKey)?.value;
    if (typeof expected === 'boolean' && typeof own.value !== 'boolean') throw new Error();
  }
  const keys = Reflect.ownKeys(signal);
  if (keys.length > 100) throw new Error();
  for (const key of keys) {
    const own = Object.getOwnPropertyDescriptor(signal, key);
    if (own === undefined || !Object.hasOwn(own, 'value')) throw new Error();
    if (key === nativeReasonKey) continue;
    const child: RuntimeValue = own.value;
    if (child !== null && (typeof child === 'object' || typeof child === 'function') && isProxy(child)) {
      throw new Error();
    }
  }
  const aborted: RuntimeValue = Object.getOwnPropertyDescriptor(signal, nativeAbortedKey)?.value;
  const composite: RuntimeValue = Object.getOwnPropertyDescriptor(signal, nativeCompositeKey)?.value;
  if (typeof aborted !== 'boolean' || typeof composite !== 'boolean') throw new Error();
  if (!composite || aborted) return aborted;
  // Node composites can refresh lazily. Use intrinsic Set/WeakRef operations,
  // a shared work budget and a depth bound; never invoke caller iterators.
  const sources: RuntimeValue = Object.getOwnPropertyDescriptor(signal, nativeSourcesKey)?.value;
  if (sources === undefined) return false;
  if (
    isProxy(sources) ||
    !isSet(sources) ||
    Object.getPrototypeOf(sources) !== nativeSourcesPrototype ||
    Reflect.ownKeys(sources).length !== 0
  )
    throw new Error();
  let sourceAborted = false;
  for (const reference of setValues.call(sources)) {
    if (
      --budget.remaining < 0 ||
      reference === null ||
      typeof reference !== 'object' ||
      isProxy(reference) ||
      Object.getPrototypeOf(reference) !== nativeSourceRefPrototype ||
      Reflect.ownKeys(reference).length !== 0
    )
      throw new Error();
    const source: object | undefined = weakRefDeref.call(reference);
    if (source !== undefined) sourceAborted = signalAborted(source, budget, sourceDepth + 1) || sourceAborted;
  }
  return sourceAborted;
}

function timeoutMs(options: ManagedEvaluationOptions, engine: ManagedExpressionEngine): number {
  const timeout = optionValue(options, 'timeoutMs', engine) ?? EXPRESSION_RUNTIME_LIMITS.defaultTimeoutMs;
  if (
    typeof timeout !== 'number' ||
    !Number.isInteger(timeout) ||
    timeout < EXPRESSION_RUNTIME_LIMITS.minTimeoutMs ||
    timeout > EXPRESSION_RUNTIME_LIMITS.maxTimeoutMs
  ) {
    throw new ManagedExpressionError(engine, 'validation', 'expression-timeout-invalid');
  }
  return timeout;
}

function workerFilename(): string {
  const extension = path.extname(__filename);
  if (extension === '.ts') {
    // Package tests follow the documented build-before-test workflow. Loading
    // the compiled worker also keeps the test boundary under the production
    // worker memory cap instead of loading a TypeScript compiler in the worker.
    return path.resolve(__dirname, '../../dist/expression-runtime/worker.js');
  }
  return path.join(__dirname, `worker${extension}`);
}

function createExpressionWorker(engine: ManagedExpressionEngine): Worker {
  try {
    return new Worker(workerFilename(), {
      resourceLimits: {
        maxOldGenerationSizeMb: EXPRESSION_RUNTIME_LIMITS.workerMaxOldGenerationSizeMb,
        maxYoungGenerationSizeMb: EXPRESSION_RUNTIME_LIMITS.workerMaxYoungGenerationSizeMb,
        stackSizeMb: EXPRESSION_RUNTIME_LIMITS.workerStackSizeMb,
      },
    });
  } catch {
    throw new ManagedExpressionError(engine, 'worker', 'expression-worker-start-failed');
  }
}

function runWorker(
  request: ExpressionWorkerRequest,
  options: ManagedEvaluationOptions
): Promise<ExpressionWorkerResponse> {
  const engine = request.engine;
  const evaluationTimeoutMs = timeoutMs(options, engine);
  const signalValue = optionValue(options, 'signal', engine);
  let signal: object | undefined;
  const isAborted = (): boolean => {
    if (signal === undefined) return false;
    return signalAborted(signal);
  };
  try {
    if (signalValue !== undefined) {
      if (signalValue === null || typeof signalValue !== 'object' || isProxy(signalValue)) {
        throw new Error();
      }
      signal = signalValue;
    }
    if (isAborted()) {
      return Promise.reject(new ManagedExpressionError(engine, 'interrupted', `${engine}-interrupted`, false));
    }
  } catch {
    return Promise.reject(new ManagedExpressionError(engine, 'validation', 'expression-options-invalid'));
  }

  return new Promise((resolve, reject) => {
    const worker = createExpressionWorker(engine);
    let settled = false;
    let ready = false;
    let evaluationTimer: NodeJS.Timeout | undefined;
    let cancellationTimer: NodeJS.Timeout | undefined;

    const cleanup = (): void => {
      clearTimeout(startupTimer);
      clearTimeout(evaluationTimer);
      clearInterval(cancellationTimer);
    };

    const rejectAfterTermination = (error: ManagedExpressionError): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      void worker.terminate().then(
        () => reject(error),
        () => reject(error)
      );
    };

    const checkCancellation = (): boolean => {
      if (settled) return true;
      try {
        if (!isAborted()) return false;
        rejectAfterTermination(new ManagedExpressionError(engine, 'interrupted', `${engine}-interrupted`, true));
      } catch {
        rejectAfterTermination(new ManagedExpressionError(engine, 'validation', 'expression-options-invalid', true));
      }
      return true;
    };

    const startupTimer = setTimeout(() => {
      if (!checkCancellation())
        rejectAfterTermination(new ManagedExpressionError(engine, 'worker', 'expression-worker-startup-timeout', true));
    }, EXPRESSION_RUNTIME_LIMITS.workerStartupTimeoutMs);

    worker.on('message', (message: RuntimeValue) => {
      if (checkCancellation()) return;
      const response = decodeWorkerResponse(message);
      if (response === undefined) {
        rejectAfterTermination(
          new ManagedExpressionError(engine, 'worker', 'expression-worker-response-invalid', true)
        );
        return;
      }
      if (response.type === 'ready') {
        if (ready) {
          rejectAfterTermination(
            new ManagedExpressionError(engine, 'worker', 'expression-worker-response-invalid', true)
          );
          return;
        }
        ready = true;
        clearTimeout(startupTimer);
        evaluationTimer = setTimeout(() => {
          if (!checkCancellation())
            rejectAfterTermination(new ManagedExpressionError(engine, 'timeout', `${engine}-timeout`, true));
        }, evaluationTimeoutMs);
        try {
          worker.postMessage(request);
        } catch {
          rejectAfterTermination(new ManagedExpressionError(engine, 'worker', 'expression-worker-send-failed', true));
        }
        return;
      }
      if (!ready) {
        rejectAfterTermination(
          new ManagedExpressionError(engine, 'worker', 'expression-worker-response-invalid', true)
        );
        return;
      }
      settled = true;
      cleanup();
      if (response.type === 'failure') {
        reject(new ManagedExpressionError(engine, response.kind, response.code));
      } else {
        resolve(response);
      }
    });
    worker.on('error', () => {
      rejectAfterTermination(new ManagedExpressionError(engine, 'worker', 'expression-worker-failed', true));
    });
    worker.on('exit', () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new ManagedExpressionError(engine, 'worker', 'expression-worker-exited'));
      }
    });
    if (signal !== undefined) cancellationTimer = setInterval(checkCancellation, 5);
  });
}

async function evaluatePreparedJsonata(
  prepared: PreparedJsonataExpression,
  context: ManagedJsonataContext,
  purpose: 'condition' | 'value',
  options: ManagedEvaluationOptions = {}
): Promise<ManagedJsonataResult> {
  validateArtifact(prepared, 'jsonata');
  const projected = contextAsJsonObject(context, 'jsonata');
  if (
    purpose === 'condition'
      ? projected.purpose !== 'transition-condition'
      : projected.purpose !== 'action-parameter' && projected.purpose !== 'output-dependency'
  ) {
    throw new ManagedExpressionError('jsonata', 'validation', 'expression-context-invalid');
  }
  const response = await runWorker(
    {
      engine: 'jsonata',
      source: prepared.source,
      astNodes: prepared.astNodes,
      context: projected,
    },
    options
  );
  if (response.type !== 'json-result') {
    throw new ManagedExpressionError('jsonata', 'worker', 'jsonata-worker-result-invalid');
  }
  return response.present ? response.value : undefined;
}

export async function evaluateManagedJsonata(
  prepared: PreparedJsonataExpression,
  context: ManagedJsonataValueContext,
  options: ManagedEvaluationOptions = {}
): Promise<ManagedJsonataResult> {
  return await evaluatePreparedJsonata(prepared, context, 'value', options);
}

export async function evaluateManagedCondition(
  prepared: PreparedJsonataExpression,
  context: TransitionConditionContext,
  options: ManagedEvaluationOptions = {}
): Promise<boolean> {
  const result = await evaluatePreparedJsonata(prepared, context, 'condition', options);
  if (typeof result !== 'boolean') {
    throw new ManagedExpressionError('jsonata', 'evaluation', 'jsonata-condition-result-invalid');
  }
  return result;
}

export async function renderManagedHandlebars(
  prepared: PreparedHandlebarsTemplate,
  context: TextTemplateContext,
  options: ManagedEvaluationOptions = {}
): Promise<string> {
  validateArtifact(prepared, 'handlebars');
  const response = await runWorker(
    {
      engine: 'handlebars',
      source: prepared.source,
      astNodes: prepared.astNodes,
      destination: prepared.destination,
      context: contextAsJsonObject(context, 'handlebars'),
    },
    options
  );
  if (response.type !== 'text-result') {
    throw new ManagedExpressionError('handlebars', 'worker', 'handlebars-worker-result-invalid');
  }
  return response.value;
}
