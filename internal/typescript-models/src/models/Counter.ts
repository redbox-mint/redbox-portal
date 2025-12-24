import { Attr, BelongsTo, Entity } from '../../../sails-ts/lib/decorators';

@Entity('counter')
export class Counter {
  @Attr({ type: 'string', required: true, unique: true })
  public name!: string;

  @BelongsTo('brandingconfig')
  public branding?: string | number;

  @Attr({ type: 'number' })
  public value?: number;
}
