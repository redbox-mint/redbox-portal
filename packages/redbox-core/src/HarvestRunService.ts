import { APIHarvestResponse, BrandingModel, RecordTypeModel, UserModel } from './model';
import {
  HarvestRunDetailResult,
  HarvestRunEventsQuery,
  HarvestRunEventsResult,
  HarvestRunListQuery,
  HarvestRunListResult,
  HarvestRunChunkModel,
  HarvestRunModel,
} from './model/storage/HarvestRunModel';

export type HarvestTrackedChunkRequest = {
  sourceRunId: string;
  sourceName: string;
  sourceUri?: string;
  finalChunk?: boolean;
  chunk?: {
    index?: number;
    label?: string;
    totalExpected?: number;
  };
  records: HarvestTrackedRecordRequest[];
};

export type HarvestTrackedRecordRequest = {
  harvestId: string;
  operation?: string;
  updateStrategy?: string;
  reason?: string;
  recordRequest?: Record<string, unknown>;
};

export type HarvestTrackedRecordResponse = {
  harvestId: string;
  oid: string;
  operation: string;
  outcome: string;
  status: boolean;
  message: string;
  details: string;
};

export type HarvestTrackedChunkResponse = {
  run: HarvestRunModel;
  chunk: HarvestRunChunkModel;
  records?: HarvestTrackedRecordResponse[];
};

export class HarvestRunServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'HarvestRunServiceError';
    this.statusCode = statusCode;
  }
}

export interface HarvestRunService {
  submitCompatibilityRecords(
    brand: BrandingModel,
    recordTypeModel: RecordTypeModel,
    body: Record<string, unknown> | undefined,
    updateMode: string,
    user: UserModel
  ): Promise<APIHarvestResponse[]>;
  submitLegacyRecords(
    brand: BrandingModel,
    recordTypeModel: RecordTypeModel,
    body: Record<string, unknown> | undefined,
    merge: boolean,
    user: UserModel
  ): Promise<APIHarvestResponse[]>;
  submitChunk(
    brand: BrandingModel,
    recordTypeModel: RecordTypeModel,
    request: Record<string, unknown> | undefined,
    user: UserModel
  ): Promise<HarvestTrackedChunkResponse>;
  listRuns(brand: BrandingModel, params: Partial<HarvestRunListQuery>): Promise<HarvestRunListResult>;
  getRun(brand: BrandingModel, runId: string): Promise<HarvestRunDetailResult | null>;
  runExists(brand: BrandingModel, runId: string): Promise<boolean>;
  listRunEvents(
    brand: BrandingModel,
    runId: string,
    params: Partial<HarvestRunEventsQuery>
  ): Promise<HarvestRunEventsResult>;
}
