import { Attr, BelongsTo, BeforeCreate, BeforeUpdate, Entity } from '../../lib/decorators';

const assignUid = (values: Record<string, any>) => {
  const brandingPart = values.branding ? String(values.branding) : 'global';
  const locale = values.locale;
  const ns = values.namespace || 'translation';
  const key = values.key;
  if (brandingPart && locale && ns && key) {
    values.uid = `${brandingPart}:${locale}:${ns}:${key}`;
  }
};

const beforeCreate = (translation: Record<string, any>, cb: (err?: Error) => void) => {
  try {
    assignUid(translation);
    cb();
  } catch (error) {
    cb(error as Error);
  }
};

const beforeUpdate = (values: Record<string, any>, cb: (err?: Error) => void) => {
  try {
    assignUid(values);
    cb();
  } catch (error) {
    cb(error as Error);
  }
};

@BeforeUpdate(beforeUpdate)
@BeforeCreate(beforeCreate)
@Entity('i18ntranslation')
export class I18nTranslation {
  @Attr({ type: 'string', required: true })
  public key!: string;

  @Attr({ type: 'string', required: true })
  public locale!: string;

  @Attr({ type: 'string', defaultsTo: 'translation' })
  public namespace?: string;

  @Attr({ type: 'json', required: true })
  public value!: unknown;

  @Attr({ type: 'string', allowNull: true })
  public category?: string;

  @Attr({ type: 'string', allowNull: true })
  public description?: string;

  @BelongsTo('brandingconfig')
  public branding?: string | number;

  @BelongsTo('i18nbundle')
  public bundle?: string | number;

  @Attr({ type: 'string', unique: true })
  public uid?: string;
}
