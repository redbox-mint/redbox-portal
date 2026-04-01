/// <reference path="../sails.ts" />
import { Entity, Attr, BelongsTo, toWaterlineModelDef } from '../decorators';
import { BrandingConfigAttributes } from './BrandingConfig';

@Entity('asynchprogress')
export class AsynchProgressClass {
  @Attr({ type: 'string', required: true })
  public name!: string;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'string', columnType: 'datetime' })
  public date_started?: string;

  @Attr({ type: 'string', columnType: 'datetime' })
  public date_completed?: string;

  @Attr({ type: 'string', required: true })
  public started_by!: string;

  @Attr({ type: 'number' })
  public currentIdx?: number;

  @Attr({ type: 'number' })
  public targetIdx?: number;

  @Attr({ type: 'string' })
  public status?: string;

  @Attr({ type: 'string' })
  public message?: string;

  @Attr({ type: 'json' })
  public metadata?: Record<string, unknown>;

  @Attr({ type: 'string' })
  public relatedRecordId?: string;

  @Attr({ type: 'string' })
  public taskType?: string;
}

// Export the Waterline model definition for runtime use
export const AsynchProgressWLDef = toWaterlineModelDef(AsynchProgressClass);

// Type interface for backwards compatibility
export interface AsynchProgressAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  currentIdx?: number;
  date_completed?: string;
  date_started?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  name: string;
  relatedRecordId?: string;
  started_by: string;
  status?: string;
  targetIdx?: number;
  taskType?: string;
}

export interface AsynchProgressWaterlineModel extends Sails.Model<AsynchProgressAttributes> {
  attributes: AsynchProgressAttributes;
}

declare global {
  const AsynchProgress: AsynchProgressWaterlineModel;
}
