import type { ApiRequestInput } from '../../api-routes/types';
import { apiNoCacheHeaders, apiVersion } from '../apiResponses';
/** The action owns guards, headers and serialization failures; transports only publish. */
export interface ActionReply {
  readonly headersSent: boolean;
  set(headers: Readonly<Record<string, string>>): ActionReply;
  status(status: number): ActionReply;
  json(body: unknown): void;
}
export interface ActionRequest extends ApiRequestInput {
  readonly headers: NonNullable<ApiRequestInput['headers']>;
  context(): import('../context').HttpRequestContext;
  readonly sessionId?: string;
}
export function actionApiData(req: ApiRequestInput, res: ActionReply, data: unknown, status = 200): void {
  res
    .set(apiNoCacheHeaders)
    .status(status)
    .json(apiVersion(req) === '2.0' ? { data, meta: {} } : data);
}
export function actionApiErrors(
  req: ApiRequestInput,
  res: ActionReply,
  status: number,
  errors: readonly { title?: string; detail?: string; code?: string }[],
  version = apiVersion(req)
): void {
  const only = errors[0] ?? {};
  res
    .set(apiNoCacheHeaders)
    .status(status)
    .json(
      version === '2.0'
        ? { errors, meta: {} }
        : {
            message:
              errors.length === 1
                ? only.title || only.detail || 'An error occurred'
                : errors.map(e => e.detail || e.title || 'An error occurred').join(' | '),
            details: errors.length === 1 && only.title && only.detail ? only.detail : '',
          }
    );
}
