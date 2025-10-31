import {ErrorResponseItemV2} from "./api";

/**
 * ReDBox Validation Error for containing validation errors
 * to be shown to the user.
 */
export class RBValidationError extends Error {
  private readonly _structuredErrors: ErrorResponseItemV2[] = [];

  /**
   * Create a new RBValidation Error with optional structured errors.
   * @param message The error message. This is only used internally and not sent to the end user.
   * @param options The error options. This is only used internally and not sent to the end user.
   * @param structuredErrors The structured errors. These are sent to the end user.
   */
  constructor(message?: string, options?: ErrorOptions, structuredErrors?: ErrorResponseItemV2[]) {
    super(message, options);
    this.name = 'RBValidationError';
    this._structuredErrors = structuredErrors ?? [];
  }

  /**
   * Get any structured errors stored in this Error.
   */
  get structuredErrors(): ErrorResponseItemV2[] {
    return this._structuredErrors;
  }
}
