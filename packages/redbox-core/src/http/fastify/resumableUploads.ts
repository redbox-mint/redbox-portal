import type { FastifyRequest, FastifyReply } from 'fastify';
import type { ResumableUploads } from '../actions/resumableUploads';
import { requestContext } from '../context';
import { nativeJsonOutput } from './jsonOutput';
import { requestPathname } from './router';
import { commitNativeSessionForRawReply } from './session';
import { linkHttpRequestLifetime, trackHttpRequestWork } from '../../middleware/requestLifetime';
import { writeHttpError } from './errorBoundary';
import type { RouteBinding } from './routes';
import type { ServerResponse } from 'node:http';

/** srvx's bodyless response awaits end(callback), including after a cancelled
 * PATCH. Node does not call that callback on an already destroyed response.
 * Settle only this terminal publication; the TUS handler/provider and its audit
 * remain awaited by the request owner. */
function completeCancelledPublication(response: ServerResponse): () => void {
  const end = response.end;
  const cleanups = new Set<() => void>();
  response.end = function (this: ServerResponse, ...args: unknown[]) {
    const callback = args.at(-1);
    if (typeof callback !== 'function') return Reflect.apply(end, this, args);
    let completed = false;
    const cleanup = () => {
      response.removeListener('close', closed);
      cleanups.delete(cleanup);
    };
    const complete = (...values: unknown[]) => {
      if (completed) return;
      completed = true;
      cleanup();
      Reflect.apply(callback, response, values);
    };
    const closed = () => complete();
    cleanups.add(cleanup);
    response.once('close', closed);
    args[args.length - 1] = complete;
    try {
      const result = Reflect.apply(end, this, args);
      if (response.destroyed) queueMicrotask(closed);
      return result;
    } catch (error) {
      cleanup();
      throw error;
    }
  } as typeof end;
  return () => {
    response.end = end;
    for (const cleanup of cleanups) cleanup();
  };
}

const handoffs = new WeakMap<FastifyRequest, { request: FastifyRequest; reply: FastifyReply }>();
/** Exact core handoff, shared by no public stream/callback capability. */
export function bindResumableRequestView(request: FastifyRequest, reply: FastifyReply, view: FastifyRequest): void {
  handoffs.set(view, { request, reply });
}
export function isResumableUpload(request: FastifyRequest): boolean {
  const binding = (request.routeOptions.config as { redboxRoute?: RouteBinding }).redboxRoute;
  return binding?.route.declaration.method === 'all';
}
/** TUS consumes only Node's request/response. No Express adapter or prototypes.
 * Hijack skips onSend; persist sessions and copy headers before any raw byte.
 * The awaited handler owns protocol work AND post-response audit through drain. */
export async function resumableUploadAction(
  request: FastifyRequest,
  reply: FastifyReply,
  input: { readonly resumable: Pick<ResumableUploads, 'handle'>; readonly rootContext: string }
) {
  const native = handoffs.get(request);
  if (!native) throw new TypeError('TUS requires an owned native request.');
  try {
    const work = input.resumable.handle(
      {
        params: request.params as Record<string, unknown>,
        query: request.query as Record<string, unknown>,
        headers: request.headers,
        method: request.method,
        path: requestPathname(native.request.raw.url ?? '/')!.slice(input.rootContext.length),
        context: () => requestContext(request),
      },
      nativeJsonOutput(reply),
      async handle => {
        await commitNativeSessionForRawReply(native.request);
        if (native.reply.raw.destroyed) return;
        for (const [name, value] of Object.entries(native.reply.getHeaders()))
          if (value !== undefined) native.reply.raw.setHeader(name, value);
        linkHttpRequestLifetime(native.request, native.request.raw);
        reply.hijack();
        const restore = completeCancelledPublication(native.reply.raw);
        try {
          await handle(native.request.raw, native.reply.raw);
        } finally {
          restore();
        }
      }
    );
    trackHttpRequestWork(request, work);
    await work;
  } catch (error) {
    writeHttpError(error, { request: native.request, reply: native.reply });
  }
}
