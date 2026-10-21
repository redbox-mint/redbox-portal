import { AsyncLocalStorage } from 'node:async_hooks';
import type { DatastreamService } from '../../DatastreamService';
import type { ResolvedOniPublishingConfigData } from './types';
export const oniPublicationContext = new AsyncLocalStorage<{
  configuration: ResolvedOniPublishingConfigData;
  datastream?: Pick<DatastreamService, 'getDatastream'>;
  repositoryNamespace?: string;
}>();
