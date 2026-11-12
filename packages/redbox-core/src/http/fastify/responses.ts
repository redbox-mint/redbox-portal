import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiValidationIssue } from '../../api-routes/validation';
import { apiNoCacheHeaders, safeApiVersion, safeValidationApiVersion } from '../apiResponses';
import type { FastifyPreparation } from './preparation';
import accepts from 'accepts';
import { requestText } from '../requestValues';
import { safeHttpErrorStatus } from './errorBoundary';
export { safeHttpErrorStatus, nativeClientErrors } from './errorBoundary';

const fresh: (request: Record<string, unknown>, response: Record<string, unknown>) => boolean = require('fresh');

/** JSON is serialized by the caller's action guard before freshness/HEAD handling. */
export function sendSerializedJson(
  request: FastifyRequest,
  reply: FastifyReply,
  result: {
    readonly status: number;
    readonly headers: Readonly<Record<string, string>>;
    readonly json: string | undefined;
    readonly bytes?: Buffer;
  }
) {
  reply.headers(result.headers).code(result.status);
  if (
    (request.method === 'GET' || request.method === 'HEAD') &&
    ((result.status >= 200 && result.status < 300) || result.status === 304) &&
    fresh(request.headers, reply.getHeaders())
  ) {
    reply.removeHeader('Content-Type').removeHeader('Content-Length').removeHeader('Transfer-Encoding');
    return reply.code(304).send();
  }
  return reply
    .type(result.headers['Content-Type'] ?? 'application/json; charset=utf-8')
    .send(result.bytes ?? (result.json === undefined ? undefined : Buffer.from(result.json)));
}

export const requestAccepts = (request: FastifyRequest) =>
  accepts({ headers: { accept: requestText(request.headers.accept) } } as Parameters<typeof accepts>[0]);

/** Preserve the current browser denial's negotiated redirect representation. */
export function sendLoginRedirect(request: FastifyRequest, reply: FastifyReply, target: string) {
  const location = encodeURI(target).replace(/%25([0-9a-f]{2})/gi, '%$1');
  reply.code(302).header('Location', location);
  const vary = (requestText(reply.getHeader('Vary')) ?? '').split(/,\s*/).filter(Boolean);
  if (!vary.some(name => name.toLowerCase() === 'accept')) vary.push('Accept');
  reply.header('Vary', vary.join(', '));
  const format = requestAccepts(request).types(['text/plain', 'text/html']);
  if (!format) return reply.send();
  const escaped = location.replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!
  );
  const body =
    format === 'text/html'
      ? '<!DOCTYPE html><head><title>Found</title></head><body><p>Found. Redirecting to ' + escaped + '</p></body>'
      : 'Found. Redirecting to ' + location;
  return reply
    .type(format + '; charset=utf-8')
    .header('Content-Length', Buffer.byteLength(body))
    .send(request.method === 'HEAD' ? undefined : body);
}

export function sendApiData(request: FastifyRequest, reply: FastifyReply, value: unknown, status = 200) {
  return reply
    .headers(apiNoCacheHeaders)
    .code(status)
    .send(safeApiVersion(request) === '2.0' ? { data: value, meta: {} } : value);
}

/** Callers supply only their own public diagnostics, never a caught provider error. */
export function sendApiErrors(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  errors: readonly { title?: string; detail?: string; code?: string }[],
  version = safeApiVersion(request)
) {
  const only = errors[0] ?? {};
  return reply
    .headers(apiNoCacheHeaders)
    .code(status)
    .send(
      version === '2.0'
        ? { errors, meta: {} }
        : {
            message:
              errors.length === 1
                ? only.title || only.detail || 'An error occurred'
                : errors.map(error => error.detail || error.title || 'An error occurred').join(' | '),
            details: errors.length === 1 && only.title && only.detail ? only.detail : '',
          }
    );
}
export function sendApiValidationErrors(
  request: FastifyRequest,
  reply: FastifyReply,
  issues: readonly ApiValidationIssue[]
) {
  return sendApiErrors(
    request,
    reply,
    400,
    issues.map(issue => ({ title: issue.path, detail: issue.message })),
    safeValidationApiVersion(request)
  );
}

export interface SafeHttpObservation {
  readonly phase: 'request' | 'response' | 'error';
  readonly status?: number;
}
export interface SafeHttpObservers {
  observe?(event: SafeHttpObservation): unknown | Promise<unknown>;
  log?(message: 'HTTP request failed' | 'HTTP observation failed'): unknown | Promise<unknown>;
}

/** Observation failures cannot replace a response, including a failing log transport. */
export async function observeHttp(input: SafeHttpObservers, event: SafeHttpObservation): Promise<void> {
  try {
    await input.observe?.(Object.freeze(event));
  } catch {
    try {
      await input.log?.('HTTP observation failed');
    } catch {
      /* isolated */
    }
  }
}
/** Observation hooks borrow the request lifetime; the root owns the sole writer. */
export function installSafeHttpErrors(app: FastifyPreparation, input: SafeHttpObservers = {}): void {
  app.addHook('onRequest', async () => {
    await observeHttp(input, { phase: 'request' });
  });
  app.addHook('onResponse', async (_request, reply) => {
    await observeHttp(input, { phase: 'response', status: reply.statusCode });
  });
  app.addHook('onError', async (request, _reply, error) => {
    await observeHttp(input, { phase: 'error', status: safeHttpErrorStatus(error) });
    try {
      await input.log?.('HTTP request failed');
    } catch {
      /* observation only */
    }
  });
}
