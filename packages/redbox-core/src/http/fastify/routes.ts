import { createHash } from 'node:crypto';
import { METHODS } from 'node:http';
import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyRequest, FastifyReply, HTTPMethods } from 'fastify';
import type { HTTPMethod as NativeMethod } from 'find-my-way';
import { parse, type Token } from 'path-to-regexp';
import { canonicalHttpRoutePath, type ResolvedRegistration } from '../../extensions/resolution';
import { ExtensionError } from '../../extensions/loading';
import type { HttpRouteDeclaration, PortalHttpMethod } from '../contracts';
import type { ControllerInstances } from './registration';
import { registerCoreApiRoutes } from '../../api-routes/route-registry';
import type { ApiRouteDefinition } from '../../api-routes/types';
import type { PoliciesConfig, PolicyChain } from '../../config/policies.config';
import { portalHttpPolicies } from '../../application/portal/httpPolicies';
import { resolveEffectivePolicies } from '../express/policies';
import { apiNoCacheHeaders, apiVersion } from '../express/responses';
import { adminApiRoutes } from '../../api-routes/groups/admin';
import { assertPortalRouter, createNativeRouter, routerConstraints, routerUrl } from './router';
export { createPortalRouter, portalRouterOptions } from './router';
export { coreRoutePrecedence } from './precedence';
type NativeRouter = ReturnType<typeof createNativeRouter>;

export type HeadPolicy =
  { readonly kind: 'implicit' } | { readonly kind: 'none' } | { readonly kind: 'deny'; readonly allow?: string };

/** ALL is an internal compatibility input, not a new public extension method. */
export interface RouteDeclaration extends Omit<HttpRouteDeclaration, 'method'> {
  readonly method: PortalHttpMethod | 'all';
  readonly head?: HeadPolicy;
  /** Browser/integration request declarations retain their executable extractors too. */
  readonly validation?: ApiRouteDefinition['request'];
}

export interface RouteRegistration extends ResolvedRegistration<RouteDeclaration> {
  /** API resolution can retain effects before a denial (e.g. nocache, false). */
  readonly effectivePolicies?: readonly (string | false)[];
  /** Retained source configuration, so API policy metadata is checked again at composition. */
  readonly apiConfiguration?: PoliciesConfig;
  /** Selected CSRF adapter identity, when the legacy mount supplies one beyond csrf. */
  readonly effectiveCsrf?: string;
}

function apiMetadata(api: ApiRouteDefinition, configuration: PoliciesConfig) {
  const check = (value: PolicyChain | undefined) => {
    if (value === undefined || typeof value === 'boolean') return;
    const names = typeof value === 'string' ? [value] : value;
    if (!Array.isArray(names) || !names.length || names.some(name => typeof name !== 'string' || !name.trim()))
      throw new TypeError('Named API policy declarations must be non-empty');
  };
  for (const value of Object.values(configuration)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) Object.values(value).forEach(check);
    else check(value as PolicyChain | undefined);
  }
  check(api.policy);
  const effectivePolicies = resolveEffectivePolicies(api, configuration);
  const names =
    api.policy === undefined
      ? effectivePolicies.filter(name => name !== false)
      : (typeof api.policy === 'string' ? [api.policy] : api.policy).map(name => name.toLowerCase());
  const access: HttpRouteDeclaration['access'] =
    api.policy === undefined && effectivePolicies.includes(false)
      ? { kind: 'deny' }
      : names.length
        ? { kind: 'policies', names: [names[0], ...names.slice(1)] }
        : { kind: 'public' };
  const head: HeadPolicy | undefined =
    api.method === 'get' && adminHeadDenials.has(coreRouteName(api.method, api.path))
      ? { kind: 'deny', allow: 'GET' }
      : undefined;
  return { access, effectivePolicies, head };
}

/** No parallel dispatch table: each view points to its executable API declaration. */
export function apiRouteRegistrations(
  options: {
    readonly declarations?: readonly ApiRouteDefinition[];
    readonly configuration?: PoliciesConfig;
    readonly provider?: string;
  } = {}
): readonly RouteRegistration[] {
  const configuration = options.configuration ?? portalHttpPolicies();
  return (options.declarations ?? registerCoreApiRoutes()).map(api => {
    const { access, effectivePolicies, head } = apiMetadata(api, configuration);
    return {
      provider: options.provider ?? '@researchdatabox/redbox-core',
      apiConfiguration: configuration,
      effectivePolicies,
      declaration: {
        name: coreRouteName(api.method, api.path),
        method: api.method,
        path: api.path,
        controller: api.controller,
        action: api.action,
        csrf: api.csrf,
        api,
        access,
        ...(head ? { head } : {}),
      },
    };
  });
}

export interface TranslatedPath {
  readonly url: string;
  readonly wildcard?: { readonly name: string; readonly required: boolean };
  readonly suffixes?: readonly { readonly name: string; readonly suffix: string }[];
  /** Concrete Express alternative, for producing overlap witnesses (not matching). */
  readonly template?: string;
}

function pathConstraints(path: TranslatedPath) {
  return path.wildcard?.required ? { redboxNonemptyPath: 'nonempty' } : undefined;
}

function findRoute(router: NativeRouter, method: HTTPMethods, url: string) {
  return router.find(method as NativeMethod, routerUrl(url), routerConstraints(url));
}

