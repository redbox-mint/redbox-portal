import path from 'node:path';
import { parse, pathToRegexp, TokenData, type Token } from 'path-to-regexp';
import type { RedboxExtension, ExtensionFactory, ExtensionRoute, ExtensionWork } from './contract';
import { discoverInstalledExtensions, extensionRegistration, ExtensionError, loadExtensionModule } from './loading';

export interface ExtensionProvider {
  readonly name: string;
  readonly root: string;
  readonly declaration: RedboxExtension;
}
export interface ResolvedRegistration<T> {
  readonly provider: string;
  readonly declaration: T;
}
export interface ResolvedExtensions {
  /** Contributions merge low to high; lookup paths search high to low. */
  readonly providers: readonly ExtensionProvider[];
  readonly modules: readonly ResolvedRegistration<ExtensionFactory>[];
  readonly handlers: readonly ResolvedRegistration<NonNullable<RedboxExtension['handlers']>[number]>[];
  readonly integrations: readonly ResolvedRegistration<NonNullable<RedboxExtension['integrations']>[number]>[];
  readonly routes: readonly ResolvedRegistration<ExtensionRoute>[];
  readonly middleware: readonly ResolvedRegistration<NonNullable<RedboxExtension['middleware']>[number]>[];
  readonly migrations: readonly ResolvedRegistration<ExtensionWork>[];
  readonly bootstrap: readonly ResolvedRegistration<ExtensionWork>[];
  readonly views: readonly string[];
  readonly assets: readonly string[];
}

