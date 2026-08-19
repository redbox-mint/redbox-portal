export const GENERATION_ERROR_CODES = [
  'GENERATION_NOT_CONFIGURED',
  'GENERATION_ACTION_NOT_AVAILABLE',
  'GENERATION_SOURCE_FORBIDDEN',
  'GENERATION_TARGET_FORBIDDEN',
  'GENERATION_REQUEST_INVALID',
  'GENERATION_INVALID_STATE',
  'GENERATION_ALREADY_COMPLETED',
  'GENERATION_RATE_LIMITED',
  'GENERATION_PROFILE_INVALID',
  'GENERATION_DEPLOYMENT_INCOMPATIBLE',
  'GENERATION_PROVIDER_TIMEOUT',
  'GENERATION_PROVIDER_RATE_LIMITED',
  'GENERATION_PROVIDER_UNAVAILABLE',
  'GENERATION_OUTPUT_PARSE_FAILED',
  'GENERATION_OUTPUT_SCHEMA_INVALID',
  'GENERATION_EVIDENCE_INVALID',
  'GENERATION_TARGET_CONFLICT',
  'GENERATION_ARTIFACT_EXPIRED',
  'GENERATION_COMMIT_INVALID',
] as const;

export type GenerationErrorCode = (typeof GENERATION_ERROR_CODES)[number];

const ERROR_STATUS: Record<GenerationErrorCode, number> = {
  GENERATION_NOT_CONFIGURED: 503,
  GENERATION_ACTION_NOT_AVAILABLE: 404,
  GENERATION_SOURCE_FORBIDDEN: 403,
  GENERATION_TARGET_FORBIDDEN: 403,
  GENERATION_REQUEST_INVALID: 400,
  GENERATION_INVALID_STATE: 409,
  GENERATION_ALREADY_COMPLETED: 409,
  GENERATION_RATE_LIMITED: 429,
  GENERATION_PROFILE_INVALID: 422,
  GENERATION_DEPLOYMENT_INCOMPATIBLE: 422,
  GENERATION_PROVIDER_TIMEOUT: 504,
  GENERATION_PROVIDER_RATE_LIMITED: 429,
  GENERATION_PROVIDER_UNAVAILABLE: 503,
  GENERATION_OUTPUT_PARSE_FAILED: 502,
  GENERATION_OUTPUT_SCHEMA_INVALID: 502,
  GENERATION_EVIDENCE_INVALID: 502,
  GENERATION_TARGET_CONFLICT: 409,
  GENERATION_ARTIFACT_EXPIRED: 410,
  GENERATION_COMMIT_INVALID: 409,
};

export class GenerationError extends Error {
  public readonly status: number;

  public constructor(
    public readonly code: GenerationErrorCode,
    message: string,
    public readonly retryable = false,
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'GenerationError';
    this.status = ERROR_STATUS[code];
  }

  public toSafeJSON(): Record<string, unknown> {
    return {
      code: this.code,
      messageKey: `generation-error-${this.code.toLowerCase().replaceAll('_', '-')}`,
      retryable: this.retryable,
      correlationId: this.correlationId,
    };
  }
}

export function asGenerationError(error: unknown): GenerationError {
  if (error instanceof GenerationError) {
    return error;
  }
  return new GenerationError('GENERATION_PROVIDER_UNAVAILABLE', 'Generation failed safely', false);
}
