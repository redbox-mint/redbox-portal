import type { Server } from 'node:http';
import type {
  FastifyInstance,
  FastifyServerOptions,
  FastifyReply,
  FastifyRequest,
  FastifyContentTypeParser,
  RouteHandlerMethod,
  RouteOptions,
  RouteShorthandOptions,
} from 'fastify';
import type { HookLookup } from 'fastify/types/hooks';
import cookiePlugin, { type FastifyCookieOptions } from '@fastify/cookie';
import sessionPlugin from '@fastify/session';
import {
  NativeMongoSessionStore,
  nativeSessionSend,
  nativeSessionRequest,
  sessionPeerTrust,
  type NativeSessionOptions,
} from './session';
import { requestHooks, requestOwnership } from './requestOwnership';
import { registerPortalRouterView, routerConstraints, routerUrl } from './router';
import { HttpRouteRegistry } from './registry';
import { requestStageHook } from './hooks';
import { nativeBodyParserPlugin, type NativeParserOptions } from './parsers';

type RequestHook = (typeof requestHooks)[number];
type OwnedHook = RequestHook | 'onReady' | 'preClose' | 'onClose';
type BoundHook<T> = T extends (...args: infer A) => infer R
  ? (
      this: FastifyPreparation,
      ...args: { [K in keyof A]: A[K] extends FastifyInstance ? FastifyPreparation : A[K] }
    ) => R | Promise<unknown>
  : never;
type SafeOptions = Omit<
  RouteShorthandOptions,
  'validatorCompiler' | 'serializerCompiler' | 'schemaErrorFormatter' | 'childLoggerFactory' | 'logSerializers'
>;
interface Shorthand {
  (path: string, handler: RouteHandlerMethod): FastifyPreparation;
  (path: string, options: SafeOptions, handler: RouteHandlerMethod): FastifyPreparation;
}
type CorePlugin = (
  this: FastifyPreparation,
  app: FastifyPreparation,
  options: { prefix?: string },
  done: (error?: Error) => void
) => void | Promise<void>;

/** Core composition only. Extensions use FM-009 bindings / FM-010 declarations,
 * never this facade or the underlying Fastify instance. @internal */
export interface FastifyPreparation {
  readonly server: Server;
  readonly initialConfig: Readonly<FastifyInstance['initialConfig']>;
  readonly supportedMethods: readonly string[];
  register(plugin: CorePlugin, options?: { prefix?: string }): FastifyPreparation;
  register(plugin: typeof cookiePlugin, options?: FastifyCookieOptions): FastifyPreparation;
  register(plugin: typeof sessionPlugin, options: NativeSessionOptions): FastifyPreparation;
  register(plugin: typeof nativeBodyParserPlugin, options: NativeParserOptions): FastifyPreparation;
  addHook<K extends OwnedHook>(name: K, hook: BoundHook<HookLookup<K>>): FastifyPreparation;
  route(
    options: Omit<
      RouteOptions,
      'validatorCompiler' | 'serializerCompiler' | 'schemaErrorFormatter' | 'childLoggerFactory' | 'logSerializers'
    >
  ): FastifyPreparation;
  get: Shorthand;
  post: Shorthand;
  setNotFoundHandler(handler: RouteHandlerMethod): FastifyPreparation;
  setNotFoundHandler(
    options: Pick<SafeOptions, 'preValidation' | 'preHandler'>,
    handler: RouteHandlerMethod
  ): FastifyPreparation;
  setErrorHandler(
    handler: (this: FastifyPreparation, error: Error, request: FastifyRequest, reply: FastifyReply) => unknown
  ): FastifyPreparation;
  addContentTypeParser(contentType: string | string[] | RegExp, parser: FastifyContentTypeParser): FastifyPreparation;
  addContentTypeParser(...args: Parameters<FastifyInstance['addContentTypeParser']>): FastifyPreparation;
  addHttpMethod(...args: Parameters<FastifyInstance['addHttpMethod']>): FastifyPreparation;
}

const routeKeys = new Set([
  'method',
  'url',
  'path',
  'handler',
  'schema',
  'attachValidation',
  'exposeHeadRoute',
  'bodyLimit',
  'handlerTimeout',
  'logLevel',
  'config',
  'constraints',
  'prefixTrailingSlash',
  'errorHandler',
  ...requestHooks,
]);
function denied(surface: PropertyKey): never {
  throw new TypeError(
    `Fastify preparation rejects ${String(surface)}: use documented core registration/routes/hook stages; this API has no qualified ownership contract.`
  );
}
function keys(value: object, allowed: ReadonlySet<string>, surface: string) {
  for (const key of Reflect.ownKeys(value))
    if (typeof key !== 'string' || !allowed.has(key)) denied(`${surface}.${String(key)}`);
}

