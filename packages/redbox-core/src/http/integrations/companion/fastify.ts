import express, { type Request, type Response } from 'express';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPreparation } from '../../fastify/preparation';
import type { NativePolicy } from '../../fastify/policies';
import type { createNativeCsrf } from '../../fastify/csrf';
import type { PoliciesConfig } from '../../../config/policies.config';
import { pilotPolicyChain, resolveEffectivePolicies } from '../../policyConfiguration';
import { requestContext, type AuthenticatedActor } from '../../context';
import { companionRequestPrelude, companionDispatch } from './actions';
import { nativeActionReply } from '../../fastify/actionReply';
import { requestPathname } from '../../fastify/router';
import { HttpFailure, httpReplySubmitted, writeHttpError } from '../../fastify/errorBoundary';
import { commitNativeSessionForCompanion } from '../../fastify/session';
import { linkHttpRequestLifetime, trackHttpRequestWork } from '../../../middleware/requestLifetime';
import type { CompanionUploads } from './uploads';

const handoffs = new WeakMap<FastifyRequest, { request: FastifyRequest; reply: FastifyReply }>();
/** Exact core handoff: neither native Fastify nor stream capabilities leave it. */
export function bindCompanionRequestView(request: FastifyRequest, reply: FastifyReply, view: FastifyRequest): void {
  handoffs.set(view, { request, reply });
}