function fail(provider: string, message: string): never {
  throw new ExtensionError(provider, message);
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const identifier = /^[A-Za-z][A-Za-z0-9_-]{0,99}$/;
function validate(provider: ExtensionProvider): void {
  const value: unknown = provider.declaration;
  if (!object(value) || value.apiVersion !== 1) fail(provider.name, 'expected apiVersion 1 declaration');
  const supported = new Set([
    'apiVersion',
    'config',
    'modules',
    'handlers',
    'routes',
    'middleware',
    'integrations',
    'migrations',
    'bootstrap',
    'jobs',
    'forms',
    'workflows',
    'configModels',
    'contributors',
    'views',
    'assets',
  ]);
  if (Object.keys(value).some(key => !supported.has(key))) fail(provider.name, 'unknown declaration field');
  for (const field of ['config', 'jobs', 'forms', 'workflows'])
    if (value[field] !== undefined && !object(value[field])) fail(provider.name, `${field} must be an object`);
  for (const field of [
    'modules',
    'handlers',
    'integrations',
    'routes',
    'middleware',
    'migrations',
    'bootstrap',
    'configModels',
    'contributors',
  ]) {
    const entries = value[field];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) fail(provider.name, `${field} must be an array`);
    const names = new Set<string>();
    for (const entry of entries) {
      if (
        !object(entry) ||
        typeof entry.name !== 'string' ||
        !(['migrations', 'bootstrap'].includes(field) ? /^[A-Za-z0-9_:@./-]{1,200}$/ : identifier).test(entry.name) ||
        names.has(entry.name)
      )
        fail(provider.name, `${field} require unique bounded names`);
      names.add(entry.name);
      if (
        entry.requires !== undefined &&
        (!Array.isArray(entry.requires) ||
          entry.requires.some(name => typeof name !== 'string' || !identifier.test(name)))
      )
        fail(provider.name, `${field} have invalid prerequisites`);
      if (entry.replaces !== undefined && entry.replaces !== true)
        fail(provider.name, `${field} replaces must be true when present`);
      if (['modules', 'handlers', 'integrations'].includes(field) && typeof entry.create !== 'function')
        fail(provider.name, `${field} require create(input)`);
      if (['migrations', 'bootstrap'].includes(field) && typeof entry.run !== 'function')
        fail(provider.name, `${field} require run(input)`);
      if (field === 'routes') {
        if (
          !['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(String(entry.method)) ||
          typeof entry.path !== 'string' ||
          !entry.path.startsWith('/') ||
          typeof entry.handler !== 'string'
        )
          fail(provider.name, 'invalid route declaration');
        if (
          entry.access !== 'public' &&
          (!Array.isArray(entry.access) ||
            entry.access.length === 0 ||
            entry.access.some(policy => typeof policy !== 'string' || !identifier.test(policy)))
        )
          fail(provider.name, 'route requires explicit public access or policy names');
      }
      if (
        field === 'middleware' &&
        (!['beforeRoutes', 'afterRoutes'].includes(String(entry.stage)) || typeof entry.handler !== 'string')
      )
        fail(provider.name, 'invalid middleware declaration');
      if (field === 'contributors' && typeof entry.module !== 'string')
        fail(provider.name, 'contributor requires its owning module');
      if (field === 'configModels' && !object(entry.definition))
        fail(provider.name, 'config model requires an object definition');
    }
  }
  for (const field of ['views', 'assets']) {
    const directories = value[field];
    if (
      directories !== undefined &&
      (!Array.isArray(directories) ||
        directories.some(
          directory =>
            typeof directory !== 'string' ||
            !directory ||
            path.isAbsolute(directory) ||
            directory.split(/[\\/]/).some(part => part === '..' || part === '.')
        ))
    )
      fail(provider.name, `${field} must be package-relative directories`);
  }
}

function select<T extends { readonly name: string; readonly replaces?: true }>(
  providers: readonly ExtensionProvider[],
  field: keyof RedboxExtension,
  existingNames: ReadonlySet<string> = new Set()
): ResolvedRegistration<T>[] {
  const selected = new Map<string, ResolvedRegistration<T>>();
  for (const provider of providers) {
    const entries = provider.declaration[field] as readonly T[] | undefined;
    for (const declaration of entries ?? []) {
      const exists = selected.has(declaration.name) || existingNames.has(declaration.name);
      if (exists !== !!declaration.replaces)
        fail(
          provider.name,
          exists ? `${field} duplicate requires replaces: true` : `${field} replacement has no target`
        );
      selected.set(declaration.name, { provider: provider.name, declaration });
    }
  }
  return [...selected.values()];
}

export interface OwnedHttpRoute {
  readonly name: string;
  readonly method: string;
  readonly path: string;
}

/** Match Express's non-Unicode ignoreCase folding, without decoding URL literals. */
function routeCase(value: string): string {
  return value
    .split('')
    .map(char => {
      const upper = char.toUpperCase();
      if (upper.length !== 1 || (char.charCodeAt(0) >= 128 && upper.charCodeAt(0) < 128)) return char;
      return upper.charCodeAt(0) < 128 ? upper.toLowerCase() : upper;
    })
    .join('');
}

type FlatRouteToken = Exclude<Token, { type: 'group' }>;

/** Expand optional alternatives using the pinned matcher grammar, before comparing paths.
 * The host uses default (non-strict, case-insensitive, end-matching) Express routers.
 * Express loosens declaration slashes, except for the root, before parsing them.
 */
function httpRoutePath(routePath: string): { patterns: string[]; identity: string } {
  const loosened = routePath === '/' ? routePath : routePath.replace(/\/+$/, '');
  // Validate exactly what Express compiles, including its 256-alternative bound.
  pathToRegexp(loosened);
  const expand = (tokens: Token[]): FlatRouteToken[][] => {
    let alternatives: FlatRouteToken[][] = [[]];
    for (const token of tokens) {
      const suffixes = token.type === 'group' ? [...expand(token.tokens), []] : [[token]];
      alternatives = alternatives.flatMap(prefix => suffixes.map(suffix => [...prefix, ...suffix]));
    }
    return alternatives;
  };
  const alternatives = expand(parse(loosened).tokens).map(tokens => {
    const folded = tokens.map(token => (token.type === 'text' ? { ...token, value: routeCase(token.value) } : token));
    // Character atoms ignore text-token boundaries introduced by optional groups.
    const atoms = folded.flatMap(token =>
      token.type === 'text' ? token.value.split('').map(char => JSON.stringify(char)) : [token.type]
    );
    const prefix = folded.slice(0, -1);
    const tail = folded.at(-1)?.type;
    const lastCapture = prefix.findLastIndex(token => token.type !== 'text');
    const lastSlash = prefix.findLastIndex(token => token.type === 'text' && token.value.includes('/'));
    // A first capture in its segment is unrestricted. Earlier wildcards constrain
    // subsequent wildcards in the pinned matcher, so do not simplify those.
    const absorbsTail =
      lastSlash > lastCapture &&
      (tail === 'param' || (tail === 'wildcard' && !prefix.some(token => token.type === 'wildcard')));
    return { atoms, tail: absorbsTail ? tail : undefined, pattern: pathToRegexp(new TokenData(folded)).regexp.source };
  });
  const unique = [...new Map(alternatives.map(alternative => [alternative.pattern, alternative])).values()];
  const identity = unique
    .filter(
      candidate =>
        !unique.some(broader => {
          if (broader === candidate || !broader.tail) return false;
          const prefix = broader.atoms.slice(0, -1);
          if (!prefix.every((atom, index) => candidate.atoms[index] === atom)) return false;
          const rest = candidate.atoms.slice(prefix.length);
          return (
            rest.length > 0 &&
            (broader.tail === 'wildcard' || !rest.some(atom => atom === 'wildcard' || atom === JSON.stringify('/')))
          );
        })
    )
    .map(alternative => alternative.pattern)
    .sort()
    .join('\n');
  // Keep absorbed alternatives for collision checks: another route may declare
  // exactly that narrower alternative without declaring its broader sibling.
  return { patterns: unique.map(alternative => alternative.pattern), identity };
}

/** Structural matcher identity, ignoring capture names and optional alternatives
 * covered by an unrestricted final capture after the same structural prefix.
 * This is not a general regular-language equivalence algorithm. Capture values and
 * decoding errors are outside this identity; literal URL encodings are preserved.
 */
export function canonicalHttpRoutePath(routePath: string): string {
  return httpRoutePath(routePath).identity;
}

function orderModules(modules: readonly ResolvedRegistration<ExtensionFactory>[]) {
  const byName = new Map(modules.map(item => [item.declaration.name, item]));
  const ordered: ResolvedRegistration<ExtensionFactory>[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(item: ResolvedRegistration<ExtensionFactory>) {
    const name = item.declaration.name;
    if (visited.has(name)) return;
    if (visiting.has(name)) fail(item.provider, `module dependency cycle at ${name}`);
    visiting.add(name);
    for (const dependency of item.declaration.requires ?? []) {
      const target = byName.get(dependency);
      if (!target) fail(item.provider, `module ${name} requires missing ${dependency}`);
      visit(target);
    }
    visiting.delete(name);
    visited.add(name);
    ordered.push(item);
  }
  modules.forEach(visit);
  return ordered;
}

/** Validate and order offline contributions before concrete core factory inputs exist. */
export function orderExtensionProviders(
  providers: readonly ExtensionProvider[],
  hookLoadPriority: readonly string[] = []
): readonly ExtensionProvider[] {
  providers.forEach(validate);
  if (new Set(providers.map(item => item.name)).size !== providers.length) fail('installation', 'duplicate provider');
  const priority = new Map(hookLoadPriority.map((name, index) => [name, index]));
  for (const name of priority.keys())
    if (!providers.some(provider => provider.name === name))
      fail('installation', 'hookLoadPriority references an undiscovered extension');
  return [...providers].sort((a, b) => {
    if (a.name === 'core') return b.name === 'core' ? 0 : -1;
    if (b.name === 'core') return 1;
    const ai = priority.get(a.name),
      bi = priority.get(b.name);
    if (ai !== undefined && bi !== undefined) return bi - ai;
    if (ai !== undefined) return 1;
    if (bi !== undefined) return -1;
    return a.name.localeCompare(b.name);
  });
}

/** Resolve the whole graph before any factory is called. Core is always lowest precedence. */
export function resolveExtensions(
  providers: readonly ExtensionProvider[],
  hookLoadPriority: readonly string[] = [],
  ownedRoutes: readonly OwnedHttpRoute[] = []
): ResolvedExtensions {
  const ordered = orderExtensionProviders(providers, hookLoadPriority);
  const modules = orderModules(select<ExtensionFactory>(ordered, 'modules'));
  const handlers = select<NonNullable<RedboxExtension['handlers']>[number]>(ordered, 'handlers');
  const integrations = select<NonNullable<RedboxExtension['integrations']>[number]>(ordered, 'integrations');
  const routes = select<ExtensionRoute>(ordered, 'routes', new Set(ownedRoutes.map(route => route.name)));
  const middleware = select<NonNullable<RedboxExtension['middleware']>[number]>(ordered, 'middleware');
  const migrations = select<ExtensionWork>(ordered, 'migrations').sort((a, b) =>
    a.declaration.name.localeCompare(b.declaration.name)
  );
  const bootstrap = select<ExtensionWork>(ordered, 'bootstrap');
  const methods = new Set<string>();
  const owned = ownedRoutes.map(route => ({ ...route, matching: httpRoutePath(route.path) }));
  for (const route of routes) {
    // Match the host's default case-insensitive, non-strict Express router.
    let matching: ReturnType<typeof httpRoutePath>;
    try {
      matching = httpRoutePath(route.declaration.path);
    } catch {
      fail(route.provider, 'invalid Express route path');
    }
    for (const target of owned) {
      const samePath = matching.identity === target.matching.identity;
      const sharedPath = samePath || matching.patterns.some(pattern => target.matching.patterns.includes(pattern));
      const sameMethod = route.declaration.method === target.method;
      if (route.declaration.name === target.name && (!samePath || !sameMethod))
        fail(route.provider, 'owned route replacement must retain its method and path');
      if (sharedPath && (sameMethod || target.method === 'all')) {
        if (route.declaration.name !== target.name || !route.declaration.replaces)
          fail(route.provider, 'collision with an owned portal route requires its name and replaces: true');
      }
    }
    // This deliberately checks identical complete alternatives, rather than all
    // overlaps (for example a static route and a parameter or wildcard route).
    for (const pattern of matching.patterns) {
      const key = route.declaration.method + ' ' + pattern;
      if (methods.has(key)) fail(route.provider, 'accidental method/path route collision');
      methods.add(key);
    }
  }
  const moduleNames = new Set(modules.map(item => item.declaration.name));
  const handlerNames = new Set(handlers.map(item => item.declaration.name));
  for (const item of [...handlers, ...integrations, ...migrations, ...bootstrap])
    for (const dependency of item.declaration.requires ?? [])
      if (!moduleNames.has(dependency)) fail(item.provider, `missing module prerequisite ${dependency}`);
  for (const item of [...routes, ...middleware])
    if (!handlerNames.has(item.declaration.handler)) fail(item.provider, 'missing HTTP handler');
  for (const provider of ordered)
    for (const contributor of provider.declaration.contributors ?? [])
      if (!moduleNames.has(contributor.module)) fail(provider.name, 'contributor requires missing module');
  const lookup = (field: 'views' | 'assets') =>
    [...ordered]
      .reverse()
      .flatMap(provider => (provider.declaration[field] ?? []).map(directory => path.join(provider.root, directory)));
  return {
    providers: ordered,
    modules,
    handlers,
    integrations,
    // Express GET routes also handle HEAD. Explicit HEAD policies and handlers
    // must therefore mount first, independent of provider/declaration order.
    routes: routes.sort((a, b) => Number(b.declaration.method === 'head') - Number(a.declaration.method === 'head')),
    middleware,
    migrations,
    bootstrap,
    views: lookup('views'),
    assets: lookup('assets'),
  };
}

export async function loadExtensions(
  appPath: string,
  options: { includeDevDependencies?: boolean; core?: RedboxExtension } = {}
): Promise<ResolvedExtensions> {
  const installed = await loadInstalledExtensionProviders(appPath, options);
  return resolveExtensions(installed.providers, installed.hookLoadPriority);
}

/** Discovery/registration only; the production root resolves the complete graph after config. */
export async function loadInstalledExtensionProviders(
  appPath: string,
  options: { includeDevDependencies?: boolean; core?: RedboxExtension } = {}
): Promise<{
  providers: readonly ExtensionProvider[];
  hookLoadPriority: readonly string[];
  entrypoints: ReadonlyMap<string, Record<string, unknown>>;
}> {
  const installed = await discoverInstalledExtensions(appPath, options);
  const providers: ExtensionProvider[] = options.core
    ? [{ name: 'core', root: appPath, declaration: options.core }]
    : [];
  const entrypoints = new Map<string, Record<string, unknown>>();
  for (const extension of installed.extensions) {
    let declaration: RedboxExtension;
    try {
      const entrypoint = await loadExtensionModule(extension);
      entrypoints.set(extension.name, entrypoint);
      declaration = (await extensionRegistration(entrypoint, extension.name)()) as RedboxExtension;
    } catch (error) {
      if (error instanceof ExtensionError) throw error;
      throw new ExtensionError(extension.name, 'registration failed; declarations must be offline');
    }
    providers.push({ name: extension.name, root: extension.root, declaration });
  }
  return {
    providers: orderExtensionProviders(providers, installed.hookLoadPriority),
    hookLoadPriority: installed.hookLoadPriority,
    entrypoints,
  };
}
