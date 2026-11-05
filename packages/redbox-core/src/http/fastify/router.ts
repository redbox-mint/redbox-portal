import fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import qs from 'qs';
import Router from 'find-my-way';
import { ExtensionError } from '../../extensions/loading';

/** Express's extended query parser, with the FM-003 bounds/defaults explicit. */
function querystringParser(query: string): Record<string, unknown> {
  return qs.parse(query, {
    allowPrototypes: true,
    allowDots: false,
    allowSparse: false,
    arrayLimit: 20,
    depth: 5,
    parameterLimit: 1000,
    duplicates: 'combine',
    strictDepth: false,
    throwOnLimitExceeded: false,
    plainObjects: false,
    strictNullHandling: false,
    charset: 'utf-8',
    charsetSentinel: false,
    comma: false,
  });
}

/** Shared by the collision probe and the future host. Captures keep their case. */
export const portalRouterOptions = Object.freeze({
  caseSensitive: false,
  ignoreTrailingSlash: true,
  ignoreDuplicateSlashes: false,
  useSemicolonDelimiter: false,
  querystringParser,
  // Preserve the transport's URL/header bound, rather than find-my-way's 100 chars.
  maxParamLength: Number.MAX_SAFE_INTEGER,
});

/** Keep escapes literal through find-my-way's eager URI decoding. Only captures
 * are decoded later, once, after raw static/suffix matching, as Express does.
 * The query string must remain byte-for-byte unchanged for qs's tolerant decoder.
 */
export function routerUrl(url: string): string {
  const query = url.indexOf('?');
  const end = query < 0 ? url.length : query;
  return url.slice(0, end).replaceAll('%', '%25') + url.slice(end);
}

/** A required wildcard cannot capture the root route's separator. This native
 * constraint keeps '/' distinct from '//', which trailing-slash trimming would
 * otherwise collapse before wildcard lookup. Public findRoute probes must pass
 * the same derived value as real HTTP lookup.
 */
export function routerConstraints(url: string) {
  return { redboxNonemptyPath: url.split('?')[0] !== '/' ? 'nonempty' : 'empty' };
}

const configuredRouters = new WeakSet<FastifyInstance>();

const nonemptyPathConstraint = () => ({
  name: 'redboxNonemptyPath',
  storage: () => new Map(),
  deriveConstraint: (request: { url?: string }) => routerConstraints(request.url ?? '/').redboxNonemptyPath,
  mustMatchWhenDerived: false,
});

/** The same find-my-way version/options/constraints as Fastify, with binding
 * identities in its native store for offline overlap and method-miss probes.
 */
export function createNativeRouter() {
  const router = Router(portalRouterOptions);
  router.addConstraintStrategy(nonemptyPathConstraint());
  return router;
}

/** Native Fastify construction, without listening or running application factories.
 * Raw-path preparation must precede routing; installing a later hook cannot do it.
 */
export function createPortalRouter(
  options: Omit<FastifyServerOptions, 'routerOptions' | 'rewriteUrl' | 'querystringParser'> = {}
): FastifyInstance {
  const app = fastify({
    ...options,
    routerOptions: portalRouterOptions,
    rewriteUrl: request => routerUrl(request.url ?? '/'),
  });
  app.addConstraintStrategy(nonemptyPathConstraint());
  app.addHook('onRequest', (request, _reply, done) => {
    // Fastify retains the original before rewriteUrl. Restore it for guards,
    // actions, redirects and not-found handling, including malformed captures.
    const original: unknown = Reflect.get(request.raw, 'originalUrl');
    if (typeof original === 'string') request.raw.url = original;
    done();
  });
  configuredRouters.add(app);
  return app;
}

export function assertPortalRouter(app: FastifyInstance): void {
  const config = app.initialConfig.routerOptions ?? app.initialConfig;
  for (const [key, value] of Object.entries(portalRouterOptions))
    if (Reflect.get(config, key) !== value)
      throw new ExtensionError('host', `Fastify router option ${key} must match route composition`);
  if (!configuredRouters.has(app))
    throw new ExtensionError('host', 'Fastify raw path matching requires createPortalRouter');
}
