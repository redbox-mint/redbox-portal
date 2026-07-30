import { Context } from 'effect';
import type { RaidPublishingConfigData } from '../../configmodels/RaidPublishing';
import type { RaidAuditService, RaidHttpClient, RaidMapper, RaidQueue, RaidRecordRepository, RaidRunContext } from './types';

export const RaidConfigTag = Context.GenericTag<RaidPublishingConfigData>('redbox/RaidConfig');
export const RaidRunContextTag = Context.GenericTag<RaidRunContext>('redbox/RaidRunContext');
export const RaidHttpClientTag = Context.GenericTag<RaidHttpClient>('redbox/RaidHttpClient');
export const RaidRecordRepositoryTag = Context.GenericTag<RaidRecordRepository>('redbox/RaidRecordRepository');
export const RaidAuditTag = Context.GenericTag<RaidAuditService>('redbox/RaidAudit');
export const RaidQueueTag = Context.GenericTag<RaidQueue>('redbox/RaidQueue');
export const RaidMappingTag = Context.GenericTag<RaidMapper>('redbox/RaidMapping');
