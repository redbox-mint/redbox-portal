import { ACTION_EXECUTION_LIMITS } from '../action-execution/policy';

export const ACTION_CONTRACT_SCHEMA_VERSION: 1 = 1;
export const ACTION_CONTEXT_SCHEMA_VERSION: 1 = 1;
export const ACTION_RESULT_SCHEMA_VERSION: 1 = 1;
export const ACTION_PLAN_SCHEMA_VERSION: 1 = 1;

/**
 * Global server-side limits for persisted action contracts. Individual action
 * descriptors may narrow execution limits, but cannot expand these bounds.
 */
export const ACTION_CONTRACT_LIMITS = {
  maxActionIdLength: 128,
  maxBindingIdLength: 64,
  maxIdentifierLength: 128,
  maxParameterNameLength: 64,
  maxTitleLength: 120,
  maxDescriptionLength: 1_000,
  maxCategoryLength: 64,
  maxPackageNameLength: 214,
  maxModuleNameLength: 256,
  maxParameters: 64,
  maxPlanBindings: 256,
  maxPlanDepth: 16,
  maxPlanValidationIssues: 100,
  maxValidationWork: 50_000,
  maxObjectProperties: 100,
  maxEnumOptions: 100,
  maxArrayItems: 100,
  maxDependencies: 32,
  maxOutputFields: 64,
  maxPatchOperations: 100,
  maxPatchPathLength: 512,
  maxRejectionCodeLength: 64,
  maxRejectionMessageLength: 1_000,
  maxRoleCount: 64,
  maxPriorOutputs: 32,
  maxJsonDepth: 8,
  maxJsonBytes: 262_144,
  maxContractBytes: 16_777_216,
  maxStringValueLength: 32_768,
  maxExpressionLength: 8_192,
  maxTemplateLength: 16_384,
  maxContractVersion: 2_147_483_647,
  maxOrder: 2_147_483_647,
  maxTimeoutMs: ACTION_EXECUTION_LIMITS.maxTimeoutMs,
  maxRetryAttempts: ACTION_EXECUTION_LIMITS.maxAttempts,
  maxRetryDelayMs: ACTION_EXECUTION_LIMITS.maxDelayMs,
};

export const DEFAULT_ACTION_EXECUTION_POLICY_BOUNDS = {
  timeout: {
    defaultMs: 30_000,
    minMs: 100,
    maxMs: 60_000,
  },
  retry: {
    allowed: false,
  },
};
