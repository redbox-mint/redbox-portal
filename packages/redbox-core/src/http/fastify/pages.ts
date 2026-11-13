import type { FastifyRequest, FastifyReply } from 'fastify';
import { requestContext } from '../context';
import { requestAccepts, sendSerializedJson, sendApiErrors } from './responses';
import { preparePageRendering, type PageRenderingInput, type PageResponse } from '../../pages/rendering';
import { HttpFailure, safeHttpErrorStatus, httpReplySubmitted } from './errorBoundary';
import { requestPathname } from './router';

/** Native transport facts are read at invocation, after beforeAction hooks. */
export function nativePageRequest(request: FastifyRequest, input: PageRenderingInput, csrfToken: () => string) {
  const originalUrl = request.raw.url ?? request.url;
  // Express trims the mounted root after the raw scheme/authority, preserving
  // their spelling and the remaining path/query rather than reserializing a URL.
  const query = originalUrl.indexOf('?');
  const scheme = originalUrl.startsWith('/') ? -1 : originalUrl.slice(0, query < 0 ? undefined : query).indexOf('://');
  const authority = scheme < 0 ? '' : originalUrl.substring(0, originalUrl.indexOf('/', scheme + 3));
  const relative = originalUrl.slice(authority.length + input.rootContext.length);
  const url = authority + (authority || relative.startsWith('/') ? relative : '/' + relative);
  return {
    context: requestContext(request),
    params: request.params as Record<string, unknown>,
    query: request.query as Record<string, unknown>,
    body: request.body as Record<string, unknown> | undefined,
    session: request.session as unknown as Record<string, unknown>,
    url,
    originalUrl,
    path: requestPathname(url) ?? '/',
    csrfToken,
    acceptsHtml: () => requestAccepts(request).types(['html', 'json']) === 'html',
  };
}
export function sendPageResponse(request: FastifyRequest, reply: FastifyReply, result: PageResponse) {
  if (httpReplySubmitted(reply) || reply.raw.headersSent || reply.raw.writableEnded) {
    if (!reply.raw.writableEnded) reply.raw.destroy();
    return reply;
  }
  // P3's freshness/HEAD boundary also owns rendered representations. ETags are
  // deliberately absent, as in the production Express host.
  return sendSerializedJson(request, reply, {
    ...result,
    json: undefined,
    bytes: result.body === undefined ? undefined : Buffer.from(result.body),
  });
}
export async function prepareNativePage(
  request: FastifyRequest,
  reply: FastifyReply,
  input: PageRenderingInput,
  csrfToken: () => string
) {
  return preparePageRendering(nativePageRequest(request, input, csrfToken), input, headers => reply.headers(headers));
}
export async function sendPageError(
  request: FastifyRequest,
  reply: FastifyReply,
  input: PageRenderingInput,
  csrfToken: () => string,
  status: 403 | 404 | 500,
  data?: { message: string; detailedMessage: string }
) {
  let page;
  try {
    page = await prepareNativePage(request, reply, input, csrfToken);
  } catch (error) {
    return pagePreparationFailure(request, reply, error);
  }
  return sendPageResponse(request, reply, page.error(status, data));
}

/** Preparation errors retain Express's normal session/send boundary. Typed
 * guard errors keep their status and remain owned by the sole host writer. */
export function pagePreparationFailure(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof HttpFailure) throw error;
  const type = error && typeof error === 'object' ? Reflect.get(error, 'type') : undefined;
  const status =
    type === 'entity.too.large' || type === 'parameters.too.many'
      ? 413
      : type === 'entity.parse.failed'
        ? 400
        : safeHttpErrorStatus(error);
  request.log.error('HTTP_REQUEST_FAILED');
  return sendApiErrors(request, reply, status, [
    { detail: status === 500 ? 'Internal server error' : 'Invalid request' },
  ]);
}
