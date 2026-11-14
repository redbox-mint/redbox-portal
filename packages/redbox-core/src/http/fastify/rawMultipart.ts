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

interface StagedMultipart {
  received?: MultipartResult;
  close(): Promise<void>;
}
const staged = new WeakMap<FastifyRequest, StagedMultipart>();
/** Complete fields are made live before beforeAction; staging stays owned until
 * action/hook completion or onSend. No request-derived domain input is cached. */
export async function stageMultipart(
  request: FastifyRequest,
  multipart: StreamingMultipart,
  validate: (received: MultipartResult) => void
): Promise<void> {
  const ready = Promise.withResolvers<MultipartResult>(),
    released = Promise.withResolvers<void>();
  const work = receiveMultipart(request, multipart, async received => {
    validate(received);
    request.body = received.fields;
    ready.resolve(received);
    await released.promise;
  }).finally(() => staged.delete(request));
  const upload: StagedMultipart = {
    close: () => {
      released.resolve();
      return work.then(() => {});
    },
  };
  staged.set(request, upload);
  void work.catch(ready.reject);
  upload.received = await ready.promise;
}
export function validatedMultipart(request: FastifyRequest) {
  const upload = staged.get(request);
  if (!upload?.received) throw new TypeError('Upload requires completed host validation.');
  return { received: { ...upload.received, fields: request.body as MultipartResult['fields'] }, close: upload.close };
}
export async function finishMultipart(request: FastifyRequest): Promise<void> {
  await staged.get(request)?.close();
}