/** Closed capability boundary: no forwarding proxy, raw prototype, descriptors,
 * fluent return, plugin argument, hook receiver or request.server escape. */
export function sealPreparation(
  app: FastifyInstance,
  ownership: ReturnType<typeof requestOwnership>,
  trustProxy?: FastifyServerOptions['trustProxy'],
  registry = new HttpRouteRegistry()
): FastifyPreparation {
  const trust = sessionPeerTrust(trustProxy);
  const views = new WeakMap<object, FastifyPreparation>();
  const receiver = (value: unknown) => (value && typeof value === 'object' ? (views.get(value) ?? value) : value);
  ownership.bindPreparation(receiver);
  // No prepared onRoute is permitted. This final core hook runs after native
  // normalization, wraps executable fields and freezes the private route snapshot.
  registry.bindLookup(
    (method, path) =>
      !!app.findRoute({
        method: method as import('fastify').HTTPMethods,
        url: routerUrl(path),
        constraints: routerConstraints(path),
      })
  );
  app.addHook('onRoute', options => {
    registry.capture(options);
    ownership.hooks(options as unknown as Record<string, unknown>);
    options.handler = ownership.handler(options.handler);
    for (const name of requestHooks) if (Array.isArray(options[name])) Object.freeze(options[name]);
    Object.freeze(options);
  });
  // First preHandler on the root: after every parsing/authentication preValidation,
  // before inherited core policy/CSRF hooks and route-local guard/validation hooks.
  app.addHook(
    'preHandler',
    ownership.hook(
      'preHandler',
      requestStageHook((request, reply) => registry.afterAuthentication(request, reply))
    ) as never
  );
  function view(instance: FastifyInstance): FastifyPreparation {
    const previous = views.get(instance);
    if (previous) return previous;
    const target = Object.create(null) as Record<string, unknown>;
    const facade = new Proxy(target, {
      get(object, key) {
        // A facade is deliberately not Avvio's thenable (which resolves raw app).
        if (key === 'then') return undefined;
        if (Object.hasOwn(object, key)) return Reflect.get(object, key);
        return denied(key);
      },
      set: (_target, key) => denied(key),
      defineProperty: (_target, key) => denied(key),
      deleteProperty: (_target, key) => denied(key),
      setPrototypeOf: () => denied('__proto__'),
    }) as unknown as FastifyPreparation;
    views.set(instance, facade);
    ownership.preserve(facade);
    const call = (name: string, args: unknown[]) => {
      Reflect.apply(Reflect.get(instance, name), instance, args);
      return facade;
    };
    Object.assign(target, {
      server: instance.server,
      initialConfig: Object.freeze({
        ...instance.initialConfig,
        routerOptions: Object.freeze({ ...instance.initialConfig.routerOptions }),
      }),
      register(
        plugin: CorePlugin | typeof cookiePlugin | typeof sessionPlugin | typeof nativeBodyParserPlugin,
        options: Record<string, unknown> = {}
      ) {
        if (typeof plugin !== 'function') denied('register(non-function)');
        if (!options || typeof options !== 'object') denied('register options');
        const native = plugin === cookiePlugin || plugin === sessionPlugin || plugin === nativeBodyParserPlugin;
        keys(
          options,
          new Set(
            plugin === cookiePlugin
              ? ['secret', 'parseOptions', 'hook', 'algorithm']
              : plugin === nativeBodyParserPlugin
                ? ['parserExclusions']
                : plugin === sessionPlugin
                  ? [
                      'secret',
                      'cookieName',
                      'cookiePrefix',
                      'cookie',
                      'store',
                      'saveUninitialized',
                      'rolling',
                      'resave',
                      'proxy',
                    ]
                  : ['prefix']
          ),
          'register options'
        );
        if (plugin === sessionPlugin && !(options.store instanceof NativeMongoSessionStore)) denied('session store');
        const wrapped = new Proxy(plugin, {
          apply(fn, _this, args) {
            if (plugin === nativeBodyParserPlugin) {
              const child = args[0] as FastifyInstance;
              // This exact parser may consume the incoming stream. No native
              // instance, decoration or registration capability reaches callers.
              return Reflect.apply(fn, undefined, [
                {
                  addHook(name: string, hook: unknown) {
                    if (name !== 'preParsing') denied(`native parser addHook(${name})`);
                    child.addHook('preParsing', ownership.nativeHook('preParsing', hook) as never);
                  },
                },
                args[1],
              ]);
            }
            if (native) {
              const child = args[0] as FastifyInstance;
              // Exact pinned framework plugins only. Decoration is synchronous;
              // request hooks use the same leases/contexts as application hooks,
              // with an identified native handoff for Fastify's private Symbols.
              // No generic decorate capability or raw instance leaves this adapter.
              const qualified = Object.freeze(
                Object.assign(Object.create(null), {
                  parseCookie: (...values: Parameters<FastifyInstance['parseCookie']>) => child.parseCookie(...values),
                  decorate: child.decorate.bind(child),
                  decorateRequest: child.decorateRequest.bind(child),
                  decorateReply: child.decorateReply.bind(child),
                  // Qualified native factory only: invalid empty credentials take
                  // the pinned synchronous construction branch, with no store I/O.
                  // Its caller is an owned Session regenerate operation; the raw
                  // decorator never reaches application preparation/request views.
                  decryptSession: (
                    id: string,
                    request: FastifyRequest,
                    cookie: NonNullable<NativeSessionOptions['cookie']>,
                    done: (error?: Error) => void
                  ) => child.decryptSession(id, request, cookie, done),
                  addHook(name: string, hook: unknown) {
                    if (!['onRequest', 'onSend', 'preParsing', 'preValidation', 'preHandler'].includes(name))
                      denied(`native addHook(${name})`);
                    const owned =
                      plugin === sessionPlugin && name === 'onSend'
                        ? nativeSessionSend(options as unknown as NativeSessionOptions, trust)
                        : plugin === sessionPlugin && name === 'onRequest'
                          ? nativeSessionRequest(
                              options as unknown as NativeSessionOptions,
                              hook as never,
                              trust,
                              (request, cookie, done) => qualified.decryptSession('', request, cookie, done)
                            )
                          : hook;
                    // Bounded parsing must finish before any session read. The
                    // authentication preValidation hook is registered afterwards.
                    const stage = plugin === sessionPlugin && name === 'onRequest' ? 'preValidation' : name;
                    child.addHook(stage as RequestHook, ownership.nativeHook(stage, owned) as never);
                  },
                })
              );
              return Reflect.apply(fn, qualified, [qualified, args[1], args[2]]);
            }
            const child = view(args[0]);
            return Reflect.apply(fn, child, [child, args[1], args[2]]);
          },
        });
        return call('register', [wrapped, { ...options }]);
      },
      addHook(name: string, hook: unknown) {
        if ((requestHooks as readonly string[]).includes(name))
          return call('addHook', [name, ownership.hook(name, hook)]);
        if (!['onReady', 'preClose', 'onClose'].includes(name)) denied(`addHook(${name})`);
        if (typeof hook !== 'function') return call('addHook', [name, hook]);
        return call('addHook', [
          name,
          new Proxy(hook, {
            apply(fn, _this, args) {
              if (name === 'onClose') args[0] = facade;
              return Reflect.apply(fn, facade, args);
            },
          }),
        ]);
      },
      route(options: Record<string, unknown>) {
        keys(options, routeKeys, 'route');
        // Clone arrays so neither native method normalization nor caller mutation
        // changes a shared registration after the ownership wrapper runs.
        const snapshot = { ...options };
        if (Array.isArray(snapshot.method)) snapshot.method = [...snapshot.method];
        for (const name of requestHooks) if (Array.isArray(snapshot[name])) snapshot[name] = [...snapshot[name]];
        if (snapshot.constraints) {
          keys(snapshot.constraints as object, new Set(['redboxNonemptyPath']), 'route.constraints');
          snapshot.constraints = Object.freeze({ ...(snapshot.constraints as object) });
        }
        return call('route', [snapshot]);
      },
      setNotFoundHandler(...args: unknown[]) {
        const index = typeof args[0] === 'function' ? 0 : 1;
        if (index) {
          keys(args[0] as object, new Set(['preValidation', 'preHandler']), 'setNotFoundHandler options');
          args[0] = { ...(args[0] as object) };
          ownership.hooks(args[0] as Record<string, unknown>);
        }
        args[index] = ownership.handler(args[index]);
        return call('setNotFoundHandler', args);
      },
      setErrorHandler(handler: unknown) {
        return call('setErrorHandler', [ownership.handler(handler, 1)]);
      },
      addContentTypeParser(...args: unknown[]) {
        const index = typeof args[1] === 'function' ? 1 : 2;
        if (index === 2) keys(args[1] as object, new Set(['parseAs', 'bodyLimit']), 'parser options');
        args[index] = ownership.wrap(args[index], 0, true);
        return call('addContentTypeParser', args);
      },
      addHttpMethod(...args: unknown[]) {
        return call('addHttpMethod', args);
      },
    });
    for (const method of ['get', 'post'])
      target[method] = (url: string, options: unknown, handler?: unknown) =>
        facade.route({
          ...(typeof options === 'function' ? {} : (options as object)),
          method: method.toUpperCase() as 'GET' | 'POST',
          url,
          handler: (typeof options === 'function' ? options : handler) as RouteHandlerMethod,
        });
    Object.defineProperty(target, 'supportedMethods', { get: () => Object.freeze([...instance.supportedMethods]) });
    Object.freeze(target);
    registerPortalRouterView(instance, facade);
    return facade;
  }
  return view(app);
}
