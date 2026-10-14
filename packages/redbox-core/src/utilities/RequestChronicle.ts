import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { isSpanContextValid, trace } from '@opentelemetry/api';
import { Request } from 'express';
import { ILogger } from '@researchdatabox/sails-ng-common';
import { redactSecret } from './RedactionUtils';
import { RequestChronicleSettings, resolveRequestChronicleSettings } from './RequestChronicleSettings';

export { defaultRequestChronicleSettings, type RequestChronicleSettings } from './RequestChronicleSettings';

/**
 * What happened to the request.
 * - success: the response was sent with a status below 400, and no errors were recorded.
 * - failure: the response was sent with a 4xx or 5xx status, or errors were recorded.
 * - aborted: the connection closed before the response was completely sent.
 */
export const RequestChronicleOutcomes = ['success', 'failure', 'aborted'] as const;
export type RequestChronicleOutcomeType = (typeof RequestChronicleOutcomes)[number];

/**
 * Why the request chronicle was retained (or discarded), which also determines the log level.
 */
export const RequestChronicleClassifications = [
  'error',
  'client-error',
  'aborted',
  'slow',
  'sample',
  'discard',
] as const;
export type RequestChronicleClassificationsType = (typeof RequestChronicleClassifications)[number];

/**
 * The log level used for each classification.
 * Client errors are logged at 'warn' instead of 'info' when errors were recorded.
 */
const classificationLevels: Record<RequestChronicleClassificationsType, 'error' | 'warn' | 'info' | null> = {
  error: 'error',
  'client-error': 'info',
  aborted: 'info',
  slow: 'warn',
  sample: 'info',
  discard: null,
};

export type RequestChronicleError = {
  name?: string;
  message?: string;
  code?: string;
  /** The first lines of the stack trace, only for unexpected errors (not validation errors). */
  stack?: string;
  details?: RequestChronicleError[];
};

/**
 * A holder for attributes of one request and response,
 * which chronicles what happened over the whole request.
 *
 * See the 'Request Chronicle Logging' wiki page for the fields and how they are captured.
 */
export interface RequestChronicle {
  /** A unique identifier generated for this request. Use it to relate other logs to this request. */
  requestId?: string;
  /** The OpenTelemetry trace id, when there is an active trace. */
  traceId?: string;
  /**
   * Details of the result of the request chronicle.
   */
  result?: {
    /** When the request started. */
    timestamp?: string;
    outcome?: RequestChronicleOutcomeType;
    durationMs?: number;
    classification?: RequestChronicleClassificationsType;
    /** The log level used for this event. */
    severity?: string;
  };
  /**
   * Details of the original request.
   */
  req?: {
    method?: string;
    path?: string;
    hostname?: string;
    /** A valid 'X-Request-Id' header supplied by a proxy or client. */
    upstreamRequestId?: string;
  };
  /**
   * Details of the response generated from the request.
   */
  res?: {
    statusCode?: number;
    /** Whether the response was completely sent before the connection closed. */
    completed?: boolean;
  };
  /**
   * Any errors encountered during the request processing.
   */
  errors?: RequestChronicleError[];
  /** The number of errors not included in 'errors' due to the limit. */
  errorsOmitted?: number;

  /**
   * Arbitrary data added during the request processing.
   */
  [key: string]: unknown;
}

export interface RequestChronicleOptions {
  /** Retention settings. Defaults to `sails.config.log.requestChronicle`. */
  settings?: Partial<Record<keyof RequestChronicleSettings, unknown>>;
  /** Random number source between 0 and 1, used for sampling. */
  random?: () => number;
  /** Monotonic clock in milliseconds, used for the duration. */
  now?: () => number;
  /** Generates the request id. */
  generateRequestId?: () => string;
}

/** The response properties used to conclude the request chronicle. */
export type RequestChronicleResponse = {
  statusCode?: number;
  headersSent?: boolean;
  writableFinished?: boolean;
};

/**
 * Limits on the size of the captured data.
 */
