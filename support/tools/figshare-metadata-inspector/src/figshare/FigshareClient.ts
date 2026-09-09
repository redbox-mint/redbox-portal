import axios, { AxiosAdapter, AxiosError, AxiosInstance, AxiosResponse } from 'axios';

export interface FigshareClientOptions {
  token: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  userAgent?: string;
  sleep?: (milliseconds: number) => Promise<void>;
  /** Test/custom transport seam; production callers normally leave this unset. */
  adapter?: AxiosAdapter;
}

export interface FigshareResponseMetadata {
  endpoint: string;
  statusCode: number;
  rateLimit?: string;
  rateLimitRemaining?: string;
  rateLimitReset?: string;
  retryAfter?: string;
}

export class FigshareApiError extends Error {
  public readonly statusCode?: number;
  public readonly endpoint: string;
  public readonly responseBody?: unknown;

  public constructor(
    message: string,
    options: { statusCode?: number; endpoint: string; responseBody?: unknown; cause?: unknown }
  ) {
    super(message, options.cause == null ? undefined : { cause: options.cause });
    this.name = 'FigshareApiError';
    this.statusCode = options.statusCode;
    this.endpoint = options.endpoint;
    this.responseBody = options.responseBody;
  }
}

export class FigshareResponseValidationError extends Error {
  public constructor(
    public readonly endpoint: string,
    public readonly details: unknown
  ) {
    super(`Figshare returned an unexpected response from ${endpoint}`);
    this.name = 'FigshareResponseValidationError';
  }
}

const DEFAULT_BASE_URL = 'https://api.figshare.com';
const SENSITIVE_KEY = /authorization|token|secret|password|api[-_]?key/i;

export function normaliseFigshareBaseUrl(value: string): string {
  const trimmed = value.trim();
  let end = trimmed.length;
  while (end > 0 && trimmed.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  const withoutTrailingSlashes = trimmed.slice(0, end);
  const lowerCaseUrl = withoutTrailingSlashes.toLowerCase();
  return lowerCaseUrl.endsWith('/v2') || lowerCaseUrl.endsWith('/v3')
    ? withoutTrailingSlashes.slice(0, -3)
    : withoutTrailingSlashes;
}

function redact(value: unknown, token: string, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') {
    return token.length > 0 ? value.split(token).join('[REDACTED]') : value;
  }
  if (Array.isArray(value)) {
    return value.map(entry => redact(entry, token, seen));
  }
  if (value == null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(entry, token, seen);
  }
  return result;
}

function safeEndpoint(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_KEY.test(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    return parsed.toString();
  } catch {
    return url.replace(/([?&](?:access_)?token=)[^&]*/gi, '$1[REDACTED]');
  }
}

function header(response: AxiosResponse, name: string): string | undefined {
  const value = response.headers[name] ?? response.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0] == null ? undefined : String(value[0]);
  }
  return value == null ? undefined : String(value);
}

function isRetryable(error: AxiosError): boolean {
  const status = error.response?.status;
  return status == null || status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelay(error: AxiosError, attempt: number, baseDelayMs: number): number {
  const retryAfter = error.response?.headers?.['retry-after'];
  if (retryAfter != null && /^\d+$/.test(String(retryAfter))) {
    return Number(retryAfter) * 1_000;
  }
  return Math.min(10_000, baseDelayMs * 2 ** Math.max(0, attempt - 1));
}

export class FigshareClient {
  public readonly baseUrl: string;
  public lastResponseMetadata?: FigshareResponseMetadata;

  private readonly token: string;
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly http: AxiosInstance;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  public constructor(options: FigshareClientOptions) {
    const token = options.token.trim();
    if (token === '') {
      throw new Error('A Figshare API token is required');
    }
    this.token = token;
    this.baseUrl = normaliseFigshareBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    this.retryBaseDelayMs = Math.max(0, options.retryBaseDelayMs ?? 500);
    this.sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: options.timeoutMs ?? 30_000,
      adapter: options.adapter,
      headers: {
        Accept: 'application/json',
        Authorization: `token ${this.token}`,
        'User-Agent': options.userAgent ?? 'redbox-figshare-metadata-inspector/0.1.0',
      },
    });
  }

  public async get<T>(path: string, query?: Record<string, string | number | boolean>): Promise<T> {
    const endpoint = safeEndpoint(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.http.get<T>(path, { params: query });
        this.lastResponseMetadata = {
          endpoint,
          statusCode: response.status,
          rateLimit: header(response, 'x-ratelimit-limit'),
          rateLimitRemaining: header(response, 'x-ratelimit-remaining'),
          rateLimitReset: header(response, 'x-ratelimit-reset'),
          retryAfter: header(response, 'retry-after'),
        };
        return response.data;
      } catch (caught) {
        const error = caught as AxiosError;
        if (attempt < this.maxAttempts && isRetryable(error)) {
          await this.sleep(retryDelay(error, attempt, this.retryBaseDelayMs));
          continue;
        }
        const statusCode = error.response?.status;
        const safeCause = {
          name: error.name,
          code: error.code,
          message: redact(error.message, this.token),
        };
        throw new FigshareApiError(
          `Figshare request failed${statusCode == null ? '' : ` with HTTP ${statusCode}`} for ${endpoint}`,
          {
            endpoint,
            statusCode,
            responseBody: redact(error.response?.data, this.token),
            // Axios errors retain the complete request config, including Authorization.
            // Attach only a credential-free diagnostic summary.
            cause: safeCause,
          }
        );
      }
    }
    throw new FigshareApiError(`Figshare request failed for ${endpoint}`, { endpoint });
  }

  public async getPaginated<T>(
    path: string,
    query: Record<string, string | number | boolean> = {},
    options: { pageSize?: number; maxPages?: number } = {}
  ): Promise<T[]> {
    const pageSize = options.pageSize ?? 100;
    const maxPages = options.maxPages ?? 100;
    const result: T[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await this.get<unknown>(path, { ...query, page, page_size: pageSize });
      const values = extractList<T>(response, path);
      result.push(...values);
      if (values.length < pageSize) {
        return result;
      }
    }
    throw new FigshareApiError(`Pagination exceeded ${maxPages} pages for ${path}`, {
      endpoint: safeEndpoint(`${this.baseUrl}${path}`),
    });
  }
}

export function extractList<T>(response: unknown, endpoint: string): T[] {
  if (Array.isArray(response)) {
    return response as T[];
  }
  if (response != null && typeof response === 'object') {
    for (const key of ['items', 'results', 'data', 'fields', 'categories', 'licenses', 'item_types']) {
      const candidate = (response as Record<string, unknown>)[key];
      if (Array.isArray(candidate)) {
        return candidate as T[];
      }
    }
  }
  throw new FigshareResponseValidationError(endpoint, {
    expected: 'array or recognised list envelope',
    receivedType: response == null ? String(response) : Array.isArray(response) ? 'array' : typeof response,
    receivedKeys: response != null && typeof response === 'object' ? Object.keys(response) : [],
  });
}
