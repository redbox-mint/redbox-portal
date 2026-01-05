/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { Entity, Attr, toWaterlineModelDef } from '../decorators';

@Entity('deletedrecord', { datastore: 'redboxStorage' })
export class DeletedRecordClass {
  @Attr({ type: 'string', unique: true })
  public redboxOid?: string;

  @Attr({ type: 'json' })
  public deletedRecordMetadata?: Record<string, unknown>;

  @Attr({ type: 'string', autoCreatedAt: true })
  public dateDeleted!: string;
}

// Export the Waterline model definition for runtime use
export const DeletedRecordWLDef = toWaterlineModelDef(DeletedRecordClass);

// Type interface for backwards compatibility
export interface DeletedRecordAttributes extends Sails.WaterlineAttributes {
  dateDeleted?: string;
  deletedRecordMetadata?: Record<string, unknown>;
  redboxOid?: string;
}

export interface DeletedRecordWaterlineModel extends Sails.Model<DeletedRecordAttributes> {
  attributes: DeletedRecordAttributes;
}

declare global {
  var DeletedRecord: DeletedRecordWaterlineModel;
}
