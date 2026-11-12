import { STATUS_CODES } from 'node:http';
import type { Socket } from 'node:net';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { apiVersion, apiVersionInput } from '../apiResponses';

export const nativeClientErrors = Object.freeze({
  FST_ERR_NOT_FOUND: 404,
  FST_ERR_CTP_BODY_TOO_LARGE: 413,
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 415,
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: 400,
  FST_ERR_CTP_EMPTY_JSON_BODY: 400,
  FST_ERR_CTP_INVALID_JSON_BODY: 400,
  FST_ERR_BAD_URL: 400,
  FST_ERR_MAX_PARAM_LENGTH: 414,
  FST_ERR_VALIDATION: 400,
  FST_ERR_ROUTE_MISSING_CONTENT_TYPE: 400,
  FST_ERR_ROUTE_MISSING_CONTENT: 400,
} as const);
const statuses = new WeakMap<object, number>();
const emptyDenials = new WeakSet<object>();
/** Internal framing payload; hooks continue to see an absent entity. */
export const isEmptyHttpErrorPayload = (payload: unknown): boolean =>
  payload !== null && typeof payload === 'object' && emptyDenials.has(payload);
const sends = new WeakMap<FastifyReply, { submitted: boolean; generation: number }>();
/** Internal coordination of replacement responses and pending send continuations. */
export function httpSendState(reply: FastifyReply) {
  let state = sends.get(reply);
  if (!state) sends.set(reply, (state = { submitted: false, generation: 0 }));
  return state;
}
/** Submission is terminal even while asynchronous send hooks still own bytes. */
export function httpReplySubmitted(reply: FastifyReply): boolean {
  return reply.sent || httpSendState(reply).submitted;
}
/** Capability views and the native dispatcher must share submission identity. */
export function registerHttpReplyView(reply: FastifyReply, view: FastifyReply): void {
  sends.set(view, httpSendState(reply));
}
export function beginHttpErrorHandler(reply: FastifyReply) {
  const state = httpSendState(reply);
  state.generation++;
  state.submitted = false;
}
export class HttpFailure extends Error {
  constructor(status = 500) {
    super('HTTP_REQUEST_FAILED');
    statuses.set(this, Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500);
  }
}
export function safeHttpErrorStatus(error: unknown): number {
  try {
    if (error && typeof error === 'object') {
      const status = statuses.get(error);
      if (status) return status;
      const code = Reflect.get(error, 'code');
      if (typeof code === 'string' && Object.hasOwn(nativeClientErrors, code))
        return nativeClientErrors[code as keyof typeof nativeClientErrors];
    }
    return error instanceof URIError ? 400 : 500;
  } catch {
    return 500;
  }
}
/** Original messages, headers, credentials and falsy throws never reach Fastify. */
// Fastify annotates serializer errors. Its fresh Error must remain mutable;
// the trusted status stays private and no original diagnostic is retained.
export const normalizeHttpError = (error: unknown): Error => new HttpFailure(safeHttpErrorStatus(error));
const publicHeaders = new Set([
  // Deliberate record/schema refusals carry authoritative representation headers.
  // Caught faults still take reset(false), which removes every buffered header.
  'etag',
  'link',
  'allow',
  'www-authenticate',
  'content-type',
  'cache-control',
  'pragma',
  'expires',
  'surrogate-control',
  'vary',
  'x-content-type-options',
  'content-security-policy',
  'cross-origin-opener-policy',
  // Configuration reads retain this public source marker if JSON encoding fails.
  'x-redbox-config-source',
  // Caught record export failures retain their already prepared attachment name.
  'content-disposition',
  // Companion's public provider responses retain their canonical CORS contract.
  'access-control-allow-origin',
  'access-control-allow-credentials',
  'x-powered-by',
]);
type ResponseTarget =
  | {
      request?: FastifyRequest;
      reply: FastifyReply;
      /** Deliberate public denials retain their body and normal session/send pipeline. */
      publicResponse?: { payload: unknown; send(payload: unknown): FastifyReply };
      opaque?: boolean;
    }
  | { socket: Socket };

