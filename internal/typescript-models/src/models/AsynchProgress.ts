import { Attr, BelongsTo, Entity } from '../../../sails-ts/lib/decorators';

@Entity('asynchprogress')
export class AsynchProgress {
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
