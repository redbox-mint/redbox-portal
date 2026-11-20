import type { ApiRequestInput } from '../../api-routes/types';
import { apiNoCacheHeaders, apiVersion } from '../apiResponses';
/** One JSON publication while the action still owns serialization failures.
 * This is an output value capability, with no request/response emulation. */
export interface JsonOutput {
  isCommitted(): boolean;
  publish(body: unknown, status?: number, headers?: Readonly<Record<string, string>>): void;
}
export interface ActionRequest extends ApiRequestInput {
  readonly headers: NonNullable<ApiRequestInput['headers']>;
  context(): import('../context').HttpRequestContext;
  readonly sessionId?: string;
}
export function actionApiData(req: ApiRequestInput, output: JsonOutput, data: unknown, status = 200): void {
  output.publish(apiVersion(req) === '2.0' ? { data, meta: {} } : data, status, apiNoCacheHeaders);
}
export function actionApiErrors(
  req: ApiRequestInput,
  output: JsonOutput,
  status: number,
  errors: readonly { title?: string; detail?: string; code?: string }[],
  version = apiVersion(req),
  headers: Readonly<Record<string, string>> = {}
): void {
  const only = errors[0] ?? {};
  output.publish(
    version === '2.0'
      ? { errors, meta: {} }
      : {
          message:
            errors.length === 1
              ? only.title || only.detail || 'An error occurred'
              : errors.map(e => e.detail || e.title || 'An error occurred').join(' | '),
          details: errors.length === 1 && only.title && only.detail ? only.detail : '',
        },
    status,
    { ...apiNoCacheHeaders, ...headers }
  );
}
