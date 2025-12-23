import { Attr, BelongsTo, Entity, HasMany } from '../../../sails-ts/lib/decorators';

@Entity('role')
export class Role {
  @Attr({ type: 'string', required: true })
  public name!: string;

  @BelongsTo('brandingconfig')
  public branding?: string | number;

  @HasMany('user', 'roles', { dominant: true })
  public users?: unknown[];
}
