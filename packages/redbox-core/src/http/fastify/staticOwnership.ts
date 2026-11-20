import { match } from 'path-to-regexp';
import type { FastifyRequest } from 'fastify';
import type { PoliciesConfig } from '../../config/policies.config';
import type { HttpOwnerDeclaration } from '../ownedRoutes';
import { resolveEffectivePolicies } from '../policyConfiguration';
import {
  coreRouteName,
  expressRuntimePath,
  type ResolvedHttpRoute,
  type RouteBinding,
  type RouteComposition,
} from './routes';
import { coreRoutePrecedence } from './precedence';
import { requestPathname } from './router';

/** Selection metadata, never a second action dispatcher. Every concrete
 * declaration owns its supported methods before static; fallbacks own the
 * after-static phase. Native captures join this same table during preparation. */
export class StaticOwnershipTable {
  private readonly entries: {
    route: ResolvedHttpRoute;
    methods: readonly string[];
    selected: boolean;
    fallsThrough: boolean;
    phase: 'before-static' | 'after-static';
    rawTarget?: boolean;
    canonicalOrigin?: string;
    matches: ReturnType<typeof match>;
  }[];
  constructor(
    declarations: readonly HttpOwnerDeclaration[],
    configuration: PoliciesConfig,
    private readonly root: string,
    selected: RouteComposition,
    readonly fallbacks: readonly ResolvedHttpRoute[]
  ) {
    const rows = new Map<string, (typeof this.entries)[number]>();
    for (const {
      route: source,
      csrf,
      actorRequired,
      headFallsThrough,
      implicitHead,
      rawTarget,
      canonicalOrigin,
      selected: rawSelected,
    } of declarations) {
      const name = coreRouteName(source.method, source.path);
      const policies =
        source.controller && source.action
          ? resolveEffectivePolicies(
              {
                controller: source.controller,
                action: source.action,
                policy: source.policy,
              },
              configuration
            )
          : [];
      const route: ResolvedHttpRoute = selected.routes.find(route => route.declaration.name === name) ?? {
        provider: '@researchdatabox/redbox-core',
        declaration: {
          name,
          method: source.method as ResolvedHttpRoute['declaration']['method'],
          path: source.path,
          controller: source.controller ?? 'Portal',
          action: source.action ?? 'reserved',
          access: policies.includes(false)
            ? { kind: 'deny' }
            : policies.length
              ? { kind: 'policies', names: policies as [string, ...string[]] }
              : { kind: 'public' },
        },
        paths: [],
        effectivePolicies: policies,
        effectiveCsrf: csrf,
      };
      // Requirements of deferred domain handlers are explicit metadata; reduced
      // configured policy chains must not turn their missing actor into static.
      if (actorRequired) this.actorRequirements.add(route);
      rows.set(name, {
        route,
        methods:
          source.method === 'all'
            ? ['*']
            : source.method === 'get' && implicitHead !== false
              ? ['GET', 'HEAD']
              : [source.method.toUpperCase()],
        selected: rawSelected || selected.routes.includes(route),
        phase: 'before-static',
        rawTarget,
        canonicalOrigin,
        fallsThrough: !!headFallsThrough,
        matches: match(root + expressRuntimePath(source.path), {
          decode: false,
          sensitive: !!rawTarget,
          trailing: !rawTarget,
        }),
      });
    }
    for (const route of selected.routes) {
      const previous = rows.get(route.declaration.name);
      const methods = selected.bindings
        .filter(binding => binding.route === route && binding.kind !== 'automatic-options')
        .map(binding => binding.method);
      rows.set(route.declaration.name, {
        route,
        methods: previous?.fallsThrough ? [...new Set([...methods, 'HEAD'])] : methods,
        selected: true,
        phase: 'before-static',
        fallsThrough: previous?.fallsThrough ?? false,
        matches: match(root + expressRuntimePath(route.declaration.path), { decode: false, sensitive: false }),
      });
    }
    const remaining = [...rows.values()];
    this.entries = [];
    while (remaining.length) {
      const index = remaining.findIndex(
        row =>
          !coreRoutePrecedence.some(
            edge =>
              edge.over === row.route.declaration.name &&
              remaining.some(other => other.route.declaration.name === edge.winner)
          )
      );
      if (index < 0) throw new TypeError('Static ownership precedence contains a cycle.');
      this.entries.push(...remaining.splice(index, 1));
    }
    // An explicit HEAD route precedes a GET's inferred HEAD, as in Express.
    this.entries.sort(
      (a, b) => Number(b.route.declaration.method === 'head') - Number(a.route.declaration.method === 'head')
    );
    for (const route of fallbacks)
      this.entries.push({
        route,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        selected: true,
        fallsThrough: false,
        phase: 'after-static',
        matches: match(this.root + (route.declaration.path === '/' ? '' : route.declaration.path) + '{/*tail}', {
          decode: false,
          sensitive: false,
        }),
      });
  }
  private readonly actorRequirements = new Set<ResolvedHttpRoute>();
  snapshot() {
    return this.entries.map(entry => ({
      name: entry.route.declaration.name,
      method: entry.route.declaration.method,
      path: entry.route.declaration.path,
      methods: [...entry.methods],
      phase: entry.phase,
      selected: entry.selected,
      policies: [...entry.route.effectivePolicies],
      csrf: entry.route.effectiveCsrf,
      headFallsThrough: entry.fallsThrough,
      canonicalOrigin: entry.canonicalOrigin,
    }));
  }
  requiresActor(route: ResolvedHttpRoute) {
    return this.actorRequirements.has(route);
  }
  get routes() {
    return this.entries.filter(entry => entry.phase === 'before-static').map(entry => entry.route);
  }
  captureNative(name: string, method: string, path: string) {
    const route: ResolvedHttpRoute = {
      provider: '@researchdatabox/redbox-core',
      declaration: {
        name,
        method: method.toLowerCase() as ResolvedHttpRoute['declaration']['method'],
        path,
        controller: 'Portal',
        action: 'native',
        access: { kind: 'public' },
      },
      effectivePolicies: [],
      effectiveCsrf: 'none',
      paths: [],
    };
    for (const entry of this.entries)
      if (
        entry.route.declaration.action !== 'native' &&
        entry.phase === 'before-static' &&
        this.root + expressRuntimePath(entry.route.declaration.path).replace(/\/\*[\w]+$/, '/*') === path
      )
        entry.selected = true;
    // Native registrations have already passed the sealed core boundary. Their
    // own router still executes the handler; this records only static ownership.
    this.entries.unshift({
      route,
      methods: [method],
      selected: true,
      fallsThrough: false,
      phase: 'before-static',
      matches: match(path.replace(/\/\*$/, '{/*nativeTail}'), { decode: false, sensitive: false }),
    });
  }
  hasFallback(request: FastifyRequest) {
    const path = requestPathname(request.raw.url ?? '/');
    return !!path && this.find(request.method, path, 'after-static').length > 0;
  }
  implicitHead(path: string): boolean {
    const get = this.find('GET', path)[0],
      head = this.find('HEAD', path)[0];
    return !!get && get.entry === head?.entry;
  }
  private find(
    method: string,
    path: string,
    phase: 'before-static' | 'after-static' = 'before-static',
    rawTarget = path
  ) {
    return this.entries.flatMap(entry => {
      if (entry.phase !== phase) return [];
      // Raw Socket.IO/upgrade listeners inspect the original target before the
      // Express mount/router. Absolute-form targets fall through those listeners.
      if (entry.rawTarget && !rawTarget.startsWith('/')) return [];
      if (!entry.methods.includes('*') && !entry.methods.includes(method)) return [];
      const matched = entry.matches(path);
      return matched ? [{ entry, params: matched.params }] : [];
    });
  }
  select(request: FastifyRequest) {
    const path = requestPathname(request.raw.url ?? '/');
    if (!path) return [];
    return this.find(request.method, path, 'before-static', request.raw.url ?? '/').map(({ entry, params }) => ({
      binding: {
        route: entry.route,
        method: request.method as RouteBinding['method'],
        path: { url: this.root + entry.route.declaration.path },
        kind: 'action' as const,
      },
      selected: entry.selected,
      canonicalOrigin: entry.canonicalOrigin,
      fallsThrough: request.method === 'HEAD' && entry.fallsThrough,
      params: Object.fromEntries(
        Object.entries(params).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.map(decodeURIComponent).join('/') : decodeURIComponent(value ?? ''),
        ])
      ),
    }));
  }
}
