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
    const safeCode =
      /^[a-z0-9-]+$/.test(code) && code.length <= EXPRESSION_RUNTIME_LIMITS.maxDiagnosticCodeLength
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