const captureName = '[A-Za-z_][A-Za-z0-9_]*';
const sourceSegment = `(?:[A-Za-z0-9_.-]+|:${captureName}(?:\\.(?:[cC][sS][sS]|[jJ][sS][oO][nN]|[wW][oO][fF][fF]2))?)`;
/** Syntax allowlist for ORIGINAL declarations, including the two exact legacy
 * terminal spellings. This validates syntax only; native routers decide matching.
 * In particular, no rewrite or slash trimming may join adjacent capture tokens.
 */
const sourcePathGrammar = new RegExp(
  `^(?:/|/(?:${sourceSegment}/)*(?:${sourceSegment}(?:\\{/:${captureName}\\})?/?|\\*${captureName}|:key\\*|datastream(?:\\*|\\{\\*tail\\})))$`
);

function validateSourcePath(path: string): void {
  if (typeof path !== 'string' || !path.startsWith('/') || /[?#\s\\]/.test(path))
    throw new TypeError('Route path must be an absolute path without query, fragment or whitespace');
  if (/[^A-Za-z0-9/_.:{}*-]/.test(path))
    throw new TypeError('Unsupported route literal: use unencoded ASCII path segments');
  if (!sourcePathGrammar.test(path))
    throw new TypeError(
      path.includes('*')
        ? 'Unsupported wildcard or concatenated capture: use a terminal /*name segment, exact /:key*, or /datastream{*tail}'
        : 'Unsupported original route grammar: use whole-segment :parameters, .css/.json/.woff2 suffixes, or one terminal {/:name}'
    );
}

/** Validate before rewriting: only the two inventoried terminal aliases qualify. */
export function expressRuntimePath(path: string): string {
  validateSourcePath(path);
  return path.replace(/\/:key\*$/, '/*key').replace(/\/datastream\*$/, '/datastream{*tail}');
}

/** Frozen FM-002 identity, deliberately independent of Fastify collision identity. */
export function coreRouteName(method: string, path: string): string {
  return `core-http-${method}-${createHash('sha256')
    .update(canonicalHttpRoutePath(expressRuntimePath(path)))
    .digest('hex')
    .slice(0, 16)}`;
}

const adminHeadDenials = new Set(
  adminApiRoutes.filter(api => api.method === 'get').map(api => coreRouteName(api.method, api.path))
);

function fail(provider: string, message: string): never {
  throw new ExtensionError(provider, message);
}

/** Parse Express groups explicitly; never forward unchecked Express/Fastify grammar. */
export function translateRoutePath(path: string): readonly TranslatedPath[] {
  const runtime = expressRuntimePath(path);
  const tokens = parse(runtime === '/' ? runtime : runtime.replace(/\/+$/, '')).tokens;
  for (const [index, token] of tokens.entries()) {
    if (token.type !== 'group') continue;
    const optionalSegment =
      token.tokens.length === 2 &&
      token.tokens[0].type === 'text' &&
      token.tokens[0].value === '/' &&
      token.tokens[1].type === 'param';
    const datastreamTail =
      token.tokens.length === 1 &&
      token.tokens[0].type === 'wildcard' &&
      token.tokens[0].name === 'tail' &&
      runtime.endsWith('/datastream{*tail}');
    if (index !== tokens.length - 1 || (!optionalSegment && !datastreamTail))
      throw new TypeError(
        'Unsupported optional group: use one terminal {/:name} segment or inventoried datastream{*tail}'
      );
  }
  const expand = (items: readonly Token[]): Token[][] => {
    let alternatives: Token[][] = [[]];
    for (const token of items) {
      const suffixes = token.type === 'group' ? [...expand(token.tokens), []] : [[token]];
      if (alternatives.length * suffixes.length > 256) throw new TypeError('Too many optional route alternatives');
      alternatives = alternatives.flatMap(prefix => suffixes.map(suffix => [...prefix, ...suffix]));
    }
    return alternatives;
  };
  return expand(tokens).map(items => {
    let url = '';
    let wildcard: TranslatedPath['wildcard'];
    const suffixes: { name: string; suffix: string }[] = [];
    let skipText = 0;
    const names = new Set<string>();
    items.forEach((token, index) => {
      if (token.type === 'text') {
        // Restrict to the concrete inventory's literal alphabet. In particular,
        // escaped Express punctuation must not turn into Fastify router grammar.
        if (!/^[A-Za-z0-9/_.-]*$/.test(token.value))
          throw new TypeError(
            'Unsupported route literal: use unencoded ASCII path segments (letters, digits, underscore, hyphen and dot)'
          );
        url += token.value.slice(skipText);
        skipText = 0;
      } else if (token.type === 'param' || token.type === 'wildcard') {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(token.name) || names.has(token.name))
          throw new TypeError('Invalid or repeated route capture');
        names.add(token.name);
        if (token.type === 'wildcard') {
          if (index !== items.length - 1) throw new TypeError('Only terminal wildcards are supported');
          if (!url.endsWith('/') && !runtime.endsWith('/datastream{*tail}'))
            throw new TypeError(
              'Unsupported wildcard: use a terminal /*name segment; only inventoried datastream{*tail} may follow a literal'
            );
          wildcard = {
            name: token.name,
            required: !runtime.includes(`{*${token.name}}`) && !runtime.includes(`{/*${token.name}}`),
          };
          url += '*';
        } else {
          if (!url.endsWith('/')) throw new TypeError('Only segment-leading parameters are supported');
          url += ':' + token.name;
          const next = items[index + 1];
          const suffix = next?.type === 'text' ? next.value.split('/')[0] : '';
          if (suffix) {
            if (!['.css', '.json', '.woff2'].includes(suffix.toLowerCase()))
              throw new TypeError(
                'Unsupported parameter suffix: supported inventory suffixes are .css, .json and .woff2'
              );
            // find-my-way's suffix regex ignores caseSensitive:false. Compile
            // an explicit ASCII case-insensitive suffix, then remove only that
            // suffix from the raw capture before decoding and guard extraction.
            const expression = [...suffix]
              .map(char =>
                /[A-Za-z]/.test(char)
                  ? `[${char.toLowerCase()}${char.toUpperCase()}]`
                  : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              )
              .join('');
            // Segment boundaries are already enforced by find-my-way;
            // raw escapes remain protected until after this literal match.
            url += `([\\s\\S]+${expression})`;
            suffixes.push({ name: token.name, suffix });
            skipText = suffix.length;
          } else {
            // Reject empty captures during native lookup, so find-my-way can
            // backtrack to a valid wildcard or another sibling route.
            url += '([\\s\\S]+)';
          }
        }
      } else throw new TypeError('Unexpanded route group');
    });
    const template = items
      .map(token => (token.type === 'text' ? token.value : token.type === 'param' ? ':' + token.name : '*'))
      .join('');
    return { url: url || '/', template, ...(wildcard ? { wildcard } : {}), ...(suffixes.length ? { suffixes } : {}) };
  });
}

export interface ResolvedHttpRoute extends RouteRegistration {
  readonly effectivePolicies: readonly (string | false)[];
  readonly paths: readonly TranslatedPath[];
  readonly replaced?: ResolvedHttpRoute;
  /** Method-specific frozen reservation; original GET/ALL metadata stays owned here. */
  readonly aliasOf?: ResolvedHttpRoute;
}

export interface RouteBinding {
  readonly route: ResolvedHttpRoute;
  readonly method: HTTPMethods;
  readonly path: TranslatedPath;
  readonly kind: 'action' | 'implicit-head' | 'denied-head' | 'automatic-options';
}

function validateAccess(
  registration: RouteRegistration,
  policyNames: ReadonlySet<string>
): readonly (string | false)[] {
  const { declaration: route, provider } = registration;
  const access = route.access;
  if (!access || !['public', 'policies', 'deny'].includes(access.kind))
    fail(provider, `route ${route.name} requires explicit access`);
  let declared: readonly (string | false)[];
  if (access.kind === 'policies') {
    if (
      !Array.isArray(access.names) ||
      !access.names.length ||
      access.names.some(name => typeof name !== 'string' || !name.trim())
    )
      fail(provider, `route ${route.name} requires non-empty policies`);
    declared = access.names;
  } else declared = access.kind === 'deny' ? [false] : [];
  const effective = registration.effectivePolicies ?? declared;
  if (!Array.isArray(effective) || (!effective.length && access.kind !== 'public'))
    fail(provider, `route ${route.name} cannot use an empty policy chain as public access`);
  if (access.kind === 'deny' && !effective.includes(false)) fail(provider, `route ${route.name} lost its denial`);
  if (access.kind === 'policies' && access.names.some((name, index) => effective[index] !== name))
    fail(provider, `route ${route.name} lost its declared policy order`);
  for (const name of [...declared, ...effective])
    if (name !== false && (typeof name !== 'string' || !name.trim() || !policyNames.has(name)))
      fail(provider, `route ${route.name} requires unknown policy ${String(name)}`);
  return [...effective];
}

/** Add the Node methods supported by find-my-way, so ALL retains e.g. PROPFIND. */
function configureMethods(app: FastifyInstance): void {
  for (const method of METHODS)
    if (!app.supportedMethods.includes(method)) app.addHttpMethod(method, { hasBody: true });
}

/** All real methods participate in malformed capture validation, including
 * explicit OPTIONS. Native binding identity excludes the synthesized fallback.
 * Allow collection separately omits OPTIONS, matching Express's accumulator.
 */
function matchedMethods(router: NativeRouter, url: string) {
  return METHODS.flatMap(method => {
    const match = findRoute(router, method as HTTPMethods, url);
    return match && (match.store as RouteBinding).kind !== 'automatic-options'
      ? [{ method, params: match.params }]
      : [];
  });
}

function hasMalformedCapture(matches: ReturnType<typeof matchedMethods>): boolean {
  try {
    for (const match of matches)
      for (const value of Object.values(match.params)) if (value !== undefined) decodeURIComponent(value);
    return false;
  } catch {
    return true;
  }
}

function invalidRequest(request: FastifyRequest, reply: FastifyReply) {
  const version = apiVersion({ headers: request.headers, query: request.query as Record<string, unknown> });
  return reply
    .headers(apiNoCacheHeaders)
    .code(400)
    .send(
      version === '2.0'
        ? { errors: [{ detail: 'Invalid request' }], meta: {} }
        : { message: 'Invalid request', details: '' }
    );
}

/** Candidate URLs only; the real routers decide whether either path matches.
 * The accepted grammar has segment-leading params/suffixes and terminal wildcards.
 */
function overlapWitnesses(a: string, b: string): string[] {
  const capture = /^:[A-Za-z_][A-Za-z0-9_]*/;
  const concrete = (url: string) => url.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, 'route-value').replace('*', 'route-value');
  const merge = (left: string, right: string) => {
    const parts = left.split('/');
    const other = right.split('/');
    return parts
      .map((part, index) => {
        const peer = other[index];
        if (part.includes('*') && peer !== undefined) {
          const prefix = part.split('*')[0];
          if (peer.startsWith(':')) return prefix + concrete(other.slice(index).join('/'));
          if (peer.includes('*')) {
            const peerPrefix = peer.split('*')[0];
            return (prefix.length > peerPrefix.length ? prefix : peerPrefix) + 'route-value';
          }
          return concrete(other.slice(index).join('/'));
        }
        if (part.startsWith(':') && peer) {
          const suffix = part.replace(capture, '');
          if (peer.startsWith(':')) {
            const peerSuffix = peer.replace(capture, '');
            return 'route-value' + (suffix.length > peerSuffix.length ? suffix : peerSuffix);
          }
          if (peer.includes('*')) return peer.split('*')[0] + 'route-value' + suffix;
          return peer;
        }
        return concrete(part);
      })
      .join('/');
  };
  return [
    ...new Set([concrete(a), concrete(b), merge(a, b), merge(b, a)].flatMap(url => [url, url + '/', url + '//'])),
  ];
}

