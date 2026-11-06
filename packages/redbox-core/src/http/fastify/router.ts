import fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import qs from 'qs';
import Router from 'find-my-way';
import { ExtensionError } from '../../extensions/loading';
import { parse as parseUrl } from 'node:url';
import { STATUS_CODES } from 'node:http';

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

/** Express/parseurl's origin-form fast path and Node URL fallback. Keep raw
 * escapes, duplicate slashes and dot segments; WHATWG URL would normalize paths.
 * Absolute-form targets and fragments must have the same path for routing and
 * admission. The original target is restored before request hooks run below.
 */
function requestTargetPath(url: string): string | undefined {
  if (url.startsWith('/') && !/[#\t\n\f\r \u00a0\ufeff]/.test(url)) return url;
  try {
    return parseUrl(url).path ?? url;
  } catch {
    // rewriteUrl and synchronous constraint derivation run before Fastify's
    // request error boundary. A malformed authority/userinfo must not escape.
    return undefined;
  }
}

export function requestPathname(url: string): string | undefined {
  return requestTargetPath(url)?.split('?')[0];
}

/** Keep escapes literal through find-my-way's eager URI decoding. Only captures
 * are decoded later, once, after raw static/suffix matching, as Express does.
 * The query string must remain byte-for-byte unchanged for qs's tolerant decoder.
 */
export function routerUrl(url: string): string {
  // Enter the normal request hooks on parse failure, where the first root hook
  // responds before admission, plugin hooks or the selected action can run.
  const target = requestTargetPath(url) ?? '/';
  const query = target.indexOf('?');
  const end = query < 0 ? target.length : query;
  return target.slice(0, end).replaceAll('%', '%25') + target.slice(end);
}

/** A required wildcard cannot capture the root route's separator. This native
 * constraint keeps '/' distinct from '//', which trailing-slash trimming would
 * otherwise collapse before wildcard lookup. Public findRoute probes must pass
 * the same derived value as real HTTP lookup.
 */
export function routerConstraints(url: string) {
  return { redboxNonemptyPath: requestPathname(url) !== '/' ? 'nonempty' : 'empty' };
}

const configuredRouters = new WeakSet<object>();

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
  options: Omit<
    FastifyServerOptions,
    'routerOptions' | 'rewriteUrl' | 'querystringParser' | 'frameworkErrors' | 'clientErrorHandler'
  > = {}
): FastifyInstance {
  const app = fastify({
    ...options,
    routerOptions: portalRouterOptions,
    rewriteUrl: request => routerUrl(request.url ?? '/'),
    // These callbacks also run outside the request hook/error-handler boundary.
    // Emit only fixed headers and bounded bodies, never the target/provider error.
    frameworkErrors(error, _request, reply) {
      const status = error.code === 'FST_ERR_BAD_URL' ? 400 : error.code === 'FST_ERR_MAX_PARAM_LENGTH' ? 414 : 500;
      const body = status === 500 ? '{"error":"internal-server-error"}' : '{"error":"invalid-request"}';
      reply.hijack();
      reply.raw.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      });
      reply.raw.end(body);
    },
    clientErrorHandler(error, socket) {
      // Match Node's default HTTP/1 parser responses used by ExpressHost. Node's
      // socketOnError installs its error sink before emitting clientError.
      const status =
        error.code === 'HPE_HEADER_OVERFLOW'
          ? 431
          : error.code === 'HPE_CHUNK_EXTENSIONS_OVERFLOW'
            ? 413
            : error.code === 'ERR_HTTP_REQUEST_TIMEOUT'
              ? 408
              : 400;
      const response: unknown = Reflect.get(socket, '_httpMessage');
      if (
        !socket.destroyed &&
        socket.writable &&
        (!response || (typeof response === 'object' && !Reflect.get(response, '_headerSent')))
      )
        socket.write(`HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    },
  });
  app.addConstraintStrategy(nonemptyPathConstraint());
  app.addHook('onRequest', (request, reply, done) => {
    // Fastify retains the original before rewriteUrl. Restore it for guards,
    // actions, redirects and not-found handling, including malformed captures.
    const original: unknown = Reflect.get(request.raw, 'originalUrl');
    if (typeof original === 'string') request.raw.url = original;
    if (requestPathname(request.raw.url ?? '/') === undefined) {
      // Express's finalhandler uses this fixed resource name when parseurl fails.
      // Node validates/bounds the method; no raw target or exception is reflected.
      const body = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot ${request.method} resource</pre>\n</body>\n</html>\n`;
      reply
        .code(404)
        .header('Content-Security-Policy', "default-src 'none'")
        .header('X-Content-Type-Options', 'nosniff')
        .type('text/html; charset=utf-8')
        .send(body);
      return;
    }
    done();
  });
  configuredRouters.add(app);
  return app;
}

/** Register a sealed core view without exposing an unwrap capability. @internal */
export function registerPortalRouterView(source: object, view: object): void {
  let ancestor: object | null = source;
  while (ancestor && !configuredRouters.has(ancestor)) ancestor = Object.getPrototypeOf(ancestor);
  if (!ancestor) throw new TypeError('Expected the core portal router.');
  configuredRouters.add(view);
}

export function assertPortalRouter(app: Pick<FastifyInstance, 'initialConfig'>): void {
  const config = app.initialConfig.routerOptions ?? app.initialConfig;
  for (const [key, value] of Object.entries(portalRouterOptions))
    if (Reflect.get(config, key) !== value)
      throw new ExtensionError('host', `Fastify router option ${key} must match route composition`);
  if (!configuredRouters.has(app))
    throw new ExtensionError('host', 'Fastify raw path matching requires createPortalRouter');
}
