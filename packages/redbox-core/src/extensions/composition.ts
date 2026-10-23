import type { Server } from 'node:http';
import type { RequestHandler, Router } from 'express';
import { ApplicationRuntime, type ApplicationModule } from '../application';
import type { PersistenceOwner } from '../persistence/owner';
import type { ExtensionFactory, ExtensionHostIntegration } from './contract';
import { ExtensionError } from './loading';
import type { ResolvedExtensions, ResolvedRegistration } from './resolution';

/** Compose the selected factory with its concrete, factory-specific input. */
export function bindExtensionFactory<Input, Output>(
  factory: ExtensionFactory<Input, Output>,
  input: Input
): () => Output {
  return () => factory.create(input);
}

export interface ExtensionBindings {
  module(registration: ResolvedRegistration<ExtensionFactory>): () => ApplicationModule;
  handler?(registration: ResolvedRegistration<ExtensionFactory<never, RequestHandler>>): () => RequestHandler;
  integration?(
    registration: ResolvedRegistration<ExtensionFactory<never, ExtensionHostIntegration>>
  ): () => ExtensionHostIntegration;
  /** Host policy execution is mandatory for protected routes, never inferred from docs. */
  policies?(names: readonly string[]): RequestHandler;
}

/** Per-application wiring. Binding is offline; only selected factories ever run. */
export function composeExtensionApplication(
  owner: PersistenceOwner,
  resolved: ResolvedExtensions,
  bindings: ExtensionBindings
) {
  if (resolved.handlers.length && !bindings.handler) throw new ExtensionError('host', 'bind HTTP handler factories');
  if (resolved.integrations.length && !bindings.integration)
    throw new ExtensionError('host', 'bind server integration factories');
  if (resolved.routes.some(item => item.declaration.access !== 'public') && !bindings.policies)
    throw new ExtensionError('host', 'bind route policy execution');
  const integrations = new Map<string, ExtensionHostIntegration>();
  const handlers = resolved.handlers.map(registration => ({
    name: registration.declaration.name,
    create: bindings.handler!(registration),
  }));
  const factories = resolved.modules.map(registration => ({
    name: registration.declaration.name,
    create: bindings.module(registration),
  }));
  for (const registration of resolved.integrations) {
    const create = bindings.integration!(registration);
    const name = registration.declaration.name;
    factories.push({
      name: 'host-' + name,
      create: () => {
        const instance = create();
        integrations.set(name, instance);
        return {
          initialize: () => instance.initialize(),
          activate: () => instance.activate?.() ?? Promise.resolve(),
          drain: () => instance.drain?.() ?? Promise.resolve(),
          close: async () => {
            await instance.close();
            integrations.delete(name);
          },
        };
      },
    });
  }
  const application = new ApplicationRuntime(owner, factories);
  let preparing: Promise<void> | undefined;
  return {
    application,
    /** Supply directly to ExpressHost.prepare; its existing gate owns admission. */
    prepare(router: Router, server: Server): Promise<void> {
      if (application.status().state !== 'initialized')
        return Promise.reject(new ExtensionError('host', 'initialize application before HTTP preparation'));
      return (preparing ??= Promise.resolve().then(async () => {
        const instances = new Map(handlers.map(item => [item.name, item.create()]));
        for (const instance of integrations.values()) await instance.prepare(server);
        for (const stage of ['beforeRoutes', 'afterRoutes'] as const) {
          if (stage === 'afterRoutes') {
            for (const { declaration: route } of resolved.routes) {
              const chain = route.access === 'public' ? [] : [bindings.policies!(route.access)];
              router[route.method](route.path, ...chain, instances.get(route.handler)!);
            }
          }
          for (const { declaration: middleware } of resolved.middleware)
            if (middleware.stage === stage) router.use(instances.get(middleware.handler)!);
        }
      }));
    },
  };
}
