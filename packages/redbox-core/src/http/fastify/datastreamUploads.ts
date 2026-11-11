import type { ControllerInstances } from './registration';
import type { FastifyPreparation } from './preparation';
import { rawMultipartParserPlugin, receiveMultipart } from './rawMultipart';
import type { ResolvedHttpRoute, RouteComposition, RouteGuards, RouteBinding } from './routes';

import type { FastifyReply, FastifyRequest } from 'fastify';
import { requestContext } from '../context';
import { nativeActionReply } from './actionReply';
import { httpReplySubmitted } from './errorBoundary';
import { validateRouteRequest, resolvedRequestContract } from './validation';
import {
  datastreamUploadActorPrelude,
  datastreamUploadPreludeContract,
  prepareDatastreamUpload,
  validateDatastreamUploadBody,
  rejectDatastreamUpload,
  type PreparedDatastreamUpload,
  type DatastreamUploadInput,
} from '../actions/datastreamUpload';
import type { StreamingMultipart, MultipartResult } from '../express/multipart';

export interface DatastreamUploadBoundaryInput extends DatastreamUploadInput {
  readonly multipart: StreamingMultipart;
}
interface ValidatedUpload {
  readonly prepared: PreparedDatastreamUpload;
  received?: MultipartResult;
  close(): Promise<void>;
}
const validatedUploads = new WeakMap<FastifyRequest, ValidatedUpload>();
export function validatedDatastreamUpload(request: FastifyRequest) {
  const upload = validatedUploads.get(request);
  if (!upload?.received) throw new TypeError('Upload requires completed host validation.');
  return { prepared: upload.prepared, received: upload.received, close: upload.close };
}
const actionRequest = (request: FastifyRequest) => ({
  params: request.params as Record<string, unknown>,
  query: request.query as Record<string, unknown>,
  headers: request.headers,
  context: () => requestContext(request),
});

/** Both validation stages precede beforeAction. A suspended receive retains
 * staging until dispatch settles, including overridden actions and early hooks.
 * onSend joins cleanup before publishing; action/hook finally handles no-send,
 * throw, hijack and disconnect without abandoning accepted provider work. */
export function createDatastreamUploadBoundary(input: () => DatastreamUploadBoundaryInput) {
  async function finish(request: FastifyRequest, reply: FastifyReply) {
    try {
      await validatedUploads.get(request)?.close();
    } catch (error) {
      // A submitted response's onSend owns its cleanup failure representation.
      if (!httpReplySubmitted(reply))
        rejectDatastreamUpload(input(), actionRequest(request), nativeActionReply(reply), error);
    }
  }
  return {
    finish,
    async prelude(request: FastifyRequest, reply: FastifyReply) {
      const ports = input(),
        req = actionRequest(request),
        res = nativeActionReply(reply);
      try {
        const identity = datastreamUploadActorPrelude(req, res);
        if (!identity) return;
        const route = resolvedRequestContract(request);
        const validated = await validateRouteRequest(request, reply, datastreamUploadPreludeContract(route));
        if (!validated) return;
        const prepared = await prepareDatastreamUpload(ports, req, res, identity, validated);
        if (!prepared) return;
        const ready = Promise.withResolvers<MultipartResult>(),
          released = Promise.withResolvers<void>();
        const work = receiveMultipart(request, ports.multipart, async received => {
          validateDatastreamUploadBody(req, route, received);
          ready.resolve(received);
          await released.promise;
        }).finally(() => validatedUploads.delete(request));
        const upload: ValidatedUpload = {
          prepared,
          close: () => {
            released.resolve();
            return work.then(() => {});
          },
        };
        validatedUploads.set(request, upload);
        // Failure reaches the prelude only after receive has joined writes and
        // cleaned staging. The actual receive remains HTTP/application-owned.
        void work.catch(ready.reject);
        upload.received = await ready.promise;
      } catch (error) {
        rejectDatastreamUpload(ports, req, res, error);
      }
    },
    wrap(action: ReturnType<ControllerInstances['action']>): ReturnType<ControllerInstances['action']> {
      return async (request, reply) => {
        try {
          return await action(request, reply);
        } finally {
          await finish(request, reply);
        }
      };
    },
    async onSend(request: FastifyRequest, reply: FastifyReply, payload: unknown) {
      try {
        await validatedUploads.get(request)?.close();
      } catch (error) {
        const output = nativeActionReply(reply, bytes => {
          payload = bytes;
        });
        rejectDatastreamUpload(input(), actionRequest(request), output, error);
      }
      return payload;
    },
  };
}

/** Install one resolved inventory, encapsulating only its selected raw actions.
 * The inventory's synthetic OPTIONS remains a single root registration. */
export function prepareDatastreamUploads(
  app: FastifyPreparation,
  input: {
    readonly plan: RouteComposition;
    readonly routes: readonly ResolvedHttpRoute[];
    readonly controllers: Pick<ControllerInstances, 'action'>;
    readonly guards: RouteGuards;
  }
): void {
  const routes = new Set(input.routes);
  if ([...routes].some(route => !input.plan.routes.includes(route) || route.effectivePolicies.includes(false)))
    throw new TypeError('Raw parser scopes require active routes from the final resolved plan.');
  const raw = (binding: RouteBinding) => binding.kind !== 'automatic-options' && routes.has(binding.route);
  if (routes.size)
    app.register(async scope => {
      scope.register(rawMultipartParserPlugin, { bindings: input.plan.bindings.filter(raw) });
      input.plan.install(scope, input.controllers, input.guards, raw);
    });
  input.plan.install(app, input.controllers, input.guards, binding => !raw(binding));
}
