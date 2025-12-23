import { Attr, BelongsTo, Entity } from '../../../sails-ts/lib/decorators';

@Entity('workflowstep')
export class WorkflowStep {
  @Attr({ type: 'string', required: true })
  public name!: string;

  @BelongsTo('form')
  public form?: string | number;

  @Attr({ type: 'json', required: true })
  public config!: Record<string, unknown>;

  @Attr({ type: 'boolean', required: true })
  public starting!: boolean;

  @BelongsTo('recordType')
  public recordType?: string | number;

  @Attr({ type: 'boolean', defaultsTo: false })
  public hidden?: boolean;
}
