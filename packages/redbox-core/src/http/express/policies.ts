import type { Request, RequestHandler } from 'express';
import type { ApiRouteDefinition } from '../../api-routes/types';
import type { BrandingRepository, BrandRow } from '../../persistence/branding/BrandingRepository';
import type { PathRules, RuleRole } from '../../authorization/PathRules';
import type { PoliciesConfig, PolicyChain } from '../../config/policies.config';
import type { AuthenticatedActor } from './identity';
import { httpAction } from './middleware';
import {
  buildRecordSchemaForbiddenProblem,
  RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
  RECORD_SCHEMA_RESPONSE_VARY,
} from '../../api-routes/record-schema-response';

export interface HttpRequestContext {
  readonly brand: BrandRow;
  readonly portal: string;
  readonly actor?: AuthenticatedActor;
}
const contextKey = Symbol('redbox-http-context');
export function requestContext(req: Request): HttpRequestContext {
  const value: HttpRequestContext | undefined = Reflect.get(req, contextKey);
  if (!value) throw new Error('Request context has not been resolved.');
  return value;
}

function normalizeTarget(target: string): string {
  return target.replace(/Controller(?=\/|$)/g, '').toLowerCase();
}
function chain(value: PolicyChain): readonly (string | false)[] {
  if (value === true) return [];
  if (value === false) return [false];
  const result = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(result) || result.some(name => typeof name !== 'string' || !name.trim()))
    throw new TypeError('Policies must be boolean or an ordered list of names.');
  return result.map(name => name.toLowerCase());
}

/** Sails route policies precede the most specific action/controller/global mapping. */
export function resolveEffectivePolicies(
  route: Pick<ApiRouteDefinition, 'controller' | 'action' | 'policy'>,
  configuration: PoliciesConfig
): readonly (string | false)[] {
  const mappings = new Map<string, PolicyChain>();
  const add = (target: string, value: PolicyChain | undefined) => {
    if (value === undefined) return;
    const key = normalizeTarget(target);
    if (mappings.has(key)) throw new TypeError('Duplicate normalized policy target.');
    chain(value); // Validate even mappings not selected for this route.
    mappings.set(key, value);
  };
  for (const [target, value] of Object.entries(configuration)) {
    if (value && typeof value === 'object' && !Array.isArray(value))
      for (const [action, actionPolicies] of Object.entries(value)) add(target + '/' + action, actionPolicies);
    else
      add(
        normalizeTarget(target) === normalizeTarget(route.controller) ? target + '/*' : target,
        value as PolicyChain | undefined
      );
  }
  const target = normalizeTarget(route.controller + '/' + route.action);
  const keys = [...mappings.keys()].filter(
    key => key === '*' || key === target || (key.endsWith('/*') && target.startsWith(key.slice(0, -1)))
  );
  keys.sort((a, b) => b.length - a.length);
  return [...(route.policy === undefined ? [] : chain(route.policy)), ...chain(mappings.get(keys[0]) ?? false)];
}

export function bindHttpPolicies(
  names: readonly (string | false)[],
  policies: Readonly<Record<string, RequestHandler>>
): RequestHandler[] {
  return names.map(name => {
    if (name === false)
      return (_req, res) => {
        res.status(403).end();
      };
    const policy = policies[name];
    if (!policy) throw new Error('HTTP route requires an unbound policy: ' + name);
    return httpAction(async (req, res, next) => {
      await policy(req, res, next);
    });
  });
}

export interface HttpPolicyInput {
  readonly branding: Pick<BrandingRepository, 'getBrand'>;
  readonly pathRules: Pick<PathRules, 'getRulesFromPath' | 'canRead'>;
  readonly portals: readonly string[];
  defaultUnauthenticatedRole(brand: BrandRow): Promise<RuleRole | undefined> | RuleRole | undefined;
  /** Bind the selected SecurityEventService; returned work remains in the request lifetime. */
  emitRequestFailure(req: Request, event: 'authorization.failure', source: 'AuthorizationPolicy'): Promise<void>;
  readonly loginPath?: string;
  readonly rootContext?: string;
  /** Returns only the server-authenticated actor, never a request body/session.user snapshot. */
  authenticate(req: Request): Promise<AuthenticatedActor | false>;
}
export function createHttpPolicies(input: HttpPolicyInput): Readonly<Record<string, RequestHandler>> {
  const checkAuth =
    (schema: boolean): RequestHandler =>
    async (req, res, next) => {
      const context = requestContext(req);
      const actor = context.actor ?? (await input.authenticate(req));
      if (actor && !context.actor) Reflect.set(req, contextKey, Object.freeze({ ...context, actor }));
      const { brand, portal } = context;
      const guest = actor ? undefined : await input.defaultUnauthenticatedRole(brand);
      const roles = actor ? actor.roles.filter(role => role.brandId === brand.id) : guest ? [guest] : [];
      const rules = input.pathRules.getRulesFromPath(req.path, brand);
      // Legacy paths without a rule proceed. Authentication and object/brand policies
      // remain independent requirements of their route's effective chain.
      if (!rules || input.pathRules.canRead(rules, roles, brand.name ?? '')) {
        next();
        return;
      }
      const json = req.get('content-type')?.includes('application/json') === true;
      if (schema || actor || json) await input.emitRequestFailure(req, 'authorization.failure', 'AuthorizationPolicy');
      if (schema) {
        res
          .set({
            'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
            Vary: RECORD_SCHEMA_RESPONSE_VARY,
            'Content-Type': RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
          })
          .status(403)
          .json(buildRecordSchemaForbiddenProblem(req.path));
      } else if (actor) res.status(403).end();
      else if (json) res.status(403).json({ message: 'Access Denied' });
      else {
        if (req.session) req.session.redirUrl = req.originalUrl;
        res.redirect(
          (input.rootContext ?? '') + '/' + brand.name + '/' + portal + '/' + (input.loginPath ?? 'user/login')
        );
      }
    };
  return {
    nocache: (_req, res, next) => {
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'Surrogate-Control': 'no-store',
      });
      next();
    },
    brandingandportal: async (req, res, next) => {
      const { branding, portal } = req.params;
      if (
        typeof branding !== 'string' ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(branding) ||
        typeof portal !== 'string' ||
        !input.portals.includes(portal)
      ) {
        res.status(404).end();
        return;
      }
      const brand = await input.branding.getBrand({ name: branding }, true);
      if (!brand) {
        res.status(404).end();
        return;
      }
      Reflect.set(req, contextKey, Object.freeze({ brand, portal }));
      next();
    },
    iswebserviceauthenticated: async (req, res, next) => {
      const context = requestContext(req);
      const actor = await input.authenticate(req);
      if (!actor) {
        res.setHeader('WWW-Authenticate', 'Bearer');
        res.status(401).json({ message: 'Authentication required', details: '' });
        return;
      }
      Reflect.set(req, contextKey, Object.freeze({ ...context, actor }));
      next();
    },
    brandactor: (req, res, next) => {
      const { actor, brand } = requestContext(req);
      if (!actor?.roles.some(role => role.brandId === brand.id)) res.status(403).end();
      else next();
    },
    checkauth: checkAuth(false),
    checkrecordschemaauth: checkAuth(true),
  };
}

export const pilotPolicyChain = [
  'noCache',
  'brandingAndPortal',
  'isWebServiceAuthenticated',
  'brandActor',
  'checkAuth',
] as const;

/** Retained pilot entry names; both hosts bind the same policy implementation. */
export const createPilotPolicies = createHttpPolicies;
export type PilotPolicyInput = HttpPolicyInput;
