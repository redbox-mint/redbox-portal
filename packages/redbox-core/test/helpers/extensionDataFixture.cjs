'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.extensionDataFixture = extensionDataFixture;
const application_1 = require('../../dist/application');
const runtime_1 = require('../../dist/persistence/migration/runtime');
/** Domain-only fixture. HTTP composition is exercised through the production bootstrap. */
function extensionDataFixture(owner, resolved, bindings, initialization = {}) {
  const work = resolved.bootstrap.map(item => ({
    ...item.declaration,
    provider: item.provider,
    run: bindings.work(item),
  }));
  const application = new application_1.ApplicationRuntime(
    owner,
    resolved.modules.map(item => ({ name: item.declaration.name, create: bindings.module(item) })),
    {
      ...initialization,
      migrations: async () => {
        if (!resolved.migrations.length) return;
        await (0, runtime_1.initializeMigrationPersistence)(owner);
        await (0, application_1.runApplicationMigrations)(
          resolved.migrations.map(item => ({
            name: item.declaration.name,
            source: item.provider,
            up: bindings.work(item),
          })),
          {
            ledger: (0, runtime_1.getMigrationLedgerRepository)(owner),
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
