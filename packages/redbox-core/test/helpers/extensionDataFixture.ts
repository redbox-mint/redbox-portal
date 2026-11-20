import {
  ApplicationRuntime,
  runApplicationMigrations,
  type ApplicationInitialization,
  type ApplicationModule,
} from '../../src/application';
import { initializeMigrationPersistence, getMigrationLedgerRepository } from '../../src/persistence/migration/runtime';
import type { PersistenceOwner } from '../../src/persistence/owner';
import type { ExtensionFactory, ExtensionWork } from '../../src/extensions/contract';
import type { ResolvedExtensionData, ResolvedRegistration } from '../../src/extensions/resolution';

/** Domain-only fixture. HTTP composition is exercised through the production bootstrap. */
export function extensionDataFixture(
  owner: PersistenceOwner,
  resolved: ResolvedExtensionData,
  bindings: {
    module(registration: ResolvedRegistration<ExtensionFactory>): () => ApplicationModule;
    work?(registration: ResolvedRegistration<ExtensionWork>): () => Promise<void>;
  },
  initialization: Omit<ApplicationInitialization, 'migrations' | 'extensionBootstrap'> & { appVersion?: string } = {}
) {
  const work = resolved.bootstrap.map(item => ({
    ...item.declaration,
    provider: item.provider,
    run: bindings.work!(item),
  }));
  const application = new ApplicationRuntime(
    owner,
    resolved.modules.map(item => ({ name: item.declaration.name, create: bindings.module(item) })),
    {
      ...initialization,
      migrations: async () => {
        if (!resolved.migrations.length) return;
        await initializeMigrationPersistence(owner);
        await runApplicationMigrations(
          resolved.migrations.map(item => ({
            name: item.declaration.name,
            source: item.provider,
            up: bindings.work!(item),
          })),
          {
            ledger: getMigrationLedgerRepository(owner),
            appVersion: initialization.appVersion,
            context: {},
            log: { debug() {}, info() {}, warn: message => owner.log.warn(String(message)), error() {} },
          }
        );
      },
      coreBootstrap: [...(initialization.coreBootstrap ?? []), ...work.filter(item => item.provider === 'core')],
      extensionBootstrap: work.filter(item => item.provider !== 'core'),
    }
  );
  return { application };
}
