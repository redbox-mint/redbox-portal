import type { IncomingMessage } from 'node:http';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { trackHttpRequestWork } from '../../middleware/requestLifetime';
import type { StreamingMultipart, MultipartResult } from '../express/multipart';
import type { RouteBinding } from './routes';

const scopes = new WeakSet<IncomingMessage>();
const incoming = new WeakMap<FastifyRequest, IncomingMessage>();

/** Identified core handoff only: callers never recover the incoming stream. */
export function bindMultipartRequestView(request: FastifyRequest, view: FastifyRequest): void {
  incoming.set(view, request.raw);
}
/** Encapsulated raw parser. Native method parsing is disabled by
 * prepareNativeParsers; this preParsing parser passes multipart input through
 * unread to its owner. The parent's JSON/form parsing and error precedence still
 * apply to mislabelled uploads, as in Express. No stream is exposed as
 * request.body, or through an application callback/event API. */
export interface RawMultipartParserOptions {
  readonly bindings: readonly RouteBinding[];
}
export async function rawMultipartParserPlugin(
  app: Pick<FastifyInstance, 'addHook'>,
  options: RawMultipartParserOptions
) {
  if (!Array.isArray(options.bindings)) throw new TypeError('Raw parser requires resolved bindings.');
  const bindings = new Set(options.bindings);
  app.addHook('onRequest', async request => {
    const binding = (request.routeOptions.config as { redboxRoute?: RouteBinding }).redboxRoute;
    if (binding && bindings.has(binding) && request.method === binding.method) scopes.add(request.raw);
  });
  app.addHook('preParsing', async (request, _reply, payload) => {
    return payload;
  });
}
Object.defineProperty(rawMultipartParserPlugin, Symbol.for('skip-override'), { value: true });

export function receiveMultipart<T>(
  request: FastifyRequest,
  multipart: StreamingMultipart,
  consume: (result: MultipartResult) => Promise<T>
): Promise<T> {
  const raw = incoming.get(request);
  if (!raw || !scopes.has(raw)) throw new TypeError('Multipart receive requires a scoped raw parser.');
  // Both the actual parser/provider cleanup and the consumer's finalization are
  // retained after disconnect. The application owns multipart.drain/close too.
  const work = multipart.receive(raw, consume);
  trackHttpRequestWork(request, work);
  return work;
}
