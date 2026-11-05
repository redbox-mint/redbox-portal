import type { FastifyReply, FastifyRequest, RouteGenericInterface } from 'fastify';
import type { ExtensionFactory } from '../extensions/contract';

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

/** Callable keys only; action-specific Fastify signatures are checked by authors/fixtures. */
export type ControllerMethodName<C extends object> = Exclude<
  { [K in keyof C]-?: C[K] extends (...args: never[]) => unknown ? K : never }[keyof C] & string,
  ForbiddenControllerAction
>;

export interface ControllerFactory<Input, C extends object> extends ExtensionFactory<Input, C> {
  readonly actions: readonly ControllerMethodName<C>[];
}

/** Heterogeneous declaration collection. Concrete input types stay on the original factory. */
export interface ControllerRegistration extends ExtensionFactory<never, object> {
  readonly actions: readonly string[];
}

export interface ControllerTarget {
  readonly controller: string;
  readonly action: string;
}

export type ControllerAction<RouteGeneric extends RouteGenericInterface = RouteGenericInterface> = (
  request: FastifyRequest<RouteGeneric>,
  reply: FastifyReply
) => unknown;
