import { Attr, Entity } from '../../../sails-ts/lib/decorators';

type JsonMap = { [key: string]: unknown };

@Entity('record', {
  datastore: 'redboxStorage',
  autoCreatedAt: false,
  autoUpdatedAt: false,
})
export class Record {
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
