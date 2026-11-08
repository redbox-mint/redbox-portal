import type { FastifyReply, FastifyRequest } from 'fastify';
import type { BrandingRepository, BrandRow } from '../../persistence/branding/BrandingRepository';
import type { PathRules, RuleRole } from '../../authorization/PathRules';
import { schemaProblem } from '../../api-routes/schemaDelivery';
import {
  buildRecordSchemaForbiddenProblem,
  RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
  RECORD_SCHEMA_RESPONSE_VARY,
} from '../../api-routes/record-schema-response';
import {
  requestContext,
  resolveRequestActor,
  resolveRequestBrand,
  clearRequestActor,
  type AuthenticatedActor,
} from '../context';
import type { RouteComposition, RouteGuards } from './routes';
import type { createNativeCsrf } from './csrf';
import { requestPathname } from './router';
import { sendLoginRedirect } from './responses';
import { requestString } from '../requestValues';
import { httpReplySubmitted } from './errorBoundary';

export type NativePolicy = (request: FastifyRequest, reply: FastifyReply) => unknown | Promise<unknown>;
export interface NativePolicyInput {
  readonly branding: Pick<BrandingRepository, 'getBrand'>;
  readonly pathRules: Pick<PathRules, 'getRulesFromPath' | 'canRead'>;
  readonly portals: readonly string[];
  defaultUnauthenticatedRole(brand: BrandRow): Promise<RuleRole | undefined> | RuleRole | undefined;
  authenticate(request: FastifyRequest): Promise<AuthenticatedActor | false>;
  emitRequestFailure(
    request: FastifyRequest,
    event: 'authorization.failure',
    source: 'AuthorizationPolicy'
  ): Promise<void>;
  readonly loginPath?: string;
  readonly rootContext?: string;
}
export const nativePolicyNames = Object.freeze([
  'nocache',
  'brandingandportal',
  'browseractor',
  'browserauthenticated',
  'iswebserviceauthenticated',
  'brandactor',
  'checkauth',
  'checkrecordschemaauth',
] as const);
export function createNativePolicies(input: NativePolicyInput): Readonly<Record<string, NativePolicy>> {
  const branded = new WeakSet<FastifyRequest>();
  const path = (request: FastifyRequest) =>
    (requestPathname(request.raw.url ?? '/') ?? '/').slice((input.rootContext ?? '').length) || '/';
  const schema = (request: FastifyRequest) => request.routeOptions.url?.includes('/api/records/schemas/') === true;
  const problem = (reply: FastifyReply) =>
    reply
      .headers({
        'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
        Vary: RECORD_SCHEMA_RESPONSE_VARY,
      })
      .type(RECORD_SCHEMA_PROBLEM_MEDIA_TYPE);
  const redirect = (request: FastifyRequest, reply: FastifyReply) => {
    const { brand, portal } = requestContext(request);
    request.session?.set('redirUrl', request.raw.url);
    return sendLoginRedirect(
      request,
      reply,
      (input.rootContext ?? '') + '/' + brand.name + '/' + portal + '/' + (input.loginPath ?? 'user/login')
    );
  };
  const checkAuth =
    (schemaResponse: boolean): NativePolicy =>
    async (request, reply) => {
      let context = requestContext(request);
      const actor = context.actor ?? (await input.authenticate(request));
      if (actor && !context.actor) {
        resolveRequestActor(request, actor);
        context = requestContext(request);
      }
      const { brand } = context;
      const guest = actor ? undefined : await input.defaultUnauthenticatedRole(brand);
      const roles = context.actor ? context.actor.roles : guest ? [guest] : [];
      const rules = input.pathRules.getRulesFromPath(path(request), brand);
      if (!rules || input.pathRules.canRead(rules, roles, brand.name ?? '')) return;
      const json = requestString(request.headers['content-type'])?.includes('application/json') === true;
      if (schemaResponse || actor || json) {
        try {
          await input.emitRequestFailure(request, 'authorization.failure', 'AuthorizationPolicy');
        } catch {
          /* observation only */
        }
      }
      if (schemaResponse)
        return problem(reply)
          .code(403)
          .send(buildRecordSchemaForbiddenProblem(path(request)));
      if (actor) return reply.code(403).send();
      if (json) return reply.code(403).send({ message: 'Access Denied' });
      return redirect(request, reply);
    };
  return Object.freeze({
    nocache: async (_request, reply) => {
      reply.headers({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'Surrogate-Control': 'no-store',
      });
    },
    brandingandportal: async (request, reply) => {
      const { branding, portal } = request.params as Record<string, unknown>;
      const missing = () =>
        schema(request)
          ? problem(reply)
              .code(404)
              .send(schemaProblem('not-found', path(request)))
          : reply.code(404).send();
      if (
        typeof branding !== 'string' ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(branding) ||
        typeof portal !== 'string' ||
        !input.portals.includes(portal)
      )
        return missing();
      const brand = await input.branding.getBrand({ name: branding }, true);
      if (!brand?.id) return missing();
      // Explicit API policies precede the configured mapping, so a core policy
      // can legitimately occur in both chains. Keep the first immutable context;
      // a repeated policy must never select a different tenant or portal.
      if (branded.has(request)) {
        const selected = requestContext(request);
        if (selected.brand.id !== brand.id || selected.portal !== portal)
          throw new Error('Request brand has already been resolved.');
        clearRequestActor(request);
        return;
      }
      resolveRequestBrand(request, brand, portal);
      branded.add(request);
    },
    browseractor: async request => {
      requestContext(request);
      const actor = await input.authenticate(request);
      if (actor) resolveRequestActor(request, actor);
    },
    browserauthenticated: async (request, reply) => {
      if (!requestContext(request).actor) return redirect(request, reply);
    },
    iswebserviceauthenticated: async (request, reply) => {
      // A missing brand is a composition/order error, never a default tenant.
      requestContext(request);
      const actor = await input.authenticate(request);
      if (actor) {
        resolveRequestActor(request, actor);
        return;
      }
      reply.header('WWW-Authenticate', 'Bearer');
      if (schema(request))
        return problem(reply)
          .code(401)
          .send(schemaProblem('authentication-required', path(request)));
      return reply.code(401).send({ message: 'Authentication required', details: '' });
    },
    brandactor: async (request, reply) => {
      const { actor, brand } = requestContext(request);
      if (actor?.roles.some(role => role.brandId === brand.id)) return;
      return schema(request)
        ? problem(reply)
            .code(403)
            .send(buildRecordSchemaForbiddenProblem(path(request)))
        : reply.code(403).send();
    },
    checkauth: checkAuth(false),
    checkrecordschemaauth: checkAuth(true),
  });
}

