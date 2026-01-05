/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { Entity, Attr, toWaterlineModelDef } from '../decorators';

@Entity('record', {
  datastore: 'redboxStorage',
  autoCreatedAt: false,
  autoUpdatedAt: false,
})
export class RecordClass {
  @Attr({ type: 'string', unique: true })
  public redboxOid?: string;

  @Attr({ type: 'string' })
  public harvestId?: string;

  @Attr({ type: 'json' })
  public metaMetadata?: JsonMap;

  @Attr({ type: 'json' })
  public metadata?: JsonMap;

  @Attr({ type: 'json' })
  public workflow?: JsonMap;

  @Attr({ type: 'json' })
  public authorization?: JsonMap;

  @Attr({ type: 'string', autoCreatedAt: true })
  public dateCreated!: string;

  @Attr({ type: 'string', autoUpdatedAt: true })
  public lastSaveDate!: string;
}

// Export the Waterline model definition for runtime use
export const RecordWLDef = toWaterlineModelDef(RecordClass);

// Type interface for backwards compatibility
export interface RecordAttributes extends Sails.WaterlineAttributes {
  authorization?: JsonMap;
  dateCreated?: string;
  harvestId?: string;
  lastSaveDate?: string;
  metadata?: JsonMap;
  metaMetadata?: JsonMap;
  redboxOid?: string;
  workflow?: JsonMap;
}

export interface RecordWaterlineModel extends Sails.Model<RecordAttributes> {
  attributes: RecordAttributes;
}

declare global {
  var Record: RecordWaterlineModel;
}
