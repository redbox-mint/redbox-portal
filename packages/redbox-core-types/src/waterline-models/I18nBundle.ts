/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { Entity, Attr, BelongsTo, HasMany, BeforeCreate, BeforeUpdate, toWaterlineModelDef } from '../decorators';
import { BrandingConfigAttributes } from './BrandingConfig';

const beforeCreate = (bundle: Record<string, unknown>, cb: (err?: Error) => void) => {
  try {
    const brandingPart = bundle.branding ? String(bundle.branding) : 'global';
    const locale = bundle.locale;
    const ns = bundle.namespace || 'translation';
    bundle.uid = `${brandingPart}:${locale}:${ns}`;
    cb();
  } catch (error) {
    cb(error as Error);
  }
};

const beforeUpdate = (values: Record<string, unknown>, cb: (err?: Error) => void) => {
  try {
    if (values.locale || values.namespace || values.branding) {
      const brandingPart = values.branding ? String(values.branding) : 'global';
      const locale = values.locale;
      const ns = values.namespace || 'translation';
    }
    cb();
  } catch (error) {
    cb(error as Error);
  }
};

@BeforeUpdate(beforeUpdate)
@BeforeCreate(beforeCreate)
@Entity('i18nbundle')
export class I18nBundleClass {
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

// Export the Waterline model definition for runtime use
export const I18nBundleWLDef = toWaterlineModelDef(I18nBundleClass);

// Type interface for backwards compatibility
export interface I18nBundleAttributes extends Sails.WaterlineAttributes {
  branding?: string | number | BrandingConfigAttributes;
  data: Record<string, unknown>;
  displayName?: string;
  enabled?: boolean;
  entries?: unknown[];
  locale: string;
  namespace?: string;
  uid?: string;
}

export interface I18nBundleWaterlineModel extends Sails.Model<I18nBundleAttributes> {
  attributes: I18nBundleAttributes;
}

declare global {
  const I18nBundle: I18nBundleWaterlineModel;
}
