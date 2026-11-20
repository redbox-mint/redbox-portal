import { referenceErrors } from '../actions/reference';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { PageArtifacts } from '../../pages/Artifacts';
import { applyPageHeaders, isImmutableAssetPath, type PageHeaderInput } from '../../pages/headers';
import { sendSerializedJson, sendFreshResponse } from './responses';
import { pagePreparationFailure } from './pages';
import { sendReadStream } from './readStreams';
import { requestPathname } from './router';
const mime = require('mime-types') as {
  lookup(name: string): string | false;
  contentType(type: string): string | false;
};
const ranges = require('range-parser') as (
  size: number,
  value: string,
  options: { combine: boolean }
) => -1 | -2 | (Array<{ start: number; end: number }> & { type: string });
import { markImmutableAsset } from './assetCookies';
import { preserveAssetFailureHeaders, httpReplySubmitted } from './errorBoundary';
/** Publish representation bytes through the native freshness and HEAD boundary. */
export function sendAssetBytes(request: FastifyRequest, reply: FastifyReply, body: string | Buffer) {
  let type = String(
    reply.getHeader('Content-Type') || (typeof body === 'string' ? 'text/html' : 'application/octet-stream')
  );
  type = mime.contentType(type) || type;
  if (typeof body === 'string') type = type.replace(/;\s*charset=[^;]+/i, '') + '; charset=utf-8';
  return sendSerializedJson(request, reply, {
    status: reply.statusCode,
    headers: { 'Content-Type': type },
    json: undefined,
    bytes: Buffer.isBuffer(body) ? body : Buffer.from(body),
  });
}
export function assetMediaType(reply: FastifyReply, type: string): FastifyReply {
  return reply.type(mime.contentType(type) || type);
}
export function relativeAssetPath(target: string, rootContext: string): string | undefined {
  const pathname = requestPathname(target);
  if (pathname === undefined || !pathname.startsWith('/')) return;
  if (
    rootContext &&
    (pathname.slice(0, rootContext.length).toLowerCase() !== rootContext.toLowerCase() ||
      (pathname.length > rootContext.length && pathname[rootContext.length] !== '/'))
  )
    return;
  return pathname.slice(rootContext.length) || '/';
}
/** Match the retained candidate specificity before provider/root precedence. */
export function findStaticAsset(artifacts: PageArtifacts, pathname: string): string | undefined {
  const name = decodeURIComponent(pathname).replace(/^\//, '');
  const [brand, portal, ...rest] = name.split('/');
  const candidates =
    rest.length && /^[A-Za-z0-9_-]+$/.test(brand) && /^[A-Za-z0-9_-]+$/.test(portal)
      ? [name, `default/${portal}/${rest.join('/')}`, `default/default/${rest.join('/')}`]
      : [name];
  return candidates.map(candidate => artifacts.find(artifacts.assets, candidate)).find(Boolean);
}
/** Match send's weak/list comparison and If-Match precedence, including its
 * wildcard refusal when the production host has no generated ETag. */
function assetPreconditionFailed(request: FastifyRequest, reply: FastifyReply): boolean {
  const match = request.headers['if-match'];
  if (match) {
    const etag = reply.getHeader('ETag');
    return (
      !etag ||
      (match !== '*' &&
        match
          .split(',')
          .map(token => token.replace(/^ +| +$/g, ''))
          .filter(Boolean)
          .every(token => token !== etag && token !== 'W/' + etag && 'W/' + token !== etag))
    );
  }
  const value = request.headers['if-unmodified-since'];
  const unmodified = typeof value === 'string' ? Date.parse(value) : NaN;
  const modified = Date.parse(String(reply.getHeader('Last-Modified')));
  return !Number.isNaN(unmodified) && (Number.isNaN(modified) || modified > unmodified);
}
function sendAssetFailure(request: FastifyRequest, reply: FastifyReply) {
  // A replacement entity owns its framing, including HEAD's GET metadata.
  reply.removeHeader('Content-Length');
  preserveAssetFailureHeaders(reply);
  // Retained sendFile forwards precondition/range errors to its safe 500 writer.
  const result = referenceErrors({ headers: request.headers, query: request.query as Record<string, unknown> }, 500, [
    { detail: 'Internal server error' },
  ]);
  const type = String(reply.getHeader('Content-Type')).replace(/;\s*charset=[^;]+/i, '') + '; charset=utf-8';
  return sendSerializedJson(request, reply, {
    ...result,
    headers: { ...result.headers, 'Content-Type': type },
    json: JSON.stringify(result.body),
  });
}
/** Declared artifact only. No directory indexes, redirects or plugin file roots. */
export async function sendAssetFile(request: FastifyRequest, reply: FastifyReply, file: string) {
  const metadata = await stat(file);
  preserveAssetFailureHeaders(reply);
  // sendFile supplies defaults only for truthy-header misses; installed hooks
  // can own validators and range advertisement independently of file metadata.
  if (!reply.getHeader('Accept-Ranges')) reply.header('Accept-Ranges', 'bytes');
  if (!reply.getHeader('Last-Modified')) reply.header('Last-Modified', metadata.mtime.toUTCString());
  if (!reply.getHeader('Content-Type'))
    reply.type(mime.contentType(mime.lookup(file) || 'application/octet-stream') || 'application/octet-stream');
  // The production Express host disables generated ETags, including sendFile.
  if (assetPreconditionFailed(request, reply)) return sendAssetFailure(request, reply);
  if (
    sendFreshResponse(request, reply, reply.statusCode, () => {
      // send.removeContentHeaderFields adds these to the shared 304 cleanup.
      // Content-Location and other representation metadata remain untouched.
      reply.removeHeader('Content-Encoding').removeHeader('Content-Language').removeHeader('Content-Range');
    })
  )
    return reply;
  let start = 0,
    end = metadata.size - 1;
  const range = request.headers.range;
  const ifRange = typeof request.headers['if-range'] === 'string' ? request.headers['if-range'] : undefined;
  const etag = reply.getHeader('ETag');
  const freshRange =
    !ifRange ||
    (ifRange.includes('"')
      ? !!etag && ifRange.includes(String(etag))
      : Date.parse(String(reply.getHeader('Last-Modified'))) <= Date.parse(ifRange));
  if (typeof range === 'string' && /^bytes=/.test(range) && freshRange) {
    const parsed = ranges(metadata.size, range, { combine: true });
    if (parsed === -1) {
      reply.header('Content-Range', `bytes */${metadata.size}`);
      return sendAssetFailure(request, reply);
    }
    if (Array.isArray(parsed) && parsed.type === 'bytes' && parsed.length === 1) {
      ({ start, end } = parsed[0]);
      reply.code(206).header('Content-Range', `bytes ${start}-${end}/${metadata.size}`);
    }
  }
  reply.header('Content-Length', Math.max(0, end - start + 1));
  await sendReadStream(reply, createReadStream(file, end >= 0 ? { start, end } : {}));
}
export async function serveStaticAsset(
  request: FastifyRequest,
  reply: FastifyReply,
  artifacts: PageArtifacts,
  rootContext: string,
  headers: PageHeaderInput,
  beforeSend: () => Promise<unknown>
) {
  if (!['GET', 'HEAD'].includes(request.method)) return;
  const relative = relativeAssetPath(request.raw.url ?? request.url, rootContext);
  if (relative === undefined) return;
  let file: string | undefined;
  try {
    file = findStaticAsset(artifacts, relative);
  } catch (error) {
    if (error instanceof URIError) {
      await beforeSend();
      if (!httpReplySubmitted(reply)) return reply.code(400).send();
      return reply;
    }
    throw error;
  }
  if (!file) return;
  await beforeSend();
  if (httpReplySubmitted(reply)) return reply;
  if (isImmutableAssetPath(relative)) {
    markImmutableAsset(request);
    reply.removeHeader('Set-Cookie');
  }
  applyPageHeaders(
    { path: relative },
    {
      set: (name: string | Record<string, string>, value?: string) =>
        typeof name === 'string' ? reply.header(name, value!) : reply.headers(name),
      removeHeader: name => reply.removeHeader(name),
    },
    headers,
    true
  );
  reply.header('X-Content-Type-Options', 'nosniff');
  try {
    await sendAssetFile(request, reply, file);
  } catch (error) {
    return pagePreparationFailure(request, reply, error);
  }
}
