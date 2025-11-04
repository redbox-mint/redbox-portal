import {ErrorResponseItemV2} from "./api";

/**
 * ReDBox Validation Error for containing validation errors
 * to be shown to the user.
 */
export class RBValidationError extends Error {
  private readonly _displayErrors: ErrorResponseItemV2[] = [];

  /**
   * Create a new internal RBValidation Error with optional display errors for the response.
   * @param build Create a new RBValidation Error with optional internal message, optional options, and optional display errors.
   * @param build.message The error message. This is only used internally and not sent to the end user.
   * @param build.options The error options. This is only used internally and not sent to the end user.
   * @param build.displayErrors The display errors. These are sent to the end user.
   */
  constructor(build: { message?: string, options?: ErrorOptions, displayErrors?: ErrorResponseItemV2[] } = {}) {
    super(build.message ?? "", build.options ?? {});
    this.name = 'RBValidationError';
    this._displayErrors = build.displayErrors ?? [];
  }

  /**
   * Get any display errors stored in this Error.
   */
  get displayErrors(): ErrorResponseItemV2[] {
    return this._displayErrors;
  }
}
