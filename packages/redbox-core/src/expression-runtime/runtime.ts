import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { boundedValidationPreflight } from '../boundedValidation';
import { parseJsonText, type JsonObject, type JsonValue, type RuntimeValue } from '../runtimeValues';
import { compileManagedHandlebarsTemplate, compileManagedJsonataExpression } from './compile';
import { ManagedExpressionError } from './errors';
import { EXPRESSION_ARTIFACT_SCHEMA_VERSION, EXPRESSION_RUNTIME_LIMITS } from './limits';
import {
  decodeWorkerResponse,
  encodeWorkerMessage,
  type ExpressionWorkerRequest,
  type ExpressionWorkerResponse,
} from './worker-protocol';
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
    serialized = JSON.stringify(context);
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

function timeoutMs(options: ManagedEvaluationOptions, engine: ManagedExpressionEngine): number {
  const timeout = options.timeoutMs ?? EXPRESSION_RUNTIME_LIMITS.defaultTimeoutMs;
  if (
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
  if (options.signal?.aborted === true) {
    return Promise.reject(new ManagedExpressionError(engine, 'interrupted', `${engine}-interrupted`, false));
  }

  return new Promise((resolve, reject) => {
    const worker = createExpressionWorker(engine);
    let settled = false;
    let ready = false;
    let evaluationTimer: NodeJS.Timeout | undefined;

    const cleanup = (): void => {
      clearTimeout(startupTimer);
      if (evaluationTimer !== undefined) {
        clearTimeout(evaluationTimer);
      }
      options.signal?.removeEventListener('abort', interrupt);
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

    const interrupt = (): void => {
      rejectAfterTermination(new ManagedExpressionError(engine, 'interrupted', `${engine}-interrupted`, true));
    };

    const startupTimer = setTimeout(() => {
      rejectAfterTermination(new ManagedExpressionError(engine, 'worker', 'expression-worker-startup-timeout', true));
    }, EXPRESSION_RUNTIME_LIMITS.workerStartupTimeoutMs);

    options.signal?.addEventListener('abort', interrupt, { once: true });
    worker.on('message', (message: RuntimeValue) => {
      if (settled) {
        return;
      }
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
          rejectAfterTermination(new ManagedExpressionError(engine, 'timeout', `${engine}-timeout`, true));
        }, evaluationTimeoutMs);
        try {
          worker.postMessage(encodeWorkerMessage(request));
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
  });
}

async function evaluatePreparedJsonata(
  prepared: PreparedJsonataExpression,
  context: ManagedJsonataContext,
  options: ManagedEvaluationOptions = {}
): Promise<ManagedJsonataResult> {
  if (prepared.engine !== 'jsonata' || prepared.schemaVersion !== EXPRESSION_ARTIFACT_SCHEMA_VERSION) {
    throw new ManagedExpressionError('jsonata', 'validation', 'jsonata-artifact-invalid');
  }
  const validated = compileManagedJsonataExpression(prepared.source);
  if (validated.astNodes !== prepared.astNodes) {
    throw new ManagedExpressionError('jsonata', 'validation', 'jsonata-artifact-invalid');
  }
  const response = await runWorker(
    { engine: 'jsonata', source: validated.source, context: contextAsJsonObject(context, 'jsonata') },
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
  return await evaluatePreparedJsonata(prepared, context, options);
}

export async function evaluateManagedCondition(
  prepared: PreparedJsonataExpression,
  context: TransitionConditionContext,
  options: ManagedEvaluationOptions = {}
): Promise<boolean> {
  const result = await evaluatePreparedJsonata(prepared, context, options);
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
  if (prepared.engine !== 'handlebars' || prepared.schemaVersion !== EXPRESSION_ARTIFACT_SCHEMA_VERSION) {
    throw new ManagedExpressionError('handlebars', 'validation', 'handlebars-artifact-invalid');
  }
  const validated = compileManagedHandlebarsTemplate(prepared.source, prepared.destination);
  if (validated.astNodes !== prepared.astNodes) {
    throw new ManagedExpressionError('handlebars', 'validation', 'handlebars-artifact-invalid');
  }
  const response = await runWorker(
    {
      engine: 'handlebars',
      source: validated.source,
      destination: validated.destination,
      context: contextAsJsonObject(context, 'handlebars'),
    },
    options
  );
  if (response.type !== 'text-result') {
    throw new ManagedExpressionError('handlebars', 'worker', 'handlebars-worker-result-invalid');
  }
  return response.value;
}
