import { Attr, BelongsTo, Entity } from '../../../sails-ts/lib/decorators';

@Entity('workspacetype')
export class WorkspaceType {
  @Attr({ type: 'string', required: true })
  public name!: string;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'string' })
  public logo?: string;

  @Attr({ type: 'string' })
  public subtitle?: string;

  @Attr({ type: 'string' })
  public description?: string;

  @Attr({ type: 'boolean', defaultsTo: false })
  public externallyProvisioned?: boolean;
}
