import * as _ from 'lodash';
import { createHash } from 'node:crypto';
import { firstValueFrom } from 'rxjs';

import { Services as services } from '../CoreService';
import { HarvestRunService as HarvestRunServiceContract, HarvestRunServiceError, HarvestTrackedChunkRequest, HarvestTrackedChunkResponse, HarvestTrackedRecordRequest, HarvestTrackedRecordResponse } from '../HarvestRunService';
import { APIHarvestResponse } from '../model/APIHarvestResponse';
import { BrandingModel } from '../model/storage/BrandingModel';
import { RecordModel } from '../model/storage/RecordModel';
import { RecordTypeModel } from '../model/storage/RecordTypeModel';
import { UserModel } from '../model/storage/UserModel';
import {
  HarvestChunkStatus,
  HarvestCounterSummary,
  HarvestOperation,
  HarvestOutcome,
  HarvestRecordEventModel,
  HarvestRunChunkModel,
  HarvestRunDetailResult,
  HarvestRunEventsQuery,
  HarvestRunEventsResult,
  HarvestRunListQuery,
  HarvestRunListResult,
  HarvestRunModel,
  HarvestRunStatus,
} from '../model/storage/HarvestRunModel';
import { RecordsService } from '../RecordsService';
import { HarvestRecordEventAttributes } from '../waterline-models/HarvestRecordEvent';
import { HarvestRunChunkAttributes } from '../waterline-models/HarvestRunChunk';
import { HarvestRunAttributes } from '../waterline-models/HarvestRun';

declare const WorkflowStepsService: {
  get: (recordTypeModel: RecordTypeModel, workflowStage: string) => unknown;
};

type AnyRecord = Record<string, unknown>;
type RecordTypeWithName = RecordTypeModel & { name?: string };
type HarvestRunRow = HarvestRunAttributes & { id?: string };
type HarvestRunChunkRow = HarvestRunChunkAttributes & { id?: string };
type HarvestRecordEventRow = HarvestRecordEventAttributes & { id?: string };
type HarvestRecordEventCreateInput = Omit<HarvestRecordEventAttributes, 'id'>;
type TrackedOperation = HarvestOperation | 'invalid';
type TrackedUpdateStrategy = 'replace' | 'merge' | 'ignoreIfExists';

export namespace Services {
  export class HarvestRunService extends services.Core.Service implements HarvestRunServiceContract {
    protected override _exportedMethods: string[] = [
      'submitCompatibilityRecords',
      'submitLegacyRecords',
      'submitChunk',
      'listRuns',
      'getRun',
      'listRunEvents',
    ];

    constructor() {
      super();
      this.logHeader = 'HarvestRunService::';
    }

    private recordsService(): RecordsService {
      return sails.services.recordsservice as unknown as RecordsService;
    }

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    private resolveBrandId(brand: BrandingModel | string): string {
      if (typeof brand === 'string') {
        return brand.trim();
      }
      return String(brand?.id ?? brand?.name ?? '').trim();
    }

    private resolveRecordTypeName(recordTypeModel: RecordTypeWithName | Partial<RecordTypeWithName>): string {
      return String((recordTypeModel as RecordTypeWithName | undefined)?.name ?? '').trim();
    }

    private nowIso(): string {
      return new Date().toISOString();
    }

