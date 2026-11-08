import type { FastifyRequest } from 'fastify';
import { ExtensionError } from '../../extensions/loading';
import type { ResolvedRegistration } from '../../extensions/resolution';
import type { HttpFallbackContribution } from '../contracts';
import type { RouteComposition, ResolvedHttpRoute, RouteBinding } from './routes';
import { validateAccess } from './routes';
import { selectHttpContributions } from './hooks';
import { requestPathname } from './router';
import { HttpRouteRegistry } from './registry';

const literal = (value: unknown): value is string =>
  typeof value === 'string' &&
  (value === '/' || /^\/(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*)(?:\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$/.test(value)) &&
  !value.split('/').some(part => part === '.' || part === '..');
const contains = (prefix: string, path: string) => prefix === '/' || path === prefix || path.startsWith(prefix + '/');
const fail = (provider: string, message: string): never => {
  throw new ExtensionError(provider, message);
};

/** Fallback is a named security-bearing target, never a wildcard route that can shadow a host owner. */
export function composeHttpFallbacks(
  registrations: readonly ResolvedRegistration<HttpFallbackContribution>[],
  plan: RouteComposition,
  options: { readonly policyNames: readonly string[]; readonly rootContext?: string },
  registry = new HttpRouteRegistry(options.rootContext)
) {
  const root = options.rootContext ?? '';
  for (const { provider, declaration } of registrations) {
    if (!declaration || !literal(declaration.prefix)) fail(provider, 'fallback requires a literal segment prefix');
    if (!declaration.controller || !declaration.action) fail(provider, 'fallback requires controller/action');
    if (declaration.csrf !== undefined && typeof declaration.csrf !== 'boolean')
      fail(provider, 'invalid fallback csrf');
    if (
      Object.keys(declaration).some(
        key => !['name', 'prefix', 'controller', 'action', 'access', 'csrf', 'replaces', 'context'].includes(key)
      )
    )
      fail(provider, 'unknown fallback field');
    const context = declaration.context;
    if (
      context &&
      (!/^[A-Za-z0-9_-]{1,100}$/.test(context.branding) ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(context.portal) ||
        Object.keys(context).some(key => !['branding', 'portal'].includes(key)))
    )
      fail(provider, 'invalid fallback context');
    // Validate losing declarations too, without executing policies or actions.
    validateAccess(
      { provider, declaration: { ...declaration, path: declaration.prefix, method: 'all' } },
      new Set(options.policyNames)
    );
  }
  const selected = selectHttpContributions(registrations, 'fallback');
  const prefixes = new Set<string>();
  const routes = selected.map(({ provider, declaration }): ResolvedHttpRoute => {
    plan.targets.declare(provider, declaration.name, 'fallback');
    const prefix = (root + (declaration.prefix === '/' ? '' : declaration.prefix) || '/').toLowerCase();
    if (prefixes.has(prefix)) fail(provider, 'equal fallback prefixes require explicit named replacement');
    prefixes.add(prefix);
    return {
      provider,
      declaration: { ...declaration, path: declaration.prefix, method: 'all' },
      paths: [],
      effectivePolicies: validateAccess(
        { provider, declaration: { ...declaration, path: declaration.prefix, method: 'all' } },
        new Set(options.policyNames)
      ),
    };
  });
  const entries = routes
    .map((route, index) => ({
      route,
      prefix: (
        root + (selected[index].declaration.prefix === '/' ? '' : selected[index].declaration.prefix) || '/'
      ).toLowerCase(),
      context: selected[index].declaration.context && Object.freeze({ ...selected[index].declaration.context }),
    }))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  return {
    routes,
    select(
      request: FastifyRequest
    ): { binding: RouteBinding; context?: HttpFallbackContribution['context'] } | undefined {
      const raw = requestPathname(request.raw.url ?? '/');
      // No URI normalization can turn a protected root/method miss into a fallback.
      // Unmatched encodings/dot/empty segments are deliberately fail-closed.
      if (
        !raw ||
        !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) ||
        /[%\\\x00-\x20\x7f]/.test(raw) ||
        raw.includes('//') ||
        raw.split('/').some(part => part === '.' || part === '..')
      )
        return;
      const path = raw.replace(/\/$/, '').toLowerCase() || '/';
      if (
        registry.protects(raw) ||
        // callNotFound on an existing handler must not redispatch to a fallback.
        (request.routeOptions.url &&
          (request.routeOptions.config as { redboxRoute?: RouteBinding })?.redboxRoute?.kind !== 'automatic-options')
      )
        return;
      const entry = entries.find(item => contains(item.prefix, path));
      if (!entry) return;
      // Params come only from the declared literal scope. Policies still validate
      // brand existence and portal allowlists, then enforce normal authentication/access.
      request.params = entry.context ? { ...entry.context } : {};
      return {
        binding: {
          route: entry.route,
          method: request.method as RouteBinding['method'],
          path: { url: entry.prefix },
          kind: 'action',
        },
        context: entry.context,
      };
    },
  };
}
