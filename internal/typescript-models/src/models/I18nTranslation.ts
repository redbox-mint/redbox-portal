import { Attr, BelongsTo, BeforeCreate, BeforeUpdate, Entity } from '../../../sails-ts/lib/decorators';

const beforeCreate = (translation: Record<string, any>, cb: (err?: Error) => void) => {
  // Manual validation for 'value' because required:true disallows empty strings
  if (translation.value === undefined || translation.value === null) {
    const err = new Error('Value is required');
    (err as any).code = 'E_INVALID_NEW_RECORD';
    return cb(err);
  }
  try {
    const brandingPart = translation.branding ? String(translation.branding) : 'global';
    const locale = translation.locale;
    const ns = translation.namespace || 'translation';
    const key = translation.key;
    if (brandingPart && locale && ns && key) {
      translation.uid = `${brandingPart}:${locale}:${ns}:${key}`;
    }
    cb();
  } catch (error) {
    cb(error as Error);
  }
};

const beforeUpdate = (values: Record<string, any>, cb: (err?: Error) => void) => {
  // Manual validation for 'value'
  if (Object.hasOwn(values, 'value') && values.value === null) {
    const err = new Error('Value cannot be null');
    (err as any).code = 'E_INVALID_NEW_RECORD';
    return cb(err);
  }
  try {
    const brandingPart = values.branding ? String(values.branding) : 'global';
    const locale = values.locale;
    const ns = values.namespace || 'translation';
    const key = values.key;
    if (brandingPart && locale && ns && key) {
      values.uid = `${brandingPart}:${locale}:${ns}:${key}`;
    }
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

  @Attr({ type: 'json', required: false })
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
