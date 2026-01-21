import { ErrorResponseItemV2 } from "./api";

// Define ErrorOptions locally for ES6 target compatibility
interface RBErrorOptions {
  cause?: unknown;
}

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
  constructor(build: { message?: string, options?: RBErrorOptions, displayErrors?: ErrorResponseItemV2[] } = {}) {
    super(build.message ?? "", build.options as any ?? {});
    this.name = RBValidationError.errorName;
    this._displayErrors = build.displayErrors ?? [];
  }

  /**
   * Convenient way to access the name of this error.
   */
  public static readonly errorName = "RBValidationError";

  /**
   * Check if item is an instance of RBValidationError.
   * @param item The item to check.
   * @returns True if item is an instance of RBValidationError, otherwise false.
   */
  public static isRBValidationError(item: unknown): item is RBValidationError {
    return item instanceof RBValidationError || (item instanceof Error && item?.name === RBValidationError.errorName);
  }

  /**
   * Recursively collect the Errors and display errors.
   * @param errors The initial array of Error instances.
   * @param displayErrors The initial array of display errors.
   */
  public static collectErrors(errors: Error[], displayErrors: ErrorResponseItemV2[]): {
    errors: Error[],
    displayErrors: ErrorResponseItemV2[]
  } {
    // Collect and process the errors recursively
    const collectedErrors: Error[] = [];
    const collectedDisplayErrors: ErrorResponseItemV2[] = [...displayErrors ?? []];

    const errorsToProcess = [...errors ?? []];
    while (errorsToProcess.length > 0) {
      // remove the first error in the array and process it
      const error = errorsToProcess.shift();
      if (error === null || error === undefined) {
        continue;
      }

      collectedErrors.push(error);

      // Extract and store displayErrors from any RBValidationErrors
      if (RBValidationError.isRBValidationError(error) || Array.isArray(error['displayErrors'])) {
        collectedDisplayErrors.push(...error['displayErrors']);
      }

      // Add any cause error to the array of errors to process.
      if (error instanceof Error && error?.cause !== undefined) {
        errorsToProcess.push(error.cause instanceof Error ? error.cause : new Error(error.cause?.toString()));
      }
    }

    return { errors: collectedErrors, displayErrors: collectedDisplayErrors };
  }

  /**
   * Convert errors and displayErrors into a message suitable for displaying to a user.
   *
   * TODO: Rather than this approach in services, the RBValidationError contents should be preserved,
   *       and thrown or returned from the service to the controller / caller service.
   *       This approach is reasonable for API v1 in controllers.
   */
  public static displayMessage(options: {
    t?: { t: any },
    errors?: Error[],
    displayErrors?: ErrorResponseItemV2[],
    defaultMessage?: string
  } = {}): string {
    const t = options?.t?.t;
    if (!t) {
      throw new Error("Must provide TranslationService as 't' to RBValidationError.displayMessage.");
    }
    const { displayErrors: collectedDisplayErrors } = RBValidationError.collectErrors(options?.errors ?? [], options?.displayErrors ?? []);
    const displayMessages = (collectedDisplayErrors ?? [{ title: options?.defaultMessage ?? t("An error occurred") }])
      ?.map(displayError => {
        const code = displayError.code?.toString()?.trim() ?? "";
        const title = displayError.title?.toString()?.trim() || code;
        const detail = displayError.detail?.toString()?.trim() || code;
        // Translate the unique non-empty values, then combine into a string.
        const items = Array.from(new Set([title, detail])).filter(i => !!i).map(i => t(i));
        return items.join(': ');
      });
    return displayMessages.map(i => {
      const trimmed = i?.trim();
      return trimmed.endsWith('.') ? trimmed : trimmed + '.';
    }).join(' ');
  }

  /**
   * Get any display errors stored in this Error.
   */
  get displayErrors(): ErrorResponseItemV2[] {
    return this._displayErrors;
  }
}
