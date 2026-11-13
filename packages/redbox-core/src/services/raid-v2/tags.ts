import * as Context from 'effect/Context';
import type { RaidPublishingConfigData } from '../../configmodels/RaidPublishing';
import type { RaidAuditService, RaidHttpClient, RaidMapper, RaidQueue, RaidRecordRepository, RaidRunContext } from './types';

export const RaidConfigTag = Context.Service<RaidPublishingConfigData>('redbox/RaidConfig');
export const RaidRunContextTag = Context.Service<RaidRunContext>('redbox/RaidRunContext');
export const RaidHttpClientTag = Context.Service<RaidHttpClient>('redbox/RaidHttpClient');
export const RaidRecordRepositoryTag = Context.Service<RaidRecordRepository>('redbox/RaidRecordRepository');
export const RaidAuditTag = Context.Service<RaidAuditService>('redbox/RaidAudit');
export const RaidQueueTag = Context.Service<RaidQueue>('redbox/RaidQueue');
export const RaidMappingTag = Context.Service<RaidMapper>('redbox/RaidMapping');