/** The single error writer, for deliberate denials and every failed response.
 * Faults bypass send hooks/serializers; there is no second error-send attempt. */
export function writeHttpError(error: unknown, target: ResponseTarget): void {
  let status = safeHttpErrorStatus(error);
  if ('socket' in target) {
    const socket = target.socket;
    try {
      const response = Reflect.get(socket, '_httpMessage');
      if (!socket.destroyed && socket.writable && (!response || !Reflect.get(response, '_headerSent')))
        socket.write(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\n\r\n`);
    } catch {
      /* transport only */
    }
    try {
      socket.destroy();
    } catch {
      /* already closed */
    }
    return;
  }
  const { request, reply } = target;
  const reset = (preserve: boolean) => {
    const close = reply.getHeader('connection') === 'close';
    const opener = reply.getHeader('cross-origin-opener-policy') === 'same-origin-allow-popups';
    const headers = reply.getHeaders();
    for (const name of Object.keys(headers)) {
      // A public denial may retain only documented representation/security
      // headers and a credential-free cookie deletion. Faults retain NONE.
      const value = headers[name];
      const deletion =
        name.toLowerCase() === 'set-cookie' &&
        (Array.isArray(value) ? value : [value]).every(item => typeof item === 'string' && /^[\w.-]+=;/.test(item));
      if (!preserve || (!publicHeaders.has(name.toLowerCase()) && !deletion)) reply.removeHeader(name);
    }
    // Reconstruct only the fixed drain instruction, never a buffered value.
    if (close) reply.header('Connection', 'close');
    if (opener) reply.header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    reply.raw.statusMessage = STATUS_CODES[status] ?? 'Internal Server Error';
    reply.code(status);
  };
  try {
    if (reply.raw.headersSent || reply.raw.writableEnded) {
      if (!reply.raw.writableEnded) reply.raw.destroy();
      return;
    }
    reset(!!target.publicResponse);
    if (!target.publicResponse) {
      const state = httpSendState(reply);
      state.generation++;
      state.submitted = true;
      reply.log.error('HTTP_REQUEST_FAILED');
    }
    if (target.publicResponse) {
      try {
        // Retain the helper's chunked empty entity and owned send pipeline.
        // Production composition selects framing for qualified route families.
        const emptyEnd = target.publicResponse.payload === undefined && request && request.method !== 'HEAD';
        let payload = target.publicResponse.payload;
        if (emptyEnd) {
          reply.header('Transfer-Encoding', 'chunked');
          const empty = Readable.from([]);
          emptyDenials.add(empty);
          payload = empty;
        }
        target.publicResponse.send(payload);
        return;
      } catch (caught) {
        reply.log.error('HTTP_REQUEST_FAILED');
        status = safeHttpErrorStatus(normalizeHttpError(caught));
        reset(false);
      }
    }
    let body: string;
    try {
      if (target.opaque) body = status === 500 ? '{"error":"internal-server-error"}' : '{"error":"invalid-request"}';
      else if (status === 404) body = '{"error":"not-found"}';
      else {
        const version = apiVersion(apiVersionInput(request ?? {}));
        const detail = status === 500 ? 'Internal server error' : 'Invalid request';
        body = JSON.stringify(
          version === '2.0' ? { errors: [{ detail }], meta: {} } : { message: detail, details: '' }
        );
      }
    } catch {
      status = 500;
      body = '{"error":"internal-server-error"}';
      reset(false);
    }
    reply.hijack();
    reply.raw.writeHead(status, STATUS_CODES[status] ?? 'Internal Server Error', {
      'Cache-Control': 'no-cache, private',
      Pragma: 'no-cache',
      Expires: '0',
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      ...(reply.getHeader('cross-origin-opener-policy') === 'same-origin-allow-popups'
        ? { 'Cross-Origin-Opener-Policy': 'same-origin-allow-popups' }
        : {}),
      ...(reply.getHeader('connection') === 'close' ? { Connection: 'close' } : {}),
    });
    reply.raw.end(body);
  } catch {
    try {
      reply.raw.destroy();
    } catch {
      /* never re-enter a framework error handler */
    }
  }
}
