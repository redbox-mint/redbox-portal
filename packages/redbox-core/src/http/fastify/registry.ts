import type { FastifyReply, FastifyRequest, RouteOptions } from 'fastify';
import type { HTTPMethod } from 'find-my-way';
import { coreHttpNamespaces } from './coreNamespaces';
import { createNativeRouter, routerConstraints, routerUrl } from './router';
import type { RouteBinding } from './routes';
import { httpReplySubmitted } from './errorBoundary';
import { resolveCompanionConfiguration } from '../../config/companionDefaults';
import { requestStageHook } from './hooks';
import { HttpTargetNamespace, nativeHttpTarget } from './targetNames';
import type { StaticOwnershipTable } from './staticOwnership';

export interface RegisteredHttpRoute {
  readonly name: string;
  readonly method: string;
  readonly path: string;
  readonly kind: 'declarative' | 'native' | 'automatic-options';
}
interface RoutePipeline {
  unmatched?(request: FastifyRequest, reply: FastifyReply): Promise<unknown>;
  afterAuthentication(
    route: RegisteredHttpRoute,
    binding: RouteBinding | undefined,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<unknown>;
  beforeAction(
    route: RegisteredHttpRoute,
    binding: RouteBinding | undefined,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<unknown>;
}
interface RouteBoundary {
  readonly entry: RegisteredHttpRoute;
  readonly binding?: RouteBinding;
  readonly normalize?: (request: FastifyRequest, reply: FastifyReply) => unknown;
}
// A primitive token survives Fastify's config copy and the detached metadata view.
// Executable boundaries stay private; callers see no callback/router capability.
const registrationKey = 'redboxHttpRegistration';
const companionDefaults = resolveCompanionConfiguration({}, () => {});
export interface CoreNamespaceConfiguration {
  readonly companion?: { readonly route: string; readonly server: { readonly path: string } };
}
const pathPattern = /^\/(?:[A-Za-z0-9_.-]+|:[A-Za-z_][A-Za-z0-9_]*)(?:\/(?:[A-Za-z0-9_.-]+|:[A-Za-z_][A-Za-z0-9_]*))*$/;
const validPrefix = (path: string) =>
  (path === '/' || pathPattern.test(path)) && !path.split('/').some(p => p === '.' || p === '..');
const effectivePath = (path: string, configuration: CoreNamespaceConfiguration) =>
  path
    .replace('${companion.route}', configuration.companion?.route ?? companionDefaults.route)
    .replace('${companion.server.path}', configuration.companion?.server.path ?? companionDefaults.server.path);
/** Complete core supplier, including unported FM-002 surfaces and actual static asset namespaces. */
export function coreFallbackReservedPrefixes(configuration: CoreNamespaceConfiguration = {}): readonly string[] {
  return Object.freeze([
    ...new Set(
      coreHttpNamespaces
        .filter(entry => !entry.global && entry.kind === 'namespace')
        .map(entry => effectivePath(entry.path, configuration))
    ),
  ]);
}

/** One host-owned registry. No routes, callbacks, Fastify objects or probe results escape its snapshots. */
export class HttpRouteRegistry {
  ownership?: StaticOwnershipTable;
  private readonly routes: RegisteredHttpRoute[] = [];
  private readonly paths = createNativeRouter();
  private readonly methods = new Set<string>();
  private lookup?: (method: string, path: string) => boolean;
  private pipeline?: RoutePipeline;
  private readonly boundaries = new Map<symbol, readonly RouteBoundary[]>();
  private readonly reservations: {
    readonly path: string;
    readonly kind: 'path' | 'namespace' | 'pattern';
    readonly matches: RegExp;
  }[] = [];

  constructor(
    rootContext = '',
    reservedPrefixes: readonly string[] | undefined = undefined,
    configuration: CoreNamespaceConfiguration = {},
    private readonly targets = new HttpTargetNamespace()
  ) {
    reservedPrefixes ??= coreFallbackReservedPrefixes(configuration);
    if (
      !Array.isArray(reservedPrefixes) ||
      reservedPrefixes.some(path => typeof path !== 'string' || !validPrefix(path))
    )
      throw new TypeError('Invalid reserved host prefixes');
    const supplied = new Set(reservedPrefixes.map(path => path.toLowerCase()));
    for (const required of coreFallbackReservedPrefixes(configuration))
      if (!supplied.has(required.toLowerCase()))
        throw new TypeError('Missing FM-002 namespace reservation: ' + required);
    for (const entry of coreHttpNamespaces) {
      if (entry.kind === 'pattern') {
        this.reservations.push(
          Object.freeze({
            path: rootContext + entry.path,
            kind: 'pattern',
            matches: new RegExp('^' + rootContext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + entry.pattern + '/?$', 'i'),
          })
        );
        continue;
      }
      this.reserve(
        (entry.global ? '' : rootContext) +
          (effectivePath(entry.path, configuration) === '/' ? '' : effectivePath(entry.path, configuration)) || '/',
        entry.kind
      );
    }
    for (const path of reservedPrefixes) this.reserve(rootContext + (path === '/' ? '' : path) || '/', 'namespace');
  }
  private reserve(path: string, kind: 'path' | 'namespace') {
    if (this.reservations.some(entry => entry.path.toLowerCase() === path.toLowerCase() && entry.kind === kind)) return;
    if (!validPrefix(path)) throw new TypeError('Invalid core namespace reservation: ' + path);
    const expression = path
      .split('/')
      .map(part => (part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('/');
    this.reservations.push(
      Object.freeze({
        path,
        kind,
        matches: new RegExp('^' + expression + (kind === 'namespace' ? '(?:/|$)' : '/?$'), 'i'),
      })
    );
  }
  probe(name: 'healthz' | 'readyz'): string {
    const entry = coreHttpNamespaces.find(entry => entry.global && entry.path === '/' + name);
    if (!entry) throw new TypeError('Missing FM-002 host probe: ' + name);
    return entry.path;
  }
  bindLookup(lookup: (method: string, path: string) => boolean) {
    this.lookup = lookup;
  }
  bindPipeline(pipeline: RoutePipeline) {
    this.pipeline = pipeline;
  }
  snapshot(): readonly RegisteredHttpRoute[] {
    return Object.freeze([...this.routes]);
  }
  namespaces() {
    return Object.freeze(this.reservations.map(({ path, kind }) => Object.freeze({ path, kind })));
  }
  protects(path: string): boolean {
    if (this.reservations.some(entry => entry.matches.test(path))) return true;
    if (!this.lookup) throw new TypeError('HTTP route registry is not bound to its native router');
    // The synthetic OPTIONS wildcard is never evidence of a real matching route.
    // Actual paths must also match the live router. Derived wildcard mount roots
    // stay reserved even when the wildcard does not match its own missing base.
    for (const method of this.methods) {
      const match = this.paths.find(method as HTTPMethod, routerUrl(path), routerConstraints(path));
      if (match && (match.store?.mountRoot || this.lookup(method, path))) return true;
    }
    return false;
  }
  routeName(request: FastifyRequest): string | undefined {
    return this.boundary(request)?.entry.name;
  }
  private boundary(request: FastifyRequest): RouteBoundary | undefined {
    const identity = (request.routeOptions.config as { [registrationKey]?: unknown })[registrationKey];
    return typeof identity === 'symbol'
      ? this.boundaries.get(identity)?.find(boundary => boundary.entry.method === request.method)
      : undefined;
  }
  afterAuthentication(request: FastifyRequest, reply: FastifyReply) {
    return this.pipeline && this.enter(this.pipeline, request, reply);
  }
  private async enter(pipeline: RoutePipeline, request: FastifyRequest, reply: FastifyReply) {
    const boundary = this.boundary(request);
    if (!boundary) {
      await pipeline.unmatched?.(request, reply);
      if (httpReplySubmitted(reply)) return reply;
      return;
    }
    await boundary.normalize?.(request, reply);
    if (httpReplySubmitted(reply)) return reply;
    await pipeline.afterAuthentication(boundary.entry, boundary.binding, request, reply);
    if (httpReplySubmitted(reply)) return reply;
  }
  capture(options: RouteOptions): void {
    const binding = (options.config as { redboxRoute?: RouteBinding } | undefined)?.redboxRoute;
    const methods = Array.isArray(options.method) ? options.method : [options.method];
    const entries = methods.map(method =>
      Object.freeze({
        name: binding?.route.declaration.name ?? nativeHttpTarget(String(method), options.url, options.constraints),
        method: String(method).toUpperCase(),
        path: options.url,
        kind:
          binding?.kind === 'automatic-options'
            ? ('automatic-options' as const)
            : binding
              ? ('declarative' as const)
              : ('native' as const),
      })
    );
    for (const entry of entries) {
      if (entry.kind === 'native') this.targets.internal(entry.name);
      else {
        // Low-level hosts can install an already-composed route plan without a
        // scoped pipeline. Full controller/API2 hosts share the offline namespace.
        if (!this.pipeline && entry.kind === 'declarative' && !this.targets.hookTarget(entry.name))
          this.targets.declare(binding!.route.provider, entry.name, 'route');
        this.targets.reference(entry.name);
      }
      this.routes.push(entry);
      if (entry.kind === 'native') this.ownership?.captureNative(entry.name, entry.method, entry.path);
      if (entry.kind !== 'automatic-options') {
        this.methods.add(entry.method);
        const index = (path: string, mountRoot = false) => {
          if (!this.paths.hasRoute(entry.method as HTTPMethod, path, options.constraints))
            this.paths.on(entry.method as HTTPMethod, path, { constraints: options.constraints }, () => {}, {
              mountRoot,
            });
        };
        index(entry.path);
        if (entry.kind === 'native' && entry.path.endsWith('/*')) index(entry.path.slice(0, -2) || '/', true);
      }
    }
    if (!this.pipeline) return;
    const existing = options.preHandler
      ? Array.isArray(options.preHandler)
        ? [...options.preHandler]
        : [options.preHandler]
      : [];
    // The declarative binder supplies normalization separately from its guard chain.
    // Native routes have ordinary preHandlers. Both share these same stage boundaries.
    const normalization = binding ? existing.shift() : undefined;
    if (binding && !normalization) throw new TypeError('Declarative route lacks its normalization boundary');
    const pipeline = this.pipeline;
    const identity = Symbol();
    options.config = { ...options.config, [registrationKey]: identity };
    this.boundaries.set(
      identity,
      Object.freeze(
        entries.map(entry =>
          Object.freeze({
            entry,
            binding,
            normalize: normalization
              ? (request: FastifyRequest, reply: FastifyReply) =>
                  Reflect.apply(normalization, undefined, [request, reply])
              : undefined,
          })
        )
      )
    );
    options.preHandler = [
      ...existing,
      requestStageHook((request, reply) => {
        const entry = entries.find(route => route.method === request.method)!;
        return pipeline.beforeAction(entry, binding, request, reply);
      }),
    ];
  }
}
