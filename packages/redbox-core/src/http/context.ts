import type { FastifyRequest } from 'fastify';
import type { BrandRow } from '../persistence/branding/BrandingRepository';
import type { AuthenticatedActor } from './express/identity';

export type { BrandRow, AuthenticatedActor };
export interface HttpRequestContext {
  readonly brand: BrandRow;
  readonly portal: string;
  readonly actor?: AuthenticatedActor;
}

const contexts = new WeakMap<FastifyRequest, HttpRequestContext>();

/** Available only after the route's explicit brand resolution policy. */
export function requestContext(request: FastifyRequest): HttpRequestContext {
  const context = contexts.get(request);
  if (!context) throw new Error('Request context has not been resolved.');
  return context;
}

function freeze<T>(value: T, visited = new WeakSet<object>()): T {
  if (value && typeof value === 'object' && !visited.has(value)) {
    visited.add(value);
    for (const child of Object.values(value)) freeze(child, visited);
    Object.freeze(value);
  }
  return value;
}

/** Binding-layer storage; deliberately absent from the public HTTP entrypoint. */
export function resolveRequestBrand(request: FastifyRequest, brand: BrandRow, portal: string): void {
  if (contexts.has(request)) throw new Error('Request brand has already been resolved.');
  contexts.set(request, Object.freeze({ brand: freeze(structuredClone(brand)), portal }));
}

/** A repeated core branding policy retains its tenant snapshot but, like Express,
 * requires the following configured authorization policy to resolve the actor again. */
export function clearRequestActor(request: FastifyRequest): void {
  const selected = requestContext(request);
  if (selected.actor) contexts.set(request, Object.freeze({ brand: selected.brand, portal: selected.portal }));
}

/** Never retain a session/repository actor or roles belonging to another brand. @internal */
export function resolveRequestActor(request: FastifyRequest, actor: AuthenticatedActor): void {
  const context = requestContext(request);
  contexts.set(
    request,
    Object.freeze({
      ...context,
      actor: Object.freeze({
        id: actor.id,
        username: actor.username,
        type: actor.type,
        name: actor.name,
        email: actor.email,
        roles: Object.freeze(
          actor.roles
            .filter(role => role.brandId === context.brand.id)
            .map(role =>
              Object.freeze({
                id: role.id,
                brandId: role.brandId,
                name: role.name,
              })
            )
        ),
      }),
    })
  );
}
