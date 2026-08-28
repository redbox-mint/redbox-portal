import { ACTION_CONTRACT_LIMITS } from '../action-registry/limits';

export const EXPRESSION_CONTEXT_SCHEMA_VERSION: 1 = 1;
export const EXPRESSION_ARTIFACT_SCHEMA_VERSION: 1 = 1;

/**
 * Hard server-owned limits for administrator-authored expressions and text
 * templates. Persisted definitions can narrow execution time later, but they
 * cannot expand this boundary.
 */
export const EXPRESSION_RUNTIME_LIMITS = Object.freeze({
  maxExpressionLength: ACTION_CONTRACT_LIMITS.maxExpressionLength,
  maxTemplateLength: ACTION_CONTRACT_LIMITS.maxTemplateLength,
  maxAstNodes: 2_000,
  maxAstDepth: 64,
  maxTemplateEachBlocks: 8,
  maxInputBytes: ACTION_CONTRACT_LIMITS.maxJsonBytes,
  maxResultBytes: 65_536,
  maxInputDepth: ACTION_CONTRACT_LIMITS.maxJsonDepth + 4,
  maxJsonDepth: ACTION_CONTRACT_LIMITS.maxJsonDepth,
  maxArrayItems: ACTION_CONTRACT_LIMITS.maxArrayItems,
  maxObjectProperties: ACTION_CONTRACT_LIMITS.maxObjectProperties,
  maxPropertyNameLength: ACTION_CONTRACT_LIMITS.maxIdentifierLength,
  maxValidationWork: ACTION_CONTRACT_LIMITS.maxValidationWork,
  defaultTimeoutMs: 250,
  minTimeoutMs: 10,
  maxTimeoutMs: 2_000,
  workerStartupTimeoutMs: 5_000,
  workerMaxOldGenerationSizeMb: 32,
  workerMaxYoungGenerationSizeMb: 8,
  workerStackSizeMb: 2,
  maxDiagnosticCodeLength: 64,
});
