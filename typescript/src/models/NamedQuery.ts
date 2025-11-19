import { Attr, BelongsTo, BeforeCreate, Entity } from '../../lib/decorators';

const setKey = (namedQuery: Record<string, any>, cb: (err?: Error) => void) => {
  namedQuery.key = `${namedQuery.branding}_${namedQuery.name}`;
  cb();
};

@BeforeCreate(setKey)
@Entity('namedquery')
export class NamedQuery {
  @Attr({ type: 'string', unique: true })
  public key?: string;

  @Attr({ type: 'string', required: true })
  public name!: string;

  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'string', required: true })
  public mongoQuery!: string;

  @Attr({ type: 'string', required: true })
  public queryParams!: string;

  @Attr({ type: 'string', required: true })
  public collectionName!: string;

  @Attr({ type: 'string', required: true })
  public resultObjectMapping!: string;

  @Attr({ type: 'string' })
  public brandIdFieldPath?: string;
}
