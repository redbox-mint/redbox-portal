import { EXPRESSION_ARTIFACT_SCHEMA_VERSION, EXPRESSION_RUNTIME_LIMITS } from './limits';
import type { ManagedExpressionDiagnostic, ManagedExpressionEngine, ManagedExpressionFailureKind } from './types';

const SAFE_MESSAGES: Readonly<Record<ManagedExpressionFailureKind, string>> = Object.freeze({
  validation: 'Expression input is not valid.',
  evaluation: 'Expression evaluation failed.',
  limit: 'Expression evaluation exceeded a resource limit.',
  timeout: 'Expression evaluation timed out.',
  interrupted: 'Expression evaluation was interrupted.',
  worker: 'Expression worker failed.',
});

const SAFE_CODES = new Set([
  'expression-context-invalid',
  'expression-error',
  'expression-options-invalid',
  'expression-input-limit-exceeded',
  'expression-timeout-invalid',
  'expression-worker-exited',
  'expression-worker-failed',
  'expression-worker-port-missing',
  'expression-worker-request-invalid',
  'expression-worker-response-invalid',
  'expression-worker-send-failed',
  'expression-worker-start-failed',
  'expression-worker-startup-timeout',
  'handlebars-artifact-invalid',
  'handlebars-ast-depth-exceeded',
  'handlebars-ast-nodes-exceeded',
  'handlebars-block-helper-forbidden',
  'handlebars-destination-invalid',
  'handlebars-evaluation-failed',
  'handlebars-extension-forbidden',
  'handlebars-helper-forbidden',
  'handlebars-helper-invalid',
  'handlebars-interrupted',
  'handlebars-iteration-limit-exceeded',
  'handlebars-property-forbidden',
  'handlebars-result-size-exceeded',
  'handlebars-source-size-invalid',
  'handlebars-syntax-invalid',
  'handlebars-timeout',
  'handlebars-unescaped-output-forbidden',
  'handlebars-worker-result-invalid',
  'jsonata-artifact-invalid',
  'jsonata-ast-depth-exceeded',
  'jsonata-ast-nodes-exceeded',
  'jsonata-binding-forbidden',
  'jsonata-condition-result-invalid',
  'jsonata-evaluation-failed',
  'jsonata-interrupted',
  'jsonata-property-forbidden',
  'jsonata-result-invalid',
  'jsonata-source-size-invalid',
  'jsonata-syntax-invalid',
  'jsonata-timeout',
  'jsonata-worker-result-invalid',
  'prior-output-cardinality-exceeded',
  'prior-output-field-duplicate',
  'prior-output-field-forbidden',
  'prior-output-not-found',
  'transition-context-required',
]);

/** A bounded diagnostic that never carries source, context, result, or cause text. */
export class ManagedExpressionError extends Error {
  readonly diagnostic: ManagedExpressionDiagnostic;

  constructor(
    engine: ManagedExpressionEngine,
    kind: ManagedExpressionFailureKind,
    code: string,
    workerTerminated = false
  ) {
    super(SAFE_MESSAGES[kind]);
    this.name = 'ManagedExpressionError';
    this.stack = `${this.name}: ${this.message}`;
    const safeCode =
      SAFE_CODES.has(code) && code.length <= EXPRESSION_RUNTIME_LIMITS.maxDiagnosticCodeLength
        ? code
        : 'expression-error';
    this.diagnostic = Object.freeze({
      schemaVersion: EXPRESSION_ARTIFACT_SCHEMA_VERSION,
      engine,
      kind,
      code: safeCode,
      workerTerminated,
    });
  }
}