    private parsePositiveInt(value: unknown, fallback: number): number {
      const parsed = Number.parseInt(String(value ?? ''), 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
    }

    private normalizeTrackedOperation(value: unknown): TrackedOperation {
      switch (String(value ?? HarvestOperation.upsert).trim()) {
        case HarvestOperation.create:
          return HarvestOperation.create;
        case HarvestOperation.update:
          return HarvestOperation.update;
        case HarvestOperation.upsert:
          return HarvestOperation.upsert;
        case HarvestOperation.delete:
          return HarvestOperation.delete;
        default:
          return 'invalid';
      }
    }

    private normalizeTrackedUpdateStrategy(value: unknown): TrackedUpdateStrategy {
      switch (String(value ?? 'replace').trim()) {
        case 'merge':
          return 'merge';
        case 'ignoreIfExists':
          return 'ignoreIfExists';
        default:
          return 'replace';
      }
    }

    private buildEmptyCounters(): HarvestCounterSummary {
      return {
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
      };
    }

    private incrementCounters(counters: HarvestCounterSummary, outcome: HarvestOutcome): void {
      counters.totalProcessed += 1;
      switch (outcome) {
        case HarvestOutcome.created:
          counters.created += 1;
          break;
        case HarvestOutcome.updated:
          counters.updated += 1;
          break;
        case HarvestOutcome.deleted:
          counters.deleted += 1;
          break;
        case HarvestOutcome.unchanged:
          counters.unchanged += 1;
          break;
        case HarvestOutcome.failed:
        default:
          counters.failed += 1;
          break;
      }
    }

    private normalizeMetadata(recordRequest: AnyRecord | undefined): AnyRecord {
      const metadata = _.get(recordRequest, 'metadata');
      if (_.isPlainObject(metadata)) {
        return metadata as AnyRecord;
      }
      return (_.isPlainObject(recordRequest) ? recordRequest : {}) as AnyRecord;
    }

    private isMetadataEqual(meta1: AnyRecord, meta2: AnyRecord): boolean {
      const keys = _.keys(meta1);
      for (const key of keys) {
        if (!_.isEqual(meta1?.[key], meta2?.[key])) {
          return false;
        }
      }
      return true;
    }

    private toRunModel(row: HarvestRunRow): HarvestRunModel {
      return new HarvestRunModel({
        id: row.id,
        sourceRunId: String(row.sourceRunId ?? ''),
        brandId: String(row.brandId ?? ''),
        recordType: String(row.recordType ?? ''),
        sourceName: String(row.sourceName ?? ''),
        sourceUri: row.sourceUri ? String(row.sourceUri) : undefined,
        status: (row.status as HarvestRunStatus) ?? HarvestRunStatus.running,
        startedAt: String(row.startedAt ?? ''),
        completedAt: row.completedAt ? String(row.completedAt) : undefined,
        startedBy: row.startedBy ? String(row.startedBy) : undefined,
        lastChunkAt: row.lastChunkAt ? String(row.lastChunkAt) : undefined,
        totalProcessed: Number(row.totalProcessed ?? 0),
        created: Number(row.created ?? 0),
        updated: Number(row.updated ?? 0),
        deleted: Number(row.deleted ?? 0),
        unchanged: Number(row.unchanged ?? 0),
        failed: Number(row.failed ?? 0),
        chunksProcessed: Number(row.chunksProcessed ?? 0),
        duplicateChunks: Number(row.duplicateChunks ?? 0),
        metadata: (row.metadata as Record<string, unknown> | undefined) ?? undefined,
      });
    }

    private toChunkModel(row: HarvestRunChunkRow, duplicateOverride?: boolean): HarvestRunChunkModel {
      return new HarvestRunChunkModel({
        id: row.id,
        runId: String(row.runId ?? ''),
        brandId: String(row.brandId ?? ''),
        recordType: String(row.recordType ?? ''),
        sourceRunId: String(row.sourceRunId ?? ''),
        contentHash: String(row.contentHash ?? ''),
        chunkIndex: row.chunkIndex == null ? undefined : Number(row.chunkIndex),
        chunkLabel: row.chunkLabel ? String(row.chunkLabel) : undefined,
        totalExpected: row.totalExpected == null ? undefined : Number(row.totalExpected),
        status: (row.status as HarvestChunkStatus) ?? HarvestChunkStatus.processed,
        recordCount: Number(row.recordCount ?? 0),
        totalProcessed: Number(row.totalProcessed ?? 0),
        created: Number(row.created ?? 0),
        updated: Number(row.updated ?? 0),
        deleted: Number(row.deleted ?? 0),
        unchanged: Number(row.unchanged ?? 0),
        failed: Number(row.failed ?? 0),
        duplicate: duplicateOverride ?? Boolean(row.duplicate),
        submittedAt: String(row.submittedAt ?? ''),
        completedAt: row.completedAt ? String(row.completedAt) : undefined,
        errorMessage: row.errorMessage ? String(row.errorMessage) : undefined,
        responseSummary: (row.responseSummary as Record<string, unknown> | undefined) ?? undefined,
      });
    }

    private toEventModel(row: HarvestRecordEventRow): HarvestRecordEventModel {
      const outcome = (row.outcome as HarvestOutcome) ?? HarvestOutcome.failed;
      return new HarvestRecordEventModel({
        id: row.id,
        runId: String(row.runId ?? ''),
        chunkId: String(row.chunkId ?? ''),
        brandId: String(row.brandId ?? ''),
        recordType: String(row.recordType ?? ''),
        sourceRunId: String(row.sourceRunId ?? ''),
        harvestId: String(row.harvestId ?? ''),
        oid: row.oid ? String(row.oid) : undefined,
        operation: (row.operation as HarvestOperation) ?? HarvestOperation.upsert,
        outcome,
        status: row.status == null ? outcome !== HarvestOutcome.failed : Boolean(row.status),
        message: row.message ? String(row.message) : undefined,
        details: row.details ? String(row.details) : undefined,
        errorCode: row.errorCode ? String(row.errorCode) : undefined,
        recordSnapshot: (row.recordSnapshot as Record<string, unknown> | undefined) ?? undefined,
        createdAt: String(row.createdAt ?? ''),
      });
    }

    private toTrackedRecordResponse(value: unknown): HarvestTrackedRecordResponse {
      const record = (_.isPlainObject(value) ? value : {}) as AnyRecord;
      return {
        harvestId: String(record.harvestId ?? ''),
        oid: String(record.oid ?? ''),
        operation: String(record.operation ?? HarvestOperation.upsert),
        outcome: String(record.outcome ?? HarvestOutcome.failed),
        status: Boolean(record.status),
        message: String(record.message ?? ''),
        details: String(record.details ?? ''),
      };
    }

    private async findExistingHarvestRecord(harvestId: string, recordType: string): Promise<AnyRecord[]> {
      return await Record.find({
        harvestId,
        'metaMetadata.type': recordType,
      }).meta({
        enableExperimentalDeepTargets: true,
      }) as AnyRecord[];
    }

    private async findExistingTrackedHarvestRecords(
      brandId: string,
      harvestId: string,
      recordType: string
    ): Promise<AnyRecord[]> {
      return await Record.find({
        harvestId,
        'metaMetadata.type': recordType,
        'metaMetadata.brandId': brandId,
      }).meta({
        enableExperimentalDeepTargets: true,
      }) as AnyRecord[];
    }

    private async legacyUpdateHarvestRecord(
      brand: BrandingModel,
      recordTypeModel: RecordTypeModel,
      updateMode: string,
      body: AnyRecord,
      oid: string,
      harvestId: string,
      user: UserModel
    ): Promise<APIHarvestResponse> {
      const shouldMerge = updateMode === 'merge';
      try {
        const record: RecordModel = await this.recordsService().getMeta(oid);
        if (_.isEmpty(record)) {
          return new APIHarvestResponse(
            harvestId,
            oid,
            false,
            `Failed to update meta, cannot find existing record with oid: ${oid}`
          );
        }

        if (shouldMerge) {
          record['metadata'] = _.mergeWith(record.metadata, body, (objValue: unknown, srcValue: unknown) => {
            if (_.isArray(objValue)) {
              return (objValue as unknown[]).concat(srcValue as unknown[]);
            }
            return undefined;
          });
        } else {
          record['metadata'] = body;
        }

        const sourceMetadata = body?.['sourceMetadata'];
        if (!_.isEmpty(sourceMetadata)) {
          (record['metaMetadata'] as unknown as AnyRecord)['sourceMetadata'] = `${sourceMetadata}`;
        }

        await this.recordsService().updateMeta(brand, oid, record, user);
        return new APIHarvestResponse(harvestId, oid, true, shouldMerge ? 'Record merged successfully' : 'Record updated successfully');
      } catch (error) {
        const result = new APIHarvestResponse(
          harvestId,
          oid,
          false,
          error instanceof Error ? error.message : 'Failed to update meta'
        );
        this.logger.error(`${this.logHeader} Failed to update harvest record ${oid}`, error);
        return result;
      }
    }

    private async legacyCreateHarvestRecord(
      brand: BrandingModel,
      recordTypeModel: RecordTypeModel,
      body: AnyRecord,
      harvestId: string,
      updateMode: string,
      user: UserModel
    ): Promise<APIHarvestResponse> {
      const metadata = body?.['metadata'];
      const workflowStage = body?.['workflowStage'];
      const request: AnyRecord = {};
      if (updateMode !== 'create') {
        request['harvestId'] = harvestId;
      }

      request['metadata'] = metadata == null ? body : metadata;

      try {
        const response = await this.recordsService().create(brand, request, recordTypeModel, user);
        if (workflowStage) {
          try {
            const wfStep = await firstValueFrom(WorkflowStepsService.get(recordTypeModel, String(workflowStage)) as any);
            this.recordsService().setWorkflowStepRelatedMetadata(request, wfStep as AnyRecord);
          } catch (error) {
            this.logger.warn(`${this.logHeader} Failed to resolve workflow step ${String(workflowStage)}`, error);
          }
        }

        if (response.isSuccessful()) {
          return new APIHarvestResponse(harvestId, response.oid, true, 'Record created successfully');
        }

        this.logger.error(`${this.logHeader} Record creation failed for harvestId ${harvestId}`);
        return new APIHarvestResponse(harvestId, '', false, 'Record creation failed');
      } catch (error) {
        this.logger.error(`${this.logHeader} Exception creating harvest record ${harvestId}`, error);
        return new APIHarvestResponse(harvestId, '', false, String(error));
      }
    }

    private buildTrackedFailureResponse(
      harvestId: string,
      operation: HarvestOperation | string,
      message: string,
      details = '',
      oid = ''
    ): HarvestTrackedRecordResponse {
      return {
        harvestId,
        oid,
        operation: String(operation),
        outcome: HarvestOutcome.failed,
        status: false,
        message,
        details,
      };
    }

    private async createTrackedRecord(
      brand: BrandingModel,
      recordTypeModel: RecordTypeModel,
      recordRequest: AnyRecord,
      harvestId: string,
      user: UserModel
    ): Promise<HarvestTrackedRecordResponse> {
      const request: AnyRecord = {
        harvestId,
        metadata: this.normalizeMetadata(recordRequest),
      };

      try {
        const response = await this.recordsService().create(brand, request, recordTypeModel, user);
        if (response.isSuccessful()) {
          return {
            harvestId,
            oid: String(response.oid ?? ''),
            operation: HarvestOperation.create,
            outcome: HarvestOutcome.created,
            status: true,
            message: 'Record created successfully',
            details: '',
          };
        }

        return this.buildTrackedFailureResponse(
          harvestId,
          HarvestOperation.create,
          String(response.message ?? 'Record creation failed'),
          typeof response.details === 'string' ? response.details : ''
        );
      } catch (error) {
        return this.buildTrackedFailureResponse(
          harvestId,
          HarvestOperation.create,
          this.asError(error).message
        );
      }
    }

    private async updateTrackedRecord(
      brand: BrandingModel,
      recordTypeModel: RecordTypeModel,
      metadata: AnyRecord,
      oid: string,
      user: UserModel,
      strategy: TrackedUpdateStrategy
    ): Promise<{ success: boolean; message: string; details: string }> {
      const shouldMerge = strategy === 'merge';
      try {
        const record: RecordModel = await this.recordsService().getMeta(oid);
        if (_.isEmpty(record)) {
          return {
            success: false,
            message: `Failed to update meta, cannot find existing record with oid: ${oid}`,
            details: '',
          };
        }

        if (shouldMerge) {
          record['metadata'] = _.mergeWith(record.metadata, metadata, (objValue: unknown, srcValue: unknown) => {
            if (_.isArray(objValue)) {
              return (objValue as unknown[]).concat(srcValue as unknown[]);
            }
            return undefined;
          });
        } else {
          record['metadata'] = metadata;
        }

        const sourceMetadata = metadata['sourceMetadata'];
        if (!_.isEmpty(sourceMetadata)) {
          (record['metaMetadata'] as unknown as AnyRecord)['sourceMetadata'] = `${sourceMetadata}`;
        }

        const response = await this.recordsService().updateMeta(brand, oid, record, user);
        if (!response.isSuccessful()) {
          return {
            success: false,
            message: String(response.message ?? 'Failed to update meta'),
            details: typeof response.details === 'string' ? response.details : '',
          };
        }

        return {
          success: true,
          message: shouldMerge ? 'Record merged successfully' : 'Record updated successfully',
          details: '',
        };
      } catch (error) {
        return {
          success: false,
          message: this.asError(error).message,
          details: '',
        };
      }
    }

    private captureRecordSnapshot(record: HarvestTrackedRecordRequest): Record<string, unknown> {
      return {
        harvestId: String(record.harvestId ?? ''),
        operation: String(record.operation ?? HarvestOperation.upsert),
        updateStrategy: String(record.updateStrategy ?? 'replace'),
        reason: record.reason,
        recordRequest: _.isPlainObject(record.recordRequest) ? record.recordRequest : undefined,
      };
    }

    private async persistTrackedEvent(
      run: HarvestRunRow,
      chunk: HarvestRunChunkRow,
      recordTypeName: string,
      request: HarvestTrackedRecordRequest,
      response: HarvestTrackedRecordResponse,
      errorCode?: string
    ): Promise<void> {
      const event: HarvestRecordEventCreateInput = {
        runId: String(run.id ?? ''),
        chunkId: String(chunk.id ?? ''),
        brandId: String(run.brandId ?? ''),
        recordType: recordTypeName,
        sourceRunId: String(run.sourceRunId ?? ''),
        harvestId: response.harvestId,
        oid: response.oid || undefined,
        operation: response.operation,
        outcome: response.outcome,
        status: response.status,
        message: response.message || undefined,
        details: response.details || undefined,
        errorCode,
        recordSnapshot: response.status ? undefined : this.captureRecordSnapshot(request),
        createdAt: this.nowIso(),
      };
      await HarvestRecordEvent.create(event);
    }

    private canonicalizeValue(value: unknown, seen = new WeakSet<object>()): unknown {
      if (value === undefined) {
        return undefined;
      }
      if (value === null || typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        return value.normalize('NFC');
      }
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          throw new HarvestRunServiceError('Tracked harvest payload contains an invalid number value.', 400);
        }
        return Object.is(value, -0) ? 0 : value;
      }
      if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
        throw new HarvestRunServiceError('Tracked harvest payload contains a non-serializable value.', 400);
      }
      if (Array.isArray(value)) {
        return value.map(entry => this.canonicalizeValue(entry, seen));
      }
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (typeof value === 'object') {
        if (seen.has(value as object)) {
          throw new HarvestRunServiceError('Tracked harvest payload contains circular data.', 400);
        }
        seen.add(value as object);
        const result = Object.keys(value as AnyRecord)
          .sort((left, right) => left.localeCompare(right))
          .reduce((acc, key) => {
            const normalized = this.canonicalizeValue((value as AnyRecord)[key], seen);
            if (normalized !== undefined) {
              acc[key] = normalized;
            }
            return acc;
          }, {} as AnyRecord);
        seen.delete(value as object);
        return result;
      }
      return value;
    }

    private buildChunkContentHash(brandId: string, recordTypeName: string, request: HarvestTrackedChunkRequest): string {
      const payload = {
        algorithm: 'redbox-harvest-chunk-v1',
        brandId,
        recordType: recordTypeName,
        sourceName: request.sourceName,
        sourceRunId: request.sourceRunId,
        chunkIndex: request.chunk?.index,
        records: this.canonicalizeValue(request.records),
      };
      return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    }

    private validateTrackedChunkRequest(body: Record<string, unknown> | undefined): HarvestTrackedChunkRequest {
      const request = (_.isPlainObject(body) ? body : {}) as AnyRecord;
      const sourceRunId = String(request.sourceRunId ?? '').trim();
      const sourceName = String(request.sourceName ?? '').trim();
      const records = Array.isArray(request.records) ? request.records as HarvestTrackedRecordRequest[] : [];
      const chunk = (_.isPlainObject(request.chunk) ? request.chunk : {}) as AnyRecord;
      const chunkIndex = chunk.index;
      if (!sourceRunId || !sourceName || records.length === 0 || !Number.isInteger(chunkIndex) || Number(chunkIndex) < 0) {
        throw new HarvestRunServiceError('Invalid tracked harvest request body.', 400);
      }
      return {
        sourceRunId,
        sourceName,
        sourceUri: request.sourceUri ? String(request.sourceUri) : undefined,
        finalChunk: Boolean(request.finalChunk),
        chunk: {
          index: Number(chunkIndex),
          label: chunk.label ? String(chunk.label) : undefined,
          totalExpected: chunk.totalExpected == null ? undefined : Number(chunk.totalExpected),
        },
        records,
      };
    }

    private async findOrCreateRun(
      brand: BrandingModel,
      recordTypeModel: RecordTypeModel,
      request: HarvestTrackedChunkRequest,
      user: UserModel
    ): Promise<HarvestRunRow> {
      const brandId = this.resolveBrandId(brand);
      const recordTypeName = this.resolveRecordTypeName(recordTypeModel);
      const where = {
        brandId,
        recordType: recordTypeName,
        sourceName: request.sourceName,
        sourceRunId: request.sourceRunId,
      };

      const existing = await HarvestRun.findOne(where) as HarvestRunRow | null;
      if (existing) {
        return existing;
      }

      const now = this.nowIso();
      try {
        return await HarvestRun.create({
          ...where,
          sourceUri: request.sourceUri,
          status: HarvestRunStatus.running,
          startedAt: now,
          lastChunkAt: now,
          startedBy: String(user?.username ?? ''),
          totalProcessed: 0,
          created: 0,
          updated: 0,
          deleted: 0,
          unchanged: 0,
          failed: 0,
          chunksProcessed: 0,
          duplicateChunks: 0,
        }).fetch() as HarvestRunRow;
      } catch (error) {
        const recovered = await HarvestRun.findOne(where) as HarvestRunRow | null;
        if (recovered) {
          return recovered;
        }
        throw error;
      }
    }

    private async updateRunAfterChunk(
      run: HarvestRunRow,
      counters: HarvestCounterSummary,
      finalChunk: boolean,
      completedAt: string
    ): Promise<HarvestRunRow> {
      const nextFailed = Number(run.failed ?? 0) + counters.failed;
      const updates: Partial<HarvestRunRow> = {
        lastChunkAt: completedAt,
        totalProcessed: Number(run.totalProcessed ?? 0) + counters.totalProcessed,
        created: Number(run.created ?? 0) + counters.created,
        updated: Number(run.updated ?? 0) + counters.updated,
        deleted: Number(run.deleted ?? 0) + counters.deleted,
        unchanged: Number(run.unchanged ?? 0) + counters.unchanged,
        failed: nextFailed,
        chunksProcessed: Number(run.chunksProcessed ?? 0) + 1,
      };
      if (finalChunk) {
        updates.status = nextFailed > 0 ? HarvestRunStatus.completedWithErrors : HarvestRunStatus.completed;
        updates.completedAt = completedAt;
      }
      const updated = await HarvestRun.updateOne({ id: run.id }).set(updates) as HarvestRunRow | null;
      return updated ?? { ...run, ...updates };
    }

    private async bumpDuplicateChunkCount(run: HarvestRunRow): Promise<HarvestRunRow> {
      const updates: Partial<HarvestRunRow> = {
        duplicateChunks: Number(run.duplicateChunks ?? 0) + 1,
        lastChunkAt: this.nowIso(),
      };
      const updated = await HarvestRun.updateOne({ id: run.id }).set(updates) as HarvestRunRow | null;
      return updated ?? { ...run, ...updates };
    }

    private async processTrackedRecord(
      brand: BrandingModel,
      recordTypeModel: RecordTypeModel,
      run: HarvestRunRow,
      chunk: HarvestRunChunkRow,
      request: HarvestTrackedRecordRequest,
      user: UserModel
    ): Promise<HarvestTrackedRecordResponse> {
      const brandId = String(run.brandId ?? '');
      const recordTypeName = String(run.recordType ?? '');
      const operation = this.normalizeTrackedOperation(request.operation);
      const harvestId = String(request.harvestId ?? '').trim();

      if (!harvestId) {
        const response = this.buildTrackedFailureResponse('', HarvestOperation.upsert, 'HarvestId was not specified');
        await this.persistTrackedEvent(run, chunk, recordTypeName, request, response, 'missing-harvest-id');
        return response;
      }

      if (operation === 'invalid') {
        const response = this.buildTrackedFailureResponse(harvestId, String(request.operation ?? ''), 'Invalid record operation supplied.');
        await this.persistTrackedEvent(run, chunk, recordTypeName, request, response, 'invalid-operation');
        return response;
      }

      const existingRecords = await this.findExistingTrackedHarvestRecords(brandId, harvestId, recordTypeName);
      if (existingRecords.length > 1) {
        const response = this.buildTrackedFailureResponse(
          harvestId,
          operation,
          `Multiple records were found for harvestId ${harvestId}.`
        );
        await this.persistTrackedEvent(run, chunk, recordTypeName, request, response, 'duplicate-harvest-id');
        return response;
      }

      const recordRequest = (_.isPlainObject(request.recordRequest) ? request.recordRequest : {}) as AnyRecord;
      const metadata = this.normalizeMetadata(recordRequest);
      const updateStrategy = this.normalizeTrackedUpdateStrategy(request.updateStrategy);

      switch (operation) {
        case HarvestOperation.create: {
          if (existingRecords.length > 0) {
            const response = this.buildTrackedFailureResponse(
              harvestId,
              operation,
              `Record already exists for harvestId ${harvestId}.`,
              '',
              String(existingRecords[0]?.redboxOid ?? '')
            );
            await this.persistTrackedEvent(run, chunk, recordTypeName, request, response, 'record-exists');
            return response;
          }
          const response = await this.createTrackedRecord(brand, recordTypeModel, recordRequest, harvestId, user);
          await this.persistTrackedEvent(run, chunk, recordTypeName, request, response, response.status ? undefined : 'create-failed');
          return response;
        }

        case HarvestOperation.update: {
          if (existingRecords.length === 0) {
            const response = this.buildTrackedFailureResponse(
              harvestId,
              operation,
              `No record was found for harvestId ${harvestId}.`
            );
            await this.persistTrackedEvent(run, chunk, recordTypeName, request, response, 'missing-record');
            return response;
          }

          const existingRecord = existingRecords[0] as AnyRecord;
          const oid = String(existingRecord.redboxOid ?? '');
          const existingMetadata = (existingRecord.metadata ?? {}) as AnyRecord;
          if (this.isMetadataEqual(metadata, existingMetadata)) {
            const response: HarvestTrackedRecordResponse = {
              harvestId,
              oid,
              operation,
              outcome: HarvestOutcome.unchanged,
              status: true,
              message: `Record ignored as the record already exists. oid: ${oid}`,
              details: '',
            };
            await this.persistTrackedEvent(run, chunk, recordTypeName, request, response);
            return response;
          }

          const updateResult = await this.updateTrackedRecord(brand, recordTypeModel, metadata, oid, user, updateStrategy);
          const response: HarvestTrackedRecordResponse = {
            harvestId,
            oid,
            operation,
            outcome: updateResult.success ? HarvestOutcome.updated : HarvestOutcome.failed,
            status: updateResult.success,
            message: updateResult.message,
            details: updateResult.details,
          };
          await this.persistTrackedEvent(run, chunk, recordTypeName, request, response, updateResult.success ? undefined : 'update-failed');
          return response;
        }

        case HarvestOperation.delete: {
          if (existingRecords.length === 0) {
            const response = this.buildTrackedFailureResponse(
              harvestId,
              operation,
              `No record was found for harvestId ${harvestId}.`
            );
            await this.persistTrackedEvent(run, chunk, recordTypeName, request, response, 'missing-record');
            return response;
          }

          const existingRecord = existingRecords[0] as AnyRecord;
          const oid = String(existingRecord.redboxOid ?? '');
          try {
            const deleteResponse = await this.recordsService().delete(oid, false, existingRecord, recordTypeModel, user);
            const response: HarvestTrackedRecordResponse = {
              harvestId,
              oid,
              operation,
              outcome: deleteResponse.isSuccessful() ? HarvestOutcome.deleted : HarvestOutcome.failed,
              status: deleteResponse.isSuccessful(),
              message: deleteResponse.isSuccessful()
                ? 'Record deleted successfully'
                : String(deleteResponse.message ?? 'Record deletion failed'),
              details: typeof deleteResponse.details === 'string' ? deleteResponse.details : '',
            };
            await this.persistTrackedEvent(run, chunk, recordTypeName, request, response, response.status ? undefined : 'delete-failed');
            return response;
          } catch (error) {
            const response = this.buildTrackedFailureResponse(harvestId, operation, this.asError(error).message, '', oid);
            await this.persistTrackedEvent(run, chunk, recordTypeName, request, response, 'delete-failed');
            return response;
          }
        }

        case HarvestOperation.upsert:
        default: {
          if (existingRecords.length === 0) {
            const response = await this.createTrackedRecord(brand, recordTypeModel, recordRequest, harvestId, user);
            response.operation = HarvestOperation.upsert;
            await this.persistTrackedEvent(run, chunk, recordTypeName, request, response, response.status ? undefined : 'create-failed');
            return response;
          }

          const existingRecord = existingRecords[0] as AnyRecord;
          const oid = String(existingRecord.redboxOid ?? '');
          if (updateStrategy === 'ignoreIfExists') {
            const response: HarvestTrackedRecordResponse = {
              harvestId,
              oid,
              operation,
              outcome: HarvestOutcome.unchanged,
              status: true,
              message: `Record ignored as the record already exists. oid: ${oid}`,
              details: '',
            };
            await this.persistTrackedEvent(run, chunk, recordTypeName, request, response);
            return response;
          }

          const existingMetadata = (existingRecord.metadata ?? {}) as AnyRecord;
          if (this.isMetadataEqual(metadata, existingMetadata)) {
            const response: HarvestTrackedRecordResponse = {
              harvestId,
              oid,
              operation,
              outcome: HarvestOutcome.unchanged,
              status: true,
              message: `Record ignored as the record already exists. oid: ${oid}`,
              details: '',
            };
            await this.persistTrackedEvent(run, chunk, recordTypeName, request, response);
            return response;
          }

          const updateResult = await this.updateTrackedRecord(brand, recordTypeModel, metadata, oid, user, updateStrategy);
          const response: HarvestTrackedRecordResponse = {
            harvestId,
            oid,
            operation,
            outcome: updateResult.success ? HarvestOutcome.updated : HarvestOutcome.failed,
            status: updateResult.success,
            message: updateResult.message,
            details: updateResult.details,
          };
          await this.persistTrackedEvent(run, chunk, recordTypeName, request, response, updateResult.success ? undefined : 'update-failed');
          return response;
        }
      }
    }

    public async submitCompatibilityRecords(
      brand: BrandingModel,
      recordTypeModel: RecordTypeModel,
      body: Record<string, unknown> | undefined,
      updateMode: string,
      user: UserModel
    ): Promise<APIHarvestResponse[]> {
      if (body == null || _.isEmpty(body['records'])) {
        throw new HarvestRunServiceError('Invalid request body', 400);
      }

      const recordType = this.resolveRecordTypeName(recordTypeModel);
      const records = body['records'] as AnyRecord[];
      const recordResponses: APIHarvestResponse[] = [];
      for (const record of records) {
        const harvestId = String(record['harvestId'] ?? '');
        if (_.isEmpty(harvestId)) {
          recordResponses.push(new APIHarvestResponse(harvestId, '', false, 'HarvestId was not specified'));
          continue;
        }

        const recordRequest = (_.isPlainObject(record['recordRequest']) ? record['recordRequest'] : undefined) as AnyRecord | undefined;
        const existingRecord = await this.findExistingHarvestRecord(harvestId, recordType);
        if (existingRecord.length === 0 || updateMode === 'create') {
          recordResponses.push(
            await this.legacyCreateHarvestRecord(
              brand,
              recordTypeModel,
              (recordRequest ?? {}) as AnyRecord,
              harvestId,
              updateMode,
              user
            )
          );
          continue;
        }

        const oid = String(existingRecord[0]?.redboxOid ?? '');
        if (updateMode === 'ignore') {
          recordResponses.push(
            new APIHarvestResponse(
              harvestId,
              oid,
              true,
              `Record ignored as the record already exists. oid: ${oid}`
            )
          );
          continue;
        }

        const newMetadata = this.normalizeMetadata(recordRequest);
        const existingMetadata = (existingRecord[0]?.metadata ?? {}) as AnyRecord;
        if (this.isMetadataEqual(newMetadata, existingMetadata)) {
          recordResponses.push(
            new APIHarvestResponse(
              harvestId,
              oid,
              true,
              `Record ignored as the record already exists. oid: ${oid}`
            )
          );
          continue;
        }

        recordResponses.push(
          await this.legacyUpdateHarvestRecord(
            brand,
            recordTypeModel,
            updateMode,
            (recordRequest?.metadata ?? {}) as AnyRecord,
            oid,
            harvestId,
            user
          )
        );
      }
      return recordResponses;
    }

    public async submitLegacyRecords(
      brand: BrandingModel,
      recordTypeModel: RecordTypeModel,
      body: Record<string, unknown> | undefined,
      merge: boolean,
      user: UserModel
    ): Promise<APIHarvestResponse[]> {
      if (body == null || _.isEmpty(body['records'])) {
        throw new HarvestRunServiceError('Invalid request body', 400);
      }

      const recordType = this.resolveRecordTypeName(recordTypeModel);
      const records = body['records'] as AnyRecord[];
      const responses: APIHarvestResponse[] = [];
      for (const record of records) {
        const harvestId = String(record['harvest_id'] ?? '');
        if (_.isEmpty(harvestId)) {
          responses.push(new APIHarvestResponse(harvestId, '', false, 'HarvestId was not specified'));
          continue;
        }

        const metadata = (_.isPlainObject(record['metadata']) ? record['metadata'] : undefined) as AnyRecord | undefined;
        const existingRecord = await this.findExistingHarvestRecord(harvestId, recordType);
        if (existingRecord.length === 0) {
          responses.push(
            await this.legacyCreateHarvestRecord(
              brand,
              recordTypeModel,
              (metadata?.data ?? {}) as AnyRecord,
              harvestId,
              'update',
              user
            )
          );
          continue;
        }

        const updateMode = merge ? 'merge' : 'update';
        const oid = String(existingRecord[0]?.redboxOid ?? '');
        const oldMetadata = (existingRecord[0]?.metadata ?? {}) as AnyRecord;
        const newMetadata = (metadata?.data ?? {}) as AnyRecord;
        if (this.isMetadataEqual(newMetadata, oldMetadata)) {
          responses.push(
            new APIHarvestResponse(
              harvestId,
              oid,
              true,
              `skip update of harvestId ${harvestId} oid ${oid} metadata sent is equal to metadata in existing record`
            )
          );
          continue;
        }

        responses.push(
          await this.legacyUpdateHarvestRecord(
            brand,
            recordTypeModel,
            updateMode,
            newMetadata,
            oid,
            harvestId,
            user
          )
        );
      }

      return responses;
    }

    public async submitChunk(
      brand: BrandingModel,
      recordTypeModel: RecordTypeModel,
      requestBody: Record<string, unknown> | undefined,
      user: UserModel
    ): Promise<HarvestTrackedChunkResponse> {
      const request = this.validateTrackedChunkRequest(requestBody);
      const brandId = this.resolveBrandId(brand);
      const recordTypeName = this.resolveRecordTypeName(recordTypeModel);
      const run = await this.findOrCreateRun(brand, recordTypeModel, request, user);
      const contentHash = this.buildChunkContentHash(brandId, recordTypeName, request);

      const existingChunk = await HarvestRunChunk.findOne({
        runId: run.id,
        contentHash,
      }) as HarvestRunChunkRow | null;
      if (existingChunk) {
        const updatedRun = await this.bumpDuplicateChunkCount(run);
        const storedRecords = Array.isArray((existingChunk.responseSummary as AnyRecord | undefined)?.records)
          ? ((existingChunk.responseSummary as AnyRecord).records as unknown[]).map(value => this.toTrackedRecordResponse(value))
          : [];
        return {
          run: this.toRunModel(updatedRun),
          chunk: this.toChunkModel(existingChunk, true),
          records: storedRecords,
        };
      }

      const submittedAt = this.nowIso();
      const createdChunk = await HarvestRunChunk.create({
        runId: String(run.id ?? ''),
        brandId,
        recordType: recordTypeName,
        sourceRunId: request.sourceRunId,
        contentHash,
        chunkIndex: request.chunk?.index,
        chunkLabel: request.chunk?.label,
        totalExpected: request.chunk?.totalExpected,
        status: HarvestChunkStatus.failed,
        recordCount: request.records.length,
        totalProcessed: 0,
        created: 0,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        failed: 0,
        duplicate: false,
        submittedAt,
        responseSummary: { records: [] },
      }).fetch() as HarvestRunChunkRow;

      try {
        const counters = this.buildEmptyCounters();
        const records: HarvestTrackedRecordResponse[] = [];
        for (const record of request.records) {
          const result = await this.processTrackedRecord(brand, recordTypeModel, run, createdChunk, record, user);
          records.push(result);
          this.incrementCounters(counters, result.outcome as HarvestOutcome);
        }

        const completedAt = this.nowIso();
        const chunkUpdates: Partial<HarvestRunChunkRow> = {
          status: HarvestChunkStatus.processed,
          recordCount: request.records.length,
          totalProcessed: counters.totalProcessed,
          created: counters.created,
          updated: counters.updated,
          deleted: counters.deleted,
          unchanged: counters.unchanged,
          failed: counters.failed,
          completedAt,
          responseSummary: { records },
        };

        const updatedChunk = await HarvestRunChunk.updateOne({ id: createdChunk.id }).set(chunkUpdates) as HarvestRunChunkRow | null;
        const updatedRun = await this.updateRunAfterChunk(run, counters, Boolean(request.finalChunk), completedAt);
        return {
          run: this.toRunModel(updatedRun),
          chunk: this.toChunkModel(updatedChunk ?? { ...createdChunk, ...chunkUpdates }),
          records,
        };
      } catch (error) {
        await HarvestRunChunk.updateOne({ id: createdChunk.id }).set({
          status: HarvestChunkStatus.failed,
          completedAt: this.nowIso(),
          errorMessage: this.asError(error).message,
        });
        throw error;
      }
    }

    public async listRuns(brand: BrandingModel, params: Partial<HarvestRunListQuery>): Promise<HarvestRunListResult> {
      const brandId = this.resolveBrandId(brand);
      const page = this.parsePositiveInt(params.page, 1);
      const pageSize = Math.min(100, this.parsePositiveInt(params.pageSize, 20));
      const skip = (page - 1) * pageSize;
      const where: AnyRecord = { brandId };
      if (!_.isEmpty(params.status)) {
        where.status = String(params.status);
      }
      if (!_.isEmpty(params.recordType)) {
        where.recordType = String(params.recordType);
      }
      if (!_.isEmpty(params.sourceName)) {
        where.sourceName = String(params.sourceName);
      }
      const startedAtFilters: AnyRecord = {};
      if (params.dateFrom instanceof Date && !Number.isNaN(params.dateFrom.getTime())) {
        startedAtFilters['>='] = params.dateFrom.toISOString();
      }
      if (params.dateTo instanceof Date && !Number.isNaN(params.dateTo.getTime())) {
        startedAtFilters['<='] = params.dateTo.toISOString();
      }
      if (!_.isEmpty(startedAtFilters)) {
        where.startedAt = startedAtFilters;
      }

      const total = await HarvestRun.count(where);
      const rows = await HarvestRun.find(where).sort('startedAt DESC').skip(skip).limit(pageSize) as HarvestRunRow[];
      return {
        rows: rows.map(row => this.toRunModel(row)),
        total: Number(total ?? 0),
      };
    }

    public async getRun(brand: BrandingModel, runId: string): Promise<HarvestRunDetailResult | null> {
      const brandId = this.resolveBrandId(brand);
      const run = await HarvestRun.findOne({ id: runId, brandId }) as HarvestRunRow | null;
      if (!run) {
        return null;
      }

      const chunks = await HarvestRunChunk.find({ runId, brandId }).sort('submittedAt ASC') as HarvestRunChunkRow[];
      const events = await HarvestRecordEvent.find({ runId, brandId }).sort('createdAt DESC').limit(20) as HarvestRecordEventRow[];
      return {
        run: this.toRunModel(run),
        chunks: chunks.map(row => this.toChunkModel(row)),
        events: events.map(row => this.toEventModel(row)),
        aggregateCounts: {
          totalProcessed: Number(run.totalProcessed ?? 0),
          created: Number(run.created ?? 0),
          updated: Number(run.updated ?? 0),
          deleted: Number(run.deleted ?? 0),
          unchanged: Number(run.unchanged ?? 0),
          failed: Number(run.failed ?? 0),
          chunksProcessed: Number(run.chunksProcessed ?? chunks.length),
          duplicateChunks: Number(run.duplicateChunks ?? 0),
        },
      };
    }

    public async listRunEvents(
      brand: BrandingModel,
      runId: string,
      params: Partial<HarvestRunEventsQuery>
    ): Promise<HarvestRunEventsResult> {
      const brandId = this.resolveBrandId(brand);
      const page = this.parsePositiveInt(params.page, 1);
      const pageSize = Math.min(100, this.parsePositiveInt(params.pageSize, 20));
      const skip = (page - 1) * pageSize;
      const where: AnyRecord = {
        runId,
        brandId,
      };
      if (!_.isEmpty(params.outcome)) {
        where.outcome = String(params.outcome);
      }
      if (!_.isEmpty(params.operation)) {
        where.operation = String(params.operation);
      }
      if (!_.isEmpty(params.harvestId)) {
        where.harvestId = String(params.harvestId);
      }
      if (!_.isEmpty(params.oid)) {
        where.oid = String(params.oid);
      }

      const total = await HarvestRecordEvent.count(where);
      const rows = await HarvestRecordEvent.find(where).sort('createdAt DESC').skip(skip).limit(pageSize) as HarvestRecordEventRow[];
      return {
        rows: rows.map(row => this.toEventModel(row)),
        total: Number(total ?? 0),
      };
    }
  }
}
