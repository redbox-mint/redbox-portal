/// <reference path="../sails.ts" />
import { Entity, Attr, BelongsTo, BeforeCreate, toWaterlineModelDef } from '../decorators';
import { BrandingConfigAttributes } from './BrandingConfig';

const setKey = (namedQuery: Record<string, unknown>, cb: (err?: Error) => void) => {
  // These fields used to be unconditionally required Waterline attributes.
  // Keep that database create contract while allowing source-specific storage.
  if (namedQuery.source !== 'graphql') {
    for (const field of ['mongoQuery', 'queryParams', 'collectionName', 'resultObjectMapping']) {
      if (typeof namedQuery[field] !== 'string' || namedQuery[field].length === 0) {
        cb(new Error(`${field} is required for a database named query`));
        return;
      }
    }
  }
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

  @Attr({ type: 'string', allowNull: true, isIn: ['database', 'graphql'] })
  public source?: 'database' | 'graphql' | null;

  @Attr({ type: 'string', allowNull: true })
  public description?: string | null;

  @Attr({ type: 'string', allowNull: true })
  public graphql?: string | null;

  @Attr({ type: 'string', allowNull: true })
  public mongoQuery?: string | null;

  @Attr({ type: 'string', allowNull: true })
  public queryParams?: string | null;

  @Attr({ type: 'string', allowNull: true })
  public collectionName?: string | null;

  @Attr({ type: 'string', allowNull: true })
  public resultObjectMapping?: string | null;

  @Attr({ type: 'string', allowNull: true })
  public brandIdFieldPath?: string | null;

  @Attr({ type: 'string', allowNull: true })
  public sort?: string | null;

  @Attr({ type: 'boolean', defaultsTo: false })
  public expandRelations?: boolean;

  @Attr({ type: 'string', allowNull: true })
  public relatedRecordFilters?: string | null;
}

// Export the Waterline model definition for runtime use
export const NamedQueryWLDef = toWaterlineModelDef(NamedQueryClass);

// Type interface for backwards compatibility
export interface NamedQueryAttributes extends Sails.WaterlineAttributes {
  brandIdFieldPath?: string | null;
  branding: string | number | BrandingConfigAttributes;
  collectionName?: string | null;
  key?: string;
  source?: 'database' | 'graphql' | null;
  graphql?: string | null;
  description?: string | null;
  mongoQuery?: string | null;
  name: string;
  queryParams?: string | null;
  resultObjectMapping?: string | null;
  sort?: string | null;
  expandRelations?: boolean;
  relatedRecordFilters?: string | null;
}

export interface NamedQueryWaterlineModel extends Sails.Model<NamedQueryAttributes> {
  attributes: NamedQueryAttributes;
}

declare global {
  const NamedQuery: NamedQueryWaterlineModel;
}
