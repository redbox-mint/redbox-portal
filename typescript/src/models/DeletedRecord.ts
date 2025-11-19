import { Attr, Entity } from '../../lib/decorators';

@Entity('deletedrecord', { datastore: 'redboxStorage' })
export class DeletedRecord {
  @Attr({ type: 'string', unique: true })
  public redboxOid?: string;

  @Attr({ type: 'json' })
  public deletedRecordMetadata?: Record<string, unknown>;

  @Attr({ type: 'string', autoCreatedAt: true })
  public dateDeleted!: string;
}
