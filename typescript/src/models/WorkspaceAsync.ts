import { Attr, Entity } from '../../lib/decorators';

@Entity('workspaceasync')
export class WorkspaceAsync {
  @Attr({ type: 'string', required: true })
  public name!: string;

  @Attr({ type: 'string', required: true })
  public recordType!: string;

  @Attr({ type: 'string', columnType: 'datetime' })
  public date_started?: string;

  @Attr({ type: 'string', columnType: 'datetime' })
  public date_completed?: string;

  @Attr({ type: 'string', required: true })
  public started_by!: string;

  @Attr({ type: 'string', required: true })
  public service!: string;

  @Attr({ type: 'string', required: true })
  public method!: string;

  @Attr({ type: 'json', required: true })
  public args!: unknown;

  @Attr({ type: 'string' })
  public status?: string;

  @Attr({ type: 'json' })
  public message?: Record<string, unknown>;
}
