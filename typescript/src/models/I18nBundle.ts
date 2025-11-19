import { Attr, BelongsTo, BeforeCreate, BeforeUpdate, Entity, HasMany } from '../../lib/decorators';

const buildUid = (values: Record<string, any>) => {
  const brandingPart = values.branding ? String(values.branding) : 'global';
  const locale = values.locale;
  const ns = values.namespace || 'translation';
  values.uid = `${brandingPart}:${locale}:${ns}`;
};

const beforeCreate = (bundle: Record<string, any>, cb: (err?: Error) => void) => {
  try {
    buildUid(bundle);
    cb();
  } catch (error) {
    cb(error as Error);
  }
};

const beforeUpdate = (values: Record<string, any>, cb: (err?: Error) => void) => {
  try {
    if (values.locale || values.namespace || values.branding) {
      buildUid(values);
    }
    cb();
  } catch (error) {
    cb(error as Error);
  }
};

@BeforeUpdate(beforeUpdate)
@BeforeCreate(beforeCreate)
@Entity('i18nbundle')
export class I18nBundle {
  @Attr({ type: 'string', required: true })
  public locale!: string;

  @Attr({ type: 'string' })
  public displayName?: string;

  @Attr({ type: 'boolean', defaultsTo: true })
  public enabled?: boolean;

  @Attr({ type: 'string', defaultsTo: 'translation' })
  public namespace?: string;

  @BelongsTo('brandingconfig')
  public branding?: string | number;

  @Attr({ type: 'json', required: true })
  public data!: Record<string, unknown>;

  @HasMany('i18ntranslation', 'bundle')
  public entries?: unknown[];

  @Attr({ type: 'string', unique: true })
  public uid?: string;
}