/** Bind the resolved chain before readiness. Validation belongs to each action's
 * explicit prelude, never Fastify's earlier JSON-schema validation stage. */
export function bindNativeRouteSecurity(
  plan: Pick<RouteComposition, 'routes'>,
  policies: Readonly<Record<string, NativePolicy>>,
  csrf: Pick<ReturnType<typeof createNativeCsrf>, 'protect' | 'apiProtect' | 'token'>
): RouteGuards {
  const bound = new Map(
    plan.routes.map(route => {
      if (
        !route.declaration.access ||
        !Array.isArray(route.effectivePolicies) ||
        (!route.effectivePolicies.length && route.declaration.access.kind !== 'public')
      )
        throw new TypeError('HTTP route requires explicit access: ' + route.declaration.name);
      const chain = route.effectivePolicies.map(name => {
        if (name === false)
          return (async (_request, reply) => {
            return reply.code(403).send();
          }) as NativePolicy;
        if (!Object.hasOwn(policies, name) || typeof policies[name] !== 'function')
          throw new TypeError('HTTP route requires an unbound policy: ' + name);
        return policies[name];
      });
      const mode =
        route.effectiveCsrf ?? (route.declaration.csrf ? (route.declaration.api ? 'apiProtect' : 'protect') : 'none');
      let guard: NativePolicy | undefined;
      switch (mode) {
        case 'none':
        case 'verified provider assertion (no synchronizer token)':
        case 'provider state/PKCE/nonce; HEAD begin is denied':
          break;
        case 'protect':
          guard = csrf.protect;
          break;
        case 'apiProtect':
        case 'apiProtect on ALL methods, including HEAD/OPTIONS':
          guard = csrf.apiProtect;
          break;
        case 'protect except GET/HEAD/OPTIONS':
          guard = (request, reply) =>
            ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ? undefined : csrf.protect(request, reply);
          break;
        case 'canonical-origin; generate and await session save':
          guard = csrf.token;
          break;
        default:
          throw new TypeError('HTTP route requires an unbound CSRF adapter: ' + mode);
      }
      return [route.declaration.name, [...chain, ...(guard ? [guard] : [])]] as const;
    })
  );
  return async (binding, request, reply) => {
    const chain = bound.get(binding.route.declaration.name);
    if (!chain) throw new TypeError('HTTP route has no bound security chain.');
    for (const policy of chain) {
      await policy(request, reply);
      if (httpReplySubmitted(reply)) return reply;
    }
  };
}