/** An intentional priority between two stable declarations, never an implicit
 * consequence of method, binding kind, registration order or legacy mode.
 */
export interface RoutePrecedence {
  readonly name: string;
  readonly reason: string;
  readonly winner: string;
  readonly over: string;
}
export interface RouteOverlap {
  readonly first: string;
  readonly second: string;
  readonly firstMethods: readonly HTTPMethods[];
  readonly secondMethods: readonly HTTPMethods[];
  readonly witness: string;
  readonly precedence?: RoutePrecedence;
}

/** All structurally overlapping source declarations require explicit named intent,
 * even across methods: Express decodes captures before checking the method.
 * A declaration's own optional alternatives and method expansion share ownership.
 * Candidate URLs are witnesses only; actual find-my-way lookup decides overlap.
 */
function checkOverlaps(
  bindings: readonly RouteBinding[],
  precedence: readonly RoutePrecedence[],
  probeFor: (path: TranslatedPath) => NativeRouter
): RouteOverlap[] {
  const names = new Set(bindings.map(binding => binding.route.declaration.name));
  const overrideNames = new Set<string>();
  for (const override of precedence) {
    if (
      !/^[A-Za-z][A-Za-z0-9_.:-]{0,199}$/.test(override.name) ||
      typeof override.reason !== 'string' ||
      !override.reason.trim() ||
      !names.has(override.winner) ||
      !names.has(override.over) ||
      override.winner === override.over ||
      overrideNames.has(override.name) ||
      Reflect.has(override, 'methods')
    )
      fail('host', 'invalid route precedence declaration (method-scoped overrides are unsupported): ' + override.name);
    overrideNames.add(override.name);
  }
  const owners = [...new Set(bindings.map(binding => binding.route))];
  const overlaps: RouteOverlap[] = [];
  const unresolved: string[] = [];
  for (let index = 0; index < owners.length; index++) {
    const first = owners[index];
    for (const second of owners.slice(index + 1)) {
      const firstBindings = bindings.filter(binding => binding.route === first);
      const secondBindings = bindings.filter(binding => binding.route === second);
      let witness: string | undefined;
      for (const a of new Set(firstBindings.map(binding => binding.path))) {
        for (const b of new Set(secondBindings.map(binding => binding.path))) {
          witness = overlapWitnesses(a.template ?? a.url, b.template ?? b.url).find(
            url => findRoute(probeFor(a), 'GET', url) && findRoute(probeFor(b), 'GET', url)
          );
          if (witness) break;
        }
        if (witness) break;
      }
      if (!witness) continue;
      const pair = [first.declaration.name, second.declaration.name];
      const overrides = precedence.filter(override => pair.includes(override.winner) && pair.includes(override.over));
      if (overrides.length > 1) fail('host', 'conflicting route precedence declarations: ' + pair.join(' / '));
      if (!overrides.length)
        unresolved.push(`route overlap at ${witness}: ${pair.join(' / ')} requires named precedence with a reason`);
      overlaps.push({
        first: pair[0],
        second: pair[1],
        witness,
        firstMethods: [...new Set(firstBindings.map(binding => binding.method))],
        secondMethods: [...new Set(secondBindings.map(binding => binding.method))],
        ...(overrides[0] ? { precedence: overrides[0] } : {}),
      });
    }
  }
  if (unresolved.length) fail('host', unresolved.join('\n'));
  for (const override of precedence)
    if (!overlaps.some(overlap => overlap.precedence === override))
      fail('host', 'unused route precedence declaration: ' + override.name);
  return overlaps;
}

