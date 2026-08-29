import type { AuthorizationContext, ScopeKey } from '../authorization';
import { requireRequestAuthorizationContext } from '../authorization';
import { resolveRouteAuthorizationForRequest } from './authorization-route-resolution';

export interface RequestResourceAuthorization {
  readonly context: AuthorizationContext;
  readonly requiredScope: ScopeKey;
  readonly routeId: string;
}

/**
 * Extracts the server-resolved authority and exact scoped route declaration.
 * The immutable result is memoized only on this request; body/query values are
 * never consulted for brand, scope, actor, or process authority.
 */
export function requireRequestResourceAuthorization(req: Sails.Req): RequestResourceAuthorization {
  if (req.resourceAuthorization !== undefined) return req.resourceAuthorization;
  const context = requireRequestAuthorizationContext(req);
  const route = resolveRouteAuthorizationForRequest(req);
  if (route?.authorization.kind !== 'scope') {
    throw new Error('A resource-owning action requires an explicit scoped route declaration.');
  }
  const extracted = Object.freeze({
    context,
    requiredScope: route.authorization.scope,
    routeId: route.routeId,
  });
  req.resourceAuthorization = extracted;
  return extracted;
}

export function requireRequestBrandId(req: Sails.Req): string {
  const { context } = requireRequestResourceAuthorization(req);
  const brandId = context.brand?.id?.trim();
  if (!brandId || !context.brand?.exists || !context.brand.authorized) {
    throw new Error('The request does not have an authorized brand context.');
  }
  return brandId;
}