export const RequestChronicleLimits = Object.freeze({
  maxDepth: 4,
  maxStringLength: 500,
  maxArrayItems: 20,
  maxObjectKeys: 30,
  maxValueJsonLength: 4096,
  maxInfoKeys: 100,
  maxErrors: 20,
  maxErrorDepth: 3,
  maxErrorDetails: 10,
  maxErrorMessageLength: 1000,
  maxErrorJsonLength: 8192,
  maxStackLength: 4000,
  maxStackLines: 12,
  maxKeyLength: 100,
});

const reservedKeys = [
  // Request chronicle fields.
  'requestId',
  'traceId',
  'result',
  'req',
  'res',
  'errors',
  'errorsOmitted',
  // Fields set by pino, which must not be overwritten by request details.
  'level',
  'time',
  'pid',
  'hostname',
  'name',
  'msg',
  'err',
  'v',
];
const sensitiveKeyPattern = /token|authorization|secret|apikey|api_key|password|credential|cookie/i;
const upstreamRequestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const tokenPathPatterns: [RegExp, string][] = [
  // Branding preview stylesheets: /:branding/:portal/preview/:token.css
  [/(\/preview\/)[^/?#\s]+(\.css)/gi, '$1REDACTED$2'],
  // Token-like query parameters.
  [/([?&](?:token|access_token|id_token|code|key|apiKey|api_key)=)[^&#\s]*/gi, '$1REDACTED'],
];

/**
 * Remove tokens from request paths and URLs.
 * @param value The path or URL.
 */
export function sanitizeChroniclePath(value: string): string {
  let result = value;
  for (const [pattern, replacement] of tokenPathPatterns) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Convert a value to a string that is safe to log: secrets and token-bearing paths are redacted,
 * and the length is bounded. Only the start of a very long string is processed.
 * @param value The value.
 * @param maxLength The maximum length, excluding the truncation marker.
 */
export function safeChronicleText(value: unknown, maxLength: number): string {
  let text: string;
  try {
    text = typeof value === 'string' ? value : String(value);
  } catch {
    return '[Unprintable]';
  }
  // Process a little more than the limit, so tokens near the limit can still be recognised.
  const head = text.length > maxLength + 200 ? text.substring(0, maxLength + 200) : text;
  const redacted = sanitizeChroniclePath(String(redactSecret(head)));
  if (redacted.length <= maxLength && head.length === text.length) {
    return redacted;
  }
  // Redact a token path that is cut off by the truncation.
  const truncated = redacted.substring(0, maxLength).replace(/(\/preview\/)[^/?#\s]*$/i, '$1REDACTED');
  return `${truncated}…[truncated ${Math.max(text.length - maxLength, 0)} chars]`;
}

function isSensitiveKey(key: string): boolean {
  return sensitiveKeyPattern.test(key);
}

/**
 * Sanitise the top-level entries of a details object: bound the number and length of keys,
 * redact sensitive keys, and sanitise the values.
 */
function sanitizeChronicleEntries(info: Record<string, unknown>): { entries: [string, unknown][]; omitted: number } {
  const entries: [string, unknown][] = [];
  let omitted = 0;
  for (const rawKey in info) {
    if (!Object.prototype.hasOwnProperty.call(info, rawKey)) {
      continue;
    }
    if (entries.length >= RequestChronicleLimits.maxInfoKeys) {
      omitted += 1;
      break;
    }
    const key = safeChronicleText(rawKey, RequestChronicleLimits.maxKeyLength);
    entries.push([key, isSensitiveKey(rawKey) ? 'REDACTED' : sanitizeChronicleValue(info[rawKey])]);
  }
  return { entries, omitted };
}

/**
 * Make an operation name safe to use as a key and in log messages.
 */
function safeOperationName(operation: unknown): string {
  return (
    safeChronicleText(operation, RequestChronicleLimits.maxKeyLength).replace(/[^A-Za-z0-9._:-]/g, '_') || 'operation'
  );
}

/**
 * Convert a value to a plain, size-bounded representation that is safe to log.
 * Redacts sensitive keys and token-bearing paths, and limits depth, items, keys, and string length.
 * @param value The value to sanitise.
 */
export function sanitizeChronicleValue(value: unknown): unknown {
  const sanitized = sanitizeInner(value, 0, new WeakSet<object>());
  try {
    const json = JSON.stringify(sanitized);
    if (json !== undefined && json.length > RequestChronicleLimits.maxValueJsonLength) {
      return { truncated: true, jsonLength: json.length };
    }
  } catch {
    return '[Unserialisable]';
  }
  return sanitized;
}

function sanitizeInner(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return safeChronicleText(value, RequestChronicleLimits.maxStringLength);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'function') {
    return '[Function]';
  }
  if (typeof value !== 'object') {
    return String(value);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  }
  if (value instanceof Error) {
    return toChronicleError(value);
  }
  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.length} bytes]`;
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  if (Array.isArray(value)) {
    if (depth >= RequestChronicleLimits.maxDepth) {
      return `[Array(${value.length})]`;
    }
    seen.add(value);
    const items = value
      .slice(0, RequestChronicleLimits.maxArrayItems)
      .map(item => sanitizeInner(item, depth + 1, seen));
    if (value.length > RequestChronicleLimits.maxArrayItems) {
      items.push(`…${value.length - RequestChronicleLimits.maxArrayItems} more items`);
    }
    seen.delete(value);
    return items;
  }
  if (depth >= RequestChronicleLimits.maxDepth) {
    return '[Object]';
  }
  seen.add(value);
  const result: Record<string, unknown> = {};
  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue;
    }
    if (count >= RequestChronicleLimits.maxObjectKeys) {
      result['…'] = 'more keys omitted';
      break;
    }
    count += 1;
    result[safeChronicleText(key, RequestChronicleLimits.maxKeyLength)] = isSensitiveKey(key)
      ? 'REDACTED'
      : sanitizeInner((value as Record<string, unknown>)[key], depth + 1, seen);
  }
  seen.delete(value);
  return result;
}

/**
 * Describe the shape of a value without including its content.
 * Use this for results that may be large or contain personal or sensitive data.
 * @param value The value to describe.
 */
export function summarizeChronicleValue(value: unknown): { type: string; length?: number; keyCount?: number } {
  if (value === null) {
    return { type: 'null' };
  }
  if (Array.isArray(value)) {
    return { type: 'array', length: value.length };
  }
  if (typeof value === 'string') {
    return { type: 'string', length: value.length };
  }
  if (typeof value === 'object') {
    return { type: 'object', keyCount: Object.keys(value).length };
  }
  return { type: typeof value };
}

function isRBValidationErrorLike(item: Error): item is Error & { displayErrors: Record<string, unknown>[] } {
  return item.name === 'RBValidationError' && Array.isArray((item as { displayErrors?: unknown }).displayErrors);
}

/** A summary of a display error, which is already a plain, safe object. */
class DisplayErrorSummary {
  constructor(
    readonly name: string | undefined,
    readonly message: string
  ) {}
}

/**
 * Convert a possible error to a consistent, size-bounded plain object representation.
 * Handles causes, aggregate and suppressed errors, and cycles, without throwing.
 * Names, messages, codes, and stacks are redacted and bounded, as is the whole result.
 * @param item This might be an error, or a string, or something else.
 */
export function toChronicleError(item: unknown): RequestChronicleError {
  try {
    const result = toChronicleErrorInner(item, 0, new WeakSet<object>());
    if (JSON.stringify(result).length <= RequestChronicleLimits.maxErrorJsonLength) {
      return result;
    }
    // Too large: keep the most useful parts.
    const { details: _details, ...withoutDetails } = result;
    if (JSON.stringify(withoutDetails).length <= RequestChronicleLimits.maxErrorJsonLength) {
      return { ...withoutDetails, details: [{ message: 'Nested errors omitted due to size.' }] };
    }
    const { stack: _stack, ...summary } = withoutDetails;
    return { ...summary, details: [{ message: 'Stack and nested errors omitted due to size.' }] };
  } catch {
    return { message: 'Unable to record the error.' };
  }
}

function toChronicleErrorInner(item: unknown, depth: number, seen: WeakSet<object>): RequestChronicleError {
  const limits = RequestChronicleLimits;
  if (item !== null && typeof item === 'object') {
    if (seen.has(item)) {
      return { message: '[Circular]' };
    }
    seen.add(item);
  }

  const result: RequestChronicleError = {};
  // Only the first few nested errors are processed; the total is counted.
  const maxDetails = limits.maxErrorDetails;
  const details: unknown[] = [];
  let detailsTotal = 0;
  const addDetails = (items: readonly unknown[]) => {
    detailsTotal += items.length;
    const remaining = maxDetails - details.length;
    if (remaining > 0) {
      details.push(...items.slice(0, remaining));
    }
  };

  if (item instanceof Error) {
    if (item.name) {
      result.name = safeChronicleText(item.name, limits.maxStringLength);
    }
    if (item.message) {
      result.message = safeChronicleText(item.message, limits.maxErrorMessageLength);
    }
    const code = (item as { code?: unknown }).code;
    if (typeof code === 'string' || typeof code === 'number') {
      result.code = safeChronicleText(code, limits.maxStringLength);
    }
    if (isRBValidationErrorLike(item)) {
      const displayErrors = item.displayErrors;
      detailsTotal += displayErrors.length;
      details.push(
        ...displayErrors.slice(0, maxDetails).map(
          displayError =>
            new DisplayErrorSummary(
              displayError?.title !== undefined && displayError?.title !== null
                ? safeChronicleText(displayError.title, limits.maxStringLength)
                : undefined,
              safeChronicleText(
                Object.entries({
                  id: displayError?.id,
                  status: displayError?.status,
                  code: displayError?.code,
                  detail: displayError?.detail,
                })
                  .filter(([_key, value]) => value !== undefined && value !== null)
                  .map(([key, value]) => `${key}: ${safeChronicleText(value, limits.maxStringLength)}`)
                  .join(', '),
                limits.maxErrorMessageLength
              )
            )
        )
      );
    } else if (depth === 0 && typeof item.stack === 'string') {
      // Keep the location of unexpected errors.
      result.stack = safeChronicleText(item.stack, limits.maxStackLength)
        .split('\n')
        .slice(0, limits.maxStackLines)
        .join('\n');
    }
    if (item.cause !== undefined && item.cause !== null) {
      addDetails([item.cause]);
    }
    if (typeof SuppressedError !== 'undefined' && item instanceof SuppressedError) {
      addDetails([item.error, item.suppressed]);
    }
    if (item instanceof AggregateError && Array.isArray(item.errors)) {
      addDetails(item.errors);
    }
  } else if (Array.isArray(item)) {
    addDetails(item);
  } else if (typeof item === 'string') {
    result.message = safeChronicleText(item, limits.maxErrorMessageLength);
  } else if (item !== null && typeof item === 'object' && typeof (item as { message?: unknown }).message === 'string') {
    result.message = safeChronicleText((item as { message: string }).message, limits.maxErrorMessageLength);
  } else {
    const sanitized = sanitizeInner(item, 0, new WeakSet<object>());
    result.message = safeChronicleText(
      typeof sanitized === 'string' ? sanitized : (JSON.stringify(sanitized) ?? String(item)),
      limits.maxErrorMessageLength
    );
  }

  if (detailsTotal > 0) {
    if (depth >= limits.maxErrorDepth) {
      result.details = [{ message: `${detailsTotal} nested errors omitted` }];
    } else {
      result.details = details.map(detail => {
        if (detail instanceof DisplayErrorSummary) {
          return { ...(detail.name !== undefined ? { name: detail.name } : {}), message: detail.message };
        }
        return toChronicleErrorInner(detail, depth + 1, seen);
      });
      if (detailsTotal > details.length) {
        result.details.push({ message: `${detailsTotal - details.length} more errors omitted` });
      }
    }
  }
  return result;
}

/**
 * Convert arrays to objects keyed by index, so that the structure survives
 * log formats that flatten nested objects but not arrays (e.g. pino-logfmt: `errors_0_message`).
 * @param value The value to convert.
 */
export function toChronicleLogRecord(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map((item, index) => [String(index), toChronicleLogRecord(item)]));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toChronicleLogRecord(item)]));
  }
  return value;
}

type ChronicleState = 'pending' | 'running' | 'finished';

// Source and compiled modules can coexist in the development loader.
const helperBrand = Symbol.for('@researchdatabox/redbox-core/RequestChronicleHelper');

export class RequestChronicleHelper {
  private readonly [helperBrand] = true;
  #data: RequestChronicle = {};
  #state: ChronicleState = 'pending';
  #startedAt = 0;
  #logged = false;
  #requestId?: string;
  readonly #settings: RequestChronicleSettings;
  readonly #random: () => number;
  readonly #now: () => number;
  readonly #generateRequestId: () => string;
  readonly #successSampleExclude: RegExp | null = null;

  private constructor(
    private logger: ILogger,
    options: RequestChronicleOptions = {}
  ) {
    const configured = typeof sails !== 'undefined' ? sails?.config?.log?.requestChronicle : undefined;
    this.#settings = resolveRequestChronicleSettings(options.settings ?? configured);
    this.#random = options.random ?? Math.random;
    this.#now = options.now ?? (() => performance.now());
    this.#generateRequestId = options.generateRequestId ?? randomUUID;
    if (this.#settings.successSampleExcludePattern) {
      try {
        this.#successSampleExclude = new RegExp(this.#settings.successSampleExcludePattern, 'i');
      } catch {
        // An invalid pattern excludes nothing.
      }
    }
  }

  /**
   * Get the request chronicle helper for a request, creating it if needed.
   * The logger and options are only used when the helper is created.
   */
  public static fromReq(
    logger: ILogger,
    req: Sails.Req | Request,
    options?: RequestChronicleOptions
  ): RequestChronicleHelper {
    const request = req as { options?: Sails.ReqOptions };
    if (request.options === undefined || request.options === null) {
      request.options = {};
    }

    if (request.options.requestChronicleHelper === undefined || request.options.requestChronicleHelper === null) {
      // Make the event accessible to other middleware, plus anywhere that can access the req.
      request.options.requestChronicleHelper = new RequestChronicleHelper(logger, options);
    }

    return request.options.requestChronicleHelper;
  }

  /**
   * Get the request chronicle helper for a request, without creating it.
   * Requests that did not pass through the HTTP middleware (e.g. socket and virtual requests) have no helper.
   */
  public static existing(req: Sails.Req | Request | undefined | null): RequestChronicleHelper | undefined {
    try {
      const helper = (req as { options?: Sails.ReqOptions } | undefined | null)?.options?.requestChronicleHelper;
      return helper?.[helperBrand] === true ? helper : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Get the current request chronicle data.
   * Do not use this for logging - use the `log` method.
   */
  get data(): RequestChronicle {
    return structuredClone(this.#data);
  }

  /** The request id, generated when the chronicle starts. */
  get requestId(): string | undefined {
    return this.#requestId;
  }

  get settings(): RequestChronicleSettings {
    return { ...this.#settings };
  }

  get isRunning(): boolean {
    return this.#state === 'running';
  }

  get isFinished(): boolean {
    return this.#state === 'finished';
  }

  start(): void {
    this.#safely('start', () => {
      if (this.#state !== 'pending') {
        this.logger.warn('Request Chronicle Helper: Cannot start request chronicle that is running or finished.');
        return;
      }
      this.#state = 'running';
      this.#startedAt = this.#now();
      this.#requestId = this.#generateRequestId();
      this.#data.requestId = this.#requestId;
      const spanContext = trace.getActiveSpan()?.spanContext();
      if (spanContext && isSpanContextValid(spanContext)) {
        this.#data.traceId = spanContext.traceId;
      }
      this.#data.result = { timestamp: new Date().toISOString() };
    });
  }

  updateReq(req: Sails.Req | Request): void {
    this.#safely('updateReq', () => {
      if (!this.isRunning || this.#data.req !== undefined) {
        this.logger.warn(
          'Request Chronicle Helper: Cannot update request chronicle that is not running or has existing req.'
        );
        return;
      }
      const path = req.path ?? req.url?.split('?')[0];
      const upstreamRequestId = req.headers?.['x-request-id'];
      this.#data.req = {
        method:
          typeof req.method === 'string'
            ? safeChronicleText(req.method, RequestChronicleLimits.maxKeyLength)
            : undefined,
        path: typeof path === 'string' ? safeChronicleText(path, RequestChronicleLimits.maxStringLength) : undefined,
        hostname:
          typeof req.hostname === 'string'
            ? safeChronicleText(req.hostname, RequestChronicleLimits.maxStringLength)
            : undefined,
        ...(typeof upstreamRequestId === 'string' && upstreamRequestIdPattern.test(upstreamRequestId)
          ? { upstreamRequestId }
          : {}),
      };
    });
  }

  /**
   * Conclude the request chronicle.
   * Only the first call has an effect.
   * @param res The response. A response that has not finished writing is recorded as aborted.
   * @return True if this call concluded the chronicle, otherwise false.
   */
  finish(res?: RequestChronicleResponse): boolean {
    let concluded = false;
    this.#safely('finish', () => {
      if (!this.isRunning) {
        return;
      }
      const durationMs = Math.max(0, Math.round(this.#now() - this.#startedAt));
      const completed = res === undefined ? true : res.writableFinished === true;
      const statusCode =
        res !== undefined && (res.headersSent || res.writableFinished) && Number.isFinite(res.statusCode)
          ? res.statusCode
          : undefined;
      this.#state = 'finished';
      this.#data.res = { ...(statusCode !== undefined ? { statusCode } : {}), completed };

      const outcome = this.#outcome(completed, statusCode);
      const classification = this.#classify(completed, statusCode, durationMs);
      this.#data.result = {
        ...this.#data.result,
        durationMs,
        outcome,
        classification,
        severity: this.#level(classification) ?? 'none',
      };
      concluded = true;
    });
    return concluded;
  }

  /**
   * Log the finished request chronicle once, at the level for its classification.
   * @param logger The logger to use.
   */
  public log(logger: ILogger = this.logger): void {
    this.#safely('log', () => {
      if (!this.isFinished || this.#logged) {
        return;
      }
      this.#logged = true;
      const classification = this.#data.result?.classification;
      const level = classification ? this.#level(classification) : null;
      if (level !== null) {
        logger[level](toChronicleLogRecord(this.#data), 'Request chronicle');
      }
    });
  }

  get hasErrors(): boolean {
    return (this.#data.errors?.length ?? 0) > 0 || (this.#data.errorsOmitted ?? 0) > 0;
  }

  /**
   * Record an error.
   * Errors recorded when the chronicle is not running are logged immediately, with the request id.
   * @param error The error.
   */
  public addError(error?: unknown): void {
    this.#safely('addError', () => {
      const chronicleError = toChronicleError(error);
      if (!this.isRunning) {
        this.logger.error(
          toChronicleLogRecord({ requestId: this.#requestId, error: chronicleError }),
          this.isFinished
            ? 'Request chronicle: error recorded after the request finished.'
            : 'Request chronicle: error recorded without an active request chronicle.'
        );
        return;
      }
      if (!Array.isArray(this.#data.errors)) {
        this.#data.errors = [];
      }
      if (this.#data.errors.length >= RequestChronicleLimits.maxErrors) {
        this.#data.errorsOmitted = (this.#data.errorsOmitted ?? 0) + 1;
        return;
      }
      this.#data.errors.push(chronicleError);
    });
  }

  /**
   * Add arbitrary details to the request chronicle.
   * Values are sanitised and size-bounded.
   * Details added after the chronicle finished are logged at debug level, with the request id.
   * Details added when there is no running chronicle (e.g. socket requests) are ignored.
   * @param info The details to add.
   */
  public addInfo(info: Record<string, unknown>): void {
    this.#safely('addInfo', () => {
      if (info === null || info === undefined || typeof info !== 'object') {
        return;
      }
      if (!this.isRunning && !this.isFinished) {
        // There is no request chronicle (e.g. socket requests), so there is nothing to relate the details to.
        return;
      }
      const { entries, omitted } = sanitizeChronicleEntries(info);
      if (entries.length === 0) {
        return;
      }
      if (this.isFinished) {
        this.logger.debug(
          toChronicleLogRecord({
            requestId: this.#requestId,
            info: Object.fromEntries(entries),
            ...(omitted > 0 ? { infoOmitted: true } : {}),
          }),
          'Request chronicle: details recorded after the request finished.'
        );
        return;
      }
      if (omitted > 0) {
        this.logger.warn('Request Chronicle Helper: Too many request chronicle details, some were ignored.');
      }
      for (const [key, value] of entries) {
        if (reservedKeys.includes(key)) {
          this.logger.warn(`Request Chronicle Helper: Cannot overwrite reserved request chronicle key '${key}'.`);
          continue;
        }
        if (!(key in this.#data) && Object.keys(this.#data).length >= RequestChronicleLimits.maxInfoKeys) {
          this.logger.warn(`Request Chronicle Helper: Too many request chronicle keys, ignoring key '${key}'.`);
          continue;
        }
        // Later values replace earlier values for the same key.
        this.#data[key] = value;
      }
    });
  }

  /**
   * Record the result of work that may continue after the response is sent, such as an audit event.
   * While the request is running, the result is added to the request chronicle.
   * After the request finishes, the result is logged separately, with the request id.
   * @param operation A short name for the operation.
   * @param error The error if the operation failed, otherwise undefined.
   */
  public addOperationResult(operation: string, error?: unknown): void {
    this.#safely('addOperationResult', () => {
      const name = safeOperationName(operation);
      const failed = error !== undefined;
      if (this.isRunning) {
        this.addInfo({ [name]: failed ? 'failure' : 'success' });
        if (failed) {
          this.addError(error);
        }
        return;
      }
      const details = { requestId: this.#requestId, operation: name, outcome: failed ? 'failure' : 'success' };
      if (failed) {
        this.logger.error(
          toChronicleLogRecord({ ...details, error: toChronicleError(error) }),
          `Request chronicle: operation '${name}' failed after the request finished.`
        );
      } else {
        this.logger.debug(details, `Request chronicle: operation '${name}' succeeded after the request finished.`);
      }
    });
  }

  #outcome(completed: boolean, statusCode: number | undefined): RequestChronicleOutcomeType {
    if (!completed) {
      return 'aborted';
    }
    if ((statusCode ?? 0) >= 400 || this.hasErrors) {
      return 'failure';
    }
    return 'success';
  }

  /**
   * Classify this request chronicle.
   * Keep all failed, aborted, and slow requests, and a sample of the successful requests.
   */
  #classify(
    completed: boolean,
    statusCode: number | undefined,
    durationMs: number
  ): RequestChronicleClassificationsType {
    const status = statusCode ?? 0;
    if (status >= 500) {
      return 'error';
    }
    if (status >= 400) {
      return 'client-error';
    }
    if (this.hasErrors) {
      return 'error';
    }
    if (!completed) {
      return 'aborted';
    }
    if (durationMs > this.#settings.slowThresholdMs) {
      return 'slow';
    }
    const path = this.#data.req?.path;
    if (this.#successSampleExclude !== null && typeof path === 'string' && this.#successSampleExclude.test(path)) {
      return 'discard';
    }
    return this.#random() < this.#settings.successSampleRate ? 'sample' : 'discard';
  }

  #level(classification: RequestChronicleClassificationsType): 'error' | 'warn' | 'info' | null {
    if (classification === 'client-error' && this.hasErrors) {
      return 'warn';
    }
    return classificationLevels[classification];
  }

  /**
   * Run a function, logging instead of throwing any error, so that recording never breaks the request.
   */
  #safely(name: string, func: () => void): void {
    try {
      func();
    } catch {
      try {
        // Don't include the error: it may come from hostile or unprintable input.
        this.logger.warn(`Request Chronicle Helper: '${name}' failed.`);
      } catch {
        // Ignore logging failures.
      }
    }
  }
}
