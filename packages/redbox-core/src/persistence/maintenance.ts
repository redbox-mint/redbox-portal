import type { PersistenceOwner } from './owner';
import { initializePersistence } from './runtime';
import { PersistenceError } from './errors';
import type { PersistenceGroup } from './types';
import { prepareAgendaIndexes } from '../queues/indexes';
import type { AgendaQueueOptions } from '../config/agendaQueue.config';
import type { PersistenceIndexInspection } from './indexes';

export interface IndexReport extends Omit<PersistenceIndexInspection, 'datastore'> {
  group: PersistenceGroup | 'cache' | 'agenda';
}

export interface StorageIndexPreparation {
  inspectPrismaStagedStorage(app: PersistenceOwner): Promise<PersistenceIndexInspection[]>;
  ensurePrismaStagedStorageIndexes(app: PersistenceOwner): Promise<unknown>;
}

/** One entry per group; inspect every group before any explicit DDL. */
export async function prepareSelectedPersistenceIndexes(
  app: PersistenceOwner,
  mode: 'inspect' | 'ensure',
  selected: { storage?: StorageIndexPreparation; agenda?: AgendaQueueOptions } = {}
): Promise<{ mode: string; ready: boolean; groups: IndexReport[] }> {
  await initializePersistence(app);
  const cache = require('./cache/preflight') as typeof import('./cache/preflight');
  const migration = require('./migration/preflight') as typeof import('./migration/preflight');
  const reference = require('./reference/preflight') as typeof import('./reference/preflight');
  const configuration = require('./configuration/preflight') as typeof import('./configuration/preflight');
  const progress = require('./progress/preflight') as typeof import('./progress/preflight');
  const harvest = require('./harvest/preflight') as typeof import('./harvest/preflight');
  const siem = require('./siem/preflight') as typeof import('./siem/preflight');
  const figshare = require('./figshare/preflight') as typeof import('./figshare/preflight');
  const vocabulary = require('./vocabulary/preflight') as typeof import('./vocabulary/preflight');
  const branding = require('./branding/preflight') as typeof import('./branding/preflight');
  const identity = require('./identity/preflight') as typeof import('./identity/preflight');
  const storage = require('./storage/preflight') as typeof import('./storage/preflight');
  const hook: StorageIndexPreparation =
    selected.storage ?? require('@researchdatabox/sails-hook-redbox-storage-mongo/extension');
  const scopes: Array<{
    group: IndexReport['group'];
    inspect(app: PersistenceOwner): Promise<Omit<IndexReport, 'group'>[]>;
    ensure(app: PersistenceOwner): Promise<unknown>;
  }> = [
    {
      group: 'cache',
      inspect: async app => {
        const report = await cache.inspectCachePersistence(app);
        return [
          {
            collection: 'cacheentry',
            name: 'cacheentry_name_unique',
            index: report.index,
            duplicateKeyGroups: report.duplicateNameGroups,
          },
        ];
      },
      ensure: cache.ensureCachePersistenceIndex,
    },
    {
      group: 'migration',
      inspect: async app => [await migration.inspectMigrationPersistence(app)],
      ensure: migration.ensureMigrationPersistenceIndex,
    },
    {
      group: 'reference',
      inspect: reference.inspectReferencePersistence,
      ensure: reference.ensureReferencePersistenceIndexes,
    },
    {
      group: 'configuration',
      inspect: configuration.inspectConfigurationPersistence,
      ensure: configuration.ensureConfigurationPersistenceIndexes,
    },
    {
      group: 'progress',
      inspect: progress.inspectProgressPersistence,
      ensure: progress.ensureProgressPersistenceIndexes,
    },
    { group: 'harvest', inspect: harvest.inspectHarvestPersistence, ensure: harvest.ensureHarvestPersistenceIndexes },
    { group: 'siem', inspect: siem.inspectSiemPersistence, ensure: siem.ensureSiemPersistenceIndexes },
    {
      group: 'figshare',
      inspect: figshare.inspectFigsharePersistence,
      ensure: figshare.ensureFigsharePersistenceIndexes,
    },
    {
      group: 'vocabulary',
      inspect: vocabulary.inspectVocabularyPersistence,
      ensure: vocabulary.ensureVocabularyPersistenceIndexes,
    },
    {
      group: 'branding',
      inspect: branding.inspectBrandingPersistence,
      ensure: branding.ensureBrandingPersistenceIndexes,
    },
    {
      group: 'identity',
      inspect: identity.inspectIdentityPersistence,
      ensure: identity.ensureIdentityPersistenceIndexes,
    },
    {
      group: 'storage',
      inspect: async app => [
        ...(await storage.inspectStoragePersistence(app)),
        ...(await hook.inspectPrismaStagedStorage(app)),
      ],
      ensure: async app => {
        await storage.ensureStoragePersistenceIndexes(app);
        await hook.ensurePrismaStagedStorageIndexes(app);
      },
    },
  ];
  if (selected.agenda)
    scopes.push({
      group: 'agenda',
      inspect: app => prepareAgendaIndexes(app, selected.agenda!, 'inspect'),
      ensure: app => prepareAgendaIndexes(app, selected.agenda!, 'ensure'),
    });
  const inspect = async (): Promise<IndexReport[]> => {
    const reports: IndexReport[] = [];
    try {
      for (const scope of scopes)
        reports.push(...(await scope.inspect(app)).map(report => ({ ...report, group: scope.group })));
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      throw new PersistenceError(
        'index-inspection',
        'Persistence index inspection failed. Check effective application configuration and permissions.'
      );
    }
    return reports;
  };
  let groups = await inspect();
  if (mode === 'ensure' && !groups.some(report => report.index === 'conflicting' || report.duplicateKeyGroups)) {
    for (const scope of scopes) await scope.ensure(app);
    groups = await inspect();
  }
  return { mode, ready: groups.every(report => report.index === 'ready' && !report.duplicateKeyGroups), groups };
}
