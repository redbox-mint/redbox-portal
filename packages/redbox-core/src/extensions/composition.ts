import type { Server } from 'node:http';
import type { RequestHandler, Router } from 'express';
import {
  ApplicationRuntime,
  runApplicationMigrations,
  type ApplicationModule,
  type ApplicationInitialization,
} from '../application';
import type { PersistenceOwner } from '../persistence/owner';
import { initializeMigrationPersistence, getMigrationLedgerRepository } from '../persistence/migration/runtime';
import type { ExtensionFactory, ExtensionHostIntegration, ExtensionWork } from './contract';
import { ExtensionError } from './loading';
import type { ResolvedExtensions, ResolvedRegistration } from './resolution';

/** Compose the selected factory with its concrete, factory-specific input. */
export function bindExtensionFactory<Input, Output>(
  factory: ExtensionFactory<Input, Output>,
  input: Input
): () => Output {
  return () => factory.create(input);
}

export function bindExtensionWork<Input>(
  work: { run(input: Input): Promise<void> },
  input: Input
): () => Promise<void> {
  return () => work.run(input);
}

export interface ExtensionBindings {
  work?(registration: ResolvedRegistration<ExtensionWork>): () => Promise<void>;
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
  bindings: ExtensionBindings,
  initialization: Omit<ApplicationInitialization, 'migrations' | 'extensionBootstrap'> & {
    readonly appVersion?: string;
  } = {}
) {
  if (resolved.handlers.length && !bindings.handler) throw new ExtensionError('host', 'bind HTTP handler factories');
  if (resolved.integrations.length && !bindings.integration)
    throw new ExtensionError('host', 'bind server integration factories');
  if (resolved.routes.some(item => item.declaration.access !== 'public') && !bindings.policies)
    throw new ExtensionError('host', 'bind route policy execution');
  if ((resolved.migrations.length || resolved.bootstrap.length) && !bindings.work)
    throw new ExtensionError('application', 'bind migration and bootstrap operations before acquisition');
  const migrations = resolved.migrations.map(registration => ({
    name: registration.declaration.name,
    source: registration.provider,
    up: bindings.work!(registration),
  }));
  const work = resolved.bootstrap.map(registration => ({
    name: registration.declaration.name,
    requires: registration.declaration.requires,
    run: bindings.work!(registration),
    provider: registration.provider,
  }));
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
  const application = new ApplicationRuntime(owner, factories, {
    ...initialization,
    migrations: async () => {
      if (!migrations.length) return;
      await initializeMigrationPersistence(owner);
      await runApplicationMigrations(migrations, {
        ledger: getMigrationLedgerRepository(owner),
        appVersion: initialization.appVersion,
        context: {},
        log: { debug() {}, info() {}, warn: message => owner.log.warn(String(message)), error() {} },
      });
    },
    coreBootstrap: [...(initialization.coreBootstrap ?? []), ...work.filter(item => item.provider === 'core')],
    extensionBootstrap: work.filter(item => item.provider !== 'core'),
  });
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
