import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadExtensionModule } from '../extensions/loading';
import type { StorageIndexPreparation } from '../persistence/maintenance';
import { loadExtensions } from '../extensions/resolution';
import {
  loadStartupConfiguration,
  deploymentSchema,
  deploymentDefaults,
  deploymentEnvironmentInputs,
  convertLegacyEnvironment,
} from '../configuration';
import { assertPersistenceConfiguration } from '../persistence/selection';
import { prepareSelectedPersistenceIndexes } from '../persistence/maintenance';
import { cleanupPersistence, persistenceStatus } from '../persistence/runtime';
import type { PersistenceOwner } from '../persistence/owner';
import { selectedAgendaMongoOptions } from '../queues/indexes';

export interface IndexMaintenanceOptions {
  readonly appPath: string;
  readonly mode: 'inspect' | 'ensure';
  readonly environment?: string;
  /** Explicit shared operational files, never Sails configuration directories. */
  readonly files?: { readonly application?: string; readonly environment?: string; readonly local?: string };
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/** Standalone selected persistence. Never constructs ApplicationRuntime or business factories. */
export async function runIndexMaintenance(options: IndexMaintenanceOptions) {
  const resolved = await loadExtensions(options.appPath);
  const storage = resolved.modules.find(item => item.declaration.name === 'storage');
  if (storage?.provider !== '@researchdatabox/sails-hook-redbox-storage-mongo')
    throw new Error(
      'Index maintenance requires the selected bundled Mongo storage provider; custom replacements need their own explicit preflight.'
    );
  // Only these startup sections are consumed by maintenance. Forms, provider auth,
  // views, domain configuration and executable work remain offline declarations.
  const sections = new Set(['datastores', 'agendaQueue', 'storage', 'redboxSession']);
  const extensions = {
    providers: resolved.providers.map(provider => {
      assertPersistenceConfiguration(provider.declaration.config ?? {});
      return {
        ...provider,
        declaration: {
          ...provider.declaration,
          config: Object.fromEntries(
            Object.entries(provider.declaration.config ?? {}).filter(([name]) => sections.has(name))
          ),
        },
      };
    }),
  };
  const config = await loadStartupConfiguration({
    schema: deploymentSchema,
    core: deploymentDefaults(options.environment),
    extensions,
    files: options.files,
    env: convertLegacyEnvironment(options.env ?? process.env),
    environmentInputs: deploymentEnvironmentInputs,
  });
  if (config.storage.serviceName !== 'mongostorageservice')
    throw new Error('Index maintenance requires the selected Mongo storage configuration.');
  const hook = await loadExtensionModule({
    name: storage.provider,
    root: resolved.providers.find(provider => provider.name === storage.provider)!.root,
    specifier: storage.provider + '/extension',
    parentURL: pathToFileURL(path.resolve(options.appPath, 'package.json')).href,
  });
  if (!storagePreflight(hook)) throw new Error('Selected Mongo storage preflight exports are unavailable.');
  const owner: PersistenceOwner = { config, log: { warn() {} } };
  let report;
  try {
    report = await prepareSelectedPersistenceIndexes(owner, options.mode, {
      storage: hook,
      session: config.redboxSession,
      agenda: selectedAgendaMongoOptions(config.agendaQueue),
    });
  } finally {
    await cleanupPersistence(owner);
  }
  return {
    ...report,
    providers: resolved.providers.map(provider => provider.name),
    persistence: persistenceStatus(owner),
  };
}

function storagePreflight(value: Record<string, unknown>): value is Record<string, unknown> & StorageIndexPreparation {
  return (
    typeof value.inspectPrismaStagedStorage === 'function' &&
    typeof value.ensurePrismaStagedStorageIndexes === 'function'
  );
}
