import { createOniRepository as owned } from '../../integrations/oni/repository';
import type { Services as Storage } from '../../storage/StorageManager';
import type { DatastreamService } from '../../DatastreamService';
import type { OniPublishingSiteConfig } from '../../configmodels/OniPublishing';
import type { OcflModuleAdapter, ResolvedOniPublishingConfigData } from '../../services/oni-v2/types';
function storage(): Storage.StorageManager {
  if (typeof StorageManagerService !== 'undefined') return StorageManagerService;
  const name = sails.config.storage.serviceName;
  const manager = name ? (sails.services[name] as unknown as Storage.StorageManager) : undefined;
  if (!manager || typeof manager.disk !== 'function')
    throw new Error('StorageManagerService is not available for Oni flydrive publishing');
  return manager;
}
export function createOniRepository(
  config: ResolvedOniPublishingConfigData,
  site: OniPublishingSiteConfig,
  datastream: DatastreamService,
  manager?: Storage.StorageManager,
  load?: () => Promise<OcflModuleAdapter>
) {
  return owned({ storageManager: manager ?? storage(), log: sails.log }, config, site, datastream, load);
}