export function prepareCompanionRoutes(
  app: FastifyPreparation,
  input: {
    readonly uploads: CompanionUploads;
    readonly rootContext: string;
    readonly path: string;
    readonly appUrl: string;
    readonly trustProxy: import('fastify').FastifyServerOptions['trustProxy'];
    readonly defaultBrand: string;
    readonly defaultPortal: string;
    readonly policies: Readonly<Record<string, NativePolicy>>;
    readonly policyConfiguration: PoliciesConfig;
    readonly csrf: Pick<ReturnType<typeof createNativeCsrf>, 'apiProtect'>;
    audit(actor: AuthenticatedActor, action: string, context: { brandId: string; method: string }): Promise<unknown>;
  }
): void {
  const names = [
    ...pilotPolicyChain.map(name => name.toLowerCase()),
    ...resolveEffectivePolicies({ controller: 'CompanionController', action: 'handle' }, input.policyConfiguration),
  ];
  const policies = names.map(name => {
    if (name === false) return async (_request: FastifyRequest, reply: FastifyReply) => reply.code(403).send();
    if (!Object.hasOwn(input.policies, name) || typeof input.policies[name] !== 'function')
      throw new TypeError('Companion requires an unbound policy: ' + name);
    return input.policies[name];
  });
  // This app exists only to establish Companion's actual Express prototypes.
  // It contains no portal auth/session/policies/routes or general middleware bridge.
  const boundary = express();
  boundary.disable('x-powered-by');
  boundary.disable('etag');
  boundary.set('trust proxy', input.trustProxy);
  boundary.use((req, res, next) => input.uploads.handle(req, res, next));
  const mount = input.rootContext + input.path;
  for (const url of [mount, mount + '/*'])
    app.route({
      method: [...app.supportedMethods] as import('fastify').HTTPMethods[],
      url,
      exposeHeadRoute: false,
      onRequest: async (_request, reply) => {
        if (new URL(input.appUrl).protocol === 'https:')
          reply.header('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
      },
      preValidation: async request => {
        Object.assign(request.params as object, {
          branding: request.session?.get('branding') ?? input.defaultBrand,
          portal: input.defaultPortal,
        });
      },
      preHandler: async (request, reply) => {
        for (const policy of policies) {
          await policy(request, reply);
          if (httpReplySubmitted(reply)) return reply;
        }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
          await input.csrf.apiProtect(request, reply);
          if (httpReplySubmitted(reply)) return reply;
        }
        const path = requestPathname(request.raw.url ?? '/')!.slice(input.rootContext.length);
        companionRequestPrelude(
          { method: request.method, path, body: request.body },
          nativeActionReply(reply),
          input.path
        );
      },
      handler: async (request, reply) => {
        const path = requestPathname(request.raw.url ?? '/')!.slice(input.rootContext.length);
        const popup = await companionDispatch(
          { method: request.method, path, body: request.body },
          {
            ...input,
            context: () => requestContext(request),
          }
        );
        if (popup) return reply.headers(popup.headers).type('text/html; charset=utf-8').send(popup.html);
        const native = handoffs.get(request);
        if (!native) throw new TypeError('Companion requires an owned native request.');
        // The provider owns the raw reply. Its publication barrier below commits
        // native sessions/cookies; onSend will not run after hijacking.
        if (reply.raw.destroyed) return reply.hijack();
        linkHttpRequestLifetime(native.request, native.request.raw);
        const req = native.request.raw as Request,
          res = native.reply.raw as Response;
        req.body = request.body;
        // Companion/Grant borrow the native session's data and owned save API.
        // No Express session middleware, store or authentication is installed.
        Object.defineProperty(req, 'session', { configurable: true, get: () => native.request.session });
        const original = req.url;
        req.url = req.url!.slice(input.rootContext.length);
        for (const [name, value] of Object.entries(native.reply.getHeaders()))
          if (value !== undefined) res.setHeader(name, value);
        reply.hijack();
        // Delay the provider's first raw write until its session mutations/save
        // have settled. A pipe gets false while pending, then the native drain
        // (or one explicit resume signal) supplies ordinary backpressure.
        const methods = { writeHead: res.writeHead, write: res.write, end: res.end };
        let publishing: Promise<void> | undefined;
        const queued: { name: keyof typeof methods; args: unknown[] }[] = [];
        const restore = () => Object.assign(res, methods);
        for (const name of ['writeHead', 'write', 'end'] as const)
          Reflect.set(res, name, function (...args: unknown[]) {
            queued.push({ name, args });
            if (!publishing) {
              publishing = Promise.resolve()
                .then(async () => {
                  await commitNativeSessionForCompanion(native.request);
                  const cookie = native.reply.getHeader('set-cookie');
                  if (cookie !== undefined) {
                    const own = res.getHeader('set-cookie');
                    const values = (value: unknown) =>
                      value === undefined ? [] : Array.isArray(value) ? value : [value];
                    res.setHeader('set-cookie', [...new Set([...values(own), ...values(cookie)])]);
                  }
                  restore();
                  let resume = false;
                  for (const operation of queued) {
                    const result = Reflect.apply(methods[operation.name], res, operation.args);
                    if (operation.name === 'write') resume = result;
                  }
                  if (resume) res.emit('drain');
                })
                .catch(error => {
                  restore();
                  writeHttpError(error, { request: native.request, reply: native.reply });
                });
              trackHttpRequestWork(request, publishing);
            }
            return name === 'write' ? false : res;
          });
        const completion = Promise.withResolvers<void>();
        const finish = () => {
          req.url = original;
          res.off('finish', finish);
          res.off('close', finish);
          completion.resolve();
        };
        res.once('finish', finish);
        res.once('close', finish);
        trackHttpRequestWork(request, completion.promise);
        try {
          boundary(req, res, error => {
            req.url = original;
            // A fallthrough belongs to the portal, never Express's finalhandler.
            if (error) writeHttpError(error, { request: native.request, reply: native.reply });
            else
              writeHttpError(new HttpFailure(404), {
                request: native.request,
                reply: native.reply,
                publicResponse: {
                  payload: { error: 'not-found' },
                  send: payload => {
                    res.status(404).json(payload);
                    return native.reply;
                  },
                },
              });
          });
        } catch (error) {
          writeHttpError(error, { request: native.request, reply: native.reply });
        }
        await completion.promise;
        return reply;
      },
    });
}
