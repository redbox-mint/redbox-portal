import 'reflect-metadata';
import { Entity, Attr, toWaterlineModelDef } from '@researchdatabox/redbox-core';

@Entity('deletedrecord', { datastore: 'redboxStorage' })
export class DeletedRecordClass {
  @Attr({ type: 'string', unique: true })
  public redboxOid?: string;

  @Attr({ type: 'json' })
  public deletedRecordMetadata?: Record<string, unknown>;

  @Attr({ type: 'string', autoCreatedAt: true })
  public dateDeleted!: string;
}

export const DeletedRecordWLDef = toWaterlineModelDef(DeletedRecordClass);
