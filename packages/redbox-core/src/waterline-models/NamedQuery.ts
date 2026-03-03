/// <reference path="../sails.ts" />
import { Entity, Attr, BelongsTo, BeforeCreate, toWaterlineModelDef } from '../decorators';
import { BrandingConfigAttributes } from './BrandingConfig';

const setKey = (namedQuery: Record<string, unknown>, cb: (err?: Error) => void) => {
  namedQuery.key = `${namedQuery.branding}_${namedQuery.name}`;
  cb();
};

@BeforeCreate(setKey)
@Entity('namedquery')
export class NamedQueryClass {
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

// Export the Waterline model definition for runtime use
export const NamedQueryWLDef = toWaterlineModelDef(NamedQueryClass);

// Type interface for backwards compatibility
export interface NamedQueryAttributes extends Sails.WaterlineAttributes {
  brandIdFieldPath?: string;
  branding: string | number | BrandingConfigAttributes;
  collectionName: string;
  key?: string;
  mongoQuery: string;
  name: string;
  queryParams: string;
  resultObjectMapping: string;
}

export interface NamedQueryWaterlineModel extends Sails.Model<NamedQueryAttributes> {
  attributes: NamedQueryAttributes;
}

declare global {
  const NamedQuery: NamedQueryWaterlineModel;
}
