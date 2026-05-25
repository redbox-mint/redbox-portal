/// <reference path="../sails.ts" />
import { Attr, Entity, toWaterlineModelDef } from '../decorators';
import { HarvestOperation, HarvestOutcome } from '../model/storage/HarvestRunModel';

@Entity('harvestrecordevent', {
  indexes: [
    { attributes: { runId: 1, brandId: 1, createdAt: -1 } },
    { attributes: { runId: 1, brandId: 1, outcome: 1, createdAt: -1 } },
    { attributes: { runId: 1, brandId: 1, operation: 1, createdAt: -1 } },
    { attributes: { harvestId: 1, recordType: 1, brandId: 1 } },
    { attributes: { oid: 1 } },
  ],
})
export class HarvestRecordEventClass {
  @Attr({ type: 'string', required: true })
  public runId!: string;

  @Attr({ type: 'string', required: true })
  public chunkId!: string;

  @Attr({ type: 'string', required: true })
  public brandId!: string;

  @Attr({ type: 'string', required: true })
  public recordType!: string;

  @Attr({ type: 'string', required: true })
  public sourceRunId!: string;

  @Attr({ type: 'string', required: true })
  public harvestId!: string;

  @Attr({ type: 'string' })
  public oid?: string;

  @Attr({ type: 'string', defaultsTo: HarvestOperation.upsert })
  public operation!: string;

  @Attr({ type: 'string', defaultsTo: HarvestOutcome.failed })
  public outcome!: string;

  @Attr({ type: 'boolean', defaultsTo: false })
  public status!: boolean;

  @Attr({ type: 'string' })
  public message?: string;

  @Attr({ type: 'string' })
  public details?: string;

  @Attr({ type: 'string' })
  public errorCode?: string;

  @Attr({ type: 'json' })
  public recordSnapshot?: Record<string, unknown>;

  @Attr({ type: 'string', required: true })
  public createdAt!: string;
}

export const HarvestRecordEventWLDef = toWaterlineModelDef(HarvestRecordEventClass);

export interface HarvestRecordEventAttributes extends Sails.WaterlineAttributes {
  runId: string;
  chunkId: string;
  brandId: string;
  recordType: string;
  sourceRunId: string;
  harvestId: string;
  oid?: string;
  operation: HarvestOperation | string;
  outcome: HarvestOutcome | string;
  status: boolean;
  message?: string;
  details?: string;
  errorCode?: string;
  recordSnapshot?: Record<string, unknown>;
  createdAt: string;
}

export interface HarvestRecordEventWaterlineModel extends Sails.Model<HarvestRecordEventAttributes> {
  attributes: HarvestRecordEventAttributes;
}

declare global {
  const HarvestRecordEvent: HarvestRecordEventWaterlineModel;
}
