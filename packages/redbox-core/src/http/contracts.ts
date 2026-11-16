import type { FastifyReply, FastifyRequest, RouteGenericInterface } from 'fastify';
import type { ExtensionFactory } from '../extensions/contract';
import type { ApiRouteDefinition } from '../api-routes/types';

/** RouteAccess authoring contract.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export type RouteAccess =
  | { readonly kind: 'public' }
  | { readonly kind: 'policies'; readonly names: readonly [string, ...string[]] }
  | { readonly kind: 'deny' };

/** PortalHttpMethod authoring contract.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export type PortalHttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options';

/** HttpRouteDeclaration authoring contract.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export interface HttpRouteDeclaration extends ControllerTarget {
  readonly name: string;
  readonly method: PortalHttpMethod;
  /** Inventory grammar: unencoded ASCII literals, whole-segment :params,
   * terminal {/:param}, terminal /*name, .css/.json/.woff2 parameter suffixes,
   * and the legacy datastream{*tail} optional suffix. Other constructs fail composition.
   */
  readonly path: string;
  readonly access: RouteAccess;
  readonly csrf?: boolean;
  readonly replaces?: true;
  /** The executable declaration remains the source of validation and response metadata. */
  readonly api?: ApiRouteDefinition;
}

/** Object/prototype machinery is never an HTTP action, even if callable. */
export type ForbiddenControllerAction =
  | 'constructor'
  | 'prototype'
  | '__proto__'
  | '__defineGetter__'
  | '__defineSetter__'
  | '__lookupGetter__'
  | '__lookupSetter__'
  | 'hasOwnProperty'
  | 'isPrototypeOf'
  | 'propertyIsEnumerable'
  | 'toLocaleString'
  | 'toString'
  | 'valueOf';

/** Callable keys only; action-specific Fastify signatures are checked by authors/fixtures.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export type ControllerMethodName<C extends object> = Exclude<
  { [K in keyof C]-?: C[K] extends (...args: never[]) => unknown ? K : never }[keyof C] & string,
  ForbiddenControllerAction
>;

/** ControllerFactory authoring contract.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export interface ControllerFactory<Input, C extends object> extends ExtensionFactory<Input, C> {
  readonly actions: readonly ControllerMethodName<C>[];
}

/** Heterogeneous declaration collection. Concrete input types stay on the original factory.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export interface ControllerRegistration extends ExtensionFactory<never, object> {
  readonly actions: readonly string[];
}

/** ControllerTarget authoring contract.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export interface ControllerTarget {
  readonly controller: string;
  readonly action: string;
}

/** ControllerAction authoring contract.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export type ControllerAction<RouteGeneric extends RouteGenericInterface = RouteGenericInterface> = (
  request: FastifyRequest<RouteGeneric>,
  reply: FastifyReply
) => unknown;

/** Explicit application scope includes admitted unmatched requests, never host probes.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export type HttpHookScope =
  | { readonly kind: 'routes'; readonly names: readonly string[] }
  | { readonly kind: 'application' };

/** Detached, immutable observation data. No live request, transport, session or logger.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export interface HttpObservationRequest {
  readonly id: string;
  readonly method: string;
  readonly url: string;
  readonly routeName?: string;
  readonly statusCode: number;
}
/** SafeHttpError authoring contract.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export interface SafeHttpError {
  readonly code: string;
  readonly statusCode: number;
  readonly requestId: string;
}
interface HttpHookBase {
  readonly name: string;
  readonly scope: HttpHookScope;
  /** Hook names in this same stage. Dependencies run first. */
  readonly requires?: readonly string[];
  readonly replaces?: true;
}
/** HttpHookContribution authoring contract.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export type HttpHookContribution = HttpHookBase &
  (
    | {
        readonly stage: 'afterAuthentication' | 'beforeAction';
        run(request: FastifyRequest, reply: FastifyReply): Promise<void>;
      }
    | { readonly stage: 'onResponse'; observe(request: HttpObservationRequest): Promise<void> }
    | { readonly stage: 'onError'; observe(request: HttpObservationRequest, error: SafeHttpError): Promise<void> }
  );
/** HttpFallbackContribution authoring contract.
 * @extensionPoint Use through the public HTTP or extensions entrypoint; bind concrete application inputs and preserve route security.
 */
export interface HttpFallbackContribution extends ControllerTarget {
  readonly name: string;
  /** Literal, segment-bounded prefix, relative to the configured root context. */
  readonly prefix: string;
  readonly access: RouteAccess;
  readonly csrf?: boolean;
  readonly replaces?: true;
  /** Trusted literal context; never inferred from an unmatched URL. Normal policies resolve it. */
  readonly context?: { readonly branding: string; readonly portal: string };
}
