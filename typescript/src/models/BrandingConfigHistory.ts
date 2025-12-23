import { Attr, BelongsTo, Entity } from '../../lib/decorators';
import { BrandingConfig } from './BrandingConfig';

@Entity('brandingconfighistory', {
  datastore: 'redboxStorage',
  indexes: [
    {
      attributes: {
        branding: 1,
        version: 1,
      },
      options: {
        unique: true,
      },
    },
  ],
})
export class BrandingConfigHistory {
  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'number', required: true })
  public version!: number;

  @Attr({ type: 'string', required: true })
  public hash!: string;

  @Attr({ type: 'string' })
  public css?: string;

  @Attr({ type: 'json' })
  public variables?: Record<string, unknown>;

  @Attr({ type: 'string', autoCreatedAt: true })
  public dateCreated!: string;
}
