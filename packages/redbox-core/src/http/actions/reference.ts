import { isObservable, lastValueFrom, single, type Observable } from 'rxjs';
import type { ApiRequestInput, ApiRouteDefinition } from '../../api-routes/types';
import { validateApiRouteRequest, type ValidatedApiRouteRequest } from '../../api-routes/validation';
import { apiNoCacheHeaders, safeApiVersion, safeValidationApiVersion } from '../apiResponses';
import type { HttpRequestContext } from '../context';
import { Services as Dashboard } from '../../dashboards/DashboardConfig';

export interface ReferenceRequest extends ApiRequestInput {
  readonly method?: string;
  readonly context: HttpRequestContext;
  readonly params: Record<string, unknown>;
  readonly query: Record<string, unknown>;
  readonly session?: unknown;
  /** Detached diagnostic facts only; transport adapters own their observer. */
  readonly observe?: (facts: Record<string, unknown>) => void;
  /** Record a fixed failure diagnostic without exposing the original error. */
  readonly recordFailure?: () => void;
}
export interface ReferenceResult {
  readonly kind?: 'text' | 'stream' | 'redirect' | 'empty';
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}
export interface EncodedReferenceResult extends ReferenceResult {
  readonly json: string | undefined;
  readonly bytes?: Buffer;
}
export const jsonResult = (
  body: unknown,
  status = 200,
  headers: Readonly<Record<string, string>> = {}
): ReferenceResult => ({ status, headers, body });
export const referenceData = (request: ApiRequestInput, data: unknown, headers = {}): ReferenceResult =>
  jsonResult(safeApiVersion(request) === '2.0' ? { data, meta: {} } : data, 200, { ...apiNoCacheHeaders, ...headers });
export function referenceValidationErrors(
  request: ApiRequestInput,
  issues: readonly { path: string; message: string }[]
): ReferenceResult {
  return referenceErrors(
    request,
    400,
    issues.map(issue => ({ title: issue.path, detail: issue.message })),
    safeValidationApiVersion(request)
  );
}
export function referenceErrors(
  request: ApiRequestInput,
  status: number,
  errors: readonly { title?: string; detail?: string; code?: string }[],
  version = safeApiVersion(request)
): ReferenceResult {
  const only = errors[0] ?? {};
  return jsonResult(
    version === '2.0'
      ? { errors, meta: {} }
      : {
          message:
            errors.length === 1
              ? only.title || only.detail || 'An error occurred'
              : errors.map(error => error.detail || error.title || 'An error occurred').join(' | '),
          details: errors.length === 1 && only.title && only.detail ? only.detail : '',
        },
    status,
    apiNoCacheHeaders
  );
}
export async function referenceValue<T>(value: Observable<T> | Promise<T> | T): Promise<T> {
  return isObservable(value) ? lastValueFrom(value.pipe(single())) : value;
}
export class MetadataParameterError extends Error {}
export function referenceScalar(request: ReferenceRequest, name: string, fallback = ''): string {
  const value = request.params[name] ?? request.query[name] ?? fallback;
  if (typeof value !== 'string' || !value.trim() || [...value].some(c => c.charCodeAt(0) < 32))
    throw new MetadataParameterError('Invalid metadata parameter: ' + name);
  return value.trim();
}
export function dashboardReadError(request: ReferenceRequest, error: unknown): ReferenceResult {
  if (error instanceof MetadataParameterError) return referenceErrors(request, 400, [{ detail: error.message }]);
  if (!(error instanceof Dashboard.DashboardConfigError)) throw error;
  return jsonResult(
    safeValidationApiVersion(request) === '2.0'
      ? {
          errors: [
            {
              status: String(error.status),
              code: error.code,
              title: error.code,
              detail: error.message,
              meta: error.details,
            },
          ],
          meta: error.details,
        }
      : { message: error.code, details: error.message },
    error.status,
    apiNoCacheHeaders
  );
}
/** Both transports serialize once inside the same action/error guard. Declared
 * validation remains after policies/CSRF; response schemas never strip fields. */
export async function executeReferenceRead(
  request: ReferenceRequest,
  contract: Pick<ApiRouteDefinition, 'request'>,
  action: (validated: ValidatedApiRouteRequest) => Promise<ReferenceResult>,
  failure?: (error: unknown) => ReferenceResult
): Promise<EncodedReferenceResult> {
  let headers: Readonly<Record<string, string>> = {};
  const encode = (result: ReferenceResult): EncodedReferenceResult => {
    // Express sets these public action headers before res.json serializes. Keep
    // them if serialization fails, then overlay the safe error's cache headers.
    headers = { ...headers, ...result.headers };
    if (result.kind === 'text') {
      const value = result.body;
      const bytes =
        value == null
          ? undefined
          : Buffer.isBuffer(value)
            ? value
            : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
      return { ...result, headers, json: undefined, bytes };
    }
    return { ...result, headers, json: result.kind ? undefined : JSON.stringify(result.body) };
  };
  try {
    const validated = validateApiRouteRequest(request, contract);
    if (!validated.valid) return encode(referenceValidationErrors(request, validated.issues));
    try {
      return encode(await action(validated));
    } catch (error) {
      if (!failure) throw error;
      return encode(failure(error));
    }
  } catch (error) {
    try {
      request.recordFailure?.();
    } catch {
      /* Observation cannot replace the safe response. */
    }
    let status = 500;
    try {
      const type = error && typeof error === 'object' ? Reflect.get(error, 'type') : undefined;
      status =
        type === 'entity.too.large' || type === 'parameters.too.many'
          ? 413
          : type === 'entity.parse.failed' || error instanceof URIError
            ? 400
            : 500;
    } catch {
      /* A hostile diagnostic accessor is still an internal failure. */
    }
    return encode(
      referenceErrors(request, status, [{ detail: status === 500 ? 'Internal server error' : 'Invalid request' }])
    );
  }
}
