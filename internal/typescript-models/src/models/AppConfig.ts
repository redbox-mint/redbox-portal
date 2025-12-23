import { Attr, BelongsTo, Entity } from '../../../sails-ts/lib/decorators';

@Entity('appconfig')
export class AppConfig {
  @Attr({ type: 'string', required: true })
  public configKey!: string;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'json' })
  public configData?: Record<string, unknown>;
}
