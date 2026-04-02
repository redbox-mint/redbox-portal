import 'reflect-metadata';
import { Entity, Attr, toWaterlineModelDef } from '@researchdatabox/redbox-core';

@Entity('recordaudit', { datastore: 'redboxStorage' })
export class RecordAuditClass {
  @Attr({ type: 'string' })
  public redboxOid?: string;

  @Attr({ type: 'json' })
  public user?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public record?: Record<string, unknown>;

  @Attr({ type: 'string', autoCreatedAt: true })
  public dateCreated!: string;

  @Attr({ type: 'string' })
  public action?: string;
}

export const RecordAuditWLDef = toWaterlineModelDef(RecordAuditClass);
