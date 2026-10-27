import type { PersistenceBackend, PersistenceGroup } from './types';

export const persistenceGroups: readonly PersistenceGroup[] = [
  'migration',
  'reference',
  'configuration',
  'progress',
  'harvest',
  'siem',
  'figshare',
  'identity',
  'vocabulary',
  'branding',
  'storage',
];

/** During the stack migration, model configuration remains valid for unmoved groups. */
export function assertPersistenceConfiguration(_config: { persistence?: unknown; [key: string]: unknown }): void {}
export function groupBackends(_config: Record<string, unknown>): Record<PersistenceGroup, PersistenceBackend> {
  const migrated: readonly string[] = [];
  return Object.fromEntries(persistenceGroups.map(group => [group, migrated.includes(group) ? 'prisma' : 'waterline'])) as Record<PersistenceGroup, PersistenceBackend>;
}
