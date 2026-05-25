/// <reference path="../sails.ts" />
import { Attr, Entity, toWaterlineModelDef } from '../decorators';
import { HarvestChunkStatus } from '../model/storage/HarvestRunModel';

@Entity('harvestrunchunk', {
  indexes: [
    { attributes: { runId: 1, contentHash: 1, attempt: 1 }, unique: true },
    { attributes: { runId: 1, contentHash: 1, status: 1 } },
    { attributes: { runId: 1, chunkIndex: 1 } },
    { attributes: { runId: 1, submittedAt: 1 } },
  ],
})
export class HarvestRunChunkClass {
  @Attr({ type: 'string', required: true })
  public runId!: string;

  @Attr({ type: 'string', required: true })
  public brandId!: string;

  @Attr({ type: 'string', required: true })
  public recordType!: string;

  @Attr({ type: 'string', required: true })
  public sourceRunId!: string;

  @Attr({ type: 'string', required: true })
  public contentHash!: string;

  @Attr({ type: 'number', defaultsTo: 1 })
  public attempt?: number;

  @Attr({ type: 'number' })
  public chunkIndex?: number;

  @Attr({ type: 'string' })
  public chunkLabel?: string;

  @Attr({ type: 'number' })
  public totalExpected?: number;

  @Attr({ type: 'string', defaultsTo: HarvestChunkStatus.processed })
  public status!: string;

  @Attr({ type: 'number', defaultsTo: 0 })
  public recordCount?: number;

  @Attr({ type: 'number', defaultsTo: 0 })
  public totalProcessed?: number;

  @Attr({ type: 'number', defaultsTo: 0 })
  public created?: number;

  @Attr({ type: 'number', defaultsTo: 0 })
  public updated?: number;

  @Attr({ type: 'number', defaultsTo: 0 })
  public deleted?: number;

  @Attr({ type: 'number', defaultsTo: 0 })
  public unchanged?: number;

  @Attr({ type: 'number', defaultsTo: 0 })
  public failed?: number;

  @Attr({ type: 'boolean', defaultsTo: false })
  public duplicate?: boolean;

  @Attr({ type: 'string', required: true })
  public submittedAt!: string;

  @Attr({ type: 'string' })
  public completedAt?: string;

  @Attr({ type: 'string' })
  public errorMessage?: string;

  @Attr({ type: 'json' })
  public responseSummary?: Record<string, unknown>;
}

export const HarvestRunChunkWLDef = toWaterlineModelDef(HarvestRunChunkClass);

export interface HarvestRunChunkAttributes extends Sails.WaterlineAttributes {
  runId: string;
  brandId: string;
  recordType: string;
  sourceRunId: string;
  contentHash: string;
  attempt?: number;
  chunkIndex?: number;
  chunkLabel?: string;
  totalExpected?: number;
  status: HarvestChunkStatus | string;
  recordCount?: number;
  totalProcessed?: number;
  created?: number;
  updated?: number;
  deleted?: number;
  unchanged?: number;
  failed?: number;
  duplicate?: boolean;
  submittedAt: string;
  completedAt?: string;
  errorMessage?: string;
  responseSummary?: Record<string, unknown>;
}

export interface HarvestRunChunkWaterlineModel extends Sails.Model<HarvestRunChunkAttributes> {
  attributes: HarvestRunChunkAttributes;
}

declare global {
  const HarvestRunChunk: HarvestRunChunkWaterlineModel;
}
