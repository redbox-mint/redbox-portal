import { Attr, Entity } from '../../../sails-ts/lib/decorators';

@Entity('recordaudit', { datastore: 'redboxStorage' })
export class RecordAudit {
  @Attr({ type: 'json' })
  public user?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public record?: Record<string, unknown>;

  @Attr({ type: 'string', autoCreatedAt: true })
  public dateCreated!: string;

  @Attr({ type: 'string' })
  public action?: string;
}
