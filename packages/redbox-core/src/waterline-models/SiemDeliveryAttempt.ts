/// <reference path="../sails.ts" />
import { Attr, Entity, toWaterlineModelDef } from '../decorators';

@Entity('siemdeliveryattempt')
export class SiemDeliveryAttemptClass {
  @Attr({ type: 'string', required: true })
  public eventId!: string;

  @Attr({ type: 'string', required: true })
  public brandId!: string;

  @Attr({ type: 'string', required: true })
  public destinationId!: string;

  @Attr({ type: 'string', required: true })
  public adapterType!: string;

  @Attr({ type: 'number', required: true })
  public attemptNumber!: number;

  @Attr({ type: 'string', required: true })
  public status!: string;

  @Attr({ type: 'string', required: true })
  public startedAt!: string;

  @Attr({ type: 'string' })
  public completedAt?: string;

  @Attr({ type: 'number' })
  public durationMs?: number;

  @Attr({ type: 'number' })
  public httpStatusCode?: number;

  @Attr({ type: 'json' })
  public responseSummary?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public errorSummary?: Record<string, unknown>;
}

export const SiemDeliveryAttemptWLDef = toWaterlineModelDef(SiemDeliveryAttemptClass);

export interface SiemDeliveryAttemptAttributes extends Sails.WaterlineAttributes {
  eventId: string;
  brandId: string;
  destinationId: string;
  adapterType: string;
  attemptNumber: number;
  status: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  httpStatusCode?: number;
  responseSummary?: Record<string, unknown>;
  errorSummary?: Record<string, unknown>;
}

export interface SiemDeliveryAttemptWaterlineModel extends Sails.Model<SiemDeliveryAttemptAttributes> {
  attributes: SiemDeliveryAttemptAttributes;
}

declare global {
  const SiemDeliveryAttempt: SiemDeliveryAttemptWaterlineModel;
}
