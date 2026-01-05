/// <reference path="../sails.ts" />
import { JsonMap } from './types';
import { Entity, Attr, BelongsTo, toWaterlineModelDef } from '../decorators';
import { BrandingConfigAttributes } from './BrandingConfig';

@Entity('brandingconfighistory', {
  datastore: 'redboxStorage',
  indexes: [
    {
      attributes: {
        branding: 1,
        version: 1,
      },
      options: {
        unique: true,
      },
    },
  ],
})
export class BrandingConfigHistoryClass {
  @BelongsTo('brandingconfig', { required: true })
  public branding!: string | number;

  @Attr({ type: 'number', required: true })
  public version!: number;

  @Attr({ type: 'string', required: true })
  public hash!: string;

  @Attr({ type: 'string' })
  public css?: string;

  @Attr({ type: 'json' })
  public variables?: Record<string, unknown>;

  @Attr({ type: 'string', autoCreatedAt: true })
  public dateCreated!: string;
}

// Export the Waterline model definition for runtime use
export const BrandingConfigHistoryWLDef = toWaterlineModelDef(BrandingConfigHistoryClass);

// Type interface for backwards compatibility
export interface BrandingConfigHistoryAttributes extends Sails.WaterlineAttributes {
  branding: string | number | BrandingConfigAttributes;
  css?: string;
  dateCreated?: string;
  hash: string;
  variables?: Record<string, unknown>;
  version: number;
}

export interface BrandingConfigHistoryWaterlineModel extends Sails.Model<BrandingConfigHistoryAttributes> {
  attributes: BrandingConfigHistoryAttributes;
}

declare global {
  var BrandingConfigHistory: BrandingConfigHistoryWaterlineModel;
}
