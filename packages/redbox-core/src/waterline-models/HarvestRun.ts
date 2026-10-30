/// <reference path="../sails.ts" />
import { Attr, Entity, toWaterlineModelDef } from '../decorators';
import { HARVEST_RUN_INDEXES } from '../utilities/HarvestRunIndexes';
import { HarvestRunStatus } from '../model/storage/HarvestRunModel';

@Entity('harvestrun', {
  indexes: HARVEST_RUN_INDEXES.map(({ key, ...options }) => ({ attributes: key, ...options })),
})
export class HarvestRunClass {
  @Attr({ type: 'string', required: true })
  public sourceRunId!: string;

  @Attr({ type: 'string', required: true })
  public brandId!: string;

  @Attr({ type: 'string', required: true })
  public recordType!: string;

  @Attr({ type: 'string', required: true })
  public sourceName!: string;

  @Attr({ type: 'string' })
  public sourceUri?: string;

  @Attr({ type: 'string', defaultsTo: HarvestRunStatus.running })
  public status!: string;

  @Attr({ type: 'string', required: true })
  public startedAt!: string;

  @Attr({ type: 'string' })
  public completedAt?: string;

  @Attr({ type: 'string' })
  public startedBy?: string;

  @Attr({ type: 'string' })
  public lastChunkAt?: string;

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

  @Attr({ type: 'number', defaultsTo: 0 })
  public chunksProcessed?: number;

  @Attr({ type: 'number', defaultsTo: 0 })
  public duplicateChunks?: number;

  @Attr({ type: 'json' })
  public metadata?: Record<string, unknown>;
}

export const HarvestRunWLDef = toWaterlineModelDef(HarvestRunClass);

export interface HarvestRunAttributes extends Sails.WaterlineAttributes {
  sourceRunId: string;
  brandId: string;
  recordType: string;
  sourceName: string;
  sourceUri?: string;
  status: HarvestRunStatus | string;
  startedAt: string;
  completedAt?: string;
  startedBy?: string;
  lastChunkAt?: string;
  totalProcessed?: number;
  created?: number;
  updated?: number;
  deleted?: number;
  unchanged?: number;
  failed?: number;
  chunksProcessed?: number;
  duplicateChunks?: number;
  metadata?: Record<string, unknown>;
}

export interface HarvestRunWaterlineModel extends Sails.Model<HarvestRunAttributes> {
  attributes: HarvestRunAttributes;
}

declare global {
  const HarvestRun: HarvestRunWaterlineModel;
}
