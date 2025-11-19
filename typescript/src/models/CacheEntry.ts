import { Attr, Entity } from '../../lib/decorators';

@Entity('cacheentry')
export class CacheEntry {
  @Attr({ type: 'string', required: true, unique: true })
  public name!: string;

  @Attr({ type: 'json' })
  public data?: Record<string, unknown>;

  @Attr({ type: 'number', required: true })
  public ts_added!: number;
}
