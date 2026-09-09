import type { RaidCreateRequest } from '@researchdatabox/raido-openapi-generated-node';
import type { RaidPublishingConfigData } from '../../configmodels/RaidPublishing';
import type { RecordModel } from '../../model/storage/RecordModel';
import type { IntegrationAuditContext } from '../IntegrationAuditService';

export type RaidRecord = RecordModel | Record<string, unknown>;
export interface RaidOptions { [key: string]: unknown; request?: Record<string, unknown>; triggerSource?: string; signal?: AbortSignal }
export type SerializableRaidOptions = Omit<RaidOptions, 'signal'>;
export interface RaidRunContext { oid: string; brandId: string; brandName: string; triggerSource: string; attemptCount: number }
export interface RaidMintResponse { statusCode: number; body: Record<string, unknown>; identifier?: { id?: string } }
export interface RaidHttpClient { getToken(forceRefresh?: boolean): import('effect').Effect.Effect<string, unknown>; mint(request: RaidCreateRequest, token: string, attempt: number): import('effect').Effect.Effect<RaidMintResponse, unknown> }
export interface RaidRecordRepository { getMeta(oid: string): import('effect').Effect.Effect<RaidRecord, unknown>; appendToRecord(oid: string, value: unknown, path: string): import('effect').Effect.Effect<void, unknown> }
export interface RaidAuditService { start(action: string, summary?: Record<string, unknown>, parent?: IntegrationAuditContext | null): import('effect').Effect.Effect<IntegrationAuditContext | null>; complete(ctx: IntegrationAuditContext | null, details?: Record<string, unknown>): import('effect').Effect.Effect<void>; fail(ctx: IntegrationAuditContext | null, error: unknown, details?: Record<string, unknown>): import('effect').Effect.Effect<void> }
export interface RaidQueue { schedule(data: { oid: string; options: SerializableRaidOptions; attemptCount: number; traceId?: string }): import('effect').Effect.Effect<void, unknown> }
export interface RaidMapper { map(record: RaidRecord, fields: Record<string, unknown>, options: RaidOptions): import('effect').Effect.Effect<RaidCreateRequest, unknown> }
export interface RaidRuntimeInput { record: RaidRecord; options: RaidOptions; config: RaidPublishingConfigData; context: RaidRunContext }