export interface RouteComposition {
  readonly routes: readonly ResolvedHttpRoute[];
  readonly bindings: readonly RouteBinding[];
  readonly overlaps: readonly RouteOverlap[];
  /** Guards own policy/CSRF/validation ordering; called even for implicit/denied HEAD. */
  install(app: FastifyInstance, controllers: Pick<ControllerInstances, 'action'>, guards: RouteGuards): void;
}
export type RouteGuards = (binding: RouteBinding, request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/** Preserve declared legacy precedence at crossed static/parameter segments.
 * Candidate construction is conservative; real find-my-way probes must match
 * both paths before an exclusion is emitted into the later native parameter.
 */
function legacyPath(
  binding: RouteBinding,
  previous: readonly RouteBinding[],
  probeFor: (path: TranslatedPath) => NativeRouter,
  selectsLater: (earlier: TranslatedPath, later: TranslatedPath, url: string) => boolean
): TranslatedPath {
  const template = binding.path.template;
  if (!template) return binding.path;
  const parts = template.split('/');
  const exclusions = new Map<string, Set<string>>();
  const parameter = /^:([A-Za-z_][A-Za-z0-9_]*)(.*)$/;
  for (const earlier of previous) {
    if (earlier.method !== binding.method || earlier.route === binding.route) continue;
    if (template.includes('*') || earlier.path.template?.includes('*')) {
      for (const url of overlapWitnesses(template, earlier.path.template ?? earlier.path.url)) {
        if (
          findRoute(probeFor(binding.path), 'GET', url) &&
          findRoute(probeFor(earlier.path), 'GET', url) &&
          selectsLater(earlier.path, binding.path, url)
        )
          fail(
            binding.route.provider,
            `legacy overlap requires explicit ownership: ${earlier.route.declaration.name} and ${binding.route.declaration.name}`
          );
      }
      continue;
    }
    const before = earlier.path.template?.split('/');
    if (!before || before.length !== parts.length || before.some(part => part.includes('*'))) continue;
    const fixed: { name: string; value: string; index: number }[] = [];
    let compatible = true;
    for (let index = 0; index < parts.length; index++) {
      const current = parameter.exec(parts[index]);
      const prior = parameter.exec(before[index]);
      if (!current && !prior && parts[index].toLowerCase() !== before[index].toLowerCase()) {
        compatible = false;
        break;
      }
      if (current && !prior) fixed.push({ name: current[1], value: before[index], index });
      // An earlier suffix must cover the later parameter's entire value domain.
      if (current && prior?.[2] && !current[2].toLowerCase().endsWith(prior[2].toLowerCase())) compatible = false;
    }
    if (!compatible) continue;
    const witness = parts
      .map(
        (part, index) => fixed.find(value => value.index === index)?.value ?? part.replace(parameter, 'route-value$2')
      )
      .join('/');
    if (!findRoute(probeFor(binding.path), 'GET', witness) || !findRoute(probeFor(earlier.path), 'GET', witness))
      continue;
    if (!selectsLater(earlier.path, binding.path, witness)) continue;
    if (fixed.length !== 1)
      fail(
        binding.route.provider,
        `legacy overlap requires explicit ownership: ${earlier.route.declaration.name} and ${binding.route.declaration.name}`
      );
    const item = fixed[0];
    const values = exclusions.get(item.name) ?? new Set<string>();
    values.add(item.value);
    exclusions.set(item.name, values);
  }
  let url = binding.path.url;
  for (const [name, values] of exclusions) {
    const literal = [...values]
      .map(value =>
        [...value]
          .map(char =>
            /[A-Za-z]/.test(char)
              ? `[${char.toLowerCase()}${char.toUpperCase()}]`
              : char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          )
          .join('')
      )
      .join('|');
    url = url.replace(':' + name + '(', ':' + name + '((?!(?:' + literal + ')$)');
  }
  return { ...binding.path, url };
}

/** Offline, low-to-high provider order; no factories, plugins or listeners run. */
export async function composeRoutes(
  registrations: readonly RouteRegistration[],
  options: {
    readonly policyNames: readonly string[];
    readonly rootContext?: string;
    readonly legacyOrder?: boolean;
    readonly precedence?: readonly RoutePrecedence[];
  }
): Promise<RouteComposition> {
  const root = options.rootContext ?? '';
  if (root && (!/^\/(?:[A-Za-z0-9_-]+\/?)+$/.test(root) || root.endsWith('/') || root.includes('//')))
    fail('host', 'rootContext must be a segment-bounded absolute prefix without a trailing slash');
  const selected = new Map<string, ResolvedHttpRoute>();
  const aliases = new Map<string, { owner: ResolvedHttpRoute; method: PortalHttpMethod }>();
  const replacedMethods = new Map<string, Set<string>>();
  const providerNames = new Map<string, Set<string>>();
  for (const registration of registrations) {
    const { provider, declaration } = registration;
    if (
      !declaration ||
      typeof declaration.name !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_.:-]{0,199}$/.test(declaration.name) ||
      !['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'].includes(declaration.method) ||
      typeof declaration.controller !== 'string' ||
      !declaration.controller ||
      typeof declaration.action !== 'string' ||
      !declaration.action
    )
      fail(provider, 'route requires a stable name, supported method and controller/action');
    if (declaration.replaces !== undefined && declaration.replaces !== true)
      fail(provider, `route ${declaration.name} has invalid replaces`);
    if (declaration.csrf !== undefined && typeof declaration.csrf !== 'boolean')
      fail(provider, `route ${declaration.name} has invalid csrf`);
    if (
      declaration.head &&
      (declaration.method !== 'get' || !['implicit', 'none', 'deny'].includes(declaration.head.kind))
    )
      fail(provider, `route ${declaration.name} has invalid HEAD policy`);
    const names = providerNames.get(provider) ?? new Set<string>();
    if (names.has(declaration.name)) fail(provider, `duplicate route ${declaration.name} in provider`);
    names.add(declaration.name);
    providerNames.set(provider, names);
    const alias = aliases.get(declaration.name);
    const aliasTarget = alias && (declaration.replaces || provider !== alias.owner.provider) ? alias : undefined;
    const previous =
      selected.get(declaration.name) ??
      (aliasTarget
        ? {
            ...aliasTarget.owner,
            declaration: {
              ...aliasTarget.owner.declaration,
              name: declaration.name,
              method: aliasTarget.method,
              head: undefined,
            },
            aliasOf: aliasTarget.owner,
          }
        : undefined);
    if (!!previous !== !!declaration.replaces)
      fail(
        provider,
        previous
          ? `route ${declaration.name} requires replaces: true`
          : `route ${declaration.name} replacement has no target`
      );
    if (
      previous &&
      previous.declaration.name === coreRouteName(previous.declaration.method, previous.declaration.path) &&
      (declaration.method !== previous.declaration.method ||
        coreRouteName(declaration.method, declaration.path) !== declaration.name)
    )
      fail(provider, `owned route replacement must retain its method and path: ${declaration.name}`);
    const api = declaration.api;
    if (
      api &&
      (api.method !== declaration.method ||
        expressRuntimePath(api.path) !== expressRuntimePath(declaration.path) ||
        api.controller !== declaration.controller ||
        api.action !== declaration.action ||
        api.csrf !== declaration.csrf ||
        (declaration.validation !== undefined && declaration.validation !== api.request))
    )
      fail(provider, `route ${declaration.name} API source mismatch`);
    if (api) {
      if (!registration.apiConfiguration) fail(provider, `route ${declaration.name} missing API policy source`);
      const metadata = apiMetadata(api, registration.apiConfiguration);
      if (
        JSON.stringify(metadata.access) !== JSON.stringify(declaration.access) ||
        JSON.stringify(metadata.effectivePolicies) !== JSON.stringify(registration.effectivePolicies) ||
        JSON.stringify(metadata.head) !== JSON.stringify(declaration.head)
      )
        fail(provider, `route ${declaration.name} API policy/HEAD source mismatch`);
    }
    const effectivePolicies = validateAccess(registration, new Set(options.policyNames));
    const paths = translateRoutePath(declaration.path).flatMap(path => {
      const translated = {
        ...path,
        url: root + path.url,
        ...(path.template ? { template: root + path.template } : {}),
      };
      // Express's root route accepts '/' and '//'. Under a mount prefix, the
      // second form needs its own native alias (find-my-way trims one slash).
      return root && path.url === '/' ? [translated, { ...translated, url: translated.url + '/' }] : [translated];
    });
    const resolved: ResolvedHttpRoute = {
      ...registration,
      paths,
      effectivePolicies,
      ...(previous ? { replaced: previous } : {}),
    };
    if (aliasTarget && !selected.has(declaration.name)) {
      const methods = replacedMethods.get(aliasTarget.owner.declaration.name) ?? new Set<string>();
      methods.add(aliasTarget.method.toUpperCase());
      replacedMethods.set(aliasTarget.owner.declaration.name, methods);
    }
    selected.set(declaration.name, resolved);
    // Freeze API1 reservations from the actual declarations before higher
    // providers resolve replacements. ALL's collection name remains internal.
    if (
      declaration.name === coreRouteName(declaration.method, declaration.path) &&
      !(declaration.method === 'get' && aliasTarget?.owner.declaration.method === 'all')
    ) {
      const methods: readonly PortalHttpMethod[] =
        declaration.method === 'all'
          ? ['get', 'head', 'post', 'put', 'patch', 'delete', 'options']
          : declaration.method === 'get'
            ? ['head']
            : [];
      for (const method of methods) {
        const name = coreRouteName(method, declaration.path);
        if (!selected.has(name)) aliases.set(name, { owner: resolved, method });
      }
    }
  }
  const routes = [...selected.values()];
  const probe = createNativeRouter();
  const runtimeProbe = createNativeRouter();
  const pathProbes = new Map<TranslatedPath, NativeRouter>();
  const probeFor = (path: TranslatedPath) => {
    let candidate = pathProbes.get(path);
    if (!candidate) {
      candidate = createNativeRouter();
      candidate.on('GET', path.url, { constraints: pathConstraints(path) }, () => {});
      pathProbes.set(path, candidate);
    }
    return candidate;
  };
  const selectsLater = (earlier: TranslatedPath, later: TranslatedPath, url: string) => {
    const candidate = createNativeRouter();
    for (const path of [earlier, later])
      candidate.on('GET', path.url, { constraints: pathConstraints(path) }, () => {}, path);
    return findRoute(candidate, 'GET', url)?.store === later;
  };
  // Expand every effective method before any collision deduplication. ALL uses
  // all supported Node verbs; GET contributes its explicit inventoried HEAD kind.
  const expanded: RouteBinding[] = [];
  for (const route of [...routes].sort(
    (a, b) => Number(b.declaration.method === 'head') - Number(a.declaration.method === 'head')
  ))
    for (const path of route.paths)
      for (const method of route.declaration.method === 'all' ? METHODS : [route.declaration.method.toUpperCase()]) {
        if (replacedMethods.get(route.declaration.name)?.has(method)) continue;
        expanded.push({ route, path, method: method as HTTPMethods, kind: 'action' });
        if (
          method === 'GET' &&
          route.declaration.method === 'get' &&
          !replacedMethods.get(route.declaration.name)?.has('HEAD') &&
          route.declaration.head?.kind !== 'none' &&
          // A frozen GET-only alias of ALL has an independently owned HEAD
          // reservation. Default inference must not claim that method too.
          (aliases.get(route.declaration.name)?.owner.declaration.method !== 'all' ||
            route.declaration.head?.kind === 'deny')
        )
          expanded.push({
            route,
            path,
            method: 'HEAD',
            kind: route.declaration.head?.kind === 'deny' ? 'denied-head' : 'implicit-head',
          });
      }
  const fallback: ResolvedHttpRoute = {
    provider: '@researchdatabox/redbox-core',
    effectivePolicies: [],
    declaration: {
      name: 'portal.automatic-options',
      method: 'options',
      path: '/*tail',
      controller: 'Portal',
      action: 'automaticOptions',
      access: { kind: 'public' },
      csrf: false,
    },
    paths: [root + '/*', ...(root ? [root + '/'] : [])].map(url => ({ url })),
  };
  const automatic = expanded.length
    ? fallback.paths.map(path => ({ route: fallback, path, method: 'OPTIONS', kind: 'automatic-options' }) as const)
    : [];
  // Express's automatic OPTIONS runs only after all explicit protocol handlers.
  // This built-in intended precedence is named and inspected like caller overrides.
  const precedence = [
    ...(options.precedence ?? []),
    ...routes.map(route => ({
      name: 'options-fallback.' + createHash('sha256').update(route.declaration.name).digest('hex').slice(0, 16),
      reason:
        'Express defers automatic Allow responses until explicit OPTIONS/ALL handlers have had a chance to match.',
      winner: route.declaration.name,
      over: fallback.declaration.name,
    })),
  ];
  const originalOwner = (route: ResolvedHttpRoute): ResolvedHttpRoute => {
    for (let history: ResolvedHttpRoute | undefined = route; history; history = history.replaced)
      if (history.aliasOf) return originalOwner(history.aliasOf);
    return route;
  };
  for (let index = 0; index < routes.length; index++)
    for (const other of routes.slice(index + 1)) {
      const route = routes[index];
      if (originalOwner(route) !== originalOwner(other)) continue;
      precedence.push({
        name:
          'reserved-methods.' +
          createHash('sha256')
            .update([route.declaration.name, other.declaration.name].sort().join('/'))
            .digest('hex')
            .slice(0, 16),
        reason:
          'Explicit replaces:true selects an independently reserved method of this same frozen source resource; surviving methods retain their original ownership.',
        winner: route.declaration.method === 'head' ? route.declaration.name : other.declaration.name,
        over: route.declaration.method === 'head' ? other.declaration.name : route.declaration.name,
      });
    }
  const overlaps = checkOverlaps([...expanded, ...automatic], precedence, probeFor);
  const sourceOrder = new Map(
    [...new Set(expanded.map(binding => binding.route.declaration.name))].map((name, index) => [name, index])
  );
  for (const override of options.precedence ?? [])
    if (
      expanded.some(
        a =>
          a.route.declaration.name === override.winner &&
          expanded.some(b => b.route.declaration.name === override.over && a.method === b.method)
      ) &&
      sourceOrder.get(override.winner)! > sourceOrder.get(override.over)!
    )
      fail(
        'host',
        `route precedence ${override.name} cannot retain winner ${override.winner}: declaration order contradicts the intended Express precedence`
      );

  const bindings: RouteBinding[] = [];
  // hasRoute and route() are the actual find-my-way structural identity checks.
  const add = (binding: RouteBinding, skipExisting = false) => {
    const { method, path, route } = binding;
    // find-my-way's structural hasRoute() expects its effective registered path;
    // unlike request lookup, that API does not apply ignoreTrailingSlash itself.
    const effectiveUrl = path.url.endsWith('/') && path.url !== '/' ? path.url.slice(0, -1) : path.url;
    const duplicate = probe.hasRoute(method as NativeMethod, effectiveUrl);
    if (duplicate) {
      if (!skipExisting) fail(route.provider, `route collision: ${route.declaration.name} at ${method} ${path.url}`);
      // A required OPTIONS wildcard misses bare '/'. Keep an unconstrained
      // native fallback beside it; the constrained explicit guard wins for
      // genuine captures, and synthesis handles only its native misses.
      if (binding.kind !== 'automatic-options' || runtimeProbe.hasRoute(method as NativeMethod, effectiveUrl)) return;
    }
    try {
      if (!duplicate) probe.on(method as NativeMethod, path.url, () => {});
      if (options.legacyOrder) binding = { ...binding, path: legacyPath(binding, bindings, probeFor, selectsLater) };
      runtimeProbe.on(
        method as NativeMethod,
        binding.path.url,
        { constraints: pathConstraints(binding.path) },
        () => {},
        binding
      );
    } catch (error) {
      fail(
        route.provider,
        `route collision: ${route.declaration.name} at ${method} ${path.url}: ${error instanceof Error ? error.message : 'router rejected route'}`
      );
    }
    bindings.push(binding);
  };
  // Explicit HEAD owns duplicate GET-derived identities in either input order.
  // Legacy mode keeps inferred HEAD next to GET, preserving its ALL precedence.
  const orderedBindings = options.legacyOrder
    ? expanded
    : [
        ...expanded.filter(binding => binding.kind !== 'implicit-head'),
        ...expanded.filter(binding => binding.kind === 'implicit-head'),
      ];
  for (const binding of [...orderedBindings, ...automatic])
    add(binding, binding.kind === 'implicit-head' || binding.kind === 'automatic-options');
  // Named intent must agree with actual native winners for every shared method.
  // Across different methods it records decoding/stack precedence, not ownership
  // of a method the earlier declaration does not implement.
  for (const overlap of overlaps) {
    const intended = overlap.precedence!.winner;
    for (const method of overlap.firstMethods.filter(method => overlap.secondMethods.includes(method))) {
      const eligible = bindings.filter(
        binding =>
          binding.method === method &&
          [overlap.first, overlap.second].includes(binding.route.declaration.name) &&
          findRoute(probeFor(binding.path), 'GET', overlap.witness)
      );
      const pair = createNativeRouter();
      for (const binding of eligible)
        pair.on(
          binding.method as NativeMethod,
          binding.path.url,
          { constraints: pathConstraints(binding.path) },
          () => {},
          binding
        );
      const winner = findRoute(pair, method, overlap.witness)?.store as RouteBinding | undefined;
      if (winner?.route.declaration.name !== intended)
        fail(
          'host',
          `route precedence ${overlap.precedence!.name} cannot retain winner ${intended} at ${overlap.witness}`
        );
    }
  }
  return {
    routes,
    bindings,
    overlaps,
    install(app, controllers, guards) {
      assertPortalRouter(app);
      configureMethods(app);
      // Express decodes a matching layer's captures before checking its method.
      // Preserve safe malformed-capture errors even when this method misses.
      app.addHook('onRequest', async (request, reply) => {
        if (hasMalformedCapture(matchedMethods(runtimeProbe, request.raw.url!))) return invalidRequest(request, reply);
      });
      // HEAD first also protects installation on an instance whose global
      // exposeHeadRoutes was left enabled. Every GET disables it individually.
      const ordered = [...bindings].sort((a, b) => Number(b.method === 'HEAD') - Number(a.method === 'HEAD'));
      const handlers = new Map(
        bindings
          .filter(b => b.kind !== 'automatic-options' && b.kind !== 'denied-head')
          .map(b => [b, controllers.action(b.route.declaration)])
      );
      for (const binding of ordered) {
        const { path, method, route } = binding;
        app.route({
          method,
          url: path.url,
          constraints: pathConstraints(path),
          exposeHeadRoute: false,
          config: { redboxRoute: binding },
          onSend:
            method === 'HEAD'
              ? async (_request, reply, payload: unknown) => {
                  if (!reply.hasHeader('content-length') && (typeof payload === 'string' || Buffer.isBuffer(payload)))
                    reply.header('content-length', Buffer.byteLength(payload));
                  if (payload instanceof Readable) {
                    payload.on('error', () => reply.log.error('HEAD response stream failed'));
                    payload.resume();
                  } else if (payload instanceof ReadableStream) {
                    await payload.cancel('HEAD response');
                  }
                  return null;
                }
              : undefined,
          handler: async (request, reply) => {
            if (binding.kind === 'automatic-options') {
              const matches = matchedMethods(runtimeProbe, request.raw.url!);
              if (hasMalformedCapture(matches)) return invalidRequest(request, reply);
              const allow = matches
                .filter(match => match.method !== 'OPTIONS')
                .map(match => match.method)
                .sort()
                .join(', ');
              if (!allow) return reply.callNotFound();
              return reply
                .header('Allow', allow)
                .header('X-Content-Type-Options', 'nosniff')
                .type('text/plain')
                .send(allow);
            }
            const params = request.params as Record<string, string>;
            for (const { name, suffix } of path.suffixes ?? []) {
              params[name] = params[name].slice(0, -suffix.length);
            }
            if (path.wildcard) {
              // find-my-way trims the optional trailing slash before lookup. It
              // belongs to a wildcard key, even when the final segment is empty.
              const tail = params['*'] + ((request.raw.url ?? '').split('?')[0].endsWith('/') ? '/' : '');
              if (path.wildcard.required && !tail) return reply.callNotFound();
              delete params['*'];
              if (tail) params[path.wildcard.name] = tail;
            }
            try {
              for (const name of Object.keys(params)) params[name] = decodeURIComponent(params[name]);
            } catch {
              return invalidRequest(request, reply);
            }
            await guards(binding, request, reply);
            if (reply.sent) return;
            if (binding.kind === 'denied-head') {
              const head = route.declaration.head;
              if (head?.kind === 'deny' && head.allow) reply.header('Allow', head.allow);
              return reply.code(405).send();
            }
            return handlers.get(binding)!(request, reply);
          },
        });
      }
    },
  };
}
