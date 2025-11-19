import { Attr, BelongsTo, Entity } from '../../lib/decorators';

@Entity('pathrule')
export class PathRule {
  @Attr({ type: 'string', required: true })
  public path!: string;

  @BelongsTo('role', { required: true })
  public role!: string | number;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'boolean' })
  public can_read?: boolean;

  @Attr({ type: 'boolean' })
  public can_write?: boolean;

  @Attr({ type: 'string' })
  public custom?: string;
}
