import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ApiValidationIssue } from '../../api-routes/validation';
import { apiNoCacheHeaders, apiVersion, validationApiVersion } from '../express/responses';
import type { FastifyPreparation } from './preparation';
import accepts from 'accepts';
import { requestStrings, requestText } from '../requestValues';
import { safeHttpErrorStatus } from './errorBoundary';
export { safeHttpErrorStatus, nativeClientErrors } from './errorBoundary';

// Present invalid values remain unknown versions, preserving Express's v1
// fallback on header/query conflicts without invoking object coercion.
const versionValue = (value: unknown) => requestStrings(value) ?? (value == null ? undefined : 'invalid');
const versionInput = (request: FastifyRequest, extract = versionValue) => ({
  headers: { 'x-redbox-api-version': extract(request.headers['x-redbox-api-version']) },
  query: {
    apiVersion: extract((request.query as Record<string, unknown> | undefined)?.apiVersion),
    apiversion: extract((request.query as Record<string, unknown> | undefined)?.apiversion),
  },
});

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
    .send(apiVersion(versionInput(request)) === '2.0' ? { data: value, meta: {} } : value);
}

/** Callers supply only their own public diagnostics, never a caught provider error. */
export function sendApiErrors(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  errors: readonly { title?: string; detail?: string; code?: string }[],
  version = apiVersion(versionInput(request))
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
    validationApiVersion(versionInput(request, requestStrings))
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
