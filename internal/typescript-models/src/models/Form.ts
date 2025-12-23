import { Attr, BelongsTo, Entity } from '../../../sails-ts/lib/decorators';

@Entity('form')
export class Form {
  @Attr({ type: 'string', required: true, unique: true })
  public name!: string;

  @Attr({ type: 'json' })
  public customAngularApp?: Record<string, unknown>;

  @Attr({ type: 'json' })
  public fields?: Record<string, unknown>;

  @BelongsTo('workflowStep')
  public workflowStep?: string | number;

  @Attr({ type: 'string' })
  public type?: string;

  @Attr({ type: 'json' })
  public messages?: Record<string, unknown>;

  @Attr({ type: 'string' })
  public requiredFieldIndicator?: string;

  @Attr({ type: 'string' })
  public viewCssClasses?: string;

  @Attr({ type: 'string' })
  public editCssClasses?: string;

  @Attr({ type: 'boolean' })
  public skipValidationOnSave?: boolean;

  @Attr({ type: 'json' })
  public attachmentFields?: Record<string, unknown>;
}
