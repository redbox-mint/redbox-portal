import type { Request, RequestHandler } from 'express';
import type { ApiRouteDefinition } from '../../api-routes/types';
import type { BrandingRepository, BrandRow } from '../../persistence/branding/BrandingRepository';
import type { IdentityRepositories } from '../../persistence/identity/IdentityRepositories';
import type { PoliciesConfig, PolicyChain } from '../../config/policies.config';
import type { AuthenticatedActor } from './identity';
import UrlPattern from 'url-pattern';
import { httpAction } from './middleware';

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

export interface PilotPolicyInput {
  readonly branding: Pick<BrandingRepository, 'getBrand'>;
  readonly identity: Pick<IdentityRepositories, 'list'>;
  readonly portals: readonly string[];
  /** Returns only the server-authenticated actor, never a request body/session.user snapshot. */
  authenticate(req: Request): Promise<AuthenticatedActor | false>;
}
function normalizePath(path: string): string {
  return path.replace(/\/$/, '').toLowerCase();
}
export function createPilotPolicies(input: PilotPolicyInput): Readonly<Record<string, RequestHandler>> {
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
      const brand = await input.branding.getBrand({ name: branding });
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
    checkauth: async (req, res, next) => {
      const { actor, brand } = requestContext(req);
      if (!actor) {
        res.status(403).end();
        return;
      }
      const roles = actor.roles.filter(role => role.brandId === brand.id);
      if (!roles.length) {
        res.status(403).end();
        return;
      }
      const rules = await input.identity.list('pathrule', { branding: brand.id });
      const allowed = rules.some(rule => {
        const role = rule.role;
        const roleId = typeof role === 'object' ? String(role.id) : String(role);
        return (
          (rule.can_read === true || rule.can_update === true) &&
          roles.some(role => role.id === roleId) &&
          new UrlPattern(normalizePath(rule.path)).match(normalizePath(req.path)) !== null
        );
      });
      if (!allowed) {
        res.status(403).end();
        return;
      }
      next();
    },
  };
}

export const pilotPolicyChain = ['noCache', 'brandingAndPortal', 'isWebServiceAuthenticated', 'checkAuth'] as const;
